<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useLayerStore } from '@/stores/layer'
import { useMonitorStore } from '@/stores/monitor'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { ref, onMounted, onUnmounted, watch, toRef } from 'vue'
import { useMapStore } from '@/stores/map'
import {Button, Tooltip} from '@/shared/components/base'
import {
  Square, Play, Pause, Loader2, FileSpreadsheet, MapPinned, Move3d, Trash2
} from 'lucide-vue-next'

// 新增组件导入
import ParetoPanel from '@/modules/planning/panels/ParetoPanel.vue'
import ParetoFrontierDialog from '@/modules/planning/dialogs/ParetoFrontierDialog.vue'

// OpenLayers imports
import Map from 'ol/Map'
import View from 'ol/View'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import WebGLPointsLayer from 'ol/layer/WebGLPoints'
import ImageLayer from 'ol/layer/Image'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoTIFFSource from 'ol/source/GeoTIFF'
import ImageStatic from 'ol/source/ImageStatic'
import GeoJSONFormat from 'ol/format/GeoJSON'
import { createBaseTileSource } from '@/utils/mapTileSource'
import {DragBox, Modify} from 'ol/interaction'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import { fromExtent as polygonFromExtent } from 'ol/geom/Polygon'
import {Style, Stroke, Fill, Icon, Circle as CircleStyle, Text} from 'ol/style'
import Heatmap from 'ol/layer/Heatmap'
import { transform, transformExtent } from 'ol/proj'
import 'ol/ol.css'

import {useShpLoader} from '@/services/ShpLoader'
import {createColdCoralLayers, createFishingLayers, createShippingLayers} from '@/utils/layerFactory'
import { fetchPlatformAttachmentBlob, isPlatformAttachmentUrl } from '@/services/platform/attachment'
import { parseShapefileAttachment } from '@/services/GisAttachmentParser'

// 图标资源
import volcanoIconUrl from '@/assets/volcano.svg'

import { fetchRoutePlanningByProjectId } from '@/services/RoutePlanningApiService'
import type { AlgorithmRouteBundleResult, NumericGridData } from '@/services/RouteDataConverter'
import { platformPlanConfigApi } from '@/services/platform/api'
import { getSharedRoutePointRenderKey } from '@/utils/routePointRenderKey'
import {
  DATA_PROJECTION,
  MAP_DISPLAY_PROJECTION,
  fromMapCoordinate,
  fromMapCoordinates,
  fromMapExtent,
  toMapCoordinate,
  toMapExtent,
  toMapCoordinates,
} from '@/utils/mapProjection'
import {
  createRoutePlanningRectRangeFromExtent,
  DEFAULT_CHINA_LON_LAT_EXTENT,
  DEFAULT_CHINA_MAP_CENTER,
  DEFAULT_CHINA_MAP_ZOOM,
  type LonLatExtent,
  type RoutePlanningRectRange,
} from '@/utils/routePlanningViewport'

const mapStore = useMapStore()
const layerStore = useLayerStore()
const appStore = useAppStore()
const routeStore = useRouteStore()
const cableSegmentStore = useCableSegmentStore()
const monitorStore = useMonitorStore()
const defaultElevationGeoTiffUrl = '/data/output2_cog.tif'

// 监听投影变化
const currentProjection = toRef(mapStore, 'projection')

const emit = defineEmits<{
  (e: 'area-selected', extent: [number, number, number, number]): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const loading = ref(false)
const coordinates = ref({lon: 0, lat: 0})
const isPlanning = ref(false)
const settingsStore = useSettingsStore()
const selectedAreaLonLatExtent = ref<LonLatExtent | null>(null)
const activePlanningLonLatExtent = ref<LonLatExtent | null>(null)
const areaContextMenu = ref({ visible: false, x: 0, y: 0 })
const isAdjustingRoute = ref(false)

// 新增弹窗状态
const showParetoFrontierDialog = ref(false)
const geoJSONFormat = new GeoJSONFormat()
const geoTiffRgbStyle = {color: ['array', ['band', 1], ['band', 2], ['band', 3], ['band', 4]]}

const loadShpFeatures = async (url: string) => {
  const shpLoader = useShpLoader()
  const geojsonData = await shpLoader.load(url)
  return shpLoader.parseFeatures(geojsonData)
}

const loadShpFeaturesFromBlob = async (blob: Blob, fileName = 'layer.zip') => {
  return useShpLoader().parseFeatures(await parseShapefileAttachment(blob, fileName))
}

const loadPlatformAttachmentShpFeatures = async (downloadUrl: string, fileName: string) => {
  return loadShpFeaturesFromBlob(await fetchPlatformAttachmentBlob(downloadUrl), fileName)
}

const parseGeoJsonFeatures = (geojsonData: unknown) => {
  return geoJSONFormat.readFeatures(geojsonData as any, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:4326',
  })
}

const loadPlatformAttachmentGeoJsonFeatures = async (downloadUrl: string) => {
  const blob = await fetchPlatformAttachmentBlob(downloadUrl)
  return parseGeoJsonFeatures(JSON.parse(await blob.text()))
}

const fitVectorSource = (source: VectorSource, maxZoom = 10) => {
  if (!map) return
  const extent = source.getExtent()
  if (extent.length !== 4 || !extent.every(Number.isFinite) || extent[0] > extent[2] || extent[1] > extent[3]) return
  map.getView().fit(extent, {
    padding: [50, 50, 50, 50],
    duration: 800,
    maxZoom,
  })
}

const getLayerData = (layerId: string) => layerStore.getLayerData(layerId)

const isPlatformLayerData = (layerId: string) => {
  return getLayerData(layerId)?.metadata.source.startsWith('platform:') ?? false
}

const isUnavailablePlatformLayer = (layerId: string) => {
  const layerData = getLayerData(layerId)
  if (!layerData?.metadata.source.startsWith('platform:')) return false
  return !layerData.features && !layerData.rasterData && !layerData.metadata.downloadUrl
}

const getUploadedLayerLabel = (layerId: string) => isPlatformLayerData(layerId) ? '平台上传' : '本地上传'

const getLayerGlobalLoadingKey = (layerId: string) => `layer:${layerId}`

const showLayerGlobalLoading = (layerId: string) => {
  const layer = layerStore.getLayerById(layerId)
  appStore.showGlobalLoading('正在加载图层...', layer?.name ?? layerId, getLayerGlobalLoadingKey(layerId))
}

const hideLayerGlobalLoading = (layerId: string) => {
  appStore.hideGlobalLoading(getLayerGlobalLoadingKey(layerId))
}

const failPlatformLayerRender = (layerId: string, message: string, error?: unknown) => {
  const layer = layerStore.getLayerById(layerId)
  const suffix = error instanceof Error ? `：${error.message}` : ''
  appStore.showNotification({
    type: 'error',
    message: `${layer?.name ?? layerId}${message}${suffix}`,
    duration: 5000,
  })
  appStore.addLog('ERROR', `${layerId} 图层加载失败: ${message}${suffix}`)
  layerStore.setLayerLoading(layerId, false)
  layerStore.setLayerVisible(layerId, false)
  hideLayerGlobalLoading(layerId)
}

const notifyPlatformLayerMissingSource = (layerId: string) => {
  const metadata = getLayerData(layerId)?.metadata
  const fileName = metadata?.fileName ? `（${metadata.fileName}）` : ''
  failPlatformLayerRender(layerId, ` 平台图层已上传${fileName}，但接口未返回可下载地址，暂不能加载`)
}

const notifyUnsupportedUploadedLayer = (layerId: string) => {
  const metadata = getLayerData(layerId)?.metadata
  failPlatformLayerRender(layerId, ` 已上传 ${metadata?.gisFormat ?? '未知'} 格式，当前地图暂不支持直接加载`)
}

const getUploadedVectorFeatures = (layerId: string) => {
  const layerData = layerStore.getLayerData(layerId)
  if (!layerData?.features) return []

  try {
    return useShpLoader().parseFeatures(layerData.features as any)
  } catch (error) {
    appStore.addLog('ERROR', `${layerId} 图层数据解析失败: ${(error as Error).message}`)
    return []
  }
}

const loadUploadedVectorFeatures = async (layerId: string) => {
  const layerData = getLayerData(layerId)
  const localFeatures = getUploadedVectorFeatures(layerId)
  if (localFeatures.length > 0) return localFeatures

  if (!layerData?.metadata.source.startsWith('platform:')) return []
  if (isUnavailablePlatformLayer(layerId)) {
    notifyPlatformLayerMissingSource(layerId)
    return []
  }

  const downloadUrl = layerData.metadata.downloadUrl
  if (!downloadUrl) {
    notifyPlatformLayerMissingSource(layerId)
    return []
  }

  const fileName = layerData.metadata.fileName || layerData.metadata.attachmentName || '平台图层'

  if (layerData.metadata.loadStrategy === 'shapefile-zip-vector') {
    if (isPlatformAttachmentUrl(downloadUrl)) {
      return loadPlatformAttachmentShpFeatures(downloadUrl, fileName)
    }
    return loadShpFeatures(downloadUrl)
  }

  if (layerData.metadata.loadStrategy === 'shapefile-component') {
    if (isPlatformAttachmentUrl(downloadUrl)) {
      return loadPlatformAttachmentShpFeatures(downloadUrl, fileName)
    }
    return loadShpFeatures(downloadUrl)
  }

  if (layerData.metadata.loadStrategy === 'geojson-vector') {
    if (isPlatformAttachmentUrl(downloadUrl)) {
      return loadPlatformAttachmentGeoJsonFeatures(downloadUrl)
    }
    const response = await fetch(downloadUrl)
    if (!response.ok) throw new Error(`平台图层读取失败: ${response.status}`)
    return parseGeoJsonFeatures(await response.json())
  }

  notifyUnsupportedUploadedLayer(layerId)
  return []
}

const loadRequiredVectorFeatures = async (layerId: string) => {
  const uploadedFeatures = await loadUploadedVectorFeatures(layerId)
  if (uploadedFeatures.length > 0) {
    return { features: uploadedFeatures, sourceLabel: getUploadedLayerLabel(layerId) }
  }

  return { features: [], sourceLabel: getUploadedLayerLabel(layerId) }
}

const createGeoTiffLayer = (source: GeoTIFFSource, visible: boolean) => new WebGLTileLayer({
  source,
  style: geoTiffRgbStyle as any,
  visible,
  opacity: 1,
  preload: 2,
  useInterimTilesOnError: true,
  cacheSize: 1024,
})

const createPlatformAttachmentGeoTiffSource = async (downloadUrl: string) => new GeoTIFFSource({
  sources: [{ blob: await fetchPlatformAttachmentBlob(downloadUrl) }],
  convertToRGB: 'auto',
  normalize: true,
  wrapX: true,
})

const createDefaultGeoTiffSource = () => ({
  key: `default:${defaultElevationGeoTiffUrl}`,
  source: new GeoTIFFSource({
    sources: [{ url: defaultElevationGeoTiffUrl }],
    convertToRGB: 'auto',
    normalize: true,
    wrapX: true,
  }),
})

const createUploadedGeoTiffSource = async (layerId: string) => {
  const layerData = getLayerData(layerId)
  if (!layerData) return null

  if (layerData.metadata.loadStrategy !== 'geotiff-raster') {
    notifyUnsupportedUploadedLayer(layerId)
    return null
  }

  if (layerData.rasterData) {
    return {
      key: `raster:${layerData.metadata.source}:${layerData.rasterData.byteLength}`,
      source: new GeoTIFFSource({
        sources: [{ blob: new Blob([layerData.rasterData], { type: 'image/tiff' }) }],
        convertToRGB: 'auto',
        normalize: true,
        wrapX: true,
      }),
    }
  }

  if (!layerData.metadata.downloadUrl) {
    notifyPlatformLayerMissingSource(layerId)
    return null
  }

  if (isPlatformAttachmentUrl(layerData.metadata.downloadUrl)) {
    return {
      key: `attachment:${layerData.metadata.downloadUrl}`,
      source: await createPlatformAttachmentGeoTiffSource(layerData.metadata.downloadUrl),
    }
  }

  return {
    key: `url:${layerData.metadata.downloadUrl}`,
    source: new GeoTIFFSource({
      sources: [{ url: layerData.metadata.downloadUrl }],
      convertToRGB: 'auto',
      normalize: true,
      wrapX: true,
    }),
  }
}

