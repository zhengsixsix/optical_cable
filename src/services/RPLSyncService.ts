import type {
  CableSegment,
  ConnectorElement,
  ConnectorType,
  RPLCableCode,
  RPLMetadata,
  RPLPointType,
  RPLRecord,
  RPLTable,
  Route,
  RoutePoint,
  RouteSegment,
} from '@/types'

const SYNCABLE_CONNECTOR_TYPES: ConnectorType[] = [
  'landing',
  'underwater',
  'amplifier_e',
  'amplifier_w',
  'ola',
  'bu',
  'joint',
]

const POINT_TYPE_ORDER: Record<RPLPointType, number> = {
  landing: 0,
  repeater: 1,
  branching: 2,
  joint: 3,
  waypoint: 4,
}

const CABLE_CODE_PATTERN = /(LWS|SAS|LW|SA|DA)/i
const KP_MATCH_TOLERANCE = 0.5
const COORD_TOLERANCE = 0.0001

export interface ImportedRplSyncPayload {
  route: Route | null
  connectorElements: ConnectorElement[]
  routePlanningConfig: {
    startPoint: { name?: string; lon: number; lat: number }
    endPoint: { name?: string; lon: number; lat: number }
    isConfigured: boolean
  } | null
}

export interface ExportableRplSnapshotParams {
  baseTable: RPLTable
  route?: Route | null
  connectorElements?: ConnectorElement[]
  cableSegments?: CableSegment[]
}

const roundTo = (value: number, decimals = 3) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const getRecordKp = (record: Pick<RPLRecord, 'kp' | 'cumulativeLength'>) => {
  if (isFiniteNumber(record.kp)) return record.kp
  if (isFiniteNumber(record.cumulativeLength)) return record.cumulativeLength
  return 0
}

const sortRecords = (records: RPLRecord[]) =>
  [...records].sort((left, right) => {
    const leftKp = getRecordKp(left)
    const rightKp = getRecordKp(right)

    if (leftKp !== rightKp) {
      return leftKp - rightKp
    }

    if (left.pointType !== right.pointType) {
      return POINT_TYPE_ORDER[left.pointType] - POINT_TYPE_ORDER[right.pointType]
    }

    return left.sequence - right.sequence
  })

const getDefaultPointName = (pointType: RPLPointType, index: number) => {
  const sequence = index + 1
  switch (pointType) {
    case 'landing':
      return `登陆站-${sequence}`
    case 'repeater':
      return `放大器-${sequence}`
    case 'branching':
      return `分支器-${sequence}`
    case 'joint':
      return `接头盒-${sequence}`
    default:
      return `路径点-${sequence}`
  }
}

const normalizeCableCode = (value?: string | null): RPLCableCode => {
  const match = value?.match(CABLE_CODE_PATTERN)?.[1]?.toUpperCase()
  if (match === 'LWS' || match === 'SAS' || match === 'LW' || match === 'SA' || match === 'DA') {
    return match
  }
  return 'LW'
}

const mapRplPointTypeToConnectorType = (pointType: RPLPointType, depth = 0): ConnectorType => {
  switch (pointType) {
    case 'landing':
      return depth > 0 ? 'underwater' : 'landing'
    case 'repeater':
      return 'amplifier_e'
    case 'branching':
      return 'bu'
    case 'joint':
      return 'joint'
    default:
      return 'underwater'
  }
}

const mapConnectorTypeToRplPointType = (type: ConnectorType): RPLPointType | null => {
  switch (type) {
    case 'landing':
    case 'underwater':
      return 'landing'
    case 'amplifier_e':
    case 'amplifier_w':
    case 'ola':
      return 'repeater'
    case 'bu':
      return 'branching'
    case 'joint':
      return 'joint'
    default:
      return null
  }
}

const getSegmentForKp = (segments: CableSegment[], kp: number) => {
  if (segments.length === 0) return null

  const exact = segments.find(segment => kp >= segment.startKp && kp <= segment.endKp + 0.001)
  if (exact) return exact

  if (kp <= segments[0].startKp) return segments[0]
  return segments[segments.length - 1]
}

const cloneRecord = (record: RPLRecord): RPLRecord => ({
  ...record,
})

