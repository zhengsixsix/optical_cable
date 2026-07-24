<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { AlertTriangle, CheckCircle2, Database, Route as RouteIcon } from 'lucide-vue-next'
import { useRouteStore } from '@/stores/route'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import type {
  NumericSeriesStats,
  SegmentResultAnalysis,
} from '@/services/RouteDataConverter'

type SegmentKind = SegmentResultAnalysis['kind']

const routeStore = useRouteStore()
const dictionaryStore = useDictionaryStore()
const selectedSegmentKind = ref<SegmentKind>('riskBased')

const result = computed(() => routeStore.algorithmRouteResult)
const currentRoute = computed(() => routeStore.selectedRoute ?? result.value?.routes[0] ?? null)
const originalRouteIndex = computed(() => currentRoute.value?.algorithmSummary?.originalFmmIndex)
const routeSegmentAnalyses = computed(() => {
  const routeIndex = originalRouteIndex.value
  if (routeIndex === undefined) return []
  return result.value?.analysis?.segmentResults?.filter(item => item.routeIndex === routeIndex) ?? []
})
const availableSegmentKinds = computed(() => routeSegmentAnalyses.value.map(item => item.kind))

watch(
  [() => currentRoute.value?.id, availableSegmentKinds],
  () => {
    if (!availableSegmentKinds.value.includes(selectedSegmentKind.value)) {
      selectedSegmentKind.value = availableSegmentKinds.value[0] ?? 'riskBased'
    }
  },
  { immediate: true },
)

const selectedSegmentAnalysis = computed(() =>
  routeSegmentAnalyses.value.find(item => item.kind === selectedSegmentKind.value) ?? null,
)

const fileRows = computed(() => {
  const files = result.value?.rawResultFiles
  if (!files) return []
  const labels: Array<[keyof typeof files, string]> = [
    ['FMM_path_result.json', 'FMM 路由'],
    ['segment_result_base_Risk.json', '风险分段'],
    ['segment_result_base_FixSpacing.json', '固定间距分段'],
    ['cost.txt', '成本序列'],
    ['risk.txt', '风险序列'],
    ['pointList', '站点'],
  ]
  return labels
    .filter(([key]) => Object.prototype.hasOwnProperty.call(files, key))
    .map(([key, label]) => ({
      key,
      label,
      empty: files[key] === null,
    }))
})

const seriesRows = computed<Array<{ label: string; stats: NumericSeriesStats }>>(() => {
  const rows: Array<{ label: string; stats: NumericSeriesStats }> = []
  const analysis = result.value?.analysis
  if (analysis?.costSamples) rows.push({ label: '成本样本', stats: analysis.costSamples })
  if (analysis?.riskSamples) rows.push({ label: '风险样本', stats: analysis.riskSamples })
  return rows
})

const interpretationNotes = computed(() => {
  const notes = [...(result.value?.diagnostics.warnings ?? [])]
  for (const row of seriesRows.value) {
    if (row.stats.shape === 'flat') {
      notes.push(`${row.label}未包含可确认的二维行列结构，当前仅保留原始序列并统计数值。`)
    }
  }
  return notes
})

const segmentLengthDifference = computed(() => {
  const routeLength = currentRoute.value?.totalLength
  const segmentLength = selectedSegmentAnalysis.value?.totalLengthKm
  if (!Number.isFinite(routeLength) || !Number.isFinite(segmentLength)) return null
  return Math.abs(routeLength! - segmentLength!)
})

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 })
const compactFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const formatNumber = (value: number | undefined) =>
  Number.isFinite(value) ? numberFormatter.format(value!) : '--'

const formatCompact = (value: number | undefined) =>
  Number.isFinite(value) ? compactFormatter.format(value!) : '--'

const formatLength = (value: number | undefined) =>
  Number.isFinite(value) ? `${numberFormatter.format(value!)} km` : '--'

const coordinateOrderLabel = computed(() => {
  const order = currentRoute.value?.algorithmSummary?.coordinateOrder
  if (order === 'latitude-longitude') return '纬度 / 经度'
  if (order === 'longitude-latitude') return '经度 / 纬度'
  return '--'
})

const segmentKindLabel = (kind: SegmentKind) => kind === 'riskBased' ? '风险分段' : '固定间距'
const riskLevelLabel = (value: string | null) => value === null ? '未提供等级' : `接口等级 ${value}`
const cableTypeLabel = (value: string | null) =>
  dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.armoringType, value)?.name || value || '未提供缆型'
