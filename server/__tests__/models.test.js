/**
 * 仿真引擎单元测试
 * 验证 GN / EGN / Raman / EOL 核心公式正确性
 */

import { describe, it, expect } from 'vitest'
import { parseWdmParams, parseFiberPhysics, computeSpanNli, buildSimulationInput } from '../services/gnModel.js'
import { computeEgnSpanNli } from '../services/egnModel.js'
import { calculateRamanGain, calculateRamanNF } from '../services/ramanModel.js'
import { calculateEolDegradation, DEFAULT_AGING_PARAMS } from '../services/eolModel.js'
import { PHYS, dbmToW, wToDbm, dbToLinear, linearToDb } from '../utils/physics.js'

// ── 工具函数测试 ──
describe('physics utils', () => {
    it('dbmToW / wToDbm 互逆', () => {
        const dbm = 0
        const w = dbmToW(dbm)
        expect(w).toBeCloseTo(0.001, 6)
        expect(wToDbm(w)).toBeCloseTo(dbm, 2)
    })

    it('dbToLinear / linearToDb 互逆', () => {
        const db = 10
        const lin = dbToLinear(db)
        expect(lin).toBeCloseTo(10, 4)
        expect(linearToDb(lin)).toBeCloseTo(db, 4)
    })

    it('0 dBm = 1 mW', () => {
        expect(dbmToW(0)).toBeCloseTo(1e-3, 9)
    })

    it('-3 dBm ≈ 0.5 mW', () => {
        expect(dbmToW(-3)).toBeCloseTo(0.5e-3, 5)
    })

    it('PHYS constants are physically correct', () => {
        expect(PHYS.h).toBeCloseTo(6.626e-34, 37)
        expect(PHYS.c).toBe(299792458)
        expect(PHYS.refBandwidth).toBeCloseTo(12.5e9, 0)
    })
})

// ── WDM 参数解析 ──
describe('parseWdmParams', () => {
    it('correctly parses default 96-ch WDM system', () => {
        const wdm = parseWdmParams({
            channelCount: 96,
            centerFreq: 193.1,
            channelSpacing: 50,
            baudRate: 64,
            launchPower: 0,
        })
        expect(wdm.channelCount).toBe(96)
        expect(wdm.launchPower_W).toBeCloseTo(1e-3, 6)
        expect(wdm.channelFrequencies).toHaveLength(96)
        // 中心频率应接近 193.1 THz
        const midIdx = Math.floor(96 / 2)
        expect(wdm.channelFrequencies[midIdx]).toBeCloseTo(193.1, 0)
    })

    it('channel frequency spacing matches config', () => {
        const wdm = parseWdmParams({
            channelCount: 10,
            centerFreq: 193.1,
            channelSpacing: 100,
            baudRate: 64,
            launchPower: 0,
        })
        const spacing = wdm.channelFrequencies[1] - wdm.channelFrequencies[0]
        expect(spacing).toBeCloseTo(0.1, 3) // 100 GHz = 0.1 THz
    })
})

// ── 光纤物理参数 ──
describe('parseFiberPhysics', () => {
    it('computes alpha in Np/m correctly', () => {
        const fiber = parseFiberPhysics({ attenuation: 0.2, dispersion: 17, nonlinearCoeff: 1.3 }, 193.1)
        // 0.2 dB/km = 0.2 * ln(10)/(10*1000) Np/m ≈ 4.605e-5
        expect(fiber.alpha_Np_per_m).toBeCloseTo(0.2 * Math.log(10) / 10000, 8)
    })

    it('beta2 is positive for standard SMF', () => {
        const fiber = parseFiberPhysics({ attenuation: 0.2, dispersion: 17 }, 193.1)
        expect(fiber.beta2).toBeGreaterThan(0)
        // β₂ ≈ 21 ps²/km → ~2.1e-26 s²/m
        expect(fiber.beta2).toBeGreaterThan(1e-27)
        expect(fiber.beta2).toBeLessThan(1e-25)
    })

    it('gamma from nonlinear index computation', () => {
        const fiber = parseFiberPhysics({
            attenuation: 0.165,
            dispersion: 20.5,
            nonlinearIndex: 2.6,
            effectiveArea: 130,
        }, 193.1)
        // γ = 2π·n₂ / (λ·A_eff), typical value ~0.7-1.0 /W/km → 7e-4 to 1e-3 /W/m
        expect(fiber.gamma_W_m).toBeGreaterThan(5e-4)
        expect(fiber.gamma_W_m).toBeLessThan(2e-3)
    })
})

