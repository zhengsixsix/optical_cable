/**
 * 光学性能仿真服务
 * 实现 GSNR/OSNR 计算、链路预算分析
 * 
 * 核心算法：
 * OSNR = 58 - NF - 10*log10(n) - L - α*Lspan
 * GSNR = 1/(1/OSNR + PNLI/Psig)
 */

import {
  type FiberParams,
  type AmplifierParams,
  type WDMSystemParams,
  type FiberSpan,
  type OpticalLink,
  type SpanSimulationResult,
  type LinkSimulationResult,
  type LinkBudget,
  type LinkBudgetItem,
  type BottleneckAnalysis,
  type SimulationModel,
  type SpanScanResult,
  type SpanScanPoint,
  type DetailedSimulationResult,
  type ChannelEvolution,
  PHYSICAL_CONSTANTS,
  DEFAULT_FIBER_PARAMS,
  DEFAULT_AMPLIFIER_PARAMS,
  MODULATION_PARAMS,
} from '@/types/simulation'
import type { SpanScanConfig } from '@/types/systemPlanning'

/**
 * 光学性能仿真服务
 */
export class OpticalSimulationService {
  private model: SimulationModel = 'GN'

  /**
   * 设置仿真模型
   */
  setModel(model: SimulationModel): void {
    this.model = model
  }

  /**
   * 计算单跨段OSNR (dB)
   * OSNR = 58 - NF - 10*log10(n) - L - α*Lspan
   * 
   * @param noiseFigure - 噪声系数 NF (dB)
   * @param spanCount - 跨段数量 n
   * @param totalLoss - 总损耗 L (dB)
   * @param attenuation - 衰减系数 α (dB/km)
   * @param spanLength - 跨段长度 Lspan (km)
   */
  calculateOSNR(
    noiseFigure: number,
    spanCount: number,
    totalLoss: number,
    attenuation: number,
    spanLength: number
  ): number {
    const osnr = 58 - noiseFigure - 10 * Math.log10(spanCount) - totalLoss - attenuation * spanLength
    return osnr
  }

  /**
   * 计算累计OSNR（考虑多个跨段级联）
   * OSNR_total = -10*log10(Σ10^(-OSNR_i/10))
   */
  calculateCumulativeOSNR(spanOSNRs: number[]): number {
    const sumLinear = spanOSNRs.reduce((sum, osnr) => sum + Math.pow(10, -osnr / 10), 0)
    return -10 * Math.log10(sumLinear)
  }

  /**
   * 计算NLI噪声功率 (GN模型)
   * P_NLI = γ² * P³ * L_eff² * G_NLI * B_WDM
   * 
   * @param fiber - 光纤参数
   * @param launchPower - 发射功率 (mW)
   * @param spanLength - 跨段长度 (km)
   * @param channelCount - 波道数量
   * @param channelSpacing - 信道间隔 (GHz)
   */
  calculateNLIPower(
    fiber: FiberParams,
    launchPower: number,
    spanLength: number,
    channelCount: number,
    channelSpacing: number
  ): number {
    // 有效长度 L_eff = (1 - exp(-α*L)) / α
    const alphaLinear = fiber.attenuation / (10 * Math.log10(Math.E)) // 转换为 1/km
    const Leff = (1 - Math.exp(-alphaLinear * spanLength)) / alphaLinear

    // WDM带宽 (Hz)
    const Bwdm = channelCount * channelSpacing * 1e9

    // GN模型简化计算
    const gamma = fiber.nonlinearCoeff // 1/W/km
    const Psig = launchPower * 1e-3 // W

    // NLI系数 (简化公式)
    const Gnli = (8 / 27) * Math.pow(gamma, 2) * Math.pow(Leff * 1e3, 2) * 
                 Math.log(Math.PI * Math.PI * Math.abs(fiber.dispersion) * Bwdm * Bwdm / (2 * alphaLinear))

    const Pnli = Gnli * Math.pow(Psig, 3) * Bwdm
    return 10 * Math.log10(Pnli * 1e3) // dBm
  }

