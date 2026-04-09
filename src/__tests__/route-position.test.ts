import { describe, expect, it } from 'vitest'
import { enrichOrderedRoutePointsWithDepth, getRoutePositionAtKP } from '@/utils/routePosition'
import type { Route } from '@/types'

describe('route position utility', () => {
  it('prefers RPL records for depth interpolation when available', () => {
    const position = getRoutePositionAtKP(50, null, {
      rplRecords: [
        { sequence: 1, kp: 0, longitude: 120, latitude: 20, depth: 20, cableType: 'DA' },
        { sequence: 2, kp: 100, longitude: 121, latitude: 21, depth: 2020, cableType: 'LW' },
      ],
    })

    expect(position).toMatchObject({
      longitude: 120.5,
      latitude: 20.5,
      depth: 1020,
      cableType: 'LW',
      source: 'rpl',
    })
  })

  it('falls back to route segments when route points do not carry depth', () => {
    const route: Pick<Route, 'points' | 'segments'> = {
      points: [
        { id: 'land-a', coordinates: [0, 0], type: 'landing', name: 'A' },
        { id: 'mid', coordinates: [0, 1], type: 'waypoint', name: 'M' },
        { id: 'land-b', coordinates: [0, 2], type: 'landing', name: 'B' },
      ],
      segments: [
        { id: 'seg-1', startPointId: 'land-a', endPointId: 'mid', length: 100, depth: 80, cableType: 'DA', riskLevel: 'high', cost: 0 },
        { id: 'seg-2', startPointId: 'mid', endPointId: 'land-b', length: 100, depth: 2200, cableType: 'LW', riskLevel: 'low', cost: 0 },
      ],
    }

    expect(getRoutePositionAtKP(50, route, { configuredTotalLength: 200 })).toMatchObject({
      depth: 80,
      cableType: 'DA',
      source: 'route-segment',
    })

    expect(getRoutePositionAtKP(150, route, { configuredTotalLength: 200 })).toMatchObject({
      depth: 2200,
      cableType: 'LW',
      source: 'route-segment',
    })
  })

  it('backfills ordered route point depth from matching RPL records', () => {
    const route: Pick<Route, 'points' | 'segments'> = {
      points: [
        { id: 'land-a', coordinates: [120, 20], type: 'landing', name: 'A' },
        { id: 'mid', coordinates: [121, 21], type: 'waypoint', name: 'M' },
        { id: 'land-b', coordinates: [122, 22], type: 'landing', name: 'B' },
      ],
      segments: [],
    }

    const enriched = enrichOrderedRoutePointsWithDepth(route.points, route, {
      configuredTotalLength: 200,
      rplRecords: [
        { sequence: 1, kp: 0, longitude: 120, latitude: 20, depth: 10, cableType: 'DA' },
        { sequence: 2, kp: 100, longitude: 121, latitude: 21, depth: 1100, cableType: 'SA' },
        { sequence: 3, kp: 200, longitude: 122, latitude: 22, depth: 2600, cableType: 'LW' },
      ],
    })

    expect(enriched[0].depth).toBe(10)
    expect(enriched[1].depth).toBeGreaterThan(10)
    expect(enriched[2].depth).toBe(2600)
  })
})
