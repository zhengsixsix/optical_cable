<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { useConnectorStore } from '@/stores/connector'
import { useMonitorStore } from '@/stores/monitor'
import { useRouteStore } from '@/stores/route'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button, Select, Tooltip, Input } from '@/shared/components/base'
import ConnectorPanel from '@/modules/design/panels/ConnectorPanel.vue'
import ConnectorDialog from '@/modules/design/dialogs/ConnectorDialog.vue'
import SimulationAnalysisDialog from '@/modules/design/dialogs/SimulationAnalysisDialog.vue'
import LinkConfigDialog from '@/modules/design/dialogs/LinkConfigDialog.vue'
import BUConfigDialog from '@/modules/design/dialogs/BUConfigDialog.vue'
import SystemDesignMap from '@/modules/design/components/SystemDesignMap.vue'
import { useSettingsStore } from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { useRPLStore } from '@/stores/rpl'
import { useRouter } from 'vue-router'
import { Calculator, FileSpreadsheet, Database, BarChart2, Cpu, DollarSign, Activity, X } from 'lucide-vue-next'
import {
  getConnectorTypeForDeviceTypeCode,
  getDeviceTypeCodeForConnectorType,
} from '@/services/platform/deviceTypeAdapter'
import { normalizePlatformSimulationCache } from '@/services/SimulationApiService'
import { selectPlanningLayoutResult } from '@/utils/systemPlanningLayout'

const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()
const appStore = useAppStore()
const connectorStore = useConnectorStore()
const rplStore = useRPLStore()
const monitorStore = useMonitorStore()
const routeStore = useRouteStore()
const cableSegmentStore = useCableSegmentStore()
const router = useRouter()

const projectWarningMessage = computed(() => {
  const projectType = appStore.currentProjectType
  if (projectType === null) {
    return '当前没有打开项目。请先创建或打开一个项目(.use)。'
  }
  return ''
})

type ArmorRiskLevel = 'high' | 'medium' | 'low'

const riskLevelNames: Record<ArmorRiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
}

const getRiskArmorLabel = (riskLevel: ArmorRiskLevel): string => {
  const riskLabel = riskLevelNames[riskLevel]
  const armorNames = (settingsStore.routePlanningConfig.armorTypeMappings || [])
    .filter(mapping => mapping.riskLevel === riskLevel)
    .map(mapping => dictionaryStore.getItem(
      PLATFORM_DICTIONARY_TYPES.armoringType,
      mapping.armorTypeCode,
    ))
    .filter(item => item !== null)
    .map(item => item.name || String(item.code))

  return armorNames.length > 0
    ? `${riskLabel} (${[...new Set(armorNames)].join(' / ')})`
    : riskLabel
}

// 跳转到路由规划页面
const goToPlanning = () => {
  router.push('/planning')
}

// 打开新建项目对话框
const openNewProject = () => {
  appStore.openDialog('new-project')
}

