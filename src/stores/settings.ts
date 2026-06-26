import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AppSettings, CableType, RepeaterType, BranchingUnit, CostFactors, FiberType, AmplifierType, BranchingUnitType, EqualizerType, JointBoxType } from '@/types'
import { defaultSettings, defaultFiberTypes, defaultAmplifierTypes, defaultBranchingUnitTypes, defaultEqualizerTypes, defaultJointBoxTypes } from '@/types/settings'
import { platformDeviceConfigApi, platformDeviceEntityApi, platformDeviceLibraryApi } from '@/services/platform/api'
import type {
  PlanDeviceConfig,
  PlanDeviceConfigSave,
  PlanDeviceConfigSearch,
  PlanDeviceEntity,
  PlanDeviceEntitySearch,
  PlanDeviceLibrary,
  PlanDeviceLibrarySearch,
} from '@/services/platform/types'
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

// 多点坐标接口 - USE文件规范: imported_landing_points
export interface WaypointConfig {
  id: string
  name: string
  lon: number
  lat: number
  depth?: number  // 水深，>0 表示水下站点，0 或不设置表示岸上站点
  // properties 字段在实际使用中可扩展
}

// BU 配置接口 - USE文件规范: imported_bu_nodes
export interface BUConfig {
  id: string
  name: string
  lon: number
  lat: number
  portLimit: number  // 对应 USE 规范的 max_ports，范围 2-8
}

// 海缆铠装映射规则（新增）
export interface ArmorMapping {
  riskLevel: 'high' | 'medium' | 'low'
  riskThreshold: number      // 风险阈值
  cableTypeId: string        // 缆型ID（关联器件库）
  cableTypeName: string      // 缆型名称
  unitPrice: number          // 单价（千元/km）
}

// 冗余策略配置（新增）
export interface RedundancyConfig {
  enabled: boolean
  costLimitType: 'relative' | 'absolute'
  relativeCostPercent?: number  // 相对成本百分比（如30%）
  absoluteCostLimit?: number    // 绝对成本上限（万元）
  criticalNodes?: string[]      // 关键节点ID列表（仅为这些节点的链路生成备份路径）
}

// 避障区域配置
export interface AvoidanceZoneConfig {
  id: string
  name?: string
  points: { lon: number; lat: number }[]  // 多边形顶点
}

// 路径规划配置接口
export interface RoutePlanningConfig {
  mode: 'point-to-point' | 'multi-point'
  startPoint: { name?: string; lon: number; lat: number; depth?: number }  // depth > 0 为水下站点
  endPoint: { name?: string; lon: number; lat: number; depth?: number }    // depth > 0 为水下站点
  rangeMode: 'auto' | 'manual'  // 规划范围模式：auto=自动读取地图视口，manual=手动配置
  planningRange: {
    northwest: { lon: number; lat: number }
    southeast: { lon: number; lat: number }
  }
  gridResolution?: number  // 栅格分辨率（米），默认500
  waypoints?: WaypointConfig[]  // 多点规划的坐标点列表
  isConfigured?: boolean  // 用户是否主动配置过起点终点
  // 新增字段
  buList?: BUConfig[]              // BU 配置列表
  armorMappings?: ArmorMapping[]   // 海缆铠装映射规则
  redundancyConfig?: RedundancyConfig  // 冗余策略配置
  avoidanceZones?: AvoidanceZoneConfig[]  // 避障区域
}

// 传输系统配置接口
export interface TransmissionConfig {
  channelCount: number
  centerWavelength: number
  channelBandwidth: number
  calculationModels: string[]
}

// 数据字段映射接口
export interface FieldMapping {
  id: string
  sourceField: string   // NMS原始字段名
  targetField: string   // 系统内部字段名
  dataType: 'string' | 'number' | 'boolean' | 'date'
  description: string
}

// 监控系统配置接口
export interface MonitoringConfig {
  dataSourceType: 'realtime' | 'history'
  connectionAddress: string
  authToken: string  // 认证Token
  pollingInterval: number  // 轮询间隔(秒)
  requestTimeout: number   // 请求超时(秒)
  protocol: 'JSON' | 'XML' | 'SNMP' | 'gRPC'  // 数据协议
  authMethod: 'apikey' | 'oauth' | 'basic'      // 认证方式
  powerThreshold: number
  temperatureThreshold: number
  berThreshold: string
  fieldMappings: FieldMapping[]  // 数据字段映射配置
}

