<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouteStore } from '@/stores/route'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { useSettingsStore } from '@/stores/settings'
import type { RiskLevel, Route } from '@/types'

type DecisionTab = 'risk' | 'compare' | 'construction'

interface RiskBandRow {
  level: RiskLevel
  label: string
  length: number
  ratio: number
  unitPrice: number
  cost: number
  cableType: string
  advice: string
}

interface CompareRow {
  id: string
  label: string
  length: number
  cost: number
  risk: number
  highRiskLength: number
  isCurrent: boolean
}

interface ConstructionRow {
  title: string
  length: number
  cableType: string
  advice: string
  note: string
}

const RISK_SCORE: Record<RiskLevel, number> = {
  low: 0.18,
  medium: 0.38,
  high: 0.65,
}

const routeStore = useRouteStore()
const cableSegmentStore = useCableSegmentStore()
const settingsStore = useSettingsStore()

const activeTab = ref<DecisionTab>('risk')

const tabs: Array<{ key: DecisionTab; label: string }> = [
  { key: 'risk', label: '风险' },
  { key: 'compare', label: '比选' },
  { key: 'construction', label: '施工' },
]

const currentRoute = computed<Route | null>(() =>
  routeStore.selectedRoute || routeStore.paretoRoutes[0] || null,
)

const currentRouteIndex = computed(() => {
  const route = currentRoute.value
  if (!route) return -1
  return routeStore.paretoRoutes.findIndex(item => item.id === route.id)
})

const currentRouteLabel = computed(() => {
  if (!currentRoute.value) return '暂无路线'
  return currentRoute.value.name || `路径${currentRouteIndex.value + 1}`
})

const currentRouteSegments = computed(() => {
  const routeId = currentRoute.value?.id
  if (!routeId) return []
  return cableSegmentStore.segments.filter(segment => !segment.routeId || segment.routeId === routeId)
})

const riskAnalysisSegments = computed<Array<{ length: number; riskLevel?: string }>>(() => {
  if (currentRouteSegments.value.length > 0) return currentRouteSegments.value
  return currentRoute.value?.segments || []
})

const getWeightedRiskScore = (segments: Array<{ length?: number; riskLevel?: string }>) => {
  const totalLength = segments.reduce((sum, segment) => sum + (segment.length || 0), 0)
  if (totalLength <= 0) return 0

  const weighted = segments.reduce((sum, segment) => {
    const level = (segment.riskLevel || 'low') as RiskLevel
    return sum + (segment.length || 0) * (RISK_SCORE[level] || RISK_SCORE.low)
  }, 0)
  return weighted / totalLength
}

const getRouteRiskScore = (route: Route) => {
  if (route.algorithmSummary) {
    const segments = [
      { length: route.algorithmSummary.highRiskLength, riskLevel: 'high' },
      { length: route.algorithmSummary.mediumRiskLength, riskLevel: 'medium' },
      { length: route.algorithmSummary.lowRiskLength, riskLevel: 'low' },
    ]
    const score = getWeightedRiskScore(segments)
    if (score > 0) return score
  }
  return getWeightedRiskScore(route.segments)
}

const selectedSegment = computed(() => routeStore.selectedSegmentInfo)

const getRiskLabel = (level?: string | null) => {
  if (level === 'high') return '高风险'
  if (level === 'medium') return '中风险'
  return '低风险'
}

const getUnitPriceByRisk = (level: RiskLevel) => {
  const mapping = settingsStore.routePlanningConfig.armorMappings?.find(item => item.riskLevel === level)
  if (typeof mapping?.unitPrice === 'number') return mapping.unitPrice
  if (level === 'high') return 24
  if (level === 'medium') return 19.5
  return 15
}

const getCableTypeByRisk = (level: RiskLevel) => {
  const mapping = settingsStore.routePlanningConfig.armorMappings?.find(item => item.riskLevel === level)
  if (mapping?.cableTypeName) return mapping.cableTypeName
  if (level === 'high') return 'DA 双铠'
  if (level === 'medium') return 'SA 单铠'
  return 'LW 轻型'
}

const getAdviceByRisk = (level: RiskLevel) => {
  if (level === 'high') return '重点保护与埋设'
  if (level === 'medium') return '连续保护与稳态施工'
  return '深海直铺优先'
}

