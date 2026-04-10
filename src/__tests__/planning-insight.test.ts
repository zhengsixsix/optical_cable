import { describe, expect, it } from 'vitest'
import type { ArmorMapping } from '@/stores/settings'
import type { CableSegment } from '@/types/cableSegment'
import {
  buildRouteRiskCostSummary,
  validateCableSegments,
  validateRouteGeometry,
} from '@/services/PlanningInsightService'

const armorMappings: ArmorMapping[] = [
  { riskLevel: 'high', riskThreshold: 0.8, cableTypeId: 'DA-01', cableTypeName: 'DA', unitPrice: 24 },
  { riskLevel: 'medium', riskThreshold: 0.5, cableTypeId: 'SA-01', cableTypeName: 'SA', unitPrice: 19.5 },
  { riskLevel: 'low', riskThreshold: 0.2, cableTypeId: 'LW-01', cableTypeName: 'LW', unitPrice: 15 },
]

describe('PlanningInsightService', () => {
  it('aggregates route risk cost by band', () => {
    const summary = buildRouteRiskCostSummary({
      segments: [
        { length: 40, riskLevel: 'high' },
        { length: 30, riskLevel: 'medium' },
        { length: 20, riskLevel: 'low' },
      ],
    } as any, armorMappings)

    expect(summary).not.toBeNull()
    expect(summary?.totalLength).toBe(90)
    expect(summary?.totalCost).toBeCloseTo(40 * 24 + 30 * 19.5 + 20 * 15)
    expect(summary?.bands.map(band => band.riskLevel)).toEqual(['high', 'medium', 'low'])
  })

  it('flags self-intersecting route geometry', () => {
    const result = validateRouteGeometry({
      points: [
        { id: 'p1', coordinates: [0, 0] },
        { id: 'p2', coordinates: [2, 2] },
        { id: 'p3', coordinates: [0, 2] },
        { id: 'p4', coordinates: [2, 0] },
        { id: 'p5', coordinates: [4, 2] },
      ],
      segments: [
        { length: 10 },
        { length: 10 },
        { length: 10 },
        { length: 10 },
      ],
      totalLength: 40,
    } as any)

    expect(result.valid).toBe(false)
    expect(result.errors.some(issue => issue.id.includes('geometry-intersection'))).toBe(true)
  })

  it('warns when cable type grade is too low for segment risk', () => {
    const segments: CableSegment[] = [
      {
        id: 'seg-1',
        routeId: 'route-1',
        startKp: 0,
        endKp: 80,
        length: 80,
        riskLevel: 'high',
        cableTypeId: 'LW-01',
        cableTypeName: 'LW',
        armorType: 'light',
        slack: 4,
        burialDepth: 1.5,
      },
    ]

    const result = validateCableSegments(segments, { method: 'fixed-length', targetLength: 50 }, armorMappings)

    expect(result.valid).toBe(true)
    expect(result.warnings.some(issue => issue.id.endsWith('armor-warning'))).toBe(true)
    expect(result.warnings.some(issue => issue.id.endsWith('burial-warning'))).toBe(true)
  })
})
