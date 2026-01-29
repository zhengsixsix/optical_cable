import type { IDataSource, RouteData, LayerData, DeviceData, ProjectData } from '../DataSource'

/**
 * Mock 数据源实现
 * 用于开发和测试环境
 */
export class MockDataSource implements IDataSource {
  private routes: Map<string, RouteData> = new Map()
  private layers: Map<string, LayerData> = new Map()
  private devices: Map<string, DeviceData> = new Map()

  constructor() {
    this.initMockData()
  }

  private initMockData() {
    // 初始化模拟路由数据
    const mockRoutes: RouteData[] = [
      {
        id: 'route-1',
        name: '中日海缆',
        coordinates: [[121.47, 31.23], [139.69, 35.68]],
        distance: 1800,
        status: 'planned',
      },
      {
        id: 'route-2',
        name: '跨太平洋海缆',
        coordinates: [[121.47, 31.23], [-122.41, 37.77]],
        distance: 10000,
        status: 'active',
      },
    ]
    mockRoutes.forEach(r => this.routes.set(r.id, r))

    // 初始化模拟图层数据
    const mockLayers: LayerData[] = [
      { id: 'layer-1', name: '海洋高程图', type: 'elevation', visible: true },
      { id: 'layer-2', name: '海洋火山分布', type: 'volcano', visible: false },
      { id: 'layer-3', name: '海洋渔区分布', type: 'fishery', visible: true },
      { id: 'layer-4', name: '海洋航道图', type: 'shipping', visible: true },
    ]
    mockLayers.forEach(l => this.layers.set(l.id, l))

    // 初始化模拟设备数据
    const mockDevices: DeviceData[] = [
      { id: 'device-1', name: '中继器 A', type: 'repeater', specs: { power: 100 } },
      { id: 'device-2', name: '分支器 B', type: 'branching-unit', specs: { ports: 4 } },
    ]
    mockDevices.forEach(d => this.devices.set(d.id, d))
  }

  // 路由相关
  async getRoutes(): Promise<RouteData[]> {
    await this.delay()
    return Array.from(this.routes.values())
  }

  async getRoute(id: string): Promise<RouteData | null> {
    await this.delay()
    return this.routes.get(id) || null
  }

  async saveRoute(route: RouteData): Promise<void> {
    await this.delay()
    this.routes.set(route.id, route)
  }

  async deleteRoute(id: string): Promise<void> {
    await this.delay()
    this.routes.delete(id)
  }

  // 图层相关
  async getLayers(): Promise<LayerData[]> {
    await this.delay()
    return Array.from(this.layers.values())
  }

  async getLayer(id: string): Promise<LayerData | null> {
    await this.delay()
    return this.layers.get(id) || null
  }

  async saveLayer(layer: LayerData): Promise<void> {
    await this.delay()
    this.layers.set(layer.id, layer)
  }

  async deleteLayer(id: string): Promise<void> {
    await this.delay()
    this.layers.delete(id)
  }

  // 设备相关
  async getDevices(): Promise<DeviceData[]> {
    await this.delay()
    return Array.from(this.devices.values())
  }

  async getDevice(id: string): Promise<DeviceData | null> {
    await this.delay()
    return this.devices.get(id) || null
  }

  async saveDevice(device: DeviceData): Promise<void> {
    await this.delay()
    this.devices.set(device.id, device)
  }

  async deleteDevice(id: string): Promise<void> {
    await this.delay()
    this.devices.delete(id)
  }

  // 项目相关
  async loadProject(file: File): Promise<ProjectData> {
    await this.delay(500)
    const text = await file.text()
    return JSON.parse(text)
  }

  async saveProject(project: ProjectData): Promise<Blob> {
    await this.delay(500)
    const json = JSON.stringify(project, null, 2)
    return new Blob([json], { type: 'application/json' })
  }

  // 模拟网络延迟
  private delay(ms: number = 100): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