const routeOverview = computed(() => {
  const route = currentRoute.value
  if (!route) return null

  const totalLength = route.totalLength || riskAnalysisSegments.value.reduce((sum, segment) => sum + (segment.length || 0), 0)
  const maxDepth = route.segments.reduce((max, segment) => Math.max(max, segment.depth || 0), 0)
  const avgDepth = route.segments.length > 0
    ? route.segments.reduce((sum, segment) => sum + (segment.depth || 0), 0) / route.segments.length
    : 0

  return {
    totalLength,
    maxDepth,
    avgDepth,
    geometrySegments: route.segments.length,
    cableSegments: currentRouteSegments.value.length,
    riskScore: getWeightedRiskScore(riskAnalysisSegments.value),
    algorithmTotalCost: (route.fmmPathMeta?.totalCost ?? route.algorithmSummary?.algorithmTotalCost ?? route.cost?.total ?? route.totalCost ?? 0) / 1000,
  }
})

const summaryItems = computed(() => {
  const overview = routeOverview.value
  if (!overview) return []

  const segmentCount = overview.cableSegments || overview.geometrySegments
  return [
    `总长 ${overview.totalLength.toFixed(1)} km`,
    `风险 ${(overview.riskScore * 10).toFixed(2)} / 10`,
    `最大水深 ${Math.round(overview.maxDepth)} m`,
    `分段 ${segmentCount} 段`,
  ]
})

const riskBands = computed<RiskBandRow[]>(() => {
  const route = currentRoute.value
  if (!route) return []

  const lengths: Record<RiskLevel, number> = { high: 0, medium: 0, low: 0 }
  const sourceSegments = riskAnalysisSegments.value
  const totalLength = sourceSegments.reduce((sum, segment) => sum + (segment.length || 0), 0)

  sourceSegments.forEach(segment => {
    const level = (segment.riskLevel || 'low') as RiskLevel
    lengths[level] += segment.length || 0
  })

  return (['high', 'medium', 'low'] as const).map(level => ({
    level,
    label: getRiskLabel(level),
    length: lengths[level],
    ratio: totalLength > 0 ? lengths[level] / totalLength : 0,
    unitPrice: getUnitPriceByRisk(level),
    cost: lengths[level] * getUnitPriceByRisk(level),
    cableType: getCableTypeByRisk(level),
    advice: getAdviceByRisk(level),
  }))
})

const armorEstimatedCost = computed(() =>
  riskBands.value.reduce((sum, band) => sum + band.cost, 0),
)

const compareRows = computed<CompareRow[]>(() =>
  routeStore.paretoRoutes.map((route, index) => ({
    id: route.id,
    label: route.name || `路径${index + 1}`,
    length: route.totalLength || route.segments.reduce((sum, segment) => sum + (segment.length || 0), 0),
    cost: (route.fmmPathMeta?.totalCost ?? route.algorithmSummary?.algorithmTotalCost ?? route.cost?.total ?? route.totalCost ?? 0) / 1000,
    risk: getRouteRiskScore(route),
    highRiskLength: route.algorithmSummary?.highRiskLength ?? route.segments
      .filter(segment => segment.riskLevel === 'high')
      .reduce((sum, segment) => sum + (segment.length || 0), 0),
    isCurrent: route.id === currentRoute.value?.id,
  })),
)

const segmentSummary = computed(() => {
  const segments = currentRouteSegments.value
  if (segments.length === 0) return null

  return {
    avgLength: segments.reduce((sum, segment) => sum + segment.length, 0) / segments.length,
    avgSlack: segments.reduce((sum, segment) => sum + segment.slack, 0) / segments.length,
    avgBurialDepth: segments.reduce((sum, segment) => sum + segment.burialDepth, 0) / segments.length,
    lockedCount: segments.filter(segment => segment.isLocked).length,
  }
})

