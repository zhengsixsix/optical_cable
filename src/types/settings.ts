import type {
  GNModelParams,
  EGNModelParams,
  SSFMModelParams,
  EDFASimpleParams,
  EDFAFullParams,
} from './systemPlanning'
import type { ComponentModelParamsConfig } from './useFile'

// ========== 模型参数抽屉机制 ==========

/** 光纤模型参数抽屉 */
export interface FiberModelDrawers {
  /** GN 模型参数 */
  gnParams?: GNModelParams
  /** EGN 模型参数 */
  egnParams?: EGNModelParams
  /** SSFM 模型参数 */
  ssfmParams?: SSFMModelParams
}

/** EDFA 模型参数抽屉 */
export interface EDFAModelDrawers {
  /** 简化模型参数 */
  simpleParams?: EDFASimpleParams
  /** 完整模型参数 */
  fullParams?: EDFAFullParams
}

// 光纤类型
export interface FiberType {
  id: string
  name: string                    // 光纤类型名称
  fiberCategory?: string          // 光纤类型（如 G.654.E）
  nonlinearCoeff: number          // 非线性系数 γ (W⁻¹·km⁻¹)
  effectiveArea: number           // 有效面积 A_eff (μm²)
  dispersion: number              // 色散系数 D (ps/nm·km)
  dispersionSlope?: number        // 色散斜率 S (ps/nm²·km)
  nonlinearRefractiveIndex: number // 非线性折射率 n_2 (×10⁻²⁰ m²/W)
  attenuationCoeff: number        // 衰减系数 α (dB/km)
  secondOrderDispersion: number   // 二阶色散 β₂ (ps²)
  simulationModel?: 'GN' | 'EGN'  // 光纤仿真模型偏好
  /** 模型参数抽屉 - 按计算模型分层的额外参数 */
  modelDrawers?: FiberModelDrawers
}

// 放大器类型
export interface AmplifierType {
  id: string
  name: string                    // 放大器类型名称
  gain: number                    // 额定增益 (dB)
  bandwidth: number               // 带宽 (nm)
  gainFlatness: number            // 平坦度 (dB)
  noiseFigure: number             // 噪声系数 NF (dB)
  pumpPower: number               // 泵浦功率 (mW)
  outputPower: number             // 最大输出功率 (dBm)
  saturationPower?: number        // 饱和功率 (dBm)
  gainRangePower: number          // 增益范围功率 (dB)
  /** 工作模式 */
  operatingMode?: 'fixed_gain' | 'fixed_output' | 'apc'
  /** 单价 */
  unitPrice?: number
  /** 币种 */
  currency?: 'USD' | 'CNY' | 'EUR'
  /** 模型参数抽屉 - 按计算模型分层的额外参数 */
  modelDrawers?: EDFAModelDrawers
  /** USE 规范字段: 支持的计算模型 ID 列表 */
  supported_models?: string[]
  /** USE 规范字段: 以模型 ID 为 key 的参数配置 */
  model_params?: Record<string, ComponentModelParamsConfig>
}

// 分支器子类型
export type BranchingUnitSubType = 'BU' | 'ROADM' | 'OADM'

// 分支器类型 (BU)
export interface BranchingUnitType {
  id: string
  name: string                    // 分支器类型名称
  subType?: BranchingUnitSubType  // 子类型：BU普通分支器/ROADM可重构/OADM非重构
  portCount: number               // 端口数量
  /** 主干插损 (dB) - BU 的主干路径插损 */
  trunkInsertionLoss: number
  /** 分支插损 (dB) - BU 的分支路径插损 */
  branchInsertionLoss: number
  /** 通用插损 (dB) - 兼容旧字段 */
  insertionLoss: number
  wavelengthRange: number         // 工作波长范围 (nm)
  /** 单价 (USD) */
  unitPrice?: number
  /** 币种 */
  currency?: 'USD' | 'CNY' | 'EUR'
  /** USE 规范字段: 支持的计算模型 ID 列表 */
  supported_models?: string[]
  /** USE 规范字段: 以模型 ID 为 key 的参数配置 */
  model_params?: Record<string, ComponentModelParamsConfig>
}

// 电缆类型（保留兼容）
export interface EqualizerType {
  id: string
  name: string
  attenuationMode: 'adjustable' | 'fixed'
  defaultAttenuationDb: number
  unitPrice?: number
  currency?: 'USD' | 'CNY' | 'EUR'
  remarks?: string
  supported_models?: string[]
  model_params?: Record<string, ComponentModelParamsConfig>
}

// 接头盒子类型
export type JointBoxSubType =
  | 'BJB'   // 滩头接头盒
  | 'SEJB'  // 可扩展接头盒（岗上，后续扩展用）
  | 'BUJB'  // 分支单元接头盒（接 BU 用）
  | 'SJB'   // 海底接头盒
  | 'FJB'   // 光纤接头盒（普通海底接续）
  | 'LIJB'  // 登陆界面接头盒