// ── GN-Model NLI ──
describe('GN-Model computeSpanNli', () => {
    it('NLI power is positive and finite', () => {
        const fiber = parseFiberPhysics({ attenuation: 0.165, dispersion: 20.5, nonlinearCoeff: 0.8 }, 193.1)
        const wdm = parseWdmParams({ channelCount: 96, centerFreq: 193.1, channelSpacing: 50, baudRate: 64, launchPower: 0 })
        const B_ch = 64e9
        const B_wdm = 96 * 50e9
        const spanLen_m = 80e3

        const { P_nli, L_eff } = computeSpanNli(
            fiber.gamma_W_m, fiber.beta2, fiber.alpha_Np_per_m,
            spanLen_m, wdm.launchPower_W, B_ch, B_wdm
        )
        expect(P_nli).toBeGreaterThan(0)
        expect(P_nli).toBeLessThan(1e-6) // NLI << signal power
        expect(L_eff).toBeGreaterThan(0)
        expect(isFinite(P_nli)).toBe(true)
    })

    it('NLI increases with launch power (cubic relationship)', () => {
        const fiber = parseFiberPhysics({ attenuation: 0.165, dispersion: 20.5, nonlinearCoeff: 0.8 }, 193.1)
        const B_ch = 64e9
        const B_wdm = 96 * 50e9
        const spanLen_m = 80e3

        const { P_nli: nli_low } = computeSpanNli(fiber.gamma_W_m, fiber.beta2, fiber.alpha_Np_per_m, spanLen_m, dbmToW(-3), B_ch, B_wdm)
        const { P_nli: nli_high } = computeSpanNli(fiber.gamma_W_m, fiber.beta2, fiber.alpha_Np_per_m, spanLen_m, dbmToW(0), B_ch, B_wdm)

        // +3 dBm → power doubles → NLI should increase ~8x (cubic)
        const ratio = nli_high / nli_low
        expect(ratio).toBeGreaterThan(6) // ~8x, allowing margin
        expect(ratio).toBeLessThan(10)
    })
})

// ── EGN-Model NLI ──
describe('EGN-Model computeEgnSpanNli', () => {
    it('EGN NLI is finite and positive', () => {
        const fiber = parseFiberPhysics({ attenuation: 0.165, dispersion: 20.5, nonlinearCoeff: 0.8 }, 193.1)
        const B_ch = 64e9
        const B_wdm = 96 * 50e9
        const spanLen_m = 80e3
        const P_ch = dbmToW(0)

        const result = computeEgnSpanNli({
            gamma_W_m: fiber.gamma_W_m,
            beta2: fiber.beta2,
            alpha_Np_per_m: fiber.alpha_Np_per_m,
            spanLen_m,
            launchPower_W: P_ch,
            B_ch,
            B_wdm,
            beta3: 0,
            channelCount: 96,
            xpmEnhancementFactor: 1.1,
            higherOrderDispersionFactor: 0.05,
            modulationPhi: 1.12,
        })

        expect(result.P_nli).toBeGreaterThan(0)
        expect(isFinite(result.P_nli)).toBe(true)
        // EGN P_nli should be close to GN P_nli_gn but modified by delta_egn
        expect(result.P_nli_gn).toBeGreaterThan(0)
        expect(typeof result.delta_egn).toBe('number')
    })
})

// ── Raman 模型 ──
describe('Raman amplifier model', () => {
    it('Raman on/off gain is positive for reasonable pump power', () => {
        const result = calculateRamanGain({
            pumpPowerMw: 350,
            spanLengthKm: 80,
            fiberAttenuation: 0.2,
            pumpAttenuation: 0.25,
        })
        expect(result.onOffGainDb).toBeGreaterThan(0)
        expect(result.onOffGainDb).toBeLessThan(30) // 合理范围
        expect(result.effectivePumpLength).toBeGreaterThan(0)
    })

    it('higher pump power gives higher gain', () => {
        const low = calculateRamanGain({ pumpPowerMw: 200, spanLengthKm: 80, fiberAttenuation: 0.2 })
        const high = calculateRamanGain({ pumpPowerMw: 400, spanLengthKm: 80, fiberAttenuation: 0.2 })
        expect(high.onOffGainDb).toBeGreaterThan(low.onOffGainDb)
    })

    it('net gain is on/off gain minus span loss', () => {
        const result = calculateRamanGain({
            pumpPowerMw: 350,
            spanLengthKm: 80,
            fiberAttenuation: 0.2,
        })
        const expectedNet = result.onOffGainDb - (0.2 * 80)
        expect(result.netGainDb).toBeCloseTo(expectedNet, 1)
    })

    it('Raman NF is lower than typical EDFA NF', () => {
        const gain_dB = 15
        const gain_linear = dbToLinear(gain_dB)
        const ramanNF = calculateRamanNF(gain_linear)
        // Raman NF 典型值 < 0 dB (等效), 但我们限制 >= 0
        expect(ramanNF).toBeLessThan(5) // 明显低于 EDFA 的 4-6 dB
        expect(ramanNF).toBeGreaterThanOrEqual(0)
    })
})

