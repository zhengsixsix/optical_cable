import type {
  CableSegment,
  ConnectorElement,
  RPLPointType,
  RPLRecord,
  RPLTable,
  Route,
  RoutePoint,
} from '@/types'

/**
 * Builds the RPL view from data that is already present in the application.
 *
 * This builder deliberately does not invent engineering values.  KP values,
 * cable attributes, slack, burial depth, and water depth are copied from an
 * existing connector/cable segment/route field when one is available; missing
 * numeric fields are represented by zero because the RPL model requires them.
 */
export interface ExistingRplDataSource {
  route?: Route | null
  routeId?: string | null
  routeName?: string | null
  connectorElements?: ConnectorElement[]
  cableSegments?: CableSegment[]
}

type DraftRecord = Omit<RPLRecord, 'id' | 'sequence' | 'slack' | 'burialDepth'> & {
  id?: string
  sequence?: number
  hasExplicitKp?: boolean
  slack?: number
  burialDepth?: number
  hasExplicitDepth?: boolean
  hasExplicitSlack?: boolean
  hasExplicitBurialDepth?: boolean
  hasExplicitRemarks?: boolean
}

const POINT_TYPE_ORDER: Record<RPLPointType, number> = {
  landing: 0,
  repeater: 1,
  branching: 2,
  joint: 3,
  waypoint: 4,
}

const SYNCABLE_CONNECTOR_TYPES = new Set<ConnectorElement['type']>([
  'landing',
  'underwater',
  'amplifier_e',
  'amplifier_w',
  'ola',
  'bu',
  'joint',
])

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const numberOrZero = (value: unknown): number => toFiniteNumber(value) ?? 0

const nonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
    return undefined
  }
  const result = String(value).trim()
  return result || undefined
}

const coordinatesFromPoint = (point: RoutePoint | undefined): [number, number] => [
  numberOrZero(point?.coordinates?.[0]),
  numberOrZero(point?.coordinates?.[1]),
]

const pointTypeFromConnector = (type: ConnectorElement['type']): RPLPointType | null => {
  switch (type) {
    case 'landing':
    case 'underwater':
      // RPL has no separate underwater-site type. Keep the historical mapping
      // so an explicit underwater connector remains visible as a landing point.
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

const pointTypeFromRoute = (type: string | undefined): RPLPointType => {
  switch (type) {
    case 'landing':
    case 'repeater':
    case 'branching':
    case 'joint':
    case 'waypoint':
      return type
    default:
      return 'waypoint'
  }
}

const pointName = (name: unknown, fallback: string): string =>
  nonEmptyString(name) || fallback

const cableTypeFromElement = (element: ConnectorElement): string =>
  // RPL's Cable Type column is an ARMORING_TYPE code. Prefer the explicit
  // armor code, then a reference code, and only use a display name when no
  // code-like source is available.
  nonEmptyString(element.armorType)
  || nonEmptyString(element.cableTypeId)
  || nonEmptyString(element.cableTypeName)
  || ''

const cableTypeFromSegment = (segment: CableSegment): string =>
  nonEmptyString(segment.armorType)
  || nonEmptyString(segment.cableTypeId)
  || nonEmptyString(segment.cableTypeName)
  || ''

const segmentField = (segment: Route['segments'][number] | null | undefined, ...keys: string[]): unknown => {
  if (!segment) return undefined
  const source = segment as unknown as Record<string, unknown>
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key]
    }
  }
  return undefined
}

/**
 * Route segments are a second explicit source of cable attributes.  Convert
 * them to the same range model used by the cable-segment store, but only when
 * each range length (or its explicit KP bounds) is present.  This keeps route
 * geometry from becoming an inferred engineering segment.
 */
