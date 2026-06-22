import type {
  AmplifierType,
  BranchingUnitType,
  EqualizerType,
  FiberType,
  JointBoxType,
} from '@/types/settings'
import type { ConnectorElement } from '@/types/connector'
import type { Id, PlatformBindFunc, PlanDeviceEntity, PlanDeviceLibrary } from './types'

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
  branching: 'BU',
  equalizer: 'EQ',
  joint: 'JB',
}

const platformCodeToLocalDeviceType: Record<string, LocalDeviceLibraryType> = {
  FIB: 'fiber',
  FIBER: 'fiber',
  OPTICAL_FIBER: 'fiber',
  AMP: 'amplifier',
  AMPLIFIER: 'amplifier',
  EDFA: 'amplifier',
  OLA: 'amplifier',
  BU: 'branching',
  BRANCHING: 'branching',
  BRANCHING_UNIT: 'branching',
  EQ: 'equalizer',
  EQUALIZER: 'equalizer',
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
  bu: 'BU',
  equalizer: 'EQ',
  joint: 'JB',
  fiber: 'FIB',
  cable_segment: 'CABLE',
}

const defaultIconSize = { width: 48, height: 48 }

function clonePlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getLocalParams(bindFuncList?: PlatformBindFunc[] | null): Record<string, unknown> {
  const bindFunc = bindFuncList?.find(item => item.name === LOCAL_DEVICE_LIBRARY_PARAMS)
  return bindFunc?.defaultInputParams ?? {}
}

function normalizeType(deviceTypeCd?: string | null, params?: Record<string, unknown>): LocalDeviceLibraryType | null {
  const paramType = params?.localType
  if (paramType === 'fiber' || paramType === 'amplifier' || paramType === 'branching' || paramType === 'equalizer' || paramType === 'joint') {
    return paramType
  }

  const normalizedCode = String(deviceTypeCd || '').trim().toUpperCase()
  return platformCodeToLocalDeviceType[normalizedCode] ?? null
}

function platformLocalId(platformId: number | string | undefined) {
  return platformId == null ? `platform-device-library-${Date.now()}` : `platform-device-library-${platformId}`
}

function numeric(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function currency(value: unknown): 'USD' | 'CNY' | 'EUR' {
  return value === 'CNY' || value === 'EUR' || value === 'USD' ? value : 'USD'
}

export function deviceLibraryItemToPlatform(
  type: LocalDeviceLibraryType,
  item: LocalDeviceLibraryItem & PlatformBackedItem,
): PlanDeviceLibrary {
  const platformId = typeof item.platformId === 'number' ? item.platformId : numeric(item.id, NaN)
  const params = clonePlainObject({
    ...item,
    localId: item.id,
    localType: type,
  }) as Record<string, unknown>
  delete params.platformId

  return {
    id: Number.isFinite(platformId) ? platformId : undefined,
    name: item.name,
    deviceTypeCd: localDeviceTypeToPlatformCode[type],
    iconSize: defaultIconSize,
    dialogWindowId: type,
    bindFuncList: [{
      name: LOCAL_DEVICE_LIBRARY_PARAMS,
      defaultInputParams: params,
    }],
  }
}

export function platformDeviceLibraryToLocal(device: PlanDeviceLibrary): {
  type: LocalDeviceLibraryType
  item: LocalDeviceLibraryItem & PlatformBackedItem
} | null {
  const params = getLocalParams(device.bindFuncList)
  const type = normalizeType(device.deviceTypeCd, params)
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
): PlanDeviceEntity | null {
  if (element.longitude == null || element.latitude == null) return null

  const deviceTypeCd = connectorTypeToPlatformCode[element.type] || String(element.type).toUpperCase()
  const libraryId = numeric(element.componentRefId || element.fiberRefId, NaN)

  return {
    name: element.name,
    deviceTypeCd,
    iconSize: defaultIconSize,
    dialogWindowId: element.type,
    bindFuncList: [{
      name: LOCAL_DEVICE_ENTITY_PARAMS,
      defaultInputParams: clonePlainObject({
        connectorId: element.id,
        connectorType: element.type,
        kp: element.kp,
        endKp: element.endKp,
        depth: element.depth,
        status: element.status,
        specifications: element.specifications,
        remarks: element.remarks,
        componentRefId: element.componentRefId,
        fiberRefId: element.fiberRefId,
      }),
    }],
    libraryId: Number.isFinite(libraryId) ? libraryId : undefined,
    longitude: element.longitude,
    latitude: element.latitude,
    projectId,
    sortNum,
  }
}
