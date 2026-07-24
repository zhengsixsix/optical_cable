/**
 * 项目文件服务
 * 支持 .use (传输系统规划工程) 格式
 * 
 * USE 文件格式符合 docs/use文件架构.pdf 文档规范
 * 底层为 ZIP 格式，包含 project_data.json
 */

import type JSZip from 'jszip'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { useConnectorStore } from '@/stores/connector'
import { useLayerStore } from '@/stores/layer'
import { useMonitorStore } from '@/stores/monitor'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import { useRPLStore } from '@/stores/rpl'
import { useSLDStore } from '@/stores/sld'
import { useProjectDataStore } from '@/stores/projectData'
import type { ConnectorTable } from '@/types'
import type {
  USEProjectData,
  USEProjectSettings,
  USEAppExtensions,
  EDFASpecs,
  BUSpecs,
} from '@/types/useFile'
import { 
  generateUUID, 
  createDefaultUSEProjectData,
} from '@/types/useFile'
import type { Id, PlanDeviceLibrary } from '@/services/platform/types'
import { deviceLibraryItemToPlatform } from '@/services/platform/deviceLibraryMapping'
import type { AlgorithmRouteBundleResult } from '@/services/RouteDataConverter'

// Store 类型别名
type SettingsStore = ReturnType<typeof useSettingsStore>
type LayerStore = ReturnType<typeof useLayerStore>
type RPLStore = ReturnType<typeof useRPLStore>
type SLDStore = ReturnType<typeof useSLDStore>
type MonitorStore = ReturnType<typeof useMonitorStore>
type ConnectorStore = ReturnType<typeof useConnectorStore>
type RouteStore = ReturnType<typeof useRouteStore>

type JSZipConstructor = typeof JSZip

/**
 * Load JSZip only when a project file operation actually needs it.
 * Vite exposes CommonJS dependencies through `default`, while other
 * runtimes may return the constructor itself from the dynamic import.
 */
async function loadJSZip(): Promise<JSZipConstructor> {
  const module = await import('jszip') as unknown as {
    default?: JSZipConstructor
  }

  return module.default ?? (module as unknown as JSZipConstructor)
}

// 项目类型
export type ProjectType = 'use'

// 项目元数据
export interface ProjectMetadata {
  name: string
  path: string
  type: ProjectType
  uuid: string
  platformProjectId?: Id
  lastModified: string
  creatorId: string
  allowOtherUsers: boolean
}

// 打开项目结果
export interface OpenProjectResult {
  success: boolean
  project?: USEProjectData
  error?: string
  errorType?: 'permission' | 'format' | 'read'
}

class ProjectFileService {
  private currentProject: ProjectMetadata | null = null
  private currentProjectData: USEProjectData | null = null
  private isDirty: boolean = false

  // 获取当前项目
  getCurrentProject(): ProjectMetadata | null {
    return this.currentProject
  }

  // 获取当前项目数据
  getCurrentProjectData(): USEProjectData | null {
    return this.currentProjectData
  }

  // 设置当前项目
  setCurrentProject(project: ProjectMetadata | null): void {
    this.currentProject = project
  }

  // 获取项目修改状态
  getIsDirty(): boolean {
    return this.isDirty
  }

  // 设置项目修改状态
  setIsDirty(dirty: boolean): void {
    this.isDirty = dirty
  }

  // 检查用户是否有权限打开项目
  checkOpenPermission(projectData: USEProjectData): OpenProjectResult {
    const userStore = useUserStore()
    const currentUserId = userStore.currentUser?.id || ''
    
    const creatorId = projectData.metadata.creator_user_id
    if (creatorId && creatorId !== currentUserId) {
      if (!projectData.metadata.allow_other_users) {
        return {
          success: false,
          error: '您没有权限打开此项目，该项目不允许其他用户打开',
          errorType: 'permission'
        }
      }
    }
    
    return { success: true, project: projectData }
  }

  /**
   * 验证项目文件是否包含 RPL 路由数据
   * USE 文件必须包含 route_engineering 模块
   */
  private validateHasRPL(projectData: USEProjectData): { valid: boolean; error?: string } {
    // 检查 route_engineering 模块是否存在
    if (!projectData.route_engineering) {
      return { valid: false, error: '项目文件缺少路由工程数据 (route_engineering)' }
    }
    
    // 检查是否有几何点数据
    const geometryPool = projectData.route_engineering.geometry_pool
    if (!geometryPool || geometryPool.length === 0) {
      return { valid: false, error: '项目文件缺少路由点数据 (geometry_pool)' }
    }
    
    // 检查是否有关键事件（登陆站、放大器等）
    const keyEvents = projectData.route_engineering.key_events
    if (!keyEvents || keyEvents.length < 2) {
      return { valid: false, error: '项目文件缺少关键事件数据，至少需要2个登陆站' }
    }
    
    // 检查是否至少有 2 个登陆站 (KeyEventType = 'LandStation')
    const landingStations = keyEvents.filter(e => e.type === 'LandStation')
    if (landingStations.length < 2) {
      return { valid: false, error: '路由数据至少需要2个登陆站 (LandStation)' }
    }
    
    return { valid: true }
  }

  /**
   * 验证 USE 文件是否包含 SLD 数据
   * USE 文件必须包含 system_engineering 模块和 health_monitoring 模块
   */
  private validateHasSLD(projectData: USEProjectData): { valid: boolean; error?: string } {
    // 检查 system_engineering 模块是否存在
    if (!projectData.system_engineering) {
      return { valid: false, error: 'USE 文件缺少系统工程数据 (system_engineering)' }
    }
    
    // 检查 wdm_config 是否存在
    if (!projectData.system_engineering.wdm_config) {
      return { valid: false, error: 'USE 文件缺少 WDM 配置数据' }
    }
    
    // 检查 health_monitoring 模块是否存在
    if (!projectData.health_monitoring) {
      return { valid: false, error: 'USE 文件缺少健康度监控模块 (health_monitoring)' }
    }
    
    // 检查 device_mapping 和 spans （SLD 核心数据）
    const deviceMapping = projectData.health_monitoring.device_mapping
    const spans = projectData.route_engineering?.spans
    const hasDeviceMapping = deviceMapping && Array.isArray(deviceMapping) && deviceMapping.length > 0
    const hasSpans = spans && Array.isArray(spans) && spans.length > 0
    
    if (!hasDeviceMapping && !hasSpans) {
      return { valid: false, error: 'USE 文件缺少有效的 SLD 配置数据' }
    }
    
    return { valid: true }
  }

