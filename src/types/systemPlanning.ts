/**
 * 系统规划参数类型定义
 * 对应流程文档 Step 3: 配置系统规划参数
 */

import type { ModulationFormat, FECType } from './simulation'

// ========== WDM 与信号参数 ==========

/** 信号星座统计矩 */
export interface ShapingMoments {
  moment4: number
  moment6: number
}

/** WDM 向量参数 (各信道独立配置) */
export interface ChannelVectorParams {
  /** 各信道入纤功率 (dBm)，数组长度须等于 channel_count */
  launchPowerVector: number[]
  /** 各信道初始 ASE 噪声 (dBm)，数组长度须等于 channel_count */
  initialAseVector: number[]
  /** 各信道初始非线性噪声 (dBm)，数组长度须等于 channel_count */
  initialNliVector: number[]
}

/** 完整的 WDM 系统规划参数 */
export interface WDMPlanningParams {
  /** 传输波道总数（如 64、96） */
  channelCount: number
  /** 系统中心频率 (THz)，如 193.1 */
  centerFreqTHz: number
  /** 通道间隔 (GHz)，如 50.0、100.0 */
  channelSpacingGHz: number
  /** 信号波特率 (Gbaud)，如 64.0 */
  baudRateGbaud: number
  /** 调制格式（如 "16QAM"） */
  modulation: ModulationFormat
  /** FEC 类型 */
  fecType: FECType
  /** 信号星座统计矩 */
  shapingMoments?: ShapingMoments
  /** 向量参数（可选，不提供时使用统一值） */
  vectorParams?: ChannelVectorParams
  /** 统一入纤功率 (dBm)，当不使用向量时 */
  launchPower: number
}

// ========== Span 扫描与性能目标参数 ==========

/** Span 扫描配置 */
export interface SpanScanConfig {
  /** Span 扫描范围下限 (km) */
  spanLengthMinKm: number
  /** Span 扫描范围上限 (km) */
  spanLengthMaxKm: number
  /** Span 扫描步长 (km) */
  spanStepKm: number
  /** 目标 GSNR 性能门限 (dB) */
  targetGsnrDb: number
  /** 目标 OSNR 性能门限 (dB)，可选 */
  targetOsnrDb?: number
  /** 性能余量要求 (dB) */
  marginDb: number
}

// ========== 系统规划完整参数 ==========

/** 系统规划参数（Step 3 完整配置） */
export interface SystemPlanningParams {
  /** WDM 与信号参数 */
  wdmParams: WDMPlanningParams
  /** Span 扫描与性能目标参数 */
  spanScanConfig: SpanScanConfig
  /** 链路 ID（当前规划的链路） */
  linkId?: string
  /** 配置创建时间 */
  createdAt?: Date
  /** 配置名称（用于保存为模板） */
  name?: string
}

// ========== 仿真模型选择配置 ==========

/** 光纤传输计算模型 */
export type FiberSimModel = 'GN' | 'EGN' | 'SSFM'

/** EDFA 性能模型 */
export type EDFAModel = 'EDFA_Simple' | 'EDFA_Full' | 'EDFA_Raman'

/** BU 插损模型 */
export type BUModel = 'BU_Fixed' | 'BU_WavelengthDependent'

/** 仿真模型配置 */
export interface SimulationModelConfig {
  /** 光纤传输计算模型 */
  fiberModel: string
  /** EDFA 性能模型 */
  edfaModel: string
  /** BU 插损模型 */
  buModel: string
  /** 是否保存为模板 */
  saveAsTemplate?: boolean
  /** 模板名称 */
  templateName?: string
}

// ========== 模型特定参数 (抽屉机制) ==========

/** GN 模型额外参数 */
export interface GNModelParams {
  /** 等效噪声带宽 (GHz) */
  equivalentNoiseBandwidth: number
  /** 相干累积因子 */
  coherentAccumulationFactor: number
}

/** EGN 模型额外参数 */
export interface EGNModelParams {
  /** 等效噪声带宽 (GHz) */
  equivalentNoiseBandwidth: number
  /** 相干累积因子 */
  coherentAccumulationFactor: number
  /** 高阶色散修正因子 */
  higherOrderDispersionFactor: number
  /** XPM 增强因子 */
  xpmEnhancementFactor: number
}

/** SSFM 模型额外参数 */
export interface SSFMModelParams {
  /** 步长 (m) */
  stepSize: number
  /** 最大迭代次数 */
  maxIterations: number
  /** 采样点数 */
  samplePoints: number
  /** 非线性项阶数 */
  nonlinearOrder: number
}

/** EDFA 模型参数 - Simple */
export interface EDFASimpleParams {
  /** 固定增益模式 */
  fixedGain: boolean
  /** 目标增益 (dB) */
  targetGain: number
}

/** EDFA 模型参数 - Full */
export interface EDFAFullParams {
  /** 工作模式 */
  operatingMode: 'fixed_gain' | 'fixed_output' | 'apc'
  /** 目标增益/输出功率 */
  targetValue: number
  /** 增益谱平坦化 */
  gainFlattening: boolean
  /** 瞬态响应时间 (ms) */
  transientTime: number
}

// ========== 默认值 ==========

/** 默认 WDM 规划参数 */
const defaultWDMPlanningParams: WDMPlanningParams = {
  channelCount: 96,
  centerFreqTHz: 193.1,
  channelSpacingGHz: 50,
  baudRateGbaud: 64,
  modulation: 'DP-16QAM',
  fecType: 'SD-FEC',
  launchPower: 0,
  shapingMoments: {
    moment4: 1.32,
    moment6: 1.96,
  },
}

/** 默认 Span 扫描配置 */
const defaultSpanScanConfig: SpanScanConfig = {
  spanLengthMinKm: 40,
  spanLengthMaxKm: 120,
  spanStepKm: 5,
  targetGsnrDb: 12,
  marginDb: 3,
}

/** 默认系统规划参数 */
export const defaultSystemPlanningParams: SystemPlanningParams = {
  wdmParams: defaultWDMPlanningParams,
  spanScanConfig: defaultSpanScanConfig,
}
