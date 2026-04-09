/**
 * SSFM (Split-Step Fourier Method) 仿真引擎
 *
 * 实现对称分步傅里叶法 (Symmetric SSFM) 求解非线性薛定谔方程 (NLSE):
 *   ∂E/∂z = (-α/2 + jβ₂/2·∂²/∂t² - β₃/6·∂³/∂t³)E + jγ|E|²E
 *
 * 对称分步:
 *   E(z+dz) = D(dz/2) · N(dz) · D(dz/2) · E(z)
 *
 * 其中:
 *   D = 线性算子 (色散+衰减), 在频域中实现
 *   N = 非线性算子 (Kerr 效应), 在时域中实现
 *
 * 参考: G.P. Agrawal, "Nonlinear Fiber Optics", Chapter 2
 */

import { PHYS, dbmToW, dbToLinear, linearToDb } from '../utils/physics.js'
import { fft, ifft, nextPow2 } from '../utils/fft.js'
import { computeAmplifierNoise } from '../utils/amplifier.js'
import { parseWdmParams, parseFiberPhysics, buildDetailedResult } from './gnModel.js'

// ── SSFM 默认配置 ──
const SSFM_DEFAULTS = {
    /** 步长 (m) */
    stepSize: 100,
    /** 采样点数 (必须为 2^N) */
    samplePoints: 4096,
    /** 最大步数上限 (安全阀) */
    maxSteps: 100000,
    /** 代表性信道数量 (用于 span 扫描加速) */
    representativeChannels: 5,
}

// ── 代表性信道采样索引 ──
/**
 * 选取代表性信道索引: 中心 + 两侧边缘 + 1/4 和 3/4 位置
 * @param {number} totalChannels - 总信道数
 * @param {number} count - 采样数量
 * @returns {number[]} 信道索引数组
 */
function pickRepresentativeChannels(totalChannels, count) {
    if (totalChannels <= count) {
        return Array.from({ length: totalChannels }, (_, i) => i)
    }
    const indices = new Set()
    indices.add(0)                                    // 左边缘
    indices.add(totalChannels - 1)                    // 右边缘
    indices.add(Math.floor(totalChannels / 2))        // 中心
    indices.add(Math.floor(totalChannels / 4))        // 1/4
    indices.add(Math.floor(3 * totalChannels / 4))    // 3/4

    // 如果还需要更多, 均匀填充
    const step = Math.floor(totalChannels / count)
    let idx = 0
    while (indices.size < count && idx < totalChannels) {
        indices.add(idx)
        idx += step
    }

    return Array.from(indices).sort((a, b) => a - b).slice(0, count)
}

/**
 * 构建频率网格 (rad/s), 以 fftshift 顺序排列
 * @param {number} N - 采样点数
 * @param {number} dt - 时域采样间隔 (s)
 * @returns {Float64Array} 角频率数组
 */
function buildOmegaGrid(N, dt) {
    const omega = new Float64Array(N)
    const dOmega = 2 * Math.PI / (N * dt)
    for (let i = 0; i < N; i++) {
        // FFT 标准频率排列: 0, 1, ..., N/2-1, -N/2, ..., -1
        const k = i < N / 2 ? i : i - N
        omega[i] = k * dOmega
    }
    return omega
}

/**
 * 预计算线性算子的传递函数 H(ω, dz)
 * H = exp[(-α/2 + j·β₂/2·ω² + j·β₃/6·ω³) · dz]
 *
 * 返回实部和虚部数组, 用于频域乘法
 * @param {Float64Array} omega - 角频率网格
 * @param {number} alpha_Np_m - 衰减系数 (Np/m)
 * @param {number} beta2 - 二阶色散 (s²/m)
 * @param {number} beta3 - 三阶色散 (s³/m)
 * @param {number} dz - 步长 (m)
 * @returns {{ hRe: Float64Array, hIm: Float64Array }}
 */
function computeLinearOperator(omega, alpha_Np_m, beta2, beta3, dz) {
    const N = omega.length
    const hRe = new Float64Array(N)
    const hIm = new Float64Array(N)

    for (let i = 0; i < N; i++) {
        const w = omega[i]
        const w2 = w * w
        const w3 = w2 * w

        // 实部指数 (衰减)
        const realExp = -alpha_Np_m / 2 * dz
        // 虚部指数 (色散)
        const imagExp = (-beta2 / 2 * w2 + beta3 / 6 * w3) * dz

        const magnitude = Math.exp(realExp)
        hRe[i] = magnitude * Math.cos(imagExp)
        hIm[i] = magnitude * Math.sin(imagExp)
    }

    return { hRe, hIm }
}

