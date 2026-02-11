/**
 * 仿真数据构建服务
 * 从 connectorStore 设备数据 + WDM 配置 构建 simulation_cache 矩阵数据
 */
import type { ConnectorElement } from '@/types/connector'
import type {
  SimulationCache,
  SimulationPositions,
  SimulationChannels,
  SimulationMetricsMatrix,
  SimulationSummary,
  FinalGsnrStats,
  FinalOsnrStats,
} from '@/types/useFile'
import { getFiberParamsFromLibrary, getAmplifierParamsFromLibrary } from '@/services/DeviceParamsService'

/** 链路计算摘要（来自 DesignView 的 linkCalcSummary） */
export interface LinkCalcSummaryInput {
  metrics?: {
    osnr: { min: number; max: number; avg: number }
    gsnr: { min: number; max: number; avg: number }
    [key: string]: unknown
  }
  systemConfig?: {
    amplifierCount: number
    avgSpanLength: number
    buCount: number
    channelCount: number
    modulation: string
    [key: string]: unknown
  }
  margin?: {
    targetOsnr: number
    worstMargin: number
    avgMargin: number
    meetsRequirement: boolean
  }
}

/** WDM 配置输入 */
export interface WDMConfigInput {
  channelCount: number
  centerFreqTHz: number
  channelSpacingGHz: number
  launchPower: number
  modulation: string
}

/**
 * 从设备序列构建位置维度
 */
function buildPositions(elements: ConnectorElement[]): SimulationPositions {
  // 筛选有效设备（landing, amplifier, bu, ola），按 KP 排序
  const devices = elements
    .filter(e => ['landing', 'amplifier_e', 'amplifier_w', 'ola', 'bu', 'underwater'].includes(e.type))
    .sort((a, b) => a.kp - b.kp)

  if (devices.length === 0) {
    return { count: 2, names: ['Tx', 'Rx'], distances_km: [0, 100], span_ids: ['span_01'] }
  }

  const names: string[] = []
  const distances_km: number[] = []
  const span_ids: string[] = []
  let ampIdx = 1
  let buIdx = 1

  devices.forEach((dev, i) => {
    if (dev.type === 'landing' || dev.type === 'underwater') {
      if (i === 0) names.push('Tx')
      else if (i === devices.length - 1) names.push('Rx')
      else names.push(dev.name || `Station-${i}`)
    } else if (dev.type === 'amplifier_e' || dev.type === 'amplifier_w' || dev.type === 'ola') {
      names.push(`AMP-${ampIdx++}`)
    } else if (dev.type === 'bu') {
      names.push(`BU-${buIdx++}`)
    }
    distances_km.push(Math.round(dev.kp * 10) / 10)

    if (i > 0) {
      span_ids.push(`span_${String(i).padStart(2, '0')}`)
    }
  })

  return {
    count: names.length,
    names,
    distances_km,
    span_ids,
  }
}

/**
 * 构建信道维度
 */
function buildChannels(wdm: WDMConfigInput): SimulationChannels {
  const count = wdm.channelCount || 96
  const centerFreq = wdm.centerFreqTHz || 193.1
  const spacing = (wdm.channelSpacingGHz || 50) / 1000 // GHz -> THz

  const ids: string[] = []
  const frequencies_thz: number[] = []
  const startFreq = centerFreq - (count / 2) * spacing

  for (let i = 0; i < count; i++) {
    ids.push(`Ch${i + 1}`)
    frequencies_thz.push(Math.round((startFreq + i * spacing) * 1000) / 1000)
  }

  return { count, ids, frequencies_thz }
}

/** 不同光纤模型的 NLI 计算系数 */
interface FiberModelCoeffs {
  /** NLI 基础偏移 (dB)：值越大非线性噪声越低 */
  nliBase: number
  /** NLI 随跨段数累积速率 */
  nliAccum: number
  /** 边缘频率惩罚因子 */
  edgeNliScale: number
}

