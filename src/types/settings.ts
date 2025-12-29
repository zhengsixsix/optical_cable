// 光纤类型
export interface FiberType {
  id: string
  name: string                    // 光纤类型名称
  nonlinearCoeff: number          // 非线性系数 γ (W⁻¹·km⁻¹)
  effectiveArea: number           // 有效面积 A_eff (μm²)
  dispersion: number              // 色散 (ps/nm·km)
  nonlinearRefractiveIndex: number // 非线性折射率 n_2 (×10⁻²⁰ m²/W)
  attenuationCoeff: number        // 衰减系数 α (dB/km)
  secondOrderDispersion: number   // 二阶色散 β₂ (ps²)
  simulationModel?: 'GN' | 'EGN'  // 光纤仿真模型偏好
}

// 放大器类型
export interface AmplifierType {
  id: string
  name: string                    // 放大器类型名称
  gain: number                    // 增益 (dB)
  bandwidth: number               // 带宽 (nm)
  gainFlatness: number            // 增益平坦度 (dB)
  noiseFigure: number             // 噪声系数 (dB)
  pumpPower: number               // 泵浦功率 (mW)
  outputPower: number             // 输出功率 (dBm)
  gainRangePower: number          // 增益范围功率 (dB)
}

// 分支器类型
export interface BranchingUnitType {
  id: string
  name: string                    // 分支器类型名称
  portCount: number               // 端口数量
  insertionLoss: number           // 端口间插损 (dB)
  wavelengthRange: number         // 工作波长范围 (nm)
}

// 电缆类型（保留兼容）
export interface CableType {
  id: string
  name: string
  costPerKm: number
  maxDepth: number
  fiberCount: number
}

// 中继器类型（保留兼容）
export interface RepeaterType {
  id: string
  name: string
  cost: number
  maxSpan: number
  powerConsumption: number
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
  laborCostPerKm: number
  vesselCostPerDay: number
  surveyingCostPerKm: number
  contingencyPercent: number
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
  currentLibraryFile: string
}

// 默认光纤类型
export const defaultFiberTypes: FiberType[] = [
  {
    id: 'fiber-a',
    name: 'A',
    nonlinearCoeff: 1.4,
    effectiveArea: 60,
    dispersion: 16,
    nonlinearRefractiveIndex: 2.6,
    attenuationCoeff: 0.23,
    secondOrderDispersion: -20,
    simulationModel: 'GN',
  },
]

// 默认放大器类型
export const defaultAmplifierTypes: AmplifierType[] = [
  {
    id: 'amp-a',
    name: 'A',
    gain: 20,
    bandwidth: 1550,
    gainFlatness: 0.5,
    noiseFigure: 5,
    pumpPower: 100,
    outputPower: 10,
    gainRangePower: 0.1,
  },
]

// 默认分支器类型
export const defaultBranchingUnitTypes: BranchingUnitType[] = [
  {
    id: 'bu-1',
    name: 'BU-1',
    portCount: 3,
    insertionLoss: 0.8,
    wavelengthRange: 1550,
  },
]

// 默认设置
export const defaultSettings: AppSettings = {
  cableTypes: [
    { id: 'lw', name: 'LW (轻型)', costPerKm: 15000, maxDepth: 8000, fiberCount: 8 },
    { id: 'sa', name: 'SA (单铠装)', costPerKm: 25000, maxDepth: 2000, fiberCount: 12 },
    { id: 'da', name: 'DA (双铠装)', costPerKm: 35000, maxDepth: 200, fiberCount: 24 },
  ],
  repeaterTypes: [
    { id: 'std', name: '标准中继器', cost: 500000, maxSpan: 80, powerConsumption: 50 },
    { id: 'high', name: '高功率中继器', cost: 800000, maxSpan: 100, powerConsumption: 80 },
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
  },
  fiberTypes: defaultFiberTypes,
  amplifierTypes: defaultAmplifierTypes,
  branchingUnitTypes: defaultBranchingUnitTypes,
  currentLibraryFile: 'DefaultLibrary_v1.0.csv',
}
