import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { mockMonitorDevices, mockAlarmHistory } from '@/data/mockData'
import { dataLinkService } from '@/services'

// 监控设备类型
export interface MonitorDevice {
  id: string
  name: string
  type: string
  neType: string
  status: 'normal' | 'warning' | 'error'
  location: string
  kp: number
  sldEquipmentName: string
  longitude: number
  latitude: number
  depth: number
  inputPower: number
  outputPower: number
  pumpCurrent: number
  pfeVoltage: number
  pfeCurrent: number
  temperature: number
  qValue?: number
  ber?: number
  osnr?: number
}

// 告警记录类型
export interface AlarmRecord {
  id: number
  time: string
  device: string
  deviceId?: string
  neType?: string
  message: string
  level: 'info' | 'warning' | 'error'
  status: 'active' | 'acknowledged' | 'cleared'
}

export const useMonitorStore = defineStore('monitor', () => {
  // 设备列表
  const devices = ref<MonitorDevice[]>([])
  // 告警历史
  const alarmHistory = ref<AlarmRecord[]>([])
  // 选中的设备ID
  const selectedDeviceId = ref<string | null>(null)

  // 当前选中的设备
  const selectedDevice = computed(() => 
    devices.value.find(d => d.id === selectedDeviceId.value) || null
  )

  // 按状态分组统计
  const statusSummary = computed(() => ({
    normal: devices.value.filter(d => d.status === 'normal').length,
    warning: devices.value.filter(d => d.status === 'warning').length,
    error: devices.value.filter(d => d.status === 'error').length,
  }))

  // 活动告警数量
  const activeAlarms = computed(() => 
    alarmHistory.value.filter(a => a.level !== 'info').length
  )

  // 根据KP获取设备
  function getDeviceByKp(kp: number): MonitorDevice | undefined {
    return devices.value.find(d => Math.abs(d.kp - kp) < 1)
  }

  // 根据SLD设备名称获取监控设备
  function getDeviceBySldName(name: string): MonitorDevice | undefined {
    return devices.value.find(d => d.sldEquipmentName === name)
  }

  // 选择设备
  function selectDevice(deviceId: string | null) {
    selectedDeviceId.value = deviceId
  }

  // 更新设备数据
  function updateDevice(deviceId: string, data: Partial<MonitorDevice>, emitLink = true) {
    const device = devices.value.find(d => d.id === deviceId)
    if (device) {
      Object.assign(device, data)
      
      // 触发数据联动
      if (emitLink) {
        dataLinkService.emit({
          source: 'monitor',
          action: 'update',
          data: device,
          kp: device.kp,
        })
      }
    }
  }

  // 更新设备状态
  function updateDeviceStatus(deviceId: string, status: MonitorDevice['status']) {
    const device = devices.value.find(d => d.id === deviceId)
    if (device) {
      device.status = status
    }
  }

  // 添加告警
  function addAlarm(alarm: Omit<AlarmRecord, 'id'>) {
    const newAlarm: AlarmRecord = {
      ...alarm,
      id: Date.now(),
    }
    alarmHistory.value.unshift(newAlarm)
  }

  // 清除告警（标记为cleared状态）
  function clearAlarm(alarmId: number) {
    const alarm = alarmHistory.value.find(a => a.id === alarmId)
    if (alarm) {
      alarm.status = 'cleared'
    }
  }

  // 确认告警
  function acknowledgeAlarm(alarmId: number) {
    const alarm = alarmHistory.value.find(a => a.id === alarmId)
    if (alarm) {
      alarm.status = 'acknowledged'
    }
  }

  // 获取当前活动告警（用于拓扑图变红）
  function getActiveAlarms(filters?: { neType?: string; level?: string }) {
    let result = alarmHistory.value.filter(a => a.status === 'active')
    
    if (filters?.neType) {
      result = result.filter(a => a.neType === filters.neType)
    }
    if (filters?.level) {
      result = result.filter(a => a.level === filters.level)
    }
    
    return result
  }

  // 获取历史告警日志（用于报表查询）
  function getAlarmHistory(filters?: { 
    neType?: string
    level?: string
    status?: string
    startTime?: string
    endTime?: string 
  }) {
    let result = [...alarmHistory.value]
    
    if (filters?.neType) {
      result = result.filter(a => a.neType === filters.neType)
    }
    if (filters?.level) {
      result = result.filter(a => a.level === filters.level)
    }
    if (filters?.status) {
      result = result.filter(a => a.status === filters.status)
    }
    
    return result
  }

  // 初始化数据
  function initMockData() {
    if (devices.value.length === 0) {
      devices.value = mockMonitorDevices.map(d => ({ ...d } as MonitorDevice))
      alarmHistory.value = mockAlarmHistory.map(a => ({ ...a } as AlarmRecord))
    }
  }

  // 监听其他模块的数据变更
  function setupDataLinkListener() {
    dataLinkService.subscribe('monitor', (event) => {
      // 根据KP查找对应监控设备
      const device = getDeviceByKp(event.kp || 0)
      
      if (event.action === 'update' && device) {
        // 同步更新坐标和深度
        updateDevice(device.id, {
          longitude: event.data.longitude ?? device.longitude,
          latitude: event.data.latitude ?? device.latitude,
          depth: event.data.depth ?? device.depth,
        }, false)
      }
    })
  }

  // 初始化
  initMockData()
  setupDataLinkListener()

  return {
    // State
    devices,
    alarmHistory,
    selectedDeviceId,
    // Getters
    selectedDevice,
    statusSummary,
    activeAlarms,
    // Actions
    getDeviceByKp,
    getDeviceBySldName,
    selectDevice,
    updateDevice,
    updateDeviceStatus,
    addAlarm,
    clearAlarm,
    acknowledgeAlarm,
    getActiveAlarms,
    getAlarmHistory,
  }
})