  /**
   * 计算GSNR (考虑ASE噪声和NLI噪声)
   * GSNR = 1/(1/OSNR + P_NLI/P_sig)
   * 
   * @param osnr - OSNR (dB)
   * @param nliPower - NLI噪声功率 (dBm)
   * @param signalPower - 信号功率 (dBm)
   */
  calculateGSNR(osnr: number, nliPower: number, signalPower: number): number {
    const osnrLinear = Math.pow(10, osnr / 10)
    const nliRatio = Math.pow(10, (nliPower - signalPower) / 10)
    const gsnrLinear = 1 / (1 / osnrLinear + nliRatio)
    return 10 * Math.log10(gsnrLinear)
  }

  /**
   * 计算跨段损耗
   */
  calculateSpanLoss(span: FiberSpan): number {
    return span.fiber.attenuation * span.length + span.connectorLoss + span.margin
  }

  /**
   * 仿真单个跨段
   */
  simulateSpan(
    span: FiberSpan,
    wdmParams: WDMSystemParams,
    amplifier: AmplifierParams,
    previousResult?: SpanSimulationResult
  ): SpanSimulationResult {
    const spanLoss = this.calculateSpanLoss(span)
    
    // 信号功率（考虑放大器增益和跨段损耗）
    const signalPower = previousResult 
      ? previousResult.signalPower + amplifier.gain - spanLoss
      : wdmParams.launchPowerPerChannel - spanLoss

    // 计算本跨段的OSNR贡献
    const spanOSNR = this.calculateOSNR(
      amplifier.noiseFigure,
      span.index,
      spanLoss,
      span.fiber.attenuation,
      span.length
    )

    // ASE噪声功率累计
    const aseNoisePower = previousResult
      ? 10 * Math.log10(Math.pow(10, previousResult.aseNoisePower / 10) + 
          Math.pow(10, (wdmParams.launchPowerPerChannel - spanOSNR) / 10))
      : wdmParams.launchPowerPerChannel - spanOSNR

    // NLI噪声功率
    const nliPower = this.calculateNLIPower(
      span.fiber,
      Math.pow(10, wdmParams.launchPowerPerChannel / 10),
      span.length,
      wdmParams.channelCount,
      wdmParams.channelSpacing
    )

    // 累计NLI
    const nliNoisePower = previousResult
      ? 10 * Math.log10(Math.pow(10, previousResult.nliNoisePower / 10) + Math.pow(10, nliPower / 10))
      : nliPower

    // 累计OSNR
    const cumulativeOSNR = previousResult
      ? this.calculateCumulativeOSNR([spanOSNR, previousResult.osnr])
      : spanOSNR

    // 计算GSNR
    const gsnr = this.calculateGSNR(cumulativeOSNR, nliNoisePower, signalPower)

    // 获取调制格式所需GSNR
    const requiredGSNR = MODULATION_PARAMS[wdmParams.modulationFormat]?.requiredGSNR || 12

    return {
      spanId: span.id,
      index: span.index,
      kpStart: previousResult ? previousResult.kpEnd : 0,
      kpEnd: (previousResult ? previousResult.kpEnd : 0) + span.length,
      length: span.length,
      spanLoss,
      aseNoisePower,
      nliNoisePower,
      osnr: cumulativeOSNR,
      gsnr,
      gsnrMargin: gsnr - requiredGSNR,
      signalPower,
    }
  }

