import type { ConnectorType } from '@/types/connector'
import type { SLDEquipmentType } from '@/types/sld'

export type DeviceLibraryCategory = 'fiber' | 'amplifier' | 'branching' | 'equalizer' | 'joint'

// Runtime semantics only. Platform writes must also verify the code exists in DEVICE_TYPE.
const deviceTypeCodeByCategory: Record<DeviceLibraryCategory, string> = {
  fiber: 'FIB',
  amplifier: 'AMP',
  branching: 'SPL',
  equalizer: 'EQL',
  joint: 'SCL',
}

const connectorTypeByDeviceTypeCode: Record<string, ConnectorType> = {
  FIB: 'fiber',
  AMP: 'amplifier_e',
  SPL: 'bu',
  EQL: 'equalizer',
  SCL: 'joint',
}

const deviceTypeCodeByConnectorType: Partial<Record<ConnectorType, string>> = {
  fiber: deviceTypeCodeByCategory.fiber,
  amplifier_e: deviceTypeCodeByCategory.amplifier,
  amplifier_w: deviceTypeCodeByCategory.amplifier,
  ola: deviceTypeCodeByCategory.amplifier,
  bu: deviceTypeCodeByCategory.branching,
  equalizer: deviceTypeCodeByCategory.equalizer,
  joint: deviceTypeCodeByCategory.joint,
}

const sldTypeByDeviceTypeCode: Partial<Record<string, SLDEquipmentType>> = {
  AMP: 'REP',
  SPL: 'BU',
  EQL: 'EQ',
  SCL: 'JOINT',
}

const deviceTypeCodeBySldType: Partial<Record<SLDEquipmentType, string>> = {
  REP: deviceTypeCodeByCategory.amplifier,
  BU: deviceTypeCodeByCategory.branching,
  OADM: deviceTypeCodeByCategory.branching,
  EQ: deviceTypeCodeByCategory.equalizer,
  JOINT: deviceTypeCodeByCategory.joint,
}

function normalizeDeviceTypeCode(value?: string | null): string {
  return String(value ?? '').trim().toUpperCase()
}

export function getDeviceTypeCodeForCategory(category: DeviceLibraryCategory): string {
  return deviceTypeCodeByCategory[category]
}

export function getDeviceLibraryCategory(deviceTypeCode?: string | null): DeviceLibraryCategory | null {
  const code = normalizeDeviceTypeCode(deviceTypeCode)
  const entry = Object.entries(deviceTypeCodeByCategory)
    .find(([, categoryCode]) => categoryCode === code)
  return (entry?.[0] as DeviceLibraryCategory | undefined) ?? null
}

export function getConnectorTypeForDeviceTypeCode(
  deviceTypeCode?: string | null,
  currentType?: ConnectorType | null,
): ConnectorType {
  const code = normalizeDeviceTypeCode(deviceTypeCode)
  if (currentType && deviceTypeCodeByConnectorType[currentType] === code) return currentType
  return connectorTypeByDeviceTypeCode[code] ?? 'device'
}

export function getDeviceTypeCodeForConnectorType(type: ConnectorType): string | null {
  return deviceTypeCodeByConnectorType[type] ?? null
}

export function getSldEquipmentTypeForDeviceTypeCode(
  deviceTypeCode?: string | null,
  currentType?: SLDEquipmentType | null,
): SLDEquipmentType | null {
  const code = normalizeDeviceTypeCode(deviceTypeCode)
  if (currentType && deviceTypeCodeBySldType[currentType] === code) return currentType
  return sldTypeByDeviceTypeCode[code] ?? null
}

export function getDeviceTypeCodeForSldEquipmentType(type?: SLDEquipmentType | null): string | null {
  return type ? deviceTypeCodeBySldType[type] ?? null : null
}
