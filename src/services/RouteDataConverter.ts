import type { CableSegment, Route, RoutePoint } from '@/types'

export type RouteCoordinateOrder = 'longitude-latitude' | 'latitude-longitude'

export interface RawPathResult {
  trace?: number[][]
  real_trace?: number[][]
  total_cost?: number
  total_risk?: number
  length?: number
}

export interface RawSegmentItem {
  segment_id?: string | number
  start_node_id?: string | number
  end_node_id?: string | number
  cable_type?: string | null
  length_km?: string | number | null
}

export interface RawSegmentRiskLevel {
  level?: string | number | null
  risk_min?: string | number | null
  risk_max?: string | number | null
}

export interface RawSegmentResult {
  route_index?: string | number | null
  segment_nodes?: number[][] | null
  segments?: RawSegmentItem[] | null
  risk_level?: RawSegmentRiskLevel[] | null
  [key: string]: unknown
}

export interface RawStationPoint {
  id?: string | number
  name?: string
  longitude?: string | number
  latitude?: string | number
  sortNum?: string | number
}

export interface NumericSeriesStats {
  sampleCount: number
  min: number
  max: number
  average: number
  shape: 'flat' | 'matrix'
  rows?: number
  columns?: number
}

export interface SegmentValueSummary {
  value: string | null
  segmentCount: number
  lengthKm: number
}

export interface SegmentRiskLevelSummary extends SegmentValueSummary {
  riskMin?: number
  riskMax?: number
}

export interface SegmentResultAnalysis {
  kind: 'fixedSpacing' | 'riskBased'
  sourceFile: 'segment_result_base_FixSpacing.json' | 'segment_result_base_Risk.json'
  routeIndex?: number
  segmentCount: number
  totalLengthKm?: number
  missingLengthCount: number
  cableTypes: SegmentValueSummary[]
  riskLevels: SegmentRiskLevelSummary[]
  warnings: string[]
}

export interface RoutePlanningRawResultFiles {
  pointList?: RawStationPoint[] | null
  'FMM_path_result.json'?: RawPathResult[] | null
  'segment_result_base_FixSpacing.json'?: RawSegmentResult | null
  'segment_result_base_Risk.json'?: RawSegmentResult | null
  'cost.txt'?: string | null
  'risk.txt'?: string | null
}

export interface AlgorithmRouteBundle {
  fmmPaths?: RawPathResult[]
  fixedSpacing?: RawSegmentResult
  riskBased?: RawSegmentResult
  stationPoints?: RawStationPoint[]
  costText?: string
  riskText?: string
  source?: string
  files?: string[]
}

export interface AlgorithmRouteBundleResult {
  routes: Route[]
  /** Segment side files are retained for analysis, but never turned into project cable segments here. */
  segmentsByRouteId: Record<string, CableSegment[]>
  rawResultFiles: RoutePlanningRawResultFiles
  analysis: {
    costSamples?: NumericSeriesStats
    riskSamples?: NumericSeriesStats
    segmentResults: SegmentResultAnalysis[]
  }
  diagnostics: {
    source: string
    version: string
    generatedAt: string
    files: string[]
    warnings: string[]
    fmmPathCount: number
  }
}

function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

function coordinatePair(point: number[]): [number, number] | null {
  const offset = point.length >= 3 ? 1 : 0
  const first = Number(point[offset])
  const second = Number(point[offset + 1])
  return Number.isFinite(first) && Number.isFinite(second) ? [first, second] : null
}

function inferCoordinateOrder(points: number[][]): RouteCoordinateOrder {
  let longitudeLatitudeOnly = 0
  let latitudeLongitudeOnly = 0

  for (const point of points) {
    const pair = coordinatePair(point)
    if (!pair) continue
    const [first, second] = pair
    const longitudeLatitude = isValidLongitude(first) && isValidLatitude(second)
    const latitudeLongitude = isValidLatitude(first) && isValidLongitude(second)
    if (longitudeLatitude && !latitudeLongitude) longitudeLatitudeOnly++
    if (latitudeLongitude && !longitudeLatitude) latitudeLongitudeOnly++
  }

  return latitudeLongitudeOnly > longitudeLatitudeOnly
    ? 'latitude-longitude'
    : 'longitude-latitude'
}

function extractRealTraceCoordinates(pathResult?: RawPathResult): {
  coordinates: [number, number][]
  order: RouteCoordinateOrder
} {
  const points = pathResult?.real_trace ?? []
  const order = inferCoordinateOrder(points)
  const coordinates = points
    .map(point => {
      const pair = coordinatePair(point)
      if (!pair) return null
      const coordinate: [number, number] = order === 'latitude-longitude'
        ? [pair[1], pair[0]]
        : pair
      return isValidLongitude(coordinate[0]) && isValidLatitude(coordinate[1])
        ? coordinate
        : null
    })
    .filter((coordinate): coordinate is [number, number] => coordinate !== null)

  return { coordinates, order }
}