const getVolcanoDataFromFeatures = (features: Feature[]) => {
  return features
    .map(feature => {
      const geometry = feature.getGeometry()
      if (!(geometry instanceof Point)) return null
      const [longitude, latitude] = geometry.getCoordinates()
      return { longitude, latitude }
    })
    .filter((item): item is { longitude: number; latitude: number } => !!item)
}

const getEarthquakeDataFromFeatures = (features: Feature[]) => {
  return features
    .map(feature => {
      const geometry = feature.getGeometry()
      if (!(geometry instanceof Point)) return null
      const [longitude, latitude] = geometry.getCoordinates()
      const magnitude = Number(
        feature.get('magnitude')
        ?? feature.get('mag')
        ?? feature.get('level')
        ?? feature.get('weight')
        ?? 5,
      )
      return {
        longitude,
        latitude,
        magnitude: Number.isFinite(magnitude) ? magnitude : 5,
      }
    })
    .filter((item): item is { longitude: number; latitude: number; magnitude: number } => !!item)
}

const loadUploadedVolcanoData = async () => getVolcanoDataFromFeatures(await loadUploadedVectorFeatures('volcano'))

const loadUploadedEarthquakeData = async () => getEarthquakeDataFromFeatures(await loadUploadedVectorFeatures('earthquake'))

// 选中的光纤线
const selectedCableId = ref<string | null>(null)


let map: Map | null = null
let dragBox: DragBox | null = null
let selectionSource: VectorSource | null = null
let volcanoIconLayer: VectorLayer<VectorSource> | null = null
let volcanoHeatmapLayer: Heatmap | null = null
let earthquakeIconLayer: WebGLPointsLayer<VectorSource> | null = null
let earthquakeHeatmapLayer: Heatmap | null = null
let volcanoDataLoaded = false
let earthquakeDataLoaded = false

let coldCoralLayers: (VectorLayer<VectorSource> | WebGLPointsLayer<VectorSource>)[] = []
let coldCoralDataLoaded = false
let fishingLayers: (VectorLayer<VectorSource> | WebGLPointsLayer<VectorSource>)[] = []
let fishingDataLoaded = false
let shippingLayers: (VectorLayer<VectorSource> | WebGLPointsLayer<VectorSource>)[] = []
let shippingDataLoaded = false
let elevationLayers: WebGLTileLayer[] = []  // 海洋高程 GeoTIFF 图层
let activeElevationSourceKey = ''
let routeLayer: VectorLayer<VectorSource> | null = null
let routeSource: VectorSource | null = null
let segmentNodeLayer: VectorLayer<VectorSource> | null = null
let segmentNodeSource: VectorSource | null = null
let routeModify: Modify | null = null
let adjustingPointGeometry: Point | null = null
let adjustingPointGeometryChangeHandler: (() => void) | null = null
let costResultLayer: ImageLayer<ImageStatic> | null = null
let riskResultLayer: ImageLayer<ImageStatic> | null = null
let mapContextMenuHandler: ((event: MouseEvent) => void) | null = null
let elevationNativeMaxZoom = 18
let elevationFallbackApplied = false

const getMapProjection = () => map?.getView().getProjection() ?? currentProjection.value

const toCurrentMapCoordinate = (coordinate: [number, number]) =>
  toMapCoordinate(coordinate, getMapProjection()) as [number, number]

const toCurrentMapCoordinates = (coordinates: [number, number][]) =>
  toMapCoordinates(coordinates, getMapProjection()) as [number, number][]

const fromCurrentMapCoordinate = (coordinate: [number, number]) =>
  fromMapCoordinate(coordinate, getMapProjection()) as [number, number]

const fromCurrentMapCoordinates = (coordinates: [number, number][]) =>
  fromMapCoordinates(coordinates, getMapProjection()) as [number, number][]

const fromCurrentMapExtent = (extent: [number, number, number, number]) =>
  fromMapExtent(extent, getMapProjection()) as [number, number, number, number]

const toCurrentMapExtent = (extent: [number, number, number, number]) =>
  toMapExtent(extent, getMapProjection()) as [number, number, number, number]

const isFiniteCoordinate = (coordinate: [number, number]) =>
  Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])

const toCurrentMapFeatures = (features: Feature[]) => features.map(feature => {
  const projected = feature.clone()
  const geometry = projected.getGeometry()
  const mapProjection = getMapProjection()
  const mapProjectionCode = typeof mapProjection === 'string' ? mapProjection : mapProjection.getCode()
  if (geometry && mapProjectionCode !== DATA_PROJECTION) {
    geometry.transform(DATA_PROJECTION, mapProjection)
  }
  return projected
})

const getMapViewCenter = () => toMapCoordinate(DEFAULT_CHINA_MAP_CENTER, currentProjection.value)

const getPointerLonLat = (coordinate: [number, number]) => fromCurrentMapCoordinate(coordinate)

const enableBoxSelect = () => {
  if (!map || !dragBox) return
  mapStore.setBoxSelecting(true)
  map.addInteraction(dragBox)
  appStore.showNotification({type: 'info', message: '框选模式已开启，拖动鼠标选择区域'})
}

const disableBoxSelect = () => {
  if (!map || !dragBox) return
  mapStore.setBoxSelecting(false)
  map.removeInteraction(dragBox)
}

const toggleBoxSelect = () => {
  if (mapStore.hasSelection) {
    // 已有选区，清除选择
    clearSelection()
  } else if (mapStore.isBoxSelecting) {
    disableBoxSelect()
    appStore.showNotification({type: 'info', message: '框选模式已关闭'})
  } else {
    enableBoxSelect()
  }
}

const resetAreaSelection = () => {
  mapStore.clearSelection()
  selectedAreaLonLatExtent.value = null
  areaContextMenu.value.visible = false
  if (selectionSource) {
    selectionSource.clear()
  }
}

const clearSelection = () => {
  resetAreaSelection()
  appStore.showNotification({type: 'info', message: '已清除区域选择'})
}

const coordinateInsideExtent = (coordinate: [number, number], extent: LonLatExtent) =>
  coordinate[0] >= extent[0] && coordinate[0] <= extent[2]
  && coordinate[1] >= extent[1] && coordinate[1] <= extent[3]

const configuredPointsOutsideExtent = (extent: LonLatExtent) => {
  const config = settingsStore.routePlanningConfig
  if (!config.isConfigured) return []
  const points = [
    { name: config.startPoint.name || '起点', coordinate: [config.startPoint.lon, config.startPoint.lat] as [number, number] },
    ...(config.waypoints ?? []).map((point, index) => ({
      name: point.name || `途经点 ${index + 1}`,
      coordinate: [point.lon, point.lat] as [number, number],
    })),
    { name: config.endPoint.name || '终点', coordinate: [config.endPoint.lon, config.endPoint.lat] as [number, number] },
  ]
  return points.filter(point => !coordinateInsideExtent(point.coordinate, extent)).map(point => point.name)
}

const applyPlanningRangeToMap = (extent: LonLatExtent, fit = true) => {
  if (!map) return
  const currentView = map.getView()
  const projection = currentView.getProjection()
  const mapExtent = toMapExtent(extent, projection)
  const nextView = new View({
    projection,
    center: currentView.getCenter(),
    resolution: currentView.getResolution(),
    minZoom: currentView.getMinZoom(),
    maxZoom: currentView.getMaxZoom(),
    extent: mapExtent,
    showFullExtent: true,
  })
  map.setView(nextView)
  if (fit) {
    nextView.fit(mapExtent, { padding: [36, 36, 36, 36], duration: 350, maxZoom: 10 })
  }
}

const releasePlanningRangeConstraint = () => {
  if (!map) return
  const currentView = map.getView()
  const center = currentView.getCenter()
  const resolution = currentView.getResolution()
  if (!center || resolution === undefined) return
  map.setView(new View({
    projection: currentView.getProjection(),
    center,
    resolution,
    minZoom: currentView.getMinZoom(),
    maxZoom: currentView.getMaxZoom(),
  }))
}

const renderPlanningRangeSelection = (extent: LonLatExtent | null) => {
  if (!selectionSource) return
  selectionSource.clear()
  if (!extent) return
  selectedAreaLonLatExtent.value = extent
  mapStore.setSelectedExtent(toMapExtent(extent, MAP_DISPLAY_PROJECTION))
  const geometry = polygonFromExtent(toMapExtent(extent, getMapProjection()))
  selectionSource.addFeature(new Feature({ geometry, isPlanningRange: true }))
}

interface GridAxisSample {
  index: number
  coordinate: number
}

const fitGridAxis = (samples: GridAxisSample[]) => {
  if (samples.length < 2) return null
  const meanIndex = samples.reduce((sum, sample) => sum + sample.index, 0) / samples.length
  const meanCoordinate = samples.reduce((sum, sample) => sum + sample.coordinate, 0) / samples.length
  let numerator = 0
  let denominator = 0

  for (const sample of samples) {
    numerator += (sample.index - meanIndex) * (sample.coordinate - meanCoordinate)
    denominator += (sample.index - meanIndex) ** 2
  }
  if (denominator <= Number.EPSILON) return null

  const step = numerator / denominator
  const origin = meanCoordinate - step * meanIndex
  if (!Number.isFinite(origin) || !Number.isFinite(step) || Math.abs(step) <= Number.EPSILON) return null

  const tolerance = Math.max(Math.abs(step) * 0.02, 1e-7)
  if (samples.some(sample => Math.abs(sample.coordinate - (origin + step * sample.index)) > tolerance)) {
    return null
  }
  return { origin, step }
}

const inferResultGridExtent = (grid: NumericGridData): LonLatExtent | null => {
  const paths = routeStore.algorithmRouteResult?.rawResultFiles['FMM_path_result.json'] ?? []
  const rowSamples: GridAxisSample[] = []
  const columnSamples: GridAxisSample[] = []

  for (const path of paths) {
    const realPointsBySequence: Record<number, number[]> = {}
    for (const realPoint of path.real_trace ?? []) {
      if (realPoint.length >= 3 && realPoint.every(Number.isFinite)) {
        realPointsBySequence[realPoint[0]] = realPoint
      }
    }

    for (const gridPoint of path.trace ?? []) {
      if (gridPoint.length < 3 || !gridPoint.every(Number.isFinite)) continue
      const realPoint = realPointsBySequence[gridPoint[0]]
      if (!realPoint) continue
      const row = gridPoint[1]
      const column = gridPoint[2]
      if (row < 0 || row >= grid.rows || column < 0 || column >= grid.columns) continue
      rowSamples.push({ index: row, coordinate: realPoint[1] })
      columnSamples.push({ index: column, coordinate: realPoint[2] })
    }
  }

  const latitudeAxis = fitGridAxis(rowSamples)
  const longitudeAxis = fitGridAxis(columnSamples)
  if (!latitudeAxis || !longitudeAxis) return null

  const firstLongitude = longitudeAxis.origin
  const lastLongitude = longitudeAxis.origin + longitudeAxis.step * (grid.columns - 1)
  const firstLatitude = latitudeAxis.origin
  const lastLatitude = latitudeAxis.origin + latitudeAxis.step * (grid.rows - 1)
  const longitudePadding = Math.abs(longitudeAxis.step) / 2
  const latitudePadding = Math.abs(latitudeAxis.step) / 2

  return [
    Math.min(firstLongitude, lastLongitude) - longitudePadding,
    Math.min(firstLatitude, lastLatitude) - latitudePadding,
    Math.max(firstLongitude, lastLongitude) + longitudePadding,
    Math.max(firstLatitude, lastLatitude) + latitudePadding,
  ]
}

