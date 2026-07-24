import type { PlanDeviceLibrary, PlanDeviceValueSave, PlanDeviceValueSimple } from './types'
import {
  getDeviceLibraryCategory,
  type DeviceLibraryCategory,
} from './deviceTypeAdapter'

export type { DeviceLibraryCategory } from './deviceTypeAdapter'

export interface RuntimeFiberLibrary {
  id: string
  name: string
  fiberCategory?: string
  attenuationCoeff: number
  dispersion: number
  dispersionSlope: number
  effectiveArea: number
  nonlinearRefractiveIndex: number
  nonlinearCoeff: number
  simulationModel?: 'GN' | 'EGN' | 'SSFM'
  raw: PlanDeviceLibrary
}

export interface RuntimeAmplifierLibrary {
  id: string
  name: string
  gain: number
  bandwidth?: number
  gainFlatness?: number
  noiseFigure: number
  pumpPower?: number
  outputPower: number
  saturationPower: number
  gainRangePower?: number
  unitPrice?: number
  operatingMode?: 'AGC' | 'APC' | 'fixed_gain' | 'fixed_output' | 'apc'
  raw: PlanDeviceLibrary
}

export interface RuntimeBranchingLibrary {
  id: string
  name: string
  subType?: 'BU' | 'ROADM' | 'OADM'
  portCount: number
  trunkInsertionLoss: number
  branchInsertionLoss: number
  insertionLoss?: number
  wavelengthRange?: number
  raw: PlanDeviceLibrary
}

export interface RuntimeEqualizerLibrary {
  id: string
  name: string
  attenuationMode: 'adjustable' | 'fixed'
  defaultAttenuationDb: number
  raw: PlanDeviceLibrary
}

const valueAliases = {
  fiberCategory: ['fiberCategory', 'fiber_category', 'fiber_type', 'fiberType', '光纤类型', '光缆类型'],
  attenuation: ['attenuation', 'attenuationCoeff', 'attenuation_coeff', 'alpha', '衰减系数', '衰减系数α'],
  dispersion: ['dispersion', 'dispersion_d', 'D', '色散系数', '色散系数D'],
  dispersionSlope: ['dispersion_slope', 'dispersionSlope', 'S', '色散斜率', '色散斜率S'],
  effectiveArea: ['effective_area', 'effectiveArea', 'A_eff', 'Aeff', '有效面积', '有效面积Aeff'],
  nonlinearIndex: ['nonlinear_index', 'nonlinearIndex', 'nonlinearRefractiveIndex', 'n2', '非线性折射率', '非线性折射率n2'],
  nonlinearCoeff: ['nonlinear_coeff', 'nonlinearCoeff', 'gamma', 'γ', '非线性系数'],
  simulationModel: ['simulationModel', 'simulation_model', 'fiber_model', '仿真模型'],
  gain: ['gain', 'rated_gain', '增益', '额定增益'],
  bandwidth: ['bandwidth', 'band_width', '带宽'],
  gainFlatness: ['gainFlatness', 'gain_flatness', 'flatness', '增益平坦度', '平坦度'],
  noiseFigure: ['noise_figure', 'noiseFigure', 'nf', 'NF', '噪声系数', '噪声系数NF'],
  pumpPower: ['pumpPower', 'pump_power', '泵浦功率'],
  outputPower: ['output_power', 'outputPower', 'maxOutputPower', 'max_output_power', '最大输出功率'],
  saturationPower: ['saturation_power', 'saturationPower', '饱和功率'],
  gainRangePower: ['gainRangePower', 'gain_range_power', '增益范围'],
  unitPrice: ['unitPrice', 'unit_price', 'price', '单价'],
  operatingMode: ['operatingMode', 'operating_mode', '工作模式'],
  subType: ['subType', 'sub_type', 'device_sub_type', '子类型'],
  portCount: ['portCount', 'port_count', 'ports', '端口数', '端口数量'],
  trunkInsertionLoss: ['trunkInsertionLoss', 'trunk_insertion_loss', 'trunkLoss', 'trunk_loss', '主干插损'],
  branchInsertionLoss: ['branchInsertionLoss', 'branch_insertion_loss', 'branchLoss', 'branch_loss', '分支插损'],
  insertionLoss: ['insertionLoss', 'insertion_loss', 'loss', '插损'],
  wavelengthRange: ['wavelengthRange', 'wavelength_range', '工作波长范围'],
  attenuationMode: ['attenuationMode', 'attenuation_mode', '衰减模式', '光衰模式'],
  defaultAttenuationDb: ['defaultAttenuationDb', 'default_attenuation_db', 'attenuationDb', 'attenuation_db', '默认衰减', '默认光衰'],
  maxFiberPairs: ['maxFiberPairs', 'max_fiber_pairs', '最大光纤对数'],
} satisfies Record<string, string[]>

