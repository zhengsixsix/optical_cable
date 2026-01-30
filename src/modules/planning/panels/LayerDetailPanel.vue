<script setup lang="ts">
import { ref, computed } from 'vue'
import FloatingPanel from './FloatingPanel.vue'
import { useLayerStore, useAppStore } from '@/stores'
import { Layers, Eye, EyeOff, Settings, Info } from 'lucide-vue-next'

/**
 * LayerDetailPanel 图层详情浮动面板
 * 显示图层详细信息和配置选项
 */
const layerStore = useLayerStore()
const appStore = useAppStore()

const handleClose = () => {
  appStore.setPanelVisible('layerDetailPanel', false)
}

// 图层列表
const layers = computed(() => layerStore.layers)

// 切换图层可见性
const toggleLayer = (layerId: string) => {
  const layer = layerStore.layers.find(l => l.id === layerId)
  if (layer) {
    layerStore.setLayerVisible(layerId, !layer.visible)
  }
}

// 获取图层图标颜色
const getLayerColor = (layerId: string) => {
  const colors: Record<string, string> = {
    'bathymetry': 'bg-blue-500',
    'volcano': 'bg-red-500',
    'earthquake': 'bg-orange-500',
    'shipping': 'bg-green-500',
    'fishing': 'bg-cyan-500',
    'protected': 'bg-purple-500',
  }
  return colors[layerId] || 'bg-gray-500'
}

// 获取图层类型标签
const getLayerTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'raster': '栅格',
    'vector': '矢量',
    'heatmap': '热力图',
    'point': '点',
  }
  return labels[type] || type
}
</script>

<template>
  <FloatingPanel
    title="图层详情"
    storage-key="layer-detail"
    :default-position="{ x: 660, y: 80 }"
    :default-size="{ width: 260, height: 350 }"
    :min-width="220"
    :min-height="280"
    @close="handleClose"
  >
    <div class="p-3 space-y-3">
      <!-- 图层列表 -->
      <div class="border rounded-lg overflow-hidden">
        <div class="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 flex items-center gap-2">
          <Layers class="w-4 h-4" />
          图层列表 ({{ layers.length }})
        </div>
        <div class="divide-y max-h-[200px] overflow-y-auto">
          <div
            v-for="layer in layers"
            :key="layer.id"
            class="px-3 py-2 hover:bg-gray-50"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span :class="['w-2 h-2 rounded-full', getLayerColor(layer.id)]" />
                <span class="text-xs font-medium">{{ layer.name }}</span>
              </div>
              <button
                class="p-1 rounded hover:bg-gray-200 transition-colors"
                @click="toggleLayer(layer.id)"
              >
                <component
                  :is="layer.visible ? Eye : EyeOff"
                  :class="['w-4 h-4', layer.visible ? 'text-primary' : 'text-gray-400']"
                />
              </button>
            </div>
            <div class="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
              <span class="px-1.5 py-0.5 bg-gray-100 rounded">
                {{ getLayerTypeLabel(layer.type) }}
              </span>
              <span v-if="layer.opacity !== undefined">
                透明度: {{ (layer.opacity * 100).toFixed(0) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 图例说明 -->
      <div class="border rounded-lg p-3">
        <div class="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
          <Info class="w-4 h-4" />
          图例说明
        </div>
        <div class="grid grid-cols-2 gap-2 text-[10px] text-gray-600">
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 bg-blue-500 rounded" />
            <span>水深数据</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 bg-red-500 rounded" />
            <span>火山区域</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 bg-orange-500 rounded" />
            <span>地震区域</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 bg-green-500 rounded" />
            <span>航运航道</span>
          </div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="flex gap-2">
        <button
          class="flex-1 px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          @click="layerStore.showAllLayers"
        >
          显示全部
        </button>
        <button
          class="flex-1 px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          @click="layerStore.hideAllLayers"
        >
          隐藏全部
        </button>
      </div>
    </div>
  </FloatingPanel>
</template>
