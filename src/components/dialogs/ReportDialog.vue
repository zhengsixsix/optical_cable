<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertCircle, CheckCircle, Download, FileText, Loader2, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useRouteStore } from '@/stores/route'
import { useRPLStore } from '@/stores/rpl'
import { useSettingsStore } from '@/stores/settings'
import { Button, Card, CardContent, CardHeader, Select } from '@/shared/components/base'
import {
  reportExportService,
  type BackendCostData,
  type BackendCostItem,
} from '@/services/ReportExportService'

const props = defineProps<{
  visible: boolean
  mode: 'cost' | 'perf'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()
const routeStore = useRouteStore()
const rplStore = useRPLStore()
const settingsStore = useSettingsStore()

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
  appStore.currentProjectName
  || routeStore.selectedRoute?.name
  || rplStore.currentTable?.name
  || '海底光缆传输系统',
)

const summary = computed<Record<string, any> | null>(() => settingsStore.linkCalcSummaryCache || null)
const finiteOrNull = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(number) ? number : null
}

const totalLength = computed(() =>
  finiteOrNull(summary.value?.totalLength)
  ?? finiteOrNull(routeStore.selectedRoute?.totalLength)
  ?? finiteOrNull(rplStore.currentTable?.metadata?.totalLength),
)

const costData = computed<BackendCostData | null>(() => {
  const value = summary.value?.costData
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as BackendCostData
    : null
})

const aggregateCostRows = computed(() => {
  const data = costData.value
  if (!data) return []
  return [
    { label: '海缆成本', value: finiteOrNull(data.cableCost) },
    { label: '放大器成本', value: finiteOrNull(data.amplifierCost) },
    { label: 'BU 成本', value: finiteOrNull(data.buCost) },
    { label: '均衡器成本', value: finiteOrNull(data.equalizerCost) },
  ].filter(row => row.value != null)
})

const costItems = computed<BackendCostItem[]>(() =>
  Array.isArray(costData.value?.costItems) ? costData.value.costItems : [],
)
const totalCost = computed(() => finiteOrNull(costData.value?.totalCost))

const metrics = computed(() => summary.value?.metrics && typeof summary.value.metrics === 'object'
  ? summary.value.metrics
  : null)
const margin = computed(() => summary.value?.margin && typeof summary.value.margin === 'object'
  ? summary.value.margin
  : null)
const systemConfig = computed(() => summary.value?.systemConfig && typeof summary.value.systemConfig === 'object'
  ? summary.value.systemConfig
  : null)
const systemCapacityTbps = computed(() => finiteOrNull(summary.value?.systemCapacityTbps))

const performanceRows = computed(() => [
  { label: '最小 GSNR', value: finiteOrNull(metrics.value?.gsnr?.min), unit: 'dB' },
  { label: '平均 GSNR', value: finiteOrNull(metrics.value?.gsnr?.avg), unit: 'dB' },
  { label: '最小 OSNR', value: finiteOrNull(metrics.value?.osnr?.min), unit: 'dB' },
  { label: '平均 OSNR', value: finiteOrNull(metrics.value?.osnr?.avg), unit: 'dB' },
  { label: '系统容量', value: systemCapacityTbps.value, unit: 'Tbps' },
  { label: '信道数量', value: finiteOrNull(systemConfig.value?.channelCount), unit: '' },
  { label: '最差裕量', value: finiteOrNull(margin.value?.worstMargin), unit: 'dB' },
  { label: '平均裕量', value: finiteOrNull(margin.value?.avgMargin), unit: 'dB' },
].filter(row => row.value != null))

const backendVerdict = computed(() => {
  const value = margin.value?.meetsRequirement
  return typeof value === 'boolean' ? (value ? '满足' : '不满足') : null
})

const hasReportData = computed(() => props.mode === 'cost'
  ? Boolean(costData.value)
  : performanceRows.value.length > 0 || backendVerdict.value != null)

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '未提供'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

const formatValue = (value: number | null, unit: string) =>
  value == null ? '未提供' : `${value}${unit ? ` ${unit}` : ''}`

