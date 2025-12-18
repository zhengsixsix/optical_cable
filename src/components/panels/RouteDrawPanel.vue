<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouteStore, useAppStore } from '@/stores'
import { MapPin, Navigation, Plus, Trash2, Check, X, GripVertical } from 'lucide-vue-next'
import { Button } from '@/components/ui'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'add-point', lon: number, lat: number): void
  (e: 'complete'): void
}>()

const routeStore = useRouteStore()
const appStore = useAppStore()

// 拖拽相关
const panelRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const panelPosition = ref({ x: 16, y: 64 })

const startDrag = (e: MouseEvent) => {
  if (!panelRef.value) return
  isDragging.value = true
  dragOffset.value = {
    x: e.clientX - panelPosition.value.x,
    y: e.clientY - panelPosition.value.y
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

const onDrag = (e: MouseEvent) => {
  if (!isDragging.value) return
  const newX = e.clientX - dragOffset.value.x
  const newY = e.clientY - dragOffset.value.y
  
  // 限制在父容器内
  const maxX = window.innerWidth - 288
  const maxY = window.innerHeight - 100
  
  panelPosition.value = {
    x: Math.max(0, Math.min(newX, maxX)),
    y: Math.max(0, Math.min(newY, maxY))
  }
}

const stopDrag = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 手动输入的经纬度
const inputLon = ref('')
const inputLat = ref('')

// 当前绘制阶段
const drawingPhase = computed(() => {
  const pointCount = routeStore.drawingPoints.length
  if (pointCount === 0) return 'start'
  if (pointCount === 1) return 'end'
  return 'waypoint'
})

// 阶段提示文字
const phaseTitle = computed(() => {
  switch (drawingPhase.value) {
    case 'start': return '设置路径起点'
    case 'end': return '设置路径终点'
    default: return '添加途经点 (可选)'
  }
})

const phaseHint = computed(() => {
  switch (drawingPhase.value) {
    case 'start': return '在地图上点击选择起点，或手动输入经纬度'
    case 'end': return '在地图上点击选择终点，或手动输入经纬度'
    default: return '继续添加途经点，或点击"完成绘制"开始规划'
  }
})

// 验证输入
const isValidInput = computed(() => {
  const lon = parseFloat(inputLon.value)
  const lat = parseFloat(inputLat.value)
  return !isNaN(lon) && !isNaN(lat) && 
         lon >= -180 && lon <= 180 && 
         lat >= -90 && lat <= 90
})

// 手动添加点
const handleAddPoint = () => {
  if (!isValidInput.value) {
    appStore.showNotification({ type: 'error', message: '请输入有效的经纬度' })
    return
  }
  
  const lon = parseFloat(inputLon.value)
  const lat = parseFloat(inputLat.value)
  
  emit('add-point', lon, lat)
  
  // 清空输入
  inputLon.value = ''
  inputLat.value = ''
  
  const pointType = drawingPhase.value === 'start' ? '起点' : 
                    drawingPhase.value === 'end' ? '终点' : '途经点'
  appStore.showNotification({ type: 'success', message: `已添加${pointType}` })
}

// 删除最后一个点
const handleRemoveLastPoint = () => {
  if (routeStore.drawingPoints.length > 0) {
    const lastPoint = routeStore.drawingPoints[routeStore.drawingPoints.length - 1]
    routeStore.removePoint(lastPoint.id)
    appStore.showNotification({ type: 'info', message: '已删除最后一个点' })
  }
}

// 完成绘制
const handleComplete = () => {
  if (routeStore.drawingPoints.length < 2) {
    appStore.showNotification({ type: 'warning', message: '至少需要起点和终点' })
    return
  }
  emit('complete')
}

// 取消绘制
const handleCancel = () => {
  routeStore.clearDrawing()
  emit('close')
}

// 更新地图点击添加的坐标
const updateFromMapClick = (lon: number, lat: number) => {
  inputLon.value = lon.toFixed(6)
  inputLat.value = lat.toFixed(6)
}

// 暴露方法给父组件
defineExpose({
  updateFromMapClick
})
</script>

<template>
  <div
    v-if="visible"
    ref="panelRef"
    class="fixed z-20 bg-white rounded-lg shadow-lg w-72 overflow-hidden"
    :style="{ left: panelPosition.x + 'px', top: panelPosition.y + 'px' }"
  >
    <!-- 标题 - 可拖拽 -->
    <div 
      class="px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white cursor-move select-none"
      @mousedown="startDrag"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <GripVertical class="w-4 h-4 opacity-60" />
          <Navigation class="w-5 h-5" />
          <span class="font-semibold">路径绘制</span>
        </div>
        <button 
          class="hover:bg-white/20 p-1 rounded transition-colors"
          @click.stop="handleCancel"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 当前阶段提示 -->
    <div class="px-4 py-3 bg-blue-50 border-b">
      <div class="flex items-center gap-2 text-blue-700">
        <MapPin class="w-4 h-4" />
        <span class="font-medium">{{ phaseTitle }}</span>
      </div>
      <p class="text-xs text-blue-600 mt-1">{{ phaseHint }}</p>
    </div>

    <!-- 已添加的点列表 -->
    <div v-if="routeStore.drawingPoints.length > 0" class="px-4 py-2 border-b bg-gray-50 max-h-32 overflow-auto">
      <div class="text-xs text-gray-500 mb-1">已添加 {{ routeStore.drawingPoints.length }} 个点</div>
      <div 
        v-for="(point, index) in routeStore.drawingPoints" 
        :key="point.id"
        class="flex items-center justify-between py-1 text-xs"
      >
        <span class="text-gray-700">
          {{ index === 0 ? '起点' : index === routeStore.drawingPoints.length - 1 && index > 0 ? '终点' : `点${index + 1}` }}
        </span>
        <span class="text-gray-500 font-mono">
          {{ point.coordinates[0].toFixed(4) }}, {{ point.coordinates[1].toFixed(4) }}
        </span>
      </div>
    </div>

    <!-- 经纬度输入 -->
    <div class="p-4 space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-gray-500 mb-1">经度 (Lon)</label>
          <input
            v-model="inputLon"
            type="text"
            placeholder="-180 ~ 180"
            class="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">纬度 (Lat)</label>
          <input
            v-model="inputLat"
            type="text"
            placeholder="-90 ~ 90"
            class="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
        </div>
      </div>

      <div class="flex gap-2">
        <Button 
          size="sm" 
          class="flex-1"
          :disabled="!isValidInput"
          @click="handleAddPoint"
        >
          <Plus class="w-4 h-4 mr-1" />
          添加{{ drawingPhase === 'start' ? '起点' : drawingPhase === 'end' ? '终点' : '点' }}
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          :disabled="routeStore.drawingPoints.length === 0"
          @click="handleRemoveLastPoint"
        >
          <Trash2 class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="px-4 py-3 border-t bg-gray-50 flex gap-2">
      <Button 
        variant="ghost" 
        size="sm" 
        class="flex-1"
        @click="handleCancel"
      >
        取消
      </Button>
      <Button 
        size="sm" 
        class="flex-1"
        :disabled="routeStore.drawingPoints.length < 2"
        @click="handleComplete"
      >
        <Check class="w-4 h-4 mr-1" />
        完成绘制
      </Button>
    </div>
  </div>
</template>
