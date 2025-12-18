<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { TrendingUp, RefreshCw } from 'lucide-vue-next'

interface DataPoint {
  time: string
  value: number
}

interface ChartSeries {
  name: string
  data: DataPoint[]
  color: string
  unit: string
}

const props = defineProps<{
  title?: string
  series: ChartSeries[]
  height?: number
  showLegend?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const chartContainer = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)
const hoveredPoint = ref<{ series: string; point: DataPoint; x: number; y: number } | null>(null)

const chartHeight = computed(() => props.height || 200)
const padding = { top: 20, right: 60, bottom: 30, left: 50 }

// 计算Y轴范围
const getYRange = (series: ChartSeries[]) => {
  let min = Infinity
  let max = -Infinity
  series.forEach(s => {
    s.data.forEach(d => {
      if (d.value < min) min = d.value
      if (d.value > max) max = d.value
    })
  })
  const range = max - min || 1
  return { min: min - range * 0.1, max: max + range * 0.1 }
}

// 绘制图表
const drawChart = () => {
  if (!chartContainer.value || !ctx.value) return
  
  const canvas = chartContainer.value
  const c = ctx.value
  const width = canvas.width
  const height = canvas.height
  
  // 清空画布
  c.clearRect(0, 0, width, height)
  
  if (props.series.length === 0 || props.series[0].data.length === 0) {
    c.fillStyle = '#999'
    c.font = '14px sans-serif'
    c.textAlign = 'center'
    c.fillText('暂无数据', width / 2, height / 2)
    return
  }
  
  const yRange = getYRange(props.series)
  const chartWidth = width - padding.left - padding.right
  const chartHeightInner = height - padding.top - padding.bottom
  
  // 绘制网格线
  c.strokeStyle = '#e5e7eb'
  c.lineWidth = 1
  
  // Y轴网格
  const ySteps = 5
  for (let i = 0; i <= ySteps; i++) {
    const y = padding.top + (chartHeightInner / ySteps) * i
    c.beginPath()
    c.moveTo(padding.left, y)
    c.lineTo(width - padding.right, y)
    c.stroke()
    
    // Y轴标签
    const value = yRange.max - ((yRange.max - yRange.min) / ySteps) * i
    c.fillStyle = '#6b7280'
    c.font = '11px sans-serif'
    c.textAlign = 'right'
    c.fillText(value.toFixed(1), padding.left - 5, y + 4)
  }
  
  // X轴时间标签
  const maxPoints = props.series[0].data.length
  const xStep = chartWidth / (maxPoints - 1 || 1)
  const labelInterval = Math.ceil(maxPoints / 6)
  
  c.fillStyle = '#6b7280'
  c.textAlign = 'center'
  props.series[0].data.forEach((point, i) => {
    if (i % labelInterval === 0 || i === maxPoints - 1) {
      const x = padding.left + i * xStep
      c.fillText(point.time, x, height - 10)
    }
  })
  
  // 绘制数据线
  props.series.forEach(series => {
    if (series.data.length < 2) return
    
    c.strokeStyle = series.color
    c.lineWidth = 2
    c.beginPath()
    
    series.data.forEach((point, i) => {
      const x = padding.left + i * xStep
      const y = padding.top + chartHeightInner * (1 - (point.value - yRange.min) / (yRange.max - yRange.min))
      
      if (i === 0) {
        c.moveTo(x, y)
      } else {
        c.lineTo(x, y)
      }
    })
    
    c.stroke()
    
    // 绘制数据点
    series.data.forEach((point, i) => {
      const x = padding.left + i * xStep
      const y = padding.top + chartHeightInner * (1 - (point.value - yRange.min) / (yRange.max - yRange.min))
      
      c.beginPath()
      c.arc(x, y, 3, 0, Math.PI * 2)
      c.fillStyle = series.color
      c.fill()
    })
  })
  
  // 绘制单位
  if (props.series.length > 0) {
    c.fillStyle = '#6b7280'
    c.font = '11px sans-serif'
    c.textAlign = 'left'
    c.fillText(props.series[0].unit, width - padding.right + 5, padding.top + 10)
  }
}

// 处理鼠标移动
const handleMouseMove = (e: MouseEvent) => {
  if (!chartContainer.value || props.series.length === 0) return
  
  const rect = chartContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  const chartWidth = chartContainer.value.width - padding.left - padding.right
  const maxPoints = props.series[0].data.length
  const xStep = chartWidth / (maxPoints - 1 || 1)
  
  // 找到最近的数据点
  const index = Math.round((x - padding.left) / xStep)
  if (index >= 0 && index < maxPoints) {
    const series = props.series[0]
    const point = series.data[index]
    const pointX = padding.left + index * xStep
    const yRange = getYRange(props.series)
    const chartHeightInner = chartContainer.value.height - padding.top - padding.bottom
    const pointY = padding.top + chartHeightInner * (1 - (point.value - yRange.min) / (yRange.max - yRange.min))
    
    hoveredPoint.value = { series: series.name, point, x: pointX, y: pointY }
  } else {
    hoveredPoint.value = null
  }
}

const handleMouseLeave = () => {
  hoveredPoint.value = null
}

// 初始化画布
const initCanvas = () => {
  if (!chartContainer.value) return
  
  const canvas = chartContainer.value
  const parent = canvas.parentElement
  if (parent) {
    canvas.width = parent.clientWidth
    canvas.height = chartHeight.value
  }
  
  ctx.value = canvas.getContext('2d')
  drawChart()
}

// 自动刷新
let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  initCanvas()
  window.addEventListener('resize', initCanvas)
  
  if (props.autoRefresh && props.refreshInterval) {
    refreshTimer = setInterval(() => {
      emit('refresh')
    }, props.refreshInterval)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', initCanvas)
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})

watch(() => props.series, () => {
  drawChart()
}, { deep: true })
</script>

<template>
  <div class="bg-white rounded-lg border p-3">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <TrendingUp class="w-4 h-4 text-blue-500" />
        <span class="text-sm font-medium text-gray-700">{{ title || '性能趋势' }}</span>
      </div>
      <button 
        class="p-1 text-gray-400 hover:text-blue-500 transition-colors"
        title="刷新数据"
        @click="emit('refresh')"
      >
        <RefreshCw class="w-4 h-4" />
      </button>
    </div>
    
    <!-- 图例 -->
    <div v-if="showLegend && series.length > 1" class="flex items-center gap-4 mb-2">
      <div v-for="s in series" :key="s.name" class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: s.color }" />
        <span class="text-xs text-gray-600">{{ s.name }}</span>
      </div>
    </div>
    
    <!-- 图表 -->
    <div class="relative">
      <canvas 
        ref="chartContainer"
        :height="chartHeight"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
      />
      
      <!-- 悬浮提示 -->
      <div 
        v-if="hoveredPoint"
        class="absolute bg-gray-800 text-white text-xs px-2 py-1 rounded pointer-events-none"
        :style="{ 
          left: `${hoveredPoint.x}px`, 
          top: `${hoveredPoint.y - 30}px`,
          transform: 'translateX(-50%)'
        }"
      >
        {{ hoveredPoint.point.time }}: {{ hoveredPoint.point.value.toFixed(2) }}
      </div>
    </div>
  </div>
</template>
