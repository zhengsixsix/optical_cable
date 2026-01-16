/**
 * 项目文件服务
 * 支持 .use (传输系统规划工程) 格式
 * 
 * USE 文件格式符合 docs/use文件架构.pdf 文档规范
 * 底层为 ZIP 格式，包含 project_data.json
 */

import JSZip from 'jszip'
import { useRouteStore, useRPLStore, useSLDStore, useSettingsStore, useUserStore, useConnectorStore, useMonitorStore, useLayerStore } from '@/stores'
import type {
  USEProjectData,
  USEEnvironmentContext,
  USELibraries,
  USERouteEngineering,
  USESystemEngineering,
  USEHealthMonitoring,
  LayerRegistryItem,
  ImportedLandingPoint,
  FiberSpec,
  CableTypeSpec,
  ComponentSpec,
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
  }

  /**
   * 收集环境上下文模块
   * 符合 PDF 规范: layer_registry 必须包含 integrity
   */
  private collectEnvironmentContext(layerStore: any, rplStore: any): USEEnvironmentContext {
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
    const layer_registry: LayerRegistryItem[] = layerStore.layers.map((layer: any) => {
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
          size_bytes: layer.size_bytes || 0
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

    return { layer_registry, imported_landing_points }
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
  private collectLibraries(settingsStore: any): USELibraries {
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
    for (const amp of (settingsStore.amplifierTypes || [])) {
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
    for (const bu of (settingsStore.branchingUnitTypes || [])) {
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
   * 符合文档规范: 包含 geometry_pool, key_events, segments, spans
   */
  private collectRouteEngineering(rplStore: any): USERouteEngineering {
    const geometry_pool: GeometryPoint[] = []
    const key_events: KeyEvent[] = []
    const segments: RouteSegment[] = []
    const spans: Span[] = []

    // 遍历所有 RPL 表
    for (const table of rplStore.tables) {
      const records = table.records || []
      let lastEventId: string | null = null
      let lastEventGeoIndex: number = 0
      let segmentStartIndex = 0
      let spanIndex = 0

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
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

          // 创建分段 (Segment - 工程对象)
          if (lastEventId) {
            segments.push({
              segment_id: `seg_${segmentStartIndex}_${geoIndex}`,
              geometry_range: [segmentStartIndex, geoIndex],
              cable_struct_ref: record.cableType || 'struct_lw',
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

    return { geometry_pool, key_events, segments, spans }
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
   * 收集系统工程模块
   * 符合文档规范: 包含 wdm_config, simulation_cache, system_planning_cache
   */
  private collectSystemEngineering(settingsStore: any, sldStore: any): USESystemEngineering {
    const tc = settingsStore.transmissionConfig || {}
    const sldTable = sldStore.currentTable
    const tp = sldTable?.transmissionParams || {}
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
  private collectHealthMonitoring(settingsStore: any, monitorStore: any): USEHealthMonitoring {
    const mc = settingsStore.monitoringConfig || {}

    // 从 monitorStore 收集设备映射
    const device_mapping: DeviceMapping[] = []
    if (monitorStore.devices) {
      for (const device of monitorStore.devices) {
        if (device.eventId && device.externalId) {
          device_mapping.push({
            event_id: device.eventId,
            external_index: device.externalId
          })
        }
      }
    }

    // 收集节点位置
    const node_positions: Record<string, [number, number]> = {}
    if (monitorStore.nodePositions) {
      for (const [nodeId, pos] of Object.entries(monitorStore.nodePositions as Record<string, any>)) {
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
   * 导出 USE 文件 (ZIP 格式)
   */
  async exportUSE(name: string, allowOtherUsers: boolean = false): Promise<void> {
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
    
    // 生成 ZIP 并下载
    const blob = await zip.generateAsync({ type: 'blob' })
    this.downloadBlob(blob, `${name}.use`)
  }

  /**
   * 保存项目 (ZIP 格式)
   */
  async saveProject(): Promise<boolean> {
    if (!this.currentProject || !this.currentProjectData) return false
    
    // 更新项目数据
    this.collectDataToProject(this.currentProjectData)
    this.currentProjectData.metadata.updated_at = new Date().toISOString()
    
    // 创建 ZIP
    const zip = new JSZip()
    zip.file('project_data.json', JSON.stringify(this.currentProjectData, null, 2))
    zip.folder('cache')
    
    const blob = await zip.generateAsync({ type: 'blob' })
    this.downloadBlob(blob, `${this.currentProject.name}.use`)
    
    this.isDirty = false
    return true
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
          
          // 验证文件格式
          if (!projectData.metadata?.file_format_version) {
            return {
              success: false,
              error: '无效的项目文件格式',
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
          
          // 更新当前项目信息
          this.currentProject = {
            name: projectData.metadata.project_name,
            path: file.name,
            type: 'use',
            uuid: projectData.metadata.project_uuid,
            lastModified: projectData.metadata.updated_at,
            creatorId: projectData.metadata.creator_user_id,
            allowOtherUsers: projectData.metadata.allow_other_users,
          }
          this.currentProjectData = projectData
          this.isDirty = false
          
          return { success: true, project: projectData }
        }
      } catch (zipError) {
        // 不是 ZIP 文件，尝试作为纯 JSON 读取 (向后兼容)
        console.log('不是 ZIP 格式，尝试作为 JSON 读取')
      }
      
      // 尝试作为纯 JSON 读取 (向后兼容旧格式)
      const textContent = new TextDecoder().decode(arrayBuffer)
      const legacyProject = JSON.parse(textContent) as any
      
      // 检查是否是旧版格式
      if (legacyProject.metadata?.file_format_version) {
        // 新版 JSON 格式 (未打包的)
        return this.handleNewFormatProject(legacyProject, file)
      } else if (legacyProject.type === 'use' || legacyProject.type === 'ucp') {
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
    const permissionResult = this.checkOpenPermission(projectData)
    if (!permissionResult.success) {
      return permissionResult
    }
    
    this.loadUSEProjectDataToStores(projectData)
    
    this.currentProject = {
      name: projectData.metadata.project_name,
      path: file.name,
      type: 'use',
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
  private handleLegacyProject(project: any, file: File): OpenProjectResult {
    // 加载旧版项目数据到 stores
    this.loadLegacyProjectToStores(project)
    
    this.currentProject = {
      name: project.name || project.projectName,
      path: file.name,
      type: 'use',
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
      const specs = amp.specs as any
      return {
        id: amp.id,
        name: amp.name,
        gain: specs.gain_db,
        bandwidth: specs.bandwidth_nm,
        noiseFigure: specs.noise_figure_db,
        maxOutputPower: specs.max_output_power_dbm,
        gainFlatness: specs.gain_flatness_db,
        price: amp.commercial_params.unit_price,
        supported_models: amp.supported_models,
        model_params: amp.model_params,
      }
    })

    // 6. 恢复分支器规格 - 包含 supported_models 和 model_params
    const buComponents = projectData.libraries.components.filter(c => c.type === 'BU')
    settingsStore.branchingUnitTypes = buComponents.map(bu => {
      const specs = bu.specs as any
      return {
        id: bu.id,
        name: bu.name,
        portCount: specs.port_count,
        matrix: specs.matrix,
        thruPair: specs.thru_pair,
        thruLoss: specs.loss_vals?.thru,
        branchLoss: specs.loss_vals?.branch,
        price: bu.commercial_params.unit_price,
        supported_models: bu.supported_models,
        model_params: bu.model_params,
      }
    })

    // 3. 恢复路由工程数据到 RPL store
    // 加载所有 geometry_pool 点，并标记 key_events
    const geometryPool = projectData.route_engineering.geometry_pool
    const keyEvents = projectData.route_engineering.key_events
    const segments = projectData.route_engineering.segments
    
    if (geometryPool.length > 0) {
      // 创建 key_events 的 geo_index 到 event 的映射
      const eventMap = new Map<number, KeyEvent>()
      for (const event of keyEvents) {
        eventMap.set(event.geo_index, event)
      }
      
      // 创建 geometry_range 到 segment 的映射
      const getSegmentForIndex = (geoIndex: number): RouteSegment | undefined => {
        return segments.find(s => geoIndex >= s.geometry_range[0] && geoIndex <= s.geometry_range[1])
      }

      // 为每个 geometry_pool 点创建 RPL 记录
      const records = geometryPool.map((geo, index) => {
        const event = eventMap.get(index)
        const segment = getSegmentForIndex(index)
        
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
        
        // 获取电缆类型
        let cableType: 'LW' | 'LWS' | 'SA' | 'DA' | 'SAS' = 'LW'
        if (segment?.cable_struct_ref) {
          const ref = segment.cable_struct_ref.toUpperCase()
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
          landingStations: records.filter(r => r.pointType === 'landing').length,
          repeaters: records.filter(r => r.pointType === 'repeater').length,
          branchingUnits: records.filter(r => r.pointType === 'branching').length,
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
      
      // 创建路由点 (仅包含关键点: 登陆站、中继器、分支器)
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
      
      // 创建路由分段
      const routeSegments = displayPoints.slice(0, -1).map((point, i) => ({
        id: `seg-${i}`,
        startPointId: point.id,
        endPointId: displayPoints[i + 1].id,
        length: 0,
        depth: 0,
        cableType: 'LW',
        riskLevel: 'low' as const,
        cost: 0,
      }))
      
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
      
      console.log('USE Import: Creating main route with', displayPoints.length, 'points')
      console.log('USE Import: First point coords:', displayPoints[0]?.coordinates)
      console.log('USE Import: Last point coords:', displayPoints[displayPoints.length - 1]?.coordinates)
      
      routeStore.routes = [mainRoute]
      routeStore.paretoRoutes = [mainRoute]
      routeStore.currentRouteId = mainRoute.id
      
      console.log('USE Import: Route store updated, paretoRoutes length:', routeStore.paretoRoutes.length)
      
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
        const newElements: any[] = []
        
        // 只添加关键点作为接线元（登陆站、中继器、分支器）
        records.forEach((record, index) => {
          if (record.pointType !== 'waypoint') {
            const connectorType = this.mapPointTypeToConnectorType(record.pointType)
            newElements.push({
              id: `elem-${index}`,
              name: record.remarks || `${connectorType}-${index + 1}`,
              type: connectorType,
              longitude: record.longitude,
              latitude: record.latitude,
              depth: record.depth,
              kp: record.kp,
              specifications: {},
              remarks: record.remarks || '',
            })
          }
        })
        
        connectorStore.currentTable.elements = newElements
        console.log('USE Import: ConnectorStore updated, elements count:', newElements.length)
      }
      
      // 9. 同步设备数据到 monitorStore 以便实时监控视图显示
      // 清空并重新添加监控设备
      monitorStore.devices = []
      
      records.forEach((record, index) => {
        if (record.pointType !== 'waypoint') {
          const deviceType = this.mapPointTypeToConnectorType(record.pointType)
          monitorStore.devices.push({
            id: `monitor-${index}`,
            name: record.remarks || `${deviceType}-${index + 1}`,
            type: deviceType,
            neType: deviceType,
            status: 'normal',
            location: `KP ${record.kp.toFixed(1)}`,
            kp: record.kp,
            sldEquipmentName: record.remarks || `${deviceType}-${index + 1}`,
            longitude: record.longitude,
            latitude: record.latitude,
            depth: record.depth,
            inputPower: -15 + Math.random() * 5,
            outputPower: -10 + Math.random() * 5,
            pumpCurrent: 200 + Math.random() * 50,
            pfeVoltage: 48,
            pfeCurrent: 1.2 + Math.random() * 0.3,
            temperature: 4 + Math.random() * 2,
          })
        }
      })
      
      console.log('USE Import: MonitorStore updated, devices count:', monitorStore.devices.length)
    }

    // 8. 恢复传输配置 (wdm_config)
    if (projectData.system_engineering.wdm_config) {
      const wdm = projectData.system_engineering.wdm_config
      settingsStore.transmissionConfig = {
        channelCount: wdm.channel_count,
        centerWavelength: 1550,
        channelBandwidth: wdm.channel_spacing_ghz,
        calculationModels: ['GN'],
        // 保留完整 WDM 配置
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
        powerThreshold: -25,
        temperatureThreshold: 45,
        berThreshold: '1e-6',
        gatewayName: projectData.health_monitoring.collector_config.gateway_name,
        pollingInterval: projectData.health_monitoring.collector_config.polling_interval,
      }
    }

    // 12. 恢复设备映射和视图设置
    if (projectData.health_monitoring.device_mapping) {
      monitorStore.deviceMapping = projectData.health_monitoring.device_mapping
    }
    if (projectData.health_monitoring.view_settings) {
      monitorStore.viewSettings = projectData.health_monitoring.view_settings
    }
  }

  /**
   * 映射事件类型到点位类型
   */
  private mapEventTypeToPointType(eventType: KeyEventType): string {
    const map: Record<KeyEventType, string> = {
      'LandStation': 'landing',
      'EDFA': 'repeater',
      'BU': 'branching',
    }
    return map[eventType] || 'waypoint'
  }

  /**
   * 映射点位类型到接线元类型
   */
  private mapPointTypeToConnectorType(pointType: string): string {
    const map: Record<string, string> = {
      'landing': 'LandingStation',
      'repeater': 'Repeater',
      'branching': 'BU',
    }
    return map[pointType] || 'Repeater'
  }

  /**
   * 加载旧版项目数据到 stores (向后兼容)
   */
  private loadLegacyProjectToStores(project: any): void {
    const routeStore = useRouteStore()
    const rplStore = useRPLStore()
    const settingsStore = useSettingsStore()
    const connectorStore = useConnectorStore()
    const monitorStore = useMonitorStore()
    const sldStore = useSLDStore()
    const layerStore = useLayerStore()
    
    // 恢复路由数据
    if (project.routePlanning?.routes) {
      routeStore.routes = project.routePlanning.routes
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
      monitorStore.devices = project.monitorData.devices || []
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
