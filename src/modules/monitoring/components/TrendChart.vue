<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { TrendingUp, RefreshCw, Download, Settings, ChevronDown } from 'lucide-vue-next'
import { useMonitorStore } from '@/stores/monitor'
// ---------- types ----------
interface TrendDataPoint {
  time: string      // 时间标签 (HH:mm 或 KP值)
  value: number
}

interface TrendSeries {
  name: string
  data: TrendDataPoint[]
  color: string
  unit: string
  thresholdHigh?: number   // 高阈值线
  thresholdLow?: number    // 低阈值线
}

interface Props {
  /** 初始选中的参数 key */
  initialParam?: string
  /** 指定设备 ID，不传则使用全链路聚合 */
  deviceId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  initialParam: 'osnr',
  deviceId: null,
})

const monitorStore = useMonitorStore()

// ---------- state ----------
const selectedParam = ref(props.initialParam)
const timeRange = ref<'1h' | '6h' | '24h' | '7d'>('24h')
const viewMode = ref<'time' | 'distance'>('time')
const showThreshold = ref(true)
const showComparison = ref(false)
const autoRefresh = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// 可选参数列表
const paramOptions = [
  { key: 'osnr',   label: 'OSNR',   unit: 'dB',  color: '#3b82f6', thHigh: 25, thLow: 14 },
  { key: 'gsnr',   label: 'GSNR',   unit: 'dB',  color: '#10b981', thHigh: 22, thLow: 11 },
  { key: 'power',  label: '光功率',  unit: 'dBm', color: '#f59e0b', thHigh: -5, thLow: -20 },
  { key: 'temp',   label: '温度',    unit: '°C',  color: '#ef4444', thHigh: 45, thLow: -5 },
  { key: 'ber',    label: 'BER',     unit: '',     color: '#8b5cf6', thHigh: 1e-9, thLow: 0 },
  { key: 'q',      label: 'Q因子',   unit: 'dB',  color: '#06b6d4', thHigh: 20, thLow: 6 },
]

const currentParamOption = computed(() => paramOptions.find(p => p.key === selectedParam.value) || paramOptions[0])

// ---------- 确定性伪随机 ----------
const seededRand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ---------- 数据生成 ----------
const generateTimeSeries = (paramKey: string, hours: number, offsetSeed = 0): TrendDataPoint[] => {
  const opt = paramOptions.find(p => p.key === paramKey)
  if (!opt) return []
  const points: TrendDataPoint[] = []
  const steps = Math.min(hours <= 1 ? 12 : hours <= 6 ? 36 : hours <= 24 ? 48 : 72, 80)
  const baseValue = (opt.thHigh + opt.thLow) / 2

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps
    const minutesAgo = Math.round(hours * 60 * (1 - fraction))
    const h = Math.floor(minutesAgo / 60)
    const m = minutesAgo % 60
    const timeLabel = hours <= 24
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      : `${Math.floor(minutesAgo / 1440)}d ${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`

    // 添加趋势漂移 + 噪声
    const drift = Math.sin(fraction * Math.PI * 2) * (opt.thHigh - opt.thLow) * 0.15
    const noise = (seededRand(i * 17 + offsetSeed) - 0.5) * (opt.thHigh - opt.thLow) * 0.08
    points.push({ time: timeLabel, value: baseValue + drift + noise })
  }
  return points
}

const generateDistanceSeries = (paramKey: string, offsetSeed = 0): TrendDataPoint[] => {
  const opt = paramOptions.find(p => p.key === paramKey)
  if (!opt) return []
  const points: TrendDataPoint[] = []
  const totalKm = 275
  const steps = 30

  for (let i = 0; i <= steps; i++) {
    const km = (totalKm / steps) * i
    const decay = (km / totalKm) * (opt.thHigh - opt.thLow) * 0.4
    const noise = (seededRand(i * 23 + offsetSeed) - 0.5) * (opt.thHigh - opt.thLow) * 0.05
    points.push({ time: `${km.toFixed(0)}`, value: opt.thHigh - decay + noise })
  }
  return points
}

const hoursMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }

