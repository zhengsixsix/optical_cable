import { describe, expect, it } from 'vitest'
import {
  buildSldEquipmentConfigParams,
  createSldMetadataVersionFields,
  DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
  inferJointSubTypeByContext,
  SLD_ALGORITHM_PROFILE_VERSION,
  SLD_DEVICE_DICTIONARY_VERSION,
  resolveSldSymbolCode,
} from '@/services/sldDeviceRegistry'
import type { SLDEquipment } from '@/types'

describe('SLD device registry', () => {
  it('maps the fixed document device set to standard symbol codes', () => {
    const cases: Array<[Partial<SLDEquipment>, string]> = [
      [{ type: 'TE', name: 'LAND-A' }, 'LAND'],
      [{ type: 'REP', name: 'REP-1' }, 'R'],
      [{ type: 'EQ', name: 'EQ-1', equalizerRole: 'T' }, 'T'],
      [{ type: 'EQ', name: 'EQ-2', equalizerRole: 'S', attenuationMode: 'fixed' }, 'S'],
      [{ type: 'JOINT', name: 'JB-1', jointSubType: 'BJB' }, 'BJB'],
      [{ type: 'JOINT', name: 'JB-2', jointSubType: 'SEJB' }, 'SEJB'],
      [{ type: 'JOINT', name: 'JB-3', jointSubType: 'BUJB' }, 'BUJB'],
      [{ type: 'JOINT', name: 'JB-4', jointSubType: 'SJB' }, 'SJB'],
      [{ type: 'JOINT', name: 'JB-5', jointSubType: 'FJB' }, 'FJB'],
      [{ type: 'OADM', name: 'ROADM-1', buSubType: 'ROADM' }, 'ROADM'],
      [{ type: 'OADM', name: 'OADM-1', buSubType: 'OADM' }, 'OADM'],
    ]

    cases.forEach(([equipment, symbolCode]) => {
      expect(resolveSldSymbolCode(equipment as SLDEquipment)).toBe(symbolCode)
    })
  })

  it('builds algorithm and depth overlay params from the registry', () => {
    const params = buildSldEquipmentConfigParams({
      type: 'EQ',
      name: 'EQ-01',
      equalizerRole: 'S',
      attenuationMode: 'fixed',
      attenuationDb: 3,
      specifications: 'EQ-1000',
    } as SLDEquipment)

    expect(params).toMatchObject({
      Name: 'S',
      DisplayName: 'S',
      SymbolCode: 'S',
      DeviceFunction: 'equalizer',
      OpticalRole: 'attenuation',
      BreaksCable: true,
      DepthOverlayMode: 'device',
      DepthSource: 'equipment',
      DeviceDictionaryVersion: SLD_DEVICE_DICTIONARY_VERSION,
      AlgorithmProfileVersion: SLD_ALGORITHM_PROFILE_VERSION,
      AttenuationMode: 'fixed',
      AttenuationDB: 3,
      DisplayLabel: 'F-ATT',
      Specifications: 'EQ-1000',
    })
  })

  it('preserves selected export version and backfills missing version metadata', () => {
    expect(createSldMetadataVersionFields()).toEqual({
      exportTemplateVersion: DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
      deviceDictionaryVersion: SLD_DEVICE_DICTIONARY_VERSION,
      algorithmProfileVersion: SLD_ALGORITHM_PROFILE_VERSION,
    })

    expect(createSldMetadataVersionFields({
      exportTemplateVersion: 'legacy-v1',
      deviceDictionaryVersion: '2026.03',
      algorithmProfileVersion: '2026.03',
    })).toEqual({
      exportTemplateVersion: 'legacy-v1',
      deviceDictionaryVersion: '2026.03',
      algorithmProfileVersion: '2026.03',
    })
  })

  it('infers standard joint subtypes from water depth, cable type, and BU context', () => {
    expect(inferJointSubTypeByContext({
      kp: 10,
      totalLength: 400,
      depth: 50,
      cableType: 'DA-01',
    })).toBe('SEJB')

    expect(inferJointSubTypeByContext({
      kp: 180,
      totalLength: 400,
      depth: 600,
      cableType: 'SA',
    })).toBe('SJB')

    expect(inferJointSubTypeByContext({
      kp: 200,
      totalLength: 400,
      depth: 3200,
      cableType: 'LW',
    })).toBe('FJB')

    expect(inferJointSubTypeByContext({
      kp: 210,
      totalLength: 400,
      depth: 1200,
      cableType: 'LW',
      nearBranchingUnit: true,
    })).toBe('BUJB')
  })
})
