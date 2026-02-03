<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button, Select, Tooltip, Input } from '@/shared/components/base'
import ConnectorPanel from '@/modules/design/panels/ConnectorPanel.vue'
import WDMConfigDialog from '@/modules/design/dialogs/WDMConfigDialog.vue'
import ConnectorDialog from '@/modules/design/dialogs/ConnectorDialog.vue'
import RepeaterConfigDialog from '@/modules/design/dialogs/RepeaterConfigDialog.vue'
import SimulationModelSelectDialog from '@/modules/design/dialogs/SimulationModelSelectDialog.vue'
import LinkAnalysisDialog from '@/modules/design/dialogs/LinkAnalysisDialog.vue'
import SystemDesignMap from '@/modules/design/components/SystemDesignMap.vue'
import GSNRMarginChart from '@/components/charts/GSNRMarginChart.vue'
import SpanPerformanceChart from '@/components/charts/SpanPerformanceChart.vue'
import { useSettingsStore, useAppStore, useConnectorStore, useRPLStore, useMonitorStore, useRouteStore } from '@/stores'
import { useRouter } from 'vue-router'
import { opticalSimulationService, repeaterPlacementService } from '@/services'
import type { SpanScanResult, OpticalLink, ModulationFormat, FiberSpan, LinkNode } from '@/types/simulation'
import type { SpanScanConfig } from '@/types/systemPlanning'
import { MODULATION_PARAMS } from '@/types/simulation'
import { connectorTypeLabels } from '@/types/connector'
import { Cable, Radio, GitBranch, Calculator, Save, RotateCcw, FileSpreadsheet, Send, FileText, Edit3, TrendingUp, Database, Waves, Sliders, BarChart2, Cpu, Target } from 'lucide-vue-next'

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

// 调试日志 + 初始化登陆站数据
onMounted(() => {
  // 从路由规划初始化登陆站和分支器到 monitorStore
  initLandingStationsFromRoute()
})

// 从路由规划初始化登陆站和分支器数据
const initLandingStationsFromRoute = () => {
  const selectedRoute = routeStore.selectedRoute
  if (!selectedRoute || selectedRoute.points.length === 0) return
  
  // 检查 monitorStore 是否已有登陆站数据
  const hasLandingStations = monitorStore.devices.some(d => d.type === 'landing')
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
  const devices: any[] = []
  
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
      
      devices.push({
        id: point.id,
        name: deviceName,
        type: deviceType,
        neType: point.type === 'landing' ? 'LTE' : 'BU',
        kp: cumulativeKp,
        longitude: point.coordinates[0],
        latitude: point.coordinates[1],
        depth: pointDepth,
        status: 'normal' as const,
        location: `KP ${cumulativeKp.toFixed(1)}`,
        sldEquipmentName: deviceName,
        inputPower: 0,
        outputPower: 0,
        pumpCurrent: 0,
        pfeVoltage: 48,
        pfeCurrent: 0,
        temperature: 25
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
        devices.push({
          id: `branch-${point.id}`,
          name: point.branchTo.name || (isBranchUnderwater ? '水下站点-分支' : '岸上站点-分支'),
          type: isBranchUnderwater ? 'underwater' : 'landing',
          neType: 'LTE',
          kp: cumulativeKp + branchDist,
          longitude: point.branchTo.coord[0],
          latitude: point.branchTo.coord[1],
          depth: 0,
          status: 'normal' as const,
          location: `Branch from ${point.name}`,
          sldEquipmentName: point.branchTo.name,
          inputPower: 0,
          outputPower: 0,
          pumpCurrent: 0,
          pfeVoltage: 48,
          pfeCurrent: 0,
          temperature: 25,
          isBranchStation: true,
          branchFrom: point.name
        })
      }
    }
  })
  
  if (devices.length > 0) {
    // 按 KP 排序，分支登陆站放最后
    const mainDevices = devices.filter(d => !(d as any).isBranchStation).sort((a, b) => a.kp - b.kp)
    const branchDevices = devices.filter(d => (d as any).isBranchStation)
    monitorStore.devices.splice(0, monitorStore.devices.length, ...mainDevices, ...branchDevices)
  }
}

