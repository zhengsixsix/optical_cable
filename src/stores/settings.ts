import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CableType, RepeaterType, BranchingUnit, CostFactors, FiberType, AmplifierType, BranchingUnitType, EqualizerType, JointBoxType } from '@/types'
import { defaultSettings } from '@/types/settings'
import type { RespVO } from '@/services/platform/client'
import { platformDeviceConfigApi, platformDeviceEntityApi, platformDeviceLibraryApi } from '@/services/platform/api'
import type {
  PlanDeviceConfig,
  PlanDeviceConfigSearch,
  PlanDeviceEntity,
  PlanDeviceEntitySearch,
  PlanDeviceLibrary,
  PlanDeviceLibrarySearch,
  PlanConfigSnapshot,
  PlatformPlanningResults,
} from '@/services/platform/types'
import type { 
  SystemPlanningParams, 
  SimulationModelConfig,
  SpanScanConfig,
  WDMPlanningParams 
} from '@/types/systemPlanning'
import { 
  defaultSystemPlanningParams
} from '@/types/systemPlanning'
import type {
  ModelDefinition,
  SimulationCache,
  SystemPlanningCache,
} from '@/types/useFile'

const STORAGE_KEY = 'cable-planner-settings'

// 多点坐标接口 - USE文件规范: imported_landing_points
interface WaypointConfig {
  id: string
  platformPointId?: string | number
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

// 海缆铠装映射规则（USE 文件风险等级映射）
export interface ArmorMapping {
  riskLevel: 'high' | 'medium' | 'low'
  riskThreshold: number      // 风险阈值
  cableTypeId: string        // 缆型ID（关联器件库）
  cableTypeName: string      // 缆型名称
  unitPrice: number          // 单价（千元/km）
}

export type ArmorRiskLevel = 'low' | 'medium' | 'high'

export const armorRiskLevelOptions: Array<{ value: ArmorRiskLevel; label: string }> = [
  { value: 'low', label: '低风险' },
  { value: 'medium', label: '中风险' },
  { value: 'high', label: '高风险' },
]

export interface ArmorTypeMapping {
  armorTypeCode: string      // ARMORING_TYPE 字典编码
  riskLevel: ArmorRiskLevel
  unitPrice: number          // 成本（千元/km）
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
interface AvoidanceZoneConfig {
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
  armorMappings?: ArmorMapping[]   // USE 风险等级与缆型映射（兼容旧项目）
  armorTypeMappings?: ArmorTypeMapping[] // 字典铠装类型的风险与成本配置
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
interface FieldMapping {
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

// 光纤仿真配置接口
export interface FiberSimulationConfig {
  model: string  // 仿真模型偏好
  description: string
}

// 缆型数据库接口
export interface CableTypeSpec {
  id: string
  name: string
  armorType: string  // ARMORING_TYPE 字典编码
  unitPrice: number  // 千元/km
}

// 默认缆型数据库
const defaultCableTypeDatabase: CableTypeSpec[] = []

// 默认铠装映射规则
const defaultArmorMappings: ArmorMapping[] = []

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
  armorTypeMappings: [],
  redundancyConfig: defaultRedundancyConfig,
}

const defaultTransmissionConfig: TransmissionConfig = {
  channelCount: 96,
  centerWavelength: 1550,
  channelBandwidth: 50,
  calculationModels: [],
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
  model: '',
  description: '',
}

// 默认仿真模型配置
const defaultSimulationModelConfig: SimulationModelConfig = {
  fiberModel: '',
  edfaModel: '',
  buModel: '',
}

function createDefaultSystemPlanningConfig(): SystemPlanningParams {
  const wdmParams = defaultSystemPlanningParams.wdmParams
  return {
    ...defaultSystemPlanningParams,
    wdmParams: {
      ...wdmParams,
      shapingMoments: wdmParams.shapingMoments ? { ...wdmParams.shapingMoments } : undefined,
      vectorParams: wdmParams.vectorParams ? {
        launchPowerVector: [...wdmParams.vectorParams.launchPowerVector],
        initialAseVector: [...wdmParams.vectorParams.initialAseVector],
        initialNliVector: [...wdmParams.vectorParams.initialNliVector],
      } : undefined,
    },
    spanScanConfig: { ...defaultSystemPlanningParams.spanScanConfig },
  }
}

function restoreSystemPlanningConfig(value: Partial<SystemPlanningParams>): SystemPlanningParams {
  const defaults = createDefaultSystemPlanningConfig()
  const savedWdm = value.wdmParams
  const savedVectors = savedWdm?.vectorParams
  const defaultVectors = defaults.wdmParams.vectorParams
  const vector = (candidate: unknown, fallback: number[] | undefined): number[] =>
    Array.isArray(candidate) ? [...candidate] as number[] : [...(fallback ?? [])]

  return {
    ...defaults,
    ...value,
    wdmParams: {
      ...defaults.wdmParams,
      ...savedWdm,
      shapingMoments: {
        moment4: savedWdm?.shapingMoments?.moment4
          ?? defaults.wdmParams.shapingMoments?.moment4
          ?? 1.32,
        moment6: savedWdm?.shapingMoments?.moment6
          ?? defaults.wdmParams.shapingMoments?.moment6
          ?? 1.96,
      },
      vectorParams: savedVectors ? {
        launchPowerVector: vector(savedVectors.launchPowerVector, defaultVectors?.launchPowerVector),
        initialAseVector: vector(savedVectors.initialAseVector, defaultVectors?.initialAseVector),
        initialNliVector: vector(savedVectors.initialNliVector, defaultVectors?.initialNliVector),
      } : defaultVectors,
    },
    spanScanConfig: {
      ...defaults.spanScanConfig,
      ...value.spanScanConfig,
    },
  }
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
  const systemPlanningConfig = ref<SystemPlanningParams>(createDefaultSystemPlanningConfig())
  // 仿真模型配置 (Step 4)
  const simulationModelConfig = ref<SimulationModelConfig>({ ...defaultSimulationModelConfig })
  
  // ========== USE 文件规范所需字段 ==========
  // 计算模型库 (libraries.models)
  const models = ref<ModelDefinition[]>([])
  // 仿真缓存 (system_engineering.simulation_cache)
  const simulationCache = ref<SimulationCache | null>(null)
  // 系统规划缓存 (system_engineering.system_planning_cache)
  const systemPlanningCache = ref<SystemPlanningCache | null>(null)
  // 平台 fixed / optimized / simulation 查询接口的原始结果。
  // Swagger 未公开 data 内部结构，因此在真实契约明确前保持 unknown。
  const platformPlanningResults = ref<PlatformPlanningResults | null>(null)
  const platformPlanConfigSnapshot = ref<PlanConfigSnapshot | null>(null)
  
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

  let allDeviceLibrariesPromise: {
    sequence: number
    promise: Promise<RespVO<PlanDeviceLibrary[]>>
  } | null = null
  let allDeviceLibrariesLoaded = false
  let deviceLibraryRequestSequence = 0
  let deviceConfigRequestSequence = 0

  const isAllDeviceLibrarySearch = (search: PlanDeviceLibrarySearch = {}) => {
    const { pageNumber, pageSize, ...filters } = search
    const isFirstPage = pageNumber == null || Number(pageNumber) === 1
    const coversDefaultFullPage = pageSize == null || Number(pageSize) >= 1000
    return isFirstPage && coversDefaultFullPage && Object.values(filters).every(value => value == null || value === '')
  }

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
        if (Array.isArray(data.cableTypeDatabase)) cableTypeDatabase.value = data.cableTypeDatabase
        if (data.systemPlanningConfig) {
          systemPlanningConfig.value = restoreSystemPlanningConfig(data.systemPlanningConfig)
        }
        if (data.simulationModelConfig) simulationModelConfig.value = data.simulationModelConfig
        if (Array.isArray(data.models)) models.value = data.models
        if ('simulationCache' in data) simulationCache.value = data.simulationCache
        if ('systemPlanningCache' in data) systemPlanningCache.value = data.systemPlanningCache
        if ('platformPlanningResults' in data) platformPlanningResults.value = data.platformPlanningResults
        if ('platformPlanConfigSnapshot' in data) platformPlanConfigSnapshot.value = data.platformPlanConfigSnapshot
        if ('linkCalcSummaryCache' in data) linkCalcSummaryCache.value = data.linkCalcSummaryCache
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
        cableTypeDatabase: cableTypeDatabase.value,
        systemPlanningConfig: systemPlanningConfig.value,
        simulationModelConfig: simulationModelConfig.value,
        models: models.value,
        simulationCache: simulationCache.value,
        systemPlanningCache: systemPlanningCache.value,
        platformPlanningResults: platformPlanningResults.value,
        platformPlanConfigSnapshot: platformPlanConfigSnapshot.value,
        linkCalcSummaryCache: linkCalcSummaryCache.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // localStorage 保存失败时静默处理
    }
  }

