import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConnectorStore } from '@/stores/connector'
import { useSLDStore } from '@/stores/sld'
import { useSettingsStore } from '@/stores/settings'
import { DEFAULT_SLD_EXPORT_TEMPLATE_VERSION } from '@/services/sldDeviceRegistry'
import { normalizeEqualizerConfig, validateEqualizerConfig } from '@/utils/equalizer'

describe('connector route scoping', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns only the connector table that matches the selected route', () => {
    const connectorStore = useConnectorStore()

    connectorStore.createTable('Route A', 'route-a')
    connectorStore.addElement({
      name: 'EQ-A',
      type: 'equalizer',
      kp: 80,
      longitude: 0,
      latitude: 0,
      depth: 0,
      status: 'planned',
      specifications: '',
      remarks: '',
      equalizerRole: 'T',
      attenuationMode: 'fixed',
      attenuationDb: 2.5,
    }, false)

    connectorStore.createTable('Route B', 'route-b')
    connectorStore.addElement({
      name: 'EQ-B',
      type: 'equalizer',
      kp: 120,
      longitude: 0,
      latitude: 0,
      depth: 0,
      status: 'planned',
      specifications: '',
      remarks: '',
      equalizerRole: 'S',
      attenuationMode: 'fixed',
      attenuationDb: 3.5,
    }, false)

    expect(connectorStore.getElementsForRoute('route-a').map(element => element.name)).toEqual(['EQ-A'])
    expect(connectorStore.getElementsForRoute('route-b').map(element => element.name)).toEqual(['EQ-B'])
    expect(connectorStore.getElementsForRoute('route-missing')).toEqual([])
  })

  it('clears the selected connector table when the route has no matching table', () => {
    const connectorStore = useConnectorStore()

    connectorStore.createTable('Route A', 'route-a')
    expect(connectorStore.selectTableByRoute('route-a')).toBe(true)
    expect(connectorStore.currentTable?.routeId).toBe('route-a')

    expect(connectorStore.selectTableByRoute('route-missing', { clearOnMissing: true })).toBe(false)
    expect(connectorStore.currentTable).toBeNull()
  })

  it('generates unique connector ids even when timestamps collide', () => {
    const connectorStore = useConnectorStore()
    connectorStore.createTable('Route A', 'route-a')

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1710000000000)
    try {
      const firstId = connectorStore.addElement({
        name: 'EQ-A',
        type: 'equalizer',
        kp: 80,
        longitude: 0,
        latitude: 0,
        depth: 0,
        status: 'planned',
        specifications: '',
        remarks: '',
      }, false)
      const secondId = connectorStore.addElement({
        name: 'EQ-B',
        type: 'equalizer',
        kp: 120,
        longitude: 0,
        latitude: 0,
        depth: 0,
        status: 'planned',
        specifications: '',
        remarks: '',
      }, false)

      expect(firstId).toBeTruthy()
      expect(secondId).toBeTruthy()
      expect(firstId).not.toBe(secondId)
      expect(new Set(connectorStore.elements.map(element => element.id)).size).toBe(2)
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('equalizer validation', () => {
  it('rejects invalid fixed attenuation and normalizes values', () => {
    expect(validateEqualizerConfig({ attenuationMode: 'fixed', attenuationDb: 0 })).toBe('固定光衰必须大于 0 dB')
    expect(validateEqualizerConfig({ attenuationMode: 'adjustable', attenuationDb: -1 })).toBe('光衰值不能小于 0 dB')

    expect(normalizeEqualizerConfig({
      equalizerRole: undefined,
      attenuationMode: 'fixed',
      attenuationDb: -3,
    })).toMatchObject({
      equalizerRole: 'T',
      attenuationMode: 'fixed',
      attenuationDb: 0,
    })
  })
})

describe('SLD connector sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('builds an SLD trunk from landing, equalizer, and landing connector devices', () => {
    const sldStore = useSLDStore()
    sldStore.createTable('Auto SLD', 'route-main')

    sldStore.syncAmplifiersFromConnector([
      {
        id: 'land-a',
        name: 'Landing-A',
        type: 'landing',
        kp: 0,
        longitude: 0,
        latitude: 0,
        depth: 0,
        specifications: '',
        remarks: '',
      },
      {
        id: 'eq-a',
        name: 'EQ-01',
        type: 'equalizer',
        kp: 80,
        longitude: 1,
        latitude: 1,
        depth: 0,
        specifications: '',
        remarks: '',
        equalizerRole: 'T' as const,
        attenuationMode: 'fixed' as const,
        attenuationDb: 2.5,
      },
      {
        id: 'land-b',
        name: 'Landing-B',
        type: 'landing',
        kp: 160,
        longitude: 2,
        latitude: 2,
        depth: 0,
        specifications: '',
        remarks: '',
      },
    ], { routeId: 'route-main' })

    expect(sldStore.currentTable!.equipments.map(equipment => equipment.type)).toEqual(['TE', 'EQ', 'TE'])
    expect(sldStore.currentTable!.equipments.map(equipment => equipment.symbolCode)).toEqual(['LAND', 'T', 'LAND'])
    expect(sldStore.currentTable!.fiberSegments).toHaveLength(2)
    expect(sldStore.currentTable!.metadata.equalizerCount).toBe(1)
    expect(sldStore.currentTable!.metadata.exportTemplateVersion).toBe(DEFAULT_SLD_EXPORT_TEMPLATE_VERSION)
    expect(sldStore.currentTable!.equipments[1].configParams).toMatchObject({
      SymbolCode: 'T',
      DeviceFunction: 'equalizer',
      DepthOverlayMode: 'device',
      DisplayLabel: 'F-ATT',
    })
  })

  it('updates generated trunk devices in place and preserves manual SLD content', () => {
    const sldStore = useSLDStore()
    sldStore.createTable('Main SLD', 'route-a')

    const tx = sldStore.addEquipment({
      name: 'TE-A',
      type: 'TE',
      location: 'A',
      kp: 0,
      longitude: 0,
      latitude: 0,
      depth: 0,
      specifications: '',
      remarks: '',
    }, false)!

    const pfeTx = sldStore.addEquipment({
      name: 'PFE-A',
      type: 'PFE',
      location: 'A',
      kp: 1,
      longitude: 0,
      latitude: 0,
      depth: 0,
      specifications: '',
      remarks: '',
    }, false)!

    const manualOadm = sldStore.addEquipment({
      name: 'Manual OADM',
      type: 'OADM',
      location: 'Branch',
      kp: 90,
      longitude: 0,
      latitude: 0,
      depth: 0,
      specifications: '',
      remarks: 'manual',
    }, false)!

    const pfeRx = sldStore.addEquipment({
      name: 'PFE-B',
      type: 'PFE',
      location: 'B',
      kp: 199,
      longitude: 0,
      latitude: 0,
      depth: 0,
      specifications: '',
      remarks: '',
    }, false)!

    const rx = sldStore.addEquipment({
      name: 'TE-B',
      type: 'TE',
      location: 'B',
      kp: 200,
      longitude: 0,
      latitude: 0,
      depth: 0,
      specifications: '',
      remarks: '',
    }, false)!

    const manualSegment = sldStore.addFiberSegment({
      fromEquipmentId: pfeTx.id,
      toEquipmentId: manualOadm.id,
      fromName: pfeTx.name,
      toName: manualOadm.name,
      length: 89,
      fiberPairs: 8,
      fiberPairType: 'working',
      cableType: 'LW',
      attenuation: 0.2,
      totalLoss: 17.8,
      remarks: 'manual-segment',
    })!

    const connectorDevices = [
      {
        id: 'rep-1',
        name: 'REP-1',
        type: 'amplifier_e',
        kp: 80,
        longitude: 0,
        latitude: 0,
        depth: 0,
        specifications: '',
        remarks: '',
      },
      {
        id: 'joint-1',
        name: 'JOINT-1',
        type: 'joint',
        kp: 120,
        longitude: 0,
        latitude: 0,
        depth: 0,
        specifications: '',
        remarks: '',
      },
      {
        id: 'eq-1',
        name: 'F-ATT-1',
        type: 'equalizer',
        kp: 160,
        longitude: 0,
        latitude: 0,
        depth: 0,
        specifications: '',
        remarks: '',
        equalizerRole: 'S' as const,
        attenuationMode: 'fixed' as const,
        attenuationDb: 3.5,
      },
    ]

    sldStore.syncAmplifiersFromConnector(connectorDevices, { routeId: 'route-a' })

    const syncedBefore = sldStore.currentTable!.equipments.find(e => e.sourceConnectorId === 'rep-1')
    expect(syncedBefore).toBeTruthy()
    expect(sldStore.currentTable!.equipments.some(e => e.id === manualOadm.id)).toBe(true)
    expect(sldStore.currentTable!.fiberSegments.some(segment => segment.id === manualSegment.id)).toBe(true)
    expect(
      sldStore.currentTable!.fiberSegments
        .filter(segment => segment.syncSource === 'connector-trunk')
        .every(segment => segment.fromEquipmentId !== manualOadm.id && segment.toEquipmentId !== manualOadm.id)
    ).toBe(true)
    expect(sldStore.currentTable!.metadata.equalizerCount).toBe(1)

    sldStore.syncAmplifiersFromConnector([
      { ...connectorDevices[0], name: 'REP-1-UPDATED' },
      connectorDevices[1],
      connectorDevices[2],
    ], { routeId: 'route-a' })

    const syncedAfter = sldStore.currentTable!.equipments.find(e => e.sourceConnectorId === 'rep-1')
    expect(syncedAfter?.id).toBe(syncedBefore?.id)
    expect(syncedAfter?.name).toBe('REP-1-UPDATED')
    expect(sldStore.currentTable!.equipments.filter(e => e.sourceConnectorId === 'rep-1')).toHaveLength(1)
    expect(sldStore.currentTable!.equipments.some(e => e.id === tx.id)).toBe(true)
    expect(sldStore.currentTable!.equipments.some(e => e.id === pfeRx.id)).toBe(true)
    expect(sldStore.currentTable!.equipments.some(e => e.id === rx.id)).toBe(true)
  })

  it('maps connector library subtypes and display labels for export-ready SLD fields', () => {
    const sldStore = useSLDStore()
    const settingsStore = useSettingsStore()
    settingsStore.amplifierTypes = [
      {
        id: 'amp-edfa',
        name: 'EDFA-Std',
        gain: 20,
        bandwidth: 35,
        gainFlatness: 1.5,
        noiseFigure: 5,
        pumpPower: 300,
        outputPower: 18,
        gainRangePower: 5,
      }
    ]
    settingsStore.equalizerTypes = [
      { id: 'eq-fixed', name: 'EQ-FATT-3dB', attenuationMode: 'fixed', defaultAttenuationDb: 3 }
    ]
    settingsStore.jointBoxTypes = [
      { id: 'joint-fjb', name: 'FJB-1', subType: 'FJB', insertionLoss: 0.08 }
    ]
    settingsStore.branchingUnitTypes = [
      {
        id: 'bu-roadm',
        name: 'ROADM-BU',
        subType: 'ROADM',
        portCount: 4,
        trunkInsertionLoss: 1.2,
        branchInsertionLoss: 1.5,
        insertionLoss: 2.7,
        wavelengthRange: 80,
      }
    ]
    sldStore.createTable('Subtype Mapping', 'route-subtype')

    sldStore.syncAmplifiersFromConnector([
      { id: 'land-a', name: 'A', type: 'landing', kp: 0, longitude: 0, latitude: 0, depth: 0 },
      { id: 'joint-a', name: 'Joint-A', type: 'joint', kp: 20, longitude: 0, latitude: 0, depth: 0, componentRefId: 'joint-fjb' },
      { id: 'bu-a', name: 'BU-A', type: 'bu', kp: 40, longitude: 0, latitude: 0, depth: 0, componentRefId: 'bu-roadm' },
      {
        id: 'eq-a',
        name: 'EQ-A',
        type: 'equalizer',
        kp: 60,
        longitude: 0,
        latitude: 0,
        depth: 0,
        componentRefId: 'eq-fixed',
        equalizerRole: 'S',
        attenuationMode: 'fixed',
        attenuationDb: 2.2,
      },
      { id: 'rep-a', name: 'REP-A', type: 'amplifier_e', kp: 80, longitude: 0, latitude: 0, depth: 0, componentRefId: 'amp-edfa' },
      { id: 'land-b', name: 'B', type: 'landing', kp: 100, longitude: 0, latitude: 0, depth: 0 },
    ], { routeId: 'route-subtype' })

    const joint = sldStore.currentTable!.equipments.find(e => e.sourceConnectorId === 'joint-a')
    const roadm = sldStore.currentTable!.equipments.find(e => e.sourceConnectorId === 'bu-a')
    const eq = sldStore.currentTable!.equipments.find(e => e.sourceConnectorId === 'eq-a')
    const rep = sldStore.currentTable!.equipments.find(e => e.sourceConnectorId === 'rep-a')

    expect(joint?.type).toBe('JOINT')
    expect(joint?.componentRefId).toBe('joint-fjb')
    expect(joint?.jointSubType).toBe('FJB')
    expect(joint?.specifications).toBe('FJB-1')
    expect(joint?.configParams?.JointSubType).toBe('FJB')
    expect(joint?.configParams?.DisplayName).toBe('FJB')

    expect(roadm?.type).toBe('OADM')
    expect(roadm?.buSubType).toBe('ROADM')
    expect(roadm?.specifications).toBe('ROADM-BU')
    expect(roadm?.configParams?.OADMType).toBe('ROADM')
    expect(roadm?.configParams?.DisplayName).toBe('ROADM')

    expect(eq?.type).toBe('EQ')
    expect(eq?.componentRefId).toBe('eq-fixed')
    expect(eq?.specifications).toBe('EQ-FATT-3dB')
    expect(eq?.configParams?.DisplayName).toBe('S')
    expect(eq?.configParams?.DisplayLabel).toBe('F-ATT')

    expect(rep?.type).toBe('REP')
    expect(rep?.componentRefId).toBe('amp-edfa')
    expect(rep?.specifications).toBe('EDFA-Std')
    expect(rep?.configParams?.DisplayName).toBe('R')
  })

  it('maps underwater connector points to PFE so terminal order stays stable', () => {
    const sldStore = useSLDStore()
    sldStore.createTable('Terminal Mapping', 'route-pfe')

    sldStore.syncAmplifiersFromConnector([
      { id: 'land-a', name: 'LAND-A', type: 'landing', kp: 0, longitude: 0, latitude: 0, depth: 0 },
      { id: 'pfe-a', name: 'PFE-A', type: 'underwater', kp: 1, longitude: 0, latitude: 0, depth: 5 },
      { id: 'rep-a', name: 'REP-A', type: 'amplifier_e', kp: 50, longitude: 0, latitude: 0, depth: 1000 },
      { id: 'pfe-b', name: 'PFE-B', type: 'underwater', kp: 99, longitude: 0, latitude: 0, depth: 5 },
      { id: 'land-b', name: 'LAND-B', type: 'landing', kp: 100, longitude: 0, latitude: 0, depth: 0 },
    ], { routeId: 'route-pfe' })

    expect(sldStore.currentTable!.equipments.map(equipment => equipment.type)).toEqual(['TE', 'PFE', 'REP', 'PFE', 'TE'])
    expect(sldStore.currentTable!.metadata.terminalCount).toBe(4)
  })

  it('honors connector subtype metadata when the library model itself is generic', () => {
    const sldStore = useSLDStore()
    const settingsStore = useSettingsStore()
    settingsStore.jointBoxTypes = [
      { id: 'joint-generic', name: 'JB-Generic', insertionLoss: 0.08 }
    ]

    sldStore.createTable('Connector Metadata Mapping', 'route-joint-meta')

    sldStore.syncAmplifiersFromConnector([
      { id: 'land-a', name: 'A', type: 'landing', kp: 0, longitude: 0, latitude: 0, depth: 0 },
      {
        id: 'joint-meta',
        name: 'Joint-Meta',
        type: 'joint',
        kp: 50,
        longitude: 0,
        latitude: 0,
        depth: 1800,
        componentRefId: 'joint-generic',
        jointSubType: 'FJB',
      },
      { id: 'land-b', name: 'B', type: 'landing', kp: 100, longitude: 0, latitude: 0, depth: 0 },
    ], { routeId: 'route-joint-meta' })

    const joint = sldStore.currentTable!.equipments.find(e => e.sourceConnectorId === 'joint-meta')
    expect(joint?.jointSubType).toBe('FJB')
    expect(joint?.configParams?.JointSubType).toBe('FJB')
    expect(joint?.configParams?.DisplayName).toBe('FJB')
  })
})
