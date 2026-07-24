import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConnectorStore } from './connector'

// 监控设备类型 (派生自 ConnectorElement + 运行时数据)
export interface MonitorDevice {
  id: string
  name: string
  type: string
  deviceTypeCd?: string
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
    
    return elements.flatMap(elem => {
      const runtime = runtimeData.value[elem.id]
      if (!runtime) return []

      return [{
        id: elem.id,
        name: elem.name,
        type: elem.type,
        deviceTypeCd: elem.deviceTypeCd,
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
      }]
    })
  })

  // 当前选中的设备
  const selectedDevice = computed(() => 
    devices.value.find(d => d.id === selectedDeviceId.value) || null
  )

  // 选择设备
  function selectDevice(deviceId: string | null) {
    selectedDeviceId.value = deviceId
  }

  function replaceRuntimeData(devices: readonly unknown[]) {
    const next: Record<string, RuntimeData> = {}

    for (const device of devices) {
      if (!device || typeof device !== 'object') continue
      const snapshot = device as Record<string, unknown>
      if (
        typeof snapshot.id !== 'string'
        || (snapshot.status !== 'normal' && snapshot.status !== 'warning' && snapshot.status !== 'error')
      ) {
        continue
      }

      const inputPower = Number(snapshot.inputPower)
      const outputPower = Number(snapshot.outputPower)
      const pumpCurrent = Number(snapshot.pumpCurrent)
      const pfeVoltage = Number(snapshot.pfeVoltage)
      const pfeCurrent = Number(snapshot.pfeCurrent)
      const temperature = Number(snapshot.temperature)
      if (![inputPower, outputPower, pumpCurrent, pfeVoltage, pfeCurrent, temperature].every(Number.isFinite)) {
        continue
      }

      const optionalNumber = (value: unknown): number | undefined => {
        if (value === null || value === undefined || value === '') return undefined
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : undefined
      }
      next[snapshot.id] = {
        status: snapshot.status,
        inputPower,
        outputPower,
        pumpCurrent,
        pfeVoltage,
        pfeCurrent,
        temperature,
        qValue: optionalNumber(snapshot.qValue),
        ber: optionalNumber(snapshot.ber),
        osnr: optionalNumber(snapshot.osnr),
      }
    }

    runtimeData.value = next
  }

  // 添加告警
  function addAlarm(alarm: Omit<AlarmRecord, 'id'>) {
    const newAlarm: AlarmRecord = {
      ...alarm,
      id: Date.now(),
    }
    alarmHistory.value.unshift(newAlarm)
  }

  function replaceAlarmHistory(alarms: AlarmRecord[]) {
    alarmHistory.value = alarms
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
    // Actions
    selectDevice,
    replaceRuntimeData,
    addAlarm,
    replaceAlarmHistory,
    clearData,
  }
})
