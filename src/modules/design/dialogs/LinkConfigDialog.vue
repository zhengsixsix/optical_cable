<script setup lang="ts">
/**
 * 系统规划 - 链路配置对话框
 * 
 * 按甲方需求实现统一的链路配置界面：
 * 1. 选择规划链路
 * 2. 选择性能计算模型
 * 3. 配置光纤器件与模型参数
 * 4. 配置放大器器件与模型参数
 * 5. WDM / 规划参数配置
 * 6. BU参数配置
 */

import { useBUConfigStore, type BUConfigData } from '@/stores/buConfig'
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { ref, computed, watch, reactive, nextTick } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import DeviceDynamicValueForm from '@/components/settings/DeviceDynamicValueForm.vue'
import { useAppStore } from '@/stores/app'
import { 
  X, ChevronRight, ChevronLeft, Check, AlertCircle, 
  MapPin, Cpu, Cable, Radio, Waves, GitBranch, PlayCircle,
  CheckCircle2, ChevronDown, ChevronUp, BarChart2,
  RefreshCw, Plus, Trash2,
  Copy, ClipboardPaste, Upload, Eye,
} from 'lucide-vue-next'
import type { SystemPlanningCache } from '@/types/useFile'
import type { ConnectorElement } from '@/types/connector'
import {
  preferSpecificRouteStationName,
  resolveRouteStationNames,
} from '@/utils/routeStationNames'
import { getSystemDeviceIcon } from '@/utils/systemDesignIcons'
import SystemPlanningResultPanel from '@/modules/design/components/SystemPlanningResultPanel.vue'
import {
  parsePlanningLayoutResult,
  resolveLayoutAmplifiers,
  selectPlanningLayoutResult,
  type PlanningLayoutResult,
} from '@/utils/systemPlanningLayout'
import {
  isSpanWithinBounds,
  resolvePlanningSpanBounds,
} from '@/utils/systemPlanningConstraints'
import { normalizeEqualizerConfig, validateEqualizerConfig } from '@/utils/equalizer'
import {
  isPlatformChannelConfigComplete,
  normalizePlatformSimulationCache,
  runSimulation,
  saveAndVerifyPlanningChannelConfig,
} from '@/services/SimulationApiService'
import type { SpanScanResult, ScanPoint } from '@/services/SimulationApiService'
import {
  platformDeviceConfigApi,
  platformDeviceEntityApi,
  platformPlanConfigApi,
} from '@/services/platform/api'
import type {
  PlanConfigChannel,
  PlanConfigOptimization,
  PlanDeviceConfig,
  PlanDeviceEntity,
  PlatformDictionary,
  SystemPlanningFormSnapshot,
} from '@/services/platform/types'
import {
  deviceValueListToMap,
  normalizeDeviceConfigs,
  resolveDeviceAttributeRows,
} from '@/services/platform/deviceAttributes'
import { platformDeviceEntityToConnectorElement } from '@/services/platform/deviceLibraryMapping'
import {
  applyPlanningTemplateToEntity,
  buildPlanningConnectorEntity,
  buildPlanningTemplateEntity,
  mergePlanningDeviceEntities,
} from '@/services/SystemPlanningDeviceService'
import { getDeviceTypeCodeForCategory } from '@/services/platform/deviceTypeAdapter'
import {
  getDeviceLibrariesByCategory,
  type RuntimeBranchingLibrary,
  type RuntimeEqualizerLibrary,
  toRuntimeBranchingLibrary,
  toRuntimeEqualizerLibrary,
} from '@/services/platform/deviceRuntime'
import { mergePlatformConnectorElements } from '@/utils/platformDeviceEntityMerge'

type NonNullableFields<T> = { [K in keyof T]-?: NonNullable<T[K]> }
type ChannelConfigState = NonNullableFields<Omit<PlanConfigChannel, 'projectId'>>
type OptimizationConfigState = NonNullableFields<Pick<
  PlanConfigOptimization,
  'targetGsnrDb' | 'targetOsnrDb'
>>

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'start-calculation', config: LinkConfig): void
  (e: 'apply-result', result: PlanningResultPayload): void
}>()

// 链路配置输出
interface LinkConfig {
  routeId: string
  fiberModel: string
  amplifierModel: string
  fiberTypeId: string
  fiberParams: Record<string, number>
  amplifierTypeId: string
  amplifierParams: Record<string, number>
  spanStrategy: 'auto' | 'fixed'
  spanKm: number
  optimizationTarget: 'min_amplifiers' | 'max_gsnr'
  optimizationConfig: OptimizationConfigState
  constraints: {
    maxSpanLength: number
    minSpanLength: number
    osnrMargin: number
  }
  channelConfig: ChannelConfigState
  buConfigs: BUConfig[]
}

interface BUConfig {
  id: string
  name: string
  kp: number
  portCount: number
  trunkLoss: number
  branchLoss: number
}

interface PlannedEqualizer {
  tempId: string
  id?: string
  name: string
  kp: number
  componentRefId: string
  equalizerRole: 'T' | 'S'
  attenuationMode: 'adjustable' | 'fixed'
  attenuationDb: number
  specifications: string
  remarks: string
}

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()
const routeStore = useRouteStore()
const connectorStore = useConnectorStore()
const buConfigStore = useBUConfigStore()  // 使用共享的 BU 配置 store
const platformProjectId = computed(() => appStore.projectState.currentProject?.platformProjectId ?? null)

const selectedFmmPathResultIndex = computed(() => {
  const route = routeStore.paretoRoutes.find(item => item.id === selectedRouteId.value)
    || routeStore.selectedRoute
  const zeroBasedIndex = Math.max(0, Math.trunc(route?.algorithmSummary?.originalFmmIndex ?? 0))
  return zeroBasedIndex + 1
})

const platformBranchingLibraries = computed(() =>
  getDeviceLibrariesByCategory(settingsStore.platformDeviceLibraries, 'branching')
    .map(toRuntimeBranchingLibrary)
    .filter((item): item is RuntimeBranchingLibrary => Boolean(item)),
)
const platformEqualizerLibraries = computed(() =>
  getDeviceLibrariesByCategory(settingsStore.platformDeviceLibraries, 'equalizer')
    .map(toRuntimeEqualizerLibrary)
    .filter((item): item is RuntimeEqualizerLibrary => Boolean(item)),
)
// 当前活动步骤
const activeStep = ref<'link' | 'model' | 'fiber' | 'amplifier' | 'wdm' | 'bu' | 'result'>('link')

// 基础步骤配置
const baseSteps = [
  { id: 'link', label: '链路选择', icon: MapPin },
  { id: 'model', label: '计算模型', icon: Cpu },
  { id: 'fiber', label: '光纤配置', icon: Cable },
  { id: 'amplifier', label: '放大器配置', icon: Radio },
  { id: 'wdm', label: 'WDM参数', icon: Waves },
  { id: 'bu', label: 'BU配置', icon: GitBranch },
  { id: 'result', label: '计算结果', icon: BarChart2 }
] as const

type PlanningStepId = typeof baseSteps[number]['id']
type ConfigStepId = Exclude<PlanningStepId, 'result'>
const baseStepOrder: PlanningStepId[] = ['link', 'model', 'fiber', 'amplifier', 'wdm', 'bu', 'result']

const stepDescriptions: Record<PlanningStepId, string> = {
  link: '确认路由与站点拓扑',
  model: '选择性能计算模型',
  fiber: '匹配光纤模型参数',
  amplifier: '配置放大器与跨段策略',
  wdm: '设置 WDM 与信号参数',
  bu: '校验分支单元路径',
  result: '查看布局与性能结果',
}

// 动态步骤配置 - 点对点规划时隐藏 BU 配置
const steps = computed(() => {
  if (!linkInfo.value || linkInfo.value.buCount === 0) {
    return baseSteps.filter(s => s.id !== 'bu')
  }
  return baseSteps
})

const activeStepSubtitle = computed(() => {
  const current = steps.value.find(s => s.id === activeStep.value)
  return current ? stepDescriptions[current.id] : '配置链路参数并启动性能计算'
})

// ============ Step 1: 链路选择 ============
const selectedRouteId = ref('')

const selectedPlanningRoute = computed(() =>
  routeStore.routes.find(route => route.id === selectedRouteId.value)
    || routeStore.paretoRoutes.find(route => route.id === selectedRouteId.value)
    || null,
)

const routeOptions = computed(() => 
  routeStore.routes
    .filter(r => r.id) // 过滤空 id
    .map(r => {
      const stations = resolveRouteStationNames(r, settingsStore.routePlanningConfig)
      const routeLabel = `${stations.startName || '起点'} ⇄ ${stations.endName || '终点'}`
      return {
        value: r.id,
        label: r.name && r.name !== routeLabel ? `${routeLabel} · ${r.name}` : routeLabel,
      }
    })
)

// 同步当前路由到 routeStore（保证 routeStore.selectedRoute 可用）
watch(selectedRouteId, (id) => {
  routeStore.selectRoute(id || null)
  connectorStore.selectTableByRoute(id || null)
})

const routeConnectorElements = computed(() =>
  connectorStore.getElementsForRoute(selectedRouteId.value || routeStore.currentRouteId || null)
)

const equalizerTypeOptions = computed(() =>
  platformEqualizerLibraries.value
    .filter(type => type.id)
    .map(type => ({ value: type.id, label: type.name }))
)

const equalizerRoleOptions = [
  { value: 'T', label: 'T' },
  { value: 'S', label: 'S' },
]

const equalizerModeOptions = [
  { value: 'adjustable', label: '可调' },
  { value: 'fixed', label: 'F-ATT' },
]

let plannedEqualizerSeed = 0
const plannedEqualizers = ref<PlannedEqualizer[]>([])

const createPlannedEqualizer = (overrides: Partial<PlannedEqualizer> = {}): PlannedEqualizer => {
  const defaultType = platformEqualizerLibraries.value.find(type => type.id === overrides.componentRefId) || platformEqualizerLibraries.value[0]
  const normalized = normalizeEqualizerConfig({
    equalizerRole: overrides.equalizerRole,
    attenuationMode: overrides.attenuationMode ?? defaultType?.attenuationMode,
    attenuationDb: overrides.attenuationDb ?? defaultType?.defaultAttenuationDb ?? 0,
  })

  return {
    tempId: overrides.tempId || `eq-plan-${Date.now()}-${plannedEqualizerSeed++}`,
    id: overrides.id,
    name: overrides.name || `EQ-${String(plannedEqualizers.value.length + 1).padStart(2, '0')}`,
    kp: overrides.kp ?? 0,
    componentRefId: overrides.componentRefId || defaultType?.id || '',
    equalizerRole: normalized.equalizerRole,
    attenuationMode: normalized.attenuationMode,
    attenuationDb: normalized.attenuationDb,
    specifications: overrides.specifications || defaultType?.name || '均衡器',
    remarks: overrides.remarks || '系统规划均衡器落位',
  }
}
const loadPlannedEqualizers = () => {
  const existing = routeConnectorElements.value
    .filter(element => element.type === 'equalizer')
    .sort((a, b) => a.kp - b.kp)
    .map(element => createPlannedEqualizer({
      tempId: `eq-existing-${element.id}`,
      id: element.id,
      name: element.name,
      kp: element.kp,
      componentRefId: element.componentRefId || '',
      equalizerRole: element.equalizerRole || 'T',
      attenuationMode: element.attenuationMode || 'adjustable',
      attenuationDb: element.attenuationDb ?? 0,
      specifications: element.specifications || '',
      remarks: element.remarks || '系统规划均衡器落位',
    }))

  plannedEqualizers.value = existing
}

const addPlannedEqualizer = () => {
  if (platformEqualizerLibraries.value.length === 0) {
    return
  }

  plannedEqualizers.value.push(createPlannedEqualizer({ kp: 0 }))
}

const removePlannedEqualizer = (tempId: string) => {
  plannedEqualizers.value = plannedEqualizers.value.filter(item => item.tempId !== tempId)
}

const validatePlannedEqualizers = () => {
  for (let index = 0; index < plannedEqualizers.value.length; index++) {
    const equalizer = plannedEqualizers.value[index]
    if (!equalizer.name.trim()) {
      return `请填写第 ${index + 1} 个均衡器名称`
    }
    const validationMessage = validateEqualizerConfig(equalizer)
    if (validationMessage) {
      return `${equalizer.name || `均衡器${index + 1}`}: ${validationMessage}`
    }
  }
  return null
}
watch(
  () => [props.visible, selectedRouteId.value, connectorStore.currentTableId],
  ([visible]) => {
    if (!visible) return
    void nextTick(() => {
      loadPlannedEqualizers()
    })
  }
)

interface PlanningRouteBu {
  id: string
  name: string
}

// 链路预览严格读取路由规划结果，只展示其中明确标记的 BU。
const planningRouteBus = computed<PlanningRouteBu[]>(() => {
  const route = selectedPlanningRoute.value
  if (!route) return []

  return route.points.flatMap((point, index): PlanningRouteBu[] =>
    point.type === 'branching'
      ? [{ id: point.id, name: point.name?.trim() || `BU-${index + 1}` }]
      : [],
  )
})

const formatRouteCreatedAt = (value: unknown): string => {
  if (value == null || value === '') return '-'
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('zh-CN')
}

// 链路基本信息只读取当前选中的路由规划结果。
const linkInfo = computed(() => {
  const route = selectedPlanningRoute.value
  if (!route) return null

  const routePoints = route.points
  const routeLandingPoints = route.points.filter(point => point.type === 'landing')
  const configuredStations = resolveRouteStationNames(route, settingsStore.routePlanningConfig)
  const routeStartPoint = routeLandingPoints[0] || routePoints[0]
  const routeEndPoint = routeLandingPoints[routeLandingPoints.length - 1]
    || routePoints[routePoints.length - 1]

  const startStation = preferSpecificRouteStationName(
    configuredStations.startName,
    configuredStations.startPoint?.name,
    routeStartPoint?.name,
    '起点',
  )
  const endStation = preferSpecificRouteStationName(
    configuredStations.endName,
    configuredStations.endPoint?.name,
    routeEndPoint?.name,
    '终点',
  )

  const totalLen = [route.totalLength, route.distance]
    .find(value => typeof value === 'number' && Number.isFinite(value) && value > 0) ?? null
  const bus = planningRouteBus.value
  
  return {
    name: `${startStation} ⇄ ${endStation}`,
    routeName: route.name,
    totalLength: totalLen,
    trunkLength: totalLen,
    startStation,
    endStation,
    branchLandings: [],
    buCount: bus.length,
    buNames: bus.map(item => item.name).join(', ') || '无',
    createdAt: formatRouteCreatedAt(route.createdAt),
  }
})

const haversineDistanceKm = (
  left: [number, number],
  right: [number, number],
): number => {
  const radians = (value: number) => value * Math.PI / 180
  const [leftLon, leftLat] = left
  const [rightLon, rightLat] = right
  const latitudeDelta = radians(rightLat - leftLat)
  const longitudeDelta = radians(rightLon - leftLon)
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(leftLat)) * Math.cos(radians(rightLat))
    * Math.sin(longitudeDelta / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
}

const routePolyline = (): Array<[number, number]> => {
  const route = selectedPlanningRoute.value
  if (!route) return []
  const raw = route.rawTrunkCoordinates?.filter(point =>
    Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite),
  ) ?? []
  if (raw.length >= 2) return raw
  return route.points
    .map(point => point.coordinates)
    .filter(point => point.length >= 2 && point.every(Number.isFinite))
}

const coordinateAtRouteKp = (kp: number): [number, number] => {
  const coordinates = routePolyline()
  if (coordinates.length === 0) return [0, 0]
  if (coordinates.length === 1) return coordinates[0]
  const cumulative = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineDistanceKm(coordinates[index - 1], coordinates[index]))
  }
  const geometryLength = cumulative[cumulative.length - 1]
  if (geometryLength <= 0) return coordinates[0]
  const plannedLength = linkInfo.value?.totalLength ?? geometryLength
  const target = Math.min(geometryLength, Math.max(0, kp) / Math.max(plannedLength, 1e-9) * geometryLength)
  const segmentIndex = cumulative.findIndex(distance => distance >= target)
  if (segmentIndex <= 0) return coordinates[0]
  const startDistance = cumulative[segmentIndex - 1]
  const endDistance = cumulative[segmentIndex]
  const ratio = endDistance === startDistance ? 0 : (target - startDistance) / (endDistance - startDistance)
  const start = coordinates[segmentIndex - 1]
  const end = coordinates[segmentIndex]
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
  ]
}

const routePointKp = (pointIndex: number): number => {
  const route = selectedPlanningRoute.value
  if (!route || pointIndex <= 0) return 0
  const pointCoordinates = route.points.map(point => point.coordinates)
  const distances = pointCoordinates.slice(1).map((point, index) =>
    haversineDistanceKm(pointCoordinates[index], point),
  )
  const total = distances.reduce((sum, value) => sum + value, 0)
  const partial = distances.slice(0, pointIndex).reduce((sum, value) => sum + value, 0)
  const plannedLength = linkInfo.value?.totalLength
  return total > 0 && plannedLength != null ? partial / total * plannedLength : partial
}

/** Ensure route stations and BUs have stable connector records before configuration. */
const ensureRouteTopologyConnectorElements = (): void => {
  const route = selectedPlanningRoute.value
  if (!route) return
  const routeId = selectedRouteId.value || route.id
  if (!connectorStore.selectTableByRoute(routeId)) {
    connectorStore.createTable(`${route.name || linkInfo.value?.name || '系统规划'}_接线元表`, routeId)
  }
  const table = connectorStore.currentTable
  if (!table) return

  route.points.forEach((point, pointIndex) => {
    if (point.type !== 'landing' && point.type !== 'branching') return
    const existing = table.elements.find(element => element.routePointId === point.id)
    if (existing) return
    const [longitude, latitude] = point.coordinates
    const type: ConnectorElement['type'] = point.type === 'branching'
      ? 'bu'
      : Number(point.depth ?? 0) > 0 ? 'underwater' : 'landing'
    const runtimeBu = point.type === 'branching'
      ? platformBranchingLibraries.value.find(item => item.id === point.device?.deviceId)
      : null
    const connectorId = connectorStore.addElement({
      routePointId: point.id,
      deviceTypeCd: point.type === 'branching' ? planningDeviceTypeCodeForTopology.branching : undefined,
      name: point.name?.trim() || (point.type === 'branching' ? `BU-${pointIndex + 1}` : `站点-${pointIndex + 1}`),
      type,
      kp: routePointKp(pointIndex),
      hasExplicitKp: true,
      longitude,
      latitude,
      depth: Number(point.depth ?? 0),
      status: 'planned',
      specifications: point.device?.deviceName || runtimeBu?.name || '',
      remarks: '由路由规划节点生成',
      componentRefId: point.device?.deviceId || runtimeBu?.id,
      buPortCount: point.device?.portCount ?? runtimeBu?.portCount,
      buTrunkLoss: point.device?.insertionLoss ?? runtimeBu?.trunkInsertionLoss,
      buBranchLoss: point.device?.insertionLoss ?? runtimeBu?.branchInsertionLoss,
    })
    if (!connectorId || point.type !== 'branching') return
    const element = connectorStore.elements.find(item => item.id === connectorId)
    if (!element) return
    buConfigStore.updateConfig(connectorId, {
      componentRefId: element.componentRefId || '',
      buTrunkLoss: element.buTrunkLoss ?? 0,
      buBranchLoss: element.buBranchLoss ?? 0,
    })
  })
}

const planningDeviceTypeCodeForTopology = {
  branching: getDeviceTypeCodeForCategory('branching'),
  equalizer: getDeviceTypeCodeForCategory('equalizer'),
}

interface PlanningTopologyNode {
  id: string
  name: string
  kind: 'station' | 'bu'
  role: string
}

const linkTopologyNodes = computed<PlanningTopologyNode[]>(() => {
  const info = linkInfo.value
  if (!info) return []

  return [
    { id: 'route-start', name: info.startStation, kind: 'station', role: '起点站' },
    ...planningRouteBus.value.map(item => ({
      id: `route-bu-${item.id}`,
      name: item.name,
      kind: 'bu' as const,
      role: '分支单元',
    })),
    { id: 'route-end', name: info.endStation, kind: 'station', role: '终点站' },
  ]
})

const topologyTrackWidth = computed(() =>
  `${Math.max(520, linkTopologyNodes.value.length * 150)}px`,
)

// ============ Step 2: 计算模型选择 ============
const selectedFiberModel = ref('')
const selectedAmplifierModel = ref('')
const hydratingPlanningForm = ref(false)

// SSFM 专用参数
const ssfmParams = reactive({
  stepSize: 100,       // 步长 (m)
  samplePoints: 4096,  // 采样点数
  maxIterations: 1000, // 最大迭代次数
})

type CalculationModelOption = { value: string; label: string; desc: string }

const toCalculationModelOptions = (items: PlatformDictionary[]): CalculationModelOption[] =>
  items
    .filter(item => item.isValidCd !== '0')
    .map(item => {
      const value = String(item.code ?? '').trim()
      return {
        value,
        label: item.name?.trim() || value,
        desc: item.detail?.trim() || '',
        sortNum: Number(item.sortNum ?? Number.MAX_SAFE_INTEGER),
      }
    })
    .filter(item => item.value)
    .sort((left, right) => left.sortNum - right.sortNum || left.value.localeCompare(right.value))
    .map(({ value, label, desc }) => ({ value, label, desc }))

const fiberModelOptions = ref<CalculationModelOption[]>([])
const fiberModelLoading = ref(false)
const fiberModelLoaded = ref(false)
const fiberModelError = ref('')
let fiberModelRequestSequence = 0

const amplifierModelOptions = ref<CalculationModelOption[]>([])
const amplifierModelLoading = ref(false)
const amplifierModelLoaded = ref(false)
const amplifierModelError = ref('')
let amplifierModelRequestSequence = 0

