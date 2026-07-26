import type {
  CableSegment,
  ConnectorElement,
  Route,
  SLDEquipment,
  SLDEquipmentType,
  SLDFiberSegment,
} from '@/types'
import {
  buildSldEquipmentConfigParams,
  resolveSldSymbolCode,
} from '@/services/sldDeviceRegistry'

/**
 * A source-keyed draft used when the SLD view is opened without a persisted
 * SLD table.  The key is deliberately kept outside the SLD model: the store
 * creates the actual equipment/segment ids, while the draft can still connect
 * segments to the equipment created in the same pass.
 */
export interface SLDExistingEquipmentDraft {
  key: string
  aliases?: string[]
  hasExplicitKp: boolean
  data: Omit<SLDEquipment, 'id' | 'sequence'>
}

export interface SLDExistingSegmentDraft {
  fromKey: string
  toKey: string
  data: Omit<
    SLDFiberSegment,
    'id' | 'sequence' | 'fromEquipmentId' | 'toEquipmentId' | 'fromName' | 'toName'
  >
}

export interface SLDExistingDataDraft {
  tableName: string
  routeId?: string
  equipments: SLDExistingEquipmentDraft[]
  fiberSegments: SLDExistingSegmentDraft[]
}

const CONNECTOR_TO_SLD_TYPE: Partial<Record<ConnectorElement['type'], SLDEquipmentType>> = {
  landing: 'TE',
  underwater: 'PFE',
  amplifier_e: 'REP',
  amplifier_w: 'REP',
  ola: 'REP',
  bu: 'BU',
  equalizer: 'EQ',
  joint: 'JOINT',
}

const ROUTE_POINT_TO_SLD_TYPE: Record<string, SLDEquipmentType> = {
  landing: 'TE',
  repeater: 'REP',
  branching: 'BU',
  joint: 'JOINT',
}

const SYNCABLE_CONNECTOR_TYPES = new Set(Object.keys(CONNECTOR_TO_SLD_TYPE))

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  // Backend/platform identifiers are sometimes numeric even though the
  // normalized frontend types use strings. Preserve finite numeric IDs so
  // source-key and endpoint-alias lookups remain stable across that boundary.
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function sourceKey(prefix: string, value: unknown, index: number): string {
  const raw = text(value)
  return raw ? `${prefix}:${raw}` : `${prefix}:row-${index + 1}`
}

function explicitPointKp(point: unknown): number | null {
  const source = (point || {}) as Record<string, unknown>
  return finiteNumber(
    source.kp
      ?? source.positionKm
      ?? source.position_km
      ?? source.kpKm
      ?? source.kp_km,
  )
}

function cableTypeForPair(from: ConnectorElement, to: ConnectorElement): string {
  // Cable information is only copied when one of the source elements
  // explicitly carries it.  No default cable type is inferred here.
  return text(from.armorType)
    || text(from.cableTypeId)
    || text(from.cableTypeName)
    || text(to.armorType)
    || text(to.cableTypeId)
    || text(to.cableTypeName)
}

