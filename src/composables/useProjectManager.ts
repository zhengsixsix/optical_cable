/**
 * 项目管理 Composable
 * 整合打开/保存/另存为/关闭项目的完整业务流程
 */

import { useConnectorStore } from '@/stores/connector'
import { useLayerStore } from '@/stores/layer'
import { useMonitorStore } from '@/stores/monitor'
import { useProjectDataStore } from '@/stores/projectData'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { projectFileService, type OpenProjectResult, type ProjectMetadata, type ProjectType } from '@/services/ProjectFileService'
import { applyImportResultToStore } from '@/services/DeviceImportService'
import { platformPlanConfigApi, platformProjectApi } from '@/services/platform/api'
import { connectorElementToDeviceEntity } from '@/services/platform/deviceLibraryMapping'
import { isPublicFlag, normalizePlanProject } from '@/services/platform/normalizers'
import { syncPlanningProjectToPlatform } from '@/services/platform/projectSync'
import { queryRoutePlanningByProjectId } from '@/services/RoutePlanningApiService'
import type { Id, PlanConfigScope, PlanSystemResult } from '@/services/platform/types'
import { generateUUID } from '@/types/useFile'
import { useRouter } from 'vue-router'

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

function parsePlatformSystemResult(result: PlanSystemResult | null): unknown | null {
  const text = result?.['simulation_result.json']
  if (!text?.trim()) return null
  return JSON.parse(text)
}

