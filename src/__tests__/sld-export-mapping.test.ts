import { describe, expect, it } from 'vitest'
import { exportToXML } from '@/services/SLDExportService'
import { DEFAULT_SLD_EXPORT_TEMPLATE_VERSION } from '@/services/sldDeviceRegistry'
import type { SLDEquipment, SLDFiberSegment, SLDTable } from '@/types'

function makeEquipment(
  sequence: number,
  type: SLDEquipment['type'],
  name: string,
  extra: Partial<SLDEquipment> = {}
): SLDEquipment {
  return {
    id: `eq-${sequence}`,
    sequence,
    name,
    type,
    location: `KP ${sequence * 10}`,
    kp: sequence * 10,
    longitude: 0,
    latitude: 0,
    depth: 0,
    specifications: '',
    remarks: '',
    ...extra,
  }
}

function makeSegment(sequence: number, fromEquipmentId: string, toEquipmentId: string): SLDFiberSegment {
  return {
    id: `seg-${sequence}`,
    sequence,
    fromEquipmentId,
    toEquipmentId,
    fromName: fromEquipmentId,
    toName: toEquipmentId,
    length: 10,
    fiberPairs: 8,
    fiberPairType: 'working',
    cableType: 'LW',
    attenuation: 0.2,
    totalLoss: 2,
    remarks: `C${String(sequence).padStart(2, '0')}`,
  }
}

describe('SLD XML mapping', () => {
  it('exports canonical display names and parses subtype fields back', () => {
    const equipments: SLDEquipment[] = [
      makeEquipment(1, 'TE', 'Landing-A', { kp: 0 }),
      makeEquipment(2, 'JOINT', 'Joint-1', { kp: 10, jointSubType: 'FJB' }),
      makeEquipment(3, 'OADM', 'BU-1', { kp: 20, buSubType: 'ROADM' }),
      makeEquipment(4, 'EQ', 'EQ-1', { kp: 30, equalizerRole: 'S', attenuationMode: 'fixed', attenuationDb: 3 }),
      makeEquipment(5, 'REP', 'REP-1', { kp: 40 }),
      makeEquipment(6, 'TE', 'Landing-B', { kp: 50 }),
    ]
    const fiberSegments: SLDFiberSegment[] = [
      makeSegment(1, 'eq-1', 'eq-2'),
      makeSegment(2, 'eq-2', 'eq-3'),
      makeSegment(3, 'eq-3', 'eq-4'),
      makeSegment(4, 'eq-4', 'eq-5'),
      makeSegment(5, 'eq-5', 'eq-6'),
    ]
    const table: SLDTable = {
      id: 'sld-test',
      name: 'SLD Mapping',
      equipments,
      fiberSegments,
      transmissionParams: {
        designCapacity: 10,
        wavelengths: 96,
        channelSpacing: 50,
        modulationFormat: 'QPSK',
        launchPower: 0,
        osnrRequired: 15,
        spanLossBudget: 20,
        systemMargin: 3,
      },
      metadata: {
        totalLength: 50,
        totalEquipments: 6,
        terminalCount: 2,
        repeaterCount: 1,
        branchingUnitCount: 0,
        equalizerCount: 1,
        jointCount: 1,
        totalFiberPairs: 8,
        estimatedCapacity: 96,
        exportTemplateVersion: DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
      },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }

    const xml = exportToXML(table)
    expect(xml).toContain(`version="${DEFAULT_SLD_EXPORT_TEMPLATE_VERSION}"`)
    expect(xml).toContain('<Param key="Name" value="FJB" />')
    expect(xml).toContain('<Param key="JointSubType" value="FJB" />')
    expect(xml).toContain('<Param key="SymbolCode" value="FJB" />')
    expect(xml).toContain('<Param key="DeviceFunction" value="joint-box" />')
    expect(xml).toContain('<Param key="Name" value="ROADM" />')
    expect(xml).toContain('<Param key="OADMType" value="ROADM" />')
    expect(xml).toContain('<Param key="SymbolCode" value="ROADM" />')
    expect(xml).toContain('<Param key="Name" value="S" />')
    expect(xml).toContain('<Param key="DisplayLabel" value="F-ATT" />')
    expect(xml).toContain('<Param key="SymbolCode" value="S" />')
    expect(xml).toContain('<Param key="Name" value="R" />')
    expect(xml).toContain('<Param key="SymbolCode" value="R" />')
  })
})
