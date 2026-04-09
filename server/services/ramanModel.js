/**
 * Raman 放大器模型
 *
 * 实现分布式拉曼放大器的:
 *   1. On/Off 增益计算
 *   2. 等效噪声系数 (NF) 计算
 *   3. EDFA + Raman 混合级联模式
 *
 * 参考: C.R.S. Fludger, "Fundamental Noise Limits in Broadband Raman Amplifiers"
 */

import { PHYS, dbmToW, dbToLinear, linearToDb, wToDbm } from '../utils/physics.js'
import { parseWdmParams, parseFiberPhysics, buildSimulationInput, buildDetailedResult } from './gnModel.js'

// ── Raman 物理常量 ──
const RAMAN_CONSTANTS = {
    // 典型 Raman 增益效率 (W⁻¹·km⁻¹) @ 1550nm, SMF
    gainEfficiency: 0.4,    // Cr ≈ 0.3-0.5 for SMF
    // Phonon 占据因子温度 (K)
    phononTemp: 300,
    // Boltzmann 常数
    kB: 1.380649e-23,
    // 频率偏移 (THz) — 典型泵浦与信号间距
    ramanShift: 13.2,       // ~100nm 偏移
}

/**
 * 计算分布式拉曼放大器的 On/Off 增益 (dB)
 *
 * G_on/off = exp(Cr * P_pump * L_eff_pump - α_s * L)
 *
 * @param {Object} params
 * @param {number} params.pumpPowerMw - 泵浦功率 (mW)
 * @param {number} params.spanLengthKm - 跨距长度 (km)
 * @param {number} params.fiberAttenuation - 信号衰减 (dB/km)
 * @param {number} params.pumpAttenuation - 泵浦衰减 (dB/km), 典型 ~0.25
 * @param {number} [params.gainEfficiency] - Raman 增益效率 (W⁻¹·km⁻¹)
 * @returns {{ onOffGainDb, netGainDb, effectivePumpLength }}
 */
export function calculateRamanGain(params) {
    const {
        pumpPowerMw,
        spanLengthKm,
        fiberAttenuation,
        pumpAttenuation = 0.25,
        gainEfficiency = RAMAN_CONSTANTS.gainEfficiency,
    } = params

    const pumpPowerW = pumpPowerMw / 1000
    const spanLengthM = spanLengthKm * 1000

    // 泵浦有效长度 (反向泵浦)
    const alphaPump_Np_m = pumpAttenuation * Math.log(10) / (10 * 1000)
    const L_eff_pump = (1 - Math.exp(-alphaPump_Np_m * spanLengthM)) / alphaPump_Np_m

    // Raman On/Off 增益 (linear)
    const Cr_m = gainEfficiency * 1e-3  // W⁻¹km⁻¹ → W⁻¹m⁻¹
    const G_raman_linear = Math.exp(Cr_m * pumpPowerW * L_eff_pump)
    const onOffGainDb = linearToDb(G_raman_linear)

    // 净增益 = On/Off增益 - 跨段损耗
    const spanLossDb = fiberAttenuation * spanLengthKm
    const netGainDb = onOffGainDb - spanLossDb

    return {
        onOffGainDb: parseFloat(onOffGainDb.toFixed(2)),
        netGainDb: parseFloat(netGainDb.toFixed(2)),
        effectivePumpLength: parseFloat((L_eff_pump / 1000).toFixed(2)),  // km
        spanLossDb: parseFloat(spanLossDb.toFixed(2)),
    }
}

/**
 * 计算分布式拉曼放大器的等效噪声系数 (dB)
 *
 * NF_eff ≈ 1/(G_raman) + (hν/P_s) * n_sp * (G_raman - 1)/G_raman * 2
 * 简化: NF_eff ≈ 1/G + 2*n_sp*(1 - 1/G)
 *
 * @param {number} onOffGainLinear - Raman On/Off 增益 (线性)
 * @param {number} [temperature=300] - 温度 (K)
 * @returns {number} 等效 NF (dB)
 */
export function calculateRamanNF(onOffGainLinear, temperature = 300) {
    // Phonon 占据因子
    const freqShift = RAMAN_CONSTANTS.ramanShift * 1e12  // THz → Hz
    const nPhonon = 1 / (Math.exp(PHYS.h * freqShift / (RAMAN_CONSTANTS.kB * temperature)) - 1)

    // 自发辐射因子
    const nSp = 1 + nPhonon

    // 等效 NF
    const G = onOffGainLinear
    const nfLinear = 1 / G + 2 * nSp * (1 - 1 / G)

    return parseFloat(linearToDb(Math.max(nfLinear, 1)).toFixed(2))
}

/**
 * Raman + EDFA 混合级联 Span 迭代
 *
 * 配置:
 *   - 每跨段先经过分布式 Raman 放大（反向泵浦）
 *   - 然后经过集中式 EDFA 补偿剩余损耗
 *   - 总增益 = 跨段损耗（完全补偿）
 */