const loadFiberCalculationModels = async (): Promise<void> => {
  const requestSequence = ++fiberModelRequestSequence
  fiberModelLoading.value = true
  fiberModelLoaded.value = false
  fiberModelError.value = ''
  fiberModelOptions.value = []

  try {
    const response = await dictionaryStore.searchDictionary({
      pageNumber: 1,
      pageSize: 10,
      type: PLATFORM_DICTIONARY_TYPES.fiberCalculationModel,
    })
    if (requestSequence !== fiberModelRequestSequence || !props.visible) return

    fiberModelOptions.value = toCalculationModelOptions(response.data ?? [])
    fiberModelLoaded.value = true
  } catch (error) {
    if (requestSequence !== fiberModelRequestSequence) return
    fiberModelError.value = error instanceof Error ? error.message : '光纤计算模型加载失败'
  } finally {
    if (requestSequence === fiberModelRequestSequence) fiberModelLoading.value = false
  }
}

const loadAmplifierCalculationModels = async (): Promise<void> => {
  const requestSequence = ++amplifierModelRequestSequence
  amplifierModelLoading.value = true
  amplifierModelLoaded.value = false
  amplifierModelError.value = ''
  amplifierModelOptions.value = []

  try {
    const response = await dictionaryStore.searchDictionary({
      pageNumber: 1,
      pageSize: 10,
      type: PLATFORM_DICTIONARY_TYPES.amplifierCalculationModel,
    })
    if (requestSequence !== amplifierModelRequestSequence || !props.visible) return

    amplifierModelOptions.value = toCalculationModelOptions(response.data ?? [])
    amplifierModelLoaded.value = true
  } catch (error) {
    if (requestSequence !== amplifierModelRequestSequence) return
    amplifierModelError.value = error instanceof Error ? error.message : '放大器计算模型加载失败'
  } finally {
    if (requestSequence === amplifierModelRequestSequence) amplifierModelLoading.value = false
  }
}

// ============ Step 3: 光纤配置 ============
type PlanningDeviceKind = 'fiber' | 'amplifier'
type DynamicDeviceValues = Record<string, string>

const planningDeviceTypeCode: Record<PlanningDeviceKind, string> = {
  fiber: getDeviceTypeCodeForCategory('fiber'),
  amplifier: getDeviceTypeCodeForCategory('amplifier'),
}

const selectedFiberTypeId = ref('')
const selectedAmplifierTypeId = ref('')
const fiberDeviceEntities = ref<PlanDeviceEntity[]>([])
const amplifierDeviceEntities = ref<PlanDeviceEntity[]>([])
const fiberDeviceConfigs = ref<PlanDeviceConfig[]>([])
const amplifierDeviceConfigs = ref<PlanDeviceConfig[]>([])
const fiberDeviceValues = ref<DynamicDeviceValues>({})
const amplifierDeviceValues = ref<DynamicDeviceValues>({})
const deviceEntityLoading = reactive<Record<PlanningDeviceKind, boolean>>({ fiber: false, amplifier: false })
const deviceConfigLoading = reactive<Record<PlanningDeviceKind, boolean>>({ fiber: false, amplifier: false })
const deviceEntityErrors = reactive<Record<PlanningDeviceKind, string>>({ fiber: '', amplifier: '' })
const deviceConfigErrors = reactive<Record<PlanningDeviceKind, string>>({ fiber: '', amplifier: '' })
const deviceEntityRequestSequence: Record<PlanningDeviceKind, number> = { fiber: 0, amplifier: 0 }
const deviceConfigRequestSequence: Record<PlanningDeviceKind, number> = { fiber: 0, amplifier: 0 }
const initializingPlanningDevices = ref(false)
let planningDeviceInitializationSequence = 0

// 兼容现有仿真请求结构；数值只从动态属性定义及实体值中映射，不提供前端默认值。
const fiberParams = reactive<Record<string, number>>({
  attenuation: Number.NaN,
  effectiveArea: Number.NaN,
  dispersion: Number.NaN,
  dispersionSlope: Number.NaN,
  nonlinearIndex: Number.NaN,
  nonlinearCoeff: Number.NaN,
})

const amplifierParams = reactive<Record<string, number>>({
  gain: Number.NaN,
  noiseFigure: Number.NaN,
  maxOutputPower: Number.NaN,
  saturationPower: Number.NaN,
})

const normalizeDeviceField = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const fiberParamByDeviceField: Record<string, keyof typeof fiberParams> = {
  attenuation: 'attenuation',
  attenuationcoeff: 'attenuation',
  attenuationdbperkm: 'attenuation',
  alpha: 'attenuation',
  effectivearea: 'effectiveArea',
  effectiveareaum2: 'effectiveArea',
  aeff: 'effectiveArea',
  dispersion: 'dispersion',
  dispersiond: 'dispersion',
  dispersioncoeffpspernmkm: 'dispersion',
  dispersionslope: 'dispersionSlope',
  dispersionslopepspernm2km: 'dispersionSlope',
  nonlinearindex: 'nonlinearIndex',
  nonlinearrefractiveindex: 'nonlinearIndex',
  n2: 'nonlinearIndex',
  nonlinearcoeff: 'nonlinearCoeff',
  nonlinearcoeffperwperkm: 'nonlinearCoeff',
  gamma: 'nonlinearCoeff',
}

const amplifierParamByDeviceField: Record<string, keyof typeof amplifierParams> = {
  gain: 'gain',
  gaindb: 'gain',
  nominalgaindb: 'gain',
  ratedgain: 'gain',
  noisefigure: 'noiseFigure',
  noisefiguredb: 'noiseFigure',
  nf: 'noiseFigure',
  maxoutputpower: 'maxOutputPower',
  maxoutputpowerdbm: 'maxOutputPower',
  outputpower: 'maxOutputPower',
  outputpowerdbm: 'maxOutputPower',
  saturationpower: 'saturationPower',
  saturationpowerdbm: 'saturationPower',
}

const dynamicValueList = (values: DynamicDeviceValues) =>
  Object.entries(values).map(([configCode, value]) => ({ configCode, value }))

const syncLegacyParams = (
  type: PlanningDeviceKind,
  configs: PlanDeviceConfig[],
  values: DynamicDeviceValues,
): void => {
  const target = type === 'fiber' ? fiberParams : amplifierParams
  Object.keys(target).forEach(key => { target[key] = Number.NaN })
  const fieldMap = type === 'fiber' ? fiberParamByDeviceField : amplifierParamByDeviceField
  const rows = resolveDeviceAttributeRows(configs, undefined, dynamicValueList(values))

  rows.forEach(row => {
    const targetKey = [row.configCode, row.algorithmField]
      .map(normalizeDeviceField)
      .map(field => fieldMap[field])
      .find(Boolean)
    if (!targetKey || row.value.trim() === '') return
    const number = Number(row.value)
    if (Number.isFinite(number)) target[targetKey] = number
  })
}

const sortPlanningDeviceEntities = (entities: PlanDeviceEntity[]): PlanDeviceEntity[] =>
  [...entities].sort((left, right) => {
    const sortDifference = Number(left.sortNum ?? Number.MAX_SAFE_INTEGER)
      - Number(right.sortNum ?? Number.MAX_SAFE_INTEGER)
    if (Number.isFinite(sortDifference) && sortDifference !== 0) return sortDifference
    return String(left.id ?? '').localeCompare(String(right.id ?? ''))
  })

const planningDeviceOptionLabel = (entity: PlanDeviceEntity): string => {
  const name = String(entity.name || entity.typeName || entity.id || '未命名器件')
  const position = Number(entity.positionKm)
  return Number.isFinite(position) ? `${name} · KP ${position} km` : name
}

const fiberTypeOptions = computed(() =>
  fiberDeviceEntities.value
    .filter(entity => entity.id != null && entity.id !== '')
    .map(entity => ({ value: String(entity.id), label: planningDeviceOptionLabel(entity) })),
)

const amplifierTypeOptions = computed(() =>
  amplifierDeviceEntities.value
    .filter(entity => entity.id != null && entity.id !== '')
    .map(entity => ({ value: String(entity.id), label: planningDeviceOptionLabel(entity) })),
)

const selectedFiberEntity = computed(() =>
  fiberDeviceEntities.value.find(entity => String(entity.id) === selectedFiberTypeId.value) ?? null,
)

const selectedAmplifierEntity = computed(() =>
  amplifierDeviceEntities.value.find(entity => String(entity.id) === selectedAmplifierTypeId.value) ?? null,
)

const replacePlanningDeviceEntities = (type: PlanningDeviceKind, entities: PlanDeviceEntity[]): void => {
  if (type === 'fiber') fiberDeviceEntities.value = sortPlanningDeviceEntities(entities)
  else amplifierDeviceEntities.value = sortPlanningDeviceEntities(entities)
}

const loadPlanningDeviceEntities = async (type: PlanningDeviceKind): Promise<void> => {
  const projectId = platformProjectId.value
  const requestSequence = ++deviceEntityRequestSequence[type]
  deviceEntityLoading[type] = true
  deviceEntityErrors[type] = ''
  replacePlanningDeviceEntities(type, [])

  if (projectId == null || projectId === '') {
    deviceEntityErrors[type] = '当前工程未关联平台项目，无法读取项目器件'
    deviceEntityLoading[type] = false
    return
  }

  try {
    const response = await platformDeviceEntityApi.search({
      pageNumber: 1,
      pageSize: 1000,
      projectId,
      deviceTypeCd: planningDeviceTypeCode[type],
    })
    if (requestSequence !== deviceEntityRequestSequence[type]) return
    replacePlanningDeviceEntities(type, response.data ?? [])
  } catch (error) {
    if (requestSequence !== deviceEntityRequestSequence[type]) return
    deviceEntityErrors[type] = error instanceof Error ? error.message : '项目器件加载失败'
  } finally {
    if (requestSequence === deviceEntityRequestSequence[type]) deviceEntityLoading[type] = false
  }
}

const loadPlanningDeviceConfigs = async (
  type: PlanningDeviceKind,
  selectedEntityId: string,
  restoredValues: DynamicDeviceValues = {},
): Promise<void> => {
  const requestSequence = ++deviceConfigRequestSequence[type]
  const entities = type === 'fiber' ? fiberDeviceEntities.value : amplifierDeviceEntities.value
  const entity = entities.find(item => String(item.id) === selectedEntityId)
  const initialValues = entity
    ? { ...deviceValueListToMap(entity.deviceValueList), ...restoredValues }
    : {}

  if (type === 'fiber') {
    fiberDeviceConfigs.value = []
    fiberDeviceValues.value = initialValues
  } else {
    amplifierDeviceConfigs.value = []
    amplifierDeviceValues.value = initialValues
  }
  deviceConfigErrors[type] = ''
  if (!selectedEntityId || !entity) {
    deviceConfigLoading[type] = false
    syncLegacyParams(type, [], initialValues)
    return
  }

  deviceConfigLoading[type] = true
  try {
    const response = await platformDeviceConfigApi.search({
      pageNumber: 1,
      pageSize: 1000,
      deviceTypeCd: planningDeviceTypeCode[type],
    })
    if (requestSequence !== deviceConfigRequestSequence[type]) return
    const configs = normalizeDeviceConfigs(response.data ?? [])
    if (type === 'fiber') fiberDeviceConfigs.value = configs
    else amplifierDeviceConfigs.value = configs
    syncLegacyParams(type, configs, initialValues)
  } catch (error) {
    if (requestSequence !== deviceConfigRequestSequence[type]) return
    deviceConfigErrors[type] = error instanceof Error ? error.message : '器件动态属性加载失败'
  } finally {
    if (requestSequence === deviceConfigRequestSequence[type]) deviceConfigLoading[type] = false
  }
}

const updateFiberDeviceValues = (values: DynamicDeviceValues): void => {
  fiberDeviceValues.value = values
  syncLegacyParams('fiber', fiberDeviceConfigs.value, values)
}

const updateAmplifierDeviceValues = (values: DynamicDeviceValues): void => {
  amplifierDeviceValues.value = values
  syncLegacyParams('amplifier', amplifierDeviceConfigs.value, values)
}

watch(selectedFiberTypeId, selectedEntityId => {
  if (!props.visible || initializingPlanningDevices.value || hydratingPlanningForm.value) return
  void loadPlanningDeviceConfigs('fiber', selectedEntityId)
})

watch(selectedAmplifierTypeId, selectedEntityId => {
  if (!props.visible || initializingPlanningDevices.value || hydratingPlanningForm.value) return
  void loadPlanningDeviceConfigs('amplifier', selectedEntityId)
})

// ============ Step 4: 放大器配置 ============

// Span 布局策略
const spanStrategy = ref<'auto' | 'fixed'>('auto')
const spanKm = ref(70)

// Span 扫描范围配置（auto 模式）
const spanScanConfig = reactive({
  min: 40,
  max: 120,
  step: 5
})

// 优化目标
const optimizationTarget = ref<'min_amplifiers' | 'max_gsnr'>('min_amplifiers')

const optimizationConfig = reactive<OptimizationConfigState>({
  targetGsnrDb: 14,
  targetOsnrDb: 16,
})

// 约束条件
const constraints = reactive({
  maxSpanLength: 100,
  minSpanLength: 30,
  osnrMargin: 1.0
})

const resolveCurrentSpanBounds = () => resolvePlanningSpanBounds({
  mode: spanStrategy.value === 'fixed' ? 'fixed' : 'scan',
  scanRange: spanStrategy.value === 'auto'
    ? {
        min: finiteNumberValue(spanScanConfig.min, 0),
        max: finiteNumberValue(spanScanConfig.max, 0),
      }
    : undefined,
  minSpanLength: finiteNumberValue(constraints.minSpanLength, 0),
  maxSpanLength: finiteNumberValue(constraints.maxSpanLength, 0),
})

// ============ Step 5: WDM 参数配置 ============
const channelConfig = reactive<ChannelConfigState>({
  channelCount: 96,
  baudRateGbaud: 64,
  modulationFormat: '16QAM',
  launchPowerDbm: Array(96).fill(-1.5),
  channelFrequenciesThz: [],
  initialAseNoiseDbm: -90,
  initialNliNoiseDbm: -90,
  centerFrequencyThz: 193.1,
  channelSpacingGhz: 50,
})

const modulationOptions = [
  { value: 'QPSK', label: 'QPSK' },
  { value: '8QAM', label: '8QAM' },
  { value: '16QAM', label: '16QAM' },
  { value: '32QAM', label: '32QAM' },
  { value: '64QAM', label: '64QAM' }
]

// 入纤功率配置
const launchPowerMode = ref<'uniform' | 'grouped' | 'per_channel' | 'import'>('uniform')
const launchPowerGroups = reactive({ lower: -1.5, center: -1, upper: -1.5 })
const launchPowerImportRef = ref<HTMLInputElement | null>(null)
const uniformLaunchPower = computed({
  get: () => channelConfig.launchPowerDbm?.[0] ?? -1.5,
  set: (value: number) => {
    channelConfig.launchPowerDbm = Array(normalizeChannelCount(channelConfig.channelCount) ?? 1).fill(value)
  },
})
const showPerChannelConfig = ref(false)
const hydratingChannelConfig = ref(false)

// 初始化逐信道功率
watch(
  () => [channelConfig.channelCount, channelConfig.centerFrequencyThz, channelConfig.channelSpacingGhz] as const,
  ([count]) => {
    if (hydratingChannelConfig.value) return
    const normalizedCount = normalizeChannelCount(count)
    if (normalizedCount == null) return
    if (channelConfig.launchPowerDbm?.length !== normalizedCount) {
      channelConfig.launchPowerDbm = Array(normalizedCount).fill(uniformLaunchPower.value)
    }
  },
  { immediate: true, flush: 'sync' },
)

const getChannelFrequency = (index: number) => {
  const frequency = channelConfig.channelFrequenciesThz?.[index]
  return typeof frequency === 'number' && Number.isFinite(frequency) ? frequency.toFixed(3) : '-'
}

// 批量填充功率
const fillAllPowers = () => {
  channelConfig.launchPowerDbm = Array(normalizeChannelCount(channelConfig.channelCount) ?? 1).fill(uniformLaunchPower.value)
}

const applyGroupedPowers = (): void => {
  const count = normalizeChannelCount(channelConfig.channelCount)
  if (count == null) return
  channelConfig.launchPowerDbm = Array.from({ length: count }, (_, index) => {
    const groupIndex = Math.min(2, Math.floor(index * 3 / count))
    return [launchPowerGroups.lower, launchPowerGroups.center, launchPowerGroups.upper][groupIndex]
  })
}

const launchPowerPreview = computed(() => {
  const values = channelConfig.launchPowerDbm.slice(0, 3).map(value => Number(value).toFixed(1))
  return `[${values.join(', ')}${channelConfig.launchPowerDbm.length > 3 ? ', ...' : ''}]`
})

watch(
  () => [
    launchPowerMode.value,
    channelConfig.channelCount,
    launchPowerGroups.lower,
    launchPowerGroups.center,
    launchPowerGroups.upper,
  ] as const,
  ([mode]) => {
    if (mode === 'grouped') applyGroupedPowers()
  },
)

const parseLaunchPowerText = (text: string): number[] => {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown
    const source = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).launchPowerDbm)
        ? (parsed as Record<string, unknown>).launchPowerDbm as unknown[]
        : []
    return source.map(value => Number(value)).filter(value => Number.isFinite(value))
  }

  return trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const values = line.split(/[,;\t]/).map(value => Number(value.trim())).filter(Number.isFinite)
      return values.length > 0 ? [values[values.length - 1]] : []
    })
}

const applyImportedLaunchPowers = (values: number[]): void => {
  const count = normalizeChannelCount(channelConfig.channelCount)
  if (count == null || values.length !== count) {
    throw new Error(`导入数据需要包含 ${count ?? 0} 个功率值，当前识别到 ${values.length} 个`)
  }
  channelConfig.launchPowerDbm = values
  launchPowerMode.value = 'per_channel'
  showPerChannelConfig.value = true
}

const copyLaunchPowers = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(channelConfig.launchPowerDbm))
    appStore.showNotification({ type: 'success', message: '入纤功率已复制到剪贴板' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `复制失败：${error instanceof Error ? error.message : String(error)}` })
  }
}

const pasteLaunchPowers = async (): Promise<void> => {
  try {
    applyImportedLaunchPowers(parseLaunchPowerText(await navigator.clipboard.readText()))
    appStore.showNotification({ type: 'success', message: '已从剪贴板载入逐信道功率' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `粘贴失败：${error instanceof Error ? error.message : String(error)}` })
  }
}

const importLaunchPowerFile = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    applyImportedLaunchPowers(parseLaunchPowerText(await file.text()))
    appStore.showNotification({ type: 'success', message: `已导入 ${file.name}` })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `导入失败：${error instanceof Error ? error.message : String(error)}` })
  } finally {
    input.value = ''
  }
}

// 初始性能参数
const initialAseMode = ref<'default' | 'custom'>('default')
const initialNliMode = ref<'default' | 'custom'>('default')

watch(initialAseMode, mode => {
  if (mode === 'default') channelConfig.initialAseNoiseDbm = -90
  else if (channelConfig.initialAseNoiseDbm === -90) channelConfig.initialAseNoiseDbm = -80
})
watch(initialNliMode, mode => {
  if (mode === 'default') channelConfig.initialNliNoiseDbm = -90
  else if (channelConfig.initialNliNoiseDbm === -90) channelConfig.initialNliNoiseDbm = -80
})

const platformConfigSaving = ref(false)

function normalizeChannelCount(value: unknown): number | null {
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(count) || count < 1 || count > 4096) return null
  return count
}