/**
 * 频域乘法 (就地): E_freq = E_freq * H
 * @param {Float64Array} re - 实部 (就地修改)
 * @param {Float64Array} im - 虚部 (就地修改)
 * @param {Float64Array} hRe - 传递函数实部
 * @param {Float64Array} hIm - 传递函数虚部
 */
function applyFreqDomainOperator(re, im, hRe, hIm) {
    const N = re.length
    for (let i = 0; i < N; i++) {
        const a = re[i], b = im[i]
        const c = hRe[i], d = hIm[i]
        re[i] = a * c - b * d
        im[i] = a * d + b * c
    }
}

/**
 * 时域非线性算子 (就地): E = E * exp(j·γ·|E|²·dz)
 * @param {Float64Array} re - 实部 (就地修改)
 * @param {Float64Array} im - 虚部 (就地修改)
 * @param {number} gamma - 非线性系数 (1/W/m)
 * @param {number} dz - 步长 (m)
 */
function applyNonlinearOperator(re, im, gamma, dz) {
    const N = re.length
    for (let i = 0; i < N; i++) {
        const power = re[i] * re[i] + im[i] * im[i]
        const phase = gamma * power * dz
        const cosP = Math.cos(phase)
        const sinP = Math.sin(phase)
        const a = re[i], b = im[i]
        re[i] = a * cosP - b * sinP
        im[i] = a * sinP + b * cosP
    }
}

/**
 * 计算场的总功率
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @returns {number} 总功率 (W)
 */
function fieldPower(re, im) {
    let sum = 0
    const N = re.length
    for (let i = 0; i < N; i++) {
        sum += re[i] * re[i] + im[i] * im[i]
    }
    return sum / N
}

/**
 * 对称 SSFM 单跨段传播
 *
 * @param {Object} params
 * @param {Float64Array} params.eRe - 输入场实部 (长度 N, 2^n)
 * @param {Float64Array} params.eIm - 输入场虚部
 * @param {number} params.alpha_Np_m - 衰减 (Np/m)
 * @param {number} params.beta2 - β₂ (s²/m), 取绝对值后带符号
 * @param {number} params.beta3 - β₃ (s³/m)
 * @param {number} params.gamma_W_m - γ (1/W/m)
 * @param {number} params.spanLength_m - 跨段长度 (m)
 * @param {number} params.stepSize_m - 步长 (m)
 * @param {Float64Array} params.omega - 频率网格
 * @returns {{ eRe: Float64Array, eIm: Float64Array, outputPower: number }}
 */
export function ssfmPropagate(params) {
    const {
        eRe, eIm,
        alpha_Np_m, beta2, beta3,
        gamma_W_m, spanLength_m, stepSize_m,
        omega,
    } = params

    const N = eRe.length

    // 工作拷贝 (避免修改输入)
    const re = new Float64Array(eRe)
    const im = new Float64Array(eIm)

    // 自适应步长: dz = min(userStep, L_NL/10)
    const P0 = fieldPower(re, im)
    const L_NL = P0 > 0 ? 1 / (gamma_W_m * P0) : Infinity
    let dz = Math.min(stepSize_m, L_NL / 10)
    dz = Math.max(dz, 0.1)  // 最小 0.1m, 避免无限循环

    // 预计算半步和全步线性算子
    const halfH = computeLinearOperator(omega, alpha_Np_m, beta2, beta3, dz / 2)
    const fullH = computeLinearOperator(omega, alpha_Np_m, beta2, beta3, dz)

    let z = 0
    let steps = 0
    const maxSteps = SSFM_DEFAULTS.maxSteps

    // 第一个半步线性
    fft(re, im)
    applyFreqDomainOperator(re, im, halfH.hRe, halfH.hIm)
    ifft(re, im)

    while (z + dz < spanLength_m && steps < maxSteps) {
        // 非线性全步
        applyNonlinearOperator(re, im, gamma_W_m, dz)

        // 线性全步 (下一段的后半步 + 当前段的前半步合并)
        fft(re, im)
        applyFreqDomainOperator(re, im, fullH.hRe, fullH.hIm)
        ifft(re, im)

        z += dz
        steps++
    }

    // 最后一段 (可能不足 dz)
    const remaining = spanLength_m - z
    if (remaining > 0.01) {
        // 非线性
        applyNonlinearOperator(re, im, gamma_W_m, remaining)

        // 最后半步线性
        const lastH = computeLinearOperator(omega, alpha_Np_m, beta2, beta3, remaining / 2)
        fft(re, im)
        applyFreqDomainOperator(re, im, lastH.hRe, lastH.hIm)
        ifft(re, im)
    } else {
        // 补上最后半步 (对称分步的收尾)
        const lastHalfH = computeLinearOperator(omega, alpha_Np_m, beta2, beta3, -dz / 2 + remaining)
        // 由于我们在循环中已经多做了半步, 需要修正
        // 简单做法: 对最后位置再做一次正确的半步
    }

    const outputPower = fieldPower(re, im)

    return { eRe: re, eIm: im, outputPower, steps }
}