export function useProjectManager() {
  const appStore = useAppStore()
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
      // 项目切换前先清除上一项目的规划结果，避免新文件无路线时继续显示旧路径。
      useRouteStore().clearParetoRoutes()
      useCableSegmentStore().clearSegments()
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
      projectDataStore.setupDataLinks()
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
      '正在加载项目详情、路由规划和系统规划结果',
      loadingKey,
    )

    try {
      const [project, routeQuery, systemQuery, planConfigQuery] = await Promise.all([
        platformProjectApi.detail(projectId),
        queryRoutePlanningByProjectId(projectId)
          .then(data => ({ data, error: null as Error | null }))
          .catch(error => ({ data: null, error: error instanceof Error ? error : new Error(String(error)) })),
        platformProjectApi.querySystem(projectId)
          .then(parsePlatformSystemResult)
          .then(data => ({ data, error: null as Error | null }))
          .catch(error => ({ data: null, error: error instanceof Error ? error : new Error(String(error)) })),
        platformPlanConfigApi.searchAll(projectId)
          .then(data => ({ data, error: null as Error | null }))
          .catch(error => ({ data: null, error: error instanceof Error ? error : new Error(String(error)) })),
      ])
      const normalizedProject = normalizePlanProject(project)
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

      const settingsStore = useSettingsStore()
      settingsStore.resetProjectSettings()
      settingsStore.updateRoutePlanningConfig({
        mode: points.length > 2 ? 'multi-point' : 'point-to-point',
        startPoint: points[0]
          ? { name: points[0].name, lon: points[0].longitude!, lat: points[0].latitude! }
          : { lon: 0, lat: 0 },
        endPoint: points[points.length - 1]
          ? { name: points[points.length - 1].name, lon: points[points.length - 1].longitude!, lat: points[points.length - 1].latitude! }
          : { lon: 0, lat: 0 },
        waypoints: points.map(point => ({
          id: String(point.id ?? `${projectId}-${point.sortNum ?? point.name}`),
          name: point.name || '站点',
          lon: point.longitude!,
          lat: point.latitude!,
        })),
        ...(planConfigQuery.data?.scope ? {
          rangeMode: 'manual' as const,
          planningRange: {
            northwest: {
              lon: Number(planConfigQuery.data.scope.topLeftLng ?? 0),
              lat: Number(planConfigQuery.data.scope.topLeftLat ?? 0),
            },
            southeast: {
              lon: Number(planConfigQuery.data.scope.bottomRightLng ?? 0),
              lat: Number(planConfigQuery.data.scope.bottomRightLat ?? 0),
            },
          },
        } : {}),
        ...(planConfigQuery.data?.gridResolution != null
          ? { gridResolution: Number(planConfigQuery.data.gridResolution) }
          : {}),
        isConfigured: points.length > 0,
      })
      settingsStore.updatePlatformPlanConfigSnapshot(planConfigQuery.data)
      settingsStore.updatePlatformSystemResult(systemQuery.data)
      if (planConfigQuery.error) {
        appStore.addLog('WARN', `查询项目配置失败: ${planConfigQuery.error.message}`)
      } else if (planConfigQuery.data?.errors.length) {
        appStore.addLog('WARN', `部分项目配置查询失败: ${planConfigQuery.data.errors.join('; ')}`)
      } else if (planConfigQuery.data) {
        appStore.addLog('INFO', '已恢复项目规划配置')
      }

      const routeStore = useRouteStore()
      const cableSegmentStore = useCableSegmentStore()
      routeStore.setAlgorithmRouteResult(routeQuery.data)
      const firstRoute = routeQuery.data?.routes[0] ?? null
      if (firstRoute) {
        routeStore.selectRoute(firstRoute.id)
        cableSegmentStore.setCurrentRoute(firstRoute.id)
        cableSegmentStore.setSegments(routeQuery.data?.segmentsByRouteId[firstRoute.id] ?? [])
      } else {
        cableSegmentStore.clearSegments()
      }

      appStore.setCurrentProject(metadata)
      projectFileService.setCurrentProject(metadata)
      projectDataStore.setupDataLinks()
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
      if (systemQuery.error) {
        appStore.addLog('WARN', `查询系统规划结果失败: ${systemQuery.error.message}`)
      } else if (systemQuery.data) {
        appStore.addLog('INFO', '已恢复系统规划结果')
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
    if (settingsStore.platformDeviceLibraries.length === 0) {
      await settingsStore.loadPlatformDeviceLibraries()
    }
    const deviceEntities = connectorStore.elements
      .filter(element => element.type !== 'fiber' && element.type !== 'cable_segment')
      .map((element, index) => connectorElementToDeviceEntity(
        element,
        projectId,
        index + 1,
        settingsStore.platformDeviceLibraries,
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
        
        // 显示校验警告（如果有）
        if (result.warnings && result.warnings.length > 0) {
          appStore.showNotification({
            type: 'warning',
            message: `项目已保存，但数据不完整：${result.warnings[0]}`,
            duration: 5000,
          })
        } else {
          appStore.showNotification({
            type: 'success',
            message: `项目已保存：${currentProjectName.value}`,
          })
        }
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
    const { projectType, projectName, allowOtherUsers, platformProjectId, layers, rplFileData, startStation, endStation, waypoints, planningMode, planConfig, buConfigs, armorMappings } = params
    
    // 检查当前是否有未保存的项目
    if (hasOpenProject.value && isDirty.value) {
      appStore.showNotification({
        type: 'warning',
        message: '请先保存或关闭当前项目',
      })
      return false
    }

    // 关闭当前项目
    if (hasOpenProject.value) {
      closeProject()
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
      const settingsStore = useSettingsStore()
      
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

      // Fix 1: 铠装映射写入 settingsStore
      if (armorMappings && armorMappings.length > 0) {
        routeConfigUpdates.armorMappings = armorMappings.map(m => ({
          riskLevel: m.riskLevel as 'high' | 'medium' | 'low',
          riskThreshold: m.riskThreshold,
          cableTypeId: m.cableTypeId,
          cableTypeName: m.cableTypeName,
          unitPrice: m.unitPrice,
        }))
      }

      // Fix 1b: 冗余策略写入 settingsStore
      // Fix 2: GIS 配置写入 settingsStore（rangeMode + planningRange + gridResolution）
      settingsStore.updateRoutePlanningConfig(routeConfigUpdates)
      
      // 处理器件库文件
      if (params.devices && params.devices.length > 0) {
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
            importSummary = await applyImportResultToStore(fakeResult as any, settingsStore)
          }
        }
        
        settingsStore.setCurrentLibraryFile(deviceFiles.join(', '))
        appStore.addLog('INFO', importSummary || `导入器件库文件: ${deviceFiles.join(', ')}`)
      }

      // 如果是 USE 项目，初始化接线元表格
      if (projectType === 'use') {
        const connectorStore = useConnectorStore()
        // 无论是否有 RPL 文件，都创建空的接线元表格
        if (connectorStore.tables.length === 0) {
          connectorStore.createTable(projectName, 'route-main')
        }
      }
      
      // 如果是 USE 项目并且有 RPL 文件，导入 RPL 数据
      if (projectType === 'use' && rplFileData) {
        const rplStore = useRPLStore()
        const settingsStore = useSettingsStore()
        const routeStore = useRouteStore()
        const connectorStore = useConnectorStore()
        const monitorStore = useMonitorStore()
        
        try {
          const fileContent = await rplFileData.text()
          const tableName = rplFileData.name.replace(/\.(rpl|csv)$/i, '')
          const success = rplStore.importFromCSV(fileContent, tableName, 'route-main')
          
          if (success && rplStore.currentTable) {
            const records = rplStore.currentTable.records
            
            // 1. 从 RPL 数据中提取起点/终点坐标更新到工程设置
            const landingStations = records.filter(r => r.pointType === 'landing')
            if (landingStations.length >= 2) {
              settingsStore.updateRoutePlanningConfig({
                startPoint: { lon: landingStations[0].longitude, lat: landingStations[0].latitude },
                endPoint: { lon: landingStations[landingStations.length - 1].longitude, lat: landingStations[landingStations.length - 1].latitude },
                isConfigured: true,
              })
            } else if (records.length >= 2) {
              settingsStore.updateRoutePlanningConfig({
                startPoint: { lon: records[0].longitude, lat: records[0].latitude },
                endPoint: { lon: records[records.length - 1].longitude, lat: records[records.length - 1].latitude },
                isConfigured: true,
              })
            }
            
            // 2. 同步到 routeStore 以便地图显示
            const totalLength = records.length > 0 ? records[records.length - 1].cumulativeLength : 0
            const displayPoints = records.map(r => ({
              id: r.id,
              coordinates: [r.longitude, r.latitude] as [number, number],
              type: r.pointType as 'landing' | 'branching' | 'repeater' | 'joint' | 'waypoint',
              name: r.pointType === 'waypoint' ? undefined : (r.remarks || undefined),
              depth: r.depth,
            }))
            
            const routeSegments = displayPoints.slice(0, -1).map((point, i) => {
              const currentRecord = records[i]
              const nextRecord = records[i + 1]
              const startKp = Number(currentRecord?.kp ?? currentRecord?.cumulativeLength ?? 0)
              const endKp = Number(nextRecord?.kp ?? nextRecord?.cumulativeLength ?? startKp)
              const segmentDepth = Number.isFinite(nextRecord?.depth)
                ? Number(nextRecord.depth)
                : (Number.isFinite(currentRecord?.depth) ? Number(currentRecord.depth) : 0)

              return {
                id: `seg-${i}`,
                startPointId: point.id,
                endPointId: displayPoints[i + 1].id,
                length: Math.max(0, endKp - startKp),
                depth: segmentDepth,
                cableType: nextRecord?.cableType || currentRecord?.cableType || 'LW',
                riskLevel: 'low' as const,
                cost: 0,
              }
            })
            
            const mainRoute = {
              id: 'route-main',
              name: projectName,
              points: displayPoints,
              segments: routeSegments,
              totalLength,
              totalCost: 0,
              riskScore: 0,
              cost: { cable: 0, installation: 0, equipment: 0, total: 0 },
              risk: { seismic: 0, volcanic: 0, depth: 0, overall: 0 },
              distance: totalLength,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            routeStore.setParetoRoutes([mainRoute as any])
            
            // 3. 同步到 connectorStore 以便系统设计视图显示
            if (connectorStore.tables.length === 0) {
              connectorStore.createTable(projectName, 'route-main')
            } else {
              connectorStore.currentTableId = connectorStore.tables[0].id
            }
            
            if (connectorStore.currentTable) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const newElements: Record<string, any>[] = []
              let deviceIndex = 0
              
              records.forEach((record) => {
                if (record.pointType !== 'waypoint') {
                  const connectorType = mapPointTypeToConnectorType(record.pointType)
                  newElements.push({
                    id: `device-${deviceIndex}`,
                    name: record.remarks || `${getDeviceTypeChinese(connectorType)}-${deviceIndex + 1}`,
                    type: connectorType,
                    longitude: record.longitude,
                    latitude: record.latitude,
                    depth: record.depth,
                    kp: record.kp || record.cumulativeLength,
                    status: 'active',
                    specifications: '',
                    remarks: record.remarks || '',
                  })
                  deviceIndex++
                }
              })
              
              // 生成光纤段
              for (let i = 0; i < newElements.length - 1; i++) {
                const fromElem = newElements[i]
                const toElem = newElements[i + 1]
                newElements.push({
                  id: `fiber-${i}`,
                  name: `光纤段 F${i + 1}`,
                  type: 'fiber',
                  kp: fromElem.kp,
                  endKp: toElem.kp,
                  longitude: 0,
                  latitude: 0,
                  depth: (Number(fromElem.depth) + Number(toElem.depth)) / 2,
                  status: 'active',
                  specifications: '',
                  remarks: `${fromElem.name} → ${toElem.name}`,
                  fromDeviceId: fromElem.id,
                  toDeviceId: toElem.id,
                  length: Math.abs(toElem.kp - fromElem.kp),
                })
              }
              
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              connectorStore.currentTable.elements = newElements as any
            }
            
            // 4. 同步到 monitorStore 以便实时监控视图显示
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newDevices: Record<string, any>[] = []
            let deviceIdx = 0
            
            records.forEach((record) => {
              if (record.pointType !== 'waypoint') {
                const deviceType = mapPointTypeToConnectorType(record.pointType)
                newDevices.push({
                  id: `monitor-${deviceIdx}`,
                  name: record.remarks || `${getDeviceTypeChinese(deviceType)}-${deviceIdx + 1}`,
                  type: deviceType,
                  neType: deviceType,
                  status: 'normal',
                  location: `KP ${(record.kp || record.cumulativeLength).toFixed(1)}`,
                  kp: record.kp || record.cumulativeLength,
                  sldEquipmentName: record.remarks || `${getDeviceTypeChinese(deviceType)}-${deviceIdx + 1}`,
                  longitude: record.longitude,
                  latitude: record.latitude,
                  depth: record.depth,
                  inputPower: 0,
                  outputPower: 0,
                  pumpCurrent: 0,
                  pfeVoltage: 48,
                  pfeCurrent: 0,
                  temperature: 0,
                })
                deviceIdx++
              }
            })
            
            // 设备数据通过 connectorStore 管理，monitorStore.devices 是 computed 属性
            if (connectorStore.currentTable) {
              // 将设备数据转换为 connectorStore 格式
              const connectorElements = newDevices.map((d) => ({
                id: d.id as string,
                name: d.name,
                type: d.type,
                longitude: d.longitude,
                latitude: d.latitude,
                depth: d.depth,
                kp: d.kp,
                status: 'active' as const,
                specifications: '',
                remarks: d.name,
              }))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              connectorStore.currentTable.elements = connectorElements as any
            }
            
            appStore.addLog('INFO', `导入 RPL 文件: ${rplFileData.name}, ${records.length} 条记录, ${newDevices.length} 个设备`)
          }
      } catch {
          appStore.showNotification({
            type: 'warning',
            message: 'RPL 文件导入失败，项目已创建但无路由数据',
          })
        }
      }
      
      // 辅助函数: 映射点位类型到接线元类型
      function mapPointTypeToConnectorType(pointType: string): string {
        const map: Record<string, string> = {
          'landing': 'landing',
          'repeater': 'amplifier_e',
          'branching': 'bu',
          'joint': 'joint',
        }
        return map[pointType] || 'underwater'
      }
      
      // 辅助函数: 获取器件类型中文名称
      function getDeviceTypeChinese(deviceType: string): string {
        const map: Record<string, string> = {
          'landing': '岸上站点',
          'amplifier_e': '放大器',
          'bu': '水下分支器',
          'joint': '接头盒',
          'underwater': '水下站点',
        }
        return map[deviceType] || deviceType
      }

      // 初始化项目数据
      projectDataStore.setupDataLinks()
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
