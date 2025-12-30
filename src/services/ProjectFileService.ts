/**
 * 项目文件服务
 * 支持 .ucp (路由规划工程) 和 .use (传输系统规划工程) 格式
 */

import { useRouteStore, useRPLStore, useSLDStore, useSettingsStore, useUserStore } from '@/stores'

// 图层设置接口
interface LayerSettings {
  oceanElevation: boolean       // 海洋高程图
  volcanoDistribution: boolean  // 海洋火山分布
  fishingAreaDistribution: boolean // 海洋渔区分布
  slopeMap: boolean             // 海洋坡度图
  earthquakeDistribution: boolean // 海洋地震分布
  shippingLanes: boolean        // 海洋航道图
}

// 器件库配置
interface ComponentLibrary {
  currentLibrary: string        // 当前器件库
  customComponents: any[]       // 自定义器件
}

// 路径规划配置
interface RoutePlanningConfig {
  planningMode: 'manual' | 'auto' | 'hybrid'  // 规划模式
  startCoordinate?: { lon: number; lat: number }  // 起点坐标
  endCoordinate?: { lon: number; lat: number }    // 终点坐标
  multiPointFile?: string       // 多点文件路径
  avoidanceZones: any[]         // 规避区域
  preferredDepthRange: [number, number]  // 首选水深范围
}

// 传输系统配置
interface TransmissionConfig {
  channelCount: number          // 波道数量
  centerWavelength: number      // 中心波长(nm)
  channelBandwidth: number      // 信道带宽(GHz)
  calculationModel: string      // 计算模型
}

// 监控系统配置
interface MonitoringConfig {
  dataSourceType: 'websocket' | 'polling' | 'mqtt'  // 数据源类型
  connectionAddress: string     // 连接地址
  opticalPowerThreshold: number // 光功率阈值(dBm)
  temperatureThreshold: number  // 温度阈值(℃)
  berThreshold: number          // BER阈值
}

// 基础项目接口
interface BaseProject {
  version: string
  type: 'ucp' | 'use'
  
  // === 项目基本信息 ===
  projectName: string           // 项目名称
  name: string                  // 兼容旧字段
  creatorUserId: string         // 创建用户ID(手机号)
  creatorId: string             // 兼容旧字段
  serverDirectory?: string      // 服务器目录
  allowOtherUsers: boolean      // 是否允许其他用户打开
  createdAt: string
  updatedAt: string
  
  // === 文件引用 ===
  rplFiles: string[]            // RPL文件路径列表
  
  // === 路由规划数据 ===
  routePlanning: {
    routes: any[]
    rplTables: any[]
    planningConfig: RoutePlanningConfig
  }
  
  // === GIS数据 ===
  gisData: {
    layers: string[]
    bounds: { northwest: { lon: number; lat: number }; southeast: { lon: number; lat: number } }
  }
  
  // === 图层设置 ===
  layerSettings: LayerSettings
  
  // === 器件库配置 ===
  componentLibrary: ComponentLibrary
  
  // === 设置 ===
  settings: {
    cableTypes: any[]
    costFactors: any
  }
}

// UCP文件格式定义（路由规划工程）
export interface UCPProject extends BaseProject {
  type: 'ucp'
}

// RPL与SLD文件关联
interface RPLWithSLDFiles {
  rplPath: string               // RPL文件路径
  sldPaths: string[]            // 关联的SLD文件路径列表
}

// USE文件格式定义（传输系统规划工程）
export interface USEProject extends BaseProject {
  type: 'use'
  
  // === RPL与SLD文件关联 ===
  rplSldAssociations: RPLWithSLDFiles[]
  
  // === 传输规划 ===
  transmissionPlanning: {
    sldTables: any[]
    transmissionConfig: TransmissionConfig
    repeaterConfigs: any[]
  }
  
  // === 监控配置 ===
  monitoringConfig: MonitoringConfig
  
  // === 性能结果 ===
  performanceResults: {
    gsnr: number | null
    capacity: number | null
    margin: number | null
  }
}

// 项目类型
export type ProjectType = 'ucp' | 'use'

