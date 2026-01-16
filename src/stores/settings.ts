import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AppSettings, CableType, RepeaterType, BranchingUnit, CostFactors, FiberType, AmplifierType, BranchingUnitType } from '@/types'
import { defaultSettings, defaultFiberTypes, defaultAmplifierTypes, defaultBranchingUnitTypes } from '@/types/settings'
import type { 
  SystemPlanningParams, 
  SimulationModelConfig,
  SpanScanConfig,
  WDMPlanningParams 
} from '@/types/systemPlanning'
import { 
  defaultSystemPlanningParams,
  defaultSpanScanConfig,
  defaultWDMPlanningParams
} from '@/types/systemPlanning'
import type {
  ModelDefinition,
  SimulationCache,
  SystemPlanningCache,
} from '@/types/useFile'
import { createDefaultModels } from '@/types/useFile'

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
  authToken: string  // 认证Token
  powerThreshold: number
  temperatureThreshold: number
  berThreshold: string
}

// 光纤仿真模型类型
export type FiberSimulationModel = 'GN' | 'EGN'

// 光纤仿真配置接口
export interface FiberSimulationConfig {
  model: FiberSimulationModel  // 仿真模型偏好
  description: string
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
  authToken: '',
  powerThreshold: -25,
  temperatureThreshold: 45,
  berThreshold: '1e-6',
}

const defaultFiberSimulationConfig: FiberSimulationConfig = {
  model: 'GN',
  description: 'GN Model适用于计算速度要求高的场景',
}

// 默认仿真模型配置
const defaultSimulationModelConfig: SimulationModelConfig = {
  fiberModel: 'GN',
  edfaModel: 'EDFA_Simple',
  buModel: 'BU_Fixed',
}