const primarySeries = computed<TrendSeries>(() => {
  const opt = currentParamOption.value
  const data = viewMode.value === 'time'
    ? generateTimeSeries(opt.key, hoursMap[timeRange.value])
    : generateDistanceSeries(opt.key)
  return {
    name: opt.label,
    data,
    color: opt.color,
    unit: opt.unit,
    thresholdHigh: opt.thHigh,
    thresholdLow: opt.thLow,
  }
})

// 对比系列 (前一个周期)
const comparisonSeries = computed<TrendSeries | null>(() => {
  if (!showComparison.value) return null
  const opt = currentParamOption.value
  const data = viewMode.value === 'time'
    ? generateTimeSeries(opt.key, hoursMap[timeRange.value], 999)
    : generateDistanceSeries(opt.key, 999)
  return {
    name: `${opt.label} (上一周期)`,
    data,
    color: '#9ca3af',
    unit: opt.unit,
  }
})

// ---------- SVG 绘制计算 ----------
const svgWidth = 720
const svgHeight = 280
const pad = { top: 30, right: 65, bottom: 40, left: 55 }
const chartW = svgWidth - pad.left - pad.right
const chartH = svgHeight - pad.top - pad.bottom

const yRange = computed(() => {
  const allValues = primarySeries.value.data.map(d => d.value)
  if (comparisonSeries.value) allValues.push(...comparisonSeries.value.data.map(d => d.value))
  if (showThreshold.value && primarySeries.value.thresholdHigh != null) allValues.push(primarySeries.value.thresholdHigh)
  if (showThreshold.value && primarySeries.value.thresholdLow != null) allValues.push(primarySeries.value.thresholdLow)
  let min = Math.min(...allValues)
  let max = Math.max(...allValues)
  const range = max - min || 1
  min -= range * 0.1
  max += range * 0.1
  return { min, max }
})

const toSvgX = (i: number, total: number) => pad.left + (i / Math.max(total - 1, 1)) * chartW
const toSvgY = (v: number) => {
  const { min, max } = yRange.value
  return pad.top + chartH * (1 - (v - min) / (max - min))
}

const polylinePoints = (data: TrendDataPoint[]) =>
  data.map((d, i) => `${toSvgX(i, data.length)},${toSvgY(d.value)}`).join(' ')

// Y 轴刻度
const yTicks = computed(() => {
  const { min, max } = yRange.value
  const ticks: { value: number; y: number }[] = []
  const step = (max - min) / 5
  for (let i = 0; i <= 5; i++) {
    const val = min + step * i
    ticks.push({ value: val, y: toSvgY(val) })
  }
  return ticks
})

// X 轴标签 (间隔取)
const xLabels = computed(() => {
  const data = primarySeries.value.data
  if (data.length === 0) return []
  const interval = Math.ceil(data.length / 8)
  return data
    .filter((_, i) => i % interval === 0 || i === data.length - 1)
    .map((d, _, arr) => ({
      label: d.time,
      x: toSvgX(primarySeries.value.data.indexOf(d), data.length),
    }))
})

// 阈值线
const thresholdHighY = computed(() =>
  primarySeries.value.thresholdHigh != null ? toSvgY(primarySeries.value.thresholdHigh) : null
)
const thresholdLowY = computed(() =>
  primarySeries.value.thresholdLow != null ? toSvgY(primarySeries.value.thresholdLow) : null
)

// ---------- 悬浮交互 ----------
const hoverInfo = ref<{ x: number; y: number; label: string; value: string; compValue?: string } | null>(null)

const handleSvgMouseMove = (e: MouseEvent) => {
  const svg = e.currentTarget as SVGElement
  const rect = svg.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const data = primarySeries.value.data
  if (data.length === 0) return

  const idx = Math.round(((mx - pad.left) / chartW) * (data.length - 1))
  if (idx < 0 || idx >= data.length) { hoverInfo.value = null; return }

  const pt = data[idx]
  const x = toSvgX(idx, data.length)
  const y = toSvgY(pt.value)

  let compValue: string | undefined
  if (comparisonSeries.value && comparisonSeries.value.data[idx]) {
    compValue = comparisonSeries.value.data[idx].value.toFixed(2)
  }

  hoverInfo.value = {
    x, y,
    label: viewMode.value === 'time' ? pt.time : `KP ${pt.time} km`,
    value: `${pt.value.toFixed(2)} ${primarySeries.value.unit}`,
    compValue: compValue ? `${compValue} ${primarySeries.value.unit}` : undefined,
  }
}

