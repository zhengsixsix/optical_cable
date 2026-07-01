import type { PlanDeviceLibrary, PlanDeviceValueSave, PlanDeviceValueSimple } from './types'

export type DeviceLibraryCategory = 'fiber' | 'amplifier' | 'branching' | 'equalizer' | 'joint'

export interface DeviceLibraryOption {
  value: string
  label: string
  library: PlanDeviceLibrary
}

export interface RuntimeFiberLibrary {
  id: string
  name: string
  fiberCategory: string
  attenuationCoeff: number
  dispersion: number
  dispersionSlope: number
  effectiveArea: number
  nonlinearRefractiveIndex: number
  nonlinearCoeff: number
  simulationModel: 'GN' | 'EGN' | 'SSFM'
  raw: PlanDeviceLibrary
}

export interface RuntimeAmplifierLibrary {
  id: string
  name: string
  gain: number
  bandwidth: number
  gainFlatness: number
  noiseFigure: number
  pumpPower: number
  outputPower: number
  saturationPower: number
  gainRangePower: number
  unitPrice?: number
  operatingMode: 'AGC' | 'APC' | 'fixed_gain' | 'fixed_output' | 'apc'
  raw: PlanDeviceLibrary
}

export interface RuntimeBranchingLibrary {
  id: string
  name: string
  subType: 'BU' | 'ROADM' | 'OADM'
  portCount: number
  trunkInsertionLoss: number
  branchInsertionLoss: number
  insertionLoss: number
  wavelengthRange: number
  raw: PlanDeviceLibrary
}

export interface RuntimeEqualizerLibrary {
  id: string
  name: string
  attenuationMode: 'adjustable' | 'fixed'
  defaultAttenuationDb: number
  raw: PlanDeviceLibrary
}

export interface RuntimeJointBoxLibrary {
  id: string
  name: string
  subType?: 'BJB' | 'SEJB' | 'BUJB' | 'SJB' | 'FJB' | 'LIJB'
  insertionLoss: number
  maxFiberPairs?: number
  raw: PlanDeviceLibrary
}

const categoryMatchers: Record<DeviceLibraryCategory, string[]> = {
  fiber: ['FIB', 'FIBER', 'OPTICAL_FIBER', '光纤', '光缆'],
  amplifier: ['AMP', 'AMPLIFIER', 'EDFA', 'OLA', 'REPEATER', '放大器', '中继器'],
  branching: ['SPL', 'SPLITTER', 'BU', 'BRANCHING', 'BRANCHING_UNIT', '分支器', '分支单元'],
  equalizer: ['EQL', 'EQ', 'EQUALIZER', '均衡器'],
  joint: ['SCL', 'JB', 'JOINT', 'JOINT_BOX', '接头盒'],
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

function readNumber(library: PlanDeviceLibrary | null | undefined, aliases: string[], fallback: number): number {
  const value = Number(readString(library, aliases, ''))
  return Number.isFinite(value) ? value : fallback
}

function readEnum<T extends string>(library: PlanDeviceLibrary | null | undefined, aliases: string[], allowed: readonly T[], fallback: T): T {
  const value = readString(library, aliases, fallback).trim()
  const matched = allowed.find(item => item.toUpperCase() === value.toUpperCase())
  return matched ?? fallback
}

export function getDeviceLibraryCategory(library: PlanDeviceLibrary): DeviceLibraryCategory | null {
  const source = [
    library.deviceTypeCd,
    library.typeName,
    library.name,
    library.dialogWindowId,
  ]
  const normalized = source.flatMap(value => [normalizeText(value), normalizeKey(value)])

  for (const [category, matchers] of Object.entries(categoryMatchers) as Array<[DeviceLibraryCategory, string[]]>) {
    if (matchers.some(matcher => normalized.includes(normalizeText(matcher)) || normalized.includes(normalizeKey(matcher)))) {
      return category
    }
  }

  return null
}

export function isDeviceLibraryCategory(library: PlanDeviceLibrary, category: DeviceLibraryCategory): boolean {
  return getDeviceLibraryCategory(library) === category
}

export function getDeviceLibrariesByCategory(
  libraries: PlanDeviceLibrary[],
  category: DeviceLibraryCategory,
): PlanDeviceLibrary[] {
  return libraries.filter(library => isDeviceLibraryCategory(library, category))
}

export function getDeviceLibraryOptions(
  libraries: PlanDeviceLibrary[],
  category: DeviceLibraryCategory,
): DeviceLibraryOption[] {
  return getDeviceLibrariesByCategory(libraries, category)
    .filter(library => library.id != null)
    .map(library => ({
      value: String(library.id),
      label: nameOf(library),
      library,
    }))
}

export function findDeviceLibraryById(
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

export function hasDeviceLibraryCategory(
  libraries: PlanDeviceLibrary[],
  category: DeviceLibraryCategory,
): boolean {
  return getDeviceLibrariesByCategory(libraries, category).length > 0
}

export function getDeviceLibraryParam(
  library: PlanDeviceLibrary | null | undefined,
  aliases: string | string[],
  fallback = 0,
): number {
  return readNumber(library, Array.isArray(aliases) ? aliases : [aliases], fallback)
}

export function toRuntimeFiberLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeFiberLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'fiber')) return null
  return {
    id: idOf(library),
    name: nameOf(library),
    fiberCategory: readString(library, valueAliases.fiberCategory, nameOf(library) || 'G.654.E'),
    attenuationCoeff: readNumber(library, valueAliases.attenuation, 0.16),
    dispersion: readNumber(library, valueAliases.dispersion, 20.5),
    dispersionSlope: readNumber(library, valueAliases.dispersionSlope, 0.06),
    effectiveArea: readNumber(library, valueAliases.effectiveArea, 110),
    nonlinearRefractiveIndex: readNumber(library, valueAliases.nonlinearIndex, 2.2),
    nonlinearCoeff: readNumber(library, valueAliases.nonlinearCoeff, 0.8),
    simulationModel: readEnum(library, valueAliases.simulationModel, ['GN', 'EGN', 'SSFM'] as const, 'GN'),
    raw: library,
  }
}

