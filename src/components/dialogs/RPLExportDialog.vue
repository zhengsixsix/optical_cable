<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, FileSpreadsheet, Download, Loader2 } from 'lucide-vue-next'
import { useRPLStore, useAppStore } from '@/stores'
import { exportRPLFile } from '@/services'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const rplStore = useRPLStore()
const appStore = useAppStore()

const isExporting = ref(false)
const exportFormat = ref<'csv' | 'excel'>('csv')

const formatOptions = [
  { value: 'csv', label: 'CSV 格式', desc: '通用格式，兼容性好' },
  { value: 'excel', label: 'Excel 格式', desc: '适合后续编辑和分析' },
]

const handleExport = async () => {
  const table = rplStore.currentTable
  if (!table || table.records.length === 0) {
    appStore.showNotification({ type: 'warning', message: '没有可导出的数据' })
    return
  }

  isExporting.value = true

  try {
    await new Promise(resolve => setTimeout(resolve, 500))
    exportRPLFile(table, exportFormat.value)
    appStore.showNotification({ type: 'success', message: `RPL文件已导出: ${table.name}.${exportFormat.value}` })
    emit('close')
  } catch (error) {
    appStore.showNotification({ type: 'error', message: '导出失败' })
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[420px] bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b">
          <div class="flex items-center gap-3">
            <FileSpreadsheet class="w-5 h-5 text-blue-500" />
            <span class="font-semibold text-lg">导出 RPL 表格</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent class="p-4 space-y-4">
          <!-- 当前表格信息 -->
          <div class="bg-gray-50 rounded-lg p-3">
            <div class="text-sm text-gray-500 mb-1">当前表格</div>
            <div class="font-medium">
              {{ rplStore.currentTable?.name || '未选择' }}
            </div>
            <div class="text-xs text-gray-400 mt-1">
              共 {{ rplStore.currentTable?.records.length || 0 }} 条记录
            </div>
          </div>

          <!-- 格式选择 -->
          <div>
            <div class="text-sm font-medium text-gray-700 mb-2">导出格式</div>
            <div class="space-y-2">
              <label
                v-for="opt in formatOptions"
                :key="opt.value"
                :class="[
                  'flex items-center p-3 rounded-lg border cursor-pointer transition-colors',
                  exportFormat === opt.value 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                ]"
              >
                <input
                  type="radio"
                  :value="opt.value"
                  v-model="exportFormat"
                  class="mr-3"
                />
                <div>
                  <div class="font-medium text-sm">{{ opt.label }}</div>
                  <div class="text-xs text-gray-500">{{ opt.desc }}</div>
                </div>
              </label>
            </div>
          </div>
        </CardContent>
        
        <!-- 底部按钮 -->
        <div class="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" @click="emit('close')">取消</Button>
          <Button 
            @click="handleExport" 
            :disabled="isExporting || !rplStore.currentTable?.records.length"
          >
            <Loader2 v-if="isExporting" class="w-4 h-4 mr-1 animate-spin" />
            <Download v-else class="w-4 h-4 mr-1" />
            {{ isExporting ? '导出中...' : '确认导出' }}
          </Button>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
