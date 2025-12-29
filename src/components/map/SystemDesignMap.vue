<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import GeoTIFF from 'ol/source/GeoTIFF'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import { Style, Stroke, Icon, Text, Fill } from 'ol/style'
import { DragPan } from 'ol/interaction'
import 'ol/ol.css'

interface RoutePoint {
  id: string
  name: string
  type: string
  longitude: number
  latitude: number
  kp?: number
  [key: string]: any
}

const props = defineProps<{
  routePoints: RoutePoint[]
  selectedPointId?: string | null
  editable?: boolean
}>()

const emit = defineEmits<{
  (e: 'point-click', pointId: string): void
  (e: 'point-moved', pointId: string, longitude: number, latitude: number): void
  (e: 'line-click'): void
  (e: 'context-menu', type: 'point' | 'line', id: string | null, x: number, y: number): void
  (e: 'edit', type: 'point' | 'line', id: string | null): void
  (e: 'delete', type: 'point' | 'line', id: string | null): void
}>()

// 右键菜单状态
const contextMenu = ref<{ visible: boolean; x: number; y: number; type: 'point' | 'line'; id: string | null }>({
  visible: false, x: 0, y: 0, type: 'point', id: null
})

// 选中的线路
const selectedLine = ref(false)

const mapContainer = ref<HTMLElement | null>(null)
const coordinates = ref({ lon: 0, lat: 0 })

let map: Map | null = null
let routeSource: VectorSource | null = null
let routeLayer: VectorLayer<VectorSource> | null = null
let pointSource: VectorSource | null = null
let pointLayer: VectorLayer<VectorSource> | null = null

let isDraggingPoint = false
let selectedFeature: Feature | null = null
let dragPanInteraction: DragPan | null = null

// 根据点类型和选中状态获取图标路径
const getPointIcon = (type: string, isSelected: boolean) => {
  const suffix = isSelected ? 'select' : ''
  switch (type) {
    case 'LandingStation':
    case 'landing':
      return `/image/岸上站点${suffix}.png`
    case 'Repeater':
    case 'repeater':
    case 'ola':
      return `/image/放大器东${suffix}.png`
    case 'BU':
    case 'branching':
    case 'bu':
      return `/image/水下分支器${suffix}.png`
    case 'PFE':
    case 'pfe':
      return `/image/水下站点${suffix}.png`
    case 'joint':
    case 'equalizer':
      return `/image/水下站点${suffix}.png`
    default:
      return `/image/水下站点${suffix}.png`
  }
}

// 按 KP 排序的点列表
const sortedPoints = computed(() => {
  return [...props.routePoints].sort((a, b) => (a.kp || 0) - (b.kp || 0))
})

// 更新线路样式
const updateLineStyle = () => {
  if (!routeSource) return
  
  routeSource.getFeatures().forEach(feature => {
    feature.setStyle(new Style({
      stroke: new Stroke({
        color: selectedLine.value ? '#f59e0b' : '#3b82f6',
        width: selectedLine.value ? 5 : 3,
        lineDash: selectedLine.value ? undefined : [8, 4]
      })
    }))
  })
}

// 绘制路径线
const drawRouteLine = () => {
  if (!routeSource) return
  routeSource.clear()
  
  if (sortedPoints.value.length < 2) return
  
  const coords = sortedPoints.value.map(p => [p.longitude, p.latitude])
  
  const lineFeature = new Feature({
    geometry: new LineString(coords),
    featureType: 'route'
  })
  
  lineFeature.setStyle(new Style({
    stroke: new Stroke({
      color: selectedLine.value ? '#f59e0b' : '#3b82f6',
      width: selectedLine.value ? 5 : 3,
      lineDash: selectedLine.value ? undefined : [8, 4]
    })
  }))
  
  routeSource.addFeature(lineFeature)
}