const getResultGridExtent = (grid: NumericGridData): LonLatExtent => {
  const inferredExtent = inferResultGridExtent(grid)
  if (inferredExtent) return inferredExtent
  if (activePlanningLonLatExtent.value) return activePlanningLonLatExtent.value

  const coordinates = routeStore.paretoRoutes.flatMap(route => route.rawTrunkCoordinates ?? [])
  if (coordinates.length > 0) {
    const longitudes = coordinates.map(item => item[0]).filter(Number.isFinite)
    const latitudes = coordinates.map(item => item[1]).filter(Number.isFinite)
    if (longitudes.length && latitudes.length) {
      const west = Math.min(...longitudes)
      const east = Math.max(...longitudes)
      const south = Math.min(...latitudes)
      const north = Math.max(...latitudes)
      const lonPadding = Math.max((east - west) * 0.05, 0.05)
      const latPadding = Math.max((north - south) * 0.05, 0.05)
      return [west - lonPadding, south - latPadding, east + lonPadding, north + latPadding]
    }
  }
  return DEFAULT_CHINA_LON_LAT_EXTENT
}

type RgbColor = readonly [red: number, green: number, blue: number]

const COST_RESULT_PALETTE: readonly RgbColor[] = [
  [247, 251, 255],
  [222, 235, 247],
  [198, 219, 239],
  [158, 202, 225],
  [107, 174, 214],
  [66, 146, 198],
  [33, 113, 181],
  [8, 81, 156],
  [8, 48, 107],
]

const RISK_RESULT_PALETTE: readonly RgbColor[] = [
  [255, 245, 240],
  [254, 224, 210],
  [252, 187, 161],
  [252, 146, 114],
  [251, 106, 74],
  [239, 59, 44],
  [203, 24, 29],
  [165, 15, 21],
  [103, 0, 13],
]

