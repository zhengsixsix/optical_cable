/**
 * 路由规划模块类型定义
 */

// 规划配置参数
export interface PlanningParams {
  startPoint: { lon: number; lat: number; name?: string }
  endPoint: { lon: number; lat: number; name?: string }
  waypoints?: Array<{ lon: number; lat: number; name?: string }>
}

// 规划模式
export type PlanningMode = 'point-to-point' | 'multi-point'

// 规划配置
export interface PlanningConfig {
  mode: PlanningMode
  startPoint: { lon: number; lat: number; name?: string }
  endPoint: { lon: number; lat: number; name?: string }
  waypoints?: Array<{ id: string; name: string; lon: number; lat: number }>
  // 成本参数
  cableCostPerKm?: number
  installationCostPerKm?: number
  repeaterCost?: number
}

// 路由点类型
export type RoutePointType = 'landing' | 'waypoint' | 'repeater' | 'branching'

// 风险等级
export type RiskLevel = 'low' | 'medium' | 'high'

// 图层类型
export type LayerType = 'vector' | 'raster' | 'heatmap' | 'point' | 'both'

// 导出 store 中的类型
export type {
  Route,
  RoutePoint,
  RouteSegment,
  LayerConfig,
  HoveredSegmentInfo,
  PlanningPanelVisibility,
} from './store'
