<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
import { X, Upload, FileText, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { deviceImportService, applyImportResultToStore, type ImportResult } from '@/services/DeviceImportService'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', result: ImportResult): void
}>()

const settingsStore = useSettingsStore()
const appStore = useAppStore()

// 状态
const isDragging = ref(false)
const isImporting = ref(false)
const selectedFile = ref<File | null>(null)
const importResult = ref<ImportResult | null>(null)

// 文件输入引用
const fileInputRef = ref<HTMLInputElement | null>(null)

// 处理拖放
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
  
  const file = e.dataTransfer?.files[0]
  if (file) {
    selectFile(file)
  }
}

// 选择文件
const selectFile = (file: File) => {
  const fileType = deviceImportService.detectFileType(file.name)
  if (!fileType) {
    appStore.showNotification({ 
      type: 'error', 
      message: '不支持的文件格式，请使用 JSON、CSV 或 Excel 文件' 
    })
    return
  }
  
  selectedFile.value = file
  importResult.value = null
}

// 触发文件选择
const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

// 文件选择变化
const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    selectFile(file)
  }
}

// 执行导入
const doImport = async () => {
  if (!selectedFile.value) return
  
  isImporting.value = true
  
  try {
    const result = await deviceImportService.importFile(selectedFile.value)
    importResult.value = result
    
    if (result.success) {
      appStore.showNotification({ 
        type: 'success', 
        message: `导入成功：${result.summary.successCount} 条记录` 
      })
    } else {
      appStore.showNotification({ 
        type: 'warning', 
        message: `导入完成，但有 ${result.summary.errorCount} 个错误` 
      })
    }
  } catch (error) {
    appStore.showNotification({ 
      type: 'error', 
      message: `导入失败: ${(error as Error).message}` 
    })
  } finally {
    isImporting.value = false
  }
}

// 确认导入到设置
const confirmImport = async () => {
  if (!importResult.value) return
  
  try {
    const msg = await applyImportResultToStore(importResult.value, settingsStore)

    if (selectedFile.value) {
      settingsStore.currentLibraryFile = selectedFile.value.name
    }

    appStore.showNotification({ type: 'success', message: msg })
    emit('imported', importResult.value)
    emit('close')
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `器件库导入失败：${(error as Error).message}`,
    })
  }
}
// 下载模板
const downloadTemplate = (format: 'json' | 'csv') => {
  let content: string
  let filename: string
  let mimeType: string
  
  if (format === 'json') {
    content = deviceImportService.generateTemplateJSON()
    filename = 'device_library_template.json'
    mimeType = 'application/json'
  } else {
    content = deviceImportService.generateTemplateCSV()
    filename = 'device_library_template.csv'
    mimeType = 'text/csv'
  }
  
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  
  appStore.showNotification({ type: 'success', message: `模板已下载: ${filename}` })
}

