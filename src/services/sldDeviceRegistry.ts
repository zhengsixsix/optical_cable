import type {
  BranchingUnitSubType,
  JointBoxSubType,
} from '@/types/settings'
import type {
  SLDConfigParams,
  SLDEquipment,
  SLDExportTemplateVersion,
  SLDDeviceFunctionCode,
  SLDDeviceSymbolCode,
  SLDDepthOverlayMode,
  SLDMetadata,
} from '@/types'

export const DEFAULT_SLD_EXPORT_TEMPLATE_VERSION: SLDExportTemplateVersion = 'standard-v2026.04'
const SLD_DEVICE_DICTIONARY_VERSION = '2026.04'
const SLD_ALGORITHM_PROFILE_VERSION = '2026.04'

export const SLD_EXPORT_TEMPLATE_OPTIONS: Array<{
  value: SLDExportTemplateVersion
  label: string
  description: string
}> = [
  {
    value: 'legacy-v1',
    label: '兼容版 V1',
    description: '保留旧导出结构，兼容已有文件流程',
  },
  {
    value: 'standard-v2026.04',
    label: '标准版 2026.04',
    description: '按当前 SLD 标准设备字典与布局规则导出',
  },
]

interface SLDDeviceAlgorithmProfile {
  functionCode: SLDDeviceFunctionCode
  opticalRole: 'terminal' | 'gain' | 'joint' | 'branch' | 'attenuation'
  breaksCable: boolean
  depthOverlayMode: SLDDepthOverlayMode
  depthSource: 'equipment' | 'none'
  supportsFutureExtension: boolean
  description: string
}

interface SLDDeviceDefinition {
  symbolCode: SLDDeviceSymbolCode
  label: string
  algorithm: SLDDeviceAlgorithmProfile
}

const DEVICE_DEFINITIONS: Record<SLDDeviceSymbolCode, SLDDeviceDefinition> = {
  LAND: {
    symbolCode: 'LAND',
    label: 'LAND',
    algorithm: {
      functionCode: 'terminal',
      opticalRole: 'terminal',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '岸基站/供电端点，作为链路起终点并参与水深展示。',
    },
  },
  BJB: {
    symbolCode: 'BJB',
    label: 'BJB',
    algorithm: {
      functionCode: 'joint-box',
      opticalRole: 'joint',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '滩头接头盒，作为被动接续节点并切断海缆段。',
    },
  },
  SEJB: {
    symbolCode: 'SEJB',
    label: 'SEJB',
    algorithm: {
      functionCode: 'joint-box',
      opticalRole: 'joint',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '可扩展接头盒，常用于岸上扩展节点。',
    },
  },
  BUJB: {
    symbolCode: 'BUJB',
    label: 'BUJB',
    algorithm: {
      functionCode: 'joint-box',
      opticalRole: 'joint',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '分支单元接头盒，服务 BU/ROADM/OADM 连接。',
    },
  },
  SJB: {
    symbolCode: 'SJB',
    label: 'SJB',
    algorithm: {
      functionCode: 'joint-box',
      opticalRole: 'joint',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '海底接头盒，属于海缆海底被动节点。',
    },
  },
  FJB: {
    symbolCode: 'FJB',
    label: 'FJB',
    algorithm: {
      functionCode: 'joint-box',
      opticalRole: 'joint',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '普通光纤接头盒，作为海底光纤接续节点。',
    },
  },
  R: {
    symbolCode: 'R',
    label: 'R',
    algorithm: {
      functionCode: 'repeater',
      opticalRole: 'gain',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '中继器/放大器，作为有源增益设备参与跨度控制。',
    },
  },
  ROADM: {
    symbolCode: 'ROADM',
    label: 'ROADM',
    algorithm: {
      functionCode: 'branching-unit',
      opticalRole: 'branch',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '可重构光分插复用器，作为分支/复用有源节点。',
    },
  },
  OADM: {
    symbolCode: 'OADM',
    label: 'OADM',
    algorithm: {
      functionCode: 'branching-unit',
      opticalRole: 'branch',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '光分插复用器，作为分支/复用节点。',
    },
  },
  T: {
    symbolCode: 'T',
    label: 'T',
    algorithm: {
      functionCode: 'equalizer',
      opticalRole: 'attenuation',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '蓝色均衡器，默认可调均衡角色。',
    },
  },
  S: {
    symbolCode: 'S',
    label: 'S',
    algorithm: {
      functionCode: 'equalizer',
      opticalRole: 'attenuation',
      breaksCable: true,
      depthOverlayMode: 'device',
      depthSource: 'equipment',
      supportsFutureExtension: true,
      description: '红色均衡器，支持固定光衰 F-ATT 标识。',
    },
  },
}

