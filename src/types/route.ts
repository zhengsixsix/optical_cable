// 路由点类型
export type RoutePointType = 'landing' | 'branching' | 'repeater' | 'waypoint'

// 风险等级
export type RiskLevel = 'low' | 'medium' | 'high'

// 路由点设备信息（从器件库获取）
export interface RoutePointDevice {
  deviceId: string           // 器件库中的设备ID
  deviceType: string         // 设备类型（repeater/branching/cable等）
  deviceName: string         // 设备名称
  // 放大器参数
  cost?: number              // 成本
  maxSpan?: number           // 最大跨距
  powerConsumption?: number  // 功耗
  // 放大器参数
  gain?: number              // 增益
  noiseFigure?: number       // 噪声系数
  outputPower?: number       // 输出功率
  // 分支器参数
  portCount?: number         // 端口数
  insertionLoss?: number     // 插损
}

// 分支目标信息
export interface BranchToInfo {
  coord: [number, number]
  name: string
}

// 路由点
export interface RoutePoint {
  id: string
  coordinates: [number, number]
  type: RoutePointType
  name?: string
  depth?: number  // 水深，>0 表示水下站点，0 或不设置表示岸上站点
  // 器件库设备信息
  device?: RoutePointDevice
  // 分支目标（多点规划时使用）
  branchTo?: BranchToInfo
  // 所有分支目标（支持一个 BU 连接多个分支登陆站）
  branchTargets?: BranchToInfo[]
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

// 海缆类型枚举
export type CableCategory = 'LPA' | 'HPA'

// 海缆规格
export interface CableSpec {
  value: string
  label: string
  category: CableCategory
  unitPrice: number  // 单价 (万元/km)
}
