/**
 * Central mock data registry.
 *
 * Business fixtures are intentionally empty. Form option lists are kept because
 * they are application configuration, not demo project data.
 */

import type {
  ConnectorElement,
  LayerConfig,
  Route,
  RPLRecord,
  SLDEquipment,
  SLDFiberSegment,
  SLDTransmissionParams,
} from '@/types'

export const ROUTE_ID = ''
export const ROUTE_NAME = ''

export const mockRPLRecords: Omit<RPLRecord, 'id' | 'sequence'>[] = []
export const mockSLDEquipments: Omit<SLDEquipment, 'id' | 'sequence'>[] = []
export const mockSLDFiberSegments: Omit<SLDFiberSegment, 'id' | 'sequence'>[] = []
export const mockConnectorElements: Omit<ConnectorElement, 'id'>[] = []

export interface SegmentConfigData {
  id: string
  index: number
  startKP: number
  endKP: number
  length: number
  cableType: string
  slack: number
  burialDepth: number
  burialMethod: string
  protection: string
  avgDepth: number
  maxDepth: number
  expanded: boolean
  fiberRefId?: string
}

export const mockSegmentConfigs: SegmentConfigData[] = []
export const mockTransmissionParams: Partial<SLDTransmissionParams> = {}
export const mockRoutes: Route[] = []
export const mockLayers: LayerConfig[] = []
export const mockMonitorDevices = []
export const mockAlarmHistory = []
export const mockEditableRoutePoints = []
export const mockRepeaterConfigs = []
export const mockMonitorPanelDevices = []
export const mockMonitorPanelStats = {}
export const mockRouteStats = {}
export const mockReportData = {}
export const mockParetoRoutes: Route[] = []

export const repeaterModelOptions = [
  { value: 'EREP-C', label: 'EREP-C (C波段)' },
  { value: 'EREP-C+L', label: 'EREP-C+L (C+L波段)' },
  { value: 'EREP-S+C+L', label: 'EREP-S+C+L (全波段)' },
]

export const repeaterSpacingConfig = {
  recommended: 80,
  max: 120,
  totalLength: 0,
}

export const cableTypeOptions = [
  { value: 'LW', label: 'LW - 轻型无铠装' },
  { value: 'LWS', label: 'LWS - 轻型加强' },
  { value: 'SA', label: 'SA - 单铠装' },
  { value: 'DA', label: 'DA - 双铠装' },
  { value: 'SAS', label: 'SAS - 单铠装加强' },
]

export const cableTypeOptionsSimple = [
  { value: 'LW', label: 'LW (轻型)' },
  { value: 'LWS', label: 'LWS (轻型加强)' },
  { value: 'SA', label: 'SA (单铠装)' },
  { value: 'DA', label: 'DA (双铠装)' },
  { value: 'SAS', label: 'SAS (单铠装加强)' },
]

export const burialMethodOptions = [
  { value: 'none', label: '不埋设' },
  { value: 'plow', label: '犁埋' },
  { value: 'jet', label: '喷射埋设' },
  { value: 'ROV', label: 'ROV埋设' },
  { value: 'dredge', label: '挖沟埋设' },
]

export const protectionOptions = [
  { value: 'none', label: '无防护' },
  { value: 'rock', label: '抛石防护' },
  { value: 'mattress', label: '护垫防护' },
  { value: 'pipe', label: '套管防护' },
  { value: 'anchor', label: '锚固防护' },
]

export const pointTypeOptions = [
  { value: 'landing', label: '登陆站' },
  { value: 'repeater', label: '放大器' },
  { value: 'branching', label: '分支器' },
  { value: 'joint', label: '接头盒' },
  { value: 'waypoint', label: '路径点' },
]

export const fiberPairTypeOptions = [
  { value: 'working', label: '工作光纤' },
  { value: 'protection', label: '保护光纤' },
  { value: 'spare', label: '备用光纤' },
]

export const equipmentTypeOptions = [
  { value: 'TE', label: '终端设备 (TE)' },
  { value: 'PFE', label: '供电设备 (PFE)' },
  { value: 'REP', label: '放大器 (REP)' },
  { value: 'BU', label: '分支器 (BU)' },
  { value: 'EQ', label: '均衡器 (EQ)' },
  { value: 'JOINT', label: '接头盒 (JOINT)' },
  { value: 'OADM', label: '光分插复用器 (OADM)' },
]

export const fiberModelOptions = [
  { value: 'GN', label: 'GN Model (高斯噪声模型)', desc: '解析近似，计算速度快，NLI 偏悲观' },
  { value: 'EGN', label: 'EGN Model (增强型高斯噪声模型)', desc: '考虑调制格式修正，精度更高，GSNR 比 GN 高 2-3 dB' },
  { value: 'SSFM', label: 'SSFM (分步傅里叶数值仿真)', desc: '全数值求解，精度最高，计算耗时较长' },
]

export const planningModeOptions = [
  { value: 'point-to-point', label: '点对点规划' },
  { value: 'multi-point', label: '多点规划' },
]

export const dataSourceOptions = [
  { value: 'realtime', label: '网络实时数据' },
  { value: 'history', label: '导入历史数据' },
]

export const calculationModelOptions = [
  { value: 'power', label: '计算光功率衰减' },
  { value: 'ase', label: '计算线性噪声 (ASE等)' },
  { value: 'nli', label: '计算非线性噪声 (NLI)' },
  { value: 'amp', label: '封装光放大器增益与噪声模型' },
  { value: 'passive', label: '计算无源器件插入损耗' },
]

export const supportedImportFormats = [
  { ext: '.geojson', label: 'GeoJSON' },
  { ext: '.json', label: 'JSON' },
  { ext: '.kml', label: 'KML' },
  { ext: '.csv', label: 'CSV' },
]

export const exportFormatOptions = [
  { value: 'geojson', label: 'GeoJSON (.geojson)' },
  { value: 'kml', label: 'KML (.kml)' },
  { value: 'csv', label: 'CSV (.csv)' },
]
