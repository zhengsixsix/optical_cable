// 业务模块统一入口

// Planning 模块
export { usePlanningStore } from './planning'
export type {
  Route,
  RoutePoint,
  RouteSegment,
  LayerConfig,
  HoveredSegmentInfo,
  PlanningPanelVisibility,
} from './planning'

// Design 模块
export { useDesignStore } from './design'
export type {
  SLDEquipmentType,
  SLDEquipment,
  SLDFiberSegment,
  SLDTransmissionParams,
  SLDTable,
  RPLPointType,
  RPLCableCode,
  RPLRecord,
  RPLTable,
  ConnectorType,
  ConnectorElement,
  ConnectorTable,
  DesignPanelVisibility,
} from './design'

// Monitoring 模块
export { useMonitoringStore } from './monitoring'
export type {
  DeviceStatus,
  AlarmLevel,
  MonitorDevice,
  AlarmRecord,
  PerformanceDataPoint,
  PerformanceMetrics,
  MonitoringPanelVisibility,
} from './monitoring'

// Device Library 模块
export { useDeviceLibraryStore } from './device-library'
export type {
  DeviceCategory,
  Device,
  DeviceFilter,
} from './device-library'
