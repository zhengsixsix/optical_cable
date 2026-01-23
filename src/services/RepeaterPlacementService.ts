/**
 * 中继器智能落位算法服务
 * 实现基于地形的自动落位、坡度规避、最优位置计算
 */

import type { RoutePoint } from '@/types/route'
import type { SpanScanResult } from '@/types/simulation'

// 中继器落位点
export interface RepeaterLocation {
  id: string
  index: number                // 序号
  name?: string                // 名称（从器件库获取）
  kp: number                   // KP位置 (km)
  longitude: number            // 经度
  latitude: number             // 纬度
  depth: number                // 水深 (m)
  slope: number                // 坡度 (度)
  slopeCategory: 'flat' | 'gentle' | 'moderate' | 'steep'  // 坡度分类
  isOptimal: boolean           // 是否为最优位置
  adjustedFrom?: number        // 从哪个KP调整而来
  adjustmentReason?: string    // 调整原因
  score: number                // 评分 (0-100)
}

// 落位配置
export interface PlacementConfig {
  targetSpacing: number        // 目标间距 (km)
  minSpacing: number           // 最小间距 (km)
  maxSpacing: number           // 最大间距 (km)
  maxSlope: number             // 最大允许坡度 (度)
  preferredDepthRange: {       // 优选水深范围
    min: number
    max: number
  }
  avoidanceZones: AvoidanceZone[]  // 规避区域
  searchRadius: number         // 搜索半径 (km)
}

// 规避区域
export interface AvoidanceZone {
  type: 'earthquake' | 'volcano' | 'fishing' | 'anchor' | 'pipeline' | 'custom'
  center: { lon: number; lat: number }
  radius: number               // 规避半径 (km)
  name: string
}

// 地形数据点
export interface TerrainPoint {
  kp: number
  longitude: number
  latitude: number
  depth: number
  slope: number
}

// 落位结果
export interface PlacementResult {
  locations: RepeaterLocation[]
  totalCount: number
  averageSpacing: number
  minSpacing: number
  maxSpacing: number
  adjustedCount: number        // 被调整的数量
  feasibility: {
    isValid: boolean
    issues: string[]
    warnings: string[]
  }
  statistics: PlacementStatistics
}

// 统计信息
export interface PlacementStatistics {
  depthDistribution: { range: string; count: number }[]
  slopeDistribution: { category: string; count: number }[]
  averageScore: number
  optimalRatio: number
}

// 默认配置
const DEFAULT_CONFIG: PlacementConfig = {
  targetSpacing: 80,
  minSpacing: 60,
  maxSpacing: 100,
  maxSlope: 15,
  preferredDepthRange: { min: 1000, max: 5000 },
  avoidanceZones: [],
  searchRadius: 5,
}

/**
 * 中继器智能落位服务
 */
export class RepeaterPlacementService {
  private config: PlacementConfig = DEFAULT_CONFIG

  /**
   * 设置配置
   */
  setConfig(config: Partial<PlacementConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): PlacementConfig {
    return { ...this.config }
  }

  /**
   * 自动计算中继器落位
   * @param routePoints - 路由点列表
   * @param terrainData - 地形数据
   */
  calculatePlacements(
    routePoints: RoutePoint[],
    terrainData?: TerrainPoint[]
  ): PlacementResult {
    const totalLength = this.calculateTotalLength(routePoints)
    const terrain = terrainData || this.generateTerrainFromRoute(routePoints)
    
    // 1. 计算初始等间距落位
    const initialLocations = this.calculateInitialPlacements(totalLength)
    
    // 2. 根据地形优化落位
    const optimizedLocations = this.optimizePlacements(initialLocations, terrain)
    
    // 3. 规避区域检查与调整
    const finalLocations = this.applyAvoidanceZones(optimizedLocations, terrain)
    
    // 4. 验证落位可行性
    const feasibility = this.validatePlacements(finalLocations)
    
    // 5. 计算统计信息
    const statistics = this.calculateStatistics(finalLocations)

    return {
      locations: finalLocations,
      totalCount: finalLocations.length,
      averageSpacing: this.calculateAverageSpacing(finalLocations),
      minSpacing: this.calculateMinSpacing(finalLocations),
      maxSpacing: this.calculateMaxSpacing(finalLocations),
      adjustedCount: finalLocations.filter(l => l.adjustedFrom !== undefined).length,
      feasibility,
      statistics,
    }
  }

