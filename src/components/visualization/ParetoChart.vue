<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouteStore } from '@/stores'
import type { Route } from '@/types'

/**
 * ParetoChart Pareto 散点图组件
 * 可视化成本与风险的权衡关系
 */
interface Props {
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  width: 280,
  height: 200
})

const emit = defineEmits<{
  (e: 'select-route', routeId: string): void
}>()

const routeStore = useRouteStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 图表边距
const margin = { top: 20, right: 20, bottom: 40, left: 50 }

// 计算绘图区域尺寸
const chartWidth = computed(() => props.width - margin.left - margin.right)
const chartHeight = computed(() => props.height - margin.top - margin.bottom)

// 数据范围
const dataRange = computed(() => {
  const routes = routeStore.paretoRoutes
  if (routes.length === 0) return { minCost: 0, maxCost: 100, minRisk: 0, maxRisk: 1 }
  
  const costs = routes.map(r => r.cost.total / 1000000) // 转换为百万
  const risks = routes.map(r => r.risk.overall)
  
  return {
    minCost: Math.min(...costs) * 0.9,
    maxCost: Math.max(...costs) * 1.1,
    minRisk: 0,
    maxRisk: Math.min(1, Math.max(...risks) * 1.2)
  }
})

// 坐标转换
const toCanvasX = (cost: number) => {
  const { minCost, maxCost } = dataRange.value
  return margin.left + ((cost - minCost) / (maxCost - minCost)) * chartWidth.value
}

const toCanvasY = (risk: number) => {
  const { minRisk, maxRisk } = dataRange.value
  return props.height - margin.bottom - ((risk - minRisk) / (maxRisk - minRisk)) * chartHeight.value
}

// 绘制图表
const drawChart = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const routes = routeStore.paretoRoutes
  const selectedId = routeStore.selectedRoute?.id
  
  // 清空画布
  ctx.clearRect(0, 0, props.width, props.height)
  
  // 绘制背景网格
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  
  // 水平网格线
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (chartHeight.value / 4) * i
    ctx.beginPath()
    ctx.moveTo(margin.left, y)
    ctx.lineTo(props.width - margin.right, y)
    ctx.stroke()
  }
  
  // 垂直网格线
  for (let i = 0; i <= 4; i++) {
    const x = margin.left + (chartWidth.value / 4) * i
    ctx.beginPath()
    ctx.moveTo(x, margin.top)
    ctx.lineTo(x, props.height - margin.bottom)
    ctx.stroke()
  }
  
  // 绘制坐标轴
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 2
  
  // X 轴
  ctx.beginPath()
  ctx.moveTo(margin.left, props.height - margin.bottom)
  ctx.lineTo(props.width - margin.right, props.height - margin.bottom)
  ctx.stroke()
  
  // Y 轴
  ctx.beginPath()
  ctx.moveTo(margin.left, margin.top)
  ctx.lineTo(margin.left, props.height - margin.bottom)
  ctx.stroke()
  
  // 绘制轴标签
  ctx.fillStyle = '#6b7280'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  
  // X 轴标签
  ctx.fillText('成本 ($M)', props.width / 2, props.height - 5)
  
  // Y 轴标签
  ctx.save()
  ctx.translate(12, props.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('风险', 0, 0)
  ctx.restore()
  
  // 绘制刻度
  const { minCost, maxCost, minRisk, maxRisk } = dataRange.value
  ctx.font = '9px sans-serif'
  ctx.fillStyle = '#9ca3af'
  
  // X 轴刻度
  for (let i = 0; i <= 4; i++) {
    const cost = minCost + ((maxCost - minCost) / 4) * i
    const x = toCanvasX(cost)
    ctx.fillText(cost.toFixed(0), x, props.height - margin.bottom + 15)
  }
  
  // Y 轴刻度
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const risk = minRisk + ((maxRisk - minRisk) / 4) * i
    const y = toCanvasY(risk)
    ctx.fillText((risk * 100).toFixed(0) + '%', margin.left - 5, y + 3)
  }
  
  // 绘制数据点
  routes.forEach((route, index) => {
    const cost = route.cost.total / 1000000
    const risk = route.risk.overall
    const x = toCanvasX(cost)
    const y = toCanvasY(risk)
    const isSelected = route.id === selectedId
    
    // 点的样式
    const radius = isSelected ? 8 : 6
    const colors = ['#3b82f6', '#10b981', '#f59e0b'] // 蓝、绿、橙
    const color = colors[index % colors.length]
    
    // 绘制点
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = isSelected ? color : color + '99'
    ctx.fill()
    
    if (isSelected) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
    }
    
    // 标签
    ctx.fillStyle = '#374151'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`路径${index + 1}`, x, y - 12)
  })
  
  // 绘制 Pareto 前沿线
  if (routes.length >= 2) {
    const sortedRoutes = [...routes].sort((a, b) => a.cost.total - b.cost.total)
    
    ctx.beginPath()
    ctx.strokeStyle = '#6366f1'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 3])
    
    sortedRoutes.forEach((route, i) => {
      const x = toCanvasX(route.cost.total / 1000000)
      const y = toCanvasY(route.risk.overall)
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    ctx.stroke()
    ctx.setLineDash([])
  }
}

// 处理点击事件
const handleClick = (e: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  // 检查是否点击了某个数据点
  const routes = routeStore.paretoRoutes
  for (const route of routes) {
    const pointX = toCanvasX(route.cost.total / 1000000)
    const pointY = toCanvasY(route.risk.overall)
    const distance = Math.sqrt((x - pointX) ** 2 + (y - pointY) ** 2)
    
    if (distance <= 10) {
      routeStore.selectRoute(route.id)
      emit('select-route', route.id)
      break
    }
  }
}

// 监听数据变化重绘
watch(() => [routeStore.paretoRoutes, routeStore.selectedRoute], () => {
  drawChart()
}, { deep: true })

onMounted(() => {
  drawChart()
})
</script>

<template>
  <div class="pareto-chart">
    <div class="text-xs font-medium text-gray-700 mb-2 text-center">
      Pareto 最优前沿
    </div>
    <canvas
      ref="canvasRef"
      :width="width"
      :height="height"
      class="cursor-pointer"
      @click="handleClick"
    />
    <div class="flex justify-center gap-3 mt-2 text-xs text-gray-500">
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 bg-blue-500 rounded-full"></span> 低成本
      </span>
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 bg-green-500 rounded-full"></span> 均衡
      </span>
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 bg-orange-500 rounded-full"></span> 低风险
      </span>
    </div>
  </div>
</template>

<style scoped>
.pareto-chart {
  padding: 8px;
}
</style>
