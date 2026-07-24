<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, FileText, Loader2 } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { useProjectManager } from '@/composables/useProjectManager'
import { projectFileService } from '@/services/ProjectFileService'
import { readFirstWorksheetAsCsv } from '@/utils/excelWorkbook'

/**
 * ImportFileDialog 导入项目文件对话框
 * 支持导入工程(.use)、RPL文件(.rpl/.csv/.xlsx/.xls)、GIS数据(.tif,.shp)
 */
interface Props {
  visible: boolean
  importType?: 'project' | 'rpl' | 'gis'  // 导入类型
}

const props = withDefaults(defineProps<Props>(), {
  importType: 'project'
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success'): void
}>()

const appStore = useAppStore()
const rplStore = useRPLStore()
const projectManager = useProjectManager()

// 状态
const selectedFile = ref<File | null>(null)
const filePath = ref('')
const isProcessing = ref(false)

// 导入选项
const options = ref({
  overwriteExisting: false,
  validateBeforeImport: true,
  previewBeforeImport: false,
})

// 对话框标题
const dialogTitle = computed(() => {
  switch (props.importType) {
    case 'project': return '导入项目文件'
    case 'rpl': return '导入 RPL 文件'
    case 'gis': return '导入 GIS 数据'
    default: return '导入文件'
  }
})

// 支持的文件格式
const acceptFormats = computed(() => {
  switch (props.importType) {
    case 'project': return '.use'
    case 'rpl': return '.rpl,.csv,.xlsx,.xls'
    case 'gis': return '.tif,.tiff,.shp,.geojson,.json'
    default: return '*'
  }
})

// 格式说明
const formatHint = computed(() => {
  switch (props.importType) {
    case 'project': return '支持格式: .use'
    case 'rpl': return '支持格式: .rpl, .csv, .xlsx, .xls'
    case 'gis': return '支持格式: .tif, .tiff, .shp, .geojson, .json'
    default: return ''
  }
})

// 重置状态
watch(() => props.visible, (visible) => {
  if (visible) {
    selectedFile.value = null
    filePath.value = ''
  }
})

function notifyImportError(message: string) {
  appStore.showNotification({ type: 'error', message })
}

// 浏览文件
const handleBrowse = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = acceptFormats.value
  
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      selectedFile.value = file
      filePath.value = file.name
    }
  }
  
  input.click()
}

// 执行导入
const handleImport = async () => {
  if (!selectedFile.value) {
    notifyImportError('请先选择要导入的文件')
    return
  }
  
  isProcessing.value = true
  
  try {
    switch (props.importType) {
      case 'project':
        await importProject()
        break
      case 'rpl':
        await importRPL()
        break
      case 'gis':
        await importGIS()
        break
    }
  } catch (error) {
    notifyImportError((error as Error).message || '导入失败')
  } finally {
    isProcessing.value = false
  }
}

// 导入项目
const importProject = async () => {
  if (!selectedFile.value) return
  
  // 检查当前是否有未保存的项目
  if (projectManager.hasOpenProject.value && projectManager.isDirty.value && !options.value.overwriteExisting) {
    notifyImportError('当前项目有未保存的更改，请先保存或勾选"覆盖现有数据"')
    return
  }
  
  const result = await projectFileService.importProject(selectedFile.value)
  
  if (result.success) {
    // 更新 appStore
    const currentProject = projectFileService.getCurrentProject()
    if (currentProject) {
      appStore.setCurrentProject(currentProject)
    }
    
    const successMessage = `项目导入成功: ${selectedFile.value.name}`
    appStore.showNotification({ type: 'success', message: successMessage })
    
    setTimeout(() => {
      emit('success')
      emit('close')
    }, 1000)
  } else {
    notifyImportError(result.error || '项目导入失败')
  }
}

// 导入 RPL 文件
const importRPL = async () => {
  if (!selectedFile.value) return
  
  try {
    const fileName = selectedFile.value.name
    const tableName = fileName.replace(/\.(rpl|csv|xlsx|xls)$/i, '')
    const isExcelFile = /\.(xlsx|xls)$/i.test(fileName)

    let fileContent = ''
    if (isExcelFile) {
      const arrayBuffer = await selectedFile.value.arrayBuffer()
      fileContent = await readFirstWorksheetAsCsv(arrayBuffer, fileName)
    } else {
      fileContent = await selectedFile.value.text()
    }
    
    // 导入到 RPL store
    const success = rplStore.importFromCSV(fileContent, tableName, 'route-main')
    
    if (success) {
      projectManager.markDirty()
      const successMessage = `RPL 文件导入成功: ${rplStore.currentTable?.records.length || 0} 条记录`
      appStore.showNotification({ type: 'success', message: successMessage })
      appStore.addLog('INFO', `导入 RPL 文件: ${selectedFile.value.name}`)
      
      setTimeout(() => {
        emit('success')
        emit('close')
      }, 1000)
    } else {
      notifyImportError('RPL 文件格式无效')
    }
  } catch (error) {
    throw new Error(`读取 RPL 文件失败: ${(error as Error).message}`)
  }
}

// 导入 GIS 数据
const importGIS = async () => {
  // GIS 数据导入使用现有的 ImportGisDialog
  appStore.openDialog('import-gis')
  emit('close')
}

const handleClose = () => {
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
      <div class="bg-white rounded-lg shadow-xl w-[420px] max-w-[90vw] overflow-hidden">
        <!-- 头部 -->
        <div class="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
          <span class="font-medium text-gray-800">{{ dialogTitle }}</span>
          <button class="p-1 hover:bg-gray-200 rounded transition-colors" @click="handleClose">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <!-- 内容区 -->
        <div class="p-5">
          <!-- 文件位置 -->
          <div class="mb-5">
            <label class="block text-sm text-gray-700 mb-2">项目文件位置:</label>
            <div class="flex gap-2">
              <input
                v-model="filePath"
                type="text"
                readonly
                placeholder="请选择文件..."
                class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary"
              />
              <Button variant="outline" size="sm" @click="handleBrowse">
                浏览
              </Button>
            </div>
            <p class="mt-1 text-xs text-gray-400">{{ formatHint }}</p>
          </div>

          <!-- 已选文件信息 -->
          <div v-if="selectedFile" class="mb-5 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
            <FileText class="w-8 h-8 text-primary shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ selectedFile.name }}</p>
              <p class="text-xs text-gray-500">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
            </div>
          </div>

          <!-- 导入选项 -->
          <div class="space-y-3">
            <h4 class="font-medium text-gray-800">导入选项</h4>
            
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="options.overwriteExisting"
                type="checkbox"
                class="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
              />
              <span class="text-sm text-gray-700">覆盖现有数据</span>
            </label>
            
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="options.validateBeforeImport"
                type="checkbox"
                class="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
              />
              <span class="text-sm text-gray-700">导入前验证数据</span>
            </label>
            
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="options.previewBeforeImport"
                type="checkbox"
                class="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
              />
              <span class="text-sm text-gray-700">导入前预览</span>
            </label>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="px-5 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <Button
            :disabled="isProcessing || !selectedFile"
            @click="handleImport"
          >
            <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
            导入
          </Button>
          <Button variant="outline" @click="handleClose">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
