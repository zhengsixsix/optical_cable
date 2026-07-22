import type { Route, RoutePoint } from '@/types'

export interface RouteStationNameConfig {
  startPoint?: { name?: string; lon?: number; lat?: number }
  endPoint?: { name?: string; lon?: number; lat?: number }
}

export interface ResolvedRouteStations {
  startPoint: RoutePoint | null
  endPoint: RoutePoint | null
  startName: string
  endName: string
}

const normalizeName = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const GENERIC_STATION_NAME_PATTERN = /^(?:算法)?(?:起点|终点)(?:站|登陆站)?$/

export const isGenericRouteStationName = (value: unknown): boolean => {
  const name = normalizeName(value)
  return !name || GENERIC_STATION_NAME_PATTERN.test(name)
}

export const preferSpecificRouteStationName = (...values: unknown[]): string => {
  const names = values.map(normalizeName).filter(Boolean)
  return names.find(name => !isGenericRouteStationName(name)) || names[0] || ''
}

const coordinateDistanceSquared = (
  point: RoutePoint | null,
  configured?: { lon?: number; lat?: number },
): number => {
  if (!point || !Number.isFinite(configured?.lon) || !Number.isFinite(configured?.lat)) {
    return Number.POSITIVE_INFINITY
  }
  const dx = point.coordinates[0] - Number(configured?.lon)
  const dy = point.coordinates[1] - Number(configured?.lat)
  return dx * dx + dy * dy
}

const getTrunkLandingPoints = (route: Pick<Route, 'points'>): RoutePoint[] => {
  const landingPoints = route.points.filter(point => point.type === 'landing')
  const trunkLandingPoints = landingPoints.filter(point => !(point as RoutePoint & { isBranchStation?: boolean }).isBranchStation)
  return trunkLandingPoints.length >= 2 ? trunkLandingPoints : landingPoints
}

export function resolveRouteStationNames(
  route: Pick<Route, 'points'> | null | undefined,
  config?: RouteStationNameConfig | null,
): ResolvedRouteStations {
  const landingPoints = route ? getTrunkLandingPoints(route) : []
  let startPoint = landingPoints[0] ?? route?.points[0] ?? null
  let endPoint = landingPoints[landingPoints.length - 1] ?? route?.points[route.points.length - 1] ?? null

  const configuredStartName = normalizeName(config?.startPoint?.name)
  const configuredEndName = normalizeName(config?.endPoint?.name)
  const directDistance = coordinateDistanceSquared(startPoint, config?.startPoint)
    + coordinateDistanceSquared(endPoint, config?.endPoint)
  const reverseDistance = coordinateDistanceSquared(startPoint, config?.endPoint)
    + coordinateDistanceSquared(endPoint, config?.startPoint)
  const routeIsReversed = Number.isFinite(reverseDistance) && reverseDistance < directDistance

  if (routeIsReversed) {
    const originalStart = startPoint
    startPoint = endPoint
    endPoint = originalStart
  }

  return {
    startPoint,
    endPoint,
    startName: preferSpecificRouteStationName(configuredStartName, startPoint?.name, '起点'),
    endName: preferSpecificRouteStationName(configuredEndName, endPoint?.name, '终点'),
  }
}

export function applyConfiguredStationNames(
  route: Route,
  config?: RouteStationNameConfig | null,
): Route {
  const resolved = resolveRouteStationNames(route, config)
  if (!resolved.startPoint || !resolved.endPoint) return route

  const namesByPointId = new Map<string, string>([
    [resolved.startPoint.id, resolved.startName],
    [resolved.endPoint.id, resolved.endName],
  ])
  const points = route.points.map(point => {
    const name = namesByPointId.get(point.id)
    return name ? { ...point, name } : point
  })
  const rawNamedPoints = route.rawNamedPoints?.map(point => {
    const name = namesByPointId.get(point.id)
    return name ? { ...point, name } : point
  })

  return {
    ...route,
    points,
    ...(rawNamedPoints ? { rawNamedPoints } : {}),
  }
}