// 重置
const reset = () => {
  selectedFile.value = null
  importResult.value = null
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[600px] max-h-[80vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <div class="flex items-center gap-3">
            <Upload class="w-5 h-5 text-blue-500" />
            <span class="font-semibold text-lg">导入器件库</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-4 space-y-4">
          <!-- 下载模板 -->
          <div class="flex items-center justify-between bg-blue-50 rounded-lg p-3">
            <div class="text-sm text-blue-700">
              下载模板文件，填写后导入
            </div>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="downloadTemplate('json')">
                <Download class="w-3.5 h-3.5 mr-1" /> JSON模板
              </Button>
              <Button variant="outline" size="sm" @click="downloadTemplate('csv')">
                <Download class="w-3.5 h-3.5 mr-1" /> CSV模板
              </Button>
            </div>
          </div>
          
          <!-- 文件上传区域 -->
          <div
            class="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
            :class="[
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
              selectedFile ? 'bg-green-50 border-green-300' : ''
            ]"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
            @click="triggerFileSelect"
          >
            <input 
              ref="fileInputRef"
              type="file" 
              class="hidden" 
              accept=".json,.csv,.xlsx,.xls"
              @change="handleFileChange"
            />
            
            <div v-if="!selectedFile" class="space-y-2">
              <Upload class="w-12 h-12 mx-auto text-gray-400" />
              <div class="text-gray-600">
                拖放文件到此处，或<span class="text-blue-500 cursor-pointer">点击选择</span>
              </div>
              <div class="text-xs text-gray-400">
                支持 JSON、CSV、Excel 格式
              </div>
            </div>
            
            <div v-else class="space-y-2">
              <FileText class="w-12 h-12 mx-auto text-green-500" />
              <div class="text-gray-700 font-medium">{{ selectedFile.name }}</div>
              <div class="text-xs text-gray-400">
                {{ (selectedFile.size / 1024).toFixed(1) }} KB
              </div>
              <Button variant="ghost" size="sm" @click.stop="reset">
                重新选择
              </Button>
            </div>
          </div>
          
          <!-- 解析按钮 -->
          <div v-if="selectedFile && !importResult" class="flex justify-center">
            <Button @click="doImport" :disabled="isImporting">
              <Loader2 v-if="isImporting" class="w-4 h-4 mr-1 animate-spin" />
              <Upload v-else class="w-4 h-4 mr-1" />
              {{ isImporting ? '解析中...' : '解析文件' }}
            </Button>
          </div>
          
          <!-- 导入结果 -->
          <div v-if="importResult" class="space-y-4">
            <!-- 状态提示 -->
            <div 
              :class="[
                'p-3 rounded-lg flex items-start gap-3',
                importResult.success ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
              ]"
            >
              <component 
                :is="importResult.success ? CheckCircle : AlertCircle"
                :class="[
                  'w-5 h-5 mt-0.5',
                  importResult.success ? 'text-green-600' : 'text-yellow-600'
                ]"
              />
              <div>
                <div :class="importResult.success ? 'text-green-700 font-medium' : 'text-yellow-700 font-medium'">
                  {{ importResult.success ? '解析成功' : '解析完成（有警告）' }}
                </div>
                <div class="text-sm mt-1">
                  共解析 {{ importResult.summary.totalRows }} 条记录，
                  成功 {{ importResult.summary.successCount }} 条
                </div>
              </div>
            </div>
            
            <!-- 统计摘要 -->
            <div class="grid grid-cols-5 gap-2">
              <div class="bg-blue-50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold text-blue-600">{{ importResult.summary.fiberCount }}</div>
                <div class="text-xs text-gray-500">光纤</div>
              </div>
              <div class="bg-purple-50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold text-purple-600">{{ importResult.summary.amplifierCount }}</div>
                <div class="text-xs text-gray-500">放大器</div>
              </div>
              <div class="bg-green-50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold text-green-600">{{ importResult.summary.branchingUnitCount }}</div>
                <div class="text-xs text-gray-500">分支器</div>
              </div>
              <div class="bg-amber-50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold text-amber-600">{{ importResult.summary.equalizerCount ?? 0 }}</div>
                <div class="text-xs text-gray-500">均衡器</div>
              </div>
              <div class="bg-slate-50 rounded-lg p-3 text-center">
                <div class="text-xl font-bold text-slate-600">{{ importResult.summary.jointCount ?? 0 }}</div>
                <div class="text-xs text-gray-500">接头盒</div>
              </div>
            </div>
            
            <!-- 错误列表 -->
            <div v-if="importResult.errors.length > 0" class="space-y-2">
              <div class="text-sm font-medium text-gray-700">错误信息</div>
              <div class="max-h-32 overflow-auto space-y-1">
                <div 
                  v-for="(error, index) in importResult.errors" 
                  :key="index"
                  :class="[
                    'text-xs p-2 rounded',
                    error.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
                  ]"
                >
                  <span v-if="error.row">第 {{ error.row }} 行: </span>
                  {{ error.message }}
                </div>
              </div>
            </div>
            
            <!-- 警告列表 -->
            <div v-if="importResult.warnings.length > 0" class="space-y-2">
              <div class="text-sm font-medium text-gray-700">警告信息</div>
              <div class="max-h-32 overflow-auto space-y-1">
                <div 
                  v-for="(warning, index) in importResult.warnings" 
                  :key="index"
                  class="text-xs p-2 rounded bg-yellow-50 text-yellow-700"
                >
                  {{ warning }}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        
        <!-- 底部按钮 -->
        <div class="p-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" @click="emit('close')">取消</Button>
          <Button 
            v-if="importResult?.success"
            @click="confirmImport"
          >
            <CheckCircle class="w-4 h-4 mr-1" />
            确认导入
          </Button>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
