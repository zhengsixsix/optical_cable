﻿<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { useConnectorStore } from '@/stores/connector'
import { useSettingsStore } from '@/stores/settings'
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button, Select } from '@/shared/components/base'
import { X, FileText, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-vue-next'
import { useRouteStore } from '@/stores/route'
import { useRPLStore } from '@/stores/rpl'
import { reportExportService } from '@/services'
import { buildExportableRplTableSnapshot } from '@/services/RPLSyncService'

const props = defineProps<{
  visible: boolean
  mode: 'cost' | 'perf'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const routeStore = useRouteStore()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const rplStore = useRPLStore()
const connectorStore = useConnectorStore()
const cableSegmentStore = useCableSegmentStore()

const isGenerating = ref(false)
const exportFormat = ref<'txt' | 'json' | 'html' | 'csv'>('txt')

const formatOptions = [
  { value: 'txt', label: 'TXT 文本' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'csv', label: 'CSV' },
]

const title = computed(() => props.mode === 'cost' ? '成本分析报告' : '性能分析报告')
const projectName = computed(() =>
  appStore.currentProjectName ||
  routeStore.selectedRoute?.name ||
  rplStore.currentTable?.name ||
  '海底光缆传输系统',
)

const activeRouteId = computed(() => routeStore.currentRouteId || rplStore.currentTable?.routeId || null)
const activeRoute = computed(() =>
  routeStore.paretoRoutes.find(route => route.id === activeRouteId.value) ||
  routeStore.routes.find(route => route.id === activeRouteId.value) ||
  routeStore.selectedRoute ||
  null,
)

const linkCalcSummary = computed<Record<string, any> | null>(() => settingsStore.linkCalcSummaryCache || null)
const exportableTable = computed(() => {
  const currentTable = rplStore.currentTable
  if (!currentTable) return null

  return buildExportableRplTableSnapshot({
    baseTable: currentTable,
    route: activeRoute.value,
    connectorElements: connectorStore.getElementsForRoute(activeRouteId.value),
    cableSegments: cableSegmentStore.segments.filter(segment =>
      !activeRouteId.value || !segment.routeId || segment.routeId === activeRouteId.value,
    ),
  })
})

// 规划状态检查
const planningStatus = computed(() => {
  const hasRoute = Boolean(exportableTable.value?.records.length || activeRoute.value?.points.length)
  const hasTransmission = Boolean(linkCalcSummary.value)
  
  return {
    routePlanning: hasRoute,
    transmissionPlanning: hasTransmission,
    isComplete: hasRoute && hasTransmission,
  }
})

// 从 rplStore 动态获取总长度
const totalLength = computed(() =>
  exportableTable.value?.metadata?.totalLength ??
  activeRoute.value?.totalLength ??
  rplStore.currentTable?.metadata?.totalLength ??
  0,
)

const routeConnectorElements = computed(() =>
  connectorStore.getElementsForRoute(activeRouteId.value)
)

const amplifierCount = computed(() => {
  const plannedCount = linkCalcSummary.value?.systemConfig?.amplifierCount
  if (typeof plannedCount === 'number') return plannedCount

  const connectorCount = routeConnectorElements.value.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w').length
  return connectorCount > 0 ? connectorCount : (totalLength.value > 0 ? Math.ceil(totalLength.value / 80) : 0)
})

const branchingUnitCount = computed(() => {
  const plannedCount = linkCalcSummary.value?.systemConfig?.buCount
  return typeof plannedCount === 'number'
    ? plannedCount
    : routeConnectorElements.value.filter(e => e.type === 'bu').length
})

const equalizerCount = computed(() => {
  const plannedCount = linkCalcSummary.value?.systemConfig?.equalizerCount
  return typeof plannedCount === 'number'
    ? plannedCount
    : routeConnectorElements.value.filter(e => e.type === 'equalizer').length
})

const landingStationCount = computed(() => exportableTable.value?.metadata?.landingStations || 2)
const summarizedCostData = computed<Record<string, any> | null>(() => linkCalcSummary.value?.costData || null)

// 报告数据
const costReportData = computed(() => {
  if (summarizedCostData.value) {
    return {
      cableCost: summarizedCostData.value.cableCost || 0,
      repeaterCost: summarizedCostData.value.amplifierCost || 0,
      branchingUnitCost: summarizedCostData.value.buCost || 0,
      equalizerCost: summarizedCostData.value.equalizerCost || 0,
      terminalEquipmentCost: 0,
      laborCost: 0,
      surveyingCost: 0,
      vesselCost: 0,
      installationCost: 0,
    }
  }

  const length = totalLength.value
  const vesselDays = length > 0 ? Math.ceil(length / 50) : 0 // 估算：每天铺设50km
  const costFactors = settingsStore.costFactors
  const cableUnitCost = costFactors.cableCostPerKm || settingsStore.cableTypes[0]?.costPerKm || 15000
  const repeaterUnitCost = costFactors.repeaterCost || settingsStore.repeaterTypes[0]?.cost || 500000
  const branchingUnitUnitCost = costFactors.branchingUnitCost || 0
  const equalizerUnitCost = costFactors.equalizerCost || 0
  const landingStationUnitCost = costFactors.landingStationCost || 0
  const installationCostPerKm = costFactors.installationCostPerKm || 0
  
  return {
    cableCost: planningStatus.value.routePlanning ? length * cableUnitCost : 0,
    repeaterCost: planningStatus.value.transmissionPlanning ? amplifierCount.value * repeaterUnitCost : 0,
    branchingUnitCost: planningStatus.value.transmissionPlanning ? branchingUnitCount.value * branchingUnitUnitCost : 0,
    equalizerCost: planningStatus.value.transmissionPlanning ? equalizerCount.value * equalizerUnitCost : 0,
    terminalEquipmentCost: planningStatus.value.routePlanning ? landingStationCount.value * landingStationUnitCost : 0,
    laborCost: planningStatus.value.routePlanning ? length * settingsStore.costFactors.laborCostPerKm : 0,
    surveyingCost: planningStatus.value.routePlanning ? length * settingsStore.costFactors.surveyingCostPerKm : 0,
    vesselCost: planningStatus.value.routePlanning ? vesselDays * settingsStore.costFactors.vesselCostPerDay : 0,
    installationCost: planningStatus.value.routePlanning ? length * installationCostPerKm : 0,
  }
})

const perfReportData = computed(() => {
  if (linkCalcSummary.value) {
    return {
      gsnr: linkCalcSummary.value.metrics?.gsnr?.min ?? linkCalcSummary.value.metrics?.gsnr?.avg ?? null,
      capacity: (linkCalcSummary.value.systemConfig?.channelCount || 0) * 100,
      wavelengths: linkCalcSummary.value.systemConfig?.channelCount ?? null,
      margin: linkCalcSummary.value.margin?.worstMargin ?? linkCalcSummary.value.margin?.avgMargin ?? null,
    }
  }

  if (!planningStatus.value.transmissionPlanning) {
    return {
      gsnr: null,
      capacity: null,
      wavelengths: null,
      margin: null,
    }
  }
  // 根据线路长度和配置估算性能指标
  const length = totalLength.value
  const estimatedGsnr = length > 0 ? Math.max(15, 30 - length / 100) : null // 简化估算
  const estimatedMargin = length > 0 ? Math.max(1, 5 - length / 500) : null
  
  return {
    gsnr: estimatedGsnr,
    capacity: settingsStore.transmissionConfig.channelCount * 100,
    wavelengths: settingsStore.transmissionConfig.channelCount,
    margin: estimatedMargin,
  }
})

const totalCost = computed(() => {
  if (summarizedCostData.value) {
    return summarizedCostData.value.totalCost || 0
  }

  const data = costReportData.value
  const subtotal = data.cableCost + data.repeaterCost + data.branchingUnitCost + data.equalizerCost + data.terminalEquipmentCost + data.laborCost + data.surveyingCost + data.vesselCost + data.installationCost
  const contingency = subtotal * (settingsStore.costFactors.contingencyPercent / 100)
  return subtotal + contingency
})

const formatCurrency = (value: number) => {
  if (value === 0) return '未计算'
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

const handleExport = async () => {
  isGenerating.value = true
  
  try {
    // 构建报告数据
    const length = totalLength.value
    const cable = settingsStore.cableTypes[0]
    const repeater = settingsStore.repeaterTypes[0]
    const repeaterCount = amplifierCount.value
    const summaryMetrics = linkCalcSummary.value?.metrics
    const summaryMargin = linkCalcSummary.value?.margin
    
    if (props.mode === 'cost') {
      // 成本报告
      await reportExportService.exportCostReport(
        {
          projectName: projectName.value,
          totalLength: length,
          repeaterCount,
          branchingUnitCount: branchingUnitCount.value,
          equalizerCount: equalizerCount.value,
          terminalEquipmentCount: landingStationCount.value,
          cableType: cable?.name || 'LW',
          repeaterType: repeater?.name || '标准',
          branchingUnitType: 'BU',
          equalizerType: 'EQ/F-ATT',
          terminalEquipmentType: 'Landing Station',
          repeaterSpacing: 80,
          costs: {
            cable: costReportData.value.cableCost,
            repeater: costReportData.value.repeaterCost,
            branchingUnit: costReportData.value.branchingUnitCost,
            equalizer: costReportData.value.equalizerCost,
            terminalEquipment: costReportData.value.terminalEquipmentCost,
            labor: costReportData.value.laborCost,
            surveying: costReportData.value.surveyingCost,
            vessel: costReportData.value.vesselCost,
            installation: costReportData.value.installationCost,
            contingency: summarizedCostData.value
              ? 0
              : totalCost.value - (costReportData.value.cableCost + costReportData.value.repeaterCost + costReportData.value.branchingUnitCost + costReportData.value.equalizerCost + costReportData.value.terminalEquipmentCost + costReportData.value.laborCost + costReportData.value.surveyingCost + costReportData.value.vesselCost + costReportData.value.installationCost),
            total: totalCost.value,
          },
        },
        exportFormat.value
      )
    } else {
      // 性能报告
      const estimatedGsnr = length > 0 ? Math.max(15, 30 - length / 100) : 0
      const estimatedMargin = length > 0 ? Math.max(1, 5 - length / 500) : 0
      
      await reportExportService.exportPerformanceReport(
        {
          projectName: projectName.value,
          totalLength: length,
          repeaterCount,
          channelCount: linkCalcSummary.value?.systemConfig?.channelCount || settingsStore.transmissionConfig.channelCount,
          centerWavelength: settingsStore.transmissionConfig.centerWavelength,
          performance: {
            minGSNR: summaryMetrics?.gsnr?.min ?? estimatedGsnr,
            avgGSNR: summaryMetrics?.gsnr?.avg ?? (estimatedGsnr + 2),
            maxGSNR: summaryMetrics?.gsnr?.max ?? (estimatedGsnr + 5),
            minMargin: summaryMargin?.worstMargin ?? estimatedMargin,
            capacity: perfReportData.value.capacity ?? settingsStore.transmissionConfig.channelCount * 100,
            wavelengths: perfReportData.value.wavelengths ?? settingsStore.transmissionConfig.channelCount,
          },
          bottlenecks: (summaryMargin?.worstMargin ?? estimatedMargin) < 3 ? [
            { kp: length * 0.6, issue: 'GSNR余量较低', severity: 'warning' }
          ] : [],
        },
        exportFormat.value
      )
    }
    
    appStore.showNotification({ type: 'success', message: `报告已导出 (${exportFormat.value.toUpperCase()})` })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: '报告导出失败' })
  } finally {
    isGenerating.value = false
  }
}

const generateReportContent = () => {
  const timestamp = new Date().toLocaleString('zh-CN')
  const status = planningStatus.value
  
  let content = `========================================\n`
  content += `${title.value}\n`
  content += `生成时间: ${timestamp}\n`
  content += `========================================\n\n`
  
  // 规划状态概览
  content += `【规划状态概览】\n`
  content += `- 路由规划: ${status.routePlanning ? '已完成' : '未完成'}\n`
  content += `- 传输系统规划: ${status.transmissionPlanning ? '已完成' : '未完成'}\n`
  
  if (!status.isComplete) {
    content += `\n⚠️ 提示: 部分规划尚未完成，相关数据可能缺失\n`
  }
  content += `\n`
  
  if (props.mode === 'cost') {
    const data = costReportData.value
    content += `【成本明细】\n`
    content += `- 海缆材料成本: ${formatCurrency(data.cableCost)}\n`
    content += `- 放大器设备成本: ${formatCurrency(data.repeaterCost)}\n`
    content += `- 分支器设备成本: ${formatCurrency(data.branchingUnitCost)}\n`
    content += `- 均衡器设备成本: ${formatCurrency(data.equalizerCost)}\n`
    content += `- 登陆站成本: ${formatCurrency(data.terminalEquipmentCost)}\n`
    content += `- 人工成本: ${formatCurrency(data.laborCost)}\n`
    content += `- 勘测成本: ${formatCurrency(data.surveyingCost)}\n`
    content += `- 船舶租赁成本: ${formatCurrency(data.vesselCost)}\n`
    content += `- 安装调试成本: ${formatCurrency(data.installationCost)}\n`
    content += `- 应急预算(${settingsStore.costFactors.contingencyPercent}%): ${formatCurrency(totalCost.value - (data.cableCost + data.repeaterCost + data.branchingUnitCost + data.equalizerCost + data.terminalEquipmentCost + data.laborCost + data.surveyingCost + data.vesselCost + data.installationCost))}\n`
    content += `----------------------------------------\n`
    content += `总计: ${formatCurrency(totalCost.value)}\n`
  } else {
    const data = perfReportData.value
    content += `【性能指标】\n`
    content += `- GSNR: ${data.gsnr !== null ? data.gsnr + ' dB' : '未计算'}\n`
    content += `- 系统容量: ${data.capacity !== null ? data.capacity + ' Gbps' : '未计算'}\n`
    content += `- 波道数量: ${data.wavelengths !== null ? data.wavelengths : '未计算'}\n`
    content += `- 系统余量: ${data.margin !== null ? data.margin + ' dB' : '未计算'}\n`
  }
  
  content += `\n========================================\n`
  content += `报告结束\n`
  
  return content
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[600px] max-h-[80vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <div class="flex items-center gap-3">
            <FileText class="w-5 h-5 text-blue-500" />
            <span class="font-semibold text-lg">{{ title }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-4 space-y-4">
          <!-- 规划状态提示 -->
          <div 
            :class="[
              'p-3 rounded-lg border flex items-start gap-3',
              planningStatus.isComplete 
                ? 'bg-green-50 border-green-200' 
                : 'bg-yellow-50 border-yellow-200'
            ]"
          >
            <component 
              :is="planningStatus.isComplete ? CheckCircle : AlertCircle" 
              :class="[
                'w-5 h-5 mt-0.5',
                planningStatus.isComplete ? 'text-green-600' : 'text-yellow-600'
              ]"
            />
            <div>
              <div :class="planningStatus.isComplete ? 'text-green-700 font-medium' : 'text-yellow-700 font-medium'">
                规划状态概览
              </div>
              <div class="text-sm mt-1 space-y-1">
                <div class="flex items-center gap-2">
                  <span :class="planningStatus.routePlanning ? 'text-green-600' : 'text-gray-400'">
                    {{ planningStatus.routePlanning ? '✓' : '○' }}
                  </span>
                  <span>路由规划</span>
                </div>
                <div class="flex items-center gap-2">
                  <span :class="planningStatus.transmissionPlanning ? 'text-green-600' : 'text-gray-400'">
                    {{ planningStatus.transmissionPlanning ? '✓' : '○' }}
                  </span>
                  <span>传输系统规划</span>
                </div>
              </div>
              <div v-if="!planningStatus.isComplete" class="text-xs text-yellow-600 mt-2">
                提示: 部分规划尚未完成，相关数据可能显示为"未计算"
              </div>
            </div>
          </div>
          
          <!-- 成本报告内容 -->
          <div v-if="mode === 'cost'" class="space-y-3">
            <h4 class="font-medium text-gray-700">成本明细</h4>
            <div class="bg-gray-50 rounded-lg p-4 space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">海缆材料成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.cableCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">放大器设备成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.repeaterCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">分支器设备成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.branchingUnitCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">均衡器设备成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.equalizerCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">登陆站成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.terminalEquipmentCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">人工成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.laborCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">勘测成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.surveyingCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">船舶租赁成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.vesselCost) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">安装调试成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.installationCost) }}</span>
              </div>
              <div class="border-t pt-2 mt-2 flex justify-between text-sm font-semibold">
                <span>总计 (含{{ settingsStore.costFactors.contingencyPercent }}%应急预算)</span>
                <span class="text-blue-600">{{ formatCurrency(totalCost) }}</span>
              </div>
            </div>
          </div>
          
          <!-- 性能报告内容 -->
          <div v-if="mode === 'perf'" class="space-y-3">
            <h4 class="font-medium text-gray-700">性能指标</h4>
            <div class="bg-gray-50 rounded-lg p-4 space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">GSNR</span>
                <span class="font-medium">{{ perfReportData.gsnr !== null ? perfReportData.gsnr + ' dB' : '未计算' }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">系统容量</span>
                <span class="font-medium">{{ perfReportData.capacity !== null ? perfReportData.capacity + ' Gbps' : '未计算' }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">波道数量</span>
                <span class="font-medium">{{ perfReportData.wavelengths !== null ? perfReportData.wavelengths : '未计算' }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600">系统余量</span>
                <span class="font-medium">{{ perfReportData.margin !== null ? perfReportData.margin + ' dB' : '未计算' }}</span>
              </div>
            </div>
          </div>
        </CardContent>
        
        <!-- 底部按钮 -->
        <div class="p-4 border-t flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">导出格式:</span>
            <Select v-model="exportFormat" :options="formatOptions" class="w-28" />
          </div>
          <div class="flex gap-2">
            <Button variant="outline" @click="emit('close')">取消</Button>
            <Button @click="handleExport" :disabled="isGenerating">
              <Loader2 v-if="isGenerating" class="w-4 h-4 mr-1 animate-spin" />
              <Download v-else class="w-4 h-4 mr-1" />
              {{ isGenerating ? '生成中...' : '导出报告' }}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