function connectorEquipment(
  element: ConnectorElement,
  index: number,
): SLDExistingEquipmentDraft | null {
  const type = CONNECTOR_TO_SLD_TYPE[element.type]
  if (!type) return null

  const key = sourceKey('connector', element.id, index)
  const name = text(element.name) || `${type}-${index + 1}`
  const specifications = text(element.specifications)
  const buPortCount = finiteNumber(element.buPortCount)
  const connectorKp = finiteNumber(element.kp)
  const hasExplicitKp = element.hasExplicitKp ?? true
  const draft = {
    name,
    type,
    deviceTypeCd: text(element.deviceTypeCd) || undefined,
    location: hasExplicitKp && connectorKp != null ? `KP ${connectorKp.toFixed(1)}` : 'KP 未提供',
    kp: connectorKp ?? 0,
    longitude: finiteNumber(element.longitude) ?? 0,
    latitude: finiteNumber(element.latitude) ?? 0,
    depth: finiteNumber(element.depth) ?? 0,
    specifications,
    manufacturer: text(element.manufacturer) || undefined,
    remarks: text(element.remarks),
    componentRefId: text(element.componentRefId) || undefined,
    portLimit: buPortCount ?? undefined,
    equalizerRole: element.equalizerRole,
    attenuationMode: element.attenuationMode,
    attenuationDb: finiteNumber(element.attenuationDb) ?? undefined,
    jointSubType: element.jointSubType,
    buSubType: element.buSubType,
    syncSource: 'connector-trunk' as const,
    sourceConnectorId: text(element.id) || undefined,
  } satisfies Omit<SLDEquipment, 'id' | 'sequence'>

  return {
    key,
    // Local connector records predate the provenance marker.  Their numeric
    // KP is therefore considered explicit; only an explicit `false` means
    // the platform mapping supplied its zero fallback.
    hasExplicitKp,
    data: {
      ...draft,
      symbolCode: resolveSldSymbolCode(draft),
      configParams: buildSldEquipmentConfigParams(draft, {
        ...(element.platformEntityId != null ? { PlatformEntityId: String(element.platformEntityId) } : {}),
        ...(text(element.deviceTypeCd) ? { DeviceTypeCode: text(element.deviceTypeCd) } : {}),
        ...(buPortCount != null ? { PortLimit: buPortCount } : {}),
        ...(finiteNumber(element.buTrunkLoss) != null ? { BUTrunkLoss: Number(element.buTrunkLoss) } : {}),
        ...(finiteNumber(element.buBranchLoss) != null ? { BUBranchLoss: Number(element.buBranchLoss) } : {}),
        ...(text(element.buBranchTarget) ? { BUBranchTarget: text(element.buBranchTarget) } : {}),
        ...(text(element.buNextHopUpstream) ? { BUNextHopUpstream: text(element.buNextHopUpstream) } : {}),
        ...(text(element.buNextHopDownstream) ? { BUNextHopDownstream: text(element.buNextHopDownstream) } : {}),
      }),
    },
  }
}

function routePointEquipment(
  route: Route,
  index: number,
  kpValue?: number | null,
  hasExplicitKp = false,
  forceTerminal = false,
): SLDExistingEquipmentDraft | null {
  const point = route.points[index]
  const type = ROUTE_POINT_TO_SLD_TYPE[point.type]
    || (forceTerminal ? 'TE' : undefined)
  if (!type) return null

  // RoutePoint normally has no KP. Prefer an explicit backend extension or a
  // cumulative value from explicit RouteSegment lengths. For a route with no
  // segment list, only the endpoints may use route totalLength.
  const extensionKp = explicitPointKp(point)
  const kp = extensionKp ?? kpValue
  if (kp == null) return null

  const key = sourceKey('route-point', point.id, index)
  const name = text(point.name) || `${type}-${index + 1}`
  const draft = {
    name,
    type,
    location: `KP ${kp.toFixed(1)}`,
    kp,
    longitude: finiteNumber(point.coordinates?.[0]) ?? 0,
    latitude: finiteNumber(point.coordinates?.[1]) ?? 0,
    depth: finiteNumber(point.depth) ?? 0,
    specifications: '',
    remarks: '',
    syncSource: 'rpl' as const,
  } satisfies Omit<SLDEquipment, 'id' | 'sequence'>

  return {
    key,
    hasExplicitKp: extensionKp != null || hasExplicitKp,
    data: {
      ...draft,
      symbolCode: resolveSldSymbolCode(draft),
      configParams: buildSldEquipmentConfigParams(draft),
    },
  }
}

interface RoutePointPosition {
  kp: number | null
  hasExplicitKp: boolean
}