const buildPaletteLookup = (palette: readonly RgbColor[]) => Array.from({ length: 256 }, (_, index) => {
  const position = (index / 255) * (palette.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.min(lowerIndex + 1, palette.length - 1)
  const ratio = position - lowerIndex
  const lower = palette[lowerIndex]
  const upper = palette[upperIndex]
  return lower.map((channel, channelIndex) =>
    Math.round(channel + (upper[channelIndex] - channel) * ratio),
  ) as unknown as RgbColor
})

interface GridRenderOptions {
  transparentZero?: boolean
  maximumQuantile?: number
}

const getGridQuantile = (grid: NumericGridData, quantile: number) => {
  const targetSampleCount = 100000
  const sampleStep = Math.max(1, Math.ceil(Math.sqrt((grid.rows * grid.columns) / targetSampleCount)))
  const samples: number[] = []
  for (let row = 0; row < grid.rows; row += sampleStep) {
    for (let column = 0; column < grid.columns; column += sampleStep) {
      const value = grid.values[row]?.[column]
      if (Number.isFinite(value)) samples.push(value)
    }
  }
  if (samples.length === 0) return grid.max

  samples.sort((left, right) => left - right)
  const position = Math.min(1, Math.max(0, quantile)) * (samples.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const ratio = position - lowerIndex
  return samples[lowerIndex] + (samples[upperIndex] - samples[lowerIndex]) * ratio
}

const renderGridImage = (
  grid: NumericGridData,
  palette: readonly RgbColor[],
  options: GridRenderOptions,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = grid.columns
  canvas.height = grid.rows
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建成本与风险栅格画布')

  const image = context.createImageData(grid.columns, grid.rows)
  const lookup = buildPaletteLookup(palette)
  const displayMaximum = options.maximumQuantile === undefined
    ? grid.max
    : getGridQuantile(grid, options.maximumQuantile)
  const span = displayMaximum - grid.min

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const value = grid.values[row]?.[column]
      const pixelOffset = (row * grid.columns + column) * 4
      if (!Number.isFinite(value) || (options.transparentZero && value === 0)) {
        image.data[pixelOffset + 3] = 0
        continue
      }

      const normalized = span > 0 ? Math.min(1, Math.max(0, (value - grid.min) / span)) : 1
      const color = lookup[Math.round(normalized * 255)]
      image.data[pixelOffset] = color[0]
      image.data[pixelOffset + 1] = color[1]
      image.data[pixelOffset + 2] = color[2]
      image.data[pixelOffset + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

const buildResultRasterLayer = (
  grid: NumericGridData,
  palette: readonly RgbColor[],
  renderOptions: GridRenderOptions,
  visible: boolean,
) => {
  const layer = new ImageLayer({
    source: new ImageStatic({
      url: renderGridImage(grid, palette, renderOptions),
      imageExtent: toCurrentMapExtent(getResultGridExtent(grid)),
      projection: getMapProjection(),
      interpolate: true,
    }),
    opacity: 1,
    visible,
  })
  layer.setZIndex(120)
  return layer
}

const clearAlgorithmResultLayers = () => {
  if (map && costResultLayer) map.removeLayer(costResultLayer)
  if (map && riskResultLayer) map.removeLayer(riskResultLayer)
  costResultLayer = null
  riskResultLayer = null
  layerStore.removeLayer('algorithm-cost')
  layerStore.removeLayer('algorithm-risk')
}

const refreshAlgorithmResultLayers = () => {
  if (!map) return
  if (costResultLayer) map.removeLayer(costResultLayer)
  if (riskResultLayer) map.removeLayer(riskResultLayer)
  costResultLayer = null
  riskResultLayer = null

  const result = routeStore.algorithmRouteResult
  const definitions = [
    {
      id: 'algorithm-cost',
      name: '成本底图',
      grid: result?.analysis.costGrid,
      palette: COST_RESULT_PALETTE,
      renderOptions: {},
    },
    {
      id: 'algorithm-risk',
      name: '风险底图',
      grid: result?.analysis.riskGrid,
      palette: RISK_RESULT_PALETTE,
      renderOptions: { transparentZero: true, maximumQuantile: 0.99 },
    },
  ] as const
  const existingCostLayer = layerStore.getLayerById('algorithm-cost')
  const existingRiskLayer = layerStore.getLayerById('algorithm-risk')
  const hadAlgorithmLayer = Boolean(existingCostLayer || existingRiskLayer)
  const previouslyVisibleId = existingCostLayer?.visible
    ? 'algorithm-cost'
    : existingRiskLayer?.visible
      ? 'algorithm-risk'
      : null
  const activeLayerId = definitions.some(definition => definition.id === previouslyVisibleId && definition.grid)
    ? previouslyVisibleId
    : hadAlgorithmLayer
      ? null
      : definitions.find(definition => definition.grid)?.id ?? null

  definitions.forEach(definition => {
    if (!definition.grid) {
      layerStore.removeLayer(definition.id)
      return
    }
    const visible = definition.id === activeLayerId
    layerStore.upsertLayer({
      id: definition.id,
      name: definition.name,
      type: 'raster',
      visible,
      loaded: true,
      loading: false,
      opacity: 1,
      zIndex: 120,
    })
    const layer = buildResultRasterLayer(
      definition.grid,
      definition.palette,
      definition.renderOptions,
      visible,
    )
    map!.addLayer(layer)
    if (definition.id === 'algorithm-cost') costResultLayer = layer
    else riskResultLayer = layer
  })
}

const saveSelectedAreaAsBaseMap = async () => {
  const extent = selectedAreaLonLatExtent.value
  if (!extent) return
  const outsidePoints = configuredPointsOutsideExtent(extent)
  if (outsidePoints.length > 0) {
    appStore.showNotification({
      type: 'warning',
      message: `区域未包含：${outsidePoints.join('、')}`,
      duration: 5000,
    })
    return
  }

  const [west, south, east, north] = extent
  settingsStore.updateRoutePlanningConfig({
    rangeMode: 'manual',
    planningRange: {
      northwest: { lon: west, lat: north },
      southeast: { lon: east, lat: south },
    },
  })
  activePlanningLonLatExtent.value = extent
  appStore.setProjectDirty(true)
  areaContextMenu.value.visible = false
  applyPlanningRangeToMap(extent)
  refreshAlgorithmResultLayers()
  resetAreaSelection()

  const platformProjectId = appStore.projectState.currentProject?.platformProjectId
  if (platformProjectId !== null && platformProjectId !== undefined && platformProjectId !== '') {
    try {
      await platformPlanConfigApi.saveScope({
        projectId: platformProjectId,
        topLeftLng: west,
        topLeftLat: north,
        bottomRightLng: east,
        bottomRightLat: south,
      })
    } catch (error) {
      appStore.showNotification({
        type: 'warning',
        message: `局部底图已写入当前工程，平台范围同步失败：${(error as Error).message}`,
        duration: 5000,
      })
      return
    }
  }

  appStore.showNotification({ type: 'success', message: '局部区域已设为工程底图' })
  appStore.addLog('INFO', `工程底图范围已更新: [${west}, ${south}, ${east}, ${north}]`)
}

// 切换地图投影
const switchProjection = (newProjection: string) => {
  if (!map) return

  const view = map.getView()
  const oldProjection = view.getProjection().getCode()

  if (oldProjection === newProjection) return

  // 获取当前视图中心和缩放级别
  const center = view.getCenter()
  const zoom = view.getZoom()

  if (!center || zoom === undefined) return

  // 转换中心点到新投影
  const newCenter = transform(center, oldProjection, newProjection)
  const planningExtent = activePlanningLonLatExtent.value
  const constrainedExtent = planningExtent ? toMapExtent(planningExtent, newProjection) : undefined

  // 创建新视图
  const newView = new View({
    projection: newProjection,
    center: newCenter,
    zoom: zoom,
    minZoom: 0,
    maxZoom: 18,
    ...(constrainedExtent ? { extent: constrainedExtent, showFullExtent: true } : {}),
  })

  map.setView(newView)
  if (constrainedExtent) {
    newView.fit(constrainedExtent, { padding: [36, 36, 36, 36], maxZoom: 10 })
    renderPlanningRangeSelection(selectedAreaLonLatExtent.value)
  }

  drawParetoRoutes()
  refreshAlgorithmResultLayers()

  appStore.addLog('INFO', `地图投影已切换为 ${newProjection}`)
}

// 监听投影变化
watch(currentProjection, (newProj) => {
  switchProjection(newProj)
})

// 查看Pareto前沿图
const handleViewParetoChart = () => {
  showParetoFrontierDialog.value = true
}

// 选择路径事件
const handleSelectRoute = (routeId: string) => {
  if (isAdjustingRoute.value && routeStore.selectedRoute?.id !== routeId) {
    disableRouteAdjustment()
  }
  // 重绘路径以更新选中状态
  routeStore.selectRoute(routeId)
  drawParetoRoutes()
}

const clearRouteAdjustmentPreviewListener = () => {
  if (adjustingPointGeometry && adjustingPointGeometryChangeHandler) {
    adjustingPointGeometry.un('change', adjustingPointGeometryChangeHandler)
  }
  adjustingPointGeometry = null
  adjustingPointGeometryChangeHandler = null
}

const disableRouteAdjustment = () => {
  clearRouteAdjustmentPreviewListener()
  if (map && routeModify) map.removeInteraction(routeModify)
  isAdjustingRoute.value = false
  segmentNodeLayer?.changed()
}

const updateRouteAdjustmentPreview = (feature: Feature) => {
  if (!routeSource) return
  const geometry = feature.getGeometry()
  const routeId = String(feature.get('routeId') ?? '')
  const pointId = String(feature.get('pointId') ?? '')
  if (!(geometry instanceof Point) || !routeId || !pointId) return

  const coordinate = geometry.getCoordinates() as [number, number]
  const route = routeStore.paretoRoutes.find(item => item.id === routeId)
  if (!route) return

  const segmentsById = new globalThis.Map(route.segments.map(segment => [segment.id, segment]))
  routeSource.getFeatures().forEach(segmentFeature => {
    if (segmentFeature.get('routeId') !== routeId) return
    const segment = segmentsById.get(String(segmentFeature.get('segmentId') ?? ''))
    const segmentGeometry = segmentFeature.getGeometry()
    if (!segment || !(segmentGeometry instanceof LineString)) return

    const segmentCoordinates = segmentGeometry.getCoordinates()
    if (segment.startPointId === pointId) segmentCoordinates[0] = coordinate
    if (segment.endPointId === pointId) segmentCoordinates[segmentCoordinates.length - 1] = coordinate
    segmentGeometry.setCoordinates(segmentCoordinates)
  })
}

const toggleRouteAdjustment = () => {
  if (!map || !segmentNodeSource) return
  if (isAdjustingRoute.value) {
    disableRouteAdjustment()
    return
  }
  if (!routeStore.selectedRoute?.segments.length) {
    appStore.showNotification({ type: 'warning', message: '当前路由没有可调整的分段点' })
    return
  }

  routeModify = new Modify({ source: segmentNodeSource })
  routeModify.on('modifystart', (event) => {
    clearRouteAdjustmentPreviewListener()
    const feature = event.features.item(0)
    const geometry = feature?.getGeometry()
    if (!(geometry instanceof Point) || !feature) return
    adjustingPointGeometry = geometry
    adjustingPointGeometryChangeHandler = () => updateRouteAdjustmentPreview(feature)
    geometry.on('change', adjustingPointGeometryChangeHandler)
  })
  routeModify.on('modifyend', (event) => {
    clearRouteAdjustmentPreviewListener()
    let changed = false
    event.features.forEach(feature => {
      const geometry = feature.getGeometry()
      const routeId = String(feature.get('routeId') ?? '')
      const pointId = String(feature.get('pointId') ?? '')
      if (!(geometry instanceof Point) || !routeId || !pointId) return
      const coordinate = fromCurrentMapCoordinate(geometry.getCoordinates() as [number, number])
      changed = routeStore.updateRoutePoint(routeId, pointId, coordinate) || changed
    })
    if (changed) {
      appStore.setProjectDirty(true)
      void drawParetoRoutes()
      appStore.showNotification({ type: 'success', message: '路由分段点已更新' })
    }
  })
  map.addInteraction(routeModify)
  isAdjustingRoute.value = true
  segmentNodeLayer?.changed()
}

const ensureSelectedRoute = () => {
  if (!routeStore.selectedRoute && routeStore.paretoRoutes.length > 0) {
    routeStore.selectRoute(routeStore.paretoRoutes[0].id)
  }
  return routeStore.selectedRoute || routeStore.paretoRoutes[0] || null
}

const applyAlgorithmRouteResult = (result: AlgorithmRouteBundleResult, sourceLabel: string) => {
  const previousRouteId = routeStore.currentRouteId
  routeStore.setAlgorithmRouteResult(result)
  cableSegmentStore.setSegments(Object.values(result.segmentsByRouteId).flat())
  const selectedRoute = result.routes.find(route => route.id === previousRouteId)
    ?? result.routes[0]
    ?? null

  if (selectedRoute) {
    routeStore.selectRoute(selectedRoute.id)
  }
  drawParetoRoutes()
  refreshAlgorithmResultLayers()
  appStore.addLog(
    'INFO',
    `${sourceLabel}: ${result.routes.length} 条可见路线，原始候选 ${result.diagnostics.fmmPathCount} 条`,
  )
}

// 获取线段信息
const getSegmentInfo = (routeId: string, segmentIndex: number) => {
  // 仅展示后端路由结果；不再根据监控设备在前端拼装线段。
  const route = routeStore.paretoRoutes.find(r => r.id === routeId)
  if (route && route.segments.length > segmentIndex) {
    const segment = route.segments[segmentIndex]
    return {
      id: segment.id,
      length: segment.length,
      depth: segment.depth,
      cableType: segment.cableType,
      riskLevel: segment.riskLevel
    }
  }

  return null
}

const initMap = () => {
  if (!mapContainer.value) return

  const bindGeoTiffSource = (
    source: GeoTIFFSource,
    layersForSource: WebGLTileLayer[],
    bindOptions: { fitOnLoad?: boolean } = {},
  ) => {
    source.on('tileloadend', () => {
      loading.value = false
      layerStore.setLayerLoading('elevation', false)
      hideLayerGlobalLoading('elevation')
    })
    source.on('tileloaderror', () => {
      loading.value = false
      layerStore.setLayerLoading('elevation', false)
      hideLayerGlobalLoading('elevation')
      if (!map) return

      const currentZoom = map.getView().getZoom() ?? 0
      if (currentZoom < elevationNativeMaxZoom - 0.25) return

      const fallbackMaxZoom = Math.max(0, Math.min(elevationNativeMaxZoom, currentZoom - 0.01))
      layersForSource.forEach(layer => {
        const currentMaxZoom = layer.getMaxZoom()
        if (!Number.isFinite(currentMaxZoom) || fallbackMaxZoom < currentMaxZoom) {
          layer.setMaxZoom(fallbackMaxZoom)
        }
      })

      if (!elevationFallbackApplied) {
        elevationFallbackApplied = true
        appStore.addLog('INFO', `海洋高程图在高倍率缺少瓦片，已自动保持在 ${fallbackMaxZoom.toFixed(2)} 级以下显示`)
      }
    })

    source.getView().then((sourceViewOptions: any) => {
      if (bindOptions.fitOnLoad !== false && sourceViewOptions.extent && map) {
        const viewProjection = map.getView().getProjection()
        const sourceProjection = sourceViewOptions.projection ?? source.getProjection()
        const sourceProjectionCode = typeof sourceProjection === 'string'
          ? sourceProjection
          : sourceProjection?.getCode?.()
        const fitExtent = sourceProjection && sourceProjectionCode !== viewProjection.getCode()
          ? transformExtent(sourceViewOptions.extent, sourceProjection, viewProjection)
          : sourceViewOptions.extent

        map.getView().fit(fitExtent, {padding: [20, 20, 20, 20]})
      }
      if (sourceViewOptions.resolutions) {
        elevationNativeMaxZoom = Math.min(sourceViewOptions.resolutions.length - 1, 18)
        layersForSource.forEach(layer => layer.setMaxZoom(elevationNativeMaxZoom))
      }
    }).catch(() => {
    })
  }

  const defaultGeoTiffSource = createDefaultGeoTiffSource()
  const defaultGeoTiffLayer = createGeoTiffLayer(defaultGeoTiffSource.source, true)
  bindGeoTiffSource(defaultGeoTiffSource.source, [defaultGeoTiffLayer], { fitOnLoad: false })

  const geoTiffLayers: WebGLTileLayer[] = []

  // 保存到模块变量，供图层控制使用
  elevationLayers = geoTiffLayers

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({source: createBaseTileSource(), opacity: 0.5}),
      defaultGeoTiffLayer,
      ...geoTiffLayers,
    ],
    view: new View({
      projection: currentProjection.value || MAP_DISPLAY_PROJECTION,
      center: getMapViewCenter(),
      zoom: DEFAULT_CHINA_MAP_ZOOM,
      minZoom: 0,
      maxZoom: 18,
    }),
  })

  const setElevationSource = (key: string, source: GeoTIFFSource, visible: boolean) => {
    if (!map) return
    if (activeElevationSourceKey === key) {
      elevationLayers.forEach(layer => layer.setVisible(visible))
      return
    }

    elevationLayers.forEach(layer => map!.removeLayer(layer))
    const nextLayers = [createGeoTiffLayer(source, visible)]
    elevationLayers = nextLayers
    activeElevationSourceKey = key
    bindGeoTiffSource(source, nextLayers)
    nextLayers.forEach(layer => map!.addLayer(layer))
  }

  const setElevationVisible = async (visible: boolean) => {
    if (!visible) {
      elevationLayers.forEach(layer => layer.setVisible(false))
      layerStore.setLayerLoading('elevation', false)
      hideLayerGlobalLoading('elevation')
      return
    }

    showLayerGlobalLoading('elevation')
    layerStore.setLayerLoading('elevation', true)

    try {
      const uploadedSource = await createUploadedGeoTiffSource('elevation')
      if (uploadedSource) {
        loading.value = true
        setElevationSource(uploadedSource.key, uploadedSource.source, true)
        setTimeout(() => {
          if (layerStore.getLayerById('elevation')?.loading) {
            layerStore.setLayerLoading('elevation', false)
            hideLayerGlobalLoading('elevation')
          }
        }, 3000)
        return
      }

      if (layerStore.getLayerVisible('elevation')) {
        failPlatformLayerRender('elevation', ' 没有可加载的 GeoTIFF 数据')
      }
    } catch (error) {
      failPlatformLayerRender('elevation', ' GeoTIFF 加载失败', error)
    } finally {
      if (!layerStore.getLayerVisible('elevation')) {
        loading.value = false
        layerStore.setLayerLoading('elevation', false)
        hideLayerGlobalLoading('elevation')
      }
    }
  }

  map.on('pointermove', (evt) => {
    const [lon, lat] = getPointerLonLat(evt.coordinate as [number, number])
    coordinates.value = {lon, lat}
  })

  // 单击事件 - 选中光纤线或设备
  map.on('singleclick', (evt) => {
    if (!routeLayer) return

    // 检查是否点击了路径线
    const features = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === routeLayer
    })

    if (features && features.length > 0) {
      const lineFeature = features.find(f => f.getGeometry()?.getType() === 'LineString')
      if (lineFeature) {
        const routeId = lineFeature.get('routeId')
        selectedCableId.value = routeId
        routeStore.selectRoute(routeId)

        // 获取线段信息用于水深剖面显示
        const geom = lineFeature.getGeometry() as LineString
        const coords = fromCurrentMapCoordinates(geom.getCoordinates() as [number, number][])
        const segmentIndex = lineFeature.get('segmentIndex') as number | undefined

        // 获取线段详细信息
        let segmentLength = lineFeature.get('segmentLength')
        let segmentDepth = lineFeature.get('segmentDepth')
        let segmentCableType = lineFeature.get('segmentCableType') as string | undefined
        let segmentRiskLevel = lineFeature.get('segmentRiskLevel') as string | undefined

        if (segmentIndex !== undefined && (segmentLength === undefined || segmentDepth === undefined)) {
          const info = getSegmentInfo(routeId, segmentIndex)
          if (info) {
            segmentLength = info.length
            segmentDepth = info.depth
            segmentCableType = info.cableType
            segmentRiskLevel = info.riskLevel
          }
        }

        // 设置选中线段信息用于水深剖面
        routeStore.selectSegmentInfo({
          id: lineFeature.get('segmentId') || routeId,
          routeId: routeId,
          startPoint: {lon: coords[0][0], lat: coords[0][1]},
          endPoint: {lon: coords[coords.length - 1][0], lat: coords[coords.length - 1][1]},
          length: segmentLength,
          depth: segmentDepth,
          cableType: segmentCableType,
          riskLevel: segmentRiskLevel
        })

        // 仅展示后端返回的线段信息，不在前端修改或重新生成工程参数。
        drawParetoRoutes()
        return
      }

      // 检查是否点击了设备点
      const pointFeature = features.find(f => f.getGeometry()?.getType() === 'Point')
      if (pointFeature) {
        const deviceId = pointFeature.get('deviceId')
        if (deviceId) {
          monitorStore.selectDevice(deviceId)
          drawParetoRoutes()
        }
      }
    } else {
      selectedCableId.value = null
      routeStore.clearSelectedSegmentInfo()
    }
  })

  selectionSource = new VectorSource()
  const selectionLayer = new VectorLayer({
    source: selectionSource,
    zIndex: 220,
    style: new Style({
      stroke: new Stroke({color: '#165DFF', width: 2, lineDash: [5, 5]}),
      fill: new Fill({color: 'rgba(22, 93, 255, 0.1)'}),
    }),
  })
  map.addLayer(selectionLayer)

  segmentNodeSource = new VectorSource()
  segmentNodeLayer = new VectorLayer({
    source: segmentNodeSource,
    zIndex: 230,
    style: feature => new Style({
      image: new CircleStyle({
        radius: isAdjustingRoute.value ? 7 : 5,
        fill: new Fill({ color: isAdjustingRoute.value ? '#f59e0b' : '#ffffff' }),
        stroke: new Stroke({ color: feature.get('selected') ? '#ef4444' : '#2563eb', width: 2 }),
      }),
    }),
  })
  map.addLayer(segmentNodeLayer)

  mapContextMenuHandler = (event: MouseEvent) => {
    if (!selectedAreaLonLatExtent.value || !mapContainer.value) return
    event.preventDefault()
    const rect = mapContainer.value.getBoundingClientRect()
    areaContextMenu.value = {
      visible: true,
      x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 190)),
      y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 96)),
    }
  }
  map.getViewport().addEventListener('contextmenu', mapContextMenuHandler)

  dragBox = new DragBox({condition: () => true})

  dragBox.on('boxend', () => {
    if (!selectionSource) return
    selectionSource.clear()

    const extent = dragBox!.getGeometry().getExtent() as [number, number, number, number]
    const lonLatExtent = fromCurrentMapExtent(extent)
    selectedAreaLonLatExtent.value = lonLatExtent
    areaContextMenu.value.visible = false
    const boxGeom = dragBox!.getGeometry()
    selectionSource.addFeature(new Feature({geometry: boxGeom}))

    appStore.showNotification({
      type: 'success',
      message: `已选择区域: 经度 ${lonLatExtent[0].toFixed(2)}° ~ ${lonLatExtent[2].toFixed(2)}°`
    })

    const extent3857 = transformExtent(lonLatExtent, DATA_PROJECTION, MAP_DISPLAY_PROJECTION) as [number, number, number, number]

    mapStore.setSelectedExtent(extent3857)
    emit('area-selected', extent3857)
    disableBoxSelect()
  })

  // 加载并渲染火山数据
  const loadAndRenderVolcano = async () => {
    if (!map || volcanoDataLoaded) return

    showLayerGlobalLoading('volcano')
    layerStore.setLayerLoading('volcano', true)

    try {
      const volcanoData = await loadUploadedVolcanoData()
      if (volcanoData.length === 0) {
        if (layerStore.getLayerVisible('volcano')) {
          failPlatformLayerRender('volcano', ' 没有可加载的图层数据')
        }
        return
      }
      const volcanoFeatures = volcanoData.map((volcano) => {
        return new Feature({
          geometry: new Point(toCurrentMapCoordinate([volcano.longitude, volcano.latitude])),
          name: '火山',
          type: 'volcano'
        })
      })

      const volcanoStyle = new Style({
        image: new Icon({
          src: volcanoIconUrl,
          scale: 0.6,
          anchor: [0.5, 1],
        })
      })

      const volcanoIconSource = new VectorSource({features: volcanoFeatures})

      volcanoIconLayer = new VectorLayer({
        source: volcanoIconSource,
        style: volcanoStyle,
        zIndex: 100,
        visible: true
      })

      const volcanoHeatmapFeatures = volcanoData.map((volcano) => {
        return new Feature({
          geometry: new Point(toCurrentMapCoordinate([volcano.longitude, volcano.latitude])),
          weight: 1
        })
      })

      const volcanoHeatmapSource = new VectorSource({features: volcanoHeatmapFeatures})

      volcanoHeatmapLayer = new Heatmap({
        source: volcanoHeatmapSource,
        blur: 25,
        radius: 15,
        weight: (feature) => feature.get('weight') || 1,
        gradient: ['#00f', '#0ff', '#0f0', '#ff0', '#f00'],
        opacity: 0.6,
        zIndex: 50,
        visible: false
      })

      map.addLayer(volcanoHeatmapLayer)
      map.addLayer(volcanoIconLayer)
      fitVectorSource(volcanoIconSource, 8)

      volcanoDataLoaded = true
      layerStore.setLayerLoaded('volcano', true)

      const sourceLabel = getUploadedLayerLabel('volcano')
      appStore.showNotification({type: 'success', message: `已加载 ${volcanoData.length} 个火山位置（${sourceLabel}）`})
      appStore.addLog('INFO', `火山数据加载完成: ${volcanoData.length} 个点位（${sourceLabel}）`)
    } catch (error) {
      failPlatformLayerRender('volcano', ' 加载失败', error)
    } finally {
      layerStore.setLayerLoading('volcano', false)
      hideLayerGlobalLoading('volcano')
    }
  }

  const setVolcanoPointsVisible = (visible: boolean) => {
    if (volcanoIconLayer) volcanoIconLayer.setVisible(visible)
    if (!visible && volcanoHeatmapLayer) volcanoHeatmapLayer.setVisible(false)
  }

  // 加载并渲染地震数据
  const loadAndRenderEarthquake = async () => {
    if (!map || earthquakeDataLoaded) return

    showLayerGlobalLoading('earthquake')
    layerStore.setLayerLoading('earthquake', true)

    try {
      const earthquakeData = await loadUploadedEarthquakeData()
      if (earthquakeData.length === 0) {
        if (layerStore.getLayerVisible('earthquake')) {
          failPlatformLayerRender('earthquake', ' 没有可加载的图层数据')
        }
        return
      }
      const locationMap: Record<string, number> = {}
      earthquakeData.forEach((eq) => {
        const key = `${eq.longitude.toFixed(4)},${eq.latitude.toFixed(4)}`
        const existing = locationMap[key] || 0
        if (eq.magnitude > existing) locationMap[key] = eq.magnitude
      })

      const uniqueLocations = Object.keys(locationMap)
      const earthquakeFeatures = earthquakeData.map((eq) => {
        return new Feature({
          geometry: new Point(toCurrentMapCoordinate([eq.longitude, eq.latitude])),
          magnitude: eq.magnitude
        })
      })

      const earthquakeIconSource = new VectorSource({features: earthquakeFeatures})

      const webglStyle = {
        'circle-radius': [
          'interpolate', ['linear'], ['get', 'magnitude'],
          0, 2, 4, 4, 6, 8, 8, 12, 10, 16
        ],
        'circle-fill-color': [
          'interpolate', ['linear'], ['get', 'magnitude'],
          0, 'rgba(0, 255, 0, 0.6)',
          3, 'rgba(255, 255, 0, 0.7)',
          5, 'rgba(255, 165, 0, 0.8)',
          7, 'rgba(255, 0, 0, 0.9)',
          9, 'rgba(139, 0, 0, 1)'
        ],
        'circle-stroke-color': 'rgba(255, 255, 255, 0.8)',
        'circle-stroke-width': 1,
      }

      earthquakeIconLayer = new WebGLPointsLayer({
        source: earthquakeIconSource,
        style: webglStyle,
        zIndex: 100,
        visible: true
      }) as any

      const earthquakeHeatmapFeatures: Feature[] = []
      uniqueLocations.forEach((key: string) => {
        const magnitude = locationMap[key]
        const [lon, lat] = key.split(',').map(Number)
        earthquakeHeatmapFeatures.push(new Feature({
          geometry: new Point(toCurrentMapCoordinate([lon, lat])),
          weight: magnitude / 10
        }))
      })

      const earthquakeHeatmapSource = new VectorSource({features: earthquakeHeatmapFeatures})

      earthquakeHeatmapLayer = new Heatmap({
        source: earthquakeHeatmapSource,
        blur: 20,
        radius: 12,
        weight: (feature) => feature.get('weight') || 0.5,
        gradient: ['#0000FF', '#00FFFF', '#00FF00', '#FFFF00', '#FFA500', '#FF0000'],
        opacity: 0.7,
        zIndex: 50,
        visible: false
      })

      map.addLayer(earthquakeHeatmapLayer)
      if (earthquakeIconLayer) map.addLayer(earthquakeIconLayer as any)

      earthquakeDataLoaded = true
      layerStore.setLayerLoaded('earthquake', true)

      const sourceLabel = getUploadedLayerLabel('earthquake')
      appStore.showNotification({type: 'success', message: `已加载 ${earthquakeData.length} 条地震数据（${sourceLabel}）`})
      appStore.addLog('INFO', `地震数据加载完成: ${earthquakeData.length} 条记录（${sourceLabel}）`)
    } catch (error) {
      failPlatformLayerRender('earthquake', ' 加载失败', error)
    } finally {
      layerStore.setLayerLoading('earthquake', false)
      hideLayerGlobalLoading('earthquake')
    }
  }

  const setEarthquakePointsVisible = (visible: boolean) => {
    if (earthquakeIconLayer) earthquakeIconLayer.setVisible(visible)
    if (!visible && earthquakeHeatmapLayer) earthquakeHeatmapLayer.setVisible(false)
  }

  // 监听火山图层可见性变化
  watch(
      () => layerStore.layers.find(l => l.id === 'volcano')?.visible,
      async (visible) => {
        if (visible) {
          if (!volcanoDataLoaded) await loadAndRenderVolcano()
          else setVolcanoPointsVisible(true)
        } else {
          setVolcanoPointsVisible(false)
        }
      },
      {immediate: false}
  )

  // 监听地震图层可见性变化
  watch(
      () => layerStore.layers.find(l => l.id === 'earthquake')?.visible,
      async (visible) => {
        if (visible) {
          if (!earthquakeDataLoaded) await loadAndRenderEarthquake()
          else setEarthquakePointsVisible(true)
        } else {
          setEarthquakePointsVisible(false)
        }
      },
      {immediate: false}
  )

  // 加载并渲染冷水珊瑚数据
  const loadAndRenderColdCoral = async () => {
    if (!map || coldCoralDataLoaded) return

    showLayerGlobalLoading('coldCoral')
    layerStore.setLayerLoading('coldCoral', true)

    try {
      const { features, sourceLabel } = await loadRequiredVectorFeatures('coldCoral')
      if (features.length === 0) {
        if (layerStore.getLayerVisible('coldCoral')) {
          failPlatformLayerRender('coldCoral', ' 没有可加载的图层数据')
        }
        return
      }

      // 使用工厂方法创建图层
      const layers = createColdCoralLayers(toCurrentMapFeatures(features))

      layers.forEach((layer: any) => {
        map!.addLayer(layer)
        // 类型断言以适配数组类型
        coldCoralLayers.push(layer)
      })

      if (layers.length === 0) {
        failPlatformLayerRender('coldCoral', ' 没有生成可渲染图层')
        return
      }

      coldCoralDataLoaded = true
      layerStore.setLayerLoaded('coldCoral', true)

      appStore.showNotification({type: 'success', message: `已加载冷水珊瑚数据，共 ${layers.length} 个图层（${sourceLabel}）`})
      appStore.addLog('INFO', `冷水珊瑚数据加载完成（${sourceLabel}）`)

      // 计算所有要素的范围并缩放 (恢复全球视图)
      // 获取所有图层的源并计算总范围
      let totalExtent: number[] | null = null

      layers.forEach((layer: any) => {
        const source = layer.getSource()
        if (source && typeof source.getExtent === 'function') {
          const extent = source.getExtent()
          if (!totalExtent) {
            totalExtent = extent
          } else {
            totalExtent = [
              Math.min(totalExtent[0], extent[0]),
              Math.min(totalExtent[1], extent[1]),
              Math.max(totalExtent[2], extent[2]),
              Math.max(totalExtent[3], extent[3]),
            ]
          }
        }
      })

      if (totalExtent) {
        map.getView().fit(totalExtent, {
          padding: [50, 50, 50, 50],
          duration: 1000,
          maxZoom: 10
        })
      }

    } catch (error) {
      failPlatformLayerRender('coldCoral', ' 加载失败', error)
    } finally {
      layerStore.setLayerLoading('coldCoral', false)
      hideLayerGlobalLoading('coldCoral')
    }
  }

  const setColdCoralVisible = (visible: boolean) => {
    coldCoralLayers.forEach(layer => layer.setVisible(visible))
  }

  // 监听冷水珊瑚图层可见性
  watch(
      () => layerStore.layers.find(l => l.id === 'coldCoral')?.visible,
      async (visible) => {
        if (visible) {
          if (!coldCoralDataLoaded) await loadAndRenderColdCoral()
          else setColdCoralVisible(true)
        } else {
          setColdCoralVisible(false)
        }
      },
      {immediate: false}
  )

  // 加载并渲染渔业数据
  const loadAndRenderFishing = async () => {
    if (!map || fishingDataLoaded) return

    showLayerGlobalLoading('fishing')
    layerStore.setLayerLoading('fishing', true)

    try {
      const { features, sourceLabel } = await loadRequiredVectorFeatures('fishing')
      if (features.length === 0) {
        if (layerStore.getLayerVisible('fishing')) {
          failPlatformLayerRender('fishing', ' 没有可加载的图层数据')
        }
        return
      }

      const layers = createFishingLayers(toCurrentMapFeatures(features))

      layers.forEach((layer: any) => {
        map!.addLayer(layer)
        fishingLayers.push(layer)
      })

      if (layers.length === 0) {
        failPlatformLayerRender('fishing', ' 没有生成可渲染图层')
        return
      }

      fishingDataLoaded = true
      layerStore.setLayerLoaded('fishing', true)

      appStore.showNotification({type: 'success', message: `已加载渔业数据，共 ${features.length} 个要素（${sourceLabel}）`})
      appStore.addLog('INFO', `渔业数据加载完成（${sourceLabel}）`)

    } catch (error) {
      failPlatformLayerRender('fishing', ' 加载失败', error)
    } finally {
      layerStore.setLayerLoading('fishing', false)
      hideLayerGlobalLoading('fishing')
    }
  }

  const setFishingVisible = (visible: boolean) => {
    fishingLayers.forEach(layer => layer.setVisible(visible))
  }

  // 监听渔业图层可见性
  watch(
      () => layerStore.layers.find(l => l.id === 'fishing')?.visible,
      async (visible) => {
        if (visible) {
          if (!fishingDataLoaded) await loadAndRenderFishing()
          else setFishingVisible(true)
        } else {
          setFishingVisible(false)
        }
      },
      {immediate: false}
  )

  // 加载并渲染航道数据
  const loadAndRenderShipping = async () => {
    if (!map || shippingDataLoaded) return

    showLayerGlobalLoading('shipping')
    layerStore.setLayerLoading('shipping', true)

    try {
      const { features, sourceLabel } = await loadRequiredVectorFeatures('shipping')
      if (features.length === 0) {
        if (layerStore.getLayerVisible('shipping')) {
          failPlatformLayerRender('shipping', ' 没有可加载的图层数据')
        }
        return
      }

      const layers = createShippingLayers(toCurrentMapFeatures(features))

      layers.forEach((layer: any) => {
        map!.addLayer(layer)
        shippingLayers.push(layer)
      })

      if (layers.length === 0) {
        failPlatformLayerRender('shipping', ' 没有生成可渲染图层')
        return
      }

      shippingDataLoaded = true
      layerStore.setLayerLoaded('shipping', true)

      appStore.showNotification({type: 'success', message: `已加载航道数据，共 ${features.length} 个要素（${sourceLabel}）`})
      appStore.addLog('INFO', `航道数据加载完成（${sourceLabel}）`)

    } catch (error) {
      failPlatformLayerRender('shipping', ' 加载失败', error)
    } finally {
      layerStore.setLayerLoading('shipping', false)
      hideLayerGlobalLoading('shipping')
    }
  }

  const setShippingVisible = (visible: boolean) => {
    shippingLayers.forEach(layer => layer.setVisible(visible))
  }

  // 监听航道图层可见性
  watch(
      () => layerStore.layers.find(l => l.id === 'shipping')?.visible,
      async (visible) => {
        if (visible) {
          if (!shippingDataLoaded) await loadAndRenderShipping()
          else setShippingVisible(true)
        } else {
          setShippingVisible(false)
        }
      },
      {immediate: false}
  )

  // 监听海洋高程图层可见性（控制 GeoTIFF 底图）
  watch(
      () => {
        const elevationLayer = layerStore.layers.find(l => l.id === 'elevation')
        const elevationData = layerStore.getLayerData('elevation')
        return {
          visible: Boolean(elevationLayer?.visible),
          source: elevationData?.metadata.source ?? '',
          downloadUrl: elevationData?.metadata.downloadUrl ?? '',
          rasterSize: elevationData?.rasterData?.byteLength ?? 0,
        }
      },
      async ({ visible }) => {
        await setElevationVisible(visible)
      },
      {immediate: false}
  )

  setTimeout(() => {
    loading.value = false
  }, 8000)

  appStore.addLog('INFO', '地图初始化完成')

  // 检查是否已有导入的路线数据，如有则绘制
  if (routeStore.paretoRoutes.length > 0) {
    setTimeout(() => {
      drawParetoRoutes()
      isPlanning.value = true
    }, 500)
  }
}

