import { platformDeviceEntityApi, platformPlanConfigApi, platformPointApi, platformProjectApi } from './api'
import type { PlanDeviceEntity, PlanPoint, PlanProject } from './types'

export interface SyncPlanningProjectInput {
  id?: number
  name: string
  remarks?: string
  isPublic?: 0 | 1
  points?: Array<Pick<PlanPoint, 'name' | 'longitude' | 'latitude' | 'sortNum'>>
  deviceEntities?: PlanDeviceEntity[]
  planConfig?: {
    scope?: {
      topLeftLng?: number | null
      topLeftLat?: number | null
      bottomRightLng?: number | null
      bottomRightLat?: number | null
    } | null
    gridResolution?: number | null
    enableRedundancy?: boolean | null
  }
}

export interface SyncPlanningProjectResult {
  projectId: number
  pointsSynced: number
  deviceEntitiesSynced: number
}

export async function syncPlanningProjectToPlatform(input: SyncPlanningProjectInput): Promise<SyncPlanningProjectResult> {
  const projectPayload: PlanProject = {
    id: input.id,
    name: input.name,
    remarks: input.remarks,
    isPublic: input.isPublic ?? 0,
  }

  const projectId = await platformProjectApi.save(projectPayload)
  const pointList = (input.points ?? []).map((point, index) => ({
    ...point,
    sortNum: point.sortNum ?? index + 1,
  }))

  if (pointList.length > 0) {
    await platformPointApi.saveList(projectId, pointList)
  }

  if (input.planConfig?.scope) {
    await platformPlanConfigApi.saveScope({
      projectId,
      ...input.planConfig.scope,
    })
  }

  if (input.planConfig?.gridResolution != null) {
    await platformPlanConfigApi.saveGridResolution({
      projectId,
      gridResolution: input.planConfig.gridResolution,
    })
  }

  if (input.planConfig?.enableRedundancy != null) {
    await platformPlanConfigApi.saveEnableRedundancy({
      projectId,
      enableRedundancy: input.planConfig.enableRedundancy,
    })
  }

  const deviceEntities = input.deviceEntities ?? []
  for (const [index, entity] of deviceEntities.entries()) {
    await platformDeviceEntityApi.save({
      ...entity,
      projectId,
      sortNum: entity.sortNum ?? index + 1,
    })
  }

  return {
    projectId,
    pointsSynced: pointList.length,
    deviceEntitiesSynced: deviceEntities.length,
  }
}