function buildRouteCableSegments(route: Route | null | undefined): CableSegment[] {
  const routeSegments = Array.isArray(route?.segments) ? route.segments : []
  if (routeSegments.length === 0) return []

  const result: CableSegment[] = []
  let cumulativeKp = 0
  let cumulativeKpIsReliable = true

  routeSegments.forEach((routeSegment, index) => {
    const explicitStartKp = toFiniteNumber(segmentField(routeSegment, 'startKp', 'startKpKm', 'start_kp'))
    const explicitEndKp = toFiniteNumber(segmentField(routeSegment, 'endKp', 'endKpKm', 'end_kp'))
    const explicitLength = toFiniteNumber(segmentField(routeSegment, 'length', 'lengthKm', 'length_km'))
    if (explicitStartKp === undefined && !cumulativeKpIsReliable) return
    const startKp = explicitStartKp ?? cumulativeKp
    const endKp = explicitEndKp
      ?? (explicitLength !== undefined ? startKp + Math.max(0, explicitLength) : undefined)
    if (endKp === undefined || endKp < startKp) {
      cumulativeKpIsReliable = false
      return
    }

    const cableTypeId = nonEmptyString(segmentField(
      routeSegment,
      'cableTypeId',
      'cable_type_ref',
      'cableTypeRef',
    ))
    const cableTypeName = nonEmptyString(segmentField(
      routeSegment,
      'cableTypeName',
      'cable_type',
      'cableType',
    )) || nonEmptyString(routeSegment.cableType)
    const armorType = nonEmptyString(segmentField(
      routeSegment,
      'armorType',
      'armor_type',
      'armoringType',
      'armoring_type',
    ))
    const waterDepth = toFiniteNumber(segmentField(
      routeSegment,
      'waterDepth',
      'waterDepthM',
      'water_depth',
      'depth',
    ))
    const slack = toFiniteNumber(segmentField(
      routeSegment,
      'slack',
      'slackPercent',
      'slack_percent',
    ))
    const burialDepth = toFiniteNumber(segmentField(
      routeSegment,
      'burialDepth',
      'burialDepthM',
      'burial_depth_m',
    ))

    if (cableTypeId || cableTypeName || armorType || waterDepth !== undefined
      || slack !== undefined || burialDepth !== undefined) {
      result.push({
        id: routeSegment.id || `route-segment-${index + 1}`,
        routeId: route?.id || '',
        startKp,
        endKp,
        length: Math.max(0, endKp - startKp),
        ...(cableTypeId ? { cableTypeId } : {}),
        ...(cableTypeName ? { cableTypeName } : {}),
        ...(armorType ? { armorType } : {}),
        ...(waterDepth !== undefined ? { waterDepth } : {}),
        ...(slack !== undefined ? { slack } : {}),
        ...(burialDepth !== undefined ? { burialDepth } : {}),
      })
    }

    cumulativeKp = Math.max(cumulativeKp, endKp)
    cumulativeKpIsReliable = true
  })

  return result
}

const inRange = (value: number, start: number, end: number): boolean => {
  const low = Math.min(start, end)
  const high = Math.max(start, end)
  return value >= low - 0.001 && value <= high + 0.001
}

const SEGMENT_BOUNDARY_TOLERANCE_KM = 0.001

const segmentForKp = (segments: CableSegment[], kp: number): CableSegment | null => {
  if (segments.length === 0) return null
  const ranges = segments.flatMap(segment => {
    const start = toFiniteNumber(segment.startKp)
    const end = toFiniteNumber(segment.endKp)
    if (start === undefined || end === undefined) return []
    return [{ segment, low: Math.min(start, end), high: Math.max(start, end) }]
  })
  const matching = ranges.find(range => kp >= range.low && kp <= range.high)
  if (matching) return matching.segment

  // A rounded route endpoint can sit just outside an explicit segment range.
  // Permit only a one-metre boundary tolerance; a distant segment must not
  // lend its cable, slack, burial, or depth attributes to an unrelated point.
  const closest = ranges.reduce<(typeof ranges)[number] | null>((current, range) => {
    if (!current) return range
    const distance = kp < range.low ? range.low - kp : kp - range.high
    const currentDistance = kp < current.low ? current.low - kp : kp - current.high
    return distance < currentDistance ? range : current
  }, null)
  if (!closest) return null
  const distance = kp < closest.low ? closest.low - kp : kp - closest.high
  return distance <= SEGMENT_BOUNDARY_TOLERANCE_KM ? closest.segment : null
}

const sameCoordinate = (left: DraftRecord, right: DraftRecord): boolean =>
  Math.abs(left.longitude - right.longitude) <= 0.00001
  && Math.abs(left.latitude - right.latitude) <= 0.00001

const samePoint = (left: DraftRecord, right: DraftRecord): boolean => {
  if (left.pointType !== right.pointType) return false
  // A platform entity without coordinates is normalised to (0, 0). Do not
  // let that fallback accidentally overwrite a real route endpoint at KP 0.
  const hasMeaningfulCoordinates = Math.abs(left.longitude) > 0.000001
    || Math.abs(left.latitude) > 0.000001
    || Math.abs(right.longitude) > 0.000001
    || Math.abs(right.latitude) > 0.000001
  if (hasMeaningfulCoordinates && sameCoordinate(left, right)) return true
  // KP 0 is a valid route origin. Unknown platform KP fallbacks have already
  // been filtered out, so two explicit zero-position records may be merged.
  return left.hasExplicitKp !== false
    && right.hasExplicitKp !== false
    && Math.abs(left.kp - right.kp) <= 0.5
}

