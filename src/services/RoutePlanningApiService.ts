/**
 * 路由规划 API 客户端服务
 * 线上 Swagger 当前未提供路由规划接口；调用方应保持空态。
 */

// 坐标点接口
export interface Coordinate {
  lon: number
  lat: number
  depth?: number
  name?: string
}

// 铠装映射配置
export interface ArmorMappingConfig {
  riskLevel: 'high' | 'medium' | 'low'
  riskThreshold: number      // 风险阈值
  cableTypeId: string        // 缆型ID
  cableTypeName: string      // 缆型名称
  unitPrice: number          // 单价（千元/km）
}

// BU 配置
export interface BUNodeConfig {
  id: string
  name: string
  lon: number
  lat: number
  portLimit: number  // 端口数上限
}

// 冗余策略配置
export interface RedundancyPlanningConfig {
  enabled: boolean
  costLimitType: 'relative' | 'absolute'
  relativeCostPercent?: number  // 相对成本百分比
  absoluteCostLimit?: number    // 绝对成本上限（万元）
  criticalNodes?: string[]      // 关键节点ID列表（仅为这些节点生成备份路径）
}

// 避障区域配置
export interface AvoidanceZone {
  id: string
  name?: string
  points: Coordinate[]  // 多边形顶点
}

// 规划请求参数
export interface RoutePlanningRequest {
  mode: 'point-to-point' | 'multi-point'
  startPoint?: Coordinate
  endPoint?: Coordinate
  waypoints?: Coordinate[]
  planningRange?: {
    northwest: { lon: number; lat: number }
    southeast: { lon: number; lat: number }
  }
  // 栅格分辨率（米）
  gridResolution?: number
  // 风险配置
  riskConfig?: {
    highRiskThreshold: number
    mediumRiskThreshold: number
  }
  // 避障区域
  avoidanceZones?: AvoidanceZone[]
  // 铠装映射配置
  armorMappings?: ArmorMappingConfig[]
  // BU 分支器配置
  buList?: BUNodeConfig[]
  // 冗余策略配置
  redundancyConfig?: RedundancyPlanningConfig
}

// 路由段接口
export interface RouteSegment {
  id: string
  startPoint: Coordinate
  endPoint: Coordinate
  length: number
  depth: number
  riskLevel: 'high' | 'medium' | 'low'
  cableType: string
}

// 单条路由接口
export interface ParetoRoute {
  id: string
  name: string
  totalLength: number
  totalCost: number
  avgRisk: number
  segments: RouteSegment[]
  coordinates: [number, number][]
}

// 规划结果接口
export interface RoutePlanningResult {
  success: boolean
  mode: 'point-to-point' | 'multi-point'
  routes: ParetoRoute[]
  summary: {
    totalRoutes: number
    bestLength: number
    bestCost: number
    lowestRisk: number
  }
}

/**
 * 调用后端路由规划接口
 */
export async function fetchRoutePlanning(_request: RoutePlanningRequest): Promise<RoutePlanningResult> {
  throw new Error('线上 Swagger 暂未提供路由规划接口')
}

/**
 * 检查路由规划服务是否可用
 */
export async function checkRoutePlanningService(): Promise<boolean> {
  return false
}

/**
 * 获取 API 基础地址
 */
export function getApiBase(): string {
  return ''
}
