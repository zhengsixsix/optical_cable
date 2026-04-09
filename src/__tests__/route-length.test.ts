import { describe, expect, it } from 'vitest'
import { calculatePolylineLengthKm, calculateRouteTrunkLengthKm } from '@/utils/routeLength'

describe('route trunk length utility', () => {
  it('prefers trunk-* segments over branch segments', () => {
    const length = calculateRouteTrunkLengthKm({
      segments: [
        { id: 'trunk-1', length: 120 },
        { id: 'trunk-2', length: 80 },
        { id: 'branch-1', length: 60 },
      ] as any,
      totalLength: 260,
    })

    expect(length).toBe(200)
  })

  it('falls back to non-branch segments when trunk-* ids are unavailable', () => {
    const length = calculateRouteTrunkLengthKm({
      segments: [
        { id: 'seg-1', length: 90 },
        { id: 'branch-2', length: 70 },
        { id: 'seg-2', length: 60 },
      ] as any,
      totalLength: 220,
    })

    expect(length).toBe(150)
  })

  it('falls back to raw trunk coordinates when segment metadata is missing', () => {
    const coords: [number, number][] = [
      [120.0, 20.0],
      [120.1, 20.0],
      [120.2, 20.0],
    ]
    const polylineLength = calculatePolylineLengthKm(coords)
    const trunkLength = calculateRouteTrunkLengthKm({
      rawTrunkCoordinates: coords,
      totalLength: 999,
    })

    expect(trunkLength).toBeCloseTo(polylineLength, 6)
    expect(trunkLength).toBeGreaterThan(20)
  })

  it('uses route total length as the final fallback', () => {
    const trunkLength = calculateRouteTrunkLengthKm({ totalLength: 512 })
    expect(trunkLength).toBe(512)
  })
})
