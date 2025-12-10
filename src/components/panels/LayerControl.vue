<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLayerStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Checkbox, Switch, Tag, Select } from '@/components/ui'
import { RefreshCw, Download, Settings, Maximize2, X, MapPin, AlertTriangle, Eye, Upload, RotateCcw } from 'lucide-vue-next'

const layerStore = useLayerStore()
const appStore = useAppStore()

const emit = defineEmits<{
  (e: 'import-gis'): void
  (e: 'close'): void
}>()

// 图层类型筛选
const layerType = ref('all')
const layerTypeOptions = [
  { value: 'all', label: '所有类型' },
  { value: 'base', label: '基础图层' },
  { value: 'route', label: '路由图层' },
  { value: 'risk', label: '风险图层' },
]

// 图层类型映射
const layerTypeMap: Record<string, string> = {
  elevation: 'base',
  slope: 'base',
  volcano: 'risk',
  earthquake: 'risk',
  fishing: 'risk',
  shipping: 'risk',
}

// 图层类型显示名
const layerTypeName: Record<string, string> = {
  base: '基础',
  route: '路由',
  risk: '风险',
}

// 图层列表
const layers = computed(() => {
  const allLayers = layerStore.layers.map(layer => ({
    ...layer,
    type: layerTypeMap[layer.id] || 'base',
    typeName: layerTypeName[layerTypeMap[layer.id] || 'base'],
    status: layer.loading ? '加载中' : (layer.loaded ? '已加载' : (layer.error ? '加载失败' : '未加载')),
    statusClass: layer.loading ? 'loading' : (layer.loaded ? 'success' : (layer.error ? 'error' : 'info')),
  }))
  
  if (layerType.value === 'all') return allLayers
  return allLayers.filter(l => l.type === layerType.value)
})

// 全选状态
const allChecked = computed(() => layers.value.length > 0 && layers.value.every(l => l.visible))
const someChecked = computed(() => layers.value.some(l => l.visible) && !allChecked.value)

function handleSelectAll(checked: boolean) {
  layers.value.forEach(layer => {
    layerStore.toggleLayer(layer.id, checked)
  })
}

function handleVisibleChange(layerId: string, visible: boolean) {
  layerStore.toggleLayer(layerId, visible)
}

function handleRefresh() {
  appStore.showNotification({ type: 'info', message: '刷新图层列表' })
}

function handleImportGis() {
  emit('import-gis')
}

function handleLayerSettings(layerId: string) {
  appStore.showNotification({ type: 'info', message: `打开 ${layerId} 图层设置` })
}

function handleExport(layerId: string) {
  appStore.showNotification({ type: 'info', message: `导出 ${layerId} 数据` })
}

function handleReload(layerId: string) {
  layerStore.loadLayer(layerId)
}
</script>

<template>
  <div class="flex flex-col flex-1 bg-white rounded shadow-sm overflow-hidden text-sm">
    <!-- Panel Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-[#f5f7fa] border-b border-[#ebeef5]">
      <span class="font-semibold text-[#303133]">图层信息</span>
      <div class="flex gap-1">
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="刷新图层"
          @click="handleRefresh"
        >
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="导入GIS数据"
          @click="handleImportGis"
        >
          <Download class="w-3.5 h-3.5" />
        </button>
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="图层设置"
        >
          <Settings class="w-3.5 h-3.5" />
        </button>
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="浮动/全屏"
        >
          <Maximize2 class="w-3.5 h-3.5" />
        </button>
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="隐藏"
          @click="emit('close')"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    
    <div class="flex-1 overflow-auto p-2">
      <!-- 图层类型筛选 -->
      <div class="mb-2">
        <Select 
          v-model="layerType" 
          :options="layerTypeOptions"
          placeholder="选择类型"
        />
      </div>

      <!-- Layer Table -->
      <div class="text-xs">
        <!-- Table Header -->
        <div class="flex items-center py-1.5 border-b border-[#ebeef5] text-[#909399] font-medium">
          <div class="w-[24px] flex justify-center">
            <input 
              type="checkbox"
              :checked="allChecked"
              :indeterminate="someChecked"
              class="w-3.5 h-3.5 cursor-pointer accent-blue-500"
              @change="handleSelectAll(($event.target as HTMLInputElement).checked)"
            >
          </div>
          <span class="flex-1 pl-1">名称</span>
          <span class="w-[40px] text-center">类型</span>
          <span class="w-[52px] text-center">状态</span>
          <span class="w-[44px] text-center">操作</span>
        </div>

        <!-- Layer Rows -->
        <div 
          v-for="layer in layers" 
          :key="layer.id"
          class="flex items-center py-2 border-b border-dashed border-[#ebeef5] hover:bg-gray-50"
        >
          <div class="w-[24px] flex justify-center">
            <input 
              type="checkbox"
              :checked="layer.visible"
              class="w-3.5 h-3.5 cursor-pointer accent-blue-500"
              @change="handleVisibleChange(layer.id, ($event.target as HTMLInputElement).checked)"
            >
          </div>
          <span class="flex-1 pl-1 truncate text-[#606266]">{{ layer.name }}</span>
          <span class="w-[40px] text-center text-[#909399]">{{ layer.typeName }}</span>
          <div class="w-[52px] flex justify-center">
            <span 
              class="px-1.5 py-0.5 rounded text-[10px]"
              :class="{
                'text-green-600': layer.statusClass === 'success',
                'text-orange-500': layer.statusClass === 'loading',
                'text-red-500': layer.statusClass === 'error',
                'text-gray-400': layer.statusClass === 'info'
              }"
            >
              {{ layer.status }}
            </span>
          </div>
          <div class="w-[44px] flex justify-center gap-0.5">
            <template v-if="layer.statusClass === 'error'">
              <button 
                class="p-0.5 hover:text-blue-500 text-gray-400 transition-colors"
                title="重新加载"
                @click="handleReload(layer.id)"
              >
                <RotateCcw class="w-3.5 h-3.5" />
              </button>
            </template>
            <template v-else>
              <button 
                class="p-0.5 hover:text-blue-500 text-gray-400 transition-colors"
                title="设置"
                @click="handleLayerSettings(layer.id)"
              >
                <Settings class="w-3 h-3" />
              </button>
              <button 
                class="p-0.5 hover:text-blue-500 text-gray-400 transition-colors"
                title="导出"
                @click="handleExport(layer.id)"
              >
                <Upload class="w-3 h-3" />
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
