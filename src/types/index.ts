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

// 导入结果
export interface ImportResult {
  success: boolean
  message: string
  data?: unknown
  errors?: string[]
}
