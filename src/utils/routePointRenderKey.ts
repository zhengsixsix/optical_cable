export function getSharedRoutePointRenderKey(
  pointType: string,
  coordinates: [number, number],
): string | null {
  if (pointType !== 'landing' && pointType !== 'branching') return null

  const [lon, lat] = coordinates
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

  return `${pointType}:${lon.toFixed(6)},${lat.toFixed(6)}`
}
