/**
 * 项目文件服务
 * 支持 .use (传输系统规划工程) 格式
 * 
 * USE 文件格式符合 docs/use文件架构.pdf 文档规范
 * 底层为 ZIP 格式，包含 project_data.json
 */

import JSZip from 'jszip'
import { useRouteStore, useRPLStore, useSLDStore, useSettingsStore, useUserStore, useConnectorStore, useMonitorStore, useLayerStore, useCableSegmentStore } from '@/stores'
import { validateForExport } from './PhaseValidationService'
import type {
  USEProjectData,
  USEEnvironmentContext,
  USELibraries,
  USERouteEngineering,
  USESystemEngineering,
  USEHealthMonitoring,
  USEProjectSettings,
  USEAppExtensions,
  LayerRegistryItem,
  ImportedLandingPoint,
  ImportedBUNode,
  FiberSpec,
  CableTypeSpec,
  ComponentSpec,
  EDFASpecs,
  BUSpecs,
  GeometryPoint,
  KeyEvent,
  RouteSegment,
  Span,
  KeyEventType,
  LayerContentType,
  DeviceMapping,
  ModelDefinition,
  SystemPlanningCache,
  SimulationCache,
  RedundancyConfig as USERedundancyConfig,
} from '@/types/useFile'
import { 
  generateUUID, 
  createDefaultUSEProjectData,
  createDefaultModels,
  createDefaultFiberSpec,
  createDefaultEDFASpec,
  createDefaultBUSpec,
  createDefaultWDMConfig,
} from '@/types/useFile'

// Store 类型别名
type SettingsStore = ReturnType<typeof useSettingsStore>
type LayerStore = ReturnType<typeof useLayerStore>
type RPLStore = ReturnType<typeof useRPLStore>
type SLDStore = ReturnType<typeof useSLDStore>
type MonitorStore = ReturnType<typeof useMonitorStore>
type ConnectorStore = ReturnType<typeof useConnectorStore>
type RouteStore = ReturnType<typeof useRouteStore>

// 项目类型
export type ProjectType = 'use'

