// 导出所有类型
export * from './layer'
export * from './route'
export * from './map'
export * from './settings'
export * from './rpl'
export * from './sld'
export * from './connector'

// 通用类型
export interface Notification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  duration?: number
}

export interface LogEntry {
  time: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
}

// 导入导出格式
export type ExportFormat = 'json' | 'geojson' | 'kml' | 'csv'

// 网元类型 (NeType) 中英文映射
export type NeType = 'LandingStation' | 'Repeater' | 'BU' | 'CableSpan' | 'SLTE' | 'PFE'

export const NeTypeMap: Record<NeType, string> = {
  LandingStation: '登陆站',
  Repeater: '中继器',
  BU: '分支器',
  CableSpan: '海缆段',
  SLTE: '终端传输设备',
  PFE: '供电设备',
}

export const NeTypeOptions = [
  { value: 'LandingStation', label: '登陆站' },
  { value: 'Repeater', label: '中继器' },
  { value: 'BU', label: '分支器' },
  { value: 'CableSpan', label: '海缆段' },
  { value: 'SLTE', label: '终端传输设备' },
  { value: 'PFE', label: '供电设备' },
]

// 导入结果
export interface ImportResult {
  success: boolean
  message: string
  data?: unknown
  errors?: string[]
}