function routePointPositions(route: Route | null | undefined): RoutePointPosition[] {
  const points = route?.points ?? []
  if (points.length === 0) return []

  const routeSegments = route?.segments ?? []
  const hasExplicitSegmentLengths = points.length > 1
    && routeSegments.length >= points.length - 1
    && routeSegments.slice(0, points.length - 1).every(segment => finiteNumber(segment.length) != null)

  if (hasExplicitSegmentLengths) {
    let kp = 0
    return points.map((point, index) => {
      const pointKp = explicitPointKp(point)
      if (pointKp != null) {
        kp = pointKp
        return { kp, hasExplicitKp: true }
      }
      if (index > 0) kp += finiteNumber(routeSegments[index - 1]?.length) ?? 0
      return { kp, hasExplicitKp: true }
    })
  }

  const totalLength = finiteNumber(route?.totalLength) ?? finiteNumber(route?.distance)
  return points.map((point, index) => {
    const pointKp = explicitPointKp(point)
    if (pointKp != null) return { kp: pointKp, hasExplicitKp: true }
    if (index === 0) return { kp: 0, hasExplicitKp: true }
    if (index === points.length - 1 && totalLength != null) {
      return { kp: totalLength, hasExplicitKp: true }
    }
    return { kp: null, hasExplicitKp: false }
  })
}

function buildRouteEquipmentDrafts(route: Route | null | undefined): SLDExistingEquipmentDraft[] {
  if (!route?.points?.length) return []
  const positions = routePointPositions(route)
  return route.points
    .map((point, index) => {
      const type = ROUTE_POINT_TO_SLD_TYPE[point.type]
      const isEndpoint = index === 0 || index === route.points.length - 1
      return routePointEquipment(
        route,
        index,
        positions[index]?.kp,
        positions[index]?.hasExplicitKp ?? false,
        isEndpoint && !type,
      )
    })
    .filter((item): item is SLDExistingEquipmentDraft => Boolean(item))
}

function sameEquipmentPosition(
  left: SLDExistingEquipmentDraft,
  right: SLDExistingEquipmentDraft,
): boolean {
  if (left.data.type !== right.data.type) return false
  const leftLon = finiteNumber(left.data.longitude)
  const leftLat = finiteNumber(left.data.latitude)
  const rightLon = finiteNumber(right.data.longitude)
  const rightLat = finiteNumber(right.data.latitude)
  if (leftLon != null && leftLat != null && rightLon != null && rightLat != null
    && (Math.abs(leftLon) + Math.abs(leftLat) > 0 || Math.abs(rightLon) + Math.abs(rightLat) > 0)
    && Math.abs(leftLon - rightLon) <= 0.0001
    && Math.abs(leftLat - rightLat) <= 0.0001) return true
  // KP 0 is a valid route origin. Unknown platform fallbacks are already
  // excluded by `hasExplicitKp`, so do not treat zero as inherently missing.
  return left.hasExplicitKp && right.hasExplicitKp
    && Math.abs(left.data.kp - right.data.kp) <= 0.5
}

function mergeEquipmentDrafts(
  routeDrafts: SLDExistingEquipmentDraft[],
  connectorDrafts: SLDExistingEquipmentDraft[],
): {
  equipments: SLDExistingEquipmentDraft[]
  aliases: Map<string, string>
} {
  const equipments = routeDrafts.map(item => ({ ...item, aliases: [item.key] }))
  const aliases = new Map<string, string>()
  equipments.forEach(item => aliases.set(item.key, item.key))

  connectorDrafts.forEach(connector => {
    const matchIndex = equipments.findIndex(routeDraft => sameEquipmentPosition(routeDraft, connector))
    if (matchIndex < 0) {
      equipments.push({ ...connector, aliases: [connector.key] })
      aliases.set(connector.key, connector.key)
      return
    }

    const existing = equipments[matchIndex]
    const canonicalKey = connector.key
    // A connector produced from a platform entity can carry `kp: 0` merely
    // because the source did not provide a position.  Keep the route draft's
    // position (and its route geometry) in that case; explicit connector KP
    // and library metadata still take precedence below.
    const connectorHasExplicitKp = connector.hasExplicitKp
    const mergedData = {
      ...existing.data,
      ...connector.data,
      ...(connectorHasExplicitKp
        ? {}
        : {
            kp: existing.data.kp,
            location: existing.data.location,
            longitude: existing.data.longitude,
            latitude: existing.data.latitude,
            depth: existing.data.depth,
          }),
      // Keep a meaningful route name/remark when the connector only carries
      // a generated fallback name.
      name: connector.data.sourceConnectorId ? connector.data.name : existing.data.name,
      remarks: connector.data.remarks || existing.data.remarks,
      specifications: connector.data.specifications || existing.data.specifications,
    }
    equipments[matchIndex] = {
      key: canonicalKey,
      aliases: [...(existing.aliases ?? [existing.key]), connector.key],
      hasExplicitKp: existing.hasExplicitKp || connector.hasExplicitKp,
      data: mergedData,
    }
    ;(existing.aliases ?? [existing.key]).forEach(alias => aliases.set(alias, canonicalKey))
    aliases.set(connector.key, canonicalKey)
  })

  return { equipments, aliases }
}