// 路径颜色配置
const routeColors = ['#3b82f6', '#10b981', '#f59e0b'] // 蓝、绿、橙

interface ProjectStationMarker {
  id: string
  name: string
  lon: number
  lat: number
}

const getConfiguredProjectStations = (): ProjectStationMarker[] => {
  const config = settingsStore.routePlanningConfig
  const source = config.mode === 'multi-point' && config.waypoints?.length
    ? config.waypoints
    : [config.startPoint, config.endPoint]
  const seen = new Set<string>()

  return source.flatMap((point, index) => {
    const lon = Number(point?.lon)
    const lat = Number(point?.lat)
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) return []

    const key = `${lon.toFixed(8)},${lat.toFixed(8)}`
    if (seen.has(key)) return []
    seen.add(key)

    const fallbackName = index === 0
      ? '起点'
      : index === source.length - 1
        ? '终点'
        : `站点 ${index + 1}`
    return [{
      id: 'id' in point && point.id ? String(point.id) : `project-station-${index + 1}`,
      name: point.name || fallbackName,
      lon,
      lat,
    }]
  })
}

const getConfiguredPlanningRangeExtent = (): number[] | null => {
  if (!map || !appStore.hasOpenProject) return null
  const extent = activePlanningLonLatExtent.value
  return extent ? toCurrentMapExtent(extent) : null
}

