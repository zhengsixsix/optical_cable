<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, FileText, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-vue-next'
import { useRouteStore, useSettingsStore, useAppStore } from '@/stores'
import { mockReportData } from '@/data/mockData'

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

const isGenerating = ref(false)

const title = computed(() => props.mode === 'cost' ? '成本分析报告' : '性能分析报告')

// 规划状态检查
const planningStatus = computed(() => {
  const hasRoute = routeStore.routes.length > 0
  const hasTransmission = settingsStore.transmissionConfig.channelCount > 0
  
  return {
    routePlanning: hasRoute,
    transmissionPlanning: hasTransmission,
    isComplete: hasRoute && hasTransmission,
  }
})

// 报告数据
const costReportData = computed(() => {
  const cable = settingsStore.cableTypes[0]
  const repeater = settingsStore.repeaterTypes[0]
  const totalLength = mockReportData.totalLength
  const repeaterCount = Math.ceil(totalLength / 80)
  
  return {
    cableCost: planningStatus.value.routePlanning ? totalLength * (cable?.costPerKm || 15000) : 0,
    repeaterCost: planningStatus.value.transmissionPlanning ? repeaterCount * (repeater?.cost || 500000) : 0,
    laborCost: planningStatus.value.routePlanning ? totalLength * settingsStore.costFactors.laborCostPerKm : 0,
    surveyingCost: planningStatus.value.routePlanning ? totalLength * settingsStore.costFactors.surveyingCostPerKm : 0,
    vesselCost: planningStatus.value.routePlanning ? mockReportData.vesselDays * settingsStore.costFactors.vesselCostPerDay : 0,
  }
})

const perfReportData = computed(() => {
  if (!planningStatus.value.transmissionPlanning) {
    return {
      gsnr: null,
      capacity: null,
      wavelengths: null,
      margin: null,
    }
  }
  return {
    gsnr: mockReportData.perfData.gsnr,
    capacity: settingsStore.transmissionConfig.channelCount * 100,
    wavelengths: settingsStore.transmissionConfig.channelCount,
    margin: mockReportData.perfData.margin,
  }
})

const totalCost = computed(() => {
  const data = costReportData.value
  const subtotal = data.cableCost + data.repeaterCost + data.laborCost + data.surveyingCost + data.vesselCost
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
  
  // 模拟生成报告
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  // 生成报告内容
  const reportContent = generateReportContent()
  
  // 下载文件
  const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.mode === 'cost' ? '成本分析报告' : '性能分析报告'}_${new Date().toISOString().split('T')[0]}.txt`
  a.click()
  URL.revokeObjectURL(url)
  
  isGenerating.value = false
  appStore.showNotification({ type: 'success', message: '报告已导出' })
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
    content += `- 中继器设备成本: ${formatCurrency(data.repeaterCost)}\n`
    content += `- 人工成本: ${formatCurrency(data.laborCost)}\n`
    content += `- 勘测成本: ${formatCurrency(data.surveyingCost)}\n`
    content += `- 船舶租赁成本: ${formatCurrency(data.vesselCost)}\n`
    content += `- 应急预算(${settingsStore.costFactors.contingencyPercent}%): ${formatCurrency(totalCost.value - (data.cableCost + data.repeaterCost + data.laborCost + data.surveyingCost + data.vesselCost))}\n`
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
                <span class="text-gray-600">中继器设备成本</span>
                <span class="font-medium">{{ formatCurrency(costReportData.repeaterCost) }}</span>
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
        <div class="p-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" @click="emit('close')">取消</Button>
          <Button @click="handleExport" :disabled="isGenerating">
            <Loader2 v-if="isGenerating" class="w-4 h-4 mr-1 animate-spin" />
            <Download v-else class="w-4 h-4 mr-1" />
            {{ isGenerating ? '生成中...' : '导出报告' }}
          </Button>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