export const useSettingsStore = defineStore('settings', () => {
  // 器件库状态
  const cableTypes = ref<CableType[]>([...defaultSettings.cableTypes])
  const repeaterTypes = ref<RepeaterType[]>([...defaultSettings.repeaterTypes])
  const branchingUnits = ref<BranchingUnit[]>([...defaultSettings.branchingUnits])
  const costFactors = ref<CostFactors>({ ...defaultSettings.costFactors })
  
  // 新增器件类型 - 初始为空，需要导入器件库
  const fiberTypes = ref<FiberType[]>([])
  const amplifierTypes = ref<AmplifierType[]>([])
  const branchingUnitTypes = ref<BranchingUnitType[]>([])
  const currentLibraryFile = ref('')
  
  // 新增配置状态
  const routePlanningConfig = ref<RoutePlanningConfig>({ ...defaultRoutePlanningConfig })
  const transmissionConfig = ref<TransmissionConfig>({ ...defaultTransmissionConfig })
  const monitoringConfig = ref<MonitoringConfig>({ ...defaultMonitoringConfig })
  const fiberSimulationConfig = ref<FiberSimulationConfig>({ ...defaultFiberSimulationConfig })
  
  // 系统规划参数配置 (Step 3)
  const systemPlanningConfig = ref<SystemPlanningParams>({ ...defaultSystemPlanningParams })
  // 仿真模型配置 (Step 4)
  const simulationModelConfig = ref<SimulationModelConfig>({ ...defaultSimulationModelConfig })
  // 仿真模板列表
  const savedSimulationTemplates = ref<SimulationModelConfig[]>([])
  
  // ========== USE 文件规范所需字段 ==========
  // 计算模型库 (libraries.models)
  const models = ref<ModelDefinition[]>(createDefaultModels())
  // 仿真缓存 (system_engineering.simulation_cache)
  const simulationCache = ref<SimulationCache | null>(null)
  // 系统规划缓存 (system_engineering.system_planning_cache)
  const systemPlanningCache = ref<SystemPlanningCache | null>(null)
  
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
        fiberTypes: fiberTypes.value,
        amplifierTypes: amplifierTypes.value,
        branchingUnitTypes: branchingUnitTypes.value,
        currentLibraryFile: currentLibraryFile.value,
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

  function addRepeaterType(repeater: RepeaterType) {
    repeaterTypes.value.push(repeater)
    saveToLocalStorage()
  }

  function removeRepeaterType(id: string) {
    repeaterTypes.value = repeaterTypes.value.filter(r => r.id !== id)
    saveToLocalStorage()
  }

  function addBranchingUnit(bu: BranchingUnit) {
    branchingUnits.value.push(bu)
    saveToLocalStorage()
  }

  function removeBranchingUnit(id: string) {
    branchingUnits.value = branchingUnits.value.filter(b => b.id !== id)
    saveToLocalStorage()
  }

  // 光纤类型管理
  function addFiberType(fiber: FiberType) {
    fiberTypes.value.push(fiber)
    saveToLocalStorage()
  }

  function updateFiberType(id: string, updates: Partial<FiberType>) {
    const index = fiberTypes.value.findIndex(f => f.id === id)
    if (index >= 0) {
      fiberTypes.value[index] = { ...fiberTypes.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  function removeFiberType(id: string) {
    fiberTypes.value = fiberTypes.value.filter(f => f.id !== id)
    saveToLocalStorage()
  }

  // 放大器类型管理
  function addAmplifierType(amp: AmplifierType) {
    amplifierTypes.value.push(amp)
    saveToLocalStorage()
  }

  function updateAmplifierType(id: string, updates: Partial<AmplifierType>) {
    const index = amplifierTypes.value.findIndex(a => a.id === id)
    if (index >= 0) {
      amplifierTypes.value[index] = { ...amplifierTypes.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  function removeAmplifierType(id: string) {
    amplifierTypes.value = amplifierTypes.value.filter(a => a.id !== id)
    saveToLocalStorage()
  }

  // 分支器类型管理
  function addBranchingUnitType(bu: BranchingUnitType) {
    branchingUnitTypes.value.push(bu)
    saveToLocalStorage()
  }

  function updateBranchingUnitType(id: string, updates: Partial<BranchingUnitType>) {
    const index = branchingUnitTypes.value.findIndex(b => b.id === id)
    if (index >= 0) {
      branchingUnitTypes.value[index] = { ...branchingUnitTypes.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  function removeBranchingUnitType(id: string) {
    branchingUnitTypes.value = branchingUnitTypes.value.filter(b => b.id !== id)
    saveToLocalStorage()
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
    fiberSimulationConfig.value = { ...defaultFiberSimulationConfig }
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

  // 更新光纤仿真配置
  function updateFiberSimulationConfig(updates: Partial<FiberSimulationConfig>) {
    fiberSimulationConfig.value = { ...fiberSimulationConfig.value, ...updates }
    saveToLocalStorage()
  }

  // 更新系统规划参数 (Step 3)
  function updateSystemPlanningConfig(updates: Partial<SystemPlanningParams>) {
    systemPlanningConfig.value = { ...systemPlanningConfig.value, ...updates }
    saveToLocalStorage()
  }

  // 更新 WDM 规划参数
  function updateWDMPlanningParams(updates: Partial<WDMPlanningParams>) {
    systemPlanningConfig.value.wdmParams = { 
      ...systemPlanningConfig.value.wdmParams, 
      ...updates 
    }
    saveToLocalStorage()
  }

  // 更新 Span 扫描配置
  function updateSpanScanConfig(updates: Partial<SpanScanConfig>) {
    systemPlanningConfig.value.spanScanConfig = { 
      ...systemPlanningConfig.value.spanScanConfig, 
      ...updates 
    }
    saveToLocalStorage()
  }

  // 更新仿真模型配置 (Step 4)
  function updateSimulationModelConfig(updates: Partial<SimulationModelConfig>) {
    simulationModelConfig.value = { ...simulationModelConfig.value, ...updates }
    saveToLocalStorage()
  }

  // 保存仿真模板
  function saveSimulationTemplate(template: SimulationModelConfig) {
    savedSimulationTemplates.value.push(template)
    saveToLocalStorage()
  }

  // 删除仿真模板
  function removeSimulationTemplate(templateName: string) {
    savedSimulationTemplates.value = savedSimulationTemplates.value.filter(
      t => t.templateName !== templateName
    )
    saveToLocalStorage()
  }

  // ========== USE 文件规范模型管理 ==========
  
  // 添加计算模型
  function addModel(model: ModelDefinition) {
    models.value.push(model)
    saveToLocalStorage()
  }

  // 更新计算模型
  function updateModel(modelId: string, updates: Partial<ModelDefinition>) {
    const index = models.value.findIndex(m => m.model_id === modelId)
    if (index >= 0) {
      models.value[index] = { ...models.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  // 删除计算模型
  function removeModel(modelId: string) {
    models.value = models.value.filter(m => m.model_id !== modelId)
    saveToLocalStorage()
  }

  // 根据领域获取模型
  function getModelsByDomain(domain: 'FIBER' | 'EDFA' | 'BU' | 'SYSTEM') {
    return models.value.filter(m => m.domain === domain)
  }

  // 更新仿真缓存
  function updateSimulationCache(cache: SimulationCache | null) {
    simulationCache.value = cache
    saveToLocalStorage()
  }

  // 更新系统规划缓存
  function updateSystemPlanningCache(cache: SystemPlanningCache | null) {
    systemPlanningCache.value = cache
    saveToLocalStorage()
  }

  // 使仿真缓存失效
  function invalidateSimulationCache() {
    if (simulationCache.value) {
      simulationCache.value.is_valid = false
      saveToLocalStorage()
    }
  }

  // 使系统规划缓存失效
  function invalidateSystemPlanningCache() {
    if (systemPlanningCache.value) {
      systemPlanningCache.value.is_valid = false
      saveToLocalStorage()
    }
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
    fiberSimulationConfig,
    // 新增器件类型
    fiberTypes,
    amplifierTypes,
    branchingUnitTypes,
    currentLibraryFile,
    loadFromLocalStorage,
    saveToLocalStorage,
    updateCableType,
    addCableType,
    removeCableType,
    updateRepeaterType,
    addRepeaterType,
    removeRepeaterType,
    addBranchingUnit,
    removeBranchingUnit,
    // 光纤类型
    addFiberType,
    updateFiberType,
    removeFiberType,
    // 放大器类型
    addAmplifierType,
    updateAmplifierType,
    removeAmplifierType,
    // 分支器类型
    addBranchingUnitType,
    updateBranchingUnitType,
    removeBranchingUnitType,
    updateCostFactors,
    resetToDefaults,
    updateRoutePlanningConfig,
    updateTransmissionConfig,
    updateMonitoringConfig,
    updateFiberSimulationConfig,
    // 系统规划相关 (Step 3, 4)
    systemPlanningConfig,
    simulationModelConfig,
    savedSimulationTemplates,
    updateSystemPlanningConfig,
    updateWDMPlanningParams,
    updateSpanScanConfig,
    updateSimulationModelConfig,
    saveSimulationTemplate,
    removeSimulationTemplate,
    // USE 文件规范相关
    models,
    simulationCache,
    systemPlanningCache,
    addModel,
    updateModel,
    removeModel,
    getModelsByDomain,
    updateSimulationCache,
    updateSystemPlanningCache,
    invalidateSimulationCache,
    invalidateSystemPlanningCache,
  }
})
