<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Check, AlertTriangle } from 'lucide-vue-next'
import type { SpanScanResult, SpanScanPoint } from '@/types/simulation'

const props = defineProps<{
  /** Span 扫描结果数据 */
  scanResult: SpanScanResult
  /** 图表高度 */
  height?: number
  /** 标题 */
  title?: string
  /** 是否显示 OSNR 曲线 */
  showOsnr?: boolean
  /** 用户选定的 Span（外部双向绑定） */
  userSelectedSpan?: number | null
  /** 系统推荐 Span */
  recommendedSpan?: number | null
}>()

const emit = defineEmits<{
  (e: 'select-span', spanLength: number): void
  (e: 'update:userSelectedSpan', spanLength: number | null): void
}>()

const chartHeight = computed(() => props.height || 220)

// 图表容器引用
const chartContainer = ref<HTMLDivElement | null>(null)
// SVG 元素引用
const svgElement = ref<SVGSVGElement | null>(null)

// 当前选中的 Span 长度
const selectedSpanLength = ref<number | null>(null)

// 鼠标悬停的数据点
const hoveredPoint = ref<SpanScanPoint | null>(null)

// ========== 拖拽游标逻辑 ==========
const isDragging = ref(false)
const cursorSpan = ref<number | null>(null) // 游标当前指向的 Span

// 同步外部 userSelectedSpan
watch(() => props.userSelectedSpan, (v) => {
  if (v != null && !isDragging.value) {
    cursorSpan.value = v
    selectedSpanLength.value = v
  }
}, { immediate: true })

// 自动初始化游标到推荐 Span 位置（确保首次可见）
watch(() => [props.recommendedSpan, props.scanResult?.recommendedSpanKm], ([recProp, recScan]) => {
  if (cursorSpan.value == null && !isDragging.value) {
    const rec = (recProp as number | null | undefined) ?? (recScan as number | undefined)
    if (rec != null) {
      cursorSpan.value = rec
      selectedSpanLength.value = rec
    }
  }
}, { immediate: true })

/** 在扫描点间线性插值得到指定 Span 对应的 GSNR/OSNR */
const interpolateAtSpan = (spanKm: number) => {
  const pts = props.scanResult?.scanPoints
  if (!pts || pts.length === 0) return null
  // 边界
  if (spanKm <= pts[0].spanLengthKm) return pts[0]
  if (spanKm >= pts[pts.length - 1].spanLengthKm) return pts[pts.length - 1]
  // 找左右邻近
  for (let i = 0; i < pts.length - 1; i++) {
    if (spanKm >= pts[i].spanLengthKm && spanKm <= pts[i + 1].spanLengthKm) {
      const t = (spanKm - pts[i].spanLengthKm) / (pts[i + 1].spanLengthKm - pts[i].spanLengthKm)
      const lerp = (a: number, b: number) => a + (b - a) * t
      return {
        spanLengthKm: spanKm,
        avgGsnrDb: lerp(pts[i].avgGsnrDb, pts[i + 1].avgGsnrDb),
        minGsnrDb: lerp(pts[i].minGsnrDb, pts[i + 1].minGsnrDb),
        avgOsnrDb: lerp(pts[i].avgOsnrDb, pts[i + 1].avgOsnrDb),
        gsnrMarginDb: lerp(pts[i].gsnrMarginDb, pts[i + 1].gsnrMarginDb),
        meetTarget: lerp(pts[i].avgGsnrDb, pts[i + 1].avgGsnrDb) >= (props.scanResult?.targetGsnrDb ?? 0),
      }
    }
  }
  return null
}

/** 游标插值数据 */
const cursorData = computed(() => cursorSpan.value != null ? interpolateAtSpan(cursorSpan.value) : null)

/** SVG 坐标 -> Span 值 */
const svgXToSpan = (svgX: number) => {
  const cd = chartData.value
  if (!cd) return null
  const pts = cd.points
  if (pts.length < 2) return null
  const xMin = pts[0].spanLengthKm
  const xMax = pts[pts.length - 1].spanLengthKm
  const plotLeft = cd.padding.left
  const plotRight = cd.width - cd.padding.right
  if (plotRight <= plotLeft) return null
  const ratio = (svgX - plotLeft) / (plotRight - plotLeft)
  return xMin + ratio * (xMax - xMin)
}

/** 鼠标/指针事件 -> SVG X 坐标 */
const clientToSvgX = (clientX: number) => {
  if (!svgElement.value || !chartData.value) return null
  const rect = svgElement.value.getBoundingClientRect()
  const svgWidth = chartData.value.width
  return (clientX - rect.left) / rect.width * svgWidth
}

