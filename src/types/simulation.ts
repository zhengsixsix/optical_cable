/**
 * 光学性能仿真类型定义
 * 用于 GSNR/OSNR 计算和链路预算分析
 */

// ========== 光纤参数 ==========

/** 光纤类型参数 */
export interface FiberParams {
  /** 光纤类型标识 */
  type: string
  /** 衰减系数 (dB/km) @1550nm */
  attenuation: number
  /** 色散系数 (ps/nm/km) @1550nm */
  dispersion: number
  /** 色散斜率 (ps/nm²/km) */
  dispersionSlope: number
  /** 有效面积 (μm²) */
  effectiveArea: number
  /** 非线性折射率 n2 (m²/W) */
  nonlinearIndex: number
  /** 非线性系数 γ (1/W/km) */
  nonlinearCoeff: number
}

// ========== 放大器参数 ==========

/** 放大器/放大器参数 */
export interface AmplifierParams {
  /** 放大器类型 */
  type: 'EDFA' | 'Raman' | 'Hybrid'
  /** 噪声系数 NF (dB) */
  noiseFigure: number
  /** 增益 (dB) */
  gain: number
  /** 最大输出功率 (dBm) */
  maxOutputPower: number
  /** 增益平坦度 (dB) */
  gainFlatness: number
  /** 工作波段 */
  band: 'C' | 'L' | 'C+L'
}

// ========== WDM 系统参数 ==========

/** WDM 传输系统参数 */
export interface WDMSystemParams {
  /** 波道数量 */
  channelCount: number
  /** 信道间隔 (GHz) */
  channelSpacing: number
  /** 中心波长 (nm) */
  centerWavelength: number
  /** 符号率 (GBaud) */
  symbolRate: number
  /** 调制格式 */
  modulationFormat: ModulationFormat
  /** 单通道发射功率 (dBm) */
  launchPowerPerChannel: number
  /** FEC 类型 */
  fecType: FECType
  /** FEC 开销 (%) */
  fecOverhead: number
}

/** 调制格式 */
export type ModulationFormat = 
  | 'QPSK' 
  | '8QAM' 
  | '16QAM' 
  | '32QAM' 
  | '64QAM'
  | 'DP-QPSK'
  | 'DP-16QAM'
  | 'PCS-64QAM'

/** FEC 类型 */
export type FECType = 
  | 'HD-FEC'      // 硬判决 FEC
  | 'SD-FEC'      // 软判决 FEC  
  | 'OFEC'        // 开放 FEC
  | 'None'

/** 调制格式参数映射 */
export interface ModulationParams {
  /** 每符号比特数 */
  bitsPerSymbol: number
  /** 所需 OSNR (dB) @BER=1e-3 */
  requiredOSNR: number
  /** 所需 GSNR (dB) */
  requiredGSNR: number
  /** 频谱效率 (bit/s/Hz) */
  spectralEfficiency: number
}

// ========== 跨段/链路结构 ==========

/** 光纤跨段 */
export interface FiberSpan {
  /** 跨段ID */
  id: string
  /** 跨段序号 */
  index: number
  /** 跨段长度 (km) */
  length: number
  /** 光纤类型参数 */
  fiber: FiberParams
  /** 跨段损耗 (dB) */
  spanLoss: number
  /** 连接器/接头损耗 (dB) */
  connectorLoss: number
  /** 余量 (dB) */
  margin: number
}

/** 链路节点 */
export interface LinkNode {
  /** 节点ID */
  id: string
  /** 节点类型 */
  type: 'terminal' | 'repeater' | 'branching' | 'joint' | 'equalizer'
  /** 节点名称 */
  name: string
  /** KP位置 (km) */
  kp: number
  /** 放大器参数 (放大器节点) */
  amplifier?: AmplifierParams
}

/** 完整链路 */
export interface OpticalLink {
  /** 链路ID */
  id: string
  /** 链路名称 */
  name: string
  /** 节点列表 */
  nodes: LinkNode[]
  /** 跨段列表 */
  spans: FiberSpan[]
  /** WDM系统参数 */
  wdmParams: WDMSystemParams
  /** 总长度 (km) */
  totalLength: number
}

// ========== 仿真结果 ==========

