<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { Button } from '@/shared/components/base'
import { X, MapPin, Square } from 'lucide-vue-next'

import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import { Style, Fill, Stroke, Circle as CircleStyle, Text } from 'ol/style'
import { DragBox } from 'ol/interaction'
import { platformModifierKeyOnly } from 'ol/events/condition'
import { boundingExtent } from 'ol/extent'
import 'ol/ol.css'

// 已有标记点（在地图上显示已配置的站点/BU）
export interface MapMarker {
  lon: number
  lat: number
  name: string
  color?: string  // 默认 '#6366f1'
}

interface Props {
  visible: boolean
  title?: string
  mode?: 'point' | 'range'  // 选点模式 或 框选范围模式
  existingMarkers?: MapMarker[]  // 已有标记点
}

const props = withDefaults(defineProps<Props>(), {
  title: '地图选点',
  mode: 'point',
  existingMarkers: () => []
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', coord: string): void
  (e: 'cancel'): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const selectedCoord = ref<{ lon: number; lat: number } | null>(null)
const selectedRange = ref<{ nwLon: number; nwLat: number; seLon: number; seLat: number } | null>(null)
const hoverCoord = ref({ lon: 0, lat: 0 })
const isDrawing = ref(false)
const drawStartCoord = ref<{ lon: number; lat: number } | null>(null)

let map: Map | null = null
let markerSource: VectorSource | null = null
let boxSource: VectorSource | null = null
let existingMarkerSource: VectorSource | null = null

const destroyMap = () => {
  if (map) {
    map.setTarget(undefined)
    map = null
    markerSource = null
    boxSource = null
    existingMarkerSource = null
  }
}

const initMap = () => {
  if (!mapContainer.value) return

  // 先销毁旧地图
  destroyMap()

  markerSource = new VectorSource()
  boxSource = new VectorSource()
  existingMarkerSource = new VectorSource()

  // 已有标记点图层 — 每个 feature 带独立样式
  const existingMarkerLayer = new VectorLayer({
    source: existingMarkerSource,
    zIndex: 90,
  })

  const markerLayer = new VectorLayer({
    source: markerSource,
    style: new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: '#ef4444' }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
    }),
    zIndex: 100,
  })

  // 框选范围图层
  const boxLayer = new VectorLayer({
    source: boxSource,
    style: new Style({
      fill: new Fill({ color: 'rgba(59, 130, 246, 0.2)' }),
      stroke: new Stroke({ color: '#3b82f6', width: 2 }),
    }),
    zIndex: 99,
  })

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ source: new OSM() }),
      existingMarkerLayer,
      boxLayer,
      markerLayer,
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [120, 30],
      zoom: 4,
    }),
  })

  // 添加已有标记并自动缩放视图
  if (props.existingMarkers.length > 0) {
    const coords: [number, number][] = []
    for (const m of props.existingMarkers) {
      const feat = new Feature({ geometry: new Point([m.lon, m.lat]) })
      const c = m.color || '#6366f1'
      feat.setStyle(new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: c }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
        text: new Text({
          text: m.name,
          offsetY: -16,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: c }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
      }))
      existingMarkerSource!.addFeature(feat)
      coords.push([m.lon, m.lat])
    }
    // 自动缩放到所有标记点
    if (coords.length >= 2) {
      const ext = boundingExtent(coords)
      map.getView().fit(ext, { padding: [60, 60, 60, 60], maxZoom: 8 })
    } else {
      map.getView().setCenter(coords[0])
      map.getView().setZoom(6)
    }
  }

  map.on('pointermove', (evt) => {
    hoverCoord.value = { lon: evt.coordinate[0], lat: evt.coordinate[1] }
    
    // 框选模式下，实时绘制矩形
    if (props.mode === 'range' && isDrawing.value && drawStartCoord.value) {
      drawBox(drawStartCoord.value, hoverCoord.value)
    }
  })

  map.on('click', (evt) => {
    const coord = evt.coordinate
    
    if (props.mode === 'point') {
      // 选点模式
      selectedCoord.value = { lon: coord[0], lat: coord[1] }
      markerSource?.clear()
      markerSource?.addFeature(new Feature({
        geometry: new Point(coord),
      }))
    } else {
      // 框选模式
      if (!isDrawing.value) {
        // 开始框选
        isDrawing.value = true
        drawStartCoord.value = { lon: coord[0], lat: coord[1] }
        selectedRange.value = null
        boxSource?.clear()
      } else {
        // 结束框选
        isDrawing.value = false
        const endCoord = { lon: coord[0], lat: coord[1] }
        if (drawStartCoord.value) {
          // 计算西北角和东南角
          const nwLon = Math.min(drawStartCoord.value.lon, endCoord.lon)
          const nwLat = Math.max(drawStartCoord.value.lat, endCoord.lat)
          const seLon = Math.max(drawStartCoord.value.lon, endCoord.lon)
          const seLat = Math.min(drawStartCoord.value.lat, endCoord.lat)
          selectedRange.value = { nwLon, nwLat, seLon, seLat }
          drawBox(drawStartCoord.value, endCoord)
        }
        drawStartCoord.value = null
      }
    }
  })
}