// 光纤仿真模型类型
export type FiberSimulationModel = 'GN' | 'EGN' | 'SSFM'

// 光纤仿真配置接口
export interface FiberSimulationConfig {
  model: FiberSimulationModel  // 仿真模型偏好
  description: string
}

// 缆型数据库接口
export interface CableTypeSpec {
  id: string
  name: string
  armorType: string  // DA, RA, SA, LW, LWP
  unitPrice: number  // 千元/km
}

// 默认缆型数据库
const defaultCableTypeDatabase: CableTypeSpec[] = [
  { id: 'da-01', name: 'DA-01 (双铠装)', armorType: 'DA', unitPrice: 24.0 },
  { id: 'da-02', name: 'DA-02 (双铠加强)', armorType: 'DA', unitPrice: 26.5 },
  { id: 'ra-01', name: 'RA-01 (岩石铠装)', armorType: 'RA', unitPrice: 28.0 },
  { id: 'sa-01', name: 'SA-01 (单铠装)', armorType: 'SA', unitPrice: 19.5 },
  { id: 'sa-02', name: 'SA-02 (单铠加强)', armorType: 'SA', unitPrice: 21.0 },
  { id: 'lw-01', name: 'LW-01 (轻型)', armorType: 'LW', unitPrice: 15.0 },
  { id: 'lwp-01', name: 'LWP-01 (轻型保护)', armorType: 'LWP', unitPrice: 16.5 },
]

// 默认铠装映射规则
const defaultArmorMappings: ArmorMapping[] = [
  { riskLevel: 'high', riskThreshold: 3, cableTypeId: 'da-01', cableTypeName: 'DA-01 (双铠装)', unitPrice: 24.0 },
  { riskLevel: 'medium', riskThreshold: 2, cableTypeId: 'sa-01', cableTypeName: 'SA-01 (单铠装)', unitPrice: 19.5 },
  { riskLevel: 'low', riskThreshold: 0, cableTypeId: 'lw-01', cableTypeName: 'LW-01 (轻型)', unitPrice: 15.0 },
]

// 默认冗余策略配置
const defaultRedundancyConfig: RedundancyConfig = {
  enabled: false,
  costLimitType: 'relative',
  relativeCostPercent: 30,
}

