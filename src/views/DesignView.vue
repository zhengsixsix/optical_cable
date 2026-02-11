<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button, Select, Tooltip, Input } from '@/shared/components/base'
import ConnectorPanel from '@/modules/design/panels/ConnectorPanel.vue'
import WDMConfigDialog from '@/modules/design/dialogs/WDMConfigDialog.vue'
import ConnectorDialog from '@/modules/design/dialogs/ConnectorDialog.vue'
import SimulationModelSelectDialog from '@/modules/design/dialogs/SimulationModelSelectDialog.vue'
import SimulationAnalysisDialog from '@/modules/design/dialogs/SimulationAnalysisDialog.vue'
import SystemPlanningWizard from '@/modules/design/dialogs/SystemPlanningWizard.vue'
import type { WizardConfig } from '@/modules/design/dialogs/SystemPlanningWizard.vue'
import LinkConfigDialog from '@/modules/design/dialogs/LinkConfigDialog.vue'
import type { LinkConfig } from '@/modules/design/dialogs/LinkConfigDialog.vue'
import BUConfigDialog from '@/modules/design/dialogs/BUConfigDialog.vue'
import { buildSimulationInput, runSpanScanSimulation } from '@/services/simulationService'
import SystemDesignMap from '@/modules/design/components/SystemDesignMap.vue'
import GSNRMarginChart from '@/components/charts/GSNRMarginChart.vue'
import SpanPerformanceChart from '@/components/charts/SpanPerformanceChart.vue'
import SystemPlanningResultPanel from '@/components/panels/SystemPlanningResultPanel.vue'
import { useSettingsStore, useAppStore, useConnectorStore, useRPLStore, useMonitorStore, useRouteStore } from '@/stores'
import { useRouter } from 'vue-router'
import { opticalSimulationService, repeaterPlacementService } from '@/services'
import { getFiberParamsFromLibrary, getAmplifierParamsFromLibrary, getSimulationParams } from '@/services/DeviceParamsService'
import type { SpanScanResult, OpticalLink, ModulationFormat, FiberSpan, LinkNode } from '@/types/simulation'
import type { SpanScanConfig } from '@/types/systemPlanning'
import { MODULATION_PARAMS } from '@/types/simulation'
import { connectorTypeLabels } from '@/types/connector'
import { Cable, GitBranch, Calculator, Save, RotateCcw, FileSpreadsheet, Send, FileText, Edit3, TrendingUp, Database, Waves, Sliders, BarChart2, Cpu, Target, AlertCircle, DollarSign, Activity } from 'lucide-vue-next'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const connectorStore = useConnectorStore()
const rplStore = useRPLStore()
const monitorStore = useMonitorStore()
const routeStore = useRouteStore()
const router = useRouter()

// 项目类型检测
const hasValidProject = computed(() => {
  const projectType = appStore.currentProjectType
  // 允许访问的情况：
  // 1. 有 USE 项目
  // 2. 没有项目（允许浏览，但显示提示）
  return projectType === 'use' || projectType === null
})

// 放大器详情列表
const amplifierDetailRows = computed(() => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) return []

  // 从器件库获取默认放大器参数
  const defaultAmpParams = getAmplifierParamsFromLibrary()
  const repeaterType = settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterType.value)
  const fallbackModel = repeaterType?.name || '放大器'
  const fallbackGain = repeaterType?.gain || defaultAmpParams.gain
  const fallbackPower = repeaterType?.powerConsumption || 0

  let baseList = savedRepeaterConfigs.value.length > 0
    ? savedRepeaterConfigs.value.map(r => ({
        id: r.id,
        kp: r.kp,
        name: r.name,
        model: r.model || fallbackModel,
        gain: r.gain || fallbackGain,
        powerConsumption: r.powerConsumption ?? fallbackPower,
      }))
    : []

  if (baseList.length === 0) {
    const spanLength = repeaterSpacing.value
    const spanCount = Math.ceil(totalLength / spanLength)
    baseList = Array.from({ length: Math.max(0, spanCount - 1) }, (_, i) => ({
      id: `default-${i + 1}`,
      kp: Math.round((i + 1) * spanLength * 10) / 10,
      name: `${fallbackModel}-${String(i + 1).padStart(2, '0')}`,
      model: fallbackModel,
      gain: fallbackGain,
      powerConsumption: fallbackPower,
    }))
  }

  const sorted = [...baseList].sort((a, b) => a.kp - b.kp)
  let prevKp = 0
  return sorted.map((rep, index) => {
    const spacing = rep.kp - prevKp
    prevKp = rep.kp
    return {
      ...rep,
      index: index + 1,
      spacing,
    }
  })
})

const projectWarningMessage = computed(() => {
  const projectType = appStore.currentProjectType
  if (projectType === null) {
    return '当前没有打开项目。请先创建或打开一个项目(.use)。'
  }
  return ''
})

// 跳转到路由规划页面
const goToPlanning = () => {
  router.push('/planning')
}

// 打开新建项目对话框
const openNewProject = () => {
  appStore.openDialog('new-project')
}

onMounted(() => {
  // 从路由规划初始化登陆站和分支器到 monitorStore
  initLandingStationsFromRoute()
})

// 从路由规划初始化登陆站和分支器数据
const initLandingStationsFromRoute = () => {
  const selectedRoute = routeStore.selectedRoute
  if (!selectedRoute || selectedRoute.points.length === 0) return
  
  // 检查 connectorStore 是否已有登陆站数据（monitorStore.devices 从 connectorStore 派生）
  const hasLandingStations = connectorStore.elements.some(e => e.type === 'landing')
  if (hasLandingStations) {
    return
  }
  
  // 统计登陆站数量，用于命名
  const landingPoints = selectedRoute.points.filter(p => p.type === 'landing')
  const isFirstLanding = (index: number) => {
    const landingIndex = landingPoints.findIndex(p => p === selectedRoute.points[index])
    return landingIndex === 0
  }
  const isLastLanding = (index: number) => {
    const landingIndex = landingPoints.findIndex(p => p === selectedRoute.points[index])
    return landingIndex === landingPoints.length - 1
  }
  
  let cumulativeKp = 0
  
  // 按 KP 排序收集所有设备
  const devicesToAdd: Array<{
    type: string
    name: string
    kp: number
    longitude: number
    latitude: number
    depth: number
    status: 'active'
    specifications: string
    remarks: string
    isBranch?: boolean
  }> = []
  
  selectedRoute.points.forEach((point, index) => {
    // 计算 KP
    if (index > 0) {
      const prevPoint = selectedRoute.points[index - 1]
      const dist = Math.sqrt(
        Math.pow(point.coordinates[0] - prevPoint.coordinates[0], 2) +
        Math.pow(point.coordinates[1] - prevPoint.coordinates[1], 2)
      ) * 111 // 粗略转换为 km
      cumulativeKp += dist
    }
    
    // 只添加登陆站和分支器，不添加 waypoint
    if (point.type === 'landing' || point.type === 'branching') {
      // 根据水深判断站点类型：depth > 0 为水下站点，否则为岸上站点
      const pointDepth = (point as any).depth || 0
      const isUnderwater = pointDepth > 0
      const deviceType = point.type === 'branching' ? 'bu' : (isUnderwater ? 'underwater' : 'landing')
      
      // 站点命名：根据是否在水下区分
      let deviceName = point.name
      if (point.type === 'landing') {
        const stationType = isUnderwater ? '水下站点' : '岸上站点'
        if (isFirstLanding(index)) {
          deviceName = point.name || `${stationType}-起点`
        } else if (isLastLanding(index)) {
          deviceName = point.name || `${stationType}-终点`
        } else {
          deviceName = point.name || stationType
        }
      } else {
        deviceName = point.name || '分支器'
      }
      
      devicesToAdd.push({
        type: deviceType,
        name: deviceName,
        kp: cumulativeKp,
        longitude: point.coordinates[0],
        latitude: point.coordinates[1],
        depth: pointDepth,
        status: 'active',
        specifications: point.type === 'landing' ? 'LTE' : 'BU',
        remarks: `KP ${cumulativeKp.toFixed(1)}`
      })
      
      // 如果是分支器，添加分支登陆站
      if (point.type === 'branching' && point.branchTo) {
        const branchDist = Math.sqrt(
          Math.pow(point.branchTo.coord[0] - point.coordinates[0], 2) +
          Math.pow(point.branchTo.coord[1] - point.coordinates[1], 2)
        ) * 111
        
        // 分支登陆站也根据水深判断
        const branchDepth = (point.branchTo as any).depth || 0
        const isBranchUnderwater = branchDepth > 0
        devicesToAdd.push({
          type: isBranchUnderwater ? 'underwater' : 'landing',
          name: point.branchTo.name || (isBranchUnderwater ? '水下站点-分支' : '岸上站点-分支'),
          kp: cumulativeKp + branchDist,
          longitude: point.branchTo.coord[0],
          latitude: point.branchTo.coord[1],
          depth: branchDepth,
          status: 'active',
          specifications: 'LTE',
          remarks: `Branch from ${point.name}`,
          isBranch: true
        })
      }
    }
  })
  
  if (devicesToAdd.length > 0) {
    // 按 KP 排序，分支登陆站放最后
    const mainDevices = devicesToAdd.filter(d => !d.isBranch).sort((a, b) => a.kp - b.kp)
    const branchDevices = devicesToAdd.filter(d => d.isBranch)
    const sortedDevices = [...mainDevices, ...branchDevices]
    
    // 通过 connectorStore 添加设备（不触发联动事件，避免循环）
    sortedDevices.forEach(device => {
      const { isBranch, ...elementData } = device
      connectorStore.addElement(elementData as any, false)
    })
  }
}

