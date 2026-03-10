import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Route, RoutePoint, RouteSegment } from '@/types'
import { createRouteRepository } from '@/repositories'
import { useSettingsStore } from './settings'

// 点对点模式
export interface PlanningParams {
  startPoint: { lon: number; lat: number; name?: string; depth?: number }
  endPoint: { lon: number; lat: number; name?: string; depth?: number }
  waypoints?: Array<{ lon: number; lat: number; name?: string; depth?: number }>
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

  // Actions
  async function loadRoutes() {
    try {
      routes.value = await repository.getRoutes()
    } catch {
      // 静默处理加载失败
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
   * 根据风险等级获取铠装映射的单价（千元/km）
   */
  function getUnitPriceByRisk(riskLevel: string): number {
    const settingsStore = useSettingsStore()
    const armorMappings = settingsStore.routePlanningConfig.armorMappings || []
    const mapping = armorMappings.find(m => m.riskLevel === riskLevel)
    // 返回单价，默认值：高风险 24，中风险 19.5，低风险 15
    if (mapping) return mapping.unitPrice
    return riskLevel === 'high' ? 24 : riskLevel === 'medium' ? 19.5 : 15
  }

  /**
   * 根据风险等级获取缆型名称
   */
  function getCableTypeByRisk(riskLevel: string): string {
    const settingsStore = useSettingsStore()
    const armorMappings = settingsStore.routePlanningConfig.armorMappings || []
    const mapping = armorMappings.find(m => m.riskLevel === riskLevel)
    if (mapping) return mapping.cableTypeName
    return riskLevel === 'high' ? 'DA' : riskLevel === 'medium' ? 'SA' : 'LW'
  }

  /**
   * 根据水深判断风险等级
   */
  function getRiskLevelByDepth(depth: number): 'low' | 'medium' | 'high' {
    const settingsStore = useSettingsStore()
    const armorMappings = settingsStore.routePlanningConfig.armorMappings || []
    const highThreshold = armorMappings.find(m => m.riskLevel === 'high')?.riskThreshold ?? 3
    const mediumThreshold = armorMappings.find(m => m.riskLevel === 'medium')?.riskThreshold ?? 2
    
    // 浅水区风险高（拖锬等人为因素），深水区风险低
    if (depth < 500) return 'high'
    if (depth < 1500) return 'medium'
    return 'low'
  }

  /**
   * 计算线段成本（使用铠装映射单价）
   */
  function calculateSegmentCost(length: number, riskLevel: string): number {
    const unitPrice = getUnitPriceByRisk(riskLevel)  // 千元/km
    return Math.round(length * unitPrice * 1000)  // 返回元
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
   * 从后端 API 设置 Pareto 路径数据
   * @param apiRoutes 后端返回的路由数据（支持分支网络格式：含 points/branches）
   * @param config 规划配置，用于获取实际的站点名称
   */
  function setParetoRoutesFromApi(apiRoutes: any[], config?: any) {
    const now = new Date()
    
    // 构建坐标到名称和深度的映射（使用实际配置中的数据）
    const coordToInfo: Record<string, { name: string; type: 'landing' | 'waypoint' | 'branching'; depth?: number }> = {}
    if (config) {
      // 多点模式 - 登陆站
      if (config.mode === 'multi-point' && config.waypoints) {
        config.waypoints.forEach((wp: any) => {
          if (wp && (wp.lon !== 0 || wp.lat !== 0)) {
            const lon = wp.lon ?? 0
            const lat = wp.lat ?? 0
            const key = `${lon.toFixed(4)},${lat.toFixed(4)}`
            coordToInfo[key] = { 
              name: wp.name || '登陆站', 
              type: 'landing',
              depth: wp.depth || 0
            }
          }
        })
      }
      // BU 分支器
      if (config.buList) {
        config.buList.forEach((bu: any) => {
          if (bu && bu.lon && bu.lat) {
            const key = `${bu.lon.toFixed(4)},${bu.lat.toFixed(4)}`
            coordToInfo[key] = {
              name: bu.name || 'BU',
              type: 'branching',
              depth: 0
            }
          }
        })
      }
      // 点对点模式
      if (config.mode === 'point-to-point' && config.startPoint && config.endPoint) {
        const startLon = config.startPoint.lon ?? 0
        const startLat = config.startPoint.lat ?? 0
        const endLon = config.endPoint.lon ?? 0
        const endLat = config.endPoint.lat ?? 0
        const startKey = `${startLon.toFixed(4)},${startLat.toFixed(4)}`
        const endKey = `${endLon.toFixed(4)},${endLat.toFixed(4)}`
        coordToInfo[startKey] = { 
          name: config.startPoint.name || '起点', 
          type: 'landing',
          depth: config.startPoint.depth || 0
        }
        coordToInfo[endKey] = { 
          name: config.endPoint.name || '终点', 
          type: 'landing',
          depth: config.endPoint.depth || 0
        }
      }
    }
    
    const convertedRoutes: Route[] = apiRoutes.map((apiRoute, index) => {
      // 检测是否为分支网络格式（含 points + branches）
      const isBranchingNetwork = apiRoute.points && apiRoute.branches

      if (isBranchingNetwork) {
        return _convertBranchingNetworkRoute(apiRoute, coordToInfo, now, index)
      }

      // 标准格式（点对点/无BU多点）
      const points: RoutePoint[] = apiRoute.coordinates?.map((coord: [number, number], i: number) => {
        const coordLon = coord?.[0] ?? 0
        const coordLat = coord?.[1] ?? 0
        const key = `${coordLon.toFixed(4)},${coordLat.toFixed(4)}`
        const matched = coordToInfo[key]
        const isFirst = i === 0
        const isLast = i === apiRoute.coordinates.length - 1
        
        return {
          id: `${apiRoute.id}-p${i}`,
          coordinates: coord,
          type: matched?.type || (isFirst || isLast ? 'landing' : 'waypoint'),
          name: matched?.name || (isFirst ? '起点' : isLast ? '终点' : `路径点${i}`),
          depth: matched?.depth ?? 0
        }
      }) || []

      const segments: RouteSegment[] = apiRoute.segments?.map((seg: any, i: number) => ({
        id: seg.id || `${apiRoute.id}-s${i}`,
        startPointId: `${apiRoute.id}-p${i}`,
        endPointId: `${apiRoute.id}-p${i + 1}`,
        length: seg.length || 0,
        depth: seg.depth || 1000,
        cableType: seg.cableType || 'lw',
        riskLevel: seg.riskLevel || 'low',
        cost: seg.length ? calculateSegmentCost(seg.length, seg.riskLevel || 'low') : 0
      })) || []

      const totalLength = apiRoute.totalLength || segments.reduce((sum: number, s: RouteSegment) => sum + s.length, 0)
      const totalCost = apiRoute.totalCost || segments.reduce((sum: number, s: RouteSegment) => sum + s.cost, 0)

      return {
        id: apiRoute.id || `pareto-route-${index + 1}`,
        name: apiRoute.name || `路由方案 ${index + 1}`,
        points,
        segments,
        totalLength: Math.round(totalLength),
        totalCost,
        riskScore: apiRoute.avgRisk || 0.3,
        cost: {
          cable: Math.round(totalCost * 0.7),
          installation: Math.round(totalCost * 0.2),
          equipment: Math.round(totalCost * 0.1),
          total: totalCost
        },
        risk: {
          seismic: apiRoute.avgRisk || 0.3,
          volcanic: (apiRoute.avgRisk || 0.3) * 0.9,
          depth: (apiRoute.avgRisk || 0.3) * 0.85,
          overall: apiRoute.avgRisk || 0.3
        },
        distance: Math.round(totalLength),
        createdAt: now,
        updatedAt: now,
        rawTrunkCoordinates: apiRoute.coordinates || [],
      }
    })

    routes.value = convertedRoutes
    paretoRoutes.value = convertedRoutes
    if (convertedRoutes.length > 0) {
      currentRouteId.value = convertedRoutes[0].id
      selectedRouteIds.value = [convertedRoutes[0].id]
    }
  }

  /**
   * 转换分支网络路由（后端返回 points + branches 格式）
   * 构建树形拓扑：主干路径 + 分支路径，设置 branchTo/branchTargets
   */
  function _convertBranchingNetworkRoute(
    apiRoute: any,
    coordToInfo: Record<string, any>,
    now: Date,
    index: number
  ): Route {
    const routeId = apiRoute.id || `branching-route-${index + 1}`
    
    // 1) 创建命名点（landing/branching）的 ID 映射
    const namedPointMap: Record<string, RoutePoint> = {}
    const apiNamedPoints: any[] = apiRoute.points || []
    for (const np of apiNamedPoints) {
      const key = `${(np.lon).toFixed(4)},${(np.lat).toFixed(4)}`
      const configInfo = coordToInfo[key]
      namedPointMap[np.id] = {
        id: np.id,
        coordinates: [np.lon, np.lat] as [number, number],
        type: np.type === 'branching' ? 'branching' : 'landing',
        name: configInfo?.name || np.name || (np.type === 'branching' ? 'BU' : '登陆站'),
        depth: configInfo?.depth ?? 0
      }
    }

    // 2) 主干路径点
    const trunkCoords: [number, number][] = apiRoute.coordinates || []
    const allPoints: RoutePoint[] = []
    const allSegments: RouteSegment[] = []
    let pointIdx = 0
    
    // 主干路径点（首尾和命名点从 namedPointMap 取，中间为 waypoint）
    for (let i = 0; i < trunkCoords.length; i++) {
      const coord = trunkCoords[i]
      const coordKey = `${coord[0].toFixed(4)},${coord[1].toFixed(4)}`
      
      // 尝试匹配命名点
      let matched: RoutePoint | null = null
      for (const np of Object.values(namedPointMap)) {
        const npKey = `${np.coordinates[0].toFixed(4)},${np.coordinates[1].toFixed(4)}`
        if (npKey === coordKey) {
          matched = np
          break
        }
      }
      
      if (matched) {
        allPoints.push(matched)
      } else {
        allPoints.push({
          id: `${routeId}-tp${pointIdx++}`,
          coordinates: coord,
          type: 'waypoint',
          name: `路径点`
        })
      }
    }

    // 主干 segments（基于主干路径点）
    const trunkSegs: any[] = apiRoute.segments?.filter((s: any) => s.id?.startsWith('trunk-')) || []
    for (let i = 0; i < allPoints.length - 1 && i < trunkSegs.length; i++) {
      const seg = trunkSegs[i]
      allSegments.push({
        id: seg.id || `trunk-s${i}`,
        startPointId: allPoints[i].id,
        endPointId: allPoints[i + 1].id,
        length: seg.length || 0,
        depth: seg.depth || 1000,
        cableType: seg.cableType || 'LW',
        riskLevel: seg.riskLevel || 'low',
        cost: seg.length ? calculateSegmentCost(seg.length, seg.riskLevel || 'low') : 0
      })
    }
    // 如果 trunk segments 数量不匹配点数（简化路径导致），按点距离补全
    if (trunkSegs.length === 0 && allPoints.length >= 2) {
      for (let i = 0; i < allPoints.length - 1; i++) {
        const len = calculateDistance(allPoints[i].coordinates, allPoints[i + 1].coordinates)
        const roundedLen = Math.round(len)
        allSegments.push({
          id: `trunk-s${i}`,
          startPointId: allPoints[i].id,
          endPointId: allPoints[i + 1].id,
          length: roundedLen,
          depth: 2000,
          cableType: getCableTypeByRisk('low'),
          riskLevel: 'low',
          cost: calculateSegmentCost(roundedLen, 'low')
        })
      }
    }

    // 3) 分支路径
    const branches: any[] = apiRoute.branches || []
    const buBranchTargets: Record<string, Array<{ coord: [number, number]; name: string }>> = {}

    for (const branch of branches) {
      const branchCoords: [number, number][] = branch.coordinates || []
      if (branchCoords.length < 2) continue

      const branchPoints: RoutePoint[] = []
      for (let i = 0; i < branchCoords.length; i++) {
        const coord = branchCoords[i]
        const coordKey = `${coord[0].toFixed(4)},${coord[1].toFixed(4)}`
        
        // 首点是 BU，尾点是登陆站
        let matched: RoutePoint | null = null
        for (const np of Object.values(namedPointMap)) {
          const npKey = `${np.coordinates[0].toFixed(4)},${np.coordinates[1].toFixed(4)}`
          if (npKey === coordKey) {
            matched = np
            break
          }
        }
        
        if (matched) {
          branchPoints.push(matched)
          // 如果该点不在 allPoints 中（分支末端登陆站），添加
          if (!allPoints.find(p => p.id === matched!.id)) {
            ;(matched as any).isBranchStation = true
            ;(matched as any).branchFrom = namedPointMap[branch.fromBuId]?.name || 'BU'
            allPoints.push(matched)
          }
        } else {
          const bp: RoutePoint = {
            id: `${routeId}-bp${pointIdx++}`,
            coordinates: coord,
            type: 'waypoint',
            name: `分支路径点`
          }
          branchPoints.push(bp)
          allPoints.push(bp)
        }
      }

      // 分支 segments
      const branchSegs: any[] = branch.segments || []
      for (let i = 0; i < branchPoints.length - 1; i++) {
        const seg = branchSegs[i] || {}
        allSegments.push({
          id: seg.id || `branch-s${allSegments.length}`,
          startPointId: branchPoints[i].id,
          endPointId: branchPoints[i + 1].id,
          length: seg.length || Math.round(calculateDistance(branchPoints[i].coordinates, branchPoints[i + 1].coordinates)),
          depth: seg.depth || 2000,
          cableType: seg.cableType || 'LW',
          riskLevel: seg.riskLevel || 'low',
          cost: seg.length ? calculateSegmentCost(seg.length, seg.riskLevel || 'low') : 0
        })
      }

      // 收集 BU 的 branchTargets
      const buId = branch.fromBuId
      if (!buBranchTargets[buId]) buBranchTargets[buId] = []
      const lastCoord = branchCoords[branchCoords.length - 1]
      buBranchTargets[buId].push({
        coord: lastCoord,
        name: branch.toLandingName || ''
      })
    }

    // 4) 设置 BU 点的 branchTo / branchTargets
    for (const [buId, targets] of Object.entries(buBranchTargets)) {
      const buPoint = allPoints.find(p => p.id === buId)
      if (buPoint) {
        buPoint.branchTargets = targets
        if (targets.length > 0) {
          buPoint.branchTo = targets[0]
        }
      }
    }

    const totalLength = apiRoute.totalLength || allSegments.reduce((sum: number, s) => sum + s.length, 0)
    const totalCost = apiRoute.totalCost || allSegments.reduce((sum: number, s) => sum + s.cost, 0)

    return {
      id: routeId,
      name: apiRoute.name || '分支网络路线',
      points: allPoints,
      segments: allSegments,
      totalLength: Math.round(totalLength),
      totalCost,
      riskScore: apiRoute.avgRisk || 0.3,
      cost: {
        cable: Math.round(totalCost * 0.7),
        installation: Math.round(totalCost * 0.2),
        equipment: Math.round(totalCost * 0.1),
        total: totalCost
      },
      risk: {
        seismic: apiRoute.avgRisk || 0.3,
        volcanic: (apiRoute.avgRisk || 0.3) * 0.9,
        depth: (apiRoute.avgRisk || 0.3) * 0.85,
        overall: apiRoute.avgRisk || 0.3
      },
      distance: Math.round(totalLength),
      createdAt: now,
      updatedAt: now,
      // 保留原始 A* 路径坐标，供后端放大器落位使用
      rawTrunkCoordinates: trunkCoords,
      rawBranches: branches.map((b: any) => ({
        fromBuId: b.fromBuId || '',
        toLandingName: b.toLandingName || '',
        coordinates: b.coordinates || [],
      })),
      rawNamedPoints: apiNamedPoints.map((np: any) => ({
        id: np.id,
        type: np.type,
        lon: np.lon,
        lat: np.lat,
        name: np.name || '',
      })),
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
          seg.cost = calculateSegmentCost(seg.length, seg.riskLevel)
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
      cost: calculateSegmentCost(seg1Length, segment.riskLevel)
    }
    
    const newSeg2: RouteSegment = {
      id: `${routeId}-s${Date.now()}-2`,
      startPointId: newPointId,
      endPointId: segment.endPointId,
      length: seg2Length,
      depth: segment.depth,
      cableType: segment.cableType,
      riskLevel: segment.riskLevel,
      cost: calculateSegmentCost(seg2Length, segment.riskLevel)
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
    setParetoRoutesFromApi,
    updateRoutePoint,
    addRoutePoint,
  }
})
