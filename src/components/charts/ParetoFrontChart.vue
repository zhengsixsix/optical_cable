<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouteStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, Download, ZoomIn, ZoomOut, Target } from 'lucide-vue-next'

interface ParetoPoint {
  id: string
  name: string
  cost: number
  risk: number
  distance: number
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', routeId: string): void
}>()

const routeStore = useRouteStore()
const appStore = useAppStore()

const chartContainer = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)
const hoveredPoint = ref<ParetoPoint | null>(null)

const padding = { top: 40, right: 40, bottom: 50, left: 60 }

// 从store获取Pareto路径数据
const paretoPoints = computed<ParetoPoint[]>(() => {
  return routeStore.paretoRoutes.map((route, index) => ({
    id: route.id,
    name: `路径 ${index + 1}`,
    cost: route.cost.total,
    risk: route.risk.overall,
    distance: route.distance,
  }))
})

// 选中的路径
const selectedRouteId = computed(() => routeStore.selectedRoute?.id)

// 计算坐标范围
const getRange = () => {
  if (paretoPoints.value.length === 0) {
    return { minCost: 0, maxCost: 100, minRisk: 0, maxRisk: 1 }
  }
  
  const costs = paretoPoints.value.map(p => p.cost)
  const risks = paretoPoints.value.map(p => p.risk)
  
  const costRange = Math.max(...costs) - Math.min(...costs) || 1
  const riskRange = Math.max(...risks) - Math.min(...risks) || 0.1
  
  return {
    minCost: Math.min(...costs) - costRange * 0.1,
    maxCost: Math.max(...costs) + costRange * 0.1,
    minRisk: Math.max(0, Math.min(...risks) - riskRange * 0.1),
    maxRisk: Math.min(1, Math.max(...risks) + riskRange * 0.1),
  }
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
  
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  
  // 绘制背景
  c.fillStyle = '#fafafa'
  c.fillRect(padding.left, padding.top, chartWidth, chartHeight)
  
  // 绘制网格
  c.strokeStyle = '#e5e7eb'
  c.lineWidth = 1
  
  const range = getRange()
  
  // Y轴网格（风险）
  const ySteps = 5
  for (let i = 0; i <= ySteps; i++) {
    const y = padding.top + (chartHeight / ySteps) * i
    c.beginPath()
    c.moveTo(padding.left, y)
    c.lineTo(width - padding.right, y)
    c.stroke()
    
    // Y轴标签
    const value = range.maxRisk - ((range.maxRisk - range.minRisk) / ySteps) * i
    c.fillStyle = '#6b7280'
    c.font = '11px sans-serif'
    c.textAlign = 'right'
    c.fillText((value * 100).toFixed(0) + '%', padding.left - 8, y + 4)
  }
  
  // X轴网格（成本）
  const xSteps = 5
  for (let i = 0; i <= xSteps; i++) {
    const x = padding.left + (chartWidth / xSteps) * i
    c.beginPath()
    c.moveTo(x, padding.top)
    c.lineTo(x, height - padding.bottom)
    c.stroke()
    
    // X轴标签
    const value = range.minCost + ((range.maxCost - range.minCost) / xSteps) * i
    c.fillStyle = '#6b7280'
    c.textAlign = 'center'
    c.fillText(formatCost(value), x, height - padding.bottom + 20)
  }
  
  // 坐标轴标题
  c.fillStyle = '#374151'
  c.font = '12px sans-serif'
  c.textAlign = 'center'
  c.fillText('成本', width / 2, height - 10)
  
  c.save()
  c.translate(15, height / 2)
  c.rotate(-Math.PI / 2)
  c.fillText('风险', 0, 0)
  c.restore()
  
  // 绘制Pareto前沿线
  if (paretoPoints.value.length > 1) {
    const sortedPoints = [...paretoPoints.value].sort((a, b) => a.cost - b.cost)
    
    c.strokeStyle = '#3b82f6'
    c.lineWidth = 2
    c.setLineDash([5, 5])
    c.beginPath()
    
    sortedPoints.forEach((point, i) => {
      const x = padding.left + ((point.cost - range.minCost) / (range.maxCost - range.minCost)) * chartWidth
      const y = padding.top + ((range.maxRisk - point.risk) / (range.maxRisk - range.minRisk)) * chartHeight
      
      if (i === 0) {
        c.moveTo(x, y)
      } else {
        c.lineTo(x, y)
      }
    })
    
    c.stroke()
    c.setLineDash([])
  }
  
  // 绘制数据点
  paretoPoints.value.forEach(point => {
    const x = padding.left + ((point.cost - range.minCost) / (range.maxCost - range.minCost)) * chartWidth
    const y = padding.top + ((range.maxRisk - point.risk) / (range.maxRisk - range.minRisk)) * chartHeight
    
    const isSelected = point.id === selectedRouteId.value
    const isHovered = point.id === hoveredPoint.value?.id
    
    // 绘制点
    c.beginPath()
    c.arc(x, y, isSelected ? 10 : isHovered ? 8 : 6, 0, Math.PI * 2)
    c.fillStyle = isSelected ? '#2563eb' : isHovered ? '#3b82f6' : '#60a5fa'
    c.fill()
    
    if (isSelected) {
      c.strokeStyle = '#1d4ed8'
      c.lineWidth = 3
      c.stroke()
    }
    
    // 绘制标签
    if (isSelected || isHovered) {
      c.fillStyle = '#1f2937'
      c.font = 'bold 11px sans-serif'
      c.textAlign = 'center'
      c.fillText(point.name, x, y - 15)
    }
  })
  
  // 图表标题
  c.fillStyle = '#111827'
  c.font = 'bold 14px sans-serif'
  c.textAlign = 'center'
  c.fillText('Pareto 前沿图（成本 vs 风险）', width / 2, 20)
}

