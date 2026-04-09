import { calculateDistance } from '@/utils/geo'
import type { Route, RoutePoint, RouteSegment } from '@/types/route'

type RouteLike = Partial<Pick<Route, 'segments' | 'points' | 'rawTrunkCoordinates' | 'totalLength'>>

const toSafeLength = (value: unknown): number => {
  const length = Number(value)
  return Number.isFinite(length) && length > 0 ? length : 0
}

export function calculatePolylineLengthKm(coords: [number, number][]): number {
  if (!Array.isArray(coords) || coords.length < 2) return 0
  let total = 0
  for (let index = 1; index < coords.length; index++) {
    total += calculateDistance(coords[index - 1], coords[index])
  }
  return total
}

export function calculateRouteTrunkLengthKm(route: RouteLike | null | undefined): number {
  if (!route) return 0

  const segments = (route.segments || []) as RouteSegment[]
  if (segments.length > 0) {
    const trunkSegments = segments.filter(segment => typeof segment.id === 'string' && segment.id.startsWith('trunk-'))
    if (trunkSegments.length > 0) {
      const trunkLength = trunkSegments.reduce((sum, segment) => sum + toSafeLength(segment.length), 0)
      if (trunkLength > 0) return trunkLength
    }

    const nonBranchSegments = segments.filter(segment => !(typeof segment.id === 'string' && segment.id.startsWith('branch-')))
    if (nonBranchSegments.length > 0) {
      const nonBranchLength = nonBranchSegments.reduce((sum, segment) => sum + toSafeLength(segment.length), 0)
      if (nonBranchLength > 0) return nonBranchLength
    }

    const points = (route.points || []) as Array<RoutePoint & { isBranchStation?: boolean }>
    const branchLandingIds = new Set(points.filter(point => point.isBranchStation).map(point => point.id))
    if (branchLandingIds.size > 0) {
      const trunkByLandingFilter = segments
        .filter(segment => !branchLandingIds.has(segment.startPointId) && !branchLandingIds.has(segment.endPointId))
        .reduce((sum, segment) => sum + toSafeLength(segment.length), 0)
      if (trunkByLandingFilter > 0) return trunkByLandingFilter
    }
  }

  const rawTrunkCoordinates = (route.rawTrunkCoordinates || []) as [number, number][]
  const rawTrunkLength = calculatePolylineLengthKm(rawTrunkCoordinates)
  if (rawTrunkLength > 0) return rawTrunkLength

  return toSafeLength(route.totalLength)
}