function getStationName(stations: RawStationPoint[] | undefined, sortNum: number): string | undefined {
  const station = stations?.find(item => toFiniteNumber(item.sortNum) === sortNum)
  const name = typeof station?.name === 'string' ? station.name.trim() : ''
  return name || undefined
}

export function summarizeNumericSeries(text?: string): NumericSeriesStats | undefined {
  if (!text?.trim()) return undefined

  const rows = text.split(/\r?\n/).map(row => row.trim()).filter(Boolean)
  const rowCounts: number[] = []
  let sampleCount = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  const numberPattern = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g

  for (const row of rows) {
    let rowCount = 0
    for (const match of row.matchAll(numberPattern)) {
      const value = Number(match[0])
      if (!Number.isFinite(value)) continue
      rowCount++
      sampleCount++
      min = Math.min(min, value)
      max = Math.max(max, value)
      sum += value
    }
    if (rowCount > 0) rowCounts.push(rowCount)
  }

  if (sampleCount === 0) return undefined
  const rectangular = rowCounts.length > 1 && rowCounts.every(count => count === rowCounts[0])
  return {
    sampleCount,
    min,
    max,
    average: sum / sampleCount,
    shape: rectangular ? 'matrix' : 'flat',
    ...(rectangular ? { rows: rowCounts.length, columns: rowCounts[0] } : {}),
  }
}

function addSegmentValue(
  groups: Map<string, SegmentValueSummary>,
  value: string | null,
  lengthKm: number,
): void {
  const key = value === null ? '__missing__' : value
  const existing = groups.get(key) ?? { value, segmentCount: 0, lengthKm: 0 }
  existing.segmentCount++
  existing.lengthKm += lengthKm
  groups.set(key, existing)
}

function addRiskLevelValue(
  groups: Map<string, SegmentRiskLevelSummary>,
  value: string | null,
  lengthKm: number,
  riskMin?: number,
  riskMax?: number,
): void {
  const key = value === null ? '__missing__' : value
  const existing = groups.get(key) ?? { value, segmentCount: 0, lengthKm: 0 }
  existing.segmentCount++
  existing.lengthKm += lengthKm
  if (riskMin !== undefined) existing.riskMin = existing.riskMin === undefined ? riskMin : Math.min(existing.riskMin, riskMin)
  if (riskMax !== undefined) existing.riskMax = existing.riskMax === undefined ? riskMax : Math.max(existing.riskMax, riskMax)
  groups.set(key, existing)
}

function analyzeSegmentResult(
  result: RawSegmentResult,
  kind: SegmentResultAnalysis['kind'],
): SegmentResultAnalysis {
  const segments = Array.isArray(result.segments) ? result.segments : []
  const riskLevels = Array.isArray(result.risk_level) ? result.risk_level : []
  const cableTypeGroups = new Map<string, SegmentValueSummary>()
  const riskLevelGroups = new Map<string, SegmentRiskLevelSummary>()
  const warnings: string[] = []
  let totalLengthKm = 0
  let finiteLengthCount = 0
  let missingLengthCount = 0

  segments.forEach((segment, index) => {
    const length = toFiniteNumber(segment.length_km)
    const lengthKm = length === undefined ? 0 : length
    if (length === undefined) {
      missingLengthCount++
    } else {
      finiteLengthCount++
      totalLengthKm += length
    }

    const cableType = typeof segment.cable_type === 'string' && segment.cable_type.trim()
      ? segment.cable_type.trim()
      : null
    addSegmentValue(cableTypeGroups, cableType, lengthKm)

    const risk = riskLevels[index]
    const level = risk?.level === null || risk?.level === undefined || String(risk.level).trim() === ''
      ? null
      : String(risk.level).trim()
    addRiskLevelValue(
      riskLevelGroups,
      level,
      lengthKm,
      toFiniteNumber(risk?.risk_min),
      toFiniteNumber(risk?.risk_max),
    )
  })

  if (segments.length === 0) warnings.push('分段结果未包含 segments')
  if (missingLengthCount > 0) warnings.push(`${missingLengthCount} 个分段未提供 length_km`)
  if (kind === 'riskBased' && riskLevels.length !== segments.length) {
    warnings.push(`risk_level 数量 ${riskLevels.length} 与 segments 数量 ${segments.length} 不一致`)
  }

  return {
    kind,
    sourceFile: kind === 'riskBased'
      ? 'segment_result_base_Risk.json'
      : 'segment_result_base_FixSpacing.json',
    routeIndex: toFiniteNumber(result.route_index),
    segmentCount: segments.length,
    ...(finiteLengthCount > 0 ? { totalLengthKm } : {}),
    missingLengthCount,
    cableTypes: Array.from(cableTypeGroups.values()),
    riskLevels: Array.from(riskLevelGroups.values()),
    warnings,
  }
}