// 项目元数据
export interface ProjectMetadata {
  name: string
  path: string
  type: ProjectType
  lastModified: string
  creatorId: string
  allowOtherUsers: boolean
}

// 打开项目结果
export interface OpenProjectResult {
  success: boolean
  project?: UCPProject | USEProject
  error?: string
  errorType?: 'permission' | 'format' | 'read'
}

class ProjectFileService {
  private currentProject: ProjectMetadata | null = null
  private isDirty: boolean = false  // 项目是否有未保存的修改

  // 获取当前项目
  getCurrentProject(): ProjectMetadata | null {
    return this.currentProject
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
  checkOpenPermission(project: UCPProject | USEProject): OpenProjectResult {
    const userStore = useUserStore()
    const currentUserId = userStore.currentUser?.id || ''
    
    // 检查是否是项目创建者
    if (project.creatorId && project.creatorId !== currentUserId) {
      // 不是创建者，检查是否允许其他用户打开
      if (!project.allowOtherUsers) {
        return {
          success: false,
          error: '您没有权限打开此项目，该项目不允许其他用户打开',
          errorType: 'permission'
        }
      }
    }
    
    return { success: true, project }
  }

  // 创建新的UCP项目
  createUCPProject(name: string, allowOtherUsers: boolean = false): UCPProject {
    const routeStore = useRouteStore()
    const rplStore = useRPLStore()
    const settingsStore = useSettingsStore()
    const userStore = useUserStore()
    const userId = userStore.currentUser?.id || ''

    // 默认图层设置
    const defaultLayerSettings: LayerSettings = {
      oceanElevation: true,
      volcanoDistribution: false,
      fishingAreaDistribution: false,
      slopeMap: false,
      earthquakeDistribution: true,
      shippingLanes: true,
    }

    // 默认器件库配置
    const defaultComponentLibrary: ComponentLibrary = {
      currentLibrary: 'default',
      customComponents: [],
    }

    // 默认路径规划配置
    const defaultPlanningConfig: RoutePlanningConfig = {
      planningMode: 'manual',
      avoidanceZones: [],
      preferredDepthRange: [200, 4000],
      ...(settingsStore.routePlanningConfig || {}),
    }

    return {
      version: '2.0.0',
      type: 'ucp',
      
      // 项目基本信息
      projectName: name,
      name,  // 兼容旧字段
      creatorUserId: userId,
      creatorId: userId,  // 兼容旧字段
      allowOtherUsers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // 文件引用
      rplFiles: [],
      
      // 路由规划数据
      routePlanning: {
        routes: routeStore.routes,
        rplTables: rplStore.tables,
        planningConfig: defaultPlanningConfig,
      },
      
      // GIS数据
      gisData: {
        layers: [],
        bounds: settingsStore.routePlanningConfig?.planningRange || {
          northwest: { lon: 100, lat: 40 },
          southeast: { lon: 140, lat: 0 }
        },
      },
      
      // 图层设置
      layerSettings: defaultLayerSettings,
      
      // 器件库配置
      componentLibrary: defaultComponentLibrary,
      
      // 设置
      settings: {
        cableTypes: settingsStore.cableTypes || [],
        costFactors: settingsStore.costFactors || {},
      },
    }
  }

  // 创建新的USE项目
  createUSEProject(name: string, allowOtherUsers: boolean = false): USEProject {
    const ucpProject = this.createUCPProject(name, allowOtherUsers)
    const sldStore = useSLDStore()
    const settingsStore = useSettingsStore()
    const rplStore = useRPLStore()

    // 构建RPL与SLD关联
    const rplSldAssociations: RPLWithSLDFiles[] = rplStore.tables.map(rplTable => ({
      rplPath: `${rplTable.name}.rpl`,
      sldPaths: sldStore.tables
        .filter(sld => sld.routeId === rplTable.routeId)
        .map(sld => `${sld.name}.sld`)
    }))

    // 默认传输配置
    const defaultTransmissionConfig: TransmissionConfig = {
      channelCount: 96,
      centerWavelength: 1550,
      channelBandwidth: 50,
      calculationModel: 'GN-Model',
      ...(settingsStore.transmissionConfig || {}),
    }

    // 默认监控配置
    const defaultMonitoringConfig: MonitoringConfig = {
      dataSourceType: 'websocket',
      connectionAddress: '',
      opticalPowerThreshold: -30,
      temperatureThreshold: 45,
      berThreshold: 1e-9,
    }

    return {
      ...ucpProject,
      type: 'use',
      
      // RPL与SLD文件关联
      rplSldAssociations,
      
      // 传输规划
      transmissionPlanning: {
        sldTables: sldStore.tables,
        transmissionConfig: defaultTransmissionConfig,
        repeaterConfigs: [],
      },
      
      // 监控配置
      monitoringConfig: defaultMonitoringConfig,
      
      // 性能结果
      performanceResults: {
        gsnr: null,
        capacity: null,
        margin: null,
      },
    }
  }

  // 保存项目
  saveProject(): boolean {
    if (!this.currentProject) return false
    
    const project = this.currentProject.type === 'use' 
      ? this.createUSEProject(this.currentProject.name)
      : this.createUCPProject(this.currentProject.name)
    
    const content = JSON.stringify(project, null, 2)
    const ext = this.currentProject.type === 'use' ? 'use' : 'ucp'
    this.downloadFile(content, `${this.currentProject.name}.${ext}`, 'application/json')
    
    this.isDirty = false
    return true
  }

  // 导出UCP文件
  exportUCP(name: string, allowOtherUsers: boolean = false): void {
    const project = this.createUCPProject(name, allowOtherUsers)
    const content = JSON.stringify(project, null, 2)
    this.downloadFile(content, `${name}.ucp`, 'application/json')
  }

  // 导出USE文件
  exportUSE(name: string, allowOtherUsers: boolean = false): void {
    const project = this.createUSEProject(name, allowOtherUsers)
    const content = JSON.stringify(project, null, 2)
    this.downloadFile(content, `${name}.use`, 'application/json')
  }

  // 导入项目文件 (.ucp 或 .use)
  async importProject(file: File): Promise<OpenProjectResult> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string
          const project = JSON.parse(content) as UCPProject | USEProject
          
          // 验证文件格式
          if (!project.version || !project.type) {
            resolve({
              success: false,
              error: '无效的项目文件格式',
              errorType: 'format'
            })
            return
          }
          
          if (project.type !== 'ucp' && project.type !== 'use') {
            resolve({
              success: false,
              error: '文件类型不匹配，仅支持 .ucp 和 .use 格式',
              errorType: 'format'
            })
            return
          }
          
          // 检查用户权限
          const permissionResult = this.checkOpenPermission(project)
          if (!permissionResult.success) {
            resolve(permissionResult)
            return
          }
          
          // 加载项目数据到stores
          this.loadProjectToStores(project)
          
          // 如果是USE项目，加载传输规划数据
          if (project.type === 'use') {
            this.loadUSEProjectData(project as USEProject)
          }
          
          // 更新当前项目信息
          this.currentProject = {
            name: project.name,
            path: file.name,
            type: project.type,
            lastModified: project.updatedAt,
            creatorId: project.creatorId || '',
            allowOtherUsers: project.allowOtherUsers || false,
          }
          
          this.isDirty = false
          
          resolve({ success: true, project })
        } catch (error) {
          resolve({
            success: false,
            error: '文件解析失败: ' + (error as Error).message,
            errorType: 'format'
          })
        }
      }
      
      reader.onerror = () => {
        resolve({
          success: false,
          error: '文件读取失败',
          errorType: 'read'
        })
      }
      
      reader.readAsText(file)
    })
  }

  // 加载USE项目特有数据
  private loadUSEProjectData(project: USEProject): void {
    const sldStore = useSLDStore()
    const settingsStore = useSettingsStore()
    
    // 恢复SLD数据
    if (project.transmissionPlanning?.sldTables) {
      sldStore.tables = project.transmissionPlanning.sldTables
    }
    
    // 恢复传输配置
    if (project.transmissionPlanning?.transmissionConfig) {
      if (!settingsStore.transmissionConfig) {
        (settingsStore as any).transmissionConfig = {}
      }
      Object.assign(settingsStore.transmissionConfig, project.transmissionPlanning.transmissionConfig)
    }
    
    // 恢复监控配置
    if (project.monitoringConfig) {
      if (!settingsStore.monitoringConfig) {
        (settingsStore as any).monitoringConfig = {}
      }
      Object.assign(settingsStore.monitoringConfig, project.monitoringConfig)
    }
    
    // 记录RPL与SLD文件关联(供后续使用)
    if (project.rplSldAssociations) {
      console.log('RPL-SLD关联:', project.rplSldAssociations)
    }
  }

  // 关闭当前项目
  closeProject(): void {
    this.currentProject = null
    this.isDirty = false
    
    // 清空 stores
    const routeStore = useRouteStore()
    const rplStore = useRPLStore()
    const sldStore = useSLDStore()
    
    routeStore.routes = []
    rplStore.tables = []
    sldStore.tables = []
  }

  // 加载项目数据到stores
  private loadProjectToStores(project: UCPProject): void {
    const routeStore = useRouteStore()
    const rplStore = useRPLStore()
    const settingsStore = useSettingsStore()
    
    // 恢复路由数据
    if (project.routePlanning?.routes) {
      routeStore.routes = project.routePlanning.routes
    }
    
    // 恢复RPL数据
    if (project.routePlanning?.rplTables) {
      rplStore.tables = project.routePlanning.rplTables
    }
    
    // 恢复规划配置
    if (project.routePlanning?.planningConfig) {
      if (!settingsStore.routePlanningConfig) {
        (settingsStore as any).routePlanningConfig = {}
      }
      Object.assign(settingsStore.routePlanningConfig, project.routePlanning.planningConfig)
    }
    
    // 恢复图层设置
    if (project.layerSettings) {
      if (!settingsStore.layerSettings) {
        (settingsStore as any).layerSettings = {}
      }
      Object.assign(settingsStore.layerSettings, project.layerSettings)
    }
    
    // 恢复器件库配置
    if (project.componentLibrary) {
      if (!settingsStore.componentLibrary) {
        (settingsStore as any).componentLibrary = {}
      }
      Object.assign(settingsStore.componentLibrary, project.componentLibrary)
    }
    
    // 恢复设置
    if (project.settings?.cableTypes) {
      settingsStore.cableTypes = project.settings.cableTypes
    }
    if (project.settings?.costFactors) {
      Object.assign(settingsStore.costFactors, project.settings.costFactors)
    }
  }

  // 下载文件
  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // 打开文件选择器
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

  // 快捷方法：打开项目文件
  async openProjectFile(): Promise<OpenProjectResult> {
    const file = await this.openFileDialog('.ucp,.use')
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
    setCurrentProject: (project: ProjectMetadata | null) => projectFileService.setCurrentProject(project),
    getIsDirty: () => projectFileService.getIsDirty(),
    setIsDirty: (dirty: boolean) => projectFileService.setIsDirty(dirty),
    checkOpenPermission: (project: UCPProject | USEProject) => projectFileService.checkOpenPermission(project),
    createUCPProject: (name: string, allowOtherUsers?: boolean) => projectFileService.createUCPProject(name, allowOtherUsers),
    createUSEProject: (name: string, allowOtherUsers?: boolean) => projectFileService.createUSEProject(name, allowOtherUsers),
    saveProject: () => projectFileService.saveProject(),
    exportUCP: (name: string, allowOtherUsers?: boolean) => projectFileService.exportUCP(name, allowOtherUsers),
    exportUSE: (name: string, allowOtherUsers?: boolean) => projectFileService.exportUSE(name, allowOtherUsers),
    importProject: (file: File) => projectFileService.importProject(file),
    openProjectFile: () => projectFileService.openProjectFile(),
    openFileDialog: (accept: string) => projectFileService.openFileDialog(accept),
    closeProject: () => projectFileService.closeProject(),
  }
}
