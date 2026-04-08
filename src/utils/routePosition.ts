import type { RPLRecord } from '@/types/rpl'
import type { Route, RoutePoint, RouteSegment } from '@/types/route'
import { calculateDistance } from '@/utils/geo'

type RouteLike = Pick<Route, 'points' | 'segments'>
type RplLikeRecord = Pick<RPLRecord, 'sequence' | 'kp' | 'longitude' | 'latitude' | 'depth'> & {
  cableType?: string
  isBranchStation?: boolean
}

interface PathSegment {
  startKp: number
  endKp: number
  startLon: number
  startLat: number
  endLon: number
  endLat: number
  startDepth: number
  endDepth: number
  cableType?: string
}

export interface RoutePositionAtKP {
  longitude: number
  latitude: number
  depth: number
  cableType?: string
  source: 'rpl' | 'route-segment' | 'route-point' | 'none'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function buildFallbackPointSegments(points: RoutePoint[]): PathSegment[] {
  if (!Array.isArray(points) || points.length < 2) return []

  const segments: PathSegment[] = []
  let cumulative = 0

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]
    const startCoords = start.coordinates || [0, 0]
    const endCoords = end.coordinates || [0, 0]
    const length = calculateDistance(startCoords, endCoords)
    const startDepth = isFiniteNumber(start.depth) ? start.depth : 0
    const endDepth = isFiniteNumber(end.depth) ? end.depth : startDepth

    segments.push({
      startKp: cumulative,
      endKp: cumulative + length,
      startLon: startCoords[0] || 0,
      startLat: startCoords[1] || 0,
      endLon: endCoords[0] || 0,
      endLat: endCoords[1] || 0,
      startDepth,
      endDepth,
    })

    cumulative += length
  }

  return segments
}

function buildMainPathIds(route: RouteLike): string[] {
  if (!route.points?.length) return []

  if (!route.segments?.length) {
    return route.points.map(point => point.id)
  }

  const landingPoints = route.points.filter(point => point.type === 'landing')
  const mainLandings = landingPoints.filter(point => !(point as RoutePoint & { isBranchStation?: boolean }).isBranchStation)
  const startPoint = mainLandings[0] || landingPoints[0] || route.points[0]
  const endPoint = mainLandings[mainLandings.length - 1] || landingPoints[landingPoints.length - 1] || route.points[route.points.length - 1]

  if (!startPoint || !endPoint || startPoint.id === endPoint.id) {
    return route.points.map(point => point.id)
  }

  const adjacency = new Map<string, string[]>()
  route.segments.forEach(segment => {
    if (!adjacency.has(segment.startPointId)) adjacency.set(segment.startPointId, [])
    if (!adjacency.has(segment.endPointId)) adjacency.set(segment.endPointId, [])
    adjacency.get(segment.startPointId)!.push(segment.endPointId)
    adjacency.get(segment.endPointId)!.push(segment.startPointId)
  })

  const queue: string[] = [startPoint.id]
  const visited = new Set<string>([startPoint.id])
  const previous = new Map<string, string | null>([[startPoint.id, null]])

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === endPoint.id) break
    const neighbors = adjacency.get(current) || []
    neighbors.forEach(nextId => {
      if (visited.has(nextId)) return
      visited.add(nextId)
      previous.set(nextId, current)
      queue.push(nextId)
    })
  }

  if (!visited.has(endPoint.id)) {
    return route.points.map(point => point.id)
  }

  const pathIds: string[] = []
  let cursor: string | null = endPoint.id
  while (cursor) {
    pathIds.push(cursor)
    cursor = previous.get(cursor) || null
  }
  pathIds.reverse()
  return pathIds
}

function buildRouteSegments(route: RouteLike): { segments: PathSegment[]; source: 'route-segment' | 'route-point' } {
  if (!route.points?.length) {
    return { segments: [], source: 'route-point' }
  }

  const pointMap = new Map(route.points.map(point => [point.id, point]))
  const pathIds = buildMainPathIds(route)
  const segmentMap = new Map<string, RouteSegment>()

  route.segments?.forEach(segment => {
    segmentMap.set(`${segment.startPointId}__${segment.endPointId}`, segment)
    segmentMap.set(`${segment.endPointId}__${segment.startPointId}`, segment)
  })

  const routeSegments: PathSegment[] = []
  let cumulative = 0

  for (let index = 0; index < pathIds.length - 1; index++) {
    const start = pointMap.get(pathIds[index])
    const end = pointMap.get(pathIds[index + 1])
    if (!start || !end) continue

    const startCoords = start.coordinates || [0, 0]
    const endCoords = end.coordinates || [0, 0]
    const linkedSegment = segmentMap.get(`${start.id}__${end.id}`)
    const fallbackLength = calculateDistance(startCoords, endCoords)
    const length = isFiniteNumber(linkedSegment?.length) && linkedSegment!.length > 0
      ? linkedSegment!.length
      : fallbackLength
    const linkedDepth = isFiniteNumber(linkedSegment?.depth) ? linkedSegment!.depth : undefined
    const startDepth = isFiniteNumber(start.depth) ? start.depth : (linkedDepth ?? 0)
    const endDepth = isFiniteNumber(end.depth) ? end.depth : (linkedDepth ?? startDepth)

    routeSegments.push({
      startKp: cumulative,
      endKp: cumulative + length,
      startLon: startCoords[0] || 0,
      startLat: startCoords[1] || 0,
      endLon: endCoords[0] || 0,
      endLat: endCoords[1] || 0,
      startDepth,
      endDepth,
      cableType: linkedSegment?.cableType,
    })

    cumulative += length
  }

  if (routeSegments.length > 0) {
    return { segments: routeSegments, source: 'route-segment' }
  }

  return {
    segments: buildFallbackPointSegments(route.points),
    source: 'route-point',
  }
}

