import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type { Route } from '@/types'
import { useSettingsStore } from './settings'
import type { AlgorithmRouteBundleResult } from '@/services/RouteDataConverter'
import { applyConfiguredStationNames } from '@/utils/routeStationNames'

// 选中线段的后端展示信息
export interface SelectedSegmentInfo {
  id: string
  routeId: string
  startPoint: { lon: number; lat: number; name?: string }
  endPoint: { lon: number; lat: number; name?: string }
  length?: number
  depth?: number
  cableType?: string
  riskLevel?: string
}

export const useRouteStore = defineStore('route', () => {
  // 状态
  const routes = ref<Route[]>([])
  const currentRouteId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)
  const paretoRoutes = ref<Route[]>([])
  const algorithmRouteResult = shallowRef<AlgorithmRouteBundleResult | null>(null)
  const selectedRouteIds = ref<string[]>([])  // 多选路径ID数组
  
  // 选中线段状态（用于水深剖面显示）
  const selectedSegmentInfo = ref<SelectedSegmentInfo | null>(null)

  // Getters
  const currentRoute = computed(() =>
    routes.value.find(r => r.id === currentRouteId.value) || null
  )

  // 兼容 ParetoPanel 使用的 selectedRoute
  // 优先从 paretoRoutes 查找，再从 routes 查找
  const selectedRoute = computed(() => {
    if (currentRouteId.value) {
      return paretoRoutes.value.find(r => r.id === currentRouteId.value) ||
             routes.value.find(r => r.id === currentRouteId.value) ||
             null
    }
    return null
  })

  const selectedSegment = computed(() => {
    if (!currentRoute.value || !selectedSegmentId.value) return null
    return currentRoute.value.segments.find(s => s.id === selectedSegmentId.value) || null
  })

  function selectRoute(routeId: string | null) {
    currentRouteId.value = routeId
    selectedRouteIds.value = routeId ? [routeId] : []
    selectedSegmentId.value = null
    selectedSegmentInfo.value = null
  }

  /**
   * 设置选中线段（用于水深剖面显示）
   */
  function selectSegmentInfo(segmentInfo: SelectedSegmentInfo | null) {
    selectedSegmentInfo.value = segmentInfo
    selectedSegmentId.value = segmentInfo?.id ?? null
  }

  /**
   * 清除选中线段
   */
  function clearSelectedSegmentInfo() {
    selectedSegmentInfo.value = null
    selectedSegmentId.value = null
  }

  /**
   * 检查路径是否被选中
   */
  function isRouteSelected(routeId: string): boolean {
    return selectedRouteIds.value.includes(routeId)
  }

  /**
   * 清除 Pareto 路径数据
   */
  function clearParetoRoutes() {
    routes.value = []
    paretoRoutes.value = []
    currentRouteId.value = null
    selectedRouteIds.value = []
    selectedSegmentId.value = null
    selectedSegmentInfo.value = null
    algorithmRouteResult.value = null
  }

  /**
   * 设置 Pareto 路径数据（用于文件导入）
   */
  const withConfiguredStationNames = (newRoutes: Route[]) => {
    const config = useSettingsStore().routePlanningConfig
    return newRoutes.map(route => applyConfiguredStationNames(route, config))
  }

  const assignParetoRoutes = (normalizedRoutes: Route[]) => {
    routes.value = [...normalizedRoutes]
    paretoRoutes.value = [...normalizedRoutes]
    if (normalizedRoutes.length > 0) {
      currentRouteId.value = normalizedRoutes[0].id
      selectedRouteIds.value = [normalizedRoutes[0].id]
    } else {
      currentRouteId.value = null
      selectedRouteIds.value = []
    }
    selectedSegmentId.value = null
    selectedSegmentInfo.value = null
  }

  function setParetoRoutes(newRoutes: Route[]) {
    const normalizedRoutes = withConfiguredStationNames(newRoutes)
    assignParetoRoutes(normalizedRoutes)
  }

  function setAlgorithmRouteResult(result: AlgorithmRouteBundleResult | null) {
    if (!result) {
      algorithmRouteResult.value = null
      setParetoRoutes([])
      return
    }
    const normalizedRoutes = withConfiguredStationNames(result.routes)
    algorithmRouteResult.value = { ...result, routes: normalizedRoutes }
    assignParetoRoutes(normalizedRoutes)
  }

  function updateRoutePoint(routeId: string, pointId: string, coordinates: [number, number]) {
    const route = paretoRoutes.value.find(item => item.id === routeId)
    const point = route?.points.find(item => item.id === pointId)
    if (!route || !point) return false

    point.coordinates = coordinates
    const pointIndex = route.points.findIndex(item => item.id === pointId)
    if (route.rawTrunkCoordinates && pointIndex >= 0 && pointIndex < route.rawTrunkCoordinates.length) {
      route.rawTrunkCoordinates[pointIndex] = coordinates
    }
    route.updatedAt = new Date()
    return true
  }

  function syncConfiguredStationNames() {
    const selectedId = currentRouteId.value
    routes.value = withConfiguredStationNames(routes.value)
    paretoRoutes.value = withConfiguredStationNames(paretoRoutes.value)
    if (algorithmRouteResult.value) {
      algorithmRouteResult.value = {
        ...algorithmRouteResult.value,
        routes: withConfiguredStationNames(algorithmRouteResult.value.routes),
      }
    }
    currentRouteId.value = selectedId
  }

  return {
    routes,
    currentRouteId,
    selectedSegmentId,
    paretoRoutes,
    algorithmRouteResult,
    selectedRouteIds,
    selectedSegmentInfo,
    currentRoute,
    selectedRoute,
    selectedSegment,
    selectRoute,
    selectSegmentInfo,
    clearSelectedSegmentInfo,
    isRouteSelected,
    clearParetoRoutes,
    setParetoRoutes,
    setAlgorithmRouteResult,
    updateRoutePoint,
    syncConfiguredStationNames,
  }
})