function finiteNumberValue(value: unknown, fallback: number): number {
  if (typeof value === 'string' && value.trim() === '') return fallback
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function setChannelConfig(config: Omit<PlanConfigChannel, 'projectId'> | null): void {
  if (!config) return
  hydratingChannelConfig.value = true
  Object.assign(channelConfig, Object.fromEntries(
    Object.entries(config).filter(([, value]) => value != null),
  ))
  hydratingChannelConfig.value = false
  const count = normalizeChannelCount(channelConfig.channelCount) ?? 1
  if (!Array.isArray(channelConfig.launchPowerDbm) || channelConfig.launchPowerDbm.length !== count) {
    const fallbackPower = channelConfig.launchPowerDbm?.[0] ?? -1.5
    channelConfig.launchPowerDbm = Array(count).fill(fallbackPower)
  }
  if (!Array.isArray(channelConfig.channelFrequenciesThz)) channelConfig.channelFrequenciesThz = []
  const launchPowerDbm = channelConfig.launchPowerDbm
  launchPowerMode.value = launchPowerDbm.length > 0 && launchPowerDbm.every(value => value === launchPowerDbm[0])
    ? 'uniform'
    : 'per_channel'
  initialAseMode.value = channelConfig.initialAseNoiseDbm === -90 ? 'default' : 'custom'
  initialNliMode.value = channelConfig.initialNliNoiseDbm === -90 ? 'default' : 'custom'
}

function setOptimizationConfig(config: Omit<PlanConfigOptimization, 'projectId'> | null): void {
  if (!config) return
  optimizationConfig.targetGsnrDb = finiteNumberValue(config.targetGsnrDb, optimizationConfig.targetGsnrDb)
  optimizationConfig.targetOsnrDb = finiteNumberValue(config.targetOsnrDb, optimizationConfig.targetOsnrDb)
  constraints.osnrMargin = finiteNumberValue(config.osnrMarginDb, constraints.osnrMargin)
  spanScanConfig.min = finiteNumberValue(config.spanMinKm, spanScanConfig.min)
  spanScanConfig.max = finiteNumberValue(config.spanMaxKm, spanScanConfig.max)
  spanScanConfig.step = finiteNumberValue(config.spanStepKm, spanScanConfig.step)
  constraints.minSpanLength = finiteNumberValue(config.minSpanLimitKm, constraints.minSpanLength)
  constraints.maxSpanLength = finiteNumberValue(config.maxSpanLimitKm, constraints.maxSpanLength)
  if (config.optimizationTarget === 'max_gsnr') optimizationTarget.value = 'max_gsnr'
  if (config.optimizationTarget === 'min_amp') optimizationTarget.value = 'min_amplifiers'
}

function buildPlatformOptimizationConfig(): Omit<PlanConfigOptimization, 'projectId'> {
  return {
    targetGsnrDb: finiteNumberValue(optimizationConfig.targetGsnrDb, 14),
    targetOsnrDb: finiteNumberValue(optimizationConfig.targetOsnrDb, 16),
    osnrMarginDb: Math.max(0, finiteNumberValue(constraints.osnrMargin, 1)),
    spanMinKm: finiteNumberValue(spanScanConfig.min, 40),
    spanMaxKm: finiteNumberValue(spanScanConfig.max, 120),
    spanStepKm: finiteNumberValue(spanScanConfig.step, 5),
    minSpanLimitKm: finiteNumberValue(constraints.minSpanLength, 30),
    maxSpanLimitKm: finiteNumberValue(constraints.maxSpanLength, 100),
    optimizationTarget: optimizationTarget.value === 'max_gsnr' ? 'max_gsnr' : 'min_amp',
  }
}

function resetLinkConfig(): void {
  fiberModelRequestSequence += 1
  amplifierModelRequestSequence += 1
  deviceEntityRequestSequence.fiber += 1
  deviceEntityRequestSequence.amplifier += 1
  deviceConfigRequestSequence.fiber += 1
  deviceConfigRequestSequence.amplifier += 1
  selectedFiberModel.value = ''
  selectedAmplifierModel.value = ''
  fiberModelOptions.value = []
  fiberModelLoading.value = false
  fiberModelLoaded.value = false
  fiberModelError.value = ''
  amplifierModelOptions.value = []
  amplifierModelLoading.value = false
  amplifierModelLoaded.value = false
  amplifierModelError.value = ''
  selectedFiberTypeId.value = ''
  selectedAmplifierTypeId.value = ''
  fiberDeviceEntities.value = []
  amplifierDeviceEntities.value = []
  fiberDeviceConfigs.value = []
  amplifierDeviceConfigs.value = []
  fiberDeviceValues.value = {}
  amplifierDeviceValues.value = {}
  Object.assign(deviceEntityLoading, { fiber: false, amplifier: false })
  Object.assign(deviceConfigLoading, { fiber: false, amplifier: false })
  Object.assign(deviceEntityErrors, { fiber: '', amplifier: '' })
  Object.assign(deviceConfigErrors, { fiber: '', amplifier: '' })
  Object.assign(fiberParams, {
    attenuation: Number.NaN,
    effectiveArea: Number.NaN,
    dispersion: Number.NaN,
    dispersionSlope: Number.NaN,
    nonlinearIndex: Number.NaN,
    nonlinearCoeff: Number.NaN,
  })
  Object.assign(amplifierParams, {
    gain: Number.NaN,
    noiseFigure: Number.NaN,
    maxOutputPower: Number.NaN,
    saturationPower: Number.NaN,
  })
  Object.assign(ssfmParams, { stepSize: 100, samplePoints: 4096, maxIterations: 1000 })
  hydratingChannelConfig.value = true
  Object.assign(channelConfig, {
    channelCount: 96,
    baudRateGbaud: 64,
    modulationFormat: '16QAM',
    launchPowerDbm: Array(96).fill(-1.5),
    channelFrequenciesThz: [],
    initialAseNoiseDbm: -90,
    initialNliNoiseDbm: -90,
    centerFrequencyThz: 193.1,
    channelSpacingGhz: 50,
  })
  Object.assign(optimizationConfig, { targetGsnrDb: 14, targetOsnrDb: 16 })
  spanStrategy.value = 'auto'
  spanKm.value = 70
  Object.assign(spanScanConfig, { min: 40, max: 120, step: 5 })
  optimizationTarget.value = 'min_amplifiers'
  Object.assign(constraints, { maxSpanLength: 100, minSpanLength: 30, osnrMargin: 1 })
  launchPowerMode.value = 'uniform'
  Object.assign(launchPowerGroups, { lower: -1.5, center: -1, upper: -1.5 })
  initialAseMode.value = 'default'
  initialNliMode.value = 'default'
  hydratingChannelConfig.value = false

  const snapshot = settingsStore.platformPlanConfigSnapshot
  if (snapshot?.channelConfig) setChannelConfig(snapshot.channelConfig)
  setOptimizationConfig(snapshot?.optimization ?? null)
  if (snapshot?.spanKm != null) {
    spanKm.value = snapshot.spanKm
    spanStrategy.value = 'fixed'
  }

  spanScanData.value = null
  calculationResult.value = null
  platformLayoutResult.value = null
  calculationError.value = ''
  platformCalculationCompleted.value = false
  Object.keys(committedStepFingerprints).forEach(key => {
    delete committedStepFingerprints[key as ConfigStepId]
  })
}

function persistPlatformPlanningSnapshot(): void {
  settingsStore.updatePlatformPlanConfigSnapshot({
    ...(settingsStore.platformPlanConfigSnapshot ?? {
      scope: null,
      gridResolution: null,
      enableRedundancy: null,
      errors: [],
    }),
    channelConfig: { ...channelConfig },
    optimization: buildPlatformOptimizationConfig(),
    spanKm: finiteNumberValue(spanKm.value, 70),
    form: buildPlanningFormSnapshot(),
  })
}

async function savePlatformWdmConfig(projectId: string | number): Promise<void> {
  const channelPayload: PlanConfigChannel = {
    projectId,
    ...channelConfig,
  }

  try {
    await saveAndVerifyPlanningChannelConfig(projectId, channelPayload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Data too long for column') || message.includes('Data truncation')) {
      const launchPowerLength = JSON.stringify(channelPayload.launchPowerDbm ?? []).length
      const frequencyLength = JSON.stringify(channelPayload.channelFrequenciesThz ?? []).length
      throw new Error(
        `信道配置保存失败：后端 plan_config.value 字段容量不足。当前 ${channelPayload.channelCount ?? 0} 个信道，`
        + `入纤功率数组 ${launchPowerLength} 字符、频率数组 ${frequencyLength} 字符；`
        + '请将后端 plan_config.value（建议同时包含 default_value）扩容为 TEXT 或 JSON。',
      )
    }
    throw new Error(`信道配置保存失败：${message}`)
  }
}

async function savePlatformAmplifierConfig(projectId: string | number): Promise<void> {
  try {
    await platformPlanConfigApi.saveOptimization({
      projectId,
      ...buildPlatformOptimizationConfig(),
    })
  } catch (error) {
    throw new Error(`优化配置保存失败：${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    await platformPlanConfigApi.saveSpanKm({
      projectId,
      spanKm: finiteNumberValue(spanKm.value, 70),
    })
  } catch (error) {
    throw new Error(`跨段参数保存失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

// ============ Step 6: BU 配置 ============

// BU 器件选项
const PLACEHOLDER_VALUE = '__none__'
const buDeviceOptions = computed(() => [
  { value: PLACEHOLDER_VALUE, label: '-- 请选择 --' },
  ...platformBranchingLibraries.value
    .filter(b => b.id)
    .map(b => ({
      value: b.id,
      label: `${b.name} - ${b.portCount}端口`
    }))
])

const isBuConfigurationComplete = (config: {
  componentRefId?: string
  portCount: number
  trunkLoss: number
  branchLoss: number
  nextHopUpstream?: string
  nextHopDownstream?: string
  nextHopBranch1?: string
  nextHopBranch2?: string
  nextHopBranch3?: string
}): boolean => {
  if (!config.componentRefId || !config.nextHopUpstream || !config.nextHopDownstream) return false
  if (!Number.isInteger(config.portCount) || config.portCount < 2) return false
  if (!Number.isFinite(config.trunkLoss) || config.trunkLoss < 0) return false
  if (!Number.isFinite(config.branchLoss) || config.branchLoss < 0) return false
  const branchCount = Math.max(0, Math.min(3, Math.trunc(config.portCount) - 2))
  const branchNextHops = [config.nextHopBranch1, config.nextHopBranch2, config.nextHopBranch3]
  return branchNextHops.slice(0, branchCount).every(Boolean)
}

// BU 配置只来自接线元中明确存在的 BU 与表单缓存。
const buConfigs = computed(() => {
  // 显式访问 buConfigStore.configs 以建立响应式依赖
  const configsSnapshot = buConfigStore.configs

  return routeConnectorElements.value
    .filter(e => e.type === 'bu')
    .sort((a, b) => a.kp - b.kp)
    .map(bu => {
      const storedConfig = configsSnapshot[bu.id] || null
      const deviceId = storedConfig?.componentRefId || bu.componentRefId || ''
      const device = deviceId 
        ? platformBranchingLibraries.value.find(d => d.id === deviceId)
        : null
      const portCount = bu.buPortCount ?? device?.portCount ?? Number.NaN
      const trunkLoss = storedConfig?.buTrunkLoss ?? bu.buTrunkLoss ?? device?.trunkInsertionLoss ?? Number.NaN
      const branchLoss = storedConfig?.buBranchLoss ?? bu.buBranchLoss ?? device?.branchInsertionLoss ?? Number.NaN
      const isConfigured = isBuConfigurationComplete({
        componentRefId: storedConfig?.componentRefId || bu.componentRefId,
        portCount,
        trunkLoss,
        branchLoss,
        nextHopUpstream: storedConfig?.buNextHopUpstream || (bu as any).buNextHopUpstream,
        nextHopDownstream: storedConfig?.buNextHopDownstream || (bu as any).buNextHopDownstream,
        nextHopBranch1: storedConfig?.buNextHopBranch1 || (bu as any).buNextHopBranch1,
        nextHopBranch2: storedConfig?.buNextHopBranch2 || (bu as any).buNextHopBranch2,
        nextHopBranch3: storedConfig?.buNextHopBranch3 || (bu as any).buNextHopBranch3,
      })
      
      return {
        id: bu.id,
        name: bu.name,
        kp: bu.kp,
        componentRefId: storedConfig?.componentRefId || bu.componentRefId || '',
        portCount,
        trunkLoss,
        branchLoss,
        branchTarget: bu.buBranchTarget || '',
        nextHopUpstream: storedConfig?.buNextHopUpstream || (bu as any).buNextHopUpstream || '',
        nextHopDownstream: storedConfig?.buNextHopDownstream || (bu as any).buNextHopDownstream || '',
        nextHopBranch1: storedConfig?.buNextHopBranch1 || (bu as any).buNextHopBranch1 || '',
        nextHopBranch2: storedConfig?.buNextHopBranch2 || (bu as any).buNextHopBranch2 || '',
        nextHopBranch3: storedConfig?.buNextHopBranch3 || (bu as any).buNextHopBranch3 || '',
        isConfigured,
        deviceName: device?.name || '未选择'
      }
    })
})

interface PersistedPlanningTemplates {
  fiber: PlanDeviceEntity
  amplifier: PlanDeviceEntity
}

const replaceLocalPlanningEntity = (
  type: PlanningDeviceKind,
  originalId: string,
  entity: PlanDeviceEntity,
): void => {
  const source = type === 'fiber' ? fiberDeviceEntities.value : amplifierDeviceEntities.value
  const next = source.map(item => String(item.id) === originalId ? entity : item)
  replacePlanningDeviceEntities(type, next)
  if (type === 'fiber') selectedFiberTypeId.value = String(entity.id ?? originalId)
  else selectedAmplifierTypeId.value = String(entity.id ?? originalId)
}

const persistPlanningTemplate = async (
  type: PlanningDeviceKind,
  projectId: string | number,
): Promise<PlanDeviceEntity> => {
  const entity = type === 'fiber' ? selectedFiberEntity.value : selectedAmplifierEntity.value
  if (!entity) throw new Error(type === 'fiber' ? '请选择光纤器件' : '请选择放大器器件')
  const entityId = String(entity.id ?? '')
  const payload = buildPlanningTemplateEntity({
    kind: type,
    entity,
    projectId,
    values: type === 'fiber' ? fiberDeviceValues.value : amplifierDeviceValues.value,
    configs: type === 'fiber' ? fiberDeviceConfigs.value : amplifierDeviceConfigs.value,
    calculationModel: type === 'fiber' ? selectedFiberModel.value : selectedAmplifierModel.value,
    ...(type === 'fiber' ? { ssfmParams: { ...ssfmParams } } : {}),
  })
  const savedId = await settingsStore.savePlatformDeviceEntity(payload)
  const saved = { ...payload, id: savedId }
  replaceLocalPlanningEntity(type, entityId, saved)
  return saved
}

const persistPlanningTemplates = async (
  projectId: string | number,
): Promise<PersistedPlanningTemplates> => {
  const fiber = await persistPlanningTemplate('fiber', projectId)
  const amplifier = await persistPlanningTemplate('amplifier', projectId)
  return { fiber, amplifier }
}

const persistConnectorEntity = async (
  element: ConnectorElement,
  projectId: string | number,
  sortNum: number,
  values: Record<string, string | number | boolean | null | undefined>,
): Promise<PlanDeviceEntity> => {
  const payload = buildPlanningConnectorEntity({
    element,
    projectId,
    sortNum,
    libraries: settingsStore.platformDeviceLibraries,
    values,
  })
  const savedId = await settingsStore.savePlatformDeviceEntity(payload)
  connectorStore.updateElement(element.id, {
    platformEntityId: savedId,
    deviceTypeCd: payload.deviceTypeCd || element.deviceTypeCd,
  })
  return { ...payload, id: savedId }
}

const syncPlannedEqualizerEntities = async (
  projectId: string | number,
): Promise<PlanDeviceEntity[]> => {
  const existing = routeConnectorElements.value.filter(element => element.type === 'equalizer')
  const retainedIds = new Set(plannedEqualizers.value.map(item => item.id).filter(Boolean))
  for (const element of existing) {
    if (retainedIds.has(element.id)) continue
    if (element.platformEntityId != null) {
      await settingsStore.removePlatformDeviceEntity(element.platformEntityId)
    }
    connectorStore.deleteElement(element.id)
  }

  const saved: PlanDeviceEntity[] = []
  for (let index = 0; index < plannedEqualizers.value.length; index += 1) {
    const planned = plannedEqualizers.value[index]
    const normalized = normalizeEqualizerConfig(planned)
    const [longitude, latitude] = coordinateAtRouteKp(planned.kp)
    let connectorId = planned.id
    const existingElement = connectorId
      ? connectorStore.elements.find(element => element.id === connectorId)
      : null
    const updates: Partial<ConnectorElement> = {
      name: planned.name,
      type: 'equalizer',
      deviceTypeCd: planningDeviceTypeCodeForTopology.equalizer,
      kp: planned.kp,
      hasExplicitKp: true,
      longitude,
      latitude,
      depth: existingElement?.depth ?? 0,
      status: 'planned',
      specifications: planned.specifications,
      remarks: planned.remarks,
      componentRefId: planned.componentRefId,
      equalizerRole: normalized.equalizerRole,
      attenuationMode: normalized.attenuationMode,
      attenuationDb: normalized.attenuationDb,
    }
    if (existingElement && connectorId) {
      connectorStore.updateElement(connectorId, updates)
    } else {
      connectorId = connectorStore.addElement(updates as Omit<ConnectorElement, 'id'>) ?? undefined
      planned.id = connectorId
    }
    const element = connectorId
      ? connectorStore.elements.find(item => item.id === connectorId)
      : null
    if (!element) throw new Error(`${planned.name} 无法写入接线元`)
    saved.push(await persistConnectorEntity(element, projectId, 20_000 + index, {
      attenuationMode: normalized.attenuationMode,
      attenuationDb: normalized.attenuationDb,
      equalizerRole: normalized.equalizerRole,
    }))
  }
  return saved
}

const syncBuEntities = async (
  projectId: string | number,
): Promise<PlanDeviceEntity[]> => {
  const saved: PlanDeviceEntity[] = []
  for (let index = 0; index < buConfigs.value.length; index += 1) {
    const config = buConfigs.value[index]
    const element = connectorStore.elements.find(item => item.id === config.id)
    if (!element) throw new Error(`${config.name} 不存在对应接线元`)
    const branchTarget = allNodes.value.find(node => node.id === config.nextHopBranch1)?.name || ''
    connectorStore.updateElement(element.id, {
      deviceTypeCd: planningDeviceTypeCodeForTopology.branching,
      componentRefId: config.componentRefId,
      buPortCount: config.portCount,
      buTrunkLoss: config.trunkLoss,
      buBranchLoss: config.branchLoss,
      buBranchTarget: branchTarget,
      buNextHopUpstream: config.nextHopUpstream,
      buNextHopDownstream: config.nextHopDownstream,
      buNextHopBranch1: config.nextHopBranch1,
      buNextHopBranch2: config.nextHopBranch2,
      buNextHopBranch3: config.nextHopBranch3,
    })
    const updated = connectorStore.elements.find(item => item.id === element.id)
    if (!updated) continue
    saved.push(await persistConnectorEntity(updated, projectId, 30_000 + index, {
      portCount: config.portCount,
      trunkInsertionLoss: config.trunkLoss,
      branchInsertionLoss: config.branchLoss,
    }))
  }
  return saved
}

const persistPlanningTopologyEntities = async (
  projectId: string | number,
): Promise<PlanDeviceEntity[]> => {
  ensureRouteTopologyConnectorElements()
  const equalizers = await syncPlannedEqualizerEntities(projectId)
  const branchingUnits = await syncBuEntities(projectId)
  return [...equalizers, ...branchingUnits]
}

const prepareLayoutEntitiesForSimulation = async (
  context: { mode: 'fixed' | 'optimized'; deviceEntityList: PlanDeviceEntity[] },
  projectId: string | number,
  templates: PersistedPlanningTemplates,
): Promise<PlanDeviceEntity[]> => {
  const generated = context.deviceEntityList.length > 0
    ? context.deviceEntityList
    : settingsStore.platformDeviceEntities
  const configured: PlanDeviceEntity[] = []
  let fiberApplied = false
  let amplifierApplied = false
  for (const entity of generated) {
    const typeCode = String(entity.deviceTypeCd ?? '').trim().toUpperCase()
    let payload = entity
    if (typeCode === planningDeviceTypeCode.fiber) {
      payload = applyPlanningTemplateToEntity(entity, templates.fiber)
      fiberApplied = true
    } else if (typeCode === planningDeviceTypeCode.amplifier) {
      payload = applyPlanningTemplateToEntity(entity, templates.amplifier)
      amplifierApplied = true
    } else {
      configured.push(entity)
      continue
    }
    const savedId = await settingsStore.savePlatformDeviceEntity({
      ...payload,
      projectId,
      mode: context.mode,
    })
    configured.push({ ...payload, id: savedId, projectId, mode: context.mode })
  }
  if (!fiberApplied) configured.push(templates.fiber)
  if (!amplifierApplied) configured.push(templates.amplifier)
  const topology = await persistPlanningTopologyEntities(projectId)
  const merged = mergePlanningDeviceEntities(configured, topology)
  settingsStore.replacePlatformDeviceEntities(merged)
  return merged
}

const buildPlanningFormSnapshot = (): SystemPlanningFormSnapshot => ({
  routeId: selectedRouteId.value,
  fiberModel: selectedFiberModel.value,
  amplifierModel: selectedAmplifierModel.value,
  fiberTypeId: selectedFiberTypeId.value,
  amplifierTypeId: selectedAmplifierTypeId.value,
  fiberDeviceValues: { ...fiberDeviceValues.value },
  amplifierDeviceValues: { ...amplifierDeviceValues.value },
  fiberParams: { ...fiberParams },
  amplifierParams: { ...amplifierParams },
  ssfmParams: { ...ssfmParams },
  spanStrategy: spanStrategy.value,
  spanKm: finiteNumberValue(spanKm.value, 70),
  spanScanConfig: {
    min: finiteNumberValue(spanScanConfig.min, 40),
    max: finiteNumberValue(spanScanConfig.max, 120),
    step: finiteNumberValue(spanScanConfig.step, 5),
  },
  optimizationTarget: optimizationTarget.value,
  constraints: {
    minSpanLength: finiteNumberValue(constraints.minSpanLength, 30),
    maxSpanLength: finiteNumberValue(constraints.maxSpanLength, 100),
    osnrMargin: Math.max(0, finiteNumberValue(constraints.osnrMargin, 1)),
  },
  launchPowerMode: launchPowerMode.value,
  launchPowerGroups: { ...launchPowerGroups },
  buConfigs: buConfigs.value.map(config => ({
    connectorId: config.id,
    componentRefId: config.componentRefId,
    trunkLoss: config.trunkLoss,
    branchLoss: config.branchLoss,
    nextHopUpstream: config.nextHopUpstream,
    nextHopDownstream: config.nextHopDownstream,
    nextHopBranch1: config.nextHopBranch1,
    nextHopBranch2: config.nextHopBranch2,
    nextHopBranch3: config.nextHopBranch3,
  })),
  equalizers: plannedEqualizers.value.map(equalizer => ({
    connectorId: equalizer.id,
    name: equalizer.name,
    kp: equalizer.kp,
    componentRefId: equalizer.componentRefId,
    equalizerRole: equalizer.equalizerRole,
    attenuationMode: equalizer.attenuationMode,
    attenuationDb: equalizer.attenuationDb,
    specifications: equalizer.specifications,
    remarks: equalizer.remarks,
  })),
  savedAt: new Date().toISOString(),
})

const persistPlanningSettings = (): void => {
  const channelCount = normalizeChannelCount(channelConfig.channelCount) ?? 1
  settingsStore.updateFiberSimulationConfig({ model: selectedFiberModel.value })
  settingsStore.updateSimulationModelConfig({
    fiberModel: selectedFiberModel.value,
    edfaModel: selectedAmplifierModel.value,
  })
  settingsStore.updateWDMPlanningParams({
    channelCount,
    centerFreqTHz: channelConfig.centerFrequencyThz,
    channelSpacingGHz: channelConfig.channelSpacingGhz,
    baudRateGbaud: channelConfig.baudRateGbaud,
    modulation: channelConfig.modulationFormat as import('@/types/simulation').ModulationFormat,
    launchPower: channelConfig.launchPowerDbm[0] ?? 0,
    vectorParams: {
      launchPowerVector: [...channelConfig.launchPowerDbm],
      initialAseVector: Array(channelCount).fill(channelConfig.initialAseNoiseDbm),
      initialNliVector: Array(channelCount).fill(channelConfig.initialNliNoiseDbm),
    },
  })
  settingsStore.updateSpanScanConfig({
    spanLengthMinKm: spanStrategy.value === 'auto'
      ? finiteNumberValue(spanScanConfig.min, 40) : finiteNumberValue(spanKm.value, 70),
    spanLengthMaxKm: spanStrategy.value === 'auto'
      ? finiteNumberValue(spanScanConfig.max, 120) : finiteNumberValue(spanKm.value, 70),
    spanStepKm: spanStrategy.value === 'auto' ? finiteNumberValue(spanScanConfig.step, 5) : 0,
    targetGsnrDb: finiteNumberValue(optimizationConfig.targetGsnrDb, 14),
    targetOsnrDb: finiteNumberValue(optimizationConfig.targetOsnrDb, 16),
    marginDb: Math.max(0, finiteNumberValue(constraints.osnrMargin, 1)),
  })
  settingsStore.updateSystemPlanningConfig({
    linkId: selectedRouteId.value,
    createdAt: new Date(),
  })
}

const restorePlanningFormSnapshot = async (): Promise<boolean> => {
  const form = settingsStore.platformPlanConfigSnapshot?.form
  if (!form) {
    const cache = settingsStore.systemPlanningCache
    if (cache?.is_valid) {
      const fiberModel = cache.model_selection.fiber_model_id
      const amplifierModel = cache.model_selection.edfa_model_id
      selectedFiberModel.value = fiberModel
      selectedAmplifierModel.value = amplifierModel
      selectedFiberTypeId.value = cache.device_selection.fiber_spec_id
      selectedAmplifierTypeId.value = cache.device_selection.edfa_spec_id
    }
    return false
  }

  hydratingPlanningForm.value = true
  if (routeStore.routes.some(route => route.id === form.routeId)) selectedRouteId.value = form.routeId
  await nextTick()
  ensureRouteTopologyConnectorElements()
  selectedFiberModel.value = form.fiberModel
  selectedAmplifierModel.value = form.amplifierModel
  selectedFiberTypeId.value = form.fiberTypeId
  selectedAmplifierTypeId.value = form.amplifierTypeId
  fiberDeviceValues.value = { ...(form.fiberDeviceValues ?? {}) }
  amplifierDeviceValues.value = { ...(form.amplifierDeviceValues ?? {}) }
  spanStrategy.value = form.spanStrategy === 'fixed' ? 'fixed' : 'auto'
  if (Number.isFinite(Number(form.spanKm)) && Number(form.spanKm) > 0) {
    spanKm.value = Number(form.spanKm)
  }
  const restoredScan = form.spanScanConfig
  Object.assign(spanScanConfig, {
    min: Number.isFinite(Number(restoredScan?.min)) && Number(restoredScan?.min) > 0
      ? Number(restoredScan.min) : spanScanConfig.min,
    max: Number.isFinite(Number(restoredScan?.max)) && Number(restoredScan?.max) > 0
      ? Number(restoredScan.max) : spanScanConfig.max,
    step: Number.isFinite(Number(restoredScan?.step)) && Number(restoredScan?.step) > 0
      ? Number(restoredScan.step) : spanScanConfig.step,
  })
  optimizationTarget.value = form.optimizationTarget === 'max_gsnr' ? 'max_gsnr' : 'min_amplifiers'
  const restoredConstraints = form.constraints
  Object.assign(constraints, {
    minSpanLength: Number.isFinite(Number(restoredConstraints?.minSpanLength)) && Number(restoredConstraints?.minSpanLength) > 0
      ? Number(restoredConstraints.minSpanLength) : constraints.minSpanLength,
    maxSpanLength: Number.isFinite(Number(restoredConstraints?.maxSpanLength)) && Number(restoredConstraints?.maxSpanLength) > 0
      ? Number(restoredConstraints.maxSpanLength) : constraints.maxSpanLength,
    osnrMargin: Number.isFinite(Number(restoredConstraints?.osnrMargin)) && Number(restoredConstraints?.osnrMargin) >= 0
      ? Number(restoredConstraints.osnrMargin) : constraints.osnrMargin,
  })
  launchPowerMode.value = form.launchPowerMode
  Object.assign(launchPowerGroups, form.launchPowerGroups ?? { lower: -1.5, center: -1, upper: -1.5 })
  Object.assign(ssfmParams, form.ssfmParams)
  for (const config of form.buConfigs ?? []) {
    buConfigStore.saveConfig(config.connectorId, {
      componentRefId: config.componentRefId,
      buTrunkLoss: config.trunkLoss,
      buBranchLoss: config.branchLoss,
      buNextHopUpstream: config.nextHopUpstream,
      buNextHopDownstream: config.nextHopDownstream,
      buNextHopBranch1: config.nextHopBranch1,
      buNextHopBranch2: config.nextHopBranch2,
      buNextHopBranch3: config.nextHopBranch3,
    })
  }
  if (form.equalizers?.length) {
    plannedEqualizers.value = form.equalizers.map(equalizer => createPlannedEqualizer({
      id: equalizer.connectorId,
      name: equalizer.name,
      kp: equalizer.kp,
      componentRefId: equalizer.componentRefId,
      equalizerRole: equalizer.equalizerRole,
      attenuationMode: equalizer.attenuationMode,
      attenuationDb: equalizer.attenuationDb,
      specifications: equalizer.specifications,
      remarks: equalizer.remarks,
    }))
  }
  await nextTick()
  Object.assign(fiberParams, form.fiberParams)
  Object.assign(amplifierParams, form.amplifierParams)
  hydratingPlanningForm.value = false
  return true
}

// 下一跳候选只列出项目中已经存在的显式设备，不推断拓扑方向。
const allNodes = computed(() => {
  return routeConnectorElements.value
    .filter(element => element.type === 'landing'
      || element.type === 'underwater'
      || element.type === 'bu')
    .map((element, index) => ({
      id: element.id,
      name: element.name,
      type: element.type,
      index,
    }))
})

// 获取起点/终点站名称 - 从 linkInfo 获取
const linkEndpoints = computed(() => {
  const info = linkInfo.value
  if (info) {
    return {
      start: info.startStation || '起点',
      end: info.endStation || '终点'
    }
  }
  return { start: '起点', end: '终点' }
})

// BU 参数只保存在规划表单缓存中，提交给后端时再读取。
const updateBuConfig = (buId: string, field: string, value: string | number | boolean) => {
  const fieldMapping: Record<string, keyof BUConfigData> = {
    'buNextHopUpstream': 'buNextHopUpstream',
    'buNextHopDownstream': 'buNextHopDownstream',
    'buBranchTarget1': 'buNextHopBranch1',
    'buBranchTarget2': 'buNextHopBranch2',
    'buBranchTarget3': 'buNextHopBranch3',
    'buBranchTarget': 'buNextHopBranch1',
    'componentRefId': 'componentRefId',
    'buTrunkLoss': 'buTrunkLoss',
    'buBranchLoss': 'buBranchLoss'
  }
  
  const storeField = fieldMapping[field]
  if (storeField) {
    buConfigStore.updateConfig(buId, { [storeField]: value })
  }
}

// 复制器件库中明确保存的参数到当前规划表单。
const loadBuParamsFromDevice = (buId: string, deviceId: string) => {
  const device = platformBranchingLibraries.value.find(d => d.id === deviceId)
  if (device) {
    buConfigStore.updateConfig(buId, {
      componentRefId: deviceId,
      buTrunkLoss: device.trunkInsertionLoss,
      buBranchLoss: device.branchInsertionLoss
    })
  }
}

const getNextHopOptions = (buId: string, _direction: 'upstream' | 'downstream' | 'branch') => {
  const options: Array<{ value: string; label: string }> = [
    { value: PLACEHOLDER_VALUE, label: '-- 选择 --' }
  ]
  allNodes.value
    .filter(node => node.id !== buId)
    .forEach(node => options.push({ value: node.id, label: node.name }))
  
  return options
}

// ============ 配置完整度计算 ============
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number'
    ? Number.isFinite(value)
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))

const invalidDynamicNumberConfig = (
  configs: PlanDeviceConfig[],
  values: DynamicDeviceValues,
): PlanDeviceConfig | null => {
  const row = resolveDeviceAttributeRows(configs, undefined, dynamicValueList(values))
    .find(item => item.config.dataTypeCd === 'NUMBER'
      && item.value.trim() !== ''
      && !Number.isFinite(Number(item.value)))
  return row?.config ?? null
}

const stepValidation = computed(() => {
  const link = !selectedRouteId.value ? '请选择规划链路' : null

  let model: string | null = null
  if (!selectedFiberModel.value || !selectedAmplifierModel.value) {
    model = '请选择光纤和放大器计算模型'
  } else if (selectedFiberModel.value === 'SSFM' && (
    !isFiniteNumber(ssfmParams.stepSize) || ssfmParams.stepSize <= 0
    || !Number.isInteger(ssfmParams.samplePoints) || ssfmParams.samplePoints <= 0
    || !Number.isInteger(ssfmParams.maxIterations) || ssfmParams.maxIterations <= 0
  )) {
    model = 'SSFM 步长、采样点数和迭代次数必须为正数'
  }

  let fiber: string | null = null
  if (deviceEntityLoading.fiber) {
    fiber = '正在加载项目光纤器件'
  } else if (deviceEntityErrors.fiber) {
    fiber = `光纤器件加载失败：${deviceEntityErrors.fiber}`
  } else if (fiberDeviceEntities.value.length === 0) {
    fiber = '当前项目没有 FIB 光纤器件'
  } else if (!selectedFiberTypeId.value) {
    fiber = '请选择光纤器件'
  } else if (!selectedFiberEntity.value) {
    fiber = '所选光纤器件已不存在，请重新选择'
  } else if (deviceConfigLoading.fiber) {
    fiber = '正在加载光纤动态属性'
  } else if (deviceConfigErrors.fiber) {
    fiber = `光纤动态属性加载失败：${deviceConfigErrors.fiber}`
  } else {
    const invalidConfig = invalidDynamicNumberConfig(fiberDeviceConfigs.value, fiberDeviceValues.value)
    if (invalidConfig) fiber = `${invalidConfig.name || invalidConfig.code || '光纤属性'}数值无效`
  }

  let amplifier: string | null = null
  if (deviceEntityLoading.amplifier) {
    amplifier = '正在加载项目放大器器件'
  } else if (deviceEntityErrors.amplifier) {
    amplifier = `放大器器件加载失败：${deviceEntityErrors.amplifier}`
  } else if (amplifierDeviceEntities.value.length === 0) {
    amplifier = '当前项目没有 AMP 放大器器件'
  } else if (!selectedAmplifierTypeId.value) {
    amplifier = '请选择放大器器件'
  } else if (!selectedAmplifierEntity.value) {
    amplifier = '所选放大器器件已不存在，请重新选择'
  } else if (deviceConfigLoading.amplifier) {
    amplifier = '正在加载放大器动态属性'
  } else if (deviceConfigErrors.amplifier) {
    amplifier = `放大器动态属性加载失败：${deviceConfigErrors.amplifier}`
  } else if (invalidDynamicNumberConfig(amplifierDeviceConfigs.value, amplifierDeviceValues.value)) {
    const invalidConfig = invalidDynamicNumberConfig(amplifierDeviceConfigs.value, amplifierDeviceValues.value)
    amplifier = `${invalidConfig?.name || invalidConfig?.code || '放大器属性'}数值无效`
  } else if (!isFiniteNumber(optimizationConfig.targetOsnrDb) || optimizationConfig.targetOsnrDb <= 0) {
    amplifier = '目标 OSNR 必须是大于 0 的数值'
  } else if (!isFiniteNumber(optimizationConfig.targetGsnrDb) || optimizationConfig.targetGsnrDb <= 0) {
    amplifier = '目标 GSNR 必须是大于 0 的数值'
  } else if (!isFiniteNumber(constraints.minSpanLength) || constraints.minSpanLength <= 0) {
    amplifier = '最小 Span 长度必须是大于 0 的数值'
  } else if (!isFiniteNumber(constraints.maxSpanLength) || constraints.maxSpanLength <= 0) {
    amplifier = '最大 Span 长度必须是大于 0 的数值'
  } else if (finiteNumberValue(constraints.maxSpanLength, 0) < finiteNumberValue(constraints.minSpanLength, 0)) {
    amplifier = '最大 Span 长度不能小于最小 Span 长度'
  } else if (!isFiniteNumber(constraints.osnrMargin) || constraints.osnrMargin < 0) {
    amplifier = 'OSNR 裕量必须是大于等于 0 的数值'
  } else if (spanStrategy.value === 'fixed' && (
    !isFiniteNumber(spanKm.value) || spanKm.value <= 0
  )) {
    amplifier = '固定 Span 长度必须大于 0'
  } else if (spanStrategy.value === 'auto' && (
    !isFiniteNumber(spanScanConfig.min) || spanScanConfig.min <= 0
    || !isFiniteNumber(spanScanConfig.max)
    || finiteNumberValue(spanScanConfig.max, 0) < finiteNumberValue(spanScanConfig.min, 0)
    || !isFiniteNumber(spanScanConfig.step) || spanScanConfig.step <= 0
  )) {
    amplifier = 'Span 扫描范围或步长无效'
  } else {
    try {
      const bounds = resolveCurrentSpanBounds()
      if (spanStrategy.value === 'fixed' && !isSpanWithinBounds(finiteNumberValue(spanKm.value, 0), bounds)) {
        amplifier = `固定 Span ${spanKm.value} km 超出约束范围 ${bounds.minKm}-${bounds.maxKm} km`
      }
    } catch (error) {
      amplifier = error instanceof Error ? error.message : 'Span 扫描范围与约束无有效交集'
    }
  }

  const channelCount = normalizeChannelCount(channelConfig.channelCount)
  let wdm: string | null = null
  if (channelCount == null) {
    wdm = '信道数量必须是 1 到 4096 之间的整数'
  } else if (
    !isFiniteNumber(channelConfig.centerFrequencyThz) || channelConfig.centerFrequencyThz <= 0
    || !isFiniteNumber(channelConfig.channelSpacingGhz) || channelConfig.channelSpacingGhz <= 0
    || !isFiniteNumber(channelConfig.baudRateGbaud) || channelConfig.baudRateGbaud <= 0
    || !channelConfig.modulationFormat
  ) {
    wdm = '中心频率、信道间隔、符号速率或调制格式无效'
  } else if (
    channelConfig.launchPowerDbm.length !== channelCount
    || channelConfig.launchPowerDbm.some(value => !isFiniteNumber(value))
  ) {
    wdm = `入纤功率必须包含 ${channelCount} 个有效值`
  } else if (
    channelConfig.channelFrequenciesThz.length > 0
    && (channelConfig.channelFrequenciesThz.length !== channelCount
      || channelConfig.channelFrequenciesThz.some(value => !isFiniteNumber(value)))
  ) {
    wdm = `后端返回的信道频率必须包含 ${channelCount} 个有效值`
  } else if (
    !isFiniteNumber(channelConfig.initialAseNoiseDbm)
    || !isFiniteNumber(channelConfig.initialNliNoiseDbm)
  ) {
    wdm = '初始 ASE/NLI 噪声参数无效'
  }

  const incompleteBu = buConfigs.value.find(config => !config.isConfigured)
  const bu = incompleteBu
    ? `${incompleteBu.name} 的器件或下一跳配置不完整`
    : null

  return { link, model, fiber, amplifier, wdm, bu, result: null }
})

const stepStatus = computed(() => ({
  link: stepValidation.value.link == null,
  model: stepValidation.value.model == null,
  fiber: stepValidation.value.fiber == null,
  amplifier: stepValidation.value.amplifier == null,
  wdm: stepValidation.value.wdm == null,
  bu: stepValidation.value.bu == null,
  result: calculationResult.value !== null // 计算结果
}))

const completionPercentage = computed(() => {
  const configStepIds = steps.value
    .map(step => step.id)
    .filter((id): id is ConfigStepId => id !== 'result')
  const completed = configStepIds.filter(id => isPlanningStepSaved(id)).length
  return configStepIds.length > 0 ? Math.round((completed / configStepIds.length) * 100) : 0
})

const canStartCalculation = computed(() => {
  return stepStatus.value.link && stepStatus.value.model && 
         stepStatus.value.fiber && stepStatus.value.amplifier && stepStatus.value.wdm &&
         stepStatus.value.bu
})

const currentStepValidationMessage = computed(() => {
  if (activeStep.value === 'result') return null
  return stepValidation.value[activeStep.value]
})

const lastConfigStep = computed(() =>
  stepOrder.value[stepOrder.value.length - 2] ?? 'wdm'
)

const isLastConfigStep = computed(() => activeStep.value === lastConfigStep.value)

// ============ 导航和操作 ============
const committedStepFingerprints = reactive<Partial<Record<ConfigStepId, string>>>({})

const planningStepFingerprint = (step: ConfigStepId): string => {
  switch (step) {
    case 'link':
      return JSON.stringify({
        routeId: selectedRouteId.value,
        equalizers: plannedEqualizers.value,
      })
    case 'model':
      return JSON.stringify({
        fiberModel: selectedFiberModel.value,
        amplifierModel: selectedAmplifierModel.value,
        ssfm: ssfmParams,
      })
    case 'fiber':
      return JSON.stringify({
        typeId: selectedFiberTypeId.value,
        deviceValues: fiberDeviceValues.value,
      })
    case 'amplifier':
      return JSON.stringify({
        typeId: selectedAmplifierTypeId.value,
        deviceValues: amplifierDeviceValues.value,
        spanStrategy: spanStrategy.value,
        spanKm: spanKm.value,
        spanScan: spanScanConfig,
        optimizationTarget: optimizationTarget.value,
        optimization: optimizationConfig,
        constraints,
      })
    case 'wdm':
      return JSON.stringify({
        channelConfig,
        launchPowerMode: launchPowerMode.value,
        launchPowerGroups,
        initialAseMode: initialAseMode.value,
        initialNliMode: initialNliMode.value,
      })
    case 'bu':
      return JSON.stringify(buConfigs.value.map(config => ({
        id: config.id,
        componentRefId: config.componentRefId,
        nextHopUpstream: config.nextHopUpstream,
        nextHopDownstream: config.nextHopDownstream,
        nextHopBranch1: config.nextHopBranch1,
        nextHopBranch2: config.nextHopBranch2,
        nextHopBranch3: config.nextHopBranch3,
      })))
  }
}

const isPlanningStepSaved = (step: PlanningStepId): boolean => {
  if (step === 'result') {
    return calculationResult.value !== null || platformCalculationCompleted.value
  }
  return stepValidation.value[step] == null
    && committedStepFingerprints[step] === planningStepFingerprint(step)
}

const hasRestoredPlanningStepData = (step: ConfigStepId): boolean => {
  const snapshot = settingsStore.platformPlanConfigSnapshot
  if (!snapshot) return false
  if (snapshot.form) return true
  if (step === 'amplifier') return Boolean(snapshot.optimization || snapshot.spanKm != null)
  if (step === 'wdm') return Boolean(snapshot.channelConfig)
  return false
}

const resolveRestoredConfigStep = (): ConfigStepId => {
  const snapshot = settingsStore.platformPlanConfigSnapshot
  if (snapshot?.channelConfig) return 'wdm'
  if (snapshot?.optimization || snapshot?.spanKm != null) return 'amplifier'
  return 'link'
}

const planningStepStatusLabel = (step: PlanningStepId): string => {
  if (step === activeStep.value) {
    if (step === 'result') {
      if (isCalculating.value) return '正在计算'
      return isPlanningStepSaved(step) ? '已生成' : '查看结果'
    }
    return '正在配置'
  }
  if (isPlanningStepSaved(step)) return step === 'result' ? '已生成' : '已保存'
  if (step === 'result') return '等待计算'
  if (hasRestoredPlanningStepData(step)) return '已恢复'
  return stepValidation.value[step] == null ? '待确认' : '需完善'
}

const markRestoredPlanningStepsSaved = (): void => {
  const snapshot = settingsStore.platformPlanConfigSnapshot
  const hasCompletedPlan = Boolean(settingsStore.systemPlanningCache?.is_valid)
  const restoredLayout = selectCachedPlanningLayout()
  const hasPersistedPlan = Boolean(
    snapshot?.form
    || hasCompletedPlan
    || restoredLayout,
  )
  if (!hasPersistedPlan) return
  stepOrder.value
    .filter((step): step is ConfigStepId => step !== 'result')
    .filter(step => stepValidation.value[step] == null)
    // 固定布局不依赖 WDM，不能据此推断后端已经保存信道配置。
    .filter(step => step !== 'wdm'
      || hasCompletedPlan
      || isPlatformChannelConfigComplete(snapshot?.channelConfig))
    .forEach(step => {
      committedStepFingerprints[step] = planningStepFingerprint(step)
    })
}

const savePlanningStep = async (step: ConfigStepId): Promise<void> => {
  const validationMessage = stepValidation.value[step]
  if (validationMessage) throw new Error(validationMessage)

  if (step === 'link') {
    const equalizerValidationMessage = validatePlannedEqualizers()
    if (equalizerValidationMessage) throw new Error(equalizerValidationMessage)
  }

  const currentFingerprint = planningStepFingerprint(step)
  if (committedStepFingerprints[step] === currentFingerprint) return

  persistPlanningSettings()
  platformConfigSaving.value = true
  try {
    const projectId = platformProjectId.value
    if (projectId == null) {
      throw new Error('当前工程未关联平台项目，无法保存系统规划参数')
    }
    if (step === 'link') {
      ensureRouteTopologyConnectorElements()
      await syncPlannedEqualizerEntities(projectId)
    }
    if (step === 'fiber') {
      await persistPlanningTemplate('fiber', projectId)
    }
    if (step === 'amplifier') {
      await persistPlanningTemplate('amplifier', projectId)
      await savePlatformAmplifierConfig(projectId)
    }
    if (step === 'wdm') {
      await savePlatformWdmConfig(projectId)
    }
    if (step === 'bu') {
      await syncBuEntities(projectId)
    }

    persistPlatformPlanningSnapshot()
    committedStepFingerprints[step] = planningStepFingerprint(step)
    appStore.addLog('INFO', `系统规划步骤已保存: ${steps.value.find(item => item.id === step)?.label || step}`)
  } finally {
    platformConfigSaving.value = false
  }
}

// 动态步骤顺序 - 点对点规划时跳过 BU
const stepOrder = computed(() => {
  if (!linkInfo.value || linkInfo.value.buCount === 0) {
    return baseStepOrder.filter(s => s !== 'bu')
  }
  return [...baseStepOrder]
})

const goToNextStep = async () => {
  const currentIndex = stepOrder.value.indexOf(activeStep.value as any)
  if (currentIndex < 0 || currentIndex >= stepOrder.value.length - 1 || activeStep.value === 'result') return

  try {
    await savePlanningStep(activeStep.value)
    activeStep.value = stepOrder.value[currentIndex + 1]
  } catch (error) {
    const message = error instanceof Error ? error.message : '当前步骤保存失败'
    appStore.showNotification({ type: 'error', message })
  }
}

const goToPrevStep = () => {
  const currentIndex = stepOrder.value.indexOf(activeStep.value as any)
  if (currentIndex > 0) {
    activeStep.value = stepOrder.value[currentIndex - 1] as any
  }
}

const navigateToPlanningStep = async (targetStep: PlanningStepId) => {
  const targetIndex = stepOrder.value.indexOf(targetStep)
  const currentIndex = stepOrder.value.indexOf(activeStep.value)
  if (targetIndex < 0 || targetStep === activeStep.value) return
  if (targetIndex <= currentIndex
    || isPlanningStepSaved(targetStep)
    || (targetStep !== 'result' && hasRestoredPlanningStepData(targetStep))) {
    activeStep.value = targetStep
    return
  }
  if (targetIndex === currentIndex + 1) {
    await goToNextStep()
    return
  }
  const firstPending = stepOrder.value
    .slice(0, targetIndex)
    .find(step => step !== 'result' && !isPlanningStepSaved(step))
  if (firstPending && firstPending !== 'result') activeStep.value = firstPending
}

const currentStepPosition = computed(() => {
  const index = stepOrder.value.indexOf(activeStep.value)
  return index >= 0 ? index + 1 : 1
})

const nextPlanningStep = computed(() => {
  const index = stepOrder.value.indexOf(activeStep.value)
  const nextId = index >= 0 ? stepOrder.value[index + 1] : null
  return nextId ? steps.value.find(step => step.id === nextId) || null : null
})

// ============ 计算结果 (Step 5) ============

// 放大器信息
interface AmplifierInfo {
  id: string
  name: string
  position: number  // km
  precedingSpan: number | null  // 前段跨段长度 km
  gain: number | null  // dB
  noiseFigure: number | null  // dB
  outputPower: number | null  // dBm
  inputPower: number | null  // dBm
  longitude?: number
  latitude?: number
  deviceModel?: string
  gainFlatness?: number | null
}

// 成本明细项
interface CostItem {
  category: string
  model: string
  quantity: number | string
  unit: string
  unitPrice: number
  subtotal: number
}

interface CalculationResult {
  linkName: string
  totalLength: number
  calculatedAt: string
  calculationTime: number  // 秒
  status: 'success' | 'failed' | 'calculating'
  systemCapacityTbps?: number
  
  // 关键性能指标
  metrics: {
    osnr: { min: number; max: number; avg: number }
    gsnr: { min: number; max: number; avg: number }
    power: { min: number; max: number; avg: number }
    nli: { min: number; max: number; avg: number }
    qFactor: { min: number; max: number; avg: number }
  }
  
  // 系统配置摘要
  systemConfig: {
    amplifierCount: number
    avgSpanLength: number
    buCount: number
    totalBuLoss: number
    equalizerCount: number
    totalEqualizerLoss: number
    channelCount: number
    modulation: string
  }
  
  // 裕量评估
  margin: {
    targetOsnr: number
    worstMargin: number
    avgMargin: number
    meetsRequirement: boolean
  }
  
  // 性能曲线数据
  performanceData: {
    // 信道频率列表 (THz)
    channelFrequencies: number[]
    // 末端 OSNR 分布 (dB)
    endOsnrSpectrum: number[]
    // 末端 GSNR 分布 (dB)
    endGsnrSpectrum: number[]
    // 末端信号功率分布 (dBm)
    endPowerSpectrum: number[]
    // 末端 NLI 噪声功率分布 (dBm)
    endNliSpectrum: number[]
    // 沿程位置 (km)
    positions: number[]
    // 位置名称
    positionNames: string[]
    // 沿程 OSNR (按选定信道)
    osnrEvolution: number[]
    // 沿程 GSNR (按选定信道)
    gsnrEvolution: number[]
    // 最差信道索引
    worstChannelIndex: number
  }
  
  // 放大器详情
  amplifiers: AmplifierInfo[]
  
  // 成本数据
  costData?: {
    cableCost: number
    amplifierCost: number
    buCost: number
    equalizerCost: number
    totalCost: number
    costItems: CostItem[]
  }
}

type PlatformLayoutResult = PlanningLayoutResult

interface PlanningResultPayload {
  calculationResult: CalculationResult | null
  layoutResult: PlatformLayoutResult | null
  spanScanData: SpanScanResult | null
}

const calculationResult = ref<CalculationResult | null>(null)
const platformLayoutResult = ref<PlatformLayoutResult | null>(null)
const isCalculating = ref(false)
const spanScanData = ref<SpanScanResult | null>(null)
const calculationError = ref('')
const platformCalculationCompleted = ref(false)
const calculationProgress = reactive({ value: 0, message: '正在准备计算' })
const recalculationConfirmationVisible = ref(false)
const recalculationConfirmationDialog = ref<HTMLElement | null>(null)
let recalculationReturnFocus: HTMLElement | null = null

const responseDeviceEntities = (response: unknown): PlanDeviceEntity[] | null => {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null
  const value = (response as { deviceEntityList?: unknown }).deviceEntityList
  if (!Array.isArray(value)) return null
  return value.filter((entity): entity is PlanDeviceEntity => Boolean(
    entity && typeof entity === 'object' && !Array.isArray(entity),
  ))
}

const mergeGeneratedDeviceEntities = (
  existing: PlanDeviceEntity[],
  generated: PlanDeviceEntity[],
): PlanDeviceEntity[] => {
  const generatedIds = new Set(generated
    .map(entity => entity.id)
    .filter(id => id != null && id !== '')
    .map(String))
  const manualEntities = existing.filter(entity => {
    const mode = String(entity.mode ?? '').trim().toLowerCase()
    const isGenerated = mode === 'fixed' || mode === 'optimized'
    const replacedByGenerated = entity.id != null && generatedIds.has(String(entity.id))
    return !isGenerated && !replacedByGenerated
  })
  return [...manualEntities, ...generated]
}

const syncConnectorStoreFromDeviceEntities = (entities: PlanDeviceEntity[]) => {
  const routeId = selectedRouteId.value || routeStore.currentRouteId || null
  if (routeId) connectorStore.selectTableByRoute(routeId)
  if (!connectorStore.currentTable) {
    const tableName = `${linkInfo.value?.name || '系统规划'}_接线元表`
    connectorStore.createTable(tableName, routeId || undefined)
  }
  const currentTable = connectorStore.currentTable
  if (!currentTable) return

  const incomingElements = entities
    .map(entity => {
      const element = platformDeviceEntityToConnectorElement(entity)
      const positionKm = Number(entity.positionKm)
      return Number.isFinite(positionKm) ? { ...element, kp: positionKm } : element
    })
    .filter(element => element.type !== 'cable_segment')
  connectorStore.replaceTableElements(mergePlatformConnectorElements(
    currentTable.elements,
    incomingElements,
    { replacePlatformElements: true },
  ))
}

const syncCalculatedDeviceEntities = async (
  response: unknown,
  projectId: number | string,
  clearAll: boolean,
) => {
  const generatedEntities = responseDeviceEntities(response)
  const fallbackEntities = generatedEntities
    ? clearAll
      ? generatedEntities
      : mergeGeneratedDeviceEntities(settingsStore.platformDeviceEntities, generatedEntities)
    : null
  if (fallbackEntities) settingsStore.replacePlatformDeviceEntities(fallbackEntities)

  let entities = fallbackEntities
  try {
    const authoritativeResponse = await settingsStore.loadPlatformDeviceEntities({
      projectId,
      pageNumber: 1,
      pageSize: 1000,
    })
    const authoritativeEntities = authoritativeResponse.data ?? []
    if (authoritativeEntities.length > 0) {
      entities = fallbackEntities
        ? mergePlanningDeviceEntities(authoritativeEntities, fallbackEntities)
        : authoritativeEntities
    }
  } catch (error) {
    appStore.showNotification({
      type: 'warning',
      message: generatedEntities
        ? '设备实例全量同步失败，已暂时使用本次计算返回的实例'
        : `设备实例同步失败：${error instanceof Error ? error.message : String(error)}`,
    })
  }

  if (!entities) return
  settingsStore.replacePlatformDeviceEntities(entities)
  syncConnectorStoreFromDeviceEntities(entities)
}

// 执行计算并跳转到结果页
const startCalculation = async (clearAll: boolean = false) => {
  recalculationConfirmationVisible.value = false
  const invalidStep = stepOrder.value
    .filter((step): step is Exclude<typeof step, 'result'> => step !== 'result')
    .find(step => !stepStatus.value[step])
  if (invalidStep) {
    const message = stepValidation.value[invalidStep] || '请先完成当前系统规划配置'
    activeStep.value = invalidStep
    calculationError.value = message
    appStore.showNotification({ type: 'error', message })
    return
  }

  const equalizerValidationMessage = validatePlannedEqualizers()
  if (equalizerValidationMessage) {
    calculationError.value = equalizerValidationMessage
    appStore.showNotification({ type: 'error', message: equalizerValidationMessage })
    activeStep.value = 'link'
    return
  }

  const pendingStep = stepOrder.value
    .filter((step): step is ConfigStepId => step !== 'result')
    .find(step => !isPlanningStepSaved(step) && step !== lastConfigStep.value)
  if (pendingStep) {
    activeStep.value = pendingStep
    const message = `请先保存“${steps.value.find(step => step.id === pendingStep)?.label || pendingStep}”步骤`
    calculationError.value = message
    appStore.showNotification({ type: 'error', message })
    return
  }

  if (platformConfigSaving.value) return
  const projectId = platformProjectId.value
  if (projectId == null) {
    calculationError.value = '当前工程未关联平台项目，无法调用系统规划接口'
    appStore.showNotification({ type: 'error', message: calculationError.value })
    return
  }
  const fiberModel = selectedFiberModel.value
  if (!fiberModel) {
    calculationError.value = '当前没有可用的光纤计算模型，无法计算'
    appStore.showNotification({ type: 'error', message: calculationError.value })
    return
  }
  const amplifierModel = selectedAmplifierModel.value
  if (!amplifierModel) {
    calculationError.value = '当前没有可用的放大器计算模型，无法计算'
    appStore.showNotification({ type: 'error', message: calculationError.value })
    return
  }

  try {
    // 最后一个配置页的主按钮就是“开始计算”，先提交该页的最后一次保存。
    await savePlanningStep(lastConfigStep.value as ConfigStepId)
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存链路配置失败'
    calculationError.value = message
    appStore.showNotification({ type: 'error', message })
    return
  }

  isCalculating.value = true
  calculationError.value = ''
  calculationResult.value = null
  platformLayoutResult.value = null
  platformCalculationCompleted.value = false
  calculationProgress.value = 5
  calculationProgress.message = '正在提交系统规划任务'
  calculationProgress.value = 8
  activeStep.value = 'result'
  try {
    const devices: Array<{
      id: string
      name: string
      type: string
      kp: number
      equalizerRole?: 'T' | 'S'
      attenuationMode?: 'adjustable' | 'fixed'
      attenuationDb?: number
    }> = []
    const info = linkInfo.value
    routeConnectorElements.value
      .filter(element => (element.type === 'landing'
        || element.type === 'underwater'
        || element.type === 'bu')
        && Number.isFinite(element.kp))
      .forEach(element => devices.push({
        id: element.id,
        name: element.name,
        type: element.type,
        kp: element.kp,
      }))

    plannedEqualizers.value
      .map(equalizer => normalizeEqualizerConfig(equalizer))
      .sort((a, b) => a.kp - b.kp)
      .forEach(eq => {
        devices.push({
          id: eq.id || eq.tempId,
          name: eq.name,
          type: 'equalizer',
          kp: eq.kp,
          equalizerRole: eq.equalizerRole,
          attenuationMode: eq.attenuationMode,
          attenuationDb: eq.attenuationDb,
        })
      })
    devices.sort((a, b) => a.kp - b.kp)

    const spanStrategyPayload = spanStrategy.value === 'fixed'
      ? { mode: 'fixed' as const }
      : {
          mode: 'scan' as const,
          scanRange: {
            min: finiteNumberValue(spanScanConfig.min, 40),
            max: finiteNumberValue(spanScanConfig.max, 120),
            step: finiteNumberValue(spanScanConfig.step, 5),
          },
        }

    const fiberType = selectedFiberEntity.value
    const ampType = selectedAmplifierEntity.value
    calculationProgress.value = 9
    calculationProgress.message = '正在保存光纤与放大器模板'
    const persistedTemplates = await persistPlanningTemplates(projectId)
    const totalLengthKm = info?.trunkLength || info?.totalLength || 0
    if (!Number.isFinite(totalLengthKm) || totalLengthKm <= 0) {
      throw new Error('后端仿真缺少有效链路总长度')
    }

    const response = await runSimulation({
      projectId,
      clearAll,
      fmmPathResultIndex: selectedFmmPathResultIndex.value,
      linkId: selectedRouteId.value,
      linkName: `${info?.startStation || '起点'} ⇄ ${info?.endStation || '终点'}`,
      totalLengthKm,
      fiberModel,
      amplifierModel,
      fiberParams: {
        attenuation: fiberParams.attenuation,
        effectiveArea: fiberParams.effectiveArea,
        dispersion: fiberParams.dispersion,
        dispersionSlope: fiberParams.dispersionSlope,
        nonlinearIndex: fiberParams.nonlinearIndex,
        nonlinearCoeff: fiberParams.nonlinearCoeff,
        fiberName: fiberType?.name ?? undefined,
        ...(fiberModel === 'SSFM' ? {
          ssfmParams: {
            stepSize: ssfmParams.stepSize,
            samplePoints: ssfmParams.samplePoints,
            maxIterations: ssfmParams.maxIterations,
          }
        } : {}),
      },
      amplifierParams: {
        gain: amplifierParams.gain,
        noiseFigure: amplifierParams.noiseFigure,
        maxOutputPower: amplifierParams.maxOutputPower,
        saturationPower: amplifierParams.saturationPower,
        equalizerUnitPrice: settingsStore.costFactors.equalizerCost,
        amplifierName: ampType?.name ?? undefined,
      },
      channelConfig: { ...channelConfig },
      optimizationConfig: buildPlatformOptimizationConfig(),
      spanKm: finiteNumberValue(spanKm.value, 70),
      spanStrategy: spanStrategyPayload,
      constraints: {
        minSpanLength: finiteNumberValue(constraints.minSpanLength, 30),
        maxSpanLength: finiteNumberValue(constraints.maxSpanLength, 100),
        osnrMargin: finiteNumberValue(constraints.osnrMargin, 1),
      },
      buConfigs: buConfigs.value.map(bu => ({
        id: bu.id,
        name: bu.name,
        kp: bu.kp,
        portCount: bu.portCount,
        trunkLoss: bu.trunkLoss,
        branchLoss: bu.branchLoss,
      })),
      deviceSequence: devices,
      prepareSimulationDevices: context => prepareLayoutEntitiesForSimulation(
        context,
        projectId,
        persistedTemplates,
      ),
      onProgress: update => {
        calculationProgress.value = update.progress
        calculationProgress.message = update.message
      },
    })

    if (response.spanScanResult) {
      spanScanData.value = {
        linkId: selectedRouteId.value,
        scannedAt: new Date(),
        model: selectedFiberModel.value,
        gsnrPerSpanDb: response.spanScanResult.scanPoints.map(point => point.gsnrPerChannelDb),
        osnrPerSpanDb: response.spanScanResult.scanPoints.map(point => point.osnrPerChannelDb),
        ...response.spanScanResult,
      }
    }

    if (response.effectiveSpanKm != null) spanKm.value = response.effectiveSpanKm
    platformLayoutResult.value = parsePlatformLayoutResult(response.layoutResult)

    if (response.simulationCache) {
      settingsStore.updateSimulationCache(response.simulationCache)
    }

    const currentPlanningResults = settingsStore.platformPlanningResults
    settingsStore.updatePlatformPlanningResults({
      fixed: response.fixedLayoutResult
        ?? (spanStrategy.value === 'fixed' ? response.layoutResult : currentPlanningResults?.fixed ?? null),
      optimized: response.optimizedLayoutResult
        ?? (spanStrategy.value === 'auto' ? response.layoutResult : currentPlanningResults?.optimized ?? null),
      simulation: response.detailedResult,
      errors: [],
    })
    await syncCalculatedDeviceEntities(response, projectId, clearAll)
    platformCalculationCompleted.value = true

    const detailedResult = unwrapPlatformSimulationResult(response.detailedResult)
    if (isCalculationResult(detailedResult)) {
      calculationResult.value = {
        ...detailedResult,
        linkName: `${info?.startStation || '起点'} ⇄ ${info?.endStation || '终点'}`,
      }
    } else {
      calculationResult.value = null
      const layout = platformLayoutResult.value
      appStore.showNotification({
        type: 'success',
        message: layout
          ? `平台布局规划已完成：${layout.amplifierCount} 个放大器，${layout.spans.length} 个跨段；性能指标尚未返回，暂不能判定目标是否满足`
          : '后端规划已完成，结果已保存；暂未收到可识别的性能图表数据',
        duration: 5000,
      })
    }
    settingsStore.updateSystemPlanningCache(buildSystemPlanningCache())
  } catch (err: unknown) {
    calculationError.value = err instanceof Error ? err.message : '仿真计算失败，请检查后端服务是否启动'
  } finally {
    isCalculating.value = false
  }
}

const isCalculationResult = (value: unknown): value is CalculationResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Partial<CalculationResult>
  return Boolean(
    result.metrics
    && result.margin
    && result.systemConfig
    && result.performanceData
    && Array.isArray(result.amplifiers),
  )
}

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

const readValue = (record: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in record) return record[key]
  }
  return undefined
}