function segmentPairKey(fromKey: string, toKey: string): string {
  return [fromKey, toKey].sort().join('::')
}

function resolveAlias(aliases: Map<string, string>, key?: string): string | null {
  if (!key) return null
  return aliases.get(key) || key
}

function segmentData(
  length: number,
  cableType = '',
  remarks = '',
  extra: Partial<Pick<SLDFiberSegment, 'cableRefId' | 'syncSource' | 'syncRouteId'>> = {},
): SLDExistingSegmentDraft['data'] {
  return {
    length,
    // The source models do not expose fiber-pair count or attenuation for an
    // auto-created SLD span. Keep required fields neutral rather than making
    // an optical assumption.
    fiberPairs: 0,
    fiberPairType: 'working',
    cableType,
    attenuation: 0,
    remarks,
    ...extra,
  }
}

function connectorElementKey(element: ConnectorElement): string {
  return sourceKey('connector', element.id, 0)
}

function routePointKey(pointId: unknown, index: number): string {
  return sourceKey('route-point', pointId, index)
}

function explicitCableSegmentForPair(
  segments: CableSegment[],
  fromKp: number,
  toKp: number,
): CableSegment | null {
  const low = Math.min(fromKp, toKp)
  const high = Math.max(fromKp, toKp)
  return segments.find(segment => {
    const start = finiteNumber(segment.startKp)
    const end = finiteNumber(segment.endKp)
    if (start == null || end == null) return false
    return low >= Math.min(start, end) - 0.001 && high <= Math.max(start, end) + 0.001
  }) || null
}


/**
 * Builds a display/editable SLD draft from data that already exists in the
 * application. It intentionally does not calculate optical loss, fiber pairs,
 * slack, or a cable type when the source does not provide one. The only
 * generated numeric span value is the difference between two explicit
 * equipment KP values.
 */
