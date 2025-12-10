<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Upload, X, FileText, Loader2, Check, AlertCircle, Trash2 } from 'lucide-vue-next'
import { useAppStore, useLayerStore } from '@/stores'
import { Button } from '@/components/ui'

interface Props {
  visible: boolean
}

interface GisLayerItem {
  id: string
  name: string
  required: boolean
  checked: boolean
  filePath: string
  status: 'none' | 'pending' | 'success' | 'error'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success'): void
}>()

const appStore = useAppStore()
const layerStore = useLayerStore()

const dataSource = ref<'local' | 'server' | 'web'>('local')
const isDragging = ref(false)
const isProcessing = ref(false)
const coordinateSystem = ref('')
const processOption = ref('default')
const showPreview = ref(true)
const droppedFiles = ref<File[]>([])

const gisLayers = ref<GisLayerItem[]>([
  { id: 'elevation', name: '海洋高程', required: true, checked: true, filePath: '', status: 'none' },
  { id: 'slope', name: '海洋坡度', required: true, checked: true, filePath: '', status: 'none' },
  { id: 'fishing', name: '海洋渔区分布', required: false, checked: false, filePath: '', status: 'none' },
  { id: 'volcano', name: '火山区域', required: false, checked: false, filePath: '', status: 'none' },
  { id: 'earthquake', name: '地震活动', required: false, checked: false, filePath: '', status: 'none' },
  { id: 'shipping', name: '航道分布', required: false, checked: false, filePath: '', status: 'none' },
])

const allChecked = computed(() => gisLayers.value.every(l => l.checked))
const someChecked = computed(() => gisLayers.value.some(l => l.checked) && !allChecked.value)

const canImport = computed(() => {
  const requiredLayers = gisLayers.value.filter(l => l.required && l.checked)
  return requiredLayers.every(l => l.filePath)
})

watch(() => props.visible, (val) => {
  if (val) {
    resetForm()
  }
})

function resetForm() {
  dataSource.value = 'local'
  droppedFiles.value = []
  coordinateSystem.value = ''
  processOption.value = 'default'
  showPreview.value = true
  gisLayers.value.forEach(layer => {
    layer.filePath = ''
    layer.status = 'none'
    layer.checked = layer.required
  })
}

function handleSelectAll(checked: boolean) {
  gisLayers.value.forEach(layer => {
    layer.checked = checked
  })
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  
  const files = e.dataTransfer?.files
  if (files) {
    Array.from(files).forEach(file => {
      if (!droppedFiles.value.find(f => f.name === file.name)) {
        droppedFiles.value.push(file)
        autoMatchFile(file)
      }
    })
  }
}

function autoMatchFile(file: File) {
  const fileName = file.name.toLowerCase()
  gisLayers.value.forEach(layer => {
    if (layer.filePath) return
    
    const layerKeywords: Record<string, string[]> = {
      elevation: ['elevation', 'dem', '高程', 'height'],
      slope: ['slope', '坡度', 'gradient'],
      fishing: ['fish', '渔区', 'fishing'],
      volcano: ['volcano', '火山'],
      earthquake: ['earthquake', '地震', 'seismic'],
      shipping: ['ship', '航道', 'route', 'lane'],
    }
    
    const keywords = layerKeywords[layer.id] || []
    if (keywords.some(kw => fileName.includes(kw))) {
      layer.filePath = file.name
      layer.checked = true
      layer.status = 'pending'
    }
  })
}

function removeDroppedFile(index: number) {
  const file = droppedFiles.value[index]
  droppedFiles.value.splice(index, 1)
  gisLayers.value.forEach(layer => {
    if (layer.filePath === file.name) {
      layer.filePath = ''
      layer.status = 'none'
    }
  })
}

function handleBrowse(layer: GisLayerItem) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.tif,.tiff,.shp,.geojson,.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      layer.filePath = file.name
      layer.status = 'pending'
      if (!droppedFiles.value.find(f => f.name === file.name)) {
        droppedFiles.value.push(file)
      }
    }
  }
  input.click()
}

function clearFilePath(layer: GisLayerItem) {
  const fileName = layer.filePath
  layer.filePath = ''
  layer.status = 'none'
  const fileIndex = droppedFiles.value.findIndex(f => f.name === fileName)
  if (fileIndex > -1) {
    droppedFiles.value.splice(fileIndex, 1)
  }
}

async function handleImport() {
  if (!canImport.value) {
    appStore.showNotification({ type: 'warning', message: '请选择必须的图层文件' })
    return
  }
  
  isProcessing.value = true
  
  const selectedLayers = gisLayers.value.filter(l => l.checked && l.filePath)
  
  for (const layer of selectedLayers) {
    layer.status = 'pending'
  }
  
  await new Promise(resolve => setTimeout(resolve, 500))
  
  for (const layer of selectedLayers) {
    await new Promise(resolve => setTimeout(resolve, 300))
    layer.status = 'success'
    layerStore.setLayerLoaded(layer.id, true)
  }
  
  isProcessing.value = false
  appStore.showNotification({ type: 'success', message: `成功导入 ${selectedLayers.length} 个图层` })
  emit('success')
  emit('close')
}

function handleClose() {
  emit('close')
}

