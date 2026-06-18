/**
 * 仿真计算 API 客户端服务
 * 线上 Swagger 当前未提供仿真计算接口；调用方应保持空态。
 */
import type { SpanScanResult, SpanScanPoint } from '@/types/simulation'

// 导出类型供外部使用
export type { SpanScanResult }

// ========== 请求类型 ==========

/** Span 策略 */
export interface SpanStrategyPayload {
  mode: 'fixed' | 'scan'
  fixedLength?: number
  scanRange?: {
    min: number
    max: number
    step: number
  }
}

/** 仿真计算请求 */
export interface SimulationRequest {
  linkId: string
  linkName: string
  totalLengthKm: number
  fiberModel: 'GN' | 'EGN' | 'SSFM' | 'RAMAN' | 'HYBRID'
  amplifierModel: 'EDFA_Simple' | 'EDFA_Full' | 'EDFA_Raman'
  fiberParams: {
    attenuation: number
    effectiveArea: number
    dispersion: number
    dispersionSlope: number
    nonlinearIndex: number
    nonlinearCoeff: number
    fiberName?: string
    /** SSFM 模型专用参数 */
    ssfmParams?: {
      stepSize: number
      samplePoints: number
      maxIterations: number
    }
  }
  amplifierParams: {
    gain: number
    noiseFigure: number
    maxOutputPower: number
    saturationPower: number
    unitPrice?: number
    equalizerUnitPrice?: number
    amplifierName?: string
  }
  wdmParams: {
    channelCount: number
    centerFreq: number
    channelSpacing: number
    baudRate: number
    modulation: string
    launchPower: number
    launchPowerMode?: string
    launchPowerVector?: number[]
  }
  spanStrategy: SpanStrategyPayload
  constraints: {
    targetOSNR: number
    targetGSNR: number
    maxSpanLength: number
    minSpanLength: number
    osnrMargin: number
  }
  buConfigs: Array<{
    id: string
    name: string
    kp: number
    portCount: number
    trunkLoss: number
    branchLoss: number
  }>
  deviceSequence: Array<{
    id: string
    name: string
    type: string
    kp: number
    equalizerRole?: 'T' | 'S'
    attenuationMode?: 'adjustable' | 'fixed'
    attenuationDb?: number
  }>
}

// ========== 响应类型 ==========

/** Span 扫描点（与 types/simulation.ts 中的 SpanScanPoint 兼容） */
export type ScanPoint = SpanScanPoint

/** 仿真计算响应 */
export interface SimulationResponse {
  success: boolean
  error?: string
  spanScanResult: Omit<SpanScanResult, 'linkId' | 'scannedAt' | 'model' | 'gsnrPerSpanDb' | 'osnrPerSpanDb'> & {
    channelFrequencies?: number[]
  }
  detailedResult: unknown
}

// ========== API 调用 ==========

/**
 * 调用后端仿真计算接口
 */
export async function runSimulation(_request: SimulationRequest): Promise<SimulationResponse> {
  throw new Error('线上 Swagger 暂未提供仿真计算接口')
}
