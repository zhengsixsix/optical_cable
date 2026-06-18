import { platformPlanConfigApi, platformPlanLayerApi, platformPointApi, platformProjectApi, platformUploadApi } from './api'
import { uploadFileWithUppyTus } from './uppyUpload'
import type { UppyTusUploadResult, UppyUploadProgress } from './uppyUpload'
import type { PlanLayerTypeDic, PlanPoint, PlanProject } from './types'

type WizardPoint = Pick<PlanPoint, 'name' | 'longitude' | 'latitude' | 'sortNum'>

export interface ProjectWizardSyncState {
  projectId: number | null
  layerUploads: Record<string, {
    layerId: number
    fileName: string
    uploadUrl: string
  }>
}

export interface ProjectWizardLayerUpload {
  key: string
  label: string
  checked: boolean
  value?: string
  file?: File | null
  typeDic: PlanLayerTypeDic
  remarks?: string
  isDefault?: boolean
}

export interface ProjectWizardSyncOptions {
  uploadFile?: (
    file: File,
    options?: { onProgress?: (progress: UppyUploadProgress) => void },
  ) => Promise<UppyTusUploadResult>
  onLayerProgress?: (layerKey: string, progress: UppyUploadProgress) => void
}

export interface ProjectWizardStepPayload {
  projectType: string
  projectName: string
  allowOtherUsers: boolean
  planningMode?: 'point-to-point' | 'multi-point'
  startStation?: {
    name: string
    longitude: number
    latitude: number
  }
  endStation?: {
    name: string
    longitude: number
    latitude: number
  }
  waypoints?: Array<{
    name: string
    longitude: number
    latitude: number
  }>
  gisConfig?: {
    rangeMode: 'auto' | 'manual'
    planningRange?: {
      northwest: { lon: number; lat: number }
      southeast: { lon: number; lat: number }
    } | null
    gridResolution: number
  }
  redundancyConfig?: {
    enabled: boolean
  }
  layers?: ProjectWizardLayerUpload[]
}

export function createProjectWizardSyncState(): ProjectWizardSyncState {
  return { projectId: null, layerUploads: {} }
}

function buildPointList(payload: ProjectWizardStepPayload): WizardPoint[] {
  if (payload.planningMode === 'multi-point') {
    return (payload.waypoints ?? []).map((point, index) => ({
      name: point.name,
      longitude: point.longitude,
      latitude: point.latitude,
      sortNum: index + 1,
    }))
  }

  const points: Array<WizardPoint | null> = [
    payload.startStation ? {
      name: payload.startStation.name,
      longitude: payload.startStation.longitude,
      latitude: payload.startStation.latitude,
      sortNum: 1,
    } : null,
    payload.endStation ? {
      name: payload.endStation.name,
      longitude: payload.endStation.longitude,
      latitude: payload.endStation.latitude,
      sortNum: 2,
    } : null,
  ]

  return points.filter((point): point is WizardPoint => point !== null)
}

export async function saveProjectWizardStep(
  state: ProjectWizardSyncState,
  step: number,
  payload: ProjectWizardStepPayload,
  _options: ProjectWizardSyncOptions = {},
): Promise<ProjectWizardSyncState> {
  if (step === 1) {
    const projectPayload: PlanProject = {
      id: state.projectId ?? undefined,
      name: payload.projectName,
      remarks: `${payload.projectType.toUpperCase()} project`,
      isPublic: payload.allowOtherUsers ? 1 : 0,
    }
    state.projectId = await platformProjectApi.save(projectPayload)
    return state
  }

  if (step === 2) {
    if (!state.projectId) {
      await saveProjectWizardStep(state, 1, payload)
    }

    const projectId = state.projectId
    if (!projectId) return state

    const pointList = buildPointList(payload).filter(point => point.longitude !== 0 || point.latitude !== 0)
    if (pointList.length > 0) {
      await platformPointApi.saveList(projectId, pointList)
    }

    if (payload.gisConfig?.rangeMode === 'manual' && payload.gisConfig.planningRange) {
      await platformPlanConfigApi.saveScope({
        projectId,
        topLeftLng: payload.gisConfig.planningRange.northwest.lon,
        topLeftLat: payload.gisConfig.planningRange.northwest.lat,
        bottomRightLng: payload.gisConfig.planningRange.southeast.lon,
        bottomRightLat: payload.gisConfig.planningRange.southeast.lat,
      })
    }

    if (payload.gisConfig?.gridResolution != null) {
      await platformPlanConfigApi.saveGridResolution({
        projectId,
        gridResolution: payload.gisConfig.gridResolution,
      })
    }

    await platformPlanConfigApi.saveEnableRedundancy({
      projectId,
      enableRedundancy: payload.redundancyConfig?.enabled ?? false,
    })
  }

  return state
}

export async function uploadProjectWizardLayer(
  state: ProjectWizardSyncState,
  payload: ProjectWizardStepPayload,
  layer: ProjectWizardLayerUpload,
  options: ProjectWizardSyncOptions,
): Promise<void> {
  const uploadFile = options.uploadFile ?? uploadFileWithUppyTus
  const file = layer.file
  if (!layer.checked || !file) return

  const completedUpload = state.layerUploads[layer.key]
  if (completedUpload?.fileName === file.name) return

  const layerId = await platformPlanLayerApi.save({
    name: layer.label,
    remarks: layer.remarks || `${layer.label} - ${file.name}`,
    isPublic: payload.allowOtherUsers ? 1 : 0,
    isDefault: layer.isDefault ? 1 : 0,
    typeDic: layer.typeDic,
  })

  const uploaded = await uploadFile(file, {
    onProgress: (progress) => options.onLayerProgress?.(layer.key, progress),
  })

  await platformUploadApi.complete({
    uploadUrl: uploaded.uploadUrl,
    bizId: layerId,
    typeDic: 'LAYER',
  })

  state.layerUploads[layer.key] = {
    layerId,
    fileName: file.name,
    uploadUrl: uploaded.uploadUrl,
  }
}
