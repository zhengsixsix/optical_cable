<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useConnectorStore } from '@/stores/connector'
import { useLayerStore } from '@/stores/layer'
import { useMonitorStore } from '@/stores/monitor'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { ref, onMounted, onUnmounted, watch, toRef, computed } from 'vue'
import { useMapStore } from '@/stores/map'
import { useRPLStore } from '@/stores/rpl'
import {Button, Tooltip} from '@/shared/components/base'
import {
  Square, Edit3, Play, Pause, Loader2, FileSpreadsheet, Scissors, Undo2, Redo2
} from 'lucide-vue-next'

// 新增组件导入
import ParetoPanel from '@/modules/planning/panels/ParetoPanel.vue'
import ParetoFrontierDialog from '@/modules/planning/dialogs/ParetoFrontierDialog.vue'
import CableSegmentGenerateDialog from '@/modules/planning/dialogs/CableSegmentGenerateDialog.vue'
import CableSegmentPreviewDialog from '@/modules/planning/dialogs/CableSegmentPreviewDialog.vue'
import CableSegmentConfigDialog from '@/modules/planning/dialogs/CableSegmentConfigDialog.vue'

// OpenLayers imports
import Map from 'ol/Map'
import View from 'ol/View'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import WebGLPointsLayer from 'ol/layer/WebGLPoints'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoTIFFSource from 'ol/source/GeoTIFF'
import GeoJSONFormat from 'ol/format/GeoJSON'
import { createBaseTileSource } from '@/utils/mapTileSource'
import {DragBox, Modify} from 'ol/interaction'
import Collection from 'ol/Collection'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import Circle from 'ol/geom/Circle'
import {Style, Stroke, Fill, Icon, Circle as CircleStyle, Text} from 'ol/style'
import Heatmap from 'ol/layer/Heatmap'
import { toLonLat, transform, transformExtent } from 'ol/proj'
import 'ol/ol.css'

import {useShpLoader} from '@/services/ShpLoader'
import {createColdCoralLayers, createFishingLayers, createShippingLayers} from '@/utils/layerFactory'
import { fetchPlatformAttachmentBlob, isPlatformAttachmentUrl } from '@/services/platform/attachment'
import shp from 'shpjs'

// 图标资源
import volcanoIconUrl from '@/assets/volcano.svg'
import earthquakeIconUrl from '@/assets/earthquake.svg'

import { useCableSegmentStore } from '@/stores/cableSegment'
import type { Route } from '@/types'
import type { SegmentGenerateConfig, CableSegment, CableSegmentSummary } from '@/types/cableSegment'
import { fetchRoutePlanningByProjectId } from '@/services/RoutePlanningApiService'
import { applyCableSegmentsToRplRecords } from '@/services/RPLSyncService'
import type { AlgorithmRouteBundleResult } from '@/services/RouteDataConverter'
import {
  buildRouteRiskCostSummary,
  validateCableSegments,
  validateRouteGeometry,
  type PlanningIssue,
  type PlanningValidationResult,
  type RouteRiskCostSummary,
} from '@/services/PlanningInsightService'
import { firstDeviceLibraryByCategory } from '@/services/platform/deviceRuntime'
import { calculatePolylineLengthKm, slicePolylineByDistanceKm } from '@/utils/polyline'
import { getSharedRoutePointRenderKey } from '@/utils/routePointRenderKey'
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
const monitorStore = useMonitorStore()
const rplStore = useRPLStore()
const connectorStore = useConnectorStore()
const cableSegmentStore = useCableSegmentStore()

// 监听投影变化
const currentProjection = toRef(mapStore, 'projection')

