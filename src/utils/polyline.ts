export type LonLat = [number, number]

const EARTH_RADIUS_KM = 6371

export function calculateDistanceKm(a: LonLat, b: LonLat): number {
  const lat1 = a[1] * Math.PI / 180
  const lat2 = b[1] * Math.PI / 180
  const dLat = (b[1] - a[1]) * Math.PI / 180
  const dLon = (b[0] - a[0]) * Math.PI / 180
  const haversine = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function calculatePolylineLengthKm(coords: LonLat[]): number {
  if (coords.length < 2) return 0
  let total = 0
  for (let index = 1; index < coords.length; index++) {
    total += calculateDistanceKm(coords[index - 1], coords[index])
  }
  return total
}

export function slicePolylineByDistanceKm(coords: LonLat[], startKm: number, endKm: number): LonLat[] {
  if (coords.length < 2 || endKm <= startKm) return []

  const cumulative: number[] = [0]
  for (let index = 1; index < coords.length; index++) {
    cumulative[index] = cumulative[index - 1] + calculateDistanceKm(coords[index - 1], coords[index])
  }

  const totalLength = cumulative[cumulative.length - 1] || 0
  const start = Math.max(0, Math.min(startKm, totalLength))
  const end = Math.max(0, Math.min(endKm, totalLength))
  if (end <= start) return []

  const result: LonLat[] = []

  for (let index = 1; index < coords.length; index++) {
    const from = coords[index - 1]
    const to = coords[index]
    const segmentStart = cumulative[index - 1]
    const segmentEnd = cumulative[index]
    const segmentLength = segmentEnd - segmentStart

    if (segmentLength <= 0 || end < segmentStart || start > segmentEnd) continue

    const clippedStart = Math.max(start, segmentStart)
    const clippedEnd = Math.min(end, segmentEnd)
    const startFraction = (clippedStart - segmentStart) / segmentLength
    const endFraction = (clippedEnd - segmentStart) / segmentLength
    const startCoord: LonLat = [
      from[0] + (to[0] - from[0]) * startFraction,
      from[1] + (to[1] - from[1]) * startFraction,
    ]
    const endCoord: LonLat = [
      from[0] + (to[0] - from[0]) * endFraction,
      from[1] + (to[1] - from[1]) * endFraction,
    ]

    if (result.length === 0 || !sameCoord(result[result.length - 1], startCoord)) {
      result.push(startCoord)
    }

    for (let innerIndex = index; innerIndex < coords.length - 1; innerIndex++) {
      const innerCoord = coords[innerIndex]
      const innerDistance = cumulative[innerIndex]
      if (innerDistance > clippedStart && innerDistance < clippedEnd && !sameCoord(result[result.length - 1], innerCoord)) {
        result.push(innerCoord)
      }
    }

    if (!sameCoord(result[result.length - 1], endCoord)) {
      result.push(endCoord)
    }
  }

  return result
}

function sameCoord(a: LonLat | undefined, b: LonLat): boolean {
  return !!a && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9
}
