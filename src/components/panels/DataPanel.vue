<script setup lang="ts">
import { ref, computed } from 'vue'
import FloatingPanel from './FloatingPanel.vue'
import ImportExportDialog from '@/components/dialogs/ImportExportDialog.vue'
import { Button } from '@/components/ui'
import { useRouteStore, useAppStore } from '@/stores'
import { Upload, Download, FileText, FolderOpen, Trash2 } from 'lucide-vue-next'

/**
 * DataPanel 数据管理浮动面板
 * 支持导入导出和数据管理功能
 */
const routeStore = useRouteStore()
const appStore = useAppStore()

const showImportDialog = ref(false)
const showExportDialog = ref(false)

const handleClose = () => {
  appStore.setPanelVisible('dataPanel', false)
}

const openImport = () => {
  showImportDialog.value = true
}

const openExport = () => {
  if (!routeStore.currentRoute) {
    appStore.showNotification({ type: 'warning', message: '请先选择要导出的路由' })
    return
  }
  showExportDialog.value = true
}

const handleImportSuccess = () => {
  showImportDialog.value = false
  appStore.showNotification({ type: 'success', message: '数据导入成功' })
}

const handleExportSuccess = () => {
  showExportDialog.value = false
}

// 最近文件列表（模拟）
const recentFiles = computed(() => [
  { name: 'route_shanghai_okinawa.geojson', date: '2024-03-15' },
  { name: 'bathymetry_pacific.tif', date: '2024-03-10' },
  { name: 'cable_survey_2024.kml', date: '2024-02-28' },
])
</script>

<template>
  <FloatingPanel
    title="数据管理"
    storage-key="data-panel"
    :default-position="{ x: 360, y: 80 }"
    :default-size="{ width: 280, height: 380 }"
    :min-width="240"
    :min-height="300"
    @close="handleClose"
  >
    <div class="p-3 space-y-4">
      <!-- 操作按钮 -->
      <div class="grid grid-cols-2 gap-2">
        <Button size="sm" class="w-full" @click="openImport">
          <Upload class="w-4 h-4 mr-1" />
          导入
        </Button>
        <Button size="sm" variant="outline" class="w-full" @click="openExport">
          <Download class="w-4 h-4 mr-1" />
          导出
        </Button>
      </div>

      <!-- 当前数据 -->
      <div class="border rounded-lg">
        <div class="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 flex items-center gap-2">
          <FolderOpen class="w-4 h-4" />
          当前数据
        </div>
        <div class="p-3 text-xs text-gray-600">
          <div class="flex justify-between mb-1">
            <span>路由数量</span>
            <span class="font-medium">{{ routeStore.routes.length }}</span>
          </div>
          <div class="flex justify-between">
            <span>当前选择</span>
            <span class="font-medium text-primary truncate max-w-[120px]">
              {{ routeStore.currentRoute?.name || '无' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 最近文件 -->
      <div class="border rounded-lg">
        <div class="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 flex items-center gap-2">
          <FileText class="w-4 h-4" />
          最近文件
        </div>
        <div class="divide-y max-h-[150px] overflow-y-auto">
          <div
            v-for="file in recentFiles"
            :key="file.name"
            class="px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer flex items-center justify-between"
          >
            <div class="flex items-center gap-2 min-w-0">
              <FileText class="w-3 h-3 text-gray-400 flex-shrink-0" />
              <span class="truncate">{{ file.name }}</span>
            </div>
            <span class="text-gray-400 flex-shrink-0 ml-2">{{ file.date }}</span>
          </div>
        </div>
      </div>

      <!-- 清除按钮 -->
      <Button size="sm" variant="destructive" class="w-full" @click="routeStore.clearDrawing">
        <Trash2 class="w-4 h-4 mr-1" />
        清除绘制
      </Button>
    </div>
  </FloatingPanel>

  <!-- 导入对话框 -->
  <ImportExportDialog
    mode="import"
    :visible="showImportDialog"
    @close="showImportDialog = false"
    @success="handleImportSuccess"
  />

  <!-- 导出对话框 -->
  <ImportExportDialog
    mode="export"
    :visible="showExportDialog"
    @close="showExportDialog = false"
    @success="handleExportSuccess"
  />
</template>
