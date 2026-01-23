<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, toRef } from 'vue'
import { useMapStore, useLayerStore, useAppStore, useRouteStore, useSettingsStore, useMonitorStore, useRPLStore, useConnectorStore } from '@/stores'
import { Button, Tooltip } from '@/components/ui'
import {
  MousePointer, Move, Plus, Trash2, Square, Edit3,
  Play, Pause, Loader2, Settings, FileSpreadsheet
} from 'lucide-vue-next'

// 新增组件导入
import ParetoPanel from '@/components/panels/ParetoPanel.vue'
import ParetoFrontierDialog from '@/components/dialogs/ParetoFrontierDialog.vue'
import SegmentDetailDialog from '@/components/dialogs/SegmentDetailDialog.vue'

// OpenLayers imports
import Map from 'ol/Map'
import View from 'ol/View'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import WebGLPointsLayer from 'ol/layer/WebGLPoints'
import GeoTIFF from 'ol/source/GeoTIFF'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import { DragBox, DragPan } from 'ol/interaction'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import Circle from 'ol/geom/Circle'
import { Style, Stroke, Fill, Icon, Circle as CircleStyle, Text } from 'ol/style'
import Heatmap from 'ol/layer/Heatmap'
import { fromLonLat, toLonLat, transform, get as getProjection } from 'ol/proj'
import 'ol/ol.css'

import { loadVolcanoData, loadEarthquakeData } from '@/utils/dataLoader'
import { useShpLoader } from '@/services/ShpLoader'
import { createColdCoralLayers } from '@/utils/layerFactory'

// 图标资源
import volcanoIconUrl from '@/assets/volcano.svg'
import earthquakeIconUrl from '@/assets/earthquake.svg'

const mapStore = useMapStore()
const layerStore = useLayerStore()
const appStore = useAppStore()
const routeStore = useRouteStore()
const monitorStore = useMonitorStore()
const rplStore = useRPLStore()
const connectorStore = useConnectorStore()

// 监听投影变化
const currentProjection = toRef(mapStore, 'projection')

const emit = defineEmits<{
  (e: 'area-selected', extent: [number, number, number, number]): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const loading = ref(true)
const coordinates = ref({ lon: 0, lat: 0 })
const isPlanning = ref(false)
const isEditingRoute = ref(false)
const selectedPointFeature = ref<Feature | null>(null)
const settingsStore = useSettingsStore()
const isDraggingPoint = ref(false)

// 路径编辑模式: 'drag' 拖拽 | 'add' 添加点 | 'delete' 删除点
const editMode = ref<'drag' | 'add' | 'delete'>('drag')

// 新增弹窗状态
const showParetoFrontierDialog = ref(false)
const showSegmentDetailDialog = ref(false)
const currentSegment = ref<{
  id: string
  length: number
  depth: number
  startLon: number
  startLat: number
  endLon: number
  endLat: number
  segmentIndex: number
  cableType: string
  riskLevel: string
} | null>(null)

// 选中的光纤线
const selectedCableId = ref<string | null>(null)

// 线段 hover 状态
const hoveredFeature = ref<Feature | null>(null)
const segmentTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  segmentId: '',
  length: 0,
  depth: 0
})

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
let routeLayer: VectorLayer<VectorSource> | null = null
let routeSource: VectorSource | null = null

const toolModes = [
  { value: 'select', label: '选择', icon: MousePointer },
  { value: 'pan', label: '拖拽', icon: Move },
]

const enableBoxSelect = () => {
  if (!map || !dragBox) return
  mapStore.setBoxSelecting(true)
  map.addInteraction(dragBox)
  appStore.showNotification({ type: 'info', message: '框选模式已开启，拖动鼠标选择区域' })
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
    appStore.showNotification({ type: 'info', message: '框选模式已关闭' })
  } else {
    enableBoxSelect()
  }
}

const clearSelection = () => {
  mapStore.clearSelection()
  if (selectionSource) {
    selectionSource.clear()
  }
  appStore.showNotification({ type: 'info', message: '已清除区域选择' })
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
      coordinates.value = { lon: lonLat[0], lat: lonLat[1] }
    } else {
      coordinates.value = { lon: coord[0], lat: coord[1] }
    }
  })
  
  appStore.addLog('INFO', `地图投影已切换为 ${newProjection}`)
}

// 监听投影变化
watch(currentProjection, (newProj) => {
  switchProjection(newProj)
})

const handleAction = (actionName: string) => {
  appStore.showNotification({ type: 'info', message: `已执行操作: ${actionName}` })
  appStore.addLog('INFO', actionName)
}

// 设置编辑模式
const setEditMode = (mode: 'drag' | 'add' | 'delete') => {
  if (!isEditingRoute.value) {
    // 自动开启编辑模式
    isEditingRoute.value = true
    mapStore.setToolMode('select')
    enablePointDragging()
  }
  editMode.value = mode
  const modeNames = { drag: '拖拽调整', add: '添加节点', delete: '删除节点' }
  appStore.showNotification({ type: 'info', message: `已切换到${modeNames[mode]}模式` })
}

// 开启/关闭路径编辑模式
const toggleRouteEditing = () => {
  isEditingRoute.value = !isEditingRoute.value

  if (isEditingRoute.value) {
    mapStore.setToolMode('select')
    appStore.showNotification({ type: 'info', message: '路径编辑模式已开启，点击路径点可拖拽调整位置' })
    appStore.addLog('INFO', '开启路径编辑模式')
    enablePointDragging()
  } else {
    appStore.showNotification({ type: 'info', message: '路径编辑模式已关闭' })
    appStore.addLog('INFO', '关闭路径编辑模式')
    disablePointDragging()
  }
}

// 获取DragPan交互
let dragPanInteraction: DragPan | null = null

// 启用点拖拽
const enablePointDragging = () => {
  if (!map) return

  // 找到DragPan交互并保存引用
  map.getInteractions().forEach((interaction) => {
    if (interaction instanceof DragPan) {
      dragPanInteraction = interaction
    }
  })

    ; (map as any).on('pointermove', handlePointerMove)
    ; (map as any).on('pointerdown', handlePointerDown)
    ; (map as any).on('pointerup', handlePointerUp)
}

// 禁用点拖拽
const disablePointDragging = () => {
  if (!map) return

    ; (map as any).un('pointermove', handlePointerMove)
    ; (map as any).un('pointerdown', handlePointerDown)
    ; (map as any).un('pointerup', handlePointerUp)
  selectedPointFeature.value = null
  isDraggingPoint.value = false
  dragPanInteraction = null
}

// 处理指针移动
const handlePointerMove = (evt: any) => {
  if (!isEditingRoute.value) return

  if (isDraggingPoint.value && selectedPointFeature.value) {
    const geom = selectedPointFeature.value.getGeometry() as Point
    geom.setCoordinates(evt.coordinate)
    updateRouteLineFromPoints()
  } else {
    // 检测是否悬停在点或线上
    const features = map?.getFeaturesAtPixel(evt.pixel, {
      layerFilter: (layer) => layer === routeLayer
    })

    const pointFeature = features?.find(f => f.getGeometry()?.getType() === 'Point')
    const lineFeature = features?.find(f => f.getGeometry()?.getType() === 'LineString')
    
    if (editMode.value === 'drag') {
      if (pointFeature) {
        mapContainer.value!.style.cursor = 'grab'
      } else {
        mapContainer.value!.style.cursor = 'default'
      }
    } else if (editMode.value === 'add') {
      if (lineFeature) {
        mapContainer.value!.style.cursor = 'crosshair'
      } else {
        mapContainer.value!.style.cursor = 'default'
      }
    } else if (editMode.value === 'delete') {
      if (pointFeature) {
        mapContainer.value!.style.cursor = 'not-allowed'
      } else {
        mapContainer.value!.style.cursor = 'default'
      }
    }
  }
}