  /**
   * 验证项目文件格式
   * @param projectData 项目数据
   * @param fileName 文件名
   */
  private validateProjectFile(projectData: USEProjectData): { valid: boolean; error?: string } {
    // 如果有 _app_extensions，说明是本应用保存的文件，允许部分完成的项目
    if (projectData._app_extensions) {
      // 只要求最基本的结构完整性
      if (!projectData.metadata?.file_format_version) {
        return { valid: false, error: '项目文件缺少版本信息' }
      }
      return { valid: true }
    }
    
    // 非本应用生成的文件，执行严格验证
    // USE 文件必须有 RPL 数据
    const rplResult = this.validateHasRPL(projectData)
    if (!rplResult.valid) {
      return rplResult
    }
    
    // USE 文件还必须有 SLD 数据
    const sldResult = this.validateHasSLD(projectData)
    if (!sldResult.valid) {
      return sldResult
    }
    
    return { valid: true }
  }

  // ==================== 新版 USE 文件格式 (符合文档规范) ====================

  /**
   * 创建新的 USE 项目数据 (符合文档规范的六大模块)
   */
  createUSEProjectData(name: string, allowOtherUsers: boolean = false): USEProjectData {
    const userStore = useUserStore()
    const userId = userStore.currentUser?.id || ''
    
    // 创建默认项目数据
    const projectData = createDefaultUSEProjectData(name, userId)
    projectData.metadata.allow_other_users = allowOtherUsers
    
    // 从各 store 收集数据填充到项目中
    this.collectDataToProject(projectData)
    
    return projectData
  }

  /**
   * 从各 store 收集数据到项目
   */
  private collectDataToProject(projectData: USEProjectData): void {
    const layerStore = useLayerStore()
    const settingsStore = useSettingsStore()
    const rplStore = useRPLStore()
    const sldStore = useSLDStore()
    const monitorStore = useMonitorStore()
    const connectorStore = useConnectorStore()
    const routeStore = useRouteStore()

    // 初始化扩展数据包
    if (!projectData._app_extensions) {
      projectData._app_extensions = {}
    }

    // 0. 收集 project_settings (工程设置) -> 归入 _app_extensions
    projectData._app_extensions.project_settings = this.collectProjectSettings(settingsStore)

    // 规范六大模块由后端或导入文件拥有；前端只更新显式 Store 快照。
    
    // 6.1 保存 RPL 原始数据
    projectData._app_extensions.routePlanning = {
      rplTables: JSON.parse(JSON.stringify(rplStore.tables)),
      routes: JSON.parse(JSON.stringify(routeStore.paretoRoutes || [])),
      algorithmResult: routeStore.algorithmRouteResult
        ? JSON.parse(JSON.stringify(routeStore.algorithmRouteResult))
        : null,
      selectedRouteId: routeStore.currentRouteId,
      planningConfig: settingsStore.routePlanningConfig,
      cableTypeDatabase: JSON.parse(JSON.stringify(settingsStore.cableTypeDatabase || []))
    }

    // 6.2 保存 SLD 原始数据
    projectData._app_extensions.transmissionPlanning = {
      sldTables: JSON.parse(JSON.stringify(sldStore.tables)),
      transmissionConfig: settingsStore.transmissionConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repeaterConfigs: (settingsStore as any).repeaterPlacements || []
    }

    // 6.3 保存接线元数据
    projectData._app_extensions.connectorTables = JSON.parse(JSON.stringify(connectorStore.tables))

    // 6.4 保存监控数据
    projectData._app_extensions.monitorData = {
      devices: JSON.parse(JSON.stringify(monitorStore.devices)),
      alarmHistory: JSON.parse(JSON.stringify(monitorStore.alarmHistory || []))
    }

    // 6.5 保存海缆段数据
    const cableSegmentStore = useCableSegmentStore()
    projectData._app_extensions.cableSegments = cableSegmentStore.exportData()

    // 6.6 保存设计视图缓存（链路摘要 + 平台规划原始结果 + 表单快照）
    projectData._app_extensions.designCache = {
      linkCalcSummary: settingsStore.linkCalcSummaryCache
        ? JSON.parse(JSON.stringify(settingsStore.linkCalcSummaryCache))
        : null,
      platformPlanningResults: settingsStore.platformPlanningResults
        ? JSON.parse(JSON.stringify(settingsStore.platformPlanningResults))
        : null,
      platformPlanConfigSnapshot: settingsStore.platformPlanConfigSnapshot
        ? JSON.parse(JSON.stringify(settingsStore.platformPlanConfigSnapshot))
        : null,
    }

    // 6.7 保存器件库扩展数据（均衡器型号、接头盒型号）
    const deviceExtensions = projectData._app_extensions as USEAppExtensions & {
      deviceLibraries?: PlanDeviceLibrary[]
      deviceEntities?: unknown[]
      deviceConfigs?: unknown[]
    }
    deviceExtensions.deviceLibraries = JSON.parse(JSON.stringify(settingsStore.platformDeviceLibraries))
    deviceExtensions.deviceEntities = JSON.parse(JSON.stringify(settingsStore.platformDeviceEntities))
    deviceExtensions.deviceConfigs = JSON.parse(JSON.stringify(settingsStore.platformDeviceConfigs))

    // 6.8 保存图层设置
    projectData._app_extensions.layerSettings = {
      oceanElevation: layerStore.getLayerVisible('elevation'),
      volcanoDistribution: layerStore.getLayerVisible('volcano'),
      fishingAreaDistribution: layerStore.getLayerVisible('fishing'),
      slopeMap: layerStore.getLayerVisible('slope'),
      earthquakeDistribution: layerStore.getLayerVisible('earthquake'),
      shippingLanes: layerStore.getLayerVisible('shipping')
    }
  }