const sortDraftRecords = (records: DraftRecord[]): DraftRecord[] =>
  [...records].sort((left, right) =>
    left.kp - right.kp
    || POINT_TYPE_ORDER[left.pointType] - POINT_TYPE_ORDER[right.pointType]
    || (left.sequence ?? 0) - (right.sequence ?? 0),
  )

function buildRouteRecords(route: Route | null | undefined): DraftRecord[] {
  const points = Array.isArray(route?.points) ? route!.points : []
  if (points.length === 0) return []

  const routeSegments = Array.isArray(route?.segments) ? route!.segments : []
  const totalLength = toFiniteNumber(route?.totalLength)
    ?? toFiniteNumber(route?.distance)

  // RoutePoint's public type predates backend KP extensions.  Preserve those
  // values when present instead of deriving positions from geometry.
  const explicitPointKp = (point: RoutePoint): number | undefined => {
    const source = point as unknown as Record<string, unknown>
    return toFiniteNumber(
      source.kp
      ?? source.positionKm
      ?? source.position_km
      ?? source.kpKm
      ?? source.kp_km,
    )
  }

  const pointKps: Array<number | undefined> = []
  const pointKpIsExplicit: boolean[] = []
  let cumulativeKp = 0
  let cumulativeReliable = true

  points.forEach((point, index) => {
    const pointKp = explicitPointKp(point)
    if (pointKp !== undefined) {
      pointKps[index] = pointKp
      pointKpIsExplicit[index] = true
      cumulativeKp = pointKp
      cumulativeReliable = true
      return
    }

    if (index === 0) {
      // Route KP starts at zero when no other source says otherwise. This is
      // the same neutral start position used by the legacy RPL model.
      pointKps[index] = 0
      pointKpIsExplicit[index] = true
      cumulativeKp = 0
      cumulativeReliable = true
      return
    }

    const segment = routeSegments[index - 1]
    const explicitStartKp = toFiniteNumber(segmentField(segment, 'startKp', 'startKpKm', 'start_kp'))
    const explicitEndKp = toFiniteNumber(segmentField(segment, 'endKp', 'endKpKm', 'end_kp'))
    const explicitLength = toFiniteNumber(segmentField(segment, 'length', 'lengthKm', 'length_km'))

    if (explicitEndKp !== undefined && (explicitStartKp === undefined || explicitEndKp >= explicitStartKp)) {
      pointKps[index] = explicitEndKp
      pointKpIsExplicit[index] = true
      cumulativeKp = explicitEndKp
      cumulativeReliable = true
      return
    }

    if (explicitStartKp !== undefined && explicitLength !== undefined) {
      cumulativeKp = explicitStartKp + Math.max(0, explicitLength)
      pointKps[index] = cumulativeKp
      pointKpIsExplicit[index] = true
      cumulativeReliable = true
      return
    }

    if (explicitLength !== undefined && cumulativeReliable) {
      cumulativeKp += Math.max(0, explicitLength)
      pointKps[index] = cumulativeKp
      pointKpIsExplicit[index] = true
      return
    }

    // Do not turn an unknown intermediate point into a guessed KP. A final
    // route total is still an explicit source for the last point.
    if (index === points.length - 1 && totalLength !== undefined) {
      pointKps[index] = totalLength
      pointKpIsExplicit[index] = true
      cumulativeKp = totalLength
      cumulativeReliable = true
      return
    }

    pointKps[index] = undefined
    pointKpIsExplicit[index] = false
    cumulativeReliable = false
  })

  return points.flatMap((point, index): DraftRecord[] => {
    const kp = pointKps[index]
    if (kp === undefined) return []
    const previousKp = index > 0 ? pointKps[index - 1] : undefined
    const segmentLength = index === 0 || previousKp === undefined
      ? 0
      : Math.max(0, kp - previousKp)
    const coordinates = coordinatesFromPoint(point)
    const fallbackName = index === 0
      ? '起点（未提供名称）'
      : index === points.length - 1
        ? '终点（未提供名称）'
        : '未提供'
    return [{
      id: point.id,
      kp,
      hasExplicitKp: pointKpIsExplicit[index],
      longitude: coordinates[0],
      latitude: coordinates[1],
      depth: numberOrZero(point.depth),
      hasExplicitDepth: toFiniteNumber(point.depth) !== undefined,
      pointType: pointTypeFromRoute(point.type),
      cableType: '',
      segmentLength,
      cumulativeLength: kp,
      remarks: pointName(point.name, fallbackName),
      hasExplicitRemarks: Boolean(nonEmptyString(point.name)),
    }]
  })
}

