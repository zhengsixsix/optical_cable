/**
 * Converts algorithm route-planning payloads into the Route shape used by the
 * planning map. The current algorithm output is a bundle of JSON and matrix
 * files; future API responses can reuse this conversion layer.
 */

import type { CableSegment, RiskLevel, Route, RoutePoint, RouteSegment, RouteSegmentSource } from '@/types'

export interface RawPathResult {
  trace: number[][]
  real_trace?: number[][]
  total_cost?: number
  total_risk?: number
  length?: number
}

export interface RawSegmentResult {
  route_index: number
  segment_nodes: number[][]
  segments: Array<{
    segment_id: number
    start_node_id: number
    end_node_id: number
    cable_type: string
    length_km: number
  }>
  risk_level?: Array<{
    level: number
    risk_min: number
    risk_max: number
  }>
}

export interface RawStationPoint {
  id?: string | number
  name?: string
  longitude?: string | number
  latitude?: string | number
  sortNum?: string | number
}

export interface MatrixStats {
  rows: number
  columns: number
  min: number
  max: number
  avg: number
}

export interface MatrixPathSample {
  points: number
  min: number
  max: number
  avg: number
  start: number
  end: number
}

export interface MatrixGeoReference {
  west: number
  south: number
  east: number
  north: number
  rows: number
  columns: number
  rowStepDegrees: number
  columnStepDegrees: number
}

export interface AlgorithmRouteBundle {
  fmmPaths?: RawPathResult[]
  fixSpacing?: RawSegmentResult
  riskBased?: RawSegmentResult
  stationPoints?: RawStationPoint[]
  costMatrixText?: string
  riskMatrixText?: string
  source?: string
  files?: string[]
}

export interface SegmentVariantSet {
  fixedSpacing?: CableSegment[]
  riskBased?: CableSegment[]
}

export interface SegmentAttachmentDiagnostic {
  variant: 'fixedSpacing' | 'riskBased'
  routeIndex: number
  routeId?: string
  segmentCount: number
  sourceFile: string
  status: 'attached' | 'fallbackRoute' | 'missingRoute'
}

export interface AlgorithmRouteBundleResult {
  routes: Route[]
  segmentsByRouteId: Record<string, CableSegment[]>
  segmentVariantsByRouteId: Record<string, SegmentVariantSet>
  matrices: {
    cost?: number[][]
    risk?: number[][]
  }
  matrixGeoReference?: MatrixGeoReference
  diagnostics: {
    source: string
    version: string
    generatedAt: string
    files: string[]
    warnings: string[]
    fmmPathCount: number
    uniqueFmmPathCount: number
    duplicateFmmPathCount: number
    fmmTracePoints: number[]
    duplicateGroups: number[][]
    segmentAttachments: SegmentAttachmentDiagnostic[]
    costMatrix?: MatrixStats
    riskMatrix?: MatrixStats
  }
}

const RISK_SCORE: Record<RiskLevel, number> = {
  low: 0.18,
  medium: 0.38,
  high: 0.65,
}

function getRiskLevelFromDepth(depth: number): RiskLevel {
  if (depth < 500) return 'high'
  if (depth < 1500) return 'medium'
  return 'low'
}

function getRiskLevelFromValue(value: number): RiskLevel {
  if (value > 100000) return 'high'
  if (value > 10000) return 'medium'
  return 'low'
}

function getCableType(riskLevel: RiskLevel, fallback = ''): string {
  if (fallback) return fallback
  if (riskLevel === 'high') return 'DA'
  if (riskLevel === 'medium') return 'SA'
  return 'LW'
}

function getUnitPrice(riskLevel: RiskLevel): number {
  if (riskLevel === 'high') return 24
  if (riskLevel === 'medium') return 19.5
  return 15
}

