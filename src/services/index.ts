// 导出所有 Service
export { GeoService, useGeoService } from './GeoService'
export { dataLinkService, useDataLink } from './DataLinkService'
export type { DeviceLink, DataChangeEvent } from './DataLinkService'
export { 
  exportRPLFile,
  exportToExcel,
  useRPLExport, 
  RPL_STANDARD_HEADERS,
  RPL_HEADER_GROUPS,
  decimalToDMS,
  calculateMeridionalParts,
  calculateDistanceKm,
  calculateAllRecords
} from './RPLExportService'
export type { CalculatedRPLRecord } from './RPLExportService'
export { 
  exportSLDFile, 
  useSLDExport, 
  exportToXML as exportSLDToXML,
  parseFromXML as parseSLDFromXML,
  escapeXml,
  exportSLDFromRoute,
  exportSLDFileFromRoute
} from './SLDExportService'
export { alarmWebSocketService, useAlarmWebSocket } from './AlarmWebSocketService'
export type { AlarmCallback, ConnectionCallback } from './AlarmWebSocketService'
export { projectFileService, useProjectFile } from './ProjectFileService'
export type { ProjectMetadata, OpenProjectResult, ProjectType } from './ProjectFileService'

// 新增模块
export { OpticalSimulationService, opticalSimulationService } from './OpticalSimulationService'
export { RepeaterPlacementService, repeaterPlacementService } from './RepeaterPlacementService'
export type { RepeaterLocation, PlacementConfig, PlacementResult, AvoidanceZone, TerrainPoint } from './RepeaterPlacementService'
export { DeviceImportService, deviceImportService } from './DeviceImportService'
export type { ImportResult, ImportError, ImportSummary } from './DeviceImportService'
export { ReportExportService, reportExportService } from './ReportExportService'
export type { CostReportData, PerformanceReportData, ReportFormat } from './ReportExportService'
export { fetchSharedGisFiles } from './GisSharedService'
export type { SharedGisFile } from './GisSharedService'