const handleExport = async () => {
  if (!hasReportData.value) {
    appStore.showNotification({ type: 'warning', message: '后端尚未返回可导出的报告数据' })
    return
  }

  isGenerating.value = true
  try {
    if (props.mode === 'cost' && costData.value) {
      reportExportService.exportCostReport({
        projectName: projectName.value,
        totalLength: totalLength.value,
        calculatedAt: summary.value?.calculatedAt,
        costData: costData.value,
      }, exportFormat.value)
    } else {
      reportExportService.exportPerformanceReport({
        projectName: projectName.value,
        totalLength: totalLength.value,
        calculatedAt: summary.value?.calculatedAt,
        status: summary.value?.status,
        systemCapacityTbps: systemCapacityTbps.value,
        metrics: metrics.value,
        margin: margin.value,
        systemConfig: systemConfig.value,
      }, exportFormat.value)
    }
    appStore.showNotification({ type: 'success', message: `报告已导出 (${exportFormat.value.toUpperCase()})` })
  } catch {
    appStore.showNotification({ type: 'error', message: '报告导出失败' })
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      @click.self="emit('close')"
    >
      <Card class="flex max-h-[80vh] w-[600px] max-w-full flex-col bg-white shadow-2xl">
        <CardHeader class="flex shrink-0 items-center justify-between border-b">
          <div class="flex items-center gap-3">
            <FileText class="h-5 w-5 text-blue-500" />
            <span class="text-lg font-semibold">{{ title }}</span>
          </div>
          <Button variant="ghost" size="sm" title="关闭" @click="emit('close')">
            <X class="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent class="flex-1 space-y-4 overflow-auto p-4">
          <div
            class="flex items-start gap-3 border p-3"
            :class="hasReportData ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'"
          >
            <CheckCircle v-if="hasReportData" class="mt-0.5 h-5 w-5 text-green-600" />
            <AlertCircle v-else class="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <div class="font-medium" :class="hasReportData ? 'text-green-700' : 'text-amber-700'">
                {{ hasReportData ? '已加载后端报告数据' : '后端未返回报告数据' }}
              </div>
              <div class="mt-1 text-xs text-gray-600">
                缺失字段保持“未提供”，报告不会在前端补算。
              </div>
            </div>
          </div>

          <section v-if="mode === 'cost'" class="space-y-3">
            <h4 class="font-medium text-gray-700">成本明细</h4>
            <div v-if="costData" class="space-y-2 border border-gray-200 bg-gray-50 p-4">
              <template v-if="costItems.length > 0">
                <div v-for="(item, index) in costItems" :key="`${item.category || 'item'}-${index}`" class="flex justify-between gap-3 text-sm">
                  <span class="text-gray-600">{{ [item.category, item.model].filter(Boolean).join(' / ') || `成本项 ${index + 1}` }}</span>
                  <span class="font-medium">{{ formatCurrency(item.subtotal) }}</span>
                </div>
              </template>
              <template v-else>
                <div v-for="row in aggregateCostRows" :key="row.label" class="flex justify-between gap-3 text-sm">
                  <span class="text-gray-600">{{ row.label }}</span>
                  <span class="font-medium">{{ formatCurrency(row.value) }}</span>
                </div>
              </template>
              <div class="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
                <span>总计</span>
                <span class="text-blue-600">{{ formatCurrency(totalCost) }}</span>
              </div>
            </div>
            <div v-else class="border border-gray-200 p-6 text-center text-sm text-gray-500">未提供</div>
          </section>

          <section v-else class="space-y-3">
            <h4 class="font-medium text-gray-700">性能指标</h4>
            <div v-if="performanceRows.length > 0 || backendVerdict" class="space-y-2 border border-gray-200 bg-gray-50 p-4">
              <div v-for="row in performanceRows" :key="row.label" class="flex justify-between gap-3 text-sm">
                <span class="text-gray-600">{{ row.label }}</span>
                <span class="font-medium">{{ formatValue(row.value, row.unit) }}</span>
              </div>
              <div v-if="backendVerdict" class="flex justify-between gap-3 text-sm">
                <span class="text-gray-600">后端裕量判定</span>
                <span class="font-medium">{{ backendVerdict }}</span>
              </div>
            </div>
            <div v-else class="border border-gray-200 p-6 text-center text-sm text-gray-500">未提供</div>
          </section>
        </CardContent>

        <div class="flex shrink-0 items-center justify-between border-t p-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">导出格式:</span>
            <Select v-model="exportFormat" :options="formatOptions" class="w-28" />
          </div>
          <div class="flex gap-2">
            <Button variant="outline" @click="emit('close')">取消</Button>
            <Button :disabled="isGenerating || !hasReportData" @click="handleExport">
              <Loader2 v-if="isGenerating" class="mr-1 h-4 w-4 animate-spin" />
              <Download v-else class="mr-1 h-4 w-4" />
              {{ isGenerating ? '生成中...' : '导出报告' }}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
