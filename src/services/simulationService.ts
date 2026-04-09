/**
 * 仿真服务 - Step 3: 构建仿真输入
 * 将前端用户配置转换为计算模型可处理的标准化数据结构
 */

import type { LinkConfig } from '@/modules/design/dialogs/LinkConfigDialog.vue'
import type { ConnectorElement } from '@/types/connector'
import type {
  SimulationInput,
  SimDevice,
  SimAmplifierDevice,
  SimBUDevice,
  SimEqualizerDevice,
  SimLandingDevice,
  SimFiberSegment,
  SimulationProgress,
  ProgressCallback,
  SpanScanResult,
  SpanScanPoint,
  SimulationModel
} from '@/types/simulation'
import { useSettingsStore, useConnectorStore, useRouteStore } from '@/stores'

/**
 * 构建标准化仿真输入结构
 * @param config 链路配置（来自 LinkConfigDialog）
 * @param onProgress 进度回调
 * @returns 标准化仿真输入
 */
export async function buildSimulationInput(
  config: LinkConfig,
  onProgress?: ProgressCallback
): Promise<SimulationInput> {
  const settingsStore = useSettingsStore()
  const connectorStore = useConnectorStore()
  const routeStore = useRouteStore()
  
  // 阶段1：构建输入
  onProgress?.({
    phase: 'building',
    phaseLabel: '构建仿真输入',
    progress: 0,
    message: '正在整理器件序列...'
  })
  
  // 获取路由信息
  const route = routeStore.routes.find(r => r.id === config.routeId)
  const linkName = route?.name || '未命名链路'
  
  // 1. 按 KP 排序整理器件序列
  const elements = connectorStore.getElementsForRoute(config.routeId)
    .filter(e => ['landing', 'underwater', 'amplifier_e', 'amplifier_w', 'ola', 'bu', 'equalizer'].includes(e.type))
    .sort((a, b) => a.kp - b.kp)
  
  const deviceSequence: SimDevice[] = []
  let totalLength = 0
  
  for (const el of elements) {
    if (el.type === 'landing' || el.type === 'underwater') {
      deviceSequence.push({
        id: el.id,
        name: el.name,
        type: 'landing',
        kp: el.kp,
        longitude: el.longitude,
        latitude: el.latitude
      } as SimLandingDevice)
    } else if (el.type === 'amplifier_e' || el.type === 'amplifier_w' || el.type === 'ola') {
      // 从器件库获取放大器参数
      const ampType = el.componentRefId 
        ? settingsStore.amplifierTypes.find(a => a.id === el.componentRefId)
        : null
      
      deviceSequence.push({
        id: el.id,
        name: el.name,
        type: 'amplifier',
        kp: el.kp,
        longitude: el.longitude,
        latitude: el.latitude,
        componentRefId: el.componentRefId || '',
        gain: ampType?.gain || config.amplifierParams.gain || 20,
        noiseFigure: ampType?.noiseFigure || config.amplifierParams.noiseFigure || 5,
        maxOutputPower: ampType?.outputPower || config.amplifierParams.maxOutputPower || 17,
        saturationPower: ampType?.saturationPower || 20,
        operatingMode: (ampType?.operatingMode as 'AGC' | 'APC') || 'AGC'
      } as SimAmplifierDevice)
    } else if (el.type === 'bu') {
      const buType = el.componentRefId
        ? settingsStore.branchingUnitTypes.find(b => b.id === el.componentRefId)
        : null
      
      deviceSequence.push({
        id: el.id,
        name: el.name,
        type: 'bu',
        kp: el.kp,
        longitude: el.longitude,
        latitude: el.latitude,
        componentRefId: el.componentRefId || '',
        portCount: el.buPortCount || buType?.portCount || 3,
        trunkLoss: el.buTrunkLoss ?? buType?.trunkInsertionLoss ?? 0.8,
        branchLoss: el.buBranchLoss ?? buType?.branchInsertionLoss ?? 3.5,
        nextHopUpstream: el.buNextHopUpstream,
        nextHopDownstream: el.buNextHopDownstream
      } as SimBUDevice)
    } else if (el.type === 'equalizer') {
      deviceSequence.push({
        id: el.id,
        name: el.name,
        type: 'equalizer',
        kp: el.kp,
        longitude: el.longitude,
        latitude: el.latitude,
        equalizerRole: el.equalizerRole,
        attenuationMode: el.attenuationMode,
        attenuationDb: Math.max(0, el.attenuationDb ?? 0)
      } as SimEqualizerDevice)
    }
    
    totalLength = Math.max(totalLength, el.kp)
  }
  
  onProgress?.({
    phase: 'building',
    phaseLabel: '构建仿真输入',
    progress: 30,
    message: `已整理 ${deviceSequence.length} 个器件`
  })
  
  // 2. 构建光纤段序列
  const fiberSegments: SimFiberSegment[] = []
  const fiberType = settingsStore.fiberTypes.find(f => f.id === config.fiberTypeId)
  
  for (let i = 0; i < deviceSequence.length - 1; i++) {
    const fromDevice = deviceSequence[i]
    const toDevice = deviceSequence[i + 1]
    const length = toDevice.kp - fromDevice.kp
    
    fiberSegments.push({
      id: `fiber-${i}`,
      fromDeviceId: fromDevice.id,
      toDeviceId: toDevice.id,
      length,
      fiberTypeId: config.fiberTypeId || '',
      attenuation: config.fiberParams.attenuation ?? fiberType?.attenuationCoeff ?? 0.16,
      dispersion: config.fiberParams.dispersion ?? fiberType?.dispersion ?? 20.5,
      effectiveArea: config.fiberParams.effectiveArea ?? fiberType?.effectiveArea ?? 110,
      nonlinearIndex: config.fiberParams.nonlinearIndex ?? fiberType?.nonlinearRefractiveIndex ?? 2.2e-20
    })
  }
  
  onProgress?.({
    phase: 'building',
    phaseLabel: '构建仿真输入',
    progress: 60,
    message: `已构建 ${fiberSegments.length} 个光纤段`
  })
  
  // 3. 整合 WDM 参数
  const wdmConfig = {
    channelCount: config.wdmParams.channelCount,
    channelSpacing: config.wdmParams.channelSpacing,
    centerWavelength: frequencyToWavelength(config.wdmParams.centerFreq),
    symbolRate: config.wdmParams.baudRate,
    modulationFormat: config.wdmParams.modulation as import('@/types/simulation').ModulationFormat,
    launchPowerPerChannel: config.wdmParams.launchPower,
    fecType: 'SD-FEC' as const,
    fecOverhead: 15,
    launchPowerMode: config.wdmParams.launchPowerMode,
    launchPowerVector: config.wdmParams.launchPowerVector,
    initialAseMode: config.wdmParams.initialAseMode,
    initialAseValue: config.wdmParams.initialAseValue,
    initialNliMode: config.wdmParams.initialNliMode,
    initialNliValue: config.wdmParams.initialNliValue
  }
  
  // 4. 整合 Span 策略
  const spanStrategy = {
    mode: config.spanStrategy as 'fixed' | 'scan',
    fixedLength: config.fixedSpanLength,
    scanRange: config.spanStrategy === 'auto' ? {
      min: config.constraints.minSpanLength || 40,
      max: config.constraints.maxSpanLength || 100,
      step: 5
    } : undefined
  }
  
  // 5. 整合约束条件
  const constraints = {
    minOsnrDb: config.constraints.targetOSNR || 18,
    minGsnrDb: config.constraints.targetGSNR || 15,
    maxSpanLossDb: 20,
    targetBer: 1e-3
  }
  
  onProgress?.({
    phase: 'building',
    phaseLabel: '构建仿真输入',
    progress: 100,
    message: '仿真输入构建完成'
  })
  
  // 构建最终输入结构
  const input: SimulationInput = {
    linkId: config.routeId,
    linkName,
    totalLengthKm: totalLength,
    deviceSequence,
    fiberSegments,
    fiberModel: {
      type: config.fiberModel as SimulationModel,
      params: {
        type: fiberType?.name || 'G.654.E',
        attenuation: config.fiberParams.attenuation,
        dispersion: config.fiberParams.dispersion,
        dispersionSlope: config.fiberParams['dispersionSlope'] ?? 0.06,
        effectiveArea: config.fiberParams.effectiveArea,
        nonlinearIndex: config.fiberParams.nonlinearIndex,
        nonlinearCoeff: config.fiberParams['nonlinearCoeff'] ?? 0.8
      }
    },
    amplifierModel: {
      type: config.amplifierModel as 'EDFA_GAIN' | 'EDFA_POWER' | 'RAMAN',
      params: {
        type: 'EDFA',
        noiseFigure: config.amplifierParams.noiseFigure,
        gain: config.amplifierParams.gain,
        maxOutputPower: config.amplifierParams.maxOutputPower,
        gainFlatness: config.amplifierParams.flatness,
        band: 'C+L'
      }
    },
    wdm: wdmConfig,
    spanStrategy,
    constraints,
    buConfigs: config.buConfigs.map(bu => ({
      id: bu.id,
      name: bu.name,
      kp: bu.kp || 0,
      portCount: bu.portCount,
      trunkLoss: bu.trunkLoss,
      branchLoss: bu.branchLoss
    })),
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  }
  
  return input
}