  async function loadPlatformDeviceLibraries(search: PlanDeviceLibrarySearch = {}) {
    const allSearch = isAllDeviceLibrarySearch(search)
    if (allSearch && allDeviceLibrariesPromise?.sequence === deviceLibraryRequestSequence) {
      return allDeviceLibrariesPromise.promise
    }

    const requestSequence = ++deviceLibraryRequestSequence
    deviceLibraryLoading.value = true
    deviceLibrarySyncError.value = null

    const request = (async () => {
      const response = await platformDeviceLibraryApi.search({
        pageNumber: 1,
        pageSize: 1000,
        ...search,
      })
      if (requestSequence === deviceLibraryRequestSequence) {
        const libraries = response.data ?? []
        const dataTotal = Number(response.page?.dataTotal ?? libraries.length)
        platformDeviceLibraries.value = libraries
        allDeviceLibrariesLoaded = allSearch && Number.isFinite(dataTotal) && libraries.length >= dataTotal
        if (platformDeviceLibraries.value.length) currentLibraryFile.value = '平台器件库'
      }
      return response
    })()

    if (allSearch) {
      allDeviceLibrariesPromise = { sequence: requestSequence, promise: request }
    }

    try {
      return await request
    } catch (error) {
      if (requestSequence === deviceLibraryRequestSequence) {
        deviceLibrarySyncError.value = error instanceof Error ? error.message : '器件库加载失败'
      }
      throw error
    } finally {
      if (allSearch && allDeviceLibrariesPromise?.sequence === requestSequence) {
        allDeviceLibrariesPromise = null
      }
      if (requestSequence === deviceLibraryRequestSequence) {
        deviceLibraryLoading.value = false
      }
    }
  }

