import { ref, readonly } from 'vue'

type EventCallback = (...args: any[]) => void

const listeners = new Map<string, Set<EventCallback>>()

/**
 * 事件总线 - 用于跨模块通信
 */
export function useEventBus() {
  function on(event: string, callback: EventCallback) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set())
    }
    listeners.get(event)!.add(callback)

    // 返回取消订阅函数
    return () => {
      listeners.get(event)?.delete(callback)
    }
  }

  function off(event: string, callback?: EventCallback) {
    if (callback) {
      listeners.get(event)?.delete(callback)
    } else {
      listeners.delete(event)
    }
  }

  function emit(event: string, ...args: any[]) {
    listeners.get(event)?.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Event bus error for "${event}":`, error)
      }
    })
  }

  function once(event: string, callback: EventCallback) {
    const wrapper = (...args: any[]) => {
      callback(...args)
      off(event, wrapper)
    }
    on(event, wrapper)
  }

  return {
    on,
    off,
    emit,
    once,
  }
}
