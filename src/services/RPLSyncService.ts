import type { RPLTable } from '@/types'

export interface ExportableRplSnapshotParams {
  baseTable: RPLTable
}

/**
 * Creates a detached export snapshot without deriving or merging engineering data.
 * All KP, distance, slack, cable, depth, device, and metadata fields come from
 * the imported or backend-provided RPL table.
 */
export const buildExportableRplTableSnapshot = ({
  baseTable,
}: ExportableRplSnapshotParams): RPLTable => ({
  ...baseTable,
  records: baseTable.records.map(record => ({ ...record })),
  metadata: { ...baseTable.metadata },
})