  /**
   * 仿真完整链路
   */
  simulateLink(link: OpticalLink, amplifier: AmplifierParams = DEFAULT_AMPLIFIER_PARAMS): LinkSimulationResult {
    const spanResults: SpanSimulationResult[] = []
    let previousResult: SpanSimulationResult | undefined

    // 逐跨段仿真
    for (const span of link.spans) {
      const result = this.simulateSpan(span, link.wdmParams, amplifier, previousResult)
      spanResults.push(result)
      previousResult = result
    }

    // 获取最终结果
    const finalResult = spanResults[spanResults.length - 1]
    const requiredGSNR = MODULATION_PARAMS[link.wdmParams.modulationFormat]?.requiredGSNR || 12

    // 找到最差跨段
    const worstSpan = spanResults.reduce((worst, current) => 
      current.gsnrMargin < worst.gsnrMargin ? current : worst
    )

    // 瓶颈分析
    const bottleneckAnalysis = this.analyzeBottleneck(finalResult, requiredGSNR)

    // Q因子估算 Q ≈ sqrt(2) * sqrt(10^(GSNR/10))
    const qFactor = 10 * Math.log10(Math.sqrt(2) * Math.sqrt(Math.pow(10, finalResult.gsnr / 10)))

    // BER估算 BER ≈ 0.5 * erfc(Q/sqrt(2))
    const estimatedBER = 0.5 * this.erfc(Math.pow(10, qFactor / 20) / Math.sqrt(2))

    return {
      linkId: link.id,
      simulatedAt: new Date(),
      model: this.model,
      spanResults,
      endToEndOSNR: finalResult.osnr,
      endToEndGSNR: finalResult.gsnr,
      gsnrMargin: finalResult.gsnrMargin,
      isFeasible: finalResult.gsnrMargin > 0,
      worstSpanId: worstSpan.spanId,
      bottleneckAnalysis,
      qFactor,
      estimatedBER,
    }
  }

  /**
   * 瓶颈分析
   */
  private analyzeBottleneck(result: SpanSimulationResult, requiredGSNR: number): BottleneckAnalysis {
    const aseContribution = Math.pow(10, -result.osnr / 10)
    const nliContribution = Math.pow(10, (result.nliNoisePower - result.signalPower) / 10)
    
    const totalNoise = aseContribution + nliContribution
    const aseRatio = aseContribution / totalNoise
    const nliRatio = nliContribution / totalNoise

    let type: 'ase' | 'nli' | 'loss' | 'none' = 'none'
    let description = ''
    const recommendations: string[] = []

    if (result.gsnrMargin < 0) {
      if (aseRatio > 0.7) {
        type = 'ase'
        description = 'ASE噪声是主要限制因素'
        recommendations.push('考虑使用更低噪声系数的放大器')
        recommendations.push('减少跨段数量或缩短跨段长度')
        recommendations.push('提高发射功率（注意NLI影响）')
      } else if (nliRatio > 0.5) {
        type = 'nli'
        description = '非线性噪声是主要限制因素'
        recommendations.push('降低发射功率')
        recommendations.push('使用大有效面积光纤')
        recommendations.push('考虑使用数字非线性补偿')
      } else {
        type = 'loss'
        description = '链路损耗过大'
        recommendations.push('优化光缆路由减少总长度')
        recommendations.push('检查连接器和接头损耗')
        recommendations.push('增加中继器数量')
      }
    } else {
      description = '系统性能满足要求'
      recommendations.push('可考虑提升调制格式以增加容量')
    }

    return { type, description, recommendations }
  }

  /**
   * 计算链路预算
   */
  calculateLinkBudget(link: OpticalLink, amplifier: AmplifierParams = DEFAULT_AMPLIFIER_PARAMS): LinkBudget {
    const items: LinkBudgetItem[] = []

    // 发射功率
    items.push({
      name: '发射功率',
      value: link.wdmParams.launchPowerPerChannel,
      type: 'gain',
      notes: '单通道发射功率',
    })

    // 各跨段损耗
    let totalFiberLoss = 0
    let totalConnectorLoss = 0
    for (const span of link.spans) {
      const fiberLoss = span.fiber.attenuation * span.length
      totalFiberLoss += fiberLoss
      totalConnectorLoss += span.connectorLoss
    }

    items.push({
      name: '光纤损耗',
      value: -totalFiberLoss,
      type: 'loss',
      notes: `总长度 ${link.totalLength} km`,
    })

    items.push({
      name: '连接器/接头损耗',
      value: -totalConnectorLoss,
      type: 'loss',
      notes: `${link.spans.length} 个跨段`,
    })

    // 放大器增益
    const amplifierCount = link.spans.length - 1
    const totalGain = amplifierCount * amplifier.gain
    items.push({
      name: '放大器增益',
      value: totalGain,
      type: 'gain',
      notes: `${amplifierCount} 个放大器`,
    })

    // 系统余量
    const systemMargin = 3 // dB
    items.push({
      name: '系统设计余量',
      value: -systemMargin,
      type: 'margin',
    })

    // 计算总值
    const totalGainValue = items.filter(i => i.type === 'gain').reduce((sum, i) => sum + i.value, 0)
    const totalLossValue = Math.abs(items.filter(i => i.type === 'loss' || i.type === 'margin').reduce((sum, i) => sum + i.value, 0))

    // 接收灵敏度
    const receiverSensitivity = -28 // dBm
    const receivedPower = link.wdmParams.launchPowerPerChannel - totalFiberLoss - totalConnectorLoss + totalGain - systemMargin
    const budgetMargin = receivedPower - receiverSensitivity

    return {
      linkId: link.id,
      transmitter: {
        launchPower: link.wdmParams.launchPowerPerChannel,
        wavelength: link.wdmParams.centerWavelength,
      },
      receiver: {
        sensitivity: receiverSensitivity,
        overloadPower: 0,
      },
      items,
      totalGain: totalGainValue,
      totalLoss: totalLossValue,
      systemMargin: budgetMargin,
      isBudgetMet: budgetMargin > 0,
    }
  }