// 处理指针按下
const handlePointerDown = (evt: any) => {
  if (!isEditingRoute.value) return

  const features = map?.getFeaturesAtPixel(evt.pixel, {
    layerFilter: (layer) => layer === routeLayer
  })

  const pointFeature = features?.find(f => f.getGeometry()?.getType() === 'Point')
  const lineFeature = features?.find(f => f.getGeometry()?.getType() === 'LineString')
  
  if (editMode.value === 'drag') {
    // 拖拽模式
    if (pointFeature) {
      selectedPointFeature.value = pointFeature as Feature
      isDraggingPoint.value = true
      mapContainer.value!.style.cursor = 'grabbing'
      if (dragPanInteraction) {
        dragPanInteraction.setActive(false)
      }
    }
  } else if (editMode.value === 'add') {
    // 添加点模式 - 点击线段添加新节点
    if (lineFeature) {
      addPointToSegment(lineFeature as Feature, evt.coordinate)
    }
  } else if (editMode.value === 'delete') {
    // 删除点模式 - 点击节点删除
    if (pointFeature) {
      deletePoint(pointFeature as Feature)
    }
  }
}

// 处理指针抬起
const handlePointerUp = () => {
  if (isDraggingPoint.value && selectedPointFeature.value) {
    const geom = selectedPointFeature.value.getGeometry() as Point
    const coords = geom.getCoordinates()
    
    // 同步更新到 store
    syncPointMoveToStore(selectedPointFeature.value as Feature, coords)
    
    appStore.showNotification({
      type: 'success',
      message: `节点已移动到 ${coords[0].toFixed(4)}°, ${coords[1].toFixed(4)}°`
    })
  }

  // 恢复地图拖拽
  if (dragPanInteraction) {
    dragPanInteraction.setActive(true)
  }

  isDraggingPoint.value = false
  selectedPointFeature.value = null
  if (mapContainer.value) {
    mapContainer.value.style.cursor = 'default'
  }
}

// 在线段上添加新节点
const addPointToSegment = (lineFeature: Feature, clickCoord: number[]) => {
  const routeId = lineFeature.get('routeId')
  const segmentIndex = lineFeature.get('segmentIndex') ?? 0
  
  // 获取该路由的所有点
  const pointFeatures = routeSource?.getFeatures().filter(
    f => f.getGeometry()?.getType() === 'Point' && f.get('routeId') === routeId
  ) || []
  
  // 按 pointIndex 排序
  pointFeatures.sort((a, b) => (a.get('pointIndex') || 0) - (b.get('pointIndex') || 0))
  
  // 在 segmentIndex 和 segmentIndex+1 之间插入新点
  const insertIndex = segmentIndex + 1
  
  // 更新后续点的 pointIndex
  pointFeatures.forEach(pf => {
    const idx = pf.get('pointIndex') || 0
    if (idx >= insertIndex) {
      pf.set('pointIndex', idx + 1)
    }
  })
  
  // 创建新的点 Feature
  const newPointFeature = new Feature({
    geometry: new Point(clickCoord),
    routeId: routeId,
    pointIndex: insertIndex,
    pointType: 'waypoint',
    pointName: `新节点-${insertIndex}`,
  })
  
  newPointFeature.setStyle(new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: '#3b82f6' }),
      stroke: new Stroke({ color: '#fff', width: 2 }),
    }),
    text: new Text({
      text: `新节点-${insertIndex}`,
      offsetY: -18,
      font: '12px sans-serif',
      fill: new Fill({ color: '#333' }),
      stroke: new Stroke({ color: '#fff', width: 3 }),
    }),
  }))
  
  routeSource?.addFeature(newPointFeature)
  
  // 同步到 store
  syncAddPointToStore(routeId, insertIndex, clickCoord)
  
  // 重绘路径
  drawParetoRoutes()
  
  appStore.showNotification({
    type: 'success',
    message: `已在线段 ${segmentIndex + 1} 处添加新节点`
  })
  appStore.addLog('INFO', `添加新节点: ${clickCoord[0].toFixed(4)}, ${clickCoord[1].toFixed(4)}`)
}

// 删除节点
const deletePoint = (pointFeature: Feature) => {
  const routeId = pointFeature.get('routeId')
  const pointIndex = pointFeature.get('pointIndex') ?? 0
  const pointType = pointFeature.get('pointType')
  
  // 不允许删除登陆站（起点/终点）
  if (pointType === 'landing') {
    appStore.showNotification({
      type: 'warning',
      message: '不能删除登陆站节点'
    })
    return
  }
  
  // 获取该路由的所有点
  const pointFeatures = routeSource?.getFeatures().filter(
    f => f.getGeometry()?.getType() === 'Point' && f.get('routeId') === routeId
  ) || []
  
  // 至少保留2个点（起点和终点）
  if (pointFeatures.length <= 2) {
    appStore.showNotification({
      type: 'warning',
      message: '路径至少需要2个节点'
    })
    return
  }
  
  // 从图层移除该点
  routeSource?.removeFeature(pointFeature)
  
  // 更新后续点的 pointIndex
  pointFeatures.forEach(pf => {
    if (pf === pointFeature) return
    const idx = pf.get('pointIndex') || 0
    if (idx > pointIndex) {
      pf.set('pointIndex', idx - 1)
    }
  })
  
  // 同步到 store
  syncDeletePointToStore(routeId, pointIndex)
  
  // 重绘路径
  drawParetoRoutes()
  
  appStore.showNotification({
    type: 'success',
    message: `已删除节点 ${pointIndex + 1}`
  })
  appStore.addLog('INFO', `删除节点: index=${pointIndex}`)
}

// 同步点移动到 store
const syncPointMoveToStore = (pointFeature: Feature, newCoords: number[]) => {
  const routeId = pointFeature.get('routeId')
  const deviceId = pointFeature.get('deviceId')
  const pointIndex = pointFeature.get('pointIndex') ?? 0
  
  // 更新 monitorStore 或 paretoRoutes
  if (monitorStore.devices.length > 0 && deviceId) {
    // 使用 deviceId 精确定位设备
    const device = monitorStore.devices.find(d => d.id === deviceId)
    if (device) {
      device.longitude = newCoords[0]
      device.latitude = newCoords[1]
      console.log(`设备 ${device.name} 位置已更新到 store: [${newCoords[0].toFixed(4)}, ${newCoords[1].toFixed(4)}]`)
    }
  } else if (routeId) {
    const route = routeStore.paretoRoutes.find(r => r.id === routeId)
    if (route && pointIndex < route.points.length) {
      route.points[pointIndex].coordinates = [newCoords[0], newCoords[1]]
      console.log(`路由点 ${pointIndex} 位置已更新到 store: [${newCoords[0].toFixed(4)}, ${newCoords[1].toFixed(4)}]`)
    }
  }
}