function buildConnectorRecords(elements: ConnectorElement[]): DraftRecord[] {
  return elements
    .filter(element => SYNCABLE_CONNECTOR_TYPES.has(element.type) && element.hasExplicitKp !== false)
    .map((element, index): DraftRecord | null => {
      const pointType = pointTypeFromConnector(element.type)
      if (!pointType) return null
      const record: DraftRecord = {
        id: `rpl-connector-${element.id}`,
        kp: numberOrZero(element.kp),
        hasExplicitKp: element.hasExplicitKp ?? true,
        longitude: numberOrZero(element.longitude),
        latitude: numberOrZero(element.latitude),
        depth: numberOrZero(element.depth),
        hasExplicitDepth: toFiniteNumber(element.depth) !== undefined,
        pointType,
        cableType: cableTypeFromElement(element),
        segmentLength: numberOrZero(element.length),
        cumulativeLength: numberOrZero(element.kp),
        slack: toFiniteNumber(element.slack),
        burialDepth: toFiniteNumber(element.burialDepth),
        hasExplicitSlack: toFiniteNumber(element.slack) !== undefined,
        hasExplicitBurialDepth: toFiniteNumber(element.burialDepth) !== undefined,
        remarks: pointName(element.name || element.remarks, `未提供（接线元 ${index + 1}）`),
        hasExplicitRemarks: Boolean(nonEmptyString(element.name) || nonEmptyString(element.remarks)),
        sequence: index,
      }
      return record
    })
    .filter((record): record is DraftRecord => record !== null)
}

function mergeRouteAndConnectorRecords(
  routeRecords: DraftRecord[],
  connectorRecords: DraftRecord[],
): DraftRecord[] {
  const merged = routeRecords.map(record => ({ ...record }))

  connectorRecords.forEach(connector => {
    const matchingIndex = merged.findIndex(routeRecord => samePoint(routeRecord, connector))
    if (matchingIndex < 0) {
      merged.push({ ...connector })
      return
    }

    const routeRecord = merged[matchingIndex]
    const connectorHasExplicitKp = connector.hasExplicitKp !== false
    merged[matchingIndex] = {
      ...routeRecord,
      ...connector,
      // Keep a stable route-point id when one exists, while retaining the
      // connector id in the remarks/source data for traceability.
      id: routeRecord.id || connector.id,
      kp: connectorHasExplicitKp ? connector.kp : routeRecord.kp,
      segmentLength: connectorHasExplicitKp ? connector.segmentLength : routeRecord.segmentLength,
      cumulativeLength: connectorHasExplicitKp ? connector.cumulativeLength : routeRecord.cumulativeLength,
      hasExplicitKp: connectorHasExplicitKp || routeRecord.hasExplicitKp,
      depth: connector.hasExplicitDepth ? connector.depth : routeRecord.depth,
      hasExplicitDepth: connector.hasExplicitDepth || routeRecord.hasExplicitDepth,
      remarks: connector.hasExplicitRemarks ? connector.remarks : routeRecord.remarks,
      hasExplicitRemarks: connector.hasExplicitRemarks || routeRecord.hasExplicitRemarks,
    }
  })

  return merged
}

function applyCableSegments(records: DraftRecord[], segments: CableSegment[]): DraftRecord[] {
  if (segments.length === 0) return records

  return records.map(record => {
    const segment = segmentForKp(segments, record.kp)
    if (!segment) return record

    const segmentCableType = cableTypeFromSegment(segment)
    const segmentSlack = toFiniteNumber(segment.slack)
    const segmentBurialDepth = toFiniteNumber(segment.burialDepth)
    const segmentDepth = toFiniteNumber(segment.waterDepth)

    return {
      ...record,
      cableType: record.cableType || segmentCableType,
      depth: record.hasExplicitDepth ? record.depth : segmentDepth || 0,
      hasExplicitDepth: record.hasExplicitDepth || segmentDepth !== undefined,
      ...(record.hasExplicitSlack ? {} : segmentSlack !== undefined ? {
        slack: segmentSlack,
        hasExplicitSlack: true,
      } : {}),
      ...(record.hasExplicitBurialDepth ? {} : segmentBurialDepth !== undefined ? {
        burialDepth: segmentBurialDepth,
        hasExplicitBurialDepth: true,
      } : {}),
    }
  })
}