// 监听 elements 变化 — 检测 OLA 添加后自动更新性能面板
let prevOlaCount = 0
watch(() => connectorStore.elements.length, () => {
  const olaElements = connectorStore.elements.filter(e => e.type === 'ola')
  if (olaElements.length > 0 && olaElements.length !== prevOlaCount) {
    const newOlaCount = olaElements.length
    prevOlaCount = newOlaCount
    // 延迟更新性能面板，等待响应式更新稳定
    setTimeout(() => {
      const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
      const ampCount = newOlaCount
      const avgSpan = totalLength > 0 ? totalLength / (ampCount + 1) : 72.5
      
      autoPlacementResult.value = {
        positions: olaElements.map(e => ({ kp: e.kp, longitude: e.longitude, latitude: e.latitude })),
        count: ampCount
      }
      
      currentLinkName.value = routeStore.selectedRoute?.name || '链路'
      centerViewMode.value = 'map'
      
      appStore.showNotification({
        type: 'success',
        message: `已应用配置，放大器数量: ${ampCount}，平均 Span: ${avgSpan.toFixed(1)}km`
      })
    }, 300)
  }
})

// 本地编辑状态
const selectedCableType = ref('lw')
const selectedRepeaterType = ref('std')
const availableRoutes = computed(() => {
  return routeStore.paretoRoutes.length > 0 ? routeStore.paretoRoutes : routeStore.routes
})

const routeOptions = computed(() => (
  availableRoutes.value
    .filter(route => route.id) // 过滤空 id
    .map((route, index) => ({
      value: route.id,
      label: route.name || `路径${index + 1}`,
    }))
))

const rplOptions = computed(() => (
  rplStore.tables
    .filter(table => table.id) // 过滤空 id
    .map(table => ({
      value: table.id,
      label: table.name,
    }))
))

const handleRouteSelect = (routeId: string) => {
  if (!routeId) {
    routeStore.selectRoute(null)
    return
  }
  routeStore.selectRoute(routeId)
  const matchTable = rplStore.tables.find(t => t.routeId === routeId)
  if (matchTable && rplStore.currentTableId !== matchTable.id) {
    rplStore.selectTable(matchTable.id)
  } else if (!matchTable) {
    appStore.showNotification({ type: 'info', message: '该路由尚未生成 RPL 表格' })
  }
}

const handleRplSelect = (tableId: string) => {
  if (!tableId) {
    rplStore.selectTable(null)
    return
  }
  if (rplStore.currentTableId !== tableId) {
    rplStore.selectTable(tableId)
  }
  const table = rplStore.tables.find(t => t.id === tableId)
  if (table?.routeId && routeStore.currentRouteId !== table.routeId) {
    routeStore.selectRoute(table.routeId)
  }
}

watch(() => routeStore.currentRouteId, (routeId) => {
  if (!routeId) return
  const matchTable = rplStore.tables.find(t => t.routeId === routeId)
  if (matchTable && rplStore.currentTableId !== matchTable.id) {
    rplStore.selectTable(matchTable.id)
  }
})

watch(() => rplStore.currentTableId, (tableId) => {
  if (!tableId) return
  const table = rplStore.tables.find(t => t.id === tableId)
  if (table?.routeId && routeStore.currentRouteId !== table.routeId) {
    routeStore.selectRoute(table.routeId)
  }
})

// 下拉选项
const cableTypeOptions = computed(() =>
  settingsStore.settings.cableTypes
    .filter(c => c.id) // 过滤空 id
    .map(c => ({
      value: c.id,
      label: `${c.name} (${c.fiberCount}纤)`
    }))
)

const repeaterTypeOptions = computed(() =>
  settingsStore.settings.repeaterTypes
    .filter(r => r.id) // 过滤空 id
    .map(r => ({
      value: r.id,
      label: r.name
    }))
)
const repeaterSpacing = ref(80)
const targetCapacity = ref(100)
const resultView = ref<'overview' | 'performance' | 'amplifier'>('overview')

// 检测成本参数是否已配置
const hasCostSettings = computed(() => {
  const costSettings = settingsStore.costFactors
  // 至少需要配置电缆成本和放大器成本
  return costSettings && 
    costSettings.cableCostPerKm !== undefined && 
    costSettings.cableCostPerKm > 0 &&
    costSettings.repeaterCost !== undefined && 
    costSettings.repeaterCost > 0
})

// 成本配置（供结果面板使用）
const costConfigForPanel = computed(() => {
  if (!hasCostSettings.value) return undefined
  const costSettings = settingsStore.costFactors
  return {
    cablePerKm: costSettings?.cableCostPerKm,
    repeaterPerUnit: costSettings?.repeaterCost,
    buPerUnit: (costSettings as any)?.buCost || 50000,
    installationPerKm: costSettings?.installationCostPerKm || 5000
  }
})

// 跳转到工程设置页面
const goToProjectSettings = () => {
  router.push('/settings')
}

// 计算结果 - 从 rplStore 动态获取总长度，联动放大器配置
// 使用工程设置中的成本参数
const designResult = computed(() => {
  const cable = settingsStore.settings.cableTypes.find(c => c.id === selectedCableType.value)
  const repeater = settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterType.value)

  if (!cable || !repeater) return null

  // 从 RPL store 获取总长度，无数据时默认0
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) return null
  
  // 优先使用保存的放大器配置数量
  const repeaterCount = savedRepeaterConfigs.value.length > 0 
    ? savedRepeaterConfigs.value.length 
    : Math.ceil(totalLength / repeaterSpacing.value)
  
  // 必须使用工程设置中的成本参数
  const costSettings = settingsStore.costFactors || {}
  const cableCostPerKm = costSettings.cableCostPerKm || 0
  const repeaterUnitCost = costSettings.repeaterCost || 0
  const installationCostPerKm = costSettings.installationCostPerKm || 0
  const landingStationCost = costSettings.landingStationCost || 0
  
  // 统计登陆站数量
  const landingStationCount = rplStore.currentTable?.metadata?.landingStations || 2
  
  // 计算各项成本
  const cableCost = totalLength * cableCostPerKm
  const repeaterCost = repeaterCount * repeaterUnitCost
  const installationCost = totalLength * installationCostPerKm
  const stationCost = landingStationCount * landingStationCost

  return {
    totalLength,
    repeaterCount,
    landingStationCount,
    cableCost,
    repeaterCost,
    installationCost,
    stationCost,
    totalCost: cableCost + repeaterCost + installationCost + stationCost,
    maxCapacity: cable.fiberCount * 10 // Tbps
  }
})

// 显示用放大器列表（最多显示5个）
// 使用保存的配置名称，否则使用器件库名称
const displayRepeaters = computed(() => {
  // 如果有保存的放大器配置，使用配置中的名称
  if (savedRepeaterConfigs.value.length > 0) {
    const configs = savedRepeaterConfigs.value
    if (configs.length <= 5) {
      return configs.map((cfg, i) => ({ id: i + 1, label: cfg.name }))
    }
    // 超过5个时显示前2个 + ... + 后2个
    return [
      { id: 1, label: configs[0].name },
      { id: 2, label: configs[1].name },
      { id: -1, label: '...' },
      { id: configs.length - 1, label: configs[configs.length - 2].name },
      { id: configs.length, label: configs[configs.length - 1].name }
    ]
  }
  
  // 没有配置时，使用器件库放大器类型名称
  const repeaterType = settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterType.value)
  const typeName = repeaterType?.name || '放大器'
  const count = designResult.value?.repeaterCount || 0
  
  if (count <= 5) {
    return Array.from({ length: count }, (_, i) => ({ 
      id: i + 1, 
      label: `${typeName}-${String(i + 1).padStart(2, '0')}` 
    }))
  }
  // 超过5个时显示前2个 + ... + 后2个
  return [
    { id: 1, label: `${typeName}-01` },
    { id: 2, label: `${typeName}-02` },
    { id: -1, label: '...' },
    { id: count - 1, label: `${typeName}-${String(count - 1).padStart(2, '0')}` },
    { id: count, label: `${typeName}-${String(count).padStart(2, '0')}` }
  ]
})

const handleSave = () => {
  appStore.showNotification({ type: 'success', message: '设计参数已保存' })
  appStore.addLog('INFO', '系统设计参数已更新')
}

const handleReset = () => {
  selectedCableType.value = 'lw'
  selectedRepeaterType.value = 'std'
  repeaterSpacing.value = 80
  targetCapacity.value = 100
  appStore.showNotification({ type: 'info', message: '已重置为默认参数' })
}

// 弹框状态
const showConnectorDialog = ref(false)
const showWDMConfigDialog = ref(false)
const showModelSelectDialog = ref(false)
const showSimulationAnalysisDialog = ref(false)
const showPlanningWizard = ref(false)  // 一站式配置向导
const showLinkConfigDialog = ref(false)  // 系统规划链路配置对话框
const currentLinkName = ref('')  // 当前计算的链路名称
const editConnectorId = ref<string | null>(null)

// 数据管理下拉菜单
const showDataMenu = ref(false)
const dataMenuRef = ref<HTMLElement | null>(null)

// 点击外部关闭下拉菜单
const handleClickOutside = (e: MouseEvent) => {
  if (dataMenuRef.value && !dataMenuRef.value.contains(e.target as Node)) {
    showDataMenu.value = false
  }
}
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Span 扫描结果 (Step 6/7)
const spanScanResult = ref<SpanScanResult | null>(null)
const recommendedSpan = ref<number | null>(null)
// Step 6.1: 用户交互调整 Span
const userSelectedSpan = ref<number | null>(null)
// 自动落位结果
const autoPlacementResult = ref<any>(null)

