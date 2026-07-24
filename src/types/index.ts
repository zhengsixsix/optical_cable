// 导出所有类型
export * from './layer'
export * from './route'
export * from './map'
export * from './settings'
export * from './rpl'
export * from './sld'
export * from './connector'
// project.ts 中的 Coordinate 与 map.ts 冲突，显式排除
export { 
  type ProjectFileType,
  type LayerSettings,
  type DeviceLibraryConfig,
  type PathPlanningMode,
  type PathPlanningConfig,
  type CalculationModel,
  type TransmissionSystemConfig,
  type DataSourceType,
  type MonitoringSystemConfig,
  type RplFileRef,
  type SldFileRef,
  type RplFileRefWithSld,
  type ProjectInfo,
  type USEProject,
  type ProjectFile,
} from './project'
export * from './simulation'
export * from './systemPlanning'
export * from './cableSegment'

// 通用类型
export interface Notification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  duration?: number
}

export type LogCategory = '系统日志' | '链路日志' | '设备日志' | '模块日志' | '操作日志' | '告警日志'

export interface LogEntry {
  time: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  category?: LogCategory
  deviceId?: string
  deviceName?: string
}

// 导入结果
export interface ImportResult {
  success: boolean
  message: string
  data?: unknown
  errors?: string[]
}