export type RuntimeDeviceValueKey = keyof typeof valueAliases

export function withRuntimeDeviceValues(
  library: PlanDeviceLibrary,
  updates: Partial<Record<RuntimeDeviceValueKey, string | number>>,
): PlanDeviceLibrary {
  const deviceValueList = [...(library.deviceValueList ?? [])]
  for (const [key, value] of Object.entries(updates) as Array<[RuntimeDeviceValueKey, string | number]>) {
    const aliases = valueAliases[key].map(alias => alias.trim().toLowerCase())
    const index = deviceValueList.findIndex(item => {
      const candidates = [item.configCode, 'configName' in item ? item.configName : null, 'jsonField' in item ? item.jsonField : null]
      return candidates.some(candidate => candidate && aliases.includes(String(candidate).trim().toLowerCase()))
    })
    const nextValue = String(value)
    if (index >= 0) {
      deviceValueList[index] = { ...deviceValueList[index], value: nextValue }
    } else {
      deviceValueList.push({ configCode: valueAliases[key][0], value: nextValue })
    }
  }
  return { ...library, deviceValueList }
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s_\-./()（）·:：]+/g, '')
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toUpperCase()
}

function idOf(library: PlanDeviceLibrary | null | undefined): string {
  return library?.id == null ? '' : String(library.id)
}

function nameOf(library: PlanDeviceLibrary | null | undefined): string {
  return String(library?.name || library?.typeName || idOf(library) || '')
}

function valueEntries(library: PlanDeviceLibrary | null | undefined): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const item of library?.deviceValueList ?? []) {
    const value = item.value == null ? '' : String(item.value)
    const valueItem = item as PlanDeviceValueSave & PlanDeviceValueSimple
    for (const key of [valueItem.jsonField, valueItem.configCode, valueItem.configName]) {
      if (!key) continue
      entries.push([String(key), value])
    }
  }
  return entries
}

function readString(library: PlanDeviceLibrary | null | undefined, aliases: string[], fallback = ''): string {
  const wanted = new Set(aliases.flatMap(alias => [normalizeText(alias), normalizeKey(alias)]))
  for (const [key, value] of valueEntries(library)) {
    if (wanted.has(normalizeText(key)) || wanted.has(normalizeKey(key))) {
      return value
    }
  }
  return fallback
}

function readNumber(library: PlanDeviceLibrary | null | undefined, aliases: string[]): number | null {
  const rawValue = readString(library, aliases).trim()
  if (!rawValue) return null
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : null
}

function readEnum<T extends string>(library: PlanDeviceLibrary | null | undefined, aliases: string[], allowed: readonly T[]): T | null {
  const value = readString(library, aliases).trim()
  if (!value) return null
  const matched = allowed.find(item => item.toUpperCase() === value.toUpperCase())
  return matched ?? null
}

const isPositive = (value: number | null): value is number => value !== null && value > 0
const isNonNegative = (value: number | null): value is number => value !== null && value >= 0
const isFiniteValue = (value: number | null): value is number => value !== null

function isDeviceLibraryCategory(library: PlanDeviceLibrary, category: DeviceLibraryCategory): boolean {
  if (library.deviceTypeCd) return getDeviceLibraryCategory(library.deviceTypeCd) === category
  return library.dialogWindowId === category
}

export function getDeviceLibrariesByCategory(
  libraries: PlanDeviceLibrary[],
  category: DeviceLibraryCategory,
): PlanDeviceLibrary[] {
  return libraries.filter(library => isDeviceLibraryCategory(library, category))
}

function findDeviceLibraryById(
  libraries: PlanDeviceLibrary[],
  id: string | number | null | undefined,
  category?: DeviceLibraryCategory,
): PlanDeviceLibrary | null {
  if (id == null || id === '') return null
  const library = libraries.find(item => String(item.id) === String(id))
  if (!library) return null
  return category && !isDeviceLibraryCategory(library, category) ? null : library
}

export function getDeviceLibraryNameById(
  libraries: PlanDeviceLibrary[],
  id: string | number | null | undefined,
  category?: DeviceLibraryCategory,
): string | null {
  const library = findDeviceLibraryById(libraries, id, category)
  return library ? nameOf(library) : null
}

export function firstDeviceLibraryByCategory(
  libraries: PlanDeviceLibrary[],
  category: DeviceLibraryCategory,
): PlanDeviceLibrary | null {
  return getDeviceLibrariesByCategory(libraries, category)[0] ?? null
}