/**
 * 执行 Span 扫描计算 (Step 4)
 * @param input 仿真输入
 * @param onProgress 进度回调
 * @returns Span 扫描结果
 */
export async function runSpanScanSimulation(
  input: SimulationInput,
  onProgress?: ProgressCallback
): Promise<SpanScanResult> {
  // 阶段2：校验参数
  onProgress?.({
    phase: 'validating',
    phaseLabel: '校验参数',
    progress: 0,
    message: '正在校验仿真参数...'
  })
  
  await delay(300) // 模拟校验
  
  // 确定 Span 扫描范围
  let spanLengths: number[] = []
  
  if (input.spanStrategy.mode === 'fixed' && input.spanStrategy.fixedLength) {
    spanLengths = [input.spanStrategy.fixedLength]
  } else if (input.spanStrategy.scanRange) {
    const { min, max, step } = input.spanStrategy.scanRange
    for (let len = min; len <= max; len += step) {
      spanLengths.push(len)
    }
  } else {
    // 默认扫描范围
    spanLengths = [40, 50, 60, 70, 80, 90, 100]
  }
  
  onProgress?.({
    phase: 'computing',
    phaseLabel: '计算中',
    progress: 0,
    totalSpans: spanLengths.length,
    currentSpan: 0,
    message: `开始 Span 扫描，共 ${spanLengths.length} 个配置点`
  })
  
  // 阶段3：迭代计算
  const scanPoints: SpanScanPoint[] = []
  
  for (let i = 0; i < spanLengths.length; i++) {
    const spanLength = spanLengths[i]
    
    onProgress?.({
      phase: 'computing',
      phaseLabel: '计算中',
      progress: Math.round((i / spanLengths.length) * 80),
      totalSpans: spanLengths.length,
      currentSpan: i + 1,
      message: `计算 Span=${spanLength}km 的性能指标...`
    })
    
    // 模拟计算（实际应调用计算引擎）
    const result = await simulateSpanPerformance(input, spanLength)
    scanPoints.push(result)
    
    await delay(200) // 模拟计算耗时
  }
  
  // 阶段4：分析结果
  onProgress?.({
    phase: 'analyzing',
    phaseLabel: '分析结果',
    progress: 90,
    message: '正在分析最优 Span 配置...'
  })
  
  await delay(300)
  
  // 找出推荐 Span 长度
  const feasiblePoints = scanPoints.filter(p => p.meetTarget)
  let recommendedSpanKm = spanLengths[0]
  let feasibleRange: [number, number] | null = null
  
  if (feasiblePoints.length > 0) {
    // 选择余量最大的可行点
    const bestPoint = feasiblePoints.reduce((best, p) => 
      p.gsnrMarginDb > best.gsnrMarginDb ? p : best
    )
    recommendedSpanKm = bestPoint.spanLengthKm
    
    feasibleRange = [
      Math.min(...feasiblePoints.map(p => p.spanLengthKm)),
      Math.max(...feasiblePoints.map(p => p.spanLengthKm))
    ]
  }
  
  onProgress?.({
    phase: 'completed',
    phaseLabel: '计算完成',
    progress: 100,
    message: `推荐 Span 长度: ${recommendedSpanKm} km`
  })
  
  return {
    linkId: input.linkId,
    scannedAt: new Date(),
    model: input.fiberModel.type,
    spanLengthsKm: spanLengths,
    gsnrPerSpanDb: scanPoints.map(p => p.gsnrPerChannelDb),
    osnrPerSpanDb: scanPoints.map(p => p.osnrPerChannelDb),
    recommendedSpanKm,
    targetGsnrDb: input.constraints.minGsnrDb,
    feasibleRange,
    scanPoints
  }
}