// ── EOL 老化模型 ──
describe('EOL aging model', () => {
    it('calculates degradation for typical submarine system', () => {
        const result = calculateEolDegradation({
            totalLengthKm: 6000,
            numAmplifiers: 80,
            avgSpanLengthKm: 75,
            buCount: 2,
        })

        expect(result.designLifeYears).toBe(25)
        expect(result.totalPenalty_dB).toBeGreaterThan(0)
        expect(result.totalPenalty_dB).toBeLessThan(5) // 合理范围: 1-4 dB
        expect(result.osnrDegradation_dB).toBeGreaterThan(0)
        expect(result.gsnrDegradation_dB).toBeGreaterThan(0)
    })

    it('fiber aging component scales with link length', () => {
        const short = calculateEolDegradation({ totalLengthKm: 1000, numAmplifiers: 13, avgSpanLengthKm: 75, buCount: 0 })
        const long = calculateEolDegradation({ totalLengthKm: 10000, numAmplifiers: 133, avgSpanLengthKm: 75, buCount: 0 })
        // Fiber aging loss scales linearly with length
        expect(long.breakdown.fiberAging.value_dB).toBeGreaterThan(short.breakdown.fiberAging.value_dB)
        // OSNR degradation (per-span extra loss) stays roughly constant since fiber aging / numAmps ≈ constant
        expect(long.osnrDegradation_dB).toBeCloseTo(short.osnrDegradation_dB, 0)
    })

    it('breakdown items sum to approximately total fiber aging', () => {
        const result = calculateEolDegradation({
            totalLengthKm: 5000,
            numAmplifiers: 66,
            avgSpanLengthKm: 75,
            buCount: 1,
        })
        const bd = result.breakdown
        expect(bd.fiberAging.value_dB).toBeCloseTo(0.02 * 5000, 1)
        expect(bd.amplifierNf.value_dB).toBe(0.5)
        expect(bd.spliceAging.value_dB).toBeCloseTo(66 * 2 * 0.01, 1)
    })

    it('respects custom aging params', () => {
        const result = calculateEolDegradation({
            totalLengthKm: 1000,
            numAmplifiers: 13,
            avgSpanLengthKm: 75,
            buCount: 0,
            agingParams: {
                fiberAgingPerKm: 0.05,  // 更高的光纤老化率
                designLifeYears: 30,
            },
        })
        expect(result.designLifeYears).toBe(30)
        expect(result.breakdown.fiberAging.value_dB).toBeCloseTo(0.05 * 1000, 1)
    })
})

// ── buildSimulationInput 集成 ──
describe('buildSimulationInput', () => {
    it('constructs valid simulation input from request body', () => {
        const body = {
            linkId: 'test-link',
            linkName: 'Test Link',
            totalLengthKm: 500,
            fiberModel: 'GN',
            amplifierModel: 'EDFA_Simple',
            fiberParams: { attenuation: 0.165, effectiveArea: 130, dispersion: 20.5, dispersionSlope: 0.06, nonlinearIndex: 2.6, nonlinearCoeff: 0.8 },
            amplifierParams: { gain: 18, noiseFigure: 4.8, maxOutputPower: 21, saturationPower: 23 },
            wdmParams: { channelCount: 96, centerFreq: 193.1, channelSpacing: 50, baudRate: 64, modulation: '16QAM', launchPower: 0 },
            spanStrategy: { mode: 'scan', scanRange: { min: 40, max: 100, step: 10 } },
            constraints: { targetOSNR: 16, targetGSNR: 14, maxSpanLength: 120, minSpanLength: 30, osnrMargin: 1 },
            buConfigs: [],
            deviceSequence: [
                { id: 'tx', name: 'Tx', type: 'landing', kp: 0 },
                { id: 'rx', name: 'Rx', type: 'landing', kp: 500 },
            ],
        }

        const simInput = buildSimulationInput(body)
        expect(simInput.totalLengthKm).toBe(500)
        expect(simInput.deviceSequence).toHaveLength(2)
        expect(simInput.fiberSegments).toHaveLength(1)
        expect(simInput.fiberSegments[0].length).toBe(500)
    })
})