// 链路计算结果摘要（来自系统规划链路配置对话框）
const linkCalcSummary = ref<{
  linkName: string
  metrics: {
    osnr: { min: number; max: number; avg: number }
    gsnr: { min: number; max: number; avg: number }
    power: { min: number; max: number; avg: number }
    nli: { min: number; max: number; avg: number }
    qFactor: { min: number; max: number; avg: number }
  }
  systemConfig: {
    amplifierCount: number
    avgSpanLength: number
    buCount: number
    totalBuLoss: number
    channelCount: number
    modulation: string
  }
  margin: {
    targetOsnr: number
    worstMargin: number
    avgMargin: number
    meetsRequirement: boolean
  }
  costData: {
    cableCost: number
    amplifierCost: number
    buCost: number
    totalCost: number
    costItems: Array<{ category: string; model: string; quantity: number | string; unit: string; unitPrice: number; subtotal: number }>
  }
} | null>(null)

// 设备统计（优先使用计算结果，否则从接线元统计）
const deviceStats = computed(() => {
  if (linkCalcSummary.value?.systemConfig) {
    return linkCalcSummary.value.systemConfig
  }
  return {
    amplifierCount: connectorStore.elements.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w').length,
    buCount: connectorStore.elements.filter(e => e.type === 'bu').length,
    avgSpanLength: 0,
    channelCount: 0,
    modulation: '-',
    totalBuLoss: 0,
  }
})

// 放大器配置数据（用于联动链路分析等）
const savedRepeaterConfigs = ref<Array<{
  id: string
  kp: number
  name: string
  gain: number
  noiseFigure?: number
  model?: string
  spacing?: number
  powerConsumption?: number
  type?: string
}>>([])

// 设备编辑弹框
const showDeviceEditDialog = ref(false)
const editingDevice = ref<any>(null)

// BU 配置弹框
const showBuConfigDialog = ref(false)
const editingBuId = ref<string | null>(null)

// 设备类型选项（排除光纤段）
const deviceTypeOptions = computed(() => 
  Object.entries(connectorTypeLabels)
    .filter(([value]) => value && value !== 'fiber') // 过滤空值和光纤段
    .map(([value, label]) => ({ value, label }))
)

// 监听设备类型变化，自动更新名称
watch(() => editingDevice.value?.type, (newType, oldType) => {
  if (editingDevice.value && newType && oldType && newType !== oldType) {
    const newLabel = connectorTypeLabels[newType as keyof typeof connectorTypeLabels]
    if (newLabel) {
      editingDevice.value.name = newLabel
    }
  }
})

// 视图切换状态
const centerViewMode = ref<'map' | 'gsnr' | 'span'>('map')

// GSNR计算结果数据
const gsnrData = ref<Array<{ kp: number; gsnr: number; margin: number; repeaterIndex?: number }>>([])
const isCalculating = ref(false)

// 计算GSNR数据
const calculateGSNRData = () => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) return []
  
  // 使用快速估算生成数据
  const spanCount = Math.ceil(totalLength / repeaterSpacing.value)
  const data: Array<{ kp: number; gsnr: number; margin: number; repeaterIndex?: number }> = []
  
  // 从器件库获取参数
  const fiberParams = getFiberParamsFromLibrary()
  const amplifierParams = getAmplifierParamsFromLibrary()
  const wdmConfig = settingsStore.systemPlanningConfig?.wdmParams
  const launchPower = wdmConfig?.launchPower ?? 0
  
  for (let i = 0; i <= spanCount; i++) {
    const kp = Math.min(i * repeaterSpacing.value, totalLength)
    // 调用仿真服务进行计算 - 使用器件库参数
    const result = opticalSimulationService.quickEstimateGSNR(
      kp,
      repeaterSpacing.value,
      launchPower,
      amplifierParams.noiseFigure,  // 从器件库获取
      fiberParams.attenuation       // 从器件库获取
    )
    data.push({
      kp,
      gsnr: result.gsnr > 0 ? result.gsnr : 25 - i * 0.5,
      margin: result.margin > -10 ? result.margin : 10 - i * 0.8,
      repeaterIndex: i > 0 ? i : undefined
    })
  }
  
  return data
}

// WDM配置变更处理
const handleWDMConfigChange = (config: any) => {
  // WDM参数变化时重新计算GSNR
  if (gsnrData.value.length > 0) {
    gsnrData.value = calculateGSNRData()
    appStore.addLog('INFO', `WDM参数已更新: ${config.channelCount}波道, ${config.modulationFormat}`)
  }
}

// 触发GSNR计算
const handleCalculateGSNR = () => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据' })
    return
  }
  
  isCalculating.value = true
  appStore.showNotification({ type: 'info', message: '正在计算GSNR...' })
  
  // 模拟计算过程
  setTimeout(() => {
    gsnrData.value = calculateGSNRData()
    isCalculating.value = false
    centerViewMode.value = 'gsnr'
    appStore.showNotification({ type: 'success', message: 'GSNR计算完成' })
    appStore.addLog('INFO', `GSNR计算完成，共${gsnrData.value.length}个数据点`)
  }, 500)
}

// 打开SLD管理
const openSLD = () => {
  appStore.openDialog('sld-manage')
}

// 打开RPL管理
const openRPL = () => {
  appStore.openDialog('rpl-manage')
}

// 打开接线元添加弹框
const openConnectorAdd = () => {
  if (!connectorStore.currentTable) {
    connectorStore.createTable('默认接线元表')
  }
  editConnectorId.value = null
  showConnectorDialog.value = true
}

// 打开接线元编辑弹框
const openConnectorEdit = (id: string) => {
  editConnectorId.value = id
  showConnectorDialog.value = true
}

// Step 4: 打开模型选择弹窗
const openModelSelectDialog = () => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据（RPL）' })
    return
  }
  showModelSelectDialog.value = true
}

// Step 4 确认后: 执行 Span 扫描计算
const handleModelConfirm = (config: { fiberModel: string; [key: string]: any }) => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  
  isCalculating.value = true
  appStore.showNotification({ type: 'info', message: '正在执行 Span 扫描计算...' })
  appStore.addLog('INFO', `选择仿真模型: ${config.fiberModel}`)
  
  // 从器件库获取光纤和放大器参数
  const fiberParams = getFiberParamsFromLibrary()
  const amplifierParams = getAmplifierParamsFromLibrary()
  appStore.addLog('INFO', `使用器件参数: 光纤衰减=${fiberParams.attenuation}dB/km, 器件NF=${amplifierParams.noiseFigure}dB`)
  
  // 获取 Span 扫描配置，并根据当前调制格式设置目标 GSNR
  const wdmConfig = settingsStore.systemPlanningConfig.wdmParams
  const modulationFormat = (wdmConfig?.modulation || 'DP-QPSK') as ModulationFormat
  const modParams = MODULATION_PARAMS[modulationFormat]
  
  // 考虑 FEC 编码增益（SD-FEC 约 2dB），降低目标 GSNR
  const fecGain = wdmConfig?.fecType === 'SD-FEC' ? 2.0 : (wdmConfig?.fecType === 'OFEC' ? 2.5 : 0)
  const adjustedTargetGsnr = (modParams?.requiredGSNR || 12) - fecGain
  
  const scanConfig: SpanScanConfig = {
    ...settingsStore.systemPlanningConfig.spanScanConfig,
    targetGsnrDb: adjustedTargetGsnr,  // 使用调制格式对应的 GSNR 要求
  }
  
  setTimeout(() => {
    // Step 6: 执行 Span 扫描 - 传入器件库参数
    spanScanResult.value = opticalSimulationService.spanRangeScan(
      totalLength,
      scanConfig,
      settingsStore.transmissionConfig.channelCount,
      {
        channelSpacing: wdmConfig?.channelSpacingGHz || 50,
        launchPowerPerChannel: wdmConfig?.launchPower || 1,  // 长距离预设使用 +1dBm
      },
      fiberParams,      // 从器件库获取
      amplifierParams   // 从器件库获取
    )
    
    // Step 7: 自动推荐
    const recommendation = repeaterPlacementService.autoRecommendSpan(
      spanScanResult.value,
      true // 偏好更长的 Span
    )
    recommendedSpan.value = recommendation.recommendedSpanKm
    
    // 生成 EDFA 放置方案 - 传入路由点以支持分支结构
    const currentRoute = routeStore.selectedRoute
    const routePoints = currentRoute?.points || []
    autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
      totalLength,
      recommendation.recommendedSpanKm,
      routePoints
    )
    
    // 更新放大器间距
    repeaterSpacing.value = recommendation.recommendedSpanKm
    
    // 同步计算 GSNR 数据
    gsnrData.value = calculateGSNRData()
    
    isCalculating.value = false
    centerViewMode.value = 'span' // 切换到 Span 性能曲线视图
    
    appStore.showNotification({ 
      type: 'success', 
      message: `计算完成，推荐 Span: ${recommendation.recommendedSpanKm}km，余量: ${recommendation.gsnrMargin.toFixed(1)}dB` 
    })
    appStore.addLog('INFO', recommendation.reasoning)
  }, 800)
}

// 处理 Span 选择
const handleSpanSelect = (spanLength: number) => {
  repeaterSpacing.value = spanLength
  gsnrData.value = calculateGSNRData()
  
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  // 传入路由点以支持分支结构
  const currentRoute = routeStore.selectedRoute
  const routePoints = currentRoute?.points || []
  autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
    totalLength,
    spanLength,
    routePoints
  )
  
  appStore.showNotification({ type: 'info', message: `已选择 Span 长度: ${spanLength}km` })
}