export function convertPathResultToRoute(
  pathResult: RawPathResult,
  routeIndex: number,
  routeName: string,
  stationPoints: RawStationPoint[] = [],
): Route | null {
  const { coordinates, order } = extractRealTraceCoordinates(pathResult)
  if (coordinates.length < 2) return null

  const now = new Date()
  const routeId = `backend-route-${routeIndex}`
  const startName = getStationName(stationPoints, 1)
  const endName = getStationName(stationPoints, 2)
  const totalLength = toFiniteNumber(pathResult.length)
  const totalCost = toFiniteNumber(pathResult.total_cost)
  const totalRisk = toFiniteNumber(pathResult.total_risk)
  const points: RoutePoint[] = coordinates.map((coordinate, pointIndex) => {
    const isStart = pointIndex === 0
    const isEnd = pointIndex === coordinates.length - 1
    return {
      id: `${routeId}-point-${pointIndex}`,
      coordinates: coordinate,
      type: isStart || isEnd ? 'landing' : 'waypoint',
      name: isStart ? (startName ?? '起点') : isEnd ? (endName ?? '终点') : undefined,
    }
  })

  return {
    id: routeId,
    name: routeName,
    points,
    segments: [],
    ...(totalLength === undefined ? {} : { totalLength, distance: totalLength }),
    ...(totalCost === undefined ? {} : { totalCost }),
    ...(totalRisk === undefined ? {} : { riskScore: totalRisk }),
    cost: totalCost === undefined ? {} : { total: totalCost },
    risk: totalRisk === undefined ? {} : { overall: totalRisk },
    createdAt: now,
    updatedAt: now,
    rawTrunkCoordinates: coordinates,
    algorithmSummary: {
      originalFmmIndex: routeIndex,
      coordinateOrder: order,
      realTracePointCount: coordinates.length,
    },
  }
}

export function convertAlgorithmRouteBundle(bundle: AlgorithmRouteBundle): AlgorithmRouteBundleResult {
  const warnings: string[] = []
  const paths = bundle.fmmPaths ?? []
  const routes = paths.flatMap((path, routeIndex) => {
    const route = convertPathResultToRoute(
      path,
      routeIndex,
      `路由方案 ${routeIndex + 1}`,
      bundle.stationPoints,
    )
    if (route) return [route]
    warnings.push(`FMM_path_result.json 路线 ${routeIndex + 1} 缺少有效 real_trace 经纬度坐标`)
    return []
  })

  if (paths.length === 0) warnings.push('缺少 FMM_path_result.json 路线结果')

  const segmentResults = [
    ...(bundle.riskBased ? [analyzeSegmentResult(bundle.riskBased, 'riskBased')] : []),
    ...(bundle.fixedSpacing ? [analyzeSegmentResult(bundle.fixedSpacing, 'fixedSpacing')] : []),
  ]
  segmentResults.forEach(result => {
    result.warnings.forEach(warning => warnings.push(`${result.sourceFile}: ${warning}`))
  })

  const segmentsByRouteId = Object.fromEntries(
    routes.map(route => [route.id, [] as CableSegment[]]),
  )
  const rawResultFiles: RoutePlanningRawResultFiles = {}
  if (bundle.stationPoints !== undefined) rawResultFiles.pointList = bundle.stationPoints
  if (bundle.fmmPaths !== undefined) rawResultFiles['FMM_path_result.json'] = bundle.fmmPaths
  if (bundle.fixedSpacing !== undefined) rawResultFiles['segment_result_base_FixSpacing.json'] = bundle.fixedSpacing
  if (bundle.riskBased !== undefined) rawResultFiles['segment_result_base_Risk.json'] = bundle.riskBased
  if (bundle.costText !== undefined) rawResultFiles['cost.txt'] = bundle.costText
  if (bundle.riskText !== undefined) rawResultFiles['risk.txt'] = bundle.riskText

  return {
    routes,
    segmentsByRouteId,
    rawResultFiles,
    analysis: {
      costSamples: summarizeNumericSeries(bundle.costText),
      riskSamples: summarizeNumericSeries(bundle.riskText),
      segmentResults,
    },
    diagnostics: {
      source: bundle.source || 'route-planning-result',
      version: 'backend-route-analysis-2026-07-24',
      generatedAt: new Date().toISOString(),
      files: bundle.files || [],
      warnings,
      fmmPathCount: paths.length,
    },
  }
}
