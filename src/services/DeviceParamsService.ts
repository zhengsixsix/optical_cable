/**
 * 设备参数服务
 * 从器件库获取参数并转换为仿真计算所需的格式
 * 
 * 这是 UI 配置与计算引擎之间的桥梁
 */

import { useSettingsStore } from '@/stores'
import type { FiberParams, AmplifierParams, WDMSystemParams } from '@/types/simulation'
import { DEFAULT_FIBER_PARAMS, DEFAULT_AMPLIFIER_PARAMS } from '@/types/simulation'

/**
 * 从器件库获取光纤参数
 * @param fiberTypeId - 光纤类型ID，如果不传则使用第一个可用的或默认值
 */
export function getFiberParamsFromLibrary(fiberTypeId?: string): FiberParams {
  const settingsStore = useSettingsStore()
  const fiberTypes = settingsStore.fiberTypes
  
  // 如果没有导入器件库，使用默认值
  if (!fiberTypes || fiberTypes.length === 0) {
    return { ...DEFAULT_FIBER_PARAMS }
  }
  
  // 查找指定ID或使用第一个
  const fiberType = fiberTypeId 
    ? fiberTypes.find(f => f.id === fiberTypeId) 
    : fiberTypes[0]
  
  if (!fiberType) {
    return { ...DEFAULT_FIBER_PARAMS }
  }
  
  // 转换为 FiberParams 格式
  return {
    type: fiberType.fiberCategory ?? fiberType.name ?? 'G.654.E',
    attenuation: fiberType.attenuationCoeff ?? DEFAULT_FIBER_PARAMS.attenuation,
    dispersion: fiberType.dispersion ?? DEFAULT_FIBER_PARAMS.dispersion,
    dispersionSlope: fiberType.dispersionSlope ?? DEFAULT_FIBER_PARAMS.dispersionSlope,
    effectiveArea: fiberType.effectiveArea ?? DEFAULT_FIBER_PARAMS.effectiveArea,
    nonlinearIndex: fiberType.nonlinearRefractiveIndex != null 
      ? fiberType.nonlinearRefractiveIndex * 1e-20 
      : DEFAULT_FIBER_PARAMS.nonlinearIndex,
    nonlinearCoeff: fiberType.nonlinearCoeff ?? DEFAULT_FIBER_PARAMS.nonlinearCoeff,
  }
}

/**
 * 从器件库获取放大器参数
 * @param amplifierTypeId - 放大器类型ID，如果不传则使用第一个可用的或默认值
 */
export function getAmplifierParamsFromLibrary(amplifierTypeId?: string): AmplifierParams {
  const settingsStore = useSettingsStore()
  const amplifierTypes = settingsStore.amplifierTypes
  
  // 如果没有导入器件库，使用默认值
  if (!amplifierTypes || amplifierTypes.length === 0) {
    return { ...DEFAULT_AMPLIFIER_PARAMS }
  }
  
  // 查找指定ID或使用第一个
  const ampType = amplifierTypeId 
    ? amplifierTypes.find(a => a.id === amplifierTypeId) 
    : amplifierTypes[0]
  
  if (!ampType) {
    return { ...DEFAULT_AMPLIFIER_PARAMS }
  }
  
  // 转换为 AmplifierParams 格式
  return {
    type: 'EDFA' as const,
    noiseFigure: ampType.noiseFigure ?? DEFAULT_AMPLIFIER_PARAMS.noiseFigure,
    gain: ampType.gain ?? DEFAULT_AMPLIFIER_PARAMS.gain,
    maxOutputPower: ampType.outputPower ?? ampType.saturationPower ?? DEFAULT_AMPLIFIER_PARAMS.maxOutputPower,
    gainFlatness: ampType.gainFlatness ?? DEFAULT_AMPLIFIER_PARAMS.gainFlatness,
    band: 'C' as const,
  }
}

/**
 * 从设置中获取 WDM 系统参数
 */
export function getWDMParamsFromSettings(): Partial<WDMSystemParams> {
  const settingsStore = useSettingsStore()
  const wdmConfig = settingsStore.systemPlanningConfig?.wdmParams
  const transmissionConfig = settingsStore.transmissionConfig
  
  return {
    channelCount: wdmConfig?.channelCount ?? transmissionConfig?.channelCount ?? 96,
    channelSpacing: wdmConfig?.channelSpacingGHz ?? transmissionConfig?.channelBandwidth ?? 50,
    launchPowerPerChannel: wdmConfig?.launchPower ?? 0,
    modulationFormat: (wdmConfig?.modulation ?? 'DP-16QAM') as any,
  }
}

/**
 * 获取完整的仿真参数包
 * 用于一次性获取所有计算所需参数
 */
export function getSimulationParams(options?: {
  fiberTypeId?: string
  amplifierTypeId?: string
}): {
  fiberParams: FiberParams
  amplifierParams: AmplifierParams
  wdmParams: Partial<WDMSystemParams>
} {
  return {
    fiberParams: getFiberParamsFromLibrary(options?.fiberTypeId),
    amplifierParams: getAmplifierParamsFromLibrary(options?.amplifierTypeId),
    wdmParams: getWDMParamsFromSettings(),
  }
}

/**
 * 检查器件库是否已配置
 */
export function hasDeviceLibraryConfigured(): {
  hasFiber: boolean
  hasAmplifier: boolean
  hasBU: boolean
} {
  const settingsStore = useSettingsStore()
  return {
    hasFiber: (settingsStore.fiberTypes?.length ?? 0) > 0,
    hasAmplifier: (settingsStore.amplifierTypes?.length ?? 0) > 0,
    hasBU: (settingsStore.branchingUnitTypes?.length ?? 0) > 0,
  }
}

/**
 * 获取器件库配置状态的友好提示
 */
export function getDeviceLibraryStatus(): string {
  const status = hasDeviceLibraryConfigured()
  const missing: string[] = []
  
  if (!status.hasFiber) missing.push('光纤')
  if (!status.hasAmplifier) missing.push('放大器')
  
  if (missing.length === 0) {
    return '器件库已配置'
  }
  return `缺少器件: ${missing.join('、')} (将使用默认参数)`
}
