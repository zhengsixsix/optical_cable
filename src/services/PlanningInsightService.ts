import type { Route } from '@/types'
import type { CableSegment, SegmentGenerateConfig } from '@/types/cableSegment'
import type { ArmorMapping } from '@/stores/settings'

export type PlanningIssueLevel = 'error' | 'warning' | 'info'
export type PlanningIssueCategory = 'geometry' | 'segment' | 'cable' | 'burial' | 'slack'

export interface PlanningIssue {
  id: string
  level: PlanningIssueLevel
  category: PlanningIssueCategory
  message: string
  segmentId?: string
}

export interface PlanningValidationResult {
  valid: boolean
  errors: PlanningIssue[]
  warnings: PlanningIssue[]
  infos: PlanningIssue[]
  all: PlanningIssue[]
}

export interface RouteRiskCostBand {
  riskLevel: 'high' | 'medium' | 'low'
  label: string
  length: number
  unitPrice: number
  cost: number
  ratio: number
}

export interface RouteRiskCostSummary {
  totalLength: number
  totalCost: number
  maxBandCost: number
  bands: RouteRiskCostBand[]
}

type RiskCostSegment = {
  length?: number
  riskLevel?: 'high' | 'medium' | 'low'
}

const RISK_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
}

const EPS = 1e-6

const buildResult = (issues: PlanningIssue[]): PlanningValidationResult => {
  const errors = issues.filter(issue => issue.level === 'error')
  const warnings = issues.filter(issue => issue.level === 'warning')
  const infos = issues.filter(issue => issue.level === 'info')
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
    all: issues,
  }
}

const inferArmorGrade = (value?: string | null): number => {
  const normalized = (value || '').toUpperCase()
  if (normalized.includes('RA') || normalized.includes('DA')) return 3
  if (normalized.includes('SA')) return 2
  if (normalized.includes('LW') || normalized.includes('LWP')) return 1
  return 0
}

const getRequiredArmorGrade = (
  riskLevel: 'high' | 'medium' | 'low',
  armorMappings: ArmorMapping[] = [],
): number => {
  const mapped = armorMappings.find(item => item.riskLevel === riskLevel)
  const mappedGrade = inferArmorGrade(mapped?.cableTypeId || mapped?.cableTypeName)
  if (mappedGrade > 0) return mappedGrade
  if (riskLevel === 'high') return 3
  if (riskLevel === 'medium') return 2
  return 1
}

const getUnitPriceByRisk = (
  riskLevel: 'high' | 'medium' | 'low',
  armorMappings: ArmorMapping[] = [],
): number => {
  const mapped = armorMappings.find(item => item.riskLevel === riskLevel)
  if (typeof mapped?.unitPrice === 'number') return mapped.unitPrice
  if (riskLevel === 'high') return 24
  if (riskLevel === 'medium') return 19.5
  return 15
}

type Coord = [number, number]

const orientation = (a: Coord, b: Coord, c: Coord): number =>
  (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])

const onSegment = (a: Coord, b: Coord, c: Coord): boolean =>
  b[0] <= Math.max(a[0], c[0]) + EPS &&
  b[0] + EPS >= Math.min(a[0], c[0]) &&
  b[1] <= Math.max(a[1], c[1]) + EPS &&
  b[1] + EPS >= Math.min(a[1], c[1])

const segmentsIntersect = (p1: Coord, q1: Coord, p2: Coord, q2: Coord): boolean => {
  const o1 = orientation(p1, q1, p2)
  const o2 = orientation(p1, q1, q2)
  const o3 = orientation(p2, q2, p1)
  const o4 = orientation(p2, q2, q1)

  if (Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4)) {
    return true
  }

  if (Math.abs(o1) < EPS && onSegment(p1, p2, q1)) return true
  if (Math.abs(o2) < EPS && onSegment(p1, q2, q1)) return true
  if (Math.abs(o3) < EPS && onSegment(p2, p1, q2)) return true
  if (Math.abs(o4) < EPS && onSegment(p2, q1, q2)) return true

  return false
}