// 同步添加点到 store
const syncAddPointToStore = (routeId: string, insertIndex: number, coords: number[]) => {
  if (monitorStore.devices.length > 0) {
    // 为 monitorStore 添加设备
    const devices = [...monitorStore.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
    const prevDevice = devices[insertIndex - 1]
    const nextDevice = devices[insertIndex]
    const newKp = prevDevice && nextDevice ? (prevDevice.kp + nextDevice.kp) / 2 : 0
    
    const newDevice = {
      id: `device-new-${Date.now()}`,
      name: `新节点-${insertIndex}`,
      type: 'waypoint',
      neType: 'waypoint',
      status: 'normal' as const,
      location: '',
      sldEquipmentName: '',
      inputPower: 0,
      outputPower: 0,
      gain: 0,
      temperature: 25,
      current: 0,
      pumpCurrent: 0,
      pfeVoltage: 0,
      pfeCurrent: 0,
      longitude: coords[0],
      latitude: coords[1],
      depth: 2000,
      kp: newKp,
    }
    monitorStore.devices.splice(insertIndex, 0, newDevice)
  } else {
    const route = routeStore.paretoRoutes.find(r => r.id === routeId)
    if (route) {
      const newPoint = {
        id: `point-new-${Date.now()}`,
        name: `新节点-${insertIndex}`,
        type: 'waypoint' as const,
        coordinates: [coords[0], coords[1]] as [number, number]
      }
      route.points.splice(insertIndex, 0, newPoint)
      
      // 更新 segments
      if (insertIndex > 0 && insertIndex < route.segments.length + 1) {
        const prevPoint = route.points[insertIndex - 1]
        const newSegment = {
          id: `seg-new-${Date.now()}`,
          startPointId: prevPoint?.id || '',
          endPointId: newPoint.id,
          length: 50,
          depth: 2000,
          cableType: 'LW',
          riskLevel: 'low' as const,
          cost: 100
        }
        route.segments.splice(insertIndex, 0, newSegment)
      }
    }
  }
}

// 同步删除点到 store
const syncDeletePointToStore = (routeId: string, pointIndex: number) => {
  if (monitorStore.devices.length > 0) {
    const devices = [...monitorStore.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
    if (pointIndex < devices.length) {
      const deviceToRemove = devices[pointIndex]
      const idx = monitorStore.devices.findIndex(d => d.id === deviceToRemove.id)
      if (idx !== -1) {
        monitorStore.devices.splice(idx, 1)
      }
    }
  } else {
    const route = routeStore.paretoRoutes.find(r => r.id === routeId)
    if (route && pointIndex < route.points.length) {
      route.points.splice(pointIndex, 1)
      // 同时删除对应的 segment
      if (pointIndex > 0 && pointIndex <= route.segments.length) {
        route.segments.splice(pointIndex - 1, 1)
      }
    }
  }
}

// 更新路径线（根据点位置）- 支持分段线模式
const updateRouteLineFromPoints = () => {
  if (!routeSource || !selectedPointFeature.value) return

  const features = routeSource.getFeatures()
  const lineFeatures = features.filter(f => f.getGeometry()?.getType() === 'LineString')
  const pointFeatures = features.filter(f => f.getGeometry()?.getType() === 'Point')
  
  // 获取当前拖拽点的信息
  const draggedPointIndex = selectedPointFeature.value.get('pointIndex')
  const draggedCoords = (selectedPointFeature.value.getGeometry() as Point).getCoordinates()
  
  // 分段线模式（monitorStore）：更新相邻的两条线段
  if (monitorStore.devices.length > 0) {
    // 找到与当前点相连的线段并更新
    lineFeatures.forEach(lf => {
      const segmentIndex = lf.get('segmentIndex')
      const geom = lf.getGeometry() as LineString
      const coords = geom.getCoordinates()
      
      // 如果这条线段的结束点是当前拖拽的点（segmentIndex + 1 === pointIndex）
      if (segmentIndex === draggedPointIndex - 1 && coords.length >= 2) {
        coords[1] = draggedCoords
        geom.setCoordinates(coords)
      }
      // 如果这条线段的起始点是当前拖拽的点（segmentIndex === pointIndex）
      if (segmentIndex === draggedPointIndex && coords.length >= 2) {
        coords[0] = draggedCoords
        geom.setCoordinates(coords)
      }
    })
    return
  }

  // 单条线模式（paretoRoutes）：按路由ID分组
  const routeGroups: Record<string, Feature[]> = {}
  pointFeatures.forEach(pf => {
    const routeId = pf.get('routeId')
    if (!routeGroups[routeId]) routeGroups[routeId] = []
    routeGroups[routeId].push(pf)
  })

  lineFeatures.forEach(lf => {
    const routeId = lf.get('routeId')
    const points = routeGroups[routeId]
    if (points && points.length > 1) {
      points.sort((a, b) => (a.get('pointIndex') || 0) - (b.get('pointIndex') || 0))
      const coords = points.map(p => (p.getGeometry() as Point).getCoordinates())
      ;(lf.getGeometry() as LineString).setCoordinates(coords)
    }
  })
}

// 查看Pareto前沿图
const handleViewParetoChart = () => {
  showParetoFrontierDialog.value = true
}

// 选择路径事件
const handleSelectRoute = (routeId: string) => {
  // 重绘路径以更新选中状态
  drawParetoRoutes()
}

// 打开线段详情弹窗
const openSegmentDetailDialog = (segmentInfo: {
  id: string
  length: number
  depth: number
  startLon: number
  startLat: number
  endLon: number
  endLat: number
  segmentIndex: number
  cableType: string
  riskLevel: string
}) => {
  currentSegment.value = segmentInfo
  showSegmentDetailDialog.value = true
}

// 保存线段详情
const handleSegmentSave = (data: any) => {
  appStore.showNotification({ type: 'success', message: `线段 ${data.segmentId} 参数已保存` })
  appStore.addLog('INFO', `线段参数已保存: ${JSON.stringify(data)}`)
}

// 处理线段 hover 事件
const handleSegmentHover = (evt: any) => {
  if (!map || !routeLayer) return
  
  const pixel = evt.pixel
  const features = map.getFeaturesAtPixel(pixel, {
    layerFilter: layer => layer === routeLayer
  })
  
  // 检测线段 (LineString)
  const lineFeature = features?.find(f => f.getGeometry()?.getType() === 'LineString')
  
  if (lineFeature && lineFeature !== hoveredFeature.value) {
    // 离开上一个线段，恢复样式
    if (hoveredFeature.value) {
      restoreSegmentStyle(hoveredFeature.value as Feature)
    }
    
    // 高亮新的线段
    hoveredFeature.value = lineFeature as Feature
    highlightSegment(lineFeature as Feature)
    
    // 获取线段信息
    const routeId = lineFeature.get('routeId')
    const segmentIndex = lineFeature.get('segmentIndex') ?? 0
    
    // 从 paretoRoutes 或 monitorStore 获取线段详细信息
    let segmentInfo = getSegmentInfo(routeId, segmentIndex)
    
    // 显示 tooltip
    segmentTooltip.value = {
      visible: true,
      x: evt.originalEvent.clientX,
      y: evt.originalEvent.clientY,
      segmentId: segmentInfo?.id || routeId,
      length: segmentInfo?.length || 0,
      depth: segmentInfo?.depth || 0
    }
    
    // 更新 store 中的悬停线段信息
    if (segmentInfo) {
      const geom = lineFeature.getGeometry() as LineString
      const coords = geom.getCoordinates()
      routeStore.setHoveredSegment({
        id: segmentInfo.id || routeId,
        routeId: routeId,
        startPoint: { lon: coords[0][0], lat: coords[0][1] },
        endPoint: { lon: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] },
        length: segmentInfo.length,
        depth: segmentInfo.depth,
        cableType: segmentInfo.cableType || 'LW',
        riskLevel: segmentInfo.riskLevel || 'low'
      })
    }
    
    // 改变鼠标样式
    if (mapContainer.value) {
      mapContainer.value.style.cursor = 'pointer'
    }
  } else if (!lineFeature && hoveredFeature.value) {
    // 离开线段，恢复样式
    restoreSegmentStyle(hoveredFeature.value as Feature)
    hoveredFeature.value = null
    segmentTooltip.value.visible = false
    routeStore.clearHoveredSegment()
    
    if (mapContainer.value) {
      mapContainer.value.style.cursor = 'default'
    }
  } else if (lineFeature && lineFeature === hoveredFeature.value) {
    // 同一线段，更新 tooltip 位置
    segmentTooltip.value.x = evt.originalEvent.clientX
    segmentTooltip.value.y = evt.originalEvent.clientY
  }
}

// 高亮线段
const highlightSegment = (feature: Feature) => {
  const currentStyle = feature.getStyle() as Style
  const currentStroke = currentStyle?.getStroke()
  
  // 保存原始样式
  feature.set('_originalWidth', currentStroke?.getWidth() || 3)
  feature.set('_originalColor', currentStroke?.getColor() || '#3b82f6')
  
  // 设置高亮样式 - 加粗且颜色变亮
  feature.setStyle(new Style({
    stroke: new Stroke({
      color: '#f59e0b',  // 橙色高亮
      width: 6,
      lineDash: undefined
    })
  }))
}

// 恢复线段样式
const restoreSegmentStyle = (feature: Feature) => {
  const originalWidth = feature.get('_originalWidth') || 3
  const originalColor = feature.get('_originalColor') || '#3b82f6'
  const isSelected = selectedCableId.value === feature.get('routeId')
  
  feature.setStyle(new Style({
    stroke: new Stroke({
      color: isSelected ? '#f59e0b' : originalColor,
      width: isSelected ? 5 : originalWidth,
      lineDash: isSelected ? undefined : [8, 4]
    })
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

  const tifFiles = ['/output2.tif']
  const rgbStyle = { color: ['array', ['band', 1], ['band', 2], ['band', 3], 1] }

  let loadedCount = 0

  const geoTiffLayers = tifFiles.map((url) => {
    const source = new GeoTIFF({
      sources: [{ url }],
      normalize: true,
      wrapX: true,
    })

    source.on('tileloadend', () => {
      loadedCount++
      if (loadedCount >= 1) loading.value = false
    })

    source.on('tileloaderror', () => {
      // appStore.showNotification({ type: 'error', message: 'GeoTIFF 加载失败' })
    })

    return new WebGLTileLayer({ source, style: rgbStyle, visible: true, opacity: 1 })
  })

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ source: new OSM(), opacity: 0.5 }),
      ...geoTiffLayers,
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [0, 20],
      zoom: 1,
      minZoom: 0,
      maxZoom: 18,
    }),
  })

  if (geoTiffLayers.length > 0) {
    const source = geoTiffLayers[0].getSource()
    source?.getView().then((options: any) => {
      if (options.extent) {
        map?.getView().fit(options.extent, { padding: [20, 20, 20, 20] })
      }
    }).catch(() => { })
  }

  map.on('pointermove', (evt) => {
    coordinates.value = { lon: evt.coordinate[0], lat: evt.coordinate[1] }
    
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
      const lineFeature = features.find(f => f.getGeometry()?.getType() === 'LineString')
      if (lineFeature) {
        const routeId = lineFeature.get('routeId')
        selectedCableId.value = routeId
        routeStore.selectRoute(routeId)
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
    }
  })

  selectionSource = new VectorSource()
  const selectionLayer = new VectorLayer({
    source: selectionSource,
    style: new Style({
      stroke: new Stroke({ color: '#165DFF', width: 2, lineDash: [5, 5] }),
      fill: new Fill({ color: 'rgba(22, 93, 255, 0.1)' }),
    }),
  })
  map.addLayer(selectionLayer)

  dragBox = new DragBox({ condition: () => true })

  dragBox.on('boxend', () => {
    if (!selectionSource) return
    selectionSource.clear()

    const extent = dragBox!.getGeometry().getExtent()
    const boxGeom = dragBox!.getGeometry()
    selectionSource.addFeature(new Feature({ geometry: boxGeom }))

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

  // 右键事件 - 路径线段详情
  mapContainer.value.addEventListener('contextmenu', (evt: MouseEvent) => {
    if (!map || !routeLayer || !isPlanning.value) return
    
    evt.preventDefault()
    const pixel = map.getEventPixel(evt)
    
    // 检查是否右键了路径线
    const features = map.getFeaturesAtPixel(pixel, {
      layerFilter: layer => layer === routeLayer
    })
    
    if (features && features.length > 0) {
      const lineFeature = features.find(f => f.getGeometry()?.getType() === 'LineString')
      if (lineFeature) {
        // 从 Feature 中获取线段信息
        const geom = lineFeature.getGeometry() as LineString
        const coords = geom.getCoordinates()
        const segmentId = lineFeature.get('segmentId') || lineFeature.get('routeId')
        const segmentIndex = lineFeature.get('segmentIndex') ?? 0
        
        // 优先从 Feature 属性获取，否则从 store 获取
        let segmentLength = lineFeature.get('segmentLength')
        let segmentDepth = lineFeature.get('segmentDepth')
        let segmentCableType = lineFeature.get('segmentCableType') || 'LW'
        let segmentRiskLevel = lineFeature.get('segmentRiskLevel') || 'low'
        
        // 如果 Feature 上没有，从 getSegmentInfo 获取
        if (!segmentLength || !segmentDepth) {
          const routeId = lineFeature.get('routeId')
          const info = getSegmentInfo(routeId, segmentIndex)
          if (info) {
            segmentLength = info.length
            segmentDepth = info.depth
            segmentCableType = info.cableType || 'LW'
            segmentRiskLevel = info.riskLevel || 'low'
          }
        }
        
        // 打开详情弹窗
        openSegmentDetailDialog({
          id: segmentId,
          length: segmentLength || 0,
          depth: segmentDepth || 2000,
          startLon: coords[0][0],
          startLat: coords[0][1],
          endLon: coords[coords.length - 1][0],
          endLat: coords[coords.length - 1][1],
          segmentIndex: segmentIndex,
          cableType: segmentCableType,
          riskLevel: segmentRiskLevel
        })
      }
    }
  })

  // 加载并渲染火山数据
  const loadAndRenderVolcano = async () => {
    if (!map || volcanoDataLoaded) return

    layerStore.setLayerLoading('volcano', true)

    const volcanoData = await loadVolcanoData('/data/volcane_location.xlsx')
    if (volcanoData.length === 0) {
      layerStore.setLayerLoading('volcano', false)
      return
    }

    console.log(`开始渲染 ${volcanoData.length} 个火山点`)

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

    const volcanoIconSource = new VectorSource({ features: volcanoFeatures })

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

    const volcanoHeatmapSource = new VectorSource({ features: volcanoHeatmapFeatures })

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

    appStore.showNotification({ type: 'success', message: `已加载 ${volcanoData.length} 个火山位置` })
    appStore.addLog('INFO', `火山数据加载完成: ${volcanoData.length} 个点位`)
  }

  const setVolcanoPointsVisible = (visible: boolean) => {
    if (volcanoIconLayer) volcanoIconLayer.setVisible(visible)
    if (!visible && volcanoHeatmapLayer) volcanoHeatmapLayer.setVisible(false)
  }

  // 加载并渲染地震数据
  const loadAndRenderEarthquake = async () => {
    if (!map || earthquakeDataLoaded) return

    layerStore.setLayerLoading('earthquake', true)

    const earthquakeData = await loadEarthquakeData('/data/earthQuakeData.xlsx')
    if (earthquakeData.length === 0) {
      layerStore.setLayerLoading('earthquake', false)
      return
    }

    console.log(`开始渲染 ${earthquakeData.length} 条地震数据`)

    const locationMap: Record<string, number> = {}
    earthquakeData.forEach((eq) => {
      const key = `${eq.longitude.toFixed(4)},${eq.latitude.toFixed(4)}`
      const existing = locationMap[key] || 0
      if (eq.magnitude > existing) locationMap[key] = eq.magnitude
    })

    const uniqueLocations = Object.keys(locationMap)
    console.log(`合并后 ${uniqueLocations.length} 个唯一位置`)

    const earthquakeFeatures = earthquakeData.map((eq) => {
      return new Feature({
        geometry: new Point([eq.longitude, eq.latitude]),
        magnitude: eq.magnitude
      })
    })

    const earthquakeIconSource = new VectorSource({ features: earthquakeFeatures })

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

    const earthquakeHeatmapSource = new VectorSource({ features: earthquakeHeatmapFeatures })

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

    appStore.showNotification({ type: 'success', message: `已加载 ${earthquakeData.length} 条地震数据` })
    appStore.addLog('INFO', `地震数据加载完成: ${earthquakeData.length} 条记录`)
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
    { immediate: false }
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
    { immediate: false }
  )

  // 加载并渲染冷水珊瑚数据
  const loadAndRenderColdCoral = async () => {
    if (!map || coldCoralDataLoaded) return

    layerStore.setLayerLoading('coldCoral', true)
    const shpLoader = useShpLoader()

    try {
      const geojsonData = await shpLoader.load('/data/海草.zip')
      if (Array.isArray(geojsonData)) {
        console.log(`检测到 ${geojsonData.length} 个图层`)
        geojsonData.forEach((g, i) => console.log(`图层 ${i} 要素数量:`, g.features?.length))
      } else {
        console.log('检测到单图层, 要素数量:', geojsonData.features?.length)
      }

      // 解析为 Features
      const features = shpLoader.parseFeatures(geojsonData)
      console.log(`解析完成，共 ${features.length} 个要素`)

      if (features.length === 0) {
        layerStore.setLayerLoading('coldCoral', false)
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
        layerStore.setLayerLoading('coldCoral', false)
        return
      }

      coldCoralDataLoaded = true
      layerStore.setLayerLoaded('coldCoral', true)

      appStore.showNotification({ type: 'success', message: `已加载冷水珊瑚数据，共 ${layers.length} 个图层` })
      appStore.addLog('INFO', `冷水珊瑚数据加载完成`)

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
            import('ol/extent').then(({ extend }) => {
              extend(totalExtent!, extent)
            })
          }
        }
      })

      if (totalExtent) {
        console.log('数据总范围:', totalExtent)
        map.getView().fit(totalExtent, {
          padding: [50, 50, 50, 50],
          duration: 1000,
          maxZoom: 10
        })
      }

    } catch (error) {
      console.error('加载冷水珊瑚数据失败:', error)
      layerStore.setLayerLoading('coldCoral', false)
      appStore.showNotification({ type: 'error', message: '加载冷水珊瑚数据失败' })
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
    { immediate: false }
  )

  setTimeout(() => {
    loading.value = false
    if (loadedCount === 0) {
      appStore.showNotification({ type: 'warning', message: 'GeoTIFF 文件较大，加载中...' })
    }
  }, 8000)

  appStore.addLog('INFO', '地图初始化完成')
  
  // 检查是否已有导入的路线数据，如有则绘制
  if (routeStore.paretoRoutes.length > 0) {
    console.log('Map initialized, drawing existing paretoRoutes:', routeStore.paretoRoutes.length)
    setTimeout(() => {
      drawParetoRoutes()
      isPlanning.value = true
    }, 500)
  }
}