/** 单跨段仿真结果 */
export interface SpanSimulationResult {
  /** 跨段ID */
  spanId: string
  /** 跨段序号 */
  index: number
  /** KP起点 (km) */
  kpStart: number
  /** KP终点 (km) */
  kpEnd: number
  /** 跨段长度 (km) */
  length: number
  /** 跨段损耗 (dB) */
  spanLoss: number
  /** 累计ASE噪声功率 (dBm) */
  aseNoisePower: number
  /** 累计NLI噪声功率 (dBm) */
  nliNoisePower: number
  /** OSNR (dB) @0.1nm */
  osnr: number
  /** GSNR (dB) */
  gsnr: number
  /** GSNR余量 (dB) */
  gsnrMargin: number
  /** 信号功率 (dBm) */
  signalPower: number
}

/** 链路仿真结果 */
export interface LinkSimulationResult {
  /** 链路ID */
  linkId: string
  /** 仿真时间 */
  simulatedAt: Date
  /** 使用的仿真模型 */
  model: SimulationModel
  /** 各跨段结果 */
  spanResults: SpanSimulationResult[]
  /** 端到端 OSNR (dB) */
  endToEndOSNR: number
  /** 端到端 GSNR (dB) */
  endToEndGSNR: number
  /** GSNR余量 (dB) */
  gsnrMargin: number
  /** 系统是否可行 */
  isFeasible: boolean
  /** 最差跨段ID */
  worstSpanId: string
  /** 瓶颈分析 */
  bottleneckAnalysis: BottleneckAnalysis
  /** Q因子 (dB) */
  qFactor: number
  /** 预估BER */
  estimatedBER: number
}

/** 瓶颈分析 */
export interface BottleneckAnalysis {
  /** 瓶颈类型 */
  type: 'ase' | 'nli' | 'loss' | 'none'
  /** 描述 */
  description: string
  /** 建议 */
  recommendations: string[]
}

/** 仿真模型 */
export type SimulationModel = 'GN' | 'EGN' | 'SSFM' | 'Split-Step'

// ========== Span 扫描结果 (Step 6) ==========

/** Span 扫描单点结果 */
export interface SpanScanPoint {
  /** Span 长度 (km) */
  spanLengthKm: number
  /** 该 Span 配置下各信道的 GSNR (dB)，数组长度 = 信道数 */
  gsnrPerChannelDb: number[]
  /** 该 Span 配置下各信道的 OSNR (dB)，数组长度 = 信道数 */
  osnrPerChannelDb: number[]
  /** 平均 GSNR (dB) */
  avgGsnrDb: number
  /** 最小 GSNR (dB) */
  minGsnrDb: number
  /** 平均 OSNR (dB) */
  avgOsnrDb: number
  /** 是否满足目标 GSNR */
  meetTarget: boolean
  /** GSNR 余量 (dB) */
  gsnrMarginDb: number
  /** 放大器数量 */
  numAmplifiers?: number
}

/** Span 扫描结果 (Step 6 输出) */
export interface SpanScanResult {
  /** 链路 ID */
  linkId: string
  /** 扫描时间 */
  scannedAt: Date
  /** 使用的仿真模型 */
  model: SimulationModel
  /** Span 长度序列 (km) */
  spanLengthsKm: number[]
  /** 各 Span 配置下的 GSNR 值（按信道），二维数组 [spanIndex][channelIndex] */
  gsnrPerSpanDb: number[][]
  /** 各 Span 配置下的 OSNR 值（按信道），二维数组 [spanIndex][channelIndex] */
  osnrPerSpanDb: number[][]
  /** 推荐的 Span 长度 (km) */
  recommendedSpanKm: number
  /** 目标 GSNR (dB) */
  targetGsnrDb: number
  /** 可行 Span 区间 [min, max] (km) */
  feasibleRange: [number, number] | null
  /** 各扫描点详细结果 */
  scanPoints: SpanScanPoint[]
}

// ========== 精细仿真结果 (Step 9) ==========

/** 信道性能演化数据 */
export interface ChannelEvolution {
  /** 信道索引 */
  channelIndex: number
  /** 信道中心频率 (THz) */
  centerFreqTHz: number
  /** GSNR 沿链路演化 (dB)，数组长度 = Span 数 + 1 */
  gsnrEvolution: number[]
  /** OSNR 沿链路演化 (dB) */
  osnrEvolution: number[]
  /** SNR_ASE 沿链路演化 (dB) */
  snrAseEvolution: number[]
  /** SNR_NLI 沿链路演化 (dB) */
  snrNliEvolution: number[]
}

