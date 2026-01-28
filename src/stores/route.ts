import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Route, RoutePoint, RouteSegment } from '@/types'
import { createRouteRepository } from '@/repositories'
import { useSettingsStore } from './settings'

// 规划配置参数
export interface PlanningParams {
  startPoint: { lon: number; lat: number; name?: string }
  endPoint: { lon: number; lat: number; name?: string }
  waypoints?: Array<{ lon: number; lat: number; name?: string }>
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

export const useRouteStore = defineStore('route', () => {
  const repository = createRouteRepository()

  // 状态
  const routes = ref<Route[]>([])
  const currentRouteId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)
  const paretoRoutes = ref<Route[]>([])
  const selectedRouteIds = ref<string[]>([])  // 多选路径ID数组
  
  // 悬停线段状态
  const hoveredSegmentId = ref<string | null>(null)
  const hoveredSegmentInfo = ref<HoveredSegmentInfo | null>(null)
  
  // 选中线段状态（用于水深剖面显示）
  const selectedSegmentInfo = ref<HoveredSegmentInfo | null>(null)

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
   * 设置悬停线段
   */
  function setHoveredSegment(segmentInfo: HoveredSegmentInfo | null) {
    if (segmentInfo) {
      hoveredSegmentId.value = segmentInfo.id
      hoveredSegmentInfo.value = segmentInfo
    } else {
      hoveredSegmentId.value = null
      hoveredSegmentInfo.value = null
    }
  }

  /**
   * 清除悬停线段
   */
  function clearHoveredSegment() {
    hoveredSegmentId.value = null
    hoveredSegmentInfo.value = null
  }

  /**
   * 设置选中线段（用于水深剖面显示）
   */
  function selectSegmentInfo(segmentInfo: HoveredSegmentInfo | null) {
    selectedSegmentInfo.value = segmentInfo
  }

  /**
   * 清除选中线段
   */
  function clearSelectedSegmentInfo() {
    selectedSegmentInfo.value = null
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
   * 计算两点间距离 (km)
   */
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
   * 根据工程设置生成路径
   * 支持单点（点对点）和多点规划模式
   */
  function generateParetoRoutesFromSettings(): Route[] {
    const settingsStore = useSettingsStore()
    const config = settingsStore.routePlanningConfig
    
    console.log('generateParetoRoutesFromSettings - mode:', config.mode, 'waypoints:', config.waypoints?.length)
    
    // 多点规划模式
    if (config.mode === 'multi-point' && config.waypoints && config.waypoints.length >= 2) {
      console.log('Using multi-point mode')
      return generateMultiPointRoutes(config.waypoints)
    }
    
    // 点对点模式
    console.log('Using point-to-point mode, generating 3 Pareto routes')
    return generateParetoRoutesWithCoords({
      startPoint: { lon: config.startPoint.lon, lat: config.startPoint.lat, name: '起点' },
      endPoint: { lon: config.endPoint.lon, lat: config.endPoint.lat, name: '终点' }
    })
  }

  /**
   * 多点规划路线生成
   * 按顺序连接所有点，生成一条路线
   */
  function generateMultiPointRoutes(waypoints: Array<{ id: string; name: string; lon: number; lat: number }>): Route[] {
    const now = new Date()
    
    // 构建所有点
    const points: RoutePoint[] = waypoints.map((wp, i) => ({
      id: `mp-p${i + 1}`,
      coordinates: [wp.lon, wp.lat] as [number, number],
      type: i === 0 ? 'landing' : i === waypoints.length - 1 ? 'landing' : 'waypoint',
      name: wp.name || `点位${i + 1}`
    }))
    
    // 构建分段
    const segments: RouteSegment[] = []
    let totalLength = 0
    
    for (let i = 0; i < points.length - 1; i++) {
      const segLength = calculateDistance(points[i].coordinates, points[i + 1].coordinates)
      totalLength += segLength
      const depth = 1000 + Math.random() * 3000
      
      segments.push({
        id: `mp-s${i + 1}`,
        startPointId: points[i].id,
        endPointId: points[i + 1].id,
        length: Math.round(segLength),
        depth: Math.round(depth),
        cableType: depth > 2000 ? 'lw' : depth > 1000 ? 'sa' : 'da',
        riskLevel: 'medium',
        cost: Math.round(segLength * 30000)
      })
    }

    const totalCost = Math.round(totalLength * 35000)

    const route: Route = {
      id: 'multi-point-route',
      name: '多点规划路线',
      points,
      segments,
      totalLength: Math.round(totalLength),
      totalCost,
      riskScore: 0.5,
      cost: {
        cable: Math.round(totalCost * 0.6),
        installation: Math.round(totalCost * 0.25),
        equipment: Math.round(totalCost * 0.15),
        total: totalCost
      },
      risk: {
        seismic: 0.4,
        volcanic: 0.3,
        depth: 0.5,
        overall: 0.5
      },
      distance: Math.round(totalLength),
      createdAt: now,
      updatedAt: now
    }
    
    routes.value = [route]
    paretoRoutes.value = [route]
    currentRouteId.value = 'multi-point-route'
    
    return [route]
  }

  /**
   * 根据起终点坐标生成 Pareto 路径
   * 生成三条不同走向的路径供选择
   */
  function generateParetoRoutesWithCoords(params: PlanningParams): Route[] {
    const { startPoint, endPoint } = params
    const now = new Date()
    const startCoord: [number, number] = [startPoint.lon, startPoint.lat]
    const endCoord: [number, number] = [endPoint.lon, endPoint.lat]
    
    // 计算起终点的中间位置和偏移量
    const midLon = (startCoord[0] + endCoord[0]) / 2
    const midLat = (startCoord[1] + endCoord[1]) / 2
    
    // 计算垂直于起终点连线的偏移方向
    const dLon = endCoord[0] - startCoord[0]
    const dLat = endCoord[1] - startCoord[1]
    const dist = Math.sqrt(dLon * dLon + dLat * dLat)
    // 偏移量为距离的20%，使路线更明显区分
    const offsetScale = dist * 0.2
    // 垂直方向单位向量
    const perpLon = -dLat / dist
    const perpLat = dLon / dist
    
    console.log('generateParetoRoutesWithCoords - dist:', dist, 'offsetScale:', offsetScale)
    
    // 生成三条不同走向的路径
    const paretoData: Route[] = [
      // 经济路线：直线（无中间点）
      createRoute({
        id: 'pareto-route-1',
        name: '经济路线',
        startCoord,
        endCoord,
        startName: startPoint.name || '起点',
        endName: endPoint.name || '终点',
        intermediatePoints: [],
        riskMultiplier: 1.2,
        costMultiplier: 0.85,
        now
      }),
      // 均衡路线：向北偏移
      createRoute({
        id: 'pareto-route-2',
        name: '均衡路线',
        startCoord,
        endCoord,
        startName: startPoint.name || '起点',
        endName: endPoint.name || '终点',
        intermediatePoints: [
          { coord: [midLon + perpLon * offsetScale, midLat + perpLat * offsetScale] as [number, number] }
        ],
        riskMultiplier: 0.7,
        costMultiplier: 1.0,
        now
      }),
      // 安全路线：向南偏移，多一个中间点
      createRoute({
        id: 'pareto-route-3',
        name: '安全路线',
        startCoord,
        endCoord,
        startName: startPoint.name || '起点',
        endName: endPoint.name || '终点',
        intermediatePoints: [
          { coord: [startCoord[0] + dLon * 0.33 - perpLon * offsetScale * 1.5, startCoord[1] + dLat * 0.33 - perpLat * offsetScale * 1.5] as [number, number] },
          { coord: [startCoord[0] + dLon * 0.66 - perpLon * offsetScale * 1.5, startCoord[1] + dLat * 0.66 - perpLat * offsetScale * 1.5] as [number, number] }
        ],
        riskMultiplier: 0.3,
        costMultiplier: 1.5,
        now
      })
    ]

    routes.value = paretoData
    paretoRoutes.value = paretoData
    currentRouteId.value = 'pareto-route-2'
    
    return paretoData
  }

  /**
   * 创建单条路径（纯路线，无器件）
   */
  function createRoute(params: {
    id: string
    name: string
    startCoord: [number, number]
    endCoord: [number, number]
    startName: string
    endName: string
    intermediatePoints: Array<{ coord: [number, number]; name?: string }>
    riskMultiplier: number
    costMultiplier: number
    now: Date
  }): Route {
    const { id, name, startCoord, endCoord, startName, endName, intermediatePoints, riskMultiplier, costMultiplier, now } = params
    
    // 构建所有点
    const points: RoutePoint[] = [
      { id: `${id}-p1`, coordinates: startCoord, type: 'landing', name: startName }
    ]
    
    intermediatePoints.forEach((p, i) => {
      points.push({
        id: `${id}-p${i + 2}`,
        coordinates: p.coord,
        type: 'waypoint',
        name: p.name || `途经点${i + 1}`
      })
    })
    
    points.push({
      id: `${id}-p${points.length + 1}`,
      coordinates: endCoord,
      type: 'landing',
      name: endName
    })

    // 构建分段
    const segments: RouteSegment[] = []
    let totalLength = 0
    
    for (let i = 0; i < points.length - 1; i++) {
      const segLength = calculateDistance(points[i].coordinates, points[i + 1].coordinates)
      totalLength += segLength
      const depth = 1000 + Math.random() * 3000
      const riskLevel = riskMultiplier > 1 ? 'high' : riskMultiplier > 0.5 ? 'medium' : 'low'
      
      segments.push({
        id: `${id}-s${i + 1}`,
        startPointId: points[i].id,
        endPointId: points[i + 1].id,
        length: Math.round(segLength),
        depth: Math.round(depth),
        cableType: depth > 2000 ? 'lw' : depth > 1000 ? 'sa' : 'da',
        riskLevel: riskLevel as 'low' | 'medium' | 'high',
        cost: Math.round(segLength * 30000 * costMultiplier)
      })
    }

    const totalCost = Math.round(totalLength * 30000 * costMultiplier)
    const overallRisk = Math.min(0.9, 0.2 + (riskMultiplier - 0.3) * 0.5)

    return {
      id,
      name,
      points,
      segments,
      totalLength: Math.round(totalLength),
      totalCost,
      riskScore: overallRisk,
      cost: {
        cable: Math.round(totalCost * 0.7),
        installation: Math.round(totalCost * 0.2),
        equipment: Math.round(totalCost * 0.1),
        total: totalCost
      },
      risk: {
        seismic: overallRisk * (0.9 + Math.random() * 0.2),
        volcanic: overallRisk * (0.8 + Math.random() * 0.3),
        depth: overallRisk * (0.85 + Math.random() * 0.25),
        overall: overallRisk
      },
      distance: Math.round(totalLength),
      createdAt: now,
      updatedAt: now
    }
  }

  /**
   * 清除 Pareto 路径数据
   */
  function clearParetoRoutes() {
    routes.value = []
    paretoRoutes.value = []
    currentRouteId.value = null
  }

  /**
   * 设置 Pareto 路径数据（用于文件导入）
   */
  function setParetoRoutes(newRoutes: Route[]) {
    routes.value = [...newRoutes]
    paretoRoutes.value = [...newRoutes]
    if (newRoutes.length > 0) {
      currentRouteId.value = newRoutes[0].id
    }
  }

  /**
   * 更新路线中的某个点位置（用于拖拽编辑）
   */
  function updateRoutePoint(routeId: string, pointId: string, newCoord: [number, number]) {
    const route = routes.value.find(r => r.id === routeId)
    if (!route) return
    
    const point = route.points.find(p => p.id === pointId)
    if (!point) return
    
    point.coordinates = newCoord
    
    // 重新计算相关分段的长度
    route.segments.forEach(seg => {
      if (seg.startPointId === pointId || seg.endPointId === pointId) {
        const startPt = route.points.find(p => p.id === seg.startPointId)
        const endPt = route.points.find(p => p.id === seg.endPointId)
        if (startPt && endPt) {
          seg.length = Math.round(calculateDistance(startPt.coordinates, endPt.coordinates))
          seg.cost = Math.round(seg.length * 30000)
        }
      }
    })
    
    // 更新总长度和成本
    route.totalLength = route.segments.reduce((sum, s) => sum + s.length, 0)
    route.totalCost = route.segments.reduce((sum, s) => sum + s.cost, 0)
    route.distance = route.totalLength
    route.cost.total = route.totalCost
    route.updatedAt = new Date()
  }

  /**
   * 在路线中添加新点（在指定分段中间插入）
   */
  function addRoutePoint(routeId: string, segmentId: string, coord: [number, number], name?: string) {
    const route = routes.value.find(r => r.id === routeId)
    if (!route) return
    
    const segIndex = route.segments.findIndex(s => s.id === segmentId)
    if (segIndex === -1) return
    
    const segment = route.segments[segIndex]
    const startPtIndex = route.points.findIndex(p => p.id === segment.startPointId)
    
    // 创建新点
    const newPointId = `${routeId}-p${Date.now()}`
    const newPoint: RoutePoint = {
      id: newPointId,
      coordinates: coord,
      type: 'waypoint',
      name: name || `途经点`
    }
    
    // 插入新点
    route.points.splice(startPtIndex + 1, 0, newPoint)
    
    // 创建两个新分段替换原分段
    const startPt = route.points.find(p => p.id === segment.startPointId)!
    const endPt = route.points.find(p => p.id === segment.endPointId)!
    
    const seg1Length = Math.round(calculateDistance(startPt.coordinates, coord))
    const seg2Length = Math.round(calculateDistance(coord, endPt.coordinates))
    
    const newSeg1: RouteSegment = {
      id: `${routeId}-s${Date.now()}-1`,
      startPointId: segment.startPointId,
      endPointId: newPointId,
      length: seg1Length,
      depth: segment.depth,
      cableType: segment.cableType,
      riskLevel: segment.riskLevel,
      cost: Math.round(seg1Length * 30000)
    }
    
    const newSeg2: RouteSegment = {
      id: `${routeId}-s${Date.now()}-2`,
      startPointId: newPointId,
      endPointId: segment.endPointId,
      length: seg2Length,
      depth: segment.depth,
      cableType: segment.cableType,
      riskLevel: segment.riskLevel,
      cost: Math.round(seg2Length * 30000)
    }
    
    // 替换分段
    route.segments.splice(segIndex, 1, newSeg1, newSeg2)
    
    // 更新总长度
    route.totalLength = route.segments.reduce((sum, s) => sum + s.length, 0)
    route.totalCost = route.segments.reduce((sum, s) => sum + s.cost, 0)
    route.distance = route.totalLength
    route.cost.total = route.totalCost
    route.updatedAt = new Date()
  }

  return {
    routes,
    currentRouteId,
    selectedSegmentId,
    paretoRoutes,
    selectedRouteIds,
    hoveredSegmentId,
    hoveredSegmentInfo,
    selectedSegmentInfo,
    currentRoute,
    selectedRoute,
    selectedSegment,
    loadRoutes,
    selectRoute,
    selectSegment,
    setHoveredSegment,
    clearHoveredSegment,
    selectSegmentInfo,
    clearSelectedSegmentInfo,
    toggleRouteSelection,
    selectAllRoutes,
    isRouteSelected,
    clearParetoRoutes,
    setParetoRoutes,
    generateParetoRoutesFromSettings,
    generateParetoRoutesWithCoords,
    updateRoutePoint,
    addRoutePoint,
  }
})