const planningAlerts = computed(() => {
  const overview = routeOverview.value
  const high = riskBands.value.find(item => item.level === 'high')
  const medium = riskBands.value.find(item => item.level === 'medium')
  const alerts: string[] = []

  if (!overview) return alerts

  if ((high?.length || 0) > 0) {
    alerts.push(`当前路径含 ${formatKm(high?.length || 0)} 高风险海域，建议优先核查登陆段、航道和渔区约束。`)
  }

  if (overview.maxDepth >= 3000) {
    alerts.push(`最深点约 ${Math.round(overview.maxDepth)} m，应复核施工船张力窗、回收预案和深海连续作业能力。`)
  }

  if ((medium?.length || 0) > overview.totalLength * 0.3) {
    alerts.push('中风险过渡段偏长，建议补做坡度与海床类型复核，减少中浅海频繁切换敷设策略。')
  }

  if (currentRouteSegments.value.length === 0) {
    alerts.push('尚未生成海缆段，当前建议仅用于路由阶段，请在分段后继续校核埋深、余量和锁定段。')
  }

  if (alerts.length === 0) {
    alerts.push('当前方案风险分布相对平稳，可继续进入海缆段生成与施工参数复核。')
  }

  return alerts.slice(0, 3)
})

const constructionRows = computed<ConstructionRow[]>(() => {
  const rows: ConstructionRow[] = []
  const high = riskBands.value.find(item => item.level === 'high')
  const medium = riskBands.value.find(item => item.level === 'medium')
  const low = riskBands.value.find(item => item.level === 'low')

  if ((high?.length || 0) > 0) {
    rows.push({
      title: '登陆与近岸保护段',
      length: high?.length || 0,
      cableType: high?.cableType || 'DA 双铠',
      advice: '建议优先采用双铠海缆，并核查保护范围和埋设方式。',
      note: '重点复核航道、渔区、锚害与登陆点附近的地形变化。',
    })
  }

  if ((medium?.length || 0) > 0) {
    rows.push({
      title: '陆坡过渡段',
      length: medium?.length || 0,
      cableType: medium?.cableType || 'SA 单铠',
      advice: '控制坡折段切换频率，保持连续施工窗口。',
      note: '建议补做坡度与海床复核，减少频繁调整敷设参数。',
    })
  }

  if ((low?.length || 0) > 0) {
    rows.push({
      title: '深海主干段',
      length: low?.length || 0,
      cableType: low?.cableType || 'LW 轻型',
      advice: '以轻型缆直铺为主，重点控制张力与余量。',
      note: '深海连续作业应优先关注张力曲线和异常回收预案。',
    })
  }

  return rows
})

const planningNotes = computed(() => {
  const overview = routeOverview.value
  const notes: string[] = []

  if (!overview) return notes

  if (overview.totalLength > 300) {
    notes.push('路线较长，建议按登陆段、过渡段、深海段拆分组织施工。')
  }

  if (overview.maxDepth > 4000) {
    notes.push('深海段较深，需提前确认船舶张力窗口和应急回收方案。')
  }

  if (segmentSummary.value) {
    if (segmentSummary.value.avgSlack > 6) {
      notes.push(`当前平均余量 ${segmentSummary.value.avgSlack.toFixed(1)}%，仍有压缩空间。`)
    }
    if (segmentSummary.value.avgBurialDepth < 1.2) {
      notes.push(`当前平均埋深 ${segmentSummary.value.avgBurialDepth.toFixed(1)} m，建议复核浅海保护要求。`)
    }
  } else {
    notes.push('尚未生成海缆段，当前建议仍为规划阶段参考。')
  }

  return notes.slice(0, 4)
})

