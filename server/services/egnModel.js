/**
 * EGN-Model (Enhanced Gaussian Noise) 仿真引擎
 *
 * 在 GN-Model 基础上扩展:
 *   1. 高阶色散 (β3) 修正
 *   2. XPM (交叉相位调制) 增强因子
 *   3. 调制格式相关 NLI 修正
 *
 * 公式参考: P. Poggiolini et al.,
 *   "The GN-Model of Fiber Non-Linear Propagation and its Applications"
 *   "Accurate Analytical Modeling of the EGN Model"
 */

import { PHYS, dbmToW, dbToLinear, linearToDb } from '../utils/physics.js'
import { computeAmplifierNoise } from '../utils/amplifier.js'
import { parseWdmParams, parseFiberPhysics, buildSimulationInput, buildDetailedResult } from './gnModel.js'

// ── 调制格式参数表（Φ_mod 因子） ──
const MODULATION_FACTORS = {
    'QPSK':     { phi: 1.0,  kurtosis: 1.0  },
    'DP-QPSK':  { phi: 1.0,  kurtosis: 1.0  },
    '8QAM':     { phi: 1.08, kurtosis: 1.32 },
    '16QAM':    { phi: 1.12, kurtosis: 1.32 },
    'DP-16QAM': { phi: 1.12, kurtosis: 1.32 },
    '32QAM':    { phi: 1.18, kurtosis: 1.50 },
    '64QAM':    { phi: 1.25, kurtosis: 1.62 },
    'DP-64QAM': { phi: 1.25, kurtosis: 1.62 },
}

/**
 * EGN 模型: 计算单跨段 NLI 噪声功率 (W)
 *
 * P_NLI_EGN = P_NLI_GN × (1 + Δ_EGN)
 *
 * 其中 Δ_EGN 包含:
 *   - 高阶色散修正: δ_β3 = β3² · B_wdm² / (12 · β2²)
 *   - XPM 增强: η_XPM = XPM_factor × (N_ch - 1) / N_ch
 *   - 调制格式修正: Φ_mod
 */
export function computeEgnSpanNli(params) {
    const {
        gamma_W_m, beta2, alpha_Np_per_m, spanLen_m,
        launchPower_W, B_ch, B_wdm,
        beta3, channelCount,
        xpmEnhancementFactor = 1.1,
        higherOrderDispersionFactor = 0.05,
        modulationPhi = 1.12,
    } = params

    // 有效长度
    const L_eff = (1 - Math.exp(-2 * alpha_Np_per_m * spanLen_m)) / (2 * alpha_Np_per_m)

    // ─── GN 基线 NLI ───
    const asinhArg = Math.PI * Math.PI / 2 * beta2 * L_eff * B_wdm * B_wdm
    const asinhVal = Math.log(asinhArg + Math.sqrt(asinhArg * asinhArg + 1))
    const P_nli_gn = (16 / 27) * gamma_W_m * gamma_W_m * L_eff
        * Math.pow(launchPower_W, 3) * asinhVal
        / (Math.PI * Math.PI * beta2 * B_ch * B_ch)

    // ─── EGN 修正项 ───

    // 1. 高阶色散修正 δ_β3
    let delta_beta3 = 0
    if (beta3 !== 0 && beta2 !== 0) {
        // β3 引入的频率依赖色散展宽
        delta_beta3 = (beta3 * beta3 * B_wdm * B_wdm) / (12 * beta2 * beta2)
    }

    // 2. XPM 增强因子
    // EGN 中 XPM 贡献约为 SPM 的 (N-1)/N × xpmFactor
    const xpmRatio = channelCount > 1
        ? (xpmEnhancementFactor - 1) * (channelCount - 1) / channelCount
        : 0

    // 3. 调制格式依赖 (Φ_mod - 1 是相对于 QPSK 的额外贡献)
    const modCorrection = modulationPhi - 1.0

    // 综合 EGN 修正因子
    const delta_egn = higherOrderDispersionFactor * delta_beta3 + xpmRatio + modCorrection

    // EGN NLI = GN NLI × (1 + Δ_EGN)
    const P_nli_egn = P_nli_gn * (1 + delta_egn)

    return { P_nli: P_nli_egn, P_nli_gn, delta_egn, L_eff }
}

