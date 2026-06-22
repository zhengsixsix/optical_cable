import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRouteStore } from '@/stores/route'
import type { Route } from '@/types'

function routeFixture(overrides: Partial<Route> = {}): Route {
  return {
    id: 'real-route',
    name: 'Real Route',
    points: [
      { id: 'real-p0', coordinates: [120, 30], type: 'landing' },
      { id: 'real-p1', coordinates: [121, 31], type: 'landing' },
    ],
    segments: [
      { id: 'real-s0', startPointId: 'real-p0', endPointId: 'real-p1', length: 100, depth: 1200, cableType: 'LW', riskLevel: 'low', cost: 0 },
    ],
    totalLength: 100,
    totalCost: 0,
    riskScore: 0.1,
    cost: { cable: 0, installation: 0, equipment: 0, total: 0 },
    risk: { seismic: 0.1, volcanic: 0.1, depth: 0.1, overall: 0.1 },
    distance: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('transmission planning debug route', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates and selects a mock route when transmission planning has no route data', () => {
    const routeStore = useRouteStore()

    const route = routeStore.ensureTransmissionMockRoute()

    expect(route.id).toBe('transmission-debug-route')
    expect(route.name).toContain('调试')
    expect(routeStore.selectedRoute?.id).toBe(route.id)
    expect(routeStore.paretoRoutes).toHaveLength(1)
    expect(route.points.filter(point => point.type === 'landing')).toHaveLength(2)
    expect(route.segments).toHaveLength(route.points.length - 1)
    expect(route.totalLength).toBeGreaterThan(0)
    expect(route.rawTrunkCoordinates).toEqual(route.points.map(point => point.coordinates))
  })

  it('reuses existing route data instead of replacing it with the mock route', () => {
    const routeStore = useRouteStore()
    routeStore.setParetoRoutes([routeFixture()])

    const route = routeStore.ensureTransmissionMockRoute()

    expect(route.id).toBe('real-route')
    expect(routeStore.paretoRoutes).toHaveLength(1)
    expect(routeStore.paretoRoutes[0].id).toBe('real-route')
  })
})
