import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/AlarmWebSocketService.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText.replace(
  "import { ref } from 'vue';",
  "const ref = (value) => ({ value });",
)

const timers = new Set()
globalThis.setTimeout = (callback, delay) => {
  const timer = { callback, delay }
  timers.add(timer)
  return timer
}
globalThis.clearTimeout = (timer) => timers.delete(timer)

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = FakeWebSocket.CONNECTING
    this.sent = []
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  receive(data) {
    this.onmessage?.({ data })
  }

  remoteClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  send(payload) {
    this.sent.push(payload)
  }
}

globalThis.WebSocket = FakeWebSocket

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
const { alarmWebSocketService, isValidAlarmWebSocketUrl } = await import(moduleUrl)

assert.equal(isValidAlarmWebSocketUrl('ws://localhost:8080/monitor'), true)
assert.equal(isValidAlarmWebSocketUrl('https://localhost:8080/monitor'), false)

let received = 0
const unsubscribe = alarmWebSocketService.onAlarm(() => { received += 1 })

alarmWebSocketService.connect('ws://localhost:8080/monitor')
assert.equal(FakeWebSocket.instances.length, 1)
const firstSocket = FakeWebSocket.instances[0]
firstSocket.open()
firstSocket.receive(JSON.stringify({ type: 'alarm', id: 1, message: 'test' }))
assert.equal(received, 1)
firstSocket.receive(JSON.stringify({ type: 'heartbeat' }))
assert.deepEqual(firstSocket.sent, ['{"type":"pong"}'])

// 网络断线会安排重连。
firstSocket.remoteClose()
assert.equal(timers.size, 1)
const reconnectTimer = [...timers][0]
timers.delete(reconnectTimer)
reconnectTimer.callback()
assert.equal(FakeWebSocket.instances.length, 2)
const secondSocket = FakeWebSocket.instances[1]

// 切换地址会使旧连接失效，旧连接的延迟事件不能污染新连接。
alarmWebSocketService.connect('wss://localhost:8443/monitor')
assert.equal(FakeWebSocket.instances.length, 3)
const thirdSocket = FakeWebSocket.instances[2]
secondSocket.open()
secondSocket.receive(JSON.stringify({ type: 'alarm', id: 2 }))
assert.equal(received, 1)
thirdSocket.open()
thirdSocket.receive(JSON.stringify({ type: 'alarm', id: 3 }))
assert.equal(received, 2)

// 主动断开必须清掉 socket 和重连 timer，且之后的事件不可达订阅者。
alarmWebSocketService.disconnect()
assert.equal(timers.size, 0)
thirdSocket.receive(JSON.stringify({ type: 'alarm', id: 4 }))
assert.equal(received, 2)

unsubscribe()
console.log('alarm websocket lifecycle checks passed')
