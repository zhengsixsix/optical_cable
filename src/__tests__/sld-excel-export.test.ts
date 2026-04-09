import { describe, expect, it } from 'vitest'
import { buildSLDExcelDrawingXml } from '@/services/SLDExcelExportService'
import type { SLDEquipment, SLDFiberSegment, SLDTable } from '@/types'
import { DEFAULT_SLD_EXPORT_TEMPLATE_VERSION } from '@/services/sldDeviceRegistry'

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

function makeTable(equipments: SLDEquipment[]): SLDTable {
  const fiberSegments = equipments.slice(0, -1).map((equipment, index) =>
    makeSegment(index + 1, equipment.id, equipments[index + 1].id)
  )

  return {
    id: 'sld-excel-test',
    name: 'SLD Excel Mapping',
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
      totalLength: fiberSegments.length * 10,
      totalEquipments: equipments.length,
      terminalCount: equipments.filter(eq => eq.type === 'TE').length,
      repeaterCount: equipments.filter(eq => eq.type === 'REP').length,
      branchingUnitCount: equipments.filter(eq => eq.type === 'OADM').length,
      equalizerCount: equipments.filter(eq => eq.type === 'EQ').length,
      jointCount: equipments.filter(eq => eq.type === 'JOINT').length,
      totalFiberPairs: 8,
      estimatedCapacity: 96,
      exportTemplateVersion: DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }
}

describe('SLD Excel drawing mapping', () => {
  it('renders FJB as the document-defined hollow hexagon with a center line', () => {
    const table = makeTable([
      makeEquipment(1, 'TE', 'Landing-A', { kp: 0 }),
      makeEquipment(2, 'JOINT', 'FJB-1', { kp: 10, jointSubType: 'FJB' }),
      makeEquipment(3, 'TE', 'Landing-B', { kp: 20 }),
    ])

    const xml = buildSLDExcelDrawingXml(table)

    expect(xml).toContain('name="FJB-1"')
    expect(xml).toContain('<a:noFill/>')
    expect(xml).toContain('<a:pt x="98" y="0"/>')
    expect(xml).toContain('<a:pt x="98" y="60"/>')
    expect(xml).not.toContain('name="FJB-1_line"')
    expect(xml).not.toContain('A603AB')
  })

  it('renders BUJB as the document-defined solid black hexagon', () => {
    const table = makeTable([
      makeEquipment(1, 'TE', 'Landing-A', { kp: 0 }),
      makeEquipment(2, 'JOINT', 'BUJB-1', { kp: 10, jointSubType: 'BUJB' }),
      makeEquipment(3, 'TE', 'Landing-B', { kp: 20 }),
    ])

    const xml = buildSLDExcelDrawingXml(table)

    expect(xml).toContain('name="BUJB-1"')
    expect(xml).toContain('prst="hexagon"')
    expect(xml).not.toContain('name="BUJB-1_line"')
    expect(xml).not.toContain('A603AB')
  })

  it('keeps OADM on the color bowtie template', () => {
    const table = makeTable([
      makeEquipment(1, 'TE', 'Landing-A', { kp: 0 }),
      makeEquipment(2, 'OADM', 'OADM-1', { kp: 10, buSubType: 'OADM' }),
      makeEquipment(3, 'TE', 'Landing-B', { kp: 20 }),
    ])

    const xml = buildSLDExcelDrawingXml(table)

    expect(xml).toContain('name="OADM-1_L"')
    expect(xml).toContain('name="OADM-1_R"')
    expect(xml).toContain('name="OADM-1_BAR"')
    expect(xml).toContain('A603AB')
  })
})
