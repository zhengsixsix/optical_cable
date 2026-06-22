import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LayerConfig, LayerData } from '@/types'
import { createLayerRepository } from '@/repositories'
import { platformPlanLayerApi } from '@/services/platform/api'
import type { PlanLayer, PlanLayerTypeDic } from '@/services/platform/types'
import { detectGisFormat, getPlanLayerFileName } from '@/utils/gisFormat'
import { getPlatformAttachmentUrl } from '@/services/platform/attachment'

const platformLayerTypeToLocalId: Partial<Record<PlanLayerTypeDic, string>> = {
  BATHY: 'elevation',
  SLOPE: 'slope',
  VOLCANO: 'volcano',
  CWCORAL: 'coldCoral',
  SEISMIC: 'earthquake',
  FISHZONE: 'fishing',
  SHIPLANE: 'shipping',
}

const localLayerTypes: Record<string, LayerConfig['type']> = {
  elevation: 'raster',
  slope: 'heatmap',
  volcano: 'both',
  coldCoral: 'vector',
  earthquake: 'both',
  fishing: 'point',
  shipping: 'vector',
}

const defaultLayerNames: Record<string, string> = {
  elevation: '海洋高程',
  slope: '海洋坡度',
  volcano: '火山区域',
  coldCoral: '冷水珊瑚',
  earthquake: '地震活动',
  fishing: '海洋渔区分布',
  shipping: '航道分布',
}

const platformManagedLayerIds = new Set(Object.values(platformLayerTypeToLocalId))

function getPlatformLayerDownloadUrl(platformLayer: PlanLayer): string | null {
  const layerWithUrl = platformLayer as PlanLayer & {
    downloadUrl?: string | null
    fileUrl?: string | null
    url?: string | null
    path?: string | null
    uploadUrl?: string | null
  }

  return layerWithUrl.downloadUrl
    || layerWithUrl.fileUrl
    || layerWithUrl.url
    || layerWithUrl.path
    || (platformLayer.attachmentId ? getPlatformAttachmentUrl(platformLayer.attachmentId) : null)
    || layerWithUrl.uploadUrl
    || null
}