/** 精细仿真结果 (Step 9 输出) */
export interface DetailedSimulationResult {
  /** 链路 ID */
  linkId: string
  /** 仿真时间 */
  simulatedAt: Date
  /** 使用的仿真模型 */
  model: SimulationModel
  /** KP 位置序列 (km)，数组长度 = Span 数 + 1 */
  kpPositions: number[]
  /** 各信道性能演化数据 */
  channelEvolutions: ChannelEvolution[]
  /** 平均 GSNR 演化 (dB) */
  avgGsnrEvolution: number[]
  /** 最差信道 GSNR 演化 (dB) */
  worstGsnrEvolution: number[]
  /** 最差信道索引 */
  worstChannelIndex: number
  /** 端到端平均 GSNR (dB) */
  endToEndAvgGsnr: number
  /** 端到端最差 GSNR (dB) */
  endToEndWorstGsnr: number
  /** 系统是否可行 */
  isFeasible: boolean
  /** 各跨段详细结果 */
  spanResults: SpanSimulationResult[]
}

// ========== 链路预算 ==========

/** 链路预算项 */
export interface LinkBudgetItem {
  /** 项目名称 */
  name: string
  /** 数值 (dB) */
  value: number
  /** 类型 */
  type: 'gain' | 'loss' | 'margin'
  /** 备注 */
  notes?: string
}

/** 链路预算表 */
export interface LinkBudget {
  /** 链路ID */
  linkId: string
  /** 发射端 */
  transmitter: {
    launchPower: number      // dBm
    wavelength: number       // nm
  }
  /** 接收端 */
  receiver: {
    sensitivity: number      // dBm
    overloadPower: number    // dBm
  }
  /** 预算项列表 */
  items: LinkBudgetItem[]
  /** 总增益 (dB) */
  totalGain: number
  /** 总损耗 (dB) */
  totalLoss: number
  /** 系统余量 (dB) */
  systemMargin: number
  /** 是否满足预算 */
  isBudgetMet: boolean
}

// ========== 常量定义 ==========

/** 物理常量 */
export const PHYSICAL_CONSTANTS = {
  /** 普朗克常量 (J·s) */
  h: 6.62607015e-34,
  /** 光速 (m/s) */
  c: 299792458,
  /** 玻尔兹曼常量 (J/K) */
  k: 1.380649e-23,
  /** 参考带宽 0.1nm -> Hz @1550nm */
  refBandwidth: 12.5e9,
} as const

/** 默认光纤参数 (G.654.E) */
export const DEFAULT_FIBER_PARAMS: FiberParams = {
  type: 'G.654.E',
  attenuation: 0.16,
  dispersion: 20.5,
  dispersionSlope: 0.06,
  effectiveArea: 110,
  nonlinearIndex: 2.2e-20,
  nonlinearCoeff: 0.8,
}

/** 默认放大器参数 */
export const DEFAULT_AMPLIFIER_PARAMS: AmplifierParams = {
  type: 'EDFA',
  noiseFigure: 5.0,
  gain: 20,
  maxOutputPower: 17,
  gainFlatness: 1.0,
  band: 'C+L',
}

// ========== 仿真输入构建 (Step 3) ==========

/** 仿真输入 - 器件序列中的器件 */
export interface SimDeviceBase {
  id: string
  name: string
  type: 'landing' | 'amplifier' | 'bu' | 'equalizer'
  kp: number
  longitude: number
  latitude: number
}

export interface SimAmplifierDevice extends SimDeviceBase {
  type: 'amplifier'
  componentRefId: string
  gain: number
  noiseFigure: number
  maxOutputPower: number
  saturationPower: number
  operatingMode: 'AGC' | 'APC'
}

export interface SimBUDevice extends SimDeviceBase {
  type: 'bu'
  componentRefId: string
  portCount: number
  trunkLoss: number
  branchLoss: number
  nextHopUpstream?: string
  nextHopDownstream?: string
}

export interface SimLandingDevice extends SimDeviceBase {
  type: 'landing'
}

export interface SimEqualizerDevice extends SimDeviceBase {
  type: 'equalizer'
  equalizerRole?: 'T' | 'S'
  attenuationMode?: 'adjustable' | 'fixed'
  attenuationDb: number
}

