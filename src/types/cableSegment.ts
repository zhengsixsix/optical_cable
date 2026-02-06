// 海缆段类型定义
import type { RiskLevel } from './route'

// 重导出 RiskLevel 以便其他模块使用
export type { RiskLevel }

// 海缆段分段方式
export type SegmentMethod = 'fixed-length' | 'risk-based'

// 海缆段生成配置
export interface SegmentGenerateConfig {
  method: SegmentMethod
  // 固定长度分段参数
  targetLength?: number  // 目标海缆段长度(km)，默认 50.0
  // 风险等级分段参数
  highRiskThreshold?: number    // 高风险阈值，默认 3
  mediumRiskThreshold?: number  // 中风险阈值，默认 2
  minLength?: number  // 最小长度(km)，默认 10.0
  maxLength?: number  // 最大长度(km)，默认 100.0
}

// 海缆段记录
export interface CableSegment {
  id: string
  routeId: string         // 所属路由ID
  startKp: number         // 起点里程(km)
  endKp: number           // 终点里程(km)
  length: number          // 长度(km)
  riskLevel: RiskLevel    // 风险等级
  cableTypeId: string     // 缆型ID
  cableTypeName: string   // 缆型名称
  armorType: string       // 铠装类型（轻铠/单铠/双铠）
  slack: number           // 敷设余量(%)
  burialDepth: number     // 埋深(m)
  isLocked?: boolean      // 是否锁定配置
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

// 默认分段配置
export const defaultSegmentGenerateConfig: SegmentGenerateConfig = {
  method: 'fixed-length',
  targetLength: 50.0,
  highRiskThreshold: 3,
  mediumRiskThreshold: 2,
  minLength: 10.0,
  maxLength: 100.0,
}
