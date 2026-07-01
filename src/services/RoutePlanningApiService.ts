/**
 * Route planning API client.
 *
 * The online Swagger used by this project does not currently expose a route
 * planning endpoint, so the service returns deterministic mock data for the
 * planning workflow. Keep the response shape aligned with the backend contract
 * expected by MapArea and routeStore.setParetoRoutesFromApi.
 */

export interface Coordinate {
  lon: number
  lat: number
  depth?: number
  name?: string
}

export interface ArmorMappingConfig {
  riskLevel: 'high' | 'medium' | 'low'
  riskThreshold: number
  cableTypeId: string
  cableTypeName: string
  unitPrice: number
}

export interface BUNodeConfig {
  id: string
  name: string
  lon: number
  lat: number
  portLimit: number
}

export interface RedundancyPlanningConfig {
  enabled: boolean
  costLimitType: 'relative' | 'absolute'
  relativeCostPercent?: number
  absoluteCostLimit?: number
  criticalNodes?: string[]
}

export interface AvoidanceZone {
  id: string
  name?: string
  points: Coordinate[]
}

export interface RoutePlanningRequest {
  mode: 'point-to-point' | 'multi-point'
  startPoint?: Coordinate
  endPoint?: Coordinate
  waypoints?: Coordinate[]
  planningRange?: {
    northwest: { lon: number; lat: number }
    southeast: { lon: number; lat: number }
  }
  gridResolution?: number
  riskConfig?: {
    highRiskThreshold: number
    mediumRiskThreshold: number
  }
  avoidanceZones?: AvoidanceZone[]
  armorMappings?: ArmorMappingConfig[]
  buList?: BUNodeConfig[]
  redundancyConfig?: RedundancyPlanningConfig
}

export interface RouteSegment {
  id: string
  startPoint: Coordinate
  endPoint: Coordinate
  length: number
  depth: number
  riskLevel: 'high' | 'medium' | 'low'
  cableType: string
}

export interface ParetoRoute {
  id: string
  name: string
  totalLength: number
  totalCost: number
  avgRisk: number
  segments: RouteSegment[]
  coordinates: [number, number][]
}

export interface RoutePlanningResult {
  success: boolean
  mode: 'point-to-point' | 'multi-point'
  routes: ParetoRoute[]
  summary: {
    totalRoutes: number
    bestLength: number
    bestCost: number
    lowestRisk: number
  }
}

interface BranchingMockRoute extends ParetoRoute {
  points: Array<{
    id: string
    type: 'landing' | 'branching'
    lon: number
    lat: number
    name: string
  }>
  branches: Array<{
    fromBuId: string
    toLandingName: string
    coordinates: [number, number][]
    segments: RouteSegment[]
  }>
}

const DEFAULT_START: Coordinate = { lon: 121.49, lat: 31.23, depth: 0, name: 'Mock 登陆站 A' }
const DEFAULT_END: Coordinate = { lon: 127.15, lat: 27.05, depth: 0, name: 'Mock 登陆站 B' }

