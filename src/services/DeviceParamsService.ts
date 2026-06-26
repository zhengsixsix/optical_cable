import { useSettingsStore } from '@/stores/settings'
import type { AmplifierParams, FiberParams, WDMSystemParams } from '@/types/simulation'
import { DEFAULT_AMPLIFIER_PARAMS, DEFAULT_FIBER_PARAMS } from '@/types/simulation'
import {
  findDeviceLibraryById,
  firstDeviceLibraryByCategory,
  getDeviceLibraryParam,
  hasDeviceLibraryCategory,
  toRuntimeAmplifierLibrary,
  toRuntimeFiberLibrary,
} from '@/services/platform/deviceRuntime'
import type { PlanDeviceLibrary } from '@/services/platform/types'

function resolveLibrary(
  libraries: PlanDeviceLibrary[],
  id: string | undefined,
  category: 'fiber' | 'amplifier',
): PlanDeviceLibrary | null {
  return findDeviceLibraryById(libraries, id, category)
    ?? firstDeviceLibraryByCategory(libraries, category)
}

function normalizeNonlinearIndex(value: number): number {
  return value > 1e-15 ? value * 1e-20 : value
}

export function getFiberParamsFromLibrary(fiberTypeId?: string): FiberParams {
  const settingsStore = useSettingsStore()
  const library = resolveLibrary(settingsStore.platformDeviceLibraries, fiberTypeId, 'fiber')
  const fiber = toRuntimeFiberLibrary(library)

  if (!fiber) {
    return { ...DEFAULT_FIBER_PARAMS }
  }

  return {
    type: fiber.fiberCategory || fiber.name || DEFAULT_FIBER_PARAMS.type,
    attenuation: fiber.attenuationCoeff,
    dispersion: fiber.dispersion,
    dispersionSlope: fiber.dispersionSlope,
    effectiveArea: fiber.effectiveArea,
    nonlinearIndex: normalizeNonlinearIndex(fiber.nonlinearRefractiveIndex),
    nonlinearCoeff: fiber.nonlinearCoeff,
  }
}

export function getAmplifierParamsFromLibrary(amplifierTypeId?: string): AmplifierParams {
  const settingsStore = useSettingsStore()
  const library = resolveLibrary(settingsStore.platformDeviceLibraries, amplifierTypeId, 'amplifier')
  const amplifier = toRuntimeAmplifierLibrary(library)

  if (!amplifier) {
    return { ...DEFAULT_AMPLIFIER_PARAMS }
  }

  return {
    type: 'EDFA',
    noiseFigure: amplifier.noiseFigure,
    gain: amplifier.gain,
    maxOutputPower: amplifier.outputPower,
    gainFlatness: amplifier.gainFlatness,
    band: 'C+L',
  }
}

export function getWDMParamsFromSettings(): Partial<WDMSystemParams> {
  const settingsStore = useSettingsStore()
  const wdmConfig = settingsStore.systemPlanningConfig?.wdmParams
  const transmissionConfig = settingsStore.transmissionConfig

  return {
    channelCount: wdmConfig?.channelCount ?? transmissionConfig?.channelCount ?? 96,
    channelSpacing: wdmConfig?.channelSpacingGHz ?? transmissionConfig?.channelBandwidth ?? 50,
    launchPowerPerChannel: wdmConfig?.launchPower ?? 0,
    modulationFormat: (wdmConfig?.modulation ?? 'DP-16QAM') as import('@/types/simulation').ModulationFormat,
  }
}

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

export function hasDeviceLibraryConfigured(): {
  hasFiber: boolean
  hasAmplifier: boolean
  hasBU: boolean
} {
  const settingsStore = useSettingsStore()
  const libraries = settingsStore.platformDeviceLibraries
  return {
    hasFiber: hasDeviceLibraryCategory(libraries, 'fiber'),
    hasAmplifier: hasDeviceLibraryCategory(libraries, 'amplifier'),
    hasBU: hasDeviceLibraryCategory(libraries, 'branching'),
  }
}

export function getDeviceLibraryStatus(): string {
  const status = hasDeviceLibraryConfigured()
  const missing: string[] = []

  if (!status.hasFiber) missing.push('光纤')
  if (!status.hasAmplifier) missing.push('放大器')

  if (missing.length === 0) {
    return '器件库已配置'
  }
  return `缺少器件: ${missing.join('、')}，计算将使用默认参数`
}

export { getDeviceLibraryParam }
