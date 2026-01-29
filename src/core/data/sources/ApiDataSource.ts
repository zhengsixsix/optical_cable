import type { IDataSource, RouteData, LayerData, DeviceData, ProjectData } from '../DataSource'

/**
 * API 数据源实现
 * 用于生产环境，连接后端 API
 */
export class ApiDataSource implements IDataSource {
  private baseUrl: string

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  // 路由相关
  async getRoutes(): Promise<RouteData[]> {
    return this.request<RouteData[]>('/routes')
  }

  async getRoute(id: string): Promise<RouteData | null> {
    try {
      return await this.request<RouteData>(`/routes/${id}`)
    } catch {
      return null
    }
  }

  async saveRoute(route: RouteData): Promise<void> {
    await this.request(`/routes/${route.id}`, {
      method: 'PUT',
      body: JSON.stringify(route),
    })
  }

  async deleteRoute(id: string): Promise<void> {
    await this.request(`/routes/${id}`, { method: 'DELETE' })
  }

  // 图层相关
  async getLayers(): Promise<LayerData[]> {
    return this.request<LayerData[]>('/layers')
  }

  async getLayer(id: string): Promise<LayerData | null> {
    try {
      return await this.request<LayerData>(`/layers/${id}`)
    } catch {
      return null
    }
  }

  async saveLayer(layer: LayerData): Promise<void> {
    await this.request(`/layers/${layer.id}`, {
      method: 'PUT',
      body: JSON.stringify(layer),
    })
  }

  async deleteLayer(id: string): Promise<void> {
    await this.request(`/layers/${id}`, { method: 'DELETE' })
  }

  // 设备相关
  async getDevices(): Promise<DeviceData[]> {
    return this.request<DeviceData[]>('/devices')
  }

  async getDevice(id: string): Promise<DeviceData | null> {
    try {
      return await this.request<DeviceData>(`/devices/${id}`)
    } catch {
      return null
    }
  }

  async saveDevice(device: DeviceData): Promise<void> {
    await this.request(`/devices/${device.id}`, {
      method: 'PUT',
      body: JSON.stringify(device),
    })
  }

  async deleteDevice(id: string): Promise<void> {
    await this.request(`/devices/${id}`, { method: 'DELETE' })
  }

  // 项目相关
  async loadProject(file: File): Promise<ProjectData> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${this.baseUrl}/projects/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Failed to upload project')
    }

    return response.json()
  }

  async saveProject(project: ProjectData): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/projects/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })

    if (!response.ok) {
      throw new Error('Failed to download project')
    }

    return response.blob()
  }
}