  async function ensurePlatformDeviceLibrariesLoaded(search: PlanDeviceLibrarySearch = {}) {
    const allSearch = isAllDeviceLibrarySearch(search)
    if (allSearch && allDeviceLibrariesLoaded) return platformDeviceLibraries.value
    if (allSearch && allDeviceLibrariesPromise?.sequence === deviceLibraryRequestSequence) {
      const response = await allDeviceLibrariesPromise.promise
      return response.data ?? []
    }
    const response = await loadPlatformDeviceLibraries(search)
    return response.data ?? []
  }

  async function loadPlatformDeviceConfigs(search: PlanDeviceConfigSearch) {
    const requestSequence = ++deviceConfigRequestSequence
    deviceConfigLoading.value = true
    deviceConfigSyncError.value = null
    try {
      const response = await platformDeviceConfigApi.search({
        pageNumber: 1,
        pageSize: 1000,
        ...search,
      })
      if (requestSequence === deviceConfigRequestSequence) {
        platformDeviceConfigs.value = response.data ?? []
      }
      return response
    } catch (error) {
      if (requestSequence === deviceConfigRequestSequence) {
        deviceConfigSyncError.value = error instanceof Error ? error.message : '器件配置加载失败'
      }
      throw error
    } finally {
      if (requestSequence === deviceConfigRequestSequence) {
        deviceConfigLoading.value = false
      }
    }
  }

  /** 清空当前平台器件配置，避免组件直接修改 store 内部集合。 */
  function clearPlatformDeviceConfigs() {
    deviceConfigRequestSequence += 1
    platformDeviceConfigs.value = []
    deviceConfigLoading.value = false
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
      deviceLibraryRequestSequence += 1
      allDeviceLibrariesPromise = null
      deviceLibraryLoading.value = false
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
      deviceLibraryRequestSequence += 1
      allDeviceLibrariesPromise = null
      deviceLibraryLoading.value = false
      platformDeviceLibraries.value = platformDeviceLibraries.value.filter(item => item.id !== id)
    } catch (error) {
      deviceLibrarySyncError.value = error instanceof Error ? error.message : '器件库删除失败'
      throw error
    } finally {
      deviceLibrarySyncing.value = false
    }
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

