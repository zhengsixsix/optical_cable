<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { Printer, X, Maximize2 } from 'lucide-vue-next'
import MonitorPanel from './MonitorPanel.vue'
import DepthProfile from '@/components/visualization/DepthProfile.vue'
import Terrain3D from '@/components/visualization/Terrain3D.vue'
import { useAppStore } from '@/stores'

interface Props {
  selectedExtent?: [number, number, number, number]
}

const props = defineProps<Props>()
const appStore = useAppStore()

const panelVisibility = computed(() => appStore.panelVisibility)

const showFullscreen3D = ref(false)

function togglePanel(panel: 'depthProfile' | 'terrain3D' | 'realtime') {
  appStore.togglePanel(panel)
}
</script>

<template>
  <div class="flex flex-col gap-2 h-full">
    <!-- 水深剖面 -->
    <Card v-if="panelVisibility.depthProfile" class="h-[200px] flex-shrink-0 flex flex-col overflow-hidden">
      <CardHeader>
        <span class="font-semibold text-sm text-gray-700">海缆水深剖面</span>
        <div class="flex gap-1">
          <button class="p-1 hover:bg-gray-200 rounded" title="打印">
            <Printer class="w-4 h-4 text-gray-500" />
          </button>
          <button class="p-1 hover:bg-gray-200 rounded" title="隐藏" @click="togglePanel('depthProfile')">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </CardHeader>
      <CardContent class="flex-1 p-0 overflow-hidden">
        <DepthProfile :extent="selectedExtent" />
      </CardContent>
    </Card>

    <!-- 3D 地形 -->
    <Card v-if="panelVisibility.terrain3D" class="h-[200px] flex-shrink-0 flex flex-col overflow-hidden">
      <CardHeader>
        <span class="font-semibold text-sm text-gray-700">地形 3D 显示</span>
        <div class="flex gap-1">
          <button 
            class="p-1 hover:bg-gray-200 rounded"
            title="全屏"
            @click="showFullscreen3D = true"
          >
            <Maximize2 class="w-4 h-4 text-gray-500" />
          </button>
          <button class="p-1 hover:bg-gray-200 rounded" title="隐藏" @click="togglePanel('terrain3D')">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </CardHeader>
      <CardContent class="flex-1 p-0 overflow-hidden bg-[#1a1a2e]">
        <Terrain3D :extent="selectedExtent" />
      </CardContent>
    </Card>

    <!-- 实时性能概览 -->
    <MonitorPanel v-if="panelVisibility.realtime" @close="togglePanel('realtime')" />

    <!-- 全屏 3D 对话框 -->
    <Teleport to="body">
      <div 
        v-if="showFullscreen3D"
        class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
        @click.self="showFullscreen3D = false"
      >
        <div class="w-[90vw] h-[90vh] bg-[#1a1a2e] rounded-lg overflow-hidden flex flex-col">
          <div class="flex items-center justify-between p-4 bg-gray-800 text-white">
            <span class="font-semibold">3D 地形预览</span>
            <button 
              class="p-1 hover:bg-gray-700 rounded"
              @click="showFullscreen3D = false"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="flex-1">
            <Terrain3D :extent="selectedExtent" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