function interpolateOnSegments(
  segments: PathSegment[],
  targetKP: number,
  configuredTotalLength?: number,
): RoutePositionAtKP | null {
  if (segments.length === 0) return null

  const actualTotalLength = segments[segments.length - 1]?.endKp || 0
  if (actualTotalLength <= 0) {
    const first = segments[0]
    return {
      longitude: first.startLon,
      latitude: first.startLat,
      depth: first.startDepth,
      cableType: first.cableType,
      source: 'route-point',
    }
  }

  const effectiveTotalLength = isFiniteNumber(configuredTotalLength) && configuredTotalLength > 0
    ? configuredTotalLength
    : actualTotalLength
  const targetActualKP = clamp01(targetKP / effectiveTotalLength) * actualTotalLength

  for (const segment of segments) {
    if (segment.endKp + 1e-9 < targetActualKP) continue
    const segmentLength = segment.endKp - segment.startKp
    const localRatio = segmentLength > 0
      ? clamp01((targetActualKP - segment.startKp) / segmentLength)
      : 0

    return {
      longitude: segment.startLon + (segment.endLon - segment.startLon) * localRatio,
      latitude: segment.startLat + (segment.endLat - segment.startLat) * localRatio,
      depth: segment.startDepth + (segment.endDepth - segment.startDepth) * localRatio,
      cableType: segment.cableType,
      source: segment.cableType ? 'route-segment' : 'route-point',
    }
  }

  const last = segments[segments.length - 1]
  return {
    longitude: last.endLon,
    latitude: last.endLat,
    depth: last.endDepth,
    cableType: last.cableType,
    source: last.cableType ? 'route-segment' : 'route-point',
  }
}

function interpolateFromRplRecords(records: RplLikeRecord[], targetKP: number): RoutePositionAtKP | null {
  const ordered = records
    .filter(record =>
      !record.isBranchStation &&
      isFiniteNumber(record.kp) &&
      isFiniteNumber(record.longitude) &&
      isFiniteNumber(record.latitude),
    )
    .sort((left, right) => {
      const leftOrder = isFiniteNumber(left.sequence) ? left.sequence : left.kp
      const rightOrder = isFiniteNumber(right.sequence) ? right.sequence : right.kp
      return leftOrder - rightOrder
    })

  if (ordered.length === 0) return null

  if (ordered.length === 1 || targetKP <= ordered[0].kp) {
    return {
      longitude: ordered[0].longitude,
      latitude: ordered[0].latitude,
      depth: isFiniteNumber(ordered[0].depth) ? ordered[0].depth : 0,
      cableType: ordered[0].cableType,
      source: 'rpl',
    }
  }

  for (let index = 0; index < ordered.length - 1; index++) {
    const before = ordered[index]
    const after = ordered[index + 1]
    if (after.kp + 1e-9 < targetKP) continue

    const span = after.kp - before.kp
    const ratio = span > 0 ? clamp01((targetKP - before.kp) / span) : 0

    return {
      longitude: before.longitude + (after.longitude - before.longitude) * ratio,
      latitude: before.latitude + (after.latitude - before.latitude) * ratio,
      depth: (isFiniteNumber(before.depth) ? before.depth : 0) + (((isFiniteNumber(after.depth) ? after.depth : 0) - (isFiniteNumber(before.depth) ? before.depth : 0)) * ratio),
      cableType: after.cableType || before.cableType,
      source: 'rpl',
    }
  }

  const last = ordered[ordered.length - 1]
  return {
    longitude: last.longitude,
    latitude: last.latitude,
    depth: isFiniteNumber(last.depth) ? last.depth : 0,
    cableType: last.cableType,
    source: 'rpl',
  }
}

export function getRoutePositionAtKP(
  targetKP: number,
  route?: RouteLike | null,
  options: {
    configuredTotalLength?: number
    rplRecords?: RplLikeRecord[]
  } = {},
): RoutePositionAtKP {
  if (Array.isArray(options.rplRecords) && options.rplRecords.length > 0) {
    const rplPosition = interpolateFromRplRecords(options.rplRecords, targetKP)
    if (rplPosition) return rplPosition
  }

  if (route?.points?.length) {
    const { segments } = buildRouteSegments(route)
    const routePosition = interpolateOnSegments(segments, targetKP, options.configuredTotalLength)
    if (routePosition) return routePosition
  }

  return {
    longitude: 0,
    latitude: 0,
    depth: 0,
    source: 'none',
  }
}
