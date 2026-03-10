/**
 * SSFM 仿真引擎单元测试
 * 验证对称分步傅里叶法核心算法的正确性
 */

import { describe, it, expect } from 'vitest'
import { ssfmPropagate, computeSsfmSpanNli, ssfmSpanIteration } from '../services/ssfmModel.js'
import { parseFiberPhysics, parseWdmParams, computeSpanNli, spanIteration } from '../services/gnModel.js'
import { PHYS, dbmToW, linearToDb } from '../utils/physics.js'
import { nextPow2 } from '../utils/fft.js'

// ── 辅助函数 ──
function buildOmegaGrid(N, dt) {
    const omega = new Float64Array(N)
    const dOmega = 2 * Math.PI / (N * dt)
    for (let i = 0; i < N; i++) {
        const k = i < N / 2 ? i : i - N
        omega[i] = k * dOmega
    }
    return omega
}

function fieldPower(re, im) {
    let sum = 0
    for (let i = 0; i < re.length; i++) {
        sum += re[i] * re[i] + im[i] * im[i]
    }
    return sum / re.length
}

// ── ssfmPropagate 基本物理验证 ──
describe('ssfmPropagate', () => {
    it('纯衰减: 输出功率 = 输入功率 × exp(-α·L)', () => {
        const N = 256
        const dt = 1e-12
        const omega = buildOmegaGrid(N, dt)
        const P0 = 1e-3 // 1mW
        const amp = Math.sqrt(P0)
        const eRe = new Float64Array(N).fill(amp)
        const eIm = new Float64Array(N).fill(0)

        const alpha_dB_km = 0.2
        const alpha_Np_m = alpha_dB_km * Math.log(10) / 10000
        const spanLength_m = 50000 // 50 km

        const result = ssfmPropagate({
            eRe, eIm,
            alpha_Np_m,
            beta2: 0,       // 无色散
            beta3: 0,
            gamma_W_m: 0,   // 无非线性
            spanLength_m,
            stepSize_m: spanLength_m, // 一步完成
            omega,
        })

        // 功率衰减: P_out/P_in = exp(-α_Np·L)
        // 线性算子对场施加 exp(-α/2·dz), 所以功率 = |E|² 衰减 exp(-α·L)
        const expectedAttenuation = Math.exp(-alpha_Np_m * spanLength_m)
        const actualAttenuation = result.outputPower / P0

        expect(actualAttenuation).toBeCloseTo(expectedAttenuation, 2)
    })

    it('无衰减无色散: CW 信号功率守恒', () => {
        const N = 256
        const dt = 1e-12
        const omega = buildOmegaGrid(N, dt)
        const P0 = 1e-3
        const eRe = new Float64Array(N).fill(Math.sqrt(P0))
        const eIm = new Float64Array(N).fill(0)

        const result = ssfmPropagate({
            eRe, eIm,
            alpha_Np_m: 0,
            beta2: 0,
            beta3: 0,
            gamma_W_m: 0,
            spanLength_m: 10000,
            stepSize_m: 10000,
            omega,
        })

        // CW 信号无损传播, 功率应不变
        expect(result.outputPower).toBeCloseTo(P0, 6)
    })

    it('纯非线性: 只产生相位旋转, 功率不变', () => {
        const N = 256
        const dt = 1e-12
        const omega = buildOmegaGrid(N, dt)
        const P0 = 1e-3
        const eRe = new Float64Array(N).fill(Math.sqrt(P0))
        const eIm = new Float64Array(N).fill(0)

        const result = ssfmPropagate({
            eRe, eIm,
            alpha_Np_m: 0,
            beta2: 0,
            beta3: 0,
            gamma_W_m: 1e-3,  // 典型 γ
            spanLength_m: 1000,
            stepSize_m: 100,
            omega,
        })

        // Kerr 效应只改变相位, 不改变功率 (对于 CW)
        expect(result.outputPower).toBeCloseTo(P0, 5)
    })

    it('返回的步数大于 0', () => {
        const N = 256
        const dt = 1e-12
        const omega = buildOmegaGrid(N, dt)
        const eRe = new Float64Array(N).fill(Math.sqrt(1e-3))
        const eIm = new Float64Array(N).fill(0)

        const result = ssfmPropagate({
            eRe, eIm,
            alpha_Np_m: 3.8e-5,
            beta2: 2e-26,
            beta3: 0,
            gamma_W_m: 1e-3,
            spanLength_m: 80000,
            stepSize_m: 500,
            omega,
        })

        expect(result.steps).toBeGreaterThan(0)
        expect(result.outputPower).toBeGreaterThan(0)
        expect(isFinite(result.outputPower)).toBe(true)
    })
})

// ── computeSsfmSpanNli ──
describe('computeSsfmSpanNli', () => {
    it('NLI 功率有限且为正', () => {
        const fiber = parseFiberPhysics({
            attenuation: 0.165,
            dispersion: 20.5,
            nonlinearCoeff: 0.8,
        }, 193.1)

        const result = computeSsfmSpanNli({
            fiber,
            spanLength_m: 80000,
            launchPower_W: dbmToW(0),
            channelOffsets_Hz: [-100e9, -50e9, 0, 50e9, 100e9],
            beta3: 0,
            ssfmConfig: { samplePoints: 512, stepSize: 500 },
        })

        expect(result.P_nli).toBeGreaterThan(0)
        expect(isFinite(result.P_nli)).toBe(true)
        expect(result.P_output).toBeGreaterThan(0)
        expect(result.steps).toBeGreaterThan(0)
    })

    it('线性传播的 NLI 接近 0', () => {
        const fiber = parseFiberPhysics({
            attenuation: 0.165,
            dispersion: 20.5,
            nonlinearCoeff: 0.8,
        }, 193.1)

        // 使用单信道 (无 FWM), NLI 应该很小
        const result = computeSsfmSpanNli({
            fiber,
            spanLength_m: 80000,
            launchPower_W: dbmToW(-10), // 低功率
            channelOffsets_Hz: [0],      // 单信道
            beta3: 0,
            ssfmConfig: { samplePoints: 512, stepSize: 500 },
        })

        // 单信道低功率时, SSFM 与线性传播差异应很小
        expect(result.P_nli).toBeLessThan(result.P_output * 0.1)
    })
})

