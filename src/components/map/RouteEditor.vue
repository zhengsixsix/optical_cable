<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouteStore, useMapStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { 
  Edit3, 
  Save, 
  X,
  Plus,
  Trash2,
  Move,
  MousePointer,
  Undo,
  Redo,
  MapPin,
  Route as RouteIcon
} from 'lucide-vue-next'

const props = defineProps<{
  routeId?: string
  active?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', points: EditablePoint[]): void
  (e: 'point-select', point: EditablePoint): void
  (e: 'point-move', point: EditablePoint, newPosition: [number, number]): void
}>()

const routeStore = useRouteStore()
const mapStore = useMapStore()
const appStore = useAppStore()

interface EditablePoint {
  id: string
  index: number
  coordinates: [number, number]
  type: 'landing' | 'repeater' | 'branching' | 'waypoint'
  name?: string
  isDragging?: boolean
  isSelected?: boolean
  isNew?: boolean
}

interface HistoryState {
  points: EditablePoint[]
  action: string
}

const editMode = ref<'select' | 'move' | 'add' | 'delete'>('select')
const points = ref<EditablePoint[]>([])
const selectedPointId = ref<string | null>(null)
const hoveredPointId = ref<string | null>(null)
const isDragging = ref(false)
const dragStartPos = ref<[number, number] | null>(null)

const history = ref<HistoryState[]>([])
const historyIndex = ref(-1)
const maxHistory = 50

const selectedPoint = computed(() => 
  points.value.find(p => p.id === selectedPointId.value) || null
)

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

function initPoints() {
  const route = routeStore.routes.find(r => r.id === props.routeId)
  if (route?.points) {
    points.value = route.points.map((p, index) => ({
      id: `point-${index}`,
      index,
      coordinates: p.coordinates as [number, number],
      type: p.type as EditablePoint['type'],
      name: p.name,
      isDragging: false,
      isSelected: false,
      isNew: false,
    }))
  } else {
    generateMockPoints()
  }
  saveHistory('初始化')
}

function generateMockPoints() {
  const mockRoute: Array<{ coords: [number, number], type: EditablePoint['type'], name?: string }> = [
    { coords: [121.4737, 31.2304], type: 'landing', name: '上海登陆站' },
    { coords: [122.1, 30.8], type: 'waypoint' },
    { coords: [123.0, 30.2], type: 'waypoint' },
    { coords: [124.0, 29.5], type: 'repeater', name: 'REP-01' },
    { coords: [125.2, 28.5], type: 'waypoint' },
    { coords: [126.5, 27.5], type: 'repeater', name: 'REP-02' },
    { coords: [127.5, 26.5], type: 'branching', name: 'BU-01' },
    { coords: [128.5, 25.5], type: 'waypoint' },
    { coords: [129.5, 24.5], type: 'repeater', name: 'REP-03' },
    { coords: [130.5, 23.5], type: 'waypoint' },
    { coords: [131.5, 22.5], type: 'repeater', name: 'REP-04' },
    { coords: [132.3, 21.8], type: 'waypoint' },
    { coords: [132.8, 21.5], type: 'landing', name: '冲绳登陆站' },
  ]

  points.value = mockRoute.map((p, index) => ({
    id: `point-${index}`,
    index,
    coordinates: p.coords,
    type: p.type,
    name: p.name,
    isDragging: false,
    isSelected: false,
    isNew: false,
  }))
}

function saveHistory(action: string) {
  // 删除当前位置之后的历史
  if (historyIndex.value < history.value.length - 1) {
    history.value = history.value.slice(0, historyIndex.value + 1)
  }
  
  // 添加新状态
  history.value.push({
    points: JSON.parse(JSON.stringify(points.value)),
    action,
  })
  
  // 限制历史长度
  if (history.value.length > maxHistory) {
    history.value.shift()
  }
  
  historyIndex.value = history.value.length - 1
}

function undo() {
  if (!canUndo.value) return
  historyIndex.value--
  points.value = JSON.parse(JSON.stringify(history.value[historyIndex.value].points))
  appStore.showNotification({ type: 'info', message: '已撤销' })
}

function redo() {
  if (!canRedo.value) return
  historyIndex.value++
  points.value = JSON.parse(JSON.stringify(history.value[historyIndex.value].points))
  appStore.showNotification({ type: 'info', message: '已重做' })
}

function selectPoint(pointId: string) {
  if (editMode.value === 'delete') {
    deletePoint(pointId)
    return
  }
  
  points.value.forEach(p => p.isSelected = false)
  const point = points.value.find(p => p.id === pointId)
  if (point) {
    point.isSelected = true
    selectedPointId.value = pointId
    emit('point-select', point)
  }
}

