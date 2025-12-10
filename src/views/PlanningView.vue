<script setup lang="ts">
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import LayerControl from '@/components/panels/LayerControl.vue'
import RouteStats from '@/components/panels/RouteStats.vue'
import MapArea from '@/components/map/MapArea.vue'
import LogPanel from '@/components/panels/LogPanel.vue'
import RightPanel from '@/components/panels/RightPanel.vue'
import ParetoPanel from '@/components/panels/ParetoPanel.vue'
import ImportGisDialog from '@/components/dialogs/ImportGisDialog.vue'
import { useAppStore } from '@/stores'

const appStore = useAppStore()
const selectedExtent = ref<[number, number, number, number] | undefined>()
const showImportGisDialog = ref(false)

// 从 store 获取面板显示状态
const panelVisibility = computed(() => appStore.panelVisibility)

// ParetoPanel 折叠状态
const paretoPanelCollapsed = ref(false)

const handleAreaSelected = (extent: [number, number, number, number]) => {
  selectedExtent.value = extent
}

const handleSelectRoute = (routeId: string) => {
  console.log('选中路径:', routeId)
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
      <!-- 地图容器 (相对定位，用于承载 ParetoPanel) -->
      <div class="flex-1 relative flex flex-col min-h-0">
        <MapArea class="flex-1" @area-selected="handleAreaSelected" />
        
        <!-- Pareto 路径列表面板 (地图右上角浮动) -->
        <ParetoPanel 
          v-model:collapsed="paretoPanelCollapsed"
          @select-route="handleSelectRoute"
        />
      </div>
      
      <LogPanel v-if="panelVisibility.logPanel" />
    </template>

    <template #right>
      <RightPanel :selected-extent="selectedExtent" />
    </template>
  </MainLayout>
  
  <!-- 导入GIS数据对话框 -->
  <ImportGisDialog 
    :visible="showImportGisDialog" 
    @close="showImportGisDialog = false"
    @success="showImportGisDialog = false"
  />
</template>
