import type {
  AmplifierType,
  BranchingUnitType,
  EqualizerType,
  FiberType,
  JointBoxType,
} from '@/types/settings'
import type { ConnectorElement } from '@/types/connector'
import type { Id, PlatformBindFunc, PlanDeviceEntity, PlanDeviceLibrary } from './types'
import { buildDeviceValueList, deviceValueListToMap } from './deviceAttributes'

export type LocalDeviceLibraryType = 'fiber' | 'amplifier' | 'branching' | 'equalizer' | 'joint'

export type LocalDeviceLibraryItem =
  | FiberType
  | AmplifierType
  | BranchingUnitType
  | EqualizerType
  | JointBoxType

export interface PlatformBackedItem {
  platformId?: number
}

export const LOCAL_DEVICE_LIBRARY_PARAMS = 'LOCAL_DEVICE_LIBRARY_PARAMS'
export const LOCAL_DEVICE_ENTITY_PARAMS = 'LOCAL_DEVICE_ENTITY_PARAMS'

export const localDeviceTypeToPlatformCode: Record<LocalDeviceLibraryType, string> = {
  fiber: 'FIB',
  amplifier: 'AMP',
  branching: 'SPL',
  equalizer: 'EQL',
  joint: 'SCL',
}

const platformCodeToLocalDeviceType: Record<string, LocalDeviceLibraryType> = {
  FIB: 'fiber',
  FIBER: 'fiber',
  OPTICAL_FIBER: 'fiber',
  AMP: 'amplifier',
  AMPLIFIER: 'amplifier',
  EDFA: 'amplifier',
  OLA: 'amplifier',
  SPL: 'branching',
  SPLITTER: 'branching',
  BU: 'branching',
  BRANCHING: 'branching',
  BRANCHING_UNIT: 'branching',
  EQL: 'equalizer',
  EQ: 'equalizer',
  EQUALIZER: 'equalizer',
  SCL: 'joint',
  JB: 'joint',
  JOINT: 'joint',
  JOINT_BOX: 'joint',
}

const connectorTypeToPlatformCode: Record<string, string> = {
  landing: 'LANDING',
  underwater: 'UNDERWATER',
  amplifier_e: 'AMP',
  amplifier_w: 'AMP',
  ola: 'AMP',
  bu: 'SPL',
  equalizer: 'EQL',
  joint: 'SCL',
  fiber: 'FIB',
  cable_segment: 'CABLE',
}

const platformCodeToConnectorType: Record<string, ConnectorElement['type']> = {
  LANDING: 'landing',
  LANDING_STATION: 'landing',
  UNDERWATER: 'underwater',
  UNDERWATER_STATION: 'underwater',
  AMP: 'amplifier_e',
  AMPLIFIER: 'amplifier_e',
  EDFA: 'amplifier_e',
  OLA: 'ola',
  SPL: 'bu',
  SPLITTER: 'bu',
  BU: 'bu',
  BRANCHING: 'bu',
  BRANCHING_UNIT: 'bu',
  EQL: 'equalizer',
  EQ: 'equalizer',
  EQUALIZER: 'equalizer',
  SCL: 'joint',
  JB: 'joint',
  JOINT: 'joint',
  JOINT_BOX: 'joint',
  FIB: 'fiber',
  FIBER: 'fiber',
  OPTICAL_FIBER: 'fiber',
  CABLE: 'cable_segment',
}

const defaultIconSize = { width: 48, height: 48 }

function cloneBindFuncList(bindFuncList?: PlatformBindFunc[] | null): PlatformBindFunc[] {
  return (bindFuncList ?? [])
    .filter(bindFunc => Boolean(bindFunc.name?.trim()))
    .map(bindFunc => ({
      name: bindFunc.name,
      isDefault: bindFunc.isDefault ?? 0,
      defaultInputParams: Object.fromEntries(
        Object.entries(bindFunc.defaultInputParams ?? {}).map(([key, value]) => [
          key,
          value == null ? '' : String(value),
        ]),
      ),
    }))
}

function getLocalParams(
  bindFuncList?: PlatformBindFunc[] | null,
  name = LOCAL_DEVICE_LIBRARY_PARAMS,
): Record<string, unknown> {
  const bindFunc = bindFuncList?.find(item => item.name === name)
  return bindFunc?.defaultInputParams ?? {}
}