// Step 6.1: 用户交互调整 - 应用用户选择的 Span
const handleApplyUserSelection = (spanKm: number) => {
  userSelectedSpan.value = spanKm
  handleSpanSelect(spanKm)
  handleApplyRecommendation(spanKm)
  appStore.addLog('INFO', `用户交互调整: 应用 Span=${spanKm}km`)
}

// Step 6.1: 恢复系统推荐
const handleRestoreRecommended = () => {
  const recSpan = recommendedSpan.value ?? spanScanResult.value?.recommendedSpanKm
  if (recSpan) {
    userSelectedSpan.value = null
    handleSpanSelect(recSpan)
    handleApplyRecommendation(recSpan)
    appStore.showNotification({ type: 'info', message: `已恢复系统推荐 Span: ${recSpan}km` })
  }
}

// Step 6.2: 地图拖拽放大器后的回调
const handleAmplifierMoved = (data: { id: string; newKp: number; longitude: number; latitude: number }) => {
  // 1. 更新 connectorStore
  const success = connectorStore.updateElement(data.id, {
    kp: data.newKp,
    longitude: data.longitude,
    latitude: data.latitude
  })
  
  if (!success) {
    appStore.showNotification({ type: 'warning', message: '未找到对应放大器，无法更新' })
    return
  }
  
  // 2. 同步更新 savedRepeaterConfigs
  const cfgIdx = savedRepeaterConfigs.value.findIndex(r => r.id === data.id)
  if (cfgIdx >= 0) {
    savedRepeaterConfigs.value[cfgIdx].kp = data.newKp
  }
  
  // 3. 更新自动落位结果
  if (autoPlacementResult.value) {
    const posIdx = autoPlacementResult.value.positions.findIndex(
      (p: any) => Math.abs(p.longitude - data.longitude) < 0.01 || 
                  connectorStore.elements.find(e => e.id === data.id)
    )
    // 重新从 connectorStore 拉取最新位置
    autoPlacementResult.value = {
      ...autoPlacementResult.value,
      positions: connectorStore.elements
        .filter(e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola')
        .map(e => ({ kp: e.kp, longitude: e.longitude, latitude: e.latitude }))
    }
  }
  
  // 4. 重新计算性能指标
  if (gsnrData.value.length > 0) {
    gsnrData.value = calculateGSNRData()
  }
  
  // 5. 检测跨段过长风险
  const allAmps = connectorStore.elements
    .filter(e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola')
    .sort((a, b) => a.kp - b.kp)
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  let maxSpacing = 0
  let prevKp = 0
  for (const amp of allAmps) {
    const spacing = amp.kp - prevKp
    if (spacing > maxSpacing) maxSpacing = spacing
    prevKp = amp.kp
  }
  // 最后一个放大器到终点
  if (allAmps.length > 0) {
    const lastSpacing = totalLength - allAmps[allAmps.length - 1].kp
    if (lastSpacing > maxSpacing) maxSpacing = lastSpacing
  }
  
  const device = connectorStore.elements.find(e => e.id === data.id)
  const deviceName = device?.name || data.id
  
  if (maxSpacing > 100) {
    appStore.showNotification({
      type: 'warning',
      message: `${deviceName} 已移至 KP ${data.newKp.toFixed(1)}km。⚠️ 最大跨段 ${maxSpacing.toFixed(1)}km 超过 100km，可能导致增益超限！`
    })
  } else {
    appStore.showNotification({
      type: 'success',
      message: `${deviceName} 已移至 KP ${data.newKp.toFixed(1)}km`
    })
  }
  
  appStore.addLog('INFO', `Step 6.2 地图拖拽调整: ${deviceName} → KP ${data.newKp.toFixed(1)}km`)
}

// 构建当前链路数据 (供链路分析使用)
const currentOpticalLink = computed<OpticalLink | null>(() => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) return null

  const wdmConfig = settingsStore.transmissionConfig
  
  // 从器件库获取参数
  const fiberParams = getFiberParamsFromLibrary()
  const amplifierParams = getAmplifierParamsFromLibrary()

  // 构建节点列表 - 优先使用保存的放大器配置
  const nodes: LinkNode[] = []
  nodes.push({ id: 'terminal-start', type: 'terminal', name: '起点站', kp: 0 })
  
  if (savedRepeaterConfigs.value.length > 0) {
    // 使用保存的放大器配置
    savedRepeaterConfigs.value.forEach(rep => {
      nodes.push({
        id: rep.id,
        type: 'repeater',
        name: rep.name,
        kp: rep.kp,
        amplifier: { 
          type: 'EDFA', 
          gain: rep.gain || amplifierParams.gain, 
          noiseFigure: rep.noiseFigure || amplifierParams.noiseFigure, 
          maxOutputPower: amplifierParams.maxOutputPower, 
          gainFlatness: amplifierParams.gainFlatness, 
          band: 'C' 
        }
      })
    })
  } else {
    // 使用器件库配置
    const spanLength = repeaterSpacing.value
    const spanCount = Math.ceil(totalLength / spanLength)
    for (let i = 1; i < spanCount; i++) {
      nodes.push({
        id: `repeater-${i}`,
        type: 'repeater',
        name: `R${i}`,
        kp: i * spanLength,
        amplifier: { 
          type: 'EDFA', 
          gain: amplifierParams.gain, 
          noiseFigure: amplifierParams.noiseFigure, 
          maxOutputPower: amplifierParams.maxOutputPower, 
          gainFlatness: amplifierParams.gainFlatness, 
          band: 'C' 
        }
      })
    }
  }
  nodes.push({ id: 'terminal-end', type: 'terminal', name: '终点站', kp: totalLength })

  // 根据节点位置构建跨段列表
  const spans: FiberSpan[] = []
  const sortedNodes = [...nodes].sort((a, b) => a.kp - b.kp)
  for (let i = 0; i < sortedNodes.length - 1; i++) {
    const spanLen = sortedNodes[i + 1].kp - sortedNodes[i].kp
    spans.push({
      id: `span-${i + 1}`,
      index: i,
      length: spanLen,
      fiber: { 
        type: 'G.654.E', 
        attenuation: fiberParams.attenuation, 
        dispersion: fiberParams.dispersion, 
        dispersionSlope: 0.06, 
        effectiveArea: fiberParams.effectiveArea, 
        nonlinearIndex: 1.3e-20, 
        nonlinearCoeff: fiberParams.nonlinearCoeff 
      },
      spanLoss: spanLen * fiberParams.attenuation,
      connectorLoss: 0.5,
      margin: 1
    })
  }

  return {
    id: 'current-link',
    name: '当前链路',
    nodes,
    spans,
    wdmParams: {
      channelCount: wdmConfig.channelCount || 96,
      channelSpacing: wdmConfig.channelBandwidth || 50,
      centerWavelength: 1550,
      symbolRate: 64,
      modulationFormat: 'DP-16QAM',
      launchPowerPerChannel: 0,
      fecType: 'SD-FEC',
      fecOverhead: 15
    },
    totalLength
  }
})

// 生成光纤段数据（连接相邻节点）
const generateFiberSpans = (sortedRepeaters: any[]) => {
  // 删除现有的光纤段
  const existingFibers = connectorStore.elements.filter(e => e.type === 'fiber')
  existingFibers.forEach(f => connectorStore.deleteElement(f.id))
  
  // 从器件库获取光纤类型
  const fiberTypes = settingsStore.fiberTypes || []
  const defaultFiber = fiberTypes[0]
  const fiberName = defaultFiber?.name || '光纤'
  const fiberCategory = defaultFiber?.fiberCategory || 'G.654.E'
  
  // 获取主干线节点（排除分支登陆站）按 KP 排序
  const mainTrunkNodes = connectorStore.elements
    .filter(e => e.type !== 'fiber' && !(e as any).isBranchStation)
    .sort((a, b) => a.kp - b.kp)
  
  // 在主干线相邻节点之间创建光纤段
  for (let i = 0; i < mainTrunkNodes.length - 1; i++) {
    const startNode = mainTrunkNodes[i]
    const endNode = mainTrunkNodes[i + 1]
    const length = endNode.kp - startNode.kp
    
    connectorStore.addElement({
      type: 'fiber',
      name: `${fiberName}-${String(i + 1).padStart(2, '0')}`,
      kp: startNode.kp,
      endKp: endNode.kp,
      longitude: (startNode.longitude + endNode.longitude) / 2,
      latitude: (startNode.latitude + endNode.latitude) / 2,
      depth: (startNode.depth + endNode.depth) / 2,
      status: 'active',
      specifications: `${fiberCategory} ${length.toFixed(1)}km`,
      remarks: `${startNode.name} → ${endNode.name}`
    })
  }
  
  // 为分支登陆站创建分支光纤段（从分支器到分支登陆站）
  const branchStations = connectorStore.elements.filter(e => (e as any).isBranchStation)
  let branchFiberIndex = mainTrunkNodes.length
  branchStations.forEach(branchStation => {
    const branchFromName = (branchStation as any).branchFrom
    // 找到对应的分支器
    const branchingUnit = mainTrunkNodes.find(n => n.name === branchFromName && n.type === 'bu')
    if (branchingUnit) {
      const length = Math.sqrt(
        Math.pow((branchStation.longitude - branchingUnit.longitude) * 111, 2) +
        Math.pow((branchStation.latitude - branchingUnit.latitude) * 111, 2)
      )
      connectorStore.addElement({
        type: 'fiber',
        name: `${fiberName}-分支-${String(branchFiberIndex++).padStart(2, '0')}`,
        kp: branchingUnit.kp,
        endKp: branchingUnit.kp + length,
        longitude: (branchingUnit.longitude + branchStation.longitude) / 2,
        latitude: (branchingUnit.latitude + branchStation.latitude) / 2,
        depth: (branchingUnit.depth + branchStation.depth) / 2,
        status: 'active',
        specifications: `${fiberCategory} ${length.toFixed(1)}km`,
        remarks: `[Branch] ${branchingUnit.name} → ${branchStation.name}`
      })
    }
  })
}

