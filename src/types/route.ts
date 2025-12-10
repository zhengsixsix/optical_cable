// 路由点类型
export type RoutePointType = 'landing' | 'branching' | 'repeater' | 'waypoint'

// 风险等级
export type RiskLevel = 'low' | 'medium' | 'high'

// 路由点
export interface RoutePoint {
  id: string
  coordinates: [number, number]
  type: RoutePointType
  name?: string
}

// 路由分段
export interface RouteSegment {
  id: string
  startPointId: string
  endPointId: string
  length: number
  depth: number
  cableType: string
  riskLevel: RiskLevel
  cost: number
}

// 成本明细结构
export interface RouteCostBreakdown {
  cable: number        // 电缆成本
  installation: number // 安装成本
  equipment: number    // 设备成本
  total: number        // 总成本
}

// 风险分析结构
export interface RouteRiskAnalysis {
  seismic: number      // 地震风险 0-1
  volcanic: number     // 火山风险 0-1
  depth: number        // 深度风险 0-1
  overall: number      // 综合风险 0-1
}

// 路由
export interface Route {
  id: string
  name: string
  points: RoutePoint[]
  segments: RouteSegment[]
  totalLength: number
  totalCost: number
  riskScore: number
  // 结构化成本和风险（用于 Pareto 优化）
  cost: RouteCostBreakdown
  risk: RouteRiskAnalysis
  distance: number     // 总距离 (km)
  createdAt: Date
  updatedAt: Date
}

// 路由成本（旧版兼容）
export interface RouteCost {
  cableCost: number
  installationCost: number
  equipmentCost: number
  totalCost: number
}

// 规划参数
export interface PlanningParams {
  startPoint: [number, number]
  endPoint: [number, number]
  avoidAreas?: [number, number, number, number][]
  maxDepth?: number
  preferredCableType?: string
}