// 格式化成本
const formatCost = (cost: number) => {
  if (cost >= 1000000) return `$${(cost / 1000000).toFixed(1)}M`
  if (cost >= 1000) return `$${(cost / 1000).toFixed(0)}K`
  return `$${cost.toFixed(0)}`
}

// 鼠标移动处理
const handleMouseMove = (e: MouseEvent) => {
  if (!chartContainer.value || paretoPoints.value.length === 0) return
  
  const rect = chartContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  const range = getRange()
  const chartWidth = chartContainer.value.width - padding.left - padding.right
  const chartHeight = chartContainer.value.height - padding.top - padding.bottom
  
  // 查找最近的点
  let closest: ParetoPoint | null = null
  let minDist = 20 // 最小检测距离
  
  paretoPoints.value.forEach(point => {
    const px = padding.left + ((point.cost - range.minCost) / (range.maxCost - range.minCost)) * chartWidth
    const py = padding.top + ((range.maxRisk - point.risk) / (range.maxRisk - range.minRisk)) * chartHeight
    
    const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2))
    if (dist < minDist) {
      minDist = dist
      closest = point
    }
  })
  
  hoveredPoint.value = closest
  drawChart()
}

// 点击处理
const handleClick = (e: MouseEvent) => {
  if (hoveredPoint.value) {
    routeStore.selectRoute(hoveredPoint.value.id)
    emit('select', hoveredPoint.value.id)
  }
}

// 导出图片
const handleExport = () => {
  if (!chartContainer.value) return
  
  const link = document.createElement('a')
  link.download = `Pareto前沿图_${new Date().toISOString().slice(0, 10)}.png`
  link.href = chartContainer.value.toDataURL('image/png')
  link.click()
  
  appStore.showNotification({ type: 'success', message: '图片已导出' })
}

// 初始化
const initCanvas = () => {
  if (!chartContainer.value) return
  
  chartContainer.value.width = 500
  chartContainer.value.height = 350
  ctx.value = chartContainer.value.getContext('2d')
  drawChart()
}

onMounted(() => {
  if (props.visible) {
    initCanvas()
  }
})

watch(() => props.visible, (visible) => {
  if (visible) {
    setTimeout(initCanvas, 100)
  }
})

watch(() => paretoPoints.value, () => {
  drawChart()
}, { deep: true })

watch(() => selectedRouteId.value, () => {
  drawChart()
})
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[560px] bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b">
          <div class="flex items-center gap-2">
            <Target class="w-5 h-5 text-blue-500" />
            <span class="font-semibold">Pareto 前沿分析</span>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" @click="handleExport">
              <Download class="w-4 h-4 mr-1" />
              导出
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent class="p-4">
          <div v-if="paretoPoints.length === 0" class="h-[350px] flex items-center justify-center text-gray-500">
            <div class="text-center">
              <Target class="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p class="font-medium">暂无Pareto路径数据</p>
              <p class="text-sm mt-1">请先进行路由规划计算</p>
            </div>
          </div>
          
          <canvas 
            v-else
            ref="chartContainer"
            class="cursor-crosshair"
            @mousemove="handleMouseMove"
            @mouseleave="hoveredPoint = null; drawChart()"
            @click="handleClick"
          />
          
          <!-- 选中路径信息 -->
          <div v-if="hoveredPoint" class="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div class="font-medium text-blue-700">{{ hoveredPoint.name }}</div>
            <div class="grid grid-cols-3 gap-4 mt-2 text-sm">
              <div>
                <span class="text-gray-500">成本:</span>
                <span class="ml-1 font-medium">{{ formatCost(hoveredPoint.cost) }}</span>
              </div>
              <div>
                <span class="text-gray-500">风险:</span>
                <span class="ml-1 font-medium">{{ (hoveredPoint.risk * 100).toFixed(1) }}%</span>
              </div>
              <div>
                <span class="text-gray-500">距离:</span>
                <span class="ml-1 font-medium">{{ hoveredPoint.distance.toFixed(1) }} km</span>
              </div>
            </div>
          </div>
          
          <!-- 图例说明 -->
          <div class="mt-3 flex items-center justify-center gap-6 text-xs text-gray-500">
            <div class="flex items-center gap-1">
              <div class="w-3 h-3 rounded-full bg-blue-400" />
              <span>候选路径</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-blue-800" />
              <span>已选路径</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="w-8 border-t-2 border-dashed border-blue-500" />
              <span>Pareto前沿</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>
