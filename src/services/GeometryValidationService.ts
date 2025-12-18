/**
 * 几何校验服务
 * 负责路径几何校验并返回后端反馈
 */

import { ref } from 'vue'

// 校验错误类型
export type ValidationErrorType = 
  | 'SELF_INTERSECTION'      // 路径自交
  | 'INVALID_COORDINATE'     // 无效坐标
  | 'SEGMENT_TOO_SHORT'      // 段落过短
  | 'SEGMENT_TOO_LONG'       // 段落过长
  | 'ANGLE_TOO_SHARP'        // 转角过急
  | 'OUT_OF_BOUNDS'          // 超出规划范围
  | 'DEPTH_EXCEEDED'         // 超过最大水深
  | 'RISK_ZONE_CROSSING'     // 穿越风险区域

// 校验警告类型
export type ValidationWarningType =
  | 'NEAR_RISK_ZONE'         // 接近风险区域
  | 'STEEP_SLOPE'            // 坡度较陡
  | 'SUBOPTIMAL_ANGLE'       // 转角不佳
  | 'LONG_SEGMENT'           // 段落偏长

// 校验结果项
export interface ValidationIssue {
  type: ValidationErrorType | ValidationWarningType
  severity: 'error' | 'warning'
  message: string
  location?: {
    pointIndex?: number
    segmentIndex?: number
    coordinates?: [number, number]
  }
  suggestion?: string
}

// 校验结果
export interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  stats: {
    totalLength: number
    segmentCount: number
    maxSegmentLength: number
    minSegmentLength: number
    maxAngle: number
    crossedRiskZones: string[]
  }
}

// 路径点
interface RoutePoint {
  longitude: number
  latitude: number
  depth?: number
}

// 规划范围
interface PlanningBounds {
  northwest: { lon: number; lat: number }
  southeast: { lon: number; lat: number }
}

// 风险区域
interface RiskZone {
  id: string
  name: string
  type: 'volcano' | 'earthquake' | 'fishing' | 'protected'
  center: [number, number]
  radius: number  // km
}

class GeometryValidationService {
  private bounds: PlanningBounds = {
    northwest: { lon: 100, lat: 50 },
    southeast: { lon: 150, lat: 10 },
  }
  
  private riskZones: RiskZone[] = [
    { id: 'v1', name: '火山区域1', type: 'volcano', center: [124, 29], radius: 50 },
    { id: 'v2', name: '火山区域2', type: 'volcano', center: [129, 24], radius: 30 },
    { id: 'e1', name: '地震带1', type: 'earthquake', center: [126, 27], radius: 80 },
  ]
  
  private constraints = {
    minSegmentLength: 1,     // km
    maxSegmentLength: 200,   // km
    maxAngle: 45,            // 度
    maxDepth: 6000,          // m
    riskZoneBuffer: 10,      // km
  }

  public isValidating = ref(false)

  // 设置规划范围
  setBounds(bounds: PlanningBounds) {
    this.bounds = bounds
  }

  // 设置风险区域
  setRiskZones(zones: RiskZone[]) {
    this.riskZones = zones
  }