export const useLayerStore = defineStore('layer', () => {
  const repository = createLayerRepository()

  // 状态
  const layers = ref<LayerConfig[]>([
    { id: 'volcano', name: '火山区域', type: 'both', visible: false, loaded: false, loading: false },
    { id: 'earthquake', name: '地震活动', type: 'both', visible: false, loaded: false, loading: false },
    { id: 'elevation', name: '海洋高程', type: 'raster', visible: false, loaded: false, loading: false },
    { id: 'slope', name: '海洋坡度', type: 'heatmap', visible: false, loaded: false, loading: false },
    { id: 'fishing', name: '海洋渔区分布', type: 'point', visible: false, loaded: false, loading: false },
    { id: 'shipping', name: '航道分布', type: 'vector', visible: false, loaded: false, loading: false },
    { id: 'coldCoral', name: '冷水珊瑚', type: 'vector', visible: false, loaded: false, loading: false },
  ])

  // Getters
  const visibleLayers = computed(() => layers.value.filter(l => l.visible))
  const loadedLayers = computed(() => layers.value.filter(l => l.loaded))
  const platformProjectLayers = ref<PlanLayer[]>([])
  const platformLayersLoading = ref(false)
  const platformLayersError = ref<string | null>(null)

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

  function upsertLayer(config: LayerConfig) {
    const index = layers.value.findIndex(layer => layer.id === config.id)
    if (index >= 0) {
      layers.value[index] = { ...layers.value[index], ...config }
      return
    }

    layers.value.push(config)
  }

  function getPlatformLayerId(layer: PlanLayer): string {
    const localId = layer.typeDic ? platformLayerTypeToLocalId[layer.typeDic] : undefined
    return localId ?? `platform-layer-${layer.id ?? layer.attachmentId ?? layer.name ?? Date.now()}`
  }

  function mapPlatformLayer(layer: PlanLayer): LayerConfig {
    const id = getPlatformLayerId(layer)
    const existing = layers.value.find(item => item.id === id)
    const existingPlatformSource = layerDataMap.value.get(id)?.metadata.source.startsWith('platform:')

    return {
      id,
      name: defaultLayerNames[id] || layer.name || layer.attachmentName || layer.filename || `平台图层 ${layer.id ?? ''}`.trim(),
      type: localLayerTypes[id] ?? 'vector',
      visible: existingPlatformSource ? (existing?.visible ?? false) : false,
      loaded: Boolean(layer.attachmentId),
      loading: false,
      error: false,
      opacity: existing?.opacity,
      zIndex: existing?.zIndex,
    }
  }

  function buildPlatformLayerData(config: LayerConfig, platformLayer: PlanLayer): LayerData {
    const fileName = getPlanLayerFileName(platformLayer)
    const gisFormat = detectGisFormat(fileName)
    const source = `platform:${platformLayer.id ?? ''}:${platformLayer.attachmentId ?? ''}`
    const downloadUrl = getPlatformLayerDownloadUrl(platformLayer)

    return {
      id: config.id,
      metadata: {
        source,
        projection: 'EPSG:4326',
        fileName,
        extension: gisFormat.extension,
        gisFormat: gisFormat.format,
        gisKind: gisFormat.kind,
        loadStrategy: gisFormat.loadStrategy,
        supported: gisFormat.supported,
        attachmentId: platformLayer.attachmentId ?? null,
        attachmentName: platformLayer.attachmentName ?? null,
        platformLayerId: platformLayer.id ?? null,
        typeDic: platformLayer.typeDic ?? null,
        downloadUrl,
      },
    }
  }

  function applyPlatformLayers(platformLayers: PlanLayer[]) {
    const nextIds = new Set<string>()
    const uploadedManagedIds = new Set<string>()

    for (const platformLayer of platformLayers) {
      const config = mapPlatformLayer(platformLayer)
      nextIds.add(config.id)
      if (platformLayer.attachmentId) {
        uploadedManagedIds.add(config.id)
      }
      upsertLayer(config)

      if (platformLayer.attachmentId) {
        layerDataMap.value.set(config.id, buildPlatformLayerData(config, platformLayer))
      } else {
        layerDataMap.value.delete(config.id)
      }
    }

    for (const layer of layers.value) {
      if (!platformManagedLayerIds.has(layer.id)) continue
      if (uploadedManagedIds.has(layer.id)) continue

      layer.visible = false
      layer.loaded = false
      layer.loading = false
      layerDataMap.value.delete(layer.id)
    }

    layers.value = layers.value.filter(layer => !layer.id.startsWith('platform-layer-') || nextIds.has(layer.id))
  }

  async function loadPlatformLayerDetail(localLayerId: string) {
    const layerData = layerDataMap.value.get(localLayerId)
    const platformLayerId = layerData?.metadata.platformLayerId
    const listLayer = platformProjectLayers.value.find(layer => getPlatformLayerId(layer) === localLayerId)
    const detailId = platformLayerId ?? listLayer?.id
    if (!detailId) return null

    const detail = await platformPlanLayerApi.detail(detailId)
    const mergedLayer = {
      ...listLayer,
      ...detail,
      id: detail.id ?? detailId,
      typeDic: detail.typeDic ?? listLayer?.typeDic ?? layerData?.metadata.typeDic ?? null,
      attachmentId: detail.attachmentId ?? listLayer?.attachmentId ?? layerData?.metadata.attachmentId ?? null,
      attachmentName: detail.attachmentName ?? listLayer?.attachmentName ?? layerData?.metadata.attachmentName ?? null,
      projectId: detail.projectId ?? listLayer?.projectId ?? null,
    } as PlanLayer

    const index = platformProjectLayers.value.findIndex(layer => getPlatformLayerId(layer) === localLayerId)
    if (index >= 0) {
      platformProjectLayers.value[index] = mergedLayer
    } else {
      platformProjectLayers.value.push(mergedLayer)
    }

    const config = mapPlatformLayer(mergedLayer)
    upsertLayer(config)
    if (mergedLayer.attachmentId) {
      layerDataMap.value.set(config.id, buildPlatformLayerData(config, mergedLayer))
    }

    return mergedLayer
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

  async function loadPlatformProjectLayers(projectId?: number | string | null) {
    platformLayersLoading.value = true
    platformLayersError.value = null

    try {
      if (!projectId) {
        platformProjectLayers.value = []
        applyPlatformLayers([])
        return
      }

      const payload = {
        pageNumber: 1,
        pageSize: 1000,
        projectId,
      }
      const response = await platformPlanLayerApi.search(payload)
      platformProjectLayers.value = response.data ?? []
      applyPlatformLayers(platformProjectLayers.value)
    } catch (error) {
      platformLayersError.value = (error as Error).message
      platformProjectLayers.value = []
      throw error
    } finally {
      platformLayersLoading.value = false
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
    platformProjectLayers,
    platformLayersLoading,
    platformLayersError,
    toggleLayer,
    setLayerLoaded,
    setLayerLoading,
    setLayerVisible,
    upsertLayer,
    getLayerVisible,
    getLayerById,
    setLayerData,
    getLayerData,
    hasLayerData,
    showAllLayers,
    hideAllLayers,
    loadLayers,
    loadPlatformProjectLayers,
    loadPlatformLayerDetail,
    loadLayer,
  }
})