function normalizeType(
  deviceTypeCd?: string | null,
  params?: Record<string, unknown>,
  dialogWindowId?: string | null,
): LocalDeviceLibraryType | null {
  const paramType = params?.localType
  if (paramType === 'fiber' || paramType === 'amplifier' || paramType === 'branching' || paramType === 'equalizer' || paramType === 'joint') {
    return paramType
  }

  const normalizedCode = String(deviceTypeCd || dialogWindowId || '').trim().toUpperCase()
  return platformCodeToLocalDeviceType[normalizedCode] ?? null
}

function platformLocalId(platformId: number | string | undefined) {
  return platformId == null ? `platform-device-library-${Date.now()}` : `platform-device-library-${platformId}`
}

function numeric(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function stringOrUndefined(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  return String(value)
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function normalizeConnectorType(value?: string | null): ConnectorElement['type'] {
  const normalized = String(value || '').trim().toUpperCase()
  return platformCodeToConnectorType[normalized] ?? 'landing'
}

function currency(value: unknown): 'USD' | 'CNY' | 'EUR' {
  return value === 'CNY' || value === 'EUR' || value === 'USD' ? value : 'USD'
}

function localDeviceItemToValueMap(
  type: LocalDeviceLibraryType,
  item: LocalDeviceLibraryItem,
): Record<string, unknown> {
  if (type === 'fiber') {
    const fiber = item as FiberType & { fiberCategory?: string }
    return {
      fiber_category: fiber.fiberCategory ?? fiber.name,
      nonlinear_coeff: fiber.nonlinearCoeff,
      effective_area: fiber.effectiveArea,
      dispersion: fiber.dispersion,
      nonlinear_index: fiber.nonlinearRefractiveIndex,
      attenuation: fiber.attenuationCoeff,
      dispersion_slope: fiber.secondOrderDispersion,
      simulation_model: fiber.simulationModel,
    }
  }

  if (type === 'amplifier') {
    const amplifier = item as AmplifierType
    return {
      gain: amplifier.gain,
      bandwidth: amplifier.bandwidth,
      gain_flatness: amplifier.gainFlatness,
      noise_figure: amplifier.noiseFigure,
      pump_power: amplifier.pumpPower,
      output_power: amplifier.outputPower,
      saturation_power: amplifier.saturationPower,
      gain_range_power: amplifier.gainRangePower,
      operating_mode: amplifier.operatingMode,
      unit_price: amplifier.unitPrice,
      currency: amplifier.currency,
    }
  }

  if (type === 'branching') {
    const branching = item as BranchingUnitType
    return {
      sub_type: branching.subType,
      port_count: branching.portCount,
      trunk_insertion_loss: branching.trunkInsertionLoss,
      branch_insertion_loss: branching.branchInsertionLoss,
      insertion_loss: branching.insertionLoss,
      wavelength_range: branching.wavelengthRange,
      unit_price: branching.unitPrice,
      currency: branching.currency,
    }
  }

  if (type === 'equalizer') {
    const equalizer = item as EqualizerType
    return {
      attenuation_mode: equalizer.attenuationMode,
      default_attenuation_db: equalizer.defaultAttenuationDb,
      unit_price: equalizer.unitPrice,
      currency: equalizer.currency,
      remarks: equalizer.remarks,
    }
  }

  const jointBox = item as JointBoxType
  return {
    sub_type: jointBox.subType,
    insertion_loss: jointBox.insertionLoss,
    max_fiber_pairs: jointBox.maxFiberPairs,
    unit_price: jointBox.unitPrice,
    currency: jointBox.currency,
    remarks: jointBox.remarks,
  }
}

function mergedDeviceParams(device: PlanDeviceLibrary): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(getLocalParams(device.bindFuncList)).map(([key, value]) => [key, value == null ? '' : String(value)])),
    ...deviceValueListToMap(device.deviceValueList),
  }
}

export function deviceLibraryItemToPlatform(
  type: LocalDeviceLibraryType,
  item: LocalDeviceLibraryItem & PlatformBackedItem,
): PlanDeviceLibrary {
  const platformId = typeof item.platformId === 'number' ? item.platformId : numeric(item.id, NaN)

  return {
    id: Number.isFinite(platformId) ? platformId : undefined,
    name: item.name,
    deviceTypeCd: localDeviceTypeToPlatformCode[type],
    iconSize: defaultIconSize,
    dialogWindowId: type,
    bindFuncList: [],
    deviceValueList: buildDeviceValueList(localDeviceItemToValueMap(type, item)),
  }
}

