import type {
  PlanDeviceEntity,
  PlanDeviceValueSave,
  PlanDeviceValueSimple,
} from '@/services/platform/types'

export interface BackendAmplifierValues {
  gainDb: number | null
  nominalGainDb: number | null
  noiseFigureDb: number | null
  outputPowerDbm: number | null
  maxOutputPowerDbm: number | null
  inputPowerDbm: number | null
  gainFlatnessDb: number | null
  deviceModel: string | null
  amplifierType: string | null
}

type DeviceValue = PlanDeviceValueSave | PlanDeviceValueSimple

const normalizeField = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const fieldNames = (item: DeviceValue): string[] => {
  const simple = item as PlanDeviceValueSimple
  return [item.configCode, simple.jsonField]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map(normalizeField)
}

const readExplicitValue = (
  entity: PlanDeviceEntity,
  aliases: string[],
): string | null => {
  const wanted = new Set(aliases.map(normalizeField))
  for (const item of entity.deviceValueList ?? []) {
    if (!fieldNames(item).some(field => wanted.has(field))) continue
    const value = item.value == null ? '' : String(item.value).trim()
    return value || null
  }
  return null
}

const readExplicitNumber = (
  entity: PlanDeviceEntity,
  aliases: string[],
): number | null => {
  const raw = readExplicitValue(entity, aliases)
  if (raw == null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Reads only fields explicitly returned on the backend device entity.
 * It intentionally does not consult library defaults or derive runtime values.
 */
export function readBackendAmplifierValues(
  entity: PlanDeviceEntity | null | undefined,
): BackendAmplifierValues | null {
  if (!entity) return null

  const explicitModel = readExplicitValue(entity, [
    'device_model',
    'amplifier_model',
    'model_id',
  ])
  const libraryModel = typeof entity.libraryName === 'string' && entity.libraryName.trim()
    ? entity.libraryName.trim()
    : entity.libraryId == null || entity.libraryId === ''
      ? null
      : String(entity.libraryId)

  return {
    gainDb: readExplicitNumber(entity, ['gain_db']),
    nominalGainDb: readExplicitNumber(entity, ['nominal_gain_db']),
    noiseFigureDb: readExplicitNumber(entity, ['noise_figure_db', 'nf_db']),
    outputPowerDbm: readExplicitNumber(entity, ['output_power_dbm']),
    maxOutputPowerDbm: readExplicitNumber(entity, ['max_output_power_dbm']),
    inputPowerDbm: readExplicitNumber(entity, ['input_power_dbm']),
    gainFlatnessDb: readExplicitNumber(entity, ['gain_flatness_db']),
    deviceModel: explicitModel ?? libraryModel,
    amplifierType: readExplicitValue(entity, ['amplifier_type']),
  }
}
