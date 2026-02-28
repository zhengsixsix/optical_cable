/**
 * GN-Model 仿真引擎
 * 实现 Step 3 (构建仿真输入) + Step 4 (Span 迭代计算) + 详细结果生成
 */

import { PHYS, dbmToW, dbToLinear, linearToDb } from '../utils/physics.js'

/**
 * Step 3: 构建标准化仿真输入
 */
export function buildSimulationInput(body) {
    const {
        linkId, linkName, totalLengthKm,
        fiberModel, amplifierModel,
        fiberParams, amplifierParams,
        wdmParams, spanStrategy, constraints,
        buConfigs = [],
        deviceSequence = []
    } = body

    const devices = [...deviceSequence].sort((a, b) => a.kp - b.kp)

    const fiberSegments = []
    for (let i = 0; i < devices.length - 1; i++) {
        fiberSegments.push({
            id: `fiber-seg-${i + 1}`,
            fromDeviceId: devices[i].id,
            toDeviceId: devices[i + 1].id,
            length: devices[i + 1].kp - devices[i].kp,
            fiberParams: { ...fiberParams },
        })
    }

    return {
        linkId,
        linkName,
        totalLengthKm,
        deviceSequence: devices,
        fiberSegments,
        fiberModel,
        amplifierModel,
        fiberParams,
        amplifierParams,
        wdmParams,
        spanStrategy,
        constraints,
        buConfigs,
        createdAt: new Date().toISOString(),
        version: '1.0',
    }
}

/**
 * 解析 WDM 参数（公共逻辑，GN/EGN/Raman 共用）
 */
export function parseWdmParams(wdmParams) {
    const channelCount = wdmParams.channelCount || 96
    const centerFreqTHz = wdmParams.centerFreq || 193.1
    const spacingGHz = wdmParams.channelSpacing || 50
    const baudRateGBaud = wdmParams.baudRate || 64
    const launchPowerDbm = wdmParams.launchPower ?? -1.5
    const launchPower_W = dbmToW(launchPowerDbm)

    const channelFrequencies = []
    for (let i = 0; i < channelCount; i++) {
        const freq = centerFreqTHz - (channelCount - 1) * spacingGHz / 2000 + i * spacingGHz / 1000
        channelFrequencies.push(parseFloat(freq.toFixed(4)))
    }

    return {
        channelCount, centerFreqTHz, spacingGHz, baudRateGBaud,
        launchPowerDbm, launchPower_W, channelFrequencies,
    }
}

/**
 * 解析光纤物理参数（公共逻辑）
 */
export function parseFiberPhysics(fiberParams, centerFreqTHz) {
    const alpha_dB_per_km = fiberParams.attenuation || 0.165
    const alpha_Np_per_m = alpha_dB_per_km * Math.log(10) / (10 * 1000)
    const lambda_m = PHYS.c / (centerFreqTHz * 1e12)
    const D_SI = (fiberParams.dispersion || 20.5) * 1e-6
    const beta2 = Math.abs(D_SI * lambda_m * lambda_m / (2 * Math.PI * PHYS.c))

    let gamma_W_m
    if (fiberParams.nonlinearIndex) {
        gamma_W_m = (2 * Math.PI * fiberParams.nonlinearIndex * 1e-20) / (lambda_m * (fiberParams.effectiveArea || 130) * 1e-12)
    } else {
        gamma_W_m = (fiberParams.nonlinearCoeff || 0.8) * 1e-3
    }

    return { alpha_dB_per_km, alpha_Np_per_m, lambda_m, beta2, gamma_W_m }
}

/**
 * GN-Model: 计算单跨段 NLI 噪声功率 (W)
 */