export function buildRouteRiskCostSummary(
  route: { segments: RiskCostSegment[] } | null | undefined,
  armorMappings: ArmorMapping[] = [],
): RouteRiskCostSummary | null {
  if (!route || !route.segments || route.segments.length === 0) return null

  const totals: Record<'high' | 'medium' | 'low', { length: number; unitPrice: number; cost: number }> = {
    high: { length: 0, unitPrice: getUnitPriceByRisk('high', armorMappings), cost: 0 },
    medium: { length: 0, unitPrice: getUnitPriceByRisk('medium', armorMappings), cost: 0 },
    low: { length: 0, unitPrice: getUnitPriceByRisk('low', armorMappings), cost: 0 },
  }

  route.segments.forEach(segment => {
    const riskLevel = segment.riskLevel || 'low'
    const band = totals[riskLevel]
    band.length += segment.length || 0
    band.cost += (segment.length || 0) * band.unitPrice
  })

  const totalLength = Object.values(totals).reduce((sum, band) => sum + band.length, 0)
  const totalCost = Object.values(totals).reduce((sum, band) => sum + band.cost, 0)
  const maxBandCost = Math.max(...Object.values(totals).map(band => band.cost), 0)

  const bands: RouteRiskCostBand[] = (['high', 'medium', 'low'] as const).map(riskLevel => ({
    riskLevel,
    label: RISK_LABELS[riskLevel],
    length: totals[riskLevel].length,
    unitPrice: totals[riskLevel].unitPrice,
    cost: totals[riskLevel].cost,
    ratio: totalCost > 0 ? totals[riskLevel].cost / totalCost : 0,
  }))

  return {
    totalLength,
    totalCost,
    maxBandCost,
    bands,
  }
}

export function validateRouteGeometry(route: Pick<Route, 'points' | 'segments' | 'totalLength'> | null | undefined): PlanningValidationResult {
  const issues: PlanningIssue[] = []

  if (!route || route.points.length < 2 || route.segments.length === 0) {
    issues.push({
      id: 'geometry-empty',
      level: 'error',
      category: 'geometry',
      message: '当前路线缺少可校验的几何段，请先完成规划或导入路线。',
    })
    return buildResult(issues)
  }

  const coords = route.points.map(point => point.coordinates)
  const segmentTotal = route.segments.reduce((sum, segment) => sum + (segment.length || 0), 0)

  route.segments.forEach((segment, index) => {
    if ((segment.length || 0) <= 0) {
      issues.push({
        id: `geometry-zero-${index}`,
        level: 'error',
        category: 'geometry',
        message: `第 ${index + 1} 段长度为 0，请检查拖拽后是否产生重复点。`,
      })
    } else if ((segment.length || 0) < 1) {
      issues.push({
        id: `geometry-short-${index}`,
        level: 'warning',
        category: 'geometry',
        message: `第 ${index + 1} 段长度仅 ${(segment.length || 0).toFixed(2)} km，几何过短，建议合并或重绘。`,
      })
    }

    const start = coords[index]
    const end = coords[index + 1]
    if (start && end && Math.abs(start[0] - end[0]) < EPS && Math.abs(start[1] - end[1]) < EPS) {
      issues.push({
        id: `geometry-duplicate-${index}`,
        level: 'error',
        category: 'geometry',
        message: `第 ${index + 1} 段起终点重合，请调整控制点位置。`,
      })
    }
  })

  if (Math.abs(segmentTotal - (route.totalLength || 0)) > 1) {
    issues.push({
      id: 'geometry-length-mismatch',
      level: 'warning',
      category: 'geometry',
      message: `几何总长 ${segmentTotal.toFixed(1)} km 与路线总长 ${(route.totalLength || 0).toFixed(1)} km 不一致，已建议重新同步。`,
    })
  }

  for (let i = 0; i < coords.length - 1; i++) {
    for (let j = i + 2; j < coords.length - 1; j++) {
      if (Math.abs(i - j) <= 1) continue
      if (i === 0 && j === coords.length - 2) continue
      if (segmentsIntersect(coords[i], coords[i + 1], coords[j], coords[j + 1])) {
        issues.push({
          id: `geometry-intersection-${i}-${j}`,
          level: 'error',
          category: 'geometry',
          message: `第 ${i + 1} 段与第 ${j + 1} 段发生自交，请重新调整路线。`,
        })
      }
    }
  }

  if (issues.length === 0) {
    issues.push({
      id: 'geometry-ok',
      level: 'info',
      category: 'geometry',
      message: `路线几何校验通过，共 ${route.segments.length} 段，总长 ${segmentTotal.toFixed(1)} km。`,
    })
  }

  return buildResult(issues)
}

