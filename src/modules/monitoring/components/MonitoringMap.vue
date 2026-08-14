<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouteStore } from '@/stores/route'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { createBaseTileSource } from '@/utils/mapTileSource'
import { normalizeLonLatCoordinate } from '@/utils/mapProjection'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import { Style, Stroke, Icon, Text, Fill, Circle as CircleStyle } from 'ol/style'
import Overlay from 'ol/Overlay'
import 'ol/ol.css'

const routeStore = useRouteStore()

interface MonitorDevice {
  id: string
  name: string
  type: string
  neType: string
  status: string
  location: string
  longitude: number
  latitude: number
  kp?: number
  [key: string]: any
}

const props = defineProps<{
  devices: MonitorDevice[]
  selectedDeviceId?: string | null
}>()

const emit = defineEmits<{
  (e: 'device-click', deviceId: string): void
  (e: 'cable-click'): void
  (e: 'segment-click', segmentIndex: number): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const popupContainer = ref<HTMLElement | null>(null)
const coordinates = ref({ lon: 0, lat: 0 })

// 气泡框状态
const popupVisible = ref(false)
const popupDevice = ref<MonitorDevice | null>(null)

// 更新光纤线样式（根据选中的线段索引更新样式）
const updateCableStyle = () => {
  if (!cableSource) return
  
  cableSource.getFeatures().forEach(feature => {
    const segmentIndex = feature.get('segmentIndex')
    const isSelected = segmentIndex === selectedSegmentIndex.value
    feature.setStyle(new Style({
      stroke: new Stroke({
        color: isSelected ? '#f59e0b' : '#3b82f6',
        width: isSelected ? 5 : 3,
        lineDash: isSelected ? undefined : [8, 4]
      })
    }))
  })
}

let map: Map | null = null
let popup: Overlay | null = null
let deviceSource: VectorSource | null = null
let deviceLayer: VectorLayer<VectorSource> | null = null
let cableSource: VectorSource | null = null
let cableLayer: VectorLayer<VectorSource> | null = null

const compactDeviceZoom = 5

// 根据设备类型和状态获取图标路径
const getDeviceIcon = (device: MonitorDevice) => {
  const hasAlarm = device.status === 'warning' || device.status === 'error'
  const suffix = hasAlarm ? '-select' : ''
  
  switch (device.type) {
    case 'landing':
    case 'LandingStation':
      return `/image/landing${suffix}.png`
    case 'amplifier_e':
      return `/image/amplifier-e${suffix}.png`
    case 'amplifier_w':
      return `/image/amplifier-w${suffix}.png`
    case 'Repeater':
      return `/image/amplifier-e${suffix}.png`
    case 'ola':
      return `/image/amplifier-e${suffix}.png`
    case 'bu':
    case 'BU':
      return `/image/bu${suffix}.png`
    case 'equalizer':
      return `/image/equalizer${suffix}.svg`
    case 'joint':
      return `/image/joint${suffix}.svg`
    case 'underwater':
    case 'PFE':
      return `/image/underwater${suffix}.png`
    default:
      return `/image/underwater${suffix}.png`
  }
}

const getDeviceIconScale = (type: string, isSelected: boolean) => {
  const base = type === 'equalizer' || type === 'joint' ? 0.24 : 0.18
  return isSelected ? base + 0.04 : base
}

const getCompactDeviceColor = (status: string) => {
  if (status === 'normal') return '#16a34a'
  if (status === 'warning') return '#eab308'
  return '#dc2626'
}

// 按 KP 排序的设备列表
const sortedDevices = computed(() => {
  return [...props.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
})

// 选中的线段索引
const selectedSegmentIndex = ref<number>(-1)

// 绘制光缆线路 —— 优先使用 routeStore 中的实际路由数据
const drawCableLine = () => {
  if (!cableSource) return
  cableSource.clear()
  
  const selectedRoute = routeStore.selectedRoute
  
  // ★ 优先使用后端路由数据绘制（与系统规划展示一致）
  if (selectedRoute && selectedRoute.segments && selectedRoute.segments.length > 0) {
    // 构建点坐标映射
    const pointMap: Record<string, [number, number]> = {}
    for (const p of selectedRoute.points) {
      pointMap[p.id] = p.coordinates
    }
    
    // 按 segment 绘制线路
    selectedRoute.segments.forEach((segment, i) => {
      const startCoords = pointMap[segment.startPointId]
      const endCoords = pointMap[segment.endPointId]
      if (!startCoords || !endCoords) return
      
      const isSelected = selectedSegmentIndex.value === i
      const segmentFeature = new Feature({
        geometry: new LineString([startCoords, endCoords]),
        segmentIndex: i,
        fromId: segment.startPointId,
        toId: segment.endPointId
      })
      
      segmentFeature.setStyle(new Style({
        stroke: new Stroke({
          color: isSelected ? '#f59e0b' : '#3b82f6',
          width: isSelected ? 5 : 3,
          lineDash: isSelected ? undefined : [8, 4]
        })
      }))
      
      cableSource!.addFeature(segmentFeature)
    })
    return
  }
  
  // 回退：如果没有路由数据，按设备 KP 顺序连线
  if (sortedDevices.value.length < 2) return
  
  for (let i = 0; i < sortedDevices.value.length - 1; i++) {
    const startDevice = sortedDevices.value[i]
    const endDevice = sortedDevices.value[i + 1]
    const isSelected = selectedSegmentIndex.value === i
    
    const segmentFeature = new Feature({
      geometry: new LineString([
        [startDevice.longitude, startDevice.latitude],
        [endDevice.longitude, endDevice.latitude]
      ]),
      segmentIndex: i,
      fromId: startDevice.id,
      toId: endDevice.id
    })
    
    segmentFeature.setStyle(new Style({
      stroke: new Stroke({
        color: isSelected ? '#f59e0b' : '#3b82f6',
        width: isSelected ? 5 : 3,
        lineDash: isSelected ? undefined : [8, 4]
      })
    }))
    
    cableSource.addFeature(segmentFeature)
  }
}

// 绘制设备节点
const drawDevices = () => {
  if (!deviceSource) return
  deviceSource.clear()
  
  const source = deviceSource
  const currentZoom = map?.getView().getZoom() ?? compactDeviceZoom
  const useCompactDevices = currentZoom < compactDeviceZoom
  
  props.devices.forEach(device => {
    const feature = new Feature({
      geometry: new Point([device.longitude, device.latitude]),
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      deviceStatus: device.status
    })
    
    const isSelected = device.id === props.selectedDeviceId
    
    if (useCompactDevices) {
      feature.setStyle(new Style({
        image: new CircleStyle({
          radius: isSelected ? 6 : 4,
          fill: new Fill({ color: getCompactDeviceColor(device.status) }),
          stroke: new Stroke({ color: '#fff', width: isSelected ? 2 : 1.5 }),
        }),
      }))
    } else {
      const iconUrl = getDeviceIcon(device)
      
      feature.setStyle(new Style({
        image: new Icon({
          src: iconUrl,
          scale: getDeviceIconScale(device.type, isSelected),
          anchor: [0.5, 0.5]
        }),
        text: new Text({
          text: device.name,
          offsetY: 16,
          font: isSelected ? 'bold 10px sans-serif' : '9px sans-serif',
          fill: new Fill({ 
            color: device.status === 'normal' ? '#374151' : 
                   device.status === 'warning' ? '#d97706' : '#dc2626'
          }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
          backgroundFill: isSelected ? new Fill({ color: 'rgba(59, 130, 246, 0.1)' }) : undefined,
          padding: isSelected ? [2, 4, 2, 4] : undefined
        })
      }))
    }
    
    source.addFeature(feature)
  })
}

// 跳转到指定设备
const flyToDevice = (deviceId: string) => {
  if (!map) return
  
  const device = props.devices.find(d => d.id === deviceId)
  if (!device) return
  
  const view = map.getView()
  view.animate({
    center: [device.longitude, device.latitude],
    zoom: 6,
    duration: 800
  })
}

// 初始化地图
const initMap = () => {
  if (!mapContainer.value) return
  
  // 加载 GeoTIFF 影像
  
  // 创建光缆图层
  cableSource = new VectorSource()
  cableLayer = new VectorLayer({
    source: cableSource,
    zIndex: 10
  })
  
  // 创建设备图层
  deviceSource = new VectorSource()
  deviceLayer = new VectorLayer({
    source: deviceSource,
    zIndex: 20
  })
  
  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ 
        source: createBaseTileSource(),
        opacity: 1
      }),
      cableLayer,
      deviceLayer
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [127, 26],
      zoom: 4,
      minZoom: 2,
      maxZoom: 12
    })
  })
  
  // 鼠标移动显示坐标
  map.on('pointermove', (evt) => {
    const [lon, lat] = normalizeLonLatCoordinate(evt.coordinate as [number, number])
    coordinates.value = { lon, lat }
    
    // 检测是否悬停在设备上
    const features = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === deviceLayer
    })
    
    if (features && features.length > 0) {
      mapContainer.value!.style.cursor = 'pointer'
    } else {
      mapContainer.value!.style.cursor = 'default'
    }
  })

  map.getView().on('change:resolution', () => {
    drawDevices()
  })
  
  // 创建气泡框Overlay
  popup = new Overlay({
    element: popupContainer.value!,
    positioning: 'bottom-center',
    offset: [0, -15],
    autoPan: {
      animation: {
        duration: 250
      }
    }
  })
  map.addOverlay(popup)
  
  // 点击设备或光纤线
  map.on('click', (evt) => {
    // 先检查是否点击了设备
    const deviceFeatures = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === deviceLayer
    })
    
    if (deviceFeatures && deviceFeatures.length > 0) {
      const deviceId = deviceFeatures[0].get('deviceId')
      if (deviceId) {
        const device = props.devices.find(d => d.id === deviceId)
        if (device) {
          popupDevice.value = device
          popupVisible.value = true
          popup?.setPosition([device.longitude, device.latitude])
          emit('device-click', deviceId)
          selectedSegmentIndex.value = -1
          updateCableStyle()
        }
      }
      return
    }
    
    // 检查是否点击了光纤线段
    const cableFeatures = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === cableLayer
    })
    
    if (cableFeatures && cableFeatures.length > 0) {
      const segmentIndex = cableFeatures[0].get('segmentIndex')
      if (segmentIndex !== undefined) {
        selectedSegmentIndex.value = segmentIndex
        updateCableStyle()
        closePopup()
        emit('segment-click', segmentIndex)
      }
    } else {
      selectedSegmentIndex.value = -1
      updateCableStyle()
      closePopup()
    }
  })
  
  // 绘制初始数据
  drawCableLine()
  drawDevices()
  
  // 自适应显示所有设备
  if (props.devices.length > 0 && deviceSource && deviceSource.getFeatures().length > 0) {
    const extent = deviceSource.getExtent()
    map.getView().fit(extent, { 
      padding: [80, 80, 80, 80],
      duration: 500
    })
  }
}