  /**
   * 生成GSNR沿路由变化数据（用于曲线图）
   */
  generateGSNRProfile(simulationResult: LinkSimulationResult): Array<{ kp: number; gsnr: number; margin: number }> {
    const profile: Array<{ kp: number; gsnr: number; margin: number }> = []
    
    // 添加起始点
    profile.push({ kp: 0, gsnr: 30, margin: 18 }) // 假设起始GSNR

    for (const span of simulationResult.spanResults) {
      profile.push({
        kp: span.kpEnd,
        gsnr: span.gsnr,
        margin: span.gsnrMargin,
      })
    }

    return profile
  }

  /**
   * 快速估算GSNR（简化版，用于实时预览）
   */
  quickEstimateGSNR(
    totalLength: number,
    spanLength: number = 80,
    launchPower: number = 0,
    noiseFigure: number = 5,
    attenuation: number = 0.16
  ): { gsnr: number; margin: number; feasible: boolean } {
    const spanCount = Math.ceil(totalLength / spanLength)
    
    // 简化OSNR计算
    const osnr = 58 - noiseFigure - 10 * Math.log10(spanCount) - attenuation * spanLength
    
    // 简化NLI估算
    const nliPenalty = 0.5 * Math.log10(spanCount) // dB
    
    const gsnr = osnr - nliPenalty
    const requiredGSNR = 12 // DP-QPSK
    const margin = gsnr - requiredGSNR

    return {
      gsnr: Math.round(gsnr * 10) / 10,
      margin: Math.round(margin * 10) / 10,
      feasible: margin > 0,
    }
  }

  /**
   * 误差函数补函数 (用于BER计算)
   */
  private erfc(x: number): number {
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911

    const sign = x < 0 ? -1 : 1
    x = Math.abs(x)
    const t = 1.0 / (1.0 + p * x)
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
    
    return sign === 1 ? 1 - y : 1 + y
  }

  // ========== Step 6: Span 范围扫描 ==========