const handleSvgMouseLeave = () => { hoverInfo.value = null }

// ---------- 统计摘要 ----------
const stats = computed(() => {
  const vals = primarySeries.value.data.map(d => d.value)
  if (vals.length === 0) return null
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length)
  return { avg, min, max, std }
})

// ---------- auto refresh ----------
watch(autoRefresh, (v) => {
  if (v) {
    refreshTimer = setInterval(() => { /* trigger reactivity */ timeRange.value = timeRange.value }, 10000)
  } else {
    if (refreshTimer) clearInterval(refreshTimer)
  }
})

onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div class="bg-white rounded-xl border shadow-sm">
    <!-- 顶部工具栏 -->
    <div class="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center gap-3">
        <TrendingUp class="w-4 h-4 text-blue-500" />
        <span class="text-sm font-semibold text-gray-700">性能趋势分析</span>

        <!-- 参数选择 -->
        <select v-model="selectedParam"
          class="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white">
          <option v-for="opt in paramOptions" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2 text-xs">
        <!-- 视图模式 -->
        <div class="flex bg-gray-100 rounded-md p-0.5">
          <button
            :class="['px-2 py-1 rounded', viewMode === 'time' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500']"
            @click="viewMode = 'time'">随时间</button>
          <button
            :class="['px-2 py-1 rounded', viewMode === 'distance' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500']"
            @click="viewMode = 'distance'">沿距离</button>
        </div>

        <!-- 时间范围 (仅 time 模式) -->
        <template v-if="viewMode === 'time'">
          <div class="flex bg-gray-100 rounded-md p-0.5">
            <button v-for="r in (['1h','6h','24h','7d'] as const)" :key="r"
              :class="['px-2 py-1 rounded', timeRange === r ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-500']"
              @click="timeRange = r">{{ r }}</button>
          </div>
        </template>

        <!-- 选项 -->
        <label class="flex items-center gap-1 cursor-pointer text-gray-500">
          <input type="checkbox" v-model="showThreshold" class="rounded" />阈值线
        </label>
        <label class="flex items-center gap-1 cursor-pointer text-gray-500">
          <input type="checkbox" v-model="showComparison" class="rounded" />对比
        </label>
        <label class="flex items-center gap-1 cursor-pointer text-gray-500">
          <input type="checkbox" v-model="autoRefresh" class="rounded" />自动刷新
        </label>
      </div>
    </div>

    <!-- SVG 图表区 -->
    <div class="px-4 py-3">
      <svg :viewBox="`0 0 ${svgWidth} ${svgHeight}`" class="w-full" style="max-height: 320px"
        @mousemove="handleSvgMouseMove" @mouseleave="handleSvgMouseLeave">
        <!-- 网格线 -->
        <line v-for="t in yTicks" :key="t.value"
          :x1="pad.left" :y1="t.y" :x2="svgWidth - pad.right" :y2="t.y"
          stroke="#f0f0f0" stroke-width="1" />

        <!-- Y 轴标签 -->
        <text v-for="t in yTicks" :key="'yl' + t.value"
          :x="pad.left - 6" :y="t.y + 3"
          text-anchor="end" fill="#9ca3af" font-size="10">
          {{ t.value.toFixed(primarySeries.unit === '' ? 1 : 1) }}
        </text>

        <!-- X 轴标签 -->
        <text v-for="xl in xLabels" :key="xl.label"
          :x="xl.x" :y="svgHeight - 8"
          text-anchor="middle" fill="#9ca3af" font-size="10">
          {{ xl.label }}
        </text>

        <!-- X 轴说明 -->
        <text :x="svgWidth / 2" :y="svgHeight - 0" text-anchor="middle" fill="#9ca3af" font-size="10">
          {{ viewMode === 'time' ? '时间' : '距离 (km)' }}
        </text>

        <!-- 单位 -->
        <text :x="svgWidth - pad.right + 8" :y="pad.top + 8" text-anchor="start" fill="#6b7280" font-size="10">
          {{ primarySeries.unit }}
        </text>

        <!-- 阈值线 -->
        <template v-if="showThreshold">
          <line v-if="thresholdHighY != null"
            :x1="pad.left" :y1="thresholdHighY" :x2="svgWidth - pad.right" :y2="thresholdHighY"
            stroke="#ef4444" stroke-width="1" stroke-dasharray="6 3" />
          <text v-if="thresholdHighY != null"
            :x="svgWidth - pad.right + 4" :y="thresholdHighY + 3"
            fill="#ef4444" font-size="9">上限</text>

          <line v-if="thresholdLowY != null"
            :x1="pad.left" :y1="thresholdLowY" :x2="svgWidth - pad.right" :y2="thresholdLowY"
            stroke="#f59e0b" stroke-width="1" stroke-dasharray="6 3" />
          <text v-if="thresholdLowY != null"
            :x="svgWidth - pad.right + 4" :y="thresholdLowY + 3"
            fill="#f59e0b" font-size="9">下限</text>
        </template>

        <!-- 对比曲线 -->
        <polyline v-if="comparisonSeries"
          :points="polylinePoints(comparisonSeries.data)"
          fill="none" :stroke="comparisonSeries.color" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.6" />

        <!-- 主曲线 -->
        <polyline
          :points="polylinePoints(primarySeries.data)"
          fill="none" :stroke="primarySeries.color" stroke-width="2" stroke-linejoin="round" />

        <!-- 渐变填充 -->
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="primarySeries.color" stop-opacity="0.15" />
            <stop offset="100%" :stop-color="primarySeries.color" stop-opacity="0" />
          </linearGradient>
        </defs>
        <polygon v-if="primarySeries.data.length > 1"
          :points="
            polylinePoints(primarySeries.data) +
            ` ${toSvgX(primarySeries.data.length - 1, primarySeries.data.length)},${pad.top + chartH}` +
            ` ${toSvgX(0, primarySeries.data.length)},${pad.top + chartH}`
          "
          fill="url(#trendFill)" />

        <!-- Hover 辅助线 + 圆点 -->
        <template v-if="hoverInfo">
          <line :x1="hoverInfo.x" :y1="pad.top" :x2="hoverInfo.x" :y2="pad.top + chartH"
            stroke="#d1d5db" stroke-width="1" stroke-dasharray="3 2" />
          <circle :cx="hoverInfo.x" :cy="hoverInfo.y" r="4"
            :fill="primarySeries.color" stroke="#fff" stroke-width="2" />
        </template>
      </svg>

      <!-- 悬浮提示框 -->
      <div v-if="hoverInfo"
        class="absolute bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-lg shadow pointer-events-none z-10"
        :style="{ left: `${hoverInfo.x + 60}px`, top: `${hoverInfo.y + 20}px`, transform: 'translateX(-50%)' }">
        <div class="font-medium">{{ hoverInfo.label }}</div>
        <div>{{ currentParamOption.label }}: {{ hoverInfo.value }}</div>
        <div v-if="hoverInfo.compValue" class="text-gray-400">对比: {{ hoverInfo.compValue }}</div>
      </div>
    </div>

    <!-- 统计摘要 -->
    <div v-if="stats" class="px-4 pb-3 flex items-center gap-6 text-xs">
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400">平均:</span>
        <span class="font-medium text-gray-700">{{ stats.avg.toFixed(2) }} {{ primarySeries.unit }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400">最大:</span>
        <span class="font-medium text-green-600">{{ stats.max.toFixed(2) }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400">最小:</span>
        <span class="font-medium text-red-600">{{ stats.min.toFixed(2) }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-gray-400">标准差:</span>
        <span class="font-medium text-gray-600">{{ stats.std.toFixed(3) }}</span>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <span class="w-3 h-0.5 rounded" :style="{ backgroundColor: primarySeries.color }"></span>
        <span class="text-gray-500">{{ primarySeries.name }}</span>
        <template v-if="comparisonSeries">
          <span class="w-3 h-0.5 bg-gray-400 rounded ml-2"></span>
          <span class="text-gray-400">{{ comparisonSeries.name }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