// 监听设备数据变化
watch(() => props.devices, () => {
  drawCableLine()
  drawDevices()
}, { deep: true })

// 监听路由数据变化（后端路由加载后重新绘制线路）
watch(() => routeStore.selectedRoute, () => {
  drawCableLine()
}, { deep: true })

// 监听选中设备变化
watch(() => props.selectedDeviceId, (newId) => {
  drawDevices()
  if (newId) {
    flyToDevice(newId)
  }
})

// 关闭气泡框
const closePopup = () => {
  popupVisible.value = false
  popupDevice.value = null
  popup?.setPosition(undefined)
}

const getStatusColor = (status: string) => {
  if (status === 'normal') return 'text-green-600'
  if (status === 'warning') return 'text-yellow-600'
  return 'text-red-600'
}

// 获取状态文本
const getStatusText = (status: string) => {
  if (status === 'normal') return '正常'
  if (status === 'warning') return '告警'
  return '故障'
}

// 暴露方法供父组件调用
defineExpose({
  flyToDevice,
  closePopup
})

onMounted(() => initMap())

onUnmounted(() => {
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div class="w-full h-full relative">
    <div ref="mapContainer" class="w-full h-full" />
    
    <!-- 设备信息预览窗口 (图5样式) -->
    <div ref="popupContainer" class="popup-container" v-show="popupVisible && popupDevice">
      <div class="bg-white rounded-lg shadow-xl border border-gray-200 min-w-[220px] max-w-[260px]">
        <!-- 头部: 设备名称 -->
        <div class="px-4 py-3 border-b flex items-center justify-between bg-gray-50 rounded-t-lg">
          <span class="font-bold text-gray-800 text-sm">{{ popupDevice?.name }}</span>
          <button @click="closePopup" class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        
        <!-- 内容 -->
        <div class="px-4 py-3 space-y-2">
          <!-- 类型 -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500">类型：</span>
            <span class="text-xs text-gray-700">{{ popupDevice?.neType || popupDevice?.type }}</span>
          </div>
          
          <!-- 状态 -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500">状态：</span>
            <span class="flex items-center gap-1.5">
              <span :class="['w-2 h-2 rounded-full', popupDevice?.status === 'normal' ? 'bg-green-500' : popupDevice?.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500']"></span>
              <span :class="['text-xs font-medium', getStatusColor(popupDevice?.status || '')]">
                {{ getStatusText(popupDevice?.status || '') }}
              </span>
            </span>
          </div>
        </div>
        
        <!-- 气泡框箭头 -->
        <div class="popup-arrow"></div>
      </div>
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
          <img src="/image/landing.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">岸上站点</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/amplifier-e.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">放大器/放大器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/bu.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">水下分支器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/underwater.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">水下站点</span>
        </div>
        <div class="border-t pt-1.5 mt-1.5">
          <div class="flex items-center gap-2">
            <img src="/image/landing-select.png" class="w-5 h-5 object-contain" />
            <span class="text-orange-600">告警状态</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-container {
  position: relative;
}

.popup-arrow {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid white;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1));
}
</style>
