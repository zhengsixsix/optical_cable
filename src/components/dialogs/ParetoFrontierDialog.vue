<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouteStore } from '@/stores'
import { X } from 'lucide-vue-next'

/**
 * ParetoFrontierDialog Pareto前沿结果弹窗
 * 显示成本vs风险散点图，当前选中路径高亮为红色
 */
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}>()

const routeStore = useRouteStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 图表配置
const chartConfig = {
  width: 450,
  height: 300,
  margin: { top: 40, right: 120, bottom: 50, left: 60 }
}

// 计算绘图区域
const plotWidth = computed(() => chartConfig.width - chartConfig.margin.left - chartConfig.margin.right)
const plotHeight = computed(() => chartConfig.height - chartConfig.margin.top - chartConfig.margin.bottom)

// Pareto路径数据
const paretoRoutes = computed(() => routeStore.paretoRoutes)
const selectedRouteId = computed(() => routeStore.selectedRoute?.id)

// 数据范围
const dataRange = computed(() => {
  const routes = paretoRoutes.value
  if (routes.length === 0) {
    return { minCost: 0, maxCost: 450, minRisk: 0, maxRisk: 12 }
  }
  
  const costs = routes.map(r => r.cost.total / 10000) // 万元
  const risks = routes.map(r => r.risk.overall * 10)   // 风险指数
  
  const minCost = Math.floor(Math.min(...costs) / 50) * 50
  const maxCost = Math.ceil(Math.max(...costs) / 50) * 50
  const maxRisk = Math.ceil(Math.max(...risks) + 1)
  
  return { minCost, maxCost, minRisk: 0, maxRisk }
})

// 坐标转换
const toCanvasX = (cost: number) => {
  const { minCost, maxCost } = dataRange.value
  return chartConfig.margin.left + ((cost - minCost) / (maxCost - minCost)) * plotWidth.value
}

const toCanvasY = (risk: number) => {
  const { minRisk, maxRisk } = dataRange.value
  return chartConfig.height - chartConfig.margin.bottom - ((risk - minRisk) / (maxRisk - minRisk)) * plotHeight.value
}

// 绘制图表
const drawChart = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const routes = paretoRoutes.value
  const { margin } = chartConfig
  const { minCost, maxCost, minRisk, maxRisk } = dataRange.value
  
  // 清空画布
  ctx.clearRect(0, 0, chartConfig.width, chartConfig.height)
  
  // 绘制标题
  ctx.fillStyle = '#1f2937'
  ctx.font = 'bold 16px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Pareto前沿结果', chartConfig.width / 2 - 30, 25)
  
  // 绘制背景网格
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  
  // 水平网格线和Y轴刻度
  const ySteps = 6
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#6b7280'
  ctx.textAlign = 'right'
  
  for (let i = 0; i <= ySteps; i++) {
    const risk = minRisk + ((maxRisk - minRisk) / ySteps) * i
    const y = toCanvasY(risk)
    
    ctx.beginPath()
    ctx.moveTo(margin.left, y)
    ctx.lineTo(chartConfig.width - margin.right, y)
    ctx.stroke()
    
    ctx.fillText(risk.toFixed(0), margin.left - 8, y + 4)
  }
  
  // 垂直网格线和X轴刻度
  const xSteps = 5
  ctx.textAlign = 'center'
  
  for (let i = 0; i <= xSteps; i++) {
    const cost = minCost + ((maxCost - minCost) / xSteps) * i
    const x = toCanvasX(cost)
    
    ctx.beginPath()
    ctx.moveTo(x, margin.top)
    ctx.lineTo(x, chartConfig.height - margin.bottom)
    ctx.stroke()
    
    ctx.fillText(cost.toFixed(0), x, chartConfig.height - margin.bottom + 18)
  }
  
  // 绘制坐标轴
  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = 1
  
  // X轴
  ctx.beginPath()
  ctx.moveTo(margin.left, chartConfig.height - margin.bottom)
  ctx.lineTo(chartConfig.width - margin.right, chartConfig.height - margin.bottom)
  ctx.stroke()
  
  // Y轴
  ctx.beginPath()
  ctx.moveTo(margin.left, margin.top)
  ctx.lineTo(margin.left, chartConfig.height - margin.bottom)
  ctx.stroke()
  
  // 轴标签
  ctx.fillStyle = '#374151'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('成本', chartConfig.width / 2 - 30, chartConfig.height - 8)
  
  ctx.save()
  ctx.translate(18, chartConfig.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('风险', 0, 0)
  ctx.restore()
  
  // 绘制数据点
  routes.forEach((route) => {
    const cost = route.cost.total / 10000
    const risk = route.risk.overall * 10
    const x = toCanvasX(cost)
    const y = toCanvasY(risk)
    const isSelected = route.id === selectedRouteId.value
    
    // 绘制点
    ctx.beginPath()
    ctx.arc(x, y, isSelected ? 10 : 8, 0, Math.PI * 2)
    ctx.fillStyle = isSelected ? '#ef4444' : '#3b82f6'
    ctx.fill()
  })
  
  // 绘制图例
  const legendX = chartConfig.width - margin.right + 15
  const legendY = margin.top + 20
  
  // 图例标题
  ctx.fillStyle = '#374151'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'left'
  
  // 当前选中路径图例
  ctx.beginPath()
  ctx.arc(legendX + 6, legendY, 6, 0, Math.PI * 2)
  ctx.fillStyle = '#ef4444'
  ctx.fill()
  ctx.fillStyle = '#374151'
  ctx.fillText('当前选中路径', legendX + 18, legendY + 4)
}

// 导出图片
const handleExport = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const link = document.createElement('a')
  link.download = `Pareto前沿图_${new Date().toLocaleDateString()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

// 关闭弹窗
const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

// 监听数据变化重绘
watch([() => paretoRoutes.value, () => selectedRouteId.value], () => {
  nextTick(() => drawChart())
}, { deep: true })

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => drawChart())
  }
})

onMounted(() => {
  if (props.visible) {
    drawChart()
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- 遮罩层 -->
      <div
        class="absolute inset-0 bg-black/30"
        @click="handleClose"
      />
      
      <!-- 弹窗内容 -->
      <div class="relative bg-white rounded-lg shadow-xl overflow-hidden">
        <!-- 关闭按钮 -->
        <button
          class="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors z-10"
          @click="handleClose"
        >
          <X class="w-5 h-5" />
        </button>
        
        <!-- 图表区域 -->
        <div class="p-4">
          <canvas
            ref="canvasRef"
            :width="chartConfig.width"
            :height="chartConfig.height"
            class="block"
          />
        </div>
        
        <!-- 底部按钮 -->
        <div class="px-4 py-3 bg-gray-50 border-t flex justify-end gap-3">
          <button
            class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors"
            @click="handleExport"
          >
            导出图片
          </button>
          <button
            class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded transition-colors"
            @click="handleClose"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