  /**
   * 计算初始等间距落位
   */
  private calculateInitialPlacements(totalLength: number): RepeaterLocation[] {
    const locations: RepeaterLocation[] = []
    const count = Math.ceil(totalLength / this.config.targetSpacing)
    const actualSpacing = totalLength / count

    for (let i = 1; i < count; i++) {
      const kp = i * actualSpacing
      locations.push({
        id: `repeater-${i}`,
        index: i,
        name: `中继器-${String(i).padStart(2, '0')}`,
        kp,
        longitude: 0,
        latitude: 0,
        depth: 0,
        slope: 0,
        slopeCategory: 'flat',
        isOptimal: true,
        score: 100,
      })
    }

    return locations
  }

  /**
   * 根据地形优化落位
   */
  private optimizePlacements(
    locations: RepeaterLocation[],
    terrain: TerrainPoint[]
  ): RepeaterLocation[] {
    return locations.map(location => {
      // 获取目标KP附近的地形数据
      const nearbyTerrain = this.getTerrainInRange(
        terrain,
        location.kp - this.config.searchRadius,
        location.kp + this.config.searchRadius
      )

      if (nearbyTerrain.length === 0) {
        return location
      }

      // 找到当前KP的地形
      const currentTerrain = this.interpolateTerrain(terrain, location.kp)
      
      // 检查是否需要调整
      if (currentTerrain.slope > this.config.maxSlope) {
        // 在搜索范围内找最优位置
        const optimal = this.findOptimalLocation(nearbyTerrain, location.kp)
        
        return {
          ...location,
          kp: optimal.kp,
          longitude: optimal.longitude,
          latitude: optimal.latitude,
          depth: optimal.depth,
          slope: optimal.slope,
          slopeCategory: this.categorizeslope(optimal.slope),
          isOptimal: optimal.slope <= this.config.maxSlope,
          adjustedFrom: location.kp,
          adjustmentReason: `坡度过大 (${currentTerrain.slope.toFixed(1)}°)，调整至较平坦区域`,
          score: this.calculateLocationScore(optimal),
        }
      }

      return {
        ...location,
        longitude: currentTerrain.longitude,
        latitude: currentTerrain.latitude,
        depth: currentTerrain.depth,
        slope: currentTerrain.slope,
        slopeCategory: this.categorizeslope(currentTerrain.slope),
        score: this.calculateLocationScore(currentTerrain),
      }
    })
  }

  /**
   * 应用规避区域
   */
  private applyAvoidanceZones(
    locations: RepeaterLocation[],
    terrain: TerrainPoint[]
  ): RepeaterLocation[] {
    if (this.config.avoidanceZones.length === 0) {
      return locations
    }

    return locations.map(location => {
      for (const zone of this.config.avoidanceZones) {
        const distance = this.calculateDistance(
          location.longitude,
          location.latitude,
          zone.center.lon,
          zone.center.lat
        )

        if (distance < zone.radius) {
          // 需要移出规避区域
          const newLocation = this.findLocationOutsideZone(location, zone, terrain)
          return {
            ...newLocation,
            adjustedFrom: location.kp,
            adjustmentReason: `规避${this.getZoneTypeName(zone.type)}区域 (${zone.name})`,
          }
        }
      }
      return location
    })
  }

  /**
   * 在搜索范围内找最优落位点
   */
  private findOptimalLocation(terrain: TerrainPoint[], targetKp: number): TerrainPoint {
    let best = terrain[0]
    let bestScore = -Infinity

    for (const point of terrain) {
      const score = this.calculateLocationScore(point)
      const distancePenalty = Math.abs(point.kp - targetKp) * 2
      const adjustedScore = score - distancePenalty

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore
        best = point
      }
    }

