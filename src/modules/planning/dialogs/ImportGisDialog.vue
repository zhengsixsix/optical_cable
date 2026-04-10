<script setup lang="ts">
import { useLayerStore } from '@/stores/layer'
import { ref, computed, watch } from 'vue'
import { Upload, X, FileText, Loader2, Check, AlertCircle, Trash2 } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { fetchSharedGisFiles, type SharedGisFile } from '@/services'
import { useGeoService } from '@/services/GeoService'
import { Button } from '@/shared/components/base'

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
const geoService = useGeoService()

const dataSource = ref<'local' | 'server'>('local')
const isDragging = ref(false)
const isProcessing = ref(false)
const coordinateSystem = ref('')
const processOption = ref('default')
const showPreview = ref(true)
const droppedFiles = ref<File[]>([])
const sharedFiles = ref<SharedGisFile[]>([])
const isSharedLoading = ref(false)
const sharedLoaded = ref(false)
const uploadCacheKey = 'gis-upload-cache-v1'

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
watch(dataSource, (source) => {
  if (source === 'server' && !sharedLoaded.value) {
    loadSharedFiles()
  }
  if (source === 'server') {
    droppedFiles.value = []
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

async function loadSharedFiles() {
  if (isSharedLoading.value) return
  isSharedLoading.value = true
  try {
    sharedFiles.value = await fetchSharedGisFiles()
    sharedLoaded.value = true
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `获取共享数据失败: ${(error as Error).message}` })
  } finally {
    isSharedLoading.value = false
  }
}

function getUploadCache(): string[] {
  try {
    const raw = localStorage.getItem(uploadCacheKey)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setUploadCache(cache: string[]) {
  try {
    localStorage.setItem(uploadCacheKey, JSON.stringify(cache.slice(-200)))
  } catch {
    // ignore
  }
}

function checkDuplicateAndRemember(file: File): boolean {
  const signature = `${file.name}_${file.size}_${file.lastModified}`
  const cache = getUploadCache()
  if (cache.includes(signature)) {
    appStore.showNotification({ type: 'warning', message: `检测到重复文件: ${file.name}，已跳过本次重复添加` })
    return true
  }
  cache.push(signature)
  setUploadCache(cache)
  return false
}

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

async function buildLayerDataFromLocalFile(layer: GisLayerItem, file: File) {
  const ext = getFileExtension(file.name)

  if (ext === 'geojson' || ext === 'json') {
    const result = await geoService.importFile(file)
    if (!result.success || !result.data) {
      throw new Error(result.errors?.[0] || result.message || 'GeoJSON 解析失败')
    }
    return {
      id: layer.id,
      features: result.data as any,
      metadata: {
        source: file.name,
        projection: coordinateSystem.value || 'EPSG:4326',
      },
    }
  }

  if (ext === 'tif' || ext === 'tiff' || ext === 'shp') {
    return {
      id: layer.id,
      rasterData: await file.arrayBuffer(),
      metadata: {
        source: file.name,
        projection: coordinateSystem.value || 'EPSG:4326',
      },
    }
  }

  throw new Error(`暂不支持的图层格式: .${ext}`)
}

async function buildLayerDataFromSharedPath(layer: GisLayerItem, filePath: string) {
  const ext = getFileExtension(filePath)
  const response = await fetch(filePath)
  if (!response.ok) {
    throw new Error(`共享文件读取失败: ${response.status}`)
  }

  if (ext === 'geojson' || ext === 'json') {
    return {
      id: layer.id,
      features: await response.json(),
      metadata: {
        source: filePath,
        projection: coordinateSystem.value || 'EPSG:4326',
      },
    }
  }

  if (ext === 'tif' || ext === 'tiff' || ext === 'shp') {
    return {
      id: layer.id,
      rasterData: await response.arrayBuffer(),
      metadata: {
        source: filePath,
        projection: coordinateSystem.value || 'EPSG:4326',
      },
    }
  }

  throw new Error(`暂不支持的共享图层格式: .${ext}`)
}

function handleSelectAll(checked: boolean) {
  gisLayers.value.forEach(layer => {
    layer.checked = checked
  })
}

function handleDragOver(e: DragEvent) {
  if (dataSource.value !== 'local') return
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  if (dataSource.value !== 'local') return
  e.preventDefault()
  isDragging.value = false
  
  const files = e.dataTransfer?.files
  if (files) {
    Array.from(files).forEach(file => {
      if (checkDuplicateAndRemember(file)) return
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
  if (dataSource.value !== 'local') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.tif,.tiff,.shp,.geojson,.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      if (checkDuplicateAndRemember(file)) return
      layer.filePath = file.name
      layer.status = 'pending'
      if (!droppedFiles.value.find(f => f.name === file.name)) {
        droppedFiles.value.push(file)
      }
    }
  }
  input.click()
}
function handleSharedSelect(layer: GisLayerItem, value: string) {
  layer.filePath = value
  layer.status = value ? 'pending' : 'none'
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
  let successCount = 0
  const failedLayers: string[] = []

  try {
    for (const layer of selectedLayers) {
      layer.status = 'pending'
      try {
        if (dataSource.value === 'local') {
          const file = droppedFiles.value.find(item => item.name === layer.filePath)
          if (!file) throw new Error('未找到对应的本地文件')
          const layerData = await buildLayerDataFromLocalFile(layer, file)
          layerStore.setLayerData(layer.id, layerData as any)
        } else {
          const layerData = await buildLayerDataFromSharedPath(layer, layer.filePath)
          layerStore.setLayerData(layer.id, layerData as any)
        }

        layerStore.setLayerVisible(layer.id, true)
        layer.status = 'success'
        successCount++
      } catch (error) {
        layer.status = 'error'
        failedLayers.push(`${layer.name}: ${(error as Error).message}`)
      }
    }
  } finally {
    isProcessing.value = false
  }

  if (successCount > 0) {
    const message = failedLayers.length > 0
      ? `已导入 ${successCount} 个图层，${failedLayers.length} 个图层失败`
      : `成功导入 ${successCount} 个图层`
    appStore.showNotification({ type: failedLayers.length > 0 ? 'warning' : 'success', message })
    appStore.addLog('INFO', `GIS 图层导入完成: ${selectedLayers.filter(layer => layer.status === 'success').map(layer => layer.name).join('、')}`)
    emit('success')
    emit('close')
    return
  }

  appStore.showNotification({ type: 'error', message: failedLayers[0] || 'GIS 图层导入失败' })
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
                <option value="local">个人上传</option>
                <option value="server">服务器共享</option>
              </select>
            </div>
          </div>
          <div v-if="dataSource === 'server'" class="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50 text-sm text-gray-600">
            <div class="flex items-center justify-between">
              <span>共享数据来源：/public/data</span>
              <button
                class="text-xs text-blue-600 hover:underline"
                :disabled="isSharedLoading"
                @click="loadSharedFiles"
              >
                {{ isSharedLoading ? '加载中...' : '刷新列表' }}
              </button>
            </div>
            <div v-if="sharedFiles.length === 0" class="text-xs text-gray-400 mt-2">
              暂无共享数据，请在 data 目录中放置 GIS 文件
            </div>
          </div>

          <!-- 文件拖放区域 -->
          <div 
            v-if="dataSource === 'local'"
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
                  <template v-if="dataSource === 'server'">
                    <select
                      class="flex-1 px-2 py-1 border border-gray-200 rounded text-xs text-gray-700"
                      :value="layer.filePath"
                      @change="handleSharedSelect(layer, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">选择共享文件</option>
                      <option v-for="file in sharedFiles" :key="file.path" :value="file.path">
                        {{ file.path }}
                      </option>
                    </select>
                  </template>
                  <template v-else>
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
                  </template>
                </div>
                <div class="w-[70px] flex justify-center">
                  <button 
                    v-if="dataSource === 'local'"
                    class="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                    @click="handleBrowse(layer)"
                  >
                    选择文件
                  </button>
                  <span v-else class="text-xs text-gray-400">共享数据</span>
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
