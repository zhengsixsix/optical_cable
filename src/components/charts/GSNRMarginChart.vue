<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Card, CardHeader, CardContent } from '@/components/ui'
import { TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-vue-next'

// GSNR数据点
interface GSNRDataPoint {
  kp: number           // KP位置 (km)
  gsnr: number         // GSNR值 (dB)
  margin: number       // 余量 (dB)
  repeaterIndex?: number  // 中继器序号
}

const props = withDefaults(defineProps<{
  data: GSNRDataPoint[]
  requiredGsnr?: number      // 所需GSNR阈值
  warningThreshold?: number  // 警告阈值
  showRepeaters?: boolean    // 显示中继器位置
  height?: number            // 图表高度
  title?: string
}>(), {
  requiredGsnr: 12,
  warningThreshold: 3,
  showRepeaters: true,
  height: 300,
  title: 'GSNR余量曲线'
})

const emit = defineEmits<{
  (e: 'point-click', point: GSNRDataPoint): void
  (e: 'refresh'): void
}>()

// Canvas 引用
const canvasRef = ref<HTMLCanvasElement | null>(null)
const tooltipRef = ref<HTMLDivElement | null>(null)

// 状态
const hoveredPoint = ref<GSNRDataPoint | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })

// 计算属性
const chartConfig = computed(() => {
  const padding = { top: 40, right: 60, bottom: 50, left: 60 }
  const width = 800
  const height = props.height
  
  return {
    padding,
    width,
    height,
    chartWidth: width - padding.left - padding.right,
    chartHeight: height - padding.top - padding.bottom
  }
})

const dataRange = computed(() => {
  if (!props.data.length) {
    return { minKp: 0, maxKp: 1000, minGsnr: 10, maxGsnr: 30 }
  }
  
  const kps = props.data.map(d => d.kp)
  const gsnrs = props.data.map(d => d.gsnr)
  
  return {
    minKp: Math.min(...kps),
    maxKp: Math.max(...kps),
    minGsnr: Math.min(props.requiredGsnr - 5, ...gsnrs),
    maxGsnr: Math.max(props.requiredGsnr + 10, ...gsnrs)
  }
})

// 统计信息
const statistics = computed(() => {
  if (!props.data.length) return null
  
  const margins = props.data.map(d => d.margin)
  const minMargin = Math.min(...margins)
  const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length
  const worstPoint = props.data.find(d => d.margin === minMargin)
  const belowThreshold = props.data.filter(d => d.margin < props.warningThreshold).length
  
  return {
    minMargin: minMargin.toFixed(1),
    avgMargin: avgMargin.toFixed(1),
    worstKp: worstPoint?.kp.toFixed(0) || 'N/A',
    belowThreshold,
    isFeasible: minMargin > 0
  }
})

// 坐标转换
const scaleX = (kp: number): number => {
  const { padding, chartWidth } = chartConfig.value
  const { minKp, maxKp } = dataRange.value
  return padding.left + ((kp - minKp) / (maxKp - minKp)) * chartWidth
}

const scaleY = (gsnr: number): number => {
  const { padding, chartHeight } = chartConfig.value
  const { minGsnr, maxGsnr } = dataRange.value
  return padding.top + chartHeight - ((gsnr - minGsnr) / (maxGsnr - minGsnr)) * chartHeight
}

