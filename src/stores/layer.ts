import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LayerConfig } from '@/types'
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
  ])

  // Getters
  const visibleLayers = computed(() => layers.value.filter(l => l.visible))
  const loadedLayers = computed(() => layers.value.filter(l => l.loaded))

  // Actions
  function toggleLayer(id: string, visible: boolean) {
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.visible = visible
      console.log(`图层 ${layer.name} 可见性: ${visible}`)
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

  function setLayerVisible(id: string, visible: boolean) {
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.visible = visible
    }
  }

  function showAllLayers() {
    layers.value.forEach(layer => {
      layer.visible = true
    })
    console.log('显示所有图层')
  }

  function hideAllLayers() {
    layers.value.forEach(layer => {
      layer.visible = false
    })
    console.log('隐藏所有图层')
  }

  async function loadLayers() {
    try {
      const data = await repository.getLayers()
      layers.value = data
    } catch (error) {
      console.error('加载图层失败:', error)
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
      console.log(`图层 ${layer.name} 加载成功`)
    } catch (error) {
      layer.loading = false
      layer.error = true
      console.error(`图层 ${layer.name} 加载失败:`, error)
    }
  }

  return {
    layers,
    visibleLayers,
    loadedLayers,
    toggleLayer,
    setLayerLoaded,
    setLayerLoading,
    setLayerVisible,
    getLayerVisible,
    getLayerById,
    showAllLayers,
    hideAllLayers,
    loadLayers,
    loadLayer,
  }
})