const readString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

const parsePlatformLayoutResult = (value: unknown): PlatformLayoutResult | null =>
  parsePlanningLayoutResult(value, spanStrategy.value === 'fixed' ? 'fixed' : 'optimized')

const unwrapPlatformSimulationResult = (value: unknown): unknown => {
  const parsed = parseMaybeJson(value)
  if (!isRecordValue(parsed)) return parsed
  for (const key of ['simulation_result.json', 'simulationResult', 'simulation_result', 'result', 'data']) {
    const candidate = parseMaybeJson(parsed[key])
    if (candidate != null) return candidate
  }
  return parsed
}

const readStrictNumberArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null
  const values = value.map(item => readNumber(item))
  return values.some(item => item == null) ? null : values as number[]
}

const readBooleanValue = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

const normalizeSpanScanResult = (value: unknown): SpanScanResult | null => {
  const parsed = parseMaybeJson(value)
  if (!isRecordValue(parsed)) return null

  const direct = isRecordValue(parsed.spanScanResult)
    ? parsed.spanScanResult
    : isRecordValue(parsed.span_scan_result)
      ? parsed.span_scan_result
      : parsed

  const spanLengthsRaw = readValue(direct, ['spanLengthsKm', 'span_lengths_km'])
  const scanPointsRaw = readValue(direct, ['scanPoints', 'scan_points'])
  const spanLengthsKm = readStrictNumberArray(spanLengthsRaw)
  const recommendedSpanKm = readNumber(readValue(direct, ['recommendedSpanKm', 'recommended_span_km']))
  const targetGsnrDb = readNumber(readValue(direct, ['targetGsnrDb', 'target_gsnr_db']))
  if (!spanLengthsKm || !Array.isArray(scanPointsRaw)
    || recommendedSpanKm == null || targetGsnrDb == null) return null

  const scanPoints = scanPointsRaw
    .map((point): ScanPoint | null => {
      const record = parseMaybeJson(point)
      if (!isRecordValue(record)) return null
      const spanLengthKm = readNumber(readValue(record, ['spanLengthKm', 'span_length_km']))
      const gsnrPerChannelDb = readStrictNumberArray(readValue(record, ['gsnrPerChannelDb', 'gsnr_per_channel_db']))
      const osnrPerChannelDb = readStrictNumberArray(readValue(record, ['osnrPerChannelDb', 'osnr_per_channel_db']))
      const avgGsnrDb = readNumber(readValue(record, ['avgGsnrDb', 'avg_gsnr_db']))
      const minGsnrDb = readNumber(readValue(record, ['minGsnrDb', 'min_gsnr_db']))
      const avgOsnrDb = readNumber(readValue(record, ['avgOsnrDb', 'avg_osnr_db']))
      const meetTarget = readBooleanValue(readValue(record, ['meetTarget', 'meet_target']))
      const gsnrMarginDb = readNumber(readValue(record, ['gsnrMarginDb', 'gsnr_margin_db']))
      if (spanLengthKm == null || !gsnrPerChannelDb || !osnrPerChannelDb
        || gsnrPerChannelDb.length !== osnrPerChannelDb.length
        || avgGsnrDb == null || minGsnrDb == null || avgOsnrDb == null
        || meetTarget == null || gsnrMarginDb == null) return null
      const normalizedPoint: ScanPoint = {
        spanLengthKm,
        gsnrPerChannelDb,
        osnrPerChannelDb,
        avgGsnrDb,
        minGsnrDb,
        avgOsnrDb,
        meetTarget,
        gsnrMarginDb,
      }
      const numAmplifiers = readNumber(readValue(record, ['numAmplifiers', 'num_amplifiers']))
      if (numAmplifiers != null) normalizedPoint.numAmplifiers = numAmplifiers
      return normalizedPoint
    })
    .filter((point): point is ScanPoint => Boolean(point))

  const channelCount = scanPoints[0]?.gsnrPerChannelDb.length ?? 0
  if (scanPoints.length !== scanPointsRaw.length || scanPoints.length !== spanLengthsKm.length
    || scanPoints.some((point, index) => point.spanLengthKm !== spanLengthsKm[index]
      || point.gsnrPerChannelDb.length !== channelCount
      || point.osnrPerChannelDb.length !== channelCount)) return null

  const scannedAtRaw = readValue(direct, ['scannedAt', 'scanned_at'])
  const scannedAt = typeof scannedAtRaw === 'string' || typeof scannedAtRaw === 'number'
    ? new Date(scannedAtRaw)
    : new Date()
  const feasibleRangeRaw = readValue(direct, ['feasibleRange', 'feasible_range'])
  const feasibleRange = Array.isArray(feasibleRangeRaw)
    ? feasibleRangeRaw.map(value => readNumber(value)).filter((value): value is number => value != null)
    : []

  return {
    linkId: readString(readValue(direct, ['linkId', 'link_id']), selectedRouteId.value),
    scannedAt: Number.isNaN(scannedAt.getTime()) ? new Date() : scannedAt,
    model: readString(readValue(direct, ['model']), selectedFiberModel.value),
    spanLengthsKm,
    gsnrPerSpanDb: scanPoints.map(point => point.gsnrPerChannelDb),
    osnrPerSpanDb: scanPoints.map(point => point.osnrPerChannelDb),
    recommendedSpanKm,
    targetGsnrDb,
    feasibleRange: feasibleRange.length >= 2 ? [feasibleRange[0], feasibleRange[1]] : null,
    scanPoints,
  }
}

