<script setup lang="ts">
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import LayerControl from '@/modules/planning/panels/LayerControl.vue'
import RouteStats from '@/modules/planning/panels/RouteStats.vue'
import MapArea from '@/modules/planning/components/MapArea.vue'
import LogPanel from '@/components/panels/LogPanel.vue'
import RightPanel from '@/components/panels/RightPanel.vue'
import ImportGisDialog from '@/modules/planning/dialogs/ImportGisDialog.vue'
import { useAppStore } from '@/stores/app'
import { useRouteStore } from '@/stores/route'
const appStore = useAppStore()
const routeStore = useRouteStore()
const selectedExtent = ref<[number, number, number, number] | undefined>()
const showImportGisDialog = ref(false)

// 从 store 获取面板显示状态
const panelVisibility = computed(() => appStore.panelVisibility)

// 项目状态检测
const hasOpenProject = computed(() => appStore.hasOpenProject)
const selectedRouteExtent = computed<[number, number, number, number] | undefined>(() => {
  const coordinates = routeStore.selectedRoute?.rawTrunkCoordinates
    ?? routeStore.selectedRoute?.points.map(point => point.coordinates)
    ?? []
  const longitudes = coordinates.map(coordinate => Number(coordinate[0])).filter(Number.isFinite)
  const latitudes = coordinates.map(coordinate => Number(coordinate[1])).filter(Number.isFinite)
  if (longitudes.length === 0 || latitudes.length === 0) return undefined
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ]
})

const depthProfileExtent = computed(() => selectedExtent.value ?? selectedRouteExtent.value)

const handleAreaSelected = (extent: [number, number, number, number]) => {
  selectedExtent.value = extent
}

const handleNewProject = () => {
  appStore.openDialog('new-project')
}

const handleOpenProject = async () => {
  appStore.openDialog('open-project')
}
</script>

<template>
  <MainLayout>
    <template #left>
      <LayerControl 
        v-if="panelVisibility.layerInfo" 
        @import-gis="showImportGisDialog = true" 
        @close="appStore.togglePanel('layerInfo')"
      />
      <RouteStats v-if="panelVisibility.routeStats" @close="appStore.togglePanel('routeStats')" />
    </template>

    <template #center>
      <!-- 无项目引导 -->
      <div v-if="!hasOpenProject" class="absolute top-4 left-1/2 -translate-x-1/2 z-30">
        <div class="bg-white/95 backdrop-blur rounded-xl shadow-lg border border-blue-100 px-6 py-4 max-w-md">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-gray-800">尚未打开项目</h3>
              <p class="text-xs text-gray-500">请先创建或打开项目以开始路由规划</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button 
              class="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              @click="handleNewProject"
            >
              新建项目
            </button>
            <button 
              class="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              @click="handleOpenProject"
            >
              打开项目
            </button>
          </div>
        </div>
      </div>

      <!-- 地图容器 (ParetoPanel已移入MapArea内部) -->
      <MapArea class="flex-1" @area-selected="handleAreaSelected" />
      <LogPanel v-if="panelVisibility.logPanel" />
    </template>

    <template #right>
      <RightPanel :selected-extent="depthProfileExtent" />
    </template>
  </MainLayout>
  
  <!-- 导入GIS数据对话框 -->
  <ImportGisDialog 
    :visible="showImportGisDialog" 
    @close="showImportGisDialog = false"
    @success="showImportGisDialog = false"
  />
</template>