const handleCursorDragStart = (e: MouseEvent | TouchEvent) => {
  e.preventDefault()
  isDragging.value = true
  document.addEventListener('mousemove', handleCursorDragMove)
  document.addEventListener('mouseup', handleCursorDragEnd)
  document.addEventListener('touchmove', handleCursorDragMove)
  document.addEventListener('touchend', handleCursorDragEnd)
}

const handleCursorDragMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const svgX = clientToSvgX(clientX)
  if (svgX == null) return
  const span = svgXToSpan(svgX)
  if (span == null) return
  const cd = chartData.value
  if (!cd) return
  const pts = cd.points
  const clamped = Math.max(pts[0].spanLengthKm, Math.min(pts[pts.length - 1].spanLengthKm, Math.round(span)))
  cursorSpan.value = clamped
  emit('update:userSelectedSpan', clamped)
}

const handleCursorDragEnd = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', handleCursorDragMove)
  document.removeEventListener('mouseup', handleCursorDragEnd)
  document.removeEventListener('touchmove', handleCursorDragMove)
  document.removeEventListener('touchend', handleCursorDragEnd)
  // 确认选择
  if (cursorSpan.value != null) {
    selectedSpanLength.value = cursorSpan.value
    emit('select-span', cursorSpan.value)
  }
}

/** 点击图表区域直接选择 Span */
const handleChartClick = (e: MouseEvent) => {
  if (isDragging.value) return
  const svgX = clientToSvgX(e.clientX)
  if (svgX == null) return
  const span = svgXToSpan(svgX)
  if (span == null) return
  const cd = chartData.value
  if (!cd) return
  const pts = cd.points
  const clamped = Math.max(pts[0].spanLengthKm, Math.min(pts[pts.length - 1].spanLengthKm, Math.round(span)))
  cursorSpan.value = clamped
  selectedSpanLength.value = clamped
  emit('update:userSelectedSpan', clamped)
  emit('select-span', clamped)
}

/** 游标在 SVG 中的 X 坐标 */
const cursorSvgX = computed(() => {
  if (cursorSpan.value == null || !chartData.value) return null
  const cd = chartData.value
  const pts = cd.points
  if (pts.length < 2) return null
  const xMin = pts[0].spanLengthKm
  const xMax = pts[pts.length - 1].spanLengthKm
  const plotLeft = cd.padding.left
  const plotRight = cd.width - cd.padding.right
  return plotLeft + (cursorSpan.value - xMin) / (xMax - xMin) * (plotRight - plotLeft)
})