// 绘制设备节点
const drawPoints = () => {
  if (!pointSource) return
  pointSource.clear()
  
  const source = pointSource
  
  props.routePoints.forEach(point => {
    const feature = new Feature({
      geometry: new Point([point.longitude, point.latitude]),
      pointId: point.id,
      pointName: point.name,
      pointType: point.type
    })
    
    const isSelected = point.id === props.selectedPointId
    const iconUrl = getPointIcon(point.type, isSelected)
    
    feature.setStyle(new Style({
      image: new Icon({
        src: iconUrl,
        scale: isSelected ? 0.22 : 0.18,
        anchor: [0.5, 0.5]
      }),
      text: new Text({
        text: point.name,
        offsetY: 16,
        font: isSelected ? 'bold 10px sans-serif' : '9px sans-serif',
        fill: new Fill({ color: '#374151' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        backgroundFill: isSelected ? new Fill({ color: 'rgba(59, 130, 246, 0.1)' }) : undefined,
        padding: isSelected ? [2, 4, 2, 4] : undefined
      })
    }))
    
    source.addFeature(feature)
  })
}

// 跳转到指定点
const flyToPoint = (pointId: string) => {
  if (!map) return
  
  const point = props.routePoints.find(p => p.id === pointId)
  if (!point) return
  
  map.getView().animate({
    center: [point.longitude, point.latitude],
    zoom: 6,
    duration: 800
  })
}

// 处理指针移动
const handlePointerMove = (evt: any) => {
  if (isDraggingPoint && selectedFeature) {
    const geom = selectedFeature.getGeometry() as Point
    geom.setCoordinates(evt.coordinate)
    updateRouteLineFromPoints()
  } else {
    const features = map?.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === pointLayer
    })
    
    if (features && features.length > 0) {
      const pointId = features[0].get('pointId')
      // 选中的设备显示可拖动样式
      if (pointId === props.selectedPointId) {
        mapContainer.value!.style.cursor = 'grab'
      } else {
        mapContainer.value!.style.cursor = 'pointer'
      }
    } else {
      mapContainer.value!.style.cursor = 'default'
    }
  }
}

// 处理指针按下
const handlePointerDown = (evt: any) => {
  const features = map?.getFeaturesAtPixel(evt.pixel, {
    layerFilter: layer => layer === pointLayer
  })
  
  if (features && features.length > 0) {
    const pointId = features[0].get('pointId')
    // 只有选中的设备才能拖动
    if (pointId === props.selectedPointId) {
      selectedFeature = features[0] as Feature
      isDraggingPoint = true
      mapContainer.value!.style.cursor = 'grabbing'
      
      if (dragPanInteraction) {
        dragPanInteraction.setActive(false)
      }
    }
  }
}

// 处理指针抬起
const handlePointerUp = () => {
  if (isDraggingPoint && selectedFeature) {
    const geom = selectedFeature.getGeometry() as Point
    const coords = geom.getCoordinates()
    const pointId = selectedFeature.get('pointId')
    
    if (pointId) {
      emit('point-moved', pointId, coords[0], coords[1])
    }
  }
  
  if (dragPanInteraction) {
    dragPanInteraction.setActive(true)
  }
  
  isDraggingPoint = false
  selectedFeature = null
  if (mapContainer.value) {
    mapContainer.value.style.cursor = 'default'
  }
}

// 更新路径线
const updateRouteLineFromPoints = () => {
  if (!routeSource || !pointSource) return
  
  routeSource.clear()
  
  const pointFeatures = pointSource.getFeatures()
  if (pointFeatures.length < 2) return
  
  const coords = sortedPoints.value.map(p => {
    const feature = pointFeatures.find(f => f.get('pointId') === p.id)
    if (feature) {
      return (feature.getGeometry() as Point).getCoordinates()
    }
    return [p.longitude, p.latitude]
  })
  
  const lineFeature = new Feature({
    geometry: new LineString(coords)
  })
  
  lineFeature.setStyle(new Style({
    stroke: new Stroke({
      color: '#3b82f6',
      width: 3,
      lineDash: [8, 4]
    })
  }))
  
  routeSource.addFeature(lineFeature)
}