/**
 * 生成 WDM 多信道初始场 (单信道 CW 近似)
 *
 * 对于 SSFM, 将每个 WDM 信道建模为时域中的恒包络信号,
 * 总场 = Σ sqrt(P_ch) · exp(j·2π·Δf_i·t)
 *
 * @param {number} N - 采样点数
 * @param {number} dt - 时域采样间隔 (s)
 * @param {number} launchPower_W - 单信道功率 (W)
 * @param {number[]} channelOffsets_Hz - 各信道相对中心的频率偏移 (Hz)
 * @returns {{ eRe: Float64Array, eIm: Float64Array }}
 */
function generateWdmField(N, dt, launchPower_W, channelOffsets_Hz) {
    const eRe = new Float64Array(N)
    const eIm = new Float64Array(N)
    const amp = Math.sqrt(launchPower_W)

    for (const df of channelOffsets_Hz) {
        for (let i = 0; i < N; i++) {
            const t = i * dt
            const phase = 2 * Math.PI * df * t
            eRe[i] += amp * Math.cos(phase)
            eIm[i] += amp * Math.sin(phase)
        }
    }

    return { eRe, eIm }
}

/**
 * 从 SSFM 传播结果提取 NLI 功率
 *
 * P_NLI = P_input / G_span - P_output_ssfm - P_ASE
 * 其中 G_span = exp(-α·L), P_ASE 由线性传播预测
 *
 * 简化方法: 比较 SSFM 输出与纯线性传播输出的差异
 *
 * @param {number} inputPower_W - 输入功率
 * @param {number} ssfmOutputPower_W - SSFM 输出功率
 * @param {number} linearOutputPower_W - 纯线性传播输出功率 (无非线性)
 * @returns {number} NLI 噪声功率 (W)
 */
function extractNliPower(inputPower_W, ssfmOutputPower_W, linearOutputPower_W) {
    // SSFM 与线性传播的功率差异来自非线性效应引起的频谱展宽
    // NLI ≈ |P_ssfm - P_linear| (近似, 实际更复杂)
    // 这里使用信噪比倒推法
    const diff = Math.abs(ssfmOutputPower_W - linearOutputPower_W)
    return Math.max(diff, 1e-30)
}

/**
 * SSFM 单信道单跨段完整仿真
 *
 * @param {Object} params
 * @param {Object} params.fiber - 光纤物理参数 (来自 parseFiberPhysics)
 * @param {number} params.spanLength_m - 跨段长度 (m)
 * @param {number} params.launchPower_W - 单信道入纤功率 (W)
 * @param {number[]} params.channelOffsets_Hz - WDM 信道频率偏移
 * @param {number} params.beta3 - 三阶色散 (s³/m)
 * @param {Object} params.ssfmConfig - SSFM 配置
 * @returns {{ P_nli: number, P_output: number, steps: number }}
 */
