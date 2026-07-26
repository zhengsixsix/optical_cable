import type {
  CableSegment,
  ConnectorElement,
  Route,
  RPLTable,
  SLDEquipment,
  SLDFiberSegment,
  SLDTable,
} from '@/types'
import { buildRplTableFromExistingData } from '@/services/RPLExistingDataService'
import { buildSLDExistingDataDraft } from '@/services/SLDExistingDataService'

/**
 * The management dialogs and the top-level export menu both need the same
 * lazy synchronisation behaviour.  Keeping the store contract structural
 * avoids importing Pinia stores here (and keeps this service usable from
 * dialogs, headers, and tests alike).
 */
export interface RplTableSyncStore {
  tables: RPLTable[]
  currentTable: RPLTable | null
  selectTable(tableId: string | null): void
  replaceTables(nextTables: RPLTable[]): void
}

export interface SldTableSyncStore {
  tables: SLDTable[]
  currentTable: SLDTable | null
  selectTable(tableId: string | null): void
  createTable(name: string, routeId?: string): SLDTable
  addEquipment(
    equipment: Omit<SLDEquipment, 'id' | 'sequence'>,
    emitLink?: boolean,
  ): SLDEquipment | null
  addFiberSegment(
    segment: Omit<SLDFiberSegment, 'id' | 'sequence'>,
  ): SLDFiberSegment | null
}

export interface ExistingDataTableSyncSource {
  route?: Route | null
  routeId?: string | null
  routeName?: string | null
  connectorElements?: ConnectorElement[]
  cableSegments?: CableSegment[]
}

function sameRouteId(left?: string | null, right?: string | null): boolean {
  return left != null && right != null && String(left) === String(right)
}

function hasRouteId(value?: string | null): boolean {
  return value != null && Boolean(String(value).trim())
}

function routeIdFromSource(source: ExistingDataTableSyncSource): string | null {
  for (const candidate of [source.routeId, source.route?.id]) {
    if (candidate != null && String(candidate).trim()) return String(candidate)
  }
  return null
}

function findTableForRoute<T extends { routeId?: string | null }>(
  tables: T[],
  currentTable: T | null,
  routeId: string | null,
): T | null {
  if (routeId != null && String(routeId).trim()) {
    const exact = tables.find(table => sameRouteId(table.routeId, routeId))
    if (exact) return exact

    // Legacy snapshots may have a single table without routeId. Reuse it
    // instead of creating a duplicate when the route can still be identified
    // by the currently selected table.
    const unscoped = tables.filter(table => !hasRouteId(table.routeId))
    if (currentTable && !hasRouteId(currentTable.routeId)) return currentTable
    if (unscoped.length === 1) return unscoped[0]
    return null
  }
  return currentTable || tables[0] || null
}

/**
 * Ensure that the RPL table for the active route exists. Existing non-empty
 * tables are deliberately preserved; only a missing or empty table is filled
 * from route/connector/cable-segment data.
 */
export function ensureRplTableFromExistingData(
  store: RplTableSyncStore,
  source: ExistingDataTableSyncSource,
): RPLTable | null {
  const route = source.route || null
  const routeId = routeIdFromSource(source)
  const existingTable = findTableForRoute(store.tables, store.currentTable, routeId)

  if (existingTable?.records.length) {
    store.selectTable(existingTable.id)
    return existingTable
  }

  const generatedTable = buildRplTableFromExistingData({
    route,
    routeId,
    routeName: source.routeName || route?.name,
    connectorElements: source.connectorElements || [],
    cableSegments: source.cableSegments || [],
  })

  if (!generatedTable) {
    store.selectTable(existingTable?.id || null)
    return existingTable
  }

  if (existingTable) {
    Object.assign(existingTable, generatedTable, {
      id: existingTable.id,
      name: existingTable.name || generatedTable.name,
      createdAt: existingTable.createdAt || generatedTable.createdAt,
    })
    store.selectTable(existingTable.id)
    return existingTable
  }

  store.replaceTables([...store.tables, generatedTable])
  store.selectTable(generatedTable.id)
  return generatedTable
}

function tableIsEmpty(table: SLDTable): boolean {
  return table.equipments.length === 0 && table.fiberSegments.length === 0
}

function populateSldTableFromDraft(
  store: SldTableSyncStore,
  tableId: string,
  source: ExistingDataTableSyncSource,
): SLDTable | null {
  const routeId = routeIdFromSource(source)
  const draft = buildSLDExistingDataDraft(
    source.route,
    source.connectorElements || [],
    routeId,
    source.cableSegments || [],
  )
  if (draft.equipments.length === 0) return null

  store.selectTable(tableId)
  const createdBySourceKey = new Map<string, SLDEquipment>()

  draft.equipments.forEach(equipmentDraft => {
    const equipment = store.addEquipment(equipmentDraft.data, false)
    if (equipment) createdBySourceKey.set(equipmentDraft.key, equipment)
  })

  draft.fiberSegments.forEach(segmentDraft => {
    const from = createdBySourceKey.get(segmentDraft.fromKey)
    const to = createdBySourceKey.get(segmentDraft.toKey)
    if (!from || !to) return

    store.addFiberSegment({
      ...segmentDraft.data,
      fromEquipmentId: from.id,
      toEquipmentId: to.id,
      fromName: from.name,
      toName: to.name,
    })
  })

  return store.currentTable
}

/**
 * Ensure that the SLD table for the active route exists and is populated from
 * existing route/connector/cable data. Existing non-empty tables are kept as
 * authored/imported and are never overwritten.
 */
export function ensureSldTableFromExistingData(
  store: SldTableSyncStore,
  source: ExistingDataTableSyncSource,
): SLDTable | null {
  const route = source.route || null
  const routeId = routeIdFromSource(source)
  const matchedTable = findTableForRoute(store.tables, store.currentTable, routeId)

  if (matchedTable) {
    store.selectTable(matchedTable.id)
    if (!tableIsEmpty(matchedTable)) return matchedTable
    return populateSldTableFromDraft(store, matchedTable.id, source) || matchedTable
  }

  const draft = buildSLDExistingDataDraft(
    route,
    source.connectorElements || [],
    routeId,
    source.cableSegments || [],
  )
  if (draft.equipments.length === 0) return null

  const table = store.createTable(draft.tableName, draft.routeId)
  return populateSldTableFromDraft(store, table.id, source) || table
}
