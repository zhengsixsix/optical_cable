// 接线元（Connector Element）类型定义

// 接线元类型
export type ConnectorType = 
  | 'landing'      // 岸上站点
  | 'amplifier_e'  // 放大器东
  | 'amplifier_w'  // 放大器西
  | 'bu'           // 水下分支器
  | 'underwater'   // 水下站点
  | 'fiber'        // 光纤段
  | 'ola'          // 光放大器 (OLA)
  | 'joint'        // 接头盒

// 接线元状态
export type ConnectorStatus = 'active' | 'standby' | 'fault' | 'planned'

// 接线元记录
export interface ConnectorElement {
  id: string
  name: string
  type: ConnectorType
  kp: number                  // KP位置（光纤段为起始KP）
  endKp?: number              // 结束KP（仅光纤段使用）
  longitude: number
  latitude: number
  depth: number               // 水深
  status: ConnectorStatus
  specifications: string      // 规格型号
  manufacturer?: string       // 制造商
  installDate?: string        // 安装日期
  remarks: string
  // 器件库引用
  componentRefId?: string     // 引用的器件库ID（放大器/分支器）
  fiberRefId?: string         // 引用的光纤类型ID
  // 光纤段特有属性
  fromDeviceId?: string       // 起始设备ID
  toDeviceId?: string         // 终止设备ID
  length?: number             // 光纤长度(km)
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
  amplifier_e: '放大器东',
  amplifier_w: '放大器西',
  bu: '水下分支器',
  underwater: '水下站点',
  fiber: '光纤段',
  ola: '光放大器',
  joint: '接头盒'
}

// 接线元状态标签
export const connectorStatusLabels: Record<ConnectorStatus, string> = {
  active: '运行中',
  standby: '备用',
  fault: '故障',
  planned: '规划中'
}
