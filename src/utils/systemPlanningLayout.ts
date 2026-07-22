export interface PlanningLayoutNode {
  nodeId: string
  nodeType: string
  positionKm: number | null
  latitude: number | null
  longitude: number | null
  nodeName: string
}

export interface PlanningLayoutSpan {
  spanIndex: string
  startNodeId: string
  endNodeId: string
  lengthKm: number | null
}

export interface PlanningLayoutResult {
  totalLengthKm: number | null
  spanKmUsed: number | null
  mode: string
  nodes: PlanningLayoutNode[]
  spans: PlanningLayoutSpan[]
  amplifiers: PlanningLayoutNode[]
  status: string
  nodeCount: number
  amplifierCount: number
}

export interface ResolvedLayoutAmplifier {
  nodeId: string
  nodeName: string
  positionKm: number
  latitude: number | null
  longitude: number | null
  precedingSpanKm: number
}

export interface PlanningLayoutCandidates {
  fixed?: unknown
  optimized?: unknown
}

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const readFirst = (record: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in record) return record[key]
  }
  return undefined
}

const readString = (value: unknown, fallback = ''): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : fallback

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const parseLayoutNode = (value: unknown): PlanningLayoutNode | null => {
  const record = parseMaybeJson(value)
  if (!isRecord(record)) return null
  const nodeType = readString(readFirst(record, ['node_type', 'nodeType', 'type']))
  const nodeName = readString(readFirst(record, ['node_name', 'nodeName', 'name']))
  const nodeId = readString(readFirst(record, ['node_id', 'nodeId', 'event_id', 'eventId', 'id']), nodeName)
  if (!nodeId && !nodeName && !nodeType) return null
  return {
    nodeId,
    nodeType,
    positionKm: readNumber(readFirst(record, ['position_km', 'positionKm', 'kp_km', 'kpKm', 'position'])),
    latitude: readNumber(readFirst(record, ['latitude', 'lat'])),
    longitude: readNumber(readFirst(record, ['longitude', 'lng', 'lon'])),
    nodeName: nodeName || nodeId || nodeType || '节点',
  }
}

const parseLayoutSpan = (value: unknown): PlanningLayoutSpan | null => {
  const record = parseMaybeJson(value)
  if (!isRecord(record)) return null
  const startNodeId = readString(readFirst(record, ['start_node_id', 'startNodeId', 'start', 'from_event_id', 'fromEventId']))
  const endNodeId = readString(readFirst(record, ['end_node_id', 'endNodeId', 'end', 'to_event_id', 'toEventId']))
  const spanIndex = readString(readFirst(record, ['span_index', 'spanIndex', 'span_id', 'spanId', 'index']))
  const lengthKm = readNumber(readFirst(record, ['length_km', 'lengthKm', 'length']))
  if (!startNodeId && !endNodeId && lengthKm == null) return null
  return { spanIndex, startNodeId, endNodeId, lengthKm }
}

export function parsePlanningLayoutResult(
  value: unknown,
  fallbackMode = 'optimized',
): PlanningLayoutResult | null {
  const parsed = parseMaybeJson(value)
  const payload = isRecord(parsed) && 'data' in parsed ? parseMaybeJson(parsed.data) : parsed
  if (!isRecord(payload)) return null

  const nodesSource = parseMaybeJson(readFirst(payload, ['nodes', 'nodeList', 'node_metadata']))
  const directSpansSource = parseMaybeJson(readFirst(payload, ['spans', 'spanList', 'span_details']))
  const amplifierSource = parseMaybeJson(readFirst(payload, ['amplifier_placement', 'amplifierPlacement', 'amplifiers']))
  const amplifierRecord = isRecord(amplifierSource) ? amplifierSource : null
  const nestedSpansSource = amplifierRecord
    ? parseMaybeJson(readFirst(amplifierRecord, ['spans', 'spanList', 'span_details']))
    : undefined
  const spansSource = Array.isArray(directSpansSource) && directSpansSource.length > 0
    ? directSpansSource
    : nestedSpansSource
  const amplifierItemsSource = amplifierRecord
    ? parseMaybeJson(readFirst(amplifierRecord, ['nodes', 'placements', 'amplifiers', 'items', 'node_metadata']))
    : amplifierSource

  const nodes = Array.isArray(nodesSource)
    ? nodesSource.map(parseLayoutNode).filter((node): node is PlanningLayoutNode => Boolean(node))
    : []
  const spans = Array.isArray(spansSource)
    ? spansSource.map(parseLayoutSpan).filter((span): span is PlanningLayoutSpan => Boolean(span))
    : []
  const explicitAmplifiers = Array.isArray(amplifierItemsSource)
    ? amplifierItemsSource.map(parseLayoutNode).filter((node): node is PlanningLayoutNode => Boolean(node))
    : []
  const amplifiers = explicitAmplifiers.length > 0
    ? explicitAmplifiers
    : nodes.filter(node => /amplifier|edfa|ola|放大器/i.test(node.nodeType || node.nodeName))

  const totalLengthKm = readNumber(readFirst(payload, ['total_length_km', 'totalLengthKm', 'totalLength']))
  const spanKmUsed = readNumber(readFirst(payload, ['span_km_used', 'spanKmUsed', 'spanKm']))
  const meta = parseMaybeJson(readFirst(payload, ['meta']))
  const metaRecord = isRecord(meta) ? meta : {}
  const declaredNodeCount = readNumber(readFirst(metaRecord, ['node_count', 'nodeCount']))
    ?? readNumber(readFirst(payload, ['node_count', 'nodeCount']))
  const declaredAmplifierCount = readNumber(readFirst(metaRecord, ['amplifier_count', 'amplifierCount']))
    ?? readNumber(readFirst(payload, ['amplifier_count', 'amplifierCount', 'edfa_count', 'edfaCount']))
    ?? (amplifierRecord
      ? readNumber(readFirst(amplifierRecord, ['total_edfa_count', 'totalEdfaCount', 'count']))
      : null)

  if (
    nodes.length === 0
    && spans.length === 0
    && amplifiers.length === 0
    && totalLengthKm == null
    && spanKmUsed == null
    && declaredAmplifierCount == null
  ) return null

  return {
    totalLengthKm,
    spanKmUsed,
    mode: readString(readFirst(payload, ['mode']), fallbackMode),
    nodes,
    spans,
    amplifiers,
    status: readString(readFirst(metaRecord, ['status']), 'success'),
    nodeCount: Math.max(declaredNodeCount ?? 0, nodes.length),
    amplifierCount: Math.max(declaredAmplifierCount ?? 0, amplifiers.length),
  }
}