export function ramanHybridSpanIteration(simInput) {
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

    // Raman 参数
    const ramanParams = amplifierParams.ramanParams || {}
    const pumpPowerMw = ramanParams.pumpPower || 350     // 默认 350mW
    const pumpAttenuation = ramanParams.pumpAttenuation || 0.25

    // EDFA 参数
    const edfaNF_dB = amplifierParams.noiseFigure || 4.8
    const edfaNF_linear = dbToLinear(edfaNF_dB)

    const B_ch = wdm.baudRateGBaud * 1e9
    const B_wdm = wdm.channelCount * wdm.spacingGHz * 1e9

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

        // Raman 增益计算
        const ramanResult = calculateRamanGain({
            pumpPowerMw,
            spanLengthKm: actualSpanLen,
            fiberAttenuation: fiber.alpha_dB_per_km,
            pumpAttenuation,
        })

        const ramanGain_linear = dbToLinear(ramanResult.onOffGainDb)
        const ramanNF_dB = calculateRamanNF(ramanGain_linear)
        const ramanNF_linear = dbToLinear(ramanNF_dB)

        // EDFA 补偿剩余损耗
        const spanLoss_dB = fiber.alpha_dB_per_km * actualSpanLen
        const edfaGain_dB = Math.max(0, spanLoss_dB - ramanResult.onOffGainDb)
        const edfaGain_linear = dbToLinear(edfaGain_dB)

        // GN-Model NLI（Raman 分布式放大降低了有效噪声累积）
        const L_eff = (1 - Math.exp(-2 * fiber.alpha_Np_per_m * spanLen_m)) / (2 * fiber.alpha_Np_per_m)
        const asinhArg = Math.PI * Math.PI / 2 * fiber.beta2 * L_eff * B_wdm * B_wdm
        const asinhVal = Math.log(asinhArg + Math.sqrt(asinhArg * asinhArg + 1))
        const P_nli_per_span = (16 / 27) * fiber.gamma_W_m * fiber.gamma_W_m * L_eff
            * Math.pow(wdm.launchPower_W, 3) * asinhVal
            / (Math.PI * Math.PI * fiber.beta2 * B_ch * B_ch)

        // Raman 分布式放大降低 NLI（约 2-3dB 改善）
        const ramanNliReduction = 0.6  // NLI 降低因子 (Raman 补偿部分衰减)
        const P_nli_raman = P_nli_per_span * ramanNliReduction

        const gsnrPerChannel = []
        const osnrPerChannel = []
        const powerPerChannel = []
        const nliPerChannel = []

        for (let ch = 0; ch < wdm.channelCount; ch++) {
            const freq_Hz = wdm.channelFrequencies[ch] * 1e12
            const signalPower_W = wdm.launchPower_W / equalizerSignalPenalty

            // 级联噪声: Raman ASE + EDFA ASE
            const P_ase_raman = PHYS.h * freq_Hz * ramanNF_linear * (ramanGain_linear - 1) * PHYS.refBandwidth
            const P_ase_edfa = edfaGain_linear > 1
                ? PHYS.h * freq_Hz * edfaNF_linear * (edfaGain_linear - 1) * PHYS.refBandwidth
                : 0
            const P_ase_per_amp = P_ase_raman + P_ase_edfa

            const totalAse_W = P_ase_per_amp * numAmps
            const totalNli_W = P_nli_raman * numAmps

            const buAseExtra = buCount > 0 ? P_ase_per_amp * buCount * 0.3 : 0

            const osnr_linear = signalPower_W / (totalAse_W + buAseExtra)
            const osnr_dB = linearToDb(osnr_linear)

            const gsnr_linear = signalPower_W / (totalAse_W + buAseExtra + totalNli_W)
            const gsnr_dB = linearToDb(gsnr_linear)

            const normalized = (ch - wdm.channelCount / 2) / (wdm.channelCount / 2)
            const edgePenalty = 0.8 * normalized * normalized

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
            // Raman 特有指标
            ramanOnOffGainDb: ramanResult.onOffGainDb,
            ramanNfDb: parseFloat(ramanNF_dB.toFixed(1)),
            edfaGainDb: parseFloat(edfaGain_dB.toFixed(1)),
        })
    }

    const feasiblePoints = scanPoints.filter(p => p.meetTarget)
    const recommendedPoint = feasiblePoints.length > 0
        ? feasiblePoints[feasiblePoints.length - 1]
        : scanPoints[0]

    const feasibleRange = feasiblePoints.length > 0
        ? [feasiblePoints[0].spanLengthKm, feasiblePoints[feasiblePoints.length - 1].spanLengthKm]
        : null

    return {
        spanScanResult: {
            spanLengthsKm: spanLengths,
            scanPoints,
            recommendedSpanKm: recommendedPoint.spanLengthKm,
            targetGsnrDb: targetGsnr_dB,
            feasibleRange,
            channelFrequencies: wdm.channelFrequencies,
            model: 'RAMAN_HYBRID',
        },
        recommendedPoint,
    }
}

// 复用 GN 的输入构建和详细结果生成
export { buildSimulationInput, buildDetailedResult }