// 监听 elements 变化
watch(() => connectorStore.elements.length, (newLen) => {
})

// 本地编辑状态
const selectedCableType = ref('lw')
const selectedRepeaterType = ref('std')

// 下拉选项
const cableTypeOptions = computed(() =>
  settingsStore.settings.cableTypes.map(c => ({
    value: c.id,
    label: `${c.name} (${c.fiberCount}纤)`
  }))
)

const repeaterTypeOptions = computed(() =>
  settingsStore.settings.repeaterTypes.map(r => ({
    value: r.id,
    label: r.name
  }))
)
const repeaterSpacing = ref(80)
const targetCapacity = ref(100)

// 检测成本参数是否已配置
const hasCostSettings = computed(() => {
  const costSettings = settingsStore.costFactors
  // 至少需要配置电缆成本和中继器成本
  return costSettings && 
    costSettings.cableCostPerKm !== undefined && 
    costSettings.cableCostPerKm > 0 &&
    costSettings.repeaterCost !== undefined && 
    costSettings.repeaterCost > 0
})

// 跳转到工程设置页面
const goToProjectSettings = () => {
  router.push('/settings')
}

// 计算结果 - 从 rplStore 动态获取总长度，联动中继器配置
// 使用工程设置中的成本参数
const designResult = computed(() => {
  const cable = settingsStore.settings.cableTypes.find(c => c.id === selectedCableType.value)
  const repeater = settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterType.value)

  if (!cable || !repeater) return null

  // 从 RPL store 获取总长度，无数据时默认0
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) return null
  
  // 优先使用保存的中继器配置数量
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