const drawConfiguredProjectStations = (fitView = true): boolean => {
  if (!map || !routeSource || !appStore.hasOpenProject) return false
  const stations = getConfiguredProjectStations()
  if (stations.length === 0) return false

  stations.forEach((station, index) => {
    const isStart = index === 0
    const isEnd = index === stations.length - 1
    const color = isStart ? '#10b981' : isEnd ? '#ef4444' : '#3b82f6'
    const feature = new Feature({
      geometry: new Point(toCurrentMapCoordinate([station.lon, station.lat])),
      pointId: station.id,
      pointName: station.name,
      pointType: 'landing',
      isProjectStation: true,
    })
    feature.setStyle(new Style({
      image: new Icon({
        src: '/image/landing.png',
        scale: 0.2,
        anchor: [0.5, 0.5],
      }),
      text: new Text({
        text: station.name,
        offsetY: -30,
        font: 'bold 12px sans-serif',
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
      }),
    }))
    routeSource!.addFeature(feature)
  })

  if (fitView) {
    map.getView().fit(routeSource.getExtent(), {
      padding: [80, 80, 80, 80],
      duration: 500,
      maxZoom: 8,
    })
  }
  return true
}

// 绑制路径到地图
const drawParetoRoutes = async () => {
  if (!map) return

  // 不再强制加载 DEM 数据（避免下载 tif 文件）
  // 如果图层已存在，先清除
  if (routeSource) {
    routeSource.clear()
  } else {
    // 创建路径图层
    routeSource = new VectorSource()
    routeLayer = new VectorLayer({
      source: routeSource,
      zIndex: 200,
    })
    map.addLayer(routeLayer)
  }
  segmentNodeSource?.clear()

  // 优先使用 paretoRoutes 绘制多条路线（路由规划模式）
  if (routeStore.paretoRoutes.length > 0) {
    const routes = routeStore.paretoRoutes
    const orderedRoutes = routes
      .map((route, routeIndex) => ({ route, routeIndex }))
      .sort((left, right) =>
        Number(left.route.id === routeStore.selectedRoute?.id)
        - Number(right.route.id === routeStore.selectedRoute?.id))
    const renderedSharedRoutePointKeys = new Set<string>()
    const selectedSharedRoutePointKeys = new Set<string>()
    routeStore.selectedRoute?.points.forEach(point => {
      const key = getSharedRoutePointRenderKey(point.type, point.coordinates)
      if (key) selectedSharedRoutePointKeys.add(key)
    })

    for (const { route, routeIndex } of orderedRoutes) {
      const baseColor = routeColors[routeIndex % routeColors.length]
      const isRouteSelected = routeStore.selectedRoute?.id === route.id
      // 所有后端路线均保持实线；选中状态只通过颜色和粗细区分。
      const lineWidth = isRouteSelected ? 5 : 3
      const lineColor = isRouteSelected ? '#ef4444' : baseColor

      // 构建点 ID 到坐标的映射
      const pointMap: Record<string, [number, number]> = {}
      for (const p of route.points) {
        pointMap[p.id] = p.coordinates
      }

      const rawTrunkCoords = (route.rawTrunkCoordinates || [])
        .filter(isFiniteCoordinate)

      if (route.segments.length > 0) {
        route.segments.forEach((segment, segmentIndex) => {
          const start = pointMap[segment.startPointId]
          const end = pointMap[segment.endPointId]
          if (!start || !end) return
          const segmentCoordinates = segment.geometryStartIndex !== undefined
            && segment.geometryEndIndex !== undefined
            && rawTrunkCoords.length > segment.geometryEndIndex
            ? rawTrunkCoords.slice(segment.geometryStartIndex, segment.geometryEndIndex + 1)
            : [start, end]
          const isSegmentSelected = routeStore.selectedSegmentInfo?.id === segment.id
          const segmentFeature = new Feature({
            geometry: new LineString(toCurrentMapCoordinates(segmentCoordinates)),
            routeId: route.id,
            isRouteLine: true,
            segmentIndex,
            segmentId: segment.id,
            segmentLength: segment.length,
            segmentDepth: segment.depth,
            segmentCableType: segment.cableType,
            segmentRiskLevel: segment.riskLevel,
          })
          segmentFeature.setStyle(new Style({
            stroke: new Stroke({
              color: isSegmentSelected ? '#f59e0b' : lineColor,
              width: isSegmentSelected ? lineWidth + 3 : lineWidth,
            }),
          }))
          routeSource!.addFeature(segmentFeature)
        })
      } else {
        const lineCoordinates = rawTrunkCoords.length >= 2
          ? rawTrunkCoords
          : route.points.map(point => point.coordinates).filter(isFiniteCoordinate)
        if (lineCoordinates.length >= 2) {
          const routeLineFeature = new Feature({
            geometry: new LineString(toCurrentMapCoordinates(lineCoordinates)),
            routeId: route.id,
            isRouteLine: true,
          })
          routeLineFeature.setStyle(new Style({
            stroke: new Stroke({ color: lineColor, width: lineWidth }),
          }))
          routeSource!.addFeature(routeLineFeature)
        }
      }

      if (isRouteSelected && segmentNodeSource && route.segments.length > 0) {
        const boundaryIds = new Set(route.segments.flatMap(segment => [segment.startPointId, segment.endPointId]))
        route.points.forEach(point => {
          if (!boundaryIds.has(point.id) || point.type === 'landing') return
          segmentNodeSource!.addFeature(new Feature({
            geometry: new Point(toCurrentMapCoordinate(point.coordinates)),
            routeId: route.id,
            pointId: point.id,
            isSegmentBoundary: true,
            selected: route.segments.some(segment =>
              segment.id === routeStore.selectedSegmentInfo?.id
              && (segment.startPointId === point.id || segment.endPointId === point.id)),
          }))
        })
      }

      // ====== 仅绘制 landing / branching 节点（隐藏 waypoint） ======
      for (const [pointIndex, point] of route.points.entries()) {
        // waypoint 不显示
        if (point.type !== 'landing' && point.type !== 'branching') continue
        const sharedPointKey = getSharedRoutePointRenderKey(point.type, point.coordinates)
        if (!sharedPointKey || renderedSharedRoutePointKeys.has(sharedPointKey)) continue
        renderedSharedRoutePointKeys.add(sharedPointKey)
        const isSharedPointSelected = isRouteSelected || selectedSharedRoutePointKeys.has(sharedPointKey)

        const pointFeature = new Feature({
          geometry: new Point(toCurrentMapCoordinate(point.coordinates)),
          routeId: route.id,
          pointIndex: pointIndex,
          pointType: point.type,
          pointName: point.name,
          pointId: point.id,
        })

        if (point.type === 'landing') {
          const iconUrl = (point.depth && point.depth > 0) ? '/image/underwater.png' : '/image/landing.png'
          pointFeature.setStyle(new Style({
            image: new Icon({
              src: iconUrl,
              scale: isSharedPointSelected ? 0.22 : 0.18,
              anchor: [0.5, 0.5],
            }),
            text: point.name ? new Text({
              text: point.name,
              offsetY: 18,
              font: isSharedPointSelected ? 'bold 12px sans-serif' : '12px sans-serif',
              fill: new Fill({color: isSharedPointSelected ? '#ef4444' : '#333'}),
              stroke: new Stroke({color: '#fff', width: 3}),
            }) : undefined,
          }))
        } else if (point.type === 'branching') {
          const radius = isSharedPointSelected ? 11 : 9
          pointFeature.setStyle(new Style({
            image: new CircleStyle({
              radius: radius,
              fill: new Fill({color: '#a855f7'}),
              stroke: new Stroke({color: '#fff', width: isSharedPointSelected ? 3 : 2}),
            }),
            text: point.name ? new Text({
              text: point.name,
              offsetY: -(radius + 8),
              font: isSharedPointSelected ? 'bold 12px sans-serif' : '12px sans-serif',
              fill: new Fill({color: '#a855f7'}),
              stroke: new Stroke({color: '#fff', width: 3}),
            }) : undefined,
          }))
        }

        routeSource!.addFeature(pointFeature)

        // 如果是分支器且有分支目标，绘制分支登陆站图标
        // 分支线段已由 route.segments 绘制，无需重复画线
        const branchTargets: Array<{ coord: [number, number]; name: string; depth?: number }> =
          (point.type === 'branching' && ((point as any).branchTargets || ((point as any).branchTo ? [(point as any).branchTo] : [])))
          || []
        for (const branchTo of branchTargets) {
          // 检查该分支登陆站是否已在 route.points 中被绘制（避免重复图标）
          const alreadyDrawn = route.points.some(p =>
            p.type === 'landing' &&
            Math.abs(p.coordinates[0] - branchTo.coord[0]) < 1e-6 &&
            Math.abs(p.coordinates[1] - branchTo.coord[1]) < 1e-6
          )
          if (alreadyDrawn) continue
          const branchStationKey = getSharedRoutePointRenderKey('landing', branchTo.coord)
          if (!branchStationKey || renderedSharedRoutePointKeys.has(branchStationKey)) continue
          renderedSharedRoutePointKeys.add(branchStationKey)
          const isBranchStationSelected = selectedSharedRoutePointKeys.has(branchStationKey)

          const branchStationFeature = new Feature({
            geometry: new Point(toCurrentMapCoordinate(branchTo.coord)),
            routeId: route.id,
            pointType: 'landing',
            pointName: branchTo.name,
            isBranchStation: true,
            branchFromPointIndex: pointIndex,
            pointId: `branch-${point.id}-${branchTo.name}`,
          })
          const branchIconUrl = (branchTo.depth && branchTo.depth > 0) ? '/image/underwater.png' : '/image/landing.png'
          branchStationFeature.setStyle(new Style({
            image: new Icon({
              src: branchIconUrl,
              scale: isBranchStationSelected ? 0.22 : 0.18,
              anchor: [0.5, 0.5],
            }),
            text: branchTo.name ? new Text({
              text: branchTo.name,
              offsetY: 18,
              font: isBranchStationSelected ? 'bold 12px sans-serif' : '12px sans-serif',
              fill: new Fill({color: isBranchStationSelected ? '#ef4444' : '#333'}),
              stroke: new Stroke({color: '#fff', width: 3}),
            }) : undefined,
          }))
          routeSource!.addFeature(branchStationFeature)
        }
      }
    }

    // 注意：路由规划视图不绘制放大器 (OLA)，放大器仅在系统设计视图显示

    // 算法路线存在时仅使用算法返回的点位。
    // routeSource 已在本次绘制开始时清空，避免继续叠加项目配置中的起终点。
    if (routes.length > 0 && routeSource.getFeatures().length > 0) {
      const extent = routeSource.getExtent()
      map.getView().fit(extent, {padding: [50, 50, 50, 50], duration: 500})
    }
    return  // paretoRoutes 已绘制，直接返回
  }

  // 没有算法路线时，优先恢复已有设备线路。
  if (monitorStore.devices.length > 1) {
    drawMonitorDevices()
    return
  }

  // 尚未生成算法路线时，显示项目配置的待规划连线与站点。
  const planningRangeExtent = getConfiguredPlanningRangeExtent()
  const hasStations = drawConfiguredProjectStations(false)
  if (planningRangeExtent || hasStations) {
    map.getView().fit(planningRangeExtent ?? routeSource.getExtent(), {
      padding: [70, 70, 70, 70],
      duration: 500,
      maxZoom: 8,
    })
    return
  }

  // Fallback: 只有一个设备且没有项目站点时，仍显示该设备。
  if (monitorStore.devices.length > 0) {
    drawMonitorDevices()
  }
}