function startDrag(pointId: string, event: MouseEvent) {
  if (editMode.value !== 'move') return
  
  const point = points.value.find(p => p.id === pointId)
  if (point) {
    isDragging.value = true
    point.isDragging = true
    dragStartPos.value = [event.clientX, event.clientY]
    selectedPointId.value = pointId
  }
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value || !selectedPointId.value) return
  
  const point = points.value.find(p => p.id === selectedPointId.value)
  if (!point || !dragStartPos.value) return
  
  // 模拟坐标转换 (实际应使用地图API)
  const deltaX = (event.clientX - dragStartPos.value[0]) * 0.01
  const deltaY = (event.clientY - dragStartPos.value[1]) * -0.01
  
  point.coordinates = [
    point.coordinates[0] + deltaX,
    point.coordinates[1] + deltaY,
  ]
  
  dragStartPos.value = [event.clientX, event.clientY]
}

function endDrag() {
  if (!isDragging.value) return
  
  const point = points.value.find(p => p.id === selectedPointId.value)
  if (point) {
    point.isDragging = false
    emit('point-move', point, point.coordinates)
    saveHistory(`移动点 ${point.name || point.index}`)
  }
  
  isDragging.value = false
  dragStartPos.value = null
}

function addPoint(afterPointId?: string) {
  let insertIndex = points.value.length
  let newCoords: [number, number] = [125, 28]
  
  if (afterPointId) {
    const afterPoint = points.value.find(p => p.id === afterPointId)
    if (afterPoint) {
      insertIndex = afterPoint.index + 1
      const nextPoint = points.value[insertIndex]
      if (nextPoint) {
        newCoords = [
          (afterPoint.coordinates[0] + nextPoint.coordinates[0]) / 2,
          (afterPoint.coordinates[1] + nextPoint.coordinates[1]) / 2,
        ]
      } else {
        newCoords = [
          afterPoint.coordinates[0] + 1,
          afterPoint.coordinates[1] - 0.5,
        ]
      }
    }
  }
  
  const newPoint: EditablePoint = {
    id: `point-${Date.now()}`,
    index: insertIndex,
    coordinates: newCoords,
    type: 'waypoint',
    isDragging: false,
    isSelected: true,
    isNew: true,
  }
  
  points.value.splice(insertIndex, 0, newPoint)
  reindex()
  selectedPointId.value = newPoint.id
  saveHistory('添加点')
  appStore.showNotification({ type: 'success', message: '已添加航路点' })
}

function deletePoint(pointId: string) {
  const point = points.value.find(p => p.id === pointId)
  if (!point) return
  
  if (point.type === 'landing') {
    appStore.showNotification({ type: 'warning', message: '不能删除登陆站' })
    return
  }
  
  points.value = points.value.filter(p => p.id !== pointId)
  reindex()
  
  if (selectedPointId.value === pointId) {
    selectedPointId.value = null
  }
  
  saveHistory(`删除点 ${point.name || point.index}`)
  appStore.showNotification({ type: 'success', message: '已删除点' })
}

function reindex() {
  points.value.forEach((p, i) => p.index = i)
}

function updatePointType(pointId: string, type: EditablePoint['type']) {
  const point = points.value.find(p => p.id === pointId)
  if (point) {
    point.type = type
    saveHistory(`更改点类型为 ${type}`)
  }
}

function updatePointName(pointId: string, name: string) {
  const point = points.value.find(p => p.id === pointId)
  if (point) {
    point.name = name
  }
}

function handleSave() {
  emit('save', points.value)
  appStore.showNotification({ type: 'success', message: '路径已保存' })
}

function handleKeyDown(event: KeyboardEvent) {
  if (!props.active) return
  
  if (event.ctrlKey || event.metaKey) {
    if (event.key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
    } else if (event.key === 's') {
      event.preventDefault()
      handleSave()
    }
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedPointId.value) {
      deletePoint(selectedPointId.value)
    }
  } else if (event.key === 'Escape') {
    selectedPointId.value = null
    points.value.forEach(p => p.isSelected = false)
  }
}

const totalLength = computed(() => {
  let length = 0
  for (let i = 1; i < points.value.length; i++) {
    const p1 = points.value[i - 1].coordinates
    const p2 = points.value[i].coordinates
    const dx = (p2[0] - p1[0]) * 111
    const dy = (p2[1] - p1[1]) * 111
    length += Math.sqrt(dx * dx + dy * dy)
  }
  return length
})

onMounted(() => {
  initPoints()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
})

