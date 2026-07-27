import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LayerConfig, LayerData } from '@/types'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { platformPlanLayerApi } from '@/services/platform/api'
import type { PlanLayer } from '@/services/platform/types'
import { detectGisFormat, getPlanLayerFileName } from '@/utils/gisFormat'
import { getPlatformAttachmentUrl } from '@/services/platform/attachment'
import {
  getLocalLayerIdForDictionaryCode,
  getRuntimeLayerTypeForDictionaryCode,
} from '@/services/platform/layerTypeAdapter'

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
  const dictionaryStore = useDictionaryStore()
  // 状态
  const layers = ref<LayerConfig[]>([])

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

  function removeLayer(id: string) {
    layers.value = layers.value.filter(layer => layer.id !== id)
    layerDataMap.value.delete(id)
  }

  function syncDictionaryLayers() {
    for (const item of dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.layerType)) {
      const id = getLocalLayerIdForDictionaryCode(item.code)
      const existing = layers.value.find(layer => layer.id === id)
      upsertLayer({
        id,
        name: item.name || String(item.code),
        type: getRuntimeLayerTypeForDictionaryCode(item.code),
        visible: existing?.visible ?? false,
        loaded: existing?.loaded ?? false,
        loading: existing?.loading ?? false,
        error: existing?.error,
        opacity: existing?.opacity,
        zIndex: existing?.zIndex,
      })
    }
  }

  function getPlatformLayerId(layer: PlanLayer): string {
    return layer.typeDic
      ? getLocalLayerIdForDictionaryCode(layer.typeDic)
      : `platform-layer-${layer.id ?? layer.attachmentId ?? layer.name ?? Date.now()}`
  }

  function mapPlatformLayer(layer: PlanLayer): LayerConfig {
    const id = getPlatformLayerId(layer)
    const existing = layers.value.find(item => item.id === id)
    const existingPlatformSource = layerDataMap.value.get(id)?.metadata.source.startsWith('platform:')

    return {
      id,
      name: dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.layerType, layer.typeDic)?.name
        || layer.name || layer.attachmentName || layer.filename || `平台图层 ${layer.id ?? ''}`.trim(),
      type: getRuntimeLayerTypeForDictionaryCode(layer.typeDic),
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
    syncDictionaryLayers()
    const nextIds = new Set<string>()
    const uploadedManagedIds = new Set<string>()
    const platformManagedLayerIds = new Set(
      dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.layerType)
        .map(item => getLocalLayerIdForDictionaryCode(item.code)),
    )

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

  async function loadPlatformProjectLayers(projectId?: number | string | null) {
    platformLayersLoading.value = true
    platformLayersError.value = null

    try {
      await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.layerType)
      syncDictionaryLayers()
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

  return {
    layers,
    layerDataMap,
    platformProjectLayers,
    platformLayersLoading,
    platformLayersError,
    toggleLayer,
    setLayerLoaded,
    setLayerLoading,
    setLayerVisible,
    upsertLayer,
    removeLayer,
    getLayerVisible,
    getLayerById,
    setLayerData,
    getLayerData,
    loadPlatformProjectLayers,
    loadPlatformLayerDetail,
    syncDictionaryLayers,
  }
})