onMounted(async () => {
  try {
    await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType)
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件类型字典加载失败：${(error as Error).message}` })
  }
  try {
    await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType)
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `铠装类型字典加载失败：${(error as Error).message}` })
  }
  try {
    await settingsStore.ensurePlatformDeviceLibrariesLoaded()
  } catch (error) {
    appStore.addLog('WARN', `平台器件库加载失败，已保存的系统规划配置仍可查看: ${(error as Error).message}`)
  }

  routeStore.syncConfiguredStationNames()

  if (!routeStore.selectedRoute) {
    appStore.addLog('INFO', '系统设计未检测到真实路由规划结果，未自动生成调试路线')
  }

})

// 本地编辑状态
const routeConnectorElements = computed(() =>
  connectorStore.getElementsForRoute(routeStore.currentRouteId || undefined)
)
const hasDraggableAmplifiers = computed(() =>
  routeConnectorElements.value.some(element =>
    element.type === 'ola' || element.type === 'amplifier_e' || element.type === 'amplifier_w'
  )
)

watch(() => routeStore.currentRouteId, (routeId) => {
  if (!routeId) {
    connectorStore.selectTable(null)
    return
  }
  const matchTable = rplStore.tables.find(t => t.routeId === routeId)
  connectorStore.selectTableByRoute(routeId, { clearOnMissing: true })
  if (matchTable && rplStore.currentTableId !== matchTable.id) {
    rplStore.selectTable(matchTable.id)
  }
})

watch(() => rplStore.currentTableId, (tableId) => {
  if (!tableId) {
    connectorStore.selectTable(null)
    return
  }
  const table = rplStore.tables.find(t => t.id === tableId)
  if (table?.routeId && routeStore.currentRouteId !== table.routeId) {
    routeStore.selectRoute(table.routeId)
  }
  connectorStore.selectTableByRoute(table?.routeId || null, { clearOnMissing: true })
})

// 弹框状态
const showConnectorDialog = ref(false)
const showSimulationAnalysisDialog = ref(false)
const showLinkConfigDialog = ref(false)  // 系统规划链路配置对话框
const currentLinkName = ref('')  // 当前计算的链路名称
const editConnectorId = ref<string | null>(null)
const showConnectorCoordinatePicker = ref(false)
const connectorPickedCoordinate = ref<{ longitude: number; latitude: number } | null>(null)

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

interface LinkMetricSummary {
  min: number
  max: number
  avg: number
}

interface LinkCalculationSummary {
  layoutOnly?: boolean
  linkName: string
  totalLength?: number
  systemCapacityTbps?: number
  calculatedAt?: string
  status?: string
  metrics?: {
    osnr: LinkMetricSummary
    gsnr: LinkMetricSummary
    power?: LinkMetricSummary
    nli?: LinkMetricSummary
    qFactor?: LinkMetricSummary
  }
  systemConfig?: {
    amplifierCount?: number
    avgSpanLength?: number
    buCount?: number
    equalizerCount?: number
    totalBuLoss?: number
    totalEqualizerLoss?: number
    channelCount?: number
    modulation?: string
  }
  margin?: {
    targetOsnr: number
    worstMargin: number
    avgMargin: number
    meetsRequirement: boolean
  }
  costData?: {
    cableCost: number
    amplifierCost: number
    buCost: number
    equalizerCost: number
    totalCost: number
    costItems: Array<{ category: string; model: string; quantity: number | string; unit: string; unitPrice: number; subtotal: number }>
  }
}

// 链路计算结果摘要（来自系统规划链路配置对话框或已恢复的平台缓存）
const linkCalcSummary = ref<LinkCalculationSummary | null>(null)

const finiteNumber = (value: unknown): number | null => {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const summarizeFinalMatrixRow = (matrix: number[][] | null | undefined): LinkMetricSummary | null => {
  if (!Array.isArray(matrix)) return null
  for (let index = matrix.length - 1; index >= 0; index -= 1) {
    const values = Array.isArray(matrix[index])
      ? matrix[index].filter(value => Number.isFinite(value))
      : []
    if (values.length === 0) continue
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((total, value) => total + value, 0) / values.length,
    }
  }
  return null
}

const normalizedPlanningSimulation = computed(() => {
  const cached = settingsStore.simulationCache
  if (cached?.is_valid) return cached
  return normalizePlatformSimulationCache(settingsStore.platformPlanningResults?.simulation)
})

const restoredPlanningLayout = computed(() => {
  const preferredMode = settingsStore.platformPlanConfigSnapshot?.form?.spanStrategy === 'fixed'
    ? 'fixed'
    : 'optimized'
  return selectPlanningLayoutResult(settingsStore.platformPlanningResults, preferredMode)
})

const restoredPlanningSummary = computed<LinkCalculationSummary | null>(() => {
  const legacy = settingsStore.linkCalcSummaryCache as Partial<LinkCalculationSummary> | null
  const simulation = normalizedPlanningSimulation.value
  const planning = settingsStore.systemPlanningCache?.is_valid
    ? settingsStore.systemPlanningCache
    : null
  const layout = restoredPlanningLayout.value
  if (!legacy && !simulation && !planning && !layout) return null

  const gsnr = summarizeFinalMatrixRow(simulation?.metrics.gsnr_matrix_db)
  const osnr = summarizeFinalMatrixRow(simulation?.metrics.osnr_matrix_db)
  const power = summarizeFinalMatrixRow(simulation?.metrics.signal_power_matrix_dbm)
  const nli = summarizeFinalMatrixRow(simulation?.metrics.nli_noise_power_matrix_dbm)
  const restoredMetrics = gsnr && osnr
    ? {
        gsnr,
        osnr,
        ...(power ? { power } : {}),
        ...(nli ? { nli } : {}),
        ...(legacy?.metrics?.qFactor ? { qFactor: legacy.metrics.qFactor } : {}),
      }
    : legacy?.metrics

  const finalPlan = planning?.final_plan_cache
  const finalPlacement = finalPlan?.amplifier_placement
  const finalNodePositions = (finalPlan?.node_metadata ?? [])
    .map(node => finiteNumber(node.kp_km))
    .filter((value): value is number => value != null)
  const finalPlanLength = finalNodePositions.length > 0 ? Math.max(...finalNodePositions) : null
  const totalLength = finiteNumber(simulation?.summary.total_length_km)
    ?? finiteNumber(layout?.totalLengthKm)
    ?? finalPlanLength
    ?? finiteNumber(legacy?.totalLength)
  const capacity = finiteNumber(simulation?.summary.system_capacity_tbps)
    ?? finiteNumber(legacy?.systemCapacityTbps)
  const amplifierCount = finiteNumber(layout?.amplifierCount)
    ?? finiteNumber(finalPlacement?.total_edfa_count)
    ?? finiteNumber(legacy?.systemConfig?.amplifierCount)
  const buCount = finiteNumber(finalPlacement?.total_bu_count)
    ?? finiteNumber(legacy?.systemConfig?.buCount)
  const averageSpan = finiteNumber(layout?.spanKmUsed)
    ?? finiteNumber(planning?.user_decision?.selected_span_km)
    ?? finiteNumber(planning?.sweep_results.recommended_span_km)
    ?? finiteNumber(legacy?.systemConfig?.avgSpanLength)
  const channelCount = finiteNumber(simulation?.channels.count)
    ?? finiteNumber(settingsStore.platformPlanConfigSnapshot?.channelConfig?.channelCount)
    ?? finiteNumber(legacy?.systemConfig?.channelCount)
    ?? finiteNumber(settingsStore.systemPlanningConfig.wdmParams.channelCount)
  const modulation = settingsStore.platformPlanConfigSnapshot?.channelConfig?.modulationFormat
    || legacy?.systemConfig?.modulation
    || settingsStore.systemPlanningConfig.wdmParams.modulation
    || undefined
  const fromStation = simulation?.route_ref.from_station || planning?.route_ref.from_station
  const toStation = simulation?.route_ref.to_station || planning?.route_ref.to_station
  const cacheLinkName = fromStation && toStation ? `${fromStation} ⇄ ${toStation}` : ''
  const linkName = cacheLinkName || legacy?.linkName || routeStore.selectedRoute?.name || '链路'
  const systemConfig = {
    ...(legacy?.systemConfig ?? {}),
    ...(amplifierCount != null ? { amplifierCount } : {}),
    ...(buCount != null ? { buCount } : {}),
    ...(averageSpan != null ? { avgSpanLength: averageSpan } : {}),
    ...(channelCount != null ? { channelCount } : {}),
    ...(modulation ? { modulation } : {}),
  }

  return {
    ...legacy,
    layoutOnly: restoredMetrics ? false : legacy?.layoutOnly ?? Boolean(layout || planning),
    linkName,
    ...(totalLength != null ? { totalLength } : {}),
    ...(capacity != null ? { systemCapacityTbps: capacity } : {}),
    ...(simulation?.timestamp || planning?.timestamp || legacy?.calculatedAt
      ? { calculatedAt: simulation?.timestamp || planning?.timestamp || legacy?.calculatedAt }
      : {}),
    ...(simulation ? { status: 'success' } : {}),
    ...(restoredMetrics ? { metrics: restoredMetrics } : {}),
    ...(Object.keys(systemConfig).length > 0 ? { systemConfig } : {}),
  }
})

watch(restoredPlanningSummary, summary => {
  linkCalcSummary.value = summary
  currentLinkName.value = summary?.linkName || routeStore.selectedRoute?.name || ''
}, { immediate: true })

// 设备统计（优先使用计算结果，否则从接线元统计）
const deviceStats = computed(() => {
  const systemConfig = linkCalcSummary.value?.systemConfig
  return {
    amplifierCount: systemConfig?.amplifierCount
      ?? routeConnectorElements.value.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w').length,
    buCount: systemConfig?.buCount ?? routeConnectorElements.value.filter(e => e.type === 'bu').length,
    equalizerCount: systemConfig?.equalizerCount ?? routeConnectorElements.value.filter(e => e.type === 'equalizer').length,
    avgSpanLength: systemConfig?.avgSpanLength ?? 0,
    channelCount: systemConfig?.channelCount ?? 0,
    modulation: systemConfig?.modulation ?? '-',
    totalBuLoss: systemConfig?.totalBuLoss ?? 0,
    totalEqualizerLoss: systemConfig?.totalEqualizerLoss ?? 0,
  }
})

const designOverview = computed(() => {
  const totalLength = linkCalcSummary.value?.totalLength
    ?? rplStore.currentTable?.metadata?.totalLength
    ?? routeStore.selectedRoute?.totalLength
    ?? null
  const totalCost = !linkCalcSummary.value?.layoutOnly
    && Number.isFinite(linkCalcSummary.value?.costData?.totalCost)
    ? linkCalcSummary.value?.costData?.totalCost ?? null
    : null
  const capacity = Number.isFinite(linkCalcSummary.value?.systemCapacityTbps)
    ? linkCalcSummary.value?.systemCapacityTbps ?? null
    : null

  if (!linkCalcSummary.value && routeConnectorElements.value.length === 0 && !totalLength) return null
  return {
    totalLength,
    amplifierCount: deviceStats.value.amplifierCount,
    capacity,
    totalCost,
  }
})

// 设备编辑弹框
const showDeviceEditDialog = ref(false)
const editingDevice = ref<any>(null)

// BU 配置弹框
const showBuConfigDialog = ref(false)
const editingBuId = ref<string | null>(null)

const deviceTypeOptions = computed(() => dictionaryStore.getOptions(PLATFORM_DICTIONARY_TYPES.deviceType))

// 切换平台类型时保留兼容的内部子类型和用户自定义名称。
watch(() => editingDevice.value?.deviceTypeCd, (newType, oldType) => {
  if (editingDevice.value && newType && newType !== oldType) {
    editingDevice.value.type = getConnectorTypeForDeviceTypeCode(newType, editingDevice.value.type)
    const dictionary = dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, newType)
    const previousDictionary = oldType
      ? dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, oldType)
      : null
    const currentName = String(editingDevice.value.name ?? '').trim()
    if (dictionary?.name && (!currentName || currentName === previousDictionary?.name)) {
      editingDevice.value.name = dictionary.name
    }
  }
})

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
    const currentRoute = routeStore.selectedRoute
    connectorStore.createTable(
      currentRoute?.name ? `${currentRoute.name}_接线元表` : '默认接线元表',
      routeStore.currentRouteId || undefined
    )
  }
  showConnectorCoordinatePicker.value = false
  connectorPickedCoordinate.value = null
  editConnectorId.value = null
  showConnectorDialog.value = true
}

// 打开接线元编辑弹框
const openConnectorEdit = (id: string) => {
  showConnectorCoordinatePicker.value = false
  connectorPickedCoordinate.value = null
  editConnectorId.value = id
  showConnectorDialog.value = true
}

const closeConnectorDialog = () => {
  showConnectorDialog.value = false
  showConnectorCoordinatePicker.value = false
}

const startConnectorCoordinatePick = () => {
  showConnectorCoordinatePicker.value = true
}

const cancelConnectorCoordinatePick = () => {
  showConnectorCoordinatePicker.value = false
}

const handleConnectorCoordinatePicked = (coordinate: { longitude: number; latitude: number }) => {
  connectorPickedCoordinate.value = { ...coordinate }
  showConnectorCoordinatePicker.value = false
}

// 地图拖拽仅更新人工选择的经纬度，不在前端计算 KP、Span 或光学性能。
const handleAmplifierMoved = (data: { id: string; longitude: number; latitude: number }) => {
  const success = connectorStore.updateElement(data.id, {
    longitude: data.longitude,
    latitude: data.latitude
  })
  
  if (!success) {
    appStore.showNotification({ type: 'warning', message: '未找到对应放大器，无法更新' })
    return
  }

  const device = connectorStore.elements.find(e => e.id === data.id)
  const deviceName = device?.name || data.id
  appStore.showNotification({
    type: 'success',
    message: `${deviceName} 的经纬度已更新`,
  })
  appStore.addLog('INFO', `手工调整放大器坐标: ${deviceName}`)
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

// 提交参数并计算 - 打开系统规划链路配置对话框
const handleSubmit = () => {
  showLinkConfigDialog.value = true
}

// 只缓存对话框已经解析出的后端结果，不据此创建或改写项目设备。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleLinkConfigApplyResult = (payload: Record<string, any>) => {
  const result = payload.calculationResult && typeof payload.calculationResult === 'object'
    ? payload.calculationResult
    : null
  const layout = payload.layoutResult && typeof payload.layoutResult === 'object'
    ? payload.layoutResult
    : null
  currentLinkName.value = result?.linkName || routeStore.selectedRoute?.name || '链路'
  const totalLength = Number.isFinite(result?.totalLength)
    ? Number(result.totalLength)
    : Number.isFinite(layout?.totalLengthKm)
      ? Number(layout.totalLengthKm)
      : null
  const systemCapacityTbps = Number.isFinite(result?.systemCapacityTbps)
    ? Number(result.systemCapacityTbps)
    : null
  const summary = {
    layoutOnly: !result && Boolean(layout),
    linkName: currentLinkName.value,
    ...(totalLength != null ? { totalLength } : {}),
    ...(systemCapacityTbps != null ? { systemCapacityTbps } : {}),
    ...(result?.calculatedAt ? { calculatedAt: result.calculatedAt } : {}),
    ...(result?.status ? { status: result.status } : {}),
    ...(result?.metrics ? { metrics: result.metrics } : {}),
    ...(result?.systemConfig ? { systemConfig: result.systemConfig } : {}),
    ...(result?.margin ? { margin: result.margin } : {}),
    ...(result?.costData ? { costData: result.costData } : {}),
  }
  linkCalcSummary.value = summary
  settingsStore.updateLinkCalcSummaryCache(summary)
  appStore.showNotification({
    type: 'success',
    message: '后端系统规划结果已保留',
  })
}

// 平台成本响应当前没有币种字段；沿用系统规划既有的 USD 口径，不做汇率换算。
const SYSTEM_PLANNING_COST_CURRENCY = 'USD'

const formatCost = (cost: number) => {
  if (!Number.isFinite(cost)) return '-'
  if (cost >= 1000000) return `${SYSTEM_PLANNING_COST_CURRENCY} ${(cost / 1000000).toFixed(2)}M`
  if (cost >= 1000) return `${SYSTEM_PLANNING_COST_CURRENCY} ${(cost / 1000).toFixed(0)}K`
  return `${SYSTEM_PLANNING_COST_CURRENCY} ${cost.toFixed(0)}`
}

const formatRouteCost = (costInThousands: number) =>
  Number.isFinite(costInThousands) ? `CNY ${costInThousands.toFixed(0)}K` : '-'

// 地图组件引用
const systemDesignMapRef = ref<InstanceType<typeof SystemDesignMap> | null>(null)

// 选中的节点
const selectedPointId = ref<string | null>(null)

// 路由节点数据 - 使用 connectorStore 数据
const routePoints = computed(() => connectorStore.elements)

// 点击节点
const handlePointClick = (pointId: string) => {
  selectedPointId.value = pointId
}

// 双击 BU 节点打开配置对话框
const handleBuDblclick = (buId: string) => {
  editingBuId.value = buId
  showBuConfigDialog.value = true
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
      const inferredDeviceTypeCd = getDeviceTypeCodeForConnectorType(point.type)
      const availableInferredType = inferredDeviceTypeCd
        && dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, inferredDeviceTypeCd)
        ? inferredDeviceTypeCd
        : ''
      editingDevice.value = {
        ...point,
        deviceTypeCd: point.deviceTypeCd || availableInferredType,
      }
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
  if (
    editingDevice.value.deviceTypeCd &&
    !dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, editingDevice.value.deviceTypeCd)
  ) {
    appStore.showNotification({
      type: 'warning',
      message: `DEVICE_TYPE 字典中不存在器件类型 ${editingDevice.value.deviceTypeCd}`,
    })
    return
  }

  const success = connectorStore.updateElement(editingDevice.value.id, {
    name: editingDevice.value.name,
    longitude: editingDevice.value.longitude,
    latitude: editingDevice.value.latitude,
    kp: editingDevice.value.kp,
    depth: editingDevice.value.depth,
    type: editingDevice.value.type,
    deviceTypeCd: editingDevice.value.deviceTypeCd,
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
          <div v-if="linkCalcSummary?.costData && !linkCalcSummary.layoutOnly" class="space-y-2">
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
              <div v-if="linkCalcSummary.costData.equalizerCost > 0" class="flex justify-between px-3 py-1.5 text-xs hover:bg-gray-50">
                <span class="text-gray-600">均衡器</span>
                <span class="font-mono font-medium">{{ formatCost(linkCalcSummary.costData.equalizerCost) }}</span>
              </div>
            </div>
            <!-- 成本构成条 -->
            <div v-if="linkCalcSummary.costData.totalCost > 0" class="space-y-1">
              <div class="text-[10px] text-gray-400">成本构成</div>
              <div class="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                <div class="h-full bg-blue-500" :style="{ width: (linkCalcSummary.costData.cableCost / linkCalcSummary.costData.totalCost * 100) + '%' }" />
                <div class="h-full bg-purple-500" :style="{ width: (linkCalcSummary.costData.amplifierCost / linkCalcSummary.costData.totalCost * 100) + '%' }" />
                <div class="h-full bg-green-500" :style="{ width: (linkCalcSummary.costData.buCost / linkCalcSummary.costData.totalCost * 100) + '%' }" />
                <div class="h-full bg-amber-500" :style="{ width: (linkCalcSummary.costData.equalizerCost / linkCalcSummary.costData.totalCost * 100) + '%' }" />
              </div>
              <div class="flex gap-3 text-[10px] text-gray-400">
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500" />海缆</span>
                <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-purple-500" />放大器</span>
                <span v-if="linkCalcSummary.costData.buCost > 0" class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500" />BU</span>
                <span v-if="linkCalcSummary.costData.equalizerCost > 0" class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500" />EQ</span>
              </div>
            </div>
          </div>
          <!-- 仅有海缆分段数据（尚未做系统规划仿真时）-->
          <div v-else-if="cableSegmentStore.summary" class="space-y-2">
            <div class="p-2.5 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
              <div class="text-[10px] text-blue-600 mb-0.5">海缆分段成本（路由规划）</div>
              <div class="text-lg font-bold text-blue-800">{{ formatRouteCost(cableSegmentStore.summary.totalCost) }}</div>
            </div>
            <div class="divide-y rounded border text-xs overflow-hidden">
              <div v-if="cableSegmentStore.summary.highRiskLength > 0" class="flex justify-between px-2 py-1 bg-red-50">
                <span class="text-red-700">{{ getRiskArmorLabel('high') }} {{ cableSegmentStore.summary.highRiskSegments }}段 {{ cableSegmentStore.summary.highRiskLength.toFixed(1) }}km</span>
                <span class="font-mono text-red-700">{{ formatRouteCost(cableSegmentStore.summary.highRiskCost) }}</span>
              </div>
              <div v-if="cableSegmentStore.summary.mediumRiskLength > 0" class="flex justify-between px-2 py-1 bg-amber-50">
                <span class="text-amber-700">{{ getRiskArmorLabel('medium') }} {{ cableSegmentStore.summary.mediumRiskSegments }}段 {{ cableSegmentStore.summary.mediumRiskLength.toFixed(1) }}km</span>
                <span class="font-mono text-amber-700">{{ formatRouteCost(cableSegmentStore.summary.mediumRiskCost) }}</span>
              </div>
              <div v-if="cableSegmentStore.summary.lowRiskLength > 0" class="flex justify-between px-2 py-1 bg-green-50">
                <span class="text-green-700">{{ getRiskArmorLabel('low') }} {{ cableSegmentStore.summary.lowRiskSegments }}段 {{ cableSegmentStore.summary.lowRiskLength.toFixed(1) }}km</span>
                <span class="font-mono text-green-700">{{ formatRouteCost(cableSegmentStore.summary.lowRiskCost) }}</span>
              </div>
            </div>
            <div class="text-[10px] text-gray-400 text-center">完成系统规划后将显示完整成本</div>
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
      <!-- 中间区域：后端规划结果与手工设备布局 -->
      <Card class="flex-1 flex flex-col">
        <CardHeader class="flex-shrink-0 bg-gray-50/50 border-b">
          <div class="flex items-center justify-between w-full">
            <span class="font-semibold text-sm flex items-center gap-2 text-gray-700">
              <Calculator class="w-4 h-4" />
              系统布局图
            </span>
          </div>
        </CardHeader>
        <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
          <div class="flex-1 min-h-[300px]">
            <SystemDesignMap
              ref="systemDesignMapRef"
              :route-points="routePoints"
              :selected-point-id="selectedPointId"
              :draggable-amplifiers="hasDraggableAmplifiers"
              @point-click="handlePointClick"
              @bu-dblclick="handleBuDblclick"
              @edit="handleEdit"
              @delete="handleDelete"
              @amplifier-moved="handleAmplifierMoved"
            />
          </div>

          <!-- 只读概览：仅展示后端摘要或已保存接线元数据 -->
          <div v-if="designOverview" class="grid grid-cols-4 border-t border-gray-200">
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designOverview.totalLength != null ? designOverview.totalLength.toLocaleString() : '—' }}</div>
              <div class="text-[10px] text-gray-500">总长度 (km)</div>
            </div>
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designOverview.amplifierCount }}</div>
              <div class="text-[10px] text-gray-500">放大器数</div>
            </div>
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designOverview.capacity != null ? designOverview.capacity : '—' }}</div>
              <div class="text-[10px] text-gray-500">容量 (Tbps)</div>
            </div>
            <div class="p-3 text-center bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designOverview.totalCost != null ? formatCost(designOverview.totalCost) : '—' }}</div>
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
                <div v-if="deviceStats.totalBuLoss > 0" class="text-[10px] text-blue-500 mt-0.5">总损耗 {{ deviceStats.totalBuLoss.toFixed(1) }} dB</div>
              </div>
            </div>

            <!-- WDM 配置摘要 -->
            <div v-if="deviceStats.channelCount > 0" class="flex gap-3 px-1 text-[10px] text-gray-500">
              <span>{{ deviceStats.channelCount }} 波道</span>
              <span>{{ deviceStats.modulation }}</span>
              <span v-if="linkCalcSummary.systemCapacityTbps != null">
                {{ linkCalcSummary.systemCapacityTbps.toFixed(3) }} Tbps
              </span>
            </div>

            <div v-if="linkCalcSummary.layoutOnly" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              当前已应用平台布局结果；OSNR、GSNR、裕量和成本需要等待物理仿真指标返回后展示。
            </div>

            <!-- OSNR 指标 -->
            <div v-if="!linkCalcSummary.layoutOnly && linkCalcSummary.metrics" class="border rounded-lg overflow-hidden">
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
            <div v-if="!linkCalcSummary.layoutOnly && linkCalcSummary.metrics" class="border rounded-lg overflow-hidden">
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
            <div v-if="!linkCalcSummary.layoutOnly && linkCalcSummary.margin" class="border rounded-lg p-3 space-y-2"
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
                <div v-if="linkCalcSummary.metrics?.qFactor?.avg && linkCalcSummary.metrics.qFactor.avg > 0" class="flex justify-between">
                  <span class="text-gray-500">Q 因子</span>
                  <span class="font-mono">{{ linkCalcSummary.metrics.qFactor.avg.toFixed(1) }} dB</span>
                </div>
              </div>
            </div>

            <div
              v-if="!linkCalcSummary.layoutOnly && !linkCalcSummary.metrics"
              class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-500"
            >
              后端未返回性能指标，前端不再生成 GSNR、OSNR 或裕量估算值。
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
    :visible="showConnectorDialog"
    :editId="editConnectorId"
    :picking-coordinate="showConnectorCoordinatePicker"
    :picked-coordinate="connectorPickedCoordinate"
    @pick-coordinate="startConnectorCoordinatePick"
    @cancel-pick-coordinate="cancelConnectorCoordinatePick"
    @close="closeConnectorDialog"
    @saved="closeConnectorDialog" />

  <Teleport to="body">
    <div v-if="showConnectorCoordinatePicker" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div class="flex h-[76vh] w-[920px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div class="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">选择经纬度</h3>
            <p class="mt-0.5 text-xs text-gray-500">在地图上点击接线元位置</p>
          </div>
          <button class="rounded p-1 hover:bg-gray-200" @click="cancelConnectorCoordinatePick">
            <X class="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div class="min-h-0 flex-1">
          <SystemDesignMap
            :route-points="routePoints"
            :selected-point-id="selectedPointId"
            :draggable-amplifiers="false"
            coordinate-picking
            @coordinate-picked="handleConnectorCoordinatePicked"
          />
        </div>
      </div>
    </div>
  </Teleport>

  <SimulationAnalysisDialog
    :visible="showSimulationAnalysisDialog"
    :link-calc-summary="linkCalcSummary"
    @close="showSimulationAnalysisDialog = false"
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
          <Select v-model="editingDevice.deviceTypeCd" :options="deviceTypeOptions" />
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
  <!-- BU 配置对话框 -->
  <BUConfigDialog
    :visible="showBuConfigDialog"
    :bu-id="editingBuId"
    @close="showBuConfigDialog = false"
    @save="showBuConfigDialog = false"
  />
</template>
