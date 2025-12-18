/**
 * 告警WebSocket服务
 * 负责与后端建立WebSocket连接，实时接收告警推送
 */

import { ref } from 'vue'
import type { AlarmRecord } from '@/stores/monitor'

export type AlarmCallback = (alarm: AlarmRecord) => void
export type ConnectionCallback = (status: 'connected' | 'disconnected' | 'error') => void

class AlarmWebSocketService {
  private ws: WebSocket | null = null
  private url: string = ''
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 3000
  private alarmCallbacks: AlarmCallback[] = []
  private connectionCallbacks: ConnectionCallback[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  
  // 连接状态
  public isConnected = ref(false)
  public connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')

  // 连接WebSocket
  connect(url: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[AlarmWS] Already connected')
      return
    }

    this.url = url
    this.connectionStatus.value = 'connecting'
    
    try {
      this.ws = new WebSocket(url)
      
      this.ws.onopen = () => {
        console.log('[AlarmWS] Connected to', url)
        this.isConnected.value = true
        this.connectionStatus.value = 'connected'
        this.reconnectAttempts = 0
        this.notifyConnectionStatus('connected')
      }
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // 处理不同类型的消息
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
          } else if (data.type === 'heartbeat') {
            // 心跳响应
            this.ws?.send(JSON.stringify({ type: 'pong' }))
          }
        } catch (e) {
          console.error('[AlarmWS] Failed to parse message:', e)
        }
      }
      
      this.ws.onclose = () => {
        console.log('[AlarmWS] Connection closed')
        this.isConnected.value = false
        this.connectionStatus.value = 'disconnected'
        this.notifyConnectionStatus('disconnected')
        this.attemptReconnect()
      }
      
      this.ws.onerror = (error) => {
        console.error('[AlarmWS] Error:', error)
        this.connectionStatus.value = 'error'
        this.notifyConnectionStatus('error')
      }
    } catch (e) {
      console.error('[AlarmWS] Failed to connect:', e)
      this.connectionStatus.value = 'error'
      this.attemptReconnect()
    }
  }

  // 断开连接
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.isConnected.value = false
    this.connectionStatus.value = 'disconnected'
    this.reconnectAttempts = 0
  }

  // 尝试重连
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[AlarmWS] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    console.log(`[AlarmWS] Reconnecting... attempt ${this.reconnectAttempts}`)
    
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.url)
    }, this.reconnectDelay)
  }

  // 订阅告警
  onAlarm(callback: AlarmCallback) {
    this.alarmCallbacks.push(callback)
    return () => {
      this.alarmCallbacks = this.alarmCallbacks.filter(cb => cb !== callback)
    }
  }

  // 订阅连接状态
  onConnectionChange(callback: ConnectionCallback) {
    this.connectionCallbacks.push(callback)
    return () => {
      this.connectionCallbacks = this.connectionCallbacks.filter(cb => cb !== callback)
    }
  }

  // 通知告警
  private notifyAlarm(alarm: AlarmRecord) {
    this.alarmCallbacks.forEach(cb => cb(alarm))
  }

  // 通知连接状态
  private notifyConnectionStatus(status: 'connected' | 'disconnected' | 'error') {
    this.connectionCallbacks.forEach(cb => cb(status))
  }

  // 模拟告警（用于测试）
  simulateAlarm(alarm: Partial<AlarmRecord>) {
    const fullAlarm: AlarmRecord = {
      id: alarm.id || Date.now(),
      time: alarm.time || new Date().toLocaleTimeString(),
      device: alarm.device || '测试设备',
      deviceId: alarm.deviceId,
      neType: alarm.neType || 'Repeater',
      message: alarm.message || '测试告警信息',
      level: alarm.level || 'warning',
      status: 'active',
    }
    this.notifyAlarm(fullAlarm)
  }
}

// 单例导出
export const alarmWebSocketService = new AlarmWebSocketService()

// Composable
export function useAlarmWebSocket() {
  return {
    connect: (url: string) => alarmWebSocketService.connect(url),
    disconnect: () => alarmWebSocketService.disconnect(),
    onAlarm: (cb: AlarmCallback) => alarmWebSocketService.onAlarm(cb),
    onConnectionChange: (cb: ConnectionCallback) => alarmWebSocketService.onConnectionChange(cb),
    simulateAlarm: (alarm: Partial<AlarmRecord>) => alarmWebSocketService.simulateAlarm(alarm),
    isConnected: alarmWebSocketService.isConnected,
    connectionStatus: alarmWebSocketService.connectionStatus,
  }
}
