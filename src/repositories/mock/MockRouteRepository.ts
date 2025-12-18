import type { IRouteRepository } from '../interfaces'
import type { Route, RouteSegment } from '@/types'
import { mockRoutes as importedMockRoutes } from '@/data/mockData'


export class MockRouteRepository implements IRouteRepository {
  private routes: Route[] = JSON.parse(JSON.stringify(importedMockRoutes))

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