const formatKm = (value: number) => `${value.toFixed(1)} km`
const formatCost = (value: number) => {
  if (value >= 100000) return `${(value / 100000).toFixed(2)} 亿元`
  if (value >= 1000) return `${(value / 10).toFixed(1)} 万元`
  return `${value.toFixed(0)} 千元`
}
const formatRiskScore = (value?: number) => {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${(Math.max(0, Math.min(1, value)) * 10).toFixed(2)} / 10`
}

const bandStyles = (level: RiskLevel) => {
  if (level === 'high') {
    return {
      dot: 'bg-rose-500',
      text: 'text-rose-700',
      bar: 'bg-rose-500',
      tag: 'bg-rose-50 text-rose-700',
    }
  }
  if (level === 'medium') {
    return {
      dot: 'bg-amber-500',
      text: 'text-amber-700',
      bar: 'bg-amber-500',
      tag: 'bg-amber-50 text-amber-700',
    }
  }
  return {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
    tag: 'bg-emerald-50 text-emerald-700',
  }
}

const selectRoute = (routeId: string) => {
  routeStore.selectRoute(routeId)
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-white">
    <div v-if="!currentRoute" class="flex flex-1 items-center justify-center px-6 text-center">
      <div class="space-y-2">
        <div class="text-sm font-semibold text-slate-700">暂无路线结果</div>
        <div class="text-xs leading-6 text-slate-500">
          完成路由规划后，这里会显示风险分布、方案比选和施工建议。
        </div>
      </div>
    </div>

    <template v-else>
      <div class="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex items-center gap-2">
            <span class="shrink-0 text-[11px] text-slate-500">当前方案</span>
            <span class="truncate text-sm font-semibold text-slate-800">{{ currentRouteLabel }}</span>
          </div>
          <div class="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
            KP 0 - {{ routeOverview?.totalLength.toFixed(0) || '0' }}
          </div>
        </div>
        <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span v-for="item in summaryItems" :key="item">{{ item }}</span>
        </div>
      </div>

      <div class="border-b border-slate-200 bg-white px-3">
        <div class="flex items-center gap-5 overflow-x-auto">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="border-b-2 px-0 py-2 text-[13px] font-medium whitespace-nowrap transition-colors"
            :class="activeTab === tab.key
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto bg-white px-2.5 py-2.5">
        <template v-if="activeTab === 'risk'">
          <section class="mb-2.5 overflow-hidden rounded border border-slate-200">
            <div class="grid grid-cols-3 gap-px bg-slate-200">
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">算法总成本</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ routeOverview ? formatCost(routeOverview.algorithmTotalCost) : '--' }}
                </div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">风险评分</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ formatRiskScore(routeOverview?.riskScore) }}
                </div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">铠装估算</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ formatCost(armorEstimatedCost) }}
                </div>
              </div>
            </div>
          </section>

          <section class="overflow-hidden rounded border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-[13px] font-semibold text-slate-800">风险分布</span>
              <span class="text-[11px] text-slate-500">{{ routeOverview?.geometrySegments || 0 }} 段几何线</span>
            </div>
            <div class="divide-y divide-slate-200">
              <div v-for="band in riskBands" :key="band.level" class="px-3 py-2.5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="h-2 w-2 rounded-full" :class="bandStyles(band.level).dot" />
                      <span class="text-[13px] font-semibold" :class="bandStyles(band.level).text">
                        {{ band.label }}
                      </span>
                      <span class="rounded px-1.5 py-0.5 text-[11px]" :class="bandStyles(band.level).tag">
                        {{ band.cableType }}
                      </span>
                    </div>
                    <div class="mt-1 text-[11px] text-slate-500">{{ band.advice }}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-[13px] font-semibold text-slate-800">{{ formatKm(band.length) }}</div>
                    <div class="text-[11px] text-slate-500">{{ (band.ratio * 100).toFixed(0) }}%</div>
                  </div>
                </div>
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full"
                    :class="bandStyles(band.level).bar"
                    :style="{ width: `${Math.max(band.length > 0 ? 8 : 0, band.ratio * 100)}%` }"
                  />
                </div>
                <div class="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>单价 {{ band.unitPrice.toFixed(1) }} 千元/km</span>
                  <span>估算 {{ formatCost(band.cost) }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="mt-2.5 overflow-hidden rounded border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-[13px] font-semibold text-slate-800">地图选中线段</span>
              <span class="text-[11px] text-slate-500">与主图联动</span>
            </div>
            <div v-if="selectedSegment" class="grid grid-cols-2 gap-px bg-slate-200">
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">线段 ID</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">{{ selectedSegment.id }}</div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">风险等级</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ getRiskLabel(selectedSegment.riskLevel) }}
                </div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">线段长度</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ formatKm(selectedSegment.length || 0) }}
                </div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">代表水深</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ Math.round(selectedSegment.depth || 0) }} m
                </div>
              </div>
            </div>
            <div v-else class="px-3 py-2.5 text-[12px] leading-5 text-slate-500">
              在地图中点击任意线段后，这里会显示当前线段的长度、水深和风险等级。
            </div>
          </section>

          <section class="mt-2.5 overflow-hidden rounded border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-[13px] font-semibold text-slate-800">规划提示</span>
              <span class="text-[11px] text-slate-500">{{ planningAlerts.length }} 条</span>
            </div>
            <div class="divide-y divide-slate-200">
              <div v-for="(alert, index) in planningAlerts" :key="index" class="px-3 py-2.5">
                <div class="text-[12px] font-semibold text-slate-700">提示 {{ index + 1 }}</div>
                <div class="mt-1 text-[12px] leading-5 text-slate-500">{{ alert }}</div>
              </div>
            </div>
          </section>
        </template>

        <template v-else-if="activeTab === 'compare'">
          <section class="overflow-hidden rounded border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-[13px] font-semibold text-slate-800">Pareto 方案比较</span>
              <span class="text-[11px] text-slate-500">{{ compareRows.length }} 条路径</span>
            </div>
            <div class="divide-y divide-slate-200">
              <button
                v-for="row in compareRows"
                :key="row.id"
                type="button"
                class="w-full px-3 py-2.5 text-left transition-colors"
                :class="row.isCurrent ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'"
                @click="selectRoute(row.id)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="text-[13px] font-semibold text-slate-800">{{ row.label }}</div>
                  <span
                    class="rounded px-1.5 py-0.5 text-[11px]"
                    :class="row.isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'"
                  >
                    {{ row.isCurrent ? '当前' : '切换' }}
                  </span>
                </div>
                <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <div>总长：<span class="font-semibold text-slate-700">{{ formatKm(row.length) }}</span></div>
                  <div>算法成本：<span class="font-semibold text-slate-700">{{ formatCost(row.cost) }}</span></div>
                  <div>风险评分：<span class="font-semibold text-slate-700">{{ formatRiskScore(row.risk) }}</span></div>
                  <div>高风险：<span class="font-semibold text-slate-700">{{ formatKm(row.highRiskLength) }}</span></div>
                </div>
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="overflow-hidden rounded border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-[13px] font-semibold text-slate-800">施工建议</span>
              <span class="text-[11px] text-slate-500">{{ constructionRows.length }} 类海域</span>
            </div>
            <div class="divide-y divide-slate-200">
              <div v-for="row in constructionRows" :key="row.title" class="px-3 py-2.5">
                <div class="flex items-center justify-between gap-3">
                  <div class="text-[13px] font-semibold text-slate-800">{{ row.title }}</div>
                  <div class="text-[11px] text-slate-500">{{ formatKm(row.length) }}</div>
                </div>
                <div class="mt-1 text-[11px] text-slate-500">{{ row.cableType }}</div>
                <div class="mt-1 text-[12px] text-slate-700">{{ row.advice }}</div>
                <div class="mt-1 text-[11px] leading-5 text-slate-500">{{ row.note }}</div>
              </div>
            </div>
          </section>

          <section class="mt-2.5 overflow-hidden rounded border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-[13px] font-semibold text-slate-800">施工校核</span>
              <span class="text-[11px] text-slate-500">{{ segmentSummary ? '已分段' : '待分段' }}</span>
            </div>
            <div class="grid grid-cols-2 gap-px bg-slate-200">
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">平均段长</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ segmentSummary ? formatKm(segmentSummary.avgLength) : '--' }}
                </div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">平均埋深</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ segmentSummary ? `${segmentSummary.avgBurialDepth.toFixed(1)} m` : '--' }}
                </div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">平均余量</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ segmentSummary ? `${segmentSummary.avgSlack.toFixed(1)} %` : '--' }}
                </div>
              </div>
              <div class="bg-white px-3 py-2">
                <div class="text-[11px] text-slate-500">锁定段数</div>
                <div class="mt-1 text-[13px] font-semibold text-slate-800">
                  {{ segmentSummary ? `${segmentSummary.lockedCount} 段` : '--' }}
                </div>
              </div>
            </div>
          </section>

          <section class="mt-2.5 overflow-hidden rounded border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-[13px] font-semibold text-slate-800">备注</span>
              <span class="text-[11px] text-slate-500">{{ planningNotes.length }} 条</span>
            </div>
            <div class="space-y-2 p-3">
              <div
                v-for="note in planningNotes"
                :key="note"
                class="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600"
              >
                {{ note }}
              </div>
            </div>
          </section>
        </template>
      </div>
    </template>
  </div>
</template>