// 处理放大器配置保存
const handleRepeatersSaved = (repeaters: any[]) => {
  // 从器件库获取默认参数
  const defaultAmpParams = getAmplifierParamsFromLibrary()
  
  savedRepeaterConfigs.value = repeaters.map(r => ({
    id: r.id,
    kp: r.kp,
    name: r.name,
    gain: r.gain || defaultAmpParams.gain,
    noiseFigure: r.noiseFigure || defaultAmpParams.noiseFigure,
    model: r.model,
    spacing: r.spacing,
    powerConsumption: r.powerConsumption,
    type: r.type
  }))
  
  // 先按 KP 排序
  const sortedRepeaters = [...repeaters].sort((a, b) => a.kp - b.kp)
  
  // 删除现有的放大器元素（会被新的替换）
  const existingAmplifiers = connectorStore.elements.filter(
    e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola'
  )
  existingAmplifiers.forEach(amp => {
    connectorStore.deleteElement(amp.id, false) // 不触发联动事件
  })
  
  // 同步到 connectorStore（monitorStore.devices 会自动从 connectorStore 派生）
  sortedRepeaters.forEach((rep) => {
    // 使用配置中的类型，默认为 amplifier_e
    const ampType = rep.type || 'amplifier_e'
    
    connectorStore.addElement({
      type: ampType,
      name: rep.name,
      kp: rep.kp,
      longitude: rep.longitude,
      latitude: rep.latitude,
      depth: rep.depth || 3000,
      status: 'active',
      specifications: rep.model || 'EREP-C+L',
      remarks: rep.remarks || ''
    }, false) // 不触发联动事件
  })
  
  // 为新添加的放大器初始化运行时数据（用于监控显示）
  sortedRepeaters.forEach((rep) => {
    // 查找刚添加的元素（通过 name 和 kp 匹配）
    const addedElement = connectorStore.elements.find(
      e => e.name === rep.name && Math.abs(e.kp - rep.kp) < 0.01
    )
    if (addedElement) {
      monitorStore.updateDevice(addedElement.id, {
        status: 'normal',
        inputPower: -15,
        outputPower: 1,
        pumpCurrent: 200,
        pfeVoltage: 48,
        pfeCurrent: 1.5,
        temperature: 25,
      })
    }
  })
  
  // 自动生成光纤段数据（连接相邻节点）
  generateFiberSpans(sortedRepeaters)
  
  // 重新计算 GSNR 数据
  if (gsnrData.value.length > 0) {
    gsnrData.value = calculateGSNRData()
  }
  
  appStore.showNotification({ type: 'success', message: `已保存 ${repeaters.length} 个放大器配置` })
  appStore.addLog('INFO', `放大器配置已更新: ${repeaters.length} 个放大器`)
}

// 打开链路仿真分析
const openLinkAnalysis = () => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0 && connectorStore.elements.length === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据或配置链路' })
    return
  }
  showSimulationAnalysisDialog.value = true
}

// 器件库为空警告弹窗
const showDeviceLibraryWarning = ref(false)

// 提交参数并计算 - 打开系统规划链路配置对话框
const handleSubmit = () => {
  // 检查器件库是否有数据（光纤类型和放大器类型）
  const hasFiber = settingsStore.fiberTypes.length > 0
  const hasAmplifier = settingsStore.amplifierTypes.length > 0
  if (!hasFiber || !hasAmplifier) {
    showDeviceLibraryWarning.value = true
    return
  }
  showLinkConfigDialog.value = true
}

// 跳转到工程设置器件库页面
const goToDeviceLibrarySettings = () => {
  showDeviceLibraryWarning.value = false
  router.push({ path: '/settings', query: { tab: 'equipment' } })
}

// 应用推荐配置
const handleApplyRecommendation = (spanKm: number) => {
  repeaterSpacing.value = spanKm
  recommendedSpan.value = spanKm
  
  // 重新生成 EDFA 放置方案
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  const currentRoute = routeStore.selectedRoute
  const routePointsList = currentRoute?.points || []
  autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
    totalLength,
    spanKm,
    routePointsList
  )
  
  // 将放大器添加到 connectorStore 以便地图显示
  if (autoPlacementResult.value && autoPlacementResult.value.positions.length > 0) {
    // 确保有当前表格
    if (!connectorStore.currentTable) {
      connectorStore.createTable(`${currentRoute?.name || '链路'}_接线元`, currentRoute?.id)
    }
    
    // 先删除旧的放大器（避免重复）
    const existingAmps = connectorStore.elements.filter(e => e.type === 'amplifier_e' || e.type === 'amplifier_w')
    existingAmps.forEach(amp => {
      connectorStore.deleteElement(amp.id, false)
    })
    
    // 添加新的放大器
    autoPlacementResult.value.positions.forEach((pos: { kp: number; longitude: number; latitude: number; isBranch?: boolean }, index: number) => {
      connectorStore.addElement({
        type: index % 2 === 0 ? 'amplifier_e' : 'amplifier_w',
        name: `AMP-${String(index + 1).padStart(2, '0')}`,
        kp: pos.kp,
        longitude: pos.longitude,
        latitude: pos.latitude,
        depth: 0,
        status: 'active',
        specifications: `Span ${spanKm}km`,
        remarks: pos.isBranch ? '分支放大器' : 'EDFA'
      }, false)
    })
  }
  
  // 切换到地图视图以显示放大器位置
  centerViewMode.value = 'map'
  
  appStore.showNotification({ type: 'success', message: `已应用推荐 Span 长度: ${spanKm} km，放大器数量: ${autoPlacementResult.value?.count || 0}` })
}

// 向导配置完成，开始计算
const handleWizardStartCalculation = (config: WizardConfig) => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  
  isCalculating.value = true
  appStore.showNotification({ type: 'info', message: '正在执行 Span 扫描计算...' })
  appStore.addLog('INFO', `使用向导配置: 模型=${config.simulationModel}, 光纤α=${config.fiberParams.attenuation}dB/km, 放大器NF=${config.amplifierParams.noiseFigure}dB`)
  
  // 获取调制格式对应的 GSNR 要求
  const modulationFormat = (config.wdmParams.modulation || 'DP-QPSK') as ModulationFormat
  const modParams = MODULATION_PARAMS[modulationFormat]
  
  // 考虑 FEC 编码增益
  const fecGain = config.wdmParams.fecType === 'SD-FEC' ? 2.0 : (config.wdmParams.fecType === 'OFEC' ? 2.5 : 0)
  const adjustedTargetGsnr = (modParams?.requiredGSNR || 12) - fecGain
  
  const scanConfig: SpanScanConfig = {
    spanLengthMinKm: config.spanScanConfig.spanLengthMinKm,
    spanLengthMaxKm: config.spanScanConfig.spanLengthMaxKm,
    spanStepKm: config.spanScanConfig.spanStepKm,
    targetGsnrDb: adjustedTargetGsnr,
    marginDb: 3,
  }
  
  // 更新放大器间距为扫描范围中间值
  repeaterSpacing.value = Math.round((scanConfig.spanLengthMinKm + scanConfig.spanLengthMaxKm) / 2)
  
  setTimeout(() => {
    // 执行 Span 扫描 - 使用向导配置的参数
    spanScanResult.value = opticalSimulationService.spanRangeScan(
      totalLength,
      scanConfig,
      config.wdmParams.channelCount,
      {
        channelSpacing: config.wdmParams.channelSpacingGHz,
        launchPowerPerChannel: config.wdmParams.launchPower,
      },
      config.fiberParams,
      config.amplifierParams
    )
    
    // 自动推荐
    const recommendation = repeaterPlacementService.autoRecommendSpan(
      spanScanResult.value,
      true
    )
    recommendedSpan.value = recommendation.recommendedSpanKm
    
    // 生成 EDFA 放置方案
    const currentRoute = routeStore.selectedRoute
    const routePoints = currentRoute?.points || []
    autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
      totalLength,
      recommendation.recommendedSpanKm,
      routePoints
    )
    
    // 更新放大器间距
    repeaterSpacing.value = recommendation.recommendedSpanKm
    
    // 同步计算 GSNR 数据
    gsnrData.value = calculateGSNRData()
    
    isCalculating.value = false
    centerViewMode.value = 'span'
    
    appStore.showNotification({ 
      type: 'success', 
      message: `计算完成，推荐 Span: ${recommendation.recommendedSpanKm}km，余量: ${recommendation.gsnrMargin.toFixed(1)}dB` 
    })
    appStore.addLog('INFO', recommendation.reasoning)
  }, 800)
}

