<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Download,
  Radio,
  TrendingUp,
} from 'lucide-vue-next'

type ResultTab = 'overview' | 'performance' | 'amplifier' | 'cost'

interface MetricSummary {
  min: number
  max: number
  avg: number
}

interface ResultMetrics {
  osnr?: MetricSummary | null
  gsnr?: MetricSummary | null
  power?: MetricSummary | null
  nli?: MetricSummary | null
  qFactor?: MetricSummary | null
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

interface ResultAmplifier {
  id: string
  name: string
  position: number
  precedingSpan: number | null
  gain: number | null
  noiseFigure: number | null
  outputPower: number | null
  inputPower: number | null
  deviceModel?: string
  gainFlatness?: number | null
}

interface TimelineItem {
  id: string
  kind: 'start' | 'end' | 'amplifier' | 'bu'
  label: string
  positionKm: number
  icon: string
  amplifierIndex?: number
  detail?: string
}

interface CostItem {
  category: string
  model: string
  quantity: number | string
  unit: string
  unitPrice: number
  subtotal: number
}

interface ResultCostData {
  cableCost: number
  amplifierCost: number
  buCost: number
  equalizerCost: number
  totalCost: number
  costItems: CostItem[]
}

interface DisplayMetricRow {
  key: 'osnr' | 'gsnr' | 'power' | 'nli' | 'qFactor'
  label: string
  value: MetricSummary
}

interface BackendMargin {
  targetOsnr?: number
  worstMargin?: number
  avgMargin?: number
  meetsRequirement?: boolean
}

const props = withDefaults(defineProps<{
  linkName: string
  totalLength: number | null
  calculatedAt: string
  calculationTime: number
  status: 'success' | 'failed' | 'calculating' | 'unknown'
  metrics: ResultMetrics | null
  performanceData: ResultPerformanceData | null
  amplifiers: ResultAmplifier[]
  timeline: TimelineItem[]
  costData: ResultCostData | null
  capacityTbps?: number | null
  margin: BackendMargin | null
  spanUsed: number | null
  tailSpan: number | null
  averageSpan: number | null
  buCount: number | null
  totalBuLoss: number | null
  equalizerCount: number | null
  totalEqualizerLoss: number | null
  channelCount: number | null
  modulation: string
  optimizationTargetLabel: string
  hasPerformanceMetrics: boolean
}>(), {
  linkName: '-',
  totalLength: null,
  calculatedAt: '',
  calculationTime: 0,
  status: 'unknown',
  metrics: null,
  performanceData: null,
  amplifiers: () => [],
  timeline: () => [],
  costData: null,
  capacityTbps: null,
  margin: null,
  spanUsed: null,
  tailSpan: null,
  averageSpan: null,
  buCount: null,
  totalBuLoss: null,
  equalizerCount: null,
  totalEqualizerLoss: null,
  channelCount: null,
  modulation: '-',
  optimizationTargetLabel: '-',
  hasPerformanceMetrics: false,
})

const activeTab = ref<ResultTab>('overview')
const selectedAmplifierIndex = ref<number | null>(null)

watch(
  () => (Array.isArray(props.amplifiers) ? props.amplifiers.length : 0),
  count => {
    if (count === 0) {
      selectedAmplifierIndex.value = null
    } else if (selectedAmplifierIndex.value == null || selectedAmplifierIndex.value >= count) {
      selectedAmplifierIndex.value = 0
    }
  },
  { immediate: true },
)

const tabs = [
  { id: 'overview' as const, label: '概览', icon: Activity },
  { id: 'performance' as const, label: '性能曲线', icon: TrendingUp },
  { id: 'amplifier' as const, label: '放大器详情', icon: Radio },
  { id: 'cost' as const, label: '链路成本', icon: DollarSign },
]

const selectedAmplifier = computed(() => {
  const index = selectedAmplifierIndex.value
  const amplifiers = Array.isArray(props.amplifiers) ? props.amplifiers : []
  return index == null ? null : amplifiers[index] ?? null
})

const backendStatus = computed(() => {
  if (props.status === 'failed') return 'failed'
  if (props.status === 'calculating') return 'calculating'
  if (props.status === 'unknown') return 'unknown'
  if (props.margin?.meetsRequirement === false) return 'failed'
  return 'success'
})

const formatNumber = (value: number | null | undefined, digits = 1): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-'

const formatKm = (value: number | null | undefined, digits = 1): string => {
  const formatted = formatNumber(value, digits)
  return formatted === '-' ? '-' : `${formatted} km`
}

const formatCost = (value: number): string => {
  if (!Number.isFinite(value)) return '-'
  if (value >= 1_000_000) return `USD ${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `USD ${(value / 1_000).toFixed(0)}K`
  return `USD ${value.toFixed(0)}`
}

const displayMetricRows = computed<DisplayMetricRow[]>(() => {
  const fromLegacy: DisplayMetricRow[] = []
  const candidates: Array<[
    DisplayMetricRow['key'],
    string,
    MetricSummary | null | undefined,
  ]> = props.metrics
    ? [
        ['osnr', 'OSNR (dB)', props.metrics.osnr],
        ['gsnr', 'GSNR (dB)', props.metrics.gsnr],
        ['power', '功率 (dBm)', props.metrics.power],
        ['nli', 'NLI (dB)', props.metrics.nli],
        ['qFactor', 'Q-Factor (dB)', props.metrics.qFactor],
      ]
    : []
  for (const [key, label, value] of candidates) {
    if (value && [value.min, value.max, value.avg].every(Number.isFinite)) {
      fromLegacy.push({ key, label, value })
    }
  }
  return fromLegacy
})

const displayOsnr = computed(() => displayMetricRows.value.find(row => row.key === 'osnr')?.value ?? null)
const displayGsnr = computed(() => displayMetricRows.value.find(row => row.key === 'gsnr')?.value ?? null)
const displayHasPerformanceMetrics = computed(() => Boolean(displayOsnr.value || displayGsnr.value))
const displaySystemCapacityTbps = computed(() => {
  if (typeof props.capacityTbps === 'number' && Number.isFinite(props.capacityTbps)) {
    return props.capacityTbps
  }
  return null
})
const displayPerformanceData = computed(() => props.performanceData)

const costPercent = (value: number): string => {
  const total = props.costData?.totalCost
  if (total == null || total < 0) return '-'
  if (total === 0) return value === 0 ? '0.0' : '-'
  return ((value / total) * 100).toFixed(1)
}

const timelinePosition = (item: TimelineItem): number => {
  const total = Math.max(props.totalLength ?? 0, 0)
  if (total > 0) {
    return Math.min(100, Math.max(0, item.positionKm / total * 100))
  }
  const index = props.timeline.findIndex(candidate => candidate.id === item.id)
  return props.timeline.length <= 1 ? 0 : index / (props.timeline.length - 1) * 100
}

const timelineMarkerClass = (kind: TimelineItem['kind']): string => {
  if (kind === 'amplifier') return 'border-purple-300 bg-purple-50'
  if (kind === 'bu') return 'border-emerald-300 bg-emerald-50'
  if (kind === 'start') return 'border-blue-300 bg-blue-50'
  return 'border-slate-300 bg-slate-50'
}

const chartHasData = computed(() => {
  const data = displayPerformanceData.value
  return Boolean(
    displayHasPerformanceMetrics.value
    && data
    && data.positions.length > 1
    && data.osnrEvolution.length > 1
    && data.gsnrEvolution.length > 1,
  )
})

const chartPath = (values: number[], minValue: number, maxValue: number): string => {
  if (values.length < 2) return ''
  const range = Math.max(maxValue - minValue, 1)
  const last = values.length - 1
  return values
    .map((value, index) => {
      const x = 48 + index * (650 / last)
      const y = 170 - (value - minValue) / range * 140
      return `${x},${Math.min(170, Math.max(30, y))}`
    })
    .join(' ')
}

const evolutionBounds = computed(() => {
  const data = displayPerformanceData.value
  const values = data ? [...data.osnrEvolution, ...data.gsnrEvolution] : []
  const finite = values.filter(value => Number.isFinite(value))
  if (finite.length === 0) return { min: 0, max: 30 }
  return {
    min: Math.floor(Math.min(...finite) - 2),
    max: Math.ceil(Math.max(...finite) + 2),
  }
})

const osnrEvolutionPath = computed(() => {
  const data = displayPerformanceData.value
  if (!data) return ''
  return chartPath(data.osnrEvolution, evolutionBounds.value.min, evolutionBounds.value.max)
})

const gsnrEvolutionPath = computed(() => {
  const data = displayPerformanceData.value
  if (!data) return ''
  return chartPath(data.gsnrEvolution, evolutionBounds.value.min, evolutionBounds.value.max)
})

const exportCostReport = (): void => {
  const escapeCsv = (value: unknown): string => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const rows = [
    ['类别', '器件型号', '数量', '单位', '单价 (USD)', '小计 (USD)'],
    ...(props.costData?.costItems ?? []).map(item => [
      item.category,
      item.model,
      item.quantity,
      item.unit,
      item.unitPrice,
      item.subtotal,
    ]),
    ['', '', '', '', '合计', props.costData?.totalCost ?? ''],
  ]
  const csv = `${String.fromCharCode(0xfeff)}${rows.map(row => row.map(escapeCsv).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `system-planning-cost-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
      <div>
        <p class="text-xs font-medium uppercase text-slate-500">系统规划结果</p>
        <h3 class="mt-1 text-lg font-semibold text-slate-900">{{ linkName }}</h3>
      </div>
      <div class="flex items-center gap-2 text-sm" :class="backendStatus === 'success' ? 'text-green-700' : backendStatus === 'failed' ? 'text-red-700' : 'text-amber-700'">
        <CheckCircle2 v-if="backendStatus === 'success'" class="h-4 w-4" />
        <AlertCircle v-else class="h-4 w-4" />
        <span>{{ backendStatus === 'success' ? '后端计算成功' : backendStatus === 'failed' ? '后端返回失败或不满足' : backendStatus === 'calculating' ? '后端计算中' : '后端未返回状态' }}</span>
      </div>
    </div>

    <div class="flex flex-wrap gap-1 border-b border-slate-200" role="tablist" aria-label="结果视图">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        class="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors"
        :class="activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'"
        @click="activeTab = tab.id"
      >
        <component :is="tab.icon" class="h-4 w-4" />
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'overview'" class="space-y-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div class="border border-slate-200 bg-white p-3">
          <div class="text-xs text-slate-500">线路总长</div>
          <div class="mt-1 font-mono text-lg font-semibold text-slate-900">{{ formatKm(totalLength, 1) }}</div>
        </div>
        <div class="border border-slate-200 bg-white p-3">
          <div class="text-xs text-slate-500">规划 Span</div>
          <div class="mt-1 font-mono text-lg font-semibold text-blue-700">{{ formatKm(spanUsed, 1) }}</div>
        </div>
        <div class="border border-slate-200 bg-white p-3">
          <div class="text-xs text-slate-500">放大器数量</div>
          <div class="mt-1 font-mono text-lg font-semibold text-purple-700">{{ amplifiers.length }}</div>
        </div>
        <div class="border border-slate-200 bg-white p-3">
          <div class="text-xs text-slate-500">BU 数量</div>
          <div class="mt-1 font-mono text-lg font-semibold text-emerald-700">{{ buCount ?? '-' }}</div>
        </div>
        <div class="border border-slate-200 bg-white p-3">
          <div class="text-xs text-slate-500">系统容量</div>
          <div class="mt-1 font-mono text-lg font-semibold text-cyan-700">
            {{ displaySystemCapacityTbps == null ? '-' : `${formatNumber(displaySystemCapacityTbps, 3)} Tbps` }}
          </div>
        </div>
      </div>

      <div v-if="margin" class="border border-slate-200 bg-white p-4 text-sm">
        <div class="font-semibold text-slate-800">后端裕量判定</div>
        <div class="mt-2 grid gap-2 md:grid-cols-3">
          <div><span class="text-slate-500">目标 OSNR</span><div class="font-mono">{{ formatNumber(margin.targetOsnr) }} dB</div></div>
          <div><span class="text-slate-500">最差裕量</span><div class="font-mono">{{ formatNumber(margin.worstMargin) }} dB</div></div>
          <div><span class="text-slate-500">平均裕量</span><div class="font-mono">{{ formatNumber(margin.avgMargin) }} dB</div></div>
        </div>
      </div>

      <div class="border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">计算摘要</div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm md:grid-cols-4">
          <div><span class="text-slate-500">计算时间</span><div class="mt-1 text-slate-800">{{ calculatedAt || '-' }}</div></div>
          <div><span class="text-slate-500">计算耗时</span><div class="mt-1 font-mono text-slate-800">{{ formatNumber(calculationTime, 1) }} s</div></div>
          <div><span class="text-slate-500">平均跨段</span><div class="mt-1 font-mono text-slate-800">{{ formatKm(averageSpan, 1) }}</div></div>
          <div><span class="text-slate-500">优化目标</span><div class="mt-1 text-slate-800">{{ optimizationTargetLabel }}</div></div>
          <div><span class="text-slate-500">信道数量</span><div class="mt-1 font-mono text-slate-800">{{ channelCount == null ? '-' : `${channelCount} ch` }}</div></div>
          <div><span class="text-slate-500">调制格式</span><div class="mt-1 text-slate-800">{{ modulation || '-' }}</div></div>
          <div><span class="text-slate-500">BU 总插损</span><div class="mt-1 font-mono text-slate-800">{{ formatNumber(totalBuLoss, 1) }} dB</div></div>
          <div><span class="text-slate-500">均衡器</span><div class="mt-1 font-mono text-slate-800">{{ equalizerCount == null ? '-' : `${equalizerCount} 个` }} / {{ formatNumber(totalEqualizerLoss, 1) }} dB</div></div>
        </div>
      </div>

      <div v-if="displayMetricRows.length > 0" class="border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">末端性能指标</div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[520px] text-sm">
            <thead class="bg-slate-50 text-xs text-slate-500">
              <tr><th class="px-3 py-2 text-left">指标</th><th class="px-3 py-2 text-right">最小值</th><th class="px-3 py-2 text-right">最大值</th><th class="px-3 py-2 text-right">平均值</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in displayMetricRows" :key="row.key" class="border-t border-slate-100">
                <td class="px-3 py-2">{{ row.label }}</td><td class="px-3 py-2 text-right font-mono">{{ formatNumber(row.value.min) }}</td><td class="px-3 py-2 text-right font-mono">{{ formatNumber(row.value.max) }}</td><td class="px-3 py-2 text-right font-mono text-blue-700">{{ formatNumber(row.value.avg) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        仿真接口未返回 OSNR、GSNR 等性能指标，当前只能确认布局结果，性能目标无法判定。
      </div>
    </section>

    <section v-else-if="activeTab === 'performance'" class="space-y-4">
      <div class="border border-slate-200 bg-white p-4">
        <div class="mb-3 text-sm font-semibold text-slate-800">后端性能指标</div>
        <div v-if="!displayHasPerformanceMetrics" class="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          后端未返回仿真指标，布局数据不会被当作性能计算结果。
        </div>
        <template v-else>
          <div class="grid grid-cols-2 gap-3">
            <div class="border border-slate-200 p-3"><div class="text-xs text-slate-500">最小 OSNR</div><div class="mt-1 font-mono text-lg">{{ formatNumber(displayOsnr?.min) }} dB</div></div>
            <div class="border border-slate-200 p-3"><div class="text-xs text-slate-500">最小 GSNR</div><div class="mt-1 font-mono text-lg">{{ formatNumber(displayGsnr?.min) }} dB</div></div>
          </div>
        </template>
      </div>

      <div v-if="chartHasData" class="border border-slate-200 bg-white p-4">
        <div class="mb-2 text-sm font-semibold text-slate-800">沿链路性能曲线</div>
        <div class="overflow-x-auto">
          <svg viewBox="0 0 720 210" class="h-auto min-w-[680px]" role="img" aria-label="OSNR 和 GSNR 沿链路变化曲线">
            <line x1="48" y1="30" x2="48" y2="170" stroke="#cbd5e1" />
            <line x1="48" y1="170" x2="698" y2="170" stroke="#cbd5e1" />
            <polyline :points="osnrEvolutionPath" fill="none" stroke="#16a34a" stroke-width="2.5" />
            <polyline :points="gsnrEvolutionPath" fill="none" stroke="#2563eb" stroke-width="2.5" />
            <text x="54" y="22" class="fill-slate-500 text-[10px]">dB</text>
            <text x="695" y="198" text-anchor="end" class="fill-slate-500 text-[10px]">链路位置</text>
          </svg>
        </div>
        <div class="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span><i class="mr-1 inline-block h-2 w-4 bg-green-600" />OSNR</span>
          <span><i class="mr-1 inline-block h-2 w-4 bg-blue-600" />GSNR</span>
        </div>
      </div>
      <div v-else class="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        当前没有可绘制的仿真曲线。
      </div>
    </section>

    <section v-else-if="activeTab === 'amplifier'" class="space-y-4">
      <div class="border border-slate-200 bg-white p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <div class="text-sm font-semibold text-slate-800">链路放大器布局</div>
          <div class="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{{ amplifiers.length }} 台放大器<template v-if="buCount != null"> · {{ buCount }} 个 BU</template></span>
            <span>总长 {{ formatKm(totalLength, 1) }}<template v-if="tailSpan != null"> · 末段 {{ formatKm(tailSpan, 1) }}</template></span>
          </div>
        </div>
        <div class="w-full pb-2">
          <div class="relative h-36 w-full px-8 sm:px-10">
            <div class="relative h-full w-full">
              <div class="absolute left-0 right-0 top-[52px] h-1 bg-slate-300" />
              <div
                v-for="item in timeline"
                :key="item.id"
                class="absolute top-0 flex w-16 flex-col items-center sm:w-20"
                :style="{ left: `${timelinePosition(item)}%`, transform: 'translateX(-50%)' }"
              >
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center border transition-shadow sm:h-9 sm:w-9"
                  :class="[timelineMarkerClass(item.kind), item.kind === 'amplifier' && selectedAmplifierIndex === item.amplifierIndex ? 'ring-2 ring-blue-500 ring-offset-1' : '']"
                  :title="item.detail || item.label"
                  @click="item.kind === 'amplifier' && item.amplifierIndex != null ? selectedAmplifierIndex = item.amplifierIndex : undefined"
                >
                  <img :src="item.icon" :alt="item.label" class="h-6 w-6 object-contain sm:h-7 sm:w-7" />
                </button>
                <span v-if="item.kind === 'amplifier'" class="mt-1 text-xs font-semibold text-purple-700">[{{ item.amplifierIndex! + 1 }}]</span>
                <span v-else class="mt-1 max-w-16 truncate text-xs font-semibold text-slate-700 sm:max-w-20">{{ item.label }}</span>
                <span class="font-mono text-[10px] text-slate-500">{{ formatKm(item.positionKm, 1) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-1 text-xs text-slate-500">点击放大器标记查看详细参数；图标与系统设计设备图例一致。</div>
      </div>

      <div class="border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">放大器列表</div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[680px] text-sm">
            <thead class="bg-slate-50 text-xs text-slate-500">
              <tr><th class="px-3 py-2 text-left">序号</th><th class="px-3 py-2 text-right">位置 (km)</th><th class="px-3 py-2 text-right">跨段 (km)</th><th class="px-3 py-2 text-right">增益 (dB)</th><th class="px-3 py-2 text-right">输出功率 (dBm)</th><th class="px-3 py-2 text-right">NF (dB)</th></tr>
            </thead>
            <tbody>
              <template v-for="item in timeline" :key="item.id">
                <tr v-if="item.kind === 'bu'" class="border-t border-emerald-100 bg-emerald-50 text-emerald-800">
                  <td colspan="6" class="px-3 py-2">{{ item.label }} @ {{ formatKm(item.positionKm, 1) }} <span v-if="item.detail">· {{ item.detail }}</span></td>
                </tr>
                <tr v-else-if="item.kind === 'amplifier' && item.amplifierIndex != null" class="cursor-pointer border-t border-slate-100 hover:bg-blue-50" :class="selectedAmplifierIndex === item.amplifierIndex ? 'bg-blue-50' : ''" @click="selectedAmplifierIndex = item.amplifierIndex">
                  <td class="px-3 py-2 font-medium">{{ amplifiers[item.amplifierIndex].name }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ formatNumber(amplifiers[item.amplifierIndex].position) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ formatNumber(amplifiers[item.amplifierIndex].precedingSpan) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ formatNumber(amplifiers[item.amplifierIndex].gain) }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ hasPerformanceMetrics ? formatNumber(amplifiers[item.amplifierIndex].outputPower) : '未返回' }}</td>
                  <td class="px-3 py-2 text-right font-mono">{{ formatNumber(amplifiers[item.amplifierIndex].noiseFigure) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="selectedAmplifier" class="border border-blue-200 bg-blue-50 p-4">
        <div class="mb-3 text-sm font-semibold text-blue-800">选中放大器详情：{{ selectedAmplifier.name }}</div>
        <div class="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
          <div class="flex justify-between gap-3"><span class="text-slate-600">位置</span><span class="font-mono">{{ formatKm(selectedAmplifier.position, 1) }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-600">器件型号</span><span class="text-right">{{ selectedAmplifier.deviceModel || '未指定' }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-600">前段光纤长度</span><span class="font-mono">{{ formatKm(selectedAmplifier.precedingSpan, 1) }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-600">增益</span><span class="font-mono">{{ formatNumber(selectedAmplifier.gain) }} dB</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-600">噪声系数</span><span class="font-mono">{{ formatNumber(selectedAmplifier.noiseFigure) }} dB</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-600">输入功率</span><span class="font-mono">{{ hasPerformanceMetrics ? `${formatNumber(selectedAmplifier.inputPower)} dBm` : '未返回' }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-600">输出功率</span><span class="font-mono">{{ hasPerformanceMetrics ? `${formatNumber(selectedAmplifier.outputPower)} dBm` : '未返回' }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-slate-600">增益平坦度</span><span class="font-mono">{{ selectedAmplifier.gainFlatness == null ? '未返回' : `${formatNumber(selectedAmplifier.gainFlatness)} dB` }}</span></div>
        </div>
      </div>
    </section>

    <section v-else-if="costData" class="space-y-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div class="border border-blue-200 bg-blue-50 p-3 text-center"><div class="text-xs text-blue-700">海缆成本</div><div class="mt-1 text-lg font-bold text-blue-900">{{ formatCost(costData.cableCost) }}</div></div>
        <div class="border border-purple-200 bg-purple-50 p-3 text-center"><div class="text-xs text-purple-700">放大器成本</div><div class="mt-1 text-lg font-bold text-purple-900">{{ formatCost(costData.amplifierCost) }}</div></div>
        <div class="border border-emerald-200 bg-emerald-50 p-3 text-center"><div class="text-xs text-emerald-700">BU 成本</div><div class="mt-1 text-lg font-bold text-emerald-900">{{ formatCost(costData.buCost) }}</div></div>
        <div class="border border-amber-200 bg-amber-50 p-3 text-center"><div class="text-xs text-amber-700">均衡器成本</div><div class="mt-1 text-lg font-bold text-amber-900">{{ formatCost(costData.equalizerCost) }}</div></div>
        <div class="border border-slate-300 bg-slate-100 p-3 text-center"><div class="text-xs text-slate-600">链路总成本</div><div class="mt-1 text-lg font-bold text-slate-900">{{ formatCost(costData.totalCost) }}</div></div>
      </div>

      <div class="border border-slate-200 bg-white">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3"><span class="text-sm font-semibold text-slate-800">成本明细</span><button type="button" class="inline-flex items-center gap-1 border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50" title="导出成本报告" @click="exportCostReport"><Download class="h-4 w-4" />导出成本报告</button></div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[620px] text-sm">
            <thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="px-3 py-2 text-left">类别</th><th class="px-3 py-2 text-left">器件型号</th><th class="px-3 py-2 text-right">数量</th><th class="px-3 py-2 text-right">单价</th><th class="px-3 py-2 text-right">小计</th></tr></thead>
            <tbody>
              <tr v-for="item in costData.costItems" :key="`${item.category}-${item.model}`" class="border-t border-slate-100"><td class="px-3 py-2">{{ item.category }}</td><td class="px-3 py-2 text-slate-600">{{ item.model }}</td><td class="px-3 py-2 text-right font-mono">{{ item.quantity }} {{ item.unit }}</td><td class="px-3 py-2 text-right font-mono">{{ formatCost(item.unitPrice) }}</td><td class="px-3 py-2 text-right font-mono font-medium">{{ formatCost(item.subtotal) }}</td></tr>
            </tbody>
            <tfoot class="bg-slate-50"><tr><td colspan="4" class="px-3 py-2 font-semibold">合计</td><td class="px-3 py-2 text-right font-mono font-bold text-blue-700">{{ formatCost(costData.totalCost) }}</td></tr></tfoot>
          </table>
        </div>
      </div>

      <div class="border border-slate-200 bg-white p-4">
        <div class="mb-3 text-sm font-semibold text-slate-800">成本构成分析</div>
        <div class="space-y-3">
          <div v-for="row in [
            { label: '海缆', value: costData.cableCost, color: 'bg-blue-500' },
            { label: '放大器', value: costData.amplifierCost, color: 'bg-purple-500' },
            { label: '分支器', value: costData.buCost, color: 'bg-emerald-500' },
            { label: '均衡器', value: costData.equalizerCost, color: 'bg-amber-500' },
          ]" :key="row.label" class="flex items-center gap-2 text-sm">
            <span class="w-16 shrink-0 text-slate-600">{{ row.label }}</span><span class="w-12 shrink-0 text-right font-mono text-xs text-slate-500">{{ costPercent(row.value) }}%</span><div class="h-3 flex-1 bg-slate-100"><div class="h-full" :class="row.color" :style="{ width: `${Math.min(100, Number(costPercent(row.value)))}%` }" /></div>
          </div>
        </div>
      </div>
    </section>
    <section v-else class="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      后端未返回成本明细。
    </section>
  </div>
</template>
