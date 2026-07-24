import type {
  AmplifierType,
  BranchingUnitType,
  EqualizerType,
  FiberType,
  JointBoxType,
} from '@/types/settings'
import { connectorTypeLabels, type ConnectorElement } from '@/types/connector'
import type { Id, PlatformBindFunc, PlanDeviceEntity, PlanDeviceLibrary } from './types'
import { buildDeviceValueList, deviceValueListToMap } from './deviceAttributes'
import {
  getConnectorTypeForDeviceTypeCode,
} from './deviceTypeAdapter'

export type LocalDeviceLibraryType = 'fiber' | 'amplifier' | 'branching' | 'equalizer' | 'joint'
export type DeviceTypeCodeMap = Partial<Record<LocalDeviceLibraryType, string>>

export type LocalDeviceLibraryItem =
  | FiberType
  | AmplifierType
  | BranchingUnitType
  | EqualizerType
  | JointBoxType

export interface PlatformBackedItem {
  platformId?: number
}

const LOCAL_DEVICE_LIBRARY_PARAMS = 'LOCAL_DEVICE_LIBRARY_PARAMS'
const LOCAL_DEVICE_ENTITY_PARAMS = 'LOCAL_DEVICE_ENTITY_PARAMS'

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

function withLocalParams(
  bindFuncList: PlatformBindFunc[],
  name: string,
  params: Record<string, unknown>,
): PlatformBindFunc[] {
  const serialized = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  )
  return [
    ...bindFuncList.filter(bindFunc => bindFunc.name !== name),
    {
      name,
      isDefault: 0,
      defaultInputParams: serialized,
    },
  ]
}

function getLocalParams(
  bindFuncList?: PlatformBindFunc[] | null,
  name = LOCAL_DEVICE_LIBRARY_PARAMS,
): Record<string, unknown> {
  const bindFunc = bindFuncList?.find(item => item.name === name)
  return bindFunc?.defaultInputParams ?? {}
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
  const normalized = String(value || '').trim()
  if (normalized in connectorTypeLabels) return normalized as ConnectorElement['type']
  return getConnectorTypeForDeviceTypeCode(normalized)
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

export function deviceLibraryItemToPlatform(
  type: LocalDeviceLibraryType,
  item: LocalDeviceLibraryItem & PlatformBackedItem,
  deviceTypeCd?: string | null,
): PlanDeviceLibrary {
  const platformId = typeof item.platformId === 'number' ? item.platformId : numeric(item.id, NaN)

  return {
    id: Number.isFinite(platformId) ? platformId : undefined,
    name: item.name,
    deviceTypeCd: deviceTypeCd?.trim() || undefined,
    iconSize: defaultIconSize,
    dialogWindowId: type,
    bindFuncList: [],
    deviceValueList: buildDeviceValueList(localDeviceItemToValueMap(type, item)),
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
  const deviceTypeCd = library?.deviceTypeCd
    || element.deviceTypeCd
  if (!deviceTypeCd) return null
  const libraryValues = deviceValueListToMap(library?.deviceValueList)
  const bindFuncList = withLocalParams(
    cloneBindFuncList(library?.bindFuncList),
    LOCAL_DEVICE_ENTITY_PARAMS,
    {
      connectorId: element.id,
      connectorType: element.type,
      kp: element.kp,
      endKp: element.endKp,
      depth: element.depth,
      status: element.status,
      specifications: element.specifications,
      manufacturer: element.manufacturer,
      installDate: element.installDate,
      remarks: element.remarks,
      componentRefId: element.componentRefId,
      fiberRefId: element.fiberRefId,
      buPortCount: element.buPortCount,
      buTrunkLoss: element.buTrunkLoss,
      buBranchLoss: element.buBranchLoss,
      buBranchTarget: element.buBranchTarget,
      buNextHopUpstream: element.buNextHopUpstream,
      buNextHopDownstream: element.buNextHopDownstream,
      equalizerRole: element.equalizerRole,
      attenuationMode: element.attenuationMode,
      attenuationDb: element.attenuationDb,
      jointSubType: element.jointSubType,
      buSubType: element.buSubType,
      fromDeviceId: element.fromDeviceId,
      toDeviceId: element.toDeviceId,
      length: element.length,
      cableTypeId: element.cableTypeId,
      cableTypeName: element.cableTypeName,
      armorType: element.armorType,
      slack: element.slack,
      burialDepth: element.burialDepth,
      riskLevel: element.riskLevel,
    },
  )

  return {
    id: element.platformEntityId,
    name: element.name,
    deviceTypeCd,
    iconId: library?.iconId ?? null,
    iconSize: library?.iconSize ?? defaultIconSize,
    dialogWindowId: library?.dialogWindowId ?? null,
    bindFuncList,
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
    deviceTypeCd: entity.deviceTypeCd || undefined,
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
