import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logger } from '@/shared/utils'

/**
 * 监控模块 Store
 */

// 设备状态
export type DeviceStatus = 'online' | 'offline' | 'warning' | 'error'

// 告警级别
export type AlarmLevel = 'info' | 'warning' | 'critical'

// 监控设备
export interface MonitorDevice {
  id: string
  name: string
  type: string
  status: DeviceStatus
  location: string
  kp: number
  lastUpdate: string
  metrics?: {
    power?: number
    temperature?: number
    signalStrength?: number
  }
}

// 告警记录
export interface AlarmRecord {
  id: string
  deviceId: string
  deviceName: string
  level: AlarmLevel
  message: string
  timestamp: string
  acknowledged: boolean
}

// 性能数据点
export interface PerformanceDataPoint {
  timestamp: string
  value: number
}

// 性能指标
export interface PerformanceMetrics {
  deviceId: string
  metricName: string
  data: PerformanceDataPoint[]
}

// 面板可见性
export interface MonitoringPanelVisibility {
  deviceList: boolean
  alarmPanel: boolean
  performanceChart: boolean
  mapView: boolean
}

export const useMonitoringStore = defineStore('monitoring', () => {
  // ==================== 设备状态 ====================
  const devices = ref<MonitorDevice[]>([])
  const selectedDeviceId = ref<string | null>(null)

  // ==================== 告警状态 ====================
  const alarms = ref<AlarmRecord[]>([])
  const unacknowledgedCount = computed(() =>
    alarms.value.filter(a => !a.acknowledged).length
  )

  // ==================== 性能数据 ====================
  const performanceData = ref<PerformanceMetrics[]>([])

  // ==================== WebSocket 连接状态 ====================
  const wsConnected = ref(false)
  const wsReconnecting = ref(false)

  // ==================== 面板状态 ====================
  const panelVisibility = ref<MonitoringPanelVisibility>({
    deviceList: true,
    alarmPanel: true,
    performanceChart: true,
    mapView: true,
  })

  // ==================== 计算属性 ====================
  const selectedDevice = computed(() =>
    devices.value.find(d => d.id === selectedDeviceId.value) || null
  )

  const onlineDevices = computed(() =>
    devices.value.filter(d => d.status === 'online')
  )

  const criticalAlarms = computed(() =>
    alarms.value.filter(a => a.level === 'critical' && !a.acknowledged)
  )

  // ==================== 设备操作 ====================
  function setDevices(newDevices: MonitorDevice[]) {
    devices.value = newDevices
    logger.info(`加载 ${newDevices.length} 个监控设备`)
  }

  function updateDevice(deviceId: string, updates: Partial<MonitorDevice>) {
    const device = devices.value.find(d => d.id === deviceId)
    if (device) {
      Object.assign(device, updates, { lastUpdate: new Date().toISOString() })
    }
  }

  function selectDevice(deviceId: string | null) {
    selectedDeviceId.value = deviceId
  }

  // ==================== 告警操作 ====================
  function addAlarm(alarm: Omit<AlarmRecord, 'id' | 'timestamp' | 'acknowledged'>) {
    const newAlarm: AlarmRecord = {
      ...alarm,
      id: `alarm-${Date.now()}`,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    }
    alarms.value.unshift(newAlarm)
    logger.warn(`新告警: ${alarm.message}`)
  }

  function acknowledgeAlarm(alarmId: string) {
    const alarm = alarms.value.find(a => a.id === alarmId)
    if (alarm) {
      alarm.acknowledged = true
    }
  }

  function acknowledgeAllAlarms() {
    alarms.value.forEach(a => {
      a.acknowledged = true
    })
    logger.info('已确认所有告警')
  }

  function clearAlarms() {
    alarms.value = []
  }

  // ==================== 性能数据操作 ====================
  function addPerformanceData(deviceId: string, metricName: string, value: number) {
    let metrics = performanceData.value.find(
      p => p.deviceId === deviceId && p.metricName === metricName
    )

    if (!metrics) {
      metrics = { deviceId, metricName, data: [] }
      performanceData.value.push(metrics)
    }

    metrics.data.push({
      timestamp: new Date().toISOString(),
      value,
    })

    // 保留最近 100 个数据点
    if (metrics.data.length > 100) {
      metrics.data = metrics.data.slice(-100)
    }
  }

  function getPerformanceData(deviceId: string, metricName: string): PerformanceDataPoint[] {
    const metrics = performanceData.value.find(
      p => p.deviceId === deviceId && p.metricName === metricName
    )
    return metrics?.data || []
  }

  // ==================== WebSocket 操作 ====================
  function setWsConnected(connected: boolean) {
    wsConnected.value = connected
    wsReconnecting.value = false
    logger.info(connected ? 'WebSocket 已连接' : 'WebSocket 已断开')
  }

  function setWsReconnecting(reconnecting: boolean) {
    wsReconnecting.value = reconnecting
  }

  // ==================== 面板操作 ====================
  function togglePanel(panelName: keyof MonitoringPanelVisibility) {
    panelVisibility.value[panelName] = !panelVisibility.value[panelName]
  }

  function setPanelVisible(panelName: keyof MonitoringPanelVisibility, visible: boolean) {
    panelVisibility.value[panelName] = visible
  }

  // ==================== 初始化 Mock 数据 ====================
  function initMockData() {
    const mockDevices: MonitorDevice[] = [
      {
        id: 'dev-1',
        name: '中继器 R1',
        type: 'repeater',
        status: 'online',
        location: 'KP 120',
        kp: 120,
        lastUpdate: new Date().toISOString(),
        metrics: { power: 95, temperature: 45, signalStrength: -12 },
      },
      {
        id: 'dev-2',
        name: '中继器 R2',
        type: 'repeater',
        status: 'online',
        location: 'KP 240',
        kp: 240,
        lastUpdate: new Date().toISOString(),
        metrics: { power: 92, temperature: 48, signalStrength: -15 },
      },
      {
        id: 'dev-3',
        name: '分支器 BU1',
        type: 'branching-unit',
        status: 'warning',
        location: 'KP 180',
        kp: 180,
        lastUpdate: new Date().toISOString(),
        metrics: { power: 88, temperature: 52, signalStrength: -18 },
      },
    ]

    setDevices(mockDevices)

    // 添加模拟告警
    addAlarm({
      deviceId: 'dev-3',
      deviceName: '分支器 BU1',
      level: 'warning',
      message: '温度偏高 (52°C)',
    })
  }

  // ==================== 清理 ====================
  function clearAllData() {
    devices.value = []
    alarms.value = []
    performanceData.value = []
    selectedDeviceId.value = null
    wsConnected.value = false
    wsReconnecting.value = false
  }

  return {
    // 设备状态
    devices,
    selectedDeviceId,
    selectedDevice,
    onlineDevices,
    // 设备操作
    setDevices,
    updateDevice,
    selectDevice,
    // 告警状态
    alarms,
    unacknowledgedCount,
    criticalAlarms,
    // 告警操作
    addAlarm,
    acknowledgeAlarm,
    acknowledgeAllAlarms,
    clearAlarms,
    // 性能数据
    performanceData,
    addPerformanceData,
    getPerformanceData,
    // WebSocket
    wsConnected,
    wsReconnecting,
    setWsConnected,
    setWsReconnecting,
    // 面板
    panelVisibility,
    togglePanel,
    setPanelVisible,
    // 初始化和清理
    initMockData,
    clearAllData,
  }
})