export function toRuntimeFiberLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeFiberLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'fiber')) return null
  const id = idOf(library)
  const name = nameOf(library)
  const attenuationCoeff = readNumber(library, valueAliases.attenuation)
  const dispersion = readNumber(library, valueAliases.dispersion)
  const dispersionSlope = readNumber(library, valueAliases.dispersionSlope)
  const effectiveArea = readNumber(library, valueAliases.effectiveArea)
  const nonlinearRefractiveIndex = readNumber(library, valueAliases.nonlinearIndex)
  const nonlinearCoeff = readNumber(library, valueAliases.nonlinearCoeff)
  if (!id || !name
    || !isPositive(attenuationCoeff)
    || !isFiniteValue(dispersion)
    || !isFiniteValue(dispersionSlope)
    || !isPositive(effectiveArea)
    || !isPositive(nonlinearRefractiveIndex)
    || !isPositive(nonlinearCoeff)) return null

  const fiberCategory = readString(library, valueAliases.fiberCategory).trim() || undefined
  const simulationModel = readEnum(library, valueAliases.simulationModel, ['GN', 'EGN', 'SSFM'] as const) ?? undefined
  return {
    id,
    name,
    fiberCategory,
    attenuationCoeff,
    dispersion,
    dispersionSlope,
    effectiveArea,
    nonlinearRefractiveIndex,
    nonlinearCoeff,
    simulationModel,
    raw: library,
  }
}

export function toRuntimeAmplifierLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeAmplifierLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'amplifier')) return null
  const id = idOf(library)
  const name = nameOf(library)
  const gain = readNumber(library, valueAliases.gain)
  const noiseFigure = readNumber(library, valueAliases.noiseFigure)
  const outputPower = readNumber(library, valueAliases.outputPower)
  const saturationPower = readNumber(library, valueAliases.saturationPower)
  if (!id || !name
    || !isPositive(gain)
    || !isNonNegative(noiseFigure)
    || !isFiniteValue(outputPower)
    || !isFiniteValue(saturationPower)) return null

  const rawBandwidth = readNumber(library, valueAliases.bandwidth)
  const rawGainFlatness = readNumber(library, valueAliases.gainFlatness)
  const rawPumpPower = readNumber(library, valueAliases.pumpPower)
  const rawGainRangePower = readNumber(library, valueAliases.gainRangePower)
  const bandwidth = isPositive(rawBandwidth) ? rawBandwidth : undefined
  const gainFlatness = isNonNegative(rawGainFlatness) ? rawGainFlatness : undefined
  const pumpPower = isNonNegative(rawPumpPower) ? rawPumpPower : undefined
  const gainRangePower = isNonNegative(rawGainRangePower) ? rawGainRangePower : undefined
  const unitPrice = readNumber(library, valueAliases.unitPrice) ?? undefined
  const operatingMode = readEnum(
    library,
    valueAliases.operatingMode,
    ['AGC', 'APC', 'fixed_gain', 'fixed_output', 'apc'] as const,
  ) ?? undefined
  return {
    id,
    name,
    gain,
    bandwidth,
    gainFlatness,
    noiseFigure,
    pumpPower,
    outputPower,
    saturationPower,
    gainRangePower,
    unitPrice,
    operatingMode,
    raw: library,
  }
}

export function toRuntimeBranchingLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeBranchingLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'branching')) return null
  const id = idOf(library)
  const name = nameOf(library)
  const portCount = readNumber(library, valueAliases.portCount)
  const trunkInsertionLoss = readNumber(library, valueAliases.trunkInsertionLoss)
  const branchInsertionLoss = readNumber(library, valueAliases.branchInsertionLoss)
  if (!id || !name
    || portCount === null || !Number.isInteger(portCount) || portCount < 2
    || !isNonNegative(trunkInsertionLoss)
    || !isNonNegative(branchInsertionLoss)) return null

  const rawInsertionLoss = readNumber(library, valueAliases.insertionLoss)
  const rawWavelengthRange = readNumber(library, valueAliases.wavelengthRange)
  const insertionLoss = isNonNegative(rawInsertionLoss) ? rawInsertionLoss : undefined
  const wavelengthRange = isPositive(rawWavelengthRange) ? rawWavelengthRange : undefined
  const subType = readEnum(library, valueAliases.subType, ['BU', 'ROADM', 'OADM'] as const) ?? undefined
  return {
    id,
    name,
    subType,
    portCount,
    trunkInsertionLoss,
    branchInsertionLoss,
    insertionLoss,
    wavelengthRange,
    raw: library,
  }
}

export function toRuntimeEqualizerLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeEqualizerLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'equalizer')) return null
  const id = idOf(library)
  const name = nameOf(library)
  const attenuationMode = readEnum(library, valueAliases.attenuationMode, ['adjustable', 'fixed'] as const)
  const defaultAttenuationDb = readNumber(library, valueAliases.defaultAttenuationDb)
  if (!id || !name || !attenuationMode || !isNonNegative(defaultAttenuationDb)) return null
  return {
    id,
    name,
    attenuationMode,
    defaultAttenuationDb,
    raw: library,
  }
}
