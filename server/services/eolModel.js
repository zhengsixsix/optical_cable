/**
 * EOL (End of Life) 老化余量模型
 *
 * 估算海底系统在寿命周期内的额外损耗与余量需求。
 */

export const DEFAULT_AGING_PARAMS = {
    designLifeYears: 25,
    fiberAgingPerKm: 0.02,
    amplifierNfDegradation: 0.5,
    amplifierGainDegradation: 0.3,
    spliceAgingPerJoint: 0.01,
    splicesPerSpan: 2,
    connectorAgingEach: 0.05,
    repairSpliceMargin: 0.3,
    temperatureMargin: 0.1,
    nonlinearMargin: 0.2,
}

/**
 * 计算 EOL 老化导致的 GSNR/OSNR 退化。
 *
 * @param {Object} params
 * @param {number} params.totalLengthKm
 * @param {number} params.numAmplifiers
 * @param {number} params.avgSpanLengthKm
 * @param {number} [params.buCount]
 * @param {number} [params.equalizerCount]
 * @param {Object} [params.agingParams]
 */
export function calculateEolDegradation(params) {
    const {
        totalLengthKm,
        numAmplifiers,
        avgSpanLengthKm,
        buCount = 0,
        equalizerCount = 0,
        agingParams = {},
    } = params

    const cfg = { ...DEFAULT_AGING_PARAMS, ...agingParams }
    const normalizedAmpCount = Math.max(numAmplifiers, 1)
    const connectorCount = buCount + equalizerCount

    const fiberAgingLoss_dB = cfg.fiberAgingPerKm * totalLengthKm
    const ampNfDegradation_dB = cfg.amplifierNfDegradation
    const totalSplices = numAmplifiers * cfg.splicesPerSpan
    const spliceAgingLoss_dB = totalSplices * cfg.spliceAgingPerJoint
    const connectorAgingLoss_dB = connectorCount * 2 * cfg.connectorAgingEach
    const repairLoss_dB = cfg.repairSpliceMargin
    const envMargin_dB = cfg.temperatureMargin + cfg.nonlinearMargin

    const perSpanExtraLoss = fiberAgingLoss_dB / normalizedAmpCount
    const osnrDegradation_dB = perSpanExtraLoss + ampNfDegradation_dB

    const gsnrFactor = 0.85
    const gsnrDegradation_dB = osnrDegradation_dB * gsnrFactor

    const totalPenalty_dB = gsnrDegradation_dB
        + spliceAgingLoss_dB / normalizedAmpCount
        + connectorAgingLoss_dB / normalizedAmpCount
        + repairLoss_dB / normalizedAmpCount
        + envMargin_dB

    return {
        designLifeYears: cfg.designLifeYears,
        osnrDegradation_dB: parseFloat(osnrDegradation_dB.toFixed(2)),
        gsnrDegradation_dB: parseFloat(gsnrDegradation_dB.toFixed(2)),
        totalPenalty_dB: parseFloat(totalPenalty_dB.toFixed(2)),
        breakdown: {
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
                description: `${buCount} BU + ${equalizerCount} EQ × 2 × ${cfg.connectorAgingEach} dB`,
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
        },
    }
}

/**
 * 为详细仿真结果补充 BOL/EOL 对比数据。
 *
 * @param {Object} detailedResult
 * @param {Object} simInput
 * @returns {Object}
 */
export function addEolMarginToResult(detailedResult, simInput) {
    const {
        totalLengthKm,
        buConfigs = [],
        equalizerConfigs = [],
    } = simInput

    const numAmps = detailedResult.systemConfig?.amplifierCount || 0
    const avgSpan = detailedResult.systemConfig?.avgSpanLength || 70

    const eolDeg = calculateEolDegradation({
        totalLengthKm,
        numAmplifiers: numAmps,
        avgSpanLengthKm: avgSpan,
        buCount: buConfigs.length,
        equalizerCount: equalizerConfigs.length,
    })

    const bolGsnr = detailedResult.metrics?.gsnr || { min: 0, avg: 0, max: 0 }
    const bolOsnr = detailedResult.metrics?.osnr || { min: 0, avg: 0, max: 0 }

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

    const targetGsnr = detailedResult.margin?.targetOsnr
        ? detailedResult.margin.targetOsnr - 2
        : simInput.constraints?.targetGSNR || 14.0
    const eolMeetsTarget = eolGsnr.min >= targetGsnr

    const eolGsnrSpectrum = (detailedResult.performanceData?.endGsnrSpectrum || [])
        .map(value => parseFloat((value - eolDeg.totalPenalty_dB).toFixed(2)))
    const eolOsnrSpectrum = (detailedResult.performanceData?.endOsnrSpectrum || [])
        .map(value => parseFloat((value - eolDeg.osnrDegradation_dB).toFixed(2)))

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
