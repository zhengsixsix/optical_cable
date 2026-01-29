/**
 * 数据源抽象接口
 * 定义所有数据操作的标准接口
 */

// 路由数据类型
export interface RouteData {
  id: string
  name: string
  coordinates: [number, number][]
  distance?: number
  status?: string
}

// 图层数据类型
export interface LayerData {
  id: string
  name: string
  type: string
  visible: boolean
  data?: any
}

// 设备数据类型
export interface DeviceData {
  id: string
  name: string
  type: string
  specs?: Record<string, any>
}

// 项目数据类型
export interface ProjectData {
  id: string
  name: string
  type: 'ucp' | 'use'
  routes: RouteData[]
  layers: LayerData[]
  createdAt: string
  updatedAt: string
}

/**
 * 数据源接口
 */
export interface IDataSource {
  // 路由相关
  getRoutes(): Promise<RouteData[]>
  getRoute(id: string): Promise<RouteData | null>
  saveRoute(route: RouteData): Promise<void>
  deleteRoute(id: string): Promise<void>

  // 图层相关
  getLayers(): Promise<LayerData[]>
  getLayer(id: string): Promise<LayerData | null>
  saveLayer(layer: LayerData): Promise<void>
  deleteLayer(id: string): Promise<void>

  // 设备相关
  getDevices(): Promise<DeviceData[]>
  getDevice(id: string): Promise<DeviceData | null>
  saveDevice(device: DeviceData): Promise<void>
  deleteDevice(id: string): Promise<void>

  // 项目相关
  loadProject(file: File): Promise<ProjectData>
  saveProject(project: ProjectData): Promise<Blob>
}
