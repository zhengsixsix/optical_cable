/**
 * 项目文件服务
 * 支持 .ucp (路由规划工程) 和 .ure (传输系统规划工程) 格式
 */

import { useRouteStore, useRPLStore, useSLDStore, useSettingsStore } from '@/stores'

// 基础项目接口
interface BaseProject {
  version: string
  name: string
  createdAt: string
  updatedAt: string
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

// URE文件格式定义（传输系统规划工程）
export interface UREProject extends BaseProject {
  type: 'ure'
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

// 项目元数据
export interface ProjectMetadata {
  name: string
  path: string
  type: 'ucp' | 'ure'
  lastModified: string
}

class ProjectFileService {
  private currentProject: ProjectMetadata | null = null

  // 获取当前项目
  getCurrentProject(): ProjectMetadata | null {
    return this.currentProject
  }

  // 创建新的UCP项目
  createUCPProject(name: string): UCPProject {
    const routeStore = useRouteStore()
    const rplStore = useRPLStore()
    const settingsStore = useSettingsStore()

    return {
      version: '1.0.0',
      type: 'ucp',
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  // 创建新的URE项目
  createUREProject(name: string): UREProject {
    const ucpProject = this.createUCPProject(name)
    const sldStore = useSLDStore()
    const settingsStore = useSettingsStore()

    return {
      ...ucpProject,
      type: 'ure',
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

  // 导出UCP文件
  exportUCP(name: string): void {
    const project = this.createUCPProject(name)
    const content = JSON.stringify(project, null, 2)
    this.downloadFile(content, `${name}.ucp`, 'application/json')
  }

  // 导出URE文件
  exportURE(name: string): void {
    const project = this.createUREProject(name)
    const content = JSON.stringify(project, null, 2)
    this.downloadFile(content, `${name}.ure`, 'application/json')
  }

  // 导入UCP文件
  async importUCP(file: File): Promise<UCPProject> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string
          const project = JSON.parse(content) as UCPProject
          
          // 验证文件格式
          if (!project.version || !project.type) {
            throw new Error('无效的UCP文件格式')
          }
          
          if (project.type !== 'ucp' && project.type !== 'ure') {
            throw new Error('文件类型不匹配')
          }
          
          // 加载项目数据到stores
          this.loadProjectToStores(project)
          
          // 更新当前项目信息
          this.currentProject = {
            name: project.name,
            path: file.name,
            type: project.type,
            lastModified: project.updatedAt,
          }
          
          resolve(project)
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => {
        reject(new Error('文件读取失败'))
      }
      
      reader.readAsText(file)
    })
  }

  // 导入URE文件
  async importURE(file: File): Promise<UREProject> {
    const baseProject = await this.importUCP(file)
    const project = baseProject as unknown as UREProject
    
    if (project.type !== 'ure') {
      throw new Error('不是有效的URE文件，请使用.ure格式文件')
    }
    
    // 加载传输规划数据
    if (project.transmissionPlanning) {
      const sldStore = useSLDStore()
      const settingsStore = useSettingsStore()
      
      // 恢复SLD数据
      if (project.transmissionPlanning.sldTables) {
        project.transmissionPlanning.sldTables.forEach(table => {
          sldStore.tables.push(table)
        })
      }
      
      // 恢复传输配置
      if (project.transmissionPlanning.transmissionConfig) {
        Object.assign(settingsStore.transmissionConfig, project.transmissionPlanning.transmissionConfig)
      }
    }
    
    return project
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

  // 快捷方法：打开UCP文件
  async openUCPFile(): Promise<UCPProject | null> {
    const file = await this.openFileDialog('.ucp')
    if (!file) return null
    return this.importUCP(file)
  }

  // 快捷方法：打开URE文件
  async openUREFile(): Promise<UREProject | null> {
    const file = await this.openFileDialog('.ure')
    if (!file) return null
    return this.importURE(file)
  }
}

// 单例导出
export const projectFileService = new ProjectFileService()

// Composable
export function useProjectFile() {
  return {
    getCurrentProject: () => projectFileService.getCurrentProject(),
    createUCPProject: (name: string) => projectFileService.createUCPProject(name),
    createUREProject: (name: string) => projectFileService.createUREProject(name),
    exportUCP: (name: string) => projectFileService.exportUCP(name),
    exportURE: (name: string) => projectFileService.exportURE(name),
    importUCP: (file: File) => projectFileService.importUCP(file),
    importURE: (file: File) => projectFileService.importURE(file),
    openUCPFile: () => projectFileService.openUCPFile(),
    openUREFile: () => projectFileService.openUREFile(),
  }
}