    return best
  }

  /**
   * 在规避区域外找新位置
   */
  private findLocationOutsideZone(
    location: RepeaterLocation,
    zone: AvoidanceZone,
    terrain: TerrainPoint[]
  ): RepeaterLocation {
    // 向两个方向搜索
    const searchRange = zone.radius + this.config.searchRadius
    const candidates = terrain.filter(t => {
      const dist = this.calculateDistance(t.longitude, t.latitude, zone.center.lon, zone.center.lat)
      return dist >= zone.radius && Math.abs(t.kp - location.kp) <= searchRange
    })

    if (candidates.length === 0) {
      return { ...location, isOptimal: false }
    }

    // 找距离原位置最近的可用点
    const nearest = candidates.reduce((best, current) =>
      Math.abs(current.kp - location.kp) < Math.abs(best.kp - location.kp) ? current : best
    )

    return {
      ...location,
      kp: nearest.kp,
      longitude: nearest.longitude,
      latitude: nearest.latitude,
      depth: nearest.depth,
      slope: nearest.slope,
      slopeCategory: this.categorizeslope(nearest.slope),
      isOptimal: nearest.slope <= this.config.maxSlope,
      score: this.calculateLocationScore(nearest),
    }
  }

  /**
   * 计算位置评分
   */
  private calculateLocationScore(point: TerrainPoint): number {
    let score = 100

    // 坡度评分 (权重40%)
    if (point.slope > this.config.maxSlope) {
      score -= 40
    } else if (point.slope > this.config.maxSlope * 0.7) {
      score -= 20
    } else if (point.slope > this.config.maxSlope * 0.4) {
      score -= 10
    }

    // 水深评分 (权重30%)
    const { min, max } = this.config.preferredDepthRange
    if (point.depth < min || point.depth > max) {
      score -= 30
    } else if (point.depth < min * 1.2 || point.depth > max * 0.8) {
      score -= 15
    }

    // 地形平坦度 (权重30%)
    if (point.slope < 3) {
      score += 0 // 已经是满分
    } else if (point.slope < 6) {
      score -= 5
    } else if (point.slope < 10) {
      score -= 15
    }

    return Math.max(0, Math.min(100, score))
  }

  /**
   * 验证落位可行性
   */
  private validatePlacements(locations: RepeaterLocation[]): {
    isValid: boolean
    issues: string[]
    warnings: string[]
  } {
    const issues: string[] = []
    const warnings: string[] = []

    // 检查间距
    for (let i = 1; i < locations.length; i++) {
      const spacing = locations[i].kp - locations[i - 1].kp
      if (spacing < this.config.minSpacing) {
        issues.push(`中继器 ${i} 和 ${i + 1} 间距过小 (${spacing.toFixed(1)} km)`)
      }
      if (spacing > this.config.maxSpacing) {
        issues.push(`中继器 ${i} 和 ${i + 1} 间距过大 (${spacing.toFixed(1)} km)`)
      }
    }

    // 检查坡度
    const steepCount = locations.filter(l => l.slope > this.config.maxSlope).length
    if (steepCount > 0) {
      warnings.push(`${steepCount} 个落位点坡度超过限制 (${this.config.maxSlope}°)`)
    }

    // 检查低分位置
    const lowScoreCount = locations.filter(l => l.score < 60).length
    if (lowScoreCount > 0) {
      warnings.push(`${lowScoreCount} 个落位点评分较低，建议人工复核`)
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
    }
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(locations: RepeaterLocation[]): PlacementStatistics {
    // 水深分布
    const depthRanges = [
      { range: '0-1000m', min: 0, max: 1000, count: 0 },
      { range: '1000-2000m', min: 1000, max: 2000, count: 0 },
      { range: '2000-3000m', min: 2000, max: 3000, count: 0 },
      { range: '3000-4000m', min: 3000, max: 4000, count: 0 },
      { range: '4000-5000m', min: 4000, max: 5000, count: 0 },
      { range: '>5000m', min: 5000, max: Infinity, count: 0 },
    ]

    for (const loc of locations) {
      for (const range of depthRanges) {
        if (loc.depth >= range.min && loc.depth < range.max) {
          range.count++
          break
        }
      }
    }

    // 坡度分布
    const slopeCategories = [
      { category: '平坦 (<3°)', count: locations.filter(l => l.slope < 3).length },
      { category: '缓坡 (3-8°)', count: locations.filter(l => l.slope >= 3 && l.slope < 8).length },
      { category: '中坡 (8-15°)', count: locations.filter(l => l.slope >= 8 && l.slope < 15).length },
      { category: '陡坡 (>15°)', count: locations.filter(l => l.slope >= 15).length },
    ]

    return {
      depthDistribution: depthRanges.map(r => ({ range: r.range, count: r.count })),
      slopeDistribution: slopeCategories,
      averageScore: locations.reduce((sum, l) => sum + l.score, 0) / locations.length,
      optimalRatio: locations.filter(l => l.isOptimal).length / locations.length,
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 计算路由总长度
   */
  private calculateTotalLength(routePoints: RoutePoint[]): number {
    let total = 0
    for (let i = 1; i < routePoints.length; i++) {
      total += this.calculateDistance(
        routePoints[i - 1].coordinates[0],
        routePoints[i - 1].coordinates[1],
        routePoints[i].coordinates[0],
        routePoints[i].coordinates[1]
      )
    }
    return total
  }

  /**
   * 从路由点生成地形数据（模拟）
   */
  private generateTerrainFromRoute(routePoints: RoutePoint[]): TerrainPoint[] {
    const terrain: TerrainPoint[] = []
    let kp = 0

    for (let i = 0; i < routePoints.length; i++) {
      const point = routePoints[i]
      let slope = 0
      // RoutePoint 使用 coordinates: [lon, lat]
      const pointLon = point.coordinates[0]
      const pointLat = point.coordinates[1]
      // 没有 depth 属性，使用默认值 3000
      const pointDepth = 3000
      
      if (i > 0) {
        const prev = routePoints[i - 1]
        const prevLon = prev.coordinates[0]
        const prevLat = prev.coordinates[1]
        const prevDepth = 3000
        const distance = this.calculateDistance(
          prevLon, prevLat,
          pointLon, pointLat
        )
        kp += distance
        
        // 估算坡度
        const depthDiff = Math.abs(pointDepth - prevDepth)
        slope = Math.atan(depthDiff / (distance * 1000)) * (180 / Math.PI)
      }

      terrain.push({
        kp,
        longitude: pointLon,
        latitude: pointLat,
        depth: pointDepth,
        slope,
      })
    }

    return terrain
  }

  /**
   * 获取指定范围内的地形数据
   */
  private getTerrainInRange(terrain: TerrainPoint[], minKp: number, maxKp: number): TerrainPoint[] {
    return terrain.filter(t => t.kp >= minKp && t.kp <= maxKp)
  }

  /**
   * 插值获取指定KP的地形数据
   */
  private interpolateTerrain(terrain: TerrainPoint[], kp: number): TerrainPoint {
    if (terrain.length === 0) {
      return { kp, longitude: 0, latitude: 0, depth: 3000, slope: 0 }
    }

    // 找到最近的两个点进行插值
    let before: TerrainPoint | null = null
    let after: TerrainPoint | null = null

    for (const t of terrain) {
      if (t.kp <= kp) {
        before = t
      }
      if (t.kp >= kp && after === null) {
        after = t
      }
    }

    if (!before) return after || terrain[0]
    if (!after) return before

    const ratio = (kp - before.kp) / (after.kp - before.kp)
    return {
      kp,
      longitude: before.longitude + (after.longitude - before.longitude) * ratio,
      latitude: before.latitude + (after.latitude - before.latitude) * ratio,
      depth: before.depth + (after.depth - before.depth) * ratio,
      slope: before.slope + (after.slope - before.slope) * ratio,
    }
  }

  /**
   * 计算两点间距离 (km)
   */
  private calculateDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const R = 6371 // 地球半径 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  /**
   * 坡度分类
   */
  private categorizeslope(slope: number): 'flat' | 'gentle' | 'moderate' | 'steep' {
    if (slope < 3) return 'flat'
    if (slope < 8) return 'gentle'
    if (slope < 15) return 'moderate'
    return 'steep'
  }

  /**
   * 获取规避区域类型名称
   */
  private getZoneTypeName(type: AvoidanceZone['type']): string {
    const names: Record<string, string> = {
      earthquake: '地震',
      volcano: '火山',
      fishing: '渔场',
      anchor: '锚地',
      pipeline: '管道',
      custom: '自定义',
    }
    return names[type] || type
  }

  /**
   * 计算平均间距
   */
  private calculateAverageSpacing(locations: RepeaterLocation[]): number {
    if (locations.length < 2) return 0
    let total = 0
    for (let i = 1; i < locations.length; i++) {
      total += locations[i].kp - locations[i - 1].kp
    }
    return total / (locations.length - 1)
  }

  /**
   * 计算最小间距
   */
  private calculateMinSpacing(locations: RepeaterLocation[]): number {
    if (locations.length < 2) return 0
    let min = Infinity
    for (let i = 1; i < locations.length; i++) {
      min = Math.min(min, locations[i].kp - locations[i - 1].kp)
    }
    return min
  }

  /**
   * 计算最大间距
   */
  private calculateMaxSpacing(locations: RepeaterLocation[]): number {
    if (locations.length < 2) return 0
    let max = 0
    for (let i = 1; i < locations.length; i++) {
      max = Math.max(max, locations[i].kp - locations[i - 1].kp)
    }
    return max
  }

  /**
   * 手动调整中继器位置
   */
  adjustRepeaterLocation(
    locations: RepeaterLocation[],
    repeaterId: string,
    newKp: number,
    terrain: TerrainPoint[]
  ): RepeaterLocation[] {
    return locations.map(loc => {
      if (loc.id !== repeaterId) return loc

      const newTerrain = this.interpolateTerrain(terrain, newKp)
      return {
        ...loc,
        kp: newKp,
        longitude: newTerrain.longitude,
        latitude: newTerrain.latitude,
        depth: newTerrain.depth,
        slope: newTerrain.slope,
        slopeCategory: this.categorizeslope(newTerrain.slope),
        isOptimal: newTerrain.slope <= this.config.maxSlope,
        adjustedFrom: loc.kp,
        adjustmentReason: '手动调整',
        score: this.calculateLocationScore(newTerrain),
      }
    })
  }

  // ========== Step 7: 自动方案推荐 ==========

  /**
   * 自动推荐最优 Span 长度 (Step 7.3)
   * 基于 Span 扫描结果推荐最优配置
   * 
   * @param scanResult - Span 扫描结果
   * @param preferLongerSpan - 是否偏好更长的 Span（减少中继器数量）
   */
  autoRecommendSpan(
    scanResult: SpanScanResult,
    preferLongerSpan: boolean = true
  ): {
    recommendedSpanKm: number
    repeaterCount: number
    gsnrMargin: number
    reasoning: string
  } {
    const feasiblePoints = scanResult.scanPoints.filter(p => p.meetTarget)
    
    if (feasiblePoints.length === 0) {
      // 无可行方案，返回余量最大的（负余量最小的）
      const bestPoint = scanResult.scanPoints.reduce((best, current) =>
        current.gsnrMarginDb > best.gsnrMarginDb ? current : best
      )
      return {
        recommendedSpanKm: bestPoint.spanLengthKm,
        repeaterCount: 0,
        gsnrMargin: bestPoint.gsnrMarginDb,
        reasoning: `无满足目标 GSNR 的配置，推荐余量最大的配置 (${bestPoint.gsnrMarginDb.toFixed(1)} dB)`
      }
    }
    
    let selectedPoint = feasiblePoints[0]
    
    if (preferLongerSpan) {
      // 偏好更长的 Span：在可行区间内取余量大于 2dB 的最长 Span
      const marginThreshold = 2
      const goodPoints = feasiblePoints.filter(p => p.gsnrMarginDb >= marginThreshold)
      if (goodPoints.length > 0) {
        selectedPoint = goodPoints[goodPoints.length - 1] // 最长的
      } else {
        // 取可行区间的中点
        selectedPoint = feasiblePoints[Math.floor(feasiblePoints.length / 2)]
      }
    } else {
      // 偏好更高余量：取余量最大的
      selectedPoint = feasiblePoints.reduce((best, current) =>
        current.gsnrMarginDb > best.gsnrMarginDb ? current : best
      )
    }
    
    return {
      recommendedSpanKm: selectedPoint.spanLengthKm,
      repeaterCount: 0, // 需要外部计算
      gsnrMargin: selectedPoint.gsnrMarginDb,
      reasoning: preferLongerSpan
        ? `在保证 ${selectedPoint.gsnrMarginDb.toFixed(1)} dB 余量的前提下，选择最长可行 Span`
        : `选择 GSNR 余量最大的 Span 配置`
    }
  }

  /**
   * 生成 EDFA 放置方案 (Step 7.3)
   * 根据推荐的 Span 长度生成初始 EDFA 放置位置
   * 
   * @param totalLength - 链路总长度 (km)
   * @param spanLength - Span 长度 (km)
   * @param routePoints - 路由点列表
   */
  generateEDFAPlacement(
    totalLength: number,
    spanLength: number,
    routePoints?: RoutePoint[]
  ): {
    positions: Array<{ kp: number; longitude: number; latitude: number; isBranch?: boolean; branchId?: string }>
    count: number
  } {
    if (!routePoints || routePoints.length === 0) {
      // 没有路由点，使用简单等间距
      const count = Math.ceil(totalLength / spanLength) - 1
      const positions: Array<{ kp: number; longitude: number; latitude: number }> = []
      
      for (let i = 1; i <= count; i++) {
        positions.push({ kp: i * spanLength, longitude: 0, latitude: 0 })
      }
      return { positions, count }
    }
    
    const positions: Array<{ kp: number; longitude: number; latitude: number; isBranch?: boolean; branchId?: string }> = []
    
    // 1. 识别主干线点（排除分支登陆站）
    const mainTrunkPoints = routePoints.filter(p => !this.isBranchStation(p, routePoints))
    
    // 2. 构建主干线的地形数据
    const mainTerrain = this.generateTerrainFromRoute(mainTrunkPoints)
    const mainTrunkLength = mainTerrain.length > 0 ? mainTerrain[mainTerrain.length - 1].kp : totalLength
    
    // 3. 在主干线上按 Span 间距落位
    const mainCount = Math.ceil(mainTrunkLength / spanLength) - 1
    for (let i = 1; i <= mainCount; i++) {
      const kp = i * spanLength
      if (kp >= mainTrunkLength) break
      
      // 检查该位置是否在分支器附近（避免与分支器重叠）
      const nearBranchingUnit = mainTrunkPoints.some(p => 
        p.type === 'branching' && Math.abs(this.getPointKP(p, mainTrunkPoints) - kp) < spanLength * 0.1
      )
      
      if (nearBranchingUnit) continue
      
      const interpolated = this.interpolateTerrain(mainTerrain, kp)
      positions.push({ 
        kp, 
        longitude: interpolated.longitude, 
        latitude: interpolated.latitude,
        isBranch: false
      })
    }
    
    // 4. 在每条分支线上也落位中继器
    const branchingUnits = routePoints.filter(p => p.type === 'branching' && p.branchTo)
    branchingUnits.forEach((bu) => {
      if (!bu.branchTo) return
      
      // 分支线起点：分支器位置
      const buCoord = bu.coordinates
      // 分支线终点：分支登陆站位置
      const branchEndCoord = bu.branchTo.coord
      
      // 计算分支线长度
      const branchLength = this.calculateDistance(
        buCoord[0], buCoord[1],
        branchEndCoord[0], branchEndCoord[1]
      )
      
      // 如果分支线长度小于一个 span，不需要落位中继器
      if (branchLength < spanLength) return
      
      // 获取分支器在主干线上的 KP
      const buKP = this.getPointKP(bu, mainTrunkPoints)
      
      // 分支线上需要的中继器数量（按实际间距计算）
      const branchRepeaterCount = Math.floor(branchLength / spanLength)
      
      // 在分支线上按间距落位
      for (let j = 1; j <= branchRepeaterCount; j++) {
        // 按实际距离计算比例（从分支器开始，每隔 spanLength 落一个中继器）
        const distanceFromBU = j * spanLength
        const ratio = distanceFromBU / branchLength
        
        // 如果超过分支线长度，停止
        if (ratio >= 1) break
        
        // 分支线上的 KP：从分支器 KP 开始累加
        const branchKp = buKP + distanceFromBU
        
        // 插值计算分支线上的坐标（在分支器到分支登陆站的连线上）
        const lon = buCoord[0] + (branchEndCoord[0] - buCoord[0]) * ratio
        const lat = buCoord[1] + (branchEndCoord[1] - buCoord[1]) * ratio
        
        positions.push({
          kp: branchKp,
          longitude: lon,
          latitude: lat,
          isBranch: true,
          branchId: bu.id
        })
      }
    })
    
    // 按 KP 排序
    positions.sort((a, b) => a.kp - b.kp)
    
    return { positions, count: positions.length }
  }
  
  /**
   * 判断是否为分支登陆站
   */
  private isBranchStation(point: RoutePoint, allPoints: RoutePoint[]): boolean {
    // 检查是否有其他点的 branchTo 指向这个点
    return allPoints.some(p => 
      p.branchTo && 
      Math.abs(p.branchTo.coord[0] - point.coordinates[0]) < 0.001 && 
      Math.abs(p.branchTo.coord[1] - point.coordinates[1]) < 0.001
    )
  }
  
  /**
   * 获取点在路由上的 KP 位置
   */
  private getPointKP(point: RoutePoint, routePoints: RoutePoint[]): number {
    let kp = 0
    for (let i = 0; i < routePoints.length; i++) {
      if (i > 0) {
        kp += this.calculateDistance(
          routePoints[i - 1].coordinates[0],
          routePoints[i - 1].coordinates[1],
          routePoints[i].coordinates[0],
          routePoints[i].coordinates[1]
        )
      }
      if (routePoints[i].id === point.id) {
        return kp
      }
    }
    return kp
  }

  /**
   * 地形风险规避 (Step 7.3)
   * 根据海底地形和海洋环境自动微调 EDFA 放置位置
   * 
   * @param positions - 初始 EDFA 位置
   * @param terrain - 地形数据
   * @param riskZones - 风险区域列表
   */
  terrainRiskAvoidance(
    positions: Array<{ kp: number; longitude: number; latitude: number }>,
    terrain: TerrainPoint[],
    riskZones?: AvoidanceZone[]
  ): {
    adjustedPositions: RepeaterLocation[]
    adjustments: Array<{
      originalKp: number
      newKp: number
      reason: string
    }>
  } {
    const adjustedPositions: RepeaterLocation[] = []
    const adjustments: Array<{ originalKp: number; newKp: number; reason: string }> = []
    
    positions.forEach((pos, index) => {
      let adjustedKp = pos.kp
      let adjustmentReason = ''
      let needsAdjustment = false
      
      // 检查坡度
      const currentTerrain = this.interpolateTerrain(terrain, pos.kp)
      if (currentTerrain.slope > this.config.maxSlope) {
        // 在附近找平坦区域
        const nearbyTerrain = this.getTerrainInRange(
          terrain,
          pos.kp - this.config.searchRadius,
          pos.kp + this.config.searchRadius
        )
        
        const flatPoint = nearbyTerrain.find(t => t.slope <= this.config.maxSlope)
        if (flatPoint) {
          adjustedKp = flatPoint.kp
          adjustmentReason = `坡度过大 (${currentTerrain.slope.toFixed(1)}°)，调整至平坦区域`
          needsAdjustment = true
        }
      }
      
      // 检查水深
      if (!needsAdjustment) {
        const { min, max } = this.config.preferredDepthRange
        if (currentTerrain.depth < min || currentTerrain.depth > max) {
          const nearbyTerrain = this.getTerrainInRange(
            terrain,
            pos.kp - this.config.searchRadius,
            pos.kp + this.config.searchRadius
          )
          
          const goodDepthPoint = nearbyTerrain.find(t => t.depth >= min && t.depth <= max)
          if (goodDepthPoint) {
            adjustedKp = goodDepthPoint.kp
            adjustmentReason = `水深超出优选范围 (${currentTerrain.depth}m)，调整至合适水深区域`
            needsAdjustment = true
          }
        }
      }
      
      // 检查风险区域
      if (riskZones && riskZones.length > 0) {
        for (const zone of riskZones) {
          const distance = this.calculateDistance(
            pos.longitude,
            pos.latitude,
            zone.center.lon,
            zone.center.lat
          )
          
          if (distance < zone.radius) {
            // 需要移出风险区域
            const safePoint = terrain.find(t => {
              const d = this.calculateDistance(t.longitude, t.latitude, zone.center.lon, zone.center.lat)
              return d >= zone.radius && Math.abs(t.kp - pos.kp) <= this.config.searchRadius * 2
            })
            
            if (safePoint) {
              adjustedKp = safePoint.kp
              adjustmentReason = `规避${this.getZoneTypeName(zone.type)}风险区域 (${zone.name})`
              needsAdjustment = true
            }
            break
          }
        }
      }
      
      // 记录调整
      if (needsAdjustment) {
        adjustments.push({
          originalKp: pos.kp,
          newKp: adjustedKp,
          reason: adjustmentReason
        })
      }
      
      // 生成最终位置
      const finalTerrain = this.interpolateTerrain(terrain, adjustedKp)
      adjustedPositions.push({
        id: `edfa-${index + 1}`,
        index: index + 1,
        kp: adjustedKp,
        longitude: finalTerrain.longitude,
        latitude: finalTerrain.latitude,
        depth: finalTerrain.depth,
        slope: finalTerrain.slope,
        slopeCategory: this.categorizeslope(finalTerrain.slope),
        isOptimal: finalTerrain.slope <= this.config.maxSlope,
        adjustedFrom: needsAdjustment ? pos.kp : undefined,
        adjustmentReason: needsAdjustment ? adjustmentReason : undefined,
        score: this.calculateLocationScore(finalTerrain),
      })
    })
    
    return { adjustedPositions, adjustments }
  }

  /**
   * 获取高风险区域列表
   * 用于在地图上展示风险区域
   */
  getHighRiskZones(terrain: TerrainPoint[]): Array<{
    startKp: number
    endKp: number
    riskType: 'steep_slope' | 'shallow_water' | 'deep_water'
    description: string
  }> {
    const riskZones: Array<{
      startKp: number
      endKp: number
      riskType: 'steep_slope' | 'shallow_water' | 'deep_water'
      description: string
    }> = []
    
    let currentZone: {
      startKp: number
      riskType: 'steep_slope' | 'shallow_water' | 'deep_water'
    } | null = null
    
    for (const point of terrain) {
      let riskType: 'steep_slope' | 'shallow_water' | 'deep_water' | null = null
      
      if (point.slope > this.config.maxSlope) {
        riskType = 'steep_slope'
      } else if (point.depth < this.config.preferredDepthRange.min) {
        riskType = 'shallow_water'
      } else if (point.depth > this.config.preferredDepthRange.max) {
        riskType = 'deep_water'
      }
      
      if (riskType && !currentZone) {
        currentZone = { startKp: point.kp, riskType }
      } else if (!riskType && currentZone) {
        riskZones.push({
          startKp: currentZone.startKp,
          endKp: point.kp,
          riskType: currentZone.riskType,
          description: this.getRiskDescription(currentZone.riskType),
        })
        currentZone = null
      } else if (riskType && currentZone && riskType !== currentZone.riskType) {
        riskZones.push({
          startKp: currentZone.startKp,
          endKp: point.kp,
          riskType: currentZone.riskType,
          description: this.getRiskDescription(currentZone.riskType),
        })
        currentZone = { startKp: point.kp, riskType }
      }
    }
    
    // 处理最后一个区域
    if (currentZone && terrain.length > 0) {
      riskZones.push({
        startKp: currentZone.startKp,
        endKp: terrain[terrain.length - 1].kp,
        riskType: currentZone.riskType,
        description: this.getRiskDescription(currentZone.riskType),
      })
    }
    
    return riskZones
  }

  /**
   * 获取风险类型描述
   */
  private getRiskDescription(riskType: 'steep_slope' | 'shallow_water' | 'deep_water'): string {
    const descriptions: Record<string, string> = {
      steep_slope: `坡度超过 ${this.config.maxSlope}°`,
      shallow_water: `水深小于 ${this.config.preferredDepthRange.min}m`,
      deep_water: `水深大于 ${this.config.preferredDepthRange.max}m`,
    }
    return descriptions[riskType] || '未知风险'
  }
}

// 导出单例
export const repeaterPlacementService = new RepeaterPlacementService()