function getFiberModelCoeffs(model: string): FiberModelCoeffs {
  switch (model) {
    case 'EGN':
      // EGN 模型考虑调制格式修正，NLI 估计更低，GSNR 比 GN 高 2-3 dB
      return { nliBase: 32, nliAccum: 2.0, edgeNliScale: 0.8 }
    case 'SSFM':
      // SSFM 数值仿真，色散补偿更精确，NLI 最低，GSNR 比 GN 高 3-4 dB
      return { nliBase: 35, nliAccum: 1.8, edgeNliScale: 0.5 }
    case 'GN':
    default:
      // GN 模型 — 解析近似，NLI 偏悲观（过估非线性噪声）
      return { nliBase: 26, nliAccum: 3.0, edgeNliScale: 2.0 }
  }
}

/** 不同 EDFA 模型的噪声特性 */
interface EdfaModelCoeffs {
  /** 噪声指数修正 (dB)：叠加到器件库 NF 上 */
  nfOffset: number
  /** 增益平坦度劣化因子 (dB)：影响边缘信道 */
  gainRipple: number
  /** OSNR 常数项修正 */
  osnrConst: number
}

function getEdfaModelCoeffs(model: string): EdfaModelCoeffs {
  switch (model) {
    case 'EDFA_Full':
      // 完整模型：考虑增益动态、波长相关 NF，OSNR 比 Simple 低 ~1.5 dB
      return { nfOffset: 1.5, gainRipple: 1.2, osnrConst: 58 }
    case 'EDFA_Raman':
      // Raman 混合放大：等效 NF 大幅降低，OSNR 比 Simple 高 ~4 dB
      return { nfOffset: -4.0, gainRipple: 0.2, osnrConst: 58 }
    case 'EDFA_Simple':
    default:
      // 简化模型：固定 NF，忽略波纹
      return { nfOffset: 0, gainRipple: 0, osnrConst: 58 }
  }
}

/**
 * 计算仿真矩阵 [positions × channels]
 * 根据选择的光纤模型和 EDFA 模型计算各位置各信道的性能指标
 */
