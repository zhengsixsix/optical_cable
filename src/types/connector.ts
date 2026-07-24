import type { BranchingUnitSubType, JointBoxSubType } from './settings'

// 接线元（Connector Element）类型定义

// 接线元类型
export type ConnectorType =
  | 'landing'        // 岸上站点
  | 'amplifier_e'    // 放大器东
  | 'amplifier_w'    // 放大器西
  | 'bu'             // 水下分支器
  | 'equalizer'      // 均衡器
  | 'underwater'     // 水下站点
  | 'cable_segment'  // 海缆段（路由规划阶段，用于铠装/敷设余量配置）
  | 'fiber'          // 光纤段（系统设计阶段，放大器间的光学传输段）
  | 'ola'            // 光放大器 (OLA)
  | 'joint'          // 接头盒
  | 'device'         // 平台字典中尚无专用渲染器的通用器件

// 接线元状态
export type ConnectorStatus = 'active' | 'standby' | 'fault' | 'planned'

// 接线元记录
export interface ConnectorElement {
  id: string
  platformEntityId?: string | number
  deviceTypeCd?: string
  name: string
  type: ConnectorType
  kp: number
  endKp?: number
  longitude: number
  latitude: number
  depth: number
  status: ConnectorStatus
  specifications: string
  manufacturer?: string
  installDate?: string
  remarks: string
  componentRefId?: string
  fiberRefId?: string
  buPortCount?: number
  buTrunkLoss?: number
  buBranchLoss?: number
  buBranchTarget?: string
  buNextHopUpstream?: string
  buNextHopDownstream?: string
  equalizerRole?: 'T' | 'S'
  attenuationMode?: 'adjustable' | 'fixed'
  attenuationDb?: number
  jointSubType?: JointBoxSubType
  buSubType?: BranchingUnitSubType
  fromDeviceId?: string
  toDeviceId?: string
  length?: number
  cableTypeId?: string
  cableTypeName?: string
  armorType?: string
  slack?: number
  burialDepth?: number
  riskLevel?: 'high' | 'medium' | 'low'
}

// 接线元表格
export interface ConnectorTable {
  id: string
  name: string
  routeId?: string
  elements: ConnectorElement[]
  createdAt: string
  updatedAt: string
}

// 接线元类型标签
export const connectorTypeLabels: Record<ConnectorType, string> = {
  landing: '岸上站点',
  amplifier_e: '放大器',
  amplifier_w: '放大器',
  bu: '分支器',
  equalizer: '均衡器',
  underwater: '水下站点',
  cable_segment: '海缆段',
  fiber: '光纤段',
  ola: '放大器',
  joint: '接头盒',
  device: '器件',
}