export function selectPlanningLayoutResult(
  candidates: PlanningLayoutCandidates | null | undefined,
  preferredMode: 'fixed' | 'optimized' = 'optimized',
): PlanningLayoutResult | null {
  if (!candidates) return null
  const modes: Array<'fixed' | 'optimized'> = preferredMode === 'fixed'
    ? ['fixed', 'optimized']
    : ['optimized', 'fixed']

  for (const mode of modes) {
    const parsed = parsePlanningLayoutResult(candidates[mode], mode)
    if (parsed) return parsed
  }
  return null
}

const finiteOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const inferNodePositions = (layout: PlanningLayoutResult): Map<string, number> => {
  const positions = new Map<string, number>()
  for (const node of [...layout.nodes, ...layout.amplifiers]) {
    const position = finiteOrNull(node.positionKm)
    if (node.nodeId && position != null) positions.set(node.nodeId, position)
  }

  let cursor = 0
  for (const span of layout.spans) {
    const startPosition = positions.get(span.startNodeId) ?? cursor
    const spanLength = Math.max(0, finiteOrNull(span.lengthKm) ?? finiteOrNull(layout.spanKmUsed) ?? 0)
    if (span.startNodeId && !positions.has(span.startNodeId)) {
      positions.set(span.startNodeId, startPosition)
    }
    const endPosition = startPosition + spanLength
    if (span.endNodeId && !positions.has(span.endNodeId)) {
      positions.set(span.endNodeId, endPosition)
    }
    cursor = positions.get(span.endNodeId) ?? endPosition
  }
  return positions
}

export function resolveLayoutAmplifiers(
  layout: PlanningLayoutResult,
  fallbackTotalLengthKm?: number | null,
): ResolvedLayoutAmplifier[] {
  const declaredCount = Math.max(0, Math.trunc(finiteOrNull(layout.amplifierCount) ?? 0))
  const count = Math.max(declaredCount, layout.amplifiers.length)
  if (count === 0) return []

  const inferredPositions = inferNodePositions(layout)
  const spanTotal = layout.spans.reduce((sum, span) => sum + Math.max(0, finiteOrNull(span.lengthKm) ?? 0), 0)
  const totalLength = Math.max(
    0,
    finiteOrNull(layout.totalLengthKm)
      ?? (spanTotal > 0 ? spanTotal : finiteOrNull(fallbackTotalLengthKm))
      ?? 0,
  )
  let previousPosition = 0

  return Array.from({ length: count }, (_, index) => {
    const source = layout.amplifiers[index]
    const fallbackPosition = totalLength > 0
      ? totalLength * (index + 1) / (count + 1)
      : Math.max(0, finiteOrNull(layout.spanKmUsed) ?? 0) * (index + 1)
    const rawPosition = finiteOrNull(source?.positionKm)
      ?? (source?.nodeId ? inferredPositions.get(source.nodeId) : undefined)
      ?? fallbackPosition
    const positionKm = totalLength > 0
      ? Math.min(totalLength, Math.max(0, rawPosition))
      : Math.max(0, rawPosition)
    const precedingSpanKm = Math.max(0, positionKm - previousPosition)
    previousPosition = positionKm

    return {
      nodeId: source?.nodeId || `layout-amp-${index + 1}`,
      nodeName: source?.nodeName || `AMP-${String(index + 1).padStart(2, '0')}`,
      positionKm,
      latitude: finiteOrNull(source?.latitude),
      longitude: finiteOrNull(source?.longitude),
      precedingSpanKm: precedingSpanKm || Math.max(0, finiteOrNull(layout.spanKmUsed) ?? 0),
    }
  })
}
