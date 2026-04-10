import { describe, expect, it } from 'vitest'
import type { CableSegment, ConnectorElement, RPLRecord, RPLTable } from '@/types'
import {
  applyCableSegmentsToRplRecords,
  buildExportableRplTableSnapshot,
  buildImportedRplSyncPayload,
} from '@/services/RPLSyncService'

const createRecord = (overrides: Partial<RPLRecord>): RPLRecord => ({
  id: overrides.id || `record-${Math.random().toString(36).slice(2, 8)}`,
  sequence: overrides.sequence ?? 1,
  kp: overrides.kp ?? 0,
  longitude: overrides.longitude ?? 0,
  latitude: overrides.latitude ?? 0,
  depth: overrides.depth ?? 0,
  pointType: overrides.pointType ?? 'waypoint',
  cableType: overrides.cableType ?? 'LW',
  segmentLength: overrides.segmentLength ?? 0,
  cumulativeLength: overrides.cumulativeLength ?? overrides.kp ?? 0,
  slack: overrides.slack ?? 0,
  burialDepth: overrides.burialDepth ?? 0,
  remarks: overrides.remarks ?? '',
})

const createTable = (records: RPLRecord[]): RPLTable => ({
  id: 'rpl-table-1',
  name: 'Imported RPL',
  routeId: 'route-main',
  records,
  metadata: {
    totalLength: 0,
    totalCableLength: 0,
    landingStations: 0,
    repeaters: 0,
    branchingUnits: 0,
    joints: 0,
    averageDepth: 0,
    maxDepth: 0,
    minDepth: 0,
  },
  createdAt: new Date('2026-04-10T08:00:00Z'),
  updatedAt: new Date('2026-04-10T08:00:00Z'),
})

