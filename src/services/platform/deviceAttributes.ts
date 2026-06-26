import type {
  PlanDeviceConfig,
  PlanDeviceValueSave,
  PlanDeviceValueSimple,
} from './types'

export type DeviceAttributeSource = 'entity' | 'library' | 'default' | 'reused' | 'empty'
export type DeviceAttributeGroupKind = 'base' | 'model'

export interface DeviceAttributeRow {
  config: PlanDeviceConfig
  configCode: string
  algorithmField: string
  label: string
  groupCode: string
  groupName: string
  unit: string
  value: string
  inheritedValue: string
  source: DeviceAttributeSource
}

export interface DeviceAttributeGroup {
  groupCode: string
  groupName: string
  kind: DeviceAttributeGroupKind
  drawer: boolean
  rows: DeviceAttributeRow[]
}

export type DeviceAttributeInputType = 'text' | 'number' | 'checkbox' | 'datetime-local' | 'select'

const baseGroupCodes = new Set(['', 'BASE', 'BASIC', 'DEVICE', 'DEVICE_MODEL'])

type DefaultDeviceConfig = Omit<PlanDeviceConfig, 'deviceTypeCd'> & {
  code: string
  deviceTypeCd?: string | null
}

const currencyConfig: DefaultDeviceConfig = {
  name: '货币',
  code: 'currency',
  dataTypeCd: 'STRING',
  defaultValue: 'USD',
  groupCode: 'base',
  groupName: '商务参数',
  description: '设备成本币种',
}

