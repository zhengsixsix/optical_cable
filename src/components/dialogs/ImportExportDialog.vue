<script setup lang="ts">
import { ref, computed } from 'vue'
import { Upload, Download, X, FileText, Check, AlertCircle, Loader2 } from 'lucide-vue-next'
import { useGeoService } from '@/services'
import { useRouteStore, useAppStore } from '@/stores'
import { Button } from '@/components/ui'
import { supportedImportFormats as supportedFormats, exportFormatOptions as exportFormats } from '@/data/mockData'

/**
 * ImportExportDialog 导入导出对话框
 * 支持 GeoJSON/KML/CSV 格式的导入导出
 */
interface Props {
  mode: 'import' | 'export'
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success'): void
}>()

const geoService = useGeoService()
const routeStore = useRouteStore()
const appStore = useAppStore()

// 状态
const isDragging = ref(false)
const isProcessing = ref(false)
const selectedFile = ref<File | null>(null)
const exportFormat = ref<'geojson' | 'kml' | 'csv'>('geojson')
const resultMessage = ref('')
const resultType = ref<'success' | 'error' | ''>('')

const dialogTitle = computed(() => 
  props.mode === 'import' ? '导入 GIS 数据' : '导出路由数据'
)

// 拖拽处理
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    selectedFile.value = files[0]
    resultMessage.value = ''
    resultType.value = ''
  }
}

// 文件选择
const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0]
    resultMessage.value = ''
    resultType.value = ''
  }
}

// 导入处理
const handleImport = async () => {
  if (!selectedFile.value) return
  
  isProcessing.value = true
  resultMessage.value = ''
  
  try {
    const result = await geoService.importFile(selectedFile.value)
    
    if (result.success) {
      resultType.value = 'success'
      resultMessage.value = result.message
      appStore.showNotification({ type: 'success', message: result.message })
      emit('success')
    } else {
      resultType.value = 'error'
      resultMessage.value = result.errors?.join(', ') || result.message
    }
  } catch (error) {
    resultType.value = 'error'
    resultMessage.value = (error as Error).message
  } finally {
    isProcessing.value = false
  }
}

// 导出处理
const handleExport = async () => {
  const currentRoute = routeStore.currentRoute
  if (!currentRoute) {
    resultType.value = 'error'
    resultMessage.value = '请先选择要导出的路由'
    return
  }
  
  isProcessing.value = true
  
  try {
    const blob = await geoService.exportRoute(currentRoute.id, exportFormat.value)
    const filename = `${currentRoute.name}_${Date.now()}.${exportFormat.value}`
    geoService.downloadFile(blob, filename)
    
    resultType.value = 'success'
    resultMessage.value = `已导出: ${filename}`
    appStore.showNotification({ type: 'success', message: `路由已导出为 ${filename}` })
    emit('success')
  } catch (error) {
    resultType.value = 'error'
    resultMessage.value = (error as Error).message
  } finally {
    isProcessing.value = false
  }
}

const handleClose = () => {
  selectedFile.value = null
  resultMessage.value = ''
  resultType.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="handleClose"
    >
      <div class="bg-white rounded-lg shadow-xl w-[480px] max-w-[90vw] overflow-hidden">
        <!-- 头部 -->
        <div class="px-5 py-4 bg-primary text-white flex items-center justify-between">
          <div class="flex items-center gap-2">
            <component :is="mode === 'import' ? Upload : Download" class="w-5 h-5" />
            <span class="font-semibold">{{ dialogTitle }}</span>
          </div>
          <button class="p-1 hover:bg-white/20 rounded transition-colors" @click="handleClose">
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- 内容区 -->
        <div class="p-5">
          <!-- 导入模式 -->
          <template v-if="mode === 'import'">
            <!-- 拖拽区域 -->
            <div
              :class="[
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                isDragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/50'
              ]"
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
              @click="($refs.fileInput as HTMLInputElement)?.click()"
            >
              <input
                ref="fileInput"
                type="file"
                accept=".geojson,.json,.kml,.csv,.tif,.tiff"
                class="hidden"
                @change="handleFileSelect"
              />
              
              <Upload class="w-12 h-12 text-gray-400 mx-auto mb-3" />
              
              <p class="text-gray-600 mb-2">
                拖拽文件到此处，或 <span class="text-primary">点击选择</span>
              </p>
              
              <p class="text-xs text-gray-400">
                支持格式: {{ supportedFormats.map(f => f.ext).join(', ') }}
              </p>
            </div>

            <!-- 已选文件 -->
            <div v-if="selectedFile" class="mt-4 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
              <FileText class="w-8 h-8 text-primary" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ selectedFile.name }}</p>
                <p class="text-xs text-gray-500">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
              </div>
              <button class="p-1 hover:bg-gray-200 rounded" @click="selectedFile = null">
                <X class="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </template>

          <!-- 导出模式 -->
          <template v-else>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">当前路由</label>
                <div class="p-3 bg-gray-50 rounded-lg">
                  <p v-if="routeStore.currentRoute" class="font-medium">
                    {{ routeStore.currentRoute.name }}
                  </p>
                  <p v-else class="text-gray-500 text-sm">未选择路由</p>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">导出格式</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="format in exportFormats"
                    :key="format.value"
                    :class="[
                      'p-3 rounded-lg border text-sm transition-colors',
                      exportFormat === format.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 hover:border-primary/50'
                    ]"
                    @click="exportFormat = format.value as any"
                  >
                    {{ format.label }}
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- 结果消息 -->
          <div
            v-if="resultMessage"
            :class="[
              'mt-4 p-3 rounded-lg flex items-center gap-2 text-sm',
              resultType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            ]"
          >
            <component :is="resultType === 'success' ? Check : AlertCircle" class="w-4 h-4" />
            {{ resultMessage }}
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="px-5 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <Button variant="outline" @click="handleClose">取消</Button>
          <Button
            :disabled="isProcessing || (mode === 'import' && !selectedFile)"
            @click="mode === 'import' ? handleImport() : handleExport()"
          >
            <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
            {{ mode === 'import' ? '导入' : '导出' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