const selectCachedPlanningLayout = (): PlatformLayoutResult | null => {
  const results = settingsStore.platformPlanningResults
  return selectPlanningLayoutResult(
    results,
    spanStrategy.value === 'fixed' ? 'fixed' : 'optimized',
  )
}

const restoreCachedPlanningResult = (): boolean => {
  const results = settingsStore.platformPlanningResults
  const cache = settingsStore.systemPlanningCache
  const restoredLayout = selectCachedPlanningLayout()
  platformLayoutResult.value = restoredLayout
  if (restoredLayout?.mode.toLowerCase() === 'fixed') {
    spanStrategy.value = 'fixed'
    if (restoredLayout.spanKmUsed != null && restoredLayout.spanKmUsed > 0) {
      spanKm.value = restoredLayout.spanKmUsed
    }
  }
  const restoredSimulation = unwrapPlatformSimulationResult(results?.simulation)
  const normalizedSimulation = settingsStore.simulationCache?.is_valid
    ? settingsStore.simulationCache
    : normalizePlatformSimulationCache(restoredSimulation)
  if (normalizedSimulation && normalizedSimulation !== settingsStore.simulationCache) {
    settingsStore.updateSimulationCache(normalizedSimulation)
  }
  const restoredCalculation = isCalculationResult(restoredSimulation)
    ? restoredSimulation
    : null
  const restoredSpanScan = normalizeSpanScanResult(restoredSimulation)
    ?? normalizeSpanScanResult(results?.simulation)

  if (!restoredLayout && !restoredCalculation && !restoredSpanScan && !cache?.is_valid) {
    return false
  }

  const info = linkInfo.value
  calculationResult.value = restoredCalculation
    ? {
        ...restoredCalculation,
        linkName: `${info?.startStation || '起点'} ⇄ ${info?.endStation || '终点'}`,
      }
    : null
  spanScanData.value = restoredSpanScan
  platformCalculationCompleted.value = true
  return true
}