export const calculateRplMetadata = (records: RPLRecord[]): RPLMetadata => {
  if (records.length === 0) {
    return {
      totalLength: 0,
      totalCableLength: 0,
      landingStations: 0,
      repeaters: 0,
      branchingUnits: 0,
      joints: 0,
      averageDepth: 0,
      maxDepth: 0,
      minDepth: 0,
    }
  }

  const depths = records.map(record => record.depth || 0)
  const totalLength = roundTo(records[records.length - 1]?.kp || 0)
  const totalCableLength = roundTo(records.reduce((sum, record) => {
    const segmentLength = record.segmentLength || 0
    const slack = record.slack || 0
    return sum + segmentLength * (1 + slack / 100)
  }, 0))

  return {
    totalLength,
    totalCableLength,
    landingStations: records.filter(record => record.pointType === 'landing').length,
    repeaters: records.filter(record => record.pointType === 'repeater').length,
    branchingUnits: records.filter(record => record.pointType === 'branching').length,
    joints: records.filter(record => record.pointType === 'joint').length,
    averageDepth: roundTo(depths.reduce((sum, depth) => sum + depth, 0) / depths.length, 1),
    maxDepth: Math.max(...depths),
    minDepth: Math.min(...depths),
  }
}

export const applyCableSegmentsToRplRecords = (
  records: RPLRecord[],
  cableSegments: CableSegment[] = [],
) => {
  if (records.length === 0 || cableSegments.length === 0) {
    return records.map(cloneRecord)
  }

  const sortedSegments = [...cableSegments].sort((left, right) => left.startKp - right.startKp)

  return records.map(record => {
    const matchSegment = getSegmentForKp(sortedSegments, getRecordKp(record))
    if (!matchSegment) {
      return cloneRecord(record)
    }

    return {
      ...record,
      cableType: normalizeCableCode(matchSegment.cableTypeName || matchSegment.cableTypeId || record.cableType),
      slack: matchSegment.slack,
      burialDepth: matchSegment.burialDepth,
    }
  })
}

const buildRecordFromConnector = (element: ConnectorElement, fallbackIndex: number): RPLRecord | null => {
  const pointType = mapConnectorTypeToRplPointType(element.type)
  if (!pointType) return null

  return {
    id: element.id || `sync-record-${fallbackIndex + 1}`,
    sequence: fallbackIndex + 1,
    kp: roundTo(element.kp || 0),
    longitude: element.longitude || 0,
    latitude: element.latitude || 0,
    depth: element.depth || 0,
    pointType,
    cableType: normalizeCableCode(element.cableTypeName || element.cableTypeId),
    segmentLength: 0,
    cumulativeLength: roundTo(element.kp || 0),
    slack: element.slack ?? 0,
    burialDepth: element.burialDepth ?? 0,
    remarks: element.name || element.remarks || getDefaultPointName(pointType, fallbackIndex),
  }
}

const isSameCoordinate = (left: RPLRecord, right: RPLRecord) =>
  Math.abs((left.longitude || 0) - (right.longitude || 0)) <= COORD_TOLERANCE &&
  Math.abs((left.latitude || 0) - (right.latitude || 0)) <= COORD_TOLERANCE

const findMatchingRecordIndex = (records: RPLRecord[], nextRecord: RPLRecord) => {
  const sameTypeIndex = records.findIndex(record =>
    record.pointType === nextRecord.pointType &&
    Math.abs(getRecordKp(record) - getRecordKp(nextRecord)) <= KP_MATCH_TOLERANCE,
  )
  if (sameTypeIndex >= 0) return sameTypeIndex

  const sameCoordIndex = records.findIndex(record =>
    Math.abs(getRecordKp(record) - getRecordKp(nextRecord)) <= KP_MATCH_TOLERANCE &&
    isSameCoordinate(record, nextRecord),
  )
  if (sameCoordIndex >= 0) return sameCoordIndex

  return records.findIndex(record =>
    record.pointType === 'waypoint' &&
    Math.abs(getRecordKp(record) - getRecordKp(nextRecord)) <= KP_MATCH_TOLERANCE,
  )
}

const normalizeRplRecords = (records: RPLRecord[]) => {
  const sorted = sortRecords(records)
  let previousKp = 0

  return sorted.map((record, index) => {
    const kp = roundTo(getRecordKp(record))
    const segmentLength = index === 0 ? 0 : roundTo(Math.max(0, kp - previousKp))
    previousKp = kp

    return {
      ...record,
      id: record.id || `rpl-record-${index + 1}`,
      sequence: index + 1,
      kp,
      cumulativeLength: kp,
      segmentLength,
      cableType: normalizeCableCode(record.cableType),
      slack: isFiniteNumber(record.slack) ? record.slack : 0,
      burialDepth: isFiniteNumber(record.burialDepth) ? record.burialDepth : 0,
      remarks: record.remarks || '',
    }
  })
}