export function platformDeviceLibraryToLocal(device: PlanDeviceLibrary): {
  type: LocalDeviceLibraryType
  item: LocalDeviceLibraryItem & PlatformBackedItem
} | null {
  const params = mergedDeviceParams(device)
  const type = normalizeType(device.deviceTypeCd, params, device.dialogWindowId)
  if (!type) return null

  const id = platformLocalId(device.id)
  const name = String(device.name || params.name || id)
  const common = {
    ...params,
    id,
    name,
    platformId: device.id,
  }

  if (type === 'fiber') {
    return {
      type,
      item: {
        ...common,
        nonlinearCoeff: numeric(params.nonlinearCoeff, 1.4),
        effectiveArea: numeric(params.effectiveArea, 80),
        dispersion: numeric(params.dispersion, 17),
        nonlinearRefractiveIndex: numeric(params.nonlinearRefractiveIndex, 2.6),
        attenuationCoeff: numeric(params.attenuationCoeff, 0.2),
        secondOrderDispersion: numeric(params.secondOrderDispersion, -21),
        simulationModel: params.simulationModel === 'EGN' ? 'EGN' : 'GN',
      } as FiberType & PlatformBackedItem,
    }
  }

  if (type === 'amplifier') {
    return {
      type,
      item: {
        ...common,
        gain: numeric(params.gain, 20),
        bandwidth: numeric(params.bandwidth, 1550),
        gainFlatness: numeric(params.gainFlatness, 0.5),
        noiseFigure: numeric(params.noiseFigure, 5),
        pumpPower: numeric(params.pumpPower, 100),
        outputPower: numeric(params.outputPower, 17),
        saturationPower: params.saturationPower == null ? undefined : numeric(params.saturationPower, 20),
        gainRangePower: numeric(params.gainRangePower, 0.1),
        operatingMode: params.operatingMode === 'fixed_output' || params.operatingMode === 'apc' ? params.operatingMode : 'fixed_gain',
        unitPrice: params.unitPrice == null ? undefined : numeric(params.unitPrice),
        currency: currency(params.currency),
      } as AmplifierType & PlatformBackedItem,
    }
  }

  if (type === 'branching') {
    return {
      type,
      item: {
        ...common,
        subType: params.subType === 'ROADM' || params.subType === 'OADM' ? params.subType : 'BU',
        portCount: numeric(params.portCount, 3),
        trunkInsertionLoss: numeric(params.trunkInsertionLoss, 0.5),
        branchInsertionLoss: numeric(params.branchInsertionLoss, 3),
        insertionLoss: numeric(params.insertionLoss ?? params.trunkInsertionLoss, 0.5),
        wavelengthRange: numeric(params.wavelengthRange, 1550),
        unitPrice: params.unitPrice == null ? undefined : numeric(params.unitPrice),
        currency: currency(params.currency),
      } as BranchingUnitType & PlatformBackedItem,
    }
  }

  if (type === 'equalizer') {
    return {
      type,
      item: {
        ...common,
        attenuationMode: params.attenuationMode === 'fixed' ? 'fixed' : 'adjustable',
        defaultAttenuationDb: numeric(params.defaultAttenuationDb),
        unitPrice: params.unitPrice == null ? undefined : numeric(params.unitPrice),
        currency: currency(params.currency),
        remarks: String(params.remarks || ''),
      } as EqualizerType & PlatformBackedItem,
    }
  }

  return {
    type,
    item: {
      ...common,
      insertionLoss: numeric(params.insertionLoss),
      maxFiberPairs: params.maxFiberPairs == null ? undefined : numeric(params.maxFiberPairs),
      unitPrice: params.unitPrice == null ? undefined : numeric(params.unitPrice),
      currency: currency(params.currency),
      remarks: String(params.remarks || ''),
    } as JointBoxType & PlatformBackedItem,
  }
}

