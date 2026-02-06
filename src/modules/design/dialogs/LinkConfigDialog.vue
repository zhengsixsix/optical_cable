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

import { ref, computed, watch, reactive } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import { useSettingsStore, useRouteStore, useRPLStore, useConnectorStore, useBUConfigStore } from '@/stores'
import { 
  X, ChevronRight, ChevronLeft, Check, AlertCircle, 
  MapPin, Cpu, Cable, Radio, Waves, GitBranch, PlayCircle,
  CheckCircle2, Save, ChevronDown, ChevronUp, BarChart2,
  Activity, TrendingUp, DollarSign, RefreshCw, Clock
} from 'lucide-vue-next'
import type { FiberParams, AmplifierParams } from '@/types/simulation'
import { getFiberParamsFromLibrary, getAmplifierParamsFromLibrary } from '@/services/DeviceParamsService'
import { calculateDistance } from '@/utils/geo'
import { runSimulation } from '@/services/SimulationApiService'
import type { SpanScanResult, ScanPoint } from '@/services/SimulationApiService'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'start-calculation', config: LinkConfig): void
  (e: 'apply-result', result: any): void  // 传递计算结果给父组件
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
  portCount: number
  trunkLoss: number
  branchLoss: number
}

const settingsStore = useSettingsStore()
const routeStore = useRouteStore()
const rplStore = useRPLStore()
const connectorStore = useConnectorStore()
const buConfigStore = useBUConfigStore()  // 使用共享的 BU 配置 store

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
})