// 绘制 monitorStore 设备数据
const drawMonitorDevices = () => {
  if (!map || !routeSource) return

  const devices = [...monitorStore.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
  // 分离主干设备和分支登陆站
  const mainTrunkDevices = devices.filter((d: any) => !d.isBranchStation)
  const branchStations = devices.filter((d: any) => d.isBranchStation)

  // 分段绘制主干光纤线（每段可独立选中）
  for (let i = 0; i < mainTrunkDevices.length - 1; i++) {
    const startDevice = mainTrunkDevices[i]
    const endDevice = mainTrunkDevices[i + 1]
    const isSelected = selectedCableId.value === `segment-${i}`

    const segmentFeature = new Feature({
      geometry: new LineString(toCurrentMapCoordinates([
        [startDevice.longitude, startDevice.latitude],
        [endDevice.longitude, endDevice.latitude],
      ])),
      routeId: 'monitor-route',
      segmentIndex: i,
      fromId: startDevice.id,
      toId: endDevice.id,
    })
    segmentFeature.setStyle(new Style({
      stroke: new Stroke({
        color: isSelected ? '#f59e0b' : '#3b82f6',
        width: isSelected ? 5 : 3,
        lineDash: isSelected ? undefined : [8, 4],
      }),
    }))
    routeSource!.addFeature(segmentFeature)
  }

  // 绘制分支线（从分支器到分支登陆站）
  branchStations.forEach((branchStation: any) => {
    const branchFromName = branchStation.branchFrom
    const branchingUnit = mainTrunkDevices.find((d: any) => d.name === branchFromName)

    if (branchingUnit) {
      const branchFromIdx = mainTrunkDevices.indexOf(branchingUnit)
      const branchLineFeature = new Feature({
        geometry: new LineString(toCurrentMapCoordinates([
          [branchingUnit.longitude, branchingUnit.latitude],
          [branchStation.longitude, branchStation.latitude],
        ])),
        routeId: 'monitor-route',
        isBranchLine: true,
        branchFromPointIndex: branchFromIdx,
        branchToName: branchStation.name,
        fromDeviceId: branchingUnit.id,
        toDeviceId: branchStation.id,
      })
      branchLineFeature.setStyle(new Style({
        stroke: new Stroke({
          color: '#a855f7',
          width: 2,
          lineDash: [6, 4],
        }),
      }))
      routeSource!.addFeature(branchLineFeature)
    }
  })

  // 设备类型颜色映射
  const deviceColorMap: Record<string, string> = {
    'landing': '#22c55e',
    'LandingStation': '#22c55e',
    'repeater': '#3b82f6',
    'Repeater': '#3b82f6',
    'amplifier_e': '#3b82f6',
    'amplifier_w': '#3b82f6',
    'bu': '#a855f7',
    'BU': '#a855f7',
    'branching': '#a855f7',
    'joint': '#f97316',
    'Joint': '#f97316',
    'underwater': '#06b6d4',
    'PFE': '#06b6d4',
    'waypoint': '#6b7280',
  }

  const deviceSizeMap: Record<string, number> = {
    'landing': 12,
    'LandingStation': 12,
    'repeater': 8,
    'Repeater': 8,
    'amplifier_e': 8,
    'amplifier_w': 8,
    'bu': 10,
    'BU': 10,
    'branching': 10,
    'joint': 6,
    'Joint': 6,
    'underwater': 8,
    'PFE': 8,
    'waypoint': 5,
  }

  // 使用 for...of 以支持 async/await
  for (let index = 0; index < devices.length; index++) {
    const device = devices[index]
    let branchFromIdx = -1
    if ((device as any).isBranchStation && (device as any).branchFrom) {
      const branchingUnit = mainTrunkDevices.find((d: any) => d.name === (device as any).branchFrom)
      if (branchingUnit) {
        branchFromIdx = mainTrunkDevices.indexOf(branchingUnit)
      }
    }

    const pointFeature = new Feature({
      geometry: new Point(toCurrentMapCoordinate([device.longitude, device.latitude])),
      deviceId: device.id,
      deviceType: device.type,
      deviceName: device.name,
      pointIndex: index,
      pointType: device.type,
      routeId: 'monitor-route',
      isBranchStation: (device as any).isBranchStation || false,
      branchFromPointIndex: branchFromIdx >= 0 ? branchFromIdx : undefined,
    })

    // 判断是否是 landing 类型（岸上站点）
    const isLandingType = device.type === 'landing' || device.type === 'LandingStation'

    if (isLandingType) {
      // 统一使用岸上图标，不再查询高程
      const iconSrc = '/image/landing.png'

      pointFeature.setStyle(new Style({
        image: new Icon({
          src: iconSrc,
          scale: 0.35,
          anchor: [0.5, 0.5],
        }),
        text: new Text({
          text: device.name,
          offsetY: -20,
          font: '11px sans-serif',
          fill: new Fill({color: '#333'}),
          stroke: new Stroke({color: '#fff', width: 3}),
        }),
      }))
    } else {
      const color = deviceColorMap[device.type] || '#6b7280'
      const radius = deviceSizeMap[device.type] || 6

      pointFeature.setStyle(new Style({
        image: new CircleStyle({
          radius: radius,
          fill: new Fill({color: color}),
          stroke: new Stroke({color: '#fff', width: 2}),
        }),
        text: new Text({
          text: device.name,
          offsetY: -(radius + 8),
          font: '11px sans-serif',
          fill: new Fill({color: '#333'}),
          stroke: new Stroke({color: '#fff', width: 3}),
        }),
      }))
    }

    routeSource!.addFeature(pointFeature)
  }

  if (routeSource.getFeatures().length > 0) {
    const extent = routeSource.getExtent()
    map.getView().fit(extent, {padding: [50, 50, 50, 50], duration: 500})
  }

}

// 监听选中路径变化，更新样式
watch(() => [routeStore.selectedRoute?.id, routeStore.selectedSegmentInfo?.id], () => {
  if (routeSource && routeStore.paretoRoutes.length > 0) {
    drawParetoRoutes()
  }
})

// 监听 monitorStore 设备数据变化（与实时监控一致）
watch(() => monitorStore.devices.length, (newLen) => {
  if (newLen > 0) {
    if (map) {
      drawParetoRoutes()
      isPlanning.value = true
    } else {
      const checkMap = setInterval(() => {
        if (map) {
          clearInterval(checkMap)
          drawParetoRoutes()
          isPlanning.value = true
        }
      }, 100)
      setTimeout(() => clearInterval(checkMap), 5000)
    }
  }
}, {immediate: true})

// 监听项目和路径结果变化；切换到无结果项目时也必须清除旧路径并显示规划范围/站点。
watch(
  () => ({
    projectKey: appStore.projectState.currentProject?.uuid
      ?? appStore.projectState.currentProject?.platformProjectId
      ?? '',
    routeIds: routeStore.paretoRoutes.map(route => route.id).join('|'),
  }),
  () => {
    if (routeStore.paretoRoutes.length > 0) {
    ensureSelectedRoute()
    if (map) {
      drawParetoRoutes()
      isPlanning.value = true
    } else {
      const checkMap = setInterval(() => {
        if (map) {
          clearInterval(checkMap)
          drawParetoRoutes()
          isPlanning.value = true
        }
      }, 100)
      setTimeout(() => clearInterval(checkMap), 5000)
    }
    } else if (map) {
      void drawParetoRoutes()
      isPlanning.value = false
    }
  },
  { immediate: true },
)

watch(() => settingsStore.routePlanningConfig, () => {
  if (map && routeStore.paretoRoutes.length === 0) {
    void drawParetoRoutes()
  }
}, { deep: true })

watch(
  () => appStore.projectState.currentProject?.uuid
    ?? appStore.projectState.currentProject?.platformProjectId
    ?? '',
  (projectKey, previousProjectKey) => {
    if (projectKey === previousProjectKey || !activePlanningLonLatExtent.value) return
    activePlanningLonLatExtent.value = null
    resetAreaSelection()
    releasePlanningRangeConstraint()
  },
)

watch(
  () => routeStore.algorithmRouteResult,
  () => refreshAlgorithmResultLayers(),
)

watch(
  () => [
    layerStore.getLayerVisible('algorithm-cost'),
    layerStore.getLayerVisible('algorithm-risk'),
  ],
  ([costVisible, riskVisible]) => {
    costResultLayer?.setVisible(costVisible)
    riskResultLayer?.setVisible(riskVisible)
  },
)

// 清除地图上的路径
const clearRoutes = () => {
  if (routeSource) {
    routeSource.clear()
    drawConfiguredProjectStations()
  }
  segmentNodeSource?.clear()
}

// 停止规划
const handleStopPlanning = () => {
  // 清除地图上的路径
  clearRoutes()

  // 清除 store 中的路径数据
  routeStore.clearParetoRoutes()
  cableSegmentStore.clearSegments()
  clearAlgorithmResultLayers()

  // 关闭 Pareto 分析面板（已用新组件替代）
  // appStore.setPanelVisible('paretoAnalysisPanel', false)

  // 更新状态
  isPlanning.value = false

  appStore.showNotification({type: 'info', message: '已停止规划，路径已清除'})
  appStore.addLog('INFO', '停止规划，清除路径数据')
}

// 切换规划状态
const togglePlanning = () => {
  if (isPlanning.value) {
    handleStopPlanning()
  } else {
    handleRunPlanning()
  }
}

// 规划加载状态
const isPlanningLoading = ref(false)

const getCurrentRoutePlanningRectRange = (): RoutePlanningRectRange => {
  if (activePlanningLonLatExtent.value) {
    return createRoutePlanningRectRangeFromExtent(activePlanningLonLatExtent.value)
  }
  if (!map) {
    return createRoutePlanningRectRangeFromExtent(DEFAULT_CHINA_LON_LAT_EXTENT)
  }

  const size = map.getSize()
  if (!size || size[0] <= 0 || size[1] <= 0) {
    return createRoutePlanningRectRangeFromExtent(DEFAULT_CHINA_LON_LAT_EXTENT)
  }

  const view = map.getView()
  const extent = view.calculateExtent(size)
  const projection = view.getProjection().getCode()
  const lonLatExtent = projection === 'EPSG:4326'
    ? extent as LonLatExtent
    : transformExtent(extent, projection, 'EPSG:4326') as LonLatExtent

  return createRoutePlanningRectRangeFromExtent(lonLatExtent)
}

const handleRunPlanning = async () => {
  const projectId = String(appStore.projectState?.currentProject?.platformProjectId ?? '')
  if (!projectId || projectId === 'undefined' || projectId === 'null') {
    appStore.showNotification({
      type: 'error',
      message: '未找到当前项目ID，请先打开项目'
    })
    appStore.addLog('ERROR', '运行规划失败：未找到项目ID')
    return
  }

  if (activePlanningLonLatExtent.value) {
    const outsidePoints = configuredPointsOutsideExtent(activePlanningLonLatExtent.value)
    if (outsidePoints.length > 0) {
      appStore.showNotification({
        type: 'error',
        message: `以下规划点不在工程底图范围内：${outsidePoints.join('、')}`,
        duration: 5000,
      })
      return
    }
  }

  const loadingKey = `route-planning:${projectId}`
  appStore.showGlobalLoading('正在调用后端路由规划服务', '等待后端返回规划结果', loadingKey)

  routeStore.clearParetoRoutes()
  cableSegmentStore.clearSegments()
  clearAlgorithmResultLayers()
  clearRoutes()
  isPlanning.value = false
  isPlanningLoading.value = true
  appStore.showNotification({ type: 'info', message: '正在调用后端路由规划服务...' })

  try {
    const rectRange = getCurrentRoutePlanningRectRange()
    appStore.addLog('INFO', `路由规划视口范围 rectRange: [${rectRange.join(', ')}]`)

    const algorithmResult = await fetchRoutePlanningByProjectId(projectId, rectRange)

    if (algorithmResult.routes.length === 0) {
      routeStore.setAlgorithmRouteResult(algorithmResult)
      appStore.showNotification({
        type: 'error',
        message: '后端未返回有效路由数据'
      })
      appStore.addLog('ERROR', '后端路由规划返回空结果')
      return
    }

    appStore.showGlobalLoading('后端规划已完成', '正在渲染后端返回的路径方案', loadingKey)
    applyAlgorithmRouteResult(algorithmResult, '后端路由规划结果')

    // 更新状态
    isPlanning.value = true

    const routeCount = routeStore.paretoRoutes.length || 0
    appStore.showNotification({
      type: 'success',
      message: `后端规划结果已叠加，共 ${routeCount} 条路径方案`
    })
    appStore.addLog('INFO', `后端规划结果叠加完成: 共 ${routeCount} 条路径方案`)
  } catch (error: any) {
    appStore.showNotification({
      type: 'error',
      message: `规划失败: ${error.message || '未知错误'}`
    })
    appStore.addLog('ERROR', `路由规划失败: ${error.message}`)
  } finally {
    isPlanningLoading.value = false
    appStore.hideGlobalLoading(loadingKey)
  }
}

onMounted(() => {
  initMap()
  const restoredResult = routeStore.algorithmRouteResult
  if (restoredResult?.routes.length) {
    applyAlgorithmRouteResult(restoredResult, '已恢复路由规划结果')
    isPlanning.value = true
  } else {
    void drawParetoRoutes()
  }
})

onUnmounted(() => {
  appStore.hideGlobalLoading()
  if (map) {
    disableRouteAdjustment()
    if (mapContextMenuHandler) {
      map.getViewport().removeEventListener('contextmenu', mapContextMenuHandler)
    }
    map.setTarget(undefined)
    map = null
  }
  mapContextMenuHandler = null
})
</script>

<template>
  <div class="flex-1 rounded shadow-sm flex flex-col overflow-hidden" style="background-color: var(--app-card-bg);">
    <!-- 工具栏 -->
    <div class="h-12 px-4 border-b flex items-center justify-between"
         style="background-color: var(--app-bg-secondary); border-color: var(--app-border-color);">
      <div class="flex items-center gap-2">
        <!-- 区域选择 -->
        <Tooltip :content="mapStore.hasSelection ? '清除已选区域' : '框选区域'">
          <Button :variant="mapStore.isBoxSelecting || mapStore.hasSelection ? 'default' : 'outline'" size="sm"
                  @click="toggleBoxSelect">
            <Square class="w-4 h-4 mr-1"/>
            {{ mapStore.hasSelection ? '清除选择' : '区域选择' }}
          </Button>
        </Tooltip>
        <Tooltip content="拖动当前路由的分段点">
          <Button
            :variant="isAdjustingRoute ? 'default' : 'outline'"
            size="sm"
            :disabled="!routeStore.selectedRoute?.segments.length || isPlanningLoading"
            @click="toggleRouteAdjustment"
          >
            <Move3d class="w-4 h-4 mr-1" />
            路由调整
          </Button>
        </Tooltip>
      </div>

      <div class="flex items-center gap-2">
        <Tooltip :content="isPlanningLoading ? '正在规划中...' : isPlanning ? '停止规划' : '运行规划'">
          <Button :variant="isPlanning ? 'destructive' : 'default'" size="sm" :disabled="isPlanningLoading" @click="togglePlanning">
            <Loader2 v-if="isPlanningLoading" class="w-4 h-4 mr-1 animate-spin"/>
            <Pause v-else-if="isPlanning" class="w-4 h-4 mr-1"/>
            <Play v-else class="w-4 h-4 mr-1"/>
            {{ isPlanningLoading ? '规划中...' : isPlanning ? '停止' : '运行规划' }}
          </Button>
        </Tooltip>
        <Tooltip content="导出RPL表格">
          <Button variant="outline" size="sm" :disabled="!isPlanning" @click="appStore.openDialog('rpl-manage')">
            <FileSpreadsheet class="w-4 h-4 mr-1"/>
            导出RPL
          </Button>
        </Tooltip>
      </div>
    </div>

    <!-- 地图视口 -->
    <div class="flex-1 relative overflow-hidden" @click="areaContextMenu.visible = false">
      <div ref="mapContainer" class="w-full h-full"/>

      <div
        v-if="areaContextMenu.visible"
        class="absolute z-30 w-44 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        :style="{ left: `${areaContextMenu.x}px`, top: `${areaContextMenu.y}px` }"
        @click.stop
      >
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
          @click="saveSelectedAreaAsBaseMap"
        >
          <MapPinned class="w-4 h-4" />
          设置为工程底图
        </button>
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
          @click="clearSelection"
        >
          <Trash2 class="w-4 h-4" />
          清除选区
        </button>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading && appStore.hasOpenProject" class="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3 z-50">
        <Loader2 class="w-8 h-8 text-primary animate-spin"/>
        <span class="text-sm text-gray-600">正在加载 GeoTIFF 数据...</span>
      </div>

      <!-- 坐标显示 -->
      <div class="absolute bottom-3 left-3 bg-white/90 px-3 py-1.5 rounded text-xs text-gray-600 shadow z-10">
        <span class="mr-4">经度: {{ (coordinates.lon ?? 0).toFixed(4) }}°</span>
        <span>纬度: {{ (coordinates.lat ?? 0).toFixed(4) }}°</span>
      </div>

      <!-- Pareto路径列表面板 -->
      <ParetoPanel
          v-if="isPlanning || routeStore.paretoRoutes.length > 0"
          @view-pareto-chart="handleViewParetoChart"
          @select-route="handleSelectRoute"
      />

      <!-- 高程图例 -->
      <div class="absolute bottom-5 right-5 bg-white/95 p-3 rounded-md shadow z-10">
        <div class="text-xs font-semibold text-gray-700 mb-2 text-center">高程 (m)</div>
        <div class="flex">
          <div class="w-4 h-60 rounded border"
               style="background: linear-gradient(to bottom, #fff 0%, #c8c8c8 5%, #a0522d 10%, #c86432 15%, #f0c832 22%, #c8dc64 30%, #64c832 38%, #228b22 45%, #c8f0ff 46%, #96dcff 50%, #0078c8 60%, #1e3c96 75%, #0a1e64 88%, #000014 100%);"/>
          <div class="flex flex-col justify-between ml-1.5 text-[10px] text-gray-700 font-medium">
            <span>8848</span>
            <span>6500</span>
            <span>5000</span>
            <span>3500</span>
            <span>2000</span>
            <span>1000</span>
            <span>500</span>
            <span>0</span>
            <span>-100</span>
            <span>-1000</span>
            <span>-3000</span>
            <span>-6000</span>
            <span>-11000</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Pareto前沿图弹窗 -->
    <ParetoFrontierDialog
        v-model:visible="showParetoFrontierDialog"
    />
  </div>
</template>