  /**
   * Span 范围扫描计算 (Step 6)
   * 在指定的 Span 范围内按步长迭代计算，输出各配置下的 GSNR/OSNR
   * 
   * @param totalLength - 链路总长度 (km)
   * @param scanConfig - Span 扫描配置
   * @param channelCount - 波道数量
   * @param wdmParams - WDM 系统参数
   * @param fiberParams - 光纤参数
   * @param amplifierParams - 放大器参数
   */
  spanRangeScan(
    totalLength: number,
    scanConfig: SpanScanConfig,
    channelCount: number = 96,
    wdmParams?: Partial<WDMSystemParams>,
    fiberParams: FiberParams = DEFAULT_FIBER_PARAMS,
    amplifierParams: AmplifierParams = DEFAULT_AMPLIFIER_PARAMS
  ): SpanScanResult {
    const { spanLengthMinKm, spanLengthMaxKm, spanStepKm, targetGsnrDb } = scanConfig
    
    const spanLengthsKm: number[] = []
    const gsnrPerSpanDb: number[][] = []
    const osnrPerSpanDb: number[][] = []
    const scanPoints: SpanScanPoint[] = []
    
    // 生成 Span 长度序列
    for (let spanLength = spanLengthMinKm; spanLength <= spanLengthMaxKm; spanLength += spanStepKm) {
      spanLengthsKm.push(spanLength)
    }
    
    // 对每个 Span 长度进行计算
    for (const spanLength of spanLengthsKm) {
      const spanCount = Math.ceil(totalLength / spanLength)
      
      // 计算各信道的 GSNR 和 OSNR
      const channelGsnr: number[] = []
      const channelOsnr: number[] = []
      
      for (let ch = 0; ch < channelCount; ch++) {
        // 简化计算：假设各信道特性相似，添加边缘信道惩罚
        const edgePenalty = Math.abs(ch - channelCount / 2) / (channelCount / 2) * 0.5
        
        // OSNR 计算
        const osnr = this.calculateOSNR(
          amplifierParams.noiseFigure,
          spanCount,
          fiberParams.attenuation * spanLength,
          fiberParams.attenuation,
          spanLength
        ) - edgePenalty
        
        // NLI 计算
        const launchPower = wdmParams?.launchPowerPerChannel || 0
        const nliPower = this.calculateNLIPower(
          fiberParams,
          Math.pow(10, launchPower / 10),
          spanLength,
          channelCount,
          wdmParams?.channelSpacing || 50
        )
        
        // GSNR 计算
        const gsnr = this.calculateGSNR(osnr, nliPower * spanCount, launchPower) - edgePenalty
        
        channelGsnr.push(gsnr)
        channelOsnr.push(osnr)
      }
      
      gsnrPerSpanDb.push(channelGsnr)
      osnrPerSpanDb.push(channelOsnr)
      
      // 生成扫描点结果
      const avgGsnr = channelGsnr.reduce((a, b) => a + b, 0) / channelCount
      const minGsnr = Math.min(...channelGsnr)
      const avgOsnr = channelOsnr.reduce((a, b) => a + b, 0) / channelCount
      
      scanPoints.push({
        spanLengthKm: spanLength,
        gsnrPerChannelDb: channelGsnr,
        osnrPerChannelDb: channelOsnr,
        avgGsnrDb: avgGsnr,
        minGsnrDb: minGsnr,
        avgOsnrDb: avgOsnr,
        meetTarget: minGsnr >= targetGsnrDb,
        gsnrMarginDb: minGsnr - targetGsnrDb,
      })
    }
    
    // 找到可行区间
    const feasiblePoints = scanPoints.filter(p => p.meetTarget)
    const feasibleRange: [number, number] | null = feasiblePoints.length > 0
      ? [feasiblePoints[0].spanLengthKm, feasiblePoints[feasiblePoints.length - 1].spanLengthKm]
      : null
    
    // 推荐最优 Span 长度（在可行区间内取余量最大的）
    let recommendedSpanKm = scanConfig.spanLengthMinKm
    if (feasiblePoints.length > 0) {
      const bestPoint = feasiblePoints.reduce((best, current) =>
        current.gsnrMarginDb > best.gsnrMarginDb ? current : best
      )
      recommendedSpanKm = bestPoint.spanLengthKm
    }
    
    return {
      linkId: '',
      scannedAt: new Date(),
      model: this.model,
      spanLengthsKm,
      gsnrPerSpanDb,
      osnrPerSpanDb,
      recommendedSpanKm,
      targetGsnrDb,
      feasibleRange,
      scanPoints,
    }
  }

  // ========== Step 9: 精细仿真 ==========

