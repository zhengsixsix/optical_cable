<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Button } from '@/components/ui'
import { X, MapPin } from 'lucide-vue-next'

import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import GeoTIFF from 'ol/source/GeoTIFF'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import 'ol/ol.css'

interface Props {
  visible: boolean
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '地图选点'
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', coord: string): void
  (e: 'cancel'): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const selectedCoord = ref<{ lon: number; lat: number } | null>(null)
const hoverCoord = ref({ lon: 0, lat: 0 })

let map: Map | null = null
let markerSource: VectorSource | null = null

const destroyMap = () => {
  if (map) {
    map.setTarget(undefined)
    map = null
    markerSource = null
  }
}

const initMap = () => {
  if (!mapContainer.value) return

  // 先销毁旧地图
  destroyMap()

  markerSource = new VectorSource()

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

  // GeoTIFF图层
  const rgbStyle = { color: ['array', ['band', 1], ['band', 2], ['band', 3], 1] }
  const geoTiffSource = new GeoTIFF({
    sources: [{ url: '/output2.tif' }],
    normalize: true,
    wrapX: true,
  })
  const geoTiffLayer = new WebGLTileLayer({
    source: geoTiffSource,
    style: rgbStyle,
    visible: true,
    opacity: 1
  })

  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ source: new OSM(), opacity: 0.5 }),
      geoTiffLayer,
      markerLayer,
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [120, 30],
      zoom: 4,
    }),
  })

  map.on('pointermove', (evt) => {
    hoverCoord.value = { lon: evt.coordinate[0], lat: evt.coordinate[1] }
  })

  map.on('click', (evt) => {
    const coord = evt.coordinate
    selectedCoord.value = { lon: coord[0], lat: coord[1] }

    markerSource?.clear()
    markerSource?.addFeature(new Feature({
      geometry: new Point(coord),
    }))
  })
}

const handleConfirm = () => {
  if (selectedCoord.value) {
    const coordStr = `${selectedCoord.value.lon.toFixed(6)},${selectedCoord.value.lat.toFixed(6)}`
    emit('confirm', coordStr)
    emit('update:visible', false)
  }
}

const handleCancel = () => {
  emit('cancel')
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    selectedCoord.value = null
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
            <MapPin class="w-5 h-5 text-primary" />
            <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ title }}</h3>
          </div>
          <button @click="handleCancel" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <!-- 地图区域 -->
        <div class="flex-1 relative">
          <div ref="mapContainer" class="w-full h-full" />

          <!-- 鼠标坐标 -->
          <div
            class="absolute bottom-2 left-2 bg-white/90 dark:bg-gray-800/90 px-3 py-1 rounded text-xs text-gray-600 dark:text-gray-300 shadow">
            经度: {{ hoverCoord.lon.toFixed(4) }}°, 纬度: {{ hoverCoord.lat.toFixed(4) }}°
          </div>

          <!-- 选中提示 -->
          <div v-if="selectedCoord"
            class="absolute top-2 left-2 bg-green-500 text-white px-3 py-1 rounded text-sm shadow">
            已选择: {{ selectedCoord.lon.toFixed(4) }}°, {{ selectedCoord.lat.toFixed(4) }}°
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="flex justify-end gap-3 px-4 py-3 border-t">
          <Button variant="outline" @click="handleCancel">取消</Button>
          <Button :disabled="!selectedCoord" @click="handleConfirm">确定</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
