/**
 * EOL (End of Life) 老化余量模型
 *
 * 计算海缆系统 25 年生命周期内的性能退化:
 *   1. 光纤老化: 衰减增加 ~0.02 dB/km (ITU-T G.652)
 *   2. 放大器老化: NF 增加 ~0.5 dB, 增益降低 ~0.3 dB
 *   3. 接头老化: 每个接头增加 ~0.01 dB
 *   4. 连接器老化: 每个连接器增加 ~0.05 dB
 *
 * 参考: ITU-T G.977, Submarine System Reliability
 */

import { linearToDb, dbToLinear } from '../utils/physics.js'

// ── 默认老化参数 ──
export const DEFAULT_AGING_PARAMS = {
    /** 设计寿命 (年) */
    designLifeYears: 25,
    /** 光纤衰减增加 (dB/km), 25年 */
    fiberAgingPerKm: 0.02,
    /** 放大器 NF 增加 (dB), 25年 */
    amplifierNfDegradation: 0.5,
    /** 放大器增益下降 (dB), 25年 */
    amplifierGainDegradation: 0.3,
    /** 接头老化增加 (dB/个), 每跨段约2个工厂接头 */
    spliceAgingPerJoint: 0.01,
    /** 每跨段工厂接头数 */
    splicesPerSpan: 2,
    /** 连接器老化 (dB/个), BU/OADM 连接器 */
    connectorAgingEach: 0.05,
    /** 维修接头余量 (dB), 25年预计2-3次维修 */
    repairSpliceMargin: 0.3,
    /** 温度变化余量 (dB), 海底温度相对稳定 */
    temperatureMargin: 0.1,
    /** 非线性余量 (dB), 老化导致色散补偿偏移 */
    nonlinearMargin: 0.2,
}

/**
 * 计算 EOL 老化导致的总 GSNR/OSNR 退化 (dB)
 *
 * @param {Object} params
 * @param {number} params.totalLengthKm - 链路总长度 (km)
 * @param {number} params.numAmplifiers - 放大器数量
 * @param {number} params.avgSpanLengthKm - 平均跨段长度 (km)
 * @param {number} params.buCount - 分支器数量
 * @param {Object} [params.agingParams] - 自定义老化参数
 * @returns {Object} BOL/EOL 退化详情
 */
export function calculateEolDegradation(params) {
    const {
        totalLengthKm,
        numAmplifiers,
        avgSpanLengthKm,
        buCount = 0,
        agingParams = {},
    } = params

    const cfg = { ...DEFAULT_AGING_PARAMS, ...agingParams }

    // 1. 光纤老化: 总衰减增加
    const fiberAgingLoss_dB = cfg.fiberAgingPerKm * totalLengthKm
    
    // 2. 放大器 NF 退化 → OSNR 退化
    //    ΔNF (dB) 在级联放大器中线性叠加到等效 NF
    const ampNfDegradation_dB = cfg.amplifierNfDegradation
    
    // 3. 接头老化: 工厂接头 + 维修接头
    const totalSplices = numAmplifiers * cfg.splicesPerSpan
    const spliceAgingLoss_dB = totalSplices * cfg.spliceAgingPerJoint
    
    // 4. 连接器老化 (BU/OADM)
    const connectorAgingLoss_dB = buCount * 2 * cfg.connectorAgingEach  // 每个 BU 有 2 个连接器
    
    // 5. 维修接头余量
    const repairLoss_dB = cfg.repairSpliceMargin
    
    // 6. 环境余量
    const envMargin_dB = cfg.temperatureMargin + cfg.nonlinearMargin

    // ── OSNR 退化 ──
    // 光纤衰减增加 → 每跨段损耗增加 → EDFA 增益不变时 OSNR 下降
    const perSpanExtraLoss = fiberAgingLoss_dB / numAmplifiers  // 分摊到每个跨段
    // OSNR 退化 ≈ 额外损耗 + NF退化 (对级联放大器, 近似线性 dB 叠加)
    const osnrDegradation_dB = perSpanExtraLoss + ampNfDegradation_dB

    // ── 总 GSNR 退化 (包含 NLI 变化) ──
    // NLI 噪声几乎不受老化影响 (非线性系数不变)
    // 但 OSNR 退化会间接拉低 GSNR
    // GSNR = 1/(1/SNR_ASE + 1/SNR_NLI)
    // ΔGSNR ≈ ΔOSNR × f(SNR_NLI/OSNR) ≈ 0.85 × ΔOSNR (典型值)
    const gsnrFactor = 0.85
    const gsnrDegradation_dB = osnrDegradation_dB * gsnrFactor

    // ── 总系统余量 ──
    const totalPenalty_dB = gsnrDegradation_dB + spliceAgingLoss_dB / numAmplifiers
        + connectorAgingLoss_dB / Math.max(numAmplifiers, 1)
        + repairLoss_dB / Math.max(numAmplifiers, 1)
        + envMargin_dB

    // 分项明细
    const breakdown = {
        fiberAging: {
            label: '光纤衰减老化',
            value_dB: parseFloat(fiberAgingLoss_dB.toFixed(2)),
            description: `${cfg.fiberAgingPerKm} dB/km × ${totalLengthKm.toFixed(0)} km`,
        },
        amplifierNf: {
            label: '放大器 NF 退化',
            value_dB: parseFloat(ampNfDegradation_dB.toFixed(2)),
            description: `${cfg.amplifierNfDegradation} dB / ${cfg.designLifeYears}年`,
        },
        spliceAging: {
            label: '接头老化',
            value_dB: parseFloat(spliceAgingLoss_dB.toFixed(2)),
            description: `${totalSplices} 个接头 × ${cfg.spliceAgingPerJoint} dB`,
        },
        connectorAging: {
            label: '连接器老化',
            value_dB: parseFloat(connectorAgingLoss_dB.toFixed(2)),
            description: `${buCount} BU × 2 × ${cfg.connectorAgingEach} dB`,
        },
        repairMargin: {
            label: '维修接头余量',
            value_dB: parseFloat(repairLoss_dB.toFixed(2)),
            description: `${cfg.designLifeYears}年内 2-3 次维修`,
        },
        environmentMargin: {
            label: '环境余量',
            value_dB: parseFloat(envMargin_dB.toFixed(2)),
            description: '温度 + 非线性偏移',
        },
    }

    return {
        /** 设计寿命 */
        designLifeYears: cfg.designLifeYears,
        /** OSNR 退化 (dB) */
        osnrDegradation_dB: parseFloat(osnrDegradation_dB.toFixed(2)),
        /** GSNR 退化 (dB) */
        gsnrDegradation_dB: parseFloat(gsnrDegradation_dB.toFixed(2)),
        /** 总系统余量需求 (dB) */
        totalPenalty_dB: parseFloat(totalPenalty_dB.toFixed(2)),
        /** 分项明细 */
        breakdown,
    }
}