describe('RPL sync service', () => {
  it('builds route and connector payload from imported RPL data', () => {
    const table = createTable([
      createRecord({
        id: 'landing-a',
        sequence: 1,
        kp: 0,
        longitude: 120,
        latitude: 30,
        pointType: 'landing',
        remarks: '上海',
      }),
      createRecord({
        id: 'joint-a',
        sequence: 2,
        kp: 80,
        longitude: 121,
        latitude: 31,
        depth: 1800,
        pointType: 'joint',
        cableType: 'SA',
        segmentLength: 80,
        cumulativeLength: 80,
        remarks: '接头盒-1',
      }),
      createRecord({
        id: 'landing-b',
        sequence: 3,
        kp: 160,
        longitude: 122,
        latitude: 32,
        pointType: 'landing',
        cableType: 'DA',
        segmentLength: 80,
        cumulativeLength: 160,
        remarks: '东京',
      }),
    ])

    const payload = buildImportedRplSyncPayload(table, '主干路由')

    expect(payload.route?.name).toBe('主干路由')
    expect(payload.route?.points).toHaveLength(3)
    expect(payload.route?.segments.map(segment => segment.length)).toEqual([80, 80])
    expect(payload.connectorElements.map(element => element.type)).toEqual(['landing', 'joint', 'landing'])
    expect(payload.routePlanningConfig).toEqual({
      startPoint: { name: '上海', lon: 120, lat: 30 },
      endPoint: { name: '东京', lon: 122, lat: 32 },
      isConfigured: true,
    })
  })

  it('applies cable segment overrides and inserts new connector devices into export snapshots', () => {
    const table = createTable([
      createRecord({
        id: 'landing-a',
        sequence: 1,
        kp: 0,
        longitude: 120,
        latitude: 30,
        pointType: 'landing',
        remarks: 'A',
      }),
      createRecord({
        id: 'waypoint-1',
        sequence: 2,
        kp: 120,
        longitude: 121.2,
        latitude: 31.2,
        pointType: 'waypoint',
        cableType: 'LW',
        segmentLength: 120,
        cumulativeLength: 120,
      }),
      createRecord({
        id: 'landing-b',
        sequence: 3,
        kp: 240,
        longitude: 122.4,
        latitude: 32.4,
        pointType: 'landing',
        cableType: 'LW',
        segmentLength: 120,
        cumulativeLength: 240,
        remarks: 'B',
      }),
    ])

    const connectorElements: ConnectorElement[] = [
      {
        id: 'amp-1',
        name: 'OLA-01',
        type: 'ola',
        kp: 60,
        longitude: 120.6,
        latitude: 30.6,
        depth: 1600,
        status: 'planned',
        specifications: '',
        remarks: '',
      },
    ]

    const cableSegments: CableSegment[] = [
      {
        id: 'segment-1',
        routeId: 'route-main',
        startKp: 0,
        endKp: 120,
        length: 120,
        riskLevel: 'medium',
        cableTypeId: 'sa-01',
        cableTypeName: 'SA (单铠装)',
        armorType: '单铠',
        slack: 4,
        burialDepth: 1.5,
      },
      {
        id: 'segment-2',
        routeId: 'route-main',
        startKp: 120,
        endKp: 240,
        length: 120,
        riskLevel: 'high',
        cableTypeId: 'da-01',
        cableTypeName: 'DA (双铠装)',
        armorType: '双铠',
        slack: 6,
        burialDepth: 2.5,
      },
    ]

    const snapshot = buildExportableRplTableSnapshot({
      baseTable: table,
      connectorElements,
      cableSegments,
    })

    expect(snapshot.records.map(record => [record.pointType, record.kp])).toEqual([
      ['landing', 0],
      ['repeater', 60],
      ['waypoint', 120],
      ['landing', 240],
    ])
    expect(snapshot.records.find(record => record.kp === 60)).toMatchObject({
      cableType: 'SA',
      slack: 4,
      burialDepth: 1.5,
      remarks: 'OLA-01',
    })
    expect(snapshot.records.find(record => record.kp === 240)).toMatchObject({
      cableType: 'DA',
      slack: 6,
      burialDepth: 2.5,
    })
    expect(snapshot.metadata.repeaters).toBe(1)
    expect(snapshot.metadata.totalLength).toBe(240)
  })

  it('reuses a matching waypoint when a connector lands on the same KP', () => {
    const records = [
      createRecord({
        id: 'landing-a',
        sequence: 1,
        kp: 0,
        longitude: 120,
        latitude: 30,
        pointType: 'landing',
        remarks: 'A',
      }),
      createRecord({
        id: 'waypoint-a',
        sequence: 2,
        kp: 80,
        longitude: 121,
        latitude: 31,
        pointType: 'waypoint',
        segmentLength: 80,
        cumulativeLength: 80,
      }),
      createRecord({
        id: 'landing-b',
        sequence: 3,
        kp: 160,
        longitude: 122,
        latitude: 32,
        pointType: 'landing',
        segmentLength: 80,
        cumulativeLength: 160,
        remarks: 'B',
      }),
    ]

    const updatedRecords = applyCableSegmentsToRplRecords(records, [
      {
        id: 'segment-a',
        routeId: 'route-main',
        startKp: 0,
        endKp: 160,
        length: 160,
        riskLevel: 'low',
        cableTypeId: 'lw-01',
        cableTypeName: 'LW (轻型)',
        armorType: '轻型',
        slack: 3,
        burialDepth: 1,
      },
    ])

    const snapshot = buildExportableRplTableSnapshot({
      baseTable: createTable(updatedRecords),
      connectorElements: [
        {
          id: 'amp-same-kp',
          name: 'REP-80',
          type: 'amplifier_e',
          kp: 80,
          longitude: 121,
          latitude: 31,
          depth: 1500,
          status: 'planned',
          specifications: '',
          remarks: '',
        },
      ],
    })

    expect(snapshot.records).toHaveLength(3)
    expect(snapshot.records[1]).toMatchObject({
      pointType: 'repeater',
      kp: 80,
      remarks: 'REP-80',
    })
  })
})
