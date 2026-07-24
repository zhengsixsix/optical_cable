import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Extent, Projection } from '@/types'

export const useMapStore = defineStore('map', () => {
  // 状态
  const projection = ref<Projection>('EPSG:3857')
  const selectedExtent = ref<Extent | null>(null)
  const isBoxSelecting = ref(false)

  // Getters
  const hasSelection = computed(() => selectedExtent.value !== null)

  // Actions
  function setProjection(proj: Projection) {
    projection.value = proj
  }

  function setSelectedExtent(ext: Extent | null) {
    selectedExtent.value = ext
  }

  function setBoxSelecting(selecting: boolean) {
    isBoxSelecting.value = selecting
  }

  function clearSelection() {
    selectedExtent.value = null
  }

  return {
    projection,
    selectedExtent,
    isBoxSelecting,
    hasSelection,
    setProjection,
    setSelectedExtent,
    setBoxSelecting,
    clearSelection,
  }
})
