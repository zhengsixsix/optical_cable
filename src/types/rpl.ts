// RPL (Route Position List) 表格类型定义

// RPL记录类型
export type RPLPointType = 'landing' | 'repeater' | 'branching' | 'joint' | 'waypoint'

// RPL电缆类型代码
export type RPLCableCode = 'LW' | 'LWS' | 'SA' | 'DA' | 'SAS'

// RPL表格单条记录
export interface RPLRecord {
  id: string
  sequence: number           // 序号
  kp: number                 // KP值 (千米桩)
  longitude: number          // 经度
  latitude: number           // 纬度
  depth: number              // 水深 (m)
  pointType: RPLPointType    // 点类型
  cableType: RPLCableCode    // 电缆类型
  segmentLength: number      // 分段长度 (km)
  cumulativeLength: number   // 累计长度 (km)
  slack: number              // 余缆率 (%)
  burialDepth: number        // 埋设深度 (m)
  remarks: string            // 备注
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