export type SimDevice = SimLandingDevice | SimAmplifierDevice | SimBUDevice | SimEqualizerDevice

/** 仿真输入 - 光纤段 */
export interface SimFiberSegment {
  id: string
  fromDeviceId: string
  toDeviceId: string
  length: number
  fiberTypeId: string
  attenuation: number
  dispersion: number
  effectiveArea: number
  nonlinearIndex: number
}

/** Span 扫描策略 */
export interface SimSpanStrategy {
  mode: 'fixed' | 'scan'
  fixedLength?: number
  scanRange?: {
    min: number
    max: number
    step: number
  }
}

/** 约束条件 */
export interface SimConstraints {
  minOsnrDb: number
  minGsnrDb: number
  maxSpanLossDb: number
  targetBer: number
}

/** 标准化仿真输入结构 (Step 3 输出) */
export interface SimulationInput {
  // 基本信息
  linkId: string
  linkName: string
  totalLengthKm: number
  
  // 器件序列（按KP排序）
  deviceSequence: SimDevice[]
  
  // 光纤段序列
  fiberSegments: SimFiberSegment[]
  
  // 光纤模型参数
  fiberModel: {
    type: SimulationModel
    params: FiberParams
  }
  
  // 放大器模型参数
  amplifierModel: {
    type: 'EDFA_GAIN' | 'EDFA_POWER' | 'RAMAN'
    params: AmplifierParams
  }
  
  // WDM 配置
  wdm: WDMSystemParams & {
    launchPowerMode: 'uniform' | 'per_channel' | 'grouped' | 'import'
    launchPowerVector?: number[]
    initialAseMode: 'zero' | 'custom' | 'default'
    initialAseValue?: number
    initialNliMode: 'zero' | 'custom' | 'default'
    initialNliValue?: number
  }
  
  // Span 策略
  spanStrategy: SimSpanStrategy
  
  // 约束条件
  constraints: SimConstraints
  
  // BU 配置
  buConfigs: Array<{
    id: string
    name: string
    kp: number
    portCount: number
    trunkLoss: number
    branchLoss: number
  }>
  
  // 元数据
  createdAt: string
  version: string
}

// ========== 仿真进度回调 ==========

/** 仿真阶段 */
export type SimulationPhase = 
  | 'building'     // 构建输入
  | 'validating'   // 校验参数
  | 'computing'    // 计算中
  | 'analyzing'    // 分析结果
  | 'completed'    // 完成
  | 'failed'       // 失败

/** 仿真进度 */
export interface SimulationProgress {
  phase: SimulationPhase
  phaseLabel: string
  progress: number           // 0-100
  currentSpan?: number
  totalSpans?: number
  message?: string
  error?: string
}

/** 进度回调函数 */
export type ProgressCallback = (progress: SimulationProgress) => void

/** 调制格式参数表 */
export const MODULATION_PARAMS: Record<ModulationFormat, ModulationParams> = {
  'QPSK': {
    bitsPerSymbol: 4,
    requiredOSNR: 9.8,
    requiredGSNR: 11.5,
    spectralEfficiency: 2.0,
  },
  '8QAM': {
    bitsPerSymbol: 6,
    requiredOSNR: 13.0,
    requiredGSNR: 15.0,
    spectralEfficiency: 3.0,
  },
  '16QAM': {
    bitsPerSymbol: 8,
    requiredOSNR: 16.5,
    requiredGSNR: 18.5,
    spectralEfficiency: 4.0,
  },
  '32QAM': {
    bitsPerSymbol: 10,
    requiredOSNR: 19.5,
    requiredGSNR: 21.5,
    spectralEfficiency: 5.0,
  },
  '64QAM': {
    bitsPerSymbol: 12,
    requiredOSNR: 22.5,
    requiredGSNR: 24.5,
    spectralEfficiency: 6.0,
  },
  'DP-QPSK': {
    bitsPerSymbol: 4,
    requiredOSNR: 10.5,
    requiredGSNR: 12.0,
    spectralEfficiency: 2.0,
  },
  'DP-16QAM': {
    bitsPerSymbol: 8,
    requiredOSNR: 17.0,
    requiredGSNR: 19.0,
    spectralEfficiency: 4.0,
  },
  'PCS-64QAM': {
    bitsPerSymbol: 11,
    requiredOSNR: 20.0,
    requiredGSNR: 22.0,
    spectralEfficiency: 5.5,
  },
}