// 绘制矩形框
const drawBox = (start: { lon: number; lat: number }, end: { lon: number; lat: number }) => {
  boxSource?.clear()
  const coordinates = [
    [
      [start.lon, start.lat],
      [end.lon, start.lat],
      [end.lon, end.lat],
      [start.lon, end.lat],
      [start.lon, start.lat]
    ]
  ]
  boxSource?.addFeature(new Feature({
    geometry: new Polygon(coordinates)
  }))
}

const handleConfirm = () => {
  if (props.mode === 'point' && selectedCoord.value) {
    const coordStr = `${selectedCoord.value.lon.toFixed(6)},${selectedCoord.value.lat.toFixed(6)}`
    emit('confirm', coordStr)
    emit('update:visible', false)
  } else if (props.mode === 'range' && selectedRange.value) {
    // 返回格式: nwLon,nwLat,seLon,seLat
    const coordStr = `${selectedRange.value.nwLon.toFixed(6)},${selectedRange.value.nwLat.toFixed(6)},${selectedRange.value.seLon.toFixed(6)},${selectedRange.value.seLat.toFixed(6)}`
    emit('confirm', coordStr)
    emit('update:visible', false)
  }
}

const hasSelection = computed(() => {
  if (props.mode === 'point') return !!selectedCoord.value
  return !!selectedRange.value
})

const handleCancel = () => {
  emit('cancel')
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    selectedCoord.value = null
    selectedRange.value = null
    isDrawing.value = false
    drawStartCoord.value = null
    setTimeout(() => {
      initMap()
      map?.updateSize()
    }, 100)
  } else {
    destroyMap()
  }
})

onUnmounted(() => {
  destroyMap()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="handleCancel" />
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[700px] h-[500px] flex flex-col">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <div class="flex items-center gap-2">
            <component :is="mode === 'range' ? Square : MapPin" class="w-5 h-5 text-primary" />
            <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ title }}</h3>
          </div>
          <button @click="handleCancel" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <!-- 地图区域 -->
        <div class="flex-1 relative">
          <div ref="mapContainer" class="w-full h-full" :class="mode === 'range' ? 'cursor-crosshair' : ''" />

          <!-- 鼠标坐标 -->
          <div
            class="absolute bottom-2 left-2 bg-white/90 dark:bg-gray-800/90 px-3 py-1 rounded text-xs text-gray-600 dark:text-gray-300 shadow">
            经度: {{ hoverCoord.lon.toFixed(4) }}°, 纬度: {{ hoverCoord.lat.toFixed(4) }}°
          </div>

          <!-- 选点模式 - 选中提示 -->
          <div v-if="mode === 'point' && selectedCoord"
            class="absolute top-2 left-2 bg-green-500 text-white px-3 py-1 rounded text-sm shadow">
            已选择: {{ selectedCoord.lon.toFixed(4) }}°, {{ selectedCoord.lat.toFixed(4) }}°
          </div>

          <!-- 框选模式 - 操作提示 -->
          <div v-if="mode === 'range' && !isDrawing && !selectedRange"
            class="absolute top-2 left-2 bg-blue-500 text-white px-3 py-1 rounded text-sm shadow">
            📌 点击地图设置起始角
          </div>
          <div v-if="mode === 'range' && isDrawing"
            class="absolute top-2 left-2 bg-orange-500 text-white px-3 py-1 rounded text-sm shadow animate-pulse">
            📌 拖动鼠标，点击设置结束角
          </div>
          <div v-if="mode === 'range' && selectedRange"
            class="absolute top-2 left-2 bg-green-500 text-white px-3 py-2 rounded text-sm shadow">
            <div class="font-medium mb-1">✅ 已框选范围</div>
            <div class="text-xs opacity-90">
              西北角: {{ selectedRange.nwLon.toFixed(4) }}°, {{ selectedRange.nwLat.toFixed(4) }}°<br/>
              东南角: {{ selectedRange.seLon.toFixed(4) }}°, {{ selectedRange.seLat.toFixed(4) }}°
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="flex justify-end gap-3 px-4 py-3 border-t">
          <Button variant="outline" @click="handleCancel">取消</Button>
          <Button :disabled="!hasSelection" @click="handleConfirm">确定</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