watch(() => props.routeId, () => {
  initPoints()
})
</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden">
    <CardHeader class="shrink-0 border-b">
      <div class="flex items-center gap-2">
        <Edit3 class="w-5 h-5 text-green-600" />
        <span class="font-semibold">路径编辑器</span>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" :disabled="!canUndo" @click="undo">
          <Undo class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" :disabled="!canRedo" @click="redo">
          <Redo class="w-4 h-4" />
        </Button>
        <Button size="sm" @click="handleSave">
          <Save class="w-4 h-4 mr-1" />
          保存
        </Button>
        <Button variant="ghost" size="sm" @click="emit('close')">
          <X class="w-4 h-4" />
        </Button>
      </div>
    </CardHeader>

    <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
      <!-- 工具栏 -->
      <div class="px-4 py-2 border-b flex items-center gap-2 bg-gray-50">
        <div class="flex items-center gap-1 bg-white rounded-lg border p-1">
          <button 
            :class="['p-2 rounded', editMode === 'select' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100']"
            title="选择模式"
            @click="editMode = 'select'"
          >
            <MousePointer class="w-4 h-4" />
          </button>
          <button 
            :class="['p-2 rounded', editMode === 'move' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100']"
            title="移动模式"
            @click="editMode = 'move'"
          >
            <Move class="w-4 h-4" />
          </button>
          <button 
            :class="['p-2 rounded', editMode === 'add' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100']"
            title="添加点"
            @click="editMode = 'add'"
          >
            <Plus class="w-4 h-4" />
          </button>
          <button 
            :class="['p-2 rounded', editMode === 'delete' ? 'bg-red-100 text-red-700' : 'hover:bg-gray-100']"
            title="删除模式"
            @click="editMode = 'delete'"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
        <div class="flex-1" />
        <span class="text-sm text-gray-500">
          {{ points.length }} 个点 · {{ totalLength.toFixed(1) }} km
        </span>
      </div>

      <!-- 点列表 -->
      <div class="flex-1 overflow-auto">
        <div class="divide-y">
          <div 
            v-for="point in points"
            :key="point.id"
            :class="[
              'px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors',
              point.isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50',
              point.isDragging ? 'opacity-50' : ''
            ]"
            @click="selectPoint(point.id)"
            @mousedown="startDrag(point.id, $event)"
          >
            <div class="w-6 text-center text-xs text-gray-400">{{ point.index + 1 }}</div>
            
            <div :class="[
              'w-3 h-3 rounded-full',
              point.type === 'landing' ? 'bg-green-500' :
              point.type === 'repeater' ? 'bg-blue-500' :
              point.type === 'branching' ? 'bg-purple-500' : 'bg-gray-400'
            ]" />
            
            <div class="flex-1 min-w-0">
              <div v-if="point.name" class="text-sm font-medium truncate">{{ point.name }}</div>
              <div class="text-xs text-gray-500 font-mono">
                {{ point.coordinates[0].toFixed(4) }}, {{ point.coordinates[1].toFixed(4) }}
              </div>
            </div>
            
            <div class="flex items-center gap-1">
              <select 
                :value="point.type"
                class="text-xs px-2 py-1 border rounded bg-white"
                @change="updatePointType(point.id, ($event.target as HTMLSelectElement).value as EditablePoint['type'])"
                @click.stop
              >
                <option value="landing">登陆站</option>
                <option value="repeater">中继器</option>
                <option value="branching">分支器</option>
                <option value="waypoint">航路点</option>
              </select>
              
              <button 
                v-if="editMode === 'add'"
                class="p-1 hover:bg-blue-100 rounded text-blue-600"
                title="在此点后添加"
                @click.stop="addPoint(point.id)"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 选中点详情 -->
      <div v-if="selectedPoint" class="px-4 py-3 border-t bg-gray-50 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">点 #{{ selectedPoint.index + 1 }}</span>
          <button 
            v-if="selectedPoint.type !== 'landing'"
            class="text-xs text-red-600 hover:underline"
            @click="deletePoint(selectedPoint.id)"
          >
            删除此点
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs text-gray-500 mb-1">名称</label>
            <input 
              :value="selectedPoint.name || ''"
              type="text"
              class="w-full px-2 py-1 text-sm border rounded"
              placeholder="可选名称"
              @input="updatePointName(selectedPoint.id, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">类型</label>
            <select 
              :value="selectedPoint.type"
              class="w-full px-2 py-1 text-sm border rounded"
              @change="updatePointType(selectedPoint.id, ($event.target as HTMLSelectElement).value as EditablePoint['type'])"
            >
              <option value="landing">登陆站</option>
              <option value="repeater">中继器</option>
              <option value="branching">分支器</option>
              <option value="waypoint">航路点</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs text-gray-500 mb-1">经度</label>
            <input 
              :value="selectedPoint.coordinates[0].toFixed(6)"
              type="number"
              step="0.000001"
              class="w-full px-2 py-1 text-sm border rounded font-mono"
              readonly
            />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">纬度</label>
            <input 
              :value="selectedPoint.coordinates[1].toFixed(6)"
              type="number"
              step="0.000001"
              class="w-full px-2 py-1 text-sm border rounded font-mono"
              readonly
            />
          </div>
        </div>
      </div>

      <!-- 操作提示 -->
      <div class="px-4 py-2 border-t bg-blue-50 text-xs text-blue-700">
        <span v-if="editMode === 'select'">点击选择点 · Ctrl+Z 撤销 · Delete 删除</span>
        <span v-else-if="editMode === 'move'">拖拽移动点位置</span>
        <span v-else-if="editMode === 'add'">点击 + 按钮在该点后添加新点</span>
        <span v-else-if="editMode === 'delete'">点击要删除的点</span>
      </div>
    </CardContent>
  </Card>
</template>