function calculateDistance(p1: [number, number], p2: [number, number]): number {
  const radiusKm = 6371
  const dLat = (p2[1] - p1[1]) * Math.PI / 180
  const dLon = (p2[0] - p1[0]) * Math.PI / 180
  const lat1 = p1[1] * Math.PI / 180
  const lat2 = p2[1] * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type CoordinateOrder = 'lonLat' | 'latLon'

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

function isValidLonLatCoordinate(coord: [number, number]): boolean {
  return isValidLongitude(coord[0]) && isValidLatitude(coord[1])
}

function getAlgorithmCoordinatePair(point: number[]): [number, number] | null {
  const offset = point.length >= 3 ? 1 : 0
  const first = Number(point[offset])
  const second = Number(point[offset + 1])

  if (!Number.isFinite(first) || !Number.isFinite(second)) return null
  return [first, second]
}

function inferAlgorithmCoordinateOrder(points: number[][]): CoordinateOrder {
  let lonLatValid = 0
  let latLonValid = 0

  points.forEach(point => {
    const pair = getAlgorithmCoordinatePair(point)
    if (!pair) return

    const [first, second] = pair
    if (isValidLongitude(first) && isValidLatitude(second)) lonLatValid++
    if (isValidLongitude(second) && isValidLatitude(first)) latLonValid++
  })

  return latLonValid > lonLatValid ? 'latLon' : 'lonLat'
}

function normalizeAlgorithmCoordinate(point: number[], order: CoordinateOrder): [number, number] | null {
  const pair = getAlgorithmCoordinatePair(point)
  if (!pair) return null

  const [first, second] = pair
  const coord: [number, number] = order === 'latLon' ? [second, first] : [first, second]
  return isValidLonLatCoordinate(coord) ? coord : null
}

interface NormalizedStationPoint {
  name: string
  coordinates: [number, number]
  sortNum: number | undefined
}

function normalizeStationPoints(points: RawStationPoint[] = []): NormalizedStationPoint[] {
  return points
    .map(point => {
      const lon = Number(point.longitude)
      const lat = Number(point.latitude)
      const name = String(point.name || '').trim()
      if (!name || !isValidLongitude(lon) || !isValidLatitude(lat)) return null
      return {
        name,
        coordinates: [lon, lat] as [number, number],
        sortNum: Number.isFinite(Number(point.sortNum)) ? Number(point.sortNum) : undefined,
      }
    })
    .filter((point): point is NormalizedStationPoint => point !== null)
}

function getSquaredCoordinateDistance(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
}

function findNearestStationName(
  coord: [number, number] | undefined,
  stations: NormalizedStationPoint[],
  sortNum?: number,
): string | undefined {
  if (!coord || stations.length === 0) return undefined
  const candidates = sortNum === undefined
    ? stations
    : stations.filter(station => station.sortNum === sortNum)
  const source = candidates.length > 0 ? candidates : stations

  return source
    .map(station => ({
      station,
      distance: getSquaredCoordinateDistance(coord, station.coordinates),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.station.name
}

function applyStationNamesToRoute(route: Route, stationPoints: RawStationPoint[] = []): void {
  const stations = normalizeStationPoints(stationPoints)
  if (stations.length === 0 || route.points.length === 0) return

  const first = route.points[0]
  const last = route.points[route.points.length - 1]
  const startName = findNearestStationName(first.coordinates, stations, 1)
  const endName = findNearestStationName(last.coordinates, stations, 2)

  if (startName) first.name = startName
  if (endName) last.name = endName
}

function buildRouteCost(totalCost: number) {
  return {
    cable: Math.round(totalCost * 0.7),
    installation: Math.round(totalCost * 0.2),
    equipment: Math.round(totalCost * 0.1),
    total: Math.round(totalCost),
  }
}

function getAverageRisk(segments: RouteSegment[]): number {
  if (segments.length === 0) return RISK_SCORE.low
  return segments.reduce((sum, seg) => sum + RISK_SCORE[seg.riskLevel], 0) / segments.length
}

function parseMatrixStats(text?: string): MatrixStats | undefined {
  const matrix = parseMatrix(text)
  if (!matrix) return undefined

  return getMatrixStats(matrix)
}

function parseMatrix(text?: string): number[][] | undefined {
  if (!text?.trim()) return undefined

  const rows = text.trim().split(/\r?\n/).filter(Boolean)
  const matrix = rows
    .map(row => row.trim().split(/\s+/).map(Number).filter(Number.isFinite))
    .filter(row => row.length > 0)

  return matrix.length > 0 ? matrix : undefined
}

function getMatrixStats(matrix?: number[][]): MatrixStats | undefined {
  if (!matrix || matrix.length === 0) return undefined

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let sum = 0
  let count = 0
  let columns = 0

  for (const row of matrix) {
    columns = Math.max(columns, row.length)
    for (const value of row) {
      min = Math.min(min, value)
      max = Math.max(max, value)
      sum += value
      count++
    }
  }

  if (count === 0) return undefined
  return {
    rows: matrix.length,
    columns,
    min,
    max,
    avg: sum / count,
  }
}

function getMatrixDimensions(matrix?: number[][]): { rows: number; columns: number } | null {
  if (!matrix || matrix.length === 0) return null
  const columns = Math.max(...matrix.map(row => row.length), 0)
  if (columns === 0) return null
  return { rows: matrix.length, columns }
}

function fitLinear(samples: Array<[number, number]>): { intercept: number; slope: number } | null {
  if (samples.length < 2) return null

  const n = samples.length
  const sumX = samples.reduce((sum, [x]) => sum + x, 0)
  const sumY = samples.reduce((sum, [, y]) => sum + y, 0)
  const sumXX = samples.reduce((sum, [x]) => sum + x * x, 0)
  const sumXY = samples.reduce((sum, [x, y]) => sum + x * y, 0)
  const denominator = n * sumXX - sumX * sumX
  if (Math.abs(denominator) < 1e-12) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  return { intercept, slope }
}

function inferMatrixGeoReference(
  paths: RawPathResult[] = [],
  matrix?: number[][],
): MatrixGeoReference | undefined {
  const dimensions = getMatrixDimensions(matrix)
  if (!dimensions || !matrix) return undefined
  const matrixForIndex = matrix

  const rowLatSamples: Array<[number, number]> = []
  const colLonSamples: Array<[number, number]> = []
  const tracePointsForIndex: Array<[number, number]> = []

  paths.forEach(path => {
    const tracePoints = getPathTracePoints(path)
    const realCoordinates = extractRealTraceCoordinates(path)
    const count = Math.min(tracePoints.length, realCoordinates.length)
    for (let index = 0; index < count; index++) {
      const [row, col] = tracePoints[index]
      const [lon, lat] = realCoordinates[index]
      rowLatSamples.push([row, lat])
      colLonSamples.push([col, lon])
      tracePointsForIndex.push([row, col])
    }
  })

  if (rowLatSamples.length < 2 || colLonSamples.length < 2) return undefined

  const rowFit = fitLinear(rowLatSamples)
  const colFit = fitLinear(colLonSamples)
  if (!rowFit || !colFit) return undefined

  const oneBased = shouldUseOneBasedMatrixIndex(tracePointsForIndex, matrixForIndex)
  const firstIndex = oneBased ? 1 : 0
  const rowStartEdge = firstIndex - 0.5
  const rowEndEdge = firstIndex + dimensions.rows - 0.5
  const colStartEdge = firstIndex - 0.5
  const colEndEdge = firstIndex + dimensions.columns - 0.5

  const westEdge = colFit.intercept + colFit.slope * colStartEdge
  const eastEdge = colFit.intercept + colFit.slope * colEndEdge
  const firstRowEdgeLat = rowFit.intercept + rowFit.slope * rowStartEdge
  const lastRowEdgeLat = rowFit.intercept + rowFit.slope * rowEndEdge

  return {
    west: Math.min(westEdge, eastEdge),
    south: Math.min(firstRowEdgeLat, lastRowEdgeLat),
    east: Math.max(westEdge, eastEdge),
    north: Math.max(firstRowEdgeLat, lastRowEdgeLat),
    rows: dimensions.rows,
    columns: dimensions.columns,
    rowStepDegrees: rowFit.slope,
    columnStepDegrees: colFit.slope,
  }
}

function extractRealTraceCoordinates(pathResult?: RawPathResult): [number, number][] {
  const source = pathResult?.real_trace?.length ? pathResult.real_trace : []
  const order = inferAlgorithmCoordinateOrder(source)
  return source
    .map(point => normalizeAlgorithmCoordinate(point, order))
    .filter((coord): coord is [number, number] => coord !== null)
}

function getPathTracePoints(pathResult?: RawPathResult): Array<[number, number]> {
  return (pathResult?.trace || [])
    .map(point => [Number(point[1]), Number(point[2])] as [number, number])
    .filter(([row, col]) => Number.isFinite(row) && Number.isFinite(col))
}

function shouldUseOneBasedMatrixIndex(tracePoints: Array<[number, number]>, matrix: number[][]): boolean {
  if (tracePoints.length === 0 || matrix.length === 0) return false
  const rowCount = matrix.length
  const colCount = Math.max(...matrix.map(row => row.length), 0)
  return tracePoints.every(([row, col]) =>
    row >= 1 && col >= 1 && row <= rowCount && col <= colCount,
  )
}

function readMatrixValue(matrix: number[][], row: number, col: number, oneBased: boolean): number | null {
  const rowIndex = Math.trunc(oneBased ? row - 1 : row)
  const colIndex = Math.trunc(oneBased ? col - 1 : col)
  const value = matrix[rowIndex]?.[colIndex]
  return Number.isFinite(value) ? value : null
}

function sampleMatrixAlongPath(matrix: number[][] | undefined, pathResult?: RawPathResult): MatrixPathSample | undefined {
  if (!matrix || matrix.length === 0) return undefined

  const tracePoints = getPathTracePoints(pathResult)
  if (tracePoints.length === 0) return undefined

  const oneBased = shouldUseOneBasedMatrixIndex(tracePoints, matrix)
  const values = tracePoints
    .map(([row, col]) => readMatrixValue(matrix, row, col, oneBased))
    .filter((value): value is number => value !== null)

  if (values.length === 0) return undefined

  const min = Math.min(...values)
  const max = Math.max(...values)
  const sum = values.reduce((acc, value) => acc + value, 0)
  return {
    points: values.length,
    min,
    max,
    avg: sum / values.length,
    start: values[0],
    end: values[values.length - 1],
  }
}

function getFmmMetadata(pathResult?: RawPathResult) {
  const coords = extractRealTraceCoordinates(pathResult)
  if (!pathResult && coords.length === 0) return undefined

  return {
    pointCount: coords.length,
    length: pathResult?.length,
    totalCost: pathResult?.total_cost,
    totalRisk: pathResult?.total_risk,
  }
}

function getPathIdentity(pathResult: RawPathResult): string {
  const coords = extractRealTraceCoordinates(pathResult)
  const source = coords.length > 0
    ? coords
    : pathResult.trace.map(point => [Number(point[0]), Number(point[1])] as [number, number])

  return source
    .map(([a, b]) => `${a.toFixed(6)},${b.toFixed(6)}`)
    .join('|')
}

function getFmmPathMapping(paths: RawPathResult[] = []) {
  const identityGroups = new Map<string, number[]>()
  const routeEntries: Array<{
    path: RawPathResult
    originalIndex: number
    duplicateOriginalIndexes: number[]
  }> = []
  const originalIndexToUniqueIndex = new Map<number, number>()

  paths.forEach((path, originalIndex) => {
    const identity = getPathIdentity(path)
    if (!identity) return

    const group = identityGroups.get(identity) || []
    group.push(originalIndex)
    identityGroups.set(identity, group)
  })

  paths.forEach((path, originalIndex) => {
    const identity = getPathIdentity(path)
    if (!identity) return

    const routeIndex = routeEntries.length
    routeEntries.push({
      path,
      originalIndex,
      duplicateOriginalIndexes: identityGroups.get(identity) || [originalIndex],
    })
    originalIndexToUniqueIndex.set(originalIndex, routeIndex)
  })

  return {
    unique: routeEntries,
    originalIndexToUniqueIndex,
    duplicateGroups: Array.from(identityGroups.values()).filter(group => group.length > 1),
  }
}

function pickFmmPath(
  paths: RawPathResult[] | undefined,
  segmentResult: RawSegmentResult,
  routeOrdinal: number,
): RawPathResult | undefined {
  if (!paths || paths.length === 0) return undefined
  return paths[segmentResult.route_index] || paths[routeOrdinal] || paths[0]
}

function sampleMatrixValueAtTraceIndex(
  matrix: number[][] | undefined,
  pathResult: RawPathResult,
  index: number,
): number | null {
  if (!matrix || matrix.length === 0) return null
  const tracePoints = getPathTracePoints(pathResult)
  const tracePoint = tracePoints[index]
  if (!tracePoint) return null
  const oneBased = shouldUseOneBasedMatrixIndex(tracePoints, matrix)
  return readMatrixValue(matrix, tracePoint[0], tracePoint[1], oneBased)
}

function convertSegmentResultToCableSegments(
  segmentResult: RawSegmentResult,
  routeId: string,
  variant: 'fixedSpacing' | 'riskBased',
): CableSegment[] {
  let currentKp = 0

  return segmentResult.segments.map((segment, index) => {
    const riskInfo = segmentResult.risk_level?.[index]
    const riskLevel = riskInfo ? getRiskLevelFromValue(riskInfo.risk_max) : 'low'
    const length = Number(segment.length_km.toFixed(4))
    const startKp = currentKp
    const endKp = currentKp + length
    currentKp = endKp
    const cableType = getCableType(riskLevel, segment.cable_type)

    return {
      id: `${routeId}-${variant}-cable-${segment.segment_id}`,
      routeId,
      startKp: Number(startKp.toFixed(4)),
      endKp: Number(endKp.toFixed(4)),
      length,
      riskLevel,
      cableTypeId: cableType,
      cableTypeName: cableType,
      armorType: riskLevel === 'high' ? '双铠' : riskLevel === 'medium' ? '单铠' : '轻铠',
      slack: 3,
      burialDepth: riskLevel === 'high' ? 2 : riskLevel === 'medium' ? 1.5 : 1,
      geometryStartIndex: index,
      geometryEndIndex: index + 1,
      isLocked: false,
    }
  })
}

export function convertSegmentResultToRoute(
  segmentResult: RawSegmentResult,
  routeIndex: number,
  routeName: string,
  pathResult?: RawPathResult,
  matrices: { cost?: number[][]; risk?: number[][] } = {},
): Route {
  const now = new Date()
  const routeId = `algorithm-route-${routeIndex}`
  const nodeMap = new Map<number, [number, number]>()
  const segmentNodeCoordinateOrder = inferAlgorithmCoordinateOrder(segmentResult.segment_nodes)
  const segmentNodeEntries = segmentResult.segment_nodes
    .map((node, index) => {
      const nodeId = Number(node[0])
      const coordinates = normalizeAlgorithmCoordinate(node, segmentNodeCoordinateOrder)
      if (!Number.isFinite(nodeId) || !coordinates) return null
      return { nodeId, coordinates, sourceIndex: index }
    })
    .filter((entry): entry is { nodeId: number; coordinates: [number, number]; sourceIndex: number } => entry !== null)

  segmentNodeEntries.forEach(node => {
    nodeMap.set(node.nodeId, node.coordinates)
  })

  const points: RoutePoint[] = segmentResult.segment_nodes.map((node, index) => ({
    id: `${routeId}-p${node[0]}`,
    coordinates: nodeMap.get(Number(node[0])) || [Number(node[1]), Number(node[2])],
    type: index === 0 || index === segmentResult.segment_nodes.length - 1 ? 'landing' : 'waypoint',
    name: index === 0 ? '算法起点' : index === segmentResult.segment_nodes.length - 1 ? '算法终点' : `算法节点 ${node[0]}`,
    depth: index === 0 || index === segmentResult.segment_nodes.length - 1 ? 0 : 1000,
  }))

  const segments: RouteSegment[] = segmentResult.segments.map((seg, index) => {
    const riskInfo = segmentResult.risk_level?.[index]
    const riskLevel = riskInfo ? getRiskLevelFromValue(riskInfo.risk_max) : 'low'
    const cableType = getCableType(riskLevel, seg.cable_type)
    return {
      id: `${routeId}-s${seg.segment_id}`,
      startPointId: `${routeId}-p${seg.start_node_id}`,
      endPointId: `${routeId}-p${seg.end_node_id}`,
      length: Number(seg.length_km.toFixed(4)),
      depth: 1000,
      cableType,
      riskLevel,
      cost: Math.round(seg.length_km * getUnitPrice(riskLevel) * 1000),
    }
  })

  const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0)
  const totalCost = segments.reduce((sum, seg) => sum + seg.cost, 0)
  const avgRisk = getAverageRisk(segments)
  const fmmCoordinates = extractRealTraceCoordinates(pathResult)
  const rawTrunkCoordinates = fmmCoordinates.length >= 2
    ? fmmCoordinates
    : points.map(point => point.coordinates)
  const rawMatrixTraceCoordinates = getPathTracePoints(pathResult)

  return {
    id: routeId,
    name: routeName,
    points,
    segments,
    totalLength: Number(totalLength.toFixed(2)),
    totalCost: Math.round(totalCost),
    riskScore: avgRisk,
    cost: buildRouteCost(totalCost),
    risk: {
      seismic: Math.min(0.8, avgRisk + 0.04),
      volcanic: Math.max(0.05, avgRisk - 0.08),
      depth: avgRisk,
      overall: avgRisk,
    },
    distance: Number(totalLength.toFixed(2)),
    createdAt: now,
    updatedAt: now,
    rawTrunkCoordinates,
    rawMatrixTraceCoordinates,
    rawMatrixSamples: {
      cost: sampleMatrixAlongPath(matrices.cost, pathResult),
      risk: sampleMatrixAlongPath(matrices.risk, pathResult),
    },
    fmmPathMeta: getFmmMetadata(pathResult),
  }
}

export function convertPathResultToRoute(
  pathResult: RawPathResult,
  routeIndex: number,
  routeName: string,
  matrices: { cost?: number[][]; risk?: number[][] } = {},
): Route {
  const now = new Date()
  const routeId = `algorithm-fmm-route-${routeIndex}`
  const coordinates = extractRealTraceCoordinates(pathResult)
  const fallbackCoordinates: [number, number][] = pathResult.trace.map(point => [point[0], point[1]])
  const routeCoordinates = coordinates.length >= 2 ? coordinates : fallbackCoordinates

  const points: RoutePoint[] = routeCoordinates.map((coord, index) => ({
    id: `${routeId}-p${index}`,
    coordinates: coord,
    type: index === 0 || index === routeCoordinates.length - 1 ? 'landing' : 'waypoint',
    name: index === 0 ? '算法起点' : index === routeCoordinates.length - 1 ? '算法终点' : `路径点 ${index}`,
    depth: pathResult.trace[index]?.[2] || 0,
  }))

  const segments: RouteSegment[] = []
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const length = calculateDistance(routeCoordinates[i], routeCoordinates[i + 1])
    const depth = ((pathResult.trace[i]?.[2] || 0) + (pathResult.trace[i + 1]?.[2] || 0)) / 2 || 1000
    const riskStart = sampleMatrixValueAtTraceIndex(matrices.risk, pathResult, i)
    const riskEnd = sampleMatrixValueAtTraceIndex(matrices.risk, pathResult, i + 1)
    const sampledRisk = riskStart !== null && riskEnd !== null
      ? (riskStart + riskEnd) / 2
      : riskStart ?? riskEnd
    const riskLevel = sampledRisk !== null ? getRiskLevelFromValue(sampledRisk) : getRiskLevelFromDepth(depth)
    segments.push({
      id: `${routeId}-s${i}`,
      startPointId: `${routeId}-p${i}`,
      endPointId: `${routeId}-p${i + 1}`,
      length: Number(length.toFixed(2)),
      depth,
      cableType: getCableType(riskLevel),
      riskLevel,
      cost: Math.round(length * getUnitPrice(riskLevel) * 1000),
    })
  }

  const calculatedLength = segments.reduce((sum, seg) => sum + seg.length, 0)
  const calculatedCost = segments.reduce((sum, seg) => sum + seg.cost, 0)
  const totalLength = Number.isFinite(pathResult.length) ? pathResult.length! : calculatedLength
  const totalCost = Number.isFinite(pathResult.total_cost) ? pathResult.total_cost! : calculatedCost
  const avgRisk = getAverageRisk(segments)

  return {
    id: routeId,
    name: routeName,
    points,
    segments,
    totalLength: Number(totalLength.toFixed(2)),
    totalCost: Math.round(totalCost),
    riskScore: avgRisk,
    cost: buildRouteCost(totalCost),
    risk: {
      seismic: 0.2,
      volcanic: 0.1,
      depth: avgRisk,
      overall: avgRisk,
    },
    distance: Number(totalLength.toFixed(2)),
    createdAt: now,
    updatedAt: now,
    rawTrunkCoordinates: routeCoordinates,
    rawMatrixTraceCoordinates: getPathTracePoints(pathResult),
    rawMatrixSamples: {
      cost: sampleMatrixAlongPath(matrices.cost, pathResult),
      risk: sampleMatrixAlongPath(matrices.risk, pathResult),
    },
    fmmPathMeta: getFmmMetadata(pathResult),
  }
}

export function convertRouteToCableSegments(route: Route): CableSegment[] {
  let currentKp = 0
  return route.segments.map((segment, index) => {
    const startKp = currentKp
    const endKp = currentKp + segment.length
    currentKp = endKp

    return {
      id: `${route.id}-cable-${index + 1}`,
      routeId: route.id,
      startKp: Number(startKp.toFixed(4)),
      endKp: Number(endKp.toFixed(4)),
      length: Number(segment.length.toFixed(4)),
      riskLevel: segment.riskLevel,
      cableTypeId: segment.cableType,
      cableTypeName: segment.cableType,
      armorType: segment.riskLevel === 'high' ? '双铠' : segment.riskLevel === 'medium' ? '单铠' : '轻铠',
      slack: 3,
      burialDepth: segment.riskLevel === 'high' ? 2 : segment.riskLevel === 'medium' ? 1.5 : 1,
      geometryStartIndex: index,
      geometryEndIndex: index + 1,
      isLocked: false,
    }
  })
}

function summarizeSegments(segments: CableSegment[], source: RouteSegmentSource) {
  const highRiskLength = segments
    .filter(segment => segment.riskLevel === 'high')
    .reduce((sum, segment) => sum + segment.length, 0)
  const mediumRiskLength = segments
    .filter(segment => segment.riskLevel === 'medium')
    .reduce((sum, segment) => sum + segment.length, 0)
  const lowRiskLength = segments
    .filter(segment => segment.riskLevel === 'low')
    .reduce((sum, segment) => sum + segment.length, 0)

  return {
    highRiskLength: Number(highRiskLength.toFixed(4)),
    mediumRiskLength: Number(mediumRiskLength.toFixed(4)),
    lowRiskLength: Number(lowRiskLength.toFixed(4)),
    armorEstimatedCost: Number((
      highRiskLength * getUnitPrice('high') +
      mediumRiskLength * getUnitPrice('medium') +
      lowRiskLength * getUnitPrice('low')
    ).toFixed(4)),
    segmentSource: source,
  }
}

function getSegmentTotalLength(segments: CableSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.length, 0)
}

function getDefaultSegmentsForRoute(
  route: Route,
  variants: SegmentVariantSet,
): { segments: CableSegment[]; source: RouteSegmentSource } {
  if (variants.riskBased?.length) {
    return { segments: variants.riskBased, source: 'riskBased' }
  }
  if (variants.fixedSpacing?.length) {
    return { segments: variants.fixedSpacing, source: 'fixedSpacing' }
  }

  const fallback = convertRouteToCableSegments(route)
  if (fallback.length > 0) {
    return { segments: fallback, source: 'fmmFallback' }
  }

  return { segments: [], source: 'none' }
}

function applySegmentGeometryToRoute(route: Route, segmentResult: RawSegmentResult, routeIndex: number): void {
  const segmentRoute = convertSegmentResultToRoute(segmentResult, routeIndex, route.name)
  const sourceRouteId = segmentRoute.id
  const retargetId = (id: string) => id.replace(sourceRouteId, route.id)

  route.points = segmentRoute.points.map(point => ({
    ...point,
    id: retargetId(point.id),
  }))
  route.segments = segmentRoute.segments.map(segment => ({
    ...segment,
    id: retargetId(segment.id),
    startPointId: retargetId(segment.startPointId),
    endPointId: retargetId(segment.endPointId),
  }))
}

export function convertAlgorithmRouteBundle(bundle: AlgorithmRouteBundle): AlgorithmRouteBundleResult {
  const routes: Route[] = []
  const costMatrix = parseMatrix(bundle.costMatrixText)
  const riskMatrix = parseMatrix(bundle.riskMatrixText)
  const originalFmmIndexToRouteId = new Map<number, string>()
  const routeFmmInfoByRouteId = new Map<string, { originalIndex: number; duplicateOriginalIndexes: number[] }>()
  const geometrySegmentByRouteId = new Map<string, RawSegmentResult>()
  const warnings: string[] = []
  const segmentAttachments: SegmentAttachmentDiagnostic[] = []
  const {
    unique: uniqueFmmPaths,
    originalIndexToUniqueIndex,
    duplicateGroups,
  } = getFmmPathMapping(bundle.fmmPaths || [])

  uniqueFmmPaths.forEach(({ path, originalIndex, duplicateOriginalIndexes }) => {
    const route = convertPathResultToRoute(
      path,
      routes.length,
      `路由方案 ${routes.length + 1}`,
      { cost: costMatrix, risk: riskMatrix },
    )
    routes.push(route)
    originalFmmIndexToRouteId.set(originalIndex, route.id)
    routeFmmInfoByRouteId.set(route.id, { originalIndex, duplicateOriginalIndexes })
  })

  if ((bundle.fmmPaths?.length || 0) === 0) {
    warnings.push('缺少路线结果文件，无法生成正式路由主线')
  }

  if (bundle.costMatrixText && !costMatrix) {
    warnings.push('cost.txt 矩阵解析失败')
  }

  if (bundle.riskMatrixText && !riskMatrix) {
    warnings.push('risk.txt 矩阵解析失败')
  }

  const segmentVariantsByRouteId = routes.reduce<Record<string, SegmentVariantSet>>((acc, route) => {
    acc[route.id] = {}
    return acc
  }, {})

  const attachSegmentVariant = (
    segmentResult: RawSegmentResult | undefined,
    variant: 'fixedSpacing' | 'riskBased',
  ) => {
    if (!segmentResult) return

    const sourceFile = variant === 'riskBased'
      ? 'segment_result_base_Risk.json'
      : 'segment_result_base_FixSpacing.json'

    if (routes.length === 0) {
      segmentAttachments.push({
        variant,
        routeIndex: segmentResult.route_index,
        segmentCount: segmentResult.segments.length,
        sourceFile,
        status: 'missingRoute',
      })
      warnings.push(`${sourceFile} 未能关联路线：缺少可见主路线`)
      return
    }

    const uniqueIndex = originalIndexToUniqueIndex.get(segmentResult.route_index)
    const routeId = originalFmmIndexToRouteId.get(segmentResult.route_index) || routes[segmentResult.route_index]?.id || routes[0].id
    const status: SegmentAttachmentDiagnostic['status'] = uniqueIndex === undefined ? 'fallbackRoute' : 'attached'
    const relatedOriginalIndexes = routeFmmInfoByRouteId.get(routeId)?.duplicateOriginalIndexes || [segmentResult.route_index]
    const relatedRouteIds = Array.from(new Set(
      relatedOriginalIndexes
        .map(index => originalFmmIndexToRouteId.get(index))
        .filter((id): id is string => Boolean(id)),
    ))
    if (relatedRouteIds.length === 0) relatedRouteIds.push(routeId)

    relatedRouteIds.forEach(relatedRouteId => {
      if (!segmentVariantsByRouteId[relatedRouteId]) segmentVariantsByRouteId[relatedRouteId] = {}
      const segments = convertSegmentResultToCableSegments(segmentResult, relatedRouteId, variant)
      segmentVariantsByRouteId[relatedRouteId][variant] = segments
      if (variant === 'riskBased' || !geometrySegmentByRouteId.has(relatedRouteId)) {
        geometrySegmentByRouteId.set(relatedRouteId, segmentResult)
      }
      segmentAttachments.push({
        variant,
        routeIndex: segmentResult.route_index,
        routeId: relatedRouteId,
        segmentCount: segments.length,
        sourceFile,
        status,
      })

      const route = routes.find(item => item.id === relatedRouteId)
      const routeLength = route?.totalLength || 0
      const segmentLength = getSegmentTotalLength(segments)
      if (routeLength > 0 && Math.abs(segmentLength - routeLength) / routeLength > 0.01) {
        warnings.push(`${sourceFile} segment length ${segmentLength.toFixed(4)} km differs from ${route?.name || relatedRouteId} length ${routeLength.toFixed(4)} km by more than 1%`)
      }
    })
  }

  attachSegmentVariant(bundle.fixSpacing, 'fixedSpacing')
  attachSegmentVariant(bundle.riskBased, 'riskBased')

  routes.forEach((route, index) => {
    const segmentResult = geometrySegmentByRouteId.get(route.id)
    if (segmentResult) applySegmentGeometryToRoute(route, segmentResult, index)
    applyStationNamesToRoute(route, bundle.stationPoints)
  })

  const segmentsByRouteId = routes.reduce<Record<string, CableSegment[]>>((acc, route) => {
    const variants = segmentVariantsByRouteId[route.id] || {}
    const { segments, source } = getDefaultSegmentsForRoute(route, variants)
    acc[route.id] = segments
    const fmmInfo = routeFmmInfoByRouteId.get(route.id)
    route.algorithmSummary = {
      originalFmmIndex: fmmInfo?.originalIndex,
      duplicateOriginalIndexes: fmmInfo?.duplicateOriginalIndexes,
      algorithmTotalCost: route.fmmPathMeta?.totalCost,
      algorithmTotalRisk: route.fmmPathMeta?.totalRisk,
      ...summarizeSegments(segments, source),
    }
    return acc
  }, {})

  const duplicateFmmPathCount = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0)
  const matrixGeoReference = inferMatrixGeoReference(bundle.fmmPaths || [], riskMatrix || costMatrix)

  return {
    routes,
    segmentsByRouteId,
    segmentVariantsByRouteId,
    matrices: {
      cost: costMatrix,
      risk: riskMatrix,
    },
    matrixGeoReference,
    diagnostics: {
      source: bundle.source || 'route_planning_results.zip',
      version: 'algorithm-preview-2026-07-03',
      generatedAt: new Date().toISOString(),
      files: bundle.files || [],
      warnings,
      fmmPathCount: bundle.fmmPaths?.length || 0,
      uniqueFmmPathCount: (bundle.fmmPaths?.length || 0) - duplicateFmmPathCount,
      duplicateFmmPathCount,
      fmmTracePoints: bundle.fmmPaths?.map(path => path.real_trace?.length || path.trace?.length || 0) || [],
      duplicateGroups,
      segmentAttachments,
      costMatrix: getMatrixStats(costMatrix),
      riskMatrix: getMatrixStats(riskMatrix),
    },
  }
}