export function toRuntimeAmplifierLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeAmplifierLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'amplifier')) return null
  return {
    id: idOf(library),
    name: nameOf(library),
    gain: readNumber(library, valueAliases.gain, 20),
    bandwidth: readNumber(library, valueAliases.bandwidth, 35),
    gainFlatness: readNumber(library, valueAliases.gainFlatness, 1),
    noiseFigure: readNumber(library, valueAliases.noiseFigure, 5),
    pumpPower: readNumber(library, valueAliases.pumpPower, 200),
    outputPower: readNumber(library, valueAliases.outputPower, 17),
    saturationPower: readNumber(library, valueAliases.saturationPower, 20),
    gainRangePower: readNumber(library, valueAliases.gainRangePower, 15),
    unitPrice: readNumber(library, valueAliases.unitPrice, NaN) || undefined,
    operatingMode: readEnum(library, valueAliases.operatingMode, ['AGC', 'APC', 'fixed_gain', 'fixed_output', 'apc'] as const, 'AGC'),
    raw: library,
  }
}

export function toRuntimeBranchingLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeBranchingLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'branching')) return null
  const trunkInsertionLoss = readNumber(library, valueAliases.trunkInsertionLoss, 0.8)
  return {
    id: idOf(library),
    name: nameOf(library),
    subType: readEnum(library, valueAliases.subType, ['BU', 'ROADM', 'OADM'] as const, 'BU'),
    portCount: readNumber(library, valueAliases.portCount, 3),
    trunkInsertionLoss,
    branchInsertionLoss: readNumber(library, valueAliases.branchInsertionLoss, 3.5),
    insertionLoss: readNumber(library, valueAliases.insertionLoss, trunkInsertionLoss),
    wavelengthRange: readNumber(library, valueAliases.wavelengthRange, 1550),
    raw: library,
  }
}

export function toRuntimeEqualizerLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeEqualizerLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'equalizer')) return null
  return {
    id: idOf(library),
    name: nameOf(library),
    attenuationMode: readEnum(library, valueAliases.attenuationMode, ['adjustable', 'fixed'] as const, 'adjustable'),
    defaultAttenuationDb: readNumber(library, valueAliases.defaultAttenuationDb, 0),
    raw: library,
  }
}

export function toRuntimeJointBoxLibrary(library: PlanDeviceLibrary | null | undefined): RuntimeJointBoxLibrary | null {
  if (!library || !isDeviceLibraryCategory(library, 'joint')) return null
  const subType = readString(library, valueAliases.subType, '')
  const validSubType = ['BJB', 'SEJB', 'BUJB', 'SJB', 'FJB', 'LIJB'].includes(subType)
    ? subType as RuntimeJointBoxLibrary['subType']
    : undefined

  return {
    id: idOf(library),
    name: nameOf(library),
    subType: validSubType,
    insertionLoss: readNumber(library, valueAliases.insertionLoss, 0.05),
    maxFiberPairs: readNumber(library, valueAliases.maxFiberPairs, NaN) || undefined,
    raw: library,
  }
}