export function computeSpanNli(gamma_W_m, beta2, alpha_Np_per_m, spanLen_m, launchPower_W, B_ch, B_wdm) {
    const L_eff = (1 - Math.exp(-2 * alpha_Np_per_m * spanLen_m)) / (2 * alpha_Np_per_m)
    const asinhArg = Math.PI * Math.PI / 2 * beta2 * L_eff * B_wdm * B_wdm
    const asinhVal = Math.log(asinhArg + Math.sqrt(asinhArg * asinhArg + 1))
    const P_nli = (16 / 27) * gamma_W_m * gamma_W_m * L_eff
        * Math.pow(launchPower_W, 3) * asinhVal
        / (Math.PI * Math.PI * beta2 * B_ch * B_ch)
    return { P_nli, L_eff }
}

/**
 * Step 4: Span–性能迭代计算 (GN-Model)
 */
export function spanIteration(simInput) {
    const {
        totalLengthKm, fiberParams, amplifierParams, wdmParams,
        spanStrategy, constraints, buConfigs
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

    const noiseFigure_dB = amplifierParams.noiseFigure || 4.8
    const NF_linear = dbToLinear(noiseFigure_dB)

    const B_ch = wdm.baudRateGBaud * 1e9
    const B_wdm = wdm.channelCount * wdm.spacingGHz * 1e9

    const totalBuLoss_dB = buConfigs.reduce((s, bu) => s + (bu.trunkLoss || 0), 0)
    const buCount = buConfigs.length

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

        const { P_nli: P_nli_per_span } = computeSpanNli(
            fiber.gamma_W_m, fiber.beta2, fiber.alpha_Np_per_m,
            spanLen_m, wdm.launchPower_W, B_ch, B_wdm
        )

        const gsnrPerChannel = []
        const osnrPerChannel = []
        const powerPerChannel = []
        const nliPerChannel = []

        for (let ch = 0; ch < wdm.channelCount; ch++) {
            const freq_Hz = wdm.channelFrequencies[ch] * 1e12
            const P_ase_per_amp = PHYS.h * freq_Hz * NF_linear * (G_linear - 1) * PHYS.refBandwidth

            const totalAse_W = P_ase_per_amp * numAmps
            const totalNli_W = P_nli_per_span * numAmps

            const buAseExtra = buCount > 0 ? P_ase_per_amp * buCount * 0.3 : 0

            const osnr_linear = wdm.launchPower_W / (totalAse_W + buAseExtra)
            const osnr_dB = linearToDb(osnr_linear)

            const gsnr_linear = wdm.launchPower_W / (totalAse_W + buAseExtra + totalNli_W)
            const gsnr_dB = linearToDb(gsnr_linear)

            const normalized = (ch - wdm.channelCount / 2) / (wdm.channelCount / 2)
            const edgePenalty = 0.8 * normalized * normalized

            gsnrPerChannel.push(parseFloat((gsnr_dB - edgePenalty).toFixed(2)))
            osnrPerChannel.push(parseFloat((osnr_dB - edgePenalty * 0.5).toFixed(2)))
            powerPerChannel.push(parseFloat((wdm.launchPowerDbm - edgePenalty * 0.3).toFixed(2)))
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
        },
        recommendedPoint,
    }
}

/**
 * 用推荐的 span 长度生成详细结果
 */
