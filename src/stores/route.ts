import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Route, RoutePoint, RouteSegment, RouteCostBreakdown, RouteRiskAnalysis } from '@/types'
import { createRouteRepository } from '@/repositories'
import { mockParetoRoutes } from '@/data/mockData'
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

  /**
   * 设置 Pareto 路径数据（用于USE文件导入）
   */
  function setParetoRoutes(newRoutes: Route[]) {
    routes.value = [...newRoutes]
    paretoRoutes.value = [...newRoutes]
    if (newRoutes.length > 0) {
      currentRouteId.value = newRoutes[0].id
    }
  }

  /**
   * 根据工程设置生成 Pareto 路径
   * 支持点对点和多点规划模式
   */
  function generateParetoRoutesFromSettings(): Route[] {
    const settingsStore = useSettingsStore()
    const config = settingsStore.routePlanningConfig
    
    // 多点规划模式
    if (config.mode === 'multi-point' && config.waypoints && config.waypoints.length >= 3) {
      return generateMultiPointRoutes(config.waypoints)
    }
    
    // 点对点模式
    const startCoord: [number, number] = [config.startPoint.lon, config.startPoint.lat]
    const endCoord: [number, number] = [config.endPoint.lon, config.endPoint.lat]
    
    return generateParetoRoutesWithCoords({
      startPoint: { lon: startCoord[0], lat: startCoord[1], name: '起点登陆站' },
      endPoint: { lon: endCoord[0], lat: endCoord[1], name: '终点登陆站' }
    })
  }

  /**
   * 多点规划路线生成
   * 链式+分支拓扑：第一个点是起点，最后一个点是终点，中间点通过分支器连接
   */
  function generateMultiPointRoutes(waypoints: Array<{ id: string; name: string; lon: number; lat: number }>): Route[] {
    const settingsStore = useSettingsStore()
    const now = new Date()
    
    // 从器件库获取设备
    const amplifierTypes = settingsStore.amplifierTypes
    const branchingUnitTypes = settingsStore.branchingUnitTypes
    const defaultAmplifier = amplifierTypes.length > 0 ? amplifierTypes[0] : null
    const defaultBU = branchingUnitTypes.length > 0 ? branchingUnitTypes[0] : null
    
    // 设备生成函数
    const createAmplifierDevice = (index: number) => ({
      deviceId: defaultAmplifier?.id || 'amp-default',
      deviceType: 'amplifier',
      deviceName: defaultAmplifier 
        ? `${defaultAmplifier.name}-${String(index).padStart(2, '0')}`
        : `放大器-${String(index).padStart(2, '0')}`,
      gain: defaultAmplifier?.gain || 20,
      noiseFigure: defaultAmplifier?.noiseFigure || 5,
      outputPower: defaultAmplifier?.outputPower || 10,
    })
    
    const createBranchingDevice = (index: number) => ({
      deviceId: defaultBU?.id || 'bu-default',
      deviceType: 'branching_unit',
      deviceName: defaultBU 
        ? `${defaultBU.name}-${String(index).padStart(2, '0')}`
        : `分支器-${String(index).padStart(2, '0')}`,
      portCount: defaultBU?.portCount || 3,
      insertionLoss: defaultBU?.insertionLoss || 0.5,
    })
    
    const getAmpName = (index: number) => defaultAmplifier 
      ? `${defaultAmplifier.name}-${String(index).padStart(2, '0')}`
      : `放大器-${String(index).padStart(2, '0')}`
    
    const getBUName = (index: number) => defaultBU 
      ? `${defaultBU.name}-${String(index).padStart(2, '0')}`
      : `分支器-${String(index).padStart(2, '0')}`

    // 第一个和最后一个是主干线的起点和终点，中间的是分支点
    const startStation = waypoints[0]
    const endStation = waypoints[waypoints.length - 1]
    const branchStations = waypoints.slice(1, -1) // 中间的分支站点
    
    const startCoord: [number, number] = [startStation.lon, startStation.lat]
    const endCoord: [number, number] = [endStation.lon, endStation.lat]
    
    // 构建主干线上的中间点（分支器位置）
    // 每个分支站点对应一个分支器，分支器位于主干线上离该分支站点最近的位置
    const intermediatePoints: Array<{ coord: [number, number]; type: 'repeater' | 'branching'; name: string; device: any; branchTo?: { coord: [number, number]; name: string } }> = []
    
    let ampIndex = 1
    let buIndex = 1
    
    // 为每个分支站点创建分支器
    branchStations.forEach((station, i) => {
      // 计算分支器在主干线上的位置（投影到主干线上）
      const t = (i + 1) / (branchStations.length + 1)
      const buCoord: [number, number] = [
        startCoord[0] + (endCoord[0] - startCoord[0]) * t,
        startCoord[1] + (endCoord[1] - startCoord[1]) * t
      ]
      
      // 分支器前添加放大器
      if (i === 0 || intermediatePoints.length === 0) {
        const ampCoord: [number, number] = [
          startCoord[0] + (buCoord[0] - startCoord[0]) * 0.5,
          startCoord[1] + (buCoord[1] - startCoord[1]) * 0.5
        ]
        intermediatePoints.push({
          coord: ampCoord,
          type: 'repeater',
          name: getAmpName(ampIndex++),
          device: createAmplifierDevice(ampIndex - 1)
        })
      }
      
      // 添加分支器，并记录分支到哪个站点
      intermediatePoints.push({
        coord: buCoord,
        type: 'branching',
        name: getBUName(buIndex++),
        device: createBranchingDevice(buIndex - 1),
        branchTo: {
          coord: [station.lon, station.lat],
          name: station.name
        }
      })
      
      // 分支器后添加放大器
      const nextT = (i + 2) / (branchStations.length + 1)
      const nextPoint = i === branchStations.length - 1 ? endCoord : [
        startCoord[0] + (endCoord[0] - startCoord[0]) * nextT,
        startCoord[1] + (endCoord[1] - startCoord[1]) * nextT
      ] as [number, number]
      
      const ampCoord2: [number, number] = [
        buCoord[0] + (nextPoint[0] - buCoord[0]) * 0.5,
        buCoord[1] + (nextPoint[1] - buCoord[1]) * 0.5
      ]
      intermediatePoints.push({
        coord: ampCoord2,
        type: 'repeater',
        name: getAmpName(ampIndex++),
        device: createAmplifierDevice(ampIndex - 1)
      })
    })
    
    // 创建多点规划路线
    const multiPointRoute = createMultiPointRoute({
      id: 'multi-point-route',
      name: '多点规划路线',
      startCoord,
      endCoord,
      startName: startStation.name,
      endName: endStation.name,
      intermediatePoints,
      now
    })
    
    routes.value = [multiPointRoute]
    paretoRoutes.value = [multiPointRoute]
    currentRouteId.value = 'multi-point-route'
    
    return [multiPointRoute]
  }

  /**
   * 创建多点规划路线（包含分支）
   */
  function createMultiPointRoute(params: {
    id: string
    name: string
    startCoord: [number, number]
    endCoord: [number, number]
    startName: string
    endName: string
    intermediatePoints: Array<{ coord: [number, number]; type: 'repeater' | 'branching'; name: string; device: any; branchTo?: { coord: [number, number]; name: string } }>
    now: Date
  }): Route {
    const { id, name, startCoord, endCoord, startName, endName, intermediatePoints, now } = params
    
    // 构建主干线上的所有点
    const points: RoutePoint[] = [
      { id: `${id}-p1`, coordinates: startCoord, type: 'landing', name: startName }
    ]
    
    intermediatePoints.forEach((p, i) => {
      points.push({
        id: `${id}-p${i + 2}`,
        coordinates: p.coord,
        type: p.type,
        name: p.name,
        device: p.device,
        branchTo: p.branchTo // 分支目标信息
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
      
      segments.push({
        id: `${id}-s${i + 1}`,
        startPointId: points[i].id,
        endPointId: points[i + 1].id,
        length: Math.round(segLength),
        depth: Math.round(depth),
        cableType: depth > 2000 ? 'lw' : depth > 1000 ? 'sa' : 'da',
        riskLevel: 'medium',
        cost: Math.round(segLength * 30000)
      })
    }
    
    // 计算分支线长度
    let branchLength = 0
    intermediatePoints.forEach(p => {
      if (p.branchTo) {
        branchLength += calculateDistance(p.coord, p.branchTo.coord as [number, number])
      }
    })
    totalLength += branchLength

    const totalCost = Math.round(totalLength * 35000)

    return {
      id,
      name,
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
  }

  /**
   * 根据指定坐标生成 Pareto 路径
   */
  function generateParetoRoutesWithCoords(params: PlanningParams): Route[] {
    const { startPoint, endPoint, waypoints } = params
    const settingsStore = useSettingsStore()
    const now = new Date()
    const startCoord: [number, number] = [startPoint.lon, startPoint.lat]
    const endCoord: [number, number] = [endPoint.lon, endPoint.lat]
    
    // 从器件库获取设备（放大器和分支器）
    const amplifierTypes = settingsStore.amplifierTypes
    const fiberTypes = settingsStore.fiberTypes
    const branchingUnitTypes = settingsStore.branchingUnitTypes
    
    // 获取默认放大器类型
    const defaultAmplifier = amplifierTypes.length > 0 ? amplifierTypes[0] : null
    // 获取默认分支器类型
    const defaultBU = branchingUnitTypes.length > 0 ? branchingUnitTypes[0] : null
    
    // 生成放大器设备信息的辅助函数
    const createAmplifierDevice = (index: number) => ({
      deviceId: defaultAmplifier?.id || 'amp-default',
      deviceType: 'amplifier',
      deviceName: defaultAmplifier 
        ? `${defaultAmplifier.name}-${String(index).padStart(2, '0')}`
        : `放大器-${String(index).padStart(2, '0')}`,
      // 放大器参数
      gain: defaultAmplifier?.gain || 20,
      noiseFigure: defaultAmplifier?.noiseFigure || 5,
      outputPower: defaultAmplifier?.outputPower || 10,
      bandwidth: defaultAmplifier?.bandwidth,
      gainFlatness: defaultAmplifier?.gainFlatness,
      pumpPower: defaultAmplifier?.pumpPower,
    })
    
    // 生成分支器设备信息的辅助函数
    const createBranchingDevice = (index: number) => ({
      deviceId: defaultBU?.id || 'bu-default',
      deviceType: 'branching_unit',
      deviceName: defaultBU 
        ? `${defaultBU.name}-${String(index).padStart(2, '0')}`
        : `分支器-${String(index).padStart(2, '0')}`,
      // 分支器参数
      portCount: defaultBU?.portCount || 3,
      insertionLoss: defaultBU?.insertionLoss || 0.5,
      wavelengthRange: defaultBU?.wavelengthRange || 1550,
    })
    
    // 生成放大器设备名称
    const getDeviceName = (index: number) => defaultAmplifier 
      ? `${defaultAmplifier.name}-${String(index).padStart(2, '0')}`
      : `放大器-${String(index).padStart(2, '0')}`
    
    // 生成分支器设备名称
    const getBUName = (index: number) => defaultBU 
      ? `${defaultBU.name}-${String(index).padStart(2, '0')}`
      : `分支器-${String(index).padStart(2, '0')}`
    
    // 计算中间点（用于生成不同的路径方案）
    const midLon = (startCoord[0] + endCoord[0]) / 2
    const midLat = (startCoord[1] + endCoord[1]) / 2
    const distance = calculateDistance(startCoord, endCoord)
    
    // 生成三条不同策略的路径
    const paretoData: Route[] = [
      // 经济路线 - 直线距离最短，只有中继器，没有航路点
      createRoute({
        id: 'pareto-route-1',
        name: '经济路线',
        startCoord,
        endCoord,
        startName: startPoint.name || '起点登陆站',
        endName: endPoint.name || '终点登陆站',
        intermediatePoints: [
          { coord: [midLon, midLat] as [number, number], type: 'repeater' as const, name: getDeviceName(1), device: createAmplifierDevice(1) }
        ],
        riskMultiplier: 1.2,
        costMultiplier: 0.85,
        now
      }),
      // 均衡路线 - 平衡成本和风险
      createRoute({
        id: 'pareto-route-2',
        name: '均衡路线',
        startCoord,
        endCoord,
        startName: startPoint.name || '起点登陆站',
        endName: endPoint.name || '终点登陆站',
        intermediatePoints: [
          { coord: [startCoord[0] + (endCoord[0] - startCoord[0]) * 0.33, startCoord[1] + (endCoord[1] - startCoord[1]) * 0.33] as [number, number], type: 'repeater' as const, name: getDeviceName(1), device: createAmplifierDevice(1) },
          { coord: [startCoord[0] + (endCoord[0] - startCoord[0]) * 0.66, startCoord[1] + (endCoord[1] - startCoord[1]) * 0.66] as [number, number], type: 'repeater' as const, name: getDeviceName(2), device: createAmplifierDevice(2) }
        ],
        riskMultiplier: 0.7,
        costMultiplier: 1.0,
        now
      }),
      // 安全路线 - 避开风险区域，路径更长
      createRoute({
        id: 'pareto-route-3',
        name: '安全路线',
        startCoord,
        endCoord,
        startName: startPoint.name || '起点登陆站',
        endName: endPoint.name || '终点登陆站',
        intermediatePoints: [
          { coord: [startCoord[0] + (endCoord[0] - startCoord[0]) * 0.2, startCoord[1] + (endCoord[1] - startCoord[1]) * 0.15] as [number, number], type: 'repeater' as const, name: getDeviceName(1), device: createAmplifierDevice(1) },
          { coord: [startCoord[0] + (endCoord[0] - startCoord[0]) * 0.4, startCoord[1] + (endCoord[1] - startCoord[1]) * 0.5] as [number, number], type: 'repeater' as const, name: getDeviceName(2), device: createAmplifierDevice(2) },
          { coord: [startCoord[0] + (endCoord[0] - startCoord[0]) * 0.6, startCoord[1] + (endCoord[1] - startCoord[1]) * 0.6] as [number, number], type: 'repeater' as const, name: getDeviceName(3), device: createAmplifierDevice(3) },
          { coord: [startCoord[0] + (endCoord[0] - startCoord[0]) * 0.85, startCoord[1] + (endCoord[1] - startCoord[1]) * 0.8] as [number, number], type: 'repeater' as const, name: getDeviceName(4), device: createAmplifierDevice(4) }
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
   * 创建单条路径
   */
  function createRoute(params: {
    id: string
    name: string
    startCoord: [number, number]
    endCoord: [number, number]
    startName: string
    endName: string
    intermediatePoints: Array<{ coord: [number, number]; type: 'waypoint' | 'repeater' | 'branching'; name?: string; device?: any }>
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
        type: p.type,
        name: p.name,
        device: p.device  // 携带器件库设备信息
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

  return {
    routes,
    currentRouteId,
    selectedSegmentId,
    paretoRoutes,
    selectedRouteIds,
    hoveredSegmentId,
    hoveredSegmentInfo,
    currentRoute,
    selectedRoute,
    selectedSegment,
    loadRoutes,
    selectRoute,
    selectSegment,
    setHoveredSegment,
    clearHoveredSegment,
    toggleRouteSelection,
    selectAllRoutes,
    isRouteSelected,
    generateMockParetoRoutes,
    clearParetoRoutes,
    setParetoRoutes,
    generateParetoRoutesFromSettings,
    generateParetoRoutesWithCoords,
  }
})
