/**
 * 前端关键服务单元测试
 */

import { beforeEach, describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  decimalToDMS,
  calculateMeridionalParts,
  calculateDistanceKm,
  calculateDistanceNauticalMiles,
  calculateCourseRadians,
  calculateBearingTrue,
} from '@/services/RPLExportService'
import { OpticalSimulationService } from '@/services/OpticalSimulationService'
import { ReportExportService } from '@/services/ReportExportService'
import { projectFileService } from '@/services/ProjectFileService'
import { useSettingsStore } from '@/stores/settings'

// ── RPL 计算函数 ──

describe('RPLExportService - 坐标转换', () => {
  it('decimalToDMS 正确转换纬度', () => {
    const result = decimalToDMS(1.29, true)
    expect(result).toContain('N')
    expect(result).toContain('1°')
  })

  it('decimalToDMS 正确处理南半球', () => {
    const result = decimalToDMS(-33.86, true)
    expect(result).toContain('S')
    expect(result).toContain('33°')
  })

  it('decimalToDMS 正确转换经度', () => {
    const result = decimalToDMS(103.85, false)
    expect(result).toContain('E')
    expect(result).toContain('103°')
  })

  it('decimalToDMS 西经', () => {
    const result = decimalToDMS(-73.97, false)
    expect(result).toContain('W')
    expect(result).toContain('73°')
  })
})

describe('RPLExportService - 墨卡托投影', () => {
  it('calculateMeridionalParts 赤道返回 0', () => {
    expect(calculateMeridionalParts(0)).toBeCloseTo(0, 1)
  })

  it('calculateMeridionalParts 北纬为正', () => {
    expect(calculateMeridionalParts(45)).toBeGreaterThan(0)
  })

  it('calculateMeridionalParts 南纬为负', () => {
    expect(calculateMeridionalParts(-30)).toBeLessThan(0)
  })

  it('calculateMeridionalParts 对称性', () => {
    const north = calculateMeridionalParts(30)
    const south = calculateMeridionalParts(-30)
    expect(north).toBeCloseTo(-south, 1)
  })
})

describe('RPLExportService - 距离计算', () => {
  it('calculateDistanceKm 同一点距离为 0', () => {
    expect(calculateDistanceKm(0, 0, 0, 0)).toBeCloseTo(0, 3)
  })

  it('calculateDistanceKm 赤道上经度差 1° ≈ 111 km', () => {
    const dist = calculateDistanceKm(0, 0, 0, 1)
    expect(dist).toBeGreaterThan(100)
    expect(dist).toBeLessThan(120)
  })

  it('calculateDistanceKm 已知距离: 北京-上海 ≈ 1068 km', () => {
    const dist = calculateDistanceKm(39.9, 116.4, 31.2, 121.5)
    expect(dist).toBeGreaterThan(900)
    expect(dist).toBeLessThan(1200)
  })

  it('calculateDistanceNauticalMiles 与 km 一致 (1nm ≈ 1.852 km)', () => {
    const km = calculateDistanceKm(0, 0, 1, 0)
    const nm = calculateDistanceNauticalMiles(0, 0, 1, 0)
    expect(km / nm).toBeCloseTo(1.852, 1)
  })
})

describe('RPLExportService - 航向计算', () => {
  it('正北方向航向接近 0°', () => {
    const course = calculateCourseRadians(0, 0, 1, 0)
    const bearing = calculateBearingTrue(course)
    expect(bearing).toBeCloseTo(0, -1) // 约 0°
  })

  it('正东方向航向接近 90°', () => {
    const course = calculateCourseRadians(0, 0, 0, 1)
    const bearing = calculateBearingTrue(course)
    expect(bearing).toBeCloseTo(90, -1) // 约 90°
  })

  it('正南方向航向接近 180°', () => {
    const course = calculateCourseRadians(1, 0, 0, 0)
    const bearing = calculateBearingTrue(course)
    expect(bearing).toBeCloseTo(180, -1) // 约 180°
  })

  it('航向范围 0-360°', () => {
    const course = calculateCourseRadians(0, 0, -1, -1)
    const bearing = calculateBearingTrue(course)
    expect(bearing).toBeGreaterThanOrEqual(0)
    expect(bearing).toBeLessThan(360)
  })
})

// ── OpticalSimulationService ──

describe('OpticalSimulationService - quickEstimateGSNR', () => {
  const service = new OpticalSimulationService()

  it('returns high GSNR for short links', () => {
    const result = service.quickEstimateGSNR(100)
    expect(result.gsnr).toBeGreaterThan(20)
    expect(result.feasible).toBe(true)
  })

  it('returns lower GSNR for long links', () => {
    const short = service.quickEstimateGSNR(100)
    const long = service.quickEstimateGSNR(10000)
    expect(long.gsnr).toBeLessThan(short.gsnr)
  })

  it('returns feasible=false when GSNR is too low', () => {
    // Very long link with bad parameters
    const result = service.quickEstimateGSNR(50000, 80, 0, 6, 0.25)
    expect(result.feasible).toBe(false)
    expect(result.margin).toBeLessThan(0)
  })

  it('handles zero length gracefully', () => {
    const result = service.quickEstimateGSNR(0)
    expect(result.gsnr).toBe(30)
    expect(result.feasible).toBe(true)
  })

  it('higher NF gives lower GSNR', () => {
    const lowNf = service.quickEstimateGSNR(5000, 80, 0, 4.5)
    const highNf = service.quickEstimateGSNR(5000, 80, 0, 6.0)
    expect(highNf.gsnr).toBeLessThan(lowNf.gsnr)
  })

  it('higher attenuation gives lower GSNR', () => {
    const lowAlpha = service.quickEstimateGSNR(5000, 80, 0, 5, 0.16)
    const highAlpha = service.quickEstimateGSNR(5000, 80, 0, 5, 0.22)
    expect(highAlpha.gsnr).toBeLessThan(lowAlpha.gsnr)
  })
})

describe('project settings persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value) },
        removeItem: (key: string) => { storage.delete(key) },
        clear: () => { storage.clear() },
      },
      configurable: true,
    })
  })

  it('exports equalizer cost into USE project settings', () => {
    const settingsStore = useSettingsStore()
    settingsStore.updateCostFactors({ equalizerCost: 23456 })

    const projectData = projectFileService.createUSEProjectData('Equalizer Cost Test')

    expect(projectData._app_extensions?.project_settings?.cost_settings.equalizer_cost).toBe(23456)
  })
})

describe('ReportExportService - cost report', () => {
  it('includes equalizer cost in generated reports', () => {
    const service = new ReportExportService()
    const report = service.generateCostReport({
      projectName: 'Test',
      totalLength: 100,
      cableCost: 1000,
      repeaterCost: 2000,
      branchingUnitCost: 3000,
      equalizerCost: 4000,
      terminalEquipmentCost: 5000,
      laborCost: 600,
      surveyingCost: 700,
      vesselCost: 800,
      installationCost: 900,
      permitCost: 100,
      insuranceCost: 200,
      contingency: 300,
      subtotal: 14300,
      total: 14600,
      costBreakdown: [],
    }, 'txt')

    expect(report).toContain('均衡器设备')
  })
})