function computeMetricsMatrix(
  positions: SimulationPositions,
  channels: SimulationChannels,
  wdm: WDMConfigInput,
  modelConfig?: { fiberModel: string; edfaModel: string; buModel: string | null },
  summary?: LinkCalcSummaryInput
): SimulationMetricsMatrix {
  const posCount = positions.count
  const chCount = channels.count

  const gsnr_matrix_db: number[][] = []
  const osnr_matrix_db: number[][] = []
  const snr_ase_matrix_db: number[][] = []
  const snr_nli_matrix_db: number[][] = []

  // 获取器件库参数
  const fiberParams = getFiberParamsFromLibrary()
  const ampParams = getAmplifierParamsFromLibrary()

  // 获取模型计算系数
  const fiberCoeffs = getFiberModelCoeffs(modelConfig?.fiberModel || 'GN')
  const edfaCoeffs = getEdfaModelCoeffs(modelConfig?.edfaModel || 'EDFA_Simple')

  // 基线参数（来自器件库 + 模型修正）
  const launchPower = wdm.launchPower || 0 // dBm
  const nf = (ampParams.noiseFigure || 5.0) + edfaCoeffs.nfOffset
  const alpha = fiberParams.attenuation || 0.16 // dB/km
  const gainRipple = edfaCoeffs.gainRipple
  const osnrConst = edfaCoeffs.osnrConst

  // 非线性系数（来自器件库光纤参数）
  const gamma = fiberParams.nonlinearCoeff || 0.8 // 1/(W·km)
  const aeff = fiberParams.effectiveArea || 110   // μm²
  // gamma 对 NLI 的修正：相对标准值(0.8)的偏移
  const gammaCorrectionDb = 10 * Math.log10(Math.max(0.1, gamma) / 0.8)

  // 已有计算结果作为校准基准
  const refGsnrAvg = summary?.metrics?.gsnr?.avg ?? 18

  // 预计算全局校准偏移：使用固定 GN 基线模型计算 Rx 处中心信道的理论值，
  // 然后得出与参考值的偏移。该偏移对所有模型一致，因此模型间差异得以保留。
  let globalCalibration = 0
  if (summary?.metrics && posCount > 1) {
    const gnCoeffs = getFiberModelCoeffs('GN')
    const gnEdfaCoeffs = getEdfaModelCoeffs('EDFA_Simple')
    const rxIdx = posCount - 1
    const rxDist = positions.distances_km[rxIdx]
    const gnAvgSpanLen = rxDist / rxIdx
    const gnSpanLoss = gnAvgSpanLen * alpha
    const gnNf = (ampParams.noiseFigure || 5.0) + gnEdfaCoeffs.nfOffset
    const gnOsnr = launchPower - gnNf - 10 * Math.log10(rxIdx) - gnSpanLoss + gnEdfaCoeffs.osnrConst
    const gnNli = Math.max(gnCoeffs.nliBase - gnCoeffs.nliAccum * Math.log10(rxIdx) - gammaCorrectionDb, 15)
    const gnGsnrLin = 1 / (1 / Math.pow(10, gnOsnr / 10) + 1 / Math.pow(10, gnNli / 10))
    const gnGsnr = 10 * Math.log10(gnGsnrLin)
    globalCalibration = refGsnrAvg - gnGsnr
  }

  for (let i = 0; i < posCount; i++) {
    const gsnrRow: number[] = []
    const osnrRow: number[] = []
    const snrAseRow: number[] = []
    const snrNliRow: number[] = []

    const dist = positions.distances_km[i]
    const spanIdx = i // 当前跨过的 span 数量

    for (let j = 0; j < chCount; j++) {
      const freq = channels.frequencies_thz[j]
      const centerFreq = wdm.centerFreqTHz || 193.1

      // 频率偏移引起的边缘惩罚 (dB)
      const freqOffset = Math.abs(freq - centerFreq)
      const edgePenalty = freqOffset * 0.3
      // EDFA 增益波纹对边缘信道的额外惩罚
      const ripplePenalty = freqOffset * gainRipple

      if (i === 0) {
        // Tx 位置：初始信噪比（很高）
        const initGsnr = 35 - edgePenalty * 0.5
        gsnrRow.push(Math.round(initGsnr * 100) / 100)
        osnrRow.push(Math.round((initGsnr + 5) * 100) / 100)
        snrAseRow.push(Math.round((initGsnr + 8) * 100) / 100)
        snrNliRow.push(Math.round((initGsnr + 15) * 100) / 100)
      } else {
        // ASE 噪声累积 → OSNR
        // OSNR ≈ P_launch - NF_eff - 10*log10(spanCount) - spanLoss + C
        const avgSpanLen = dist / spanIdx
        const spanLoss = avgSpanLen * alpha
        const osnr = launchPower - nf - 10 * Math.log10(spanIdx) - spanLoss + osnrConst - edgePenalty - ripplePenalty

        // 非线性噪声 SNR_NLI（由光纤模型决定）
        const nliRaw = fiberCoeffs.nliBase
          - fiberCoeffs.nliAccum * Math.log10(spanIdx)
          - edgePenalty * fiberCoeffs.edgeNliScale
          - gammaCorrectionDb  // 器件库非线性系数修正
        const snrNli = Math.max(nliRaw, 15)

        // GSNR = 1/(1/OSNR_lin + 1/SNR_NLI_lin)
        const osnrLin = Math.pow(10, osnr / 10)
        const nliLin = Math.pow(10, snrNli / 10)
        const gsnrLin = 1 / (1 / osnrLin + 1 / nliLin)
        const gsnr = 10 * Math.log10(gsnrLin)

        // SNR_ASE 略高于 OSNR
        const snrAse = osnr + 3

        gsnrRow.push(Math.round((gsnr + globalCalibration) * 100) / 100)
        osnrRow.push(Math.round((osnr + globalCalibration) * 100) / 100)
        snrAseRow.push(Math.round((snrAse + globalCalibration) * 100) / 100)
        snrNliRow.push(Math.round(snrNli * 100) / 100)
      }
    }

    gsnr_matrix_db.push(gsnrRow)
    osnr_matrix_db.push(osnrRow)
    snr_ase_matrix_db.push(snrAseRow)
    snr_nli_matrix_db.push(snrNliRow)
  }

  return { gsnr_matrix_db, osnr_matrix_db, snr_ase_matrix_db, snr_nli_matrix_db }
}