export function buildSLDExistingDataDraft(
  route: Route | null | undefined,
  connectorElements: ConnectorElement[] = [],
  routeId?: string | null,
  cableSegments: CableSegment[] = [],
): SLDExistingDataDraft {
  const effectiveRouteId = text(routeId) || text(route?.id) || undefined
  const tableName = `${text(route?.name) || '当前路由'}_SLD`

  const connectorDrafts = connectorElements
    .filter(element => SYNCABLE_CONNECTOR_TYPES.has(element.type))
    .map((element, index) => connectorEquipment(element, index))
    .filter((item): item is SLDExistingEquipmentDraft => Boolean(item))
  const routeDrafts = buildRouteEquipmentDrafts(route)
  const {
    equipments: equipmentDrafts,
    aliases,
  } = mergeEquipmentDrafts(routeDrafts, connectorDrafts)

  if (effectiveRouteId) {
    equipmentDrafts.forEach(item => {
      item.data.syncRouteId = effectiveRouteId
    })
  }

  // Only devices with a trustworthy KP can be ordered into an inferred
  // adjacent span.  Devices with unknown KP are still part of the SLD and
  // are appended stably after the ordered devices instead of being dropped.
  const ordered = equipmentDrafts
    .map((item, index) => ({ item, index, kp: finiteNumber(item.data.kp) }))
    .filter((entry): entry is { item: SLDExistingEquipmentDraft; index: number; kp: number } =>
      entry.kp != null && entry.item.hasExplicitKp)
    .sort((left, right) => left.kp - right.kp || left.index - right.index)
  const orderedKeys = new Set(ordered.map(entry => entry.item.key))
  const sortedEquipmentDrafts = [
    ...ordered.map(entry => entry.item),
    ...equipmentDrafts.filter(item => !orderedKeys.has(item.key)),
  ]
  const equipmentByKey = new Map(sortedEquipmentDrafts.map(item => [item.key, item]))
  const explicitPairs = new Set<string>()
  const relevantCableSegments = cableSegments.filter(segment =>
    !effectiveRouteId || !segment.routeId || String(segment.routeId) === String(effectiveRouteId))
  const routeCableRanges: Array<{ lowKp: number; highKp: number; cableType: string }> = []

  const fiberSegments: SLDExistingSegmentDraft[] = []

  // Preserve explicit route segments whenever both endpoints are represented
  // as SLD devices. Route waypoints that are not SLD devices are intentionally
  // skipped rather than collapsed into a fabricated optical span.
  ;(route?.segments ?? []).forEach((segment, index) => {
    const length = finiteNumber(segment.length)
    if (length == null) return
    const startPointIndex = route?.points.findIndex(point => point.id === segment.startPointId) ?? -1
    const endPointIndex = route?.points.findIndex(point => point.id === segment.endPointId) ?? -1
    const fromKey = resolveAlias(aliases, routePointKey(segment.startPointId, Math.max(0, startPointIndex)))
    const toKey = resolveAlias(aliases, routePointKey(segment.endPointId, Math.max(0, endPointIndex)))
    if (!fromKey || !toKey || fromKey === toKey || !equipmentByKey.has(fromKey) || !equipmentByKey.has(toKey)) return

    const fromEquipment = equipmentByKey.get(fromKey)
    const toEquipment = equipmentByKey.get(toKey)
    if (!fromEquipment || !toEquipment) return

    // A route segment can span system equipment that is stored separately in
    // the connector table (for example, a repeater at KP 50 on a 0-100 km
    // route segment). In that case the SLD must use the adjacent equipment
    // spans generated below, not retain an overlapping direct A-B cable span.
    const lowKp = Math.min(fromEquipment.data.kp, toEquipment.data.kp)
    const highKp = Math.max(fromEquipment.data.kp, toEquipment.data.kp)
    const routeCableType = text(segment.cableType)
    if (routeCableType && fromEquipment.hasExplicitKp && toEquipment.hasExplicitKp) {
      routeCableRanges.push({ lowKp, highKp, cableType: routeCableType })
    }
    const hasIntermediateEquipment = fromEquipment.hasExplicitKp
      && toEquipment.hasExplicitKp
      && ordered.some(entry =>
        entry.item.key !== fromKey
        && entry.item.key !== toKey
        && entry.kp > lowKp + 0.001
        && entry.kp < highKp - 0.001)
    if (hasIntermediateEquipment) return

    const cableSegment = explicitCableSegmentForPair(
      relevantCableSegments,
      fromEquipment.data.kp,
      toEquipment.data.kp,
    )
    const cableType = text(cableSegment?.armorType)
      || text(cableSegment?.cableTypeId)
      || text(cableSegment?.cableTypeName)
      || routeCableType
    explicitPairs.add(segmentPairKey(fromKey, toKey))
    fiberSegments.push({
      fromKey,
      toKey,
      data: segmentData(
        length,
        cableType,
        '',
        {
          cableRefId: text(cableSegment?.cableTypeId) || undefined,
          syncSource: 'rpl',
          syncRouteId: effectiveRouteId,
        },
      ),
    })
  })

  const connectorKeyByIdentity = new Map<string, string>()
  ;(route?.points ?? []).forEach((point, index) => {
    const mappedKey = resolveAlias(aliases, routePointKey(point.id, index))
    if (mappedKey && equipmentByKey.has(mappedKey)) {
      connectorKeyByIdentity.set(String(point.id), mappedKey)
    }
  })
  connectorElements.forEach(element => {
    const mappedKey = resolveAlias(aliases, connectorElementKey(element))
    if (!mappedKey || !equipmentByKey.has(mappedKey)) return
    connectorKeyByIdentity.set(String(element.id), mappedKey)
    if (element.platformEntityId != null) {
      connectorKeyByIdentity.set(String(element.platformEntityId), mappedKey)
    }
  })

  // Fiber/cable connector elements already carry explicit endpoint identity
  // and may carry an explicit length, cable type, library reference, and
  // remarks. Prefer them over a generated adjacent-KP segment.
  connectorElements
    .filter(element => element.type === 'fiber' || element.type === 'cable_segment')
    .forEach(element => {
      const fromKey = element.fromDeviceId
        ? connectorKeyByIdentity.get(String(element.fromDeviceId)) || null
        : null
      const toKey = element.toDeviceId
        ? connectorKeyByIdentity.get(String(element.toDeviceId)) || null
        : null
      if (!fromKey || !toKey || fromKey === toKey) return
      const fromEquipment = equipmentByKey.get(fromKey)
      const toEquipment = equipmentByKey.get(toKey)
      if (!fromEquipment || !toEquipment) return

      const explicitLength = finiteNumber(element.length)
      const kpLength = fromEquipment.hasExplicitKp && toEquipment.hasExplicitKp
        ? Math.abs(toEquipment.data.kp - fromEquipment.data.kp)
        : null
      const length = explicitLength ?? kpLength
      if (length == null) return

      const pairKey = segmentPairKey(fromKey, toKey)
      const existingIndex = fiberSegments.findIndex(item => segmentPairKey(item.fromKey, item.toKey) === pairKey)
      const data = segmentData(
        length,
        text(element.armorType) || text(element.cableTypeId) || text(element.cableTypeName),
        text(element.remarks),
        {
          cableRefId: text(element.fiberRefId)
            || text(element.componentRefId)
            || text(element.cableTypeId)
            || undefined,
          syncSource: 'connector-trunk',
          syncRouteId: effectiveRouteId,
        },
      )
      const nextSegment = { fromKey, toKey, data }
      if (existingIndex >= 0) {
        fiberSegments[existingIndex] = nextSegment
      } else {
        fiberSegments.push(nextSegment)
      }
      explicitPairs.add(pairKey)
    })

  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1]
    const to = ordered[index]
    const pairKey = segmentPairKey(from.item.key, to.item.key)
    if (explicitPairs.has(pairKey)) continue
    const length = Math.max(0, to.kp - from.kp)
    const fromConnector = connectorElements.find(element =>
      from.item.data.sourceConnectorId != null
      && String(from.item.data.sourceConnectorId) === String(element.id))
    const toConnector = connectorElements.find(element =>
      to.item.data.sourceConnectorId != null
      && String(to.item.data.sourceConnectorId) === String(element.id))
    const cableSegment = explicitCableSegmentForPair(relevantCableSegments, from.kp, to.kp)
    const routeCableType = routeCableRanges.find(range =>
      from.kp >= range.lowKp - 0.001
      && to.kp <= range.highKp + 0.001)?.cableType || ''
    const connectorCableType = fromConnector && toConnector
      ? cableTypeForPair(fromConnector, toConnector)
      : ''
    const cableType = connectorCableType
      || text(cableSegment?.armorType)
      || text(cableSegment?.cableTypeId)
      || text(cableSegment?.cableTypeName)
      || routeCableType

    fiberSegments.push({
      fromKey: from.item.key,
      toKey: to.item.key,
      data: segmentData(length, cableType, '', {
        cableRefId: text(cableSegment?.cableTypeId) || undefined,
        ...(fromConnector && toConnector ? {
          syncSource: 'connector-trunk' as const,
          syncRouteId: effectiveRouteId,
        } : { syncSource: 'rpl', syncRouteId: effectiveRouteId }),
      }),
    })
  }

  return {
    tableName,
    routeId: effectiveRouteId,
    equipments: sortedEquipmentDrafts,
    fiberSegments,
  }
}
