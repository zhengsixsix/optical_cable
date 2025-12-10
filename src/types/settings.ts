// 电缆类型
export interface CableType {
  id: string
  name: string
  costPerKm: number
  maxDepth: number
  fiberCount: number
}

// 中继器类型
export interface RepeaterType {
  id: string
  name: string
  cost: number
  maxSpan: number
  powerConsumption: number
}

// 分支单元
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
}

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
}