// 初始化地图
const initMap = () => {
  if (!mapContainer.value) return
  
  // 加载 GeoTIFF 影像
  const tifFiles = ['/output2.tif']
  const rgbStyle = { color: ['array', ['band', 1], ['band', 2], ['band', 3], 1] }
  
  const geoTiffLayers = tifFiles.map((url) => {
    const source = new GeoTIFF({
      sources: [{ url }],
      normalize: true,
      wrapX: true,
    })
    return new WebGLTileLayer({ source, style: rgbStyle, visible: true, opacity: 1 })
  })
  
  routeSource = new VectorSource()
  routeLayer = new VectorLayer({
    source: routeSource,
    zIndex: 10
  })
  
  pointSource = new VectorSource()
  pointLayer = new VectorLayer({
    source: pointSource,
    zIndex: 20
  })
  
  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ 
        source: new OSM(),
        opacity: 0.5
      }),
      ...geoTiffLayers,
      routeLayer,
      pointLayer
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [127, 26],
      zoom: 4,
      minZoom: 2,
      maxZoom: 12
    })
  })
  
  // 获取 DragPan 交互
  map.getInteractions().forEach(interaction => {
    if (interaction instanceof DragPan) {
      dragPanInteraction = interaction
    }
  })
  
  // 鼠标移动显示坐标
  map.on('pointermove', (evt) => {
    coordinates.value = { lon: evt.coordinate[0], lat: evt.coordinate[1] }
    handlePointerMove(evt)
  })
  
  // 点击事件
  map.on('click', (evt) => {
    if (isDraggingPoint) return
    contextMenu.value.visible = false
    
    // 检查是否点击了设备点
    const pointFeatures = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === pointLayer
    })
    
    if (pointFeatures && pointFeatures.length > 0) {
      const pointId = pointFeatures[0].get('pointId')
      if (pointId) {
        selectedLine.value = false
        emit('point-click', pointId)
        return
      }
    }
    
    // 检查是否点击了线路
    const lineFeatures = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === routeLayer
    })
    
    if (lineFeatures && lineFeatures.length > 0) {
      selectedLine.value = true
      updateLineStyle()
      emit('line-click')
    } else {
      selectedLine.value = false
      updateLineStyle()
    }
  })
  
  // 右键事件
  mapContainer.value.addEventListener('contextmenu', (evt) => {
    evt.preventDefault()
    
    const pixel = map!.getEventPixel(evt)
    
    // 检查是否右键了设备点
    const pointFeatures = map!.getFeaturesAtPixel(pixel, {
      layerFilter: layer => layer === pointLayer
    })
    
    if (pointFeatures && pointFeatures.length > 0) {
      const pointId = pointFeatures[0].get('pointId')
      contextMenu.value = {
        visible: true,
        x: evt.clientX,
        y: evt.clientY,
        type: 'point',
        id: pointId
      }
      return
    }
    
    // 检查是否右键了线路
    const lineFeatures = map!.getFeaturesAtPixel(pixel, {
      layerFilter: layer => layer === routeLayer
    })
    
    if (lineFeatures && lineFeatures.length > 0) {
      contextMenu.value = {
        visible: true,
        x: evt.clientX,
        y: evt.clientY,
        type: 'line',
        id: null
      }
    }
  })
  
  // 拖拽事件 - 始终启用，选中后可拖动
  ;(map as any).on('pointerdown', handlePointerDown)
  ;(map as any).on('pointerup', handlePointerUp)
  
  // 绘制初始数据
  drawRouteLine()
  drawPoints()
  
  // 自适应显示
  if (props.routePoints.length > 0 && pointSource && pointSource.getFeatures().length > 0) {
    const extent = pointSource.getExtent()
    map.getView().fit(extent, { 
      padding: [80, 80, 80, 80],
      duration: 500
    })
  }
}

// 监听数据变化
watch(() => props.routePoints, () => {
  drawRouteLine()
  drawPoints()
}, { deep: true })

watch(() => props.selectedPointId, () => {
  drawPoints()
})

// editable 属性不再控制拖动，选中即可拖动

// 处理右键菜单操作
const handleEdit = () => {
  emit('edit', contextMenu.value.type, contextMenu.value.id)
  contextMenu.value.visible = false
}

const handleDelete = () => {
  emit('delete', contextMenu.value.type, contextMenu.value.id)
  contextMenu.value.visible = false
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
}

defineExpose({ flyToPoint })

onMounted(() => initMap())

onUnmounted(() => {
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div class="w-full h-full relative" @click="closeContextMenu">
    <div ref="mapContainer" class="w-full h-full" />
    
    <!-- 右键菜单 -->
    <div 
      v-if="contextMenu.visible"
      class="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[120px]"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="px-3 py-1.5 text-xs text-gray-500 border-b">
        {{ contextMenu.type === 'point' ? '设备操作' : '线路操作' }}
      </div>
      <button 
        class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        @click="handleEdit"
      >
        <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        编辑
      </button>
      <button 
        class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-red-600"
        @click="handleDelete"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        删除
      </button>
    </div>
    
    <!-- 编辑模式提示 -->
    <div v-if="editable" class="absolute top-3 left-3 bg-blue-500 text-white px-3 py-1.5 rounded text-xs shadow z-10">
      编辑模式：可拖拽调整中继器位置
    </div>
    
    <!-- 坐标显示 -->
    <div class="absolute bottom-3 left-3 bg-white/90 px-3 py-1.5 rounded text-xs text-gray-600 shadow z-10">
      <span class="mr-4">经度: {{ coordinates.lon.toFixed(4) }}°</span>
      <span>纬度: {{ coordinates.lat.toFixed(4) }}°</span>
    </div>
    
    <!-- 图例 -->
    <div class="absolute bottom-3 right-3 bg-white/95 p-3 rounded-lg shadow z-10">
      <div class="text-xs font-semibold text-gray-700 mb-2">设备图例</div>
      <div class="space-y-1.5 text-xs">
        <div class="flex items-center gap-2">
          <img src="/image/岸上站点.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">登陆站</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/放大器东.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">中继器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/水下分支器.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">分支器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/水下站点.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">供电设备</span>
        </div>
      </div>
    </div>
  </div>
</template>
