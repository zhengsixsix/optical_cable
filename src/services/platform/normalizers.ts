import type { PlanPoint, PlanProject } from './types'

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

export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function normalizePublicFlag(value: unknown): 0 | 1 | undefined {
  if (value === 1 || value === '1' || value === true) return 1
  if (value === 0 || value === '0' || value === false) return 0
  return undefined
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

export function getPlanProjectDraftStatus(points: Array<Pick<PlanPoint, 'longitude' | 'latitude'>>): PlanProjectDraftStatus {
  const validPointCount = normalizePlanPoints(points as PlanPoint[]).length
  if (validPointCount === 0) return 'draft'
  if (validPointCount < 2) return 'stationed'
  return 'ready'
}
