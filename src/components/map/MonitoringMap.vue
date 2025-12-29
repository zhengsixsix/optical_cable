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
import 'ol/ol.css'

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
}>()

const mapContainer = ref<HTMLElement | null>(null)
const coordinates = ref({ lon: 0, lat: 0 })

let map: Map | null = null
let deviceSource: VectorSource | null = null
let deviceLayer: VectorLayer<VectorSource> | null = null
let cableSource: VectorSource | null = null
let cableLayer: VectorLayer<VectorSource> | null = null

// 根据设备类型和状态获取图标路径
const getDeviceIcon = (device: MonitorDevice) => {
  const hasAlarm = device.status === 'warning' || device.status === 'error'
  const suffix = hasAlarm ? 'select' : ''
  
  switch (device.type) {
    case 'LandingStation':
      return `/image/岸上站点${suffix}.png`
    case 'Repeater':
      // 根据经度判断东西方向
      return device.longitude > 127 
        ? `/image/放大器东${suffix}.png` 
        : `/image/放大器西${suffix}.png`
    case 'BU':
      return `/image/水下分支器${suffix}.png`
    case 'PFE':
      return `/image/水下站点${suffix}.png`
    default:
      return `/image/水下站点${suffix}.png`
  }
}

// 按 KP 排序的设备列表
const sortedDevices = computed(() => {
  return [...props.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
})

// 绘制光缆线路
const drawCableLine = () => {
  if (!cableSource) return
  cableSource.clear()
  
  if (sortedDevices.value.length < 2) return
  
  // 创建线路坐标
  const coords = sortedDevices.value.map(d => [d.longitude, d.latitude])
  
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
  
  cableSource.addFeature(lineFeature)
}

// 绘制设备节点
const drawDevices = () => {
  if (!deviceSource) return
  deviceSource.clear()
  
  const source = deviceSource
  
  props.devices.forEach(device => {
    const feature = new Feature({
      geometry: new Point([device.longitude, device.latitude]),
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      deviceStatus: device.status
    })
    
    const isSelected = device.id === props.selectedDeviceId
    const iconUrl = getDeviceIcon(device)
    
    feature.setStyle(new Style({
      image: new Icon({
        src: iconUrl,
        scale: isSelected ? 0.22 : 0.18,
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
        source: new OSM(),
        opacity: 0.5
      }),
      ...geoTiffLayers,
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
    coordinates.value = { lon: evt.coordinate[0], lat: evt.coordinate[1] }
    
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
  
  // 点击设备
  map.on('click', (evt) => {
    const features = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === deviceLayer
    })
    
    if (features && features.length > 0) {
      const deviceId = features[0].get('deviceId')
      if (deviceId) {
        emit('device-click', deviceId)
      }
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

// 监听选中设备变化
watch(() => props.selectedDeviceId, (newId) => {
  drawDevices()
  if (newId) {
    flyToDevice(newId)
  }
})

// 暴露方法供父组件调用
defineExpose({
  flyToDevice
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
          <img src="/image/岸上站点.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">岸上站点</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/放大器东.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">中继器/放大器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/水下分支器.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">水下分支器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/水下站点.png" class="w-5 h-5 object-contain" />
          <span class="text-gray-600">水下站点</span>
        </div>
        <div class="border-t pt-1.5 mt-1.5">
          <div class="flex items-center gap-2">
            <img src="/image/岸上站点select.png" class="w-5 h-5 object-contain" />
            <span class="text-orange-600">告警状态</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
