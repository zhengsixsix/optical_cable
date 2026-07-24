// 海缆段类型定义
import type { RiskLevel } from './route'

// 重导出 RiskLevel 以便其他模块使用
export type { RiskLevel }

// 海缆段记录
export interface CableSegment {
  id: string
  routeId: string         // 所属路由ID
  startKp: number         // 起点里程(km)
  endKp: number           // 终点里程(km)
  length: number          // 长度(km)
  riskLevel?: RiskLevel   // 仅后端明确返回时存在
  cableTypeId?: string    // 仅后端明确返回时存在
  cableTypeName?: string  // 仅后端明确返回时存在
  armorType?: string      // 仅后端明确返回时存在
  slack?: number          // 仅后端明确返回时存在
  burialDepth?: number    // 仅后端明确返回时存在
  waterDepth?: number     // 仅后端明确返回时存在
  // 几何数据引用
  geometryStartIndex?: number  // 在路由几何数组中的起始索引
  geometryEndIndex?: number    // 在路由几何数组中的结束索引
}

// 海缆段汇总统计
export interface CableSegmentSummary {
  totalSegments: number       // 总段数
  totalLength: number         // 总长度(km)
  highRiskSegments: number    // 高风险段数
  highRiskLength: number      // 高风险总长度(km)
  highRiskCost: number        // 高风险预估成本(千元)
  mediumRiskSegments: number  // 中风险段数
  mediumRiskLength: number    // 中风险总长度(km)
  mediumRiskCost: number      // 中风险预估成本(千元)
  lowRiskSegments: number     // 低风险段数
  lowRiskLength: number       // 低风险总长度(km)
  lowRiskCost: number         // 低风险预估成本(千元)
  totalCost: number           // 总预估成本(千元)
}
