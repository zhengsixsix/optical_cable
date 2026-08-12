export type LonLatCoordinate = [longitude: number, latitude: number]

const isFiniteCoordinate = (coordinate: unknown): coordinate is LonLatCoordinate =>
  Array.isArray(coordinate)
  && coordinate.length >= 2
  && Number.isFinite(Number(coordinate[0]))
  && Number.isFinite(Number(coordinate[1]))

export const nearestPointOnRoute = (
  coordinate: LonLatCoordinate,
  routeCoordinates: LonLatCoordinate[],
): LonLatCoordinate | null => {
  const validCoordinates = routeCoordinates.filter(isFiniteCoordinate)
  if (validCoordinates.length === 0 || !isFiniteCoordinate(coordinate)) return null
  if (validCoordinates.length === 1) return [...validCoordinates[0]]

  const latitudeRadians = coordinate[1] * Math.PI / 180
  const longitudeScale = Math.max(Math.cos(latitudeRadians), 1e-6)
  const project = ([longitude, latitude]: LonLatCoordinate): [number, number] => [
    longitude * longitudeScale,
    latitude,
  ]
  const unproject = ([x, y]: [number, number]): LonLatCoordinate => [x / longitudeScale, y]
  const target = project(coordinate)

  let nearest: LonLatCoordinate | null = null
  let nearestDistanceSquared = Number.POSITIVE_INFINITY

  for (let index = 0; index < validCoordinates.length - 1; index += 1) {
    const start = project(validCoordinates[index])
    const end = project(validCoordinates[index + 1])
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const lengthSquared = dx * dx + dy * dy
    const ratio = lengthSquared > 0
      ? Math.min(1, Math.max(0, ((target[0] - start[0]) * dx + (target[1] - start[1]) * dy) / lengthSquared))
      : 0
    const candidate: [number, number] = [start[0] + ratio * dx, start[1] + ratio * dy]
    const distanceSquared = (candidate[0] - target[0]) ** 2 + (candidate[1] - target[1]) ** 2

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared
      nearest = unproject(candidate)
    }
  }

  return nearest
}