// 接头盒型号
export interface JointBoxType {
  id: string
  name: string                    // 型号名称
  subType?: JointBoxSubType       // 子类型（对应 SLD 图标类型）
  insertionLoss: number           // 接头盒插损 (dB)
  maxFiberPairs?: number          // 最大光纤对数
  unitPrice?: number              // 单价
  currency?: 'USD' | 'CNY' | 'EUR'
  remarks?: string
}

export interface CableType {
  id: string
  name: string
  costPerKm: number
  maxDepth: number
  fiberCount: number
}

// 放大器类型（保留兼容）
export interface RepeaterType {
  id: string
  name: string
  cost: number
  maxSpan: number
  powerConsumption: number
  gain?: number  // 增益 (dB)
}

// 分支单元（保留兼容）
export interface BranchingUnit {
  id: string
  name: string
  cost: number
  portCount: number
}

// 成本因子
export interface CostFactors {
  // 原有字段（向后兼容）
  laborCostPerKm: number         // 人工成本/每公里
  vesselCostPerDay: number       // 船舶成本/每天
  surveyingCostPerKm: number     // 勘测成本/每公里
  contingencyPercent: number     // 应急百分比
  // 新增字段 - 用于系统规划成本计算
  cableCostPerKm?: number        // 电缆每公里成本
  installationCostPerKm?: number // 安装每公里成本
  repeaterCost?: number          // 放大器单价
  branchingUnitCost?: number     // 分支器单价
  equalizerCost?: number         // 均衡器单价
  landingStationCost?: number    // 登陆站成本
  currency?: string              // 货币类型
  // 路径规划成本参数
  lightCableCost?: number        // 轻型海缆单价 (千元/公里)
  heavyCableCost?: number        // 重型海缆单价 (千元/公里)
  maxConstructionCost?: number   // 施工成本极大值 (千元/公里)
  depthThreshold?: number        // 深浅分界值 (米)
}

// 应用设置
export interface AppSettings {
  cableTypes: CableType[]
  repeaterTypes: RepeaterType[]
  branchingUnits: BranchingUnit[]
  costFactors: CostFactors
  // 新增器件库
  fiberTypes: FiberType[]
  amplifierTypes: AmplifierType[]
  branchingUnitTypes: BranchingUnitType[]
  equalizerTypes: EqualizerType[]
  jointBoxTypes: JointBoxType[]
  currentLibraryFile: string
}

// 默认光纤类型（空数组，由用户自行添加）
export const defaultFiberTypes: FiberType[] = []

// 默认放大器类型（空数组，由用户自行添加）
export const defaultAmplifierTypes: AmplifierType[] = []

// 默认分支器类型（空数组，由用户自行添加）
export const defaultBranchingUnitTypes: BranchingUnitType[] = []

// 默认均衡器类型（空数组，由用户自行添加）
export const defaultEqualizerTypes: EqualizerType[] = []

// 默认接头盒型号（空数组，由用户自行添加）
export const defaultJointBoxTypes: JointBoxType[] = []

// 默认设置
export const defaultSettings: AppSettings = {
  cableTypes: [
    { id: 'lw', name: 'LW (轻型)', costPerKm: 15000, maxDepth: 8000, fiberCount: 8 },
    { id: 'sa', name: 'SA (单铠装)', costPerKm: 25000, maxDepth: 2000, fiberCount: 12 },
    { id: 'da', name: 'DA (双铠装)', costPerKm: 35000, maxDepth: 200, fiberCount: 24 },
  ],
  repeaterTypes: [
    { id: 'std', name: '标准放大器', cost: 500000, maxSpan: 80, powerConsumption: 50 },
    { id: 'high', name: '高功率放大器', cost: 800000, maxSpan: 100, powerConsumption: 80 },
  ],
  branchingUnits: [
    { id: 'bu2', name: '2端口分支器', cost: 200000, portCount: 2 },
    { id: 'bu4', name: '4端口分支器', cost: 350000, portCount: 4 },
  ],
  costFactors: {
    laborCostPerKm: 5000,
    vesselCostPerDay: 50000,
    surveyingCostPerKm: 2000,
    contingencyPercent: 15,
    // 新增默认值
    cableCostPerKm: 35000,
    installationCostPerKm: 15000,
    repeaterCost: 250000,
    branchingUnitCost: 180000,
    equalizerCost: 15000,
    landingStationCost: 5000000,
    currency: 'USD',
  },
  fiberTypes: defaultFiberTypes,
  amplifierTypes: defaultAmplifierTypes,
  branchingUnitTypes: defaultBranchingUnitTypes,
  equalizerTypes: defaultEqualizerTypes,
  jointBoxTypes: defaultJointBoxTypes,
  currentLibraryFile: 'DefaultLibrary_v1.0.csv',
}
