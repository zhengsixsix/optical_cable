// 接线元（Connector Element）类型定义

// 接线元类型
export type ConnectorType = 
  | 'joint'      // 接头盒
  | 'bu'         // 分支单元 Branching Unit
  | 'pfe'        // 电力馈电设备 Power Feeding Equipment
  | 'ola'        // 光放大器 Optical Line Amplifier
  | 'equalizer'  // 均衡器
  | 'coupler'    // 耦合器

// 接线元状态
export type ConnectorStatus = 'active' | 'standby' | 'fault' | 'planned'

// 接线元记录
export interface ConnectorElement {
  id: string
  name: string
  type: ConnectorType
  kp: number                  // KP位置
  longitude: number
  latitude: number
  depth: number               // 水深
  status: ConnectorStatus
  specifications: string      // 规格型号
  manufacturer?: string       // 制造商
  installDate?: string        // 安装日期
  remarks: string
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
  joint: '接头盒',
  bu: '分支单元',
  pfe: '馈电设备',
  ola: '光放大器',
  equalizer: '均衡器',
  coupler: '耦合器'
}

// 接线元状态标签
export const connectorStatusLabels: Record<ConnectorStatus, string> = {
  active: '运行中',
  standby: '备用',
  fault: '故障',
  planned: '规划中'
}