const buildConfigHash = (): string => {
  const text = JSON.stringify({
    routeId: selectedRouteId.value,
    fiberModel: selectedFiberModel.value,
    amplifierModel: selectedAmplifierModel.value,
    fiberTypeId: selectedFiberTypeId.value,
    amplifierTypeId: selectedAmplifierTypeId.value,
    fiberDeviceValues: fiberDeviceValues.value,
    amplifierDeviceValues: amplifierDeviceValues.value,
    channelConfig,
    optimizationConfig,
    spanStrategy: spanStrategy.value,
    spanKm: spanKm.value,
    buConfigs: buConfigs.value.map(bu => ({ id: bu.id, componentRefId: bu.componentRefId })),
  })
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return `local-${Math.abs(hash).toString(36)}`
}

const buildSystemPlanningCache = (): SystemPlanningCache => {
  const now = new Date().toISOString()
  const info = linkInfo.value
  const configuredSpan = finiteNumberValue(spanKm.value, 70)
  const scanResult = spanScanData.value

  return {
    is_valid: true,
    timestamp: now,
    route_ref: {
      from_station: info?.startStation || selectedRouteId.value || '起点',
      to_station: info?.endStation || '终点',
      route_hash: buildConfigHash(),
    },
    config_hash: buildConfigHash(),
    device_selection: {
      fiber_spec_id: selectedFiberTypeId.value,
      edfa_spec_id: selectedAmplifierTypeId.value,
      bu_spec_id: buConfigs.value.find(bu => bu.componentRefId)?.componentRefId || null,
    },
    model_selection: {
      fiber_model_id: selectedFiberModel.value,
      edfa_model_id: selectedAmplifierModel.value,
      bu_model_id: buConfigs.value.find(bu => bu.componentRefId)?.componentRefId || null,
    },
    sweep_config: {
      span_length_min_km: spanStrategy.value === 'auto' ? finiteNumberValue(spanScanConfig.min, 40) : configuredSpan,
      span_length_max_km: spanStrategy.value === 'auto' ? finiteNumberValue(spanScanConfig.max, 120) : configuredSpan,
      span_step_km: spanStrategy.value === 'auto' ? finiteNumberValue(spanScanConfig.step, 5) : 0,
      target_gsnr_db: finiteNumberValue(optimizationConfig.targetGsnrDb, 14),
    },
    sweep_results: {
      span_lengths_km: scanResult?.spanLengthsKm ?? [],
      gsnr_per_span_db: scanResult?.scanPoints.map(point => point.gsnrPerChannelDb) ?? [],
      osnr_per_span_db: scanResult?.scanPoints.map(point => point.osnrPerChannelDb) ?? [],
      feasible_range_km: scanResult?.feasibleRange ?? null,
      recommended_span_km: scanResult?.recommendedSpanKm ?? null,
    },
    user_decision: null,
    final_plan_cache: settingsStore.systemPlanningCache?.final_plan_cache ?? null,
  }
}

const buildLayoutAmplifierInfos = (layout: PlatformLayoutResult): AmplifierInfo[] => {
  return resolveLayoutAmplifiers(layout)
    .map(node => ({
      id: node.nodeId,
      name: node.nodeName || node.nodeId,
      position: node.positionKm,
      precedingSpan: node.precedingSpanKm,
      gain: null,
      noiseFigure: null,
      outputPower: null,
      inputPower: null,
      longitude: node.longitude ?? undefined,
      latitude: node.latitude ?? undefined,
    }))
}

const platformLayoutTailSpanKm = computed(() => {
  const layout = platformLayoutResult.value
  if (!layout?.spans.length) return null
  return layout.spans[layout.spans.length - 1].lengthKm
})

interface ResultTimelineItem {
  id: string
  kind: 'start' | 'end' | 'amplifier' | 'bu'
  label: string
  positionKm: number
  icon: string
  amplifierIndex?: number
  detail?: string
}

interface ResultMetricSummary {
  min: number
  max: number
  avg: number
}

interface ResultMetrics {
  osnr: ResultMetricSummary
  gsnr: ResultMetricSummary
  power: ResultMetricSummary
  nli: ResultMetricSummary
  qFactor: ResultMetricSummary
}

interface ResultPerformanceData {
  channelFrequencies: number[]
  endOsnrSpectrum: number[]
  endGsnrSpectrum: number[]
  endPowerSpectrum: number[]
  endNliSpectrum: number[]
  positions: number[]
  positionNames: string[]
  osnrEvolution: number[]
  gsnrEvolution: number[]
  worstChannelIndex: number
}

interface ResultCostData {
  cableCost: number
  amplifierCost: number
  buCost: number
  equalizerCost: number
  totalCost: number
  costItems: CostItem[]
}

const hasFiniteMetricSummary = (summary: ResultMetricSummary | undefined): summary is ResultMetricSummary => {
  if (!summary) return false
  return [summary.min, summary.max, summary.avg].every(value => Number.isFinite(value))
}

const resultMetrics = computed<ResultMetrics | null>(() => {
  const metrics = calculationResult.value?.metrics
  if (!metrics
    || !hasFiniteMetricSummary(metrics.osnr)
    || !hasFiniteMetricSummary(metrics.gsnr)
    || !hasFiniteMetricSummary(metrics.power)
    || !hasFiniteMetricSummary(metrics.nli)
    || !hasFiniteMetricSummary(metrics.qFactor)) {
    return null
  }
  return {
    osnr: { ...metrics.osnr },
    gsnr: { ...metrics.gsnr },
    power: { ...metrics.power },
    nli: { ...metrics.nli },
    qFactor: { ...metrics.qFactor },
  }
})

const resultPerformanceData = computed<ResultPerformanceData | null>(() => {
  const data = calculationResult.value?.performanceData
  if (!data) return null
  return {
    channelFrequencies: Array.isArray(data.channelFrequencies) ? [...data.channelFrequencies] : [],
    endOsnrSpectrum: Array.isArray(data.endOsnrSpectrum) ? [...data.endOsnrSpectrum] : [],
    endGsnrSpectrum: Array.isArray(data.endGsnrSpectrum) ? [...data.endGsnrSpectrum] : [],
    endPowerSpectrum: Array.isArray(data.endPowerSpectrum) ? [...data.endPowerSpectrum] : [],
    endNliSpectrum: Array.isArray(data.endNliSpectrum) ? [...data.endNliSpectrum] : [],
    positions: Array.isArray(data.positions) ? [...data.positions] : [],
    positionNames: Array.isArray(data.positionNames) ? [...data.positionNames] : [],
    osnrEvolution: Array.isArray(data.osnrEvolution) ? [...data.osnrEvolution] : [],
    gsnrEvolution: Array.isArray(data.gsnrEvolution) ? [...data.gsnrEvolution] : [],
    worstChannelIndex: data.worstChannelIndex,
  }
})

const resultHasPerformanceMetrics = computed(() => resultMetrics.value !== null)

const resultTotalLength = computed(() => {
  const fromLayout = platformLayoutResult.value?.totalLengthKm
  if (typeof fromLayout === 'number' && Number.isFinite(fromLayout) && fromLayout > 0) return fromLayout
  const fromCalculation = calculationResult.value?.totalLength
  if (typeof fromCalculation === 'number' && Number.isFinite(fromCalculation) && fromCalculation > 0) {
    return fromCalculation
  }
  return null
})

const resultSpanUsed = computed<number | null>(() => {
  const value = platformLayoutResult.value?.spanKmUsed
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
})

const resultAmplifiers = computed(() => {
  const layoutAmplifiers = platformLayoutResult.value
    ? buildLayoutAmplifierInfos(platformLayoutResult.value)
    : []
  const calculationAmplifiers = calculationResult.value?.amplifiers ?? []
  if (layoutAmplifiers.length === 0) {
    return calculationAmplifiers.map(amplifier => ({ ...amplifier }))
  }
  const performanceByNodeId = new Map(calculationAmplifiers
    .filter(amplifier => amplifier.id)
    .map(amplifier => [amplifier.id, amplifier]))
  return layoutAmplifiers.map(layoutAmplifier => {
    const performance = performanceByNodeId.get(layoutAmplifier.id)
    return {
      ...layoutAmplifier,
      gain: performance?.gain ?? layoutAmplifier.gain,
      noiseFigure: performance?.noiseFigure ?? layoutAmplifier.noiseFigure,
      outputPower: performance?.outputPower ?? layoutAmplifier.outputPower,
      inputPower: performance?.inputPower ?? layoutAmplifier.inputPower,
      deviceModel: performance?.deviceModel,
      gainFlatness: performance?.gainFlatness ?? null,
    }
  })
})

const resultAverageSpan = computed(() => {
  const value = calculationResult.value?.systemConfig.avgSpanLength
  return typeof value === 'number' && Number.isFinite(value) ? value : null
})

const resultTimeline = computed<ResultTimelineItem[]>(() => {
  const info = linkInfo.value
  const totalLength = resultTotalLength.value
  const items: ResultTimelineItem[] = [
    {
      id: 'result-start',
      kind: 'start',
      label: info?.startStation || '起点',
      positionKm: 0,
      icon: getSystemDeviceIcon('landing'),
    },
  ]

  resultAmplifiers.value.forEach((amplifier, index) => {
    items.push({
      id: `result-amplifier-${amplifier.id || index}`,
      kind: 'amplifier',
      label: amplifier.name,
      positionKm: Math.max(0, Number(amplifier.position) || 0),
      icon: getSystemDeviceIcon('amplifier_e'),
      amplifierIndex: index,
      detail: `${amplifier.name} · KP ${(Number(amplifier.position) || 0).toFixed(1)} km`,
    })
  })

  const buCandidates = (platformLayoutResult.value?.nodes ?? [])
    .filter(node => ['bu', 'branching', 'branching_unit'].includes(node.nodeType.trim().toLowerCase()))
    .map(node => ({ id: node.nodeId, name: node.nodeName, kp: node.positionKm, detail: '后端布局 BU' }))
  buCandidates.forEach((bu, index) => {
    if (typeof bu.kp !== 'number' || !Number.isFinite(bu.kp)) return
    const kp = bu.kp
    const duplicate = items.some(item => item.kind === 'bu'
      && (item.id === bu.id || (Math.abs(item.positionKm - kp) <= 0.2 && item.label === bu.name)))
    if (duplicate) return
    items.push({
      id: bu.id || `result-bu-${index + 1}`,
      kind: 'bu',
      label: bu.name || `BU-${String(index + 1).padStart(2, '0')}`,
      positionKm: Math.max(0, kp),
      icon: getSystemDeviceIcon('bu'),
      detail: bu.detail,
    })
  })

  items.push({
    id: 'result-end',
    kind: 'end',
    label: info?.endStation || '终点',
    positionKm: Math.max(0, totalLength ?? 0),
    icon: getSystemDeviceIcon('landing'),
  })

  const kindOrder: Record<ResultTimelineItem['kind'], number> = { start: 0, amplifier: 1, bu: 2, end: 3 }
  return items.sort((left, right) => left.positionKm - right.positionKm || kindOrder[left.kind] - kindOrder[right.kind])
})

const resultCostData = computed<ResultCostData | null>(() => {
  const existing = calculationResult.value?.costData
  if (existing) {
    return {
      cableCost: existing.cableCost,
      amplifierCost: existing.amplifierCost,
      buCost: existing.buCost,
      equalizerCost: existing.equalizerCost,
      totalCost: existing.totalCost,
      costItems: [...existing.costItems],
    }
  }
  return null
})

const hasPlanningResult = computed(() =>
  platformCalculationCompleted.value && Boolean(calculationResult.value || platformLayoutResult.value),
)

const optimizationTargetLabel = computed(() => platformLayoutResult.value?.mode || '-')

const resultStatus = computed<'success' | 'failed' | 'calculating' | 'unknown'>(() => {
  if (calculationResult.value?.status) return calculationResult.value.status
  const status = platformLayoutResult.value?.status.trim().toLowerCase()
  if (status === 'success' || status === 'failed' || status === 'calculating') return status
  return 'unknown'
})

const closeWithResult = () => {
  emit('apply-result', {
    calculationResult: calculationResult.value,
    layoutResult: platformLayoutResult.value,
    spanScanData: spanScanData.value,
  })
  emit('close')
}

// 重新计算
const dismissRecalculationConfirmation = (restoreFocus = true) => {
  recalculationConfirmationVisible.value = false
  if (!restoreFocus || !recalculationReturnFocus) return
  const returnFocus = recalculationReturnFocus
  void nextTick(() => returnFocus.focus())
}

const recalculate = () => {
  if (isCalculating.value || platformConfigSaving.value) return
  recalculationReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  recalculationConfirmationVisible.value = true
  void nextTick(() => {
    recalculationConfirmationDialog.value
      ?.querySelector<HTMLButtonElement>('[data-recalculation-cancel]')
      ?.focus()
  })
}

const confirmRecalculation = (clearAll: boolean) => {
  dismissRecalculationConfirmation(false)
  void startCalculation(clearAll)
}

const handleRecalculationConfirmationKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    dismissRecalculationConfirmation()
    return
  }
  if (event.key !== 'Tab') return

  const focusable = Array.from(
    recalculationConfirmationDialog.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
  )
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch([() => props.visible, isCalculating], ([visible, calculating]) => {
  if (!visible || calculating) dismissRecalculationConfirmation(false)
})