  /**
   * 精细仿真计算 (Step 9)
   * 输出各信道 GSNR/OSNR/SNR_ASE/SNR_NLI 沿链路的累积演化
   * 
   * @param link - 链路配置
   * @param amplifier - 放大器参数
   */
  detailedSimulation(
    link: OpticalLink,
    amplifier: AmplifierParams = DEFAULT_AMPLIFIER_PARAMS
  ): DetailedSimulationResult {
    const channelCount = link.wdmParams.channelCount
    const spanCount = link.spans.length
    
    // 初始化 KP 位置序列
    const kpPositions: number[] = [0]
    let currentKp = 0
    for (const span of link.spans) {
      currentKp += span.length
      kpPositions.push(currentKp)
    }
    
    // 初始化各信道演化数据
    const channelEvolutions: ChannelEvolution[] = []
    
    for (let ch = 0; ch < channelCount; ch++) {
      const centerFreqTHz = link.wdmParams.centerWavelength 
        ? 299792.458 / link.wdmParams.centerWavelength + (ch - channelCount / 2) * (link.wdmParams.channelSpacing / 1000)
        : 193.1 + (ch - channelCount / 2) * 0.05
      
      const gsnrEvolution: number[] = [30] // 初始值
      const osnrEvolution: number[] = [40]
      const snrAseEvolution: number[] = [45]
      const snrNliEvolution: number[] = [50]
      
      // 边缘信道惩罚
      const edgePenalty = Math.abs(ch - channelCount / 2) / (channelCount / 2) * 0.3
      
      // 逐跨段计算
      let cumulativeOsnr = 40
      let cumulativeNli = -50
      
      for (let s = 0; s < spanCount; s++) {
        const span = link.spans[s]
        
        // 计算本跨段 OSNR 贡献
        const spanOsnr = this.calculateOSNR(
          amplifier.noiseFigure,
          s + 1,
          span.spanLoss,
          span.fiber.attenuation,
          span.length
        ) - edgePenalty
        
        // 累积 OSNR
        cumulativeOsnr = -10 * Math.log10(
          Math.pow(10, -cumulativeOsnr / 10) + Math.pow(10, -spanOsnr / 10)
        )
        
        // 计算 NLI
        const nliPower = this.calculateNLIPower(
          span.fiber,
          Math.pow(10, link.wdmParams.launchPowerPerChannel / 10),
          span.length,
          channelCount,
          link.wdmParams.channelSpacing
        )
        
        cumulativeNli = 10 * Math.log10(
          Math.pow(10, cumulativeNli / 10) + Math.pow(10, nliPower / 10)
        )
        
        // 计算 GSNR
        const gsnr = this.calculateGSNR(
          cumulativeOsnr,
          cumulativeNli,
          link.wdmParams.launchPowerPerChannel
        )
        
        gsnrEvolution.push(gsnr)
        osnrEvolution.push(cumulativeOsnr)
        snrAseEvolution.push(cumulativeOsnr + 5) // SNR_ASE 略高于 OSNR
        snrNliEvolution.push(-cumulativeNli + link.wdmParams.launchPowerPerChannel)
      }
      
      channelEvolutions.push({
        channelIndex: ch,
        centerFreqTHz,
        gsnrEvolution,
        osnrEvolution,
        snrAseEvolution,
        snrNliEvolution,
      })
    }
    
    // 计算平均和最差信道演化
    const avgGsnrEvolution: number[] = []
    const worstGsnrEvolution: number[] = []
    
    for (let i = 0; i <= spanCount; i++) {
      const gsnrAtPosition = channelEvolutions.map(ch => ch.gsnrEvolution[i])
      avgGsnrEvolution.push(gsnrAtPosition.reduce((a, b) => a + b, 0) / channelCount)
      worstGsnrEvolution.push(Math.min(...gsnrAtPosition))
    }
    
    // 找到最差信道
    const endGsnrs = channelEvolutions.map(ch => ch.gsnrEvolution[spanCount])
    const worstChannelIndex = endGsnrs.indexOf(Math.min(...endGsnrs))
    
    // 获取调制格式所需 GSNR
    const requiredGSNR = MODULATION_PARAMS[link.wdmParams.modulationFormat]?.requiredGSNR || 12
    
    // 仿真链路获取跨段结果
    const linkResult = this.simulateLink(link, amplifier)
    
    return {
      linkId: link.id,
      simulatedAt: new Date(),
      model: this.model,
      kpPositions,
      channelEvolutions,
      avgGsnrEvolution,
      worstGsnrEvolution,
      worstChannelIndex,
      endToEndAvgGsnr: avgGsnrEvolution[spanCount],
      endToEndWorstGsnr: worstGsnrEvolution[spanCount],
      isFeasible: worstGsnrEvolution[spanCount] >= requiredGSNR,
      spanResults: linkResult.spanResults,
    }
  }
}

// 导出单例
export const opticalSimulationService = new OpticalSimulationService()