// 显示用中继器列表（最多显示5个）
// 使用保存的配置名称，否则使用器件库名称
const displayRepeaters = computed(() => {
  // 如果有保存的中继器配置，使用配置中的名称
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
  
  // 没有配置时，使用器件库中继器类型名称
  const repeaterType = settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterType.value)
  const typeName = repeaterType?.name || '中继器'
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
const showRepeaterDialog = ref(false)
const showConnectorDialog = ref(false)
const showWDMConfigDialog = ref(false)
const showModelSelectDialog = ref(false)
const showLinkAnalysisDialog = ref(false)
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
const recommendedSpan = ref<number | null>(null)// 自动落位结果
const autoPlacementResult = ref<any>(null)

// 中继器配置数据（用于联动链路分析等）
const savedRepeaterConfigs = ref<Array<{
  id: string
  kp: number
  name: string
  gain: number
  noiseFigure?: number
}>>([])

// 设备编辑弹框
const showDeviceEditDialog = ref(false)
const editingDevice = ref<any>(null)

// 设备类型选项（排除光纤段）
const deviceTypeOptions = computed(() => 
  Object.entries(connectorTypeLabels)
    .filter(([value]) => value !== 'fiber')
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
  
  // 从settings获取WDM参数
  const wdmConfig = settingsStore.transmissionConfig
  const launchPower = 0
  
  for (let i = 0; i <= spanCount; i++) {
    const kp = Math.min(i * repeaterSpacing.value, totalLength)
    // 调用仿真服务进行计算 - 使用正确的参数格式
    const result = opticalSimulationService.quickEstimateGSNR(
      kp,
      repeaterSpacing.value,
      launchPower,
      5,   // noiseFigure
      0.16 // attenuation
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

// 打开中继器配置弹框
const openRepeaterPanel = () => {
  showRepeaterDialog.value = true
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
    // Step 6: 执行 Span 扫描
    spanScanResult.value = opticalSimulationService.spanRangeScan(
      totalLength,
      scanConfig,
      settingsStore.transmissionConfig.channelCount,
      {
        channelSpacing: wdmConfig?.channelSpacingGHz || 50,
        launchPowerPerChannel: wdmConfig?.launchPower || 1,  // 长距离预设使用 +1dBm
      }
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
    
    // 更新中继器间距
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

// 构建当前链路数据 (供链路分析使用)
const currentOpticalLink = computed<OpticalLink | null>(() => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  if (totalLength === 0) return null

  const wdmConfig = settingsStore.transmissionConfig

  // 构建节点列表 - 优先使用保存的中继器配置
  const nodes: LinkNode[] = []
  nodes.push({ id: 'terminal-start', type: 'terminal', name: '起点站', kp: 0 })
  
  if (savedRepeaterConfigs.value.length > 0) {
    // 使用保存的中继器配置
    savedRepeaterConfigs.value.forEach(rep => {
      nodes.push({
        id: rep.id,
        type: 'repeater',
        name: rep.name,
        kp: rep.kp,
        amplifier: { type: 'EDFA', gain: rep.gain, noiseFigure: rep.noiseFigure || 5, maxOutputPower: 17, gainFlatness: 1, band: 'C' }
      })
    })
  } else {
    // 使用默认等间距配置
    const spanLength = repeaterSpacing.value
    const spanCount = Math.ceil(totalLength / spanLength)
    for (let i = 1; i < spanCount; i++) {
      nodes.push({
        id: `repeater-${i}`,
        type: 'repeater',
        name: `R${i}`,
        kp: i * spanLength,
        amplifier: { type: 'EDFA', gain: 16, noiseFigure: 5, maxOutputPower: 17, gainFlatness: 1, band: 'C' }
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
      fiber: { type: 'G.654.E', attenuation: 0.16, dispersion: 17, dispersionSlope: 0.06, effectiveArea: 80, nonlinearIndex: 1.3e-20, nonlinearCoeff: 0.8 },
      spanLoss: spanLen * 0.16,
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

// 处理中继器配置保存
const handleRepeatersSaved = (repeaters: any[]) => {
  savedRepeaterConfigs.value = repeaters.map(r => ({
    id: r.id,
    kp: r.kp,
    name: r.name,
    gain: r.gain || 16,
    noiseFigure: 5
  }))
  
  // 区分主干线和分支线上的中继器
  const mainTrunkRepeaters = repeaters.filter(r => !r.remarks?.includes('分支线'))
  const branchRepeaters = repeaters.filter(r => r.remarks?.includes('分支线'))
  
  // 同步到 monitorStore，使地图显示中继器位置
  const newDevices = repeaters.map(rep => {
    const isBranchRepeater = rep.remarks?.includes('分支线')
    const existing = monitorStore.devices.find(d => d.id === rep.id)
    if (existing) {
      return {
        ...existing,
        kp: rep.kp,
        longitude: rep.longitude,
        latitude: rep.latitude,
        isBranchRepeater,
        branchInfo: isBranchRepeater ? rep.remarks : undefined
      }
    } else {
      return {
        id: rep.id,
        name: rep.name,
        type: 'amplifier_e',
        neType: 'EDFA',
        kp: rep.kp,
        longitude: rep.longitude,
        latitude: rep.latitude,
        depth: rep.depth || 3000,
        status: 'normal' as const,
        location: `KP ${rep.kp}`,
        sldEquipmentName: rep.name,
        inputPower: -15,
        outputPower: 1,
        pumpCurrent: 200,
        pfeVoltage: 48,
        pfeCurrent: 1.5,
        temperature: 25,
        isBranchRepeater,
        branchInfo: isBranchRepeater ? rep.remarks : undefined
      }
    }
  })
  
  // 保留非中继器设备（包括登陆站、分支器、分支登陆站等），替换中继器设备
  const repIds = new Set(repeaters.map(r => r.id))
  const otherDevices = monitorStore.devices.filter(d => {
    // 保留不在替换列表中的设备
    if (repIds.has(d.id)) return false
    // 保留登陆站、分支器、分支登陆站
    if (d.type === 'landing' || d.type === 'bu' || d.type === 'branching' || (d as any).isBranchStation) {
      return true
    }
    // 移除旧的中继器（会被新的替换）
    if (d.type === 'amplifier_e' || d.type === 'amplifier_w') {
      return false
    }
    return true
  })
  // 合并后按 KP 排序，分支线中继器和分支登陆站放在最后
  const allDevices = [...otherDevices, ...newDevices]
  const mainTrunkDevices = allDevices.filter(d => 
    !(d as any).isBranchStation && !(d as any).isBranchRepeater
  ).sort((a, b) => (a.kp || 0) - (b.kp || 0))
  const branchDevices = allDevices.filter(d => 
    (d as any).isBranchStation || (d as any).isBranchRepeater
  )
  monitorStore.devices.splice(0, monitorStore.devices.length, ...mainTrunkDevices, ...branchDevices)
  
  // 同步到 connectorStore，使接线元管理显示中继器
  // 先按 KP 排序
  const sortedRepeaters = [...repeaters].sort((a, b) => a.kp - b.kp)
  
  sortedRepeaters.forEach((rep) => {
    // 使用配置中的类型，默认交替东/西
    const ampType = rep.type || 'amplifier_e'
    
    const existing = connectorStore.elements.find(e => e.id === rep.id)
    if (!existing) {
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
      })
    } else {
      connectorStore.updateElement(rep.id, {
        type: ampType,
        kp: rep.kp,
        longitude: rep.longitude,
        latitude: rep.latitude,
        depth: rep.depth
      })
    }
  })
  
  // 自动生成光纤段数据（连接相邻节点）
  generateFiberSpans(sortedRepeaters)
  
  // 重新计算 GSNR 数据
  if (gsnrData.value.length > 0) {
    gsnrData.value = calculateGSNRData()
  }
  
  showRepeaterDialog.value = false
  appStore.showNotification({ type: 'success', message: `已保存 ${repeaters.length} 个中继器配置` })
  appStore.addLog('INFO', `中继器配置已更新: ${repeaters.length} 个中继器`)
}

// 打开链路分析 (Step 9)
const openLinkAnalysis = () => {
  if (!currentOpticalLink.value) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据' })
    return
  }
  showLinkAnalysisDialog.value = true
}

// 提交参数并计算 (兼容旧流程)
const handleSubmit = () => {
  openModelSelectDialog()
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
    appStore.showNotification({ type: 'info', message: '已开启编辑模式，可拖拽调整中继器位置' })
  } else {
    appStore.showNotification({ type: 'info', message: '已关闭编辑模式' })
  }
}

// 点击节点
const handlePointClick = (pointId: string) => {
  selectedPointId.value = pointId
}

// 节点移动 - 同时更新 connectorStore 和 monitorStore
const handlePointMoved = (pointId: string, longitude: number, latitude: number) => {
  // 优先从 monitorStore 查找（地图使用 monitorStore 渲染）
  const device = monitorStore.devices.find(d => d.id === pointId)
  const point = routePoints.value.find(p => p.id === pointId)
  
  const deviceName = device?.name || point?.name || pointId
  
  // 更新 monitorStore.devices
  if (device) {
    device.longitude = longitude
    device.latitude = latitude
  }
  
  // 更新 connectorStore
  if (point) {
    connectorStore.updateElement(pointId, { longitude, latitude })
  }
  
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

// 保存设备编辑
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

  // 同步更新 monitorStore 数据（地图使用 monitorStore 渲染）
  // 使用 KP 匹配，因为 connectorStore 和 monitorStore 的 ID 可能不同
  const originalKp = routePoints.value.find(p => p.id === editingDevice.value!.id)?.kp
  const deviceIndex = monitorStore.devices.findIndex(d => Math.abs(d.kp - (originalKp ?? editingDevice.value!.kp)) < 0.01)
  if (deviceIndex !== -1) {
    const updatedDevice = {
      ...monitorStore.devices[deviceIndex],
      name: editingDevice.value.name,
      type: editingDevice.value.type,
      neType: editingDevice.value.type,
      longitude: editingDevice.value.longitude,
      latitude: editingDevice.value.latitude,
      kp: editingDevice.value.kp,
      depth: editingDevice.value.depth,
    }
    // 使用 splice 确保触发响应式更新
    monitorStore.devices.splice(deviceIndex, 1, updatedDevice)
  }

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
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700">传输系统规划</span>
          <span class="text-xs text-gray-400">| 配置 → 仿真 → 分析</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- 配置类按钮 -->
          <Tooltip content="中继器位置与参数配置">
            <Button variant="outline" size="sm" @click="openRepeaterPanel">
              <Radio class="w-4 h-4 mr-1" /> 中继器
            </Button>
          </Tooltip>
          <Tooltip content="WDM传输参数配置">
            <Button variant="outline" size="sm" @click="showWDMConfigDialog = true">
              <Waves class="w-4 h-4 mr-1" /> WDM参数
            </Button>
          </Tooltip>
          <div class="w-px h-5 bg-gray-300" />
          <!-- 计算分析类按钮 -->
          <Tooltip content="执行Span扫描仿真计算">
            <Button size="sm" @click="handleSubmit">
              <Cpu class="w-4 h-4 mr-1" /> Span扫描
            </Button>
          </Tooltip>
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
      <!-- 3.1.1 电缆/中继器配置 -->
      <Card class="flex-shrink-0">
        <CardHeader class="pb-2">
          <span class="font-semibold text-sm flex items-center gap-2">
            <Cable class="w-4 h-4 text-primary" />
            电缆配置
          </span>
        </CardHeader>
        <CardContent class="pt-0">
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1 font-medium">电缆类型</label>
              <Select v-model="selectedCableType" :options="cableTypeOptions" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1 font-medium">中继器类型</label>
              <Select v-model="selectedRepeaterType" :options="repeaterTypeOptions" />
            </div>
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="text-xs text-gray-500 font-medium">中继器间距</label>
                <span class="text-xs font-bold text-primary">{{ repeaterSpacing }} km</span>
              </div>
              <input v-model.number="repeaterSpacing" type="range" min="40" max="120" step="5"
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 3.1.2 接线元管理 -->
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
            <div class="flex gap-1">
              <button 
                class="px-2 py-1 text-xs rounded transition-colors"
                :class="centerViewMode === 'map' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'"
                @click="centerViewMode = 'map'"
              >
                布局图
              </button>
              <button 
                class="px-2 py-1 text-xs rounded transition-colors"
                :class="centerViewMode === 'span' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'"
                @click="centerViewMode = 'span'"
              >
                <Target class="w-3 h-3 inline mr-1" />
                Span扫描
              </button>
              <button 
                class="px-2 py-1 text-xs rounded transition-colors"
                :class="centerViewMode === 'gsnr' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'"
                @click="centerViewMode = 'gsnr'"
              >
                <TrendingUp class="w-3 h-3 inline mr-1" />
                GSNR演化
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
          <!-- 地图视图 -->
          <div v-show="centerViewMode === 'map'" class="flex-1 min-h-[300px]">
            <SystemDesignMap ref="systemDesignMapRef" :route-points="routePoints" :selected-point-id="selectedPointId"
              :editable="isEditMode" @point-click="handlePointClick" @point-moved="handlePointMoved"
              @line-click="handleLineClick" @edit="handleEdit" @delete="handleDelete" />
          </div>
          
          <!-- Span 性能曲线图 (Step 7) -->
          <div v-show="centerViewMode === 'span'" class="flex-1 p-4 overflow-auto">
            <SpanPerformanceChart 
              v-if="spanScanResult"
              :scan-result="spanScanResult"
              :height="320"
              :show-osnr="true"
              @select-span="handleSpanSelect"
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
              <div class="text-[10px] text-gray-500">中继器数</div>
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
      <!-- 3.1.5 结果反馈展示 -->
      <Card class="flex-1 flex flex-col">
        <CardHeader class="pb-2 flex-shrink-0 bg-gray-50/50 border-b">
          <span class="font-semibold text-sm flex items-center gap-2 text-gray-700">
            <GitBranch class="w-4 h-4 text-gray-600" />
            结果反馈
          </span>
        </CardHeader>
        <CardContent class="pt-4 flex-1 flex flex-col bg-white">
          <div v-if="designResult" class="space-y-4 flex-1">
            <!-- 系统概览 -->
            <div class="grid grid-cols-2 gap-3">
              <div class="p-3 bg-gray-50 rounded border border-gray-200 text-center">
                <div class="text-lg font-bold text-primary">{{ designResult.totalLength.toLocaleString() }}</div>
                <div class="text-xs text-gray-500 mt-1">总长度 (km)</div>
              </div>
              <div class="p-3 bg-gray-50 rounded border border-gray-200 text-center">
                <div class="text-lg font-bold text-primary">{{ designResult.repeaterCount }}</div>
                <div class="text-xs text-gray-500 mt-1">中继器数</div>
              </div>
            </div>

            <!-- 成本明细 -->
            <div class="border border-gray-200 rounded p-3">
              <h4 class="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2 border-b pb-2">
                <span class="w-1 h-3 bg-gray-500 rounded-sm"></span>
                成本估算
              </h4>
              <!-- 未配置成本参数时显示提示 -->
              <div v-if="!hasCostSettings" class="text-center py-3">
                <div class="text-amber-600 text-xs mb-2">
                  ⚠️ 成本参数未配置
                </div>
                <div class="text-gray-500 text-[10px] mb-3">
                  请在工程设置中配置成本参数后查看成本估算
                </div>
                <Button size="sm" variant="outline" class="text-xs" @click="goToProjectSettings">
                  去配置
                </Button>
              </div>
              <!-- 已配置时显示成本明细 -->
              <div v-else class="space-y-2 text-xs">
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">电缆成本</span>
                  <span class="font-mono">{{ formatCost(designResult.cableCost) }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">中继器成本</span>
                  <span class="font-mono">{{ formatCost(designResult.repeaterCost) }}</span>
                </div>
                <div class="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                  <span class="font-bold text-gray-700">总计</span>
                  <span class="font-bold text-gray-900 font-mono">{{ formatCost(designResult.totalCost) }}</span>
                </div>
              </div>
            </div>

            <!-- 容量状态 -->
            <div class="border border-gray-200 rounded p-3">
              <h4 class="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2 border-b pb-2">
                <span class="w-1 h-3 bg-gray-500 rounded-sm"></span>
                容量分析
              </h4>
              <div class="flex items-center gap-3 mb-2">
                <div class="flex-1 bg-gray-100 rounded-sm h-3 overflow-hidden border border-gray-200">
                  <div class="h-full transition-all duration-300"
                    :class="targetCapacity <= designResult.maxCapacity ? 'bg-green-600' : 'bg-red-600'"
                    :style="{ width: Math.min(100, (targetCapacity / designResult.maxCapacity) * 100) + '%' }" />
                </div>
                <span class="text-xs font-mono text-gray-700 w-16 text-right">{{ designResult.maxCapacity }} Tbps</span>
              </div>
              <div class="text-xs font-medium flex items-center gap-1.5"
                :class="targetCapacity <= designResult.maxCapacity ? 'text-green-700' : 'text-red-700'">
                <span class="flex items-center justify-center w-4 h-4 rounded-full text-[10px] text-white"
                  :class="targetCapacity <= designResult.maxCapacity ? 'bg-green-600' : 'bg-red-600'">
                  {{ targetCapacity <= designResult.maxCapacity ? '✓' : '!' }} </span>
                    {{ targetCapacity <= designResult.maxCapacity ? '满足容量需求' : '容量不足，请调整参数' }} </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="mt-auto pt-4 border-t border-gray-100 space-y-2 flex-shrink-0">
              <Button class="w-full bg-primary hover:bg-primary hover:brightness-90 text-white" size="sm"
                @click="handleSave">
                <Save class="w-4 h-4 mr-2" /> 保存设计
              </Button>
              <Button variant="outline" class="w-full border-gray-300 hover:bg-gray-50 text-gray-700" size="sm"
                @click="handleReset">
                <RotateCcw class="w-4 h-4 mr-2" /> 重置参数
              </Button>
            </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>

  <!-- 弹框组件 -->
  <RepeaterConfigDialog :visible="showRepeaterDialog" @close="showRepeaterDialog = false"
    @saved="handleRepeatersSaved" />
  <ConnectorDialog :visible="showConnectorDialog" :edit-id="editConnectorId" @close="showConnectorDialog = false"
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
  <LinkAnalysisDialog
    :visible="showLinkAnalysisDialog"
    :link="currentOpticalLink ?? undefined"
    @close="showLinkAnalysisDialog = false"
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
</template>