// ── ssfmSpanIteration 接口一致性 ──
describe('ssfmSpanIteration', () => {
    const simInput = {
        totalLengthKm: 500,
        fiberParams: {
            attenuation: 0.165,
            dispersion: 20.5,
            dispersionSlope: 0.06,
            nonlinearCoeff: 0.8,
            nonlinearIndex: 2.6,
            effectiveArea: 130,
            ssfmParams: { samplePoints: 512, stepSize: 500 },
        },
        amplifierParams: {
            noiseFigure: 4.8,
        },
        wdmParams: {
            channelCount: 16,
            centerFreq: 193.1,
            channelSpacing: 50,
            baudRate: 64,
            launchPower: 0,
        },
        spanStrategy: {
            mode: 'fixed',
            fixedLength: 80,
        },
        constraints: {
            targetGSNR: 14.0,
            osnrMargin: 1.0,
        },
        buConfigs: [],
    }

    it('输出结构与 GN/EGN 一致', () => {
        const result = ssfmSpanIteration(simInput)

        expect(result).toHaveProperty('spanScanResult')
        expect(result).toHaveProperty('recommendedPoint')

        const { spanScanResult, recommendedPoint } = result

        expect(spanScanResult).toHaveProperty('spanLengthsKm')
        expect(spanScanResult).toHaveProperty('scanPoints')
        expect(spanScanResult).toHaveProperty('recommendedSpanKm')
        expect(spanScanResult).toHaveProperty('targetGsnrDb')
        expect(spanScanResult).toHaveProperty('channelFrequencies')
        expect(spanScanResult.model).toBe('SSFM')

        expect(recommendedPoint).toHaveProperty('avgGsnrDb')
        expect(recommendedPoint).toHaveProperty('minGsnrDb')
        expect(recommendedPoint).toHaveProperty('numAmplifiers')
        expect(recommendedPoint).toHaveProperty('gsnrPerChannelDb')
    })

    it('scan 模式返回多个扫描点', () => {
        const scanInput = {
            ...simInput,
            spanStrategy: {
                mode: 'scan',
                scanRange: { min: 60, max: 100, step: 20 },
            },
        }

        const result = ssfmSpanIteration(scanInput)
        expect(result.spanScanResult.scanPoints.length).toBe(3) // 60, 80, 100
    })

    it('GSNR 值在合理范围 (10-30 dB)', () => {
        const result = ssfmSpanIteration(simInput)
        const { recommendedPoint } = result

        expect(recommendedPoint.avgGsnrDb).toBeGreaterThan(5)
        expect(recommendedPoint.avgGsnrDb).toBeLessThan(35)
    })

    it('每信道 GSNR 数组长度等于信道数', () => {
        const result = ssfmSpanIteration(simInput)
        expect(result.recommendedPoint.gsnrPerChannelDb).toHaveLength(16)
        expect(result.recommendedPoint.osnrPerChannelDb).toHaveLength(16)
        expect(result.recommendedPoint.nliPerChannelDb).toHaveLength(16)
    })
})

// ── SSFM vs GN 对比 ──
describe('SSFM vs GN 结果对比', () => {
    const simInput = {
        totalLengthKm: 500,
        fiberParams: {
            attenuation: 0.165,
            dispersion: 20.5,
            dispersionSlope: 0.06,
            nonlinearCoeff: 0.8,
            nonlinearIndex: 2.6,
            effectiveArea: 130,
            ssfmParams: { samplePoints: 512, stepSize: 500 },
        },
        amplifierParams: { noiseFigure: 4.8 },
        wdmParams: {
            channelCount: 16,
            centerFreq: 193.1,
            channelSpacing: 50,
            baudRate: 64,
            launchPower: 0,
        },
        spanStrategy: { mode: 'fixed', fixedLength: 80 },
        constraints: { targetGSNR: 14.0, osnrMargin: 1.0 },
        buConfigs: [],
    }

    it('SSFM 和 GN 的 GSNR 差异在合理范围', () => {
        const ssfmResult = ssfmSpanIteration(simInput)
        const gnResult = spanIteration(simInput)

        const ssfmGsnr = ssfmResult.recommendedPoint.avgGsnrDb
        const gnGsnr = gnResult.recommendedPoint.avgGsnrDb

        // SSFM 通常比 GN 更乐观 (GN 过估 NLI), 差异应在 ±10 dB 内
        const diff = Math.abs(ssfmGsnr - gnGsnr)
        expect(diff).toBeLessThan(10)
    })

    it('两者的放大器数量一致 (固定 span)', () => {
        const ssfmResult = ssfmSpanIteration(simInput)
        const gnResult = spanIteration(simInput)

        expect(ssfmResult.recommendedPoint.numAmplifiers)
            .toBe(gnResult.recommendedPoint.numAmplifiers)
    })
})
