import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Route, RoutePoint, RouteSegment, RouteCostBreakdown, RouteRiskAnalysis } from '@/types'
import { createRouteRepository } from '@/repositories'
import { mockParetoRoutes } from '@/data/mockData'

export const useRouteStore = defineStore('route', () => {
  const repository = createRouteRepository()

  // 状态
  const routes = ref<Route[]>([])
  const currentRouteId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)
  const paretoRoutes = ref<Route[]>([])
  const selectedRouteIds = ref<string[]>([])  // 多选路径ID数组

  // Getters
  const currentRoute = computed(() =>
    routes.value.find(r => r.id === currentRouteId.value) || null
  )

  // 兼容 ParetoPanel 使用的 selectedRoute
  const selectedRoute = computed(() => currentRoute.value)

  const selectedSegment = computed(() => {
    if (!currentRoute.value || !selectedSegmentId.value) return null
    return currentRoute.value.segments.find(s => s.id === selectedSegmentId.value) || null
  })

  // Actions
  async function loadRoutes() {
    try {
      routes.value = await repository.getRoutes()
      // 不在初始化时计算Pareto路径，只有运行规划时才显示
    } catch (error) {
      console.error('加载路由失败:', error)
    }
  }

  /**
   * 计算 Pareto 前沿
   * 基于成本(cost.total)和风险(risk.overall)进行多目标优化
   */
  function calculateParetoFront(allRoutes: Route[]): Route[] {
    if (allRoutes.length === 0) return []

    const paretoFront: Route[] = []

    for (const candidate of allRoutes) {
      let isDominated = false

      for (const other of allRoutes) {
        if (other.id === candidate.id) continue

        // 检查 other 是否支配 candidate
        const costBetter = other.cost.total <= candidate.cost.total
        const riskBetter = other.risk.overall <= candidate.risk.overall
        const strictlyBetter = other.cost.total < candidate.cost.total || other.risk.overall < candidate.risk.overall

        if (costBetter && riskBetter && strictlyBetter) {
          isDominated = true
          break
        }
      }

      if (!isDominated) {
        paretoFront.push(candidate)
      }
    }

    // 按成本排序返回
    return paretoFront.sort((a, b) => a.cost.total - b.cost.total)
  }

  function selectRoute(routeId: string | null) {
    currentRouteId.value = routeId
    selectedSegmentId.value = null
  }

  function selectSegment(segmentId: string | null) {
    selectedSegmentId.value = segmentId
  }

  /**
   * 切换路径选中状态（多选）
   */
  function toggleRouteSelection(routeId: string) {
    const index = selectedRouteIds.value.indexOf(routeId)
    if (index > -1) {
      selectedRouteIds.value.splice(index, 1)
    } else {
      selectedRouteIds.value.push(routeId)
    }
  }

  /**
   * 全选/取消全选路径
   */
  function selectAllRoutes(select: boolean) {
    if (select) {
      selectedRouteIds.value = paretoRoutes.value.map(r => r.id)
    } else {
      selectedRouteIds.value = []
    }
  }

  /**
   * 检查路径是否被选中
   */
  function isRouteSelected(routeId: string): boolean {
    return selectedRouteIds.value.includes(routeId)
  }


  /**
   * 根据分段风险等级计算路由整体风险
   */
  function calculateRouteRisk(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0
    const riskMap = { low: 0.2, medium: 0.5, high: 0.8 }
    const totalRisk = segments.reduce((sum, s) => sum + (riskMap[s.riskLevel] || 0.5), 0)
    return totalRisk / segments.length
  }

  function generateSegments(points: RoutePoint[]): RouteSegment[] {
    const segments: RouteSegment[] = []
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({
        id: `seg-${Date.now()}-${i}`,
        startPointId: points[i].id,
        endPointId: points[i + 1].id,
        length: calculateDistance(points[i].coordinates, points[i + 1].coordinates),
        depth: Math.random() * 5000,
        cableType: 'lw',
        riskLevel: 'low',
        cost: 0,
      })
    }
    return segments
  }

  function calculateDistance(p1: [number, number], p2: [number, number]): number {
    const R = 6371 // 地球半径 km
    const dLat = (p2[1] - p1[1]) * Math.PI / 180
    const dLon = (p2[0] - p1[0]) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  /**
   * 生成 Pareto 路径数据 - 从集中数据文件导入
   */
  function generateMockParetoRoutes() {
    const now = new Date()
    
    // 从集中数据创建路径
    const paretoData = mockParetoRoutes.map(r => ({
      ...r,
      createdAt: now,
      updatedAt: now,
    })) as Route[]

    routes.value = paretoData
    paretoRoutes.value = paretoData
    
    // 默认选中均衡路线
    currentRouteId.value = 'pareto-route-2'
    
    return paretoRoutes.value
  }

  /**
   * 清除 Pareto 路径数据
   */
  function clearParetoRoutes() {
    routes.value = []
    paretoRoutes.value = []
    currentRouteId.value = null
  }

  return {
    routes,
    currentRouteId,
    selectedSegmentId,
    paretoRoutes,
    selectedRouteIds,
    currentRoute,
    selectedRoute,
    selectedSegment,
    loadRoutes,
    selectRoute,
    selectSegment,
    toggleRouteSelection,
    selectAllRoutes,
    isRouteSelected,
    generateMockParetoRoutes,
    clearParetoRoutes,
  }
})