/**
 * 为仿真详细结果添加 BOL/EOL 对比数据
 *
 * @param {Object} detailedResult - 来自 gnModel/egnModel/ramanModel 的详细结果
 * @param {Object} simInput - 仿真输入参数
 * @returns {Object} 增强后的详细结果 (含 eolMargin 字段)
 */
export function addEolMarginToResult(detailedResult, simInput) {
    const {
        totalLengthKm,
        buConfigs = [],
    } = simInput

    const numAmps = detailedResult.systemConfig?.amplifierCount || 0
    const avgSpan = detailedResult.systemConfig?.avgSpanLength || 70

    const eolDeg = calculateEolDegradation({
        totalLengthKm,
        numAmplifiers: numAmps,
        avgSpanLengthKm: avgSpan,
        buCount: buConfigs.length,
    })

    // BOL 值 = 当前仿真结果
    const bolGsnr = detailedResult.metrics?.gsnr || { min: 0, avg: 0, max: 0 }
    const bolOsnr = detailedResult.metrics?.osnr || { min: 0, avg: 0, max: 0 }

    // EOL 值 = BOL - 退化
    const eolGsnr = {
        min: parseFloat((bolGsnr.min - eolDeg.totalPenalty_dB).toFixed(1)),
        avg: parseFloat((bolGsnr.avg - eolDeg.totalPenalty_dB).toFixed(1)),
        max: parseFloat((bolGsnr.max - eolDeg.totalPenalty_dB).toFixed(1)),
    }
    const eolOsnr = {
        min: parseFloat((bolOsnr.min - eolDeg.osnrDegradation_dB).toFixed(1)),
        avg: parseFloat((bolOsnr.avg - eolDeg.osnrDegradation_dB).toFixed(1)),
        max: parseFloat((bolOsnr.max - eolDeg.osnrDegradation_dB).toFixed(1)),
    }

    // EOL 是否仍满足目标
    const targetGsnr = detailedResult.margin?.targetOsnr
        ? detailedResult.margin.targetOsnr - 2  // 近似 GSNR target
        : simInput.constraints?.targetGSNR || 14.0
    const eolMeetsTarget = eolGsnr.min >= targetGsnr

    // EOL 频谱退化
    const eolGsnrSpectrum = (detailedResult.performanceData?.endGsnrSpectrum || [])
        .map(v => parseFloat((v - eolDeg.totalPenalty_dB).toFixed(2)))
    const eolOsnrSpectrum = (detailedResult.performanceData?.endOsnrSpectrum || [])
        .map(v => parseFloat((v - eolDeg.osnrDegradation_dB).toFixed(2)))

    // 注入 eolMargin 字段
    detailedResult.eolMargin = {
        designLifeYears: eolDeg.designLifeYears,
        degradation: eolDeg,
        bol: {
            gsnr: bolGsnr,
            osnr: bolOsnr,
        },
        eol: {
            gsnr: eolGsnr,
            osnr: eolOsnr,
        },
        eolGsnrSpectrum,
        eolOsnrSpectrum,
        eolMeetsTarget,
        eolGsnrMargin_dB: parseFloat((eolGsnr.min - targetGsnr).toFixed(1)),
        targetGsnr_dB: targetGsnr,
    }

    return detailedResult
}
