import type {
  PlanConfigSnapshot,
  PlanPoint,
  PlanProject,
  PlanProjectDetail,
  PlatformPlanningResults,
} from './types'

export type PlanProjectDraftStatus = 'draft' | 'stationed' | 'ready'

export interface NormalizedPlanPoint extends Omit<PlanPoint, 'longitude' | 'latitude' | 'sortNum' | 'coordinate'> {
  longitude: number
  latitude: number
  sortNum?: number
  coordinate?: {
    x?: number
    y?: number
  }
}

export interface NormalizedPlanProject extends Omit<PlanProject, 'isPublic' | 'pointList'> {
  isPublic?: 0 | 1
  pointList: NormalizedPlanPoint[]
}

export interface NormalizedPlanProjectDetail {
  project: NormalizedPlanProject
  planConfig: PlanConfigSnapshot
  planningResults: PlatformPlanningResults | null
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizePublicFlag(value: unknown): 0 | 1 | undefined {
  if (value === 1 || value === '1' || value === true) return 1
  if (value === 0 || value === '0' || value === false) return 0
  return undefined
}

function normalizeNullableNumber(value: unknown): number | null {
  return toFiniteNumber(value) ?? null
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return null
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonValue(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null
}

function normalizeNumberArray(value: unknown): number[] | null {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return null
  const numbers = parsed.map(toFiniteNumber)
  return numbers.some(item => item === undefined) ? null : numbers as number[]
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeErrors(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function firstOwnValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return parseJsonValue(source[key])
  }
  return null
}

export function isPublicFlag(value: unknown): boolean {
  return normalizePublicFlag(value) === 1
}

export function normalizePlanPoint(point: PlanPoint): NormalizedPlanPoint | null {
  const longitude = toFiniteNumber(point.longitude ?? point.coordinate?.x)
  const latitude = toFiniteNumber(point.latitude ?? point.coordinate?.y)

  if (longitude === undefined || latitude === undefined) return null

  const sortNum = toFiniteNumber(point.sortNum)
  const coordinateX = toFiniteNumber(point.coordinate?.x)
  const coordinateY = toFiniteNumber(point.coordinate?.y)
  const coordinate = point.coordinate
    ? {
        x: coordinateX ?? longitude,
        y: coordinateY ?? latitude,
      }
    : undefined

  return {
    ...point,
    longitude,
    latitude,
    sortNum,
    coordinate,
  }
}

export function normalizePlanPoints(points: PlanPoint[] | null | undefined): NormalizedPlanPoint[] {
  return (points ?? []).map(normalizePlanPoint).filter((point): point is NormalizedPlanPoint => point !== null)
}

export function normalizePlanProject(project: PlanProject): NormalizedPlanProject {
  return {
    ...project,
    isPublic: normalizePublicFlag(project.isPublic),
    pointList: normalizePlanPoints(project.pointList),
  }
}

/** Normalize both project-detail fields and the six dedicated plan-config query responses. */
export function normalizePlanConfigSnapshot(value: unknown): PlanConfigSnapshot {
  const snapshot = asRecord(value) ?? {}
  const scope = asRecord(snapshot.scope)
  const channelConfig = asRecord(snapshot.channelConfig)
  const optimization = asRecord(snapshot.optimization)
  const form = asRecord(snapshot.form)

  return {
    scope: scope ? {
      topLeftLng: normalizeNullableNumber(scope.topLeftLng),
      topLeftLat: normalizeNullableNumber(scope.topLeftLat),
      bottomRightLng: normalizeNullableNumber(scope.bottomRightLng),
      bottomRightLat: normalizeNullableNumber(scope.bottomRightLat),
    } : null,
    gridResolution: normalizeNullableNumber(snapshot.gridResolution),
    enableRedundancy: normalizeNullableBoolean(snapshot.enableRedundancy),
    channelConfig: channelConfig ? {
      channelCount: normalizeNullableNumber(channelConfig.channelCount),
      baudRateGbaud: normalizeNullableNumber(channelConfig.baudRateGbaud),
      modulationFormat: normalizeNullableString(channelConfig.modulationFormat),
      launchPowerDbm: normalizeNumberArray(channelConfig.launchPowerDbm),
      channelFrequenciesThz: normalizeNumberArray(channelConfig.channelFrequenciesThz),
      initialAseNoiseDbm: normalizeNullableNumber(channelConfig.initialAseNoiseDbm),
      initialNliNoiseDbm: normalizeNullableNumber(channelConfig.initialNliNoiseDbm),
      centerFrequencyThz: normalizeNullableNumber(channelConfig.centerFrequencyThz),
      channelSpacingGhz: normalizeNullableNumber(channelConfig.channelSpacingGhz),
    } : null,
    optimization: optimization ? {
      targetGsnrDb: normalizeNullableNumber(optimization.targetGsnrDb),
      targetOsnrDb: normalizeNullableNumber(optimization.targetOsnrDb),
      osnrMarginDb: normalizeNullableNumber(optimization.osnrMarginDb),
      spanMinKm: normalizeNullableNumber(optimization.spanMinKm),
      spanMaxKm: normalizeNullableNumber(optimization.spanMaxKm),
      spanStepKm: normalizeNullableNumber(optimization.spanStepKm),
      minSpanLimitKm: normalizeNullableNumber(optimization.minSpanLimitKm),
      maxSpanLimitKm: normalizeNullableNumber(optimization.maxSpanLimitKm),
      optimizationTarget: normalizeNullableString(optimization.optimizationTarget),
    } : null,
    spanKm: normalizeNullableNumber(snapshot.spanKm),
    errors: normalizeErrors(snapshot.errors),
    form: form ? form as unknown as NonNullable<PlanConfigSnapshot['form']> : null,
  }
}

function mergeNullableConfig<T extends object>(primary: T | null, fallback: T | null): T | null {
  if (!primary) return fallback ? { ...fallback } : null
  if (!fallback) return { ...primary }

  const merged = { ...primary } as Record<string, unknown>
  for (const [key, value] of Object.entries(fallback)) {
    if (merged[key] == null && value != null) merged[key] = value
  }
  return merged as T
}

/** Detail is authoritative; dedicated queries only fill fields omitted from detail. */
export function mergePlanConfigSnapshots(
  detail: PlanConfigSnapshot,
  fallback: PlanConfigSnapshot | null,
): PlanConfigSnapshot {
  if (!fallback) return detail

  return {
    scope: mergeNullableConfig(detail.scope, fallback.scope),
    gridResolution: detail.gridResolution ?? fallback.gridResolution,
    enableRedundancy: detail.enableRedundancy ?? fallback.enableRedundancy,
    channelConfig: mergeNullableConfig(detail.channelConfig, fallback.channelConfig),
    optimization: mergeNullableConfig(detail.optimization, fallback.optimization),
    spanKm: detail.spanKm ?? fallback.spanKm,
    errors: [...new Set([...detail.errors, ...fallback.errors])],
    form: detail.form ?? fallback.form ?? null,
  }
}

const SCOPE_FIELDS = ['topLeftLng', 'topLeftLat', 'bottomRightLng', 'bottomRightLat'] as const
const CHANNEL_FIELDS = [
  'channelCount',
  'baudRateGbaud',
  'modulationFormat',
  'launchPowerDbm',
  'channelFrequenciesThz',
  'initialAseNoiseDbm',
  'initialNliNoiseDbm',
  'centerFrequencyThz',
  'channelSpacingGhz',
] as const
const OPTIMIZATION_FIELDS = [
  'targetGsnrDb',
  'targetOsnrDb',
  'osnrMarginDb',
  'spanMinKm',
  'spanMaxKm',
  'spanStepKm',
  'minSpanLimitKm',
  'maxSpanLimitKm',
  'optimizationTarget',
] as const

function hasMissingConfigField<T extends object>(value: T | null, fields: readonly (keyof T)[]): boolean {
  return !value || fields.some(field => value[field] == null)
}

export function planConfigNeedsFallback(config: PlanConfigSnapshot): boolean {
  return hasMissingConfigField(config.scope, SCOPE_FIELDS)
    || config.gridResolution == null
    || config.enableRedundancy == null
    || hasMissingConfigField(config.channelConfig, CHANNEL_FIELDS)
    || hasMissingConfigField(config.optimization, OPTIMIZATION_FIELDS)
    || config.spanKm == null
}

/** Dedicated result endpoints are freshest; detail fields remain a compatibility fallback. */
export function mergePlatformPlanningResults(
  detail: PlatformPlanningResults | null,
  queried: PlatformPlanningResults | null,
): PlatformPlanningResults | null {
  const fixed = queried?.fixed ?? detail?.fixed ?? null
  const optimized = queried?.optimized ?? detail?.optimized ?? null
  const simulation = queried?.simulation ?? detail?.simulation ?? null
  const errors = [...new Set([...(detail?.errors ?? []), ...(queried?.errors ?? [])])]

  return fixed != null || optimized != null || simulation != null || errors.length > 0
    ? { fixed, optimized, simulation, errors }
    : null
}

export function normalizePlanProjectDetail(project: PlanProjectDetail): NormalizedPlanProjectDetail {
  const planResult = asRecord(project.planResult)
  const fixedKeys = ['fixedResult', 'fixed', 'fixedPlanResult', 'fixed_result']
  const optimizedKeys = ['optimizedResult', 'optimized', 'optimizedPlanResult', 'optimized_result']
  const simulationKeys = ['simulationResult', 'simulation', 'simulationPlanResult', 'simulation_result']
  const fixedResult = planResult ? firstOwnValue(planResult, fixedKeys) : null
  const optimizedResult = planResult ? firstOwnValue(planResult, optimizedKeys) : null
  const simulationResult = planResult ? firstOwnValue(planResult, simulationKeys) : null
  const hasPlanningResults = [fixedResult, optimizedResult, simulationResult]
    .some(result => result != null)

  return {
    project: normalizePlanProject(project),
    planConfig: normalizePlanConfigSnapshot(project),
    planningResults: hasPlanningResults ? {
      fixed: fixedResult,
      optimized: optimizedResult,
      simulation: simulationResult,
      errors: [],
    } : null,
  }
}

export function getPlanProjectDraftStatus(points: Array<Pick<PlanPoint, 'longitude' | 'latitude'>>): PlanProjectDraftStatus {
  const validPointCount = normalizePlanPoints(points as PlanPoint[]).length
  if (validPointCount === 0) return 'draft'
  if (validPointCount < 2) return 'stationed'
  return 'ready'
}
