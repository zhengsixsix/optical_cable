import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Coordinate, Extent, Projection, ToolMode } from '@/types'

export const useMapStore = defineStore('map', () => {
  // 状态
  const center = ref<Coordinate>([0, 20])
  const zoom = ref(1)
  const projection = ref<Projection>('EPSG:4326')
  const extent = ref<Extent | null>(null)
  const selectedExtent = ref<Extent | null>(null)
  const toolMode = ref<ToolMode>('pan')
  const isBoxSelecting = ref(false)

  // Getters
  const hasSelection = computed(() => selectedExtent.value !== null)

  // Actions
  function setCenter(coords: Coordinate) {
    center.value = coords
  }

  function setZoom(level: number) {
    zoom.value = level
  }

  function setProjection(proj: Projection) {
    projection.value = proj
  }

  function setExtent(ext: Extent | null) {
    extent.value = ext
  }

  function setSelectedExtent(ext: Extent | null) {
    selectedExtent.value = ext
    console.log('区域已选择:', ext)
  }

  function setToolMode(mode: ToolMode) {
    toolMode.value = mode
  }

  function setBoxSelecting(selecting: boolean) {
    isBoxSelecting.value = selecting
  }

  function clearSelection() {
    selectedExtent.value = null
  }

  return {
    center,
    zoom,
    projection,
    extent,
    selectedExtent,
    toolMode,
    isBoxSelecting,
    hasSelection,
    setCenter,
    setZoom,
    setProjection,
    setExtent,
    setSelectedExtent,
    setToolMode,
    setBoxSelecting,
    clearSelection,
  }
})