function readConfigString(equipment: Pick<SLDEquipment, 'configParams'> | undefined, key: string): string | undefined {
  const value = equipment?.configParams?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeTypeCode(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase()
  return normalized || undefined
}

function resolveJointSubTypeFromValue(value?: string): JointBoxSubType | undefined {
  const normalized = normalizeTypeCode(value)
  if (!normalized) return undefined
  const supported = ['BJB', 'SEJB', 'BUJB', 'SJB', 'FJB', 'LIJB'] as const
  const exact = supported.find(code => normalized === code)
  if (exact) return exact
  return supported.find(code => normalized.includes(code))
}

function resolveBranchingSubTypeFromValue(value?: string): BranchingUnitSubType | undefined {
  const normalized = normalizeTypeCode(value)
  if (!normalized) return undefined
  if (normalized.includes('ROADM')) return 'ROADM'
  if (normalized.includes('OADM')) return 'OADM'
  if (normalized.includes('BU')) return 'BU'
  return undefined
}

export function resolveEqualizerRole(equipment: Pick<SLDEquipment, 'equalizerRole' | 'configParams'> | undefined): 'T' | 'S' {
  const role = normalizeTypeCode(
    equipment?.equalizerRole || readConfigString(equipment, 'EqualizerRole'),
  )
  return role === 'S' ? 'S' : 'T'
}

export function resolveJointSubType(
  equipment: Pick<SLDEquipment, 'jointSubType' | 'configParams'> | undefined,
): JointBoxSubType | undefined {
  return resolveJointSubTypeFromValue(
    equipment?.jointSubType || readConfigString(equipment, 'JointSubType'),
  )
}

function resolveBranchingSubType(
  equipment: Pick<SLDEquipment, 'buSubType' | 'configParams'> | undefined,
): BranchingUnitSubType | undefined {
  return resolveBranchingSubTypeFromValue(
    equipment?.buSubType || readConfigString(equipment, 'OADMType'),
  )
}

export function isFixedEqualizer(
  equipment: Pick<SLDEquipment, 'type' | 'attenuationMode' | 'configParams'> | undefined,
): boolean {
  if (!equipment || equipment.type !== 'EQ') return false
  if (equipment.attenuationMode === 'fixed') return true
  if (readConfigString(equipment, 'AttenuationMode') === 'fixed') return true
  return readConfigString(equipment, 'DisplayLabel') === 'F-ATT'
}

export function resolveSldSymbolCode(
  equipment: Pick<
    SLDEquipment,
    'type' | 'jointSubType' | 'buSubType' | 'equalizerRole' | 'configParams'
  > | undefined,
): SLDDeviceSymbolCode {
  if (!equipment) return 'LAND'

  switch (equipment.type) {
    case 'TE':
    case 'PFE':
      return 'LAND'
    case 'REP':
      return 'R'
    case 'EQ':
      return resolveEqualizerRole(equipment)
    case 'OADM':
      return resolveBranchingSubType(equipment) === 'ROADM' ? 'ROADM' : 'OADM'
    case 'JOINT': {
      const subType = resolveJointSubType(equipment)
      if (subType === 'SEJB') return 'SEJB'
      if (subType === 'BUJB') return 'BUJB'
      if (subType === 'SJB') return 'SJB'
      if (subType === 'FJB' || subType === 'LIJB') return 'FJB'
      return 'BJB'
    }
    case 'BU':
      return resolveBranchingSubType(equipment) === 'ROADM' ? 'ROADM' : 'OADM'
    default:
      return 'LAND'
  }
}

function resolveSldDeviceDefinition(
  equipment: Pick<
    SLDEquipment,
    'type' | 'jointSubType' | 'buSubType' | 'equalizerRole' | 'configParams'
  > | undefined,
): SLDDeviceDefinition {
  return DEVICE_DEFINITIONS[resolveSldSymbolCode(equipment)]
}

export function resolveSldDisplayName(
  equipment: Pick<
    SLDEquipment,
    'type' | 'name' | 'jointSubType' | 'buSubType' | 'equalizerRole' | 'configParams'
  > | undefined,
): string {
  if (!equipment) return ''
  const configured = readConfigString(equipment, 'DisplayName')
  if (configured) return configured
  return resolveSldDeviceDefinition(equipment).label
}

export function buildSldEquipmentConfigParams(
  equipment: Pick<
    SLDEquipment,
    | 'type'
    | 'name'
    | 'jointSubType'
    | 'buSubType'
    | 'equalizerRole'
    | 'attenuationMode'
    | 'attenuationDb'
    | 'configParams'
    | 'specifications'
    | 'manufacturer'
  >,
  extra: Record<string, string | number | boolean> = {},
): SLDConfigParams {
  const definition = resolveSldDeviceDefinition(equipment)
  const displayName = resolveSldDisplayName(equipment)
  const params: SLDConfigParams = {
    ...(equipment.configParams || {}),
    Name: displayName,
    DisplayName: displayName,
    SymbolCode: definition.symbolCode,
    DeviceFunction: definition.algorithm.functionCode,
    OpticalRole: definition.algorithm.opticalRole,
    BreaksCable: definition.algorithm.breaksCable,
    DepthOverlayMode: definition.algorithm.depthOverlayMode,
    DepthSource: definition.algorithm.depthSource,
    DeviceDictionaryVersion: SLD_DEVICE_DICTIONARY_VERSION,
    AlgorithmProfileVersion: SLD_ALGORITHM_PROFILE_VERSION,
    ...extra,
  }

  const jointSubType = resolveJointSubType(equipment)
  if (jointSubType) params.JointSubType = jointSubType

  const oadmType = resolveBranchingSubType(equipment)
  if (equipment.type === 'OADM' || equipment.type === 'BU') {
    if (oadmType) params.OADMType = oadmType
  }

  if (equipment.type === 'EQ') {
    params.EqualizerRole = resolveEqualizerRole(equipment)
    params.AttenuationMode = isFixedEqualizer(equipment) ? 'fixed' : 'adjustable'
    if (equipment.attenuationDb !== undefined) {
      params.AttenuationDB = equipment.attenuationDb
    }
    if (isFixedEqualizer(equipment)) {
      params.DisplayLabel = 'F-ATT'
    }
  }

  if ((equipment.type === 'TE' || equipment.type === 'PFE') && equipment.name) {
    params.StationName = equipment.name
  }
  if (equipment.specifications) params.Specifications = equipment.specifications
  if (equipment.manufacturer) params.Manufacturer = equipment.manufacturer

  return params
}

export function createSldMetadataVersionFields(
  previous?: Pick<
    SLDMetadata,
    'exportTemplateVersion' | 'deviceDictionaryVersion' | 'algorithmProfileVersion'
  >,
) {
  return {
    exportTemplateVersion:
      previous?.exportTemplateVersion || DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
    deviceDictionaryVersion:
      previous?.deviceDictionaryVersion || SLD_DEVICE_DICTIONARY_VERSION,
    algorithmProfileVersion:
      previous?.algorithmProfileVersion || SLD_ALGORITHM_PROFILE_VERSION,
  }
}