export function validateCableSegments(
  segments: CableSegment[],
  config: Partial<SegmentGenerateConfig> = {},
  armorMappings: ArmorMapping[] = [],
): PlanningValidationResult {
  const issues: PlanningIssue[] = []
  if (segments.length === 0) return buildResult(issues)

  const maxEndKp = Math.max(...segments.map(segment => segment.endKp || 0), 0)
  const targetLength = config.targetLength || 0
  const minLength = config.minLength || 0
  const maxLength = config.maxLength || 0

  segments.forEach((segment, index) => {
    const label = `SEG-${String(index + 1).padStart(3, '0')}`
    if ((segment.length || 0) <= 0) {
      issues.push({
        id: `${segment.id}-length-error`,
        level: 'error',
        category: 'segment',
        segmentId: segment.id,
        message: `${label} 长度为 0，请重新分段。`,
      })
    }

    if (config.method === 'risk-based') {
      if (minLength > 0 && segment.length + EPS < minLength) {
        issues.push({
          id: `${segment.id}-length-min`,
          level: 'warning',
          category: 'segment',
          segmentId: segment.id,
          message: `${label} 长度 ${segment.length.toFixed(1)} km 低于最小约束 ${minLength.toFixed(1)} km。`,
        })
      }
      if (maxLength > 0 && segment.length - EPS > maxLength) {
        issues.push({
          id: `${segment.id}-length-max`,
          level: 'warning',
          category: 'segment',
          segmentId: segment.id,
          message: `${label} 长度 ${segment.length.toFixed(1)} km 超过最大约束 ${maxLength.toFixed(1)} km。`,
        })
      }
    } else if (targetLength > 0) {
      const isLast = Math.abs(segment.endKp - maxEndKp) < EPS
      const upperLimit = Math.max(targetLength * 1.25, targetLength + 10)
      if (!isLast && segment.length > upperLimit) {
        issues.push({
          id: `${segment.id}-length-target`,
          level: 'warning',
          category: 'segment',
          segmentId: segment.id,
          message: `${label} 长度 ${segment.length.toFixed(1)} km 偏离目标步长 ${targetLength.toFixed(1)} km，存在长度受限风险。`,
        })
      }
    }

    if (segment.slack < 0 || segment.slack > 20) {
      issues.push({
        id: `${segment.id}-slack-error`,
        level: 'error',
        category: 'slack',
        segmentId: segment.id,
        message: `${label} 余量 ${segment.slack.toFixed(1)}% 超出允许范围 0-20%。`,
      })
    } else if (segment.slack > 10) {
      issues.push({
        id: `${segment.id}-slack-warning`,
        level: 'warning',
        category: 'slack',
        segmentId: segment.id,
        message: `${label} 余量 ${segment.slack.toFixed(1)}% 高于建议值 10%。`,
      })
    }

    if (segment.burialDepth < 0 || segment.burialDepth > 5) {
      issues.push({
        id: `${segment.id}-burial-error`,
        level: 'error',
        category: 'burial',
        segmentId: segment.id,
        message: `${label} 埋设深度 ${segment.burialDepth.toFixed(1)} m 超出允许范围 0-5 m。`,
      })
    } else {
      const minBurialDepth = segment.riskLevel === 'high' ? 2 : segment.riskLevel === 'medium' ? 1.5 : 1
      if (segment.burialDepth + EPS < minBurialDepth) {
        issues.push({
          id: `${segment.id}-burial-warning`,
          level: 'warning',
          category: 'burial',
          segmentId: segment.id,
          message: `${label} 埋设深度 ${segment.burialDepth.toFixed(1)} m 低于 ${RISK_LABELS[segment.riskLevel]} 段建议值 ${minBurialDepth.toFixed(1)} m。`,
        })
      }
    }

    const actualArmorGrade = inferArmorGrade(segment.cableTypeId || segment.cableTypeName)
    const requiredArmorGrade = getRequiredArmorGrade(segment.riskLevel, armorMappings)
    if (actualArmorGrade > 0 && actualArmorGrade < requiredArmorGrade) {
      issues.push({
        id: `${segment.id}-armor-warning`,
        level: 'warning',
        category: 'cable',
        segmentId: segment.id,
        message: `${label} 当前缆型等级偏低，无法覆盖 ${RISK_LABELS[segment.riskLevel]} 段的防护要求。`,
      })
    }
  })

  if (issues.length === 0) {
    issues.push({
      id: 'segment-ok',
      level: 'info',
      category: 'segment',
      message: `海缆段校验通过，共 ${segments.length} 段。`,
    })
  }

  return buildResult(issues)
}
