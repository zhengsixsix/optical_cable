// SLD (System Layout Diagram) 表格类型定义

// 设备类型
export type SLDEquipmentType = 
  | 'TE'           // 终端设备 Terminal Equipment
  | 'PFE'          // 供电设备 Power Feeding Equipment
  | 'REP'          // 中继器 Repeater
  | 'BU'           // 分支器 Branching Unit
  | 'JOINT'        // 接头 Joint
  | 'OADM'         // 光分插复用器

// 光纤对类型
export type FiberPairType = 'working' | 'protection' | 'spare'

// SLD设备记录
export interface SLDEquipment {
  id: string
  sequence: number           // 序号
  name: string               // 设备名称
  type: SLDEquipmentType     // 设备类型
  location: string           // 位置描述
  kp: number                 // KP值
  longitude: number          // 经度
  latitude: number           // 纬度
  depth: number              // 水深
  specifications: string     // 规格型号
  manufacturer?: string      // 制造商
  remarks: string            // 备注
}

// SLD光纤段
export interface SLDFiberSegment {
  id: string
  sequence: number           // 序号
  fromEquipmentId: string    // 起始设备ID
  toEquipmentId: string      // 终止设备ID
  fromName: string           // 起始设备名
  toName: string             // 终止设备名
  length: number             // 长度 (km)
  fiberPairs: number         // 光纤对数
  fiberPairType: FiberPairType // 光纤对类型
  cableType: string          // 电缆类型
  attenuation: number        // 衰减 (dB/km)
  totalLoss: number          // 总损耗 (dB)
  remarks: string
}

// SLD传输参数
export interface SLDTransmissionParams {
  designCapacity: number     // 设计容量 (Tbps)
  wavelengths: number        // 波长数
  channelSpacing: number     // 通道间隔 (GHz)
  modulationFormat: string   // 调制格式
  launchPower: number        // 发射功率 (dBm)
  osnrRequired: number       // 所需OSNR (dB)
  spanLossBudget: number     // 跨段损耗预算 (dB)
  systemMargin: number       // 系统余量 (dB)
}

// SLD表格
export interface SLDTable {
  id: string
  name: string
  projectId?: string
  routeId?: string
  equipments: SLDEquipment[]
  fiberSegments: SLDFiberSegment[]
  transmissionParams: SLDTransmissionParams
  metadata: SLDMetadata
  createdAt: Date
  updatedAt: Date
}

// SLD元数据
export interface SLDMetadata {
  totalLength: number        // 总长度
  totalEquipments: number    // 设备总数
  terminalCount: number      // 终端数量
  repeaterCount: number      // 中继器数量
  branchingUnitCount: number // 分支器数量
  jointCount: number         // 接头数量
  totalFiberPairs: number    // 总光纤对数
  estimatedCapacity: number  // 预估容量 (Tbps)
}

// SLD导出格式
export type SLDExportFormat = 'xlsx' | 'csv' | 'json' | 'pdf'

// SLD验证结果
export interface SLDValidationResult {
  valid: boolean
  errors: SLDValidationError[]
  warnings: SLDValidationWarning[]
}

export interface SLDValidationError {
  itemId: string
  itemType: 'equipment' | 'segment'
  field: string
  message: string
}

export interface SLDValidationWarning {
  itemId: string
  itemType: 'equipment' | 'segment'
  field: string
  message: string
}