function getStatusClass(status: string) {
  switch (status) {
    case 'pending': return 'text-orange-500'
    case 'success': return 'text-green-600'
    case 'error': return 'text-red-500'
    default: return 'text-gray-400'
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'pending': return '待导入'
    case 'success': return '已导入'
    case 'error': return '失败'
    default: return '-'
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click.self="handleClose"
    >
      <div class="bg-white rounded-xl shadow-2xl w-[600px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
          <div class="flex items-center gap-2.5 text-gray-800">
            <Upload class="w-5 h-5 text-blue-600" />
            <span class="font-semibold text-lg">导入 GIS 数据</span>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
            @click="handleClose"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-6 overflow-y-auto flex-1">
          <p class="text-sm text-gray-600 mb-4">请选择要导入的 GIS 数据文件。(*) 标记为必须项。</p>
          
          <!-- 数据来源 -->
          <div class="mb-4">
            <div class="flex items-center gap-3">
              <label class="text-sm text-gray-600 font-medium w-[70px] shrink-0">数据来源:</label>
              <select 
                v-model="dataSource"
                class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="local">本地文件</option>
                <option value="server">服务器文件</option>
                <option value="web">WMS服务</option>
              </select>
            </div>
          </div>

          <!-- 文件拖放区域 -->
          <div 
            :class="[
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors mb-4',
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
            ]"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <p class="text-sm text-gray-600 mb-2">将多个 GIS 文件拖放到此处，系统将自动匹配到对应图层</p>
            
            <!-- 已拖入的文件预览 -->
            <div v-if="droppedFiles.length > 0" class="flex flex-wrap gap-2 mt-3 justify-center">
              <div 
                v-for="(file, index) in droppedFiles" 
                :key="file.name"
                class="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm"
              >
                <FileText class="w-4 h-4 text-blue-500" />
                <span class="max-w-[120px] truncate">{{ file.name }}</span>
                <button 
                  class="text-red-400 hover:text-red-600"
                  @click="removeDroppedFile(index)"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- 数据列表 -->
          <div class="mb-4">
            <h4 class="text-sm font-semibold text-gray-800 mb-2">数据列表</h4>
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <!-- 表头 -->
              <div class="flex items-center py-2 px-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
                <div class="w-[28px] flex justify-center">
                  <input 
                    type="checkbox"
                    :checked="allChecked"
                    :indeterminate="someChecked"
                    class="w-3.5 h-3.5 cursor-pointer accent-blue-500"
                    @change="handleSelectAll(($event.target as HTMLInputElement).checked)"
                  >
                </div>
                <span class="w-[110px]">图层类型</span>
                <span class="flex-1">文件路径</span>
                <span class="w-[70px] text-center">操作</span>
                <span class="w-[50px] text-center">状态</span>
              </div>
              
              <!-- 数据行 -->
              <div 
                v-for="layer in gisLayers" 
                :key="layer.id"
                class="flex items-center py-2 px-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 text-sm"
              >
                <div class="w-[28px] flex justify-center">
                  <input 
                    v-model="layer.checked"
                    type="checkbox"
                    class="w-3.5 h-3.5 cursor-pointer accent-blue-500"
                  >
                </div>
                <span class="w-[110px] text-gray-700">
                  {{ layer.name }}
                  <span v-if="layer.required" class="text-red-500">(*)</span>
                </span>
                <div class="flex-1 flex items-center gap-2">
                  <span 
                    v-if="layer.filePath"
                    class="flex-1 px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs text-gray-600 truncate"
                  >
                    {{ layer.filePath }}
                  </span>
                  <span v-else class="flex-1 px-2 py-1 text-gray-400 text-xs">未选择</span>
                  <button 
                    v-if="layer.filePath"
                    class="text-gray-400 hover:text-red-500 transition-colors"
                    title="清除"
                    @click="clearFilePath(layer)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
                <div class="w-[70px] flex justify-center">
                  <button 
                    class="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                    @click="handleBrowse(layer)"
                  >
                    选择文件
                  </button>
                </div>
                <div class="w-[50px] flex justify-center">
                  <span :class="['text-xs', getStatusClass(layer.status)]">
                    {{ getStatusText(layer.status) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 导入设置 -->
          <div class="bg-gray-50 rounded-lg p-4">
            <h4 class="text-sm font-semibold text-gray-800 mb-3">导入设置</h4>
            <div class="grid grid-cols-2 gap-4 mb-3">
              <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600 w-[60px] shrink-0">坐标系:</label>
                <select 
                  v-model="coordinateSystem"
                  class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">选择</option>
                  <option value="EPSG:4326">WGS84 (EPSG:4326)</option>
                  <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600 w-[70px] shrink-0">处理选项:</label>
                <select 
                  v-model="processOption"
                  class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="default">默认</option>
                  <option value="metadata">仅加载元数据</option>
                  <option value="cache">预处理并缓存</option>
                </select>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input 
                id="preview-option"
                v-model="showPreview"
                type="checkbox"
                class="w-3.5 h-3.5 cursor-pointer accent-blue-500"
              >
              <label for="preview-option" class="text-sm text-gray-600 cursor-pointer">导入前显示预览</label>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <Button variant="ghost" @click="handleClose">取消</Button>
          <Button 
            :disabled="isProcessing || !canImport"
            class="min-w-[80px]"
            @click="handleImport"
          >
            <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
            {{ isProcessing ? '导入中...' : '导入' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