const defaultDeviceConfigTemplates: Record<string, DefaultDeviceConfig[]> = {
  AMP: [
    { name: '额定增益', code: 'gain', dataTypeCd: 'NUMBER', defaultValue: '20', unit: 'dB', jsonField: 'gain', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '带宽', code: 'bandwidth', dataTypeCd: 'NUMBER', defaultValue: '1550', unit: 'nm', jsonField: 'bandwidth', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '增益平坦度', code: 'gain_flatness', dataTypeCd: 'NUMBER', defaultValue: '0.5', unit: 'dB', jsonField: 'gain_flatness', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '噪声系数 NF', code: 'noise_figure', dataTypeCd: 'NUMBER', defaultValue: '5', unit: 'dB', jsonField: 'noise_figure', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '泵浦功率', code: 'pump_power', dataTypeCd: 'NUMBER', defaultValue: '100', unit: 'mW', jsonField: 'pump_power', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '最大输出功率', code: 'output_power', dataTypeCd: 'NUMBER', defaultValue: '20', unit: 'dBm', jsonField: 'output_power', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '饱和功率', code: 'saturation_power', dataTypeCd: 'NUMBER', defaultValue: '20', unit: 'dBm', jsonField: 'saturation_power', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '增益范围功率', code: 'gain_range_power', dataTypeCd: 'NUMBER', defaultValue: '0.1', unit: 'dB', jsonField: 'gain_range_power', groupCode: 'base', groupName: '放大器基础参数' },
    { name: '工作模式', code: 'operating_mode', dataTypeCd: 'STRING', defaultValue: 'fixed_gain', jsonField: 'operating_mode', groupCode: 'base', groupName: '工作模式', description: '固定增益、固定输出功率或 APC' },
    { name: '单价', code: 'unit_price', dataTypeCd: 'NUMBER', defaultValue: '180000', jsonField: 'unit_price', groupCode: 'base', groupName: '商务参数' },
    currencyConfig,
    { name: '固定增益模式', code: 'edfa_simple_fixed_gain', dataTypeCd: 'BOOLEAN', defaultValue: 'true', jsonField: 'edfa.simple.fixedGain', groupCode: 'EDFA_SIMPLE', groupName: 'EDFA_Simple 模型参数' },
    { name: '目标增益', code: 'edfa_simple_target_gain', dataTypeCd: 'NUMBER', defaultValue: '20', unit: 'dB', jsonField: 'edfa.simple.targetGain', groupCode: 'EDFA_SIMPLE', groupName: 'EDFA_Simple 模型参数' },
    { name: '工作模式', code: 'edfa_full_operating_mode', dataTypeCd: 'STRING', defaultValue: 'fixed_gain', jsonField: 'edfa.full.operatingMode', groupCode: 'EDFA_FULL', groupName: 'EDFA_Full 模型参数' },
    { name: '目标值', code: 'edfa_full_target_value', dataTypeCd: 'NUMBER', defaultValue: '20', unit: 'dB/dBm', jsonField: 'edfa.full.targetValue', groupCode: 'EDFA_FULL', groupName: 'EDFA_Full 模型参数' },
    { name: '增益谱平坦化', code: 'edfa_full_gain_flattening', dataTypeCd: 'BOOLEAN', defaultValue: 'true', jsonField: 'edfa.full.gainFlattening', groupCode: 'EDFA_FULL', groupName: 'EDFA_Full 模型参数' },
    { name: '瞬态响应时间', code: 'edfa_full_transient_time', dataTypeCd: 'NUMBER', defaultValue: '0.5', unit: 'ms', jsonField: 'edfa.full.transientTime', groupCode: 'EDFA_FULL', groupName: 'EDFA_Full 模型参数' },
  ],
  AMPLIFIER: [],
  EDFA: [],
  OLA: [],
  BU: [
    { name: '子类型', code: 'sub_type', dataTypeCd: 'STRING', defaultValue: 'BU', jsonField: 'sub_type', groupCode: 'base', groupName: '分支器基础参数', description: 'BU / ROADM / OADM' },
    { name: '端口数', code: 'port_count', dataTypeCd: 'NUMBER', defaultValue: '3', unit: '端口', jsonField: 'port_count', groupCode: 'base', groupName: '分支器基础参数' },
    { name: '主干插损', code: 'trunk_insertion_loss', dataTypeCd: 'NUMBER', defaultValue: '0.8', unit: 'dB', jsonField: 'trunk_insertion_loss', groupCode: 'base', groupName: '插损参数' },
    { name: '分支插损', code: 'branch_insertion_loss', dataTypeCd: 'NUMBER', defaultValue: '3.5', unit: 'dB', jsonField: 'branch_insertion_loss', groupCode: 'base', groupName: '插损参数' },
    { name: '通用插损', code: 'insertion_loss', dataTypeCd: 'NUMBER', defaultValue: '0.8', unit: 'dB', jsonField: 'insertion_loss', groupCode: 'base', groupName: '插损参数' },
    { name: '工作波长范围', code: 'wavelength_range', dataTypeCd: 'NUMBER', defaultValue: '1550', unit: 'nm', jsonField: 'wavelength_range', groupCode: 'base', groupName: '分支器基础参数' },
    { name: '单价', code: 'unit_price', dataTypeCd: 'NUMBER', defaultValue: '180000', jsonField: 'unit_price', groupCode: 'base', groupName: '商务参数' },
    currencyConfig,
  ],
  BRANCHING: [],
  BRANCHING_UNIT: [],
  EQ: [
    { name: '光衰模式', code: 'attenuation_mode', dataTypeCd: 'STRING', defaultValue: 'adjustable', jsonField: 'attenuation_mode', groupCode: 'base', groupName: '均衡器基础参数', description: 'adjustable 或 fixed' },
    { name: '默认光衰值', code: 'default_attenuation_db', dataTypeCd: 'NUMBER', defaultValue: '0', unit: 'dB', jsonField: 'default_attenuation_db', groupCode: 'base', groupName: '均衡器基础参数' },
    { name: '单价', code: 'unit_price', dataTypeCd: 'NUMBER', jsonField: 'unit_price', groupCode: 'base', groupName: '商务参数' },
    currencyConfig,
    { name: '备注', code: 'remarks', dataTypeCd: 'STRING', jsonField: 'remarks', groupCode: 'base', groupName: '说明' },
  ],
  EQUALIZER: [],
  JB: [
    { name: '子类型', code: 'sub_type', dataTypeCd: 'STRING', defaultValue: 'SJB', jsonField: 'sub_type', groupCode: 'base', groupName: '接头盒基础参数', description: 'BJB / SEJB / BUJB / SJB / FJB / LIJB' },
    { name: '接头盒插损', code: 'insertion_loss', dataTypeCd: 'NUMBER', defaultValue: '0.05', unit: 'dB', jsonField: 'insertion_loss', groupCode: 'base', groupName: '接头盒基础参数' },
    { name: '最大光纤对数', code: 'max_fiber_pairs', dataTypeCd: 'NUMBER', jsonField: 'max_fiber_pairs', groupCode: 'base', groupName: '接头盒基础参数' },
    { name: '单价', code: 'unit_price', dataTypeCd: 'NUMBER', jsonField: 'unit_price', groupCode: 'base', groupName: '商务参数' },
    currencyConfig,
    { name: '备注', code: 'remarks', dataTypeCd: 'STRING', jsonField: 'remarks', groupCode: 'base', groupName: '说明' },
  ],
  JOINT: [],
  JOINT_BOX: [],
}

