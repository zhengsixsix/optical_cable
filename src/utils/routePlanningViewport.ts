export type RoutePlanningRectRange = [
  eastLongitude: number,
  westLongitude: number,
  southLatitude: number,
  northLatitude: number,
]

export type LonLatExtent = [minLongitude: number, minLatitude: number, maxLongitude: number, maxLatitude: number]

export const DEFAULT_CHINA_MAP_CENTER: [number, number] = [104, 35]
export const DEFAULT_CHINA_MAP_ZOOM = 4.6
export const DEFAULT_CHINA_LON_LAT_EXTENT: LonLatExtent = [73, 18, 135, 54]

const RECT_RANGE_DECIMALS = 6

function assertFiniteExtent(extent: LonLatExtent): void {
  if (extent.some(value => !Number.isFinite(value))) {
    throw new Error('地图视口范围包含无效坐标')
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function createRoutePlanningRectRangeFromExtent(
  extent: LonLatExtent,
  decimals = RECT_RANGE_DECIMALS,
): RoutePlanningRectRange {
  assertFiniteExtent(extent)

  const [x1, y1, x2, y2] = extent
  const westLongitude = clamp(Math.min(x1, x2), -180, 180)
  const eastLongitude = clamp(Math.max(x1, x2), -180, 180)
  const southLatitude = clamp(Math.min(y1, y2), -90, 90)
  const northLatitude = clamp(Math.max(y1, y2), -90, 90)

  return [
    roundTo(eastLongitude, decimals),
    roundTo(westLongitude, decimals),
    roundTo(southLatitude, decimals),
    roundTo(northLatitude, decimals),
  ]
}
