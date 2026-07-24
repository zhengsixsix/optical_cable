import type {
  PlanDeviceConfig,
  PlanDeviceValueSave,
  PlanDeviceValueSimple,
} from './types'

type DeviceAttributeSource = 'entity' | 'library' | 'default' | 'empty'
type DeviceAttributeGroupKind = 'base' | 'model'

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

function normalizeGroupCode(value?: string | null): string {
  return String(value ?? '').trim()
}

function isBaseGroup(groupCode?: string | null): boolean {
  return baseGroupCodes.has(normalizeGroupCode(groupCode).toUpperCase())
}

export function normalizeDeviceConfigs(
  configs?: PlanDeviceConfig[] | null,
): PlanDeviceConfig[] {
  return (configs ?? []).filter(config => Boolean(config.code?.trim()))
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

  return configs
    .filter(config => Boolean(config.code?.trim()))
    .map(config => {
      const configCode = String(config.code)
      const defaultValue = config.defaultValue == null ? '' : String(config.defaultValue)
      const hasEntityValue = Object.prototype.hasOwnProperty.call(entityMap, configCode)
      const hasLibraryValue = Object.prototype.hasOwnProperty.call(libraryMap, configCode)

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
