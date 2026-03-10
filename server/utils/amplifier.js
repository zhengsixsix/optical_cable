/**
 * EDFA 放大器模型工具
 *
 * 统一接口计算逐信道 ASE 噪声功率, 支持两种模型:
 *
 *   EDFA_Simple: 所有信道使用同一固定 NF, 增益完美平坦
 *   EDFA_Full:   波长相关 NF + 增益波纹/倾斜 + 饱和效应
 *
 * 参考:
 *   - C.R. Giles & E. Desurvire, "Modeling Erbium-Doped Fiber Amplifiers"
 *   - ITU-T G.661: EDFA characteristics
 */

import { PHYS, dbToLinear, linearToDb } from './physics.js'

// ── EDFA_Full 典型参数 ──
const EDFA_FULL_DEFAULTS = {
    /** NF 倾斜: 边缘比中心高的 dB 数 (半幅) */
    nfTilt_dB: 0.8,
    /** NF 波纹幅度 (dB, peak-to-peak / 2) */
    nfRipple_dB: 0.3,
    /** NF 波纹周期 (对应 C-band 约 5 个周期) */
    nfRipplePeriods: 5,
    /** 增益倾斜 (dB, 短波端比长波端高) */
    gainTilt_dB: 1.0,
    /** 增益波纹幅度 (dB, peak-to-peak / 2) */
    gainRipple_dB: 0.5,
    /** 增益波纹周期 */
    gainRipplePeriods: 4,
    /** 增益平坦化滤波器 (GFF) 是否启用 */
    gainFlattening: true,
    /** GFF 残余波纹 (dB) — 即使有 GFF 也有残余 */
    gffResidualRipple_dB: 0.15,
}

/**
 * 计算逐信道的 ASE 噪声功率 (W)
 *
 * 统一接口, 根据 amplifierModel 分发到 Simple 或 Full
 *
 * @param {Object} params
 * @param {string} params.amplifierModel - 'EDFA_Simple' | 'EDFA_Full' | 'EDFA_Raman'
 * @param {Object} params.amplifierParams - 放大器参数 { noiseFigure, gain, maxOutputPower, ... }
 * @param {number[]} params.channelFrequencies - 各信道频率 (THz)
 * @param {number} params.spanLoss_dB - 跨段损耗 (dB), 即放大器需要补偿的增益
 * @returns {{
 *   asePerChannel: number[],   // 每信道每放大器 ASE 功率 (W)
 *   nfPerChannel: number[],    // 每信道等效 NF (dB)
 *   gainPerChannel: number[],  // 每信道增益 (dB)
 * }}
 */
export function computeAmplifierNoise(params) {
    const { amplifierModel, amplifierParams, channelFrequencies, spanLoss_dB } = params

    if (amplifierModel === 'EDFA_Full') {
        return computeEdfaFull(amplifierParams, channelFrequencies, spanLoss_dB)
    }

    // EDFA_Simple (默认)
    return computeEdfaSimple(amplifierParams, channelFrequencies, spanLoss_dB)
}

/**
 * EDFA_Simple: 固定 NF, 增益 = 跨段损耗 (完美补偿)
 */
function computeEdfaSimple(amplifierParams, channelFrequencies, spanLoss_dB) {
    const nf_dB = amplifierParams.noiseFigure || 4.8
    const nfLinear = dbToLinear(nf_dB)
    const G_linear = dbToLinear(spanLoss_dB)
    const channelCount = channelFrequencies.length

    const asePerChannel = new Array(channelCount)
    const nfPerChannel = new Array(channelCount)
    const gainPerChannel = new Array(channelCount)

    for (let i = 0; i < channelCount; i++) {
        const freq_Hz = channelFrequencies[i] * 1e12
        asePerChannel[i] = PHYS.h * freq_Hz * nfLinear * (G_linear - 1) * PHYS.refBandwidth
        nfPerChannel[i] = nf_dB
        gainPerChannel[i] = spanLoss_dB
    }

    return { asePerChannel, nfPerChannel, gainPerChannel }
}

/**
 * EDFA_Full: 波长相关 NF + 增益波纹/倾斜
 *
 * 物理模型:
 *   1. NF(f) = NF_0 + NF_tilt·x + NF_ripple·sin(2π·n·x)
 *      其中 x = (f - f_center) / (f_max - f_min) ∈ [-0.5, 0.5]
 *
 *   2. G(f) = G_target + G_tilt·x + G_ripple·cos(2π·n·x)
 *      如果有 GFF, 波纹降低到 residual 水平
 *
 *   3. 饱和: 如果总输出功率超过 P_max, 所有信道增益等比缩减
 *
 *   4. P_ASE(f) = h·f·NF(f)·(G(f)-1)·B_ref
 */