const emit = defineEmits<{
  (e: 'area-selected', extent: [number, number, number, number]): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const loading = ref(false)
const coordinates = ref({lon: 0, lat: 0})
const isPlanning = ref(false)
const isEditingRoute = ref(false)
const settingsStore = useSettingsStore()

// 新增弹窗状态
const showParetoFrontierDialog = ref(false)
const showCableSegmentGenerateDialog = ref(false)
const showCableSegmentPreviewDialog = ref(false)

// 海缆段相关状态
const generatedSegments = ref<CableSegment[]>([])
const segmentSummary = ref<CableSegmentSummary | null>(null)
const showCableSegmentConfigDialog = ref(false)
const selectedCableSegment = ref<CableSegment | null>(null)
const currentSegmentMethod = ref('')  // 当前分段方式
const currentSegmentGenerateTime = ref('')  // 生成时间
const routeGeometryIssues = ref<PlanningIssue[]>([])
const cableSegmentIssues = ref<PlanningIssue[]>([])
const riskCostSummary = ref<RouteRiskCostSummary | null>(null)
const algorithmSegmentsByRouteId = ref<Record<string, CableSegment[]>>({})

interface RouteEditSnapshot {
  routeId: string
  points: Route['points']
  segments: Route['segments']
  totalLength: number
}

const routeEditHistory = ref<RouteEditSnapshot[]>([])
const routeEditFuture = ref<RouteEditSnapshot[]>([])
const currentEditingRouteId = ref<string | null>(null)
const activeRouteId = computed(() => getActiveRouteId() || '')
const canUndoRouteEdit = computed(() => routeEditHistory.value.length > 1)
const canRedoRouteEdit = computed(() => routeEditFuture.value.length > 0)
const activeRoute = computed(() =>
  routeStore.paretoRoutes.find(route => route.id === activeRouteId.value) || routeStore.selectedRoute || null
)
const geoJSONFormat = new GeoJSONFormat()
const geoTiffRgbStyle = {color: ['array', ['band', 1], ['band', 2], ['band', 3], 1]}
const visibleRouteGeometryIssues = computed(() => routeGeometryIssues.value.slice(0, 3))
const visibleCableSegmentIssues = computed(() => cableSegmentIssues.value.slice(0, 4))
const planningInsightPanelRef = ref<HTMLElement | null>(null)
const planningInsightPosition = ref({ x: 16, y: 72 })
const planningInsightPanelStyle = computed(() => ({
  left: `${planningInsightPosition.value.x}px`,
  top: `${planningInsightPosition.value.y}px`,
}))
let planningInsightDragOffset = { x: 0, y: 0 }

const createEmptyValidationResult = (): PlanningValidationResult => ({
  valid: true,
  errors: [],
  warnings: [],
  infos: [],
  all: [],
})

const getIssueLevelLabel = (level: PlanningIssue['level']) => {
  if (level === 'error') return '错误'
  if (level === 'warning') return '预警'
  return '通过'
}

const getIssueLevelClasses = (level: PlanningIssue['level']) => {
  if (level === 'error') return 'bg-red-50 border-red-200 text-red-700'
  if (level === 'warning') return 'bg-amber-50 border-amber-200 text-amber-700'
  return 'bg-emerald-50 border-emerald-200 text-emerald-700'
}

const getIssueDotClasses = (level: PlanningIssue['level']) => {
  if (level === 'error') return 'bg-red-500'
  if (level === 'warning') return 'bg-amber-500'
  return 'bg-emerald-500'
}

const formatRiskCostValue = (value: number) => {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return value.toFixed(1)
}

const stopPlanningInsightDrag = () => {
  window.removeEventListener('mousemove', handlePlanningInsightDragMove)
  window.removeEventListener('mouseup', stopPlanningInsightDrag)
}

const handlePlanningInsightDragMove = (event: MouseEvent) => {
  if (!mapContainer.value) return

  const rect = mapContainer.value.getBoundingClientRect()
  const panelWidth = planningInsightPanelRef.value?.offsetWidth || 300
  const panelHeight = planningInsightPanelRef.value?.offsetHeight || 240
  const maxX = Math.max(8, rect.width - panelWidth - 8)
  const maxY = Math.max(8, rect.height - panelHeight - 8)

  const nextX = event.clientX - rect.left - planningInsightDragOffset.x
  const nextY = event.clientY - rect.top - planningInsightDragOffset.y

  planningInsightPosition.value = {
    x: Math.min(Math.max(8, nextX), maxX),
    y: Math.min(Math.max(8, nextY), maxY),
  }
}

const startPlanningInsightDrag = (event: MouseEvent) => {
  if (event.button !== 0 || !mapContainer.value) return

  const rect = mapContainer.value.getBoundingClientRect()
  planningInsightDragOffset = {
    x: event.clientX - rect.left - planningInsightPosition.value.x,
    y: event.clientY - rect.top - planningInsightPosition.value.y,
  }

  window.addEventListener('mousemove', handlePlanningInsightDragMove)
  window.addEventListener('mouseup', stopPlanningInsightDrag)
  event.preventDefault()
}

const loadShpFeatures = async (url: string) => {
  const shpLoader = useShpLoader()
  const geojsonData = await shpLoader.load(url)
  return shpLoader.parseFeatures(geojsonData)
}

const loadShpFeaturesFromBlob = async (blob: Blob) => {
  return useShpLoader().parseFeatures(await shp(await blob.arrayBuffer()))
}

const loadPlatformAttachmentShpFeatures = async (downloadUrl: string) => {
  return loadShpFeaturesFromBlob(await fetchPlatformAttachmentBlob(downloadUrl))
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

  if (layerData.metadata.loadStrategy === 'shapefile-zip-vector') {
    if (isPlatformAttachmentUrl(downloadUrl)) {
      return loadPlatformAttachmentShpFeatures(downloadUrl)
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
  normalize: true,
  wrapX: true,
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

// 当前高亮的海缆段 ID（点击持续高亮）
const selectedFineSegmentId = ref<string | null>(null)

// 线段 hover 状态（仅用于海缆段）
const hoveredFeature = ref<Feature | null>(null)

let map: Map | null = null
let dragBox: DragBox | null = null
let selectionSource: VectorSource | null = null
let volcanoIconLayer: VectorLayer<VectorSource> | null = null
let volcanoHeatmapLayer: Heatmap | null = null
let earthquakeIconLayer: WebGLPointsLayer<VectorSource> | null = null
let earthquakeHeatmapLayer: Heatmap | null = null
let riskCostHeatmapLayer: Heatmap | null = null
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
let modifyInteraction: Modify | null = null
const editableFeatures: any = new Collection([])
let elevationNativeMaxZoom = 18
let elevationFallbackApplied = false


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

const clearSelection = () => {
  mapStore.clearSelection()
  if (selectionSource) {
    selectionSource.clear()
  }
  appStore.showNotification({type: 'info', message: '已清除区域选择'})
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

  // 创建新视图
  const newView = new View({
    projection: newProjection,
    center: newCenter,
    zoom: zoom,
    minZoom: 0,
    maxZoom: 18,
  })

  map.setView(newView)

  // 重新绑定鼠标移动事件
  map.on('pointermove', (evt) => {
    const coord = evt.coordinate
    if (newProjection === 'EPSG:3857') {
      // Web Mercator 转 WGS84 显示
      const lonLat = toLonLat(coord)
      coordinates.value = {lon: lonLat[0], lat: lonLat[1]}
    } else {
      coordinates.value = {lon: coord[0], lat: coord[1]}
    }
  })

  appStore.addLog('INFO', `地图投影已切换为 ${newProjection}`)
}

// 监听投影变化
watch(currentProjection, (newProj) => {
  switchProjection(newProj)
})

const handleAction = (actionName: string) => {
  appStore.showNotification({type: 'info', message: `已执行操作: ${actionName}`})
  appStore.addLog('INFO', actionName)
}

// 使用 JSON 深克隆替代 structuredClone：
// 路由点上可能挂载了 Vue 响应式代理或分支节点的附加字段，structuredClone
// 在部分场景下会抛 DataCloneError；路由数据本身是纯 JSON，改用 JSON 克隆更稳定。
const cloneRoutePart = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const cloneRouteSnapshot = (route: Route): RouteEditSnapshot => ({
  routeId: route.id,
  points: cloneRoutePart(route.points),
  segments: cloneRoutePart(route.segments),
  totalLength: route.totalLength,
})

const getEditableRoute = (routeId?: string | null) => {
  const targetRouteId = routeId || currentEditingRouteId.value || activeRouteId.value
  if (!targetRouteId) return null
  return routeStore.paretoRoutes.find(route => route.id === targetRouteId) || null
}

const applyRouteSnapshot = (snapshot: RouteEditSnapshot) => {
  const route = getEditableRoute(snapshot.routeId)
  if (!route) return

  route.points = cloneRoutePart(snapshot.points)
  route.segments = cloneRoutePart(snapshot.segments)
  route.totalLength = snapshot.totalLength
  route.updatedAt = new Date()
  routeStore.selectRoute(route.id)
  drawParetoRoutes()
}

const seedRouteEditHistory = (routeId?: string | null) => {
  const route = getEditableRoute(routeId)
  if (!route) return false

  currentEditingRouteId.value = route.id
  routeEditHistory.value = [cloneRouteSnapshot(route)]
  routeEditFuture.value = []
  return true
}

const pushRouteEditSnapshot = (routeId?: string | null) => {
  const route = getEditableRoute(routeId)
  if (!route) return

  const snapshot = cloneRouteSnapshot(route)
  const previous = routeEditHistory.value[routeEditHistory.value.length - 1]
  if (previous && JSON.stringify(previous.points) === JSON.stringify(snapshot.points)) {
    return
  }

  routeEditHistory.value.push(snapshot)
  routeEditFuture.value = []
}

const undoRouteEdit = () => {
  if (!canUndoRouteEdit.value) return

  const current = routeEditHistory.value.pop()
  if (current) {
    routeEditFuture.value.unshift(current)
  }

  const previous = routeEditHistory.value[routeEditHistory.value.length - 1]
  if (previous) {
    applyRouteSnapshot(previous)
    appStore.showNotification({ type: 'info', message: '已撤销上一次路由调整' })
  }
}

const redoRouteEdit = () => {
  if (!canRedoRouteEdit.value) return

  const next = routeEditFuture.value.shift()
  if (!next) return

  routeEditHistory.value.push(cloneRoutePart(next))
  applyRouteSnapshot(next)
  appStore.showNotification({ type: 'info', message: '已恢复上一次撤销的调整' })
}

const handleRouteEditKeydown = (event: KeyboardEvent) => {
  if (!isEditingRoute.value) return
  if (!(event.ctrlKey || event.metaKey)) return
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }

  const key = event.key.toLowerCase()
  const isUndo = key === 'z' && !event.shiftKey
  const isRedo = (key === 'z' && event.shiftKey) || key === 'y'

  if (isUndo) {
    event.preventDefault()
    undoRouteEdit()
  } else if (isRedo) {
    event.preventDefault()
    redoRouteEdit()
  }
}

// 切换路由调整模式（基于 OL Modify 交互，直接拖拽线条调整路线）
const toggleRouteEditing = () => {
  if (!isEditingRoute.value && !seedRouteEditHistory()) {
    appStore.showNotification({ type: 'warning', message: '请先选择一条可编辑的路由' })
    return
  }

  isEditingRoute.value = !isEditingRoute.value

  if (isEditingRoute.value) {
    mapStore.setToolMode('select')
    enableModifyInteraction()
    appStore.showNotification({type: 'info', message: '路由调整模式已开启，直接拖拽线条调整路线'})
    appStore.addLog('INFO', '开启路由调整模式')
  } else {
    disableModifyInteraction()
    appStore.showNotification({type: 'info', message: '路由调整模式已关闭'})
    appStore.addLog('INFO', '关闭路由调整模式')
  }
}

// 启用 Modify 交互（拖拽线条调整路线）
const enableModifyInteraction = () => {
  if (!map) return

  // 重绘路线以收集可编辑要素
  drawParetoRoutes()

  // 移除旧的 Modify
  if (modifyInteraction) {
    map.removeInteraction(modifyInteraction)
    modifyInteraction = null
  }

  // 创建 Modify 交互 - 仅对选中路线的 LineString 生效
  modifyInteraction = new Modify({
    features: editableFeatures,
    insertVertexCondition: () => true, // 允许在边上插入新顶点
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#ff6600' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    }),
  })

  // 修改结束时同步坐标回 store
  modifyInteraction.on('modifyend', handleModifyEnd)

  map.addInteraction(modifyInteraction)
}

// 禁用 Modify 交互
const disableModifyInteraction = () => {
  if (!map) return

  if (modifyInteraction) {
    map.removeInteraction(modifyInteraction)
    modifyInteraction = null
  }
  editableFeatures.clear()

  // 重绘路线恢复正常显示
  drawParetoRoutes()
}

// Modify 交互结束回调：同步修改后的坐标回 store
const handleModifyEnd = (evt: any) => {
  const features = evt.features.getArray()
  for (const feature of features) {
    if (!feature.get('isRouteLine')) continue

    const routeId = feature.get('routeId')
    const route = routeStore.paretoRoutes.find(r => r.id === routeId)
    if (!route) continue

    const geom = feature.getGeometry() as LineString
    const newCoords = geom.getCoordinates() as [number, number][]

    // 重建路由点：保留 landing/branching 元数据，其他设为 waypoint
    const oldPoints = route.points
    const newPoints: typeof oldPoints = []

    // 找到 landing/branching 点的原始信息（用于保留元数据）
    const keyPointMap: Record<string, typeof oldPoints[0]> = {}
    for (const p of oldPoints) {
      if (p.type === 'landing' || p.type === 'branching') {
        const key = `${p.coordinates[0].toFixed(4)},${p.coordinates[1].toFixed(4)}`
        keyPointMap[key] = p
      }
    }

    for (let i = 0; i < newCoords.length; i++) {
      const coord = newCoords[i]
      const key = `${coord[0].toFixed(4)},${coord[1].toFixed(4)}`
      const existing = keyPointMap[key]

      if (existing) {
        // 保留 landing/branching 元数据
        newPoints.push({ ...existing, coordinates: coord })
      } else {
        // 新的 waypoint
        newPoints.push({
          id: `point-edit-${Date.now()}-${i}`,
          coordinates: coord,
          type: 'waypoint',
          name: '',
        })
      }
    }

    // 确保第一个和最后一个点保持为 landing（固定端点）
    if (newPoints.length > 0 && oldPoints.length > 0) {
      // 强制第一个点坐标与原始 landing 一致
      const firstLanding = oldPoints.find(p => p.type === 'landing')
      if (firstLanding) {
        newPoints[0] = { ...firstLanding }
        newCoords[0] = firstLanding.coordinates
      }
      // 强制最后一个点坐标与原始末端 landing 一致
      const lastLanding = [...oldPoints].reverse().find(p => p.type === 'landing')
      if (lastLanding) {
        newPoints[newPoints.length - 1] = { ...lastLanding }
        newCoords[newCoords.length - 1] = lastLanding.coordinates
      }
    }

    // 重建 segments
    const newSegments: typeof route.segments = []
    for (let i = 0; i < newPoints.length - 1; i++) {
      const segLength = calculateDistanceFromCoords(newPoints[i].coordinates, newPoints[i + 1].coordinates)
      newSegments.push({
        id: `${routeId}-seg-${i}`,
        startPointId: newPoints[i].id,
        endPointId: newPoints[i + 1].id,
        length: Math.round(segLength),
        depth: route.segments[0]?.depth || 2000,
        cableType: route.segments[0]?.cableType || 'LW',
        riskLevel: route.segments[0]?.riskLevel || 'low',
        cost: Math.round(segLength * 30000),
      })
    }

    // 更新 store
    route.points = newPoints
    route.segments = newSegments
    route.totalLength = Math.round(newSegments.reduce((sum, s) => sum + s.length, 0))
    route.updatedAt = new Date()

    // 更新 LineString 几何（确保端点回正）
    geom.setCoordinates(newCoords)

    pushRouteEditSnapshot(routeId)
    const geometryResult = refreshRouteGeometryValidation(route)
    updateRiskCostHeatmap(route)
    const geometryMessage = geometryResult.errors[0]?.message || geometryResult.warnings[0]?.message
    appStore.showNotification({
      type: geometryResult.valid ? 'success' : 'warning',
      message: geometryMessage ? `路线已调整，${geometryMessage}` : '路线已调整，几何校验通过',
    })
    appStore.addLog('INFO', `路线已调整：${newPoints.length} 个点，总长 ${route.totalLength} km`)
  }
}

// 获取当前活动的 routeId
const getActiveRouteId = () => {
  // 优先使用 paretoRoutes（路由规划模式）
  if (routeStore.paretoRoutes.length > 0) {
    // 返回选中的路线 ID，或第一条路线
    return routeStore.selectedRoute?.id || routeStore.paretoRoutes[0]?.id
  }
  // Fallback: 使用 monitorStore 模式
  if (monitorStore.devices.length > 0) {
    return 'monitor-route'
  }
  return undefined
}


// 查看Pareto前沿图
const handleViewParetoChart = () => {
  showParetoFrontierDialog.value = true
}

// 选择路径事件
const handleSelectRoute = (routeId: string) => {
  // 重绘路径以更新选中状态
  routeStore.selectRoute(routeId)
  applyAlgorithmSegmentsForRoute(routeId)
  const selected = routeStore.paretoRoutes.find(route => route.id === routeId) || null
  refreshRouteGeometryValidation(selected)
  updateRiskCostHeatmap(selected)
  drawParetoRoutes()
}

const applyAlgorithmSegmentsForRoute = (routeId: string) => {
  const segments = algorithmSegmentsByRouteId.value[routeId]
  if (!segments) return
  cableSegmentStore.setCurrentRoute(routeId)
  cableSegmentStore.setSegments(segments)
  refreshCableSegmentValidation(segments)
}

const ensureSelectedRoute = () => {
  if (!routeStore.selectedRoute && routeStore.paretoRoutes.length > 0) {
    routeStore.selectRoute(routeStore.paretoRoutes[0].id)
  }
  return routeStore.selectedRoute || routeStore.paretoRoutes[0] || null
}

// ========== 海缆段生成相关函数 ==========

// 从路由段提取风险数据，供海缆段生成使用
const buildRiskDataFromRoute = (route: { segments: Array<{ length: number; riskLevel: string; depth: number }> }): Array<{ kp: number; riskValue: number }> => {
  const riskData: Array<{ kp: number; riskValue: number }> = []
  const riskMap: Record<string, number> = { high: 3, medium: 2, low: 1 }
  let cumulativeKp = 0

  for (const seg of route.segments) {
    const riskValue = riskMap[seg.riskLevel] || 1
    // 在每段的起点和中点各插入一个风险采样点
    riskData.push({ kp: cumulativeKp, riskValue })
    riskData.push({ kp: cumulativeKp + (seg.length || 0) / 2, riskValue })
    cumulativeKp += seg.length || 0
  }
  // 末尾点
  if (cumulativeKp > 0) {
    const lastRisk = riskMap[route.segments[route.segments.length - 1]?.riskLevel] || 1
    riskData.push({ kp: cumulativeKp, riskValue: lastRisk })
  }
  return riskData
}

const refreshRouteGeometryValidation = (route: Route | null = activeRoute.value) => {
  if (!route) {
    routeGeometryIssues.value = []
    return createEmptyValidationResult()
  }
  const result = validateRouteGeometry(route)
  routeGeometryIssues.value = result.all.filter(issue => issue.level !== 'info' || result.all.length === 1)
  return result
}

const refreshCableSegmentValidation = (segments: CableSegment[] = cableSegmentStore.segments) => {
  if (segments.length === 0) {
    cableSegmentIssues.value = []
    return createEmptyValidationResult()
  }
  const result = validateCableSegments(
    segments,
    cableSegmentStore.generateConfig,
    settingsStore.routePlanningConfig.armorMappings || [],
  )
  cableSegmentIssues.value = result.all.filter(issue => issue.level !== 'info' || result.all.length === 1)
  return result
}

const getRiskCostSummarySource = (route: Route | null = activeRoute.value) => {
  if (!route) return null
  const selectedRouteSegments = cableSegmentStore.segments.filter(segment => (
    !segment.routeId || segment.routeId === route.id
  ))
  return selectedRouteSegments.length > 0 ? { segments: selectedRouteSegments } : route
}

const refreshRiskCostSummary = (route: Route | null = activeRoute.value) => {
  riskCostSummary.value = buildRouteRiskCostSummary(
    getRiskCostSummarySource(route),
    settingsStore.routePlanningConfig.armorMappings || [],
  )
  return riskCostSummary.value
}

const updateRiskCostHeatmap = (route: Route | null = activeRoute.value) => {
  if (!map) return

  const summary = refreshRiskCostSummary(route)
  if (!route || !summary || route.segments.length === 0) {
    if (riskCostHeatmapLayer) riskCostHeatmapLayer.setVisible(false)
    return
  }

  const pointMap: Record<string, [number, number]> = {}
  route.points.forEach(point => {
    pointMap[point.id] = point.coordinates
  })

  const unitPriceByRisk: Record<'high' | 'medium' | 'low', number> = {
    high: summary.bands.find(item => item.riskLevel === 'high')?.unitPrice || 24,
    medium: summary.bands.find(item => item.riskLevel === 'medium')?.unitPrice || 19.5,
    low: summary.bands.find(item => item.riskLevel === 'low')?.unitPrice || 15,
  }

  const maxSegmentCost = Math.max(
    ...route.segments.map(segment => (segment.length || 0) * unitPriceByRisk[segment.riskLevel || 'low']),
    1,
  )

  const features = route.segments.flatMap(segment => {
    const start = pointMap[segment.startPointId]
    const end = pointMap[segment.endPointId]
    if (!start || !end) return []

    const segmentCost = (segment.length || 0) * unitPriceByRisk[segment.riskLevel || 'low']
    const weight = Math.max(0.15, Math.min(1, segmentCost / maxSegmentCost))
    const mid: [number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
    ]

    return [
      new Feature({ geometry: new Point(start), weight }),
      new Feature({ geometry: new Point(mid), weight }),
      new Feature({ geometry: new Point(end), weight }),
    ]
  })

  const source = new VectorSource({ features })
  if (!riskCostHeatmapLayer) {
    riskCostHeatmapLayer = new Heatmap({
      source,
      blur: 38,
      radius: 18,
      opacity: 0.45,
      zIndex: 40,
      gradient: ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444'],
      weight: feature => feature.get('weight') || 0.2,
      visible: true,
    })
    map.addLayer(riskCostHeatmapLayer)
    return
  }

  riskCostHeatmapLayer.setSource(source)
  riskCostHeatmapLayer.setVisible(true)
}

// 打开海缆段生成对话框
const handleOpenCableSegmentGenerate = () => {
  // 检查是否已有选中的路由
  if (!activeRouteId.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择一条路由' })
    return
  }
  showCableSegmentGenerateDialog.value = true
}

// 处理海缆段生成
const handleCableSegmentGenerate = (config: SegmentGenerateConfig) => {
  showCableSegmentGenerateDialog.value = false
  
  // 设置配置
  cableSegmentStore.setGenerateConfig(config)
  const currentSelectedRouteId = activeRouteId.value
  cableSegmentStore.setCurrentRoute(currentSelectedRouteId)
  
  // 保存分段方式和生成时间
  currentSegmentMethod.value = config.method
  currentSegmentGenerateTime.value = new Date().toLocaleString()
  
  // 获取当前选中路由的长度
    const selectedRoute = routeStore.paretoRoutes.find(r => r.id === currentSelectedRouteId)
    const routeLength = selectedRoute?.totalLength || 100
  
  // 从路由段提取风险数据
  const riskData = selectedRoute?.segments ? buildRiskDataFromRoute(selectedRoute) : []
  const segments = cableSegmentStore.generateSegments(routeLength, riskData)
  
  // 设置预览数据
  generatedSegments.value = segments
  segmentSummary.value = cableSegmentStore.summary
  syncCableSegmentsToRPL(segments)
  refreshCableSegmentValidation(segments)
  
  // 打开预览对话框
  showCableSegmentPreviewDialog.value = true
  
  appStore.addLog('INFO', `海缆段生成完成：共 ${segments.length} 段`)
}

// 确认海缆段入库
const handleCableSegmentConfirm = (segments: CableSegment[]) => {
  // 保存到 store
  cableSegmentStore.setSegments(segments)
  
  // 关闭弹窗
  showCableSegmentPreviewDialog.value = false
  
  // ★ 同步海缆段缆型到 RPL 记录
  syncCableSegmentsToRPL(segments)
  const validationResult = refreshCableSegmentValidation(segments)
  
  appStore.showNotification({ 
    type: validationResult.valid ? 'success' : 'warning',
    message: validationResult.errors[0]?.message || validationResult.warnings[0]?.message || `海缆段已确认入库，共 ${segments.length} 段，总长 ${segmentSummary.value?.totalLength.toFixed(2)} km`,
  })
  appStore.addLog('INFO', `海缆段入库完成：${segments.length} 段，已同步缆型到 RPL`)

  // 重绘路由以更新分段节点标记
  drawParetoRoutes()
}

// 将海缆段的缆型同步到 RPL 记录（按 KP 匹配）
const syncCableSegmentsToRPL = (cableSegments: CableSegment[]) => {
  const table = rplStore.currentTable
  if (!table || !table.records || cableSegments.length === 0) return

  const nextRecords = applyCableSegmentsToRplRecords(table.records, cableSegments)
  let updatedCount = 0
  for (const nextRecord of nextRecords) {
    const currentRecord = table.records.find(record => record.id === nextRecord.id)
    if (!currentRecord) continue

    const hasChanged =
      currentRecord.cableType !== nextRecord.cableType ||
      currentRecord.slack !== nextRecord.slack ||
      currentRecord.burialDepth !== nextRecord.burialDepth

    if (hasChanged) {
      rplStore.updateRecord(currentRecord.id, {
        cableType: nextRecord.cableType,
        slack: nextRecord.slack,
        burialDepth: nextRecord.burialDepth,
      }, false)
      updatedCount++
    }
  }

  if (updatedCount > 0) {
    appStore.addLog('INFO', `RPL 海缆段参数已同步：${updatedCount} 条记录已更新`)
  }
}

// 在地图中查看海缆段
const handleViewSegmentsOnMap = () => {
  showCableSegmentPreviewDialog.value = false
  // 重绘路由显示分段节点标记
  drawParetoRoutes()
  appStore.showNotification({ type: 'info', message: '已在地图中显示海缆分段节点标记' })
}

// 自动生成海缆分段节点（规划完成后自动调用）
const autoGenerateCableSegments = (): number => {
  try {
    // 获取当前选中路由（规划刚完成时默认选中第一条）
    const selectedRouteId = activeRouteId.value || routeStore.paretoRoutes[0]?.id
    if (!selectedRouteId) {
      return 0
    }

    const selectedRoute = routeStore.paretoRoutes.find(r => r.id === selectedRouteId)
    const routeLength = selectedRoute?.totalLength || 0
    if (routeLength <= 0) {
      return 0
    }

    // 设置当前路由
    cableSegmentStore.setCurrentRoute(selectedRouteId)

    // 根据路由长度自动选择合理的分段长度
    // 短路由(<100km): 每段 ~25km；中路由(100-500km): 每段 ~50km；长路由(>500km): 每段 ~100km
    const targetLength = routeLength < 100 ? 25 : routeLength < 500 ? 50 : 100

    // 使用固定长度方式自动分段
    cableSegmentStore.setGenerateConfig({
      method: 'fixed-length',
      targetLength
    })

    // 从路由段提取风险数据
    const riskData = selectedRoute?.segments ? buildRiskDataFromRoute(selectedRoute) : []
    const segments = cableSegmentStore.generateSegments(routeLength, riskData)

    // 更新预览数据
    generatedSegments.value = segments
    segmentSummary.value = cableSegmentStore.summary
    currentSegmentMethod.value = 'fixed-length'
    currentSegmentGenerateTime.value = new Date().toLocaleString()

    appStore.addLog('INFO', `自动生成海缆分段：${segments.length} 段，每段约 ${targetLength} km，总长 ${routeLength.toFixed(1)} km`)
    return segments.length
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    appStore.addLog('WARN', `自动生成海缆分段失败: ${message}`)
    return 0
  }
}

// 获取当前路由总长度
const getCurrentRouteLength = (): number => {
  const currentSelectedRouteId = activeRouteId.value
  const selectedRoute = routeStore.paretoRoutes.find(r => r.id === currentSelectedRouteId)
  return selectedRoute?.totalLength || 0
}

// 保存海缆段配置
const handleCableSegmentConfigSave = (segment: CableSegment) => {
  cableSegmentStore.updateSegment(segment.id, segment)
  syncCableSegmentsToRPL(cableSegmentStore.segments)
  const validationResult = refreshCableSegmentValidation(cableSegmentStore.segments)
  appStore.showNotification({
    type: validationResult.valid ? 'success' : 'warning',
    message: validationResult.errors[0]?.message || validationResult.warnings[0]?.message || `海缆段 ${segment.id.slice(-8)} 配置已保存`,
  })
  drawParetoRoutes()
}

// 关闭海缆段配置弹窗（取消高亮）
const handleCloseCableSegmentConfig = () => {
  showCableSegmentConfigDialog.value = false
  selectedCableSegment.value = null
  selectedCableId.value = null
  selectedFineSegmentId.value = null  // 取消海缆段高亮
  routeStore.clearSelectedSegmentInfo()
  // 重绘路由恢复样式
  drawParetoRoutes()
}

const applyAlgorithmRouteResult = (result: AlgorithmRouteBundleResult, sourceLabel: string) => {
  routeStore.setParetoRoutes(result.routes)
  algorithmSegmentsByRouteId.value = result.segmentsByRouteId
  const firstRoute = result.routes[0] || null

  if (firstRoute) {
    routeStore.selectRoute(firstRoute.id)
    cableSegmentStore.setCurrentRoute(firstRoute.id)
    cableSegmentStore.setSegments(result.segmentsByRouteId[firstRoute.id] || [])
  } else {
    cableSegmentStore.clearSegments()
  }

  refreshRouteGeometryValidation(firstRoute)
  refreshCableSegmentValidation(firstRoute ? result.segmentsByRouteId[firstRoute.id] || [] : [])
  updateRiskCostHeatmap(firstRoute)
  drawParetoRoutes()
  appStore.addLog(
    'INFO',
    `${sourceLabel}: ${result.routes.length} 条可见路线，原始候选 ${result.diagnostics.fmmPathCount} 条`,
  )
}

// 根据 KP 查找海缆段
const findCableSegmentByKp = (kp: number): CableSegment | null => {
  return cableSegmentStore.segments.find(s => kp >= s.startKp && kp < s.endKp) || null
}

// 处理线段 hover 事件（仅限海缆段 isFineSegment）
const handleSegmentHover = (evt: any) => {
  if (!map || !routeLayer) return

  const pixel = evt.pixel
  const features = map.getFeaturesAtPixel(pixel, {
    layerFilter: layer => layer === routeLayer,
    hitTolerance: 6
  })

  // 仅检测海缆段 (isFineSegment)
  const fineFeature = features?.find(f => f.get && f.get('isFineSegment')) as Feature | undefined

  if (fineFeature && fineFeature !== hoveredFeature.value) {
    // 如果该段已被点击选中，不再 hover 高亮
    const fineId = fineFeature.get('fineSegmentId')
    if (fineId === selectedFineSegmentId.value) return

    // 离开上一个 hover 海缆段，恢复样式
    if (hoveredFeature.value) {
      restoreFineSegmentStyle(hoveredFeature.value as Feature)
    }

    // 高亮新的海缆段
    hoveredFeature.value = fineFeature
    highlightFineSegment(fineFeature)

    if (mapContainer.value) {
      mapContainer.value.style.cursor = 'pointer'
    }
  } else if (!fineFeature && hoveredFeature.value) {
    // 离开海缆段，恢复样式
    restoreFineSegmentStyle(hoveredFeature.value as Feature)
    hoveredFeature.value = null

    if (mapContainer.value) {
      mapContainer.value.style.cursor = 'default'
    }
  }
}

// 高亮海缆段（hover）
const highlightFineSegment = (feature: Feature) => {
  const currentStyle = feature.getStyle() as Style
  const currentStroke = currentStyle?.getStroke()
  const displayId = feature.get('segmentDisplayId') || ''

  // 保存原始样式
  feature.set('_origColor', currentStroke?.getColor() || '#f59e0b')
  feature.set('_origWidth', currentStroke?.getWidth() || 4)

  feature.setStyle(new Style({
    stroke: new Stroke({
      color: '#facc15', // 亮黄色 hover
      width: 7,
    }),
    text: new Text({
      text: displayId,
      placement: 'line',
      font: 'bold 11px sans-serif',
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#000', width: 3 }),
    }),
  }))
}

// 恢复海缆段样式（hover 离开时）
const restoreFineSegmentStyle = (feature: Feature) => {
  // 如果该段是点击选中状态，不恢复（保持选中高亮）
  const fineId = feature.get('fineSegmentId')
  if (fineId === selectedFineSegmentId.value) return

  const origColor = feature.get('_origColor') || '#f59e0b'
  const origWidth = feature.get('_origWidth') || 4
  const displayId = feature.get('segmentDisplayId') || ''

  feature.setStyle(new Style({
    stroke: new Stroke({ color: origColor, width: origWidth }),
    text: new Text({
      text: displayId,
      placement: 'line',
      font: 'bold 10px sans-serif',
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: origColor, width: 3 }),
    }),
  }))
}

// 获取线段信息
const getSegmentInfo = (routeId: string, segmentIndex: number) => {
  // 优先从 monitorStore 获取（与实时监控一致）
  if (monitorStore.devices.length > 0) {
    const devices = [...monitorStore.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
    if (segmentIndex < devices.length - 1) {
      const startDevice = devices[segmentIndex]
      const endDevice = devices[segmentIndex + 1]
      const length = Math.abs((endDevice.kp || 0) - (startDevice.kp || 0))
      const avgDepth = ((startDevice.depth || 0) + (endDevice.depth || 0)) / 2
      return {
        id: `segment-${segmentIndex}`,
        length: length,
        depth: avgDepth,
        cableType: 'LW',
        riskLevel: 'low'
      }
    }
  }

  // 备用：从 paretoRoutes 获取
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

  const bindGeoTiffSource = (source: GeoTIFFSource, layersForSource: WebGLTileLayer[]) => {
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

    source.getView().then((options: any) => {
      if (options.extent) {
        map?.getView().fit(options.extent, {padding: [20, 20, 20, 20]})
      }
      if (options.resolutions) {
        elevationNativeMaxZoom = Math.min(options.resolutions.length - 1, 18)
        layersForSource.forEach(layer => layer.setMaxZoom(elevationNativeMaxZoom))
      }
    }).catch(() => {
    })
  }

  const geoTiffLayers: WebGLTileLayer[] = []

  // 保存到模块变量，供图层控制使用
  elevationLayers = geoTiffLayers

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({source: createBaseTileSource(), opacity: 0.5}),
      ...geoTiffLayers,
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [...DEFAULT_CHINA_MAP_CENTER],
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
    coordinates.value = {lon: evt.coordinate[0], lat: evt.coordinate[1]}

    // 线段 hover 检测 - 仅在规划模式下启用
    if (isPlanning.value && routeLayer && !isEditingRoute.value) {
      handleSegmentHover(evt)
    }
  })

  // 双击事件 - 地图选点模式
  map.on('dblclick', (evt) => {
    if (appStore.mapSelectMode.active) {
      const coord = evt.coordinate
      const coordStr = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`
      appStore.completeMapSelect(coordStr)
      appStore.showNotification({
        type: 'success',
        message: `已选择坐标: ${coordStr}`
      })
      evt.preventDefault()
    }
  })

  // 单击事件 - 选中光纤线或设备
  map.on('singleclick', (evt) => {
    if (!routeLayer) return

    // 编辑模式下不处理 singleclick，避免触发重绘覆盖拖拽修改
    if (isEditingRoute.value) return

    // 检查是否点击了路径线
    const features = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === routeLayer
    })

    if (features && features.length > 0) {
      // 优先处理细粒度海缆段（KP-间段）点击，直接打开独立配置
      const fineFeature = features.find(f => f.get('isFineSegment'))
      if (fineFeature) {
        const startKp = fineFeature.get('startKp')
        const endKp = fineFeature.get('endKp')
        const segId = fineFeature.get('fineSegmentId')
        let seg = segId ? cableSegmentStore.segments.find(s => s.id === segId) : undefined
        if (!seg) {
          const eps = 1e-6
          seg = cableSegmentStore.segments.find(s => Math.abs(s.startKp - startKp) < eps && Math.abs(s.endKp - endKp) < eps)
        }
        if (seg) {
          selectedFineSegmentId.value = segId  // 持续高亮选中的海缆段
          selectedCableSegment.value = seg
          showCableSegmentConfigDialog.value = true
          drawParetoRoutes()
          return
        }
      }

      const lineFeature = features.find(f => f.getGeometry()?.getType() === 'LineString')
      if (lineFeature) {
        const routeId = lineFeature.get('routeId')
        selectedCableId.value = routeId
        routeStore.selectRoute(routeId)

        // 获取线段信息用于水深剖面显示
        const geom = lineFeature.getGeometry() as LineString
        const coords = geom.getCoordinates()
        const segmentIndex = lineFeature.get('segmentIndex') ?? 0

        // 获取线段详细信息
        let segmentLength = lineFeature.get('segmentLength')
        let segmentDepth = lineFeature.get('segmentDepth')
        let segmentCableType = lineFeature.get('segmentCableType') || 'LW'
        let segmentRiskLevel = lineFeature.get('segmentRiskLevel') || 'low'

        if (!segmentLength || !segmentDepth) {
          const info = getSegmentInfo(routeId, segmentIndex)
          if (info) {
            segmentLength = info.length
            segmentDepth = info.depth
            segmentCableType = info.cableType || 'LW'
            segmentRiskLevel = info.riskLevel || 'low'
          }
        }

        // 设置选中线段信息用于水深剖面
        routeStore.selectSegmentInfo({
          id: lineFeature.get('segmentId') || routeId,
          routeId: routeId,
          startPoint: {lon: coords[0][0], lat: coords[0][1]},
          endPoint: {lon: coords[coords.length - 1][0], lat: coords[coords.length - 1][1]},
          length: segmentLength || 0,
          depth: segmentDepth || 0,
          cableType: segmentCableType,
          riskLevel: segmentRiskLevel
        })

        // 如果已生成海缆段，打开海缆段配置窗口
        if (cableSegmentStore.segments.length > 0) {
          // 直接使用 segmentIndex 查找对应海缆段
          let cableSegment = cableSegmentStore.segments[segmentIndex]
        // 如果索引不匹配，尝试 KP 查找
          if (!cableSegment && segmentLength) {
            const lineStartKp = lineFeature.get('startKp') ?? (segmentIndex * segmentLength)
            const foundSegment = findCableSegmentByKp(lineStartKp)
            if (foundSegment) cableSegment = foundSegment
          }
          // 如果还是找不到，取最接近的海缆段
          if (!cableSegment && cableSegmentStore.segments.length > 0) {
            cableSegment = cableSegmentStore.segments[Math.min(segmentIndex, cableSegmentStore.segments.length - 1)]
          }
          if (cableSegment) {
            selectedCableSegment.value = cableSegment
            showCableSegmentConfigDialog.value = true
            drawParetoRoutes()
            return
          }
        }

        // 未生成海缆段时，只高亮选中，不弹出详情窗口（与单点规划保持一致）
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
    style: new Style({
      stroke: new Stroke({color: '#165DFF', width: 2, lineDash: [5, 5]}),
      fill: new Fill({color: 'rgba(22, 93, 255, 0.1)'}),
    }),
  })
  map.addLayer(selectionLayer)

  dragBox = new DragBox({condition: () => true})

  dragBox.on('boxend', () => {
    if (!selectionSource) return
    selectionSource.clear()

    const extent = dragBox!.getGeometry().getExtent()
    const boxGeom = dragBox!.getGeometry()
    selectionSource.addFeature(new Feature({geometry: boxGeom}))

    appStore.showNotification({
      type: 'success',
      message: `已选择区域: 经度 ${extent[0].toFixed(2)}° ~ ${extent[2].toFixed(2)}°`
    })

    const extent3857: [number, number, number, number] = [
      extent[0] * 20037508.34 / 180,
      Math.log(Math.tan((90 + extent[1]) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180,
      extent[2] * 20037508.34 / 180,
      Math.log(Math.tan((90 + extent[3]) * Math.PI / 360)) / (Math.PI / 180) * 20037508.34 / 180,
    ]

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
          geometry: new Point([volcano.longitude, volcano.latitude]),
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
          geometry: new Point([volcano.longitude, volcano.latitude]),
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
          geometry: new Point([eq.longitude, eq.latitude]),
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
          geometry: new Point([lon, lat]),
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
      const layers = createColdCoralLayers(features)

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
            // 扩展总范围
            import('ol/extent').then(({extend}) => {
              extend(totalExtent!, extent)
            })
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

      const layers = createFishingLayers(features)

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

      const layers = createShippingLayers(features)

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

// 器件库设备类型（系统规划落位的器件，路由规划模式下应过滤）
const deviceLibraryTypes = ['amplifier_e', 'amplifier_w', 'repeater', 'Repeater', 'EDFA']

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

  // 清除 Modify 交互的可编辑要素集合
  editableFeatures.clear()

  // 优先使用 paretoRoutes 绘制多条路线（路由规划模式）
  if (routeStore.paretoRoutes.length > 0) {
    const routes = routeStore.paretoRoutes
    const renderedSharedRoutePointKeys = new Set<string>()
    const selectedSharedRoutePointKeys = new Set<string>()
    routeStore.selectedRoute?.points.forEach(point => {
      const key = getSharedRoutePointRenderKey(point.type, point.coordinates)
      if (key) selectedSharedRoutePointKeys.add(key)
    })

    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex]
      const baseColor = routeColors[routeIndex % routeColors.length]
      const isRouteSelected = routeStore.selectedRoute?.id === route.id
      // 选中路线使用更粗的实线，非选中路线用虚线
      const lineWidth = isRouteSelected ? 5 : 3
      const lineDash = isRouteSelected ? undefined : [8, 4]
      const lineColor = isRouteSelected ? '#ef4444' : baseColor

      // 构建点 ID 到坐标的映射
      const pointMap: Record<string, [number, number]> = {}
      for (const p of route.points) {
        pointMap[p.id] = p.coordinates
      }

      // ====== 过滤分支段：分支登陆站的连线由 branchTo 单独绘制，避免重复 ======
      const branchLandingIds = new Set<string>()
      route.points.forEach(p => {
        if ((p as any).isBranchStation) branchLandingIds.add(p.id)
      })
      const trunkSegments = route.segments.filter(seg =>
        !branchLandingIds.has(seg.startPointId) && !branchLandingIds.has(seg.endPointId)
      )
      const hasBranching = route.points.some(p => p.type === 'branching')
      const rawTrunkCoords = (route.rawTrunkCoordinates || [])
        .filter(coord => Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
      const canUseRawTrunkGeometry = !hasBranching && rawTrunkCoords.length >= 2

      // 按 segments 顺序收集坐标，构建完整折线（仅主干段）
      const allCoords: [number, number][] = []
      for (let i = 0; i < trunkSegments.length; i++) {
        const seg = trunkSegments[i]
        const sc = pointMap[seg.startPointId]
        const ec = pointMap[seg.endPointId]
        if (!sc || !ec) continue
        if (allCoords.length === 0) allCoords.push(sc)
        allCoords.push(ec)
      }
      // 兜底：如果 segments 未能生成坐标，使用 points 坐标
      if (allCoords.length < 2) {
        route.points.forEach(p => allCoords.push(p.coordinates))
      }
      if (canUseRawTrunkGeometry) {
        allCoords.splice(0, allCoords.length, ...rawTrunkCoords)
      }

      if (allCoords.length >= 2) {
        const hasFineSegments = isRouteSelected && cableSegmentStore.segments.some(segment => segment.routeId === route.id)

        if (hasFineSegments && !isEditingRoute.value) {
          // ====== 有海缆段且非编辑模式，直接按段画主干线（每段自带颜色、标签） ======
          const cableSegs = cableSegmentStore.segments.filter(segment => segment.routeId === route.id)

          // 构建 segGeos：仅使用主干段，排除分支段避免 KP 空间错乱
          let kpOff = 0
          const segGeos: Array<{ startKp: number; endKp: number; startCoord: [number, number]; endCoord: [number, number] }> = []
          for (const seg of (hasBranching ? trunkSegments : route.segments)) {
            const sc = pointMap[seg.startPointId]
            const ec = pointMap[seg.endPointId]
            if (!sc || !ec) { kpOff += (seg.length || 0); continue }
            segGeos.push({ startKp: kpOff, endKp: kpOff + (seg.length || 0), startCoord: sc, endCoord: ec })
            kpOff += (seg.length || 0)
          }
          const routeTotalKp = kpOff  // 全路由总 KP
          const rawTrunkLengthKm = canUseRawTrunkGeometry ? calculatePolylineLengthKm(rawTrunkCoords) : 0
          const kpToRawDistance = (kp: number) => routeTotalKp > 0
            ? (kp / routeTotalKp) * rawTrunkLengthKm
            : kp

          // 收集分段边界 KP
          const bKps = new Set<number>()
          cableSegs.forEach(s => {
            if (s.startKp > 0 && s.startKp < routeTotalKp) bKps.add(s.startKp)
            if (s.endKp > 0 && s.endKp < routeTotalKp) bKps.add(s.endKp)
          })
          const sortedBKps = Array.from(bKps).sort((a, b) => a - b)
          const boundaries = [0, ...sortedBKps, routeTotalKp]

          // 创建海缆段 feature 的辅助函数
          const makeFineFeature = (coords: [number, number][], sKp: number, eKp: number, idx: number) => {
            if (coords.length < 2) return
            const eps = 1e-6
            const segInfo = cableSegs.find(s => Math.abs(s.startKp - sKp) < eps && Math.abs(s.endKp - eKp) < eps)
            const risk = segInfo?.riskLevel || 'low'
            const color = risk === 'high' ? '#dc2626' : risk === 'medium' ? '#f97316' : '#f59e0b'
            const segIdx = segInfo ? cableSegs.indexOf(segInfo) : -1
            const displayId = segIdx >= 0 ? `SEG-${String(segIdx + 1).padStart(3, '0')}` : `S-${String(idx + 1).padStart(3, '0')}`
            const fineId = segInfo?.id || `fine-${idx}`
            const isSegSelected = fineId === selectedFineSegmentId.value
            const segFeature = new Feature({
              geometry: new LineString(coords),
              routeId: route.id,
              isFineSegment: true,
              fineSegmentId: fineId,
              segmentDisplayId: displayId,
              startKp: sKp, endKp: eKp,
              cableTypeName: segInfo?.cableTypeName || 'LW',
              riskLevel: risk,
            })
            segFeature.setStyle(new Style({
              stroke: new Stroke({
                color: isSegSelected ? '#facc15' : color,
                width: isSegSelected ? 7 : 5,
              }),
              text: new Text({
                text: displayId,
                placement: 'line',
                font: isSegSelected ? 'bold 11px sans-serif' : 'bold 10px sans-serif',
                fill: new Fill({ color: '#fff' }),
                stroke: new Stroke({ color: isSegSelected ? '#000' : color, width: 3 }),
              }),
            }))
            routeSource!.addFeature(segFeature)
          }

          for (let i = 0; i < boundaries.length - 1; i++) {
            const sKp = boundaries[i], eKp = boundaries[i + 1]
            if (eKp <= sKp) continue

            if (canUseRawTrunkGeometry && rawTrunkLengthKm > 0) {
              const coords = slicePolylineByDistanceKm(rawTrunkCoords, kpToRawDistance(sKp), kpToRawDistance(eKp))
              makeFineFeature(coords, sKp, eKp, i)
            } else if (hasBranching) {
              // 分支拓扑：逐 segGeo 单独绘制，避免跨不连续分支产生跳线
              for (const r of segGeos) {
                if (eKp <= r.startKp || sKp >= r.endKp) continue
                const segLen = r.endKp - r.startKp
                if (segLen <= 0) continue
                const clippedS = Math.max(sKp, r.startKp)
                const clippedE = Math.min(eKp, r.endKp)
                const sf = (clippedS - r.startKp) / segLen
                const ef = (clippedE - r.startKp) / segLen
                const sCoord: [number, number] = [
                  r.startCoord[0] + sf * (r.endCoord[0] - r.startCoord[0]),
                  r.startCoord[1] + sf * (r.endCoord[1] - r.startCoord[1])
                ]
                const eCoord: [number, number] = [
                  r.startCoord[0] + ef * (r.endCoord[0] - r.startCoord[0]),
                  r.startCoord[1] + ef * (r.endCoord[1] - r.startCoord[1])
                ]
                makeFineFeature([sCoord, eCoord], sKp, eKp, i)
              }
            } else {
              // 线性拓扑：跨相邻 segGeo 累积坐标（原始逻辑）
              const coords: [number, number][] = []
              for (const r of segGeos) {
                if (eKp <= r.startKp || sKp >= r.endKp) continue
                const segLen = r.endKp - r.startKp
                const sf = Math.max(0, (sKp - r.startKp) / segLen)
                const ef = Math.min(1, (eKp - r.startKp) / segLen)
                const sLon = r.startCoord[0] + sf * (r.endCoord[0] - r.startCoord[0])
                const sLat = r.startCoord[1] + sf * (r.endCoord[1] - r.startCoord[1])
                const eLon = r.startCoord[0] + ef * (r.endCoord[0] - r.startCoord[0])
                const eLat = r.startCoord[1] + ef * (r.endCoord[1] - r.startCoord[1])
                if (coords.length === 0) coords.push([sLon, sLat])
                coords.push([eLon, eLat])
              }
              makeFineFeature(coords, sKp, eKp, i)
            }
          }
        } else {
          // ====== 无海缆段，画主干线 ======
          if (hasBranching) {
            // 多点规划：逐段绘制所有段（含分支，拓扑是树形不能串联成单条折线）
            route.segments.forEach((seg, i) => {
              const sc = pointMap[seg.startPointId]
              const ec = pointMap[seg.endPointId]
              if (!sc || !ec) return
              const segFeature = new Feature({
                geometry: new LineString([sc, ec]),
                routeId: route.id,
                isRouteLine: true,
                segmentIndex: i,
              })
              segFeature.setStyle(new Style({
                stroke: new Stroke({ color: lineColor, width: lineWidth, lineDash }),
              }))
              routeSource!.addFeature(segFeature)
            })
          } else {
            // 点对点规划：单条连续折线
            const routeLineFeature = new Feature({
              geometry: new LineString(allCoords),
              routeId: route.id,
              isRouteLine: true,
            })
            routeLineFeature.setStyle(new Style({
              stroke: new Stroke({ color: lineColor, width: lineWidth, lineDash }),
            }))
            routeSource!.addFeature(routeLineFeature)

            if (isRouteSelected && isEditingRoute.value) {
              editableFeatures.push(routeLineFeature as any)
            }
          }
        }
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
          geometry: new Point(point.coordinates),
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
            geometry: new Point(branchTo.coord),
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

    // ========== 绘制海缆分段节点标记（编辑模式下隐藏） ==========
    const cableSegments = cableSegmentStore.segments
    const selectedRoute = routeStore.selectedRoute || routeStore.paretoRoutes[0]
    if (cableSegments.length > 0 && selectedRoute && selectedRoute.segments.length > 0 && !isEditingRoute.value) {
      const routeLength = selectedRoute.totalLength || 0
      if (routeLength > 0) {
        // 构建点ID→坐标映射（包含分支登陆站）
        const ptMap: Record<string, [number, number]> = {}
        for (const p of selectedRoute.points) {
          ptMap[p.id] = p.coordinates
        }

        // 按主干线 segments 顺序构建 KP 范围和几何（排除分支段）
        const hasBranchPts = selectedRoute.points.some(p => p.type === 'branching')
        const branchLandingIdSet = new Set<string>()
        if (hasBranchPts) {
          selectedRoute.points.forEach(p => {
            if (p.branchTo) {
              const found = selectedRoute.points.find(op =>
                Math.abs(op.coordinates[0] - p.branchTo!.coord[0]) < 1e-6 &&
                Math.abs(op.coordinates[1] - p.branchTo!.coord[1]) < 1e-6
              )
              if (found) branchLandingIdSet.add(found.id)
            }
            p.branchTargets?.forEach(bt => {
              const found = selectedRoute.points.find(op =>
                Math.abs(op.coordinates[0] - bt.coord[0]) < 1e-6 &&
                Math.abs(op.coordinates[1] - bt.coord[1]) < 1e-6
              )
              if (found) branchLandingIdSet.add(found.id)
            })
          })
        }
        const nodeSegments = hasBranchPts
          ? selectedRoute.segments.filter(seg =>
              !branchLandingIdSet.has(seg.startPointId) && !branchLandingIdSet.has(seg.endPointId)
            )
          : selectedRoute.segments

        let kpOffset = 0
        const segGeos: Array<{
          startKp: number; endKp: number;
          startCoord: [number, number]; endCoord: [number, number];
        }> = []

        for (const seg of nodeSegments) {
          const sc = ptMap[seg.startPointId]
          const ec = ptMap[seg.endPointId]
          if (!sc || !ec) { kpOffset += (seg.length || 0); continue }
          const segLen = seg.length || 0
          segGeos.push({ startKp: kpOffset, endKp: kpOffset + segLen, startCoord: sc, endCoord: ec })
          kpOffset += segLen
        }

        // 收集所有分段边界 KP
        const boundaryKps = new Set<number>()
        cableSegments.forEach(seg => {
          if (seg.startKp > 0) boundaryKps.add(seg.startKp)
          if (seg.endKp < routeLength) boundaryKps.add(seg.endKp)
        })
        const sortedKps = Array.from(boundaryKps).sort((a, b) => a - b)
        const labelInterval = Math.max(1, Math.ceil(sortedKps.length / 30))

        // 在每个分段边界处绘制标记
        for (let idx = 0; idx < sortedKps.length; idx++) {
          const kp = sortedKps[idx]

          // 找到该 KP 落在哪条路由线段上
          const range = segGeos.find(r => kp >= r.startKp && kp <= r.endKp)
          if (!range) continue

          const segLen = range.endKp - range.startKp
          const frac = segLen > 0 ? (kp - range.startKp) / segLen : 0
          const lon = range.startCoord[0] + frac * (range.endCoord[0] - range.startCoord[0])
          const lat = range.startCoord[1] + frac * (range.endCoord[1] - range.startCoord[1])

          const showLabel = idx % labelInterval === 0
          const nodeFeature = new Feature({
            geometry: new Point([lon, lat]),
            isCableSegmentNode: true,
            kp: kp,
          })
          nodeFeature.setStyle(new Style({
            image: new CircleStyle({
              radius: showLabel ? 5 : 3,
              fill: new Fill({ color: '#f59e0b' }),
              stroke: new Stroke({ color: '#fff', width: showLabel ? 2 : 1 }),
            }),
            text: showLabel ? new Text({
              text: `KP ${kp.toFixed(0)}`,
              offsetY: -12,
              font: '10px sans-serif',
              fill: new Fill({ color: '#d97706' }),
              stroke: new Stroke({ color: '#fff', width: 2 }),
            }) : undefined,
          }))
          routeSource!.addFeature(nodeFeature)
        }

      }
    }

    // 注意：路由规划视图不绘制放大器 (OLA)，放大器仅在系统设计视图显示

    if (routes.length > 0 && routeSource.getFeatures().length > 0) {
      const extent = routeSource.getExtent()
      map.getView().fit(extent, {padding: [50, 50, 50, 50], duration: 500})
    }
    return  // paretoRoutes 已绘制，直接返回
  }

  // Fallback: 如果没有 paretoRoutes，使用 monitorStore 设备数据
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
      geometry: new LineString([
        [startDevice.longitude, startDevice.latitude],
        [endDevice.longitude, endDevice.latitude]
      ]),
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
        geometry: new LineString([
          [branchingUnit.longitude, branchingUnit.latitude],
          [branchStation.longitude, branchStation.latitude]
        ]),
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
      geometry: new Point([device.longitude, device.latitude]),
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

  refreshRouteGeometryValidation(activeRoute.value)
  refreshCableSegmentValidation(cableSegmentStore.segments)
  updateRiskCostHeatmap(activeRoute.value)
}

// 监听选中路径变化，更新样式
watch(() => routeStore.selectedRoute?.id, (newRouteId) => {
  if (routeSource && routeStore.paretoRoutes.length > 0) {
    drawParetoRoutes()
  }
  refreshRouteGeometryValidation(activeRoute.value)
  updateRiskCostHeatmap(activeRoute.value)
  if (isEditingRoute.value && newRouteId) {
    seedRouteEditHistory(newRouteId)
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

watch(() => cableSegmentStore.segments, (segments) => {
  refreshCableSegmentValidation(segments)
  refreshRiskCostSummary(activeRoute.value)
}, { deep: true, immediate: true })

// 监听 connectorStore 中 OLA 元素变化（系统规划应用配置时触发）
watch(() => connectorStore.elements.filter(e => e.type === 'ola').length, (newLen, oldLen) => {
  if (newLen !== oldLen && map && routeStore.paretoRoutes.length > 0) {
    drawParetoRoutes()
  }
})

// 监听 paretoRoutes 变化（USE文件导入时触发）
watch(() => routeStore.paretoRoutes.length, (newLen) => {
  if (newLen > 0) {
    const initialRoute = ensureSelectedRoute()
    if (map) {
      drawParetoRoutes()
      refreshRouteGeometryValidation(initialRoute)
      updateRiskCostHeatmap(initialRoute)
      isPlanning.value = true
    } else {
      const checkMap = setInterval(() => {
        if (map) {
          clearInterval(checkMap)
          drawParetoRoutes()
          refreshRouteGeometryValidation(initialRoute)
          updateRiskCostHeatmap(initialRoute)
          isPlanning.value = true
        }
      }, 100)
      setTimeout(() => clearInterval(checkMap), 5000)
    }
  }
}, {immediate: true})

// 根据 segments 构建主干路径点序列（用于 RPL 同步）
const buildOrderedRoutePoints = (route: any) => {
  if (!route || !route.points || route.points.length === 0) return []

  const pointsById = new globalThis.Map<string, any>()
  route.points.forEach((p: any) => pointsById.set(p.id, p))

  // 选择主干起终点（优先非分支登陆站）
  const landingPoints = route.points.filter((p: any) => p.type === 'landing')
  const mainLandings = landingPoints.filter((p: any) => !(p as any).isBranchStation)
  const startPoint = mainLandings[0] || landingPoints[0] || route.points[0]
  const endPoint = mainLandings[mainLandings.length - 1] || landingPoints[landingPoints.length - 1] || route.points[route.points.length - 1]

  if (!startPoint || !endPoint) return route.points
  if (startPoint.id === endPoint.id) return [startPoint]

  if (route.segments && route.segments.length > 0) {
    // 构建无向图
    const adj = new globalThis.Map<string, string[]>()
    route.segments.forEach((seg: any) => {
      if (!adj.has(seg.startPointId)) adj.set(seg.startPointId, [])
      if (!adj.has(seg.endPointId)) adj.set(seg.endPointId, [])
      adj.get(seg.startPointId)!.push(seg.endPointId)
      adj.get(seg.endPointId)!.push(seg.startPointId)
    })

    // BFS 寻径
    const queue: string[] = [startPoint.id]
    const visited = new Set<string>([startPoint.id])
    const prev = new globalThis.Map<string, string | null>()
    prev.set(startPoint.id, null)

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === endPoint.id) break
      const neighbors = adj.get(current) || []
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n)
          prev.set(n, current)
          queue.push(n)
        }
      }
    }

    if (visited.has(endPoint.id)) {
      const pathIds: string[] = []
      let cur: string | null = endPoint.id
      while (cur) {
        pathIds.push(cur)
        cur = prev.get(cur) || null
      }
      pathIds.reverse()
      const ordered = pathIds.map(id => pointsById.get(id)).filter(Boolean)
      if (ordered.length > 0) return ordered
    }
  }

  return route.points
}

// 同步路由数据到 rplStore（供系统规划使用）
const syncRouteToRPL = () => {
  // 获取当前选中的路由（默认选中均衡路线）
  const selectedRoute = routeStore.selectedRoute || routeStore.paretoRoutes[1] || routeStore.paretoRoutes[0]
  if (!selectedRoute) return

  // 从器件库获取默认设备（使用放大器类型）
  const defaultAmplifier = firstDeviceLibraryByCategory(settingsStore.platformDeviceLibraries, 'amplifier')
  const defaultBU = firstDeviceLibraryByCategory(settingsStore.platformDeviceLibraries, 'branching')
  const defaultJointBox = firstDeviceLibraryByCategory(settingsStore.platformDeviceLibraries, 'joint')

  // 将路由点转换为 RPL 记录
  const records: any[] = []
  let cumulativeLength = 0
  let repeaterIndex = 0
  let branchingIndex = 0
  let jointIndex = 0

  const orderedPoints = buildOrderedRoutePoints(selectedRoute)

  orderedPoints.forEach((point: any, index: number) => {
    // 计算段长度
    let segmentLength = 0
    if (index > 0) {
      const prevPoint = orderedPoints[index - 1]
      segmentLength = calculateDistanceFromCoords(
          prevPoint.coordinates,
          point.coordinates
      )
    }
    cumulativeLength += segmentLength

    // 映射点类型
    let pointType: 'landing' | 'repeater' | 'waypoint' | 'branching' | 'joint' = 'waypoint'
    let pointName = point.name || ''

    // 从路由点获取设备信息（如果有）
    const deviceInfo = point.device
    const normalizedDeviceType = String(deviceInfo?.deviceType || '').toLowerCase()

    if (
      point.type === 'landing' ||
      normalizedDeviceType === 'landing' ||
      normalizedDeviceType === 'landstation' ||
      normalizedDeviceType === 'landing_station'
    ) {
      pointType = 'landing'
    } else if (
      point.type === 'repeater' ||
      normalizedDeviceType === 'repeater' ||
      normalizedDeviceType === 'amplifier' ||
      normalizedDeviceType.includes('edfa')
    ) {
      pointType = 'repeater'
      repeaterIndex++
      // 使用设备信息中的名称，否则使用器件库放大器名称
      pointName = deviceInfo?.deviceName || (defaultAmplifier
          ? `${defaultAmplifier.name}-${String(repeaterIndex).padStart(2, '0')}`
          : `放大器-${String(repeaterIndex).padStart(2, '0')}`)
    } else if (
      point.type === 'branching' ||
      normalizedDeviceType === 'bu' ||
      normalizedDeviceType.includes('branch')
    ) {
      pointType = 'branching'
      branchingIndex++
      // 使用设备信息中的名称，否则使用器件库分支器名称
      pointName = deviceInfo?.deviceName || (defaultBU
          ? `${defaultBU.name}-${String(branchingIndex).padStart(2, '0')}`
          : `分支器-${String(branchingIndex).padStart(2, '0')}`)
    } else if (point.type === 'joint' || normalizedDeviceType.includes('joint')) {
      pointType = 'joint'
      jointIndex++
      pointName = deviceInfo?.deviceName || (defaultJointBox
          ? `${defaultJointBox.name}-${String(jointIndex).padStart(2, '0')}`
          : `接头盒-${String(jointIndex).padStart(2, '0')}`)
    }

    const record: any = {
      id: `rec-${Date.now()}-${index}`,
      sequence: index + 1,
      pointType,
      pointName,
      longitude: point.coordinates[0],
      latitude: point.coordinates[1],
      depth: point.depth ?? selectedRoute.segments[index - 1]?.depth ?? selectedRoute.segments[index]?.depth ?? 0,
      segmentLength,
      cumulativeLength,
      slack: 2,
      cableType: 'LW',
      kp: cumulativeLength,
      // 携带完整的器件库设备信息
      device: deviceInfo ? {
        deviceId: deviceInfo.deviceId,
        deviceType: deviceInfo.deviceType,
        deviceName: deviceInfo.deviceName,
        cost: deviceInfo.cost,
        maxSpan: deviceInfo.maxSpan,
        powerConsumption: deviceInfo.powerConsumption,
        gain: deviceInfo.gain,
        noiseFigure: deviceInfo.noiseFigure,
        outputPower: deviceInfo.outputPower,
        portCount: deviceInfo.portCount,
        insertionLoss: deviceInfo.insertionLoss,
      } : undefined,
    }

    // 如果是分支器，记录分支目标
    if (point.branchTo) {
      record.branchTo = {
        coord: point.branchTo.coord,
        name: point.branchTo.name
      }
    }

    records.push(record)
  })

  // 为分支站点添加记录（多点规划中的分支登陆站）
  let branchRecordIndex = records.length
  selectedRoute.points.forEach((point) => {
    if (point.branchTo) {
      const branchTo = point.branchTo
      const hasSameLanding = records.some(r => 
        r.pointType === 'landing' && (
          (r.longitude === branchTo.coord[0] && r.latitude === branchTo.coord[1]) ||
          (r.pointName && r.pointName === branchTo.name) ||
          (r.remarks && r.remarks === branchTo.name)
        )
      )
      if (hasSameLanding) return
      
      // 计算分支线长度
      const branchLength = calculateDistanceFromCoords(
          point.coordinates,
          point.branchTo.coord as [number, number]
      )

      records.push({
        id: `rec-${Date.now()}-branch-${branchRecordIndex}`,
        sequence: branchRecordIndex + 1,
        pointType: 'landing',
        pointName: point.branchTo.name,
        longitude: point.branchTo.coord[0],
        latitude: point.branchTo.coord[1],
        depth: 0, // 登陆站水深为0
        segmentLength: branchLength,
        cumulativeLength: cumulativeLength + branchLength,
        slack: 2,
        cableType: 'LW',
        kp: cumulativeLength + branchLength,
        isBranchStation: true, // 标记为分支登陆站
        branchFrom: point.name, // 分支来源（分支器名称）
      })
      branchRecordIndex++
      cumulativeLength += branchLength
    }
  })

  // 创建或更新 RPL 表格
  const tableName = `${selectedRoute.name}-RPL`
  const existingTable = rplStore.tables.find(t => t.name === tableName)

  const metadata = {
    totalLength: cumulativeLength,
    totalCableLength: cumulativeLength * 1.02,
    landingStations: records.filter(r => r.pointType === 'landing').length,
    repeaters: records.filter(r => r.pointType === 'repeater').length,
    branchingUnits: records.filter(r => r.pointType === 'branching').length,
    joints: records.filter(r => r.pointType === 'joint').length,
    averageDepth: 3000,
    maxDepth: 4000,
    minDepth: 2000,
  }

  if (existingTable) {
    // 更新现有表格
    rplStore.selectTable(existingTable.id)
    existingTable.records = records
    existingTable.metadata = metadata
    existingTable.updatedAt = new Date()
  } else {
    // 创建新表格
    const newTable = rplStore.createTable(tableName, selectedRoute.id)
    newTable.records = records
    newTable.metadata = metadata
  }
  // 同步到 connectorStore（接线元管理）
  syncRouteToConnector(records, selectedRoute.name)
}

// 同步路由数据到接线元管理
const syncRouteToConnector = (rplRecords: any[], routeName: string) => {
  try {
    // 映射点类型到接线元类型
    const mapPointTypeToConnectorType = (pointType: string): string => {
      const map: Record<string, string> = {
        'landing': 'landing',
        'repeater': 'amplifier_e',
        'branching': 'bu',
        'joint': 'joint',
      }
      return map[pointType] || 'underwater'
    }

    // 获取设备类型中文名称
    const getDeviceTypeChinese = (deviceType: string): string => {
      const map: Record<string, string> = {
        'landing': '岸上站点',
        'amplifier_e': '放大器',
        'bu': '水下分支器',
        'joint': '接头盒',
        'underwater': '水下站点',
      }
      return map[deviceType] || deviceType
    }

    // 构建设备列表
    const devices: any[] = []
    let deviceIndex = 0

    rplRecords.forEach((record) => {
      if (record.pointType !== 'waypoint') {
        const connectorType = mapPointTypeToConnectorType(record.pointType)
        devices.push({
          id: `device-${Date.now()}-${deviceIndex}`,
          name: record.pointName || `${getDeviceTypeChinese(connectorType)}-${deviceIndex + 1}`,
          type: connectorType,
          longitude: record.longitude,
          latitude: record.latitude,
          depth: record.depth,
          kp: record.kp || record.cumulativeLength,
          status: 'active',
          specifications: '',
          remarks: record.pointName || '',
          // 保留分支站点信息
          isBranchStation: record.isBranchStation || false,
          branchFrom: record.branchFrom || null,
          branchTo: record.branchTo || null,
        })
        deviceIndex++
      }
    })

    // 生成海缆段（用于配置铠装类型和敷设余量）
    // 分离主干设备和分支登陆站，以正确生成拓扑
    const trunkDevices = devices.filter((d: any) => !d.isBranchStation)
    const branchDevices = devices.filter((d: any) => d.isBranchStation)

    const cableSegments: any[] = []
    let segIdx = 0

    const makeCableSegment = (fromElem: any, toElem: any) => {
      const segmentLength = Math.abs(toElem.kp - fromElem.kp)
      return {
        id: `cable-seg-${Date.now()}-${segIdx}`,
        name: `海缆段 SEG-${String(++segIdx).padStart(3, '0')}`,
        type: 'cable_segment',
        kp: Math.min(fromElem.kp, toElem.kp),
        endKp: Math.max(fromElem.kp, toElem.kp),
        longitude: (fromElem.longitude + toElem.longitude) / 2,
        latitude: (fromElem.latitude + toElem.latitude) / 2,
        depth: (fromElem.depth + toElem.depth) / 2,
        status: 'planned',
        specifications: '',
        remarks: `${fromElem.name} → ${toElem.name}`,
        fromDeviceId: fromElem.id,
        toDeviceId: toElem.id,
        length: segmentLength,
        cableTypeId: 'LW',
        cableTypeName: 'LW (轻型)',
        armorType: '轻铠',
        slack: 3,
        burialDepth: 1.0,
        riskLevel: 'low',
      }
    }

    // 1. 主干海缆段：主干设备之间顺序连接
    for (let i = 0; i < trunkDevices.length - 1; i++) {
      cableSegments.push(makeCableSegment(trunkDevices[i], trunkDevices[i + 1]))
    }

    // 2. 分支海缆段：分支登陆站连接到其所属的 BU
    branchDevices.forEach((branchDev: any) => {
      // 通过 branchFrom 名称查找对应的 BU 设备
      const buDevice = branchDev.branchFrom
          ? trunkDevices.find((d: any) => d.name === branchDev.branchFrom)
          : null
      if (buDevice) {
        cableSegments.push(makeCableSegment(buDevice, branchDev))
      } else if (trunkDevices.length > 0) {
        // 找不到匹配 BU 时回退到最近的主干设备
        cableSegments.push(makeCableSegment(trunkDevices[trunkDevices.length - 1], branchDev))
      }
    })

    const allElements = [...devices, ...cableSegments]

    // 确保有表格
    if (connectorStore.tables.length === 0) {
      connectorStore.createTable(`${routeName}-接线元`, 'route-main')
    }

    // 直接设置当前表格的 elements
    if (connectorStore.tables.length > 0) {
      connectorStore.tables[0].elements = allElements
      connectorStore.currentTableId = connectorStore.tables[0].id
    }

    // 注意：规划模式下不同步到 monitorStore，避免影响 Pareto 路线显示
    // monitorStore.devices 仅用于 USE 文件导入的工程数据
  } catch {
    // syncRouteToConnector 失败时静默处理
  }
}

// 计算两点之间的距离 (km)
const calculateDistanceFromCoords = (coord1: [number, number], coord2: [number, number]): number => {
  const R = 6371 // 地球半径 (km)
  const lat1 = coord1[1] * Math.PI / 180
  const lat2 = coord2[1] * Math.PI / 180
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// 清除地图上的路径
const clearRoutes = () => {
  if (routeSource) {
    routeSource.clear()
  }
}

// 停止规划
const handleStopPlanning = () => {
  // 清除地图上的路径
  clearRoutes()

  // 清除 store 中的路径数据
  routeStore.clearParetoRoutes()
  cableSegmentStore.clearSegments()
  algorithmSegmentsByRouteId.value = {}
  routeGeometryIssues.value = []
  cableSegmentIssues.value = []
  riskCostSummary.value = null

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
  algorithmSegmentsByRouteId.value = {}
  routeStore.clearParetoRoutes()
  cableSegmentStore.clearSegments()
  routeGeometryIssues.value = []
  cableSegmentIssues.value = []
  riskCostSummary.value = null
  clearRoutes()
  isPlanning.value = false
  isPlanningLoading.value = true
  appStore.showNotification({ type: 'info', message: '正在调用后端路由规划服务...' })

  try {
    const projectId = String(appStore.projectState?.currentProject?.platformProjectId ?? '')
    if (!projectId || projectId === 'undefined' || projectId === 'null') {
      isPlanningLoading.value = false
      appStore.showNotification({
        type: 'error',
        message: '未找到当前项目ID，请先打开项目'
      })
      appStore.addLog('ERROR', '运行规划失败：未找到项目ID')
      return
    }

    const rectRange = getCurrentRoutePlanningRectRange()
    appStore.addLog('INFO', `路由规划视口范围 rectRange: [${rectRange.join(', ')}]`)

    const algorithmResult = await fetchRoutePlanningByProjectId(projectId, rectRange)

    if (algorithmResult.routes.length === 0) {
      isPlanningLoading.value = false
      appStore.showNotification({
        type: 'error',
        message: '后端未返回有效路由数据'
      })
      appStore.addLog('ERROR', '后端路由规划返回空结果')
      return
    }

    applyAlgorithmRouteResult(algorithmResult, '后端路由规划结果')
    // 同步到 rplStore 和 connectorStore（生成设备级海缆段）
    syncRouteToRPL()

    // 更新状态
    isPlanning.value = true
    isPlanningLoading.value = false

    const routeCount = routeStore.paretoRoutes.length || 0
    appStore.showNotification({
      type: 'success',
      message: `算法结果已叠加，已生成 ${routeCount} 条路径方案`
    })
    appStore.addLog('INFO', `算法结果叠加完成: 生成 ${routeCount} 条路径方案`)
  } catch (error: any) {
    isPlanningLoading.value = false
    appStore.showNotification({
      type: 'error',
      message: `规划失败: ${error.message || '未知错误'}`
    })
    appStore.addLog('ERROR', `路由规划失败: ${error.message}`)
  }
}

onMounted(async () => {
  if (settingsStore.platformDeviceLibraries.length === 0) {
    await settingsStore.loadPlatformDeviceLibraries()
  }

  initMap()
  window.addEventListener('keydown', handleRouteEditKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleRouteEditKeydown)
  stopPlanningInsightDrag()
  appStore.hideGlobalLoading()
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div class="flex-1 rounded shadow-sm flex flex-col overflow-hidden" style="background-color: var(--app-card-bg);">
    <!-- 工具栏 -->
    <div class="h-12 px-4 border-b flex items-center justify-between"
         style="background-color: var(--app-bg-secondary); border-color: var(--app-border-color);">
      <div class="flex items-center gap-2">
        <!-- 路由调整：直接拖拽线条调整路线 -->
        <Tooltip :content="isEditingRoute ? '关闭路由调整模式' : '开启路由调整（直接拖拽线条调整路线）'">
          <Button
              :variant="isEditingRoute ? 'default' : 'outline'"
              size="sm"
              :disabled="!isPlanning"
              @click="toggleRouteEditing"
          >
            <Edit3 class="w-4 h-4 mr-1"/>
            {{ isEditingRoute ? '完成调整' : '路由调整' }}
          </Button>
        </Tooltip>

        <Tooltip content="撤销最近一次路由调整 (Ctrl/Cmd+Z)">
          <Button
              variant="outline"
              size="sm"
              :disabled="!isEditingRoute || !canUndoRouteEdit"
              @click="undoRouteEdit"
          >
            <Undo2 class="w-4 h-4 mr-1"/>
            撤销
          </Button>
        </Tooltip>

        <Tooltip content="恢复最近一次撤销 (Ctrl/Cmd+Shift+Z)">
          <Button
              variant="outline"
              size="sm"
              :disabled="!isEditingRoute || !canRedoRouteEdit"
              @click="redoRouteEdit"
          >
            <Redo2 class="w-4 h-4 mr-1"/>
            重做
          </Button>
        </Tooltip>

        <div class="w-px h-5" style="background-color: var(--app-border-color);"/>

        <!-- 区域选择 -->
        <Tooltip :content="mapStore.hasSelection ? '清除已选区域' : '框选区域'">
          <Button :variant="mapStore.isBoxSelecting || mapStore.hasSelection ? 'default' : 'outline'" size="sm"
                  @click="toggleBoxSelect">
            <Square class="w-4 h-4 mr-1"/>
            {{ mapStore.hasSelection ? '清除选择' : '区域选择' }}
          </Button>
        </Tooltip>
      </div>

      <div class="flex items-center gap-2">
        <Tooltip content="生成海缆段">
          <Button 
              variant="outline" 
              size="sm" 
              :disabled="!isPlanning || !activeRouteId"
              @click="handleOpenCableSegmentGenerate"
          >
            <Scissors class="w-4 h-4 mr-1"/>
            生成海缆段
          </Button>
        </Tooltip>
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
    <div class="flex-1 relative overflow-hidden">
      <div ref="mapContainer" class="w-full h-full"/>

      <!-- 加载状态 -->
      <div v-if="loading && appStore.hasOpenProject" class="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3 z-50">
        <Loader2 class="w-8 h-8 text-primary animate-spin"/>
        <span class="text-sm text-gray-600">正在加载 GeoTIFF 数据...</span>
      </div>

      <!-- 地图选点模式提示 -->
      <div v-if="appStore.mapSelectMode.active"
           class="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-20 flex items-center gap-3">
        <span class="text-sm font-medium">
          请双击地图选择{{
            appStore.mapSelectMode.type === 'start' ? '起点' : appStore.mapSelectMode.type === 'end' ? '终点' : '规划范围'
          }}坐标
        </span>
        <button @click="appStore.cancelMapSelect" class="text-white/80 hover:text-white text-xs underline">取消</button>
      </div>

      <div
        v-if="riskCostSummary || visibleRouteGeometryIssues.length > 0 || visibleCableSegmentIssues.length > 0"
        ref="planningInsightPanelRef"
        :style="planningInsightPanelStyle"
        class="absolute z-20 w-[292px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl"
        @mousedown="startPlanningInsightDrag"
      >
        <div class="max-h-[calc(100vh-240px)] overflow-y-auto">
          <div
            v-if="riskCostSummary"
            class="border-b border-slate-200 px-3 py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-800">海域风险成本图</div>
                <div class="text-[11px] text-slate-500">已叠加到当前选中路由</div>
              </div>
              <div class="text-right">
                <div class="text-[11px] text-slate-500">总成本</div>
                <div class="text-lg font-bold text-sky-700">{{ formatRiskCostValue(riskCostSummary.totalCost) }}</div>
              </div>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <div class="rounded-md bg-slate-50 px-3 py-2">
                <div class="text-[11px] text-slate-500">路由长度</div>
                <div class="text-sm font-semibold text-slate-800">{{ riskCostSummary.totalLength.toFixed(1) }} km</div>
              </div>
              <div class="rounded-md bg-slate-50 px-3 py-2">
                <div class="text-[11px] text-slate-500">高风险占比</div>
                <div class="text-sm font-semibold text-red-600">
                  {{ ((riskCostSummary.bands.find(band => band.riskLevel === 'high')?.ratio || 0) * 100).toFixed(0) }}%
                </div>
              </div>
            </div>
            <div class="mt-3 space-y-2">
              <div
                v-for="band in riskCostSummary.bands"
                :key="band.riskLevel"
                class="rounded-md border border-slate-200 px-3 py-2"
              >
                <div class="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span>{{ band.label }}</span>
                  <span>{{ band.length.toFixed(1) }} km</span>
                </div>
                <div class="mb-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    :class="band.riskLevel === 'high' ? 'bg-red-500' : band.riskLevel === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'"
                    class="h-full rounded-full"
                    :style="{ width: `${Math.max(8, band.ratio * 100)}%` }"
                  />
                </div>
                <div class="flex items-center justify-between text-[11px] text-slate-500">
                  <span>单价 {{ band.unitPrice.toFixed(1) }}</span>
                  <span>成本 {{ formatRiskCostValue(band.cost) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="visibleRouteGeometryIssues.length > 0"
            class="border-b border-slate-200 px-3 py-3"
          >
            <div class="mb-2 flex items-center justify-between">
              <div class="text-sm font-semibold text-slate-800">路径几何校验</div>
              <span class="text-[11px] text-slate-500">{{ routeGeometryIssues.length }} 项</span>
            </div>
            <div class="space-y-2">
              <div
                v-for="issue in visibleRouteGeometryIssues"
                :key="issue.id"
                :class="['rounded-md border px-3 py-2 text-xs', getIssueLevelClasses(issue.level)]"
              >
                <div class="mb-1 flex items-center gap-2">
                  <span :class="['h-2 w-2 rounded-full', getIssueDotClasses(issue.level)]" />
                  <span class="font-semibold">{{ getIssueLevelLabel(issue.level) }}</span>
                </div>
                <div class="leading-5">{{ issue.message }}</div>
              </div>
            </div>
          </div>

          <div
            v-if="visibleCableSegmentIssues.length > 0"
            class="px-3 py-3"
          >
            <div class="mb-2 flex items-center justify-between">
              <div class="text-sm font-semibold text-slate-800">敷设参数校验</div>
              <span class="text-[11px] text-slate-500">{{ cableSegmentIssues.length }} 项</span>
            </div>
            <div class="space-y-2">
              <div
                v-for="issue in visibleCableSegmentIssues"
                :key="issue.id"
                :class="['rounded-md border px-3 py-2 text-xs', getIssueLevelClasses(issue.level)]"
              >
                <div class="mb-1 flex items-center gap-2">
                  <span :class="['h-2 w-2 rounded-full', getIssueDotClasses(issue.level)]" />
                  <span class="font-semibold">{{ getIssueLevelLabel(issue.level) }}</span>
                </div>
                <div class="leading-5">{{ issue.message }}</div>
              </div>
            </div>
          </div>
        </div>
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

    <!-- 海缆段生成配置弹窗 -->
    <CableSegmentGenerateDialog
        :visible="showCableSegmentGenerateDialog"
        :route-id="activeRouteId"
        :route-length="getCurrentRouteLength()"
        @close="showCableSegmentGenerateDialog = false"
        @generate="handleCableSegmentGenerate"
    />

    <!-- 海缆段预览弹窗 -->
    <CableSegmentPreviewDialog
        :visible="showCableSegmentPreviewDialog"
        :segments="generatedSegments"
        :summary="segmentSummary"
        :validation-issues="cableSegmentIssues"
        :segment-method="currentSegmentMethod"
        :route-id="activeRouteId"
        :generate-time="currentSegmentGenerateTime"
        @close="showCableSegmentPreviewDialog = false"
        @confirm="handleCableSegmentConfirm"
        @go-back="showCableSegmentPreviewDialog = false; showCableSegmentGenerateDialog = true"
        @view-on-map="handleViewSegmentsOnMap"
    />

    <!-- 海缆段配置弹窗 -->
    <CableSegmentConfigDialog
        :visible="showCableSegmentConfigDialog"
        :segment="selectedCableSegment"
        :segment-index="selectedCableSegment ? cableSegmentStore.segments.findIndex(s => s.id === selectedCableSegment!.id) : 0"
        @close="handleCloseCableSegmentConfig"
        @save="handleCableSegmentConfigSave"
    />
  </div>
</template>