// 初始化
watch(() => props.visible, async (visible) => {
  const initializationSequence = ++planningDeviceInitializationSequence
  if (visible) {
    initializingPlanningDevices.value = true
    try {
      resetLinkConfig()
      routeStore.syncConfiguredStationNames()

      // FIB/AMP 下拉只读取当前项目的器件实体；计算模型来自对应字典。
      await Promise.all([
        loadFiberCalculationModels(),
        loadAmplifierCalculationModels(),
        loadPlanningDeviceEntities('fiber'),
        loadPlanningDeviceEntities('amplifier'),
      ])
      if (initializationSequence !== planningDeviceInitializationSequence || !props.visible) return

      // 加载当前选中的路由规划结果及本地表单快照。
      selectedRouteId.value = routeStore.currentRouteId || ''
      await restorePlanningFormSnapshot()
      if (fiberModelLoaded.value
        && selectedFiberModel.value
        && !fiberModelOptions.value.some(item => item.value === selectedFiberModel.value)) {
        selectedFiberModel.value = ''
      }
      if (amplifierModelLoaded.value
        && selectedAmplifierModel.value
        && !amplifierModelOptions.value.some(item => item.value === selectedAmplifierModel.value)) {
        selectedAmplifierModel.value = ''
      }
      const restoredFiberTypeId = selectedFiberTypeId.value
      const restoredAmplifierTypeId = selectedAmplifierTypeId.value
      const restoredFiberValues = { ...fiberDeviceValues.value }
      const restoredAmplifierValues = { ...amplifierDeviceValues.value }

      // 缓存器件已被删除时回退到当前项目同类型器件首项。
      if (fiberDeviceEntities.value.length > 0 && !selectedFiberEntity.value) {
        selectedFiberTypeId.value = String(fiberDeviceEntities.value[0].id)
      }
      if (amplifierDeviceEntities.value.length > 0 && !selectedAmplifierEntity.value) {
        selectedAmplifierTypeId.value = String(amplifierDeviceEntities.value[0].id)
      }

      await Promise.all([
        loadPlanningDeviceConfigs(
          'fiber',
          selectedFiberTypeId.value,
          selectedFiberTypeId.value === restoredFiberTypeId ? restoredFiberValues : {},
        ),
        loadPlanningDeviceConfigs(
          'amplifier',
          selectedAmplifierTypeId.value,
          selectedAmplifierTypeId.value === restoredAmplifierTypeId ? restoredAmplifierValues : {},
        ),
      ])
      if (initializationSequence !== planningDeviceInitializationSequence || !props.visible) return

      markRestoredPlanningStepsSaved()
      const restored = restoreCachedPlanningResult()
      if (restored) markRestoredPlanningStepsSaved()
      activeStep.value = restored ? 'result' : resolveRestoredConfigStep()
      void nextTick(() => {
        loadPlannedEqualizers()
      })
    } finally {
      if (initializationSequence === planningDeviceInitializationSequence) {
        initializingPlanningDevices.value = false
      }
    }
  } else {
    fiberModelRequestSequence += 1
    amplifierModelRequestSequence += 1
    deviceEntityRequestSequence.fiber += 1
    deviceEntityRequestSequence.amplifier += 1
    deviceConfigRequestSequence.fiber += 1
    deviceConfigRequestSequence.amplifier += 1
    fiberModelLoading.value = false
    amplifierModelLoading.value = false
    initializingPlanningDevices.value = false
  }
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible" 
      class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      @click.self="$emit('close')"
    >
      <div class="system-planning-dialog flex h-[calc(100vh-1rem)] w-[1180px] max-w-full flex-col rounded-lg bg-white shadow-2xl sm:h-[min(900px,92vh)]">
        <!-- 标题栏 -->
        <div class="planning-header flex items-center justify-between border-b bg-white px-4 py-3 sm:px-7 sm:py-4">
          <div class="flex items-center gap-3">
            <div class="planning-header-icon flex h-9 w-9 items-center justify-center rounded-md bg-blue-600">
              <Cpu class="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">系统规划 – 链路配置</h2>
              <p class="text-xs text-gray-500">{{ activeStepSubtitle }} · {{ currentStepPosition }}/{{ stepOrder.length }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div v-if="linkInfo" class="hidden text-right sm:block">
              <div class="text-xs text-gray-400">当前链路</div>
              <div class="max-w-[260px] truncate text-sm font-medium text-gray-700">{{ linkInfo.name }}</div>
            </div>
          <button 
            class="rounded-md p-2 transition-colors hover:bg-gray-100"
            aria-label="关闭系统规划"
            @click="$emit('close')"
          >
            <X class="w-5 h-5 text-gray-500" />
          </button>
          </div>
        </div>
        
        <!-- 主体内容 -->
        <div class="flex min-h-0 flex-1 flex-col md:flex-row">
          <!-- 左侧导航 -->
          <div class="planning-sidebar flex w-full flex-col border-b bg-[#f7f8fa] md:w-60 md:border-b-0 md:border-r">
            <div class="hidden border-b px-5 py-4 md:block">
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-gray-800">配置流程</span>
                <span class="text-xs font-medium text-gray-400">{{ completionPercentage }}%</span>
              </div>
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div class="h-full rounded-full bg-blue-600 transition-all duration-300" :style="{ width: `${completionPercentage}%` }" />
              </div>
            </div>
            
            <!-- 步骤列表 -->
            <div class="flex flex-none gap-1 overflow-x-auto p-2 md:block md:flex-1 md:space-y-0.5 md:p-3">
              <button
                v-for="step in steps"
                :key="step.id"
                class="planning-step-button flex min-w-[145px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors md:w-full md:min-w-0"
                :class="[
                  activeStep === step.id ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-white',
                ]"
                @click="navigateToPlanningStep(step.id)"
              >
                <span
                  class="planning-step-number flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold"
                  :class="activeStep === step.id ? 'bg-white/20 text-white' : isPlanningStepSaved(step.id) ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'"
                >
                  <Check v-if="isPlanningStepSaved(step.id) && activeStep !== step.id" class="h-4 w-4" />
                  <component v-else-if="activeStep !== step.id" :is="step.icon" class="h-4 w-4" />
                  <span v-else>{{ currentStepPosition }}</span>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ step.label }}</span>
                  <span class="block truncate text-[11px]" :class="activeStep === step.id ? 'text-blue-100' : 'text-gray-400'">{{ planningStepStatusLabel(step.id) }}</span>
                </span>
                <AlertCircle v-if="step.id !== 'result' && stepValidation[step.id]" class="h-4 w-4 flex-none text-amber-500" />
              </button>
            </div>
            
            <!-- 配置完整度 -->
            <div class="hidden border-t px-5 py-4 md:block">
              <div class="text-xs text-gray-500">当前链路</div>
              <div class="mt-2 truncate text-xs text-gray-700">{{ linkInfo?.startStation || '起点' }} ⇄ {{ linkInfo?.endStation || '终点' }}</div>
            </div>
          </div>
          
          <!-- 右侧内容区 -->
          <div class="planning-main flex min-h-0 min-w-0 flex-1 flex-col">
            <div class="planning-scroll flex-1 overflow-auto bg-[#f6f8fb] p-4 sm:p-7">
              <!-- Step 1: 链路选择 -->
              <div v-if="activeStep === 'link'" class="planning-section space-y-5">
                <div class="planning-section-heading">
                  <div>
                    <div class="text-xs font-semibold uppercase text-blue-600">01 / 链路选择</div>
                    <h3 class="mt-1 text-xl font-semibold text-gray-900">选择规划链路</h3>
                  </div>
                  <div v-if="linkInfo" class="hidden text-right sm:block">
                    <div class="text-xs text-gray-400">路由方案</div>
                    <div class="text-sm font-medium text-gray-700">{{ linkInfo.routeName || linkInfo.name }}</div>
                  </div>
                </div>
                
                <div class="planning-route-select">
                  <div>
                    <label class="mb-2 block text-xs font-semibold text-gray-500">规划链路</label>
                    <Select 
                      v-model="selectedRouteId" 
                      :options="routeOptions" 
                      placeholder="选择路由..."
                      class="w-full"
                    />
                  </div>
                </div>
                
                <!-- 链路基本信息 -->
                <div v-if="linkInfo" class="planning-info-panel">
                  <div class="mb-4 flex items-center justify-between">
                    <div class="text-sm font-semibold text-gray-800">链路基本信息</div>
                    <span class="planning-status-dot"><CheckCircle2 class="h-3.5 w-3.5" /> 已读取</span>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div class="planning-metric"><span>链路名称</span><strong>{{ linkInfo.name }}</strong></div>
                    <div class="planning-metric">
                      <span>总长度</span>
                      <strong>{{ linkInfo.totalLength == null ? '-' : linkInfo.totalLength.toFixed(1) }} <em v-if="linkInfo.totalLength != null">km</em></strong>
                    </div>
                    <div class="planning-metric"><span>起点站</span><strong>{{ linkInfo.startStation }}</strong></div>
                    <div class="planning-metric"><span>终点站</span><strong>{{ linkInfo.endStation }}</strong></div>
                    <div class="planning-metric"><span>经过 BU</span><strong>{{ linkInfo.buCount }} 个</strong><small>{{ linkInfo.buNames }}</small></div>
                    <div class="planning-metric"><span>创建时间</span><strong>{{ linkInfo.createdAt }}</strong></div>
                  </div>
                </div>
                
                <!-- 链路拓扑预览 -->
                <div v-if="linkInfo" class="planning-topology-panel">
                  <div class="mb-4">
                    <div class="text-sm font-semibold text-gray-800">链路设备拓扑</div>
                    <div class="mt-1 text-xs text-gray-500">路由规划中的站点与 BU 连接关系</div>
                  </div>
                  <div class="overflow-x-auto pb-2">
                    <div class="planning-topology-track" :style="{ minWidth: topologyTrackWidth }">
                      <template v-for="(node, index) in linkTopologyNodes" :key="node.id">
                        <div class="planning-topology-node">
                          <div
                            class="planning-topology-icon-wrap"
                            :class="node.kind === 'bu' ? 'planning-topology-icon-wrap--bu' : 'planning-topology-icon-wrap--station'"
                          >
                            <GitBranch v-if="node.kind === 'bu'" class="h-5 w-5" />
                            <MapPin v-else class="h-5 w-5" />
                          </div>
                          <div class="planning-topology-name" :title="node.name">{{ node.name }}</div>
                          <div class="planning-topology-role">{{ node.role }}</div>
                        </div>
                        <ChevronRight
                          v-if="index < linkTopologyNodes.length - 1"
                          class="planning-topology-arrow"
                          aria-hidden="true"
                        />
                      </template>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Step 2: 计算模型选择 -->
                <div v-if="activeStep === 'link'" class="planning-section planning-equalizer-section space-y-4">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <div class="text-sm font-medium text-gray-700">均衡器落位</div>
                      <div class="text-xs text-gray-500 mt-1">系统规划地图显示均衡器。接头盒只在接线元和 SLD 中维护，不在这里落位。</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="platformEqualizerLibraries.length === 0"
                      @click="addPlannedEqualizer"
                    >
                      <Plus class="w-4 h-4 mr-1" />
                      添加均衡器
                    </Button>
                  </div>

                  <div v-if="platformEqualizerLibraries.length === 0" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    器件库里还没有均衡器型号，请先到器件库管理补充型号。
                  </div>

                  <div v-else-if="plannedEqualizers.length === 0" class="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-500 text-center">
                    当前链路未配置均衡器。
                  </div>

                  <div v-else class="space-y-3">
                    <div
                      v-for="(eq, index) in plannedEqualizers"
                      :key="eq.tempId"
                      class="rounded-lg border bg-white p-3"
                    >
                      <div class="grid grid-cols-12 gap-3 items-end">
                        <div class="col-span-2">
                          <label class="block text-xs text-gray-500 mb-1">名称</label>
                          <Input v-model="eq.name" class="w-full" />
                        </div>
                        <div class="col-span-2">
                          <label class="block text-xs text-gray-500 mb-1">KP (km)</label>
                          <Input v-model.number="eq.kp" type="number" min="0" step="0.1" class="w-full" />
                        </div>
                        <div class="col-span-3">
                          <label class="block text-xs text-gray-500 mb-1">型号</label>
                          <Select v-model="eq.componentRefId" :options="equalizerTypeOptions" class="w-full" />
                        </div>
                        <div class="col-span-1">
                          <label class="block text-xs text-gray-500 mb-1">位号</label>
                          <Select v-model="eq.equalizerRole" :options="equalizerRoleOptions" class="w-full" />
                        </div>
                        <div class="col-span-2">
                          <label class="block text-xs text-gray-500 mb-1">模式</label>
                          <Select v-model="eq.attenuationMode" :options="equalizerModeOptions" class="w-full" />
                        </div>
                        <div class="col-span-1">
                          <label class="block text-xs text-gray-500 mb-1">dB</label>
                          <Input v-model.number="eq.attenuationDb" type="number" min="0" step="0.1" class="w-full" />
                        </div>
                        <div class="col-span-1 flex justify-end">
                          <Button variant="ghost" size="sm" class="text-red-600 hover:bg-red-50" @click="removePlannedEqualizer(eq.tempId)">
                            <Trash2 class="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div class="mt-2 text-xs text-gray-400">
                        均衡器 {{ index + 1 }} 会在应用配置后写入接线元，并同步到 SLD。
                      </div>
                    </div>
                  </div>
                </div>

              <div v-else-if="activeStep === 'model'" class="planning-section space-y-5">
                <h3 class="text-base font-semibold text-gray-800">计算模型选择</h3>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">光纤性能计算模型：</label>
                  <Select 
                    v-model="selectedFiberModel" 
                    :options="fiberModelOptions.map(o => ({ value: o.value, label: o.label }))"
                    :disabled="fiberModelLoading"
                    class="w-full"
                  />
                  <div v-if="fiberModelLoading" class="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                    正在加载光纤计算模型...
                  </div>
                  <div v-else-if="fiberModelError" class="mt-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                    {{ fiberModelError }}
                  </div>
                  <div v-else-if="selectedFiberModel" class="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                    {{ fiberModelOptions.find(o => o.value === selectedFiberModel)?.desc }}
                  </div>
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">放大器性能计算模型：</label>
                  <Select 
                    v-model="selectedAmplifierModel" 
                    :options="amplifierModelOptions.map(o => ({ value: o.value, label: o.label }))"
                    :disabled="amplifierModelLoading"
                    class="w-full"
                  />
                  <div v-if="amplifierModelLoading" class="mt-2 p-3 bg-purple-50 rounded-lg text-sm text-purple-700">
                    正在加载放大器计算模型...
                  </div>
                  <div v-else-if="amplifierModelError" class="mt-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                    {{ amplifierModelError }}
                  </div>
                  <div v-else-if="selectedAmplifierModel" class="mt-2 p-3 bg-purple-50 rounded-lg text-sm text-purple-700">
                    {{ amplifierModelOptions.find(o => o.value === selectedAmplifierModel)?.desc }}
                  </div>
                </div>
                
                <!-- SSFM 专属参数面板 -->
                <div v-if="selectedFiberModel === 'SSFM'" class="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div class="text-sm font-medium text-orange-800 mb-3">⚡ SSFM 仿真参数</div>
                  <div class="grid grid-cols-3 gap-4">
                    <div>
                      <label class="block text-xs text-gray-600 mb-1">步长 (m)</label>
                      <Input v-model.number="ssfmParams.stepSize" type="number" class="w-full" />
                      <p class="text-xs text-gray-400 mt-1">越小越精确，计算越慢</p>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-600 mb-1">采样点数</label>
                      <select v-model.number="ssfmParams.samplePoints" class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg">
                        <option :value="2048">2048</option>
                        <option :value="4096">4096 (推荐)</option>
                        <option :value="8192">8192 (高精度)</option>
                        <option :value="16384">16384</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-600 mb-1">最大迭代次数</label>
                      <Input v-model.number="ssfmParams.maxIterations" type="number" class="w-full" />
                    </div>
                  </div>
                  <div class="mt-3 p-2 bg-orange-100 rounded text-xs text-orange-700">
                    ⚠️ SSFM 计算量较大，长链路可能需要 10-60 秒。采样点数和步长影响精度与速度的平衡。
                  </div>
                </div>

                <div class="p-3 bg-amber-50 rounded-lg text-sm text-amber-700 flex items-start gap-2">
                  <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>💡 模型决定参数需求；器件仅用于匹配并回填已有参数</span>
                </div>
              </div>
              
              <!-- Step 3: 光纤配置 -->
              <div v-else-if="activeStep === 'fiber'" class="planning-section space-y-5">
                <h3 class="text-base font-semibold text-gray-800">光纤配置</h3>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">当前光纤器件：</label>
                  <Select
                    v-model="selectedFiberTypeId"
                    :options="fiberTypeOptions"
                    :disabled="deviceEntityLoading.fiber"
                    placeholder="从当前项目选择光纤器件..."
                    class="w-full"
                  />
                  <div v-if="deviceEntityLoading.fiber" class="mt-2 text-xs text-gray-500">
                    正在读取当前项目的 FIB 器件...
                  </div>
                  <div v-else-if="deviceEntityErrors.fiber" class="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {{ deviceEntityErrors.fiber }}
                  </div>
                  <div v-else-if="fiberDeviceEntities.length === 0" class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    当前项目没有 FIB 光纤器件
                  </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="mb-3 text-sm font-medium text-gray-700">器件动态属性</div>
                  <div v-if="!selectedFiberTypeId" class="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
                    请先选择光纤器件
                  </div>
                  <div v-else-if="deviceConfigLoading.fiber" class="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                    <RefreshCw class="h-4 w-4 animate-spin" />
                    正在加载 FIB 动态属性...
                  </div>
                  <div v-else-if="deviceConfigErrors.fiber" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {{ deviceConfigErrors.fiber }}
                  </div>
                  <DeviceDynamicValueForm
                    v-else
                    :configs="fiberDeviceConfigs"
                    :model-value="fiberDeviceValues"
                    value-scope="entity"
                    @update:model-value="updateFiberDeviceValues"
                  />
                </div>
              </div>
              
              <!-- Step 4: 放大器配置 -->
              <div v-else-if="activeStep === 'amplifier'" class="planning-section space-y-5">
                <h3 class="text-base font-semibold text-gray-800">放大器配置</h3>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">当前放大器器件：</label>
                  <Select
                    v-model="selectedAmplifierTypeId"
                    :options="amplifierTypeOptions"
                    :disabled="deviceEntityLoading.amplifier"
                    placeholder="从当前项目选择放大器器件..."
                    class="w-full"
                  />
                  <div v-if="deviceEntityLoading.amplifier" class="mt-2 text-xs text-gray-500">
                    正在读取当前项目的 AMP 器件...
                  </div>
                  <div v-else-if="deviceEntityErrors.amplifier" class="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {{ deviceEntityErrors.amplifier }}
                  </div>
                  <div v-else-if="amplifierDeviceEntities.length === 0" class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    当前项目没有 AMP 放大器器件
                  </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="mb-3 text-sm font-medium text-gray-700">器件动态属性</div>
                  <div v-if="!selectedAmplifierTypeId" class="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
                    请先选择放大器器件
                  </div>
                  <div v-else-if="deviceConfigLoading.amplifier" class="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                    <RefreshCw class="h-4 w-4 animate-spin" />
                    正在加载 AMP 动态属性...
                  </div>
                  <div v-else-if="deviceConfigErrors.amplifier" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {{ deviceConfigErrors.amplifier }}
                  </div>
                  <DeviceDynamicValueForm
                    v-else
                    :configs="amplifierDeviceConfigs"
                    :model-value="amplifierDeviceValues"
                    value-scope="entity"
                    @update:model-value="updateAmplifierDeviceValues"
                  />
                </div>
                
                <!-- Span 布局策略 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">Span 布局策略</div>
                  <div class="space-y-3">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        v-model="spanStrategy" 
                        value="auto"
                        class="text-blue-600"
                      />
                      <span class="text-sm">自动优化（推荐）</span>
                    </label>
                    <div v-if="spanStrategy === 'auto'" class="ml-6 space-y-2">
                      <p class="text-xs text-gray-500">系统在指定范围内迭代求解最优 span 长度</p>
                      <div class="flex items-center gap-3">
                        <div class="flex items-center gap-1">
                          <span class="text-xs text-gray-500">最小:</span>
                          <Input v-model.number="spanScanConfig.min" type="number" class="w-16" />
                          <span class="text-xs text-gray-500">km</span>
                        </div>
                        <div class="flex items-center gap-1">
                          <span class="text-xs text-gray-500">最大:</span>
                          <Input v-model.number="spanScanConfig.max" type="number" class="w-16" />
                          <span class="text-xs text-gray-500">km</span>
                        </div>
                        <div class="flex items-center gap-1">
                          <span class="text-xs text-gray-500">步长:</span>
                          <Input v-model.number="spanScanConfig.step" type="number" class="w-16" />
                          <span class="text-xs text-gray-500">km</span>
                        </div>
                      </div>
                      <p class="text-xs text-gray-400">
                        共 {{ Math.floor((spanScanConfig.max - spanScanConfig.min) / spanScanConfig.step) + 1 }} 个扫描点
                      </p>
                    </div>
                    
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        v-model="spanStrategy" 
                        value="fixed"
                        class="text-blue-600"
                      />
                      <span class="text-sm">固定间距</span>
                    </label>
                    <div v-if="spanStrategy === 'fixed'" class="flex items-center gap-2 ml-6">
                      <span class="text-xs text-gray-500">所有 span 使用固定长度：</span>
                      <Input v-model.number="spanKm" type="number" class="w-20" />
                      <span class="text-xs text-gray-500">km</span>
                    </div>
                  </div>
                </div>
                
                <!-- 优化目标与约束 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">优化目标与约束</div>
                  
                  <div class="mb-4">
                    <div class="text-xs text-gray-500 mb-2">优化目标：</div>
                    <div
                      class="inline-flex w-full max-w-sm rounded-md border border-gray-200 bg-white p-1"
                      role="group"
                      aria-label="优化目标"
                    >
                      <button
                        type="button"
                        class="min-h-9 flex-1 rounded px-3 text-sm font-medium transition-colors"
                        :class="optimizationTarget === 'min_amplifiers'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50'"
                        :aria-pressed="optimizationTarget === 'min_amplifiers'"
                        @click="optimizationTarget = 'min_amplifiers'"
                      >
                        最少放大器
                      </button>
                      <button
                        type="button"
                        class="min-h-9 flex-1 rounded px-3 text-sm font-medium transition-colors"
                        :class="optimizationTarget === 'max_gsnr'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50'"
                        :aria-pressed="optimizationTarget === 'max_gsnr'"
                        @click="optimizationTarget = 'max_gsnr'"
                      >
                        最大 GSNR
                      </button>
                    </div>
                  </div>
                  
                  <div class="border-t pt-4">
                    <div class="text-xs text-gray-500 mb-2">约束条件：</div>
                    <div class="grid grid-cols-2 gap-3">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 w-32">目标 OSNR (最小值)</span>
                        <Input v-model.number="optimizationConfig.targetOsnrDb" type="number" class="w-20" />
                        <span class="text-xs text-gray-500">dB</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 w-32">目标 GSNR (最小值)</span>
                        <Input v-model.number="optimizationConfig.targetGsnrDb" type="number" class="w-20" />
                        <span class="text-xs text-gray-500">dB</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 w-32">最大 span 长度</span>
                        <Input v-model.number="constraints.maxSpanLength" type="number" class="w-20" />
                        <span class="text-xs text-gray-500">km</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 w-32">最小 span 长度</span>
                        <Input v-model.number="constraints.minSpanLength" type="number" class="w-20" />
                        <span class="text-xs text-gray-500">km</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 w-32">OSNR 裕量</span>
                        <Input v-model.number="constraints.osnrMargin" type="number" class="w-20" />
                        <span class="text-xs text-gray-500">dB</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Step 5: WDM 参数配置 -->
              <div v-else-if="activeStep === 'wdm'" class="planning-section space-y-5">
                <h3 class="text-base font-semibold text-gray-800">WDM 参数配置</h3>
                
                <!-- WDM 系统参数 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">WDM 系统参数</div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">信道数量 (个)</label>
                      <Input v-model.number="channelConfig.channelCount" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">中心频率 (THz)</label>
                      <Input v-model.number="channelConfig.centerFrequencyThz" type="number" step="0.001" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">信道间隔 (GHz)</label>
                      <Input v-model.number="channelConfig.channelSpacingGhz" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">符号速率 (GBaud)</label>
                      <Input v-model.number="channelConfig.baudRateGbaud" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">调制格式</label>
                      <Select v-model="channelConfig.modulationFormat" :options="modulationOptions" />
                    </div>
                  </div>
                </div>
                
                <!-- 入纤功率配置 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">入纤功率配置</div>
                  <div class="space-y-3">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" v-model="launchPowerMode" value="uniform" class="text-blue-600" />
                      <span class="text-sm">统一功率</span>
                      <Input 
                        v-if="launchPowerMode === 'uniform'"
                        v-model.number="uniformLaunchPower" 
                        type="number" 
                        step="0.1"
                        class="w-20 ml-2" 
                      />
                      <span v-if="launchPowerMode === 'uniform'" class="text-xs text-gray-500">dBm</span>
                    </label>

                    <label class="flex flex-wrap items-center gap-2 cursor-pointer">
                      <input type="radio" v-model="launchPowerMode" value="grouped" class="text-blue-600" />
                      <span class="text-sm">三段分组功率</span>
                      <template v-if="launchPowerMode === 'grouped'">
                        <span class="ml-2 text-xs text-gray-500">低频</span>
                        <Input v-model.number="launchPowerGroups.lower" type="number" step="0.1" class="w-20" />
                        <span class="text-xs text-gray-500">中心</span>
                        <Input v-model.number="launchPowerGroups.center" type="number" step="0.1" class="w-20" />
                        <span class="text-xs text-gray-500">高频</span>
                        <Input v-model.number="launchPowerGroups.upper" type="number" step="0.1" class="w-20" />
                        <span class="text-xs text-gray-500">dBm</span>
                      </template>
                    </label>
                    
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" v-model="launchPowerMode" value="per_channel" class="text-blue-600" />
                      <span class="text-sm">逐信道配置</span>
                      <Button 
                        v-if="launchPowerMode === 'per_channel'"
                        variant="outline" 
                        size="sm"
                        class="ml-2"
                        @click="showPerChannelConfig = !showPerChannelConfig"
                      >
                        {{ showPerChannelConfig ? '收起' : '展开配置...' }}
                        <component :is="showPerChannelConfig ? ChevronUp : ChevronDown" class="w-4 h-4 ml-1" />
                      </Button>
                    </label>
                    
                    <!-- 逐信道配置展开 -->
                    <div v-if="launchPowerMode === 'per_channel' && showPerChannelConfig" class="ml-6 mt-2">
                      <div class="max-h-48 overflow-auto border rounded-lg">
                        <table class="w-full text-sm">
                          <thead class="bg-gray-100 sticky top-0">
                            <tr>
                              <th class="px-3 py-2 text-left">信道</th>
                              <th class="px-3 py-2 text-left">频率 (THz)</th>
                              <th class="px-3 py-2 text-left">功率 (dBm)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(_, i) in channelConfig.launchPowerDbm" :key="i" class="border-t">
                              <td class="px-3 py-1">Ch {{ i + 1 }}</td>
                              <td class="px-3 py-1 text-gray-500">{{ getChannelFrequency(i) }}</td>
                              <td class="px-3 py-1">
                                <Input v-model.number="channelConfig.launchPowerDbm[i]" type="number" step="0.1" class="w-20" />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div class="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" @click="fillAllPowers">批量填充</Button>
                        <Button variant="outline" size="sm" @click="copyLaunchPowers">
                          <Copy class="mr-1 h-4 w-4" />复制
                        </Button>
                        <Button variant="outline" size="sm" @click="pasteLaunchPowers">
                          <ClipboardPaste class="mr-1 h-4 w-4" />粘贴
                        </Button>
                      </div>
                    </div>
                    
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="radio" v-model="launchPowerMode" value="import" class="text-blue-600" />
                      <span class="text-sm">导入文件</span>
                      <Button 
                        v-if="launchPowerMode === 'import'"
                        variant="outline" 
                        size="sm"
                        class="ml-2"
                        @click="launchPowerImportRef?.click()"
                      >
                        <Upload class="mr-1 h-4 w-4" />选择 CSV/JSON...
                      </Button>
                      <input
                        ref="launchPowerImportRef"
                        type="file"
                        accept=".csv,.json,text/csv,application/json"
                        class="hidden"
                        @change="importLaunchPowerFile"
                      />
                    </label>
                  </div>
                  
                  <div class="mt-3 text-xs text-gray-500">
                    预览：{{ launchPowerPreview }} (共{{ channelConfig.channelCount }}个)
                    <button
                      class="ml-2 inline-flex items-center text-blue-600 hover:text-blue-700"
                      @click="launchPowerMode = 'per_channel'; showPerChannelConfig = true"
                    >
                      <Eye class="mr-1 h-3.5 w-3.5" />查看全部
                    </button>
                  </div>
                </div>
                
                <!-- 初始性能参数 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">初始性能参数</div>
                  
                  <div class="space-y-4">
                    <div>
                      <div class="text-xs text-gray-500 mb-2">initial_ase_vector (初始ASE噪声功率)</div>
                      <div class="space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input type="radio" v-model="initialAseMode" value="default" class="text-blue-600" />
                          <span class="text-sm">默认噪声底</span>
                          <Input 
                            v-if="initialAseMode === 'default'"
                            v-model.number="channelConfig.initialAseNoiseDbm"
                            type="number" 
                            class="w-20 ml-2" 
                          />
                          <span v-if="initialAseMode === 'default'" class="text-xs text-gray-500">dBm</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input type="radio" v-model="initialAseMode" value="custom" class="text-blue-600" />
                          <span class="text-sm">自定义</span>
                          <Input
                            v-if="initialAseMode === 'custom'"
                            v-model.number="channelConfig.initialAseNoiseDbm"
                            type="number"
                            step="0.1"
                            class="ml-2 w-20"
                          />
                          <span v-if="initialAseMode === 'custom'" class="text-xs text-gray-500">dBm</span>
                        </label>
                      </div>
                    </div>
                    
                    <div>
                      <div class="text-xs text-gray-500 mb-2">initial_nli_vector (初始NLI噪声功率)</div>
                      <div class="space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input type="radio" v-model="initialNliMode" value="default" class="text-blue-600" />
                          <span class="text-sm">默认噪声底</span>
                          <Input 
                            v-if="initialNliMode === 'default'"
                            v-model.number="channelConfig.initialNliNoiseDbm"
                            type="number" 
                            class="w-20 ml-2" 
                          />
                          <span v-if="initialNliMode === 'default'" class="text-xs text-gray-500">dBm</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input type="radio" v-model="initialNliMode" value="custom" class="text-blue-600" />
                          <span class="text-sm">自定义</span>
                          <Input
                            v-if="initialNliMode === 'custom'"
                            v-model.number="channelConfig.initialNliNoiseDbm"
                            type="number"
                            step="0.1"
                            class="ml-2 w-20"
                          />
                          <span v-if="initialNliMode === 'custom'" class="text-xs text-gray-500">dBm</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div class="text-sm">
                  参数完整性：<span class="text-green-600 font-medium">✅ 满足当前模型参数列表</span>
                </div>
              </div>
              
              <!-- Step 6: BU 配置 -->
              <div v-else-if="activeStep === 'bu'" class="planning-section space-y-5">
                <h3 class="text-base font-semibold text-gray-800">BU 配置</h3>
                
                <!-- 无 BU 提示 -->
                <div v-if="buConfigs.length === 0" class="text-center py-8 text-gray-500">
                  <GitBranch class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>当前链路没有分支单元 (BU)</p>
                  <p class="text-sm mt-1">您可以在拓扑编辑器中添加 BU 节点</p>
                </div>
                
                <div v-else class="space-y-6">
                  <!-- 链路 BU 序列示意图 -->
                  <div class="bg-gray-50 rounded-lg p-4">
                    <div class="text-sm font-medium text-gray-700 mb-3">
                      本链路经过 {{ buConfigs.length }} 个 BU
                    </div>
                    <div class="flex items-center justify-center py-3 text-sm text-gray-600 overflow-x-auto">
                      <span class="px-3 py-1 bg-blue-100 rounded whitespace-nowrap">{{ linkEndpoints.start }}</span>
                      <span class="mx-2 text-gray-400">●━━</span>
                      <template v-for="(bu, index) in buConfigs" :key="bu.id">
                        <div class="flex flex-col items-center mx-2">
                          <span 
                            class="px-2 py-1 rounded text-xs whitespace-nowrap"
                            :class="bu.isConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
                          >
                            [ {{ bu.name }} ]
                          </span>
                          <span class="text-[10px] text-gray-400 mt-1">km {{ (bu.kp || 0).toFixed(0) }}</span>
                          <span v-if="bu.branchTarget" class="text-[10px] text-purple-500">↓ {{ bu.branchTarget }}</span>
                        </div>
                        <span v-if="index < buConfigs.length - 1" class="mx-1 text-gray-400">━━</span>
                      </template>
                      <span class="mx-2 text-gray-400">━━●</span>
                      <span class="px-3 py-1 bg-green-100 rounded whitespace-nowrap">{{ linkEndpoints.end }}</span>
                    </div>
                  </div>
                  
                  <!-- 各 BU 详细配置 -->
                  <div 
                    v-for="bu in buConfigs" 
                    :key="bu.id"
                    class="border rounded-lg overflow-hidden"
                    :class="bu.isConfigured ? 'border-green-200' : 'border-amber-300'"
                  >
                    <div 
                      class="px-4 py-3 flex items-center justify-between"
                      :class="bu.isConfigured ? 'bg-green-50' : 'bg-amber-50'"
                    >
                      <div class="flex items-center gap-2">
                        <GitBranch class="w-4 h-4" :class="bu.isConfigured ? 'text-green-600' : 'text-amber-600'" />
                        <span class="font-medium">{{ bu.name }} @ km {{ (bu.kp || 0).toFixed(1) }}</span>
                      </div>
                      <span 
                        class="text-xs px-2 py-0.5 rounded"
                        :class="bu.isConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
                      >
                        {{ bu.isConfigured ? '✅ 已配置' : '⚠️ 未配置' }}
                      </span>
                    </div>
                    
                    <div class="p-4 space-y-4">
                      <!-- 器件选择 -->
                      <div>
                        <label class="block text-xs text-gray-500 mb-1">器件：</label>
                        <Select 
                          :model-value="bu.componentRefId || PLACEHOLDER_VALUE"
                          :options="buDeviceOptions"
                          @update:model-value="loadBuParamsFromDevice(bu.id, $event === PLACEHOLDER_VALUE ? '' : $event)"
                        />
                      </div>
                      
                      <div class="text-xs text-gray-500">
                        端口数：{{ bu.portCount }}（主干2 + 分支{{ bu.portCount - 2 }}）
                      </div>
                      
                      <!-- 下一跳配置 -->
                      <div>
                        <div class="text-xs text-gray-500 mb-2">下一跳配置：</div>
                        <div class="bg-gray-50 rounded-lg overflow-hidden">
                          <table class="w-full text-sm">
                            <thead class="bg-gray-100">
                              <tr>
                                <th class="px-3 py-2 text-left text-gray-600">方向</th>
                                <th class="px-3 py-2 text-left text-gray-600">下一跳</th>
                                <th class="px-3 py-2 text-left text-gray-600">插损</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr class="border-t">
                                <td class="px-3 py-2">主干上行</td>
                                <td class="px-3 py-2">
                                  <Select 
                                    :model-value="bu.nextHopUpstream || PLACEHOLDER_VALUE"
                                    :options="getNextHopOptions(bu.id, 'upstream')"
                                    class="w-32"
                                    @update:model-value="updateBuConfig(bu.id, 'buNextHopUpstream', $event === PLACEHOLDER_VALUE ? '' : $event)"
                                  />
                                </td>
                                <td class="px-3 py-2 font-mono">{{ (bu.trunkLoss || 0).toFixed(1) }} dB</td>
                              </tr>
                              <tr class="border-t">
                                <td class="px-3 py-2">主干下行</td>
                                <td class="px-3 py-2">
                                  <Select 
                                    :model-value="bu.nextHopDownstream || PLACEHOLDER_VALUE"
                                    :options="getNextHopOptions(bu.id, 'downstream')"
                                    class="w-32"
                                    @update:model-value="updateBuConfig(bu.id, 'buNextHopDownstream', $event === PLACEHOLDER_VALUE ? '' : $event)"
                                  />
                                </td>
                                <td class="px-3 py-2 font-mono">{{ (bu.trunkLoss || 0).toFixed(1) }} dB</td>
                              </tr>
                              <tr 
                                v-for="brIdx in Math.max(0, bu.portCount - 2)" 
                                :key="'branch-' + brIdx" 
                                class="border-t"
                              >
                                <td class="px-3 py-2">分支{{ brIdx }}</td>
                                <td class="px-3 py-2">
                                  <Select 
                                    :model-value="(bu as any)['nextHopBranch' + brIdx] || PLACEHOLDER_VALUE"
                                    :options="getNextHopOptions(bu.id, 'branch')"
                                    class="w-32"
                                    @update:model-value="updateBuConfig(bu.id, 'buBranchTarget' + brIdx, $event === PLACEHOLDER_VALUE ? '' : $event)"
                                  />
                                </td>
                                <td class="px-3 py-2 font-mono">{{ (bu.branchLoss || 0).toFixed(1) }} dB</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                      
                      <!-- 本链路路径 -->
                      <div class="text-sm">
                        本链路路径：
                        <span class="font-medium text-blue-600">主干直通</span>
                        <span class="ml-2 text-gray-500">插损: {{ (bu.trunkLoss || 0).toFixed(1) }} dB</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- BU 汇总表 -->
                  <div class="bg-gray-50 rounded-lg p-4">
                    <div class="text-sm font-medium text-gray-700 mb-3">BU 汇总</div>
                    <table class="w-full text-sm">
                      <thead class="bg-gray-100">
                        <tr>
                          <th class="px-3 py-2 text-left text-gray-600">BU</th>
                          <th class="px-3 py-2 text-left text-gray-600">位置</th>
                          <th class="px-3 py-2 text-left text-gray-600">端口数</th>
                          <th class="px-3 py-2 text-left text-gray-600">本链路插损</th>
                          <th class="px-3 py-2 text-left text-gray-600">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="bu in buConfigs" :key="bu.id" class="border-t">
                          <td class="px-3 py-2">{{ bu.name }}</td>
                          <td class="px-3 py-2 text-gray-500">km {{ (bu.kp || 0).toFixed(1) }}</td>
                          <td class="px-3 py-2">{{ bu.portCount }}</td>
                          <td class="px-3 py-2 font-mono">{{ bu.isConfigured ? (bu.trunkLoss || 0).toFixed(1) + ' dB' : '-' }}</td>
                          <td class="px-3 py-2">
                            <span 
                              class="text-xs"
                              :class="bu.isConfigured ? 'text-green-600' : 'text-amber-600'"
                            >
                              {{ bu.isConfigured ? '✅' : '⚠️' }}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                      <tfoot class="bg-gray-100">
                      </tfoot>
                    </table>
                  </div>
                </div>
                
                <div class="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                  💡 BU 配置也可在拓扑编辑器中双击 BU 节点直接修改
                </div>
              </div>
              
              <!-- Step 7: 计算结果 -->
              <div v-else-if="activeStep === 'result'" class="planning-section space-y-5">
                <h3 class="text-base font-semibold text-gray-800">计算结果</h3>
                
                <!-- 计算中状态 -->
                <div v-if="isCalculating" class="text-center py-12">
                  <RefreshCw class="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
                  <p class="font-medium text-gray-700">{{ calculationProgress.message }}</p>
                  <div class="mx-auto mt-4 h-2 w-72 max-w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      class="h-full bg-blue-600 transition-all duration-300"
                      :style="{ width: `${calculationProgress.value}%` }"
                    />
                  </div>
                  <p class="mt-2 text-sm font-mono text-gray-500">{{ calculationProgress.value }}%</p>
                </div>
                
                <!-- 统一结果面板：布局结果和完整仿真结果使用同一套文档布局。 -->
                <div v-else-if="hasPlanningResult" class="space-y-4">
                  <SystemPlanningResultPanel
                    :link-name="calculationResult?.linkName || `${linkInfo?.startStation || '起点'} ⇄ ${linkInfo?.endStation || '终点'}`"
                    :total-length="resultTotalLength"
                    :calculated-at="calculationResult?.calculatedAt || settingsStore.systemPlanningCache?.timestamp || ''"
                    :calculation-time="calculationResult?.calculationTime || 0"
                    :status="resultStatus"
                    :metrics="resultMetrics"
                    :performance-data="resultPerformanceData"
                    :amplifiers="resultAmplifiers"
                    :timeline="resultTimeline"
                    :cost-data="resultCostData"
                    :margin="calculationResult?.margin ?? null"
                    :span-used="resultSpanUsed"
                    :tail-span="platformLayoutTailSpanKm"
                    :average-span="resultAverageSpan"
                    :bu-count="calculationResult?.systemConfig.buCount ?? null"
                    :total-bu-loss="calculationResult?.systemConfig.totalBuLoss ?? null"
                    :equalizer-count="calculationResult?.systemConfig.equalizerCount ?? null"
                    :total-equalizer-loss="calculationResult?.systemConfig.totalEqualizerLoss ?? null"
                    :channel-count="calculationResult?.systemConfig.channelCount ?? null"
                    :modulation="calculationResult?.systemConfig.modulation ?? ''"
                    :optimization-target-label="optimizationTargetLabel"
                    :has-performance-metrics="resultHasPerformanceMetrics"
                  />
                </div>

                <!-- 未计算状态 -->
                <div v-if="!calculationResult && !platformCalculationCompleted && !isCalculating && !calculationError" class="text-center py-12">
                  <BarChart2 class="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p class="text-gray-500">请点击"开始计算"执行性能仿真</p>
                </div>
              </div>
            </div>

            <div
              v-if="currentStepValidationMessage"
              class="planning-validation flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800"
            >
              <AlertCircle class="h-4 w-4 flex-shrink-0" />
              <span>{{ currentStepValidationMessage }}</span>
            </div>
            
            <!-- 底部导航按钮 -->
            <div class="planning-footer flex items-center justify-between gap-2 border-t bg-white px-3 py-3 sm:px-7 sm:py-4">
              <Button 
                variant="outline"
                :disabled="activeStep === 'link' || platformConfigSaving || isCalculating"
                @click="goToPrevStep"
              >
                <ChevronLeft class="w-4 h-4 mr-1" /> 上一步
              </Button>
              
              <!-- 非最终配置页：显示下一步按钮 -->
              <div v-if="!isLastConfigStep && activeStep !== 'result'" class="flex gap-2">
                <Button :disabled="platformConfigSaving" @click="goToNextStep">
                  下一步：{{ nextPlanningStep?.label }}
                  <ChevronRight class="w-4 h-4 ml-1" />
                </Button>
              </div>
              
              <!-- 最终配置页：在下一步位置启动系统规划计算 -->
              <div v-else-if="isLastConfigStep" class="flex gap-2">
                <Button 
                  :disabled="!canStartCalculation || isCalculating || platformConfigSaving"
                  @click="startCalculation(false)"
                >
                  <PlayCircle class="w-4 h-4 mr-1" />
                  {{ platformConfigSaving ? '保存中...' : (isCalculating ? '计算中...' : '下一步：开始计算') }}
                  <ChevronRight class="w-4 h-4 ml-1" />
                </Button>
              </div>
              
              <!-- 结果页：算法生成的设备已同步，这里保留重算和完成操作。 -->
              <div v-else-if="activeStep === 'result'" class="flex gap-2">
                <Button 
                  variant="outline"
                  :disabled="isCalculating || platformConfigSaving"
                  @click="recalculate"
                >
                  <RefreshCw class="w-4 h-4 mr-1" /> 重新计算
                </Button>
                <Button 
                  :disabled="!hasPlanningResult"
                  @click="closeWithResult"
                >
                  <Check class="w-4 h-4 mr-1" /> 完成
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="visible && recalculationConfirmationVisible"
      class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/55 p-4"
      @click.self="dismissRecalculationConfirmation()"
    >
      <div
        ref="recalculationConfirmationDialog"
        class="w-full max-w-[560px] rounded-lg border border-gray-200 bg-white shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recalculation-confirmation-title"
        aria-describedby="recalculation-confirmation-description"
        @keydown="handleRecalculationConfirmationKeydown"
      >
        <div class="flex items-start gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div class="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <AlertCircle class="h-5 w-5" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <h2 id="recalculation-confirmation-title" class="text-base font-semibold text-gray-900">
              重新计算
            </h2>
            <p id="recalculation-confirmation-description" class="mt-2 text-sm leading-6 text-gray-600">
              重新计算会删除之前生成的设备实例，是否要同时删除手动添加的设备？
            </p>
          </div>
        </div>
        <div class="flex flex-wrap justify-end gap-2 border-t bg-gray-50 px-5 py-4 sm:px-6">
          <button
            type="button"
            data-recalculation-cancel
            class="min-h-9 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            @click="dismissRecalculationConfirmation()"
          >
            取消
          </button>
          <button
            type="button"
            class="min-h-9 rounded-md border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            @click="confirmRecalculation(false)"
          >
            保留手动添加
          </button>
          <button
            type="button"
            class="min-h-9 rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            @click="confirmRecalculation(true)"
          >
            同时删除
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.system-planning-dialog {
  border: 1px solid #dfe3e8;
  color: #1f2937;
  letter-spacing: 0;
  overflow: hidden;
}