  // 计算两点间距离 (Haversine公式)
  private calculateDistance(p1: RoutePoint, p2: RoutePoint): number {
    const R = 6371 // 地球半径 km
    const dLat = this.toRad(p2.latitude - p1.latitude)
    const dLon = this.toRad(p2.longitude - p1.longitude)
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(p1.latitude)) * Math.cos(this.toRad(p2.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  private toRad(deg: number): number {
    return deg * Math.PI / 180
  }

  // 计算转角
  private calculateAngle(p1: RoutePoint, p2: RoutePoint, p3: RoutePoint): number {
    const v1 = { x: p2.longitude - p1.longitude, y: p2.latitude - p1.latitude }
    const v2 = { x: p3.longitude - p2.longitude, y: p3.latitude - p2.latitude }
    
    const dot = v1.x * v2.x + v1.y * v2.y
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)
    
    if (mag1 === 0 || mag2 === 0) return 0
    
    const cos = dot / (mag1 * mag2)
    const angle = Math.acos(Math.min(1, Math.max(-1, cos)))
    return 180 - (angle * 180 / Math.PI)
  }

  // 检查点是否在范围内
  private isInBounds(point: RoutePoint): boolean {
    return point.longitude >= this.bounds.northwest.lon &&
           point.longitude <= this.bounds.southeast.lon &&
           point.latitude <= this.bounds.northwest.lat &&
           point.latitude >= this.bounds.southeast.lat
  }

  // 检查点是否在风险区域内
  private checkRiskZones(point: RoutePoint): RiskZone[] {
    const inZones: RiskZone[] = []
    
    this.riskZones.forEach(zone => {
      const dist = this.calculateDistance(point, { 
        longitude: zone.center[0], 
        latitude: zone.center[1] 
      })
      if (dist <= zone.radius) {
        inZones.push(zone)
      }
    })
    
    return inZones
  }

  // 检查点是否接近风险区域
  private checkNearRiskZones(point: RoutePoint): RiskZone[] {
    const nearZones: RiskZone[] = []
    
    this.riskZones.forEach(zone => {
      const dist = this.calculateDistance(point, { 
        longitude: zone.center[0], 
        latitude: zone.center[1] 
      })
      if (dist > zone.radius && dist <= zone.radius + this.constraints.riskZoneBuffer) {
        nearZones.push(zone)
      }
    })
    
    return nearZones
  }

  // 主校验方法
  validate(points: RoutePoint[]): ValidationResult {
    this.isValidating.value = true
    
    const errors: ValidationIssue[] = []
    const warnings: ValidationIssue[] = []
    const segmentLengths: number[] = []
    const angles: number[] = []
    const crossedRiskZones = new Set<string>()
    
    // 检查点数量
    if (points.length < 2) {
      errors.push({
        type: 'INVALID_COORDINATE',
        severity: 'error',
        message: '路径至少需要2个点',
      })
      this.isValidating.value = false
      return this.buildResult(errors, warnings, segmentLengths, angles, crossedRiskZones)
    }
    
    // 逐点校验
    points.forEach((point, index) => {
      // 坐标有效性
      if (isNaN(point.longitude) || isNaN(point.latitude) ||
          point.longitude < -180 || point.longitude > 180 ||
          point.latitude < -90 || point.latitude > 90) {
        errors.push({
          type: 'INVALID_COORDINATE',
          severity: 'error',
          message: `点 ${index + 1} 坐标无效`,
          location: { pointIndex: index, coordinates: [point.longitude, point.latitude] },
          suggestion: '请检查经纬度格式是否正确',
        })
      }
      
      // 范围检查
      if (!this.isInBounds(point)) {
        errors.push({
          type: 'OUT_OF_BOUNDS',
          severity: 'error',
          message: `点 ${index + 1} 超出规划范围`,
          location: { pointIndex: index, coordinates: [point.longitude, point.latitude] },
          suggestion: '请将点移动到规划范围内',
        })
      }
      
      // 水深检查
      if (point.depth && point.depth > this.constraints.maxDepth) {
        errors.push({
          type: 'DEPTH_EXCEEDED',
          severity: 'error',
          message: `点 ${index + 1} 水深 ${point.depth}m 超过最大限制 ${this.constraints.maxDepth}m`,
          location: { pointIndex: index },
          suggestion: '请调整路径避开深水区域',
        })
      }
      
      // 风险区域检查
      const inZones = this.checkRiskZones(point)
      inZones.forEach(zone => {
        crossedRiskZones.add(zone.name)
        errors.push({
          type: 'RISK_ZONE_CROSSING',
          severity: 'error',
          message: `点 ${index + 1} 位于风险区域: ${zone.name}`,
          location: { pointIndex: index, coordinates: [point.longitude, point.latitude] },
          suggestion: `建议绕开${zone.type === 'volcano' ? '火山' : zone.type === 'earthquake' ? '地震带' : '风险'}区域`,
        })
      })
      
      // 接近风险区域警告
      const nearZones = this.checkNearRiskZones(point)
      nearZones.forEach(zone => {
        warnings.push({
          type: 'NEAR_RISK_ZONE',
          severity: 'warning',
          message: `点 ${index + 1} 接近风险区域: ${zone.name}`,
          location: { pointIndex: index },
          suggestion: '建议保持更远距离',
        })
      })
    })
    
    // 逐段校验
    for (let i = 0; i < points.length - 1; i++) {
      const length = this.calculateDistance(points[i], points[i + 1])
      segmentLengths.push(length)
      
      // 段落过短
      if (length < this.constraints.minSegmentLength) {
        errors.push({
          type: 'SEGMENT_TOO_SHORT',
          severity: 'error',
          message: `段落 ${i + 1} 长度 ${length.toFixed(2)}km 过短`,
          location: { segmentIndex: i },
          suggestion: '请合并相邻的点或调整位置',
        })
      }
      
      // 段落过长
      if (length > this.constraints.maxSegmentLength) {
        errors.push({
          type: 'SEGMENT_TOO_LONG',
          severity: 'error',
          message: `段落 ${i + 1} 长度 ${length.toFixed(1)}km 超过最大限制`,
          location: { segmentIndex: i },
          suggestion: '请在中间添加更多控制点',
        })
      } else if (length > this.constraints.maxSegmentLength * 0.8) {
        warnings.push({
          type: 'LONG_SEGMENT',
          severity: 'warning',
          message: `段落 ${i + 1} 长度 ${length.toFixed(1)}km 偏长`,
          location: { segmentIndex: i },
        })
      }
    }
    
    // 转角校验
    for (let i = 1; i < points.length - 1; i++) {
      const angle = this.calculateAngle(points[i - 1], points[i], points[i + 1])
      angles.push(angle)
      
      if (angle > this.constraints.maxAngle) {
        errors.push({
          type: 'ANGLE_TOO_SHARP',
          severity: 'error',
          message: `点 ${i + 1} 转角 ${angle.toFixed(1)}° 过急`,
          location: { pointIndex: i },
          suggestion: '请调整点位置使转角更平缓',
        })
      } else if (angle > this.constraints.maxAngle * 0.7) {
        warnings.push({
          type: 'SUBOPTIMAL_ANGLE',
          severity: 'warning',
          message: `点 ${i + 1} 转角 ${angle.toFixed(1)}° 偏大`,
          location: { pointIndex: i },
        })
      }
    }
    
    this.isValidating.value = false
    return this.buildResult(errors, warnings, segmentLengths, angles, crossedRiskZones)
  }

  private buildResult(
    errors: ValidationIssue[], 
    warnings: ValidationIssue[], 
    segmentLengths: number[], 
    angles: number[],
    crossedRiskZones: Set<string>
  ): ValidationResult {
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        totalLength: segmentLengths.reduce((a, b) => a + b, 0),
        segmentCount: segmentLengths.length,
        maxSegmentLength: Math.max(...segmentLengths, 0),
        minSegmentLength: Math.min(...segmentLengths, Infinity),
        maxAngle: Math.max(...angles, 0),
        crossedRiskZones: Array.from(crossedRiskZones),
      },
    }
  }
}

// 单例导出
export const geometryValidationService = new GeometryValidationService()

// Composable
export function useGeometryValidation() {
  return {
    validate: (points: RoutePoint[]) => geometryValidationService.validate(points),
    setBounds: (bounds: PlanningBounds) => geometryValidationService.setBounds(bounds),
    setRiskZones: (zones: RiskZone[]) => geometryValidationService.setRiskZones(zones),
    isValidating: geometryValidationService.isValidating,
  }
}