// 路径颜色配置
const routeColors = ['#3b82f6', '#10b981', '#f59e0b'] // 蓝、绿、橙

// 绑制路径到地图
const drawParetoRoutes = () => {
  if (!map) return

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

  // 优先使用 paretoRoutes 绘制多条路线
  if (routeStore.paretoRoutes.length > 0) {
    const routes = routeStore.paretoRoutes
    console.log('Drawing paretoRoutes:', routes.length, 'routes')
    
    routes.forEach((route, routeIndex) => {
      const baseColor = routeColors[routeIndex % routeColors.length]
      const isRouteSelected = routeStore.selectedRoute?.id === route.id
      // 选中路线使用更粗的线和实线
      const lineWidth = isRouteSelected ? 5 : 3
      const lineDash = isRouteSelected ? undefined : [8, 4]
      const lineColor = isRouteSelected ? '#ef4444' : baseColor  // 选中时用红色高亮

      console.log(`Route ${routeIndex}: ${route.id}, selected: ${isRouteSelected}, points: ${route.points.length}`)

      // 分段绘制光纤线（每个节点之间是独立的 Feature）
      for (let i = 0; i < route.points.length - 1; i++) {
        const startPoint = route.points[i]
        const endPoint = route.points[i + 1]
        const segment = route.segments[i] // 获取对应的 segment 信息
        const segmentId = segment?.id || `${route.id}-seg-${i}`
        const isSegmentSelected = selectedCableId.value === segmentId
        
        const segmentFeature = new Feature({
          geometry: new LineString([
            startPoint.coordinates,
            endPoint.coordinates
          ]),
          routeId: route.id,
          segmentId: segmentId,
          segmentIndex: i,
          fromPointId: startPoint.id,
          toPointId: endPoint.id,
          // 存储 segment 详细信息供 hover 使用
          segmentLength: segment?.length || 0,
          segmentDepth: segment?.depth || 0,
          segmentCableType: segment?.cableType || 'LW',
          segmentRiskLevel: segment?.riskLevel || 'low',
        })
        
        // 线段选中时用橙色，路线选中时用红色，否则用基础颜色
        const strokeColor = isSegmentSelected ? '#f59e0b' : lineColor
        const strokeWidth = isSegmentSelected ? 6 : lineWidth
        
        segmentFeature.setStyle(new Style({
          stroke: new Stroke({
            color: strokeColor,
            width: strokeWidth,
            lineDash: isSegmentSelected || isRouteSelected ? undefined : lineDash,
          }),
        }))
        
        routeSource!.addFeature(segmentFeature)
      }

      // 绘制节点
      route.points.forEach((point, pointIndex) => {
        const pointFeature = new Feature({
          geometry: new Point(point.coordinates),
          routeId: route.id,
          pointIndex: pointIndex,
          pointType: point.type,
          pointName: point.name,
        })

        // 选中路线的节点更大
        const baseRadius = point.type === 'landing' ? 10 : point.type === 'repeater' ? 8 : point.type === 'branching' ? 9 : 6
        const radius = isRouteSelected ? baseRadius + 2 : baseRadius
        // 分支器用紫色
        const pointColor = point.type === 'branching' ? '#a855f7' : (isRouteSelected ? '#ef4444' : baseColor)

        pointFeature.setStyle(new Style({
          image: new CircleStyle({
            radius: radius,
            fill: new Fill({ color: pointColor }),
            stroke: new Stroke({ color: '#fff', width: isRouteSelected ? 3 : 2 }),
          }),
          text: point.name ? new Text({
            text: point.name,
            offsetY: -(radius + 8),
            font: isRouteSelected ? 'bold 12px sans-serif' : '12px sans-serif',
            fill: new Fill({ color: point.type === 'branching' ? '#a855f7' : (isRouteSelected ? '#ef4444' : '#333') }),
            stroke: new Stroke({ color: '#fff', width: 3 }),
          }) : undefined,
        }))

        routeSource!.addFeature(pointFeature)
        
        // 如果是分支器且有分支目标，绘制分支线和分支登陆站
        if (point.type === 'branching' && (point as any).branchTo) {
          const branchTo = (point as any).branchTo
          
          // 绘制分支线（用紫色虚线）
          const branchLineFeature = new Feature({
            geometry: new LineString([
              point.coordinates,
              branchTo.coord
            ]),
            routeId: route.id,
            isBranchLine: true,
          })
          branchLineFeature.setStyle(new Style({
            stroke: new Stroke({
              color: '#a855f7',
              width: 2,
              lineDash: [6, 4],
            }),
          }))
          routeSource!.addFeature(branchLineFeature)
          
          // 绘制分支目标登陆站
          const branchStationFeature = new Feature({
            geometry: new Point(branchTo.coord),
            routeId: route.id,
            pointType: 'landing',
            pointName: branchTo.name,
            isBranchStation: true,
          })
          branchStationFeature.setStyle(new Style({
            image: new CircleStyle({
              radius: 10,
              fill: new Fill({ color: '#22c55e' }), // 登陆站绿色
              stroke: new Stroke({ color: '#fff', width: 2 }),
            }),
            text: new Text({
              text: branchTo.name,
              offsetY: -18,
              font: '12px sans-serif',
              fill: new Fill({ color: '#22c55e' }),
              stroke: new Stroke({ color: '#fff', width: 3 }),
            }),
          }))
          routeSource!.addFeature(branchStationFeature)
        }
      })
    })

    if (routes.length > 0 && routeSource.getFeatures().length > 0) {
      const extent = routeSource.getExtent()
      map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 500 })
    }
    return
  }

  // 备用：使用 monitorStore 设备数据（与实时监控页面一致）
  if (monitorStore.devices.length > 0) {
    const devices = [...monitorStore.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
    
    // 分段绘制光纤线（每段可独立选中）
    for (let i = 0; i < devices.length - 1; i++) {
      const startDevice = devices[i]
      const endDevice = devices[i + 1]
      const isSelected = selectedCableId.value === `segment-${i}`
      
      const segmentFeature = new Feature({
        geometry: new LineString([
          [startDevice.longitude, startDevice.latitude],
          [endDevice.longitude, endDevice.latitude]
        ]),
        routeId: `segment-${i}`,
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

    // 添加设备点 - 使用不同颜色的圆点区分设备类型
    // 设备类型颜色映射
    const deviceColorMap: Record<string, string> = {
      'landing': '#22c55e',       // 登陆站 - 绿色
      'LandingStation': '#22c55e',
      'repeater': '#3b82f6',      // 中继器 - 蓝色
      'Repeater': '#3b82f6',
      'amplifier_e': '#3b82f6',
      'amplifier_w': '#3b82f6',
      'bu': '#a855f7',            // 分支器 - 紫色
      'BU': '#a855f7',
      'branching': '#a855f7',
      'joint': '#f97316',         // 接头 - 橙色
      'Joint': '#f97316',
      'underwater': '#06b6d4',    // 水下站点 - 青色
      'PFE': '#06b6d4',
      'waypoint': '#6b7280',      // 航路点 - 灰色
    }
    
    // 设备类型大小映射
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

    devices.forEach((device, index) => {
      const pointFeature = new Feature({
        geometry: new Point([device.longitude, device.latitude]),
        deviceId: device.id,
        deviceType: device.type,
        deviceName: device.name,
        pointIndex: index,  // 添加 pointIndex 以支持拖拽编辑
        routeId: 'monitor-route',  // 添加 routeId 以支持编辑模式检测
      })

      // 根据设备类型设置颜色和大小
      const color = deviceColorMap[device.type] || '#6b7280'
      const radius = deviceSizeMap[device.type] || 6

      pointFeature.setStyle(new Style({
        image: new CircleStyle({
          radius: radius,
          fill: new Fill({ color: color }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
        text: new Text({
          text: device.name,
          offsetY: -(radius + 8),
          font: '11px sans-serif',
          fill: new Fill({ color: '#333' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
      }))

      routeSource!.addFeature(pointFeature)
    })

    // 缩放到路径范围
    if (routeSource.getFeatures().length > 0) {
      const extent = routeSource.getExtent()
      map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 500 })
    }
  }
}

// 监听选中路径变化，更新样式
watch(() => routeStore.selectedRoute, () => {
  if (routeSource && routeStore.paretoRoutes.length > 0) {
    drawParetoRoutes()
  }
})

// 监听 monitorStore 设备数据变化（与实时监控一致）
watch(() => monitorStore.devices.length, (newLen) => {
  if (newLen > 0) {
    console.log('monitorStore.devices changed, drawing routes:', newLen)
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
}, { immediate: true })

// 监听 paretoRoutes 变化（USE文件导入时触发）
watch(() => routeStore.paretoRoutes.length, (newLen) => {
  if (newLen > 0) {
    console.log('paretoRoutes changed, drawing routes:', newLen)
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
}, { immediate: true })

// 同步路由数据到 rplStore（供系统规划使用）
const syncRouteToRPL = () => {
  // 获取当前选中的路由（默认选中均衡路线）
  const selectedRoute = routeStore.selectedRoute || routeStore.paretoRoutes[1] || routeStore.paretoRoutes[0]
  if (!selectedRoute) return
  
  // 从器件库获取默认设备（使用放大器类型）
  const defaultAmplifier = settingsStore.amplifierTypes[0]
  const defaultBU = settingsStore.branchingUnitTypes[0]
  const defaultFiber = settingsStore.fiberTypes[0]
  
  // 将路由点转换为 RPL 记录
  const records: any[] = []
  let cumulativeLength = 0
  let repeaterIndex = 0
  let branchingIndex = 0
  
  selectedRoute.points.forEach((point, index) => {
    // 计算段长度
    let segmentLength = 0
    if (index > 0) {
      const prevPoint = selectedRoute.points[index - 1]
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
    
    if (point.type === 'landing') {
      pointType = 'landing'
    } else if (point.type === 'repeater') {
      pointType = 'repeater'
      repeaterIndex++
      // 使用设备信息中的名称，否则使用器件库放大器名称
      pointName = deviceInfo?.deviceName || (defaultAmplifier 
        ? `${defaultAmplifier.name}-${String(repeaterIndex).padStart(2, '0')}`
        : `放大器-${String(repeaterIndex).padStart(2, '0')}`)
    } else if (point.type === 'branching') {
      pointType = 'branching'
      branchingIndex++
      // 使用设备信息中的名称，否则使用器件库分支器名称
      pointName = deviceInfo?.deviceName || (defaultBU 
        ? `${defaultBU.name}-${String(branchingIndex).padStart(2, '0')}`
        : `分支器-${String(branchingIndex).padStart(2, '0')}`)
    }
    
    const record: any = {
      id: `rec-${Date.now()}-${index}`,
      sequence: index + 1,
      pointType,
      pointName,
      longitude: point.coordinates[0],
      latitude: point.coordinates[1],
      depth: 2000 + Math.random() * 2000, // 模拟水深
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
    joints: 0,
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
  
  console.log('Route synced to RPL:', tableName, 'totalLength:', cumulativeLength, 'branchingUnits:', metadata.branchingUnits)
  
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
      }
      return map[pointType] || 'underwater'
    }
    
    // 获取设备类型中文名称
    const getDeviceTypeChinese = (deviceType: string): string => {
      const map: Record<string, string> = {
        'landing': '岸上站点',
        'amplifier_e': '放大器',
        'bu': '水下分支器',
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
        })
        deviceIndex++
      }
    })
    
    // 生成光纤段
    const fibers: any[] = []
    for (let i = 0; i < devices.length - 1; i++) {
      const fromElem = devices[i]
      const toElem = devices[i + 1]
      fibers.push({
        id: `fiber-${Date.now()}-${i}`,
        name: `光纤段 F${i + 1}`,
        type: 'fiber',
        kp: fromElem.kp,
        endKp: toElem.kp,
        longitude: 0,
        latitude: 0,
        depth: 0,
        status: 'active',
        specifications: '',
        remarks: `${fromElem.name} → ${toElem.name}`,
        fromDeviceId: fromElem.id,
        toDeviceId: toElem.id,
        length: Math.abs(toElem.kp - fromElem.kp),
      })
    }
    
    const allElements = [...devices, ...fibers]
    
    // 确保有表格
    if (connectorStore.tables.length === 0) {
      connectorStore.createTable(`${routeName}-接线元`, 'route-main')
    }
    
    // 直接设置当前表格的 elements
    if (connectorStore.tables.length > 0) {
      connectorStore.tables[0].elements = allElements
      connectorStore.currentTableId = connectorStore.tables[0].id
    }
    
    // 同步到 monitorStore（实时监控面板）
    const monitorDevices = devices.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      neType: d.type,
      status: 'normal' as const,
      location: `KP${d.kp}`,
      kp: d.kp,
      sldEquipmentName: d.name,
      longitude: d.longitude,
      latitude: d.latitude,
      depth: d.depth || 0,
      inputPower: -10 + Math.random() * 2,
      outputPower: 10 + Math.random() * 2,
      pumpCurrent: 200 + Math.random() * 50,
      pfeVoltage: 12000 + Math.random() * 500,
      pfeCurrent: 1.5 + Math.random() * 0.2,
      temperature: 25 + Math.random() * 5,
    }))
    monitorStore.devices = monitorDevices
    
    console.log('Route synced to Connector:', allElements.length, 'elements, Monitor:', monitorDevices.length, 'devices')
  } catch (err) {
    console.error('syncRouteToConnector error:', err)
  }
}

// 计算两点之间的距离 (km)
const calculateDistanceFromCoords = (coord1: [number, number], coord2: [number, number]): number => {
  const R = 6371 // 地球半径 (km)
  const lat1 = coord1[1] * Math.PI / 180
  const lat2 = coord2[1] * Math.PI / 180
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  
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

  // 关闭 Pareto 分析面板（已用新组件替代）
  // appStore.setPanelVisible('paretoAnalysisPanel', false)

  // 更新状态
  isPlanning.value = false

  appStore.showNotification({ type: 'info', message: '已停止规划，路径已清除' })
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

const handleRunPlanning = () => {
  // 检查器件库是否已导入
  if (settingsStore.amplifierTypes.length === 0) {
    appStore.showNotification({ 
      type: 'warning', 
      message: '请先在工程设置 > 器件库管理 中导入器件库' 
    })
    appStore.addLog('WARN', '运行规划失败：未导入器件库（放大器类型为空）')
    return
  }
  
  const config = settingsStore.routePlanningConfig
  
  // 根据规划模式检查配置
  if (config.mode === 'multi-point') {
    // 多点规划模式：检查 waypoints 是否至少有3个有效坐标
    const validWaypoints = (config.waypoints || []).filter(
      wp => wp.lon !== 0 || wp.lat !== 0
    )
    if (validWaypoints.length < 3) {
      appStore.showNotification({ 
        type: 'warning', 
        message: '多点规划至少需要3个有效的登陆站坐标，请在工程设置中配置' 
      })
      appStore.addLog('WARN', `运行规划失败：多点规划需要至少3个坐标，当前只有${validWaypoints.length}个`)
      return
    }
  } else {
    // 点对点模式：检查起点和终点
    if (!config.isConfigured || 
        (config.startPoint.lon === 0 && config.startPoint.lat === 0) ||
        (config.endPoint.lon === 0 && config.endPoint.lat === 0)) {
      appStore.showNotification({ 
        type: 'warning', 
        message: '请先在工程设置中配置起点和终点坐标' 
      })
      appStore.addLog('WARN', '运行规划失败：未配置起点和终点')
      return
    }
  }

  let hasHeatmapData = false
  const enabledLayers: string[] = []

  const volcanoVisible = layerStore.layers.find(l => l.id === 'volcano')?.visible
  const earthquakeVisible = layerStore.layers.find(l => l.id === 'earthquake')?.visible

  if (volcanoDataLoaded && volcanoHeatmapLayer && volcanoVisible) {
    volcanoHeatmapLayer.setVisible(true)
    hasHeatmapData = true
    enabledLayers.push('火山')
  }

  if (earthquakeDataLoaded && earthquakeHeatmapLayer && earthquakeVisible) {
    earthquakeHeatmapLayer.setVisible(true)
    hasHeatmapData = true
    enabledLayers.push('地震')
  }

  // 根据工程设置生成 Pareto 路径
  routeStore.generateParetoRoutesFromSettings()

  // 在地图上绘制路径
  drawParetoRoutes()
  
  // 同步选中的路由数据到 rplStore（供系统规划使用）
  syncRouteToRPL()

  // 更新状态
  isPlanning.value = true

  // 根据规划模式生成不同的成功消息
  if (config.mode === 'multi-point') {
    const waypointCount = (config.waypoints || []).length
    const validWaypoints = (config.waypoints || []).filter(wp => wp.lon !== 0 || wp.lat !== 0)
    const stationNames = validWaypoints.map(wp => wp.name || '未命名').join(' → ')
    
    if (hasHeatmapData) {
      appStore.showNotification({ type: 'success', message: `多点规划完成，已生成 ${waypointCount} 个登陆站的分支网络路由` })
    } else {
      appStore.showNotification({ type: 'success', message: `多点规划完成，已生成 ${waypointCount} 个登陆站的分支网络路由` })
    }
    appStore.addLog('INFO', `多点规划完成: ${stationNames}，共 ${waypointCount} 个登陆站`)
  } else {
    // 点对点模式
    const startInfo = `${config.startPoint.lon.toFixed(2)},${config.startPoint.lat.toFixed(2)}`
    const endInfo = `${config.endPoint.lon.toFixed(2)},${config.endPoint.lat.toFixed(2)}`

    if (hasHeatmapData) {
      appStore.showNotification({ type: 'success', message: `规划运行完成，已生成 ${enabledLayers.join('、')} 热力图和 3 条 Pareto 路径` })
    } else {
      appStore.showNotification({ type: 'success', message: '规划运行完成，已生成 3 条 Pareto 最优路径' })
    }
    appStore.addLog('INFO', `规划运行完成: 起点(${startInfo}) → 终点(${endInfo})，生成 3 条 Pareto 路径`)
  }
}

onMounted(() => initMap())

onUnmounted(() => {
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div class="flex-1 rounded shadow-sm flex flex-col overflow-hidden" style="background-color: var(--app-card-bg);">
    <!-- 工具栏 -->
    <div class="h-12 px-4 border-b flex items-center justify-between" style="background-color: var(--app-bg-secondary); border-color: var(--app-border-color);">
      <div class="flex items-center gap-3">
        <!-- 工具模式 -->
        <div class="flex rounded-md border overflow-hidden">
          <Tooltip v-for="mode in toolModes" :key="mode.value" :content="mode.label">
            <button :class="[
              'px-3 py-1.5 text-xs flex items-center gap-1 transition-colors',
              mapStore.toolMode === mode.value
                ? 'text-white'
                : 'hover:opacity-80'
            ]" :style="mapStore.toolMode === mode.value ? { backgroundColor: 'var(--app-primary-color)' } : { backgroundColor: 'var(--app-card-bg)', color: 'var(--app-text-color)' }" @click="mapStore.setToolMode(mode.value as any)">
              <component :is="mode.icon" class="w-4 h-4" />
              {{ mode.label }}
            </button>
          </Tooltip>
        </div>

        <div class="w-px h-5" style="background-color: var(--app-border-color);" />

        <div class="flex gap-1">
          <Tooltip content="添加节点 - 点击线段添加">
            <Button 
              :variant="isEditingRoute && editMode === 'add' ? 'default' : 'outline'" 
              size="sm" 
              :disabled="!isPlanning"
              @click="setEditMode('add')"
            >
              <Plus class="w-4 h-4 mr-1" /> 添加点
            </Button>
          </Tooltip>
          <Tooltip content="删除节点 - 点击节点删除">
            <Button 
              :variant="isEditingRoute && editMode === 'delete' ? 'default' : 'outline'" 
              size="sm" 
              :disabled="!isPlanning"
              @click="setEditMode('delete')"
            >
              <Trash2 class="w-4 h-4 mr-1" /> 删除点
            </Button>
          </Tooltip>
        </div>

        <div class="w-px h-5" style="background-color: var(--app-border-color);" />

        <div class="flex gap-1">
          <Tooltip :content="mapStore.hasSelection ? '清除已选区域' : '框选区域'">
            <Button :variant="mapStore.isBoxSelecting || mapStore.hasSelection ? 'default' : 'outline'" size="sm" @click="toggleBoxSelect">
              <Square class="w-4 h-4 mr-1" /> {{ mapStore.hasSelection ? '清除选择' : '区域选择' }}
            </Button>
          </Tooltip>
          <Tooltip content="拖拽调整节点位置">
            <Button 
              :variant="isEditingRoute && editMode === 'drag' ? 'default' : 'outline'" 
              size="sm" 
              :disabled="!isPlanning"
              @click="setEditMode('drag')"
            >
              <Edit3 class="w-4 h-4 mr-1" /> 拖拽调整
            </Button>
          </Tooltip>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Tooltip :content="isPlanning ? '停止规划' : '运行规划'">
          <Button :variant="isPlanning ? 'destructive' : 'default'" size="sm" @click="togglePlanning">
            <Pause v-if="isPlanning" class="w-4 h-4 mr-1" />
            <Play v-else class="w-4 h-4 mr-1" />
            {{ isPlanning ? '停止' : '运行规划' }}
          </Button>
        </Tooltip>
        <Tooltip content="导出RPL表格">
          <Button variant="outline" size="sm" :disabled="!isPlanning" @click="appStore.openDialog('rpl-manage')">
            <FileSpreadsheet class="w-4 h-4 mr-1" /> 导出RPL
          </Button>
        </Tooltip>
      </div>
    </div>

    <!-- 地图视口 -->
    <div class="flex-1 relative overflow-hidden">
      <div ref="mapContainer" class="w-full h-full" />

      <!-- 加载状态 -->
      <div v-if="loading" class="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-3 z-50">
        <Loader2 class="w-8 h-8 text-primary animate-spin" />
        <span class="text-sm text-gray-600">正在加载 GeoTIFF 数据...</span>
      </div>

      <!-- 地图选点模式提示 -->
      <div v-if="appStore.mapSelectMode.active" 
        class="absolute top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-20 flex items-center gap-3">
        <span class="text-sm font-medium">
          请双击地图选择{{ appStore.mapSelectMode.type === 'start' ? '起点' : appStore.mapSelectMode.type === 'end' ? '终点' : '规划范围' }}坐标
        </span>
        <button @click="appStore.cancelMapSelect" class="text-white/80 hover:text-white text-xs underline">取消</button>
      </div>

      <!-- 坐标显示 -->
      <div class="absolute bottom-3 left-3 bg-white/90 px-3 py-1.5 rounded text-xs text-gray-600 shadow z-10">
        <span class="mr-4">经度: {{ coordinates.lon.toFixed(4) }}°</span>
        <span>纬度: {{ coordinates.lat.toFixed(4) }}°</span>
      </div>

      <!-- 线段 hover 提示 -->
      <div 
        v-if="segmentTooltip.visible"
        class="fixed bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg z-50 pointer-events-none text-sm"
        :style="{ left: segmentTooltip.x + 15 + 'px', top: segmentTooltip.y - 10 + 'px' }"
      >
        <div class="font-medium mb-1">右键查看线段详情</div>
        <div class="text-xs text-gray-300">
          <div>长度: {{ segmentTooltip.length.toFixed(1) }} km</div>
          <div>水深: {{ segmentTooltip.depth.toFixed(0) }} m</div>
        </div>
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
            style="background: linear-gradient(to bottom, #fff 0%, #c8c8c8 5%, #a0522d 10%, #c86432 15%, #f0c832 22%, #c8dc64 30%, #64c832 38%, #228b22 45%, #c8f0ff 46%, #96dcff 50%, #0078c8 60%, #1e3c96 75%, #0a1e64 88%, #000014 100%);" />
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

    <!-- 线段详情弹窗 -->
    <SegmentDetailDialog
      v-model:visible="showSegmentDetailDialog"
      :segment-id="currentSegment?.id || ''"
      :route-length="currentSegment?.length || 0"
      :depth="currentSegment?.depth || 1000"
      :start-lon="currentSegment?.startLon || 0"
      :start-lat="currentSegment?.startLat || 0"
      :end-lon="currentSegment?.endLon || 0"
      :end-lat="currentSegment?.endLat || 0"
      :segment-index="currentSegment?.segmentIndex || 0"
      :cable-type="currentSegment?.cableType || ''"
      :risk-level="currentSegment?.riskLevel || 'low'"
      @save="handleSegmentSave"
    />
  </div>
</template>