  /**
   * 收集工程设置模块
   * 包含：规划模式、规划范围、成本参数、仿真模型配置
   */
  private collectProjectSettings(settingsStore: SettingsStore): USEProjectSettings {
    const routeConfig = settingsStore.routePlanningConfig || {}
    const costFactors = settingsStore.costFactors || {}
    const fiberConfig = settingsStore.fiberSimulationConfig || {}
    const transConfig = settingsStore.transmissionConfig || {}

    return {
      route_planning: {
        mode: (routeConfig.mode || 'point-to-point') as 'point-to-point' | 'multi-point',
        start_point: {
          lon: routeConfig.startPoint?.lon || 0,
          lat: routeConfig.startPoint?.lat || 0
        },
        end_point: {
          lon: routeConfig.endPoint?.lon || 0,
          lat: routeConfig.endPoint?.lat || 0
        },
        planning_range: {
          northwest: {
            lon: routeConfig.planningRange?.northwest?.lon || 100,
            lat: routeConfig.planningRange?.northwest?.lat || 50
          },
          southeast: {
            lon: routeConfig.planningRange?.southeast?.lon || 150,
            lat: routeConfig.planningRange?.southeast?.lat || 10
          }
        }
      },
      cost_settings: {
        cable_cost_per_km: costFactors.cableCostPerKm || 35000,
        installation_cost_per_km: costFactors.installationCostPerKm || 15000,
        repeater_cost: costFactors.repeaterCost || 250000,
        branching_unit_cost: costFactors.branchingUnitCost || 180000,
        equalizer_cost: costFactors.equalizerCost || 15000,
        landing_station_cost: costFactors.landingStationCost || 5000000,
        currency: costFactors.currency || 'USD',
        // 路径规划成本参数
        light_cable_cost: costFactors.lightCableCost,
        heavy_cable_cost: costFactors.heavyCableCost,
        max_construction_cost: costFactors.maxConstructionCost,
        depth_threshold: costFactors.depthThreshold,
      },
      simulation_settings: {
        fiber_model: fiberConfig.model,
        edfa_model: settingsStore.simulationModelConfig.edfaModel,
        calculation_models: transConfig.calculationModels ?? []
      }
    }
  }

  /**
   * 导出项目文件 (ZIP 格式)
   * @param name 项目名称
   * @param allowOtherUsers 是否允许其他用户打开
   * @description 统一使用 .use 格式
   */
  async exportProject(name: string, allowOtherUsers: boolean = false): Promise<void> {
    const projectData = this.createUSEProjectData(name, allowOtherUsers)
    
    // 更新时间戳
    projectData.metadata.updated_at = new Date().toISOString()
    
    // 创建 ZIP 文件
    const JSZip = await loadJSZip()
    const zip = new JSZip()
    
    // 添加 project_data.json
    const jsonContent = JSON.stringify(projectData, null, 2)
    zip.file('project_data.json', jsonContent)
    
    // 创建 cache 目录 (可选)
    zip.folder('cache')
    
    // 统一使用 .use 扩展名
    const blob = await zip.generateAsync({ type: 'blob' })
    this.downloadBlob(blob, `${name}.use`)
  }

  /**
   * 导出 USE 文件 (ZIP 格式) - 向后兼容
   */
  async exportUSE(name: string, allowOtherUsers: boolean = false): Promise<void> {
    return this.exportProject(name, allowOtherUsers)
  }

  /**
   * 保存项目 (ZIP 格式)
   * @description 统一使用 .use 格式保存所有模块
   */
  async saveProject(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentProject) {
      return { success: false, error: '当前没有打开的项目，请先新建或打开项目' }
    }

    // 如果 currentProjectData 为空，从 stores 收集数据创建
    if (!this.currentProjectData) {
      this.currentProjectData = this.createUSEProjectData(
        this.currentProject.name,
        this.currentProject.allowOtherUsers
      )
      // 同步项目元数据
      this.currentProjectData.metadata.project_uuid = this.currentProject.uuid
      this.currentProjectData.metadata.creator_user_id = this.currentProject.creatorId
    }
    
    // 更新项目数据
    this.collectDataToProject(this.currentProjectData)
    this.currentProjectData.metadata.updated_at = new Date().toISOString()
    
    // 创建 ZIP
    const JSZip = await loadJSZip()
    const zip = new JSZip()
    zip.file('project_data.json', JSON.stringify(this.currentProjectData, null, 2))
    zip.folder('cache')
    
    // 统一使用 .use 扩展名
    const blob = await zip.generateAsync({ type: 'blob' })
    this.downloadBlob(blob, `${this.currentProject.name}.use`)
    
    // 更新项目类型为 use
    this.currentProject.type = 'use'
    