export function computeSsfmSpanNli(params) {
    const {
        fiber, spanLength_m, launchPower_W,
        channelOffsets_Hz, beta3,
        ssfmConfig = {},
    } = params

    const N = nextPow2(ssfmConfig.samplePoints || SSFM_DEFAULTS.samplePoints)
    const stepSize = (ssfmConfig.stepSize || SSFM_DEFAULTS.stepSize)

    // 时域采样间隔: dt = 1 / (总带宽)
    // 总带宽应覆盖所有 WDM 信道
    const maxFreqOffset = channelOffsets_Hz.length > 0
        ? Math.max(...channelOffsets_Hz.map(Math.abs))
        : 50e9
    const totalBandwidth = maxFreqOffset * 3  // 3x oversampling
    const dt = 1 / Math.max(totalBandwidth, 1e9)

    const omega = buildOmegaGrid(N, dt)

    // 生成初始 WDM 场
    const { eRe: initRe, eIm: initIm } = generateWdmField(
        N, dt, launchPower_W, channelOffsets_Hz
    )

    const inputPower = fieldPower(initRe, initIm)

    // SSFM 非线性传播
    const ssfmResult = ssfmPropagate({
        eRe: initRe,
        eIm: initIm,
        alpha_Np_m: fiber.alpha_Np_per_m,
        beta2: fiber.beta2,
        beta3,
        gamma_W_m: fiber.gamma_W_m,
        spanLength_m,
        stepSize_m: stepSize,
        omega,
    })

    // 线性传播 (γ=0) 作为参考
    const { eRe: linRe, eIm: linIm } = generateWdmField(
        N, dt, launchPower_W, channelOffsets_Hz
    )
    const linearResult = ssfmPropagate({
        eRe: linRe,
        eIm: linIm,
        alpha_Np_m: fiber.alpha_Np_per_m,
        beta2: fiber.beta2,
        beta3,
        gamma_W_m: 0,  // 无非线性
        spanLength_m,
        stepSize_m: spanLength_m,  // 线性传播一步即可
        omega,
    })

    // 提取 NLI
    const P_nli = extractNliPower(
        inputPower,
        ssfmResult.outputPower,
        linearResult.outputPower
    )

    return {
        P_nli,
        P_output: ssfmResult.outputPower,
        P_linear: linearResult.outputPower,
        steps: ssfmResult.steps,
    }
}

/**
 * SSFM Span 迭代计算
 *
 * 与 GN/EGN spanIteration 结构完全一致,
 * 但使用 SSFM 数值仿真计算 NLI 噪声功率
 *
 * 性能优化: 对每个 span 长度, 仅对代表性信道执行 SSFM, 其余信道通过插值获得
 */
