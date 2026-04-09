﻿<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
import { X, FileText, Download, CheckCircle, Loader2 } from 'lucide-vue-next'
import { useAppStore, useSettingsStore, useRPLStore, useRouteStore, useConnectorStore } from '@/stores'
import { reportExportService, type ReportFormat } from '@/services/ReportExportService'

const props = defineProps<{
  visible: boolean
  type: 'cost' | 'performance'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const rplStore = useRPLStore()
const routeStore = useRouteStore()
const connectorStore = useConnectorStore()

// 状态
const isExporting = ref(false)
const selectedFormat = ref<ReportFormat>('txt')
const projectName = ref('海底光缆系统')

// 格式选项
const formatOptions = [
  { value: 'txt', label: '纯文本 (.txt)', description: '简洁易读的文本格式' },
  { value: 'json', label: 'JSON (.json)', description: '结构化数据，便于程序处理' },
  { value: 'html', label: 'HTML (.html)', description: '带样式的网页格式，可直接打印' },
  { value: 'csv', label: 'CSV (.csv)', description: '表格格式，可用Excel打开' },
]

// 对话框标题
const dialogTitle = computed(() => 
  props.type === 'cost' ? '导出成本分析报告' : '导出性能分析报告'
)

// 获取当前设计数据
const designData = computed(() => {
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  const routeId = routeStore.currentRouteId || rplStore.currentTable?.routeId || undefined
  const routeConnectorElements = connectorStore.getElementsForRoute(routeId)
  const repeaterSpacing = 80 // 默认放大器间距
  const repeaterCount = routeConnectorElements.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w').length || Math.ceil(totalLength / repeaterSpacing)
  const branchingUnitCount = routeConnectorElements.filter(e => e.type === 'bu').length
  const equalizerCount = routeConnectorElements.filter(e => e.type === 'equalizer').length
  const landingStationCount = rplStore.currentTable?.metadata?.landingStations || 2
  
  return {
    projectName: projectName.value,
    totalLength,
    repeaterCount,
    branchingUnitCount,
    equalizerCount,
    landingStationCount,
    channelCount: settingsStore.transmissionConfig.channelCount,
    centerWavelength: settingsStore.transmissionConfig.centerWavelength,
  }
})

// 执行导出
const doExport = async () => {
  isExporting.value = true
  
  try {
    if (props.type === 'cost') {
      // 导出成本报告
      reportExportService.exportCostReport({
        projectName: projectName.value,
        totalLength: designData.value.totalLength,
        repeaterCount: designData.value.repeaterCount,
        branchingUnitCount: designData.value.branchingUnitCount,
        equalizerCount: designData.value.equalizerCount,
        terminalEquipmentCount: designData.value.landingStationCount,
        cableType: 'G.654.E 大有效面积光纤',
        repeaterType: '标准放大器',
        branchingUnitType: 'BU',
        equalizerType: 'EQ/F-ATT',
        terminalEquipmentType: 'Landing Station',
        repeaterSpacing: 80,
        costs: {
          cable: designData.value.totalLength * (settingsStore.costFactors.cableCostPerKm || 25000),
          repeater: designData.value.repeaterCount * (settingsStore.costFactors.repeaterCost || 800000),
          branchingUnit: designData.value.branchingUnitCount * (settingsStore.costFactors.branchingUnitCost || 0),
          equalizer: designData.value.equalizerCount * (settingsStore.costFactors.equalizerCost || 0),
          terminalEquipment: designData.value.landingStationCount * (settingsStore.costFactors.landingStationCost || 0),
          labor: designData.value.totalLength * (settingsStore.costFactors.laborCostPerKm || 5000),
          surveying: designData.value.totalLength * (settingsStore.costFactors.surveyingCostPerKm || 2000),
          vessel: Math.ceil(designData.value.totalLength / 50) * (settingsStore.costFactors.vesselCostPerDay || 50000),
          installation: designData.value.totalLength * (settingsStore.costFactors.installationCostPerKm || 0),
          contingency:
            (
              designData.value.totalLength * (settingsStore.costFactors.cableCostPerKm || 25000) +
              designData.value.repeaterCount * (settingsStore.costFactors.repeaterCost || 800000) +
              designData.value.branchingUnitCount * (settingsStore.costFactors.branchingUnitCost || 0) +
              designData.value.equalizerCount * (settingsStore.costFactors.equalizerCost || 0) +
              designData.value.landingStationCount * (settingsStore.costFactors.landingStationCost || 0) +
              designData.value.totalLength * (settingsStore.costFactors.laborCostPerKm || 5000) +
              designData.value.totalLength * (settingsStore.costFactors.surveyingCostPerKm || 2000) +
              Math.ceil(designData.value.totalLength / 50) * (settingsStore.costFactors.vesselCostPerDay || 50000) +
              designData.value.totalLength * (settingsStore.costFactors.installationCostPerKm || 0)
            ) * ((settingsStore.costFactors.contingencyPercent || 15) / 100),
          total:
            designData.value.totalLength * (settingsStore.costFactors.cableCostPerKm || 25000) +
            designData.value.repeaterCount * (settingsStore.costFactors.repeaterCost || 800000) +
            designData.value.branchingUnitCount * (settingsStore.costFactors.branchingUnitCost || 0) +
            designData.value.equalizerCount * (settingsStore.costFactors.equalizerCost || 0) +
            designData.value.landingStationCount * (settingsStore.costFactors.landingStationCost || 0) +
            designData.value.totalLength * (settingsStore.costFactors.laborCostPerKm || 5000) +
            designData.value.totalLength * (settingsStore.costFactors.surveyingCostPerKm || 2000) +
            Math.ceil(designData.value.totalLength / 50) * (settingsStore.costFactors.vesselCostPerDay || 50000) +
            designData.value.totalLength * (settingsStore.costFactors.installationCostPerKm || 0) +
            (
              designData.value.totalLength * (settingsStore.costFactors.cableCostPerKm || 25000) +
              designData.value.repeaterCount * (settingsStore.costFactors.repeaterCost || 800000) +
              designData.value.branchingUnitCount * (settingsStore.costFactors.branchingUnitCost || 0) +
              designData.value.equalizerCount * (settingsStore.costFactors.equalizerCost || 0) +
              designData.value.landingStationCount * (settingsStore.costFactors.landingStationCost || 0) +
              designData.value.totalLength * (settingsStore.costFactors.laborCostPerKm || 5000) +
              designData.value.totalLength * (settingsStore.costFactors.surveyingCostPerKm || 2000) +
              Math.ceil(designData.value.totalLength / 50) * (settingsStore.costFactors.vesselCostPerDay || 50000) +
              designData.value.totalLength * (settingsStore.costFactors.installationCostPerKm || 0)
            ) * ((settingsStore.costFactors.contingencyPercent || 15) / 100)
        }
      }, selectedFormat.value)
    } else {
      // 导出性能报告
      reportExportService.exportPerformanceReport({
        projectName: projectName.value,
        totalLength: designData.value.totalLength,
        repeaterCount: designData.value.repeaterCount,
        channelCount: designData.value.channelCount,
        centerWavelength: designData.value.centerWavelength,
        performance: {
          minGSNR: 18.5,
          avgGSNR: 22.3,
          maxGSNR: 25.8,
          minMargin: 4.2,
          capacity: designData.value.channelCount * 0.4,
          wavelengths: designData.value.channelCount
        }
      }, selectedFormat.value)
    }
    
    appStore.showNotification({ 
      type: 'success', 
      message: `${props.type === 'cost' ? '成本' : '性能'}报告已导出` 
    })
    emit('close')
  } catch (error) {
    appStore.showNotification({ 
      type: 'error', 
      message: `导出失败: ${(error as Error).message}` 
    })
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[500px] max-h-[80vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <div class="flex items-center gap-3">
            <FileText :class="type === 'cost' ? 'text-green-500' : 'text-purple-500'" class="w-5 h-5" />
            <span class="font-semibold text-lg">{{ dialogTitle }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-4 space-y-4">
          <!-- 项目名称 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
            <input 
              v-model="projectName"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="输入项目名称"
            />
          </div>
          
          <!-- 数据概览 -->
          <div class="bg-gray-50 rounded-lg p-3 space-y-2">
            <div class="text-sm font-medium text-gray-600">数据概览</div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="flex justify-between">
                <span class="text-gray-500">总长度:</span>
                <span class="font-medium">{{ designData.totalLength.toLocaleString() }} km</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">放大器数:</span>
                <span class="font-medium">{{ designData.repeaterCount }}</span>
              </div>
              <div v-if="type === 'performance'" class="flex justify-between">
                <span class="text-gray-500">波道数:</span>
                <span class="font-medium">{{ designData.channelCount }}</span>
              </div>
              <div v-if="type === 'performance'" class="flex justify-between">
                <span class="text-gray-500">中心波长:</span>
                <span class="font-medium">{{ designData.centerWavelength }} nm</span>
              </div>
            </div>
          </div>
          
          <!-- 格式选择 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">导出格式</label>
            <div class="space-y-2">
              <label 
                v-for="opt in formatOptions" 
                :key="opt.value"
                class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="selectedFormat === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'"
              >
                <input 
                  v-model="selectedFormat" 
                  type="radio" 
                  :value="opt.value"
                  class="mt-0.5"
                />
                <div>
                  <div class="font-medium text-sm">{{ opt.label }}</div>
                  <div class="text-xs text-gray-500">{{ opt.description }}</div>
                </div>
              </label>
            </div>
          </div>
          
          <!-- 无数据提示 -->
          <div v-if="designData.totalLength === 0" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
            <strong>提示:</strong> 请先导入路由数据（RPL），以获取完整的报告数据。
          </div>
        </CardContent>
        
        <!-- 底部按钮 -->
        <div class="p-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" @click="emit('close')">取消</Button>
          <Button 
            @click="doExport" 
            :disabled="isExporting || designData.totalLength === 0"
            :class="type === 'cost' ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'"
          >
            <Loader2 v-if="isExporting" class="w-4 h-4 mr-1 animate-spin" />
            <Download v-else class="w-4 h-4 mr-1" />
            {{ isExporting ? '导出中...' : '导出报告' }}
          </Button>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
