/**
 * 项目管理 Composable
 * 整合打开/保存/另存为/关闭项目的完整业务流程
 */

import { useConnectorStore } from '@/stores/connector'
import { useLayerStore } from '@/stores/layer'
import { useProjectDataStore } from '@/stores/projectData'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore, type ArmorTypeMapping } from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { useUserStore } from '@/stores/user'
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { projectFileService, type OpenProjectResult, type ProjectMetadata, type ProjectType } from '@/services/ProjectFileService'
import { applyImportResultToStore } from '@/services/DeviceImportService'
import { platformDeviceEntityApi, platformPlanConfigApi, platformProjectApi } from '@/services/platform/api'
import {
  connectorElementToDeviceEntity,
  platformDeviceEntityToConnectorElement,
  type DeviceTypeCodeMap,
} from '@/services/platform/deviceLibraryMapping'
import {
  getDeviceTypeCodeForCategory,
  type DeviceLibraryCategory,
} from '@/services/platform/deviceTypeAdapter'
import {
  isPublicFlag,
  mergePlanConfigSnapshots,
  mergePlatformPlanningResults,
  normalizePlanConfigSnapshot,
  normalizePlanProject,
  normalizePlanProjectDetail,
  planConfigNeedsFallback,
} from '@/services/platform/normalizers'
import { syncPlanningProjectToPlatform } from '@/services/platform/projectSync'
import { queryRoutePlanningByProjectId } from '@/services/RoutePlanningApiService'
import { normalizePlatformSimulationCache } from '@/services/SimulationApiService'
import type { Id, PlanConfigScope } from '@/services/platform/types'
import type { WDMPlanningParams } from '@/types/systemPlanning'
import { generateUUID } from '@/types/useFile'
import { useRouter } from 'vue-router'

const DEVICE_LIBRARY_CATEGORIES: DeviceLibraryCategory[] = ['fiber', 'amplifier', 'branching', 'equalizer', 'joint']

// 新建项目参数
export interface CreateProjectParams {
  projectType: ProjectType
  projectName: string
  allowOtherUsers: boolean
  platformProjectId?: Id | null
  rplFile?: string
  rplFileData?: File  // RPL 文件对象，用于导入
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
    id: string
    name: string
    longitude: number
    latitude: number
    depth?: number
  }>
  buConfigs?: Array<{
    id: string
    name: string
    longitude: number
    latitude: number
    portLimit: number
  }>
  /** 海缆铠装映射（风险等级 → 缆型 + 单价） */
  armorMappings?: Array<{
    riskLevel: string
    riskThreshold: number
    cableTypeId: string
    cableTypeName: string
    unitPrice: number
  }>
  armorTypeMappings?: ArmorTypeMapping[]
  /** 冗余策略配置（多点规划） */
  /** GIS 与路由算法设置 */
  planConfig?: {
    scope?: Omit<PlanConfigScope, 'projectId'> | null
    gridResolution?: number | null
    enableRedundancy?: boolean | null
  }
  layers: Array<{
    key: string
    label: string
    checked: boolean
    value: string
    /** GeoJSON 解析结果（.geojson/.json 文件） */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geoData?: any
    /** 栅格文件二进制数据（.tif/.tiff 文件） */
    rasterData?: ArrayBuffer
  }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  devices?: Array<{
    id: string
    name: string
    type: string
    file?: string
    /** 解析后的器件数据（来自外部文件，结构不固定） */
    parsedData?: {
      fiberTypes?: Record<string, unknown>[]
      amplifierTypes?: Record<string, unknown>[]
      branchingUnitTypes?: Record<string, unknown>[]
      equalizerTypes?: Record<string, unknown>[]
      jointBoxTypes?: Record<string, unknown>[]
    }
  }>
}

// 保存提示对话框的用户选择
export type SavePromptChoice = 'save' | 'discard' | 'cancel'

// 打开项目的流程状态
interface OpenProjectState {
  pendingFile: File | null
  showSavePrompt: boolean
}