/**
 * 模拟单个 Span 配置的性能计算
 * 实际项目中应调用真实的计算引擎
 */
async function simulateSpanPerformance(
  input: SimulationInput,
  spanLengthKm: number
): Promise<SpanScanPoint> {
  // 安全获取参数，提供默认值
  const channelCount = input.wdm?.channelCount || 80
  const totalLength = input.totalLengthKm || 1000
  const attenuation = input.fiberModel?.params?.attenuation || 0.16
  const launchPower = input.wdm?.launchPowerPerChannel || 0
  const nf = input.amplifierModel?.params?.noiseFigure || 5
  const gain = input.amplifierModel?.params?.gain || 18
  const targetGsnr = input.constraints?.minGsnrDb || 15
  const passiveLoss = input.deviceSequence.reduce((sum, device) => {
    if (device.type === 'equalizer') {
      return sum + Math.max(0, device.attenuationDb || 0)
    }
    if (device.type === 'bu') {
      return sum + Math.max(0, device.trunkLoss || 0)
    }
    return sum
  }, 0)
  
  // 模拟计算（使用简化的 GN 模型估算）
  const spanLoss = spanLengthKm * attenuation + passiveLoss
  const spanCount = Math.max(1, Math.ceil(totalLength / spanLengthKm))
  
  // ASE 噪声累积
  const aseNoisePerSpan = nf + gain - 58 // 简化公式
  const totalAseNoise = aseNoisePerSpan + 10 * Math.log10(spanCount)
  
  // OSNR 估算
  const baseOsnr = launchPower - totalAseNoise + 58 - passiveLoss
  
  // NLI 噪声（简化 GN 模型）
  const nliCoeff = Math.max(0.001, 0.1 * channelCount * Math.pow(spanLengthKm / 100, 1.5))
  const nliNoise = launchPower - 20 + 10 * Math.log10(nliCoeff * spanCount)
  
  // GSNR 计算
  const osnrLinear = Math.pow(10, baseOsnr / 10)
  const nliLinear = Math.pow(10, nliNoise / 10)
  const gsnrLinear = 1 / (1 / osnrLinear + nliLinear / Math.pow(10, launchPower / 10))
  const baseGsnr = isFinite(gsnrLinear) && gsnrLinear > 0 ? 10 * Math.log10(gsnrLinear) : 20
  
  // 生成各信道数据（添加少量随机波动）
  const gsnrPerChannelDb: number[] = []
  const osnrPerChannelDb: number[] = []
  
  const effectiveChannelCount = Math.max(1, channelCount)
  for (let ch = 0; ch < effectiveChannelCount; ch++) {
    const variation = (Math.random() - 0.5) * 0.5 // ±0.25 dB 波动
    const gsnrVal = isFinite(baseGsnr) ? baseGsnr + variation : 20 + variation
    const osnrVal = isFinite(baseOsnr) ? baseOsnr + variation : 25 + variation
    gsnrPerChannelDb.push(gsnrVal)
    osnrPerChannelDb.push(osnrVal)
  }
  
  const avgGsnr = gsnrPerChannelDb.reduce((a, b) => a + b, 0) / effectiveChannelCount
  const minGsnr = gsnrPerChannelDb.length > 0 ? Math.min(...gsnrPerChannelDb) : 20
  const avgOsnr = osnrPerChannelDb.reduce((a, b) => a + b, 0) / effectiveChannelCount
  
  const gsnrMargin = minGsnr - targetGsnr
  
  return {
    spanLengthKm,
    gsnrPerChannelDb,
    osnrPerChannelDb,
    avgGsnrDb: isFinite(avgGsnr) ? avgGsnr : 20,
    minGsnrDb: isFinite(minGsnr) ? minGsnr : 20,
    avgOsnrDb: isFinite(avgOsnr) ? avgOsnr : 25,
    meetTarget: gsnrMargin >= 0,
    gsnrMarginDb: isFinite(gsnrMargin) ? gsnrMargin : 5
  }
}

// 辅助函数
function frequencyToWavelength(freqTHz: number): number {
  return 299792.458 / freqTHz // nm
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