// 处理链路配置应用结果 - 更新性能概览面板
const handleLinkConfigApplyResult = (result: any) => {
  // 使用 setTimeout 延迟执行，避免响应式更新循环
  setTimeout(() => {
    const avgSpan = result.avgSpanLength || 72.5
    const amplifierCount = result.amplifierCount || 0
    
    // 优先使用对话框传递的完整 Span 扫描数据（多点）
    if (result.spanScanData && result.spanScanData.spanLengthsKm?.length > 1) {
      const sd = result.spanScanData
      spanScanResult.value = {
        linkId: routeStore.selectedRoute?.id || '',
        scannedAt: new Date(),
        model: 'GN' as const,
        targetGsnrDb: sd.targetGsnrDb || 15,
        spanLengthsKm: sd.spanLengthsKm,
        gsnrPerSpanDb: sd.scanPoints.map((p: any) => p.gsnrPerChannelDb || [p.avgGsnrDb]),
        osnrPerSpanDb: sd.scanPoints.map((p: any) => p.osnrPerChannelDb || [p.avgOsnrDb]),
        scanPoints: sd.scanPoints.map((p: any) => ({
          spanLengthKm: p.spanLengthKm,
          gsnrPerChannelDb: p.gsnrPerChannelDb || [p.avgGsnrDb],
          osnrPerChannelDb: p.osnrPerChannelDb || [p.avgOsnrDb],
          avgGsnrDb: p.avgGsnrDb,
          minGsnrDb: p.minGsnrDb ?? p.avgGsnrDb,
          avgOsnrDb: p.avgOsnrDb,
          gsnrMarginDb: p.gsnrMarginDb ?? 0,
          meetTarget: p.meetTarget ?? true,
        })),
        feasibleRange: sd.feasibleRange,
        recommendedSpanKm: sd.recommendedSpanKm,
      }
      recommendedSpan.value = sd.recommendedSpanKm
    } else {
      // 回退：构造单点结果（不显示图表游标）
      const channelCount = 96
      const gsnrPerChannel = Array(channelCount).fill(result.metrics?.gsnr?.avg || 18)
      const osnrPerChannel = Array(channelCount).fill(result.metrics?.osnr?.avg || 25)
      spanScanResult.value = {
        linkId: routeStore.selectedRoute?.id || '',
        scannedAt: new Date(),
        model: 'GN' as const,
        targetGsnrDb: result.margin?.targetOsnr || 15,
        spanLengthsKm: [avgSpan],
        gsnrPerSpanDb: [gsnrPerChannel],
        osnrPerSpanDb: [osnrPerChannel],
        scanPoints: [{
          spanLengthKm: avgSpan,
          gsnrPerChannelDb: gsnrPerChannel,
          osnrPerChannelDb: osnrPerChannel,
          avgGsnrDb: result.metrics?.gsnr?.avg || 18,
          minGsnrDb: result.metrics?.gsnr?.min || 15,
          avgOsnrDb: result.metrics?.osnr?.avg || 25,
          gsnrMarginDb: result.margin?.avgMargin || 3,
          meetTarget: result.margin?.meetsRequirement ?? true
        }],
        feasibleRange: [avgSpan, avgSpan],
        recommendedSpanKm: avgSpan,
      }
      recommendedSpan.value = avgSpan
    }
    
    // 传递用户选择的 Span
    if (result.userSelectedSpan != null) {
      userSelectedSpan.value = result.userSelectedSpan
    }
    
    currentLinkName.value = result.linkName || routeStore.selectedRoute?.name || '链路'
    
    // 存储计算结果摘要（链路成本 + 性能指标）
    if (result.metrics || result.costData || result.systemConfig) {
      linkCalcSummary.value = {
        linkName: result.linkName || '',
        metrics: result.metrics || { osnr: { min: 0, max: 0, avg: 0 }, gsnr: { min: 0, max: 0, avg: 0 }, power: { min: 0, max: 0, avg: 0 }, nli: { min: 0, max: 0, avg: 0 }, qFactor: { min: 0, max: 0, avg: 0 } },
        systemConfig: result.systemConfig || { amplifierCount: amplifierCount, avgSpanLength: avgSpan, buCount: 0, totalBuLoss: 0, channelCount: 0, modulation: '-' },
        margin: result.margin || { targetOsnr: 0, worstMargin: 0, avgMargin: 0, meetsRequirement: false },
        costData: result.costData || { cableCost: 0, amplifierCost: 0, buCost: 0, totalCost: 0, costItems: [] },
      }
    }
    
    // 更新自动放置结果
    autoPlacementResult.value = {
      positions: connectorStore.elements
        .filter(e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola')
        .map(e => ({ kp: e.kp, longitude: e.longitude, latitude: e.latitude })),
      count: amplifierCount
    }
    
    // 切换到地图视图显示放大器
    centerViewMode.value = 'map'
    
    appStore.showNotification({ 
      type: 'success', 
      message: `已应用配置，放大器数量: ${amplifierCount}，平均 Span: ${avgSpan.toFixed(1)}km` 
    })
  }, 100)
}

// 格式化成本
const formatCost = (cost: number) => {
  if (cost >= 1000000) return `$${(cost / 1000000).toFixed(2)}M`
  if (cost >= 1000) return `$${(cost / 1000).toFixed(0)}K`
  return `$${cost.toFixed(0)}`
}

// 地图组件引用
const systemDesignMapRef = ref<InstanceType<typeof SystemDesignMap> | null>(null)

// 是否开启编辑模式
const isEditMode = ref(false)

// 选中的节点
const selectedPointId = ref<string | null>(null)

// 路由节点数据 - 使用 connectorStore 数据
const routePoints = computed(() => connectorStore.elements)

// 切换编辑模式
const toggleEditMode = () => {
  isEditMode.value = !isEditMode.value
  if (isEditMode.value) {
    appStore.showNotification({ type: 'info', message: '已开启编辑模式' })
  } else {
    appStore.showNotification({ type: 'info', message: '已关闭编辑模式' })
  }
}

// 点击节点
const handlePointClick = (pointId: string) => {
  selectedPointId.value = pointId
}

// 双击 BU 节点打开配置对话框
const handleBuDblclick = (buId: string) => {
  editingBuId.value = buId
  showBuConfigDialog.value = true
}

// 节点移动 - 通过 connectorStore 更新（monitorStore.devices 会自动派生）
const handlePointMoved = (pointId: string, longitude: number, latitude: number) => {
  const point = routePoints.value.find(p => p.id === pointId)
  const deviceName = point?.name || pointId
  
  // 通过 connectorStore 更新（monitorStore.devices 会自动同步）
  connectorStore.updateElement(pointId, { longitude, latitude })
  
  appStore.showNotification({
    type: 'success',
    message: `${deviceName} 已移动到 ${longitude.toFixed(4)}°, ${latitude.toFixed(4)}°`
  })
  appStore.addLog('INFO', `设备 ${deviceName} 位置已更新`)
}

// 线路点击
const handleLineClick = () => {
  selectedPointId.value = null
  appStore.showNotification({ type: 'info', message: '已选中线路' })
}

// 编辑操作
const handleEdit = (type: 'point' | 'line' | 'segment', id: string | null) => {
  if (type === 'point' && id) {
    // 优先从 connectorStore 查找
    let point = routePoints.value.find(p => p.id === id)
    
    // 如果找不到，尝试从 monitorStore 查找并转换
    if (!point) {
      const device = monitorStore.devices.find(d => d.id === id)
      if (device) {
        point = {
          id: device.id,
          name: device.name,
          type: device.type as any,
          kp: device.kp,
          longitude: device.longitude,
          latitude: device.latitude,
          depth: device.depth,
          status: 'active' as any,
          specifications: '',
          remarks: ''
        }
      }
    }
    
    if (point) {
      editingDevice.value = { ...point }
      showDeviceEditDialog.value = true
    } else {
      appStore.showNotification({ type: 'warning', message: '未找到对应设备' })
    }
  } else if (type === 'line') {
    appStore.showNotification({ type: 'info', message: '编辑线路参数' })
  } else if (type === 'segment' && id !== null) {
    const segmentIndex = parseInt(id)
    const fiberElements = connectorStore.elements.filter(e => e.type === 'fiber')
    if (fiberElements[segmentIndex]) {
      editConnectorId.value = fiberElements[segmentIndex].id
      showConnectorDialog.value = true
    } else {
      appStore.showNotification({ type: 'warning', message: '未找到对应的光纤段数据' })
    }
  }
}

// 保存设备编辑 - 通过 connectorStore 更新（monitorStore.devices 会自动派生）
const saveDeviceEdit = () => {
  if (!editingDevice.value) return

  const success = connectorStore.updateElement(editingDevice.value.id, {
    name: editingDevice.value.name,
    longitude: editingDevice.value.longitude,
    latitude: editingDevice.value.latitude,
    kp: editingDevice.value.kp,
    depth: editingDevice.value.depth,
    type: editingDevice.value.type,
    specifications: editingDevice.value.specifications,
    remarks: editingDevice.value.remarks
  })

  if (success) {
    appStore.showNotification({ type: 'success', message: `设备 ${editingDevice.value.name} 已更新` })
    appStore.addLog('INFO', `更新设备 ${editingDevice.value.name}`)
  }
  showDeviceEditDialog.value = false
  editingDevice.value = null
}

// 删除操作
const handleDelete = (type: 'point' | 'line' | 'segment', id: string | null) => {
  if (type === 'point' && id) {
    const point = routePoints.value.find(p => p.id === id)
    if (point) {
      connectorStore.deleteElement(id)
      appStore.showNotification({ type: 'success', message: `已删除设备: ${point.name}` })
      appStore.addLog('INFO', `删除设备 ${point.name}`)
    }
  } else if (type === 'line') {
    appStore.showNotification({ type: 'warning', message: '线路不可删除' })
  } else if (type === 'segment' && id) {
    appStore.showNotification({ type: 'warning', message: '光纤段不可删除' })
  }
}
</script>

<template>
  <MainLayout>
    <!-- 项目类型警告覆盖层 -->
    <div 
      v-if="projectWarningMessage" 
      class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-40 flex items-center justify-center"
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div class="bg-amber-50 px-6 py-4 border-b border-amber-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-amber-800">项目类型不匹配</h3>
          </div>
        </div>
        <div class="px-6 py-5">
          <p class="text-gray-600 mb-6">{{ projectWarningMessage }}</p>
          <div class="flex gap-3">
            <Button class="flex-1" @click="openNewProject">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              新建项目
            </Button>
            <Button variant="outline" class="flex-1" @click="goToPlanning">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回路由规划
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 传输系统规划工具栏 -->
    <template #toolbar>
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b">
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-sm font-medium text-gray-700">传输系统规划</span>
          <span class="text-xs text-gray-400">| 配置 → 仿真 → 分析</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- 系统规划 - 主入口 -->
          <Tooltip content="打开系统规划链路配置界面，完成链路、模型、器件、WDM参数配置">
            <Button size="sm" class="bg-blue-600 hover:bg-blue-700" @click="handleSubmit">
              <Cpu class="w-4 h-4 mr-1" /> 系统规划
            </Button>
          </Tooltip>
          <div class="w-px h-5 bg-gray-300" />
          <!-- 快捷配置按钮 -->
          <Tooltip content="链路精细仿真分析">
            <Button variant="outline" size="sm" @click="openLinkAnalysis">
              <BarChart2 class="w-4 h-4 mr-1" /> 链路分析
            </Button>
          </Tooltip>
          <div class="w-px h-5 bg-gray-300" />
          <!-- 数据管理下拉菜单 -->
          <div class="relative" ref="dataMenuRef">
            <Tooltip content="数据与资源管理">
              <Button variant="outline" size="sm" @click="showDataMenu = !showDataMenu">
                <Database class="w-4 h-4 mr-1" /> 数据管理
                <svg class="w-3 h-3 ml-1" :class="{ 'rotate-180': showDataMenu }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </Tooltip>
            <div v-if="showDataMenu" class="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
              <button class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2" @click="openRPL(); showDataMenu = false">
                <FileSpreadsheet class="w-4 h-4 text-gray-500" /> RPL路由表
              </button>
              <button class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2" @click="openSLD(); showDataMenu = false">
                <FileSpreadsheet class="w-4 h-4 text-gray-500" /> SLD系统图
              </button>
              <div class="border-t my-1"></div>
              <button class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2" @click="$router.push('/device-library'); showDataMenu = false">
                <Database class="w-4 h-4 text-gray-500" /> 器件库
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #left>
      <!-- 链路成本 - 联动系统规划链路配置数据 -->
      <Card class="flex-shrink-0">
        <CardHeader class="pb-2">
          <span class="font-semibold text-sm flex items-center gap-2">
            <DollarSign class="w-4 h-4 text-green-600" />
            链路成本
          </span>
        </CardHeader>
        <CardContent class="pt-0">
          <div v-if="linkCalcSummary?.costData" class="space-y-2">
            <!-- 总成本 -->
            <div class="p-2.5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
              <div class="text-[10px] text-green-600 mb-0.5">链路总成本</div>
              <div class="text-lg font-bold text-green-800">{{ formatCost(linkCalcSummary.costData.totalCost) }}</div>
            </div>
            <!-- 成本明细 -->
            <div class="divide-y rounded-lg border overflow-hidden">
              <div class="flex justify-between px-3 py-1.5 text-xs hover:bg-gray-50">
                <span class="text-gray-600">海缆</span>
                <span class="font-mono font-medium">{{ formatCost(linkCalcSummary.costData.cableCost) }}</span>
              </div>
              <div class="flex justify-between px-3 py-1.5 text-xs hover:bg-gray-50">
                <span class="text-gray-600">放大器</span>
                <span class="font-mono font-medium">{{ formatCost(linkCalcSummary.costData.amplifierCost) }}</span>
              </div>
              <div v-if="linkCalcSummary.costData.buCost > 0" class="flex justify-between px-3 py-1.5 text-xs hover:bg-gray-50">
                <span class="text-gray-600">分支器</span>
                <span class="font-mono font-medium">{{ formatCost(linkCalcSummary.costData.buCost) }}</span>
              </div>
            </div>
            <!-- 成本构成条 -->
            <div v-if="linkCalcSummary.costData.totalCost > 0" class="space-y-1">
              <div class="text-[10px] text-gray-400">成本构成</div>
              <div class="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                <div class="h-full bg-blue-500" :style="{ width: (linkCalcSummary.costData.cableCost / linkCalcSummary.costData.totalCost * 100) + '%' }" />
                <div class="h-full bg-purple-500" :style="{ width: (linkCalcSummary.costData.amplifierCost / linkCalcSummary.costData.totalCost * 100) + '%' }" />
                <div class="h-full bg-green-500" :style="{ width: (linkCalcSummary.costData.buCost / linkCalcSummary.costData.totalCost * 100) + '%' }" />
              </div>
              <div class="flex gap-3 text-[10px] text-gray-400">
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500" />海缆</span>
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-purple-500" />放大器</span>
                <span v-if="linkCalcSummary.costData.buCost > 0" class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500" />BU</span>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-4">
            <DollarSign class="w-8 h-8 mx-auto mb-1.5 text-gray-300" />
            <div class="text-xs text-gray-400">点击「系统规划」完成计算后</div>
            <div class="text-xs text-gray-400">成本数据将在此显示</div>
          </div>
        </CardContent>
      </Card>

      <!-- 接线元管理 -->
      <ConnectorPanel class="flex-1 mt-2 min-h-0" @add="openConnectorAdd" @edit="openConnectorEdit" />
    </template>

    <template #center>
      <!-- 中间区域：系统布局图/可视化 -->
      <Card class="flex-1 flex flex-col">
        <CardHeader class="flex-shrink-0 bg-gray-50/50 border-b">
          <div class="flex items-center justify-between w-full">
            <span class="font-semibold text-sm flex items-center gap-2 text-gray-700">
              <Calculator class="w-4 h-4" />
              {{ centerViewMode === 'map' ? '系统布局图' : centerViewMode === 'span' ? 'Span 性能扫描' : 'GSNR沿路由演化' }}
            </span>
          </div>
        </CardHeader>
        <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
          <!-- 地图视图 -->
          <div v-show="centerViewMode === 'map'" class="flex-1 min-h-[300px]">
            <SystemDesignMap
              ref="systemDesignMapRef"
              :route-points="routePoints"
              :selected-point-id="selectedPointId"
              :draggable-amplifiers="!!autoPlacementResult"
              @point-click="handlePointClick"
              @bu-dblclick="handleBuDblclick"
              @line-click="handleLineClick"
              @edit="handleEdit"
              @delete="handleDelete"
              @amplifier-moved="handleAmplifierMoved"
            />
          </div>
          
          <!-- Span 性能曲线图 (Step 7) -->
          <div v-show="centerViewMode === 'span'" class="flex-1 p-4 overflow-auto">
            <SpanPerformanceChart 
              v-if="spanScanResult"
              :scan-result="spanScanResult"
              :height="320"
              :show-osnr="true"
              :user-selected-span="userSelectedSpan"
              :recommended-span="recommendedSpan ?? undefined"
              @select-span="handleSpanSelect"
              @update:user-selected-span="(v: number | null) => userSelectedSpan = v"
            />
            <div v-else class="flex items-center justify-center h-full text-gray-400">
              <div class="text-center">
                <Target class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <div>请点击“Span扫描”执行仿真计算</div>
              </div>
            </div>
          </div>
          
          <!-- GSNR余量曲线图 -->
          <div v-show="centerViewMode === 'gsnr'" class="flex-1 p-4 overflow-auto">
            <GSNRMarginChart 
              v-if="gsnrData.length > 0"
              :data="gsnrData" 
              :required-gsnr="12"
              :warning-threshold="3"
              :height="350"
              title="GSNR沿路由变化曲线"
              @refresh="handleCalculateGSNR"
            />
            <div v-else class="flex items-center justify-center h-full text-gray-400">
              暂无数据，请先导入路由并设置WDM参数
            </div>
          </div>

          <!-- 系统概览数据 -->
          <div v-if="designResult" class="grid grid-cols-4 border-t border-gray-200">
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designResult.totalLength.toLocaleString() }}</div>
              <div class="text-[10px] text-gray-500">总长度 (km)</div>
            </div>
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designResult.repeaterCount }}</div>
              <div class="text-[10px] text-gray-500">放大器数</div>
            </div>
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designResult.maxCapacity }}</div>
              <div class="text-[10px] text-gray-500">容量 (Tbps)</div>
            </div>
            <div class="p-3 text-center bg-gray-50/30">
              <div v-if="hasCostSettings" class="text-sm font-semibold text-gray-800">{{ formatCost(designResult.totalCost) }}</div>
              <div v-else class="text-sm text-amber-600 cursor-pointer hover:text-amber-700" @click="goToProjectSettings">未配置</div>
              <div class="text-[10px] text-gray-500">总成本</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #right>
      <!-- 性能概览 -->
      <Card class="flex-1 flex flex-col overflow-hidden">
        <CardHeader class="flex-shrink-0 pb-2 border-b bg-gray-50">
          <div class="flex items-center justify-between w-full">
            <span class="font-semibold text-sm flex items-center gap-2 text-gray-700">
              <Activity class="w-4 h-4 text-blue-500" />
              {{ currentLinkName || routeStore.selectedRoute?.name || '链路' }}
            </span>
          </div>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto pt-3">
          <!-- 有计算结果 -->
          <div v-if="linkCalcSummary" class="space-y-3">
            <!-- 设备统计 -->
            <div class="grid grid-cols-2 gap-2">
              <div class="p-2.5 bg-purple-50 rounded-lg border border-purple-200">
                <div class="text-[10px] text-purple-600 mb-0.5">放大器</div>
                <div class="text-xl font-bold text-purple-800">{{ deviceStats.amplifierCount }}</div>
                <div v-if="deviceStats.avgSpanLength > 0" class="text-[10px] text-purple-500 mt-0.5">均跨 {{ deviceStats.avgSpanLength.toFixed(1) }} km</div>
              </div>
              <div class="p-2.5 bg-blue-50 rounded-lg border border-blue-200">
                <div class="text-[10px] text-blue-600 mb-0.5">分支器 (BU)</div>
                <div class="text-xl font-bold text-blue-800">{{ deviceStats.buCount }}</div>
                <div v-if="linkCalcSummary.systemConfig.totalBuLoss > 0" class="text-[10px] text-blue-500 mt-0.5">总损耗 {{ linkCalcSummary.systemConfig.totalBuLoss.toFixed(1) }} dB</div>
              </div>
            </div>

            <!-- WDM 配置摘要 -->
            <div v-if="deviceStats.channelCount > 0" class="flex gap-3 px-1 text-[10px] text-gray-500">
              <span>{{ deviceStats.channelCount }} 波道</span>
              <span>{{ deviceStats.modulation }}</span>
            </div>

            <!-- OSNR 指标 -->
            <div class="border rounded-lg overflow-hidden">
              <div class="px-3 py-1.5 bg-orange-50 border-b flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-orange-500" />
                <span class="text-xs font-medium text-orange-700">OSNR</span>
              </div>
              <div class="grid grid-cols-3 divide-x text-center">
                <div class="py-2">
                  <div class="text-sm font-bold text-gray-800">{{ linkCalcSummary.metrics.osnr.min.toFixed(1) }}</div>
                  <div class="text-[10px] text-gray-400">最小 (dB)</div>
                </div>
                <div class="py-2">
                  <div class="text-sm font-bold text-gray-800">{{ linkCalcSummary.metrics.osnr.avg.toFixed(1) }}</div>
                  <div class="text-[10px] text-gray-400">平均 (dB)</div>
                </div>
                <div class="py-2">
                  <div class="text-sm font-bold text-gray-800">{{ linkCalcSummary.metrics.osnr.max.toFixed(1) }}</div>
                  <div class="text-[10px] text-gray-400">最大 (dB)</div>
                </div>
              </div>
            </div>

            <!-- GSNR 指标 -->
            <div class="border rounded-lg overflow-hidden">
              <div class="px-3 py-1.5 bg-blue-50 border-b flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-blue-500" />
                <span class="text-xs font-medium text-blue-700">GSNR</span>
              </div>
              <div class="grid grid-cols-3 divide-x text-center">
                <div class="py-2">
                  <div class="text-sm font-bold text-gray-800">{{ linkCalcSummary.metrics.gsnr.min.toFixed(1) }}</div>
                  <div class="text-[10px] text-gray-400">最小 (dB)</div>
                </div>
                <div class="py-2">
                  <div class="text-sm font-bold text-gray-800">{{ linkCalcSummary.metrics.gsnr.avg.toFixed(1) }}</div>
                  <div class="text-[10px] text-gray-400">平均 (dB)</div>
                </div>
                <div class="py-2">
                  <div class="text-sm font-bold text-gray-800">{{ linkCalcSummary.metrics.gsnr.max.toFixed(1) }}</div>
                  <div class="text-[10px] text-gray-400">最大 (dB)</div>
                </div>
              </div>
            </div>

            <!-- 裕量评估 -->
            <div class="border rounded-lg p-3 space-y-2"
              :class="linkCalcSummary.margin.meetsRequirement ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
              <div class="flex items-center gap-1.5 text-xs font-medium"
                :class="linkCalcSummary.margin.meetsRequirement ? 'text-green-700' : 'text-red-700'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path v-if="linkCalcSummary.margin.meetsRequirement" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {{ linkCalcSummary.margin.meetsRequirement ? '满足设计要求' : '不满足设计要求' }}
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="flex justify-between">
                  <span class="text-gray-500">目标 OSNR</span>
                  <span class="font-mono">{{ linkCalcSummary.margin.targetOsnr.toFixed(1) }} dB</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">最差余量</span>
                  <span class="font-mono" :class="linkCalcSummary.margin.worstMargin >= 0 ? 'text-green-600' : 'text-red-600'">
                    {{ linkCalcSummary.margin.worstMargin.toFixed(1) }} dB
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">平均余量</span>
                  <span class="font-mono">{{ linkCalcSummary.margin.avgMargin.toFixed(1) }} dB</span>
                </div>
                <div v-if="linkCalcSummary.metrics.qFactor.avg > 0" class="flex justify-between">
                  <span class="text-gray-500">Q 因子</span>
                  <span class="font-mono">{{ linkCalcSummary.metrics.qFactor.avg.toFixed(1) }} dB</span>
                </div>
              </div>
            </div>

            <!-- 重新计算 -->
            <Button variant="outline" size="sm" class="w-full text-xs" @click="handleSubmit">
              <Cpu class="w-3 h-3 mr-1" /> 重新计算
            </Button>
          </div>

          <!-- 无数据提示 -->
          <div v-else class="flex items-center justify-center h-full text-gray-400">
            <div class="text-center">
              <Activity class="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <div class="text-sm">请先执行系统规划计算</div>
              <div class="text-xs text-gray-400 mt-1">点击「系统规划」按钮启动计算</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>

  <!-- 弹框组件 -->
  <ConnectorDialog
    @saved="showConnectorDialog = false" />
  <WDMConfigDialog 
    :visible="showWDMConfigDialog" 
    @close="showWDMConfigDialog = false"
    @config-change="handleWDMConfigChange"
    @calculate="handleCalculateGSNR"
  />
  <SimulationModelSelectDialog
    :visible="showModelSelectDialog"
    @close="showModelSelectDialog = false"
    @confirm="handleModelConfirm"
  />
  <SimulationAnalysisDialog
    :visible="showSimulationAnalysisDialog"
    :link-calc-summary="linkCalcSummary"
    @close="showSimulationAnalysisDialog = false"
  />
  
  <!-- 一站式系统规划配置向导 -->
  <SystemPlanningWizard
    :visible="showPlanningWizard"
    @close="showPlanningWizard = false"
    @start-calculation="handleWizardStartCalculation"
  />
  
  <!-- 系统规划链路配置对话框 -->
  <LinkConfigDialog
    :visible="showLinkConfigDialog"
    @close="showLinkConfigDialog = false"
    @apply-result="handleLinkConfigApplyResult"
  />

  <!-- 设备编辑弹框 -->
  <div v-if="showDeviceEditDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-[480px] max-h-[90vh] overflow-auto">
      <div class="px-4 py-3 border-b flex items-center justify-between">
        <h3 class="font-semibold text-gray-800">编辑设备</h3>
        <button class="text-gray-400 hover:text-gray-600" @click="showDeviceEditDialog = false">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div v-if="editingDevice" class="p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">设备名称</label>
          <Input v-model="editingDevice.name" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">经度</label>
            <Input v-model="editingDevice.longitude" type="number" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">纬度</label>
            <Input v-model="editingDevice.latitude" type="number" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">KP (km)</label>
            <Input v-model="editingDevice.kp" type="number" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">深度 (m)</label>
            <Input v-model="editingDevice.depth" type="number" class="w-full" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">设备类型</label>
          <Select v-model="editingDevice.type" :options="deviceTypeOptions" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">规格型号</label>
          <Input v-model="editingDevice.specifications" class="w-full" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
          <textarea v-model="editingDevice.remarks" rows="2"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></textarea>
        </div>
      </div>
      <div class="px-4 py-3 border-t flex justify-end gap-2">
        <Button variant="outline" size="sm" @click="showDeviceEditDialog = false">取消</Button>
        <Button size="sm" @click="saveDeviceEdit">保存</Button>
      </div>
    </div>
  </div>
  
  <!-- 器件库为空警告弹窗 -->
  <Teleport to="body">
    <div v-if="showDeviceLibraryWarning" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showDeviceLibraryWarning = false" />
      <div class="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div class="bg-amber-50 px-6 py-4 border-b border-amber-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle class="w-5 h-5 text-amber-600" />
            </div>
            <h3 class="text-lg font-semibold text-amber-800">器件库数据不完整</h3>
          </div>
        </div>
        <div class="px-6 py-5">
          <p class="text-gray-600 mb-2">系统规划需要器件库中的光纤类型和放大器类型数据，当前缺少：</p>
          <ul class="text-sm text-gray-500 mb-5 space-y-1 pl-4">
            <li v-if="settingsStore.fiberTypes.length === 0" class="list-disc text-amber-600">光纤类型（0 条记录）</li>
            <li v-if="settingsStore.amplifierTypes.length === 0" class="list-disc text-amber-600">放大器类型（0 条记录）</li>
          </ul>
          <div class="flex gap-3">
            <Button class="flex-1 bg-blue-600 hover:bg-blue-700 text-white" @click="goToDeviceLibrarySettings">
              <Database class="w-4 h-4 mr-2" />
              前往器件库配置
            </Button>
            <Button variant="outline" class="flex-1" @click="showDeviceLibraryWarning = false">
              取消
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- BU 配置对话框 -->
  <BUConfigDialog
    :visible="showBuConfigDialog"
    :bu-id="editingBuId"
    @close="showBuConfigDialog = false"
    @save="showBuConfigDialog = false"
  />
</template>
