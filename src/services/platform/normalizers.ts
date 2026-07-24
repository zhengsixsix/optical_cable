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

export function normalizePlanProjectDetail(project: PlanProjectDetail): NormalizedPlanProjectDetail {
  const scope = asRecord(project.scope)
  const channelConfig = asRecord(project.channelConfig)
  const optimization = asRecord(project.optimization)
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
    planConfig: {
      scope: scope ? {
        topLeftLng: normalizeNullableNumber(scope.topLeftLng),
        topLeftLat: normalizeNullableNumber(scope.topLeftLat),
        bottomRightLng: normalizeNullableNumber(scope.bottomRightLng),
        bottomRightLat: normalizeNullableNumber(scope.bottomRightLat),
      } : null,
      gridResolution: normalizeNullableNumber(project.gridResolution),
      enableRedundancy: normalizeNullableBoolean(project.enableRedundancy),
      channelConfig: channelConfig ? {
        channelCount: normalizeNullableNumber(channelConfig.channelCount),
        baudRateGbaud: normalizeNullableNumber(channelConfig.baudRateGbaud),
        modulationFormat: typeof channelConfig.modulationFormat === 'string'
          ? channelConfig.modulationFormat
          : null,
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
      } : null,
      spanKm: normalizeNullableNumber(project.spanKm),
      errors: [],
    },
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