/**
 * EGN Span 迭代计算
 * 与 GN spanIteration 结构相同，但使用 EGN NLI 公式
 */
export function egnSpanIteration(simInput) {
    const {
        totalLengthKm, fiberParams, amplifierParams, wdmParams,
        spanStrategy, constraints, buConfigs, equalizerConfigs = []
    } = simInput

    // 解析 span 扫描范围
    let spanLengths = []
    if (spanStrategy.mode === 'fixed') {
        spanLengths = [spanStrategy.fixedLength || 70]
    } else {
        const { min = 40, max = 120, step = 5 } = spanStrategy.scanRange || {}
        for (let L = min; L <= max; L += step) {
            spanLengths.push(L)
        }
    }

    const wdm = parseWdmParams(wdmParams)
    const fiber = parseFiberPhysics(fiberParams, wdm.centerFreqTHz)

    const B_ch = wdm.baudRateGBaud * 1e9
    const B_wdm = wdm.channelCount * wdm.spacingGHz * 1e9

    // 放大器模型标识
    const ampModel = simInput.amplifierModel || 'EDFA_Simple'

    // EGN 扩展参数
    const dispersionSlope = fiberParams.dispersionSlope || 0.06  // ps/nm²/km
    const D_SI = (fiberParams.dispersion || 20.5) * 1e-6
    const lambda_m = fiber.lambda_m
    // β3 = dβ2/dω ≈ (S·λ⁴)/(4π²c²) + (D·λ³)/(2π²c²)
    // 简化近似: β3 ≈ S * λ⁴ / (4π²c²)
    const S_SI = dispersionSlope * 1e3  // ps/nm²/km → s/m³ (approximate)
    const beta3 = S_SI * Math.pow(lambda_m, 4) / (4 * Math.PI * Math.PI * PHYS.c * PHYS.c)

    // EGN 特定参数（可从前端传入）
    const egnParams = fiberParams.egnParams || {}
    const xpmEnhancementFactor = egnParams.xpmEnhancementFactor || 1.1
    const higherOrderDispersionFactor = egnParams.higherOrderDispersionFactor || 0.05

    // 调制格式
    const modName = wdmParams.modulation || '16QAM'
    const modFactor = MODULATION_FACTORS[modName] || MODULATION_FACTORS['16QAM']

    const totalBuLoss_dB = buConfigs.reduce((s, bu) => s + (bu.trunkLoss || 0), 0)
    const buCount = buConfigs.length
    const totalEqualizerLoss_dB = equalizerConfigs.reduce((sum, eq) => sum + Math.max(0, eq.attenuationDb || 0), 0)
    const equalizerSignalPenalty = dbToLinear(totalEqualizerLoss_dB)

    const targetGsnr_dB = constraints.targetGSNR || 14.0
    const margin_dB = constraints.osnrMargin || 1.0

    const scanPoints = []

    for (const spanLen of spanLengths) {
        const effectiveLength = totalLengthKm
        const numAmps = Math.max(1, Math.ceil(effectiveLength / spanLen) - 1)
        const actualSpanLen = effectiveLength / (numAmps + 1)
        const spanLen_m = actualSpanLen * 1000

        const spanLoss_dB = fiber.alpha_dB_per_km * actualSpanLen
        const G_linear = dbToLinear(spanLoss_dB)

        // EGN NLI 计算
        const { P_nli: P_nli_per_span, delta_egn } = computeEgnSpanNli({
            gamma_W_m: fiber.gamma_W_m,
            beta2: fiber.beta2,
            alpha_Np_per_m: fiber.alpha_Np_per_m,
            spanLen_m,
            launchPower_W: wdm.launchPower_W,
            B_ch,
            B_wdm,
            beta3,
            channelCount: wdm.channelCount,
            xpmEnhancementFactor,
            higherOrderDispersionFactor,
            modulationPhi: modFactor.phi,
        })

        // 逐信道放大器噪声 (支持 EDFA_Simple / EDFA_Full)
        const ampNoise = computeAmplifierNoise({
            amplifierModel: ampModel,
            amplifierParams,
            channelFrequencies: wdm.channelFrequencies,
            spanLoss_dB: spanLoss_dB,
        })

        const gsnrPerChannel = []
        const osnrPerChannel = []
        const powerPerChannel = []
        const nliPerChannel = []

        for (let ch = 0; ch < wdm.channelCount; ch++) {
            const P_ase_per_amp = ampNoise.asePerChannel[ch]
            const signalPower_W = wdm.launchPower_W / equalizerSignalPenalty

            const totalAse_W = P_ase_per_amp * numAmps
            // EGN: NLI 按 N^(1+ε) 累加，ε ≈ 0.05 for EGN (相干累积修正)
            const coherentEps = egnParams.coherentAccumulationFactor
                ? Math.log10(egnParams.coherentAccumulationFactor)
                : 0.05
            const totalNli_W = P_nli_per_span * Math.pow(numAmps, 1 + coherentEps)

            const buAseExtra = buCount > 0 ? P_ase_per_amp * buCount * 0.3 : 0

            const osnr_linear = signalPower_W / (totalAse_W + buAseExtra)
            const osnr_dB = linearToDb(osnr_linear)

            const gsnr_linear = signalPower_W / (totalAse_W + buAseExtra + totalNli_W)
            const gsnr_dB = linearToDb(gsnr_linear)

            // 边缘信道退化（EGN 模型中边缘效应更显著）
            const normalized = (ch - wdm.channelCount / 2) / (wdm.channelCount / 2)
            const edgePenalty = 1.0 * normalized * normalized  // EGN: ≤1.0 dB (比 GN 多 0.2)

            gsnrPerChannel.push(parseFloat((gsnr_dB - edgePenalty).toFixed(2)))
            osnrPerChannel.push(parseFloat((osnr_dB - edgePenalty * 0.5).toFixed(2)))
            powerPerChannel.push(parseFloat((wdm.launchPowerDbm - totalEqualizerLoss_dB - edgePenalty * 0.3).toFixed(2)))
            const nli_dBm = 10 * Math.log10(totalNli_W * 1000)
            nliPerChannel.push(parseFloat((nli_dBm + edgePenalty * 0.5).toFixed(2)))
        }

        const minGsnr = Math.min(...gsnrPerChannel)
        const avgGsnr = gsnrPerChannel.reduce((a, b) => a + b, 0) / gsnrPerChannel.length
        const avgOsnr = osnrPerChannel.reduce((a, b) => a + b, 0) / osnrPerChannel.length

        scanPoints.push({
            spanLengthKm: parseFloat(spanLen.toFixed(1)),
            numAmplifiers: numAmps,
            actualSpanKm: parseFloat(actualSpanLen.toFixed(1)),
            gsnrPerChannelDb: gsnrPerChannel,
            osnrPerChannelDb: osnrPerChannel,
            powerPerChannelDb: powerPerChannel,
            nliPerChannelDb: nliPerChannel,
            avgGsnrDb: parseFloat(avgGsnr.toFixed(2)),
            minGsnrDb: parseFloat(minGsnr.toFixed(2)),
            avgOsnrDb: parseFloat(avgOsnr.toFixed(2)),
            meetTarget: minGsnr >= (targetGsnr_dB + margin_dB),
            gsnrMarginDb: parseFloat((minGsnr - targetGsnr_dB).toFixed(2)),
            // EGN 特有指标
            egnDelta: parseFloat(delta_egn.toFixed(4)),
        })
    }

    const feasiblePoints = scanPoints.filter(p => p.meetTarget)
    const recommendedPoint = feasiblePoints.length > 0
        ? feasiblePoints[feasiblePoints.length - 1]
        : scanPoints[0]
    const recommendedSpanKm = recommendedPoint.spanLengthKm

    const feasibleRange = feasiblePoints.length > 0
        ? [feasiblePoints[0].spanLengthKm, feasiblePoints[feasiblePoints.length - 1].spanLengthKm]
        : null

    return {
        spanScanResult: {
            spanLengthsKm: spanLengths,
            scanPoints,
            recommendedSpanKm,
            targetGsnrDb: targetGsnr_dB,
            feasibleRange,
            channelFrequencies: wdm.channelFrequencies,
            model: 'EGN',
        },
        recommendedPoint,
    }
}

// 导出 buildSimulationInput 和 buildDetailedResult（复用 GN 版本）
export { buildSimulationInput, buildDetailedResult }
