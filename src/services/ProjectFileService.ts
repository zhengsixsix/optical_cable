/**
 * 项目文件服务
 * 支持 .ucp (路由规划工程) 和 .use (传输系统规划工程) 格式
 */

import { useRouteStore, useRPLStore, useSLDStore, useSettingsStore, useUserStore } from '@/stores'

// 基础项目接口
interface BaseProject {
  version: string
  name: string
  createdAt: string
  updatedAt: string
  creatorId: string           // 创建者用户ID
  allowOtherUsers: boolean    // 是否允许其他用户打开
  routePlanning: {
    routes: any[]
    rplTables: any[]
    planningConfig: any
  }
  gisData: {
    layers: string[]
    bounds: { northwest: { lon: number; lat: number }; southeast: { lon: number; lat: number } }
  }
  settings: {
    cableTypes: any[]
    costFactors: any
  }
}

// UCP文件格式定义（路由规划工程）
export interface UCPProject extends BaseProject {
  type: 'ucp'
}

// USE文件格式定义（传输系统规划工程）
export interface USEProject extends BaseProject {
  type: 'use'
  transmissionPlanning: {
    sldTables: any[]
    transmissionConfig: any
    repeaterConfigs: any[]
  }
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

    return {
      version: '1.0.0',
      type: 'ucp',
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorId: userStore.currentUser?.id || '',
      allowOtherUsers,
      routePlanning: {
        routes: routeStore.routes,
        rplTables: rplStore.tables,
        planningConfig: settingsStore.routePlanningConfig,
      },
      gisData: {
        layers: [],
        bounds: settingsStore.routePlanningConfig.planningRange,
      },
      settings: {
        cableTypes: settingsStore.cableTypes,
        costFactors: settingsStore.costFactors,
      },
    }
  }

  // 创建新的USE项目
  createUSEProject(name: string, allowOtherUsers: boolean = false): USEProject {
    const ucpProject = this.createUCPProject(name, allowOtherUsers)
    const sldStore = useSLDStore()
    const settingsStore = useSettingsStore()

    return {
      ...ucpProject,
      type: 'use',
      transmissionPlanning: {
        sldTables: sldStore.tables,
        transmissionConfig: settingsStore.transmissionConfig,
        repeaterConfigs: [],
      },
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
    if (project.transmissionPlanning) {
      const sldStore = useSLDStore()
      const settingsStore = useSettingsStore()
      
      // 恢复SLD数据
      if (project.transmissionPlanning.sldTables) {
        sldStore.tables = project.transmissionPlanning.sldTables
      }
      
      // 恢复传输配置
      if (project.transmissionPlanning.transmissionConfig) {
        Object.assign(settingsStore.transmissionConfig, project.transmissionPlanning.transmissionConfig)
      }
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
      Object.assign(settingsStore.routePlanningConfig, project.routePlanning.planningConfig)
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