function finalizeRecords(records: DraftRecord[]): RPLRecord[] {
  const sorted = sortDraftRecords(records)
  let previousKp = 0

  return sorted.map((record, index) => {
    const kp = numberOrZero(record.kp)
    const segmentLength = index === 0
      ? 0
      : Math.max(0, kp - previousKp)
    previousKp = kp

    return {
      id: record.id || `rpl-record-${index + 1}`,
      sequence: index + 1,
      kp,
      longitude: numberOrZero(record.longitude),
      latitude: numberOrZero(record.latitude),
      depth: numberOrZero(record.depth),
      pointType: record.pointType,
      cableType: record.cableType || '',
      segmentLength,
      cumulativeLength: kp,
      slack: numberOrZero(record.slack),
      burialDepth: numberOrZero(record.burialDepth),
      remarks: record.remarks || '未提供',
    }
  })
}

const calculateMetadata = (records: RPLRecord[], explicitTotalLength = 0): RPLTable['metadata'] => {
  const totalLength = explicitTotalLength > 0
    ? explicitTotalLength
    : records[records.length - 1]?.kp || 0
  const depths = records.map(record => record.depth)

  return {
    totalLength,
    // No cable-length/slack estimate is made here. This field is populated by
    // imported/backend RPL data when present, and remains zero for auto tables.
    totalCableLength: 0,
    landingStations: records.filter(record => record.pointType === 'landing').length,
    repeaters: records.filter(record => record.pointType === 'repeater').length,
    branchingUnits: records.filter(record => record.pointType === 'branching').length,
    joints: records.filter(record => record.pointType === 'joint').length,
    averageDepth: depths.length > 0 ? depths.reduce((sum, depth) => sum + depth, 0) / depths.length : 0,
    maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
    minDepth: depths.length > 0 ? Math.min(...depths) : 0,
  }
}

export function buildRplTableFromExistingData(source: ExistingRplDataSource): RPLTable | null {
  const route = source.route || null
  const routeId = nonEmptyString(source.routeId) || nonEmptyString(route?.id) || null
  const connectorElements = source.connectorElements || []
  const storedCableSegments = (source.cableSegments || [])
    .filter(segment => !routeId || !segment.routeId || String(segment.routeId) === String(routeId))
    .sort((left, right) => numberOrZero(left.startKp) - numberOrZero(right.startKp))
  const routeCableSegments = buildRouteCableSegments(route)
  // Prefer the dedicated cable-segment store when both sources describe the
  // same range; route segments still fill ranges that are not stored there.
  const cableSegments = [
    ...storedCableSegments,
    ...routeCableSegments.filter(routeSegment => !storedCableSegments.some(stored =>
      inRange(numberOrZero(routeSegment.startKp), numberOrZero(stored.startKp), numberOrZero(stored.endKp))
      && inRange(numberOrZero(routeSegment.endKp), numberOrZero(stored.startKp), numberOrZero(stored.endKp))
    )),
  ]
    .sort((left, right) => numberOrZero(left.startKp) - numberOrZero(right.startKp))

  const routeRecords = buildRouteRecords(route)
  const connectorRecords = buildConnectorRecords(connectorElements)
  if (routeRecords.length === 0 && connectorRecords.length === 0) return null

  const records = finalizeRecords(
    applyCableSegments(
      mergeRouteAndConnectorRecords(routeRecords, connectorRecords),
      cableSegments,
    ),
  )

  const explicitTotalLength = toFiniteNumber(route?.totalLength)
    ?? toFiniteNumber(route?.distance)
    ?? (cableSegments.length > 0
      ? Math.max(...cableSegments.map(segment => numberOrZero(segment.endKp)))
      : 0)
  const nameBase = nonEmptyString(source.routeName) || nonEmptyString(route?.name) || '当前路由'
  const routeKey = routeId ? String(routeId).replace(/[^a-zA-Z0-9_-]+/g, '-') : 'current'
  const now = new Date()

  return {
    id: `rpl-auto-${routeKey}`,
    name: `${nameBase.replace(/_RPL$/i, '')}_RPL`,
    routeId: routeId || 'route-main',
    autoGenerated: true,
    records,
    metadata: calculateMetadata(records, explicitTotalLength || 0),
    createdAt: now,
    updatedAt: now,
  }
}
