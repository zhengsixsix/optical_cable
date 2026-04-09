/**
 * Span 扫描与 GSNR 计算 Composable
 * 从 DesignView 提取的仿真计算逻辑
 */

import { useAppStore } from '@/stores/app'
import { useRouteStore } from '@/stores/route'
import { ref, type Ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useRPLStore } from '@/stores/rpl'
import { opticalSimulationService, repeaterPlacementService } from '@/services'
import { getFiberParamsFromLibrary, getAmplifierParamsFromLibrary } from '@/services/DeviceParamsService'
import type { SpanScanResult, ModulationFormat } from '@/types/simulation'
import type { SpanScanConfig } from '@/types/systemPlanning'
import { MODULATION_PARAMS } from '@/types/simulation'
import type { WizardConfig } from '@/modules/design/dialogs/SystemPlanningWizard.vue'

export function useSpanCalculation(deps: {
  repeaterSpacing: Ref<number>
  autoPlacementResult: Ref<any>
  placementRoutePoints: Ref<any[]>
}) {
  const settingsStore = useSettingsStore()
  const rplStore = useRPLStore()
  const appStore = useAppStore()
  const routeStore = useRouteStore()

  // Span 扫描结果
  const spanScanResult = ref<SpanScanResult | null>(null)
  const recommendedSpan = ref<number | null>(null)
  const userSelectedSpan = ref<number | null>(null)

  // GSNR 计算数据
  const gsnrData = ref<Array<{ kp: number; gsnr: number; margin: number; repeaterIndex?: number }>>([])
  const isCalculating = ref(false)

  // 视图切换
  const centerViewMode = ref<'map' | 'gsnr' | 'span'>('map')

  // 计算 GSNR 数据
  const calculateGSNRData = () => {
    const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
    if (totalLength === 0) return []

    const spanCount = Math.ceil(totalLength / deps.repeaterSpacing.value)
    const data: Array<{ kp: number; gsnr: number; margin: number; repeaterIndex?: number }> = []

    const fiberParams = getFiberParamsFromLibrary()
    const amplifierParams = getAmplifierParamsFromLibrary()
    const wdmConfig = settingsStore.systemPlanningConfig?.wdmParams
    const launchPower = wdmConfig?.launchPower ?? 0

    for (let i = 0; i <= spanCount; i++) {
      const kp = Math.min(i * deps.repeaterSpacing.value, totalLength)
      const result = opticalSimulationService.quickEstimateGSNR(
        kp,
        deps.repeaterSpacing.value,
        launchPower,
        amplifierParams.noiseFigure,
        fiberParams.attenuation,
      )
      data.push({
        kp,
        gsnr: result.gsnr > 0 ? result.gsnr : 25 - i * 0.5,
        margin: result.margin > -10 ? result.margin : 10 - i * 0.8,
        repeaterIndex: i > 0 ? i : undefined,
      })
    }
    return data
  }

  // WDM 配置变更
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleWDMConfigChange = (config: Record<string, any>) => {
    if (gsnrData.value.length > 0) {
      gsnrData.value = calculateGSNRData()
      appStore.addLog('INFO', `WDM参数已更新: ${config.channelCount}波道, ${config.modulationFormat}`)
    }
  }

  // 触发 GSNR 计算
  const handleCalculateGSNR = () => {
    const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
    if (totalLength === 0) {
      appStore.showNotification({ type: 'warning', message: '请先导入路由数据' })
      return
    }

    isCalculating.value = true
    appStore.showNotification({ type: 'info', message: '正在计算GSNR...' })

    setTimeout(() => {
      gsnrData.value = calculateGSNRData()
      isCalculating.value = false
      centerViewMode.value = 'gsnr'
      appStore.showNotification({ type: 'success', message: 'GSNR计算完成' })
      appStore.addLog('INFO', `GSNR计算完成，共${gsnrData.value.length}个数据点`)
    }, 500)
  }

  // Span 选择
  const handleSpanSelect = (spanLength: number) => {
    deps.repeaterSpacing.value = spanLength
    gsnrData.value = calculateGSNRData()

    const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
    const currentRoute = routeStore.selectedRoute
    const routePoints = deps.placementRoutePoints.value.length > 0
      ? deps.placementRoutePoints.value
      : (currentRoute?.points || [])
    deps.autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
      totalLength,
      spanLength,
      routePoints,
    )

    appStore.showNotification({ type: 'info', message: `已选择 Span 长度: ${spanLength}km` })
  }

  // 用户交互调整 Span
  const handleApplyUserSelection = (spanKm: number) => {
    userSelectedSpan.value = spanKm
    handleSpanSelect(spanKm)
    appStore.addLog('INFO', `用户交互调整: 应用 Span=${spanKm}km`)
  }

  // 恢复系统推荐
  const handleRestoreRecommended = () => {
    const recSpan = recommendedSpan.value ?? spanScanResult.value?.recommendedSpanKm
    if (recSpan) {
      userSelectedSpan.value = null
      handleSpanSelect(recSpan)
      appStore.showNotification({ type: 'info', message: `已恢复系统推荐 Span: ${recSpan}km` })
    }
  }

  // Step 4 确认后：执行 Span 扫描
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleModelConfirm = (config: { fiberModel: string; [key: string]: any }) => {
    const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0

    isCalculating.value = true
    appStore.showNotification({ type: 'info', message: '正在执行 Span 扫描计算...' })
    appStore.addLog('INFO', `选择仿真模型: ${config.fiberModel}`)

    const fiberParams = getFiberParamsFromLibrary()
    const amplifierParams = getAmplifierParamsFromLibrary()
    appStore.addLog('INFO', `使用器件参数: 光纤衰减=${fiberParams.attenuation}dB/km, 器件NF=${amplifierParams.noiseFigure}dB`)

    const wdmConfig = settingsStore.systemPlanningConfig.wdmParams
    const modulationFormat = (wdmConfig?.modulation || 'DP-QPSK') as ModulationFormat
    const modParams = MODULATION_PARAMS[modulationFormat]
    const fecGain = wdmConfig?.fecType === 'SD-FEC' ? 2.0 : (wdmConfig?.fecType === 'OFEC' ? 2.5 : 0)
    const adjustedTargetGsnr = (modParams?.requiredGSNR || 12) - fecGain

    const scanConfig: SpanScanConfig = {
      ...settingsStore.systemPlanningConfig.spanScanConfig,
      targetGsnrDb: adjustedTargetGsnr,
    }

    setTimeout(() => {
      spanScanResult.value = opticalSimulationService.spanRangeScan(
        totalLength,
        scanConfig,
        settingsStore.transmissionConfig.channelCount,
        {
          channelSpacing: wdmConfig?.channelSpacingGHz || 50,
          launchPowerPerChannel: wdmConfig?.launchPower || 1,
        },
        fiberParams,
        amplifierParams,
      )

      const recommendation = repeaterPlacementService.autoRecommendSpan(spanScanResult.value, true)
      recommendedSpan.value = recommendation.recommendedSpanKm

      const currentRoute = routeStore.selectedRoute
      const routePoints = currentRoute?.points || []
      deps.autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
        totalLength,
        recommendation.recommendedSpanKm,
        routePoints,
      )

      deps.repeaterSpacing.value = recommendation.recommendedSpanKm
      gsnrData.value = calculateGSNRData()

      isCalculating.value = false
      centerViewMode.value = 'span'

      appStore.showNotification({
        type: 'success',
        message: `计算完成，推荐 Span: ${recommendation.recommendedSpanKm}km，余量: ${recommendation.gsnrMargin.toFixed(1)}dB`,
      })
      appStore.addLog('INFO', recommendation.reasoning)
    }, 800)
  }

  // 向导配置完成
  const handleWizardStartCalculation = (config: WizardConfig) => {
    const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0

    isCalculating.value = true
    appStore.showNotification({ type: 'info', message: '正在执行 Span 扫描计算...' })
    appStore.addLog('INFO', `使用向导配置: 模型=${config.simulationModel}, 光纤α=${config.fiberParams.attenuation}dB/km, 放大器NF=${config.amplifierParams.noiseFigure}dB`)

    const capturedRoute = routeStore.selectedRoute
    const capturedRoutePoints = capturedRoute?.points ? [...capturedRoute.points] : []

    const modulationFormat = (config.wdmParams.modulation || 'DP-QPSK') as ModulationFormat
    const modParams = MODULATION_PARAMS[modulationFormat]
    const fecGain = config.wdmParams.fecType === 'SD-FEC' ? 2.0 : (config.wdmParams.fecType === 'OFEC' ? 2.5 : 0)
    const adjustedTargetGsnr = (modParams?.requiredGSNR || 12) - fecGain

    const scanConfig: SpanScanConfig = {
      spanLengthMinKm: config.spanScanConfig.spanLengthMinKm,
      spanLengthMaxKm: config.spanScanConfig.spanLengthMaxKm,
      spanStepKm: config.spanScanConfig.spanStepKm,
      targetGsnrDb: adjustedTargetGsnr,
      marginDb: 3,
    }

    deps.repeaterSpacing.value = Math.round((scanConfig.spanLengthMinKm + scanConfig.spanLengthMaxKm) / 2)

    setTimeout(() => {
      spanScanResult.value = opticalSimulationService.spanRangeScan(
        totalLength,
        scanConfig,
        config.wdmParams.channelCount,
        {
          channelSpacing: config.wdmParams.channelSpacingGHz,
          launchPowerPerChannel: config.wdmParams.launchPower,
        },
        config.fiberParams,
        config.amplifierParams,
      )

      const recommendation = repeaterPlacementService.autoRecommendSpan(spanScanResult.value, true)
      recommendedSpan.value = recommendation.recommendedSpanKm

      deps.autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
        totalLength,
        recommendation.recommendedSpanKm,
        capturedRoutePoints,
      )
      deps.placementRoutePoints.value = capturedRoutePoints

      deps.repeaterSpacing.value = recommendation.recommendedSpanKm
      gsnrData.value = calculateGSNRData()

      isCalculating.value = false
      centerViewMode.value = 'span'

      appStore.showNotification({
        type: 'success',
        message: `计算完成，推荐 Span: ${recommendation.recommendedSpanKm}km，余量: ${recommendation.gsnrMargin.toFixed(1)}dB`,
      })
      appStore.addLog('INFO', recommendation.reasoning)
    }, 800)
  }

  return {
    spanScanResult,
    recommendedSpan,
    userSelectedSpan,
    gsnrData,
    isCalculating,
    centerViewMode,
    calculateGSNRData,
    handleWDMConfigChange,
    handleCalculateGSNR,
    handleSpanSelect,
    handleApplyUserSelection,
    handleRestoreRecommended,
    handleModelConfirm,
    handleWizardStartCalculation,
  }
}
