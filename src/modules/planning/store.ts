import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logger } from '@/shared/utils'
import { getDataSource } from '@/core/data'

/**
 * 路由规划模块 Store
 * 合并原 route + layer store，管理路由规划相关的所有状态
 */

// 路由点类型
export interface RoutePoint {
  id: string
  coordinates: [number, number]
  type: 'landing' | 'waypoint' | 'repeater' | 'branching'
  name?: string
}

// 路由段类型
export interface RouteSegment {
  id: string
  startPointId: string
  endPointId: string
  length: number
  depth: number
  cableType: string
  riskLevel: 'low' | 'medium' | 'high'
  cost: number
}

// 路由类型
export interface Route {
  id: string
  name: string
  points: RoutePoint[]
  segments: RouteSegment[]
  totalLength: number
  totalCost: number
  riskScore: number
  cost: {
    cable: number
    installation: number
    equipment: number
    total: number
  }
  risk: {
    seismic: number
    volcanic: number
    depth: number
    overall: number
  }
  distance: number
  createdAt: Date
  updatedAt: Date
}

// 图层配置
export interface LayerConfig {
  id: string
  name: string
  type: 'vector' | 'raster' | 'heatmap' | 'point' | 'both'
  visible: boolean
  loaded: boolean
  loading: boolean
  error?: boolean
}

// 悬停线段信息
export interface HoveredSegmentInfo {
  id: string
  routeId: string
  startPoint: { lon: number; lat: number; name?: string }
  endPoint: { lon: number; lat: number; name?: string }
  length: number
  depth: number
  cableType: string
  riskLevel: string
}

// 面板可见性
export interface PlanningPanelVisibility {
  layerInfo: boolean
  routeStats: boolean
  depthProfile: boolean
  terrain3D: boolean
  logPanel: boolean
  paretoPanel: boolean
}