.system-planning-dialog * {
  letter-spacing: 0;
}

.planning-header,
.planning-footer {
  flex: none;
}

.planning-sidebar {
  flex: none;
}

.planning-step-button {
  min-height: 52px;
}

.planning-step-number {
  min-height: 28px;
  min-width: 28px;
}

.planning-scroll {
  scrollbar-gutter: stable;
}

.planning-section {
  margin: 0 auto;
  max-width: 900px;
  width: 100%;
}

.planning-section-heading {
  align-items: flex-end;
  display: flex;
  justify-content: space-between;
  min-height: 52px;
}

.planning-section > h3 {
  color: #111827;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  margin-bottom: 4px;
}

.planning-route-select,
.planning-info-panel,
.planning-topology-panel,
.planning-equalizer-section,
.planning-section > .bg-gray-50.rounded-lg {
  background: #ffffff;
  border: 1px solid #e1e6eb;
  border-radius: 6px;
  padding: 20px;
}

.planning-info-panel,
.planning-topology-panel {
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.planning-status-dot {
  align-items: center;
  background: #ecfdf3;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  color: #15803d;
  display: inline-flex;
  font-size: 12px;
  gap: 4px;
  line-height: 20px;
  padding: 0 8px;
  white-space: nowrap;
}

.planning-metric {
  border-left: 2px solid #e5e7eb;
  min-width: 0;
  padding-left: 12px;
}

.planning-metric > span,
.planning-metric > small {
  color: #6b7280;
  display: block;
  font-size: 12px;
  line-height: 18px;
}

.planning-metric > strong {
  color: #111827;
  display: block;
  font-size: 14px;
  font-style: normal;
  font-weight: 600;
  line-height: 22px;
  overflow-wrap: anywhere;
}

.planning-metric > strong > em {
  color: #6b7280;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
}

.planning-metric > small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.planning-topology-track {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 118px;
  padding: 12px 8px 6px;
}

.planning-topology-node {
  align-items: center;
  display: flex;
  flex: 0 0 104px;
  flex-direction: column;
  min-width: 0;
  text-align: center;
}

.planning-topology-icon-wrap {
  align-items: center;
  border: 1px solid;
  border-radius: 6px;
  display: flex;
  height: 42px;
  justify-content: center;
  width: 42px;
  z-index: 1;
}

.planning-topology-icon-wrap--station {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #2563eb;
}

.planning-topology-icon-wrap--bu {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #c2410c;
}

.planning-topology-name {
  color: #374151;
  font-size: 12px;
  font-weight: 600;
  line-height: 17px;
  margin-top: 7px;
  max-width: 104px;
  min-height: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.planning-topology-role {
  color: #9ca3af;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.planning-topology-arrow {
  color: #94a3b8;
  flex: 0 0 28px;
  height: 24px;
  margin: 0 4px 34px;
  width: 24px;
}

.planning-validation {
  flex: none;
  min-height: 38px;
}

.planning-footer {
  min-height: 66px;
}

@media (max-width: 640px) {
  .system-planning-dialog {
    border-radius: 6px;
  }

  .planning-header-icon,
  .planning-header p {
    display: none;
  }

  .planning-section-heading {
    align-items: flex-start;
  }

  .planning-route-select,
  .planning-info-panel,
  .planning-topology-panel,
  .planning-equalizer-section,
  .planning-section > .bg-gray-50.rounded-lg {
    padding: 16px;
  }

  .planning-footer {
    min-height: 58px;
  }

  .system-planning-dialog .grid-cols-2,
  .system-planning-dialog .grid-cols-3 {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
