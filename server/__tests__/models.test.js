/**
 * 仿真引擎单元测试
 * 验证 GN / EGN / Raman / EOL 核心公式正确性
 */

import { describe, it, expect } from 'vitest'
import { parseWdmParams, parseFiberPhysics, computeSpanNli, buildSimulationInput, spanIteration, buildDetailedResult } from '../services/gnModel.js'
import { computeEgnSpanNli, egnSpanIteration } from '../services/egnModel.js'
import { calculateRamanGain, calculateRamanNF, ramanHybridSpanIteration } from '../services/ramanModel.js'
import { calculateEolDegradation, DEFAULT_AGING_PARAMS } from '../services/eolModel.js'
import { PHYS, dbmToW, wToDbm, dbToLinear, linearToDb } from '../utils/physics.js'
import { computeAmplifierNoise } from '../utils/amplifier.js'

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

// ── EDFA 放大器模型 ──
describe('EDFA amplifier models', () => {
    // 公共测试参数
    const channelFrequencies = []
    const channelCount = 96
    const centerFreq = 193.1
    const spacing = 0.05 // THz
    for (let i = 0; i < channelCount; i++) {
        channelFrequencies.push(parseFloat((centerFreq - (channelCount - 1) * spacing / 2 + i * spacing).toFixed(4)))
    }
    const spanLoss_dB = 12 // 典型 ~70km × 0.165 dB/km

    it('EDFA_Simple returns uniform NF across all channels', () => {
        const result = computeAmplifierNoise({
            amplifierModel: 'EDFA_Simple',
            amplifierParams: { noiseFigure: 5.0 },
            channelFrequencies,
            spanLoss_dB,
        })
        expect(result.asePerChannel).toHaveLength(channelCount)
        expect(result.nfPerChannel).toHaveLength(channelCount)
        expect(result.gainPerChannel).toHaveLength(channelCount)
        // Simple: 所有信道 NF 相同
        const uniqueNf = new Set(result.nfPerChannel)
        expect(uniqueNf.size).toBe(1)
        expect(result.nfPerChannel[0]).toBe(5.0)
        // Simple: 增益 = 跨段损耗
        expect(result.gainPerChannel[0]).toBe(spanLoss_dB)
    })

    it('EDFA_Full produces wavelength-dependent NF', () => {
        const result = computeAmplifierNoise({
            amplifierModel: 'EDFA_Full',
            amplifierParams: { noiseFigure: 5.0 },
            channelFrequencies,
            spanLoss_dB,
        })
        expect(result.asePerChannel).toHaveLength(channelCount)
        // Full: NF 应当信道间有变化
        const uniqueNf = new Set(result.nfPerChannel)
        expect(uniqueNf.size).toBeGreaterThan(1)
    })

    it('EDFA_Full edge channels have higher NF than center (parabolic tilt)', () => {
        const result = computeAmplifierNoise({
            amplifierModel: 'EDFA_Full',
            amplifierParams: { noiseFigure: 5.0 },
            channelFrequencies,
            spanLoss_dB,
        })
        const midCh = Math.floor(channelCount / 2)
        const nfCenter = result.nfPerChannel[midCh]
        const nfEdge0 = result.nfPerChannel[0]
        const nfEdgeLast = result.nfPerChannel[channelCount - 1]
        // 边缘 NF 应高于中心 (抛物形倾斜)
        expect(nfEdge0).toBeGreaterThan(nfCenter)
        expect(nfEdgeLast).toBeGreaterThan(nfCenter)
    })

    it('EDFA_Full gain has tilt across channels', () => {
        const result = computeAmplifierNoise({
            amplifierModel: 'EDFA_Full',
            amplifierParams: { noiseFigure: 5.0 },
            channelFrequencies,
            spanLoss_dB,
        })
        // 增益在信道间应有变化 (倾斜 + 波纹)
        const uniqueGain = new Set(result.gainPerChannel)
        expect(uniqueGain.size).toBeGreaterThan(1)
        // 增益应围绕 spanLoss_dB 波动
        const avgGain = result.gainPerChannel.reduce((a, b) => a + b, 0) / channelCount
        expect(avgGain).toBeCloseTo(spanLoss_dB, 0)
    })

    it('EDFA_Full ASE differs from EDFA_Simple', () => {
        const params = {
            amplifierParams: { noiseFigure: 5.0 },
            channelFrequencies,
            spanLoss_dB,
        }
        const simple = computeAmplifierNoise({ ...params, amplifierModel: 'EDFA_Simple' })
        const full = computeAmplifierNoise({ ...params, amplifierModel: 'EDFA_Full' })

        // 中心信道 ASE 应近似（Full 在中心处 NF ≈ 基线值，差异 <15%）
        const midCh = Math.floor(channelCount / 2)
        const ratio = full.asePerChannel[midCh] / simple.asePerChannel[midCh]
        expect(ratio).toBeGreaterThan(0.85)
        expect(ratio).toBeLessThan(1.15)

        // 边缘信道 ASE 应更高（Full NF 在边缘升高）
        expect(full.asePerChannel[0]).toBeGreaterThan(simple.asePerChannel[0])
        expect(full.asePerChannel[channelCount - 1]).toBeGreaterThan(simple.asePerChannel[channelCount - 1])
    })

    it('EDFA_Full respects custom edfaFullParams', () => {
        const result = computeAmplifierNoise({
            amplifierModel: 'EDFA_Full',
            amplifierParams: {
                noiseFigure: 5.0,
                edfaFullParams: {
                    nfTilt_dB: 2.0,        // 更大的 NF 倾斜
                    gainTilt_dB: 3.0,       // 更大的增益倾斜
                    gainFlattening: false,   // 关闭 GFF
                    gainRipple_dB: 1.0,     // 更大的增益波纹
                },
            },
            channelFrequencies,
            spanLoss_dB,
        })
        // 更大倾斜 → 边缘 NF 差异更大
        const midCh = Math.floor(channelCount / 2)
        const nfDiff = result.nfPerChannel[0] - result.nfPerChannel[midCh]
        expect(nfDiff).toBeGreaterThan(1.0) // nfTilt=2.0 → 边缘偏移 > 1 dB
    })

    it('EDFA_Full saturation reduces gain when output exceeds max', () => {
        // 使用很低的 maxOutputPower 来触发饱和
        const result = computeAmplifierNoise({
            amplifierModel: 'EDFA_Full',
            amplifierParams: {
                noiseFigure: 5.0,
                maxOutputPower: 5, // 5 dBm, 远低于 96 信道的总输出
            },
            channelFrequencies,
            spanLoss_dB,
        })
        // 饱和后增益应低于 spanLoss_dB
        const avgGain = result.gainPerChannel.reduce((a, b) => a + b, 0) / channelCount
        expect(avgGain).toBeLessThan(spanLoss_dB)
    })

    it('EDFA_Full all ASE values are positive and finite', () => {
        const result = computeAmplifierNoise({
            amplifierModel: 'EDFA_Full',
            amplifierParams: { noiseFigure: 5.0 },
            channelFrequencies,
            spanLoss_dB,
        })
        for (let i = 0; i < channelCount; i++) {
            expect(result.asePerChannel[i]).toBeGreaterThan(0)
            expect(isFinite(result.asePerChannel[i])).toBe(true)
        }
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

describe('equalizer integration', () => {
    it('connector aging includes equalizers', () => {
        const withoutEqualizers = calculateEolDegradation({
            totalLengthKm: 5000,
            numAmplifiers: 66,
            avgSpanLengthKm: 75,
            buCount: 1,
            equalizerCount: 0,
        })
        const withEqualizers = calculateEolDegradation({
            totalLengthKm: 5000,
            numAmplifiers: 66,
            avgSpanLengthKm: 75,
            buCount: 1,
            equalizerCount: 2,
        })

        expect(withEqualizers.breakdown.connectorAging.value_dB).toBeGreaterThan(withoutEqualizers.breakdown.connectorAging.value_dB)
    })

    it('EGN iteration applies equalizer attenuation to power spectrum', () => {
        const result = egnSpanIteration({
            totalLengthKm: 500,
            fiberParams: {
                attenuation: 0.165,
                dispersion: 20.5,
                dispersionSlope: 0.06,
                nonlinearCoeff: 0.8,
                nonlinearIndex: 2.6,
                effectiveArea: 130,
            },
            amplifierParams: {
                noiseFigure: 4.8,
            },
            wdmParams: {
                channelCount: 16,
                centerFreq: 193.1,
                channelSpacing: 50,
                baudRate: 64,
                modulation: '16QAM',
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
            equalizerConfigs: [
                {
                    id: 'eq-1',
                    name: 'F-ATT-S-1',
                    kp: 180,
                    equalizerRole: 'S',
                    attenuationMode: 'fixed',
                    attenuationDb: 3.5,
                },
            ],
        })

        expect(result.recommendedPoint.powerPerChannelDb[0]).toBeLessThan(0)
    })

    it('Raman iteration applies equalizer attenuation to power spectrum', () => {
        const result = ramanHybridSpanIteration({
            totalLengthKm: 500,
            fiberParams: {
                attenuation: 0.165,
                dispersion: 20.5,
                dispersionSlope: 0.06,
                nonlinearCoeff: 0.8,
                nonlinearIndex: 2.6,
                effectiveArea: 130,
            },
            amplifierParams: {
                noiseFigure: 4.8,
                ramanParams: { pumpPower: 350 },
            },
            amplifierModel: 'EDFA_Raman',
            wdmParams: {
                channelCount: 16,
                centerFreq: 193.1,
                channelSpacing: 50,
                baudRate: 64,
                modulation: '16QAM',
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
            equalizerConfigs: [
                {
                    id: 'eq-1',
                    name: 'F-ATT-S-1',
                    kp: 180,
                    equalizerRole: 'S',
                    attenuationMode: 'fixed',
                    attenuationDb: 3.5,
                },
            ],
        })

        expect(result.recommendedPoint.powerPerChannelDb[0]).toBeLessThan(0)
    })

    it('extracts equalizer configs and includes them in detailed positions', () => {
        const body = {
            linkId: 'eq-link',
            linkName: 'Equalized Link',
            totalLengthKm: 500,
            fiberModel: 'GN',
            amplifierModel: 'EDFA_Simple',
            fiberParams: { attenuation: 0.165, effectiveArea: 130, dispersion: 20.5, dispersionSlope: 0.06, nonlinearIndex: 2.6, nonlinearCoeff: 0.8 },
            amplifierParams: { gain: 18, noiseFigure: 4.8, maxOutputPower: 21, saturationPower: 23 },
            wdmParams: { channelCount: 32, centerFreq: 193.1, channelSpacing: 50, baudRate: 64, modulation: '16QAM', launchPower: 0 },
            spanStrategy: { mode: 'fixed', fixedLength: 80 },
            constraints: { targetOSNR: 16, targetGSNR: 14, maxSpanLength: 120, minSpanLength: 30, osnrMargin: 1 },
            buConfigs: [],
            deviceSequence: [
                { id: 'tx', name: 'Tx', type: 'landing', kp: 0 },
                { id: 'eq-1', name: 'Main F-ATT', type: 'equalizer', kp: 180, equalizerRole: 'S', attenuationMode: 'fixed', attenuationDb: 3.5 },
                { id: 'rx', name: 'Rx', type: 'landing', kp: 500 },
            ],
        }

        const simInput = buildSimulationInput(body)
        const { spanScanResult, recommendedPoint } = spanIteration(simInput)
        const detailedResult = buildDetailedResult(simInput, recommendedPoint, spanScanResult)

        expect(simInput.equalizerConfigs).toHaveLength(1)
        expect(simInput.equalizerConfigs[0]).toMatchObject({
            kp: 180,
            equalizerRole: 'S',
            attenuationMode: 'fixed',
            attenuationDb: 3.5,
        })
        expect(detailedResult.systemConfig.equalizerCount).toBe(1)
        expect(detailedResult.systemConfig.totalEqualizerLoss).toBeCloseTo(3.5, 6)
        expect(detailedResult.performanceData.positionNames).toContain('F-ATT-S-1')
        expect(detailedResult.costData.equalizerCost).toBeGreaterThan(0)
        expect(detailedResult.costData.totalCost).toBe(
            detailedResult.costData.cableCost +
            detailedResult.costData.amplifierCost +
            detailedResult.costData.buCost +
            detailedResult.costData.equalizerCost
        )
    })
})