// 项目元数据
export interface ProjectMetadata {
  name: string
  path: string
  type: ProjectType
  uuid: string
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
  private validateProjectFile(projectData: USEProjectData, fileName: string): { valid: boolean; error?: string } {
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

    // 1. 收集 environment_context
    projectData.environment_context = this.collectEnvironmentContext(layerStore, rplStore)

    // 2. 收集 libraries
    projectData.libraries = this.collectLibraries(settingsStore)

    // 3. 收集 route_engineering
    projectData.route_engineering = this.collectRouteEngineering(rplStore)

    // 4. 收集 system_engineering
    projectData.system_engineering = this.collectSystemEngineering(settingsStore, sldStore)

    // 5. 收集 health_monitoring
    projectData.health_monitoring = this.collectHealthMonitoring(settingsStore, monitorStore)

    // ===== 6. 收集扩展字段 -> 统一归入 _app_extensions =====
    
    // 6.1 保存 RPL 原始数据
    projectData._app_extensions.routePlanning = {
      rplTables: JSON.parse(JSON.stringify(rplStore.tables)),
      routes: JSON.parse(JSON.stringify(routeStore.paretoRoutes || [])),
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
    if (cableSegmentStore.segments.length > 0) {
      projectData._app_extensions.cableSegments = cableSegmentStore.exportData()
    }

    // 6.6 保存设计视图缓存（链路成本 + 性能指标）
    if (settingsStore.linkCalcSummaryCache) {
      projectData._app_extensions.designCache = {
        linkCalcSummary: JSON.parse(JSON.stringify(settingsStore.linkCalcSummaryCache))
      }
    }

    // 6.7 保存图层设置
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
        landing_station_cost: costFactors.landingStationCost || 5000000,
        currency: costFactors.currency || 'USD',
        // 路径规划成本参数
        light_cable_cost: costFactors.lightCableCost,
        heavy_cable_cost: costFactors.heavyCableCost,
        max_construction_cost: costFactors.maxConstructionCost,
        depth_threshold: costFactors.depthThreshold,
      },
      simulation_settings: {
        fiber_model: (fiberConfig.model || 'GN') as 'GN' | 'EGN',
        edfa_model: 'EDFA_Simple',
        calculation_models: transConfig.calculationModels || ['power', 'ase', 'nli']
      }
    }
  }

  /**
   * 收集环境上下文模块
   * 符合 PDF 规范: layer_registry 必须包含 integrity
   */
  private collectEnvironmentContext(layerStore: LayerStore, rplStore: RPLStore): USEEnvironmentContext {
    // 图层内容类型映射
    const layerContentTypeMap: Record<string, LayerContentType> = {
      'elevation': 'BATHYMETRY',
      'volcano': 'VOLCANO',
      'earthquake': 'EARTHQUAKE',
      'fishing': 'FISHING',
      'shipping': 'SHIPPING',
      'slope': 'BATHYMETRY',
    }

    // 图层文件格式映射
    const layerFileFormatMap: Record<string, string> = {
      'elevation': 'GeoTIFF',
      'volcano': 'GeoJSON',
      'earthquake': 'GeoJSON',
      'fishing': 'Shapefile',
      'shipping': 'Shapefile',
      'slope': 'GeoTIFF',
    }

    // 图层注册表 - 必须包含 integrity
    const layer_registry: LayerRegistryItem[] = layerStore.layers.map((layer) => {
      const fileFormat = layerFileFormatMap[layer.id] || 'GeoTIFF'
      const ext = fileFormat === 'GeoTIFF' ? '.tif' : fileFormat === 'Shapefile' ? '.shp' : '.geojson'
      return {
        layer_id: layer.id,
        name: layer.name,
        file_format: fileFormat,
        relative_path: `assets/${layer.id}${ext}`,
        content_type: layerContentTypeMap[layer.id] || 'BATHYMETRY',
        integrity: {
          checksum: `sha256:${this.generateMockChecksum()}`,
          size_bytes: 0
        }
      }
    })

    // 从 RPL 提取登陆站点
    const imported_landing_points: ImportedLandingPoint[] = []
    for (const table of rplStore.tables) {
      for (const record of table.records || []) {
        if (record.pointType === 'landing') {
          imported_landing_points.push({
            id: record.id,
            name: record.remarks || `Landing-${record.id}`,
            coords: [record.longitude, record.latitude],
            properties: { country: '', owner: '' }
          })
        }
      }
    }

    // 从 settingsStore 获取配置
    const settingsStore = useSettingsStore()
    const routeConfig = settingsStore.routePlanningConfig

    // 规划模式转换 - 甲方规范要求大写
    const planning_mode: 'POINT_TO_POINT' | 'MULTI_NODE_NETWORK' = 
      routeConfig.mode === 'multi-point' ? 'MULTI_NODE_NETWORK' : 'POINT_TO_POINT'

    // 冗余配置
    const redundancyConfig = routeConfig.redundancyConfig
    const redundancy_config: USERedundancyConfig = {
      enabled: redundancyConfig?.enabled || false
    }
    if (redundancyConfig?.enabled) {
      if (redundancyConfig.costLimitType === 'absolute') {
        redundancy_config.cost_constraint_mode = 'ABSOLUTE'
        redundancy_config.absolute_cost_limit = {
          value: redundancyConfig.absoluteCostLimit || 0,
          unit: '万元'
        }
      } else {
        redundancy_config.cost_constraint_mode = 'PREMIUM_RATIO'
        redundancy_config.premium_ratio = {
          ratio: (redundancyConfig.relativeCostPercent || 30) / 100
        }
      }
    }

    // BU 节点列表 - 甲方规范
    const imported_bu_nodes: ImportedBUNode[] = (routeConfig.buList || []).map((bu) => ({
      id: bu.id,
      name: bu.name,
      coords: [bu.lon, bu.lat] as [number, number],
      max_ports: bu.portLimit || 3
    }))

    // 铠装映射规则 - 甲方规范
    const armorMappings = routeConfig.armorMappings || []
    const highRisk = armorMappings.find((m) => m.riskLevel === 'high')
    const mediumRisk = armorMappings.find((m) => m.riskLevel === 'medium')
    const lowRisk = armorMappings.find((m) => m.riskLevel === 'low')

    const cable_armor_mapping = {
      high_risk: {
        threshold: highRisk?.riskThreshold || 3.0,
        cable_type_ref: highRisk?.cableTypeId || 'struct_da_01'
      },
      medium_risk: {
        threshold: mediumRisk?.riskThreshold || 2.0,
        cable_type_ref: mediumRisk?.cableTypeId || 'struct_sa_01'
      },
      low_risk: {
        threshold: lowRisk?.riskThreshold || 0,
        cable_type_ref: lowRisk?.cableTypeId || 'struct_lw_01'
      }
    }

    // 算法配置 - 甲方规范
    const planningRange = routeConfig.planningRange
    const hasManualBounds = planningRange.northwest?.lon !== 0 || planningRange.northwest?.lat !== 0
    const algorithm_config = {
      planning_bounds: {
        mode: hasManualBounds ? 'MANUAL' as const : 'AUTO' as const,
        manual_bounds: hasManualBounds ? {
          northwest: [planningRange.northwest?.lon || 0, planningRange.northwest?.lat || 0] as [number, number],
          southeast: [planningRange.southeast?.lon || 0, planningRange.southeast?.lat || 0] as [number, number]
        } : undefined
      },
      grid_resolution_m: 500
    }

    return {
      layer_registry,
      planning_mode,
      redundancy_config,
      imported_landing_points,
      imported_bu_nodes,
      route_planning_settings: {
        cable_armor_mapping,
        algorithm_config
      }
    }
  }

  /**
   * 生成模拟的 checksum (实际应用中应计算文件哈希)
   */
  private generateMockChecksum(): string {
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
      .replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))
  }

  /**
   * 收集器件库模块
   * 符合文档规范: fibers/components 包含 supported_models 和 model_params
   */
  private collectLibraries(settingsStore: SettingsStore): USELibraries {
    // 计算模型库 - 从 store 获取或使用默认值
    const models: ModelDefinition[] = settingsStore.models || createDefaultModels()

    // 光纤规格 - 包含 supported_models 和 model_params
    const fibers: FiberSpec[] = (settingsStore.fiberTypes || []).map((f: any) => ({
      id: f.id,
      fiber_type_id: f.name || 'G.654.E',
      attributes: {
        attenuation: f.attenuation || f.attenuationCoeff || 0.16,
        dispersion: f.dispersion || 2.1e-5,
        dispersion_slope: f.dispersionSlope || f.secondOrderDispersion || 60.0,
        A_eff: f.effectiveArea || f.A_eff || 80,
        n2: f.n2 || f.nonlinearRefractiveIndex || 2.6,
      },
      supported_models: f.supported_models || ['fiber_gn_model', 'fiber_linear_loss'],
      model_params: f.model_params || {
        fiber_gn_model: {
          is_configured: true,
          params: { coherence_factor: 1.0, noise_bandwidth_ghz: 12.5 }
        },
        fiber_linear_loss: {
          is_configured: true,
          params: {}
        }
      }
    }))

    // 海缆类型
    const cable_types: CableTypeSpec[] = (settingsStore.cableTypes || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type || 'LW',
      commercial_params: {
        price_per_km: c.pricePerKm || c.costPerKm || 35000,
        currency: 'USD'
      }
    }))

    // 器件规格 (放大器 + 分支器) - 包含 supported_models 和 model_params
    const components: ComponentSpec[] = []
    
    // 放大器
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const amp of (settingsStore.amplifierTypes || []) as any[]) {
      components.push({
        id: amp.id,
        name: amp.name,
        type: 'EDFA',
        specs: {
          gain_db: amp.gain || 20,
          bandwidth_nm: amp.bandwidth || 35,
          noise_figure_db: amp.noiseFigure || 5,
          max_output_power_dbm: amp.maxOutputPower || 20,
          gain_flatness_db: amp.gainFlatness || 0.5,
        },
        supported_models: amp.supported_models || ['edfa_gain_model'],
        model_params: amp.model_params || {
          edfa_gain_model: {
            is_configured: true,
            params: { gain_tilt_db_per_nm: 0.01 }
          }
        },
        commercial_params: {
          unit_price: amp.price || 250000,
          currency: 'USD'
        }
      })
    }

    // 分支器
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const bu of (settingsStore.branchingUnitTypes || []) as any[]) {
      components.push({
        id: bu.id,
        name: bu.name,
        type: 'BU',
        specs: {
          port_count: bu.portCount || 3,
          matrix: bu.matrix || [[0, 1, 1], [1, 0, 1], [1, 1, 0]],
          thru_pair: bu.thruPair || [1, 2],
          loss_vals: {
            thru: bu.thruLoss || 0.8,
            branch: bu.branchLoss || 3.5,
          }
        },
        supported_models: bu.supported_models || ['bu_loss_model'],
        model_params: bu.model_params || {
          bu_loss_model: {
            is_configured: true,
            params: {}
          }
        },
        commercial_params: {
          unit_price: bu.price || 180000,
          currency: 'USD'
        }
      })
    }

    return { fibers, cable_types, components, models }
  }

  /**
   * 收集路由工程模块
   * 符合甲方规范: 包含 route_status, segmentation_config, geometry_pool, key_events, segments, spans
   */
  private collectRouteEngineering(rplStore: RPLStore): USERouteEngineering {
    const settingsStore = useSettingsStore()
    const now = new Date().toISOString()
    const geometry_pool: GeometryPoint[] = []
    const key_events: KeyEvent[] = []
    const segments: RouteSegment[] = []
    const spans: Span[] = []

    // 路由状态 - 甲方规范
    const route_status = {
      is_segmented: rplStore.tables.some((t) => t.records && t.records.length > 0),
      is_adjusted: false,
      last_modified: now
    }

    // 分段配置 - 甲方规范
    const segmentation_config = {
      method: 'RISK_BASED' as const,
      fixed_length_km: 2.0,
      risk_based: {
        min_length_km: 1.0,
        max_length_km: 5.0
      }
    }

    // 检查 RPL 表是否为空，如果为空则使用 routePlanningConfig 中的起点/终点配置
    const hasRPLData = rplStore.tables.some((table) => table.records && table.records.length > 0)
    
    if (!hasRPLData && settingsStore.routePlanningConfig.isConfigured) {
      // 从工程设置中获取起点/终点坐标
      const startPoint = settingsStore.routePlanningConfig.startPoint
      const endPoint = settingsStore.routePlanningConfig.endPoint
      
      // 创建起点
      geometry_pool.push([startPoint.lon, startPoint.lat, 0, 0])
      key_events.push({
        event_id: 'evt_start',
        type: 'LandStation',
        geo_index: 0,
        name: '起点登陆站',
      })
      
      // 创建终点
      geometry_pool.push([endPoint.lon, endPoint.lat, 0, 100])
      key_events.push({
        event_id: 'evt_end',
        type: 'LandStation',
        geo_index: 1,
        name: '终点登陆站',
      })
      
      // 创建分段 - 甲方规范格式
      segments.push({
        segment_id: 'seg_0_1',
        geometry_range: {
          start_index: 0,
          end_index: 1,
          start_km: 0,
          end_km: 100,
          length_km: 100
        },
        risk_info: {
          risk_level: 'LOW',
          average_risk_value: 1.0
        },
        cable_type_ref: 'struct_lw_01',
        slack_percent: 2.5,
        burial_depth_m: 1.5,
        is_locked: false,
      })
      
      // 创建 Span
      spans.push({
        span_id: 'span_01',
        from_event_id: 'evt_start',
        from_port_index: 1,
        to_event_id: 'evt_end',
        to_port_index: 1,
        geometry_range: [0, 1],
        fiber_spec_ref: 'fiber_g654',
        optical_metrics: null,
        is_locked: false,
      })
      
      return { route_status, segmentation_config, geometry_pool, key_events, segments, spans }
    }

    // 遍历所有 RPL 表
    for (const table of rplStore.tables) {
      const records = table.records || []
      let lastEventId: string | null = null
      let lastEventGeoIndex: number = 0
      let segmentStartIndex = 0
      let spanIndex = 0

      for (let i = 0; i < records.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const record = records[i] as any
        const geoIndex = geometry_pool.length

        // 添加到几何池
        geometry_pool.push([
          record.longitude || 0,
          record.latitude || 0,
          -(record.depth || 0),  // 水深为负值
          record.kp || record.cumulativeLength || 0
        ])

        // 检查是否是关键事件点
        const eventType = this.mapPointTypeToEventType(record.pointType)
        if (eventType) {
          const eventId = `evt_${record.id}`
          key_events.push({
            event_id: eventId,
            type: eventType,
            geo_index: geoIndex,
            component_ref_id: record.componentRefId,
            name: record.remarks || record.pointType,
          })

          // 创建分段 (Segment - 工程对象) - 甲方规范格式
          if (lastEventId) {
            const startKm = geometry_pool[segmentStartIndex]?.[3] || 0
            const endKm = record.kp || record.cumulativeLength || 0
            const riskLevel = this.mapRiskLevel(record.riskLevel || 'low')
            segments.push({
              segment_id: `seg_${segmentStartIndex}_${geoIndex}`,
              geometry_range: {
                start_index: segmentStartIndex,
                end_index: geoIndex,
                start_km: startKm,
                end_km: endKm,
                length_km: endKm - startKm
              },
              risk_info: {
                risk_level: riskLevel,
                average_risk_value: record.avgRiskValue || (riskLevel === 'HIGH' ? 3.5 : riskLevel === 'MEDIUM' ? 2.5 : 1.5)
              },
              cable_type_ref: record.cableType || 'struct_lw_01',
              slack_percent: record.slack || 2.5,
              burial_depth_m: record.burialDepth || 1.5,
              is_locked: false,
            })

            // 创建 Span (光学传输跨段 - 系统对象)
            const spanLength = (record.kp || 0) - (geometry_pool[lastEventGeoIndex]?.[3] || 0)
            spans.push({
              span_id: `span_${String(spanIndex + 1).padStart(2, '0')}`,
              from_event_id: lastEventId,
              from_port_index: 1,
              to_event_id: eventId,
              to_port_index: 1,
              geometry_range: [lastEventGeoIndex, geoIndex],
              fiber_spec_ref: record.fiberType || 'fiber_g654',
              optical_metrics: spanLength > 0 ? {
                span_length_km: spanLength * (1 + (record.slack || 2.5) / 100),
                total_loss_db: spanLength * 0.16,  // 假设 0.16 dB/km
                osnr_db: 0,
                q_factor: 0,
              } : null,
              is_locked: false,
            })
            spanIndex++
          }

          lastEventId = eventId
          lastEventGeoIndex = geoIndex
          segmentStartIndex = geoIndex
        }
      }
    }

    return { route_status, segmentation_config, geometry_pool, key_events, segments, spans }
  }

  /**
   * 映射点位类型到事件类型
   */
  private mapPointTypeToEventType(pointType: string): KeyEventType | null {
    const map: Record<string, KeyEventType> = {
      'landing': 'LandStation',
      'repeater': 'EDFA',
      'branching': 'BU',
    }
    return map[pointType] || null
  }

  /**
   * 映射风险等级到甲方规范格式
   */
  private mapRiskLevel(level: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const map: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'> = {
      'high': 'HIGH',
      'medium': 'MEDIUM',
      'low': 'LOW',
    }
    return map[level?.toLowerCase()] || 'LOW'
  }

  /**
   * 收集系统工程模块
   * 符合文档规范: 包含 wdm_config, simulation_cache, system_planning_cache
   */
  private collectSystemEngineering(settingsStore: SettingsStore, sldStore: SLDStore): USESystemEngineering {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tc = settingsStore.transmissionConfig as any || {}
    const sldTable = sldStore.currentTable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tp = (sldTable?.transmissionParams || {}) as any
    const channelCount = tc.channelCount || tp.wavelengths || 96

    // 从 store 获取缓存数据
    const simulationCache: SimulationCache | null = settingsStore.simulationCache || null
    const systemPlanningCache: SystemPlanningCache | null = settingsStore.systemPlanningCache || null

    return {
      wdm_config: {
        channel_count: channelCount,
        center_freq_thz: tc.centerFreqThz || 193.1,
        channel_spacing_ghz: tc.channelBandwidth || tp.channelSpacing || 50,
        baud_rate_gbaud: tc.baudRate || 64.0,
        launch_power_vector: tc.launchPowerVector || new Array(channelCount).fill(-20.0),
        initial_ase_vector: tc.initialAseVector || new Array(channelCount).fill(-60.0),
        initial_nli_vector: tc.initialNliVector || new Array(channelCount).fill(-200.0),
        modulation: tp.modulationFormat || tc.modulation || '16QAM',
        shaping_moments: tc.shapingMoments || { moment4: 1.32, moment6: 1.90 }
      },
      simulation_cache: simulationCache,
      system_planning_cache: systemPlanningCache
    }
  }

  /**
   * 收集健康监控模块
   * 符合 PDF 规范: collector_config, device_mapping, view_settings
   */
  private collectHealthMonitoring(settingsStore: SettingsStore, monitorStore: MonitorStore): USEHealthMonitoring {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mc = settingsStore.monitoringConfig as any || {}

    // 从 monitorStore 收集设备映射
    const device_mapping: DeviceMapping[] = []
    if (monitorStore.devices) {
      for (const device of monitorStore.devices) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = device as any
        if (d.eventId && d.externalId) {
          device_mapping.push({
            event_id: d.eventId,
            external_index: d.externalId
          })
        }
      }
    }

    // 收集节点位置
    const node_positions: Record<string, [number, number]> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((monitorStore as any).nodePositions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [nodeId, pos] of Object.entries((monitorStore as any).nodePositions as Record<string, any>)) {
        node_positions[nodeId] = [pos.x || 0, pos.y || 0]
      }
    }

    return {
      collector_config: mc.connectionAddress ? {
        gateway_name: mc.gatewayName || 'default',
        driver_id: 'http_rest_client_v1',
        polling_interval: mc.pollingInterval || 30,
        connection_params: {
          base_url: mc.connectionAddress,
          method: 'GET',
          response_format: 'json',
          ssl_verify: 'false'
        }
      } : null,
      device_mapping,
      view_settings: {
        node_positions,
        filters: {
          visible_types: mc.visibleTypes || ['EDFA', 'BU', 'LandStation'],
          min_alarm_severity: mc.minAlarmSeverity || 'ALL'
        }
      }
    }
  }

  /**
   * 导出项目文件 (ZIP 格式)
   * @param name 项目名称
   * @param allowOtherUsers 是否允许其他用户打开
   * @description 统一使用 .use 格式
   */
  async exportProject(name: string, allowOtherUsers: boolean = false): Promise<{ warnings: string[] }> {
    // 导出前校验数据完整性
    const validation = validateForExport()
    if (!validation.canExport) {
      throw new Error(validation.errors.join('; '))
    }

    const projectData = this.createUSEProjectData(name, allowOtherUsers)
    
    // 更新时间戳
    projectData.metadata.updated_at = new Date().toISOString()
    
    // 创建 ZIP 文件
    const zip = new JSZip()
    
    // 添加 project_data.json
    const jsonContent = JSON.stringify(projectData, null, 2)
    zip.file('project_data.json', jsonContent)
    
    // 创建 cache 目录 (可选)
    zip.folder('cache')
    
    // 统一使用 .use 扩展名
    const blob = await zip.generateAsync({ type: 'blob' })
    this.downloadBlob(blob, `${name}.use`)

    return { warnings: validation.warnings }
  }

  /**
   * 导出 USE 文件 (ZIP 格式) - 向后兼容
   */
  async exportUSE(name: string, allowOtherUsers: boolean = false): Promise<{ warnings: string[] }> {
    return this.exportProject(name, allowOtherUsers)
  }

  /**
   * 保存项目 (ZIP 格式)
   * @description 统一使用 .use 格式保存所有模块
   */
  async saveProject(): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
    if (!this.currentProject) {
      return { success: false, error: '当前没有打开的项目，请先新建或打开项目' }
    }

    // 保存前校验
    const validation = validateForExport()
    // 保存不阻止（即使有 error 也允许），但记录警告
    
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
    const zip = new JSZip()
    zip.file('project_data.json', JSON.stringify(this.currentProjectData, null, 2))
    zip.folder('cache')
    
    // 统一使用 .use 扩展名
    const blob = await zip.generateAsync({ type: 'blob' })
    this.downloadBlob(blob, `${this.currentProject.name}.use`)
    
    // 更新项目类型为 use
    this.currentProject.type = 'use'
    
    this.isDirty = false
    return { success: true, warnings: validation.warnings }
  }

  /**
   * 导入项目文件 (.use 格式 - ZIP 或 JSON)
   */
  async importProject(file: File): Promise<OpenProjectResult> {
    try {
      // 尝试作为 ZIP 文件读取
      const arrayBuffer = await file.arrayBuffer()
      
      try {
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
          const validationResult = this.validateProjectFile(projectData, file.name)
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
    const validationResult = this.validateProjectFile(projectData, file.name)
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
    if (projectData.libraries.models && projectData.libraries.models.length > 0) {
      settingsStore.models = projectData.libraries.models
    }

    // 3. 恢复光纤规格 - 包含 supported_models 和 model_params
    settingsStore.fiberTypes = projectData.libraries.fibers.map(f => ({
      id: f.id,
      name: f.fiber_type_id,
      nonlinearCoeff: 1.4,
      effectiveArea: f.attributes.A_eff,
      dispersion: f.attributes.dispersion,
      nonlinearRefractiveIndex: f.attributes.n2,
      attenuationCoeff: f.attributes.attenuation,
      secondOrderDispersion: f.attributes.dispersion_slope,
      // 保留新字段供后续使用
      supported_models: f.supported_models,
      model_params: f.model_params,
    }))

    // 4. 恢复海缆类型
    settingsStore.cableTypes = projectData.libraries.cable_types.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      costPerKm: c.commercial_params.price_per_km,
      maxDepth: 8000,
      fiberCount: 8,
    }))

    // 5. 恢复放大器规格 - 包含 supported_models 和 model_params
    const edfaComponents = projectData.libraries.components.filter(c => c.type === 'EDFA')
    settingsStore.amplifierTypes = edfaComponents.map(amp => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const specs = amp.specs as any
      return {
        id: amp.id,
        name: amp.name,
        gain: specs.gain_db || 20,
        bandwidth: specs.bandwidth_nm || 1550,
        noiseFigure: specs.noise_figure_db || 5,
        pumpPower: specs.pump_power_mw || 100,
        outputPower: specs.max_output_power_dbm || 17,
        gainFlatness: specs.gain_flatness_db || 0.5,
        gainRangePower: specs.gain_range_db || 0.1,
        supported_models: amp.supported_models,
        model_params: amp.model_params,
      }
    })

    // 6. 恢复分支器规格 - 包含 supported_models 和 model_params
    const buComponents = projectData.libraries.components.filter(c => c.type === 'BU')
    settingsStore.branchingUnitTypes = buComponents.map(bu => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const specs = bu.specs as any
      return {
        id: bu.id,
        name: bu.name,
        portCount: specs.port_count || 3,
        trunkInsertionLoss: specs.loss_vals?.thru || 0.5,
        branchInsertionLoss: specs.loss_vals?.branch || 3.0,
        insertionLoss: specs.loss_vals?.thru || 0.5,
        wavelengthRange: 1550,
        supported_models: bu.supported_models,
        model_params: bu.model_params,
      }
    })

    // 3. 恢复路由工程数据到 RPL store
    // 加载所有 geometry_pool 点，并标记 key_events
    const geometryPool = projectData.route_engineering?.geometry_pool || []
    const keyEvents = projectData.route_engineering?.key_events || []
    const segments = projectData.route_engineering?.segments || []
    const spans = projectData.route_engineering?.spans || []
    
    if (geometryPool.length > 0) {
      // 创建 key_events 的 geo_index 到 event 的映射
      const eventMap = new Map<number, KeyEvent>()
      for (const event of keyEvents) {
        eventMap.set(event.geo_index, event)
      }
      
      // 辅助函数：从 segment 获取 geometry_range 的起止索引（兼容新旧格式）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getGeometryRange = (seg: Record<string, any>): { start: number; end: number } => {
        if (Array.isArray(seg.geometry_range)) {
          // 旧格式: [start_index, end_index]
          return { start: seg.geometry_range[0], end: seg.geometry_range[1] }
        } else if (seg.geometry_range && typeof seg.geometry_range === 'object') {
          // 新格式: { start_index, end_index, ... }
          return { start: seg.geometry_range.start_index, end: seg.geometry_range.end_index }
        }
        return { start: 0, end: 0 }
      }
      
      // 创建 geometry_range 到 segment 的映射（兼容新旧格式）
      const getSegmentForIndex = (geoIndex: number) => {
        return segments.find((s) => {
          const range = getGeometryRange(s)
          return geoIndex >= range.start && geoIndex <= range.end
        })
      }
      
      // 创建 geometry_range 到 span 的映射（获取光纤类型）
      const getSpanForIndex = (geoIndex: number) => {
        return spans.find((s) => {
          const range = getGeometryRange(s)
          return geoIndex >= range.start && geoIndex <= range.end
        })
      }

      // 为每个 geometry_pool 点创建 RPL 记录
      const records = geometryPool.map((geo, index) => {
        const event = eventMap.get(index)
        const segment = getSegmentForIndex(index)
        const span = getSpanForIndex(index)
        
        // 计算分段长度（到上一个点的距离）
        let segmentLength = 0
        if (index > 0) {
          const prevGeo = geometryPool[index - 1]
          segmentLength = geo[3] - prevGeo[3] // KP差值
        }
        
        // 确定点类型
        let pointType: 'landing' | 'repeater' | 'branching' | 'joint' | 'waypoint' = 'waypoint'
        if (event) {
          pointType = this.mapEventTypeToPointType(event.type) as typeof pointType
        }
        
        // 获取电缆类型（兼容新旧字段名 cable_type_ref / cable_struct_ref）
        let cableType: 'LW' | 'LWS' | 'SA' | 'DA' | 'SAS' = 'LW'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cableRef = segment?.cable_type_ref || (segment as any)?.cable_struct_ref
        if (cableRef) {
          const ref = cableRef.toUpperCase()
          if (ref.includes('DA')) cableType = 'DA'
          else if (ref.includes('SA')) cableType = 'SA'
          else if (ref.includes('LWS')) cableType = 'LWS'
          else if (ref.includes('LW')) cableType = 'LW'
        }

        return {
          id: event?.event_id || `geo-${index}`,
          sequence: index + 1,
          pointType,
          longitude: geo[0],
          latitude: geo[1],
          depth: Math.abs(geo[2]), // 水深取绝对值
          kp: geo[3],
          cumulativeLength: geo[3],
          segmentLength,
          cableType,
          slack: segment?.slack_percent || 2.5,
          burialDepth: segment?.burial_depth_m || 0,
          remarks: event?.name || '',
          componentRefId: event?.component_ref_id || '',
          fiberRefId: span?.fiber_spec_ref || '',
        }
      })

      // 计算元数据
      const depths = records.map(r => r.depth)
      const totalLength = records.length > 0 ? records[records.length - 1].kp : 0
      
      // 创建或更新 RPL 表
      rplStore.tables = [{
        id: `rpl-${Date.now()}`,
        name: projectData.metadata.project_name,
        routeId: 'route-main',
        records,
        metadata: {
          totalLength,
          totalCableLength: totalLength * 1.025, // 加上约2.5%余量
          landingStations: records.filter((r) => (r.pointType as string) === 'landing').length,
          repeaters: records.filter((r) => (r.pointType as string) === 'repeater').length,
          branchingUnits: records.filter((r) => (r.pointType as string) === 'branching').length,
          joints: 0,
          averageDepth: depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0,
          maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
          minDepth: depths.length > 0 ? Math.min(...depths) : 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }]
      rplStore.currentTableId = rplStore.tables[0].id

      // 7. 同步路线数据到 routeStore 以便地图显示
      const routeStore = useRouteStore()
      
      // 创建路由点 (仅包含关键点: 登陆站、放大器、分支器)
      const routePoints = records
        .filter(r => r.pointType !== 'waypoint')
        .map(r => ({
          id: r.id,
          coordinates: [r.longitude, r.latitude] as [number, number],
          type: r.pointType as 'landing' | 'branching' | 'repeater' | 'waypoint',
          name: r.remarks || undefined,
        }))
      
      // 如果没有关键点，使用所有点（但每隔N个取一个以避免过多）
      const displayPoints = routePoints.length > 0 
        ? routePoints 
        : records.filter((_, i) => i % Math.max(1, Math.floor(records.length / 20)) === 0 || i === records.length - 1)
            .map(r => ({
              id: r.id,
              coordinates: [r.longitude, r.latitude] as [number, number],
              type: 'waypoint' as const,
              name: undefined,
            }))
      
      // 构建点 id -> KP 的映射，用于计算 segment 长度
      const idToKp = new Map<string, number>()
      records.forEach(r => idToKp.set(r.id, r.kp))

      // 创建路由分段（length 基于 KP 计算）
      const routeSegments = displayPoints.slice(0, -1).map((point, i) => {
        const startKp = idToKp.get(point.id) || 0
        const endKp = idToKp.get(displayPoints[i + 1].id) || 0
        return {
          id: `seg-${i}`,
          startPointId: point.id,
          endPointId: displayPoints[i + 1].id,
          length: Math.abs(endKp - startKp),
          depth: 0,
          cableType: 'LW',
          riskLevel: 'low' as const,
          cost: 0,
        }
      })
      
      // 创建主路线
      const mainRoute = {
        id: 'route-main',
        name: projectData.metadata.project_name,
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
      
      // 使用setParetoRoutes方法确保响应式更新
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routeStore.setParetoRoutes([mainRoute as any])
      
      // 8. 同步路线数据到 connectorStore 以便系统设计视图显示
      const connectorStore = useConnectorStore()
      
      // 创建接线元表（如果不存在）
      if (connectorStore.tables.length === 0) {
        connectorStore.createTable(projectData.metadata.project_name, 'route-main')
      } else {
        // 确保选中第一个表
        connectorStore.currentTableId = connectorStore.tables[0].id
      }
      
      // 清空并重新添加接线元
      if (connectorStore.currentTable) {
        // 使用新数组替换以确保响应式
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newElements: any[] = []
        
        // 只添加关键点作为接线元（登陆站、放大器、分支器）
        // 使用 record.id (event_id) 作为 ID，保证与 span 的 from/to_event_id 一致
        records.forEach((record, index) => {
          if (record.pointType !== 'waypoint') {
            const connectorType = this.mapPointTypeToConnectorType(record.pointType)
            newElements.push({
              id: record.id,
              name: record.remarks || `${this.getDeviceTypeChinese(connectorType)}-${index + 1}`,
              type: connectorType,
              longitude: record.longitude,
              latitude: record.latitude,
              depth: record.depth,
              kp: record.kp,
              status: 'active',
              specifications: '',
              remarks: record.remarks || '',
              componentRefId: record.componentRefId || '',
            })
          }
        })
        
        // 根据 .use 文件中的 spans 数据生成光纤段
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eventIdToElement = new Map<string, Record<string, any>>()
        newElements.forEach(elem => {
          eventIdToElement.set(elem.id, elem)
        })
        
        spans.forEach((span, index) => {
          const fromElement = eventIdToElement.get(span.from_event_id)
          const toElement = eventIdToElement.get(span.to_event_id)
          
          const fromKp = fromElement?.kp || 0
          const toKp = toElement?.kp || 0
          const spanLength = span.optical_metrics?.span_length_km || Math.abs(toKp - fromKp)
          
          newElements.push({
            id: span.span_id || `fiber-${index}`,
            name: `光纤段 ${span.span_id || `F${index + 1}`}`,
            type: 'fiber',
            kp: Math.min(fromKp, toKp),
            endKp: Math.max(fromKp, toKp),
            longitude: 0,
            latitude: 0,
            depth: 0,
            status: 'active',
            specifications: '',
            remarks: `${fromElement?.name || span.from_event_id} → ${toElement?.name || span.to_event_id}`,
            fiberRefId: span.fiber_spec_ref || '',
            fromDeviceId: span.from_event_id,
            toDeviceId: span.to_event_id,
            length: spanLength,
          })
        })
        
        connectorStore.currentTable.elements = newElements
      }
      
      // 9. 同步设备数据到 monitorStore 以便实时监控视图显示
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newDevices: any[] = []
      
      records.forEach((record, index) => {
        if (record.pointType !== 'waypoint') {
          const deviceType = this.mapPointTypeToConnectorType(record.pointType)
          newDevices.push({
            id: record.id,
            name: record.remarks || `${this.getDeviceTypeChinese(deviceType)}-${index + 1}`,
            type: deviceType,
            neType: deviceType,
            status: 'normal',
            location: `KP ${record.kp.toFixed(1)}`,
            kp: record.kp,
            sldEquipmentName: record.remarks || `${this.getDeviceTypeChinese(deviceType)}-${index + 1}`,
            longitude: record.longitude,
            latitude: record.latitude,
            depth: record.depth,
            inputPower: -15 + Math.random() * 5,
            outputPower: -10 + Math.random() * 5,
            pumpCurrent: 200 + Math.random() * 50,
            pfeVoltage: 48,
            pfeCurrent: 1.2 + Math.random() * 0.3,
            temperature: 4 + Math.random() * 2,
            componentRefId: record.componentRefId || '',
          })
        }
      })
      
      // 设备数据已通过 connectorStore 管理，monitorStore.devices 是 computed 属性
      // 无需额外设置，connectorStore.currentTable.elements 已在上面设置
      
    } else {
      // geometryPool为空时，尝试从其他来源创建paretoRoutes
      const routeStore = useRouteStore()
      
      // 如果monitorStore有设备数据，从中创建路线
      if (monitorStore.devices.length > 0) {
        const sortedDevices = [...monitorStore.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
        const displayPoints = sortedDevices.map(d => ({
          id: d.id,
          coordinates: [d.longitude, d.latitude] as [number, number],
          type: d.type === 'LandingStation' ? 'landing' : d.type === 'Repeater' ? 'repeater' : d.type === 'BU' ? 'branching' : 'waypoint',
          name: d.name,
        }))
        
        const mainRoute = {
          id: 'route-main',
          name: projectData.metadata?.project_name || '导入路线',
          points: displayPoints,
          segments: [],
          totalLength: 0,
          totalCost: 0,
          riskScore: 0,
          cost: { cable: 0, installation: 0, equipment: 0, total: 0 },
          risk: { seismic: 0, volcanic: 0, depth: 0, overall: 0 },
          distance: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        routeStore.setParetoRoutes([mainRoute as any])
      }
    }

    // 8. 恢复传输配置 (wdm_config)
    if (projectData.system_engineering.wdm_config) {
      const wdm = projectData.system_engineering.wdm_config
      settingsStore.transmissionConfig = {
        channelCount: wdm.channel_count,
        centerWavelength: 1550,
        channelBandwidth: wdm.channel_spacing_ghz,
        calculationModels: ['GN'],
      }
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
      settingsStore.simulationCache = projectData.system_engineering.simulation_cache
    }

    // 10. 恢复系统规划缓存 (system_planning_cache)
    if (projectData.system_engineering.system_planning_cache) {
      settingsStore.systemPlanningCache = projectData.system_engineering.system_planning_cache
    }

    // 11. 恢复监控配置 (health_monitoring)
    if (projectData.health_monitoring.collector_config) {
      settingsStore.monitoringConfig = {
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
      }
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

    // 13.5 恢复海缆段数据到 cableSegmentStore
    this.restoreCableSegments(projectData, settingsStore)

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
    if (ext.routePlanning?.rplTables && ext.routePlanning.rplTables.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rplStore.tables = ext.routePlanning.rplTables as any
      if (rplStore.tables.length > 0) {
        rplStore.currentTableId = rplStore.tables[0].id
      }
    }

    // 14.2 恢复路由数据
    if (ext.routePlanning?.routes && ext.routePlanning.routes.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      routeStore.setParetoRoutes(ext.routePlanning.routes as any)
    }
    
    // 14.2.1 恢复缆型数据库
    if (ext.routePlanning?.cableTypeDatabase && ext.routePlanning.cableTypeDatabase.length > 0) {
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
    if (ext.transmissionPlanning?.sldTables && ext.transmissionPlanning.sldTables.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sldStore.tables = ext.transmissionPlanning.sldTables as any
      if (sldStore.tables.length > 0) {
        sldStore.currentTableId = sldStore.tables[0].id
      }
    }

    // 14.4 恢复接线元数据
    if (ext.connectorTables && ext.connectorTables.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connectorStore.tables = ext.connectorTables as any
      if (connectorStore.tables.length > 0) {
        connectorStore.currentTableId = connectorStore.tables[0].id
      }
    }

    // 14.5 恢复监控数据
    if (ext.monitorData?.devices && ext.monitorData.devices.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(monitorStore as any).$patch({
        devices: ext.monitorData.devices,
        alarmHistory: ext.monitorData.alarmHistory || []
      })
    }

    // 14.5.5 恢复海缆段数据 (如果 _app_extensions 中有更完整的版本)
    if (ext.cableSegments) {
      const cableSegmentStore = useCableSegmentStore()
      cableSegmentStore.importData(ext.cableSegments)
    }

    // 14.6 恢复设计视图缓存
    if (ext.designCache?.linkCalcSummary) {
      const settingsStore = useSettingsStore()
      settingsStore.linkCalcSummaryCache = ext.designCache.linkCalcSummary
    }

    // 14.7 恢复图层设置
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
   * 从 route_engineering.segments 恢复海缆段数据到 cableSegmentStore
   */
  private restoreCableSegments(projectData: USEProjectData, settingsStore: SettingsStore): void {
    const segments = projectData.route_engineering?.segments || []
    const segConfig = projectData.route_engineering?.segmentation_config
    if (segments.length === 0) return

    const cableSegmentStore = useCableSegmentStore()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cableTypes = (settingsStore.cableTypes || []) as any[]

    // 辅助：根据 cable_type_ref 查找缆型名称和铠装类型
    const getCableInfo = (ref: string) => {
      const ct = cableTypes.find((c: any) => c.id === ref)
      if (ct) return { name: ct.name, armor: ct.type || 'LW' }
      // fallback: 从 ref 字符串推断
      const upper = ref.toUpperCase()
      if (upper.includes('DA')) return { name: 'DA (双铠装)', armor: '双铠' }
      if (upper.includes('SA')) return { name: 'SA (单铠装)', armor: '单铠' }
      return { name: 'LW (轻型)', armor: '轻铠' }
    }

    // 辅助：映射风险等级 USE -> store
    const mapRisk = (level: string): 'high' | 'medium' | 'low' => {
      const map: Record<string, 'high' | 'medium' | 'low'> = {
        'HIGH': 'high', 'MEDIUM': 'medium', 'LOW': 'low'
      }
      return map[level?.toUpperCase()] || 'low'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const converted = segments.map((seg: any) => {
      const range = seg.geometry_range || {}
      const startKm = range.start_km ?? range.startKm ?? 0
      const endKm = range.end_km ?? range.endKm ?? 0
      const lengthKm = range.length_km ?? range.lengthKm ?? (endKm - startKm)
      const riskLevel = mapRisk(seg.risk_info?.risk_level || 'LOW')
      const cableRef = seg.cable_type_ref || seg.cable_struct_ref || 'struct_lw_01'
      const cableInfo = getCableInfo(cableRef)

      return {
        id: seg.segment_id,
        routeId: 'route-main',
        startKp: startKm,
        endKp: endKm,
        length: lengthKm,
        riskLevel,
        cableTypeId: cableRef,
        cableTypeName: cableInfo.name,
        armorType: cableInfo.armor,
        slack: seg.slack_percent ?? 2.5,
        burialDepth: seg.burial_depth_m ?? 0,
        isLocked: seg.is_locked ?? false,
        geometryStartIndex: range.start_index,
        geometryEndIndex: range.end_index,
      }
    })

    // 构建导入数据
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const importPayload: any = { segments: converted }

    // 转换分段配置
    if (segConfig) {
      importPayload.config = {
        method: segConfig.method === 'FIXED_LENGTH' ? 'fixed-length' : 'risk-based',
        targetLength: segConfig.fixed_length_km,
        minLength: segConfig.risk_based?.min_length_km,
        maxLength: segConfig.risk_based?.max_length_km,
      }
    }

    cableSegmentStore.importData(importPayload)
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
   * 映射事件类型到点位类型
   */
  private mapEventTypeToPointType(eventType: string): string {
    const map: Record<string, string> = {
      'LandStation': 'landing',
      'EDFA': 'repeater',
      'EDFA_E': 'repeater_e',
      'EDFA_W': 'repeater_w',
      'BU': 'branching',
    }
    return map[eventType] || 'waypoint'
  }

  /**
   * 映射点位类型到接线元类型
   */
  private mapPointTypeToConnectorType(pointType: string): string {
    const map: Record<string, string> = {
      'landing': 'landing',
      'repeater': 'amplifier_e',
      'repeater_e': 'amplifier_e',
      'repeater_w': 'amplifier_w',
      'branching': 'bu',
    }
    return map[pointType] || 'underwater'
  }

  /**
   * 获取器件类型的中文名称
   */
  private getDeviceTypeChinese(deviceType: string): string {
    const map: Record<string, string> = {
      'landing': '岸上站点',
      'amplifier_e': '放大器东',
      'amplifier_w': '放大器西',
      'bu': '水下分支器',
      'underwater': '水下站点',
    }
    return map[deviceType] || deviceType
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
      routeStore.routes = project.routePlanning.routes
      // 同时设置 paretoRoutes 以便 ParetoPanel 显示
      routeStore.setParetoRoutes(project.routePlanning.routes)
    } else {
      // 如果没有路由数据，尝试从 monitorStore 创建
      // 延迟执行，确保 monitorStore 已初始化
      setTimeout(() => {
        if (monitorStore.devices.length > 0 && routeStore.paretoRoutes.length === 0) {
          const sortedDevices = [...monitorStore.devices].sort((a, b) => (a.kp || 0) - (b.kp || 0))
          const displayPoints = sortedDevices.map(d => ({
            id: d.id,
            coordinates: [d.longitude, d.latitude] as [number, number],
            type: d.type === 'LandingStation' ? 'landing' : d.type === 'Repeater' ? 'repeater' : d.type === 'BU' ? 'branching' : 'waypoint',
            name: d.name,
          }))
          
          const mainRoute = {
            id: 'route-main',
            name: project.name || '导入路线',
            points: displayPoints,
            segments: [],
            totalLength: 0,
            totalCost: 0,
            riskScore: 0,
            cost: { cable: 0, installation: 0, equipment: 0, total: 0 },
            risk: { seismic: 0, volcanic: 0, depth: 0, overall: 0 },
            distance: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          routeStore.setParetoRoutes([mainRoute as any])
        }
      }, 100)
    }
    
    // 恢复 RPL 数据
    if (project.routePlanning?.rplTables) {
      rplStore.tables = project.routePlanning.rplTables
      if (rplStore.tables.length > 0) {
        rplStore.currentTableId = rplStore.tables[0].id
      }
    }
    
    // 恢复 SLD 数据
    if (project.transmissionPlanning?.sldTables) {
      sldStore.tables = project.transmissionPlanning.sldTables
    }
    
    // 恢复 Connector 数据
    if (project.connectorTables) {
      connectorStore.tables = project.connectorTables
      if (connectorStore.tables.length > 0) {
        connectorStore.currentTableId = connectorStore.tables[0].id
      }
    }
    
    // 恢复 Monitor 数据
    if (project.monitorData) {
      // devices 是 computed 属性，通过 connectorStore 管理
      if (project.monitorData.devices && project.monitorData.devices.length > 0) {
        if (connectorStore.tables.length === 0) {
          connectorStore.createTable(project.name || '导入项目', 'route-main')
        }
        if (connectorStore.currentTable) {
          const connectorElements = project.monitorData.devices.map((d: any) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            longitude: d.longitude,
            latitude: d.latitude,
            depth: d.depth || 0,
            kp: d.kp || 0,
            status: 'active',
            specifications: '',
            remarks: d.name,
          }))
          connectorStore.currentTable.elements = connectorElements
        }
      }
      monitorStore.alarmHistory = project.monitorData.alarmHistory || []
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
      settingsStore.cableTypes = project.settings.cableTypes
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

// Composable
export function useProjectFile() {
  return {
    getCurrentProject: () => projectFileService.getCurrentProject(),
    getCurrentProjectData: () => projectFileService.getCurrentProjectData(),
    setCurrentProject: (project: ProjectMetadata | null) => projectFileService.setCurrentProject(project),
    getIsDirty: () => projectFileService.getIsDirty(),
    setIsDirty: (dirty: boolean) => projectFileService.setIsDirty(dirty),
    checkOpenPermission: (projectData: USEProjectData) => projectFileService.checkOpenPermission(projectData),
    createUSEProjectData: (name: string, allowOtherUsers?: boolean) => projectFileService.createUSEProjectData(name, allowOtherUsers),
    saveProject: () => projectFileService.saveProject(),
    exportUSE: (name: string, allowOtherUsers?: boolean) => projectFileService.exportUSE(name, allowOtherUsers),
    importProject: (file: File) => projectFileService.importProject(file),
    openProjectFile: () => projectFileService.openProjectFile(),
    openFileDialog: (accept: string) => projectFileService.openFileDialog(accept),
    closeProject: () => projectFileService.closeProject(),
  }
}