export const usePlanningStore = defineStore('planning', () => {
  // ==================== 路由状态 ====================
  const routes = ref<Route[]>([])
  const currentRouteId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)
  const paretoRoutes = ref<Route[]>([])
  const selectedRouteIds = ref<string[]>([])

  // 悬停/选中线段状态
  const hoveredSegmentInfo = ref<HoveredSegmentInfo | null>(null)
  const selectedSegmentInfo = ref<HoveredSegmentInfo | null>(null)

  // ==================== 图层状态 ====================
  const layers = ref<LayerConfig[]>([
    { id: 'volcano', name: '火山区域', type: 'both', visible: false, loaded: false, loading: false },
    { id: 'earthquake', name: '地震活动', type: 'both', visible: false, loaded: false, loading: false },
    { id: 'elevation', name: '海洋高程', type: 'raster', visible: true, loaded: true, loading: false },
    { id: 'slope', name: '海洋坡度', type: 'heatmap', visible: false, loaded: false, loading: false },
    { id: 'fishing', name: '海洋渔区分布', type: 'point', visible: false, loaded: false, loading: false },
    { id: 'shipping', name: '航道分布', type: 'vector', visible: false, loaded: false, loading: false },
    { id: 'coldCoral', name: '冷水珊瑚', type: 'vector', visible: false, loaded: false, loading: false },
  ])

  // ==================== 面板状态 ====================
  const panelVisibility = ref<PlanningPanelVisibility>({
    layerInfo: true,
    routeStats: true,
    depthProfile: true,
    terrain3D: true,
    logPanel: true,
    paretoPanel: false,
  })

  // ==================== 计算属性 ====================
  const currentRoute = computed(() =>
    routes.value.find(r => r.id === currentRouteId.value) || null
  )

  const selectedRoute = computed(() => currentRoute.value)

  const selectedSegment = computed(() => {
    if (!currentRoute.value || !selectedSegmentId.value) return null
    return currentRoute.value.segments.find(s => s.id === selectedSegmentId.value) || null
  })

  const visibleLayers = computed(() => layers.value.filter(l => l.visible))
  const loadedLayers = computed(() => layers.value.filter(l => l.loaded))

  // ==================== 路由操作 ====================
  function selectRoute(routeId: string | null) {
    currentRouteId.value = routeId
    selectedSegmentId.value = null
    if (routeId) {
      logger.info(`选中路由: ${routeId}`)
    }
  }

  function selectSegment(segmentId: string | null) {
    selectedSegmentId.value = segmentId
  }

  function setHoveredSegment(segmentInfo: HoveredSegmentInfo | null) {
    hoveredSegmentInfo.value = segmentInfo
  }

  function setSelectedSegmentInfo(segmentInfo: HoveredSegmentInfo | null) {
    selectedSegmentInfo.value = segmentInfo
  }

  function toggleRouteSelection(routeId: string) {
    const index = selectedRouteIds.value.indexOf(routeId)
    if (index > -1) {
      selectedRouteIds.value.splice(index, 1)
    } else {
      selectedRouteIds.value.push(routeId)
    }
  }

  function selectAllRoutes(select: boolean) {
    if (select) {
      selectedRouteIds.value = paretoRoutes.value.map(r => r.id)
    } else {
      selectedRouteIds.value = []
    }
  }

  function isRouteSelected(routeId: string): boolean {
    return selectedRouteIds.value.includes(routeId)
  }

  function clearRoutes() {
    routes.value = []
    paretoRoutes.value = []
    currentRouteId.value = null
    selectedRouteIds.value = []
  }

  function setRoutes(newRoutes: Route[]) {
    routes.value = [...newRoutes]
    paretoRoutes.value = [...newRoutes]
    if (newRoutes.length > 0) {
      currentRouteId.value = newRoutes[0].id
    }
  }

  // ==================== 图层操作 ====================
  function toggleLayer(id: string, visible?: boolean) {
    const layer = layers.value.find(l => l.id === id)
    if (layer) {
      layer.visible = visible ?? !layer.visible
      logger.info(`图层 ${layer.name} ${layer.visible ? '显示' : '隐藏'}`)
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

  function getLayerById(id: string): LayerConfig | undefined {
    return layers.value.find(l => l.id === id)
  }

  function showAllLayers() {
    layers.value.forEach(layer => {
      layer.visible = true
    })
    logger.info('显示所有图层')
  }

  function hideAllLayers() {
    layers.value.forEach(layer => {
      layer.visible = false
    })
    logger.info('隐藏所有图层')
  }

  async function loadLayer(id: string) {
    const layer = layers.value.find(l => l.id === id)
    if (!layer) return

    layer.loading = true
    layer.error = false

    try {
      // 模拟加载延迟
      await new Promise(resolve => setTimeout(resolve, 1000))
      layer.loaded = true
      layer.loading = false
      logger.info(`图层 ${layer.name} 加载成功`)
    } catch (error) {
      layer.loading = false
      layer.error = true
      logger.error(`图层 ${layer.name} 加载失败`)
    }
  }

  // ==================== 面板操作 ====================
  function togglePanel(panelName: keyof PlanningPanelVisibility) {
    panelVisibility.value[panelName] = !panelVisibility.value[panelName]
  }

  function setPanelVisible(panelName: keyof PlanningPanelVisibility, visible: boolean) {
    panelVisibility.value[panelName] = visible
  }

  // ==================== 工具函数 ====================
  function calculateDistance(p1: [number, number], p2: [number, number]): number {
    const R = 6371
    const dLat = (p2[1] - p1[1]) * Math.PI / 180
    const dLon = (p2[0] - p1[0]) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  return {
    // 路由状态
    routes,
    currentRouteId,
    selectedSegmentId,
    paretoRoutes,
    selectedRouteIds,
    hoveredSegmentInfo,
    selectedSegmentInfo,
    currentRoute,
    selectedRoute,
    selectedSegment,
    // 路由操作
    selectRoute,
    selectSegment,
    setHoveredSegment,
    setSelectedSegmentInfo,
    toggleRouteSelection,
    selectAllRoutes,
    isRouteSelected,
    clearRoutes,
    setRoutes,
    calculateDistance,
    // 图层状态
    layers,
    visibleLayers,
    loadedLayers,
    // 图层操作
    toggleLayer,
    setLayerLoaded,
    setLayerLoading,
    getLayerById,
    showAllLayers,
    hideAllLayers,
    loadLayer,
    // 面板状态
    panelVisibility,
    // 面板操作
    togglePanel,
    setPanelVisible,
  }
})
