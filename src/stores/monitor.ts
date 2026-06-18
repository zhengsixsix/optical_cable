import { defineStore, storeToRefs } from 'pinia'
import { ref, computed, watch } from 'vue'
import { mockAlarmHistory } from '@/data/mockData'
import { dataLinkService } from '@/services'
import { useConnectorStore } from './connector'

// 监控设备类型 (派生自 ConnectorElement + 运行时数据)
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
  componentRefId?: string
  fiberRefId?: string
}

// 运行时数据 (仅监控阶段使用)
export interface RuntimeData {
  status: 'normal' | 'warning' | 'error'
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

// 默认运行时数据
const defaultRuntimeData: RuntimeData = {
  status: 'normal',
  inputPower: -15,
  outputPower: -10,
  pumpCurrent: 200,
  pfeVoltage: 48,
  pfeCurrent: 1.2,
  temperature: 5,
}

export const useMonitorStore = defineStore('monitor', () => {
  const connectorStore = useConnectorStore()
  
  // 运行时数据存储 (deviceId => RuntimeData)
  const runtimeData = ref<Record<string, RuntimeData>>({})
  // 告警历史
  const alarmHistory = ref<AlarmRecord[]>([])
  // 选中的设备ID
  const selectedDeviceId = ref<string | null>(null)

  // 设备列表 - 从 connectorStore 派生
  const devices = computed<MonitorDevice[]>(() => {
    // 过滤掉非设备类型（光纤段、海缆段），只保留实际设备
    const nonDeviceTypes = ['fiber', 'cable_segment']
    const elements = connectorStore.elements.filter(e => !nonDeviceTypes.includes(e.type))
    
    return elements.map(elem => {
      const runtime = runtimeData.value[elem.id] || {
        status: 'normal',
        inputPower: 0,
        outputPower: 0,
        pumpCurrent: 0,
        pfeVoltage: 0,
        pfeCurrent: 0,
        temperature: 0,
      }
      return {
        id: elem.id,
        name: elem.name,
        type: elem.type,
        neType: elem.type,
        status: runtime.status,
        location: `KP ${elem.kp.toFixed(1)}`,
        kp: elem.kp,
        sldEquipmentName: elem.name,
        longitude: elem.longitude,
        latitude: elem.latitude,
        depth: elem.depth,
        inputPower: runtime.inputPower,
        outputPower: runtime.outputPower,
        pumpCurrent: runtime.pumpCurrent,
        pfeVoltage: runtime.pfeVoltage,
        pfeCurrent: runtime.pfeCurrent,
        temperature: runtime.temperature,
        qValue: runtime.qValue,
        ber: runtime.ber,
        osnr: runtime.osnr,
        componentRefId: elem.componentRefId,
        fiberRefId: elem.fiberRefId,
      }
    })
  })

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

  // 更新设备运行时数据
  function updateDevice(deviceId: string, data: Partial<RuntimeData>) {
    const current = runtimeData.value[deviceId] || { ...defaultRuntimeData }
    runtimeData.value[deviceId] = { ...current, ...data }
  }

  // 更新设备状态
  function updateDeviceStatus(deviceId: string, status: MonitorDevice['status']) {
    const current = runtimeData.value[deviceId] || { ...defaultRuntimeData }
    runtimeData.value[deviceId] = { ...current, status }
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

  // 初始化模拟运行时数据 (仅用于演示)
  function initMockData() {
    if (mockAlarmHistory.length === 0) return

    // 设备列表现在从 connectorStore 派生，这里只初始化运行时数据和告警
    if (alarmHistory.value.length === 0) {
      alarmHistory.value = (mockAlarmHistory as AlarmRecord[]).map(a => ({ ...a }))
    }
    // 为现有设备初始化模拟运行时数据
    devices.value.forEach(device => {
      if (!runtimeData.value[device.id]) {
        runtimeData.value[device.id] = {
          status: 'normal',
          inputPower: 0,
          outputPower: 0,
          pumpCurrent: 0,
          pfeVoltage: 0,
          pfeCurrent: 0,
          temperature: 0,
        }
      }
    })
  }

  // 监听其他模块的数据变更 (设备信息现在从 connectorStore 派生，无需监听)
  function setupDataLinkListener() {
    // 设备基础信息现在从 connectorStore 自动派生
    // 此方法保留以保持 API 兼容性
  }

  // 清空运行时数据
  function clearData() {
    runtimeData.value = {}
    alarmHistory.value = []
    selectedDeviceId.value = null
  }

  return {
    // State
    devices,
    runtimeData,
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
    // 项目数据管理
    initMockData,
    setupDataLinkListener,
    clearData,
  }
})
