import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Route, RoutePoint, RouteSegment, RouteCostBreakdown, RouteRiskAnalysis } from '@/types'
import { createRouteRepository } from '@/repositories'

export const useRouteStore = defineStore('route', () => {
  const repository = createRouteRepository()

  // 状态
  const routes = ref<Route[]>([])
  const currentRouteId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)
  const paretoRoutes = ref<Route[]>([])
  const isDrawing = ref(false)
  const drawingPoints = ref<RoutePoint[]>([])

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

  function addPoint(point: RoutePoint) {
    drawingPoints.value.push(point)
  }


  function removePoint(pointId: string) {
    drawingPoints.value = drawingPoints.value.filter(p => p.id !== pointId)
  }

  function updatePoint(pointId: string, coordinates: [number, number]) {
    const point = drawingPoints.value.find(p => p.id === pointId)
    if (point) {
      point.coordinates = coordinates
    }
  }

  function startDrawing() {
    isDrawing.value = true
    drawingPoints.value = []
  }

  function stopDrawing() {
    isDrawing.value = false
  }

  function clearDrawing() {
    drawingPoints.value = []
  }

  async function saveCurrentRoute(name: string) {
    if (drawingPoints.value.length < 2) return null

    const segments = generateSegments(drawingPoints.value)
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0)
    const totalCost = segments.reduce((sum, s) => sum + s.cost, 0)

    // 计算风险分数（基于分段风险等级）
    const riskScore = calculateRouteRisk(segments)

    const newRoute: Route = {
      id: `route-${Date.now()}`,
      name,
      points: [...drawingPoints.value],
      segments,
      totalLength,
      totalCost,
      riskScore,
      // 结构化成本和风险
      cost: {
        cable: totalCost * 0.7,
        installation: totalCost * 0.2,
        equipment: totalCost * 0.1,
        total: totalCost,
      },
      risk: {
        seismic: riskScore * 0.4,
        volcanic: riskScore * 0.3,
        depth: riskScore * 0.3,
        overall: riskScore,
      },
      distance: totalLength,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const saved = await repository.saveRoute(newRoute)
    routes.value.push(saved)
    // 重新计算 Pareto 前沿
    paretoRoutes.value = calculateParetoFront(routes.value)
    return saved
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
   * 生成三条模拟 Pareto 路径数据
   * 分别代表：低成本高风险、均衡、高成本低风险
   */
  function generateMockParetoRoutes() {
    const now = new Date()
    
    // 路径1: 低成本方案 (成本低，风险高)
    const route1: Route = {
      id: 'pareto-route-1',
      name: '经济路线',
      points: [
        { id: 'p1-1', coordinates: [120.5, 25.0], type: 'landing', name: '起点A' },
        { id: 'p1-2', coordinates: [125.0, 22.0], type: 'waypoint' },
        { id: 'p1-3', coordinates: [130.0, 20.0], type: 'landing', name: '终点B' },
      ],
      segments: [
        { id: 's1-1', startPointId: 'p1-1', endPointId: 'p1-2', length: 520, depth: 2500, cableType: 'lw', riskLevel: 'high', cost: 15600000 },
        { id: 's1-2', startPointId: 'p1-2', endPointId: 'p1-3', length: 580, depth: 3200, cableType: 'lw', riskLevel: 'high', cost: 17400000 },
      ],
      totalLength: 1100,
      totalCost: 33000000,
      riskScore: 0.72,
      cost: { cable: 23100000, installation: 6600000, equipment: 3300000, total: 33000000 },
      risk: { seismic: 0.75, volcanic: 0.68, depth: 0.73, overall: 0.72 },
      distance: 1100,
      createdAt: now,
      updatedAt: now,
    }

    // 路径2: 均衡方案 (成本中等，风险中等)
    const route2: Route = {
      id: 'pareto-route-2',
      name: '均衡路线',
      points: [
        { id: 'p2-1', coordinates: [120.5, 25.0], type: 'landing', name: '起点A' },
        { id: 'p2-2', coordinates: [123.5, 23.5], type: 'repeater' },
        { id: 'p2-3', coordinates: [127.0, 21.5], type: 'waypoint' },
        { id: 'p2-4', coordinates: [130.0, 20.0], type: 'landing', name: '终点B' },
      ],
      segments: [
        { id: 's2-1', startPointId: 'p2-1', endPointId: 'p2-2', length: 380, depth: 1800, cableType: 'da', riskLevel: 'medium', cost: 15200000 },
        { id: 's2-2', startPointId: 'p2-2', endPointId: 'p2-3', length: 420, depth: 2200, cableType: 'da', riskLevel: 'medium', cost: 16800000 },
        { id: 's2-3', startPointId: 'p2-3', endPointId: 'p2-4', length: 350, depth: 2000, cableType: 'da', riskLevel: 'low', cost: 14000000 },
      ],
      totalLength: 1150,
      totalCost: 46000000,
      riskScore: 0.45,
      cost: { cable: 32200000, installation: 9200000, equipment: 4600000, total: 46000000 },
      risk: { seismic: 0.42, volcanic: 0.48, depth: 0.45, overall: 0.45 },
      distance: 1150,
      createdAt: now,
      updatedAt: now,
    }

    // 路径3: 安全方案 (成本高，风险低)
    const route3: Route = {
      id: 'pareto-route-3',
      name: '安全路线',
      points: [
        { id: 'p3-1', coordinates: [120.5, 25.0], type: 'landing', name: '起点A' },
        { id: 'p3-2', coordinates: [122.0, 24.0], type: 'repeater' },
        { id: 'p3-3', coordinates: [124.5, 22.5], type: 'repeater' },
        { id: 'p3-4', coordinates: [127.5, 21.0], type: 'waypoint' },
        { id: 'p3-5', coordinates: [130.0, 20.0], type: 'landing', name: '终点B' },
      ],
      segments: [
        { id: 's3-1', startPointId: 'p3-1', endPointId: 'p3-2', length: 200, depth: 800, cableType: 'sa', riskLevel: 'low', cost: 12000000 },
        { id: 's3-2', startPointId: 'p3-2', endPointId: 'p3-3', length: 280, depth: 1200, cableType: 'sa', riskLevel: 'low', cost: 16800000 },
        { id: 's3-3', startPointId: 'p3-3', endPointId: 'p3-4', length: 320, depth: 1500, cableType: 'sa', riskLevel: 'low', cost: 19200000 },
        { id: 's3-4', startPointId: 'p3-4', endPointId: 'p3-5', length: 300, depth: 1100, cableType: 'sa', riskLevel: 'low', cost: 18000000 },
      ],
      totalLength: 1100,
      totalCost: 66000000,
      riskScore: 0.22,
      cost: { cable: 46200000, installation: 13200000, equipment: 6600000, total: 66000000 },
      risk: { seismic: 0.18, volcanic: 0.25, depth: 0.23, overall: 0.22 },
      distance: 1100,
      createdAt: now,
      updatedAt: now,
    }

    // 设置路径数据
    routes.value = [route1, route2, route3]
    paretoRoutes.value = [route1, route2, route3]
    
    // 默认选中均衡路线
    currentRouteId.value = route2.id
    
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
    isDrawing,
    drawingPoints,
    currentRoute,
    selectedRoute,
    selectedSegment,
    loadRoutes,
    selectRoute,
    selectSegment,
    addPoint,
    removePoint,
    updatePoint,
    startDrawing,
    stopDrawing,
    clearDrawing,
    saveCurrentRoute,
    generateMockParetoRoutes,
    clearParetoRoutes,
  }
})