export function connectorElementToDeviceEntity(
  element: ConnectorElement,
  projectId: Id,
  sortNum: number,
  libraries: PlanDeviceLibrary[] = [],
): PlanDeviceEntity | null {
  if (element.longitude == null || element.latitude == null) return null

  const libraryId = numeric(element.componentRefId || element.fiberRefId, NaN)
  const library = Number.isFinite(libraryId)
    ? libraries.find(item => String(item.id) === String(libraryId))
    : null
  const deviceTypeCd = library?.deviceTypeCd || connectorTypeToPlatformCode[element.type] || String(element.type).toUpperCase()
  const libraryValues = deviceValueListToMap(library?.deviceValueList)

  return {
    id: element.platformEntityId,
    name: element.name,
    deviceTypeCd,
    iconId: library?.iconId ?? null,
    iconSize: library?.iconSize ?? defaultIconSize,
    dialogWindowId: library?.dialogWindowId ?? null,
    bindFuncList: cloneBindFuncList(library?.bindFuncList),
    libraryId: Number.isFinite(libraryId) ? libraryId : undefined,
    longitude: element.longitude,
    latitude: element.latitude,
    projectId,
    sortNum,
    deviceValueList: buildDeviceValueList(libraryValues),
  }
}

export function platformDeviceEntityToConnectorElement(entity: PlanDeviceEntity): ConnectorElement {
  const params = getLocalParams(entity.bindFuncList, LOCAL_DEVICE_ENTITY_PARAMS)
  const connectorType = params.connectorType && typeof params.connectorType === 'string'
    ? normalizeConnectorType(params.connectorType)
    : normalizeConnectorType(entity.deviceTypeCd || entity.dialogWindowId)

  const libraryId = entity.libraryId == null ? '' : String(entity.libraryId)
  const isFiber = connectorType === 'fiber'
  const componentRefId = isFiber ? stringOrUndefined(params.componentRefId) : (stringOrUndefined(params.componentRefId) || libraryId)
  const fiberRefId = isFiber ? (stringOrUndefined(params.fiberRefId) || libraryId) : stringOrUndefined(params.fiberRefId)

  return {
    id: String(params.connectorId || entity.id || `platform-device-entity-${Date.now()}`),
    platformEntityId: entity.id,
    name: String(entity.name || entity.libraryName || entity.id || '接线元'),
    type: connectorType,
    kp: numeric(params.kp),
    endKp: optionalNumber(params.endKp),
    longitude: numeric(entity.longitude),
    latitude: numeric(entity.latitude),
    depth: numeric(params.depth),
    status: (params.status === 'active' || params.status === 'standby' || params.status === 'fault' || params.status === 'planned')
      ? params.status
      : 'planned',
    specifications: String(params.specifications || entity.libraryName || ''),
    manufacturer: stringOrUndefined(params.manufacturer),
    installDate: stringOrUndefined(params.installDate),
    remarks: String(params.remarks || ''),
    componentRefId,
    fiberRefId,
    buPortCount: optionalNumber(params.buPortCount),
    buTrunkLoss: optionalNumber(params.buTrunkLoss),
    buBranchLoss: optionalNumber(params.buBranchLoss),
    buBranchTarget: stringOrUndefined(params.buBranchTarget),
    buNextHopUpstream: stringOrUndefined(params.buNextHopUpstream),
    buNextHopDownstream: stringOrUndefined(params.buNextHopDownstream),
    equalizerRole: params.equalizerRole === 'S' ? 'S' : params.equalizerRole === 'T' ? 'T' : undefined,
    attenuationMode: params.attenuationMode === 'fixed' ? 'fixed' : params.attenuationMode === 'adjustable' ? 'adjustable' : undefined,
    attenuationDb: optionalNumber(params.attenuationDb),
    jointSubType: stringOrUndefined(params.jointSubType) as ConnectorElement['jointSubType'],
    buSubType: stringOrUndefined(params.buSubType) as ConnectorElement['buSubType'],
    fromDeviceId: stringOrUndefined(params.fromDeviceId),
    toDeviceId: stringOrUndefined(params.toDeviceId),
    length: optionalNumber(params.length),
    cableTypeId: stringOrUndefined(params.cableTypeId),
    cableTypeName: stringOrUndefined(params.cableTypeName),
    armorType: stringOrUndefined(params.armorType),
    slack: optionalNumber(params.slack),
    burialDepth: optionalNumber(params.burialDepth),
    riskLevel: params.riskLevel === 'high' || params.riskLevel === 'medium' || params.riskLevel === 'low'
      ? params.riskLevel
      : undefined,
  }
}