export function useProjectManager() {
  const appStore = useAppStore()
  const dictionaryStore = useDictionaryStore()
  const userStore = useUserStore()
  const projectDataStore = useProjectDataStore()
  const router = useRouter()
  
  // 状态
  const openState = ref<OpenProjectState>({
    pendingFile: null,
    showSavePrompt: false,
  })
  
  const showSaveAsDialog = ref(false)
  const isProcessing = ref(false)
  
  // 计算属性
  const hasOpenProject = computed(() => appStore.hasOpenProject)
  const currentProjectName = computed(() => appStore.currentProjectName)
  const currentProjectType = computed(() => appStore.currentProjectType)
  const isDirty = computed(() => appStore.projectState.isDirty)
  
  /**
   * 打开项目文件
   * 完整流程：检查当前项目 → 提示保存 → 选择文件 → 权限验证 → 加载
   */
  async function openProject(): Promise<void> {
    // 1. 先让用户选择文件
    const file = await projectFileService.openFileDialog('.use')
    if (!file) return
    
    // 2. 检查当前是否有未保存的项目
    if (hasOpenProject.value && isDirty.value) {
      // 保存待打开的文件，显示保存提示对话框
      openState.value.pendingFile = file
      openState.value.showSavePrompt = true
      return
    }
    
    // 3. 直接打开文件
    await doOpenFile(file)
  }
  
  /**
   * 处理保存提示对话框的用户选择
   */
  async function handleSavePromptChoice(choice: SavePromptChoice): Promise<void> {
    openState.value.showSavePrompt = false
    
    if (choice === 'cancel') {
      // 取消操作，清除待打开的文件
      openState.value.pendingFile = null
      return
    }
    
    if (choice === 'save') {
      // 先保存当前项目
      const saved = await saveProject()
      if (!saved) {
        // 保存失败，取消操作
        openState.value.pendingFile = null
        return
      }
    }
    
    // 关闭当前项目并打开新文件
    if (openState.value.pendingFile) {
      closeProject()
      await doOpenFile(openState.value.pendingFile)
      openState.value.pendingFile = null
    }
  }
  
  /**
   * 执行打开文件操作
   */
  async function doOpenFile(file: File): Promise<OpenProjectResult> {
    isProcessing.value = true
    
    try {
      const result = await projectFileService.importProject(file)
      
      if (!result.success) {
        // 处理错误
        if (result.errorType === 'permission') {
          appStore.showNotification({
            type: 'error',
            message: result.error || '无法打开项目：权限不足',
          })
        } else if (result.errorType === 'format') {
          appStore.showNotification({
            type: 'error',
            message: result.error || '无效的项目文件格式',
          })
        } else {
          appStore.showNotification({
            type: 'error',
            message: result.error || '打开项目失败',
          })
        }
        return result
      }
      
      // 成功打开 - 从 projectFileService 获取元数据
      const currentProject = projectFileService.getCurrentProject()
      if (currentProject) {
        appStore.setCurrentProject(currentProject)
      }
      
      // 设置数据联动并标记已加载（文件数据已由 ProjectFileService.importProject 加载）
      projectDataStore.markDataLoaded()
      appStore.setProjectPhase('route-planning')
      await router.push('/planning')
      
      appStore.showNotification({
        type: 'success',
        message: `项目已打开：${currentProject?.name || file.name}`,
      })
      
      return result
    } finally {
      isProcessing.value = false
    }
  }

  async function openProjectFromFile(file: File): Promise<OpenProjectResult> {
    if (hasOpenProject.value && isDirty.value) {
      openState.value.pendingFile = file
      openState.value.showSavePrompt = true
      return { success: false, error: '当前项目尚未保存', errorType: 'read' }
    }

    return doOpenFile(file)
  }

  async function openPlatformProject(projectId: Id): Promise<boolean> {
    const loadingKey = `open-platform-project:${projectId}`
    isProcessing.value = true
    appStore.showGlobalLoading(
      '正在打开项目...',
      '正在加载项目详情、路由规划和器件数据',
      loadingKey,
    )

    try {
      const [project, routeQuery, deviceEntitiesQuery, planningResultsQuery] = await Promise.all([
        platformProjectApi.detail(projectId),
        queryRoutePlanningByProjectId(projectId)
          .then(data => ({ data, error: null as Error | null }))
          .catch(error => ({ data: null, error: error instanceof Error ? error : new Error(String(error)) })),
        platformDeviceEntityApi.search({ projectId, pageNumber: 1, pageSize: 1000 })
          .then(response => ({ data: response.data ?? [], error: null as Error | null }))
          .catch(error => ({ data: [], error: error instanceof Error ? error : new Error(String(error)) })),
        platformProjectApi.queryPlanningResults(projectId)
          .then(data => ({ data, error: null as Error | null }))
          .catch(error => ({ data: null, error: error instanceof Error ? error : new Error(String(error)) })),
      ])
      const {
        project: normalizedProject,
        planConfig: detailPlanConfig,
        planningResults: detailPlanningResults,
      } = normalizePlanProjectDetail(project)
      const planConfigQuery = planConfigNeedsFallback(detailPlanConfig)
        ? await platformPlanConfigApi.searchAll(projectId)
            .then(data => ({ data, error: null as Error | null }))
            .catch(error => ({ data: null, error: error instanceof Error ? error : new Error(String(error)) }))
        : { data: null, error: null as Error | null }
      const queriedPlanConfig = planConfigQuery.data
        ? normalizePlanConfigSnapshot(planConfigQuery.data)
        : null
      const planConfig = mergePlanConfigSnapshots(detailPlanConfig, queriedPlanConfig)
      const planningResults = mergePlatformPlanningResults(
        detailPlanningResults,
        planningResultsQuery.data,
      )
      projectDataStore.clearProjectData()
      const metadata: ProjectMetadata = {
        name: normalizedProject.name || `平台项目 ${projectId}`,
        path: `platform://${projectId}`,
        type: 'use',
        uuid: `platform-${projectId}`,
        platformProjectId: projectId,
        lastModified: new Date().toISOString(),
        creatorId: userStore.currentUser?.id || '',
        allowOtherUsers: isPublicFlag(normalizedProject.isPublic),
      }

      const points = [...normalizedProject.pointList]
        .sort((a, b) => Number(a.sortNum ?? 0) - Number(b.sortNum ?? 0))
      const firstRoute = routeQuery.data?.routes[0] ?? null
      const routeLandingPoints = firstRoute?.points.filter(point => point.type === 'landing') ?? []
      const restoredConnectorElements = deviceEntitiesQuery.data
        .map(platformDeviceEntityToConnectorElement)
        .filter(element => element.type !== 'cable_segment')
      const platformLandingElements = restoredConnectorElements.filter(element =>
        element.type === 'landing' || element.type === 'underwater'
      )

      const projectStartPoint = points[0]
      const projectEndPoint = points[points.length - 1]
      const routeStartPoint = routeLandingPoints[0] ?? firstRoute?.points[0]
      const routeEndPoint = routeLandingPoints[routeLandingPoints.length - 1]
        ?? firstRoute?.points[firstRoute.points.length - 1]
      const startLongitude = projectStartPoint?.longitude ?? routeStartPoint?.coordinates[0]
      const startLatitude = projectStartPoint?.latitude ?? routeStartPoint?.coordinates[1]
      const endLongitude = projectEndPoint?.longitude ?? routeEndPoint?.coordinates[0]
      const endLatitude = projectEndPoint?.latitude ?? routeEndPoint?.coordinates[1]
      const startStationName = projectStartPoint?.name
        || routeStartPoint?.name
        || platformLandingElements[0]?.name
        || '起点'
      const endStationName = projectEndPoint?.name
        || routeEndPoint?.name
        || platformLandingElements[platformLandingElements.length - 1]?.name
        || '终点'

      const settingsStore = useSettingsStore()
      settingsStore.resetProjectSettings()
      settingsStore.replacePlatformDeviceEntities(deviceEntitiesQuery.data)
      settingsStore.updateRoutePlanningConfig({
        mode: points.length > 2 ? 'multi-point' : 'point-to-point',
        startPoint: Number.isFinite(startLongitude) && Number.isFinite(startLatitude)
          ? { name: startStationName, lon: Number(startLongitude), lat: Number(startLatitude) }
          : { lon: 0, lat: 0 },
        endPoint: Number.isFinite(endLongitude) && Number.isFinite(endLatitude)
          ? { name: endStationName, lon: Number(endLongitude), lat: Number(endLatitude) }
          : { lon: 0, lat: 0 },
        waypoints: points.map(point => ({
          id: String(point.id ?? `${projectId}-${point.sortNum ?? point.name}`),
          platformPointId: point.id,
          name: point.name || '站点',
          lon: point.longitude!,
          lat: point.latitude!,
        })),
        ...(planConfig.scope ? {
          rangeMode: 'manual' as const,
          planningRange: {
            northwest: {
              lon: Number(planConfig.scope.topLeftLng ?? 0),
              lat: Number(planConfig.scope.topLeftLat ?? 0),
            },
            southeast: {
              lon: Number(planConfig.scope.bottomRightLng ?? 0),
              lat: Number(planConfig.scope.bottomRightLat ?? 0),
            },
          },
        } : {}),
        ...(planConfig.gridResolution != null
          ? { gridResolution: planConfig.gridResolution }
          : {}),
        ...(planConfig.enableRedundancy != null ? {
          redundancyConfig: {
            ...(settingsStore.routePlanningConfig.redundancyConfig ?? {
              costLimitType: 'relative' as const,
              relativeCostPercent: 30,
            }),
            enabled: planConfig.enableRedundancy,
          },
        } : {}),
        isConfigured: Number.isFinite(startLongitude)
          && Number.isFinite(startLatitude)
          && Number.isFinite(endLongitude)
          && Number.isFinite(endLatitude),
      })
      settingsStore.updatePlatformPlanConfigSnapshot(planConfig)
      const restoredChannel = planConfig.channelConfig
      if (restoredChannel) {
        const currentWdm = settingsStore.systemPlanningConfig.wdmParams
        const channelCount = Number.isFinite(Number(restoredChannel.channelCount))
          && Number(restoredChannel.channelCount) > 0
          ? Math.trunc(Number(restoredChannel.channelCount))
          : currentWdm.channelCount
        const launchPower = restoredChannel.launchPowerDbm?.[0] ?? currentWdm.launchPower
        const channelVector = (values: number[] | null | undefined, fallback: number) =>
          Array.from({ length: channelCount }, (_, index) =>
            Number.isFinite(Number(values?.[index])) ? Number(values?.[index]) : fallback
          )

        settingsStore.updateWDMPlanningParams({
          channelCount,
          centerFreqTHz: restoredChannel.centerFrequencyThz ?? currentWdm.centerFreqTHz,
          channelSpacingGHz: restoredChannel.channelSpacingGhz ?? currentWdm.channelSpacingGHz,
          baudRateGbaud: restoredChannel.baudRateGbaud ?? currentWdm.baudRateGbaud,
          modulation: (restoredChannel.modulationFormat ?? currentWdm.modulation) as WDMPlanningParams['modulation'],
          launchPower,
          vectorParams: {
            launchPowerVector: channelVector(restoredChannel.launchPowerDbm, launchPower),
            initialAseVector: channelVector(null, restoredChannel.initialAseNoiseDbm ?? -90),
            initialNliVector: channelVector(null, restoredChannel.initialNliNoiseDbm ?? -90),
          },
        })
      }
      const restoredOptimization = planConfig.optimization
      if (restoredOptimization || planConfig.spanKm != null) {
        const currentSpan = settingsStore.systemPlanningConfig.spanScanConfig
        const fixedSpanKm = planConfig.spanKm
        settingsStore.updateSpanScanConfig({
          spanLengthMinKm: restoredOptimization?.spanMinKm ?? fixedSpanKm ?? currentSpan.spanLengthMinKm,
          spanLengthMaxKm: restoredOptimization?.spanMaxKm ?? fixedSpanKm ?? currentSpan.spanLengthMaxKm,
          spanStepKm: restoredOptimization?.spanStepKm ?? (fixedSpanKm != null ? 0 : currentSpan.spanStepKm),
          targetGsnrDb: restoredOptimization?.targetGsnrDb ?? currentSpan.targetGsnrDb,
          targetOsnrDb: restoredOptimization?.targetOsnrDb ?? currentSpan.targetOsnrDb,
          marginDb: restoredOptimization?.osnrMarginDb ?? currentSpan.marginDb,
        })
      }
      settingsStore.updatePlatformPlanningResults(planningResults)
      const restoredSimulationCache = normalizePlatformSimulationCache(
        planningResults?.simulation,
      )
      if (restoredSimulationCache) {
        settingsStore.updateSimulationCache(restoredSimulationCache)
        const fiberModel = restoredSimulationCache.model_selection.fiber_model_id
        const amplifierModel = restoredSimulationCache.model_selection.edfa_model_id
        if (['GN', 'EGN', 'SSFM'].includes(fiberModel)) {
          settingsStore.updateSimulationModelConfig({
            fiberModel: fiberModel as 'GN' | 'EGN' | 'SSFM',
          })
        }
        if (['EDFA_Simple', 'EDFA_Full', 'EDFA_Raman'].includes(amplifierModel)) {
          settingsStore.updateSimulationModelConfig({
            edfaModel: amplifierModel as 'EDFA_Simple' | 'EDFA_Full' | 'EDFA_Raman',
          })
        }
      }
      appStore.addLog(
        'INFO',
        queriedPlanConfig ? '已从项目详情和独立配置接口恢复项目规划配置' : '已从项目详情恢复项目规划配置',
      )

      const routeStore = useRouteStore()
      routeStore.setAlgorithmRouteResult(routeQuery.data)
      if (firstRoute) {
        routeStore.selectRoute(firstRoute.id)
      }

      const connectorStore = useConnectorStore()
      connectorStore.createTable(`${metadata.name}_接线元`, firstRoute?.id)
      if (connectorStore.currentTable) {
        connectorStore.replaceTableElements(restoredConnectorElements)
      }

      appStore.setCurrentProject(metadata)
      projectFileService.setCurrentProject(metadata)
      projectDataStore.markDataLoaded()
      appStore.setProjectPhase('route-planning')
      appStore.showGlobalLoading('正在恢复项目...', metadata.name, loadingKey)
      await router.push('/planning')

      appStore.showNotification({
        type: 'success',
        message: `平台项目已打开：${metadata.name}`,
      })
      appStore.addLog('INFO', `打开平台项目: ${metadata.name} (#${projectId})`)
      if (routeQuery.error) {
        appStore.addLog('WARN', `查询路由规划结果失败，已显示项目站点: ${routeQuery.error.message}`)
      } else if (routeQuery.data) {
        appStore.addLog('INFO', `已恢复路由规划结果: ${routeQuery.data.routes.length} 条路径方案`)
      } else {
        appStore.addLog('INFO', `项目暂无路由规划结果，已显示 ${points.length} 个站点`)
      }
      const restoredPlanningResultCount = [
        planningResults?.fixed,
        planningResults?.optimized,
        planningResults?.simulation,
      ].filter(result => result != null).length
      if (restoredPlanningResultCount > 0) {
        appStore.addLog('INFO', `已恢复 ${restoredPlanningResultCount} 类系统规划结果`)
      }
      for (const error of planningResultsQuery.data?.errors ?? []) {
        appStore.addLog('WARN', `查询系统规划结果失败（项目仍已打开）: ${error}`)
      }
      if (planningResultsQuery.error) {
        appStore.addLog('WARN', `查询系统规划结果失败（项目仍已打开）: ${planningResultsQuery.error.message}`)
      }
      for (const error of queriedPlanConfig?.errors ?? []) {
        appStore.addLog('WARN', `查询项目规划配置失败（已使用详情数据）: ${error}`)
      }
      if (planConfigQuery.error) {
        appStore.addLog('WARN', `查询项目规划配置失败（已使用详情数据）: ${planConfigQuery.error.message}`)
      }
      if (deviceEntitiesQuery.error) {
        appStore.addLog('WARN', `查询项目器件实例失败: ${deviceEntitiesQuery.error.message}`)
      } else {
        appStore.addLog('INFO', `已恢复平台器件实例: ${deviceEntitiesQuery.data.length} 个`)
      }
      return true
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: `打开平台项目失败：${(error as Error).message}`,
        duration: 5000,
      })
      return false
    } finally {
      isProcessing.value = false
      appStore.hideGlobalLoading(loadingKey)
    }
  }

  async function syncCurrentDeviceEntitiesToPlatform(projectId: Id) {
    const connectorStore = useConnectorStore()
    const settingsStore = useSettingsStore()
    await Promise.all([
      dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType),
      settingsStore.ensurePlatformDeviceLibrariesLoaded(),
    ])
    const libraries = settingsStore.platformDeviceLibraries.map(library => {
      if (library.deviceTypeCd) return library
      const category = DEVICE_LIBRARY_CATEGORIES.find(item => item === library.dialogWindowId)
      if (!category) return library
      const runtimeCode = getDeviceTypeCodeForCategory(category)
      const dictionaryItem = dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, runtimeCode)
      return dictionaryItem?.code ? { ...library, deviceTypeCd: dictionaryItem.code } : library
    })
    const deviceEntities = connectorStore.elements
      .filter(element => element.type !== 'fiber' && element.type !== 'cable_segment')
      .map((element, index) => connectorElementToDeviceEntity(
        element,
        projectId,
        index + 1,
        libraries,
      ))
      .filter((entity): entity is NonNullable<typeof entity> => entity !== null)

    if (deviceEntities.length === 0) return 0

    const result = await syncPlanningProjectToPlatform({
      id: projectId,
      name: currentProjectName.value || `平台项目 ${projectId}`,
      isPublic: appStore.projectState.currentProject?.allowOtherUsers ? 1 : 0,
      deviceEntities,
    })
    return result.deviceEntitiesSynced
  }
  
  /**
   * 保存当前项目
   */
  async function saveProject(): Promise<boolean> {
    if (!hasOpenProject.value) {
      appStore.showNotification({
        type: 'warning',
        message: '当前没有打开的项目',
      })
      return false
    }
    
    isProcessing.value = true
    
    try {
      const result = await projectFileService.saveProject()
      
      if (result.success) {
        appStore.markProjectSaved()
        const platformProjectId = appStore.projectState.currentProject?.platformProjectId
        if (platformProjectId) {
          try {
            const syncedCount = await syncCurrentDeviceEntitiesToPlatform(platformProjectId)
            if (syncedCount > 0) {
              appStore.addLog('INFO', `平台器件实例已同步: ${syncedCount} 个`)
            }
          } catch (error) {
            appStore.showNotification({
              type: 'warning',
              message: `项目已保存，器件实例平台同步失败：${(error as Error).message}`,
              duration: 5000,
            })
          }
        }
        
        appStore.showNotification({
          type: 'success',
          message: `项目已保存：${currentProjectName.value}`,
        })
      } else {
        appStore.showNotification({
          type: 'error',
          message: result.error || '保存项目失败',
        })
      }
      
      return result.success
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 另存为
   */
  function openSaveAsDialog(): void {
    appStore.openDialog('save-as')
  }
  
  /**
   * 执行另存为操作
   */
  async function saveProjectAs(projectName: string, savePath: string): Promise<boolean> {
    isProcessing.value = true
    
    try {
      // 导出 USE 格式
      await projectFileService.exportUSE(projectName)
      
      // 更新当前项目信息
      const newMetadata: ProjectMetadata = {
        name: projectName,
        path: `${savePath}/${projectName}.use`,
        type: 'use',
        uuid: '',
        lastModified: new Date().toISOString(),
        creatorId: userStore.currentUser?.id || '',
        allowOtherUsers: false,
      }
      
      appStore.setCurrentProject(newMetadata)
      appStore.markProjectSaved()
      appStore.showNotification({
        type: 'success',
        message: `项目已另存为：${projectName}`,
      })
      
      return true
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: '另存项目失败',
      })
      return false
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 关闭当前项目
   */
  function closeProject(): void {
    projectFileService.closeProject()
    appStore.closeCurrentProject()
    // 清空项目数据
    projectDataStore.clearProjectData()
  }
  
  /**
   * 检查是否可以安全关闭（无未保存更改）
   */
  function canSafelyClose(): boolean {
    return !hasOpenProject.value || !isDirty.value
  }
  
  /**
   * 标记项目已修改
   */
  function markDirty(): void {
    appStore.setProjectDirty(true)
  }

  /**
   * 新建项目
   */
  async function createProject(params: CreateProjectParams): Promise<boolean> {
    const { projectType, projectName, allowOtherUsers, platformProjectId, layers, rplFileData, startStation, endStation, waypoints, planningMode, planConfig, buConfigs, armorMappings, armorTypeMappings } = params
    
    // 检查当前是否有未保存的项目
    if (hasOpenProject.value && isDirty.value) {
      appStore.showNotification({
        type: 'warning',
        message: '请先保存或关闭当前项目',
      })
      return false
    }

    const settingsStore = useSettingsStore()

    // 新项目必须从空的项目级规划状态开始；即使页面刷新后 appStore 暂无打开项目，
    // localStorage 中也可能仍保留上一个项目的计算缓存。
    if (hasOpenProject.value) {
      closeProject()
    } else {
      settingsStore.resetProjectSettings()
    }

    isProcessing.value = true

    try {
      // 创建项目元数据
      const projectUUID = generateUUID()
      const newMetadata: ProjectMetadata = {
        name: projectName,
        path: '',
        type: projectType,
        uuid: projectUUID,
        lastModified: new Date().toISOString(),
        creatorId: userStore.currentUser?.id || '',
        allowOtherUsers: allowOtherUsers,
        platformProjectId: platformProjectId ?? undefined,
      }

      if (platformProjectId) {
        appStore.addLog('INFO', `平台项目已同步: ${projectName} (#${platformProjectId})`)
      } else {
        try {
          const platformPoints = planningMode === 'multi-point'
            ? (waypoints || []).map((point, index) => ({
                name: point.name,
                longitude: point.longitude,
                latitude: point.latitude,
                sortNum: index + 1,
              }))
            : [
                startStation ? {
                  name: startStation.name,
                  longitude: startStation.longitude,
                  latitude: startStation.latitude,
                  sortNum: 1,
                } : null,
                endStation ? {
                  name: endStation.name,
                  longitude: endStation.longitude,
                  latitude: endStation.latitude,
                  sortNum: 2,
                } : null,
              ].filter((point): point is { name: string; longitude: number; latitude: number; sortNum: number } => Boolean(point))

          const platformResult = await syncPlanningProjectToPlatform({
            name: projectName,
            remarks: `${projectType.toUpperCase()} project`,
            isPublic: allowOtherUsers ? 1 : 0,
            points: platformPoints.filter(point => point.longitude !== 0 || point.latitude !== 0),
            planConfig,
          })
          newMetadata.platformProjectId = platformResult.projectId
          appStore.addLog('INFO', `平台项目已同步: ${projectName} (#${platformResult.projectId})`)
        } catch (error) {
          appStore.showNotification({
            type: 'warning',
            message: `平台项目同步失败，本地项目将继续创建：${(error as Error).message}`,
            duration: 5000,
          })
          appStore.addLog('WARN', `平台项目同步失败: ${(error as Error).message}`)
        }
      }

      // 设置当前项目
      appStore.setCurrentProject(newMetadata)
      projectFileService.setCurrentProject(newMetadata)

      // 根据选择的图层加载数据（含实际文件内容）
      const layerStore = useLayerStore()
      for (const layer of layers) {
        if (layer.checked) {
          layerStore.setLayerVisible(layer.key, true)
          // 如果有实际文件数据，存入 layerStore
          if (layer.geoData || layer.rasterData) {
            layerStore.setLayerData(layer.key, {
              id: layer.key,
              features: layer.geoData || undefined,
              rasterData: layer.rasterData || undefined,
              metadata: { source: layer.value || 'user-upload' },
            })
          }
        }
      }

      // 更新工程设置（站点 + GIS + 铠装映射 + 冗余策略）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const routeConfigUpdates: Record<string, any> = {
        mode: planningMode || 'point-to-point',
        startPoint: startStation ? { name: startStation.name, lon: startStation.longitude, lat: startStation.latitude } : { lon: 0, lat: 0 },
        endPoint: endStation ? { name: endStation.name, lon: endStation.longitude, lat: endStation.latitude } : { lon: 0, lat: 0 },
        waypoints: waypoints ? waypoints.map(wp => ({
          id: wp.id,
          name: wp.name,
          lon: wp.longitude,
          lat: wp.latitude,
          depth: wp.depth ?? 0
        })) : [],
        buList: buConfigs ? buConfigs.map(bu => ({
          id: bu.id,
          name: bu.name,
          lon: bu.longitude,
          lat: bu.latitude,
          portLimit: bu.portLimit
        })) : [],
        isConfigured: true,
      }

      // 铠装映射写入 settingsStore
      if (armorMappings && armorMappings.length > 0) {
        routeConfigUpdates.armorMappings = armorMappings.map(m => ({
          riskLevel: m.riskLevel as 'high' | 'medium' | 'low',
          riskThreshold: m.riskThreshold,
          cableTypeId: m.cableTypeId,
          cableTypeName: m.cableTypeName,
          unitPrice: m.unitPrice,
        }))
      }
      if (armorTypeMappings) {
        routeConfigUpdates.armorTypeMappings = armorTypeMappings.map(mapping => ({ ...mapping }))
      }

      // Fix 1b: 冗余策略写入 settingsStore
      // Fix 2: GIS 配置写入 settingsStore（rangeMode + planningRange + gridResolution）
      settingsStore.updateRoutePlanningConfig(routeConfigUpdates)
      
      // 处理器件库文件
      if (params.devices && params.devices.length > 0) {
        await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType)
        const deviceTypeCodes = Object.fromEntries(DEVICE_LIBRARY_CATEGORIES.map(category => {
          const runtimeCode = getDeviceTypeCodeForCategory(category)
          const dictionaryItem = dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, runtimeCode)
          return [category, dictionaryItem?.code ?? '']
        })) as DeviceTypeCodeMap
        const deviceFiles: string[] = []
        let importSummary = ''
        
        for (const device of params.devices) {
          deviceFiles.push(device.file || device.name)
          // 如果有解析后的数据，使用共享函数写入 settingsStore
          if (device.parsedData) {
            const pd = device.parsedData
            // 构建一个兼容 ImportResult 结构的临时对象
            const fakeResult = {
              success: true,
              fiberTypes: pd.fiberTypes || [],
              amplifierTypes: pd.amplifierTypes || [],
              branchingUnitTypes: pd.branchingUnitTypes || [],
              equalizerTypes: pd.equalizerTypes || [],
              jointBoxTypes: pd.jointBoxTypes || [],
              errors: [], warnings: [],
              summary: {
                totalRows: 0, successCount: 0, errorCount: 0,
                fiberCount: pd.fiberTypes?.length || 0,
                amplifierCount: pd.amplifierTypes?.length || 0,
                branchingUnitCount: pd.branchingUnitTypes?.length || 0,
                equalizerCount: pd.equalizerTypes?.length || 0,
                jointCount: pd.jointBoxTypes?.length || 0,
              }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            importSummary = await applyImportResultToStore(fakeResult as any, settingsStore, deviceTypeCodes)
          }
        }
        
        settingsStore.setCurrentLibraryFile(deviceFiles.join(', '))
        appStore.addLog('INFO', importSummary || `导入器件库文件: ${deviceFiles.join(', ')}`)
      }

      // 如果是 USE 项目并且有 RPL 文件，导入 RPL 数据
      if (projectType === 'use' && rplFileData) {
        const rplStore = useRPLStore()
        
        try {
          const fileContent = await rplFileData.text()
          const tableName = rplFileData.name.replace(/\.(rpl|csv)$/i, '')
          const success = rplStore.importFromCSV(fileContent, tableName, 'route-main')
          
          if (success && rplStore.currentTable) {
            const records = rplStore.currentTable.records
            appStore.addLog('INFO', `导入 RPL 文件: ${rplFileData.name}, ${records.length} 条记录`)
          }
      } catch {
          appStore.showNotification({
            type: 'warning',
            message: 'RPL 文件导入失败，项目已创建但无路由数据',
          })
        }
      }
      
      // 初始化项目数据
      projectDataStore.markDataLoaded()
      appStore.setProjectPhase('route-planning')
      await router.push('/planning')

      appStore.addLog('INFO', `新建项目: ${projectName} (${projectType})`)
      appStore.showNotification({
        type: 'success',
        message: `项目已创建：${projectName}`,
      })

      return true
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: '创建项目失败',
      })
      return false
    } finally {
      isProcessing.value = false
    }
  }
  
  return {
    // 状态
    openState,
    showSaveAsDialog,
    isProcessing,
    
    // 计算属性
    hasOpenProject,
    currentProjectName,
    currentProjectType,
    isDirty,
    
    // 方法
    openProject,
    openProjectFromFile,
    openPlatformProject,
    handleSavePromptChoice,
    saveProject,
    openSaveAsDialog,
    saveProjectAs,
    closeProject,
    canSafelyClose,
    markDirty,
    createProject,
  }
}
