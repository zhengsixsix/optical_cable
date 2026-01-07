<script setup lang="ts">
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import LayerControl from '@/components/panels/LayerControl.vue'
import RouteStats from '@/components/panels/RouteStats.vue'
import MapArea from '@/components/map/MapArea.vue'
import LogPanel from '@/components/panels/LogPanel.vue'
import RightPanel from '@/components/panels/RightPanel.vue'
import ImportGisDialog from '@/components/dialogs/ImportGisDialog.vue'
import { useAppStore } from '@/stores'

const appStore = useAppStore()
const selectedExtent = ref<[number, number, number, number] | undefined>()
const showImportGisDialog = ref(false)

// 从 store 获取面板显示状态
const panelVisibility = computed(() => appStore.panelVisibility)

const handleAreaSelected = (extent: [number, number, number, number]) => {
  selectedExtent.value = extent
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
      <!-- 地图容器 (ParetoPanel已移入MapArea内部) -->
      <MapArea class="flex-1" @area-selected="handleAreaSelected" />
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