const ratioOf = (lengthKm: number) => {
  const total = selectedSegmentAnalysis.value?.totalLengthKm
  return Number.isFinite(total) && total! > 0 ? lengthKm / total! : 0
}
const barClasses = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500']

onMounted(() => {
  void dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType).catch(() => undefined)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-white">
    <div v-if="!result" class="flex flex-1 items-center justify-center px-5 text-center">
      <div>
        <Database class="mx-auto h-5 w-5 text-slate-400" />
        <div class="mt-2 text-sm font-medium text-slate-700">暂无路由结果</div>
        <div class="mt-1 text-xs text-slate-500">当前项目未返回可分析的路由数据</div>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <section v-if="currentRoute" class="border-b border-slate-200">
        <div class="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
          <div class="min-w-0">
            <div class="truncate text-[13px] font-semibold text-slate-800">{{ currentRoute.name }}</div>
            <div class="mt-0.5 text-[11px] text-slate-500">
              FMM #{{ (originalRouteIndex ?? 0) + 1 }} · real_trace {{ currentRoute.algorithmSummary?.realTracePointCount ?? 0 }} 点
            </div>
          </div>
          <span class="shrink-0 text-[11px] text-slate-500">{{ coordinateOrderLabel }}</span>
        </div>

        <div class="grid grid-cols-3 divide-x divide-slate-200">
          <div class="min-w-0 px-2 py-2">
            <div class="text-[10px] text-slate-500">算法总成本</div>
            <div class="mt-1 truncate text-[12px] font-semibold tabular-nums text-slate-800" :title="formatNumber(currentRoute.cost.total)">
              {{ formatCompact(currentRoute.cost.total) }}
            </div>
          </div>
          <div class="min-w-0 px-2 py-2">
            <div class="text-[10px] text-slate-500">算法总风险</div>
            <div class="mt-1 truncate text-[12px] font-semibold tabular-nums text-slate-800" :title="formatNumber(currentRoute.risk.overall)">
              {{ formatCompact(currentRoute.risk.overall) }}
            </div>
          </div>
          <div class="min-w-0 px-2 py-2">
            <div class="text-[10px] text-slate-500">路由长度</div>
            <div class="mt-1 truncate text-[12px] font-semibold tabular-nums text-slate-800" :title="formatLength(currentRoute.totalLength)">
              {{ formatLength(currentRoute.totalLength) }}
            </div>
          </div>
        </div>
      </section>

      <section class="border-b border-slate-200 px-3 py-2.5">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[12px] font-semibold text-slate-700">结果文件</span>
          <span class="text-[11px] text-slate-500">{{ fileRows.length }} 项</span>
        </div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div v-for="file in fileRows" :key="file.key" class="flex min-w-0 items-center gap-1.5 text-[11px]">
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="file.empty ? 'bg-slate-300' : 'bg-emerald-500'" />
            <span class="truncate text-slate-600">{{ file.label }}</span>
            <span v-if="file.empty" class="shrink-0 text-slate-400">空</span>
          </div>
        </div>
      </section>

      <section v-if="currentRoute" class="border-b border-slate-200 px-3 py-2.5">
        <div class="mb-2 text-[12px] font-semibold text-slate-700">路径几何校验</div>
        <div class="flex items-start gap-2 text-[11px] leading-5 text-slate-600">
          <CheckCircle2 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <div>
            <div>有效 real_trace：{{ currentRoute.algorithmSummary?.realTracePointCount ?? 0 }} 点</div>
            <div v-if="selectedSegmentAnalysis?.totalLengthKm !== undefined">
              {{ segmentKindLabel(selectedSegmentAnalysis.kind) }}合计 {{ formatLength(selectedSegmentAnalysis.totalLengthKm) }}
              <span v-if="segmentLengthDifference !== null">，与路线差 {{ formatLength(segmentLengthDifference) }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="routeSegmentAnalyses.length > 0" class="border-b border-slate-200">
        <div class="flex items-center justify-between gap-2 px-3 py-2">
          <span class="text-[12px] font-semibold text-slate-700">分段分析</span>
          <div v-if="availableSegmentKinds.length > 1" class="flex overflow-hidden border border-slate-200">
            <button
              v-for="kind in availableSegmentKinds"
              :key="kind"
              type="button"
              class="px-2 py-1 text-[10px]"
              :class="selectedSegmentKind === kind ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'"
              @click="selectedSegmentKind = kind"
            >
              {{ segmentKindLabel(kind) }}
            </button>
          </div>
        </div>

        <template v-if="selectedSegmentAnalysis">
          <div class="grid grid-cols-2 border-y border-slate-100 bg-slate-50 text-[11px] text-slate-600">
            <div class="px-3 py-1.5">分段 {{ selectedSegmentAnalysis.segmentCount }} 段</div>
            <div class="px-3 py-1.5 text-right">总长 {{ formatLength(selectedSegmentAnalysis.totalLengthKm) }}</div>
          </div>

          <div v-if="selectedSegmentAnalysis.riskLevels.length > 0" class="px-3 py-2.5">
            <div class="mb-2 text-[11px] font-medium text-slate-600">接口风险等级</div>
            <div class="space-y-2.5">
              <div v-for="(level, index) in selectedSegmentAnalysis.riskLevels" :key="level.value ?? 'missing'">
                <div class="flex items-center justify-between gap-3 text-[11px]">
                  <span class="truncate text-slate-600">{{ riskLevelLabel(level.value) }}</span>
                  <span class="shrink-0 font-medium tabular-nums text-slate-700">{{ formatLength(level.lengthKm) }}</span>
                </div>
                <div class="mt-1 h-1.5 overflow-hidden bg-slate-100">
                  <div
                    class="h-full"
                    :class="barClasses[index % barClasses.length]"
                    :style="{ width: `${Math.max(level.lengthKm > 0 ? 3 : 0, ratioOf(level.lengthKm) * 100)}%` }"
                  />
                </div>
                <div v-if="level.riskMin !== undefined || level.riskMax !== undefined" class="mt-1 text-[10px] tabular-nums text-slate-400">
                  原值 {{ formatNumber(level.riskMin) }} - {{ formatNumber(level.riskMax) }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="selectedSegmentAnalysis.cableTypes.length > 0" class="border-t border-slate-100 px-3 py-2.5">
            <div class="mb-2 text-[11px] font-medium text-slate-600">接口缆型分布</div>
            <div class="space-y-1.5">
              <div v-for="item in selectedSegmentAnalysis.cableTypes" :key="item.value ?? 'missing'" class="flex items-center justify-between gap-3 text-[11px]">
                <span class="truncate text-slate-600">{{ cableTypeLabel(item.value) }} · {{ item.segmentCount }} 段</span>
                <span class="shrink-0 font-medium tabular-nums text-slate-700">{{ formatLength(item.lengthKm) }}</span>
              </div>
            </div>
          </div>
        </template>
      </section>

      <section v-if="seriesRows.length > 0" class="border-b border-slate-200 px-3 py-2.5">
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          <Database class="h-3.5 w-3.5 text-slate-500" />
          成本与风险序列
        </div>
        <div class="space-y-2">
          <div v-for="row in seriesRows" :key="row.label" class="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
            <div class="flex items-center justify-between text-[11px]">
              <span class="font-medium text-slate-600">{{ row.label }}</span>
              <span class="text-slate-400">
                {{ row.stats.shape === 'matrix' ? `${row.stats.rows} × ${row.stats.columns}` : `${formatNumber(row.stats.sampleCount)} 项` }}
              </span>
            </div>
            <div class="mt-1 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
              <span>最小 {{ formatCompact(row.stats.min) }}</span>
              <span>均值 {{ formatCompact(row.stats.average) }}</span>
              <span class="text-right">最大 {{ formatCompact(row.stats.max) }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="interpretationNotes.length > 0" class="px-3 py-2.5">
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          <AlertTriangle class="h-3.5 w-3.5 text-amber-500" />
          数据判读
        </div>
        <div class="space-y-1.5">
          <div v-for="note in interpretationNotes" :key="note" class="text-[11px] leading-5 text-slate-500">
            {{ note }}
          </div>
        </div>
      </section>

      <section v-if="!currentRoute" class="flex items-start gap-2 px-3 py-3 text-[11px] leading-5 text-slate-500">
        <RouteIcon class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        结果包未包含可绘制的 real_trace 路线，原始返回数据已保留。
      </section>
    </div>
  </div>
</template>
