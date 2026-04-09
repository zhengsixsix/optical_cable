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

import { useBUConfigStore } from '@/stores/buConfig'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { ref, computed, watch, reactive, nextTick } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { useSLDStore } from '@/stores/sld'
import { 
  X, ChevronRight, ChevronLeft, Check, AlertCircle, 
  MapPin, Cpu, Cable, Radio, Waves, GitBranch, PlayCircle,
  CheckCircle2, Save, ChevronDown, ChevronUp, BarChart2,
  Activity, TrendingUp, DollarSign, RefreshCw, Clock, Plus, Trash2
} from 'lucide-vue-next'
import type { ConnectorElement } from '@/types'
import type { FiberParams, AmplifierParams } from '@/types/simulation'
import { getFiberParamsFromLibrary, getAmplifierParamsFromLibrary } from '@/services/DeviceParamsService'
import { inferJointSubTypeByContext, normalizeCableTypeCode } from '@/services/sldDeviceRegistry'
import { calculateDistance } from '@/utils/geo'
import { getRoutePositionAtKP } from '@/utils/routePosition'
import { calculateRouteTrunkLengthKm } from '@/utils/routeLength'
import { normalizeEqualizerConfig, validateEqualizerConfig } from '@/utils/equalizer'
import { runSimulation } from '@/services/SimulationApiService'
import type { SpanScanResult, ScanPoint } from '@/services/SimulationApiService'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'start-calculation', config: LinkConfig): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (e: 'apply-result', result: Record<string, any>): void  // 传递计算结果给父组件
}>()