defaultDeviceConfigTemplates.AMPLIFIER = defaultDeviceConfigTemplates.AMP
defaultDeviceConfigTemplates.EDFA = defaultDeviceConfigTemplates.AMP
defaultDeviceConfigTemplates.OLA = defaultDeviceConfigTemplates.AMP
defaultDeviceConfigTemplates.BRANCHING = defaultDeviceConfigTemplates.BU
defaultDeviceConfigTemplates.BRANCHING_UNIT = defaultDeviceConfigTemplates.BU
defaultDeviceConfigTemplates.EQUALIZER = defaultDeviceConfigTemplates.EQ
defaultDeviceConfigTemplates.JOINT = defaultDeviceConfigTemplates.JB
defaultDeviceConfigTemplates.JOINT_BOX = defaultDeviceConfigTemplates.JB

function normalizeGroupCode(value?: string | null): string {
  return String(value ?? '').trim()
}

function normalizeReuseKey(name?: string | null, unit?: string | null): string {
  return `${String(name ?? '').trim().toLowerCase()}::${String(unit ?? '').trim().toLowerCase()}`
}

function isBaseGroup(groupCode?: string | null): boolean {
  return baseGroupCodes.has(normalizeGroupCode(groupCode).toUpperCase())
}

function normalizeDeviceTypeCode(value?: string | null): string {
  const raw = String(value ?? '').trim()
  const normalized = raw.toUpperCase()
  if (['SPL', 'SPLITTER'].includes(normalized)) return 'BU'
  if (['EQL'].includes(normalized)) return 'EQ'
  if (['SCL'].includes(normalized)) return 'JB'
  if (['放大器', '中继器'].some(alias => raw.includes(alias))) return 'AMP'
  if (['分支器', '分支单元'].some(alias => raw.includes(alias))) return 'BU'
  if (raw.includes('均衡器')) return 'EQ'
  if (['接头盒', '接口盒'].some(alias => raw.includes(alias))) return 'JB'
  return normalized
}

function cloneDeviceConfig(config: DefaultDeviceConfig, deviceTypeCd: string): PlanDeviceConfig {
  return {
    ...config,
    deviceTypeCd,
  }
}

export function getDefaultDeviceConfigs(deviceTypeCd?: string | null): PlanDeviceConfig[] {
  const normalizedDeviceTypeCd = normalizeDeviceTypeCode(deviceTypeCd)
  const templates = defaultDeviceConfigTemplates[normalizedDeviceTypeCd] ?? []
  return templates.map(config => cloneDeviceConfig(config, normalizedDeviceTypeCd))
}

export function mergeDeviceConfigsWithDefaults(
  deviceTypeCd: string | null | undefined,
  configs?: PlanDeviceConfig[] | null,
): PlanDeviceConfig[] {
  const normalizedDeviceTypeCd = normalizeDeviceTypeCode(deviceTypeCd)
  const defaultConfigs = getDefaultDeviceConfigs(normalizedDeviceTypeCd)
  const backendConfigs = (configs ?? []).filter(config => Boolean(config.code?.trim()))
  const backendByCode = new Map(backendConfigs.map(config => [String(config.code).trim(), config]))
  const merged: PlanDeviceConfig[] = []
  const usedCodes = new Set<string>()

  for (const defaultConfig of defaultConfigs) {
    const code = String(defaultConfig.code)
    const backendConfig = backendByCode.get(code)
    merged.push(backendConfig ? { ...defaultConfig, ...backendConfig } : defaultConfig)
    usedCodes.add(code)
  }

  for (const backendConfig of backendConfigs) {
    const code = String(backendConfig.code).trim()
    if (usedCodes.has(code)) continue
    merged.push(backendConfig)
  }

  return merged
}