// 绘制图表
const drawChart = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const { width, height, padding, chartWidth, chartHeight } = chartConfig.value
  const { minKp, maxKp, minGsnr, maxGsnr } = dataRange.value
  
  // 设置画布尺寸
  const dpr = window.devicePixelRatio || 1
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.scale(dpr, dpr)
  
  // 清空画布
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  
  // 绘制网格
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  
  // Y轴网格线
  const yTicks = 5
  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + (i / yTicks) * chartHeight
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(padding.left + chartWidth, y)
    ctx.stroke()
    
    // Y轴标签
    const value = maxGsnr - (i / yTicks) * (maxGsnr - minGsnr)
    ctx.fillStyle = '#6b7280'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${value.toFixed(0)} dB`, padding.left - 8, y + 4)
  }
  
  // X轴网格线
  const xTicks = 10
  for (let i = 0; i <= xTicks; i++) {
    const x = padding.left + (i / xTicks) * chartWidth
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.moveTo(x, padding.top)
    ctx.lineTo(x, padding.top + chartHeight)
    ctx.stroke()
    ctx.setLineDash([])
    
    // X轴标签
    const value = minKp + (i / xTicks) * (maxKp - minKp)
    ctx.fillStyle = '#6b7280'
    ctx.textAlign = 'center'
    ctx.fillText(`${value.toFixed(0)}`, x, height - padding.bottom + 20)
  }
  
  // X轴标题
  ctx.fillStyle = '#374151'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('KP (km)', width / 2, height - 10)
  
  // Y轴标题
  ctx.save()
  ctx.translate(15, height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('GSNR (dB)', 0, 0)
  ctx.restore()
  
  // 绘制阈值线
  // 所需GSNR线
  const requiredY = scaleY(props.requiredGsnr)
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2
  ctx.setLineDash([8, 4])
  ctx.beginPath()
  ctx.moveTo(padding.left, requiredY)
  ctx.lineTo(padding.left + chartWidth, requiredY)
  ctx.stroke()
  ctx.setLineDash([])
  
  // 标签
  ctx.fillStyle = '#ef4444'
  ctx.textAlign = 'left'
  ctx.font = '10px sans-serif'
  ctx.fillText(`Required: ${props.requiredGsnr} dB`, padding.left + chartWidth + 5, requiredY + 4)
  
  // 警告阈值线
  const warningY = scaleY(props.requiredGsnr + props.warningThreshold)
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(padding.left, warningY)
  ctx.lineTo(padding.left + chartWidth, warningY)
  ctx.stroke()
  ctx.setLineDash([])
  
  // 绘制GSNR曲线
  if (props.data.length > 1) {
    // 渐变填充
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight)
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)')
    gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.2)')
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.1)')
    
    // 填充区域
    ctx.beginPath()
    ctx.moveTo(scaleX(props.data[0].kp), scaleY(props.data[0].gsnr))
    for (let i = 1; i < props.data.length; i++) {
      ctx.lineTo(scaleX(props.data[i].kp), scaleY(props.data[i].gsnr))
    }
    ctx.lineTo(scaleX(props.data[props.data.length - 1].kp), padding.top + chartHeight)
    ctx.lineTo(scaleX(props.data[0].kp), padding.top + chartHeight)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 曲线
    ctx.beginPath()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2.5
    ctx.moveTo(scaleX(props.data[0].kp), scaleY(props.data[0].gsnr))
    for (let i = 1; i < props.data.length; i++) {
      ctx.lineTo(scaleX(props.data[i].kp), scaleY(props.data[i].gsnr))
    }
    ctx.stroke()
    
    // 数据点
    for (const point of props.data) {
      const x = scaleX(point.kp)
      const y = scaleY(point.gsnr)
      
      // 根据余量选择颜色
      let color = '#22c55e' // 绿色 - 良好
      if (point.margin < props.warningThreshold) {
        color = '#f59e0b' // 黄色 - 警告
      }
      if (point.margin < 0) {
        color = '#ef4444' // 红色 - 不满足
      }
      
      ctx.beginPath()
      ctx.arc(x, y, point.repeaterIndex !== undefined ? 6 : 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 中继器标记
      if (props.showRepeaters && point.repeaterIndex !== undefined) {
        ctx.fillStyle = '#374151'
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`R${point.repeaterIndex}`, x, y - 12)
      }
    }
  }
  
  // 绘制边框
  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 1
  ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight)
}

// 处理鼠标移动
const handleMouseMove = (event: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas || !props.data.length) return
  
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  // 找到最近的数据点
  let closest: GSNRDataPoint | null = null
  let minDist = Infinity
  
  for (const point of props.data) {
    const px = scaleX(point.kp)
    const py = scaleY(point.gsnr)
    const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
    
    if (dist < minDist && dist < 20) {
      minDist = dist
      closest = point
    }
  }
  
  hoveredPoint.value = closest
  if (closest) {
    tooltipPosition.value = { 
      x: event.clientX + 10, 
      y: event.clientY - 10 
    }
  }
}

const handleClick = () => {
  if (hoveredPoint.value) {
    emit('point-click', hoveredPoint.value)
  }
}

const handleMouseLeave = () => {
  hoveredPoint.value = null
}

// 监听数据变化重绘
watch(() => props.data, () => {
  drawChart()
}, { deep: true })

onMounted(() => {
  drawChart()
  window.addEventListener('resize', drawChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', drawChart)
})
</script>

<template>
  <Card class="gsnr-margin-chart">
    <CardHeader class="pb-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <TrendingUp class="w-4 h-4 text-blue-500" />
        <span class="font-semibold text-sm">{{ title }}</span>
      </div>
      <div class="flex items-center gap-3">
        <!-- 状态指示 -->
        <div v-if="statistics" class="flex items-center gap-1 text-xs">
          <component 
            :is="statistics.isFeasible ? CheckCircle : AlertTriangle"
            :class="[
              'w-4 h-4',
              statistics.isFeasible ? 'text-green-500' : 'text-red-500'
            ]"
          />
          <span :class="statistics.isFeasible ? 'text-green-600' : 'text-red-600'">
            {{ statistics.isFeasible ? '满足要求' : '不满足要求' }}
          </span>
        </div>
        <button 
          class="p-1 hover:bg-gray-100 rounded transition-colors"
          @click="emit('refresh')"
          title="刷新数据"
        >
          <RefreshCw class="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </CardHeader>
    
    <CardContent class="pt-0">
      <!-- 统计信息 -->
      <div v-if="statistics" class="grid grid-cols-4 gap-2 mb-3 text-xs">
        <div class="bg-gray-50 rounded p-2 text-center">
          <div class="text-gray-500">最小余量</div>
          <div :class="[
            'font-bold',
            Number(statistics.minMargin) < 0 ? 'text-red-600' : 
            Number(statistics.minMargin) < warningThreshold ? 'text-yellow-600' : 'text-green-600'
          ]">
            {{ statistics.minMargin }} dB
          </div>
        </div>
        <div class="bg-gray-50 rounded p-2 text-center">
          <div class="text-gray-500">平均余量</div>
          <div class="font-bold text-blue-600">{{ statistics.avgMargin }} dB</div>
        </div>
        <div class="bg-gray-50 rounded p-2 text-center">
          <div class="text-gray-500">最差位置</div>
          <div class="font-bold text-gray-700">KP {{ statistics.worstKp }}</div>
        </div>
        <div class="bg-gray-50 rounded p-2 text-center">
          <div class="text-gray-500">低余量点</div>
          <div :class="[
            'font-bold',
            statistics.belowThreshold > 0 ? 'text-yellow-600' : 'text-green-600'
          ]">
            {{ statistics.belowThreshold }} 个
          </div>
        </div>
      </div>
      
      <!-- 图表容器 -->
      <div class="relative">
        <canvas
          ref="canvasRef"
          class="w-full cursor-crosshair"
          :style="{ height: `${height}px` }"
          @mousemove="handleMouseMove"
          @mouseleave="handleMouseLeave"
          @click="handleClick"
        />
        
        <!-- 悬浮提示 -->
        <div
          v-if="hoveredPoint"
          ref="tooltipRef"
          class="fixed z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          :style="{ left: `${tooltipPosition.x}px`, top: `${tooltipPosition.y}px` }"
        >
          <div class="font-medium mb-1">KP {{ hoveredPoint.kp.toFixed(1) }} km</div>
          <div class="space-y-0.5">
            <div>GSNR: <span class="font-mono">{{ hoveredPoint.gsnr.toFixed(1) }} dB</span></div>
            <div>
              余量: 
              <span 
                :class="[
                  'font-mono',
                  hoveredPoint.margin < 0 ? 'text-red-400' : 
                  hoveredPoint.margin < warningThreshold ? 'text-yellow-400' : 'text-green-400'
                ]"
              >
                {{ hoveredPoint.margin.toFixed(1) }} dB
              </span>
            </div>
            <div v-if="hoveredPoint.repeaterIndex !== undefined">
              中继器: R{{ hoveredPoint.repeaterIndex }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- 图例 -->
      <div class="flex items-center justify-center gap-6 mt-3 text-xs text-gray-600">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-green-500"></span>
          <span>良好 (余量 ≥{{ warningThreshold }}dB)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-yellow-500"></span>
          <span>警告 (0 ≤ 余量 < {{ warningThreshold }}dB)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-red-500"></span>
          <span>不满足 (余量 < 0)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 bg-red-500" style="border-top: 2px dashed"></span>
          <span>所需GSNR</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
.gsnr-margin-chart {
  @apply bg-white;
}
</style>
