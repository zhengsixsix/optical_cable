import type { ConnectorElement } from '@/types/connector'
import {
  buildDeviceValueList,
  deviceValueListToMap,
} from '@/services/platform/deviceAttributes'
import { connectorElementToDeviceEntity } from '@/services/platform/deviceLibraryMapping'
import type {
  Id,
  PlanDeviceConfig,
  PlanDeviceEntity,
  PlanDeviceLibrary,
  PlatformBindFunc,
} from '@/services/platform/types'

export type PlanningDeviceKind = 'fiber' | 'amplifier'

interface PlanningTemplateOptions {
  kind: PlanningDeviceKind
  entity: PlanDeviceEntity
  projectId: Id
  values: Record<string, string>
  configs: PlanDeviceConfig[]
  calculationModel: string
  ssfmParams?: {
    stepSize: number
    samplePoints: number
    maxIterations: number
  }
}

interface ConnectorEntityOptions {
  element: ConnectorElement
  projectId: Id
  sortNum: number
  libraries: PlanDeviceLibrary[]
  values?: Record<string, string | number | boolean | null | undefined>
}

const fieldAliases = {
  fiberModel: ['simulationmodel', 'fibermodel', 'fibercalculationmodel'],
  amplifierModel: ['amplifiermodel', 'edfamodel', 'ampcalculationmodel', 'calculationmodel'],
  ssfmStepSize: ['ssfmstepsize', 'stepsize'],
  ssfmSamplePoints: ['ssfmsamplepoints', 'samplepoints'],
  ssfmMaxIterations: ['ssfmmaxiterations', 'maxiterations'],
} as const

function normalizeField(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function resolveConfigCode(
  configs: PlanDeviceConfig[],
  aliases: readonly string[],
  fallback: string,
): string {
  const wanted = new Set(aliases.map(normalizeField))
  const matched = configs.find(config =>
    [config.code, config.jsonField, config.name].some(value => wanted.has(normalizeField(value))),
  )
  return matched?.code?.trim() || fallback
}

function selectDefaultBindFunc(
  bindFuncList: PlatformBindFunc[] | null | undefined,
  model: string,
): PlatformBindFunc[] | null | undefined {
  const entries = bindFuncList?.filter(item => item.name?.trim())
  if (!entries?.length || !model.trim()) return bindFuncList
  const normalizedModel = normalizeField(model)
  const matched = entries.some(item => normalizeField(item.name).includes(normalizedModel))
  if (!matched) return bindFuncList
  return entries.map(item => ({
    ...item,
    isDefault: normalizeField(item.name).includes(normalizedModel) ? 1 : 0,
  }))
}

function finiteNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function savePayload(
  entity: PlanDeviceEntity,
  overrides: Partial<PlanDeviceEntity> = {},
): PlanDeviceEntity {
  return {
    id: entity.id,
    name: overrides.name ?? entity.name,
    deviceTypeCd: overrides.deviceTypeCd ?? entity.deviceTypeCd,
    iconId: overrides.iconId ?? entity.iconId,
    iconSize: overrides.iconSize ?? entity.iconSize,
    dialogWindowId: overrides.dialogWindowId ?? entity.dialogWindowId,
    bindFuncList: overrides.bindFuncList ?? entity.bindFuncList,
    libraryId: overrides.libraryId ?? entity.libraryId,
    longitude: finiteNumber(overrides.longitude ?? entity.longitude),
    latitude: finiteNumber(overrides.latitude ?? entity.latitude),
    projectId: overrides.projectId ?? entity.projectId,
    sortNum: finiteNumber(overrides.sortNum ?? entity.sortNum),
    deviceValueList: overrides.deviceValueList ?? entity.deviceValueList,
    description: overrides.description ?? entity.description,
    positionKm: finiteNumber(overrides.positionKm ?? entity.positionKm),
    mode: overrides.mode ?? entity.mode,
  }
}

/** Build the project device entity that the id-only simulation endpoint reads. */
export function buildPlanningTemplateEntity(options: PlanningTemplateOptions): PlanDeviceEntity {
  const { entity, configs, calculationModel } = options
  if (entity.libraryId == null || entity.libraryId === '') {
    throw new Error(`${entity.name || options.kind} 未关联器件库，无法保存规划参数`)
  }

  const values = {
    ...deviceValueListToMap(entity.deviceValueList),
    ...options.values,
  }
  if (options.kind === 'fiber') {
    values[resolveConfigCode(configs, fieldAliases.fiberModel, 'simulationModel')] = calculationModel
    if (calculationModel === 'SSFM' && options.ssfmParams) {
      values[resolveConfigCode(configs, fieldAliases.ssfmStepSize, 'ssfmStepSize')] = String(options.ssfmParams.stepSize)
      values[resolveConfigCode(configs, fieldAliases.ssfmSamplePoints, 'ssfmSamplePoints')] = String(options.ssfmParams.samplePoints)
      values[resolveConfigCode(configs, fieldAliases.ssfmMaxIterations, 'ssfmMaxIterations')] = String(options.ssfmParams.maxIterations)
    }
  } else {
    values[resolveConfigCode(configs, fieldAliases.amplifierModel, 'amplifierModel')] = calculationModel
  }

  return savePayload(entity, {
    projectId: options.projectId,
    bindFuncList: selectDefaultBindFunc(entity.bindFuncList, calculationModel),
    deviceValueList: buildDeviceValueList(values),
  })
}

/** Apply the selected template to every layout-generated fiber or amplifier. */
export function applyPlanningTemplateToEntity(
  generated: PlanDeviceEntity,
  template: PlanDeviceEntity,
): PlanDeviceEntity {
  return savePayload(generated, {
    libraryId: template.libraryId,
    deviceTypeCd: template.deviceTypeCd ?? generated.deviceTypeCd,
    iconId: template.iconId ?? generated.iconId,
    iconSize: template.iconSize ?? generated.iconSize,
    dialogWindowId: template.dialogWindowId ?? generated.dialogWindowId,
    bindFuncList: template.bindFuncList,
    deviceValueList: template.deviceValueList,
    projectId: template.projectId ?? generated.projectId,
  })
}

/** Convert a configured BU/equalizer connector into the documented save payload. */
export function buildPlanningConnectorEntity(options: ConnectorEntityOptions): PlanDeviceEntity {
  const mapped = connectorElementToDeviceEntity(
    options.element,
    options.projectId,
    options.sortNum,
    options.libraries,
  )
  if (!mapped?.libraryId) {
    throw new Error(`${options.element.name} 未选择器件库型号，无法保存`)
  }
  const values = {
    ...deviceValueListToMap(mapped.deviceValueList),
    ...Object.fromEntries(
      Object.entries(options.values ?? {})
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    ),
  }
  return savePayload(mapped, {
    positionKm: options.element.kp,
    description: options.element.remarks,
    deviceValueList: buildDeviceValueList(values),
  })
}

export function mergePlanningDeviceEntities(
  existing: PlanDeviceEntity[],
  incoming: PlanDeviceEntity[],
): PlanDeviceEntity[] {
  const result = [...existing]
  for (const entity of incoming) {
    const index = result.findIndex(item => item.id != null && entity.id != null
      && String(item.id) === String(entity.id))
    if (index >= 0) result[index] = entity
    else result.push(entity)
  }
  return result
}
