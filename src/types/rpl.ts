// RPL (Route Position List) 表格类型定义
// 符合行业标准的路由位置列表文件格式

// RPL记录类型 - 事件类型
export type RPLPointType = 'landing' | 'repeater' | 'branching' | 'joint' | 'waypoint'

// RPL事件名称类型 (行业标准Event名称)
export type RPLEventType = 
  | 'Start'           // 起点
  | 'End'             // 终点
  | 'Alter Course'    // 改向点
  | 'Repeater'        // 中继器
  | 'Branching Unit'  // 分支器
  | 'Joint'           // 接头
  | 'Landing Station' // 登陆站
  | 'Waypoint'        // 航路点

// RPL电缆类型代码
export type RPLCableCode = 'LW' | 'LWS' | 'SA' | 'DA' | 'SAS'

// RPL表格单条记录
// 说明：系统内部以最小字段集维护记录；导出/导入时按行业标准字段补全（可计算字段可缺省）。
export interface RPLRecord {
  id: string

  // === 系统内部字段（必填） ===
  sequence: number           // 序号
  kp: number                 // KP值 (千米桩)
  longitude: number          // 经度 (十进制度)
  latitude: number           // 纬度 (十进制度)
  depth: number              // 水深 (m)
  pointType: RPLPointType    // 点类型
  cableType: RPLCableCode    // 电缆类型
  segmentLength: number      // 分段长度 (km)
  cumulativeLength: number   // 累计长度 (km)
  slack: number              // 余量百分比 (%)
  burialDepth: number        // 埋深 (m)
  remarks: string            // 备注

  // === 行业标准导出字段（可选，可由导出服务计算） ===
  event?: RPLEventType
  latitudeDMS?: string
  longitudeDMS?: string
  decimalLatitudeDegrees?: number
  radiansLatitude?: number
  sinLatitude?: number
  meridionalParts?: number
  distanceFromEquator?: number
  decimalLongitudeMinutes?: number
  diffLatitude?: number
  diffMPs?: number
  diffEDist?: number
  diffLongitude?: number
  courseRadians?: number
  distanceNmiles?: number
  bearingT?: number
  routeDistanceBetween?: number
  routeDistanceCumulative?: number
  cableDistanceBetween?: number
  cableDistanceCumulative?: number
  cumulativeByType?: number
  approxDepth?: number
  plannedBurialDepth?: number
  additionalFeatures?: string
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
  repeaters: number          // 中继器数量
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

// RPL编辑操作
export interface RPLEditOperation {
  type: 'add' | 'update' | 'delete' | 'reorder'
  recordId?: string
  data?: Partial<RPLRecord>
  index?: number
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