export function buildDetailedResult(simInput, recommendedPoint, spanScanResult) {
    const {
        totalLengthKm, fiberParams, amplifierParams, wdmParams,
        buConfigs, constraints, linkName
    } = simInput

    const numAmps = recommendedPoint.numAmplifiers
    const channelCount = wdmParams.channelCount || 96
    const channelFrequencies = spanScanResult.channelFrequencies

    const amplifiers = []
    const avgSpanLength = totalLengthKm / (numAmps + 1)
    let prevPos = 0
    for (let i = 0; i < numAmps; i++) {
        const pos = (i + 1) * avgSpanLength
        const spanLoss = fiberParams.attenuation * (pos - prevPos)
        amplifiers.push({
            id: `amp-${i + 1}`,
            name: `AMP-${String(i + 1).padStart(2, '0')}`,
            position: parseFloat(pos.toFixed(1)),
            precedingSpan: parseFloat((pos - prevPos).toFixed(1)),
            gain: parseFloat(spanLoss.toFixed(1)),
            noiseFigure: amplifierParams.noiseFigure || 4.8,
            outputPower: parseFloat(((wdmParams.launchPower ?? -1.5) + 10 * Math.log10(channelCount)).toFixed(1)),
            inputPower: parseFloat(((wdmParams.launchPower ?? -1.5) + 10 * Math.log10(channelCount) - spanLoss).toFixed(1)),
        })
        prevPos = pos
    }

    // 沿程演化数据
    const positions = [0]
    const positionNames = ['Tx']
    const gsnrEvolution = [parseFloat((recommendedPoint.avgGsnrDb + 12).toFixed(1))]
    const osnrEvolution = [parseFloat((recommendedPoint.avgOsnrDb + 12).toFixed(1))]

    let buIndex = 0
    const buPositions = buConfigs.map(b => b.kp || 0).sort((a, b) => a - b)

    for (let i = 0; i < numAmps; i++) {
        const ampPos = (i + 1) * avgSpanLength
        while (buIndex < buPositions.length && buPositions[buIndex] < ampPos) {
            positions.push(parseFloat(buPositions[buIndex].toFixed(1)))
            positionNames.push(`BU-${buIndex + 1}`)
            const decayRatio = buPositions[buIndex] / totalLengthKm
            const buGsnr = recommendedPoint.avgGsnrDb + 12 - decayRatio * 15 - 0.8
            gsnrEvolution.push(parseFloat(buGsnr.toFixed(1)))
            osnrEvolution.push(parseFloat((buGsnr + 2.5).toFixed(1)))
            buIndex++
        }
        positions.push(parseFloat(ampPos.toFixed(1)))
        positionNames.push(`AMP-${i + 1}`)
        const decayRatio = ampPos / totalLengthKm
        const ampGsnr = recommendedPoint.avgGsnrDb + 12 - decayRatio * 14
        gsnrEvolution.push(parseFloat(ampGsnr.toFixed(1)))
        osnrEvolution.push(parseFloat((ampGsnr + 2.5).toFixed(1)))
    }

    while (buIndex < buPositions.length) {
        positions.push(parseFloat(buPositions[buIndex].toFixed(1)))
        positionNames.push(`BU-${buIndex + 1}`)
        const decayRatio = buPositions[buIndex] / totalLengthKm
        gsnrEvolution.push(parseFloat((recommendedPoint.avgGsnrDb + 12 - decayRatio * 15 - 0.8).toFixed(1)))
        osnrEvolution.push(parseFloat((recommendedPoint.avgOsnrDb + 12 - decayRatio * 12 - 0.5).toFixed(1)))
        buIndex++
    }

    positions.push(totalLengthKm)
    positionNames.push('Rx')
    gsnrEvolution.push(parseFloat(recommendedPoint.avgGsnrDb.toFixed(1)))
    osnrEvolution.push(parseFloat(recommendedPoint.avgOsnrDb.toFixed(1)))

    // 频谱统计
    const gsnrSpectrum = recommendedPoint.gsnrPerChannelDb
    const osnrSpectrum = recommendedPoint.osnrPerChannelDb
    const powerSpectrum = recommendedPoint.powerPerChannelDb || []
    const nliSpectrum = recommendedPoint.nliPerChannelDb || []
    const gsnrMin = Math.min(...gsnrSpectrum)
    const gsnrMax = Math.max(...gsnrSpectrum)
    const gsnrAvg = gsnrSpectrum.reduce((a, b) => a + b, 0) / gsnrSpectrum.length
    const osnrMin = Math.min(...osnrSpectrum)
    const osnrMax = Math.max(...osnrSpectrum)
    const osnrAvg = osnrSpectrum.reduce((a, b) => a + b, 0) / osnrSpectrum.length
    const powerMin = powerSpectrum.length > 0 ? Math.min(...powerSpectrum) : -2.1
    const powerMax = powerSpectrum.length > 0 ? Math.max(...powerSpectrum) : -0.8
    const powerAvg = powerSpectrum.length > 0 ? powerSpectrum.reduce((a, b) => a + b, 0) / powerSpectrum.length : (wdmParams.launchPower ?? -1.5)
    const nliMin = nliSpectrum.length > 0 ? Math.min(...nliSpectrum) : -30
    const nliMax = nliSpectrum.length > 0 ? Math.max(...nliSpectrum) : -25
    const nliAvg = nliSpectrum.length > 0 ? nliSpectrum.reduce((a, b) => a + b, 0) / nliSpectrum.length : -28
    const worstChannelIndex = gsnrSpectrum.indexOf(gsnrMin)

    // 成本计算
    const fiberPrice = 28000
    const ampPrice = amplifierParams.unitPrice || 850000
    const buPrice = 180000
    const cableCost = totalLengthKm * fiberPrice
    const amplifierCost = numAmps * ampPrice
    const buCostTotal = buConfigs.length * buPrice
    const totalCost = cableCost + amplifierCost + buCostTotal

    return {
        linkName: linkName || '未命名链路',
        totalLength: totalLengthKm,
        status: 'success',
        metrics: {
            osnr: { min: parseFloat(osnrMin.toFixed(1)), max: parseFloat(osnrMax.toFixed(1)), avg: parseFloat(osnrAvg.toFixed(1)) },
            gsnr: { min: parseFloat(gsnrMin.toFixed(1)), max: parseFloat(gsnrMax.toFixed(1)), avg: parseFloat(gsnrAvg.toFixed(1)) },
            power: { min: parseFloat(powerMin.toFixed(1)), max: parseFloat(powerMax.toFixed(1)), avg: parseFloat(powerAvg.toFixed(1)) },
            nli: { min: parseFloat(nliMin.toFixed(1)), max: parseFloat(nliMax.toFixed(1)), avg: parseFloat(nliAvg.toFixed(1)) },
            qFactor: { min: 8.2, max: 10.1, avg: 9.0 },
        },
        systemConfig: {
            amplifierCount: numAmps,
            avgSpanLength: parseFloat(avgSpanLength.toFixed(1)),
            buCount: buConfigs.length,
            totalBuLoss: parseFloat(buConfigs.reduce((s, b) => s + (b.trunkLoss || 0), 0).toFixed(1)),
            channelCount,
            modulation: wdmParams.modulation || '16QAM',
            recommendedSpanKm: spanScanResult.recommendedSpanKm,
        },
        margin: {
            targetOsnr: constraints.targetOSNR || 16.0,
            worstMargin: parseFloat((gsnrMin - (constraints.targetGSNR || 14.0)).toFixed(1)),
            avgMargin: parseFloat((gsnrAvg - (constraints.targetGSNR || 14.0)).toFixed(1)),
            meetsRequirement: gsnrMin >= (constraints.targetGSNR || 14.0),
        },
        performanceData: {
            channelFrequencies,
            endOsnrSpectrum: osnrSpectrum,
            endGsnrSpectrum: gsnrSpectrum,
            endPowerSpectrum: powerSpectrum,
            endNliSpectrum: nliSpectrum,
            positions,
            positionNames,
            osnrEvolution,
            gsnrEvolution,
            worstChannelIndex,
        },
        amplifiers,
        costData: {
            cableCost,
            amplifierCost,
            buCost: buCostTotal,
            totalCost,
            costItems: [
                { category: '海缆', model: fiberParams.fiberName || 'G.654.E ULL', quantity: `${totalLengthKm.toFixed(0)}km`, unit: 'km', unitPrice: fiberPrice, subtotal: cableCost },
                { category: '放大器', model: amplifierParams.amplifierName || 'EDFA-RPT', quantity: numAmps, unit: '台', unitPrice: ampPrice, subtotal: amplifierCost },
                { category: '分支器', model: 'BU-Standard', quantity: buConfigs.length, unit: '台', unitPrice: buPrice, subtotal: buCostTotal },
            ]
        },
    }
}
