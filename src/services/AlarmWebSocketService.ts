/**
 * 告警 WebSocket 服务。
 *
 * 连接由调用方显式启停；网络异常时自动重连，主动断开时不会重连。
 */

import { ref } from 'vue'
import type { AlarmRecord } from '@/stores/monitor'

export type AlarmCallback = (alarm: AlarmRecord) => void
export type ConnectionCallback = (status: 'connected' | 'disconnected' | 'error') => void

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_MS = 3000

export function isValidAlarmWebSocketUrl(value: string): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && Boolean(url.host)
  } catch {
    return false
  }
}

class AlarmWebSocketService {
  private ws: WebSocket | null = null
  private url = ''
  private reconnectAttempts = 0
  private alarmCallbacks = new Set<AlarmCallback>()
  private connectionCallbacks = new Set<ConnectionCallback>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false
  private connectionGeneration = 0

  public isConnected = ref(false)
  public connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')

  /** 开始维护指定地址的连接。重复连接同一地址不会创建第二条连接。 */
  connect(url: string): void {
    const normalizedUrl = typeof url === 'string' ? url.trim() : ''
    if (!isValidAlarmWebSocketUrl(normalizedUrl)) {
      this.disconnect()
      this.setConnectionStatus('error')
      return
    }

    const hasActiveSocket = this.ws !== null
      && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    const isMaintainingSameConnection = this.shouldReconnect
      && this.url === normalizedUrl
      && (hasActiveSocket || this.reconnectTimer !== null)

    if (isMaintainingSameConnection) return

    this.stopCurrentConnection()
    this.url = normalizedUrl
    this.shouldReconnect = true
    this.reconnectAttempts = 0
    this.openSocket()
  }

  /** 主动断开并取消所有待执行的重连。 */
  disconnect(): void {
    this.shouldReconnect = false
    this.url = ''
    this.reconnectAttempts = 0
    this.stopCurrentConnection()
    this.setConnectionStatus('disconnected')
  }

  onAlarm(callback: AlarmCallback): () => void {
    this.alarmCallbacks.add(callback)
    return () => this.alarmCallbacks.delete(callback)
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback)
    return () => this.connectionCallbacks.delete(callback)
  }

  private openSocket(): void {
    if (!this.shouldReconnect || !this.url) return

    this.clearReconnectTimer()
    const generation = ++this.connectionGeneration
    this.setConnectionStatus('connecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(this.url)
      this.ws = socket
    } catch {
      if (!this.isCurrentConnection(generation)) return
      this.ws = null
      this.setConnectionStatus('error')
      this.scheduleReconnect(generation)
      return
    }

    socket.onopen = () => {
      if (!this.isCurrentSocket(socket, generation)) return
      this.reconnectAttempts = 0
      this.setConnectionStatus('connected')
    }

    socket.onmessage = (event) => {
      if (!this.isCurrentSocket(socket, generation)) return
      this.handleMessage(socket, event)
    }

    socket.onclose = () => {
      if (!this.isCurrentSocket(socket, generation)) return
      this.ws = null
      this.setConnectionStatus('disconnected')
      this.scheduleReconnect(generation)
    }

    socket.onerror = () => {
      if (!this.isCurrentSocket(socket, generation)) return
      this.setConnectionStatus('error')
    }
  }

  private handleMessage(socket: WebSocket, event: MessageEvent): void {
    if (typeof event.data !== 'string') return

    try {
      const data = JSON.parse(event.data)
      if (data.type === 'alarm') {
        const alarm: AlarmRecord = {
          id: data.id || Date.now(),
          time: data.time || new Date().toLocaleTimeString(),
          device: data.device || '未知设备',
          deviceId: data.deviceId,
          neType: data.neType,
          message: data.message || '告警信息',
          level: data.level || 'warning',
          status: 'active',
        }
        this.notifyAlarm(alarm)
      } else if (data.type === 'heartbeat' && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'pong' }))
      }
    } catch {
      // 无法解析或回复的消息不影响后续告警接收。
    }
  }

  private scheduleReconnect(generation: number): void {
    if (!this.shouldReconnect || !this.url || generation !== this.connectionGeneration) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.shouldReconnect || generation !== this.connectionGeneration) return
      this.openSocket()
    }, RECONNECT_DELAY_MS)
  }

  private stopCurrentConnection(): void {
    this.clearReconnectTimer()
    this.connectionGeneration += 1

    const socket = this.ws
    this.ws = null
    if (!socket) return

    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null

    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'Client disconnect')
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private isCurrentConnection(generation: number): boolean {
    return this.shouldReconnect && generation === this.connectionGeneration
  }

  private isCurrentSocket(socket: WebSocket, generation: number): boolean {
    return this.isCurrentConnection(generation) && this.ws === socket
  }

  private setConnectionStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error'): void {
    const previousStatus = this.connectionStatus.value
    this.connectionStatus.value = status
    this.isConnected.value = status === 'connected'

    if (previousStatus === status || status === 'connecting') return
    for (const callback of this.connectionCallbacks) {
      try {
        callback(status)
      } catch {
        // 一个订阅者异常不应阻断其他订阅者。
      }
    }
  }

  private notifyAlarm(alarm: AlarmRecord): void {
    for (const callback of this.alarmCallbacks) {
      try {
        callback(alarm)
      } catch {
        // 一个订阅者异常不应阻断其他订阅者。
      }
    }
  }
}

export const alarmWebSocketService = new AlarmWebSocketService()

export function useAlarmWebSocket() {
  return {
    connect: (url: string) => alarmWebSocketService.connect(url),
    disconnect: () => alarmWebSocketService.disconnect(),
    onAlarm: (callback: AlarmCallback) => alarmWebSocketService.onAlarm(callback),
    onConnectionChange: (callback: ConnectionCallback) => alarmWebSocketService.onConnectionChange(callback),
    isConnected: alarmWebSocketService.isConnected,
    connectionStatus: alarmWebSocketService.connectionStatus,
  }
}