// 默认配置
const defaultRoutePlanningConfig: RoutePlanningConfig = {
  mode: 'point-to-point',
  startPoint: { lon: 0, lat: 0 },
  endPoint: { lon: 0, lat: 0 },
  rangeMode: 'auto',
  planningRange: {
    northwest: { lon: 100, lat: 50 },
    southeast: { lon: 150, lat: 10 },
  },
  gridResolution: 500,  // 默认栅格分辨率 500 米
  waypoints: [],
  isConfigured: false,
  buList: [],
  armorMappings: defaultArmorMappings,
  redundancyConfig: defaultRedundancyConfig,
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
  pollingInterval: 30,
  requestTimeout: 10,
  protocol: 'JSON',
  authMethod: 'apikey',
  powerThreshold: -25,
  temperatureThreshold: 45,
  berThreshold: '1e-6',
  fieldMappings: [
    { id: 'fm-1', sourceField: 'device_id', targetField: 'deviceId', dataType: 'string', description: '设备标识' },
    { id: 'fm-2', sourceField: 'optical_power', targetField: 'inputPower', dataType: 'number', description: '光功率' },
    { id: 'fm-3', sourceField: 'temperature', targetField: 'temperature', dataType: 'number', description: '温度' },
    { id: 'fm-4', sourceField: 'bit_error_rate', targetField: 'ber', dataType: 'number', description: '误码率' },
  ],
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
  
  // 新增器件类型 - 初始为空，由用户自行添加
  const fiberTypes = ref<FiberType[]>([])
  const amplifierTypes = ref<AmplifierType[]>([])
  const branchingUnitTypes = ref<BranchingUnitType[]>([])
  const equalizerTypes = ref<EqualizerType[]>([])
  const jointBoxTypes = ref<JointBoxType[]>([])
  const currentLibraryFile = ref('')
  const platformDeviceConfigs = ref<PlanDeviceConfig[]>([])
  const platformDeviceLibraries = ref<PlanDeviceLibrary[]>([])
  const platformDeviceEntities = ref<PlanDeviceEntity[]>([])
  const deviceConfigLoading = ref(false)
  const deviceConfigSyncing = ref(false)
  const deviceConfigSyncError = ref<string | null>(null)
  const deviceLibraryLoading = ref(false)
  const deviceLibrarySyncing = ref(false)
  const deviceLibrarySyncError = ref<string | null>(null)
  const deviceEntityLoading = ref(false)
  const deviceEntitySyncing = ref(false)
  const deviceEntitySyncError = ref<string | null>(null)
  
  // 新增配置状态
  const routePlanningConfig = ref<RoutePlanningConfig>({ ...defaultRoutePlanningConfig })
  const transmissionConfig = ref<TransmissionConfig>({ ...defaultTransmissionConfig })
  const monitoringConfig = ref<MonitoringConfig>({ ...defaultMonitoringConfig })
  const fiberSimulationConfig = ref<FiberSimulationConfig>({ ...defaultFiberSimulationConfig })
  
  // 缆型数据库（用于铠装选择的下拉菜单）
  const cableTypeDatabase = ref<CableTypeSpec[]>([...defaultCableTypeDatabase])
  
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
  
  // 设计视图链路计算摘要缓存 (_app_extensions.designCache)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkCalcSummaryCache = ref<Record<string, any> | null>(null)
  
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
        const data = JSON.parse(saved)
        cableTypes.value = data.cableTypes || defaultSettings.cableTypes
        repeaterTypes.value = data.repeaterTypes || defaultSettings.repeaterTypes
        branchingUnits.value = data.branchingUnits || defaultSettings.branchingUnits
        // 器件库数据（光纤/放大器/分支器/均衡器/接头盒）
        if (Array.isArray(data.fiberTypes)) fiberTypes.value = data.fiberTypes
        if (Array.isArray(data.amplifierTypes)) amplifierTypes.value = data.amplifierTypes
        if (Array.isArray(data.branchingUnitTypes)) branchingUnitTypes.value = data.branchingUnitTypes
        if (Array.isArray(data.equalizerTypes)) equalizerTypes.value = data.equalizerTypes
        if (Array.isArray(data.jointBoxTypes)) jointBoxTypes.value = data.jointBoxTypes
        if (data.currentLibraryFile) currentLibraryFile.value = data.currentLibraryFile
      }
    } catch {
      // localStorage 加载失败时使用默认値
    }
  }

  // 保存到 localStorage
  function saveToLocalStorage() {
    try {
      const data = {
        cableTypes: cableTypes.value,
        repeaterTypes: repeaterTypes.value,
        branchingUnits: branchingUnits.value,
        // 器件库数据一并保存
        fiberTypes: fiberTypes.value,
        amplifierTypes: amplifierTypes.value,
        branchingUnitTypes: branchingUnitTypes.value,
        equalizerTypes: equalizerTypes.value,
        jointBoxTypes: jointBoxTypes.value,
        currentLibraryFile: currentLibraryFile.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // localStorage 保存失败时静默处理
    }
  }

  async function loadPlatformDeviceLibraries(search: PlanDeviceLibrarySearch = {}) {
    deviceLibraryLoading.value = true
    deviceLibrarySyncError.value = null
    try {
      const response = await platformDeviceLibraryApi.search({
        pageNumber: 1,
        pageSize: 1000,
        ...search,
      })
      platformDeviceLibraries.value = response.data ?? []
      if (platformDeviceLibraries.value.length) currentLibraryFile.value = '平台器件库'
      return response
    } catch (error) {
      deviceLibrarySyncError.value = error instanceof Error ? error.message : '器件库加载失败'
      throw error
    } finally {
      deviceLibraryLoading.value = false
    }
  }

  const loadDeviceLibraryFromPlatform = loadPlatformDeviceLibraries

  async function loadPlatformDeviceConfigs(search: PlanDeviceConfigSearch) {
    deviceConfigLoading.value = true
    deviceConfigSyncError.value = null
    try {
      const response = await platformDeviceConfigApi.search({
        pageNumber: 1,
        pageSize: 1000,
        ...search,
      })
      platformDeviceConfigs.value = response.data ?? []
      return response
    } catch (error) {
      deviceConfigSyncError.value = error instanceof Error ? error.message : '器件配置加载失败'
      throw error
    } finally {
      deviceConfigLoading.value = false
    }
  }

  async function savePlatformDeviceConfig(config: PlanDeviceConfigSave, reloadSearch?: PlanDeviceConfigSearch) {
    deviceConfigSyncing.value = true
    deviceConfigSyncError.value = null
    try {
      const id = await platformDeviceConfigApi.save(config)
      await loadPlatformDeviceConfigs(reloadSearch ?? { deviceTypeCd: config.deviceTypeCd })
      return id
    } catch (error) {
      deviceConfigSyncError.value = error instanceof Error ? error.message : '器件配置保存失败'
      throw error
    } finally {
      deviceConfigSyncing.value = false
    }
  }

  async function removePlatformDeviceConfig(id: number | string, search: PlanDeviceConfigSearch | string) {
    deviceConfigSyncing.value = true
    deviceConfigSyncError.value = null
    try {
      await platformDeviceConfigApi.remove(id)
      await loadPlatformDeviceConfigs(typeof search === 'string' ? { deviceTypeCd: search } : search)
    } catch (error) {
      deviceConfigSyncError.value = error instanceof Error ? error.message : '器件配置删除失败'
      throw error
    } finally {
      deviceConfigSyncing.value = false
    }
  }

  async function loadPlatformDeviceLibraryDetail(id: number | string) {
    const detail = await platformDeviceLibraryApi.detail(id)
    const index = platformDeviceLibraries.value.findIndex(item => String(item.id) === String(id))
    if (index >= 0) platformDeviceLibraries.value[index] = { ...platformDeviceLibraries.value[index], ...detail }
    return detail
  }

  async function savePlatformDeviceLibrary(library: PlanDeviceLibrary) {
    deviceLibrarySyncing.value = true
    deviceLibrarySyncError.value = null
    try {
      const payload: PlanDeviceLibrary = {
        ...library,
        iconSize: library.iconSize ?? { width: 48, height: 48 },
        bindFuncList: library.bindFuncList ?? [],
        deviceValueList: library.deviceValueList ?? [],
      }
      const id = await platformDeviceLibraryApi.save(payload)
      const saved = { ...payload, id }
      const index = platformDeviceLibraries.value.findIndex(item => item.id === id || (payload.id != null && item.id === payload.id))
      if (index >= 0) platformDeviceLibraries.value[index] = saved
      else platformDeviceLibraries.value.push(saved)
      currentLibraryFile.value = saved.name || '平台器件库'
      return id
    } catch (error) {
      deviceLibrarySyncError.value = error instanceof Error ? error.message : '器件库同步失败'
      throw error
    } finally {
      deviceLibrarySyncing.value = false
    }
  }

  async function removePlatformDeviceLibrary(id: number | string) {
    deviceLibrarySyncing.value = true
    deviceLibrarySyncError.value = null
    try {
      await platformDeviceLibraryApi.remove(id)
      platformDeviceLibraries.value = platformDeviceLibraries.value.filter(item => item.id !== id)
    } catch (error) {
      deviceLibrarySyncError.value = error instanceof Error ? error.message : '器件库删除失败'
      throw error
    } finally {
      deviceLibrarySyncing.value = false
    }
  }

  async function syncDeviceLibraryToPlatform() {
    await loadPlatformDeviceLibraries()
    return platformDeviceLibraries.value.map(item => item.id).filter((id): id is number | string => id != null)
  }

  async function loadPlatformDeviceEntities(search: PlanDeviceEntitySearch | number = {}) {
    deviceEntityLoading.value = true
    deviceEntitySyncError.value = null
    try {
      const filters = typeof search === 'number' ? { projectId: search } : search
      const response = await platformDeviceEntityApi.search({
        pageNumber: 1,
        pageSize: 1000,
        ...filters,
      })
      platformDeviceEntities.value = response.data ?? []
      return response
    } catch (error) {
      deviceEntitySyncError.value = error instanceof Error ? error.message : '器件实例加载失败'
      throw error
    } finally {
      deviceEntityLoading.value = false
    }
  }

  async function savePlatformDeviceEntity(entity: PlanDeviceEntity) {
    deviceEntitySyncing.value = true
    deviceEntitySyncError.value = null
    try {
      const id = await platformDeviceEntityApi.save(entity)
      const saved = { ...entity, id, deviceValueList: entity.deviceValueList ?? [] }
      const index = platformDeviceEntities.value.findIndex(item => item.id === id || (entity.id != null && item.id === entity.id))
      if (index >= 0) platformDeviceEntities.value[index] = saved
      else platformDeviceEntities.value.push(saved)
      return id
    } catch (error) {
      deviceEntitySyncError.value = error instanceof Error ? error.message : '器件实例同步失败'
      throw error
    } finally {
      deviceEntitySyncing.value = false
    }
  }

  async function removePlatformDeviceEntity(id: number | string) {
    deviceEntitySyncing.value = true
    deviceEntitySyncError.value = null
    try {
      await platformDeviceEntityApi.remove(id)
      platformDeviceEntities.value = platformDeviceEntities.value.filter(item => item.id !== id)
    } catch (error) {
      deviceEntitySyncError.value = error instanceof Error ? error.message : '器件实例删除失败'
      throw error
    } finally {
      deviceEntitySyncing.value = false
    }
  }

  async function loadPlatformDeviceEntityDetail(id: number | string) {
    const detail = await platformDeviceEntityApi.detail(id)
    const index = platformDeviceEntities.value.findIndex(item => String(item.id) === String(id))
    if (index >= 0) platformDeviceEntities.value[index] = { ...platformDeviceEntities.value[index], ...detail }
    return detail
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

  // 均衡器类型管理
  function addEqualizerType(eq: EqualizerType) {
    equalizerTypes.value.push(eq)
    saveToLocalStorage()
  }

  function updateEqualizerType(id: string, updates: Partial<EqualizerType>) {
    const index = equalizerTypes.value.findIndex(e => e.id === id)
    if (index >= 0) {
      equalizerTypes.value[index] = { ...equalizerTypes.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  function removeEqualizerType(id: string) {
    equalizerTypes.value = equalizerTypes.value.filter(e => e.id !== id)
    saveToLocalStorage()
  }

  // 接头盒型号管理
  function addJointBoxType(jb: JointBoxType) {
    jointBoxTypes.value.push(jb)
    saveToLocalStorage()
  }

  function updateJointBoxType(id: string, updates: Partial<JointBoxType>) {
    const index = jointBoxTypes.value.findIndex(j => j.id === id)
    if (index >= 0) {
      jointBoxTypes.value[index] = { ...jointBoxTypes.value[index], ...updates }
      saveToLocalStorage()
    }
  }

  function removeJointBoxType(id: string) {
    jointBoxTypes.value = jointBoxTypes.value.filter(j => j.id !== id)
    saveToLocalStorage()
  }

  // 更新成本参数 (不保存到 localStorage，只存储在项目文件中)
  function updateCostFactors(updates: Partial<CostFactors>) {
    costFactors.value = { ...costFactors.value, ...updates }
    // 不调用 saveToLocalStorage，成本参数只存储在项目文件中
  }

  // 重置器件库为默认值
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

  // 重置项目配置为默认值 (关闭项目时调用)
  function resetProjectSettings() {
    costFactors.value = { ...defaultSettings.costFactors }
    routePlanningConfig.value = { ...defaultRoutePlanningConfig }
    transmissionConfig.value = { ...defaultTransmissionConfig }
    monitoringConfig.value = { ...defaultMonitoringConfig }
    fiberSimulationConfig.value = { ...defaultFiberSimulationConfig }
    systemPlanningConfig.value = { ...defaultSystemPlanningParams }
    simulationModelConfig.value = { ...defaultSimulationModelConfig }
  }

  // 更新路径规划配置 (不保存到 localStorage，只存储在项目文件中)
  function updateRoutePlanningConfig(updates: Partial<RoutePlanningConfig>) {
    routePlanningConfig.value = { ...routePlanningConfig.value, ...updates }
  }

  // 更新传输系统配置 (不保存到 localStorage，只存储在项目文件中)
  function updateTransmissionConfig(updates: Partial<TransmissionConfig>) {
    transmissionConfig.value = { ...transmissionConfig.value, ...updates }
  }

  // 更新监控系统配置 (不保存到 localStorage，只存储在项目文件中)
  function updateMonitoringConfig(updates: Partial<MonitoringConfig>) {
    monitoringConfig.value = { ...monitoringConfig.value, ...updates }
  }

  // 更新光纤仿真配置 (不保存到 localStorage，只存储在项目文件中)
  function updateFiberSimulationConfig(updates: Partial<FiberSimulationConfig>) {
    fiberSimulationConfig.value = { ...fiberSimulationConfig.value, ...updates }
  }
  
  // 缆型数据库管理
  function addCableTypeSpec(spec: CableTypeSpec) {
    // 检查名称是否重复
    const exists = cableTypeDatabase.value.some(c => c.name === spec.name)
    if (exists) {
      return false
    }
    cableTypeDatabase.value.push(spec)
    return true
  }
  
  function removeCableTypeSpec(id: string) {
    cableTypeDatabase.value = cableTypeDatabase.value.filter(c => c.id !== id)
  }
  
  function getCableTypesByArmor(armorTypes: string[]): CableTypeSpec[] {
    return cableTypeDatabase.value.filter(c => armorTypes.includes(c.armorType))
  }

  // 更新系统规划参数 (Step 3)
  function updateSystemPlanningConfig(updates: Partial<SystemPlanningParams>) {
    systemPlanningConfig.value = { ...systemPlanningConfig.value, ...updates }
  }

  // 更新 WDM 规划参数
  function updateWDMPlanningParams(updates: Partial<WDMPlanningParams>) {
    systemPlanningConfig.value.wdmParams = { 
      ...systemPlanningConfig.value.wdmParams, 
      ...updates 
    }
  }

  // 更新 Span 扫描配置
  function updateSpanScanConfig(updates: Partial<SpanScanConfig>) {
    systemPlanningConfig.value.spanScanConfig = { 
      ...systemPlanningConfig.value.spanScanConfig, 
      ...updates 
    }
  }

  // 更新仿真模型配置 (Step 4)
  function updateSimulationModelConfig(updates: Partial<SimulationModelConfig>) {
    simulationModelConfig.value = { ...simulationModelConfig.value, ...updates }
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
  
  // 设置当前器件库文件
  function setCurrentLibraryFile(fileName: string) {
    currentLibraryFile.value = fileName
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
    // 缆型数据库
    cableTypeDatabase,
    addCableTypeSpec,
    removeCableTypeSpec,
    getCableTypesByArmor,
    // 新增器件类型
    fiberTypes,
    amplifierTypes,
    branchingUnitTypes,
    equalizerTypes,
    jointBoxTypes,
    currentLibraryFile,
    platformDeviceConfigs,
    platformDeviceLibraries,
    platformDeviceEntities,
    deviceConfigLoading,
    deviceConfigSyncing,
    deviceConfigSyncError,
    deviceLibraryLoading,
    deviceLibrarySyncing,
    deviceLibrarySyncError,
    deviceEntityLoading,
    deviceEntitySyncing,
    deviceEntitySyncError,
    loadPlatformDeviceConfigs,
    savePlatformDeviceConfig,
    removePlatformDeviceConfig,
    loadPlatformDeviceLibraries,
    loadPlatformDeviceLibraryDetail,
    savePlatformDeviceLibrary,
    removePlatformDeviceLibrary,
    loadPlatformDeviceEntities,
    loadPlatformDeviceEntityDetail,
    savePlatformDeviceEntity,
    removePlatformDeviceEntity,
    loadDeviceLibraryFromPlatform,
    syncDeviceLibraryToPlatform,
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
    // 均衡器类型
    addEqualizerType,
    updateEqualizerType,
    removeEqualizerType,
    // 接头盒型号
    addJointBoxType,
    updateJointBoxType,
    removeJointBoxType,
    updateCostFactors,
    resetToDefaults,
    resetProjectSettings,
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
    linkCalcSummaryCache,
    addModel,
    updateModel,
    removeModel,
    getModelsByDomain,
    updateSimulationCache,
    updateSystemPlanningCache,
    invalidateSimulationCache,
    invalidateSystemPlanningCache,
    setCurrentLibraryFile,
  }
})
