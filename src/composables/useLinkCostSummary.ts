/**
 * 链路成本统计 Composable
 * 从 DesignView 提取的成本计算和成本摘要逻辑
 */

import { useCableSegmentStore } from '@/stores/cableSegment'
import { useConnectorStore } from '@/stores/connector'
import { ref, computed, type Ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useRPLStore } from '@/stores/rpl'

export interface LinkCalcSummaryData {
  linkName: string
  metrics: {
    osnr: { min: number; max: number; avg: number }
    gsnr: { min: number; max: number; avg: number }
    power: { min: number; max: number; avg: number }
    nli: { min: number; max: number; avg: number }
    qFactor: { min: number; max: number; avg: number }
  }
  systemConfig: {
    amplifierCount: number
    avgSpanLength: number
    buCount: number
    totalBuLoss: number
    channelCount: number
    modulation: string
  }
  margin: {
    targetOsnr: number
    worstMargin: number
    avgMargin: number
    meetsRequirement: boolean
  }
  costData: {
    cableCost: number
    amplifierCost: number
    buCost: number
    totalCost: number
    costItems: Array<{ category: string; model: string; quantity: number | string; unit: string; unitPrice: number; subtotal: number }>
  }
}

export function useLinkCostSummary(deps: {
  selectedCableType: Ref<string>
  selectedRepeaterType: Ref<string>
  repeaterSpacing: Ref<number>
  savedRepeaterConfigs: Ref<Array<{ id: string; kp: number; name: string; gain: number; powerConsumption?: number; model?: string }>>
}) {
  const settingsStore = useSettingsStore()
  const rplStore = useRPLStore()
  const connectorStore = useConnectorStore()
  const cableSegmentStore = useCableSegmentStore()

  // 链路计算结果摘要
  const linkCalcSummary = ref<LinkCalcSummaryData | null>(null)
  const currentLinkName = ref('')

  // 检测成本参数是否已配置
  const hasCostSettings = computed(() => {
    const costSettings = settingsStore.costFactors
    return costSettings &&
      costSettings.cableCostPerKm !== undefined &&
      costSettings.cableCostPerKm > 0 &&
      costSettings.repeaterCost !== undefined &&
      costSettings.repeaterCost > 0
  })

  // 成本配置（供结果面板使用）
  const costConfigForPanel = computed(() => {
    if (!hasCostSettings.value) return undefined
    const costSettings = settingsStore.costFactors
    return {
      cablePerKm: costSettings?.cableCostPerKm,
      repeaterPerUnit: costSettings?.repeaterCost,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buPerUnit: (costSettings as any)?.buCost || 50000,
      installationPerKm: costSettings?.installationCostPerKm || 5000,
    }
  })

  // 设计计算结果
  const designResult = computed(() => {
    const cable = settingsStore.settings.cableTypes.find(c => c.id === deps.selectedCableType.value)
    const repeater = settingsStore.settings.repeaterTypes.find(r => r.id === deps.selectedRepeaterType.value)
    if (!cable || !repeater) return null

    const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
    if (totalLength === 0) return null

    const repeaterCount = deps.savedRepeaterConfigs.value.length > 0
      ? deps.savedRepeaterConfigs.value.length
      : Math.ceil(totalLength / deps.repeaterSpacing.value)

    const costSettings = settingsStore.costFactors || {}
    const cableCostPerKm = costSettings.cableCostPerKm || 0
    const repeaterUnitCost = costSettings.repeaterCost || 0
    const installationCostPerKm = costSettings.installationCostPerKm || 0
    const landingStationCost = costSettings.landingStationCost || 0

    const landingStationCount = rplStore.currentTable?.metadata?.landingStations || 2

    const segmentSummary = cableSegmentStore.summary
    const cableCost = (segmentSummary && segmentSummary.totalCost > 0)
      ? segmentSummary.totalCost * 1000
      : totalLength * cableCostPerKm
    const repeaterCost = repeaterCount * repeaterUnitCost
    const installationCost = totalLength * installationCostPerKm
    const stationCost = landingStationCount * landingStationCost

    return {
      totalLength,
      repeaterCount,
      landingStationCount,
      cableCost,
      repeaterCost,
      installationCost,
      stationCost,
      totalCost: cableCost + repeaterCost + installationCost + stationCost,
      maxCapacity: cable.fiberCount * 10,
    }
  })

  // 设备统计（优先使用计算结果）
  const deviceStats = computed(() => {
    if (linkCalcSummary.value?.systemConfig) {
      return linkCalcSummary.value.systemConfig
    }
    return {
      amplifierCount: connectorStore.elements.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w').length,
      buCount: connectorStore.elements.filter(e => e.type === 'bu').length,
      avgSpanLength: 0,
      channelCount: 0,
      modulation: '-',
      totalBuLoss: 0,
    }
  })

  // 格式化成本
  const formatCost = (cost: number) => {
    if (cost >= 1000000) return `$${(cost / 1000000).toFixed(2)}M`
    if (cost >= 1000) return `$${(cost / 1000).toFixed(0)}K`
    return `$${cost.toFixed(0)}`
  }

  return {
    linkCalcSummary,
    currentLinkName,
    hasCostSettings,
    costConfigForPanel,
    designResult,
    deviceStats,
    formatCost,
  }
}