    this.isDirty = false
    return { success: true }
  }

  /**
   * 导入项目文件 (.use 格式 - ZIP 或 JSON)
   */
  async importProject(file: File): Promise<OpenProjectResult> {
    try {
      // 尝试作为 ZIP 文件读取
      const arrayBuffer = await file.arrayBuffer()
      
      try {
        const JSZip = await loadJSZip()
        const zip = await JSZip.loadAsync(arrayBuffer)
        const projectDataFile = zip.file('project_data.json')
        
        if (projectDataFile) {
          // 新版 ZIP 格式
          const jsonContent = await projectDataFile.async('string')
          const projectData = JSON.parse(jsonContent) as USEProjectData
          
          // 验证文件基本格式
          if (!projectData.metadata?.file_format_version) {
            return {
              success: false,
              error: '无效的项目文件格式',
              errorType: 'format'
            }
          }
          
          // 验证项目数据完整性（USE 需要 RPL + SLD）
          const validationResult = this.validateProjectFile(projectData)
          if (!validationResult.valid) {
            return {
              success: false,
              error: validationResult.error,
              errorType: 'format'
            }
          }
          
          // 检查用户权限
          const permissionResult = this.checkOpenPermission(projectData)
          if (!permissionResult.success) {
            return permissionResult
          }
          
          // 加载项目数据到 stores
          this.prepareStoresForProjectImport()
          this.loadUSEProjectDataToStores(projectData)
          
          // 项目类型统一为 use
          const projectType: ProjectType = 'use'
          
          // 更新当前项目信息
          this.currentProject = {
            name: projectData.metadata.project_name,
            path: file.name,
            type: projectType,
            uuid: projectData.metadata.project_uuid,
            lastModified: projectData.metadata.updated_at,
            creatorId: projectData.metadata.creator_user_id,
            allowOtherUsers: projectData.metadata.allow_other_users,
          }
          this.currentProjectData = projectData
          this.isDirty = false
          
          return { success: true, project: projectData }
        }
      } catch {
        // 不是 ZIP 文件，尝试作为纯 JSON 读取 (向后兼容)
      }
      
      // 尝试作为纯 JSON 读取 (向后兼容旧格式)
      const textContent = new TextDecoder().decode(arrayBuffer)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacyProject = JSON.parse(textContent) as any
      
      // 检查是否是旧版格式
      if (legacyProject.metadata?.file_format_version) {
        // 新版 JSON 格式 (未打包的)
        return this.handleNewFormatProject(legacyProject, file)
      } else if (legacyProject.type === 'use') {
        // 旧版格式
        return this.handleLegacyProject(legacyProject, file)
      }
      
      return {
        success: false,
        error: '无法识别的项目文件格式',
        errorType: 'format'
      }
    } catch (error) {
      return {
        success: false,
        error: '文件解析失败: ' + (error as Error).message,
        errorType: 'format'
      }
    }
  }

  /**
   * 处理新版格式项目
   */
  private handleNewFormatProject(projectData: USEProjectData, file: File): OpenProjectResult {
    // 验证项目数据完整性（USE 需要 RPL + SLD）
    const validationResult = this.validateProjectFile(projectData)
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error,
        errorType: 'format'
      }
    }
    
    const permissionResult = this.checkOpenPermission(projectData)
    if (!permissionResult.success) {
      return permissionResult
    }
    
    this.prepareStoresForProjectImport()
    this.loadUSEProjectDataToStores(projectData)
    
    // 项目类型统一为 use
    const projectType: ProjectType = 'use'
    
    this.currentProject = {
      name: projectData.metadata.project_name,
      path: file.name,
      type: projectType,
      uuid: projectData.metadata.project_uuid,
      lastModified: projectData.metadata.updated_at,
      creatorId: projectData.metadata.creator_user_id,
      allowOtherUsers: projectData.metadata.allow_other_users,
    }
    this.currentProjectData = projectData
    this.isDirty = false
    
    return { success: true, project: projectData }
  }

  /**
   * 处理旧版格式项目 (向后兼容)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleLegacyProject(project: any, file: File): OpenProjectResult {
    // 加载旧版项目数据到 stores
    this.prepareStoresForProjectImport()
    this.loadLegacyProjectToStores(project)
    
    // 项目类型统一为 use
    const projectType: ProjectType = 'use'
    
    this.currentProject = {
      name: project.name || project.projectName,
      path: file.name,
      type: projectType,
      uuid: generateUUID(),
      lastModified: project.updatedAt || new Date().toISOString(),
      creatorId: project.creatorId || project.creatorUserId || '',
      allowOtherUsers: project.allowOtherUsers || false,
    }
    this.currentProjectData = null
    this.isDirty = false
    
    return { success: true }
  }

  private platformLibraryWithUSEId(library: PlanDeviceLibrary, id: unknown): PlanDeviceLibrary {
    return id == null || id === '' ? library : { ...library, id: String(id) }
  }

  /** 仅在文件完成解析、格式校验和权限校验后切换项目级状态。 */
  private prepareStoresForProjectImport(): void {
    useProjectDataStore().clearProjectData()
    useSettingsStore().resetProjectSettings()
  }

  /** 过滤损坏的接线元快照；合法的空 elements 仍是权威快照。 */
  private getValidConnectorSnapshot(value: unknown): ConnectorTable[] {
    if (!Array.isArray(value)) return []

    return value.filter((table): table is ConnectorTable => {
      if (!table || typeof table !== 'object') return false
      const candidate = table as Record<string, unknown>
      return typeof candidate.id === 'string'
        && candidate.id.trim().length > 0
        && typeof candidate.name === 'string'
        && candidate.name.trim().length > 0
        && Array.isArray(candidate.elements)
    })
  }

  private restorePlatformLibrariesFromUSE(projectData: USEProjectData): PlanDeviceLibrary[] {
    const extensions = projectData._app_extensions as USEAppExtensions & {
      deviceLibraries?: PlanDeviceLibrary[]
    } | undefined

    if (Array.isArray(extensions?.deviceLibraries) && extensions.deviceLibraries.length > 0) {
      return JSON.parse(JSON.stringify(extensions.deviceLibraries)) as PlanDeviceLibrary[]
    }

    const libraries: PlanDeviceLibrary[] = []

    for (const fiber of projectData.libraries?.fibers ?? []) {
      libraries.push(this.platformLibraryWithUSEId(deviceLibraryItemToPlatform('fiber', {
        id: fiber.id,
        name: fiber.fiber_type_id,
        nonlinearCoeff: undefined,
        effectiveArea: fiber.attributes.A_eff,
        dispersion: fiber.attributes.dispersion,
        nonlinearRefractiveIndex: fiber.attributes.n2,
        attenuationCoeff: fiber.attributes.attenuation,
        secondOrderDispersion: fiber.attributes.dispersion_slope,
      } as any), fiber.id))
    }

    for (const component of projectData.libraries?.components ?? []) {
      if (component.type === 'EDFA') {
        const specs = component.specs as EDFASpecs
        libraries.push(this.platformLibraryWithUSEId(deviceLibraryItemToPlatform('amplifier', {
          id: component.id,
          name: component.name,
          gain: specs.gain_db,
          bandwidth: specs.bandwidth_nm,
          gainFlatness: specs.gain_flatness_db,
          noiseFigure: specs.noise_figure_db,
          pumpPower: undefined,
          outputPower: specs.max_output_power_dbm,
          saturationPower: undefined,
          gainRangePower: undefined,
          operatingMode: undefined,
          unitPrice: component.commercial_params.unit_price,
          currency: component.commercial_params.currency,
        } as any), component.id))
      }

      if (component.type === 'BU') {
        const specs = component.specs as BUSpecs
        libraries.push(this.platformLibraryWithUSEId(deviceLibraryItemToPlatform('branching', {
          id: component.id,
          name: component.name,
          subType: 'BU',
          portCount: specs.port_count,
          trunkInsertionLoss: specs.loss_vals.thru,
          branchInsertionLoss: specs.loss_vals.branch,
          insertionLoss: undefined,
          wavelengthRange: undefined,
          unitPrice: component.commercial_params.unit_price,
          currency: component.commercial_params.currency,
        } as any), component.id))
      }
    }

    for (const equalizer of extensions?.equalizerTypes ?? []) {
      libraries.push(this.platformLibraryWithUSEId(deviceLibraryItemToPlatform('equalizer', equalizer as any), equalizer.id))
    }

    for (const jointBox of extensions?.jointBoxTypes ?? []) {
      libraries.push(this.platformLibraryWithUSEId(deviceLibraryItemToPlatform('joint', jointBox as any), jointBox.id))
    }

    return libraries
  }

  /**
   * 加载新版 USE 项目数据到 stores
   * 符合文档规范: 完整加载六大模块的所有字段
   */
  private loadUSEProjectDataToStores(projectData: USEProjectData): void {
    const layerStore = useLayerStore()
    const settingsStore = useSettingsStore()
    const rplStore = useRPLStore()
    const sldStore = useSLDStore()
    const monitorStore = useMonitorStore()
    const connectorStore = useConnectorStore()
    const routeStore = useRouteStore()

    // 0. 恢复工程设置 (project_settings) - 从 _app_extensions 读取
    if (projectData._app_extensions?.project_settings) {
      this.restoreProjectSettings(projectData._app_extensions.project_settings, settingsStore)
    }

    // 1. 注册图层 (layer_registry)
    for (const layer of projectData.environment_context.layer_registry) {
      layerStore.setLayerVisible(layer.layer_id, true)
    }

    // 2. 恢复计算模型库 (libraries.models)
    settingsStore.replaceModels(projectData.libraries.models ?? [])

    // 3. 恢复海缆类型
    settingsStore.replaceCableTypes(projectData.libraries.cable_types.map(c => ({
      id: c.id,
      name: c.name,
      armorType: c.type,
      costPerKm: c.commercial_params.price_per_km,
      maxDepth: 8000,
      fiberCount: 8,
    })))

    const restoredDeviceLibraries = this.restorePlatformLibrariesFromUSE(projectData)
    settingsStore.replacePlatformDeviceLibraries(restoredDeviceLibraries)

    const deviceExtensions = projectData._app_extensions as USEAppExtensions & {
      deviceEntities?: typeof settingsStore.platformDeviceEntities
      deviceConfigs?: typeof settingsStore.platformDeviceConfigs
    } | undefined
    if (Array.isArray(deviceExtensions?.deviceEntities)) {
      settingsStore.replacePlatformDeviceEntities(JSON.parse(JSON.stringify(deviceExtensions.deviceEntities)))
    }
    if (Array.isArray(deviceExtensions?.deviceConfigs)) {
      settingsStore.replacePlatformDeviceConfigs(JSON.parse(JSON.stringify(deviceExtensions.deviceConfigs)))
    } else {
      settingsStore.clearPlatformDeviceConfigs()
    }

    // 8. 恢复传输配置 (wdm_config)
    if (projectData.system_engineering.wdm_config) {
      const wdm = projectData.system_engineering.wdm_config
      settingsStore.setTransmissionConfig({
        channelCount: wdm.channel_count,
        centerWavelength: 1550,
        channelBandwidth: wdm.channel_spacing_ghz,
        calculationModels: projectData._app_extensions?.project_settings?.simulation_settings.calculation_models ?? [],
      })
      // 存储完整 WDM 配置到扩展字段
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(settingsStore as any).wdmExtendedConfig = {
        centerFreqThz: wdm.center_freq_thz,
        baudRate: wdm.baud_rate_gbaud,
        launchPowerVector: wdm.launch_power_vector,
        initialAseVector: wdm.initial_ase_vector,
        initialNliVector: wdm.initial_nli_vector,
        modulation: wdm.modulation,
        shapingMoments: wdm.shaping_moments,
      }
    }

    // 9. 恢复仿真缓存 (simulation_cache)
    if (projectData.system_engineering.simulation_cache) {
      settingsStore.updateSimulationCache(projectData.system_engineering.simulation_cache)
    }

    // 10. 恢复系统规划缓存 (system_planning_cache)
    if (projectData.system_engineering.system_planning_cache) {
      settingsStore.updateSystemPlanningCache(projectData.system_engineering.system_planning_cache)
    }

    // 11. 恢复监控配置 (health_monitoring)
    if (projectData.health_monitoring.collector_config) {
      settingsStore.setMonitoringConfig({
        dataSourceType: 'realtime',
        connectionAddress: projectData.health_monitoring.collector_config.connection_params.base_url,
        authToken: '',
        pollingInterval: projectData.health_monitoring.collector_config.polling_interval || 30,
        requestTimeout: 10,
        protocol: 'JSON',
        authMethod: 'apikey',
        powerThreshold: -25,
        temperatureThreshold: 45,
        berThreshold: '1e-6',
        fieldMappings: [],
      })
      // 存储扩展监控配置
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(settingsStore as any).monitoringExtendedConfig = {
        gatewayName: projectData.health_monitoring.collector_config.gateway_name,
        pollingInterval: projectData.health_monitoring.collector_config.polling_interval,
      }
    }

    // 12. 恢复设备映射和视图设置 - 存储到扩展字段
    if (projectData.health_monitoring.device_mapping) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(monitorStore as any).deviceMappingData = projectData.health_monitoring.device_mapping
    }
    if (projectData.health_monitoring.view_settings) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(monitorStore as any).viewSettingsData = projectData.health_monitoring.view_settings
    }

    // 13. 从项目数据中提取起点/终点坐标并更新路径规划配置
    this.extractRoutePlanningConfig(projectData, settingsStore)

    // ===== 14. 从扩展字段恢复原始 Store 数据 (优先级最高) =====
    this.restoreExtensionData(projectData, rplStore, sldStore, connectorStore, monitorStore, routeStore, layerStore)
  }

  /**
   * 从扩展字段恢复原始 Store 数据
   * 这些数据比从 route_engineering 重建的数据更完整
   */
  private restoreExtensionData(
    projectData: USEProjectData,
    rplStore: RPLStore,
    sldStore: SLDStore,
    connectorStore: ConnectorStore,
    monitorStore: MonitorStore,
    routeStore: RouteStore,
    layerStore: LayerStore
  ): void {
    const ext = projectData._app_extensions
    if (!ext) return

    // 14.1 恢复 RPL 原始数据
    if (Array.isArray(ext.routePlanning?.rplTables)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rplStore.replaceTables(ext.routePlanning.rplTables as any)
      rplStore.setCurrentTableId(rplStore.tables[0]?.id ?? null)
    }

    // 14.2 恢复完整算法结果；旧项目仍从 routes 快照兼容恢复。
    const savedAlgorithmResult = ext.routePlanning?.algorithmResult
    if (savedAlgorithmResult
      && typeof savedAlgorithmResult === 'object'
      && Array.isArray((savedAlgorithmResult as { routes?: unknown }).routes)) {
      routeStore.setAlgorithmRouteResult(
        JSON.parse(JSON.stringify(savedAlgorithmResult)) as AlgorithmRouteBundleResult,
      )
    } else if (Array.isArray(ext.routePlanning?.routes)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routeStore.setParetoRoutes(ext.routePlanning!.routes as any)
    }
    const selectedRouteId = ext.routePlanning?.selectedRouteId
    if (selectedRouteId && routeStore.paretoRoutes.some(route => route.id === selectedRouteId)) {
      routeStore.selectRoute(selectedRouteId)
    }
    
    // 14.2.1 恢复缆型数据库
    if (Array.isArray(ext.routePlanning?.cableTypeDatabase)) {
      const settingsStore = useSettingsStore()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settingsStore.cableTypeDatabase.splice(0, settingsStore.cableTypeDatabase.length, ...(ext.routePlanning.cableTypeDatabase as any))
    }
    
    // 14.2.2 恢复完整的路径规划配置
    if (ext.routePlanning?.planningConfig) {
      const settingsStore = useSettingsStore()
      settingsStore.updateRoutePlanningConfig(ext.routePlanning.planningConfig)
    }

    // 14.3 恢复 SLD 原始数据
    if (Array.isArray(ext.transmissionPlanning?.sldTables)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sldStore.replaceTables(ext.transmissionPlanning.sldTables as any)
      sldStore.setCurrentTableId(sldStore.tables[0]?.id ?? null)
    }

    // 14.4 恢复接线元数据
    if (Array.isArray(ext.connectorTables)) {
      const connectorSnapshot = this.getValidConnectorSnapshot(ext.connectorTables)
      connectorStore.replaceTables(connectorSnapshot)
      connectorStore.setCurrentTableId(connectorSnapshot[0]?.id ?? null)
    }

    // 14.5 设备身份来自 Connector 快照；运行时遥测与告警按显式监控快照恢复。
    if (ext.monitorData) {
      monitorStore.replaceRuntimeData(ext.monitorData.devices || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monitorStore.replaceAlarmHistory((ext.monitorData.alarmHistory || []) as any)
    }

    // 14.5.5 恢复海缆段数据 (如果 _app_extensions 中有更完整的版本)
    if (ext.cableSegments) {
      const cableSegmentStore = useCableSegmentStore()
      cableSegmentStore.importData(ext.cableSegments)
    }

    // 14.6 恢复设计视图缓存
    if (ext.designCache?.linkCalcSummary) {
      const settingsStore = useSettingsStore()
      settingsStore.updateLinkCalcSummaryCache(ext.designCache.linkCalcSummary)
    }
    if (ext.designCache && 'platformPlanningResults' in ext.designCache) {
      const settingsStore = useSettingsStore()
      settingsStore.updatePlatformPlanningResults(ext.designCache.platformPlanningResults ?? null)
    }
    if (ext.designCache && 'platformPlanConfigSnapshot' in ext.designCache) {
      const settingsStore = useSettingsStore()
      settingsStore.updatePlatformPlanConfigSnapshot(ext.designCache.platformPlanConfigSnapshot ?? null)
    }

    // 14.7 恢复均衡器型号和接头盒型号
    if (Array.isArray(ext.equalizerTypes) && ext.equalizerTypes.length > 0) {
      void ext.equalizerTypes
    }
    if (Array.isArray(ext.jointBoxTypes) && ext.jointBoxTypes.length > 0) {
      void ext.jointBoxTypes
    }

    // 14.8 恢复图层设置
    if (ext.layerSettings) {
      const ls = ext.layerSettings
      layerStore.setLayerVisible('elevation', ls.oceanElevation ?? false)
      layerStore.setLayerVisible('volcano', ls.volcanoDistribution ?? false)
      layerStore.setLayerVisible('fishing', ls.fishingAreaDistribution ?? false)
      layerStore.setLayerVisible('slope', ls.slopeMap ?? false)
      layerStore.setLayerVisible('earthquake', ls.earthquakeDistribution ?? false)
      layerStore.setLayerVisible('shipping', ls.shippingLanes ?? false)
    }
  }

  /**
   * 从项目数据中提取起点/终点坐标并更新路径规划配置
   * 包括从 environment_context 和 route_engineering 恢复甲方规范的新字段
   */
  private extractRoutePlanningConfig(projectData: USEProjectData, settingsStore: SettingsStore): void {
    const envContext = projectData.environment_context
    const routeEng = projectData.route_engineering
    const keyEvents = routeEng?.key_events || []
    const geometryPool = routeEng?.geometry_pool || []
    
    // === 1. 从 environment_context 恢复新字段 ===
    
    // 1.1 恢复 planning_mode
    if (envContext?.planning_mode) {
      const mode = envContext.planning_mode === 'MULTI_NODE_NETWORK' ? 'multi-point' : 'point-to-point'
      settingsStore.updateRoutePlanningConfig({ mode })
    }
    
    // 1.2 恢复 redundancy_config
    if (envContext?.redundancy_config) {
      const rc = envContext.redundancy_config
      const redundancyConfig = {
        enabled: rc.enabled || false,
        costLimitType: rc.cost_constraint_mode === 'ABSOLUTE' ? 'absolute' : 'relative',
        absoluteCostLimit: rc.absolute_cost_limit?.value,
        relativeCostPercent: rc.premium_ratio ? (rc.premium_ratio.ratio || 0.3) * 100 : undefined
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settingsStore.updateRoutePlanningConfig({ redundancyConfig } as any)
    }
    
    // 1.3 恢复 imported_bu_nodes
    if (envContext?.imported_bu_nodes && envContext.imported_bu_nodes.length > 0) {
      const buList = envContext.imported_bu_nodes.map((bu) => ({
        id: bu.id,
        name: bu.name,
        lon: bu.coords?.[0] || 0,
        lat: bu.coords?.[1] || 0,
        portLimit: bu.max_ports || 3
      }))
      settingsStore.updateRoutePlanningConfig({ buList })
    }
    
    // 1.4 恢复 route_planning_settings (cable_armor_mapping, algorithm_config)
    if (envContext?.route_planning_settings) {
      const rps = envContext.route_planning_settings
      
      // 1.4.1 铠装映射规则
      if (rps.cable_armor_mapping) {
        const cam = rps.cable_armor_mapping
        const armorMappings = []
        if (cam.high_risk) {
          armorMappings.push({
            riskLevel: 'high',
            riskThreshold: cam.high_risk.threshold,
            cableTypeId: cam.high_risk.cable_type_ref
          })
        }
        if (cam.medium_risk) {
          armorMappings.push({
            riskLevel: 'medium',
            riskThreshold: cam.medium_risk.threshold,
            cableTypeId: cam.medium_risk.cable_type_ref
          })
        }
        if (cam.low_risk) {
          armorMappings.push({
            riskLevel: 'low',
            riskThreshold: cam.low_risk.threshold,
            cableTypeId: cam.low_risk.cable_type_ref
          })
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        settingsStore.updateRoutePlanningConfig({ armorMappings } as any)
      }
      
      // 1.4.2 算法配置 (规划范围)
      if (rps.algorithm_config?.planning_bounds) {
        const pb = rps.algorithm_config.planning_bounds
        if (pb.mode === 'MANUAL' && pb.manual_bounds) {
          settingsStore.updateRoutePlanningConfig({
            planningRange: {
              northwest: { lon: pb.manual_bounds.northwest[0], lat: pb.manual_bounds.northwest[1] },
              southeast: { lon: pb.manual_bounds.southeast[0], lat: pb.manual_bounds.southeast[1] }
            }
          })
        }
      }
    }
    
    // === 2. 从 route_engineering 恢复新字段 ===
    
    // 2.1 恢复 route_status
    if (routeEng?.route_status) {
      // route_status 信息可以存储到 settingsStore 扩展字段
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(settingsStore as any).routeStatus = {
        isSegmented: routeEng.route_status.is_segmented,
        isAdjusted: routeEng.route_status.is_adjusted,
        lastModified: routeEng.route_status.last_modified
      }
    }
    
    // 2.2 恢复 segmentation_config
    if (routeEng?.segmentation_config) {
      const sc = routeEng.segmentation_config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(settingsStore as any).segmentationConfig = {
        method: sc.method,
        fixedLengthKm: sc.fixed_length_km,
        riskBased: sc.risk_based ? {
          minLengthKm: sc.risk_based.min_length_km,
          maxLengthKm: sc.risk_based.max_length_km
        } : undefined
      }
    }
    
    // === 3. 原有逻辑：从 geometry_pool 和 key_events 提取起点/终点坐标 ===
    
    if (keyEvents.length === 0 || geometryPool.length === 0) {
      return
    }

    // 找出所有登陆站点（LandStation）
    const landStations = keyEvents.filter(event => event.type === 'LandStation')
    
    if (landStations.length < 2) {
      // 如果只有一个登陆站或没有，使用 geometry_pool 的首尾点
      if (geometryPool.length >= 2) {
        const firstPoint = geometryPool[0]
        const lastPoint = geometryPool[geometryPool.length - 1]
        
        settingsStore.updateRoutePlanningConfig({
          startPoint: { lon: firstPoint[0], lat: firstPoint[1] },
          endPoint: { lon: lastPoint[0], lat: lastPoint[1] },
          isConfigured: true,
        })
      }
      return
    }

    // 按 geo_index 排序，找到第一个和最后一个登陆站
    const sortedLandStations = [...landStations].sort((a, b) => a.geo_index - b.geo_index)
    const startStation = sortedLandStations[0]
    const endStation = sortedLandStations[sortedLandStations.length - 1]
    
    // 从 geometry_pool 获取坐标
    const startCoords = geometryPool[startStation.geo_index]
    const endCoords = geometryPool[endStation.geo_index]
    
    if (startCoords && endCoords) {
      settingsStore.updateRoutePlanningConfig({
        startPoint: { lon: startCoords[0], lat: startCoords[1] },
        endPoint: { lon: endCoords[0], lat: endCoords[1] },
        isConfigured: true,
      })
    }
  }

  /**
   * 恢复工程设置配置
   */
  private restoreProjectSettings(settings: USEProjectSettings, settingsStore: SettingsStore): void {
    // 1. 恢复路径规划配置
    if (settings.route_planning) {
      const rp = settings.route_planning
      settingsStore.updateRoutePlanningConfig({
        mode: rp.mode,
        startPoint: { lon: rp.start_point.lon, lat: rp.start_point.lat },
        endPoint: { lon: rp.end_point.lon, lat: rp.end_point.lat },
        planningRange: {
          northwest: { lon: rp.planning_range.northwest.lon, lat: rp.planning_range.northwest.lat },
          southeast: { lon: rp.planning_range.southeast.lon, lat: rp.planning_range.southeast.lat }
        },
        isConfigured: rp.start_point.lon !== 0 || rp.start_point.lat !== 0,
      })
    }

    // 2. 恢复成本参数
    if (settings.cost_settings) {
      const cs = settings.cost_settings
      settingsStore.updateCostFactors({
        cableCostPerKm: cs.cable_cost_per_km,
        installationCostPerKm: cs.installation_cost_per_km,
        repeaterCost: cs.repeater_cost,
        branchingUnitCost: cs.branching_unit_cost,
        equalizerCost: cs.equalizer_cost,
        landingStationCost: cs.landing_station_cost,
        currency: cs.currency,
        // 路径规划成本参数
        lightCableCost: cs.light_cable_cost,
        heavyCableCost: cs.heavy_cable_cost,
        maxConstructionCost: cs.max_construction_cost,
        depthThreshold: cs.depth_threshold,
      })
    }

    // 3. 恢复仿真模型配置
    if (settings.simulation_settings) {
      const ss = settings.simulation_settings
      settingsStore.updateFiberSimulationConfig({
        model: ss.fiber_model,
      })
      settingsStore.updateTransmissionConfig({
        calculationModels: ss.calculation_models,
      })
    }
  }

  /**
   * 加载旧版项目数据到 stores (向后兼容)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loadLegacyProjectToStores(project: any): void {
    const routeStore = useRouteStore()
    const rplStore = useRPLStore()
    const settingsStore = useSettingsStore()
    const connectorStore = useConnectorStore()
    const monitorStore = useMonitorStore()
    const sldStore = useSLDStore()
    const layerStore = useLayerStore()
    
    // 恢复路由数据
    if (project.routePlanning?.routes && project.routePlanning.routes.length > 0) {
      // 同时设置 paretoRoutes 以便 ParetoPanel 显示
      routeStore.setParetoRoutes(project.routePlanning.routes)
    }
    
    // 恢复 RPL 数据
    if (project.routePlanning?.rplTables) {
      rplStore.replaceTables(project.routePlanning.rplTables)
      if (rplStore.tables.length > 0) {
        rplStore.setCurrentTableId(rplStore.tables[0].id)
      }
    }
    
    // 恢复 SLD 数据
    if (project.transmissionPlanning?.sldTables) {
      sldStore.replaceTables(project.transmissionPlanning.sldTables)
      if (sldStore.tables.length > 0) {
        sldStore.setCurrentTableId(sldStore.tables[0].id)
      }
    }
    
    // 恢复显式 Connector 快照。
    const connectorSnapshot = this.getValidConnectorSnapshot(project.connectorTables)
    if (connectorSnapshot.length > 0) {
      connectorStore.replaceTables(connectorSnapshot)
      connectorStore.setCurrentTableId(connectorSnapshot[0].id)
    }
    
    // 设备身份来自 Connector 快照；运行时遥测与告警按显式监控快照恢复。
    if (project.monitorData) {
      monitorStore.replaceRuntimeData(project.monitorData.devices || [])
      monitorStore.replaceAlarmHistory(project.monitorData.alarmHistory || [])
    }
    
    // 恢复图层设置
    if (project.layerSettings) {
      const ls = project.layerSettings
      layerStore.setLayerVisible('elevation', ls.oceanElevation ?? false)
      layerStore.setLayerVisible('volcano', ls.volcanoDistribution ?? false)
      layerStore.setLayerVisible('fishing', ls.fishingAreaDistribution ?? false)
      layerStore.setLayerVisible('slope', ls.slopeMap ?? false)
      layerStore.setLayerVisible('earthquake', ls.earthquakeDistribution ?? false)
      layerStore.setLayerVisible('shipping', ls.shippingLanes ?? false)
    }
    
    // 恢复设置
    if (project.settings?.cableTypes) {
      settingsStore.replaceCableTypes(project.settings.cableTypes)
    }
  }

  /**
   * 关闭当前项目
   */
  closeProject(): void {
    // 重置项目配置为默认值
    const settingsStore = useSettingsStore()
    settingsStore.resetProjectSettings()
    
    this.currentProject = null
    this.currentProjectData = null
    this.isDirty = false
  }

  /**
   * 下载 Blob 文件
   */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * 打开文件选择器
   */
  openFileDialog(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0] || null
        resolve(file)
      }
      
      input.click()
    })
  }

  /**
   * 快捷方法：打开项目文件
   */
  async openProjectFile(): Promise<OpenProjectResult> {
    const file = await this.openFileDialog('.use')
    if (!file) {
      return { success: false, error: '未选择文件' }
    }
    return this.importProject(file)
  }
}

// 单例导出
export const projectFileService = new ProjectFileService()