export const buildRouteFromRplTable = (table: RPLTable, routeName?: string): Route | null => {
  const orderedRecords = normalizeRplRecords(table.records)
  if (orderedRecords.length === 0) return null

  const points: RoutePoint[] = orderedRecords.map((record, index) => ({
    id: record.id,
    coordinates: [record.longitude, record.latitude],
    type: record.pointType,
    name: record.remarks || getDefaultPointName(record.pointType, index),
    depth: record.depth,
  }))

  const segments: RouteSegment[] = orderedRecords.slice(1).map((record, index) => {
    const previous = orderedRecords[index]
    return {
      id: `${table.routeId || 'route'}-seg-${index + 1}`,
      startPointId: previous.id,
      endPointId: record.id,
      length: roundTo(Math.max(0, record.kp - previous.kp)),
      depth: record.depth || previous.depth || 0,
      cableType: record.cableType || previous.cableType || 'LW',
      riskLevel: 'low',
      cost: 0,
    }
  })

  const totalLength = orderedRecords[orderedRecords.length - 1]?.kp || 0
  const name = routeName || table.name

  return {
    id: table.routeId || 'route-main',
    name,
    points,
    segments,
    totalLength,
    totalCost: 0,
    riskScore: 0,
    cost: { cable: 0, installation: 0, equipment: 0, total: 0 },
    risk: { seismic: 0, volcanic: 0, depth: 0, overall: 0 },
    distance: totalLength,
    createdAt: table.createdAt instanceof Date ? table.createdAt : new Date(table.createdAt),
    updatedAt: new Date(),
  }
}

export const buildConnectorElementsFromRplTable = (table: RPLTable): ConnectorElement[] =>
  normalizeRplRecords(table.records)
    .filter(record => record.pointType !== 'waypoint')
    .map((record, index) => ({
      id: `connector-${record.id}`,
      name: record.remarks || getDefaultPointName(record.pointType, index),
      type: mapRplPointTypeToConnectorType(record.pointType, record.depth),
      kp: record.kp,
      longitude: record.longitude,
      latitude: record.latitude,
      depth: record.depth,
      status: 'active',
      specifications: '',
      remarks: record.remarks || '',
    }))

export const buildImportedRplSyncPayload = (
  table: RPLTable,
  routeName?: string,
): ImportedRplSyncPayload => {
  const route = buildRouteFromRplTable(table, routeName)
  const connectorElements = buildConnectorElementsFromRplTable(table)
  const normalizedRecords = normalizeRplRecords(table.records)
  const landingRecords = normalizedRecords.filter(record => record.pointType === 'landing')
  const startRecord = landingRecords[0] || normalizedRecords[0]
  const endRecord = landingRecords[landingRecords.length - 1] || normalizedRecords[normalizedRecords.length - 1]

  const routePlanningConfig = startRecord && endRecord
    ? {
        startPoint: {
          name: startRecord.remarks || undefined,
          lon: startRecord.longitude,
          lat: startRecord.latitude,
        },
        endPoint: {
          name: endRecord.remarks || undefined,
          lon: endRecord.longitude,
          lat: endRecord.latitude,
        },
        isConfigured: true,
      }
    : null

  return {
    route,
    connectorElements,
    routePlanningConfig,
  }
}

export const buildExportableRplTableSnapshot = ({
  baseTable,
  route,
  connectorElements = [],
  cableSegments = [],
}: ExportableRplSnapshotParams): RPLTable => {
  const mergedRecords = normalizeRplRecords(baseTable.records)

  const syncableConnectors = connectorElements
    .filter(element => SYNCABLE_CONNECTOR_TYPES.includes(element.type))
    .sort((left, right) => (left.kp || 0) - (right.kp || 0))

  syncableConnectors.forEach((element, index) => {
    const recordFromConnector = buildRecordFromConnector(element, index)
    if (!recordFromConnector) return

    const existingIndex = findMatchingRecordIndex(mergedRecords, recordFromConnector)
    if (existingIndex >= 0) {
      mergedRecords[existingIndex] = {
        ...mergedRecords[existingIndex],
        ...recordFromConnector,
        id: mergedRecords[existingIndex].id,
      }
      return
    }

    mergedRecords.push(recordFromConnector)
  })

  const normalizedRecords = normalizeRplRecords(applyCableSegmentsToRplRecords(mergedRecords, cableSegments))

  return {
    ...baseTable,
    routeId: route?.id || baseTable.routeId,
    name: baseTable.name,
    records: normalizedRecords,
    metadata: calculateRplMetadata(normalizedRecords),
    createdAt: baseTable.createdAt instanceof Date ? baseTable.createdAt : new Date(baseTable.createdAt),
    updatedAt: new Date(),
  }
}
