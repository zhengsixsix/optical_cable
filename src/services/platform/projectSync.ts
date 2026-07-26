import { platformDeviceEntityApi, platformPlanConfigApi, platformPointApi, platformProjectApi } from './api'
import type {
  Id,
  PlanConfigChannel,
  PlanConfigOptimization,
  PlanDeviceEntity,
  PlanPointSaveListItem,
  PlanProject,
} from './types'

export interface SyncPlanningProjectInput {
  id?: Id
  name: string
  remarks?: string
  isPublic?: 0 | 1
  points?: Array<Pick<PlanPointSaveListItem, 'name' | 'longitude' | 'latitude' | 'sortNum'>>
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
    channelConfig?: Omit<PlanConfigChannel, 'projectId'> | null
    optimization?: Omit<PlanConfigOptimization, 'projectId'> | null
    spanKm?: number | null
  }
}

export interface SyncPlanningProjectResult {
  projectId: Id
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
    const saved = await platformPointApi.saveList(projectId, pointList)
    if (saved !== true) throw new Error('项目站点列表保存失败')
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

  if (input.planConfig?.channelConfig) {
    await platformPlanConfigApi.saveChannelConfig({
      projectId,
      ...input.planConfig.channelConfig,
    })
  }

  if (input.planConfig?.optimization) {
    await platformPlanConfigApi.saveOptimization({
      projectId,
      ...input.planConfig.optimization,
    })
  }

  if (input.planConfig?.spanKm != null) {
    await platformPlanConfigApi.saveSpanKm({
      projectId,
      spanKm: input.planConfig.spanKm,
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