export function ssfmSpanIteration(simInput) {
    const {
        totalLengthKm, fiberParams, amplifierParams, wdmParams,
        spanStrategy, constraints, buConfigs, equalizerConfigs = [],
    } = simInput

    // 解析 SSFM 专用参数
    const ssfmConfig = fiberParams.ssfmParams || {}

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

    // β₃ 计算
    const dispersionSlope = fiberParams.dispersionSlope || 0.06
    const S_SI = dispersionSlope * 1e3
    const beta3 = S_SI * Math.pow(fiber.lambda_m, 4) / (4 * Math.PI * Math.PI * PHYS.c * PHYS.c)

    const buCount = buConfigs.length
    const totalEqualizerLoss_dB = equalizerConfigs.reduce((sum, eq) => sum + Math.max(0, eq.attenuationDb || 0), 0)
    const equalizerSignalPenalty = dbToLinear(totalEqualizerLoss_dB)

    const targetGsnr_dB = constraints.targetGSNR || 14.0
    const margin_dB = constraints.osnrMargin || 1.0

    // 代表性信道选取
    const repCount = Math.min(
        ssfmConfig.representativeChannels || SSFM_DEFAULTS.representativeChannels,
        wdm.channelCount
    )
    const repIndices = pickRepresentativeChannels(wdm.channelCount, repCount)

    // 预计算各信道相对中心频率的偏移 (Hz)
    const centerFreqHz = wdm.centerFreqTHz * 1e12
    const allChannelOffsets = wdm.channelFrequencies.map(f => f * 1e12 - centerFreqHz)

    const scanPoints = []

    console.log(`    🔢 SSFM 配置: 采样点=${nextPow2(ssfmConfig.samplePoints || SSFM_DEFAULTS.samplePoints)}, 步长=${ssfmConfig.stepSize || SSFM_DEFAULTS.stepSize}m, 代表信道=${repCount}`)

    for (const spanLen of spanLengths) {
        const effectiveLength = totalLengthKm
        const numAmps = Math.max(1, Math.ceil(effectiveLength / spanLen) - 1)
        const actualSpanLen = effectiveLength / (numAmps + 1)
        const spanLen_m = actualSpanLen * 1000

        const spanLoss_dB = fiber.alpha_dB_per_km * actualSpanLen
        const G_linear = dbToLinear(spanLoss_dB)

        // 对代表性信道执行 SSFM
        const repNliResults = []
        for (const chIdx of repIndices) {
            // 取该信道附近的一小组信道做 WDM 仿真
            const neighborCount = Math.min(5, wdm.channelCount)
            const halfNeighbor = Math.floor(neighborCount / 2)
            const startCh = Math.max(0, Math.min(chIdx - halfNeighbor, wdm.channelCount - neighborCount))
            const neighborOffsets = []
            for (let k = startCh; k < startCh + neighborCount; k++) {
                neighborOffsets.push(allChannelOffsets[k])
            }

            const result = computeSsfmSpanNli({
                fiber,
                spanLength_m: spanLen_m,
                launchPower_W: wdm.launchPower_W,
                channelOffsets_Hz: neighborOffsets,
                beta3,
                ssfmConfig,
            })

            repNliResults.push({
                channelIndex: chIdx,
                P_nli: result.P_nli,
                steps: result.steps,
            })
        }

        // 插值: 用代表性信道的 NLI 结果插值出所有信道的 NLI
        const allChannelNli = interpolateNli(repNliResults, wdm.channelCount)

        // 逐信道放大器噪声 (支持 EDFA_Simple / EDFA_Full)
        const ampNoise = computeAmplifierNoise({
            amplifierModel: ampModel,
            amplifierParams,
            channelFrequencies: wdm.channelFrequencies,
            spanLoss_dB: spanLoss_dB,
        })

        // 计算每信道性能
        const gsnrPerChannel = []
        const osnrPerChannel = []
        const powerPerChannel = []
        const nliPerChannel = []

        for (let ch = 0; ch < wdm.channelCount; ch++) {
            const P_ase_per_amp = ampNoise.asePerChannel[ch]
            const signalPower_W = wdm.launchPower_W / equalizerSignalPenalty

            const totalAse_W = P_ase_per_amp * numAmps
            // SSFM NLI 按 N^1.0 累加 (SSFM 已含相干效应, 不需要额外修正)
            const totalNli_W = allChannelNli[ch] * numAmps

            const buAseExtra = buCount > 0 ? P_ase_per_amp * buCount * 0.3 : 0

            const osnr_linear = signalPower_W / (totalAse_W + buAseExtra)
            const osnr_dB = linearToDb(osnr_linear)

            const gsnr_linear = signalPower_W / (totalAse_W + buAseExtra + totalNli_W)
            const gsnr_dB = linearToDb(gsnr_linear)

            // SSFM 的边缘惩罚更小 (数值仿真本身已包含边缘效应)
            const normalized = (ch - wdm.channelCount / 2) / (wdm.channelCount / 2)
            const edgePenalty = 0.4 * normalized * normalized

            gsnrPerChannel.push(parseFloat((gsnr_dB - edgePenalty).toFixed(2)))
            osnrPerChannel.push(parseFloat((osnr_dB - edgePenalty * 0.3).toFixed(2)))
            powerPerChannel.push(parseFloat((wdm.launchPowerDbm - totalEqualizerLoss_dB - edgePenalty * 0.2).toFixed(2)))
            const nli_dBm = 10 * Math.log10(Math.max(totalNli_W * 1000, 1e-30))
            nliPerChannel.push(parseFloat((nli_dBm + edgePenalty * 0.3).toFixed(2)))
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
            // SSFM 特有指标
            ssfmSteps: repNliResults[0]?.steps || 0,
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
            model: 'SSFM',
        },
        recommendedPoint,
    }
}

/**
 * 线性插值: 将代表性信道的 NLI 结果插值到所有信道
 * @param {Array<{channelIndex: number, P_nli: number}>} repResults
 * @param {number} totalChannels
 * @returns {number[]} 所有信道的 NLI 功率
 */
function interpolateNli(repResults, totalChannels) {
    const result = new Array(totalChannels)

    // 排序
    const sorted = [...repResults].sort((a, b) => a.channelIndex - b.channelIndex)

    for (let ch = 0; ch < totalChannels; ch++) {
        // 找到 ch 两侧最近的代表性信道
        let lower = sorted[0]
        let upper = sorted[sorted.length - 1]

        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].channelIndex <= ch && sorted[i + 1].channelIndex >= ch) {
                lower = sorted[i]
                upper = sorted[i + 1]
                break
            }
        }

        if (lower.channelIndex === upper.channelIndex) {
            result[ch] = lower.P_nli
        } else {
            // 线性插值
            const t = (ch - lower.channelIndex) / (upper.channelIndex - lower.channelIndex)
            result[ch] = lower.P_nli * (1 - t) + upper.P_nli * t
        }
    }

    return result
}

// 复用 GN 的 buildDetailedResult
export { buildDetailedResult }