// 链路配置输出
export interface LinkConfig {
  routeId: string
  rplId: string
  fiberModel: 'GN' | 'EGN' | 'SSFM'
  amplifierModel: 'EDFA_Simple' | 'EDFA_Full'
  fiberTypeId: string
  fiberParams: Record<string, number>
  amplifierTypeId: string
  amplifierParams: Record<string, number>
  spanStrategy: 'auto' | 'fixed'
  fixedSpanLength: number
  optimizationTarget: 'min_amplifiers' | 'max_gsnr'
  constraints: {
    targetOSNR: number
    targetGSNR: number
    maxSpanLength: number
    minSpanLength: number
    osnrMargin: number
  }
  wdmParams: {
    channelCount: number
    centerFreq: number
    channelSpacing: number
    baudRate: number
    modulation: string
    launchPowerMode: 'uniform' | 'grouped' | 'per_channel' | 'import'
    launchPower: number
    launchPowerVector: number[]
    initialAseMode: 'default' | 'custom'
    initialAseValue: number
    initialNliMode: 'default' | 'custom'
    initialNliValue: number
  }
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
const routeStore = useRouteStore()
const rplStore = useRPLStore()
const connectorStore = useConnectorStore()
const sldStore = useSLDStore()
const buConfigStore = useBUConfigStore()  // 使用共享的 BU 配置 store
const cableSegmentStore = useCableSegmentStore()

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

// 动态步骤配置 - 点对点规划时隐藏 BU 配置
const steps = computed(() => {
  if (!linkInfo.value || linkInfo.value.buCount === 0) {
    return baseSteps.filter(s => s.id !== 'bu')
  }
  return baseSteps
})

const activeStepSubtitle = computed(() => {
  const current = steps.value.find(s => s.id === activeStep.value)
  return current ? `当前配置：${current.label}` : '配置链路参数并启动性能计算'
})

// ============ Step 1: 链路选择 ============
const selectedRouteId = ref('')
const selectedRplId = ref('')

const routeOptions = computed(() => 
  routeStore.routes
    .filter(r => r.id) // 过滤空 id
    .map(r => ({ value: r.id, label: r.name }))
)

const rplOptions = computed(() => 
  rplStore.tables
    .filter(t => t.id) // 过滤空 id
    .map(t => ({ value: t.id, label: t.name }))
)

// 同步当前路由到 routeStore（保证 routeStore.selectedRoute 可用）
watch(selectedRouteId, (id) => {
  routeStore.selectRoute(id || null)
  connectorStore.selectTableByRoute(id || null)
  if (id) {
    const routeName = routeStore.routes.find(route => route.id === id)?.name
    ensureConnectorRouteTable(id, routeName)
  }
  // ★ 关键修复：切换路由时同步选择匹配的 RPL 表格
  // 如果不同步，buildPathCoords 会使用旧 RPL（另一条路由）的坐标来插值放大器位置
  if (id) {
    const matchingRpl = rplStore.tables.find(t => t.routeId === id)
    if (matchingRpl) {
      selectedRplId.value = matchingRpl.id
      rplStore.selectTable(matchingRpl.id)
    } else {
      // 没有匹配的 RPL 表格时，清空选择，让 buildPathCoords 回退到 route.points
      selectedRplId.value = ''
    }
  }
})

const routeConnectorElements = computed(() =>
  connectorStore.getElementsForRoute(selectedRouteId.value || routeStore.currentRouteId || null)
)

const resolveRplTableForRoute = (routeId?: string | null) => {
  const selectedTable = selectedRplId.value
    ? rplStore.tables.find(item => item.id === selectedRplId.value) || null
    : null

  if (selectedTable && (!routeId || !selectedTable.routeId || selectedTable.routeId === routeId)) {
    return selectedTable
  }

  if (routeId) {
    const matchedByRoute = rplStore.tables.find(item => item.routeId === routeId) || null
    if (matchedByRoute) return matchedByRoute
    if (rplStore.currentTable?.routeId === routeId) return rplStore.currentTable
    return null
  }

  return selectedTable || rplStore.currentTable
}

const equalizerTypeOptions = computed(() =>
  settingsStore.equalizerTypes
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
const AUTO_JOINT_REMARK_PREFIX = '自动落位:海缆段接头盒'
const JOINT_KP_TOLERANCE = 0.2

interface SegmentPlacementConfig {
  startKp: number
  endKp: number
  cableTypeName?: string
  equalizerEnabled?: boolean
  equalizerTypeId?: string
  equalizerTypeName?: string
  equalizerRole?: 'T' | 'S'
}

const createPlannedEqualizer = (overrides: Partial<PlannedEqualizer> = {}): PlannedEqualizer => {
  const defaultType = settingsStore.equalizerTypes.find(type => type.id === overrides.componentRefId) || settingsStore.equalizerTypes[0]
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
const collectCableSegmentsForRoute = (routeId: string | null): SegmentPlacementConfig[] => {
  const normalizeSegment = (raw: Record<string, any>): SegmentPlacementConfig | null => {
    const startKp = Number(raw.startKp ?? raw.kp ?? 0)
    const endKp = Number(raw.endKp ?? raw.endKP ?? raw.kp ?? 0)
    if (!Number.isFinite(startKp) || !Number.isFinite(endKp) || endKp <= startKp) {
      return null
    }
    return {
      startKp,
      endKp,
      cableTypeName: raw.cableTypeName || raw.cableType || '',
      equalizerEnabled: Boolean(raw.equalizerEnabled),
      equalizerTypeId: raw.equalizerTypeId || '',
      equalizerTypeName: raw.equalizerTypeName || '',
      equalizerRole: raw.equalizerRole === 'S' ? 'S' : 'T',
    }
  }

  const merged = new Map<string, SegmentPlacementConfig>()
  const upsertSegment = (segment: SegmentPlacementConfig | null) => {
    if (!segment) return
    const key = `${segment.startKp.toFixed(3)}-${segment.endKp.toFixed(3)}`
    const current = merged.get(key)
    if (!current) {
      merged.set(key, segment)
      return
    }
    merged.set(key, {
      startKp: current.startKp,
      endKp: current.endKp,
      cableTypeName: current.cableTypeName || segment.cableTypeName,
      equalizerEnabled: Boolean(current.equalizerEnabled || segment.equalizerEnabled),
      equalizerTypeId: current.equalizerTypeId || segment.equalizerTypeId,
      equalizerTypeName: current.equalizerTypeName || segment.equalizerTypeName,
      equalizerRole: current.equalizerRole || segment.equalizerRole,
    })
  }

  cableSegmentStore.segments
    .filter(segment => !routeId || !segment.routeId || segment.routeId === routeId)
    .forEach(segment => {
      upsertSegment(normalizeSegment(segment as unknown as Record<string, any>))
    })

  connectorStore.getElementsForRoute(routeId)
    .filter(element => element.type === 'cable_segment')
    .forEach(element => {
      upsertSegment(normalizeSegment(element as unknown as Record<string, any>))
    })

  return Array.from(merged.values()).sort((a, b) => a.startKp - b.startKp)
}

const getSelectedRplRecords = (routeId?: string | null) => {
  return resolveRplTableForRoute(routeId)?.records || []
}

const getPositionByKP = (
  targetKP: number,
  route: Record<string, any> | null,
  configTotalLength?: number,
  rplRecords?: Record<string, any>[],
) => getRoutePositionAtKP(targetKP, route as { points: any[]; segments: any[] } | null, {
  configuredTotalLength: configTotalLength,
  rplRecords: rplRecords as Array<{
    sequence: number
    kp: number
    longitude: number
    latitude: number
    depth: number
    cableType?: string
    isBranchStation?: boolean
  }> | undefined,
})

const findSegmentConfigAtKp = (segments: SegmentPlacementConfig[], kp: number) =>
  segments.find(segment => kp >= segment.startKp - 0.001 && kp <= segment.endKp + 0.001)

const inferAutoJointSubType = (
  targetKp: number,
  routeTotalLength: number,
  depth: number,
  cableTypeName: string | undefined,
  routeElements: ConnectorElement[],
) => {
  const nearBranchingUnit = routeElements.some(element =>
    element.type === 'bu' && Math.abs(element.kp - targetKp) <= 5,
  )
  return inferJointSubTypeByContext({
    kp: targetKp,
    totalLength: routeTotalLength,
    depth,
    cableType: normalizeCableTypeCode(cableTypeName),
    nearBranchingUnit,
  })
}

const selectJointBoxTypeForSubtype = (subType: ReturnType<typeof inferAutoJointSubType>) =>
  settingsStore.jointBoxTypes.find(type => type.subType === subType)

const buildPlannedEqualizersFromSegments = () => {
  const routeId = selectedRouteId.value || routeStore.currentRouteId || null
  const segmentConfigs = collectCableSegmentsForRoute(routeId)
  const segmentEqualizers = segmentConfigs
    .filter(segment => segment.equalizerEnabled && segment.equalizerTypeId)
    .sort((a, b) => a.startKp - b.startKp)

  if (segmentEqualizers.length === 0) {
    const defaultType = settingsStore.equalizerTypes[0]
    const totalLength = linkInfo.value?.trunkLength
      || linkInfo.value?.totalLength
      || segmentConfigs[segmentConfigs.length - 1]?.endKp
      || 0
    if (!defaultType || totalLength <= 0) return []
    const defaultCount = Math.max(2, Math.min(10, Math.round(totalLength / 500)))
    const candidateKps = Array.from({ length: defaultCount }, (_, index) =>
      Number(((totalLength * (index + 1)) / (defaultCount + 1)).toFixed(1))
    )
    const uniqueKps = Array.from(new Set(candidateKps.map(kp => kp.toFixed(1))))
      .map(value => Number(value))

    return uniqueKps.map((kp, index) => createPlannedEqualizer({
      name: `EQ-${String(index + 1).padStart(2, '0')}`,
      kp,
      componentRefId: defaultType.id,
      equalizerRole: 'T',
      attenuationMode: defaultType.attenuationMode,
      attenuationDb: defaultType.defaultAttenuationDb,
      specifications: defaultType.name,
      remarks: '自动落位: 按链路长度推定均衡器',
    }))
  }

  return segmentEqualizers.map((segment, index) => {
    const equalizerType = settingsStore.equalizerTypes.find(type => type.id === segment.equalizerTypeId)
    const midKp = Number(((segment.startKp + segment.endKp) / 2).toFixed(1))
    return createPlannedEqualizer({
      kp: midKp,
      name: `EQ-${String(index + 1).padStart(2, '0')}`,
      componentRefId: segment.equalizerTypeId || equalizerType?.id || '',
      equalizerRole: segment.equalizerRole || 'T',
      attenuationMode: equalizerType?.attenuationMode || 'adjustable',
      attenuationDb: equalizerType?.defaultAttenuationDb ?? 0,
      specifications: segment.equalizerTypeName || equalizerType?.name || '均衡器',
      remarks: `自动落位: 来自海缆段 KP${segment.startKp.toFixed(1)}-${segment.endKp.toFixed(1)}km`,
    })
  })
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

  plannedEqualizers.value = existing.length > 0
    ? existing
    : buildPlannedEqualizersFromSegments()
}

const ensurePlannedEqualizersReady = () => {
  if (plannedEqualizers.value.length > 0) return
  plannedEqualizers.value = buildPlannedEqualizersFromSegments()
}

const addPlannedEqualizer = () => {
  if (settingsStore.equalizerTypes.length === 0) {
    return
  }

  const defaultKp = plannedEqualizers.value.length > 0
    ? plannedEqualizers.value[plannedEqualizers.value.length - 1].kp
    : Number(((linkInfo.value?.trunkLength || linkInfo.value?.totalLength || 0) / 2).toFixed(1))

  plannedEqualizers.value.push(createPlannedEqualizer({ kp: defaultKp }))
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
const pickConnectorFallbackTable = (routeId: string, routeName?: string) => {
  const exactByRoute = connectorStore.tables.find(table => table.routeId === routeId)
  if (exactByRoute) return exactByRoute

  if (routeName) {
    const byName = connectorStore.tables.find(table => table.name.includes(routeName))
    if (byName) return byName
  }

  const routeMain = connectorStore.tables.find(table => table.routeId === 'route-main')
  if (routeMain) return routeMain

  if (connectorStore.tables.length === 1) return connectorStore.tables[0]

  return [...connectorStore.tables].sort((a, b) => (b.elements?.length || 0) - (a.elements?.length || 0))[0] || null
}

const ensureConnectorRouteTable = (routeId: string, routeName?: string) => {
  if (connectorStore.selectTableByRoute(routeId || null)) return

  const fallbackTable = pickConnectorFallbackTable(routeId, routeName)
  if (fallbackTable) {
    fallbackTable.routeId = routeId
    connectorStore.selectTable(fallbackTable.id)
    return
  }

  connectorStore.createTable(`${routeName || '链路'}_接线元`, routeId || undefined)
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

// 当前选中链路的基本信息 - 与 BUConfigDialog 保持一致的数据源
const linkInfo = computed(() => {
  const route = routeStore.selectedRoute
  const rpl = resolveRplTableForRoute(selectedRouteId.value || routeStore.currentRouteId || null)
  if (!route || route.points.length === 0) return null
  
  // 计算 KP（使用 Haversine 公式）
  let cumulativeKp = 0
  const pointsWithKp = route.points.map((point, index) => {
    if (index > 0) {
      const prev = route.points[index - 1]
      cumulativeKp += calculateDistance(prev.coordinates, point.coordinates)
    }
    return { ...point, kp: cumulativeKp }
  })
  
  const landingPointsAll = pointsWithKp.filter(p => p.type === 'landing')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchLandingPoints = landingPointsAll.filter(p => (p as any).isBranchStation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landingPoints = landingPointsAll.filter(p => !(p as any).isBranchStation)
  const buPoints = pointsWithKp.filter(p => p.type === 'branching')
  
  // 主干长度必须与分支隔离，避免分支长度污染放大器数量
  const trunkLen = calculateRouteTrunkLengthKm(route)
  const totalLen = rpl?.metadata?.totalLength || route.totalLength || 0
  const effectiveTrunkLength = trunkLen > 0 ? trunkLen : totalLen
  
  return {
    name: route.name,
    totalLength: totalLen,
    trunkLength: effectiveTrunkLength,  // 主干线长度（不含分支）
    startStation: landingPoints[0]?.name || '起点',
    endStation: landingPoints[landingPoints.length - 1]?.name || '终点',
    landingList: landingPoints.map(p => ({ id: p.id, name: p.name || '登陆站', kp: p.kp })),
    branchLandings: branchLandingPoints.map(p => ({ id: p.id, name: p.name || '分支登陆站', kp: p.kp })),
    buCount: buPoints.length,
    buNames: buPoints.map(b => b.name || '分支器').join(', ') || '无',
    buList: buPoints.map(b => ({ id: b.id, name: b.name || '分支器', kp: b.kp, branchTo: b.branchTo })),
    topology: pointsWithKp
      .filter(p => p.type === 'landing' || p.type === 'branching')
      .map(p => ({ id: p.id, name: p.name || (p.type === 'landing' ? '登陆站' : '分支器'), type: p.type, kp: p.kp })),
    createdAt: route.createdAt || new Date().toISOString().split('T')[0]
  }
})

// ============ Step 2: 计算模型选择 ============
const selectedFiberModel = ref<'GN' | 'EGN' | 'SSFM'>('GN')
const selectedAmplifierModel = ref<'EDFA_Simple' | 'EDFA_Full' | 'EDFA_Raman'>('EDFA_Simple')

// SSFM 专用参数
const ssfmParams = reactive({
  stepSize: 100,       // 步长 (m)
  samplePoints: 4096,  // 采样点数
  maxIterations: 1000, // 最大迭代次数
})

const fiberModelOptions = [
  { value: 'GN', label: 'GN-Model (高斯噪声)', desc: 'GN-Model 是一种高效的非线性传输模型，适用于长距离 WDM 系统的性能预测。' },
  { value: 'EGN', label: 'EGN-Model (增强高斯噪声)', desc: 'EGN-Model 在 GN 基础上考虑更多非线性效应，精度更高。' },
  { value: 'SSFM', label: 'SSFM (分步傅里叶)', desc: 'SSFM 是最精确的非线性传输仿真方法，计算时间较长。' }
]

const amplifierModelOptions = [
  { value: 'EDFA_Simple', label: 'EDFA 简化模型', desc: '基于增益、噪声系数等基本参数的 EDFA 模型。' },
  { value: 'EDFA_Full', label: 'EDFA 物理模型', desc: '基于物理参数的 EDFA 模型，考虑增益、噪声系数等参数进行精确计算。' },
  { value: 'EDFA_Raman', label: 'Raman+EDFA 混合放大', desc: '分布式拉曼放大 + EDFA 级联，等效 NF 更低，适用于超长距离传输。' }
]

// ============ Step 3: 光纤配置 ============
const selectedFiberTypeId = ref('')
const fiberParamsModified = ref(false)

// 根据选择的光纤模型，定义所需参数
const fiberModelParams = computed(() => {
  const baseParams = [
    { key: 'attenuation', label: '衰减系数 α', unit: 'dB/km' },
    { key: 'effectiveArea', label: '有效面积 Aeff', unit: 'μm²' },
    { key: 'dispersion', label: '色散 D', unit: 'ps/nm·km' },
    { key: 'dispersionSlope', label: '色散斜率 S', unit: 'ps/nm²·km' },
    { key: 'nonlinearIndex', label: '非线性折射率 n₂', unit: '×10⁻²⁰ m²/W' }
  ]
  
  if (selectedFiberModel.value === 'EGN' || selectedFiberModel.value === 'SSFM') {
    baseParams.push({ key: 'nonlinearCoeff', label: '非线性系数 γ', unit: 'W⁻¹·km⁻¹' })
  }
  
  return baseParams
})

// 光纤参数值
const fiberParams = reactive<Record<string, number>>({
  attenuation: 0.165,
  effectiveArea: 130,
  dispersion: 20.5,
  dispersionSlope: 0.06,
  nonlinearIndex: 2.6,
  nonlinearCoeff: 0.8
})

// 参数来源标记
const fiberParamSources = reactive<Record<string, 'device' | 'manual' | 'undefined'>>({})

const fiberTypeOptions = computed(() => 
  settingsStore.fiberTypes
    .filter(f => f.id)
    .map(f => ({ 
      value: f.id, 
      label: `${f.name} - ${f.fiberCategory || 'G.654.E'}` 
    }))
)

// 更新光纤参数
const updateFiberFromDevice = () => {
  if (!selectedFiberTypeId.value) return
  
  const fiber = settingsStore.fiberTypes.find(f => f.id === selectedFiberTypeId.value)
  if (fiber) {
    fiberParams.attenuation = fiber.attenuationCoeff || 0.165
    fiberParams.effectiveArea = fiber.effectiveArea || 130
    fiberParams.dispersion = fiber.dispersion || 20.5
    fiberParams.dispersionSlope = fiber.dispersionSlope || 0.06
    fiberParams.nonlinearIndex = fiber.nonlinearRefractiveIndex || 2.6
    fiberParams.nonlinearCoeff = fiber.nonlinearCoeff || 0.8
    
    // 标记来源
    Object.keys(fiberParams).forEach(key => {
      fiberParamSources[key] = 'device'
    })
    fiberParamsModified.value = false
  }
}

watch(selectedFiberTypeId, updateFiberFromDevice)

// 标记参数被修改
const markFiberParamModified = (key: string) => {
  fiberParamSources[key] = 'manual'
  fiberParamsModified.value = true
}

// ============ Step 4: 放大器配置 ============
const selectedAmplifierTypeId = ref('')
const amplifierParamsModified = ref(false)

// 放大器参数
const amplifierParams = reactive<Record<string, number>>({
  gain: 18,
  noiseFigure: 4.8,
  maxOutputPower: 21,
  saturationPower: 23
})

const amplifierParamSources = reactive<Record<string, 'device' | 'manual' | 'undefined'>>({})

const amplifierTypeOptions = computed(() => 
  settingsStore.amplifierTypes
    .filter(a => a.id)
    .map(a => ({ 
      value: a.id, 
      label: `${a.name} - ${a.gain}dB` 
    }))
)

// Span 布局策略
const spanStrategy = ref<'auto' | 'fixed'>('auto')
const fixedSpanLength = ref(70)

// Span 扫描范围配置（auto 模式）
const spanScanConfig = reactive({
  min: 40,
  max: 120,
  step: 5
})

// 优化目标
const optimizationTarget = ref<'min_amplifiers' | 'max_gsnr'>('min_amplifiers')

// 约束条件
const constraints = reactive({
  targetOSNR: 16.0,
  targetGSNR: 14.0,
  maxSpanLength: 100,
  minSpanLength: 30,
  osnrMargin: 1.0
})

// 更新放大器参数
const updateAmplifierFromDevice = () => {
  if (!selectedAmplifierTypeId.value) return
  
  const amp = settingsStore.amplifierTypes.find(a => a.id === selectedAmplifierTypeId.value)
  if (amp) {
    amplifierParams.gain = amp.gain || 18
    amplifierParams.noiseFigure = amp.noiseFigure || 4.8
    amplifierParams.maxOutputPower = amp.outputPower || 21
    amplifierParams.saturationPower = amp.saturationPower || 23
    
    Object.keys(amplifierParams).forEach(key => {
      amplifierParamSources[key] = 'device'
    })
    amplifierParamsModified.value = false
  }
}

watch(selectedAmplifierTypeId, updateAmplifierFromDevice)

// ============ Step 5: WDM 参数配置 ============
const wdmParams = reactive({
  channelCount: 96,
  centerFreq: 193.1,
  channelSpacing: 50.0,
  baudRate: 64.0,
  modulation: '16QAM'
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
const uniformLaunchPower = ref(-1.5)
const perChannelPowers = ref<number[]>([])
const showPerChannelConfig = ref(false)

// 初始化逐信道功率
watch(() => wdmParams.channelCount, (count) => {
  if (perChannelPowers.value.length !== count) {
    perChannelPowers.value = Array(count).fill(uniformLaunchPower.value)
  }
}, { immediate: true })

// 计算信道频率
const getChannelFrequency = (index: number) => {
  const startFreq = wdmParams.centerFreq - (wdmParams.channelCount - 1) * wdmParams.channelSpacing / 2000
  return (startFreq + index * wdmParams.channelSpacing / 1000).toFixed(3)
}

// 批量填充功率
const fillAllPowers = () => {
  perChannelPowers.value = Array(wdmParams.channelCount).fill(uniformLaunchPower.value)
}

// 初始性能参数
const initialAseMode = ref<'default' | 'custom'>('default')
const initialAseValue = ref(-90.0)
const initialNliMode = ref<'default' | 'custom'>('default')
const initialNliValue = ref(-90.0)

// ============ Step 6: BU 配置 ============

// BU 器件选项
const PLACEHOLDER_VALUE = '__none__'
const buDeviceOptions = computed(() => [
  { value: PLACEHOLDER_VALUE, label: '-- 请选择 --' },
  ...settingsStore.branchingUnitTypes
    .filter(b => b.id)
    .map(b => ({
      value: b.id,
      label: `${b.name} - ${b.portCount}端口`
    }))
])

// BU 配置数据 - 优先从 linkInfo 获取，并从 buConfigStore 读取配置
const buConfigs = computed(() => {
  // 显式访问 buConfigStore.configs 以建立响应式依赖
  const configsSnapshot = buConfigStore.configs
  
  // 优先使用 linkInfo 中的 BU 列表（已正确计算 kp）
  const info = linkInfo.value
  if (info && info.buList && info.buList.length > 0) {
    return info.buList.map(bu => {
      const storedConfig = configsSnapshot[bu.id] || null
      const deviceId = storedConfig?.componentRefId || ''
      const device = deviceId 
        ? settingsStore.branchingUnitTypes.find(d => d.id === deviceId)
        : settingsStore.branchingUnitTypes[0] || null
      
      const isConfigured = !!(storedConfig?.componentRefId && storedConfig?.buNextHopUpstream && storedConfig?.buNextHopDownstream)
      
      return {
        id: bu.id,
        name: bu.name || '分支器',
        kp: bu.kp,
        componentRefId: storedConfig?.componentRefId || '',
        portCount: device?.portCount || 3,
        trunkLoss: storedConfig?.buTrunkLoss ?? device?.trunkInsertionLoss ?? 0.8,
        branchLoss: storedConfig?.buBranchLoss ?? device?.branchInsertionLoss ?? 3.5,
        branchTarget: (bu as any).branchTo?.name || '',
        nextHopUpstream: storedConfig?.buNextHopUpstream || '',
        nextHopDownstream: storedConfig?.buNextHopDownstream || '',
        nextHopBranch1: storedConfig?.buNextHopBranch1 || '',
        nextHopBranch2: storedConfig?.buNextHopBranch2 || '',
        nextHopBranch3: storedConfig?.buNextHopBranch3 || '',
        isConfigured,
        deviceName: device?.name || '未选择'
      }
    })
  }
  
  // 回退到 connectorStore
  return routeConnectorElements.value
    .filter(e => e.type === 'bu')
    .sort((a, b) => a.kp - b.kp)
    .map(bu => {
      const storedConfig = configsSnapshot[bu.id] || null
      const deviceId = storedConfig?.componentRefId || bu.componentRefId || ''
      const device = deviceId 
        ? settingsStore.branchingUnitTypes.find(d => d.id === deviceId)
        : null
      
      const isConfigured = !!(storedConfig?.componentRefId && storedConfig?.buNextHopUpstream && storedConfig?.buNextHopDownstream) || (
        !!bu.componentRefId && 
        !!(bu as any).buNextHopUpstream && 
        !!(bu as any).buNextHopDownstream
      )
      
      return {
        id: bu.id,
        name: bu.name,
        kp: bu.kp,
        componentRefId: storedConfig?.componentRefId || bu.componentRefId || '',
        portCount: bu.buPortCount || device?.portCount || 3,
        trunkLoss: storedConfig?.buTrunkLoss ?? bu.buTrunkLoss ?? device?.trunkInsertionLoss ?? 0.8,
        branchLoss: storedConfig?.buBranchLoss ?? bu.buBranchLoss ?? device?.branchInsertionLoss ?? 3.5,
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

// 获取下一跳节点名称
const getNextHopName = (nodeId: string) => {
  if (!nodeId) return '-'
  const node = routeConnectorElements.value.find(e => e.id === nodeId)
  return node?.name || '-'
}

// 获取所有可用的登陆站和 BU 节点（与 BUConfigDialog 一致）
const allNodes = computed(() => {
  const nodes: Array<{ id: string; name: string; type: string; index: number }> = []
  
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute && selectedRoute.points.length > 0) {
    const existsLandingByName = (name?: string) =>
      !!name && nodes.some(n => (n.type === 'landing' || n.type === 'branch-landing') && n.name === name)
    const existsLandingByCoord = (coord?: [number, number]) => {
      if (!coord) return false
      return nodes.some(n => (n as any).coord &&
        Math.abs((n as any).coord[0] - coord[0]) < 1e-6 &&
        Math.abs((n as any).coord[1] - coord[1]) < 1e-6
      )
    }
    
    let nodeIndex = 0
    selectedRoute.points.forEach((p) => {
      if (p.type === 'landing' || p.type === 'branching') {
        const isBranch = (p as any).isBranchStation === true
        const nodeType = p.type === 'landing' && isBranch ? 'branch-landing' : p.type
        const nodeName = p.name || (p.type === 'landing' ? '登陆站' : '分支器')
        
        // 对 branch-landing 去重：若已存在同名节点则替换（优先保留路由点的真实 ID）
        if (nodeType === 'branch-landing') {
          const existingIdx = nodes.findIndex(n => n.type === 'branch-landing' && n.name === nodeName)
          if (existingIdx !== -1) {
            nodes[existingIdx] = {
              id: p.id,
              name: nodeName,
              type: 'branch-landing',
              index: nodes[existingIdx].index,
              ...(p.type === 'landing' ? { coord: p.coordinates } : {}),
              ...(isBranch ? { branchFrom: (p as any).branchFrom } : {})
            }
            return
          }
        }
        
        nodes.push({
          id: p.id,
          name: nodeName,
          type: nodeType,
          index: nodeIndex++,
          ...(p.type === 'landing' ? { coord: p.coordinates } : {}),
          ...(isBranch ? { branchFrom: (p as any).branchFrom } : {})
        })
        
        if (p.type === 'branching' && p.branchTo) {
          if (!existsLandingByName(p.branchTo.name) && !existsLandingByCoord(p.branchTo.coord as [number, number])) {
          nodes.push({
            id: `branch-${p.id}`,
            name: p.branchTo.name || '分支登陆站',
            type: 'branch-landing',
            index: nodeIndex++
          })
          }
        }
      }
    })
  }
  
  if (nodes.length === 0) {
    routeConnectorElements.value
      .filter(e => e.type === 'landing' || e.type === 'underwater' || e.type === 'bu')
      .sort((a, b) => a.kp - b.kp)
      .forEach((e, idx) => {
        nodes.push({
          id: e.id,
          name: e.name,
          type: e.type,
          index: idx
        })
      })
  }
  
  return nodes
})

// BU 汇总信息
const buSummary = computed(() => {
  const total = buConfigs.value.length
  const configured = buConfigs.value.filter(b => b.isConfigured).length
  const totalTrunkLoss = buConfigs.value.reduce((sum, b) => sum + (b.trunkLoss || 0), 0)
  
  return {
    total,
    configured,
    unconfigured: total - configured,
    totalTrunkLoss: configured === total ? totalTrunkLoss : null
  }
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

// 更新 BU 配置 - 同时更新共享 store 和 connectorStore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateBuConfig = (buId: string, field: string, value: string | number | boolean) => {
  // 更新共享的 buConfigStore
  const fieldMapping: Record<string, keyof import('@/stores').BUConfigData> = {
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
  
  // 同时更新 connectorStore
  const existsInConnector = routeConnectorElements.value.find(e => e.id === buId)
  if (existsInConnector) {
    connectorStore.updateElement(buId, { [field]: value })
  }
}

// 从器件库加载 BU 参数 - 同时更新共享 store 和 connectorStore
const loadBuParamsFromDevice = (buId: string, deviceId: string) => {
  const device = settingsStore.branchingUnitTypes.find(d => d.id === deviceId)
  if (device) {
    // 更新共享的 buConfigStore
    buConfigStore.updateConfig(buId, {
      componentRefId: deviceId,
      buTrunkLoss: device.trunkInsertionLoss,
      buBranchLoss: device.branchInsertionLoss
    })
    
    // 同时更新 connectorStore
    const existsInConnector = routeConnectorElements.value.find(e => e.id === buId)
    if (existsInConnector) {
      connectorStore.updateElement(buId, {
        componentRefId: deviceId,
        buPortCount: device.portCount,
        buTrunkLoss: device.trunkInsertionLoss,
        buBranchLoss: device.branchInsertionLoss
      })
    }
  }
}

// 获取下一跳选项 - 与 BUConfigDialog 保持一致
const getNextHopOptions = (buId: string, direction: 'upstream' | 'downstream' | 'branch') => {
  const options: Array<{ value: string; label: string }> = [
    { value: PLACEHOLDER_VALUE, label: '-- 选择 --' }
  ]
  
  const nodes = allNodes.value
  const currentIdx = nodes.find(n =>
    n.id === buId ||
    n.id === `branch-${buId}` ||
    (n.type === 'branching' && n.id === buId)
  )?.index ?? -1
  
  if (currentIdx === -1) {
    nodes
      .filter(n => n.type === 'landing' || n.type === 'branching')
      .forEach(n => options.push({ value: n.id, label: n.name }))
    return options
  }
  
  if (direction === 'upstream') {
    const upstream = nodes.filter(n => n.index < currentIdx && n.type !== 'branch-landing')
    upstream.reverse().forEach(n => options.push({ value: n.id, label: n.name }))
  } else if (direction === 'downstream') {
    const downstream = nodes.filter(n => n.index > currentIdx && n.type !== 'branch-landing')
    downstream.forEach(n => options.push({ value: n.id, label: n.name }))
  } else {
    const currentBuName = nodes.find(n => n.id === buId)?.name
    const branchNodes = nodes.filter(n => {
      const branchFrom = (n as any).branchFrom
      return n.type === 'branch-landing' && (!branchFrom || branchFrom === currentBuName)
    })
    if (branchNodes.length > 0) {
      branchNodes.forEach(n => {
        if (!options.find(o => o.label === n.name)) {
          options.push({ value: n.id, label: n.name })
        }
      })
    } else {
      nodes
        .filter(n => n.type === 'landing')
        .forEach(n => {
          if (!options.find(o => o.value === n.id)) {
            options.push({ value: n.id, label: n.name })
          }
        })
    }
  }
  
  return options
}

// ============ 配置完整度计算 ============
const stepStatus = computed(() => ({
  link: !!selectedRouteId.value && !!selectedRplId.value,
  model: !!selectedFiberModel.value && !!selectedAmplifierModel.value,
  fiber: !!selectedFiberTypeId.value,
  amplifier: !!selectedAmplifierTypeId.value,
  wdm: wdmParams.channelCount > 0,
  bu: buConfigs.value.length === 0 || buConfigs.value.every(b => b.isConfigured),
  result: calculationResult.value !== null // 计算结果
}))

const completionPercentage = computed(() => {
  const steps = Object.values(stepStatus.value)
  const completed = steps.filter(Boolean).length
  return Math.round((completed / steps.length) * 100)
})

const canStartCalculation = computed(() => {
  return stepStatus.value.link && stepStatus.value.model && 
         stepStatus.value.fiber && stepStatus.value.amplifier && stepStatus.value.wdm &&
         stepStatus.value.bu
})

// ============ 导航和操作 ============
const baseStepOrder = ['link', 'model', 'fiber', 'amplifier', 'wdm', 'bu', 'result'] as const

// 动态步骤顺序 - 点对点规划时跳过 BU
const stepOrder = computed(() => {
  if (!linkInfo.value || linkInfo.value.buCount === 0) {
    return baseStepOrder.filter(s => s !== 'bu')
  }
  return [...baseStepOrder]
})

const goToNextStep = () => {
  const currentIndex = stepOrder.value.indexOf(activeStep.value as any)
  if (currentIndex < stepOrder.value.length - 1) {
    activeStep.value = stepOrder.value[currentIndex + 1] as any
  }
}

const goToPrevStep = () => {
  const currentIndex = stepOrder.value.indexOf(activeStep.value as any)
  if (currentIndex > 0) {
    activeStep.value = stepOrder.value[currentIndex - 1] as any
  }
}

// ============ 计算结果 (Step 5) ============

// 放大器信息
interface AmplifierInfo {
  id: string
  name: string
  position: number  // km
  precedingSpan: number  // 前段跨段长度 km
  gain: number  // dB
  noiseFigure: number  // dB
  outputPower: number  // dBm
  inputPower: number  // dBm
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
  costData: {
    cableCost: number
    amplifierCost: number
    buCost: number
    equalizerCost: number
    totalCost: number
    costItems: CostItem[]
  }
}

const calculationResult = ref<CalculationResult | null>(null)
const isCalculating = ref(false)
const resultViewTab = ref<'overview' | 'performance' | 'amplifier' | 'cost' | 'spanOptimization'>('overview')
const spanScanData = ref<SpanScanResult | null>(null)
const calculationError = ref('')

// 性能曲线显示选项
const performanceChartOptions = reactive({
  showOsnr: true,
  showGsnr: true,
  showPower: false,
  showNli: false
})

// 信道显示模式
const channelDisplayMode = ref<'specified' | 'average' | 'worst'>('worst')
const selectedChannelIndex = ref(48) // 默认中心信道

// 选中的放大器
const selectedAmplifierIndex = ref<number | null>(null)

// 执行计算并跳转到结果页
const startCalculation = async () => {
  ensurePlannedEqualizersReady()
  const equalizerValidationMessage = validatePlannedEqualizers()
  if (equalizerValidationMessage) {
    calculationError.value = equalizerValidationMessage
    appStore.showNotification({ type: 'error', message: equalizerValidationMessage })
    activeStep.value = 'link'
    return
  }

  isCalculating.value = true
  calculationError.value = ''
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
    if (info) {
      if (info.landingList) {
        info.landingList.forEach(lp => devices.push({ id: lp.id, name: lp.name, type: 'landing', kp: lp.kp }))
      }
      if (info.buList) {
        info.buList.forEach(bu => devices.push({ id: bu.id, name: bu.name, type: 'bu', kp: bu.kp }))
      }
    }

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
      ? { mode: 'fixed' as const, fixedLength: fixedSpanLength.value }
      : { mode: 'scan' as const, scanRange: { min: spanScanConfig.min, max: spanScanConfig.max, step: spanScanConfig.step } }

    const fiberType = settingsStore.fiberTypes.find(f => f.id === selectedFiberTypeId.value)
    const ampType = settingsStore.amplifierTypes.find(a => a.id === selectedAmplifierTypeId.value)

    const response = await runSimulation({
      linkId: selectedRouteId.value,
      linkName: `${info?.startStation || '起点'} ⇄ ${info?.endStation || '终点'}`,
      totalLengthKm: info?.trunkLength || info?.totalLength || 512,
      fiberModel: selectedFiberModel.value,
      amplifierModel: selectedAmplifierModel.value,
      fiberParams: {
        attenuation: fiberParams.attenuation,
        effectiveArea: fiberParams.effectiveArea,
        dispersion: fiberParams.dispersion,
        dispersionSlope: fiberParams.dispersionSlope,
        nonlinearIndex: fiberParams.nonlinearIndex,
        nonlinearCoeff: fiberParams.nonlinearCoeff,
        fiberName: fiberType?.name,
        ...(selectedFiberModel.value === 'SSFM' ? {
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
        unitPrice: ampType?.unitPrice,
        equalizerUnitPrice: settingsStore.costFactors.equalizerCost,
        amplifierName: ampType?.name,
      },
      wdmParams: {
        channelCount: wdmParams.channelCount,
        centerFreq: wdmParams.centerFreq,
        channelSpacing: wdmParams.channelSpacing,
        baudRate: wdmParams.baudRate,
        modulation: wdmParams.modulation,
        launchPower: uniformLaunchPower.value,
        launchPowerMode: launchPowerMode.value,
        launchPowerVector: launchPowerMode.value === 'per_channel' ? perChannelPowers.value : undefined,
      },
      spanStrategy: spanStrategyPayload,
      constraints: { ...constraints },
      buConfigs: buConfigs.value.map(bu => ({
        id: bu.id,
        name: bu.name,
        kp: bu.kp,
        portCount: bu.portCount,
        trunkLoss: bu.trunkLoss,
        branchLoss: bu.branchLoss,
      })),
      deviceSequence: devices,
    })

    spanScanData.value = {
      linkId: selectedRouteId.value,
      scannedAt: new Date(),
      model: selectedFiberModel.value as import('@/types/simulation').SimulationModel,
      gsnrPerSpanDb: [],
      osnrPerSpanDb: [],
      ...response.spanScanResult
    }
    calculationResult.value = response.detailedResult as CalculationResult

    const route = routeStore.selectedRoute
      || routeStore.paretoRoutes.find(item => item.id === selectedRouteId.value)
      || routeStore.paretoRoutes[0]
      || null
    if (route) {
      const configTotalLength = linkInfo.value?.trunkLength || linkInfo.value?.totalLength || 0
      syncPlannedEqualizersToConnector(route as Record<string, any>, route.id, configTotalLength)
      syncAutoJointsToConnector(route as Record<string, any>, route.id, configTotalLength)
    }
  } catch (err: unknown) {
    calculationError.value = err instanceof Error ? err.message : '仿真计算失败，请检查后端服务是否启动'
  } finally {
    isCalculating.value = false
  }
}

// 格式化成本显示
const formatCost = (cost: number): string => {
  if (cost >= 1000000) return `$${(cost / 1000000).toFixed(2)}M`
  if (cost >= 1000) return `$${(cost / 1000).toFixed(0)}K`
  return `$${cost.toFixed(0)}`
}

// 计算成本占比
const getCostPercent = (cost: number): string => {
  if (!calculationResult.value || calculationResult.value.costData.totalCost <= 0) return '0'
  return ((cost / calculationResult.value.costData.totalCost) * 100).toFixed(1)
}

// SVG 路径计算属性 - OSNR 频谱曲线
const osnrSpectrumPath = computed(() => {
  if (!calculationResult.value) return ''
  const data = calculationResult.value.performanceData.endOsnrSpectrum
  const len = data.length - 1
  return data.map((v, i) => `${50 + i * (630 / len)},${150 - (v - 10) * 6}`).join(' ')
})

// SVG 路径计算属性 - GSNR 频谱曲线
const gsnrSpectrumPath = computed(() => {
  if (!calculationResult.value) return ''
  const data = calculationResult.value.performanceData.endGsnrSpectrum
  const len = data.length - 1
  return data.map((v, i) => `${50 + i * (630 / len)},${150 - (v - 10) * 6}`).join(' ')
})

// SVG 路径计算属性 - 功率频谱曲线 (dBm, 缩放: 0 dBm 对应 y=90, 每 1dB = 10px)
const powerSpectrumPath = computed(() => {
  if (!calculationResult.value) return ''
  const data = calculationResult.value.performanceData.endPowerSpectrum
  if (!data || data.length === 0) return ''
  const len = data.length - 1
  return data.map((v, i) => `${50 + i * (630 / len)},${90 - v * 10}`).join(' ')
})

// SVG 路径计算属性 - NLI 噪声频谱曲线 (dBm, 缩放: -20 dBm 对应 y=90)
const nliSpectrumPath = computed(() => {
  if (!calculationResult.value) return ''
  const data = calculationResult.value.performanceData.endNliSpectrum
  if (!data || data.length === 0) return ''
  const len = data.length - 1
  return data.map((v, i) => `${50 + i * (630 / len)},${150 - (v + 40) * 4}`).join(' ')
})

// SVG 路径计算属性 - OSNR 沿程演化曲线
const osnrEvolutionPath = computed(() => {
  if (!calculationResult.value) return ''
  const data = calculationResult.value.performanceData.osnrEvolution
  const len = data.length - 1
  return data.map((v, i) => `${50 + i * (630 / len)},${150 - (v - 5) * 4}`).join(' ')
})

// SVG 路径计算属性 - GSNR 沿程演化曲线
const gsnrEvolutionPath = computed(() => {
  if (!calculationResult.value) return ''
  const data = calculationResult.value.performanceData.gsnrEvolution
  const len = data.length - 1
  return data.map((v, i) => `${50 + i * (630 / len)},${150 - (v - 5) * 4}`).join(' ')
})

// ============ Span 优化图表计算属性 ============
const spanGsnrArray = computed(() => spanScanData.value?.scanPoints.map((p: ScanPoint) => p.avgGsnrDb) ?? [])
const spanOsnrArray = computed(() => spanScanData.value?.scanPoints.map((p: ScanPoint) => p.avgOsnrDb) ?? [])

const spanChartBounds = computed(() => {
  if (!spanScanData.value) return { xMin: 40, xMax: 120, yMin: 5, yMax: 35 }
  const xs = spanScanData.value.spanLengthsKm
  const allY = [...spanGsnrArray.value, ...spanOsnrArray.value]
  const yMin = Math.floor(Math.min(...allY) - 2)
  const yMax = Math.ceil(Math.max(...allY) + 2)
  return { xMin: xs[0], xMax: xs[xs.length - 1], yMin, yMax }
})

const spanChartX = (spanLen: number) => {
  const { xMin, xMax } = spanChartBounds.value
  return 50 + (spanLen - xMin) / ((xMax - xMin) || 1) * 610
}
const spanChartY = (val: number) => {
  const { yMin, yMax } = spanChartBounds.value
  return 190 - (val - yMin) / ((yMax - yMin) || 1) * 170
}

const spanChartYTicks = computed(() => {
  const { yMin, yMax } = spanChartBounds.value
  const step = Math.max(1, Math.round((yMax - yMin) / 5))
  const ticks: number[] = []
  for (let v = yMin; v <= yMax; v += step) ticks.push(v)
  return ticks
})

const spanGsnrPath = computed(() => {
  if (!spanScanData.value) return ''
  return spanScanData.value.spanLengthsKm
    .map((s: number, i: number) => `${spanChartX(s)},${spanChartY(spanGsnrArray.value[i])}`)
    .join(' ')
})
const spanOsnrPath = computed(() => {
  if (!spanScanData.value) return ''
  return spanScanData.value.spanLengthsKm
    .map((s: number, i: number) => `${spanChartX(s)},${spanChartY(spanOsnrArray.value[i])}`)
    .join(' ')
})

const spanFeasibleRange = computed(() => {
  if (!spanScanData.value) return null
  const spans = spanScanData.value.spanLengthsKm
  const gsnrs = spanGsnrArray.value
  const target = constraints.targetGSNR
  const feasible = spans.filter((_: number, i: number) => gsnrs[i] >= target)
  if (feasible.length === 0) return null
  return { min: feasible[0], max: feasible[feasible.length - 1] }
})

// 重新计算
const recalculate = () => {
  calculationResult.value = null
  spanCursorSpan.value = null
  spanUserSelectedSpan.value = null
  startCalculation()
}

// ============ Span 优化交互调整 (Step 6.1) ============
const spanChartSvgRef = ref<SVGSVGElement | null>(null)
const spanCursorSpan = ref<number | null>(null)  // 游标当前指向的 Span
const spanIsDragging = ref(false)
const spanUserSelectedSpan = ref<number | null>(null)  // 用户最终确认的 Span

// 自动初始化游标到推荐 Span
watch(() => spanScanData.value?.recommendedSpanKm, (rec) => {
  if (rec != null && spanCursorSpan.value == null) {
    spanCursorSpan.value = rec
  }
}, { immediate: true })

// 坐标转换: 屏幕X -> SVG X
const spanClientToSvgX = (clientX: number) => {
  if (!spanChartSvgRef.value) return null
  const rect = spanChartSvgRef.value.getBoundingClientRect()
  return (clientX - rect.left) / rect.width * 700  // viewBox width = 700
}

// SVG X -> Span 值
const spanSvgXToSpan = (svgX: number) => {
  if (!spanScanData.value) return null
  const spans = spanScanData.value.spanLengthsKm
  if (spans.length < 2) return null
  const xMin = spans[0]
  const xMax = spans[spans.length - 1]
  const ratio = (svgX - 50) / 610  // plotLeft=50, plotWidth=610
  if (ratio < 0 || ratio > 1) return null
  return xMin + ratio * (xMax - xMin)
}

// 游标 SVG X 坐标
const spanCursorSvgX = computed(() => {
  if (spanCursorSpan.value == null || !spanScanData.value) return null
  return spanChartX(spanCursorSpan.value)
})

// 游标插值数据
const spanCursorData = computed(() => {
  if (spanCursorSpan.value == null || !spanScanData.value) return null
  const spanKm = spanCursorSpan.value
  const spans = spanScanData.value.spanLengthsKm
  const gsnrs = spanGsnrArray.value
  const osnrs = spanOsnrArray.value
  const pts = spanScanData.value.scanPoints
  if (spans.length === 0) return null
  // 边界
  if (spanKm <= spans[0]) return { gsnr: gsnrs[0], osnr: osnrs[0], margin: pts[0]?.gsnrMarginDb ?? 0, amps: pts[0]?.numAmplifiers ?? 0 }
  if (spanKm >= spans[spans.length - 1]) return { gsnr: gsnrs[gsnrs.length - 1], osnr: osnrs[osnrs.length - 1], margin: pts[pts.length - 1]?.gsnrMarginDb ?? 0, amps: pts[pts.length - 1]?.numAmplifiers ?? 0 }
  // 线性插值
  for (let i = 0; i < spans.length - 1; i++) {
    if (spanKm >= spans[i] && spanKm <= spans[i + 1]) {
      const t = (spanKm - spans[i]) / (spans[i + 1] - spans[i])
      const lerp = (a: number, b: number) => a + (b - a) * t
      return {
        gsnr: lerp(gsnrs[i], gsnrs[i + 1]),
        osnr: lerp(osnrs[i], osnrs[i + 1]),
        margin: lerp(pts[i]?.gsnrMarginDb ?? 0, pts[i + 1]?.gsnrMarginDb ?? 0),
        amps: Math.round(lerp(pts[i]?.numAmplifiers ?? 0, pts[i + 1]?.numAmplifiers ?? 0)),
      }
    }
  }
  return null
})

// 点击图表选择 Span
const handleSpanChartClick = (e: MouseEvent) => {
  if (spanIsDragging.value) return
  const svgX = spanClientToSvgX(e.clientX)
  if (svgX == null) return
  const span = spanSvgXToSpan(svgX)
  if (span == null) return
  const spans = spanScanData.value!.spanLengthsKm
  const clamped = Math.max(spans[0], Math.min(spans[spans.length - 1], Math.round(span)))
  spanCursorSpan.value = clamped
  spanUserSelectedSpan.value = clamped
}

// 拖拽事件
const handleSpanCursorDragStart = (e: MouseEvent | TouchEvent) => {
  e.preventDefault()
  e.stopPropagation()
  spanIsDragging.value = true
  document.addEventListener('mousemove', handleSpanCursorDragMove)
  document.addEventListener('mouseup', handleSpanCursorDragEnd)
  document.addEventListener('touchmove', handleSpanCursorDragMove)
  document.addEventListener('touchend', handleSpanCursorDragEnd)
}

const handleSpanCursorDragMove = (e: MouseEvent | TouchEvent) => {
  if (!spanIsDragging.value || !spanScanData.value) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const svgX = spanClientToSvgX(clientX)
  if (svgX == null) return
  const span = spanSvgXToSpan(svgX)
  if (span == null) return
  const spans = spanScanData.value.spanLengthsKm
  spanCursorSpan.value = Math.max(spans[0], Math.min(spans[spans.length - 1], Math.round(span)))
}

const handleSpanCursorDragEnd = () => {
  spanIsDragging.value = false
  document.removeEventListener('mousemove', handleSpanCursorDragMove)
  document.removeEventListener('mouseup', handleSpanCursorDragEnd)
  document.removeEventListener('touchmove', handleSpanCursorDragMove)
  document.removeEventListener('touchend', handleSpanCursorDragEnd)
  if (spanCursorSpan.value != null) {
    spanUserSelectedSpan.value = spanCursorSpan.value
  }
}

// 恢复推荐方案
const restoreRecommendedSpan = () => {
  if (spanScanData.value) {
    spanCursorSpan.value = spanScanData.value.recommendedSpanKm
    spanUserSelectedSpan.value = null
  }
}

// 根据 KP 计算线路上的经纬度（优先使用 RPL 路径，其次使用 segments 拓扑路径）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getCoordinateByKP = (
  targetKP: number,
  route: Record<string, any>,
  configTotalLength?: number,
  rplRecords?: Record<string, any>[]
): { longitude: number, latitude: number } => {
  if (!route || !route.points || route.points.length < 2) {
    return { longitude: 0, latitude: 0 }
  }

  // 1) 优先使用 RPL 记录路径（已是用户选择的链路顺序）
  let orderedCoords: [number, number][] = []
  if (rplRecords && rplRecords.length >= 2) {
    const usableRecords = rplRecords.filter(r => !(r as any).isBranchStation)
    const orderedRecords = [...usableRecords].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    orderedCoords = orderedRecords
      .map(r => [r.longitude, r.latitude] as [number, number])
      .filter(c => typeof c[0] === 'number' && typeof c[1] === 'number')
  }

  // 2) 回退：使用 segments 构建主干路径
  if (orderedCoords.length < 2) {
    const pointMap: Record<string, [number, number]> = {}
    for (const p of route.points) {
      pointMap[p.id] = p.coordinates
    }

    if (route.segments && route.segments.length > 0) {
      // 选择主干起终点（优先非分支登陆站）
      const landingPoints = route.points.filter((p: any) => p.type === 'landing')
      const mainLandings = landingPoints.filter((p: any) => !(p as any).isBranchStation)
      const startPoint = mainLandings[0] || landingPoints[0] || route.points[0]
      const endPoint = mainLandings[mainLandings.length - 1] || landingPoints[landingPoints.length - 1] || route.points[route.points.length - 1]

      if (startPoint && endPoint && startPoint.id !== endPoint.id) {
        // 构建无向图
        const adj = new Map<string, string[]>()
        route.segments.forEach((seg: any) => {
          if (!adj.has(seg.startPointId)) adj.set(seg.startPointId, [])
          if (!adj.has(seg.endPointId)) adj.set(seg.endPointId, [])
          adj.get(seg.startPointId)!.push(seg.endPointId)
          adj.get(seg.endPointId)!.push(seg.startPointId)
        })

        // BFS 寻径
        const queue: string[] = [startPoint.id]
        const visited = new Set<string>([startPoint.id])
        const prev = new Map<string, string | null>()
        prev.set(startPoint.id, null)

        while (queue.length > 0) {
          const current = queue.shift()!
          if (current === endPoint.id) break
          const neighbors = adj.get(current) || []
          for (const n of neighbors) {
            if (!visited.has(n)) {
              visited.add(n)
              prev.set(n, current)
              queue.push(n)
            }
          }
        }

        if (visited.has(endPoint.id)) {
          const pathIds: string[] = []
          let cur: string | null = endPoint.id
          while (cur) {
            pathIds.push(cur)
            cur = prev.get(cur) || null
          }
          pathIds.reverse()
          orderedCoords = pathIds.map(id => pointMap[id]).filter(Boolean)
        }
      }
    }
  }

  // 3) 最后回退：直接使用 points 数组顺序
  if (orderedCoords.length < 2) {
    orderedCoords = route.points.map((p: any) => p.coordinates)
  }
  
  if (orderedCoords.length < 2) {
    return { longitude: 0, latitude: 0 }
  }
  
  // 计算路由的实际总长度
  let actualTotalLength = 0
  const segmentLengths: number[] = []
  for (let i = 0; i < orderedCoords.length - 1; i++) {
    const segmentLength = calculateDistance(orderedCoords[i], orderedCoords[i + 1])
    segmentLengths.push(segmentLength)
    actualTotalLength += segmentLength
  }
  
  // 使用配置的总长度或实际总长度计算比例
  const totalLen = configTotalLength || actualTotalLength
  const ratio = Math.min(targetKP / totalLen, 1)
  const targetActualKP = ratio * actualTotalLength
  
  // 根据实际距离找到对应的线段并插值
  let cumulativeKP = 0
  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i]
    
    if (cumulativeKP + segmentLength >= targetActualKP) {
      const p1 = orderedCoords[i]
      const p2 = orderedCoords[i + 1]
      const localRatio = segmentLength > 0 ? (targetActualKP - cumulativeKP) / segmentLength : 0
      return {
        longitude: p1[0] + (p2[0] - p1[0]) * localRatio,
        latitude: p1[1] + (p2[1] - p1[1]) * localRatio
      }
    }
    cumulativeKP += segmentLength
  }
  
  // 如果超出范围，返回最后一个点
  const lastCoord = orderedCoords[orderedCoords.length - 1]
  return {
    longitude: lastCoord[0],
    latitude: lastCoord[1]
  }
}

// 构建主干路径坐标序列（使用 BFS 沿 segments 寻径，包含所有 waypoint 拐点）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildPathCoords = (route: Record<string, any>, rplRecords: Record<string, any>[]) => {
  // 1) 优先使用 RPL — 但仅当 RPL 与当前路由匹配且有足够中间点时
  if (rplRecords && rplRecords.length >= 3) {
    // ★ 关键修复：验证 RPL 表格的 routeId 是否与选中路由一致
    // 如果不匹配，跳过 RPL 数据，使用 route.points 回退路径
    const rplTable = rplStore.tables.find(t => t.id === selectedRplId.value)
    const rplRouteMatch = !rplTable?.routeId || rplTable.routeId === route?.id
    if (rplRouteMatch) {
      const usableRecords = rplRecords.filter((r: any) => !(r as any).isBranchStation)
      const orderedRecords = [...usableRecords].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      const coords = orderedRecords
        .map(r => [r.longitude, r.latitude] as [number, number])
        .filter(c => typeof c[0] === 'number' && typeof c[1] === 'number')
      if (coords.length >= 3) return coords
    }
  }

  // 2) 使用 segments 做 BFS 寻径（包含所有 waypoint，描述真实路径弯曲）
  if (route?.segments?.length > 0 && route?.points?.length >= 2) {
    const pointMap: Record<string, [number, number]> = {}
    for (const p of route.points) {
      pointMap[p.id] = p.coordinates
    }

    const landingPoints = route.points.filter((p: any) => p.type === 'landing')
    const mainLandings = landingPoints.filter((p: any) => !(p as any).isBranchStation)
    const startPoint = mainLandings[0] || landingPoints[0] || route.points[0]
    const endPoint = mainLandings[mainLandings.length - 1] || landingPoints[landingPoints.length - 1] || route.points[route.points.length - 1]

    if (startPoint && endPoint && startPoint.id !== endPoint.id) {
      const adj = new Map<string, string[]>()
      route.segments.forEach((seg: any) => {
        if (!adj.has(seg.startPointId)) adj.set(seg.startPointId, [])
        if (!adj.has(seg.endPointId)) adj.set(seg.endPointId, [])
        adj.get(seg.startPointId)!.push(seg.endPointId)
        adj.get(seg.endPointId)!.push(seg.startPointId)
      })

      const queue: string[] = [startPoint.id]
      const visited = new Set<string>([startPoint.id])
      const prev = new Map<string, string | null>()
      prev.set(startPoint.id, null)

      while (queue.length > 0) {
        const current = queue.shift()!
        if (current === endPoint.id) break
        const neighbors = adj.get(current) || []
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n)
            prev.set(n, current)
            queue.push(n)
          }
        }
      }

      if (visited.has(endPoint.id)) {
        const pathIds: string[] = []
        let cur: string | null = endPoint.id
        while (cur) {
          pathIds.push(cur)
          cur = prev.get(cur) || null
        }
        pathIds.reverse()
        const bfsCoords = pathIds.map(id => pointMap[id]).filter(Boolean)
        if (bfsCoords.length >= 2) return bfsCoords
      }
    }
  }

  // 3) 最终回退：直接使用 points 数组顺序
  const fallback = route?.points?.map((p: any) => p.coordinates) || []
  return fallback
}

// 应用配置并关闭 - 直接将放大器添加到 connectorStore
const isApplying = ref(false)

const syncPlannedEqualizersToConnector = (
  route: Record<string, any>,
  routeId: string,
  configTotalLength: number
) => {
  ensureConnectorRouteTable(routeId, route.name)

  const rplRecords = getSelectedRplRecords(routeId)

  const existingEqualizers = connectorStore.getElementsForRoute(routeId)
    .filter(element => element.type === 'equalizer')

  const plannedIds = new Set(plannedEqualizers.value.map(item => item.id).filter(Boolean))

  existingEqualizers
    .filter(element => !plannedIds.has(element.id))
    .forEach(element => {
      connectorStore.deleteElement(element.id, false)
    })

  plannedEqualizers.value.forEach((equalizer, index) => {
    const normalized = normalizeEqualizerConfig(equalizer)
    const typeInfo = settingsStore.equalizerTypes.find(type => type.id === equalizer.componentRefId)
    const position = getPositionByKP(equalizer.kp, route, configTotalLength, rplRecords)
    const payload = {
      name: equalizer.name.trim() || `EQ-${String(index + 1).padStart(2, '0')}`,
      type: 'equalizer' as const,
      kp: equalizer.kp,
      longitude: position.longitude,
      latitude: position.latitude,
      depth: position.depth,
      status: 'planned' as const,
      specifications: typeInfo?.name || equalizer.specifications || '均衡器',
      componentRefId: equalizer.componentRefId || undefined,
      equalizerRole: normalized.equalizerRole,
      attenuationMode: normalized.attenuationMode,
      attenuationDb: normalized.attenuationDb,
      remarks: equalizer.remarks || '系统规划均衡器落位',
    }

    if (equalizer.id) {
      connectorStore.updateElement(equalizer.id, payload, false)
    } else {
      connectorStore.addElement(payload, false)
    }
  })
}

const syncAutoJointsToConnector = (
  route: Record<string, any>,
  routeId: string,
  configTotalLength: number
) => {
  ensureConnectorRouteTable(routeId, route.name)
  const segmentConfigs = collectCableSegmentsForRoute(routeId)
  const rplRecords = getSelectedRplRecords(routeId)

  const routeElements = connectorStore.getElementsForRoute(routeId)
  const isAutoJoint = (element: ConnectorElement) =>
    element.type === 'joint' && Boolean(element.remarks?.startsWith(AUTO_JOINT_REMARK_PREFIX))

  const autoJoints = routeElements.filter(element => isAutoJoint(element))
  const manualOrFixedDevices = routeElements.filter(element =>
    element.type !== 'fiber' &&
    element.type !== 'cable_segment' &&
    !isAutoJoint(element)
  )

  const routeTotalLength = configTotalLength || linkInfo.value?.trunkLength || linkInfo.value?.totalLength || 0
  const targetCandidates: Array<{ kp: number; reason: string }> = []
  const boundarySet = new Set<string>()
  segmentConfigs.forEach(segment => {
    boundarySet.add(segment.startKp.toFixed(1))
    boundarySet.add(segment.endKp.toFixed(1))
  })
  Array.from(boundarySet)
    .map(value => Number(value))
    .filter(kp => Number.isFinite(kp) && kp > 0 && (routeTotalLength <= 0 || kp < routeTotalLength))
    .forEach(kp => {
      targetCandidates.push({ kp, reason: '海缆段边界' })
    })

  if (targetCandidates.length === 0 && routeTotalLength > 0) {
    const fallbackCount = Math.max(2, Math.min(24, Math.round(routeTotalLength / 180)))
    const fallbackKps = Array.from({ length: fallbackCount }, (_, index) =>
      Number(((routeTotalLength * (index + 1)) / (fallbackCount + 1)).toFixed(1))
    )
    fallbackKps.forEach(kp => {
      targetCandidates.push({ kp, reason: '链路总长兜底' })
    })
  }

  if (targetCandidates.length === 0) {
    const longestSegment = [...segmentConfigs].sort((a, b) => (b.endKp - b.startKp) - (a.endKp - a.startKp))[0]
    if (longestSegment) {
      targetCandidates.push({
        kp: Number(((longestSegment.startKp + longestSegment.endKp) / 2).toFixed(1)),
        reason: '海缆段中点兜底',
      })
    }
  }

  const targetJointMap = targetCandidates.reduce<Map<string, { kp: number; reason: string }>>((acc, candidate) => {
    if (!Number.isFinite(candidate.kp)) return acc
    if (candidate.kp <= 0 || (routeTotalLength > 0 && candidate.kp >= routeTotalLength)) return acc
    if (manualOrFixedDevices.some(device => Math.abs(device.kp - candidate.kp) < JOINT_KP_TOLERANCE)) return acc

    const key = candidate.kp.toFixed(1)
    if (!acc.has(key)) {
      acc.set(key, { kp: Number(key), reason: candidate.reason })
    }
    return acc
  }, new Map())

  const targetJoints = Array.from(targetJointMap.values()).sort((a, b) => a.kp - b.kp)
  if (targetJoints.length === 0) return

  const targetKpKeys = new Set(targetJoints.map(item => item.kp.toFixed(1)))
  const retainedAutoJoints = autoJoints.filter(element => targetKpKeys.has(element.kp.toFixed(1)))
  autoJoints
    .filter(element => !targetKpKeys.has(element.kp.toFixed(1)))
    .forEach(element => connectorStore.deleteElement(element.id, false))

  targetJoints.forEach((target, index) => {
    const position = getPositionByKP(target.kp, route, configTotalLength, rplRecords)
    const matchedSegment = findSegmentConfigAtKp(segmentConfigs, target.kp)
    const jointSubType = inferAutoJointSubType(
      target.kp,
      routeTotalLength,
      position.depth,
      matchedSegment?.cableTypeName || position.cableType,
      routeElements,
    )
    const jointType = selectJointBoxTypeForSubtype(jointSubType)
    const matched = retainedAutoJoints.find(element => Math.abs(element.kp - target.kp) < JOINT_KP_TOLERANCE)
    const payload = {
      name: `JB-${String(index + 1).padStart(2, '0')}`,
      type: 'joint' as const,
      kp: target.kp,
      longitude: position.longitude,
      latitude: position.latitude,
      depth: position.depth,
      status: 'planned' as const,
      componentRefId: jointType?.id || undefined,
      jointSubType,
      specifications: jointType?.name || jointSubType,
      remarks: `${AUTO_JOINT_REMARK_PREFIX} ${target.reason} KP${target.kp.toFixed(1)}km | ${jointSubType}`,
    }
    if (matched) {
      connectorStore.updateElement(matched.id, payload, false)
    } else {
      connectorStore.addElement(payload, false)
    }
  })
}

const applyAndClose = async () => {
  if (isApplying.value) return
  isApplying.value = true
  try {
    if (!calculationResult.value || !calculationResult.value.amplifiers) {
      emit('close')
      return
    }
    
    // 优先使用 selectedRoute，回退到 paretoRoutes[0]
    const route = routeStore.selectedRoute || routeStore.paretoRoutes[0] || null
    if (!route) {
      emit('close')
      return
    }

    const equalizerValidationMessage = validatePlannedEqualizers()
    if (equalizerValidationMessage) {
      appStore.showNotification({ type: 'error', message: equalizerValidationMessage })
      return
    }
    
    const configTotalLength = linkInfo.value?.trunkLength || linkInfo.value?.totalLength || 0
    const rplRecords = getSelectedRplRecords(route.id)
    const spanLengthVal = calculationResult.value.systemConfig.avgSpanLength || 80
    const ampType = settingsStore.amplifierTypes.find(a => a.id === selectedAmplifierTypeId.value)
    const fiberType = settingsStore.fiberTypes.find(f => f.id === selectedFiberTypeId.value)
    const simAmplifiers = calculationResult.value.amplifiers
    
    // ── 构建主干/分支路径坐标（优先 rawTrunkCoordinates，否则从 segment 拓扑重建） ──
    let trunkCoords: [number, number][] = (route as any).rawTrunkCoordinates || []
    let rawBranches: Array<{ fromBuId: string; toLandingName: string; coordinates: [number, number][] }> = (route as any).rawBranches || []
    let rawNamedPoints: Array<{ id: string; type: string; lon: number; lat: number; name: string }> = (route as any).rawNamedPoints || []
    
    // 如果原始坐标未储存（旧路由），从 segment 拓扑重建
    const hasTrunkSegs = route.segments?.some((s: any) => s.id?.startsWith('trunk-'))
    const hasBranchSegs = route.segments?.some((s: any) => s.id?.startsWith('branch-'))
    const ptMap = new Map(route.points.map((p: any) => [p.id, p]))
    
    if (trunkCoords.length < 2 && hasTrunkSegs) {
      // 仅用 trunk-* segment 构建主干邻接表（排除分支点）
      const trunkAdj = new Map<string, string[]>()
      for (const seg of route.segments) {
        if (!seg.id?.startsWith('trunk-')) continue
        if (!trunkAdj.has(seg.startPointId)) trunkAdj.set(seg.startPointId, [])
        if (!trunkAdj.has(seg.endPointId)) trunkAdj.set(seg.endPointId, [])
        trunkAdj.get(seg.startPointId)!.push(seg.endPointId)
        trunkAdj.get(seg.endPointId)!.push(seg.startPointId)
      }
      const mainLandings = route.points.filter((p: any) =>
        p.type === 'landing' && !(p as any).isBranchStation && trunkAdj.has(p.id)
      )
      if (mainLandings.length >= 2) {
        const startPt = mainLandings[0]
        const endPt = mainLandings[mainLandings.length - 1]
        const queue = [startPt.id]
        const visited = new Set([startPt.id])
        const prev = new Map<string, string | null>([[startPt.id, null]])
        while (queue.length > 0) {
          const cur = queue.shift()!
          if (cur === endPt.id) break
          for (const n of (trunkAdj.get(cur) || [])) {
            if (!visited.has(n)) { visited.add(n); prev.set(n, cur); queue.push(n) }
          }
        }
        if (visited.has(endPt.id)) {
          const ids: string[] = []
          let c: string | null = endPt.id
          while (c) { ids.push(c); c = prev.get(c) || null }
          ids.reverse()
          trunkCoords = ids.map(id => ptMap.get(id)?.coordinates).filter(Boolean) as [number, number][]
        }
      }
    }
    // 最终回退
    if (trunkCoords.length < 2) {
      trunkCoords = route.points
        .filter((p: any) => !(p as any).isBranchStation)
        .map((p: any) => p.coordinates)
    }
    
    if (rawBranches.length === 0 && hasBranchSegs) {
      // 从 branch-* segment 拓扑重建分支路径（不依赖 isBranchStation 标记）
      const branchAdj = new Map<string, string[]>()
      const branchPointIds = new Set<string>()
      for (const seg of route.segments) {
        if (!seg.id?.startsWith('branch-')) continue
        branchPointIds.add(seg.startPointId)
        branchPointIds.add(seg.endPointId)
        if (!branchAdj.has(seg.startPointId)) branchAdj.set(seg.startPointId, [])
        if (!branchAdj.has(seg.endPointId)) branchAdj.set(seg.endPointId, [])
        branchAdj.get(seg.startPointId)!.push(seg.endPointId)
        branchAdj.get(seg.endPointId)!.push(seg.startPointId)
      }
      // BU = branching 类型且在分支邻接表中
      const buPoints = route.points.filter((p: any) =>
        (p.type === 'branching' || p.type === 'bu') && branchAdj.has(p.id)
      )
      // 分支登陆站 = 在分支 segment 中的 landing 点（非 BU）
      // 找分支图中度数1的 landing 点（叶子节点）
      const branchLandings = route.points.filter((p: any) => {
        if (p.type === 'branching' || p.type === 'bu') return false
        if (!branchPointIds.has(p.id)) return false
        // 确认是分支图中的叶子节点（landing）或明确标记
        return p.type === 'landing' || (p as any).isBranchStation
      })
      console.log(`🔍 分支重建: ${buPoints.length} BU, ${branchLandings.length} 分支登陆站, ${branchPointIds.size} 分支点`)
      const done = new Set<string>()
      for (const bu of buPoints) {
        for (const landing of branchLandings) {
          const key = `${bu.id}->${landing.id}`
          if (done.has(key)) continue
          const queue = [bu.id]
          const visited = new Set([bu.id])
          const prev = new Map<string, string | null>([[bu.id, null]])
          while (queue.length > 0) {
            const cur = queue.shift()!
            if (cur === landing.id) break
            for (const n of (branchAdj.get(cur) || [])) {
              if (!visited.has(n)) { visited.add(n); prev.set(n, cur); queue.push(n) }
            }
          }
          if (visited.has(landing.id)) {
            done.add(key)
            const ids: string[] = []
            let c: string | null = landing.id
            while (c) { ids.push(c); c = prev.get(c) || null }
            ids.reverse()
            const coords = ids.map(id => ptMap.get(id)?.coordinates).filter(Boolean) as [number, number][]
            if (coords.length >= 2) {
              rawBranches.push({ fromBuId: bu.id, toLandingName: landing.name || '登陆站', coordinates: coords })
              console.log(`  ✅ 分支: ${bu.name || bu.id} → ${landing.name || landing.id}, ${coords.length} 点`)
            }
          }
        }
      }
      // ★ 备用策略：如果上面找不到 landing，尝试用分支图中度数1且非 BU 的任意点作为终点
      if (rawBranches.length === 0 && buPoints.length > 0) {
        // 找分支图中的叶子节点（degree=1 且非 BU）
        const buIdSet = new Set(buPoints.map((p: any) => p.id))
        for (const [pid, neighbors] of branchAdj) {
          if (buIdSet.has(pid)) continue
          if (neighbors.length !== 1) continue // 叶子节点
          const leafPt = ptMap.get(pid)
          if (!leafPt) continue
          // BFS 从最近的 BU 到这个叶子
          for (const bu of buPoints) {
            const key2 = `${bu.id}->${pid}`
            if (done.has(key2)) continue
            const q2 = [bu.id]
            const v2 = new Set([bu.id])
            const p2 = new Map<string, string | null>([[bu.id, null]])
            while (q2.length > 0) {
              const cur = q2.shift()!
              if (cur === pid) break
              for (const n of (branchAdj.get(cur) || [])) {
                if (!v2.has(n)) { v2.add(n); p2.set(n, cur); q2.push(n) }
              }
            }
            if (v2.has(pid)) {
              done.add(key2)
              const ids: string[] = []
              let c2: string | null = pid
              while (c2) { ids.push(c2); c2 = p2.get(c2) || null }
              ids.reverse()
              const coords = ids.map(id => ptMap.get(id)?.coordinates).filter(Boolean) as [number, number][]
              if (coords.length >= 2) {
                rawBranches.push({ fromBuId: bu.id, toLandingName: leafPt.name || '登陆站', coordinates: coords })
                console.log(`  ✅ 分支(叶子): ${bu.name || bu.id} → ${leafPt.name || pid}, ${coords.length} 点`)
              }
              break // 每个叶子只配一个 BU
            }
          }
        }
      }
    }
    
    if (rawNamedPoints.length === 0) {
      rawNamedPoints = route.points
        .filter((p: any) => p.type === 'landing' || p.type === 'branching')
        .map((p: any) => ({ id: p.id, type: p.type, lon: p.coordinates[0], lat: p.coordinates[1], name: p.name || '' }))
    }
    
    console.log(`📡 落位数据: 主干 ${trunkCoords.length} 点, ${rawBranches.length} 分支, ${rawNamedPoints.length} 命名点`)
    rawBranches.forEach((b, i) => {
      console.log(`  分支[${i}]: ${b.fromBuId} → ${b.toLandingName}, ${b.coordinates.length} 坐标点`)
    })
    
    let backendAmps: any[] = []
    let backendFibers: any[] = []
    
    try {
      const resp = await fetch('/api/route/amplifier-placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trunkCoordinates: trunkCoords,
          branches: rawBranches,
          namedPoints: rawNamedPoints,
          spanLength: spanLengthVal,
          amplifierKPs: simAmplifiers.map((a: any) => ({
            position: a.position,
            name: a.name,
            gain: a.gain,
            noiseFigure: a.noiseFigure,
            precedingSpan: a.precedingSpan,
          })),
        }),
      })
      const data = await resp.json()
      if (data.success) {
        backendAmps = data.amplifiers || []
        backendFibers = data.fibers || []
        const branchAmps = backendAmps.filter((a: any) => a.isBranch)
        console.log(`✅ 后端落位成功: ${backendAmps.length} 放大器 (主干 ${backendAmps.length - branchAmps.length}, 分支 ${branchAmps.length}), ${backendFibers.length} 光纤段`)
        if (data.debug) {
          console.log(`📊 后端诊断:`, JSON.stringify(data.debug))
        }
      } else {
        console.warn('后端落位失败, 回退前端落位:', data.error)
      }
    } catch (err) {
      console.warn('后端落位 API 调用失败, 回退前端落位:', err)
    }
    
    // 0) 确保接线元表格存在
    if (!connectorStore.currentTable) {
      const routeName = route.name || '链路'
      connectorStore.createTable(`${routeName}_接线元`, route.id)
    }
    
    // 1) 清除旧的放大器和光纤段
    ensureConnectorRouteTable(route.id, route.name)
    connectorStore.deleteElementsByType(['ola', 'amplifier_e', 'amplifier_w', 'fiber'])
    
    // 2) 构建接线元
    syncPlannedEqualizersToConnector(route, route.id, configTotalLength)
    syncAutoJointsToConnector(route, route.id, configTotalLength)

    const newElements: Omit<import('@/types').ConnectorElement, 'id'>[] = []
    
    if (backendAmps.length > 0) {
      // ── 使用后端落位结果（精确坐标） ──
      for (let i = 0; i < backendAmps.length; i++) {
        const amp = backendAmps[i]
        const ampPosition = getPositionByKP(amp.kp, route, configTotalLength, rplRecords)
        newElements.push({
          name: amp.name,
          type: 'ola',
          kp: amp.kp,
          longitude: amp.longitude ?? ampPosition.longitude,
          latitude: amp.latitude ?? ampPosition.latitude,
          depth: Number.isFinite(amp.depth) && Math.abs(amp.depth) > 0 ? amp.depth : ampPosition.depth,
          status: 'planned',
          specifications: ampType
            ? `${ampType.name} | G=${amp.gain || 0}dB NF=${amp.noiseFigure || 0}dB`
            : `G=${amp.gain || 0}dB`,
          componentRefId: selectedAmplifierTypeId.value,
          remarks: amp.isBranch
            ? `分支放大器 | ${amp.branchInfo || ''}`
            : `系统规划自动生成 | 跨段${amp.precedingSpan || spanLengthVal}km`
        })
      }
      // 光纤段
      for (const fib of backendFibers) {
        const fiberPosition = getPositionByKP(fib.kp, route, configTotalLength, rplRecords)
        newElements.push({
          name: fib.name,
          type: 'fiber',
          kp: fib.kp,
          endKp: fib.endKp,
          longitude: fib.longitude ?? fiberPosition.longitude,
          latitude: fib.latitude ?? fiberPosition.latitude,
          depth: Number.isFinite(fib.depth) && Math.abs(fib.depth) > 0 ? fib.depth : fiberPosition.depth,
          status: 'planned',
          specifications: fiberType?.name || '',
          fiberRefId: selectedFiberTypeId.value,
          length: fib.length,
          remarks: fib.isBranch ? '分支光纤' : ''
        })
      }
    } else {
      // ── 回退：使用前端简化落位（仅主干） ──
      const pathCoords = trunkCoords.length >= 2 ? trunkCoords : route.points.map(p => p.coordinates)
      let actualTotalLength = 0
      const segmentLens: number[] = []
      for (let i = 0; i < pathCoords.length - 1; i++) {
        const sl = calculateDistance(pathCoords[i], pathCoords[i + 1])
        segmentLens.push(sl)
        actualTotalLength += sl
      }
      const totalLen = configTotalLength || actualTotalLength
      
      const kpToCoord = (targetKP: number) => getPositionByKP(targetKP, route, totalLen, rplRecords)
      
      for (let i = 0; i < simAmplifiers.length; i++) {
        const amp = simAmplifiers[i]
        const coord = kpToCoord(amp.position)
        newElements.push({
          name: amp.name,
          type: 'ola',
          kp: amp.position,
          longitude: coord.longitude,
          latitude: coord.latitude,
          depth: coord.depth,
          status: 'planned',
          specifications: ampType ? `${ampType.name} | G=${amp.gain}dB NF=${amp.noiseFigure}dB` : `G=${amp.gain}dB`,
          componentRefId: selectedAmplifierTypeId.value,
          remarks: `系统规划自动生成 | 跨段${amp.precedingSpan}km`
        })
        const nextKp = (i < simAmplifiers.length - 1) ? simAmplifiers[i + 1].position : configTotalLength
        const sl = nextKp - amp.position
        if (sl > 0) {
          newElements.push({
            name: `光纤段 ${amp.name}-${i < simAmplifiers.length - 1 ? simAmplifiers[i + 1].name : 'Rx'}`,
            type: 'fiber', kp: amp.position, endKp: nextKp,
            longitude: coord.longitude, latitude: coord.latitude,
            depth: coord.depth, status: 'planned', specifications: fiberType?.name || '',
            fiberRefId: selectedFiberTypeId.value, length: sl, remarks: ''
          })
        }
      }
      if (simAmplifiers.length > 0 && simAmplifiers[0].position > 0) {
        const startCoord = kpToCoord(0)
        newElements.unshift({
          name: `光纤段 Tx-${simAmplifiers[0].name}`,
          type: 'fiber', kp: 0, endKp: simAmplifiers[0].position,
          longitude: startCoord.longitude, latitude: startCoord.latitude,
          depth: startCoord.depth, status: 'planned', specifications: fiberType?.name || '',
          fiberRefId: selectedFiberTypeId.value, length: simAmplifiers[0].position, remarks: ''
        })
      }
    }
    
    // 2.5) 分支放大器 fallback — 如果有分支但后端未返回分支放大器，前端自己沿分支坐标生成
    const branchAmpCount = newElements.filter(e => e.remarks?.includes('分支放大器')).length
    if (rawBranches.length > 0 && branchAmpCount === 0) {
      console.log(`⚠️ 后端未返回分支放大器，前端自行落位 ${rawBranches.length} 个分支`)
      let branchAmpIdx = newElements.filter(e => e.type === 'ola').length
      for (const branch of rawBranches) {
        const bCoords = branch.coordinates
        if (!bCoords || bCoords.length < 2) continue
        const branchSourcePoint = route.points.find((point: any) => point.id === branch.fromBuId)
        const branchSourceDepth = branchSourcePoint?.depth
        const branchDepth = Number.isFinite(branchSourceDepth) ? Number(branchSourceDepth) : 0
        // 计算分支累积距离
        const bSegLens: number[] = []
        let bTotalLen = 0
        for (let k = 0; k < bCoords.length - 1; k++) {
          const sl = calculateDistance(bCoords[k], bCoords[k + 1])
          bSegLens.push(sl)
          bTotalLen += sl
        }
        console.log(`  分支 ${branch.toLandingName}: ${bCoords.length} 点, ${Math.round(bTotalLen)}km`)
        if (bTotalLen < spanLengthVal) continue
        const ampCount = Math.floor(bTotalLen / spanLengthVal)
        for (let j = 1; j <= ampCount; j++) {
          const targetKm = j * spanLengthVal
          if (targetKm >= bTotalLen) break
          // 沿路径插值
          let cumLen = 0
          let lon = bCoords[0][0], lat = bCoords[0][1]
          for (let k = 0; k < bSegLens.length; k++) {
            if (cumLen + bSegLens[k] >= targetKm) {
              const r = bSegLens[k] > 0 ? (targetKm - cumLen) / bSegLens[k] : 0
              lon = bCoords[k][0] + (bCoords[k + 1][0] - bCoords[k][0]) * r
              lat = bCoords[k][1] + (bCoords[k + 1][1] - bCoords[k][1]) * r
              break
            }
            cumLen += bSegLens[k]
          }
          branchAmpIdx++
          newElements.push({
            name: `AMP-${String(branchAmpIdx).padStart(2, '0')}`,
            type: 'ola',
            kp: targetKm,
            longitude: lon,
            latitude: lat,
            depth: branchDepth,
            status: 'planned',
            specifications: ampType ? `${ampType.name} | 分支放大器` : '分支放大器',
            componentRefId: selectedAmplifierTypeId.value,
            remarks: `分支放大器 | ${branch.fromBuId || 'BU'} → ${branch.toLandingName || '登陆站'}`
          })
        }
        console.log(`  ✅ 分支 ${branch.toLandingName}: 生成 ${ampCount} 个放大器`)
      }
    }
    
    // 3) 先添加非光线元素（放大器等），再根据实际 store ID 修正光线段的 fromDeviceId/toDeviceId
    const ampElements = newElements.filter(e => e.type !== 'fiber')
    const fiberElements = newElements.filter(e => e.type === 'fiber')
    
    const addedAmpIds = connectorStore.addElements(ampElements, false)
    const syncedAmpElements = addedAmpIds
      .map(id => connectorStore.elements.find(e => e.id === id))
      .filter((element): element is ConnectorElement => !!element && element.type !== 'fiber')

    const activeRouteId = selectedRouteId.value || routeStore.currentRouteId || route.id
    const currentSldRouteTable = sldStore.tables.find(table => table.routeId === activeRouteId)
    if (currentSldRouteTable) {
      sldStore.selectTable(currentSldRouteTable.id)
    } else if (!sldStore.currentTable || sldStore.currentTable.routeId !== activeRouteId) {
      sldStore.createTable(`${route.name || '链路'}_SLD`, activeRouteId)
    }

    const sldSyncElements = connectorStore.getElementsForRoute(activeRouteId).filter(element =>
      element.type === 'landing' ||
      element.type === 'underwater' ||
      element.type === 'amplifier_e' ||
      element.type === 'amplifier_w' ||
      element.type === 'ola' ||
      element.type === 'bu' ||
      element.type === 'joint' ||
      element.type === 'equalizer'
    )

    // 同步放大器到 SLD 表格管理
    sldStore.syncAmplifiersFromConnector(sldSyncElements.length > 0 ? sldSyncElements : syncedAmpElements, { routeId: activeRouteId })
    
    // 构建 KP → 实际设备的映射，修正光纤段的 fromDeviceId/toDeviceId
    // ★ 容差 10km（后端用 haversine 计算总长可能与前端 segment KP 有差异）
    const allDevices = connectorStore.elements.filter(e => e.type !== 'fiber')
    const findDeviceByKp = (targetKp: number) => {
      let best: typeof allDevices[0] | null = null
      let bestDist = Infinity
      for (const d of allDevices) {
        const dist = Math.abs(d.kp - targetKp)
        if (dist < bestDist) { bestDist = dist; best = d }
      }
      return bestDist < 10 ? best : null
    }
    
    // 按 KP 排序的登陆站，用于首尾光纤段的端点匹配
    // ★ 包含 'underwater' 类型（岸站水深>0时会被分类为 underwater）
    const landingDevices = allDevices
      .filter(d => d.type === 'landing' || d.type === 'underwater')
      .sort((a, b) => a.kp - b.kp)
    const startLanding = landingDevices[0] || null
    const endLanding = landingDevices[landingDevices.length - 1] || null
    
    const fixedFibers = fiberElements.map((fiber, idx) => {
      const fromDev = findDeviceByKp(fiber.kp)
      const toDev = fiber.endKp !== undefined ? findDeviceByKp(fiber.endKp) : null
      let resolvedFromId = fromDev?.id || fiber.fromDeviceId || ''
      let resolvedToId = toDev?.id || fiber.toDeviceId || ''
      
      // ★ 首段光纤找不到起点时，使用起点登陆站
      if (!resolvedFromId && idx === 0 && startLanding) {
        resolvedFromId = startLanding.id
      }
      // ★ 末段光纤找不到终点时，使用终点登陆站
      if (!resolvedToId && idx === fiberElements.length - 1 && endLanding) {
        resolvedToId = endLanding.id
      }
      
      return {
        ...fiber,
        fromDeviceId: resolvedFromId,
        toDeviceId: resolvedToId,
      }
    })
    
    const addedIds = connectorStore.addElements(fixedFibers, false)
    
    // 传递计算结果给父组件（包含完整 Span 扫描数据和用户选择）
    const activeSpan = spanUserSelectedSpan.value ?? spanScanData.value?.recommendedSpanKm
    emit('apply-result', {
      linkName: calculationResult.value.linkName,
      amplifierCount: calculationResult.value.amplifiers.length,
      avgSpanLength: activeSpan ?? calculationResult.value.systemConfig.avgSpanLength,
      metrics: calculationResult.value.metrics,
      margin: calculationResult.value.margin,
      systemConfig: calculationResult.value.systemConfig,
      costData: calculationResult.value.costData,
      userSelectedSpan: spanUserSelectedSpan.value,
      spanScanData: spanScanData.value,  // 完整的多点扫描数据
    })
    emit('close')
  } finally {
    isApplying.value = false
  }
}

// 初始化
watch(() => props.visible, (visible) => {
  if (visible) {
    // 加载当前选中的路由和 RPL
    selectedRouteId.value = routeStore.currentRouteId || ''
    selectedRplId.value = resolveRplTableForRoute(routeStore.currentRouteId || null)?.id || ''
    
    // 加载器件库默认值
    if (settingsStore.fiberTypes.length > 0 && !selectedFiberTypeId.value) {
      selectedFiberTypeId.value = settingsStore.fiberTypes[0].id
    }
    if (settingsStore.amplifierTypes.length > 0 && !selectedAmplifierTypeId.value) {
      selectedAmplifierTypeId.value = settingsStore.amplifierTypes[0].id
    }
    
    activeStep.value = 'link'
    void nextTick(() => {
      loadPlannedEqualizers()
    })
  }
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible" 
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="$emit('close')"
    >
      <div class="bg-white rounded-xl shadow-2xl w-[1000px] max-h-[85vh] flex flex-col">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-xl">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Cpu class="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">系统规划 – 链路配置</h2>
              <p class="text-xs text-gray-500">{{ activeStepSubtitle }}</p>
            </div>
          </div>
          <button 
            class="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            @click="$emit('close')"
          >
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <!-- 主体内容 -->
        <div class="flex flex-1 min-h-0">
          <!-- 左侧导航 -->
          <div class="w-52 border-r bg-gray-50 flex flex-col">
            <div class="p-4 border-b">
              <span class="text-sm font-medium text-gray-700">配置导航</span>
            </div>
            
            <!-- 步骤列表 -->
            <div class="flex-1 p-2 space-y-1">
              <button
                v-for="step in steps"
                :key="step.id"
                class="w-full px-3 py-2.5 rounded-lg text-left text-sm transition-colors flex items-center gap-2"
                :class="[
                  activeStep === step.id 
                    ? 'bg-blue-100 text-blue-700 font-medium' 
                    : 'hover:bg-gray-100 text-gray-600'
                ]"
                @click="activeStep = step.id"
              >
                <component :is="step.icon" class="w-4 h-4" />
                <span class="flex-1">{{ step.label }}</span>
                <CheckCircle2 
                  v-if="stepStatus[step.id]" 
                  class="w-4 h-4 text-green-500" 
                />
                <AlertCircle 
                  v-else 
                  class="w-4 h-4 text-amber-500" 
                />
              </button>
            </div>
            
            <!-- 配置完整度 -->
            <div class="p-4 border-t">
              <div class="text-xs text-gray-500 mb-2">配置完整度</div>
              <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-blue-500 transition-all duration-300"
                  :style="{ width: `${completionPercentage}%` }"
                />
              </div>
              <div class="text-right text-xs text-gray-500 mt-1">{{ completionPercentage }}%</div>
              
              <div class="mt-4 space-y-2">
                <Button 
                  class="w-full"
                  :disabled="!canStartCalculation"
                  @click="startCalculation"
                >
                  <PlayCircle class="w-4 h-4 mr-1" /> 开始计算
                </Button>
                <div v-if="!canStartCalculation" class="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle class="w-3 h-3" /> 有未完成项
                </div>
              </div>
            </div>
          </div>
          
          <!-- 右侧内容区 -->
          <div class="flex-1 flex flex-col min-h-0 min-w-0">
            <div class="flex-1 overflow-auto p-6">
              <!-- Step 1: 链路选择 -->
              <div v-if="activeStep === 'link'" class="space-y-6">
                <h3 class="text-base font-semibold text-gray-800">链路选择</h3>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">选择规划链路：</label>
                  <div class="flex gap-4">
                    <Select 
                      v-model="selectedRouteId" 
                      :options="routeOptions" 
                      placeholder="选择路由..."
                      class="flex-1"
                    />
                    <Select 
                      v-model="selectedRplId" 
                      :options="rplOptions" 
                      placeholder="选择RPL表..."
                      class="flex-1"
                    />
                  </div>
                </div>
                
                <!-- 链路基本信息 -->
                <div v-if="linkInfo" class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">链路基本信息</div>
                  <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="flex justify-between">
                      <span class="text-gray-500">链路名称：</span>
                      <span class="font-medium">{{ linkInfo.name }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">总长度：</span>
                      <span class="font-medium">{{ (linkInfo.totalLength || 0).toFixed(1) }} km</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">起点站：</span>
                      <span class="font-medium">{{ linkInfo.startStation }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">终点站：</span>
                      <span class="font-medium">{{ linkInfo.endStation }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">经过 BU：</span>
                      <span class="font-medium">{{ linkInfo.buCount }} 个 ({{ linkInfo.buNames }})</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-500">创建时间：</span>
                      <span class="font-medium">{{ linkInfo.createdAt }}</span>
                    </div>
                  </div>
                </div>
                
                <!-- 链路拓扑预览 -->
                <div v-if="linkInfo" class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">链路拓扑预览</div>
                  <div class="flex items-center justify-center flex-wrap gap-1 py-4 text-sm text-gray-600">
                    <template v-for="(node, i) in linkInfo.topology" :key="node.id">
                      <span 
                        class="px-3 py-1 rounded whitespace-nowrap"
                        :class="node.type === 'branching' ? 'bg-amber-100' : 'bg-blue-100'"
                      >
                        {{ node.name }}
                      </span>
                      <span v-if="i < linkInfo.topology.length - 1" class="text-gray-400">━━</span>
                    </template>
                  </div>
                </div>
              </div>
              
              <!-- Step 2: 计算模型选择 -->
                <div v-if="activeStep === 'link'" class="bg-gray-50 rounded-lg p-4 space-y-4">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <div class="text-sm font-medium text-gray-700">均衡器落位</div>
                      <div class="text-xs text-gray-500 mt-1">系统规划地图显示均衡器。接头盒只在接线元和 SLD 中维护，不在这里落位。</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="settingsStore.equalizerTypes.length === 0"
                      @click="addPlannedEqualizer"
                    >
                      <Plus class="w-4 h-4 mr-1" />
                      添加均衡器
                    </Button>
                  </div>

                  <div v-if="settingsStore.equalizerTypes.length === 0" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
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

              <div v-else-if="activeStep === 'model'" class="space-y-6">
                <h3 class="text-base font-semibold text-gray-800">计算模型选择</h3>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">光纤性能计算模型：</label>
                  <Select 
                    v-model="selectedFiberModel" 
                    :options="fiberModelOptions.map(o => ({ value: o.value, label: o.label }))"
                    class="w-full"
                  />
                  <div class="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                    {{ fiberModelOptions.find(o => o.value === selectedFiberModel)?.desc }}
                  </div>
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">放大器性能计算模型：</label>
                  <Select 
                    v-model="selectedAmplifierModel" 
                    :options="amplifierModelOptions.map(o => ({ value: o.value, label: o.label }))"
                    class="w-full"
                  />
                  <div class="mt-2 p-3 bg-purple-50 rounded-lg text-sm text-purple-700">
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
              <div v-else-if="activeStep === 'fiber'" class="space-y-6">
                <h3 class="text-base font-semibold text-gray-800">光纤配置</h3>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">当前光纤器件：</label>
                  <div class="flex gap-2">
                    <Select 
                      v-model="selectedFiberTypeId" 
                      :options="fiberTypeOptions"
                      placeholder="从器件库选择..."
                      class="flex-1"
                    />
                    <Button variant="outline" size="sm">从器件库选择...</Button>
                    <Button variant="outline" size="sm">新建器件...</Button>
                  </div>
                </div>
                
                <!-- 模型所需参数 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">模型所需参数</div>
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="border-b">
                        <th class="text-left py-2 text-gray-500 font-medium">参数名称</th>
                        <th class="text-left py-2 text-gray-500 font-medium">数值</th>
                        <th class="text-left py-2 text-gray-500 font-medium">单位</th>
                        <th class="text-left py-2 text-gray-500 font-medium">来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="param in fiberModelParams" :key="param.key" class="border-b border-gray-100">
                        <td class="py-2">{{ param.label }}</td>
                        <td class="py-2">
                          <Input 
                            v-model.number="fiberParams[param.key]" 
                            type="number"
                            class="w-28"
                            @input="markFiberParamModified(param.key)"
                          />
                        </td>
                        <td class="py-2 text-gray-500">{{ param.unit }}</td>
                        <td class="py-2">
                          <span 
                            class="text-xs px-2 py-0.5 rounded"
                            :class="{
                              'bg-green-100 text-green-700': fiberParamSources[param.key] === 'device',
                              'bg-blue-100 text-blue-700': fiberParamSources[param.key] === 'manual',
                              'bg-amber-100 text-amber-700': !fiberParamSources[param.key]
                            }"
                          >
                            {{ fiberParamSources[param.key] === 'device' ? '器件' : 
                               fiberParamSources[param.key] === 'manual' ? '手动' : '未定义 ⚠' }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div class="flex items-center justify-between">
                  <div class="text-sm">
                    参数完整性：
                    <span class="text-green-600 font-medium">✅ 满足当前光纤模型</span>
                  </div>
                  <Button v-if="fiberParamsModified" variant="outline" size="sm">
                    <Save class="w-4 h-4 mr-1" /> 保存到器件库
                  </Button>
                </div>
                
                <div v-if="fiberParamsModified" class="p-3 bg-amber-50 rounded-lg text-sm text-amber-700">
                  💡 任何参数修改都不会覆盖原器件，需另存为新器件
                </div>
              </div>
              
              <!-- Step 4: 放大器配置 -->
              <div v-else-if="activeStep === 'amplifier'" class="space-y-6">
                <h3 class="text-base font-semibold text-gray-800">放大器配置</h3>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">当前放大器器件：</label>
                  <div class="flex gap-2">
                    <Select 
                      v-model="selectedAmplifierTypeId" 
                      :options="amplifierTypeOptions"
                      placeholder="从器件库选择..."
                      class="flex-1"
                    />
                    <Button variant="outline" size="sm">从器件库选择...</Button>
                    <Button variant="outline" size="sm">新建器件...</Button>
                  </div>
                </div>
                
                <!-- 模型参数 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">模型参数</div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">增益 (dB)</label>
                      <Input v-model.number="amplifierParams.gain" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">噪声系数 (dB)</label>
                      <Input v-model.number="amplifierParams.noiseFigure" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">最大输出功率 (dBm)</label>
                      <Input v-model.number="amplifierParams.maxOutputPower" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">饱和功率 (dBm)</label>
                      <Input v-model.number="amplifierParams.saturationPower" type="number" />
                    </div>
                  </div>
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
                      <Input v-model.number="fixedSpanLength" type="number" class="w-20" />
                      <span class="text-xs text-gray-500">km</span>
                    </div>
                  </div>
                </div>
                
                <!-- 优化目标与约束 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">优化目标与约束</div>
                  
                  <div class="mb-4">
                    <div class="text-xs text-gray-500 mb-2">优化目标：</div>
                    <div class="space-y-2">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          v-model="optimizationTarget" 
                          value="min_amplifiers"
                          class="text-blue-600"
                        />
                        <span class="text-sm">最少放大器数量（满足性能前提下）</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          v-model="optimizationTarget" 
                          value="max_gsnr"
                          class="text-blue-600"
                        />
                        <span class="text-sm">最大末端 GSNR</span>
                      </label>
                    </div>
                  </div>
                  
                  <div class="border-t pt-4">
                    <div class="text-xs text-gray-500 mb-2">约束条件：</div>
                    <div class="grid grid-cols-2 gap-3">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 w-32">目标 OSNR (最小值)</span>
                        <Input v-model.number="constraints.targetOSNR" type="number" class="w-20" />
                        <span class="text-xs text-gray-500">dB</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-600 w-32">目标 GSNR (最小值)</span>
                        <Input v-model.number="constraints.targetGSNR" type="number" class="w-20" />
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
              <div v-else-if="activeStep === 'wdm'" class="space-y-6">
                <h3 class="text-base font-semibold text-gray-800">WDM 参数配置</h3>
                
                <!-- WDM 系统参数 -->
                <div class="bg-gray-50 rounded-lg p-4">
                  <div class="text-sm font-medium text-gray-700 mb-3">WDM 系统参数</div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">信道数量 (个)</label>
                      <Input v-model.number="wdmParams.channelCount" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">中心频率 (THz)</label>
                      <Input v-model.number="wdmParams.centerFreq" type="number" step="0.001" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">信道间隔 (GHz)</label>
                      <Input v-model.number="wdmParams.channelSpacing" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">符号速率 (GBaud)</label>
                      <Input v-model.number="wdmParams.baudRate" type="number" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">调制格式</label>
                      <Select v-model="wdmParams.modulation" :options="modulationOptions" />
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
                            <tr v-for="(power, i) in perChannelPowers" :key="i" class="border-t">
                              <td class="px-3 py-1">Ch {{ i + 1 }}</td>
                              <td class="px-3 py-1 text-gray-500">{{ getChannelFrequency(i) }}</td>
                              <td class="px-3 py-1">
                                <Input v-model.number="perChannelPowers[i]" type="number" step="0.1" class="w-20" />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div class="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" @click="fillAllPowers">批量填充</Button>
                        <Button variant="outline" size="sm">复制到剪贴板</Button>
                        <Button variant="outline" size="sm">从剪贴板粘贴</Button>
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
                      >
                        选择 CSV/JSON...
                      </Button>
                    </label>
                  </div>
                  
                  <div class="mt-3 text-xs text-gray-500">
                    预览：[{{ uniformLaunchPower }}, {{ uniformLaunchPower }}, ...] (共{{ wdmParams.channelCount }}个)
                    <button class="text-blue-600 ml-2">[查看全部]</button>
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
                          <span class="text-sm">默认零值</span>
                          <Input 
                            v-if="initialAseMode === 'default'"
                            v-model.number="initialAseValue" 
                            type="number" 
                            class="w-20 ml-2" 
                          />
                          <span v-if="initialAseMode === 'default'" class="text-xs text-gray-500">dBm</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input type="radio" v-model="initialAseMode" value="custom" class="text-blue-600" />
                          <span class="text-sm">自定义</span>
                          <Button v-if="initialAseMode === 'custom'" variant="outline" size="sm" class="ml-2">
                            展开配置...
                          </Button>
                        </label>
                      </div>
                    </div>
                    
                    <div>
                      <div class="text-xs text-gray-500 mb-2">initial_nli_vector (初始NLI噪声功率)</div>
                      <div class="space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input type="radio" v-model="initialNliMode" value="default" class="text-blue-600" />
                          <span class="text-sm">默认零值</span>
                          <Input 
                            v-if="initialNliMode === 'default'"
                            v-model.number="initialNliValue" 
                            type="number" 
                            class="w-20 ml-2" 
                          />
                          <span v-if="initialNliMode === 'default'" class="text-xs text-gray-500">dBm</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                          <input type="radio" v-model="initialNliMode" value="custom" class="text-blue-600" />
                          <span class="text-sm">自定义</span>
                          <Button v-if="initialNliMode === 'custom'" variant="outline" size="sm" class="ml-2">
                            展开配置...
                          </Button>
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
              <div v-else-if="activeStep === 'bu'" class="space-y-6">
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
                        <tr>
                          <td colspan="3" class="px-3 py-2 font-medium">本链路 BU 总插损：</td>
                          <td colspan="2" class="px-3 py-2 font-mono font-medium">
                            {{ buSummary.totalTrunkLoss !== null 
                               ? buSummary.totalTrunkLoss.toFixed(1) + ' dB' 
                               : '待完成配置' }}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                
                <div class="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                  💡 BU 配置也可在拓扑编辑器中双击 BU 节点直接修改
                </div>
              </div>
              
              <!-- Step 7: 计算结果 -->
              <div v-else-if="activeStep === 'result'" class="space-y-6">
                <h3 class="text-base font-semibold text-gray-800">计算结果</h3>
                
                <!-- 计算中状态 -->
                <div v-if="isCalculating" class="text-center py-12">
                  <RefreshCw class="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
                  <p class="text-gray-600">正在计算中，请稍候...</p>
                </div>
                
                <!-- 计算结果内容 -->
                <div v-else-if="calculationResult" class="space-y-4">
                  <!-- 结果视图切换 -->
                  <div class="flex items-center gap-2 border-b pb-2">
                    <button
                      v-for="tab in [
                        { id: 'overview', label: '概览', icon: Activity },
                        { id: 'performance', label: '性能曲线', icon: TrendingUp },
                        { id: 'amplifier', label: '放大器详情', icon: Radio },
                        { id: 'cost', label: '链路成本', icon: DollarSign },
                        ...(spanScanData ? [{ id: 'spanOptimization', label: 'Span优化', icon: TrendingUp }] : [])
                      ]"
                      :key="tab.id"
                      class="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors"
                      :class="resultViewTab === tab.id 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'text-gray-600 hover:bg-gray-100'"
                      @click="resultViewTab = tab.id as any"
                    >
                      <component :is="tab.icon" class="w-4 h-4" />
                      {{ tab.label }}
                    </button>
                  </div>
                  
                  <!-- 概览视图 -->
                  <div v-if="resultViewTab === 'overview'" class="space-y-4">
                    <!-- 计算摘要 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                        <span class="w-1 h-4 bg-blue-500 rounded"></span>
                        计算摘要
                      </div>
                      <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="flex justify-between">
                          <span class="text-gray-500">链路：</span>
                          <span class="font-medium">{{ calculationResult.linkName }}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">总长度：</span>
                          <span class="font-mono">{{ calculationResult.totalLength.toFixed(1) }} km</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">计算时间：</span>
                          <span>{{ calculationResult.calculatedAt }}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">计算耗时：</span>
                          <span class="font-mono">{{ calculationResult.calculationTime.toFixed(1) }} 秒</span>
                        </div>
                        <div class="flex justify-between col-span-2">
                          <span class="text-gray-500">计算状态：</span>
                          <span class="flex items-center gap-1" :class="calculationResult.status === 'success' ? 'text-green-600' : 'text-red-600'">
                            <CheckCircle2 v-if="calculationResult.status === 'success'" class="w-4 h-4" />
                            <AlertCircle v-else class="w-4 h-4" />
                            {{ calculationResult.status === 'success' ? '✅ 成功' : '❌ 失败' }}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 关键性能指标 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                        <span class="w-1 h-4 bg-green-500 rounded"></span>
                        关键性能指标
                      </div>
                      <table class="w-full text-sm">
                        <thead class="bg-gray-100">
                          <tr>
                            <th class="px-3 py-2 text-left text-gray-600">指标</th>
                            <th class="px-3 py-2 text-right text-gray-600">最小值</th>
                            <th class="px-3 py-2 text-right text-gray-600">最大值</th>
                            <th class="px-3 py-2 text-right text-gray-600">平均值</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr class="border-t">
                            <td class="px-3 py-2">末端 OSNR (dB)</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.osnr.min.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.osnr.max.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono text-blue-600">{{ calculationResult.metrics.osnr.avg.toFixed(1) }}</td>
                          </tr>
                          <tr class="border-t">
                            <td class="px-3 py-2">末端 GSNR (dB)</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.gsnr.min.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.gsnr.max.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono text-blue-600">{{ calculationResult.metrics.gsnr.avg.toFixed(1) }}</td>
                          </tr>
                          <tr class="border-t">
                            <td class="px-3 py-2">末端功率 (dBm)</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.power.min.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.power.max.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono text-blue-600">{{ calculationResult.metrics.power.avg.toFixed(1) }}</td>
                          </tr>
                          <tr class="border-t">
                            <td class="px-3 py-2">Q-Factor (dB)</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.qFactor.min.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono">{{ calculationResult.metrics.qFactor.max.toFixed(1) }}</td>
                            <td class="px-3 py-2 text-right font-mono text-blue-600">{{ calculationResult.metrics.qFactor.avg.toFixed(1) }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    
                    <!-- 系统配置摘要 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                        <span class="w-1 h-4 bg-purple-500 rounded"></span>
                        系统配置摘要
                      </div>
                      <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="flex justify-between">
                          <span class="text-gray-500">放大器数量：</span>
                          <span class="font-medium">{{ calculationResult.systemConfig.amplifierCount }} 个</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">平均跨段长度：</span>
                          <span class="font-mono">{{ calculationResult.systemConfig.avgSpanLength.toFixed(1) }} km</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">BU 数量：</span>
                          <span class="font-medium">{{ calculationResult.systemConfig.buCount }} 个</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">BU 总插损：</span>
                          <span class="font-mono">{{ calculationResult.systemConfig.totalBuLoss.toFixed(1) }} dB</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">均衡器数量：</span>
                          <span class="font-medium">{{ calculationResult.systemConfig.equalizerCount ?? 0 }} 个</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">均衡器总衰减：</span>
                          <span class="font-mono">{{ (calculationResult.systemConfig.totalEqualizerLoss ?? 0).toFixed(1) }} dB</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">信道数量：</span>
                          <span class="font-medium">{{ calculationResult.systemConfig.channelCount }} ch</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-500">调制格式：</span>
                          <span class="font-medium">{{ calculationResult.systemConfig.modulation }}</span>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 系统裕量评估 -->
                    <div 
                      class="rounded-lg p-4 border-2"
                      :class="calculationResult.margin.meetsRequirement 
                        ? 'bg-green-50 border-green-300' 
                        : 'bg-red-50 border-red-300'"
                    >
                      <div class="text-sm font-medium mb-3 flex items-center gap-2"
                        :class="calculationResult.margin.meetsRequirement ? 'text-green-700' : 'text-red-700'"
                      >
                        <span class="w-1 h-4 rounded" :class="calculationResult.margin.meetsRequirement ? 'bg-green-500' : 'bg-red-500'"></span>
                        系统裕量评估
                      </div>
                      <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                          <span class="text-gray-600">目标 OSNR：</span>
                          <span class="font-mono">{{ calculationResult.margin.targetOsnr.toFixed(1) }} dB</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">最差信道裕量：</span>
                          <span class="font-mono font-medium flex items-center gap-1"
                            :class="calculationResult.margin.meetsRequirement ? 'text-green-600' : 'text-red-600'"
                          >
                            {{ calculationResult.margin.worstMargin >= 0 ? '+' : '' }}{{ calculationResult.margin.worstMargin.toFixed(1) }} dB
                            <span v-if="calculationResult.margin.meetsRequirement">✅ 满足要求</span>
                            <span v-else>❌ 不满足</span>
                          </span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">平均信道裕量：</span>
                          <span class="font-mono">+{{ calculationResult.margin.avgMargin.toFixed(1) }} dB</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 性能曲线视图 -->
                  <div v-else-if="resultViewTab === 'performance'" class="space-y-4">
                    <!-- 曲线选择 -->
                    <div class="flex items-center justify-between flex-wrap gap-2">
                      <div class="flex items-center gap-3">
                        <span class="text-sm text-gray-500">显示指标：</span>
                        <label class="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="checkbox" v-model="performanceChartOptions.showOsnr" class="rounded" />
                          <span class="text-green-600">OSNR</span>
                        </label>
                        <label class="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="checkbox" v-model="performanceChartOptions.showGsnr" class="rounded" />
                          <span class="text-blue-600">GSNR</span>
                        </label>
                        <label class="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="checkbox" v-model="performanceChartOptions.showPower" class="rounded" />
                          <span class="text-purple-600">Power</span>
                        </label>
                        <label class="flex items-center gap-1 text-sm cursor-pointer">
                          <input type="checkbox" v-model="performanceChartOptions.showNli" class="rounded" />
                          <span class="text-red-600">NLI</span>
                        </label>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-500">信道：</span>
                        <select v-model="channelDisplayMode" class="text-sm border rounded px-2 py-1">
                          <option value="worst">最差信道</option>
                          <option value="average">平均值</option>
                          <option value="specified">指定信道</option>
                        </select>
                        <select 
                          v-if="channelDisplayMode === 'specified'" 
                          v-model="selectedChannelIndex"
                          class="text-sm border rounded px-2 py-1 w-32"
                        >
                          <option 
                            v-for="(freq, idx) in calculationResult.performanceData.channelFrequencies.slice(0, 96)" 
                            :key="idx" 
                            :value="idx"
                          >
                            Ch {{ idx + 1 }} ({{ freq.toFixed(2) }} THz)
                          </option>
                        </select>
                      </div>
                    </div>
                    
                    <!-- OSNR 频谱曲线 (末端) -->
                    <div v-if="performanceChartOptions.showOsnr" class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">OSNR 频谱分布 (末端)</div>
                      <div class="relative h-48 bg-white border rounded">
                        <svg class="w-full h-full" viewBox="0 0 700 180" preserveAspectRatio="xMidYMid meet">
                          <g stroke="#e5e7eb" stroke-width="1">
                            <line v-for="y in [30, 60, 90, 120, 150]" :key="'osy'+y" x1="50" :y1="y" x2="680" :y2="y" stroke-dasharray="4,4" />
                          </g>
                          <!-- 目标门限线 -->
                          <line x1="50" :y1="150 - (constraints.targetGSNR - 10) * 6" x2="680" :y2="150 - (constraints.targetGSNR - 10) * 6" stroke="#f97316" stroke-width="1" stroke-dasharray="6,3" />
                          <text x="685" :y="150 - (constraints.targetGSNR - 10) * 6 + 4" class="text-[10px] fill-orange-500">目标</text>
                          <!-- OSNR 曲线 -->
                          <polyline :points="osnrSpectrumPath" fill="none" stroke="#22c55e" stroke-width="2" />
                          <!-- X轴 -->
                          <line x1="50" y1="160" x2="680" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text x="365" y="175" class="text-[10px] fill-gray-500" text-anchor="middle">频率 (THz)</text>
                          <!-- Y轴 -->
                          <line x1="50" y1="20" x2="50" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text v-for="(v, i) in [25, 20, 15, 10]" :key="'osv'+i" x="45" :y="150 - (v - 10) * 6 + 4" class="text-[10px] fill-gray-500" text-anchor="end">{{ v }}</text>
                        </svg>
                      </div>
                      <div class="flex justify-between text-xs text-gray-500 mt-2">
                        <span>最小: {{ calculationResult.metrics.osnr.min }} dB</span>
                        <span>最大: {{ calculationResult.metrics.osnr.max }} dB</span>
                        <span>裕量: {{ (calculationResult.metrics.osnr.min - constraints.targetGSNR) >= 0 ? '+' : '' }}{{ (calculationResult.metrics.osnr.min - constraints.targetGSNR).toFixed(1) }} dB</span>
                      </div>
                    </div>
                    
                    <!-- GSNR 频谱曲线 (末端) -->
                    <div v-if="performanceChartOptions.showGsnr" class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">GSNR 频谱分布 (末端)</div>
                      <div class="relative h-48 bg-white border rounded">
                        <svg class="w-full h-full" viewBox="0 0 700 180" preserveAspectRatio="xMidYMid meet">
                          <!-- 网格线 -->
                          <g stroke="#e5e7eb" stroke-width="1">
                            <line v-for="y in [30, 60, 90, 120, 150]" :key="'gy'+y" x1="50" :y1="y" x2="680" :y2="y" stroke-dasharray="4,4" />
                          </g>
                          <!-- 目标门限线 -->
                          <line x1="50" :y1="150 - (constraints.targetGSNR - 10) * 6" x2="680" :y2="150 - (constraints.targetGSNR - 10) * 6" stroke="#f97316" stroke-width="1" stroke-dasharray="6,3" />
                          <text x="685" :y="150 - (constraints.targetGSNR - 10) * 6 + 4" class="text-[10px] fill-orange-500">目标</text>
                          <!-- GSNR 曲线 -->
                          <polyline 
                            :points="gsnrSpectrumPath"
                            fill="none" stroke="#3b82f6" stroke-width="2"
                          />
                          <!-- X轴 -->
                          <line x1="50" y1="160" x2="680" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text x="365" y="175" class="text-[10px] fill-gray-500" text-anchor="middle">频率 (THz)</text>
                          <!-- Y轴 -->
                          <line x1="50" y1="20" x2="50" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text v-for="(v, i) in [25, 20, 15, 10]" :key="'yv'+i" x="45" :y="150 - (v - 10) * 6 + 4" class="text-[10px] fill-gray-500" text-anchor="end">{{ v }}</text>
                        </svg>
                      </div>
                      <div class="flex justify-between text-xs text-gray-500 mt-2">
                        <span>最小: {{ calculationResult.metrics.gsnr.min }} dB (Ch{{ calculationResult.performanceData.worstChannelIndex + 1 }})</span>
                        <span>最大: {{ calculationResult.metrics.gsnr.max }} dB</span>
                        <span>裕量: {{ calculationResult.margin.worstMargin >= 0 ? '+' : '' }}{{ calculationResult.margin.worstMargin }} dB</span>
                      </div>
                    </div>
                    
                    <!-- 功率频谱曲线 (末端) -->
                    <div v-if="performanceChartOptions.showPower" class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">信号功率频谱分布 (末端)</div>
                      <div class="relative h-48 bg-white border rounded">
                        <svg class="w-full h-full" viewBox="0 0 700 180" preserveAspectRatio="xMidYMid meet">
                          <g stroke="#e5e7eb" stroke-width="1">
                            <line v-for="y in [30, 60, 90, 120, 150]" :key="'py'+y" x1="50" :y1="y" x2="680" :y2="y" stroke-dasharray="4,4" />
                          </g>
                          <!-- 功率曲线 -->
                          <polyline :points="powerSpectrumPath" fill="none" stroke="#8b5cf6" stroke-width="2" />
                          <!-- X轴 -->
                          <line x1="50" y1="160" x2="680" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text x="365" y="175" class="text-[10px] fill-gray-500" text-anchor="middle">频率 (THz)</text>
                          <!-- Y轴 -->
                          <line x1="50" y1="20" x2="50" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text v-for="(v, i) in [5, 0, -5]" :key="'pv'+i" x="45" :y="90 - v * 10 + 4" class="text-[10px] fill-gray-500" text-anchor="end">{{ v }}</text>
                        </svg>
                      </div>
                      <div class="flex justify-between text-xs text-gray-500 mt-2">
                        <span>最小: {{ calculationResult.metrics.power.min }} dBm</span>
                        <span>最大: {{ calculationResult.metrics.power.max }} dBm</span>
                        <span>平均: {{ calculationResult.metrics.power.avg }} dBm</span>
                      </div>
                    </div>
                    
                    <!-- NLI 噪声频谱曲线 (末端) -->
                    <div v-if="performanceChartOptions.showNli" class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">NLI 噪声功率频谱分布 (末端)</div>
                      <div class="relative h-48 bg-white border rounded">
                        <svg class="w-full h-full" viewBox="0 0 700 180" preserveAspectRatio="xMidYMid meet">
                          <g stroke="#e5e7eb" stroke-width="1">
                            <line v-for="y in [30, 60, 90, 120, 150]" :key="'ny'+y" x1="50" :y1="y" x2="680" :y2="y" stroke-dasharray="4,4" />
                          </g>
                          <!-- NLI 曲线 -->
                          <polyline :points="nliSpectrumPath" fill="none" stroke="#ef4444" stroke-width="2" />
                          <!-- X轴 -->
                          <line x1="50" y1="160" x2="680" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text x="365" y="175" class="text-[10px] fill-gray-500" text-anchor="middle">频率 (THz)</text>
                          <!-- Y轴 -->
                          <line x1="50" y1="20" x2="50" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text v-for="(v, i) in [-10, -20, -30, -40]" :key="'nv'+i" x="45" :y="150 - (v + 40) * 4 + 4" class="text-[10px] fill-gray-500" text-anchor="end">{{ v }}</text>
                        </svg>
                      </div>
                      <div class="flex justify-between text-xs text-gray-500 mt-2">
                        <span>最小: {{ calculationResult.metrics.nli.min }} dBm</span>
                        <span>最大: {{ calculationResult.metrics.nli.max }} dBm</span>
                        <span>平均: {{ calculationResult.metrics.nli.avg }} dBm</span>
                      </div>
                    </div>
                    
                    <!-- 沿程演化曲线 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">沿程演化曲线 ({{ channelDisplayMode === 'worst' ? '最差信道' : channelDisplayMode === 'average' ? '平均值' : 'Ch' + (selectedChannelIndex + 1) }})</div>
                      <div class="relative h-48 bg-white border rounded">
                        <svg class="w-full h-full" viewBox="0 0 700 180" preserveAspectRatio="xMidYMid meet">
                          <!-- 网格线 -->
                          <g stroke="#e5e7eb" stroke-width="1">
                            <line v-for="y in [30, 60, 90, 120, 150]" :key="'ey'+y" x1="50" :y1="y" x2="680" :y2="y" stroke-dasharray="4,4" />
                          </g>
                          <!-- 目标门限线 -->
                          <line x1="50" :y1="150 - (constraints.targetGSNR - 5) * 4" x2="680" :y2="150 - (constraints.targetGSNR - 5) * 4" stroke="#f97316" stroke-width="1" stroke-dasharray="6,3" />
                          <!-- OSNR 曲线 -->
                          <polyline 
                            v-if="performanceChartOptions.showOsnr"
                            :points="osnrEvolutionPath"
                            fill="none" stroke="#22c55e" stroke-width="2"
                          />
                          <!-- GSNR 曲线 -->
                          <polyline 
                            v-if="performanceChartOptions.showGsnr"
                            :points="gsnrEvolutionPath"
                            fill="none" stroke="#3b82f6" stroke-width="2"
                          />
                          <!-- 数据点标记 -->
                          <g v-for="(pos, i) in calculationResult.performanceData.positions" :key="'p'+i">
                            <circle 
                              v-if="performanceChartOptions.showGsnr"
                              :cx="50 + i * (630 / (calculationResult.performanceData.positions.length - 1))" 
                              :cy="150 - (calculationResult.performanceData.gsnrEvolution[i] - 5) * 4" 
                              r="3" fill="#3b82f6"
                            />
                            <text 
                              :x="50 + i * (630 / (calculationResult.performanceData.positions.length - 1))" 
                              y="172" 
                              class="text-[8px] fill-gray-500" 
                              text-anchor="middle"
                            >
                              {{ calculationResult.performanceData.positionNames[i] }}
                            </text>
                          </g>
                          <!-- X轴 -->
                          <line x1="50" y1="160" x2="680" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <!-- Y轴 -->
                          <line x1="50" y1="20" x2="50" y2="160" stroke="#9ca3af" stroke-width="1" />
                          <text v-for="(v, i) in [35, 25, 15, 5]" :key="'ev'+i" x="45" :y="150 - (v - 5) * 4 + 4" class="text-[10px] fill-gray-500" text-anchor="end">{{ v }}</text>
                        </svg>
                      </div>
                      <div class="flex items-center gap-4 text-xs mt-2">
                        <span v-if="performanceChartOptions.showOsnr" class="flex items-center gap-1"><span class="w-3 h-0.5 bg-green-500"></span>OSNR</span>
                        <span v-if="performanceChartOptions.showGsnr" class="flex items-center gap-1"><span class="w-3 h-0.5 bg-blue-500"></span>GSNR</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-orange-500" style="border-top: 1px dashed #f97316;"></span>GSNR目标</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 放大器详情视图 -->
                  <div v-else-if="resultViewTab === 'amplifier'" class="space-y-4">
                    <!-- 链路放大器布局示意图 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">放大器布局 ({{ calculationResult.amplifiers.length }} 台)</div>
                      <div class="overflow-x-auto pb-2">
                        <div class="flex items-center py-2" style="min-width: 400px;">
                          <!-- 起点 -->
                          <div class="flex flex-col items-center flex-shrink-0">
                            <div class="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">Tx</div>
                            <span class="text-[9px] text-gray-500 mt-1">0km</span>
                          </div>
                          <!-- 放大器序列 -->
                          <template v-for="(amp, idx) in calculationResult.amplifiers" :key="amp.id">
                            <div class="w-8 h-0.5 bg-gray-300 flex-shrink-0"></div>
                            <div 
                              class="flex flex-col items-center cursor-pointer transition-transform hover:scale-105 flex-shrink-0"
                              :class="selectedAmplifierIndex === idx ? 'ring-2 ring-blue-500 ring-offset-1 rounded' : ''"
                              @click="selectedAmplifierIndex = selectedAmplifierIndex === idx ? null : idx"
                              :title="`${amp.name}: ${amp.position}km, 增益${amp.gain}dB`"
                            >
                              <div class="w-6 h-6 rounded bg-purple-500 text-white flex items-center justify-center text-[9px] font-bold">{{ idx + 1 }}</div>
                            </div>
                          </template>
                          <!-- 终点 -->
                          <div class="w-8 h-0.5 bg-gray-300 flex-shrink-0"></div>
                          <div class="flex flex-col items-center flex-shrink-0">
                            <div class="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">Rx</div>
                            <span class="text-[9px] text-gray-500 mt-1">{{ calculationResult.totalLength }}km</span>
                          </div>
                        </div>
                      </div>
                      <div class="text-xs text-gray-400 mt-1">点击放大器查看详情，左右滑动查看更多</div>
                    </div>
                    
                    <!-- 放大器列表 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">放大器列表</div>
                      <div class="overflow-x-auto overflow-y-auto max-h-48">
                        <table class="text-sm" style="min-width: 500px;width: 100%">
                          <thead class="bg-gray-100 sticky top-0">
                            <tr>
                              <th class="px-2 py-2 text-left text-gray-600 whitespace-nowrap">序号</th>
                              <th class="px-2 py-2 text-left text-gray-600 whitespace-nowrap">位置 (km)</th>
                              <th class="px-2 py-2 text-left text-gray-600 whitespace-nowrap">跨段 (km)</th>
                              <th class="px-2 py-2 text-left text-gray-600 whitespace-nowrap">增益 (dB)</th>
                              <th class="px-2 py-2 text-left text-gray-600 whitespace-nowrap">输出 (dBm)</th>
                              <th class="px-2 py-2 text-left text-gray-600 whitespace-nowrap">NF (dB)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr 
                              v-for="(amp, idx) in calculationResult.amplifiers" 
                              :key="amp.id" 
                              class="border-t hover:bg-blue-50 cursor-pointer"
                              :class="selectedAmplifierIndex === idx ? 'bg-blue-100' : ''"
                              @click="selectedAmplifierIndex = selectedAmplifierIndex === idx ? null : idx"
                            >
                              <td class="px-2 py-2 whitespace-nowrap">{{ amp.name }}</td>
                              <td class="px-2 py-2 font-mono whitespace-nowrap">{{ amp.position }}</td>
                              <td class="px-2 py-2 font-mono whitespace-nowrap">{{ amp.precedingSpan }}</td>
                              <td class="px-2 py-2 font-mono whitespace-nowrap">{{ amp.gain }}</td>
                              <td class="px-2 py-2 font-mono whitespace-nowrap">{{ amp.outputPower }}</td>
                              <td class="px-2 py-2 font-mono whitespace-nowrap">{{ amp.noiseFigure }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    
                    <!-- 选中放大器详情 -->
                    <div v-if="selectedAmplifierIndex !== null" class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <div class="text-sm font-medium text-blue-700 mb-3">
                        选中放大器详情：{{ calculationResult.amplifiers[selectedAmplifierIndex].name }}
                      </div>
                      <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="flex justify-between">
                          <span class="text-gray-600">位置：</span>
                          <span class="font-mono">km {{ calculationResult.amplifiers[selectedAmplifierIndex].position }}</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">前段光纤长度：</span>
                          <span class="font-mono">{{ calculationResult.amplifiers[selectedAmplifierIndex].precedingSpan }} km</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">增益：</span>
                          <span class="font-mono">{{ calculationResult.amplifiers[selectedAmplifierIndex].gain }} dB</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">输入功率：</span>
                          <span class="font-mono">{{ calculationResult.amplifiers[selectedAmplifierIndex].inputPower }} dBm</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">输出功率：</span>
                          <span class="font-mono">{{ calculationResult.amplifiers[selectedAmplifierIndex].outputPower }} dBm</span>
                        </div>
                        <div class="flex justify-between">
                          <span class="text-gray-600">噪声系数：</span>
                          <span class="font-mono">{{ calculationResult.amplifiers[selectedAmplifierIndex].noiseFigure }} dB</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 链路成本视图 -->
                  <div v-else-if="resultViewTab === 'cost'" class="space-y-4">
                    <!-- 成本汇总卡片 -->
                    <div class="grid grid-cols-2 xl:grid-cols-5 gap-3">
                      <div class="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200 text-center">
                        <div class="text-xs text-blue-600 mb-1">海缆成本</div>
                        <div class="text-lg font-bold text-blue-800">{{ formatCost(calculationResult.costData.cableCost) }}</div>
                      </div>
                      <div class="p-3 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200 text-center">
                        <div class="text-xs text-purple-600 mb-1">放大器成本</div>
                        <div class="text-lg font-bold text-purple-800">{{ formatCost(calculationResult.costData.amplifierCost) }}</div>
                      </div>
                      <div class="p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200 text-center">
                        <div class="text-xs text-green-600 mb-1">BU成本</div>
                        <div class="text-lg font-bold text-green-800">{{ formatCost(calculationResult.costData.buCost) }}</div>
                      </div>
                      <div class="p-3 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200 text-center">
                        <div class="text-xs text-amber-600 mb-1">均衡器成本</div>
                        <div class="text-lg font-bold text-amber-800">{{ formatCost(calculationResult.costData.equalizerCost) }}</div>
                      </div>
                      <div class="p-3 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border border-gray-300 text-center">
                        <div class="text-xs text-gray-600 mb-1">链路总成本</div>
                        <div class="text-xl font-bold text-gray-800">{{ formatCost(calculationResult.costData.totalCost) }}</div>
                      </div>
                    </div>
                    
                    <!-- 成本明细 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">成本明细</div>
                      <table class="w-full text-sm">
                        <thead class="bg-gray-100">
                          <tr>
                            <th class="px-3 py-2 text-left text-gray-600">类别</th>
                            <th class="px-3 py-2 text-left text-gray-600">器件型号</th>
                            <th class="px-3 py-2 text-right text-gray-600">数量</th>
                            <th class="px-3 py-2 text-right text-gray-600">单价</th>
                            <th class="px-3 py-2 text-right text-gray-600">小计</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="item in calculationResult.costData.costItems" :key="item.category" class="border-t">
                            <td class="px-3 py-2">{{ item.category }}</td>
                            <td class="px-3 py-2 text-gray-500">{{ item.model }}</td>
                            <td class="px-3 py-2 text-right font-mono">{{ item.quantity }}{{ item.unit }}</td>
                            <td class="px-3 py-2 text-right font-mono">{{ formatCost(item.unitPrice) }}/{{ item.unit }}</td>
                            <td class="px-3 py-2 text-right font-mono font-medium">{{ formatCost(item.subtotal) }}</td>
                          </tr>
                        </tbody>
                        <tfoot class="bg-gray-100">
                          <tr>
                            <td colspan="4" class="px-3 py-2 font-medium">合计</td>
                            <td class="px-3 py-2 text-right font-mono font-bold text-blue-600">{{ formatCost(calculationResult.costData.totalCost) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    
                    <!-- 成本构成分析 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">成本构成分析</div>
                      <div class="space-y-2">
                        <div class="flex items-center gap-2">
                          <span class="text-sm text-gray-600 w-20">海缆</span>
                          <span class="text-sm text-gray-500 w-12">{{ getCostPercent(calculationResult.costData.cableCost) }}%</span>
                          <div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-blue-500 rounded-full" :style="{ width: getCostPercent(calculationResult.costData.cableCost) + '%' }"></div>
                          </div>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="text-sm text-gray-600 w-20">放大器</span>
                          <span class="text-sm text-gray-500 w-12">{{ getCostPercent(calculationResult.costData.amplifierCost) }}%</span>
                          <div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-purple-500 rounded-full" :style="{ width: getCostPercent(calculationResult.costData.amplifierCost) + '%' }"></div>
                          </div>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="text-sm text-gray-600 w-20">分支器</span>
                          <span class="text-sm text-gray-500 w-12">{{ getCostPercent(calculationResult.costData.buCost) }}%</span>
                          <div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-green-500 rounded-full" :style="{ width: getCostPercent(calculationResult.costData.buCost) + '%' }"></div>
                          </div>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="text-sm text-gray-600 w-20">均衡器</span>
                          <span class="text-sm text-gray-500 w-12">{{ getCostPercent(calculationResult.costData.equalizerCost) }}%</span>
                          <div class="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-amber-500 rounded-full" :style="{ width: getCostPercent(calculationResult.costData.equalizerCost) + '%' }"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Span 优化视图 -->
                  <div v-else-if="resultViewTab === 'spanOptimization' && spanScanData" class="space-y-4">
                    <div 
                      class="border rounded-lg p-4"
                      :class="spanUserSelectedSpan != null && spanUserSelectedSpan !== spanScanData.recommendedSpanKm
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-green-50 border-green-200'"
                    >
                      <div class="text-sm font-medium mb-2 flex items-center gap-2"
                        :class="spanUserSelectedSpan != null && spanUserSelectedSpan !== spanScanData.recommendedSpanKm
                          ? 'text-purple-700' : 'text-green-700'"
                      >
                        <CheckCircle2 class="w-4 h-4" />
                        {{ spanUserSelectedSpan != null && spanUserSelectedSpan !== spanScanData.recommendedSpanKm ? '当前选择 Span 长度（用户调整）' : '推荐 Span 长度' }}
                      </div>
                      <div class="grid grid-cols-3 gap-4 text-sm">
                        <div class="text-center">
                          <div class="text-2xl font-bold" :class="spanUserSelectedSpan != null && spanUserSelectedSpan !== spanScanData.recommendedSpanKm ? 'text-purple-700' : 'text-green-700'">
                            {{ spanUserSelectedSpan ?? spanScanData.recommendedSpanKm }} km
                          </div>
                          <div class="text-xs text-gray-500 mt-1">
                            {{ spanUserSelectedSpan != null && spanUserSelectedSpan !== spanScanData.recommendedSpanKm ? '用户选择' : '推荐' }} Span
                          </div>
                        </div>
                        <div class="text-center">
                          <div class="text-lg font-bold text-blue-700">
                            {{ (spanCursorData?.gsnr ?? spanGsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)])?.toFixed(1) || '-' }} dB
                          </div>
                          <div class="text-xs text-gray-500 mt-1">对应末端 GSNR</div>
                        </div>
                        <div class="text-center">
                          <div class="text-lg font-bold text-purple-700">
                            {{ (spanCursorData?.osnr ?? spanOsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)])?.toFixed(1) || '-' }} dB
                          </div>
                          <div class="text-xs text-gray-500 mt-1">对应末端 OSNR</div>
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="flex items-center justify-between mb-3">
                        <div class="text-sm font-medium text-gray-700">Span 长度 vs GSNR / OSNR</div>
                        <div class="text-xs text-purple-500 flex items-center gap-1">
                          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20" stroke-linecap="round"/></svg>
                          拖拽紫色游标或点击图表调整 Span
                        </div>
                      </div>
                      <div class="relative h-56 bg-white border rounded">
                        <svg ref="spanChartSvgRef" class="w-full h-full" viewBox="0 0 700 220" preserveAspectRatio="xMidYMid meet" @click="handleSpanChartClick">
                          <g stroke="#e5e7eb" stroke-width="1">
                            <line v-for="y in [30, 60, 90, 120, 150, 180]" :key="'sg'+y" x1="50" :y1="y" x2="660" :y2="y" stroke-dasharray="4,4" />
                          </g>
                          <line x1="50" :y1="spanChartY(constraints.targetGSNR)" x2="660" :y2="spanChartY(constraints.targetGSNR)" stroke="#f97316" stroke-width="1.5" stroke-dasharray="6,3" />
                          <text x="665" :y="spanChartY(constraints.targetGSNR) + 4" class="text-[10px] fill-orange-500">GSNR目标</text>
                          <rect v-if="spanFeasibleRange" :x="spanChartX(spanFeasibleRange.min)" y="20" :width="spanChartX(spanFeasibleRange.max) - spanChartX(spanFeasibleRange.min)" height="175" fill="#dcfce7" opacity="0.5" />
                          <polyline :points="spanOsnrPath" fill="none" stroke="#22c55e" stroke-width="2" />
                          <polyline :points="spanGsnrPath" fill="none" stroke="#3b82f6" stroke-width="2" />
                          <g v-for="(spanLen, i) in spanScanData.spanLengthsKm" :key="'sp'+i">
                            <circle :cx="spanChartX(spanLen)" :cy="spanChartY(spanGsnrArray[i])" r="3" fill="#3b82f6" />
                            <circle :cx="spanChartX(spanLen)" :cy="spanChartY(spanOsnrArray[i])" r="3" fill="#22c55e" />
                          </g>
                          <line :x1="spanChartX(spanScanData.recommendedSpanKm)" y1="20" :x2="spanChartX(spanScanData.recommendedSpanKm)" y2="195" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,2" />
                          <text :x="spanChartX(spanScanData.recommendedSpanKm)" y="15" class="text-[10px] fill-red-500 font-bold" text-anchor="middle">推荐 {{ spanScanData.recommendedSpanKm }}km</text>
                          <!-- 拖拽游标 -->
                          <g v-if="spanCursorSvgX != null">
                            <line :x1="spanCursorSvgX" y1="20" :x2="spanCursorSvgX" y2="195" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4,3" opacity="0.7" />
                            <rect :x="spanCursorSvgX - 16" y="180" width="32" height="18" rx="4" fill="#8b5cf6" class="cursor-grab" :class="{ 'cursor-grabbing': spanIsDragging }" @mousedown="handleSpanCursorDragStart" @touchstart="handleSpanCursorDragStart" />
                            <text :x="spanCursorSvgX" y="193" class="text-[9px] fill-white font-bold" text-anchor="middle" style="pointer-events:none">{{ spanCursorSpan }}</text>
                            <g v-if="spanCursorData">
                              <rect :x="Math.min(spanCursorSvgX + 10, 570)" y="22" width="120" height="50" rx="4" fill="white" stroke="#8b5cf6" stroke-width="1" opacity="0.95" />
                              <text :x="Math.min(spanCursorSvgX + 16, 576)" y="37" class="text-[10px] fill-gray-700">Span: {{ spanCursorSpan }} km</text>
                              <text :x="Math.min(spanCursorSvgX + 16, 576)" y="51" class="text-[10px] fill-blue-600">GSNR: {{ spanCursorData.gsnr.toFixed(2) }} dB</text>
                              <text :x="Math.min(spanCursorSvgX + 16, 576)" y="65" class="text-[10px]" :class="spanCursorData.margin >= 0 ? 'fill-green-600' : 'fill-red-600'">余量: {{ spanCursorData.margin.toFixed(2) }} dB</text>
                            </g>
                          </g>
                          <line x1="50" y1="195" x2="660" y2="195" stroke="#9ca3af" stroke-width="1" />
                          <text x="355" y="215" class="text-[10px] fill-gray-500" text-anchor="middle">Span 长度 (km)</text>
                          <g v-for="(spanLen, i) in spanScanData.spanLengthsKm" :key="'sx'+i">
                            <text v-if="i % Math.max(1, Math.floor(spanScanData.spanLengthsKm.length / 10)) === 0" :x="spanChartX(spanLen)" y="208" class="text-[9px] fill-gray-500" text-anchor="middle">{{ spanLen }}</text>
                          </g>
                          <line x1="50" y1="20" x2="50" y2="195" stroke="#9ca3af" stroke-width="1" />
                          <text v-for="v in spanChartYTicks" :key="'sy'+v" x="45" :y="spanChartY(v) + 4" class="text-[10px] fill-gray-500" text-anchor="end">{{ v }}</text>
                        </svg>
                      </div>
                      <div class="flex items-center gap-4 text-xs mt-2">
                        <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-blue-500"></span> GSNR</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-green-500"></span> OSNR</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-orange-500" style="border-top:1px dashed #f97316"></span> GSNR 目标</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-red-500" style="border-top:1px dashed #ef4444"></span> 推荐 Span</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-purple-500"></span> 游标</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-3 bg-green-100 border border-green-300 rounded-sm"></span> 可行域</span>
                      </div>
                    </div>

                    <!-- 方案对比面板 -->
                    <div v-if="spanUserSelectedSpan != null && spanUserSelectedSpan !== spanScanData.recommendedSpanKm" class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div class="text-sm font-medium text-purple-700 mb-3">方案对比：系统推荐 vs 用户选择</div>
                      <div class="grid grid-cols-4 gap-3 text-sm">
                        <div class="text-center">
                          <div class="text-xs text-gray-500 mb-1">指标</div>
                          <div class="font-medium text-gray-600">Span</div>
                          <div class="font-medium text-gray-600 mt-1">GSNR</div>
                          <div class="font-medium text-gray-600 mt-1">OSNR</div>
                        </div>
                        <div class="text-center bg-green-50 rounded-lg p-2">
                          <div class="text-xs text-green-600 mb-1">推荐方案</div>
                          <div class="font-mono font-bold text-green-700">{{ spanScanData.recommendedSpanKm }} km</div>
                          <div class="font-mono mt-1">{{ spanGsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)]?.toFixed(1) }} dB</div>
                          <div class="font-mono mt-1">{{ spanOsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)]?.toFixed(1) }} dB</div>
                        </div>
                        <div class="text-center bg-purple-100 rounded-lg p-2">
                          <div class="text-xs text-purple-600 mb-1">用户选择</div>
                          <div class="font-mono font-bold text-purple-700">{{ spanUserSelectedSpan }} km</div>
                          <div class="font-mono mt-1">{{ spanCursorData?.gsnr?.toFixed(1) ?? '-' }} dB</div>
                          <div class="font-mono mt-1">{{ spanCursorData?.osnr?.toFixed(1) ?? '-' }} dB</div>
                        </div>
                        <div class="text-center p-2">
                          <div class="text-xs text-gray-500 mb-1">差异</div>
                          <div class="font-mono" :class="(spanUserSelectedSpan ?? 0) > spanScanData.recommendedSpanKm ? 'text-blue-600' : 'text-amber-600'">{{ ((spanUserSelectedSpan ?? 0) - spanScanData.recommendedSpanKm) > 0 ? '+' : '' }}{{ (spanUserSelectedSpan ?? 0) - spanScanData.recommendedSpanKm }} km</div>
                          <div class="font-mono mt-1" :class="(spanCursorData?.gsnr ?? 0) < (spanGsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)] ?? 0) ? 'text-red-600' : 'text-green-600'">{{ ((spanCursorData?.gsnr ?? 0) - (spanGsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)] ?? 0)).toFixed(1) }} dB</div>
                          <div class="font-mono mt-1">{{ ((spanCursorData?.osnr ?? 0) - (spanOsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)] ?? 0)).toFixed(1) }} dB</div>
                        </div>
                      </div>
                      <!-- 风险提示 -->
                      <div v-if="spanCursorData && spanCursorData.margin < 0" class="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">
                        <AlertCircle class="w-4 h-4 flex-shrink-0" />
                        ⚠ GSNR 余量不足，该 Span 配置不满足性能要求
                      </div>
                      <div v-else-if="spanCursorData && spanCursorData.margin < 2" class="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700 flex items-center gap-2">
                        <AlertCircle class="w-4 h-4 flex-shrink-0" />
                        ⚠ GSNR 余量较低 ({{ spanCursorData.margin.toFixed(1) }} dB)，建议保持 ≥ 2 dB 余量
                      </div>
                      <div class="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" @click="restoreRecommendedSpan">
                          恢复推荐
                        </Button>
                      </div>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">扫描明细</div>
                      <div class="max-h-48 overflow-auto">
                        <table class="w-full text-sm">
                          <thead class="bg-gray-100 sticky top-0">
                            <tr>
                              <th class="px-3 py-2 text-left text-gray-600">Span (km)</th>
                              <th class="px-3 py-2 text-right text-gray-600">GSNR (dB)</th>
                              <th class="px-3 py-2 text-right text-gray-600">OSNR (dB)</th>
                              <th class="px-3 py-2 text-center text-gray-600">状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(spanLen, i) in spanScanData.spanLengthsKm" :key="'st'+i" class="border-t" :class="spanLen === spanScanData.recommendedSpanKm ? 'bg-green-50 font-medium' : ''">
                              <td class="px-3 py-1.5 font-mono">
                                {{ spanLen }}
                                <span v-if="spanLen === spanScanData.recommendedSpanKm" class="text-green-600 text-xs ml-1">★ 推荐</span>
                              </td>
                              <td class="px-3 py-1.5 text-right font-mono">{{ spanGsnrArray[i]?.toFixed(2) }}</td>
                              <td class="px-3 py-1.5 text-right font-mono">{{ spanOsnrArray[i]?.toFixed(2) }}</td>
                              <td class="px-3 py-1.5 text-center">
                                <span class="text-xs px-2 py-0.5 rounded" :class="spanGsnrArray[i] >= constraints.targetGSNR ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                                  {{ spanGsnrArray[i] >= constraints.targetGSNR ? '✅ 可行' : '❌ 不满足' }}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- 计算错误提示 -->
                <div v-if="calculationError && !isCalculating" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div class="flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle class="w-4 h-4 flex-shrink-0" />
                    <span>{{ calculationError }}</span>
                  </div>
                </div>

                <!-- 未计算状态 -->
                <div v-if="!calculationResult && !isCalculating && !calculationError" class="text-center py-12">
                  <BarChart2 class="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p class="text-gray-500">请点击"开始计算"执行性能仿真</p>
                </div>
              </div>
            </div>
            
            <!-- 底部导航按钮 -->
            <div class="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
              <Button 
                variant="outline"
                :disabled="activeStep === 'link'"
                @click="goToPrevStep"
              >
                <ChevronLeft class="w-4 h-4 mr-1" /> 上一步
              </Button>
              
              <!-- 非结果页：显示下一步按钮 -->
              <div v-if="activeStep !== 'bu' && activeStep !== 'result'" class="flex gap-2">
                <Button @click="goToNextStep">
                  下一步：{{ steps[stepOrder.indexOf(activeStep as typeof stepOrder[number]) + 1]?.label }} 
                  <ChevronRight class="w-4 h-4 ml-1" />
                </Button>
              </div>
              
              <!-- BU 配置页：显示开始计算按钮 -->
              <div v-else-if="activeStep === 'bu'" class="flex gap-2">
                <Button 
                  :disabled="!canStartCalculation || isCalculating"
                  @click="startCalculation"
                >
                  <PlayCircle class="w-4 h-4 mr-1" /> 
                  {{ isCalculating ? '计算中...' : '开始计算' }}
                </Button>
              </div>
              
              <!-- 结果页：显示重新计算和应用配置按钮 -->
              <div v-else-if="activeStep === 'result'" class="flex gap-2">
                <Button 
                  variant="outline"
                  :disabled="isCalculating"
                  @click="recalculate"
                >
                  <RefreshCw class="w-4 h-4 mr-1" /> 重新计算
                </Button>
                <Button 
                  :disabled="isApplying || !calculationResult || calculationResult.status !== 'success'"
                  @click="applyAndClose"
                >
                  <Check class="w-4 h-4 mr-1" /> {{ isApplying ? '应用中...' : '应用配置' }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