/**
 * 构建性能汇总
 */
function buildSummary(
  positions: SimulationPositions,
  channels: SimulationChannels,
  metrics: SimulationMetricsMatrix,
  wdm: WDMConfigInput
): SimulationSummary {
  const rxRow = metrics.gsnr_matrix_db[positions.count - 1] || []
  const rxOsnr = metrics.osnr_matrix_db[positions.count - 1] || []

  const gsnrMin = rxRow.length > 0 ? Math.min(...rxRow) : 0
  const gsnrMax = rxRow.length > 0 ? Math.max(...rxRow) : 0
  const gsnrAvg = rxRow.length > 0 ? rxRow.reduce((a, b) => a + b, 0) / rxRow.length : 0
  const osnrMin = rxOsnr.length > 0 ? Math.min(...rxOsnr) : 0
  const osnrAvg = rxOsnr.length > 0 ? rxOsnr.reduce((a, b) => a + b, 0) / rxOsnr.length : 0

  const worstIdx = rxRow.indexOf(gsnrMin)
  const bestIdx = rxRow.indexOf(gsnrMax)

  const final_gsnr: FinalGsnrStats = {
    avg_db: Math.round(gsnrAvg * 100) / 100,
    min_db: Math.round(gsnrMin * 100) / 100,
    max_db: Math.round(gsnrMax * 100) / 100,
    worst_channel: channels.ids[worstIdx] || 'Ch1',
    best_channel: channels.ids[bestIdx] || `Ch${Math.floor(channels.count / 2)}`,
  }

  const final_osnr: FinalOsnrStats = {
    avg_db: Math.round(osnrAvg * 100) / 100,
    min_db: Math.round(osnrMin * 100) / 100,
  }

  const totalLength = positions.distances_km[positions.count - 1] || 0
  // 容量 = 信道数 × 符号率(Gbaud) × 频谱效率 / 1000 (Tbps)
  const baudRate = 64 // Gbaud
  const spectralEff = wdm.modulation?.includes('16QAM') ? 4 : wdm.modulation?.includes('QPSK') ? 2 : 3
  const capacity = Math.round(channels.count * baudRate * spectralEff / 1000 * 100) / 100

  return {
    total_length_km: totalLength,
    total_span_count: positions.count - 1,
    final_gsnr,
    final_osnr,
    system_capacity_tbps: capacity,
    // 兼容
    final_gsnr_avg_db: final_gsnr.avg_db,
    final_gsnr_min_db: final_gsnr.min_db,
    final_osnr_avg_db: final_osnr.avg_db,
  }
}

/**
 * 构建完整的 SimulationCache
 */
export function buildSimulationCache(
  elements: ConnectorElement[],
  wdm: WDMConfigInput,
  modelConfig?: { fiberModel: string; edfaModel: string; buModel: string | null },
  summary?: LinkCalcSummaryInput
): SimulationCache {
  const positions = buildPositions(elements)
  const channels = buildChannels(wdm)
  const metrics = computeMetricsMatrix(positions, channels, wdm, modelConfig, summary)
  const simSummary = buildSummary(positions, channels, metrics, wdm)

  return {
    is_valid: true,
    timestamp: new Date().toISOString(),
    route_ref: {
      from_station: positions.names[0] || 'Tx',
      to_station: positions.names[positions.count - 1] || 'Rx',
      route_hash: `${Date.now().toString(36)}`,
    },
    model_selection: {
      fiber_model_id: modelConfig?.fiberModel || 'GN',
      edfa_model_id: modelConfig?.edfaModel || 'EDFA_Simple',
      bu_model_id: modelConfig?.buModel || null,
    },
    positions,
    channels,
    metrics,
    summary: simSummary,
  }
}