// 当前选中链路的基本信息 - 与 BUConfigDialog 保持一致的数据源
const linkInfo = computed(() => {
  const route = routeStore.selectedRoute
  const rpl = rplStore.tables.find(t => t.id === selectedRplId.value)
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
  const branchLandingPoints = landingPointsAll.filter(p => (p as any).isBranchStation)
  const landingPoints = landingPointsAll.filter(p => !(p as any).isBranchStation)
  const buPoints = pointsWithKp.filter(p => p.type === 'branching')
  
  return {
    name: route.name,
    totalLength: rpl?.metadata?.totalLength || route.totalLength || 0,
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
const selectedAmplifierModel = ref<'EDFA_Simple' | 'EDFA_Full'>('EDFA_Simple')

const fiberModelOptions = [
  { value: 'GN', label: 'GN-Model (高斯噪声)', desc: 'GN-Model 是一种高效的非线性传输模型，适用于长距离 WDM 系统的性能预测。' },
  { value: 'EGN', label: 'EGN-Model (增强高斯噪声)', desc: 'EGN-Model 在 GN 基础上考虑更多非线性效应，精度更高。' },
  { value: 'SSFM', label: 'SSFM (分步傅里叶)', desc: 'SSFM 是最精确的非线性传输仿真方法，计算时间较长。' }
]

const amplifierModelOptions = [
  { value: 'EDFA_Simple', label: 'EDFA 简化模型', desc: '基于增益、噪声系数等基本参数的 EDFA 模型。' },
  { value: 'EDFA_Full', label: 'EDFA 物理模型', desc: '基于物理参数的 EDFA 模型，考虑增益、噪声系数等参数进行精确计算。' }
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
  return connectorStore.elements
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
  const node = connectorStore.elements.find(e => e.id === nodeId)
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
    connectorStore.elements
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
const updateBuConfig = (buId: string, field: string, value: any) => {
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
  const existsInConnector = connectorStore.elements.find(e => e.id === buId)
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
    const existsInConnector = connectorStore.elements.find(e => e.id === buId)
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
  bu: true, // BU 配置为可选
  result: calculationResult.value !== null // 计算结果
}))

const completionPercentage = computed(() => {
  const steps = Object.values(stepStatus.value)
  const completed = steps.filter(Boolean).length
  return Math.round((completed / steps.length) * 100)
})

const canStartCalculation = computed(() => {
  return stepStatus.value.link && stepStatus.value.model && 
         stepStatus.value.fiber && stepStatus.value.amplifier && stepStatus.value.wdm
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
    qFactor: { min: number; max: number; avg: number }
  }
  
  // 系统配置摘要
  systemConfig: {
    amplifierCount: number
    avgSpanLength: number
    buCount: number
    totalBuLoss: number
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
  isCalculating.value = true
  calculationError.value = ''
  activeStep.value = 'result'
  
  try {
    const devices: Array<{ id: string; name: string; type: string; kp: number }> = []
    const info = linkInfo.value
    if (info) {
      if (info.landingList) {
        info.landingList.forEach(lp => devices.push({ id: lp.id, name: lp.name, type: 'landing', kp: lp.kp }))
      }
      if (info.buList) {
        info.buList.forEach(bu => devices.push({ id: bu.id, name: bu.name, type: 'bu', kp: bu.kp }))
      }
    }

    const spanStrategyPayload = spanStrategy.value === 'fixed'
      ? { mode: 'fixed' as const, fixedLength: fixedSpanLength.value }
      : { mode: 'scan' as const, scanRange: { min: spanScanConfig.min, max: spanScanConfig.max, step: spanScanConfig.step } }

    const fiberType = settingsStore.fiberTypes.find(f => f.id === selectedFiberTypeId.value)
    const ampType = settingsStore.amplifierTypes.find(a => a.id === selectedAmplifierTypeId.value)

    const response = await runSimulation({
      linkId: selectedRouteId.value,
      linkName: `${info?.startStation || '起点'} ⇄ ${info?.endStation || '终点'}`,
      totalLengthKm: info?.totalLength || 512,
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
      },
      amplifierParams: {
        gain: amplifierParams.gain,
        noiseFigure: amplifierParams.noiseFigure,
        maxOutputPower: amplifierParams.maxOutputPower,
        saturationPower: amplifierParams.saturationPower,
        unitPrice: ampType?.unitPrice,
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

    spanScanData.value = response.spanScanResult
    calculationResult.value = response.detailedResult as CalculationResult
  } catch (err: any) {
    console.error('仿真计算失败:', err)
    calculationError.value = err.message || '仿真计算失败，请检查后端服务是否启动'
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
  if (!calculationResult.value) return '0'
  return ((cost / calculationResult.value.costData.totalCost) * 100).toFixed(1)
}

// SVG 路径计算属性 - GSNR 频谱曲线
const gsnrSpectrumPath = computed(() => {
  if (!calculationResult.value) return ''
  const data = calculationResult.value.performanceData.endGsnrSpectrum
  const len = data.length - 1
  return data.map((v, i) => `${50 + i * (630 / len)},${150 - (v - 10) * 6}`).join(' ')
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
  startCalculation()
}

// 根据 KP 计算线路上的经纬度（优先使用 RPL 路径，其次使用 segments 拓扑路径）
const getCoordinateByKP = (
  targetKP: number,
  route: any,
  configTotalLength?: number,
  rplRecords?: any[]
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

// 构建主干路径坐标序列（优先 RPL）
const buildPathCoords = (route: any, rplRecords: any[]) => {
  // 优先使用 RPL（已排除分支登陆站）
  if (rplRecords && rplRecords.length >= 2) {
    const orderedRecords = [...rplRecords].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    const coords = orderedRecords
      .map(r => [r.longitude, r.latitude] as [number, number])
      .filter(c => typeof c[0] === 'number' && typeof c[1] === 'number')
    if (coords.length >= 2) return coords
  }
  // 回退：使用 getCoordinateByKP 里相同的主干寻径逻辑
  const fallback = route?.points?.map((p: any) => p.coordinates) || []
  return fallback
}

// 应用配置并关闭 - 直接将放大器添加到 connectorStore
const isApplying = ref(false)

const applyAndClose = async () => {
  if (isApplying.value) return
  isApplying.value = true
  try {
    if (!calculationResult.value || !calculationResult.value.amplifiers) {
      emit('close')
      return
    }
    
    const route = routeStore.selectedRoute
    if (!route) {
      emit('close')
      return
    }
    
    // 获取 RPL 记录用于经纬度计算
    const rplTable = rplStore.tables.find(t => t.id === selectedRplId.value)
    const rplRecords = rplTable?.records || []
    const configTotalLength = linkInfo.value?.totalLength || 0
    
    // 预先计算主干路径坐标序列（避免每个放大器都重复计算）
    const pathCoords = buildPathCoords(route, rplRecords)
    
    // 计算路径总长和线段长度（复用 getCoordinateByKP 的逻辑）
    let actualTotalLength = 0
    const segmentLengths: number[] = []
    for (let i = 0; i < pathCoords.length - 1; i++) {
      const segLen = calculateDistance(pathCoords[i], pathCoords[i + 1])
      segmentLengths.push(segLen)
      actualTotalLength += segLen
    }
    const totalLen = configTotalLength || actualTotalLength
    
    // 快速 KP → 经纬度 插值函数
    const kpToCoord = (targetKP: number) => {
      if (pathCoords.length < 2) return { longitude: 0, latitude: 0 }
      const ratio = Math.min(targetKP / totalLen, 1)
      const targetActualKP = ratio * actualTotalLength
      let cumKP = 0
      for (let i = 0; i < segmentLengths.length; i++) {
        if (cumKP + segmentLengths[i] >= targetActualKP) {
          const p1 = pathCoords[i], p2 = pathCoords[i + 1]
          const lr = segmentLengths[i] > 0 ? (targetActualKP - cumKP) / segmentLengths[i] : 0
          return {
            longitude: p1[0] + (p2[0] - p1[0]) * lr,
            latitude: p1[1] + (p2[1] - p1[1]) * lr
          }
        }
        cumKP += segmentLengths[i]
      }
      const last = pathCoords[pathCoords.length - 1]
      return { longitude: last[0], latitude: last[1] }
    }
    
    // 1) 清除旧的放大器和光纤段
    connectorStore.deleteElementsByType(['ola', 'amplifier_e', 'amplifier_w', 'fiber'])
    
    // 2) 构建放大器 + 光纤段接线元
    const amplifiers = calculationResult.value.amplifiers
    const ampType = settingsStore.amplifierTypes.find(a => a.id === selectedAmplifierTypeId.value)
    const fiberType = settingsStore.fiberTypes.find(f => f.id === selectedFiberTypeId.value)
    
    const newElements: Omit<import('@/types').ConnectorElement, 'id'>[] = []
    
    for (let i = 0; i < amplifiers.length; i++) {
      const amp = amplifiers[i]
      const coord = kpToCoord(amp.position)
      
      // 放大器接线元
      newElements.push({
        name: amp.name,
        type: 'ola',
        kp: amp.position,
        longitude: coord.longitude,
        latitude: coord.latitude,
        depth: 0,
        status: 'planned',
        specifications: ampType ? `${ampType.name} | G=${amp.gain}dB NF=${amp.noiseFigure}dB` : `G=${amp.gain}dB`,
        componentRefId: selectedAmplifierTypeId.value,
        remarks: `系统规划自动生成 | 跨段${amp.precedingSpan}km`
      })
      
      // 光纤段接线元（当前放大器到下一个放大器之间）
      const nextKp = (i < amplifiers.length - 1) ? amplifiers[i + 1].position : configTotalLength
      const spanLen = nextKp - amp.position
      if (spanLen > 0) {
        newElements.push({
          name: `光纤段 ${amp.name}-${i < amplifiers.length - 1 ? amplifiers[i + 1].name : 'Rx'}`,
          type: 'fiber',
          kp: amp.position,
          endKp: nextKp,
          longitude: coord.longitude,
          latitude: coord.latitude,
          depth: 0,
          status: 'planned',
          specifications: fiberType?.name || '',
          fiberRefId: selectedFiberTypeId.value,
          fromDeviceId: amp.id,
          toDeviceId: i < amplifiers.length - 1 ? amplifiers[i + 1].id : '',
          length: spanLen,
          remarks: ''
        })
      }
    }
    
    // 第一段光纤（Tx 到第一个放大器）
    if (amplifiers.length > 0 && amplifiers[0].position > 0) {
      const startCoord = kpToCoord(0)
      newElements.unshift({
        name: `光纤段 Tx-${amplifiers[0].name}`,
        type: 'fiber',
        kp: 0,
        endKp: amplifiers[0].position,
        longitude: startCoord.longitude,
        latitude: startCoord.latitude,
        depth: 0,
        status: 'planned',
        specifications: fiberType?.name || '',
        fiberRefId: selectedFiberTypeId.value,
        length: amplifiers[0].position,
        remarks: ''
      })
    }
    
    // 3) 批量添加（一次性响应式更新，避免页面卡顿）
    connectorStore.addElements(newElements)
    
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
    selectedRplId.value = rplStore.currentTableId || ''
    
    // 加载器件库默认值
    if (settingsStore.fiberTypes.length > 0 && !selectedFiberTypeId.value) {
      selectedFiberTypeId.value = settingsStore.fiberTypes[0].id
    }
    if (settingsStore.amplifierTypes.length > 0 && !selectedAmplifierTypeId.value) {
      selectedAmplifierTypeId.value = settingsStore.amplifierTypes[0].id
    }
    
    activeStep.value = 'link'
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
                    
                    <!-- GSNR 频谱曲线 (末端) -->
                    <div class="bg-gray-50 rounded-lg p-4">
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
                    <div class="grid grid-cols-4 gap-3">
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
                      </div>
                    </div>
                  </div>

                  <!-- Span 优化视图 -->
                  <div v-else-if="resultViewTab === 'spanOptimization' && spanScanData" class="space-y-4">
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div class="text-sm font-medium text-green-700 mb-2 flex items-center gap-2">
                        <CheckCircle2 class="w-4 h-4" /> 推荐 Span 长度
                      </div>
                      <div class="grid grid-cols-3 gap-4 text-sm">
                        <div class="text-center">
                          <div class="text-2xl font-bold text-green-700">{{ spanScanData.recommendedSpanKm }} km</div>
                          <div class="text-xs text-gray-500 mt-1">推荐 Span</div>
                        </div>
                        <div class="text-center">
                          <div class="text-lg font-bold text-blue-700">
                            {{ spanGsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)]?.toFixed(1) || '-' }} dB
                          </div>
                          <div class="text-xs text-gray-500 mt-1">对应末端 GSNR</div>
                        </div>
                        <div class="text-center">
                          <div class="text-lg font-bold text-purple-700">
                            {{ spanOsnrArray[spanScanData.spanLengthsKm.indexOf(spanScanData.recommendedSpanKm)]?.toFixed(1) || '-' }} dB
                          </div>
                          <div class="text-xs text-gray-500 mt-1">对应末端 OSNR</div>
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-4">
                      <div class="text-sm font-medium text-gray-700 mb-3">Span 长度 vs GSNR / OSNR</div>
                      <div class="relative h-56 bg-white border rounded">
                        <svg class="w-full h-full" viewBox="0 0 700 220" preserveAspectRatio="xMidYMid meet">
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
                        <span class="flex items-center gap-1"><span class="w-3 h-3 bg-green-100 border border-green-300 rounded-sm"></span> 可行域</span>
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
