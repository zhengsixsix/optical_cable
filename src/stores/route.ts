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
   * 根据工程设置生成路径
   * 支持单点（点对点）和多点规划模式
   */
  function generateParetoRoutesFromSettings(): Route[] {
    const settingsStore = useSettingsStore()
    const config = settingsStore.routePlanningConfig
    
    // 多点规划模式
    if (config.mode === 'multi-point' && config.waypoints && config.waypoints.length >= 2) {
      // 传递登陆站列表和 BU 列表
      const mainRoutes = generateMultiPointRoutes(config.waypoints, config.buList || [])
      
      // 如果启用冗余策略，生成备份路径
      if (config.redundancyConfig?.enabled && mainRoutes.length > 0) {
        const redundantRoutes = generateRedundantRoutes(mainRoutes[0], config.redundancyConfig)
        return [...mainRoutes, ...redundantRoutes]
      }
      return mainRoutes
    }
    
    // 点对点模式
    const mainRoutes = generateParetoRoutesWithCoords({
      startPoint: { lon: config.startPoint.lon, lat: config.startPoint.lat, name: config.startPoint.name || '起点', depth: config.startPoint.depth },
      endPoint: { lon: config.endPoint.lon, lat: config.endPoint.lat, name: config.endPoint.name || '终点', depth: config.endPoint.depth }
    })
    
    // 如果启用冗余策略，为每条主路径生成备份
    if (config.redundancyConfig?.enabled) {
      const allRoutes: Route[] = []
      for (const mainRoute of mainRoutes) {
        allRoutes.push(mainRoute)
        const redundantRoutes = generateRedundantRoutes(mainRoute, config.redundancyConfig)
        allRoutes.push(...redundantRoutes)
      }
      routes.value = allRoutes
      paretoRoutes.value = allRoutes
      return allRoutes
    }
    
    return mainRoutes
  }

  /**
   * 生成冗余备份路径
   */
  function generateRedundantRoutes(
    mainRoute: Route, 
    redundancyConfig: { enabled: boolean; costLimitType: string; relativeCostPercent?: number; absoluteCostLimit?: number }
  ): Route[] {
    if (!redundancyConfig.enabled) return []
    
    const now = new Date()
    const redundantRoutes: Route[] = []
    
    // 计算成本上限
    let costLimit = mainRoute.totalCost * 2  // 默认上限
    if (redundancyConfig.costLimitType === 'relative' && redundancyConfig.relativeCostPercent) {
      costLimit = mainRoute.totalCost * (1 + redundancyConfig.relativeCostPercent / 100)
    } else if (redundancyConfig.costLimitType === 'absolute' && redundancyConfig.absoluteCostLimit) {
      costLimit = redundancyConfig.absoluteCostLimit * 10000  // 万元转元
    }
    
    // 生成一条备份路径（偏移原路径）
    if (mainRoute.points.length >= 2) {
      const startCoord = mainRoute.points[0].coordinates
      const endCoord = mainRoute.points[mainRoute.points.length - 1].coordinates
      
      // 计算垂直于起终点连线的偏移
      const dLon = endCoord[0] - startCoord[0]
      const dLat = endCoord[1] - startCoord[1]
      const dist = Math.sqrt(dLon * dLon + dLat * dLat)
      const offsetScale = dist * 0.15  // 偏移15%
      const perpLon = -dLat / dist
      const perpLat = dLon / dist
      
      const midLon = (startCoord[0] + endCoord[0]) / 2
      const midLat = (startCoord[1] + endCoord[1]) / 2
      
      // 备份路径的中间点
      const redundantMidCoord: [number, number] = [
        midLon + perpLon * offsetScale,
        midLat + perpLat * offsetScale
      ]
      
      const points: RoutePoint[] = [
        { ...mainRoute.points[0], id: `${mainRoute.id}-backup-p1` },
        { id: `${mainRoute.id}-backup-p2`, coordinates: redundantMidCoord, type: 'waypoint', name: '备份路径点' },
        { ...mainRoute.points[mainRoute.points.length - 1], id: `${mainRoute.id}-backup-p3` }
      ]
      
      const segments: RouteSegment[] = []
      let totalLength = 0
      let totalCost = 0
      
      for (let i = 0; i < points.length - 1; i++) {
        const segLength = calculateDistance(points[i].coordinates, points[i + 1].coordinates)
        totalLength += segLength
        const depth = 1000 + Math.random() * 3000
        const riskLevel = getRiskLevelByDepth(depth)
        const segCost = calculateSegmentCost(segLength, riskLevel)
        totalCost += segCost
        
        segments.push({
          id: `${mainRoute.id}-backup-s${i + 1}`,
          startPointId: points[i].id,
          endPointId: points[i + 1].id,
          length: Math.round(segLength),
          depth: Math.round(depth),
          cableType: getCableTypeByRisk(riskLevel),
          riskLevel,
          cost: segCost
        })
      }
      
      // 检查是否超出成本限制
      if (totalCost <= costLimit) {
        redundantRoutes.push({
          id: `${mainRoute.id}-backup`,
          name: `${mainRoute.name} (备份)`,
          points,
          segments,
          totalLength: Math.round(totalLength),
          totalCost,
          riskScore: mainRoute.riskScore * 0.8,  // 备份路径风险稍低
          cost: {
            cable: Math.round(totalCost * 0.7),
            installation: Math.round(totalCost * 0.2),
            equipment: Math.round(totalCost * 0.1),
            total: totalCost
          },
          risk: {
            seismic: mainRoute.risk.seismic * 0.8,
            volcanic: mainRoute.risk.volcanic * 0.8,
            depth: mainRoute.risk.depth * 0.9,
            overall: mainRoute.risk.overall * 0.85
          },
          distance: Math.round(totalLength),
          createdAt: now,
          updatedAt: now
        })
      }
    }
    
    return redundantRoutes
  }

  /**
   * 多点规划路线生成
   * 支持登陆站和BU（分支器）的分支网络拓扑
   * @param landingStations 登陆站列表
   * @param buList BU（分支器）列表
   */
  function generateMultiPointRoutes(
    landingStations: Array<{ id: string; name: string; lon: number; lat: number; depth?: number }>,
    buList: Array<{ id: string; name: string; lon: number; lat: number; portLimit?: number }>
  ): Route[] {
    const now = new Date()
    
    // 构建登陆站点（全部是 landing 类型）
    const landingPoints: RoutePoint[] = landingStations.map((wp, i) => ({
      id: wp.id || `landing-${i + 1}`,
      coordinates: [wp.lon, wp.lat] as [number, number],
      type: 'landing' as const,
      name: wp.name || `登陆站${i + 1}`,
      depth: wp.depth || 0
    }))
    
    // 构建 BU 点（branching 类型）
    const buPoints: RoutePoint[] = buList.map((bu, i) => ({
      id: bu.id || `bu-${i + 1}`,
      coordinates: [bu.lon, bu.lat] as [number, number],
      type: 'branching' as const,
      name: bu.name || `BU${i + 1}`,
      depth: 0
    }))
    
    // 如果有 BU，构建分支网络拓扑
    if (buPoints.length > 0) {
      return generateBranchingNetwork(landingPoints, buPoints, now)
    }
    
    // 没有 BU，按顺序连接所有登陆站
    const points = landingPoints
    const segments: RouteSegment[] = []
    let totalLength = 0
    let totalCost = 0
    
    for (let i = 0; i < points.length - 1; i++) {
      const segLength = calculateDistance(points[i].coordinates, points[i + 1].coordinates)
      totalLength += segLength
      const depth = 1000 + Math.random() * 3000
      const riskLevel = getRiskLevelByDepth(depth)
      const segCost = calculateSegmentCost(segLength, riskLevel)
      totalCost += segCost
      
      segments.push({
        id: `mp-s${i + 1}`,
        startPointId: points[i].id,
        endPointId: points[i + 1].id,
        length: Math.round(segLength),
        depth: Math.round(depth),
        cableType: getCableTypeByRisk(riskLevel),
        riskLevel,
        cost: segCost
      })
    }

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
    selectedRouteIds.value = ['multi-point-route']
    
    return [route]
  }
  
  /**
   * 生成分支网络拓扑
   * 每个 BU 连接多个登陆站，形成星形/树形网络
   */
  function generateBranchingNetwork(
    landingPoints: RoutePoint[],
    buPoints: RoutePoint[],
    now: Date
  ): Route[] {
    const allPoints: RoutePoint[] = []
    const segments: RouteSegment[] = []
    let totalLength = 0
    let segIndex = 1
    
    // 后续按主干/分支顺序构建 points
    
    let totalCost = 0
    
    // 如果只有一个 BU，所有登陆站都连接到这个 BU
    if (buPoints.length === 1) {
      const bu = buPoints[0]
      
      // 主干端点：使用用户输入顺序的首/尾登陆站
      const trunkStart = landingPoints[0]
      const trunkEnd = landingPoints.length > 1 ? landingPoints[landingPoints.length - 1] : landingPoints[0]
      const branchLandings = landingPoints.filter(l => l.id !== trunkStart?.id && l.id !== trunkEnd?.id)
      
      // 标记分支登陆站（用于配置界面区分）
      branchLandings.forEach(l => {
        ;(l as any).isBranchStation = true
        ;(l as any).branchFrom = bu.name
      })
      
      // 构建 points 顺序：起点 -> BU -> 终点 -> 分支登陆站
      if (trunkStart) allPoints.push(trunkStart)
      allPoints.push(bu)
      if (trunkEnd && trunkEnd.id !== trunkStart?.id) allPoints.push(trunkEnd)
      allPoints.push(...branchLandings)
      
      // 主干段
      if (trunkStart) {
        const segLength = calculateDistance(bu.coordinates, trunkStart.coordinates)
        totalLength += segLength
        const depth = 1000 + Math.random() * 3000
        const riskLevel = getRiskLevelByDepth(depth)
        const segCost = calculateSegmentCost(segLength, riskLevel)
        totalCost += segCost
        segments.push({
          id: `trunk-s${segIndex++}`,
          startPointId: trunkStart.id,
          endPointId: bu.id,
          length: Math.round(segLength),
          depth: Math.round(depth),
          cableType: getCableTypeByRisk(riskLevel),
          riskLevel,
          cost: segCost
        })
      }
      
      if (trunkEnd && trunkEnd.id !== trunkStart?.id) {
        const segLength = calculateDistance(bu.coordinates, trunkEnd.coordinates)
        totalLength += segLength
        const depth = 1000 + Math.random() * 3000
        const riskLevel = getRiskLevelByDepth(depth)
        const segCost = calculateSegmentCost(segLength, riskLevel)
        totalCost += segCost
        segments.push({
          id: `trunk-s${segIndex++}`,
          startPointId: bu.id,
          endPointId: trunkEnd.id,
          length: Math.round(segLength),
          depth: Math.round(depth),
          cableType: getCableTypeByRisk(riskLevel),
          riskLevel,
          cost: segCost
        })
      }
      
      // 分支段
      for (const landing of branchLandings) {
        const segLength = calculateDistance(bu.coordinates, landing.coordinates)
        totalLength += segLength
        const depth = 1000 + Math.random() * 3000
        const riskLevel = getRiskLevelByDepth(depth)
        const segCost = calculateSegmentCost(segLength, riskLevel)
        totalCost += segCost
        segments.push({
          id: `branch-s${segIndex++}`,
          startPointId: bu.id,
          endPointId: landing.id,
          length: Math.round(segLength),
          depth: Math.round(depth),
          cableType: getCableTypeByRisk(riskLevel),
          riskLevel,
          cost: segCost
        })
      }
      
      // 设置所有分支目标
      const branchTargetsList = branchLandings.map(l => ({
        coord: l.coordinates as [number, number],
        name: l.name || '',
      }))
      bu.branchTargets = branchTargetsList
      // 保留 branchTo 指向第一个分支（向后兼容）
      if (branchTargetsList.length > 0) {
        bu.branchTo = branchTargetsList[0]
      }
    } else if (buPoints.length >= 2) {
      // 多个 BU：主干线连接 BU，每个 BU 连接最近的登陆站

      // 1. BU 之间形成主干线
      for (let i = 0; i < buPoints.length - 1; i++) {
        const segLength = calculateDistance(buPoints[i].coordinates, buPoints[i + 1].coordinates)
        totalLength += segLength
        const depth = 1000 + Math.random() * 3000
        const riskLevel = getRiskLevelByDepth(depth)
        const segCost = calculateSegmentCost(segLength, riskLevel)
        totalCost += segCost

        segments.push({
          id: `trunk-s${segIndex++}`,
          startPointId: buPoints[i].id,
          endPointId: buPoints[i + 1].id,
          length: Math.round(segLength),
          depth: Math.round(depth),
          cableType: getCableTypeByRisk(riskLevel),
          riskLevel,
          cost: segCost
        })
      }

      // 2. 每个登陆站连接到最近的 BU
      const landingToNearestBU = new Map<string, RoutePoint>()
      const buToBranchLandings = new Map<string, RoutePoint[]>()

      for (const landing of landingPoints) {
        // 找到最近的 BU
        let nearestBU = buPoints[0]
        let minDist = calculateDistance(landing.coordinates, buPoints[0].coordinates)

        for (const bu of buPoints) {
          const dist = calculateDistance(landing.coordinates, bu.coordinates)
          if (dist < minDist) {
            minDist = dist
            nearestBU = bu
          }
        }

        landingToNearestBU.set(landing.id, nearestBU)
        if (!buToBranchLandings.has(nearestBU.id)) {
          buToBranchLandings.set(nearestBU.id, [])
        }
        buToBranchLandings.get(nearestBU.id)!.push(landing)

        const segLength = minDist
        totalLength += segLength
        const depth = 1000 + Math.random() * 3000
        const riskLevel = getRiskLevelByDepth(depth)
        const segCost = calculateSegmentCost(segLength, riskLevel)
        totalCost += segCost

        segments.push({
          id: `branch-s${segIndex++}`,
          startPointId: nearestBU.id,
          endPointId: landing.id,
          length: Math.round(segLength),
          depth: Math.round(depth),
          cableType: getCableTypeByRisk(riskLevel),
          riskLevel,
          cost: segCost
        })
      }

      // 3. 构建 points 顺序：起点 -> BU链 -> 终点 -> 分支登陆站
      const trunkStart = landingPoints[0]
      const trunkEnd = landingPoints.length > 1 ? landingPoints[landingPoints.length - 1] : landingPoints[0]
      const branchLandings = landingPoints.filter(l => l.id !== trunkStart?.id && l.id !== trunkEnd?.id)

      // 标记分支登陆站并关联 BU
      branchLandings.forEach(l => {
        ;(l as any).isBranchStation = true
        const nearestBU = landingToNearestBU.get(l.id)
        if (nearestBU) {
          ;(l as any).branchFrom = nearestBU.name
        }
      })

      // 为每个 BU 设置所有分支目标
      buPoints.forEach(bu => {
        const candidates = (buToBranchLandings.get(bu.id) || []).filter(
          l => l.id !== trunkStart?.id && l.id !== trunkEnd?.id
        )
        const targets = candidates.map(l => ({
          coord: l.coordinates as [number, number],
          name: l.name || '',
        }))
        bu.branchTargets = targets
        // 保留 branchTo 指向第一个分支（向后兼容）
        if (targets.length > 0) {
          bu.branchTo = targets[0]
        }
      })

      if (trunkStart) allPoints.push(trunkStart)
      allPoints.push(...buPoints)
      if (trunkEnd && trunkEnd.id !== trunkStart?.id) allPoints.push(trunkEnd)
      allPoints.push(...branchLandings)
    }
    
    const route: Route = {
      id: 'branching-network-route',
      name: '分支网络路线',
      points: allPoints,
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
    currentRouteId.value = 'branching-network-route'
    selectedRouteIds.value = ['branching-network-route']
    
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
        startDepth: startPoint.depth,
        endDepth: endPoint.depth,
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
        startDepth: startPoint.depth,
        endDepth: endPoint.depth,
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
        startDepth: startPoint.depth,
        endDepth: endPoint.depth,
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
    selectedRouteIds.value = ['pareto-route-2']  // 自动选中均衡路线
    
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
    startDepth?: number
    endDepth?: number
    intermediatePoints: Array<{ coord: [number, number]; name?: string }>
    riskMultiplier: number
    costMultiplier: number
    now: Date
  }): Route {
    const { id, name, startCoord, endCoord, startName, endName, startDepth, endDepth, intermediatePoints, riskMultiplier, costMultiplier, now } = params
    
    // 构建所有点
    const points: RoutePoint[] = [
      { id: `${id}-p1`, coordinates: startCoord, type: 'landing', name: startName, depth: startDepth || 0 }
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
      name: endName,
      depth: endDepth || 0
    })

    // 构建分段
    const segments: RouteSegment[] = []
    let totalLength = 0
    let totalCost = 0
    
    for (let i = 0; i < points.length - 1; i++) {
      const segLength = calculateDistance(points[i].coordinates, points[i + 1].coordinates)
      totalLength += segLength
      const depth = 1000 + Math.random() * 3000
      // 结合风险系数和水深判断风险等级
      const baseRiskLevel = getRiskLevelByDepth(depth)
      const riskLevel = riskMultiplier > 1 ? 'high' : riskMultiplier > 0.5 ? baseRiskLevel : 'low'
      // 使用铠装映射单价计算成本，并应用成本系数
      const segCost = Math.round(calculateSegmentCost(segLength, riskLevel) * costMultiplier)
      totalCost += segCost
      
      segments.push({
        id: `${id}-s${i + 1}`,
        startPointId: points[i].id,
        endPointId: points[i + 1].id,
        length: Math.round(segLength),
        depth: Math.round(depth),
        cableType: getCableTypeByRisk(riskLevel),
        riskLevel: riskLevel as 'low' | 'medium' | 'high',
        cost: segCost
      })
    }
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
   * 从后端 API 设置 Pareto 路径数据
   * @param apiRoutes 后端返回的路由数据
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
              depth: wp.depth || 0  // 0 表示岸上站点，>0 表示水下站点
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
      // 将 API 返回的路由转换为内部 Route 类型
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
          depth: matched?.depth ?? 0  // 水深，0 表示岸上站点
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
        cost: seg.length ? Math.round(seg.length * 30000) : 0
      })) || []

      const totalLength = apiRoute.totalLength || segments.reduce((sum: number, s: RouteSegment) => sum + s.length, 0)
      const totalCost = apiRoute.totalCost || Math.round(totalLength * 30000)

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
        updatedAt: now
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
    setParetoRoutesFromApi,
    generateParetoRoutesFromSettings,
    generateParetoRoutesWithCoords,
    updateRoutePoint,
    addRoutePoint,
  }
})