function computeEdfaFull(amplifierParams, channelFrequencies, spanLoss_dB) {
    const channelCount = channelFrequencies.length
    const nf0_dB = amplifierParams.noiseFigure || 4.8

    // EDFA_Full 特有参数（可从前端传入, 否则用默认值）
    const fullParams = amplifierParams.edfaFullParams || {}
    const nfTilt = fullParams.nfTilt_dB ?? EDFA_FULL_DEFAULTS.nfTilt_dB
    const nfRipple = fullParams.nfRipple_dB ?? EDFA_FULL_DEFAULTS.nfRipple_dB
    const nfRipplePeriods = fullParams.nfRipplePeriods ?? EDFA_FULL_DEFAULTS.nfRipplePeriods
    const gainTilt = fullParams.gainTilt_dB ?? EDFA_FULL_DEFAULTS.gainTilt_dB
    const gainRipple = fullParams.gainRipple_dB ?? EDFA_FULL_DEFAULTS.gainRipple_dB
    const gainRipplePeriods = fullParams.gainRipplePeriods ?? EDFA_FULL_DEFAULTS.gainRipplePeriods
    const gainFlattening = fullParams.gainFlattening ?? EDFA_FULL_DEFAULTS.gainFlattening
    const gffResidual = fullParams.gffResidualRipple_dB ?? EDFA_FULL_DEFAULTS.gffResidualRipple_dB
    const maxOutputPower_dBm = amplifierParams.maxOutputPower ?? 21

    // 频率范围
    const fMin = channelFrequencies[0]
    const fMax = channelFrequencies[channelCount - 1]
    const fCenter = (fMin + fMax) / 2
    const fSpan = fMax - fMin || 1  // 避免除零

    const asePerChannel = new Array(channelCount)
    const nfPerChannel = new Array(channelCount)
    const gainPerChannel = new Array(channelCount)

    // 目标增益 = 跨段损耗
    const G_target_dB = spanLoss_dB

    // ── Step 1: 计算逐信道 NF 和增益 ──
    for (let i = 0; i < channelCount; i++) {
        const f = channelFrequencies[i]
        // 归一化频率偏移 x ∈ [-0.5, 0.5]
        const x = (f - fCenter) / fSpan

        // NF(f): 中心 NF + 抛物倾斜 + 正弦波纹
        // 抛物倾斜使边缘 NF 升高 (EDFA 典型特性)
        const nf_channel_dB = nf0_dB
            + nfTilt * 4 * x * x                                           // 抛物形: 边缘比中心高 nfTilt dB
            + nfRipple * Math.sin(2 * Math.PI * nfRipplePeriods * x)       // 波纹

        // G(f): 目标增益 + 线性倾斜 + 余弦波纹
        let gainRippleContrib = gainRipple * Math.cos(2 * Math.PI * gainRipplePeriods * x)
        if (gainFlattening) {
            // GFF 将波纹压缩到残余水平
            gainRippleContrib = gffResidual * Math.cos(2 * Math.PI * gainRipplePeriods * x)
        }
        const gain_channel_dB = G_target_dB
            + gainTilt * x                                                 // 线性倾斜
            + gainRippleContrib                                            // 波纹

        nfPerChannel[i] = parseFloat(nf_channel_dB.toFixed(2))
        gainPerChannel[i] = parseFloat(gain_channel_dB.toFixed(2))
    }

    // ── Step 2: 饱和检查 ──
    // 这里的 launchPowerPerChannel 约定为“放大器输出 / 入纤”的每信道功率 (dBm)
    // 也就是 WDM 的 launch power。
    //
    // 放大器最大输出功率 maxOutputPower 是“总输出”限制 (dBm)。
    // 如果总输出超过限制, 以等比例方式对所有信道增益做统一下调。
    const launchPowerOut_dBm = amplifierParams.launchPowerPerChannel ?? -1.5
    const channelPowerOut_mW = Math.pow(10, launchPowerOut_dBm / 10)  // mW per channel
    const totalOutputPower_mW = channelCount * channelPowerOut_mW
    const maxOutputPower_mW = Math.pow(10, maxOutputPower_dBm / 10)

    if (totalOutputPower_mW > maxOutputPower_mW) {
        // 饱和: 等比缩减增益 (dB 形式)
        const reductionRatio = maxOutputPower_mW / totalOutputPower_mW
        const reductionDb = linearToDb(reductionRatio)
        for (let i = 0; i < channelCount; i++) {
            gainPerChannel[i] = parseFloat((gainPerChannel[i] + reductionDb).toFixed(2))
        }
    }

    // ── Step 3: 计算 ASE ──
    for (let i = 0; i < channelCount; i++) {
        const freq_Hz = channelFrequencies[i] * 1e12
        const nfLinear = dbToLinear(nfPerChannel[i])
        const gLinear = dbToLinear(gainPerChannel[i])

        asePerChannel[i] = PHYS.h * freq_Hz * nfLinear * (gLinear - 1) * PHYS.refBandwidth
    }

    return { asePerChannel, nfPerChannel, gainPerChannel }
}
