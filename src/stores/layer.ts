import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LayerConfig, LayerData } from '@/types'
import { createLayerRepository } from '@/repositories'

export const useLayerStore = defineStore('layer', () => {
  const repository = createLayerRepository()

  // 状态
  const layers = ref<LayerConfig[]>([
    { id: 'volcano', name: '火山区域', type: 'both', visible: false, loaded: false, loading: false },
    { id: 'earthquake', name: '地震活动', type: 'both', visible: false, loaded: false, loading: false },
    { id: 'elevation', name: '海洋高程', type: 'raster', visible: true, loaded: true, loading: false },
    { id: 'slope', name: '海洋坡度', type: 'heatmap', visible: false, loaded: false, loading: false },
    { id: 'fishing', name: '海洋渔区分布', type: 'point', visible: false, loaded: false, loading: false },
    { id: 'shipping', name: '航道分布', type: 'vector', visible: false, loaded: false, loading: false },
    { id: 'coldCoral', name: '冷水珊瑚', type: 'vector', visible: false, loaded: false, loading: false },
  ])

  // Getters
  const visibleLayers = computed(() => layers.value.filter(l => l.visible))
  const loadedLayers = computed(() => layers.value.filter(l => l.loaded))

  // Actions
  function toggleLayer(id: string, visible: boolean) {
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.visible = visible
      }
  }

  function setLayerLoaded(id: string, loaded: boolean) {
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.loaded = loaded
      layer.loading = false
    }
  }

  function setLayerLoading(id: string, loading: boolean) {
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.loading = loading
    }
  }

  function getLayerVisible(id: string): boolean {
    const layer = layers.value.find(l => l.id === id)
    return layer?.visible ?? false
  }

  function getLayerById(id: string): LayerConfig | undefined {
    return layers.value.find(l => l.id === id)
  }

  // 图层数据存储（用户上传的 GeoJSON / 栅格数据）
  const layerDataMap = ref<Map<string, LayerData>>(new Map())

  function setLayerVisible(id: string, visible: boolean) {
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.visible = visible
    }
  }

  /**
   * 存储图层数据（用户上传的 GeoJSON / TIF 文件内容）
   */
  function setLayerData(id: string, data: LayerData) {
    layerDataMap.value.set(id, data)
    // 标记为已加载
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.loaded = true
      layer.loading = false
    }
  }

  /**
   * 获取图层数据
   */
  function getLayerData(id: string): LayerData | undefined {
    return layerDataMap.value.get(id)
  }

  /**
   * 检查图层是否有实际数据（用户上传过文件）
   */
  function hasLayerData(id: string): boolean {
    return layerDataMap.value.has(id)
  }

  function showAllLayers() {
    layers.value.forEach(layer => {
      layer.visible = true
    })
    }

  function hideAllLayers() {
    layers.value.forEach(layer => {
      layer.visible = false
    })
    }

  async function loadLayers() {
    try {
      const data = await repository.getLayers()
      layers.value = data
    } catch {
      // 静默处理加载失败
    }
  }

  async function loadLayer(id: string) {
    const layer = layers.value.find(l => l.id === id)
    if (!layer) return

    layer.loading = true
    layer.error = false

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      layer.loaded = true
      layer.loading = false
      } catch {
      layer.loading = false
      layer.error = true
    }
  }

  return {
    layers,
    layerDataMap,
    visibleLayers,
    loadedLayers,
    toggleLayer,
    setLayerLoaded,
    setLayerLoading,
    setLayerVisible,
    getLayerVisible,
    getLayerById,
    setLayerData,
    getLayerData,
    hasLayerData,
    showAllLayers,
    hideAllLayers,
    loadLayers,
    loadLayer,
  }
})
