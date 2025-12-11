<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useMapStore, useLayerStore, useAppStore, useRouteStore } from '@/stores'
import { Button, Tooltip } from '@/components/ui'
import {
  MousePointer, Move, Pencil, Plus, Trash2, Square, Edit3,
  Play, Pause, Download, Loader2
} from 'lucide-vue-next'

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
import { DragBox } from 'ol/interaction'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import Circle from 'ol/geom/Circle'
import { Style, Stroke, Fill, Icon, Circle as CircleStyle, Text } from 'ol/style'
import Heatmap from 'ol/layer/Heatmap'
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

const emit = defineEmits<{
  (e: 'area-selected', extent: [number, number, number, number]): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
const loading = ref(true)
const coordinates = ref({ lon: 0, lat: 0 })
const isPlanning = ref(false)

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
  { value: 'draw', label: '绘制', icon: Pencil },
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
  if (mapStore.isBoxSelecting) {
    disableBoxSelect()
    appStore.showNotification({ type: 'info', message: '框选模式已关闭' })
  } else {
    enableBoxSelect()
  }
}

const handleAction = (actionName: string) => {
  appStore.showNotification({ type: 'info', message: `已执行操作: ${actionName}` })
  appStore.addLog('INFO', actionName)
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
      appStore.showNotification({ type: 'error', message: 'GeoTIFF 加载失败' })
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
      console.log('开始加载冷水珊瑚 SHP 数据...')
      // 加载 zip 文件
      const geojsonData = await shpLoader.load('/data/海草.zip')

      console.log('原始 GeoJSON 数据:', geojsonData)
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
}

// 路径颜色配置
const routeColors = ['#3b82f6', '#10b981', '#f59e0b'] // 蓝、绿、橙

// 绑制 Pareto 路径到地图
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

  const routes = routeStore.paretoRoutes

  routes.forEach((route, index) => {
    const color = routeColors[index % routeColors.length]
    const isSelected = routeStore.selectedRoute?.id === route.id

    // 提取路径坐标
    const coords = route.points.map(p => p.coordinates)

    // 创建路径线
    const lineFeature = new Feature({
      geometry: new LineString(coords),
      routeId: route.id,
      routeName: route.name,
    })

    lineFeature.setStyle(new Style({
      stroke: new Stroke({
        color: color,
        width: isSelected ? 5 : 3,
        lineDash: isSelected ? undefined : [8, 4],
      }),
    }))

    routeSource!.addFeature(lineFeature)

    // 添加路径点
    route.points.forEach((point, pointIndex) => {
      const pointFeature = new Feature({
        geometry: new Point(point.coordinates),
        routeId: route.id,
        pointType: point.type,
        pointName: point.name,
      })

      // 根据点类型设置样式
      let pointColor = color
      let radius = 6
      if (point.type === 'landing') {
        radius = 10
      } else if (point.type === 'repeater') {
        radius = 8
      }

      pointFeature.setStyle(new Style({
        image: new CircleStyle({
          radius: radius,
          fill: new Fill({ color: pointColor }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
        text: point.name ? new Text({
          text: point.name,
          offsetY: -18,
          font: '12px sans-serif',
          fill: new Fill({ color: '#333' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }) : undefined,
      }))

      routeSource!.addFeature(pointFeature)
    })
  })

  // 缩放到路径范围
  if (routes.length > 0 && routeSource.getFeatures().length > 0) {
    const extent = routeSource.getExtent()
    map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 500 })
  }
}

// 监听选中路径变化，更新样式
watch(() => routeStore.selectedRoute, () => {
  if (routeSource && routeStore.paretoRoutes.length > 0) {
    drawParetoRoutes()
  }
})

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

  // 关闭 Pareto 分析面板
  appStore.setPanelVisible('paretoAnalysisPanel', false)

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

  // 生成三条 Pareto 路径并显示分析面板
  routeStore.generateMockParetoRoutes()
  appStore.setPanelVisible('paretoAnalysisPanel', true)

  // 在地图上绘制路径
  drawParetoRoutes()

  // 更新状态
  isPlanning.value = true

  if (hasHeatmapData) {
    appStore.showNotification({ type: 'success', message: `规划运行完成，已生成 ${enabledLayers.join('、')} 热力图和 3 条 Pareto 路径` })
    appStore.addLog('INFO', `规划运行完成: ${enabledLayers.join(', ')}，生成 3 条 Pareto 路径`)
  } else {
    appStore.showNotification({ type: 'success', message: '规划运行完成，已生成 3 条 Pareto 最优路径' })
    appStore.addLog('INFO', '规划运行完成，生成 3 条 Pareto 路径')
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
  <div class="flex-1 bg-white rounded shadow-sm flex flex-col overflow-hidden">
    <!-- 工具栏 -->
    <div class="h-12 px-4 bg-gradient-to-b from-white to-gray-50 border-b flex items-center justify-between">
      <div class="flex items-center gap-3">
        <!-- 工具模式 -->
        <div class="flex rounded-md border overflow-hidden">
          <Tooltip v-for="mode in toolModes" :key="mode.value" :content="mode.label">
            <button :class="[
              'px-3 py-1.5 text-xs flex items-center gap-1 transition-colors',
              mapStore.toolMode === mode.value
                ? 'bg-primary text-white'
                : 'bg-white hover:bg-gray-100'
            ]" @click="mapStore.setToolMode(mode.value as any)">
              <component :is="mode.icon" class="w-4 h-4" />
              {{ mode.label }}
            </button>
          </Tooltip>
        </div>

        <div class="w-px h-5 bg-gray-300" />

        <div class="flex gap-1">
          <Tooltip content="添加节点">
            <Button variant="outline" size="sm" @click="handleAction('添加节点')">
              <Plus class="w-4 h-4 mr-1" /> 添加点
            </Button>
          </Tooltip>
          <Tooltip content="删除节点">
            <Button variant="outline" size="sm" @click="handleAction('删除节点')">
              <Trash2 class="w-4 h-4 mr-1" /> 删除点
            </Button>
          </Tooltip>
        </div>

        <div class="w-px h-5 bg-gray-300" />

        <div class="flex gap-1">
          <Tooltip content="框选区域">
            <Button :variant="mapStore.isBoxSelecting ? 'default' : 'outline'" size="sm" @click="toggleBoxSelect">
              <Square class="w-4 h-4 mr-1" /> 区域选择
            </Button>
          </Tooltip>
          <Tooltip content="路径调整">
            <Button variant="outline" size="sm" @click="handleAction('路径调整')">
              <Edit3 class="w-4 h-4 mr-1" /> 路径调整
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
        <Tooltip content="导出RPL">
          <Button variant="outline" size="sm" @click="handleAction('导出RPL')">
            <Download class="w-4 h-4 mr-1" /> 导出RPL
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

      <!-- 坐标显示 -->
      <div class="absolute bottom-3 left-3 bg-white/90 px-3 py-1.5 rounded text-xs text-gray-600 shadow z-10">
        <span class="mr-4">经度: {{ coordinates.lon.toFixed(4) }}°</span>
        <span>纬度: {{ coordinates.lat.toFixed(4) }}°</span>
      </div>

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
  </div>
</template>
