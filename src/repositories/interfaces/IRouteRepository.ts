import type { Route, RouteSegment } from '@/types'

export interface IRouteRepository {
  getRoutes(): Promise<Route[]>
  getRouteById(id: string): Promise<Route | null>
  saveRoute(route: Route): Promise<Route>
  deleteRoute(id: string): Promise<void>
  getSegmentDetails(segmentId: string): Promise<RouteSegment | null>
}
