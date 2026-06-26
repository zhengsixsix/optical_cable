import type {
  PlanDeviceConfig,
  PlanDeviceValueSave,
  PlanDeviceValueSimple,
} from './types'

export interface DeviceAttributeRow {
  config: PlanDeviceConfig
  configCode: string
  label: string
  groupCode: string
  groupName: string
  unit: string
  value: string
  inheritedValue: string
  source: 'entity' | 'library' | 'default' | 'empty'
}

export interface DeviceAttributeGroup {
  groupCode: string
  groupName: string
  rows: DeviceAttributeRow[]
}

export type DeviceAttributeInputType = 'text' | 'number' | 'checkbox' | 'datetime-local'

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
      const value = hasEntityValue
        ? entityMap[configCode]
        : hasLibraryValue
          ? libraryMap[configCode]
          : defaultValue

      return {
        config,
        configCode,
        label: config.name || configCode,
        groupCode: config.groupCode || 'base',
        groupName: config.groupName || '基础参数',
        unit: config.unit || '',
        value,
        inheritedValue: hasLibraryValue ? libraryMap[configCode] : defaultValue,
        source: hasEntityValue ? 'entity' : hasLibraryValue ? 'library' : defaultValue ? 'default' : 'empty',
      }
    })
}

export function groupDeviceAttributeRows(rows: DeviceAttributeRow[]): DeviceAttributeGroup[] {
  const groups: DeviceAttributeGroup[] = []
  const groupIndex = new Map<string, number>()

  for (const row of rows) {
    const existingIndex = groupIndex.get(row.groupCode)
    if (existingIndex == null) {
      groupIndex.set(row.groupCode, groups.length)
      groups.push({
        groupCode: row.groupCode,
        groupName: row.groupName,
        rows: [row],
      })
      continue
    }

    groups[existingIndex].rows.push(row)
  }

  return groups
}

export function inputTypeForDeviceConfig(config: PlanDeviceConfig): DeviceAttributeInputType {
  if (config.dataTypeCd === 'NUMBER') return 'number'
  if (config.dataTypeCd === 'BOOLEAN') return 'checkbox'
  if (config.dataTypeCd === 'DATETIME') return 'datetime-local'
  return 'text'
}