export function deviceValueListToMap(
  values?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null,
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const item of values ?? []) {
    const configCode = item.configCode?.trim()
    if (!configCode) continue
    result[configCode] = item.value == null ? '' : String(item.value)
  }

  return result
}

export function buildDeviceValueList(values: Record<string, unknown>): PlanDeviceValueSave[] {
  return Object.entries(values)
    .filter(([configCode]) => configCode.trim().length > 0)
    .map(([configCode, value]) => ({
      configCode,
      value: value == null ? null : String(value),
    }))
}

export function resolveDeviceAttributeRows(
  configs: PlanDeviceConfig[],
  libraryValues?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null,
  entityValues?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null,
): DeviceAttributeRow[] {
  const libraryMap = deviceValueListToMap(libraryValues)
  const entityMap = deviceValueListToMap(entityValues)
  const reuseMap = new Map<string, string>()

  return configs
    .filter(config => Boolean(config.code?.trim()))
    .map(config => {
      const configCode = String(config.code)
      const defaultValue = config.defaultValue == null ? '' : String(config.defaultValue)
      const hasEntityValue = Object.prototype.hasOwnProperty.call(entityMap, configCode)
      const hasLibraryValue = Object.prototype.hasOwnProperty.call(libraryMap, configCode)
      const reuseKey = normalizeReuseKey(config.name, config.unit)
      const reusedValue = reuseMap.get(reuseKey)

      let value = ''
      let source: DeviceAttributeSource = 'empty'
      if (hasEntityValue) {
        value = entityMap[configCode]
        source = 'entity'
      } else if (hasLibraryValue) {
        value = libraryMap[configCode]
        source = 'library'
      } else if (defaultValue) {
        value = defaultValue
        source = 'default'
      } else if (reusedValue != null) {
        value = reusedValue
        source = 'reused'
      }

      if (value !== '' && !reuseMap.has(reuseKey)) {
        reuseMap.set(reuseKey, value)
      }

      const rawGroupCode = normalizeGroupCode(config.groupCode)
      const base = isBaseGroup(rawGroupCode)

      return {
        config,
        configCode,
        algorithmField: config.jsonField?.trim() || configCode,
        label: config.name || configCode,
        groupCode: base ? 'device_model' : rawGroupCode,
        groupName: base ? '器件模型参数' : (config.groupName || rawGroupCode || '计算模型参数'),
        unit: config.unit || '',
        value,
        inheritedValue: hasLibraryValue ? libraryMap[configCode] : defaultValue,
        source,
      }
    })
}

export function groupDeviceAttributeRows(rows: DeviceAttributeRow[]): DeviceAttributeGroup[] {
  const groups: DeviceAttributeGroup[] = []
  const groupIndex = new Map<string, number>()

  for (const row of rows) {
    const kind: DeviceAttributeGroupKind = row.groupCode === 'device_model' ? 'base' : 'model'
    const key = row.groupCode
    const existingIndex = groupIndex.get(key)
    if (existingIndex == null) {
      groupIndex.set(key, groups.length)
      groups.push({
        groupCode: row.groupCode,
        groupName: row.groupName,
        kind,
        drawer: kind === 'model',
        rows: [row],
      })
      continue
    }

    groups[existingIndex].rows.push(row)
  }

  return groups.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'base' ? -1 : 1
    return left.groupName.localeCompare(right.groupName, 'zh-CN')
  })
}

export function inputTypeForDeviceConfig(config: PlanDeviceConfig): DeviceAttributeInputType {
  if (config.dataTypeCd === 'NUMBER') return 'number'
  if (config.dataTypeCd === 'BOOLEAN') return 'checkbox'
  if (config.dataTypeCd === 'DATETIME') return 'datetime-local'
  if (config.dataTypeCd === 'DATA_TYPE' && config.dicCode) return 'select'
  return 'text'
}

export function buildDeviceAlgorithmParams(rows: DeviceAttributeRow[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.algorithmField] = row.value
  }
  return result
}
