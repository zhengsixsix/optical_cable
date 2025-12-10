import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AppSettings, CableType, RepeaterType, BranchingUnit, CostFactors } from '@/types'
import { defaultSettings } from '@/types/settings'

const STORAGE_KEY = 'cable-planner-settings'

// 路径规划配置接口
export interface RoutePlanningConfig {
  mode: 'point-to-point' | 'multi-point'
  startPoint: { lon: number; lat: number }
  endPoint: { lon: number; lat: number }
  planningRange: {
    northwest: { lon: number; lat: number }
    southeast: { lon: number; lat: number }
  }
  multiPointFile?: string
}

// 传输系统配置接口
export interface TransmissionConfig {
  channelCount: number
  centerWavelength: number
  channelBandwidth: number
  calculationModels: string[]
}

// 监控系统配置接口
export interface MonitoringConfig {
  dataSourceType: 'realtime' | 'history'
  connectionAddress: string
  powerThreshold: number
  temperatureThreshold: number
  berThreshold: string
}

// 默认配置
const defaultRoutePlanningConfig: RoutePlanningConfig = {
  mode: 'point-to-point',
  startPoint: { lon: 121.4737, lat: 31.2304 },
  endPoint: { lon: 139.6917, lat: 35.6895 },
  planningRange: {
    northwest: { lon: 100, lat: 50 },
    southeast: { lon: 150, lat: 10 },
  },
}

const defaultTransmissionConfig: TransmissionConfig = {
  channelCount: 96,
  centerWavelength: 1550,
  channelBandwidth: 50,
  calculationModels: ['power', 'ase', 'nli'],
}

const defaultMonitoringConfig: MonitoringConfig = {
  dataSourceType: 'realtime',
  connectionAddress: 'ws://localhost:8080/monitor',
  powerThreshold: -25,
  temperatureThreshold: 45,
  berThreshold: '1e-6',
}

export const useSettingsStore = defineStore('settings', () => {
  // 器件库状态
  const cableTypes = ref<CableType[]>([...defaultSettings.cableTypes])
  const repeaterTypes = ref<RepeaterType[]>([...defaultSettings.repeaterTypes])
  const branchingUnits = ref<BranchingUnit[]>([...defaultSettings.branchingUnits])
  const costFactors = ref<CostFactors>({ ...defaultSettings.costFactors })
  
  // 新增配置状态
  const routePlanningConfig = ref<RoutePlanningConfig>({ ...defaultRoutePlanningConfig })
  const transmissionConfig = ref<TransmissionConfig>({ ...defaultTransmissionConfig })
  const monitoringConfig = ref<MonitoringConfig>({ ...defaultMonitoringConfig })
  
  // 汇总的settings对象，兼容旧代码
  const settings = ref({
    cableTypes: cableTypes.value,
    repeaterTypes: repeaterTypes.value,
    branchingUnits: branchingUnits.value,
    costFactors: costFactors.value,
  })

  // 从 localStorage 加载
  function loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data: AppSettings = JSON.parse(saved)
        cableTypes.value = data.cableTypes || defaultSettings.cableTypes
        repeaterTypes.value = data.repeaterTypes || defaultSettings.repeaterTypes
        branchingUnits.value = data.branchingUnits || defaultSettings.branchingUnits
        costFactors.value = data.costFactors || defaultSettings.costFactors
      }
    } catch (error) {
      console.error('加载设置失败:', error)
    }
  }

  // 保存到 localStorage
  function saveToLocalStorage() {
    try {
      const data: AppSettings = {
        cableTypes: cableTypes.value,
        repeaterTypes: repeaterTypes.value,
        branchingUnits: branchingUnits.value,
        costFactors: costFactors.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('保存设置失败:', error)
    }
  }

  // Actions
  function updateCableType(id: string, updates: Partial<CableType>) {
    const index = cableTypes.value.findIndex(c => c.id === id)
    if (index >= 0) {
      cableTypes.value[index] = { ...cableTypes.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  function addCableType(cableType: CableType) {
    cableTypes.value.push(cableType)
    saveToLocalStorage()
  }

  function removeCableType(id: string) {
    cableTypes.value = cableTypes.value.filter(c => c.id !== id)
    saveToLocalStorage()
  }

  function updateRepeaterType(id: string, updates: Partial<RepeaterType>) {
    const index = repeaterTypes.value.findIndex(r => r.id === id)
    if (index >= 0) {
      repeaterTypes.value[index] = { ...repeaterTypes.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  function updateCostFactors(updates: Partial<CostFactors>) {
    costFactors.value = { ...costFactors.value, ...updates }
    saveToLocalStorage()
  }

  function resetToDefaults() {
    cableTypes.value = [...defaultSettings.cableTypes]
    repeaterTypes.value = [...defaultSettings.repeaterTypes]
    branchingUnits.value = [...defaultSettings.branchingUnits]
    costFactors.value = { ...defaultSettings.costFactors }
    routePlanningConfig.value = { ...defaultRoutePlanningConfig }
    transmissionConfig.value = { ...defaultTransmissionConfig }
    monitoringConfig.value = { ...defaultMonitoringConfig }
    saveToLocalStorage()
  }

  // 更新路径规划配置
  function updateRoutePlanningConfig(updates: Partial<RoutePlanningConfig>) {
    routePlanningConfig.value = { ...routePlanningConfig.value, ...updates }
    saveToLocalStorage()
  }

  // 更新传输系统配置
  function updateTransmissionConfig(updates: Partial<TransmissionConfig>) {
    transmissionConfig.value = { ...transmissionConfig.value, ...updates }
    saveToLocalStorage()
  }

  // 更新监控系统配置
  function updateMonitoringConfig(updates: Partial<MonitoringConfig>) {
    monitoringConfig.value = { ...monitoringConfig.value, ...updates }
    saveToLocalStorage()
  }

  // 初始化时加载
  loadFromLocalStorage()

  return {
    cableTypes,
    repeaterTypes,
    branchingUnits,
    costFactors,
    settings,
    routePlanningConfig,
    transmissionConfig,
    monitoringConfig,
    loadFromLocalStorage,
    saveToLocalStorage,
    updateCableType,
    addCableType,
    removeCableType,
    updateRepeaterType,
    updateCostFactors,
    resetToDefaults,
    updateRoutePlanningConfig,
    updateTransmissionConfig,
    updateMonitoringConfig,
  }
})
