import type { IRouteRepository } from '../interfaces'
import type { Route, RouteSegment } from '@/types'

// Mock 路由数据：展示成本与风险的权衡
const mockRoutes: Route[] = [
  {
    id: 'route-1',
    name: '路径 1 (成本优先)',
    points: [
      { id: 'p1-1', coordinates: [120.5, 30.2], type: 'landing', name: '上海登陆站' },
      { id: 'p1-2', coordinates: [125.3, 28.5], type: 'waypoint' },
      { id: 'p1-3', coordinates: [130.1, 25.8], type: 'repeater', name: '中继器 1' },
      { id: 'p1-4', coordinates: [135.0, 24.0], type: 'landing', name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's1-1', startPointId: 'p1-1', endPointId: 'p1-2', length: 520, depth: 2500, cableType: 'lw', riskLevel: 'medium', cost: 7800000 },
      { id: 's1-2', startPointId: 'p1-2', endPointId: 'p1-3', length: 480, depth: 4200, cableType: 'lw', riskLevel: 'high', cost: 7200000 },
      { id: 's1-3', startPointId: 'p1-3', endPointId: 'p1-4', length: 550, depth: 3100, cableType: 'lw', riskLevel: 'medium', cost: 8250000 },
    ],
    totalLength: 1550,
    totalCost: 23250000,
    riskScore: 0.65,
    cost: { cable: 18000000, installation: 3500000, equipment: 1750000, total: 23250000 },
    risk: { seismic: 0.7, volcanic: 0.5, depth: 0.6, overall: 0.65 },
    distance: 1550,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  },
  {
    id: 'route-2',
    name: '路径 2 (均衡)',
    points: [
      { id: 'p2-1', coordinates: [120.5, 30.2], type: 'landing', name: '上海登陆站' },
      { id: 'p2-2', coordinates: [123.0, 27.0], type: 'waypoint' },
      { id: 'p2-3', coordinates: [127.5, 26.0], type: 'repeater', name: '中继器 A' },
      { id: 'p2-4', coordinates: [131.0, 25.0], type: 'repeater', name: '中继器 B' },
      { id: 'p2-5', coordinates: [135.0, 24.0], type: 'landing', name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's2-1', startPointId: 'p2-1', endPointId: 'p2-2', length: 420, depth: 1800, cableType: 'sa', riskLevel: 'low', cost: 10500000 },
      { id: 's2-2', startPointId: 'p2-2', endPointId: 'p2-3', length: 480, depth: 3500, cableType: 'lw', riskLevel: 'medium', cost: 7200000 },
      { id: 's2-3', startPointId: 'p2-3', endPointId: 'p2-4', length: 400, depth: 2800, cableType: 'lw', riskLevel: 'low', cost: 6000000 },
      { id: 's2-4', startPointId: 'p2-4', endPointId: 'p2-5', length: 450, depth: 2200, cableType: 'sa', riskLevel: 'low', cost: 11250000 },
    ],
    totalLength: 1750,
    totalCost: 34950000,
    riskScore: 0.35,
    cost: { cable: 26000000, installation: 5250000, equipment: 3700000, total: 34950000 },
    risk: { seismic: 0.3, volcanic: 0.2, depth: 0.45, overall: 0.35 },
    distance: 1750,
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-02-10'),
  },
  {
    id: 'route-3',
    name: '路径 3 (安全优先)',
    points: [
      { id: 'p3-1', coordinates: [120.5, 30.2], type: 'landing', name: '上海登陆站' },
      { id: 'p3-2', coordinates: [122.0, 28.0], type: 'waypoint' },
      { id: 'p3-3', coordinates: [125.0, 26.5], type: 'repeater', name: '中继器 X' },
      { id: 'p3-4', coordinates: [128.0, 25.5], type: 'repeater', name: '中继器 Y' },
      { id: 'p3-5', coordinates: [131.5, 24.8], type: 'repeater', name: '中继器 Z' },
      { id: 'p3-6', coordinates: [135.0, 24.0], type: 'landing', name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's3-1', startPointId: 'p3-1', endPointId: 'p3-2', length: 300, depth: 800, cableType: 'da', riskLevel: 'low', cost: 10500000 },
      { id: 's3-2', startPointId: 'p3-2', endPointId: 'p3-3', length: 350, depth: 1500, cableType: 'sa', riskLevel: 'low', cost: 8750000 },
      { id: 's3-3', startPointId: 'p3-3', endPointId: 'p3-4', length: 320, depth: 1800, cableType: 'sa', riskLevel: 'low', cost: 8000000 },
      { id: 's3-4', startPointId: 'p3-4', endPointId: 'p3-5', length: 380, depth: 2000, cableType: 'sa', riskLevel: 'low', cost: 9500000 },
      { id: 's3-5', startPointId: 'p3-5', endPointId: 'p3-6', length: 400, depth: 1200, cableType: 'da', riskLevel: 'low', cost: 14000000 },
    ],
    totalLength: 1750,
    totalCost: 50750000,
    riskScore: 0.15,
    cost: { cable: 38000000, installation: 5250000, equipment: 7500000, total: 50750000 },
    risk: { seismic: 0.1, volcanic: 0.1, depth: 0.25, overall: 0.15 },
    distance: 1750,
    createdAt: new Date('2024-03-20'),
    updatedAt: new Date('2024-03-20'),
  },
]


export class MockRouteRepository implements IRouteRepository {
  private routes: Route[] = [...mockRoutes]

  async getRoutes(): Promise<Route[]> {
    await new Promise(resolve => setTimeout(resolve, 100))
    return [...this.routes]
  }

  async getRouteById(id: string): Promise<Route | null> {
    await new Promise(resolve => setTimeout(resolve, 50))
    return this.routes.find(r => r.id === id) || null
  }

  async saveRoute(route: Route): Promise<Route> {
    await new Promise(resolve => setTimeout(resolve, 100))

    const index = this.routes.findIndex(r => r.id === route.id)
    if (index >= 0) {
      this.routes[index] = { ...route, updatedAt: new Date() }
    } else {
      this.routes.push({ ...route, createdAt: new Date(), updatedAt: new Date() })
    }
    return route
  }

  async deleteRoute(id: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50))
    this.routes = this.routes.filter(r => r.id !== id)
  }

  async getSegmentDetails(segmentId: string): Promise<RouteSegment | null> {
    await new Promise(resolve => setTimeout(resolve, 50))

    for (const route of this.routes) {
      const segment = route.segments.find(s => s.id === segmentId)
      if (segment) return segment
    }
    return null
  }
}
