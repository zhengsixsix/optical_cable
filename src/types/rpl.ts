// RPL (Route Position List) 表格类型定义
// 符合行业标准的路由位置列表文件格式

// RPL记录类型 - 事件类型
export type RPLPointType = 'landing' | 'repeater' | 'branching' | 'joint' | 'waypoint'

// RPL事件名称类型 (行业标准Event名称)
export type RPLEventType = 
  | 'Start'           // 起点
  | 'End'             // 终点
  | 'Alter Course'    // 改向点
  | 'Repeater'        // 放大器 (系统规划阶段设备)
  | 'Branching Unit'  // 分支器 (系统规划阶段设备)
  | 'Joint'           // 接头
  | 'Landing Station' // 登陆站
  | 'Waypoint'        // 路径点 (路由规划阶段分段管理节点)

// RPL 电缆类型代码来自平台 ARMORING_TYPE 字典。
export type RPLCableCode = string

// RPL表格单条记录 - 基于 docs/RPL表头.xlsx 行业标准格式
// 说明：系统内部以最小字段集维护记录；行业标准扩展字段仅在后端或导入文件明确提供时存在。
export interface RPLRecord {
  id: string

  // === 系统内部字段（必填） ===
  sequence: number           // Pos No. - 序号
  kp: number                 // KP值 (千米桩)
  longitude: number          // 经度 (十进制度)
  latitude: number           // 纬度 (十进制度)
  depth: number              // Approx Depth (m) - 水深
  pointType: RPLPointType    // Event - 点类型/事件
  cableType: RPLCableCode    // Cable Type - 电缆类型
  segmentLength: number      // Distance (km) Between Positions - 分段长度
  cumulativeLength: number   // Distance (km) Cumulative Total - 累计长度
  slack: number              // Slack % - 余缆率
  burialDepth: number        // Target Burial Depth (m) - 目标埋设深度
  remarks: string            // Planned Additional Route Features - 备注

  // === 行业标准导出字段（可选，由后端或导入文件提供） ===
  event?: RPLEventType                    // Event列显示名称
  latitudeDMS?: string                    // Latitude ° ' Dir
  longitudeDMS?: string                   // Longitude ° ' Dir
  decimalLatitudeDegrees?: number         // Decimal Latitude (degrees)
  radiansLatitude?: number                // Radians Latitude
  sinLatitude?: number                    // Sin Latitude
  meridionalParts?: number                // Meridional Parts
  distanceFromEquator?: number            // Distance from Equator
  decimalLongitudeMinutes?: number        // Decimal Longitude (minutes)
  diffLatitude?: number                   // Difference in Latitude (degrees)
  diffMPs?: number                        // Difference in MPs
  diffEDist?: number                      // Difference in E Dist
  diffLongitude?: number                  // Difference in Longitude (minutes)
  courseRadians?: number                  // Course (Radians)
  distanceNmiles?: number                 // Distance in nmiles (6087 ft)
  bearingT?: number                       // Bearing °T
  routeDistanceBetween?: number           // Distance (km) Between Positions
  routeDistanceCumulative?: number        // Distance (km) Cumulative Total
  cableDistanceBetween?: number           // Cable Distance (km) Between Positions
  cableDistanceCumulative?: number        // Cable Distance (km) Cumulative Total
  slackPercent?: number                   // Slack %
  cumulativeByType?: number               // Cumulative by type
  cableTotalsByType?: number              // Cable Totals By Type (km)
  approxDepth?: number                    // Approx Depth (m)
  targetBurialDepth?: number              // Target Burial Depth (m)
  additionalFeatures?: string             // Planned Additional Route Features
}

// RPL表格
export interface RPLTable {
  id: string
  name: string
  routeId: string            // 关联的路由ID
  projectId?: string         // 关联的项目ID
  records: RPLRecord[]
  metadata: RPLMetadata
  createdAt: Date
  updatedAt: Date
}

// RPL元数据
export interface RPLMetadata {
  totalLength: number        // 总长度 (km)
  totalCableLength: number   // 电缆总长度 (含余缆)
  landingStations: number    // 登陆站数量
  repeaters: number          // 放大器数量
  branchingUnits: number     // 分支器数量
  joints: number             // 接头数量
  averageDepth: number       // 平均水深
  maxDepth: number           // 最大水深
  minDepth: number           // 最小水深
}

// RPL导入/导出格式
export type RPLExportFormat = 'xlsx' | 'csv' | 'json'

// RPL筛选条件
export interface RPLFilter {
  pointType?: RPLPointType[]
  cableType?: RPLCableCode[]
  depthRange?: [number, number]
  kpRange?: [number, number]
}

// RPL验证结果
export interface RPLValidationResult {
  valid: boolean
  errors: RPLValidationError[]
  warnings: RPLValidationWarning[]
}

export interface RPLValidationError {
  recordId: string
  field: string
  message: string
}

export interface RPLValidationWarning {
  recordId: string
  field: string
  message: string
}