  // 更新成本参数 (不保存到 localStorage，只存储在项目文件中)
  function updateCostFactors(updates: Partial<CostFactors>) {
    costFactors.value = { ...costFactors.value, ...updates }
    // 不调用 saveToLocalStorage，成本参数只存储在项目文件中
  }

  function replaceCableTypes(nextCableTypes: CableType[]) {
    cableTypes.value = nextCableTypes
  }

  function replaceModels(nextModels: ModelDefinition[]) {
    models.value = nextModels
  }

  function replacePlatformDeviceConfigs(configs: PlanDeviceConfig[]) {
    deviceConfigRequestSequence += 1
    platformDeviceConfigs.value = configs
    deviceConfigLoading.value = false
  }

  function replacePlatformDeviceLibraries(libraries: PlanDeviceLibrary[]) {
    deviceLibraryRequestSequence += 1
    allDeviceLibrariesPromise = null
    allDeviceLibrariesLoaded = true
    platformDeviceLibraries.value = libraries
    deviceLibraryLoading.value = false
  }

  function replacePlatformDeviceEntities(entities: PlanDeviceEntity[]) {
    platformDeviceEntities.value = entities
  }

  function setTransmissionConfig(config: TransmissionConfig) {
    transmissionConfig.value = config
  }

  function setMonitoringConfig(config: MonitoringConfig) {
    monitoringConfig.value = config
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
    systemPlanningConfig.value = createDefaultSystemPlanningConfig()
    simulationModelConfig.value = { ...defaultSimulationModelConfig }
    simulationCache.value = null
    systemPlanningCache.value = null
    platformDeviceEntities.value = []
    platformPlanningResults.value = null
    platformPlanConfigSnapshot.value = null
    linkCalcSummaryCache.value = null
    saveToLocalStorage()
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

  function updatePlatformPlanningResults(result: PlatformPlanningResults | null) {
    platformPlanningResults.value = result
    saveToLocalStorage()
  }

  function updatePlatformPlanConfigSnapshot(snapshot: PlanConfigSnapshot | null) {
    platformPlanConfigSnapshot.value = snapshot
    saveToLocalStorage()
  }

  // 更新设计视图链路计算摘要缓存
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateLinkCalcSummaryCache(cache: Record<string, any> | null) {
    linkCalcSummaryCache.value = cache
    saveToLocalStorage()
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
    deviceConfigSyncError,
    deviceLibraryLoading,
    deviceLibrarySyncing,
    deviceLibrarySyncError,
    deviceEntityLoading,
    deviceEntitySyncing,
    deviceEntitySyncError,
    loadPlatformDeviceConfigs,
    clearPlatformDeviceConfigs,
    loadPlatformDeviceLibraries,
    ensurePlatformDeviceLibrariesLoaded,
    loadPlatformDeviceLibraryDetail,
    savePlatformDeviceLibrary,
    removePlatformDeviceLibrary,
    loadPlatformDeviceEntities,
    loadPlatformDeviceEntityDetail,
    savePlatformDeviceEntity,
    removePlatformDeviceEntity,
    saveToLocalStorage,
    updateCostFactors,
    replaceCableTypes,
    replaceModels,
    replacePlatformDeviceConfigs,
    replacePlatformDeviceLibraries,
    replacePlatformDeviceEntities,
    setTransmissionConfig,
    setMonitoringConfig,
    resetToDefaults,
    resetProjectSettings,
    updateRoutePlanningConfig,
    updateTransmissionConfig,
    updateMonitoringConfig,
    updateFiberSimulationConfig,
    // 系统规划相关 (Step 3, 4)
    systemPlanningConfig,
    simulationModelConfig,
    updateSystemPlanningConfig,
    updateWDMPlanningParams,
    updateSpanScanConfig,
    updateSimulationModelConfig,
    // USE 文件规范相关
    models,
    simulationCache,
    systemPlanningCache,
    platformPlanningResults,
    platformPlanConfigSnapshot,
    linkCalcSummaryCache,
    updateSimulationCache,
    updateSystemPlanningCache,
    updatePlatformPlanningResults,
    updatePlatformPlanConfigSnapshot,
    updateLinkCalcSummaryCache,
    setCurrentLibraryFile,
  }
})