// 计算 SVG 路径和坐标
const chartData = computed(() => {
  const result = props.scanResult
  if (!result || result.scanPoints.length === 0) return null
  // 至少需要 2 个扫描点才能绘制有意义的图表
  if (result.scanPoints.length < 2) return null

  const points = result.scanPoints
  const padding = { top: 25, right: 50, bottom: 40, left: 65 }  // 左侧留给 Y 轴标签
  const width = 800  // 加宽以匹配容器比例
  const height = chartHeight.value

  // 数据范围
  const xMin = Math.min(...points.map(p => p.spanLengthKm))
  const xMax = Math.max(...points.map(p => p.spanLengthKm))
  const yMin = Math.min(...points.map(p => Math.min(p.avgGsnrDb, p.minGsnrDb))) - 2
  const yMax = Math.max(...points.map(p => Math.max(p.avgGsnrDb, p.avgOsnrDb))) + 2

  // 缩放函数
  const scaleX = (x: number) => padding.left + (x - xMin) / (xMax - xMin) * (width - padding.left - padding.right)
  const scaleY = (y: number) => height - padding.bottom - (y - yMin) / (yMax - yMin) * (height - padding.top - padding.bottom)

  // 生成路径
  const avgGsnrPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.spanLengthKm)} ${scaleY(p.avgGsnrDb)}`).join(' ')
  const minGsnrPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.spanLengthKm)} ${scaleY(p.minGsnrDb)}`).join(' ')
  const osnrPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.spanLengthKm)} ${scaleY(p.avgOsnrDb)}`).join(' ')

  // 目标 GSNR 线
  const targetY = scaleY(result.targetGsnrDb)

  // 可行区间
  const feasibleArea = result.feasibleRange
    ? {
        x1: scaleX(result.feasibleRange[0]),
        x2: scaleX(result.feasibleRange[1]),
        y1: padding.top,
        y2: height - padding.bottom,
      }
    : null

  // 推荐点
  const recommendedPoint = points.find(p => p.spanLengthKm === result.recommendedSpanKm)
  const recommendedX = recommendedPoint ? scaleX(recommendedPoint.spanLengthKm) : null
  const recommendedY = recommendedPoint ? scaleY(recommendedPoint.avgGsnrDb) : null

  // X 轴刻度
  const xTicks = []
  const xStep = (xMax - xMin) / 5
  for (let x = xMin; x <= xMax; x += xStep) {
    xTicks.push({ value: Math.round(x), x: scaleX(x) })
  }

  // Y 轴刻度
  const yTicks = []
  const yStep = (yMax - yMin) / 5
  for (let y = yMin; y <= yMax; y += yStep) {
    yTicks.push({ value: y.toFixed(1), y: scaleY(y) })
  }

  return {
    width,
    height,
    padding,
    avgGsnrPath,
    minGsnrPath,
    osnrPath,
    targetY,
    feasibleArea,
    recommendedX,
    recommendedY,
    xTicks,
    yTicks,
    points: points.map(p => ({
      ...p,
      x: scaleX(p.spanLengthKm),
      avgY: scaleY(p.avgGsnrDb),
      minY: scaleY(p.minGsnrDb),
      osnrY: scaleY(p.avgOsnrDb),
    })),
    yMin,
    yMax,
    targetGsnrDb: result.targetGsnrDb,
  }
})

// 处理点击
const handlePointClick = (point: SpanScanPoint) => {
  selectedSpanLength.value = point.spanLengthKm
  emit('select-span', point.spanLengthKm)
}

// 处理鼠标悬停
const handlePointHover = (point: SpanScanPoint | null) => {
  hoveredPoint.value = point
}
</script>

<template>
  <div class="span-performance-chart">
    <!-- 交互提示 -->
    <div class="flex items-center justify-between mb-2">
      <div class="text-xs text-purple-500 flex items-center gap-1">
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v20M2 12h20" stroke-linecap="round"/>
        </svg>
        <span>拖拽紫色游标或点击图表调整 Span</span>
      </div>
    </div>
    <!-- 图例 -->
    <div class="flex items-center justify-end gap-4 text-xs mb-2">
      <span class="flex items-center gap-1">
        <span class="w-3 h-0.5 bg-blue-500"></span>
        平均 GSNR
      </span>
      <span class="flex items-center gap-1">
        <span class="w-3 h-0.5 bg-orange-500"></span>
        最差 GSNR
      </span>
      <span v-if="showOsnr" class="flex items-center gap-1">
        <span class="w-3 h-0.5 bg-green-500"></span>
        平均 OSNR
      </span>
      <span class="flex items-center gap-1">
        <span class="w-3 h-0.5 bg-red-500 border-dashed"></span>
        目标 GSNR
      </span>
    </div>

    <!-- SVG 图表 -->
    <div ref="chartContainer" class="relative bg-gray-50 rounded-lg border">
      <svg 
        v-if="chartData" 
        ref="svgElement"
        :viewBox="`0 0 ${chartData.width} ${chartData.height}`"
        preserveAspectRatio="xMidYMid meet"
        class="w-full h-auto"
        @click="handleChartClick"
      >
        <!-- 可行区间背景 -->
        <rect
          v-if="chartData.feasibleArea"
          :x="chartData.feasibleArea.x1"
          :y="chartData.feasibleArea.y1"
          :width="chartData.feasibleArea.x2 - chartData.feasibleArea.x1"
          :height="chartData.feasibleArea.y2 - chartData.feasibleArea.y1"
          fill="rgba(34, 197, 94, 0.1)"
        />

        <!-- 网格线 -->
        <g class="grid-lines" stroke="#e5e7eb" stroke-width="1">
          <line
            v-for="tick in chartData.yTicks"
            :key="'y-' + tick.value"
            :x1="chartData.padding.left"
            :y1="tick.y"
            :x2="chartData.width - chartData.padding.right"
            :y2="tick.y"
            stroke-dasharray="4,4"
          />
        </g>

        <!-- 目标 GSNR 参考线 -->
        <line
          :x1="chartData.padding.left"
          :y1="chartData.targetY"
          :x2="chartData.width - chartData.padding.right"
          :y2="chartData.targetY"
          stroke="#ef4444"
          stroke-width="2"
          stroke-dasharray="6,4"
        />
        <text
          :x="chartData.width - chartData.padding.right + 5"
          :y="chartData.targetY + 4"
          class="text-xs fill-red-500"
        >
          {{ chartData.targetGsnrDb }} dB
        </text>

        <!-- OSNR 曲线 -->
        <path
          v-if="showOsnr"
          :d="chartData.osnrPath"
          fill="none"
          stroke="#22c55e"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- 平均 GSNR 曲线 -->
        <path
          :d="chartData.avgGsnrPath"
          fill="none"
          stroke="#3b82f6"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- 最差 GSNR 曲线 -->
        <path
          :d="chartData.minGsnrPath"
          fill="none"
          stroke="#f97316"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- 数据点 -->
        <g v-for="point in chartData.points" :key="point.spanLengthKm">
          <!-- 平均 GSNR 点 -->
          <circle
            :cx="point.x"
            :cy="point.avgY"
            :r="hoveredPoint?.spanLengthKm === point.spanLengthKm || selectedSpanLength === point.spanLengthKm ? 6 : 4"
            :fill="point.meetTarget ? '#3b82f6' : '#ef4444'"
            class="cursor-pointer transition-all"
            @click="handlePointClick(point)"
            @mouseenter="handlePointHover(point)"
            @mouseleave="handlePointHover(null)"
          />
        </g>

        <!-- 推荐点标记 -->
        <g v-if="chartData.recommendedX && chartData.recommendedY">
          <circle
            :cx="chartData.recommendedX"
            :cy="chartData.recommendedY"
            r="10"
            fill="none"
            stroke="#22c55e"
            stroke-width="2"
          />
          <text
            :x="chartData.recommendedX"
            :y="chartData.recommendedY - 15"
            class="text-xs fill-green-600 font-medium"
            text-anchor="middle"
          >
            ★ 推荐
          </text>
        </g>

        <!-- ===== 拖拽游标 ===== -->
        <g v-if="cursorSvgX != null">
          <!-- 半透明垂直线 -->
          <line
            :x1="cursorSvgX" :y1="chartData.padding.top"
            :x2="cursorSvgX" :y2="chartData.height - chartData.padding.bottom"
            stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4,3" opacity="0.7"
          />
          <!-- 拖拽手柄（三角形 + 矩形） -->
          <rect
            :x="cursorSvgX - 14" :y="chartData.height - chartData.padding.bottom - 2"
            width="28" height="18" rx="4" fill="#8b5cf6"
            class="cursor-grab" :class="{ 'cursor-grabbing': isDragging }"
            @mousedown="handleCursorDragStart" @touchstart="handleCursorDragStart"
          />
          <text
            :x="cursorSvgX" :y="chartData.height - chartData.padding.bottom + 11"
            class="text-[9px] fill-white font-bold" text-anchor="middle"
            style="pointer-events:none"
          >
            {{ cursorSpan }}
          </text>
          <!-- 游标数值标签 -->
          <g v-if="cursorData">
            <rect
              :x="cursorSvgX + 8" :y="chartData.padding.top + 4"
              width="110" height="48" rx="4" fill="white" stroke="#8b5cf6" stroke-width="1" opacity="0.95"
            />
            <text :x="cursorSvgX + 14" :y="chartData.padding.top + 19" class="text-[10px] fill-gray-700">
              Span: {{ cursorSpan }} km
            </text>
            <text :x="cursorSvgX + 14" :y="chartData.padding.top + 33" class="text-[10px] fill-blue-600">
              GSNR: {{ cursorData.avgGsnrDb.toFixed(2) }} dB
            </text>
            <text
              :x="cursorSvgX + 14" :y="chartData.padding.top + 47"
              :class="cursorData.gsnrMarginDb >= 0 ? 'fill-green-600' : 'fill-red-600'"
              class="text-[10px]"
            >
              余量: {{ cursorData.gsnrMarginDb.toFixed(2) }} dB
            </text>
          </g>
        </g>

        <!-- X 轴 -->
        <g class="x-axis">
          <line
            :x1="chartData.padding.left"
            :y1="chartData.height - chartData.padding.bottom"
            :x2="chartData.width - chartData.padding.right"
            :y2="chartData.height - chartData.padding.bottom"
            stroke="#9ca3af"
            stroke-width="1"
          />
          <g v-for="tick in chartData.xTicks" :key="'xt-' + tick.value">
            <line
              :x1="tick.x"
              :y1="chartData.height - chartData.padding.bottom"
              :x2="tick.x"
              :y2="chartData.height - chartData.padding.bottom + 5"
              stroke="#9ca3af"
            />
            <text
              :x="tick.x"
              :y="chartData.height - chartData.padding.bottom + 18"
              class="text-xs fill-gray-500"
              text-anchor="middle"
            >
              {{ tick.value }}
            </text>
          </g>
          <text
            :x="chartData.width / 2"
            :y="chartData.height - 10"
            class="text-xs fill-gray-600"
            text-anchor="middle"
          >
            Span 长度 (km)
          </text>
        </g>

        <!-- Y 轴 -->
        <g class="y-axis">
          <line
            :x1="chartData.padding.left"
            :y1="chartData.padding.top"
            :x2="chartData.padding.left"
            :y2="chartData.height - chartData.padding.bottom"
            stroke="#9ca3af"
            stroke-width="1"
          />
          <g v-for="tick in chartData.yTicks" :key="'yt-' + tick.value">
            <line
              :x1="chartData.padding.left - 5"
              :y1="tick.y"
              :x2="chartData.padding.left"
              :y2="tick.y"
              stroke="#9ca3af"
            />
            <text
              :x="chartData.padding.left - 10"
              :y="tick.y + 4"
              class="text-xs fill-gray-500"
              text-anchor="end"
            >
              {{ tick.value }}
            </text>
          </g>
          <text
            :x="18"
            :y="chartData.height / 2"
            class="text-xs fill-gray-600"
            text-anchor="middle"
            :transform="`rotate(-90, 18, ${chartData.height / 2})`"
          >
            GSNR / OSNR (dB)
          </text>
        </g>
      </svg>

      <!-- 无数据提示 -->
      <div v-else class="flex items-center justify-center h-64 text-gray-400">
        暂无数据，请先执行 Span 扫描计算
      </div>

      <!-- 悬停提示框 -->
      <div
        v-if="hoveredPoint"
        class="absolute bg-white shadow-lg rounded-lg p-3 text-sm border z-10 pointer-events-none"
        :style="{
          left: `${(chartData?.points.find(p => p.spanLengthKm === hoveredPoint!.spanLengthKm)?.x || 0) + 10}px`,
          top: `${(chartData?.points.find(p => p.spanLengthKm === hoveredPoint!.spanLengthKm)?.avgY || 0) - 60}px`,
        }"
      >
        <div class="font-medium text-gray-800 mb-2 flex items-center gap-1">
          <span>Span: {{ hoveredPoint.spanLengthKm }} km</span>
          <Check v-if="hoveredPoint.meetTarget" class="w-4 h-4 text-green-500" />
          <AlertTriangle v-else class="w-4 h-4 text-red-500" />
        </div>
        <div class="space-y-1 text-gray-600">
          <div>平均 GSNR: <span class="font-mono">{{ hoveredPoint.avgGsnrDb.toFixed(2) }} dB</span></div>
          <div>最差 GSNR: <span class="font-mono">{{ hoveredPoint.minGsnrDb.toFixed(2) }} dB</span></div>
          <div>平均 OSNR: <span class="font-mono">{{ hoveredPoint.avgOsnrDb.toFixed(2) }} dB</span></div>
          <div :class="hoveredPoint.gsnrMarginDb >= 0 ? 'text-green-600' : 'text-red-600'">
            余量: <span class="font-mono">{{ hoveredPoint.gsnrMarginDb.toFixed(2) }} dB</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 游标拖拽提示 -->
    <div v-if="chartData" class="mt-2 text-center text-xs text-gray-400">
      💡 点击曲线或拖动紫色游标选择目标 Span 长度
    </div>

    <!-- 底部信息 -->
    <div v-if="scanResult" class="mt-3 flex items-center justify-between text-sm">
      <div class="flex items-center gap-4">
        <span class="text-gray-500">
          扫描范围: {{ scanResult.spanLengthsKm[0] }} - {{ scanResult.spanLengthsKm[scanResult.spanLengthsKm.length - 1] }} km
        </span>
        <span v-if="scanResult.feasibleRange" class="text-green-600 flex items-center gap-1">
          <Check class="w-4 h-4" />
          可行区间: {{ scanResult.feasibleRange[0] }} - {{ scanResult.feasibleRange[1] }} km
        </span>
        <span v-else class="text-red-600 flex items-center gap-1">
          <AlertTriangle class="w-4 h-4" />
          无可行配置
        </span>
      </div>
      <div class="text-gray-600">
        推荐 Span: <span class="font-bold text-blue-600">{{ scanResult.recommendedSpanKm }} km</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.span-performance-chart svg text {
  font-family: system-ui, -apple-system, sans-serif;
}
</style>