function calculateDistance(p1: Coordinate, p2: Coordinate): number {
  const radiusKm = 6371
  const dLat = (p2.lat - p1.lat) * Math.PI / 180
  const dLon = (p2.lon - p1.lon) * Math.PI / 180
  const lat1 = p1.lat * Math.PI / 180
  const lat2 = p2.lat * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getRiskLevel(depth: number): 'high' | 'medium' | 'low' {
  if (depth < 500) return 'high'
  if (depth < 1500) return 'medium'
  return 'low'
}

function getCableType(request: RoutePlanningRequest, riskLevel: 'high' | 'medium' | 'low'): string {
  const mapping = request.armorMappings?.find(item => item.riskLevel === riskLevel)
  if (mapping) return mapping.cableTypeName
  return riskLevel === 'high' ? 'DA' : riskLevel === 'medium' ? 'SA' : 'LW'
}

function getUnitPrice(request: RoutePlanningRequest, riskLevel: 'high' | 'medium' | 'low'): number {
  const mapping = request.armorMappings?.find(item => item.riskLevel === riskLevel)
  if (mapping) return mapping.unitPrice
  return riskLevel === 'high' ? 24 : riskLevel === 'medium' ? 19.5 : 15
}

function withDepth(point: Coordinate, depth = 0): Coordinate {
  return { ...point, depth: point.depth ?? depth }
}

function interpolatePoint(start: Coordinate, end: Coordinate, ratio: number, offset = 0): Coordinate {
  const bendLon = (end.lat - start.lat) * offset
  const bendLat = -(end.lon - start.lon) * offset
  const curve = Math.sin(Math.PI * ratio)
  return {
    lon: start.lon + (end.lon - start.lon) * ratio + bendLon * curve,
    lat: start.lat + (end.lat - start.lat) * ratio + bendLat * curve,
    depth: Math.round(800 + 1800 * curve),
  }
}

function buildRouteSegments(
  request: RoutePlanningRequest,
  routeId: string,
  points: Coordinate[],
): RouteSegment[] {
  return points.slice(0, -1).map((point, index) => {
    const nextPoint = points[index + 1]
    const length = Math.max(1, Math.round(calculateDistance(point, nextPoint)))
    const depth = Math.round(((point.depth || 0) + (nextPoint.depth || 0)) / 2) || 1200
    const riskLevel = getRiskLevel(depth)
    return {
      id: `${routeId}-s${index + 1}`,
      startPoint: point,
      endPoint: nextPoint,
      length,
      depth,
      riskLevel,
      cableType: getCableType(request, riskLevel),
    }
  })
}

function buildParetoRoute(
  request: RoutePlanningRequest,
  id: string,
  name: string,
  points: Coordinate[],
  riskBias = 0,
): ParetoRoute {
  const segments = buildRouteSegments(request, id, points)
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  const totalCost = segments.reduce(
    (sum, segment) => sum + segment.length * getUnitPrice(request, segment.riskLevel) * 1000,
    0,
  )
  const avgRisk = Math.min(
    0.9,
    Math.max(
      0.1,
      segments.reduce((sum, segment) => {
        const riskScore = segment.riskLevel === 'high' ? 0.65 : segment.riskLevel === 'medium' ? 0.38 : 0.18
        return sum + riskScore
      }, 0) / Math.max(segments.length, 1) + riskBias,
    ),
  )

  return {
    id,
    name,
    totalLength,
    totalCost: Math.round(totalCost),
    avgRisk,
    segments,
    coordinates: points.map(point => [point.lon, point.lat]),
  }
}

function getPointToPointMockRoutes(request: RoutePlanningRequest): ParetoRoute[] {
  const startPoint = withDepth(request.startPoint || DEFAULT_START)
  const endPoint = withDepth(request.endPoint || DEFAULT_END)
  const routeShapes = [
    { id: 'mock-route-balanced', name: 'Mock 路由方案 1 - 均衡', ratios: [0, 0.28, 0.58, 0.82, 1], offset: 0.018, riskBias: 0 },
    { id: 'mock-route-cost', name: 'Mock 路由方案 2 - 成本优先', ratios: [0, 0.35, 0.7, 1], offset: -0.012, riskBias: 0.05 },
    { id: 'mock-route-risk', name: 'Mock 路由方案 3 - 风险优先', ratios: [0, 0.22, 0.48, 0.74, 1], offset: 0.032, riskBias: -0.04 },
  ]

  return routeShapes.map(shape => {
    const points = shape.ratios.map((ratio, index) => {
      if (index === 0) return startPoint
      if (index === shape.ratios.length - 1) return endPoint
      return interpolatePoint(startPoint, endPoint, ratio, shape.offset)
    })
    return buildParetoRoute(request, shape.id, shape.name, points, shape.riskBias)
  })
}

function getMultiPointMockRoutes(request: RoutePlanningRequest): ParetoRoute[] {
  const waypoints = (request.waypoints || []).filter(point => point.lon !== 0 || point.lat !== 0)
  if (waypoints.length < 2) return getPointToPointMockRoutes(request)

  const buList = request.buList || []
  if (buList.length > 0) {
    const firstBu = buList[0]
    const buPoint: Coordinate = {
      lon: firstBu.lon,
      lat: firstBu.lat,
      depth: 1800,
      name: firstBu.name || 'Mock BU-1',
    }
    const trunkPoints = [withDepth(waypoints[0]), buPoint, withDepth(waypoints[waypoints.length - 1])]
    const route = buildParetoRoute(request, 'mock-multi-branch-route', 'Mock 多点分支网络方案', trunkPoints, -0.02)
    const branchRoute: BranchingMockRoute = {
      ...route,
      points: [
        {
          id: 'mock-landing-1',
          type: 'landing',
          lon: waypoints[0].lon,
          lat: waypoints[0].lat,
          name: waypoints[0].name || '登陆站 1',
        },
        {
          id: firstBu.id,
          type: 'branching',
          lon: firstBu.lon,
          lat: firstBu.lat,
          name: firstBu.name || 'BU-1',
        },
        {
          id: 'mock-landing-end',
          type: 'landing',
          lon: waypoints[waypoints.length - 1].lon,
          lat: waypoints[waypoints.length - 1].lat,
          name: waypoints[waypoints.length - 1].name || '登陆站 终点',
        },
      ],
      branches: waypoints.slice(1, -1).map((point, index) => {
        const branchPoints = [
          buPoint,
          interpolatePoint(buPoint, point, 0.55, 0.015),
          withDepth(point),
        ]
        return {
          fromBuId: firstBu.id,
          toLandingName: point.name || `登陆站 ${index + 2}`,
          coordinates: branchPoints.map(item => [item.lon, item.lat]),
          segments: buildRouteSegments(request, `mock-branch-${index + 1}`, branchPoints),
        }
      }),
    }
    return [branchRoute]
  }

  const serialPoints = waypoints.map((point, index) => withDepth(point, index === 0 || index === waypoints.length - 1 ? 0 : 1600))
  return [buildParetoRoute(request, 'mock-multi-route', 'Mock 多点串联路由方案', serialPoints, 0)]
}

function getMockRoutePlanningResult(request: RoutePlanningRequest): RoutePlanningResult {
  const routes = request.mode === 'multi-point'
    ? getMultiPointMockRoutes(request)
    : getPointToPointMockRoutes(request)

  return {
    success: true,
    mode: request.mode,
    routes,
    summary: {
      totalRoutes: routes.length,
      bestLength: Math.min(...routes.map(route => route.totalLength)),
      bestCost: Math.min(...routes.map(route => route.totalCost)),
      lowestRisk: Math.min(...routes.map(route => route.avgRisk)),
    },
  }
}

export async function fetchRoutePlanning(request: RoutePlanningRequest): Promise<RoutePlanningResult> {
  return getMockRoutePlanningResult(request)
}

export async function checkRoutePlanningService(): Promise<boolean> {
  return true
}

export function getApiBase(): string {
  return 'mock://route-planning'
}
