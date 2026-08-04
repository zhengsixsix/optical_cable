<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BarChart2, ChevronDown, ChevronUp, Cpu, FileText, Filter, Info, X } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import type { SimulationCache } from '@/types/useFile'

interface LinkCalculationSummaryInput {
  linkName?: string
  totalLength?: number
  systemCapacityTbps?: number
  systemConfig?: {
    spanCount?: number
    buCount?: number
    channelCount?: number
  }
}

const props = withDefaults(defineProps<{
  visible: boolean
  linkCalcSummary?: LinkCalculationSummaryInput | null
}>(), {
  linkCalcSummary: null,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

type MetricKey = 'gsnr' | 'osnr' | 'snr_ase' | 'snr_nli'
type MetricMatrixField =
  | 'gsnr_matrix_db'
  | 'osnr_matrix_db'
  | 'snr_ase_matrix_db'
  | 'snr_nli_matrix_db'
type OptionalPowerMatrixField =
  | 'signal_power_matrix_dbm'
  | 'ase_noise_power_matrix_dbm'
  | 'nli_noise_power_matrix_dbm'

interface AxisTick {
  value: string
  position: number
}

interface ChartPoint {
  cx: number
  cy: number
  index: number
  name: string
  value: string
}

interface EvolutionChart {
  metricKey: MetricKey
  metricLabel: string
  channelLabel: string
  color: string
  width: number
  height: number
  padding: typeof evolutionPadding
  path: string
  points: ChartPoint[]
  xTicks: Array<{ value: string; x: number; name: string; show: boolean }>
  yTicks: AxisTick[]
  xAxisY: number
}

interface SpectrumChart {
  metricKey: MetricKey
  metricLabel: string
  positionLabel: string
  color: string
  width: number
  height: number
  padding: typeof spectrumPadding
  path: string
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  xAxisY: number
}

interface TableRow {
  posIdx: number
  chIdx: number
  position: string
  distance: number | null
  channel: string
  frequency: number | null
  gsnr: number | null
  osnr: number | null
  snr_ase: number | null
  snr_nli: number | null
}

interface SummaryEntry {
  label: string
  value: string
}

const appStore = useAppStore()
const settingsStore = useSettingsStore()

const metricLabels: Record<MetricKey, string> = {
  gsnr: 'GSNR',
  osnr: 'OSNR',
  snr_ase: 'SNR_ASE',
  snr_nli: 'SNR_NLI',
}

const metricColors: Record<MetricKey, string> = {
  gsnr: '#3b82f6',
  osnr: '#8b5cf6',
  snr_ase: '#f59e0b',
  snr_nli: '#10b981',
}

const metricMatrixFields: Record<MetricKey, MetricMatrixField> = {
  gsnr: 'gsnr_matrix_db',
  osnr: 'osnr_matrix_db',
  snr_ase: 'snr_ase_matrix_db',
  snr_nli: 'snr_nli_matrix_db',
}

const allMetricKeys: MetricKey[] = ['gsnr', 'osnr', 'snr_ase', 'snr_nli']
const selectedMetric = ref<MetricKey>('gsnr')
const selectedMetrics = ref(new Set<MetricKey>(['gsnr', 'osnr']))
const selectedChannel = ref(0)
const selectedPosition = ref(-1)
const activeTab = ref<'evolution' | 'spectrum' | 'heatmap' | 'table'>('evolution')
const showNodeDetail = ref(false)
const selectedNodeIndex = ref(-1)

const cache = computed<SimulationCache | null>(() => {
  const value = settingsStore.simulationCache
  return value?.is_valid ? value : null
})

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function explicitCount(value: unknown): number {
  return isFiniteNumber(value) && value >= 0 ? Math.trunc(value) : 0
}

function textOrMissing(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '未提供'
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function numberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null
}

function formatNumber(value: unknown, digits = 2, unit = ''): string {
  return isFiniteNumber(value) ? value.toFixed(digits) + unit : '未提供'
}

type ResultSource = '仿真响应' | '规划结果' | '规划配置'

interface SourcedNumber {
  value: number | null
  source: ResultSource | null
}

interface SourcedText {
  value: string | null
  source: ResultSource | null
}

function sourcedNumber(backendValue: unknown, planningValue: unknown): SourcedNumber {
  const backend = numberOrNull(backendValue)
  if (backend != null) return { value: backend, source: '仿真响应' }
  const planning = numberOrNull(planningValue)
  return planning == null
    ? { value: null, source: null }
    : { value: planning, source: '规划结果' }
}

function sourcedText(backendValue: unknown, planningValue: unknown): SourcedText {
  const backend = textOrNull(backendValue)
  if (backend) return { value: backend, source: '仿真响应' }
  const planning = textOrNull(planningValue)
  return planning
    ? { value: planning, source: '规划配置' }
    : { value: null, source: null }
}

const displayedSummary = computed(() => ({
  totalLength: sourcedNumber(
    cache.value?.summary?.total_length_km,
    props.linkCalcSummary?.totalLength,
  ),
  spanCount: sourcedNumber(
    cache.value?.summary?.total_span_count,
    props.linkCalcSummary?.systemConfig?.spanCount,
  ),
  capacity: sourcedNumber(
    cache.value?.summary?.system_capacity_tbps,
    props.linkCalcSummary?.systemCapacityTbps,
  ),
}))

const planningModels = computed(() => settingsStore.systemPlanningCache?.model_selection ?? null)
const displayedModels = computed(() => {
  const buCount = numberOrNull(props.linkCalcSummary?.systemConfig?.buCount)
  const bu = sourcedText(
    cache.value?.model_selection?.bu_model_id,
    planningModels.value?.bu_model_id,
  )
  return {
    fiber: sourcedText(
      cache.value?.model_selection?.fiber_model_id,
      planningModels.value?.fiber_model_id,
    ),
    edfa: sourcedText(
      cache.value?.model_selection?.edfa_model_id,
      planningModels.value?.edfa_model_id,
    ),
    bu: bu.value || buCount !== 0
      ? bu
      : { value: '不适用（0 BU）', source: '规划结果' as const },
  }
})

function readArrayNumber(values: unknown, index: number): number | null {
  if (!Array.isArray(values)) return null
  return numberOrNull(values[index])
}

function metricMatrixFor(source: SimulationCache | null, metric: MetricKey): number[][] | null {
  if (!source?.metrics) return null
  const value = source.metrics[metricMatrixFields[metric]]
  return Array.isArray(value) ? value : null
}

function optionalPowerMatrixFor(
  source: SimulationCache | null,
  field: OptionalPowerMatrixField,
): number[][] | null {
  if (!source?.metrics) return null
  const value = source.metrics[field]
  return Array.isArray(value) ? value : null
}

function matrixNumber(matrix: number[][] | null, row: number, column: number): number | null {
  return numberOrNull(matrix?.[row]?.[column])
}

function metricValue(source: SimulationCache | null, metric: MetricKey, row: number, column: number): number | null {
  return matrixNumber(metricMatrixFor(source, metric), row, column)
}

function toggleMetric(metric: MetricKey) {
  const next = new Set(selectedMetrics.value)
  if (next.has(metric)) {
    if (next.size > 1) next.delete(metric)
  } else {
    next.add(metric)
  }
  selectedMetrics.value = next
}

const positionCount = computed(() => explicitCount(cache.value?.positions?.count))
const channelCount = computed(() => explicitCount(cache.value?.channels?.count))

const linkInfo = computed(() => {
  const current = cache.value
  const planning = props.linkCalcSummary
  if (!current) {
    return {
      linkName: planning?.linkName || '暂无后端仿真结果',
      totalLength: displayedSummary.value.totalLength.value,
      channelCount: numberOrNull(planning?.systemConfig?.channelCount),
    }
  }
  const fromStation = textOrNull(current.route_ref?.from_station)
  const toStation = textOrNull(current.route_ref?.to_station)
  return {
    linkName: fromStation && toStation
      ? fromStation + ' ⇄ ' + toStation
      : planning?.linkName || '未提供',
    totalLength: displayedSummary.value.totalLength.value,
    channelCount: numberOrNull(current.channels?.count)
      ?? numberOrNull(planning?.systemConfig?.channelCount),
  }
})

const channelOptions = computed(() => {
  const current = cache.value
  if (!current) return []
  return Array.from({ length: channelCount.value }, (_, index) => {
    const id = textOrMissing(current.channels?.ids?.[index])
    const frequency = readArrayNumber(current.channels?.frequencies_thz, index)
    return {
      value: index,
      label: id + ' (' + formatNumber(frequency, 3, ' THz') + ')',
    }
  })
})

const positionOptions = computed(() => {
  const current = cache.value
  if (!current) return []
  return Array.from({ length: positionCount.value }, (_, index) => {
    const name = textOrMissing(current.positions?.names?.[index])
    const distance = readArrayNumber(current.positions?.distances_km, index)
    return {
      value: index,
      label: name + ' (' + formatNumber(distance, 1, ' km') + ')',
    }
  })
})

const selectedPositionIndex = computed(() => {
  if (positionCount.value <= 0) return -1
  if (selectedPosition.value >= 0 && selectedPosition.value < positionCount.value) {
    return selectedPosition.value
  }
  return positionCount.value - 1
})

watch(channelOptions, (options) => {
  if (!options.some(option => option.value === selectedChannel.value)) {
    selectedChannel.value = options[0]?.value ?? 0
  }
})

watch(positionOptions, () => {
  if (selectedPosition.value >= positionCount.value) selectedPosition.value = -1
})

const backendSummaryEntries = computed<SummaryEntry[]>(() => {
  const current = cache.value
  if (!current) return []
  const summary = current.summary
  const finalGsnr = summary?.final_gsnr
  const finalOsnr = summary?.final_osnr
  return [
    { label: '总长度', value: formatNumber(summary?.total_length_km, 2, ' km') },
    { label: 'Span 数', value: formatNumber(summary?.total_span_count, 0) },
    { label: '系统容量', value: formatNumber(summary?.system_capacity_tbps, 3, ' Tbps') },
    { label: '终端 GSNR 平均值', value: formatNumber(finalGsnr?.avg_db, 2, ' dB') },
    { label: '终端 GSNR 最小值', value: formatNumber(finalGsnr?.min_db, 2, ' dB') },
    { label: '终端 GSNR 最大值', value: formatNumber(finalGsnr?.max_db, 2, ' dB') },
    { label: '后端标记的最差信道', value: textOrMissing(finalGsnr?.worst_channel) },
    { label: '后端标记的最佳信道', value: textOrMissing(finalGsnr?.best_channel) },
    { label: '终端 OSNR 平均值', value: formatNumber(finalOsnr?.avg_db, 2, ' dB') },
    { label: '终端 OSNR 最小值', value: formatNumber(finalOsnr?.min_db, 2, ' dB') },
  ]
})

function backendSummaryPayload() {
  const current = cache.value
  if (!current) return null
  const summary = current.summary
  const finalGsnr = summary?.final_gsnr
  const finalOsnr = summary?.final_osnr
  return {
    total_length_km: numberOrNull(summary?.total_length_km),
    total_span_count: numberOrNull(summary?.total_span_count),
    system_capacity_tbps: numberOrNull(summary?.system_capacity_tbps),
    final_gsnr: {
      avg_db: numberOrNull(finalGsnr?.avg_db),
      min_db: numberOrNull(finalGsnr?.min_db),
      max_db: numberOrNull(finalGsnr?.max_db),
      worst_channel: textOrNull(finalGsnr?.worst_channel),
      best_channel: textOrNull(finalGsnr?.best_channel),
    },
    final_osnr: {
      avg_db: numberOrNull(finalOsnr?.avg_db),
      min_db: numberOrNull(finalOsnr?.min_db),
    },
  }
}

const evolutionPadding = { top: 30, right: 30, bottom: 80, left: 65 }
const spectrumPadding = { top: 30, right: 30, bottom: 50, left: 65 }
const chartWidth = 680

function createAxis(
  values: number[],
  pixelStart: number,
  pixelEnd: number,
  tickCount = 5,
  padding = 0,
) {
  if (values.length === 0) return null
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  } else if (padding > 0) {
    min -= padding
    max += padding
  }
  const scale = (value: number) =>
    pixelStart + ((value - min) / (max - min)) * (pixelEnd - pixelStart)
  const ticks: AxisTick[] = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = min + ((max - min) * index) / tickCount
    return {
      value: value.toFixed(1),
      position: scale(value),
    }
  })
  return { scale, ticks }
}

const evolutionCharts = computed<EvolutionChart[]>(() => {
  const current = cache.value
  if (!current || selectedChannel.value < 0) return []
  const result: EvolutionChart[] = []

  for (const metric of selectedMetrics.value) {
    const matrix = metricMatrixFor(current, metric)
    if (!matrix) continue

    const rawPoints: Array<{
      index: number
      x: number
      y: number
      name: string
    }> = []
    for (let index = 0; index < positionCount.value; index += 1) {
      const x = readArrayNumber(current.positions?.distances_km, index)
      const y = matrixNumber(matrix, index, selectedChannel.value)
      if (x == null || y == null) continue
      rawPoints.push({
        index,
        x,
        y,
        name: textOrMissing(current.positions?.names?.[index]),
      })
    }
    if (rawPoints.length === 0) continue

    const width = chartWidth
    const height = 380
    const xAxis = createAxis(
      rawPoints.map(point => point.x),
      evolutionPadding.left,
      width - evolutionPadding.right,
    )
    const yAxis = createAxis(
      rawPoints.map(point => point.y),
      height - evolutionPadding.bottom,
      evolutionPadding.top,
      5,
      2,
    )
    if (!xAxis || !yAxis) continue

    const points: ChartPoint[] = rawPoints.map(point => ({
      cx: xAxis.scale(point.x),
      cy: yAxis.scale(point.y),
      index: point.index,
      name: point.name,
      value: point.y.toFixed(2),
    }))
    const labelStep = rawPoints.length > 15 ? Math.ceil(rawPoints.length / 15) : 1
    const xTicks = rawPoints.map((point, index) => ({
      value: point.x.toFixed(point.x > 100 ? 0 : 1),
      x: xAxis.scale(point.x),
      name: point.name,
      show: index % labelStep === 0 || index === rawPoints.length - 1,
    }))
    const channelLabel = channelOptions.value.find(
      option => option.value === selectedChannel.value,
    )?.label ?? '未提供'

    result.push({
      metricKey: metric,
      metricLabel: metricLabels[metric],
      channelLabel,
      color: metricColors[metric],
      width,
      height,
      padding: evolutionPadding,
      path: points.map((point, index) =>
        (index === 0 ? 'M ' : 'L ') + point.cx + ' ' + point.cy).join(' '),
      points,
      xTicks,
      yTicks: yAxis.ticks,
      xAxisY: height - evolutionPadding.bottom,
    })
  }
  return result
})

const spectrumCharts = computed<SpectrumChart[]>(() => {
  const current = cache.value
  const positionIndex = selectedPositionIndex.value
  if (!current || positionIndex < 0) return []
  const result: SpectrumChart[] = []

  for (const metric of selectedMetrics.value) {
    const matrix = metricMatrixFor(current, metric)
    if (!matrix) continue
    const rawPoints: Array<{ x: number; y: number }> = []
    for (let channelIndex = 0; channelIndex < channelCount.value; channelIndex += 1) {
      const x = readArrayNumber(current.channels?.frequencies_thz, channelIndex)
      const y = matrixNumber(matrix, positionIndex, channelIndex)
      if (x == null || y == null) continue
      rawPoints.push({ x, y })
    }
    if (rawPoints.length === 0) continue

    const width = chartWidth
    const height = 260
    const xAxis = createAxis(
      rawPoints.map(point => point.x),
      spectrumPadding.left,
      width - spectrumPadding.right,
    )
    const yAxis = createAxis(
      rawPoints.map(point => point.y),
      height - spectrumPadding.bottom,
      spectrumPadding.top,
      5,
      2,
    )
    if (!xAxis || !yAxis) continue

    const plotted = rawPoints.map(point => ({
      x: xAxis.scale(point.x),
      y: yAxis.scale(point.y),
    }))
    const tickStep = Math.max(1, Math.ceil(rawPoints.length / 7))
    const xTicks = rawPoints
      .filter((_, index) => index % tickStep === 0 || index === rawPoints.length - 1)
      .map(point => ({
        value: point.x.toFixed(2),
        position: xAxis.scale(point.x),
      }))

    result.push({
      metricKey: metric,
      metricLabel: metricLabels[metric],
      positionLabel: textOrMissing(current.positions?.names?.[positionIndex]),
      color: metricColors[metric],
      width,
      height,
      padding: spectrumPadding,
      path: plotted.map((point, index) =>
        (index === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y).join(' '),
      xTicks,
      yTicks: yAxis.ticks,
      xAxisY: height - spectrumPadding.bottom,
    })
  }
  return result
})

const currentMatrix = computed(() => metricMatrixFor(cache.value, selectedMetric.value))

const heatmapData = computed(() => {
  const current = cache.value
  const matrix = currentMatrix.value
  if (!current || !matrix || positionCount.value <= 0 || channelCount.value <= 0) return null

  const maxDisplayedChannels = 48
  const channelStep = Math.max(1, Math.ceil(channelCount.value / maxDisplayedChannels))
  const sampledChannelIndices: number[] = []
  for (let index = 0; index < channelCount.value; index += channelStep) {
    sampledChannelIndices.push(index)
  }

  const cells: Array<{
    row: number
    col: number
    value: number
    channelIndex: number
    positionIndex: number
  }> = []
  for (let row = 0; row < sampledChannelIndices.length; row += 1) {
    const channelIndex = sampledChannelIndices[row]
    for (let col = 0; col < positionCount.value; col += 1) {
      const value = matrixNumber(matrix, col, channelIndex)
      if (value == null) continue
      cells.push({ row, col, value, channelIndex, positionIndex: col })
    }
  }
  if (cells.length === 0) return null

  const colorValues = cells.map(cell => cell.value)
  const colorMin = Math.min(...colorValues)
  const colorMax = Math.max(...colorValues)
  const padLeft = 70
  const padRight = 10
  const padTop = 5
  const padBottom = 65
  const cellWidth = Math.max(18, Math.floor(560 / positionCount.value))
  const cellHeight = Math.max(5, Math.floor(350 / sampledChannelIndices.length))
  const xLabelStep = Math.max(1, Math.ceil(positionCount.value / 15))
  const yLabelStep = Math.max(1, Math.ceil(sampledChannelIndices.length / 12))

  return {
    cells,
    rowCount: sampledChannelIndices.length,
    colCount: positionCount.value,
    rowLabels: sampledChannelIndices.map(index =>
      textOrMissing(current.channels?.ids?.[index])),
    colLabels: Array.from({ length: positionCount.value }, (_, index) =>
      textOrMissing(current.positions?.names?.[index])),
    colDistances: Array.from({ length: positionCount.value }, (_, index) =>
      readArrayNumber(current.positions?.distances_km, index)),
    colorMin,
    colorMax,
    cellWidth,
    cellHeight,
    padLeft,
    padRight,
    padTop,
    padBottom,
    svgWidth: padLeft + positionCount.value * cellWidth + padRight,
    svgHeight: padTop + sampledChannelIndices.length * cellHeight + padBottom,
    xLabelStep,
    yLabelStep,
  }
})

function getHeatColor(value: number, min: number, max: number): string {
  if (max <= min) return '#3b82f6'
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)))
  let red: number
  let green: number
  let blue: number
  if (ratio < 0.25) {
    const step = ratio / 0.25
    red = 0
    green = Math.round(step * 255)
    blue = 255
  } else if (ratio < 0.5) {
    const step = (ratio - 0.25) / 0.25
    red = 0
    green = 255
    blue = Math.round((1 - step) * 255)
  } else if (ratio < 0.75) {
    const step = (ratio - 0.5) / 0.25
    red = Math.round(step * 255)
    green = 255
    blue = 0
  } else {
    const step = (ratio - 0.75) / 0.25
    red = 255
    green = Math.round((1 - step) * 255)
    blue = 0
  }
  return 'rgb(' + red + ',' + green + ',' + blue + ')'
}

function getHeatTooltip(cell: {
  row: number
  col: number
  value: number
}): string {
  const data = heatmapData.value
  if (!data) return ''
  return [
    data.rowLabels[cell.row] + ' @ ' + data.colLabels[cell.col],
    '位置: ' + formatNumber(data.colDistances[cell.col], 1, ' km'),
    metricLabels[selectedMetric.value] + ': ' + formatNumber(cell.value, 2, ' dB'),
  ].join('\n')
}

const tablePositionFilter = ref<'all' | 'rx'>('all')
const tableChannelFilter = ref<'all' | number>('all')
const tableMetricSet = ref(new Set<MetricKey>(allMetricKeys))
const tablePage = ref(1)
const tablePageSize = 50
const tableSortKey = ref<keyof TableRow>('posIdx')
const tableSortDir = ref<'asc' | 'desc'>('asc')

function toggleTableMetric(metric: MetricKey) {
  const next = new Set(tableMetricSet.value)
  if (next.has(metric)) {
    if (next.size > 1) next.delete(metric)
  } else {
    next.add(metric)
  }
  tableMetricSet.value = next
}

function toggleTableSort(key: keyof TableRow) {
  if (tableSortKey.value === key) {
    tableSortDir.value = tableSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    tableSortKey.value = key
    tableSortDir.value = 'asc'
  }
  tablePage.value = 1
}

watch([tableChannelFilter, tablePositionFilter], () => {
  tablePage.value = 1
})

const filteredTableRows = computed<TableRow[]>(() => {
  const current = cache.value
  if (!current) return []

  const positionIndices = tablePositionFilter.value === 'rx'
    ? (positionCount.value > 0 ? [positionCount.value - 1] : [])
    : Array.from({ length: positionCount.value }, (_, index) => index)
  const channelIndices = tableChannelFilter.value === 'all'
    ? Array.from({ length: channelCount.value }, (_, index) => index)
    : [tableChannelFilter.value]

  const rows: TableRow[] = []
  for (const posIdx of positionIndices) {
    for (const chIdx of channelIndices) {
      rows.push({
        posIdx,
        chIdx,
        position: textOrMissing(current.positions?.names?.[posIdx]),
        distance: readArrayNumber(current.positions?.distances_km, posIdx),
        channel: textOrMissing(current.channels?.ids?.[chIdx]),
        frequency: readArrayNumber(current.channels?.frequencies_thz, chIdx),
        gsnr: metricValue(current, 'gsnr', posIdx, chIdx),
        osnr: metricValue(current, 'osnr', posIdx, chIdx),
        snr_ase: metricValue(current, 'snr_ase', posIdx, chIdx),
        snr_nli: metricValue(current, 'snr_nli', posIdx, chIdx),
      })
    }
  }

  const direction = tableSortDir.value === 'asc' ? 1 : -1
  const key = tableSortKey.value
  rows.sort((left, right) => {
    const leftValue = left[key]
    const rightValue = right[key]
    if (leftValue == null && rightValue == null) return 0
    if (leftValue == null) return 1
    if (rightValue == null) return -1
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction
    }
    return String(leftValue).localeCompare(String(rightValue)) * direction
  })
  return rows
})

const tableRowCount = computed(() => filteredTableRows.value.length)
const tablePageCount = computed(() =>
  Math.max(1, Math.ceil(tableRowCount.value / tablePageSize)))
const pagedTableRows = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize
  return filteredTableRows.value.slice(start, start + tablePageSize)
})

watch(tablePageCount, (count) => {
  if (tablePage.value > count) tablePage.value = count
})

const showExportDialog = ref(false)
const exportAllData = ref(true)
const exportFormat = ref<'csv' | 'xlsx' | 'json'>('csv')
const exportIncludeHeader = ref(true)
const exportIncludeUnit = ref(true)
const exportIncludeSummary = ref(false)
const exportFileName = ref('simulation_result_filtered')

function openExportDialog(allData: boolean) {
  exportAllData.value = allData
  exportFileName.value = allData ? 'simulation_result_all' : 'simulation_result_page'
  showExportDialog.value = true
}

const exportRowCount = computed(() =>
  exportAllData.value ? filteredTableRows.value.length : pagedTableRows.value.length)

function delimitedCell(value: unknown, delimiter: string): string {
  const text = String(value ?? '')
  if (text.includes(delimiter) || text.includes('"') || text.includes('\n')) {
    return '"' + text.replace(/"/g, '""') + '"'
  }
  return text
}

function delimitedRow(values: unknown[], delimiter: string): string {
  return values.map(value => delimitedCell(value, delimiter)).join(delimiter)
}

function tableMetricValue(row: TableRow, metric: MetricKey): number | null {
  return row[metric]
}

function exportCells(row: TableRow, metrics: MetricKey[]): unknown[] {
  return [
    row.position,
    formatNumber(row.distance, 1),
    row.channel,
    formatNumber(row.frequency, 3),
    ...metrics.map(metric => formatNumber(tableMetricValue(row, metric), 2)),
  ]
}

function appendBackendSummary(lines: string[], delimiter: string) {
  lines.push('')
  lines.push(delimitedRow(['后端摘要字段', '后端返回值'], delimiter))
  for (const entry of backendSummaryEntries.value) {
    lines.push(delimitedRow([entry.label, entry.value], delimiter))
  }
}

function doExport() {
  if (!cache.value) return
  const rows = exportAllData.value ? filteredTableRows.value : pagedTableRows.value
  const metrics = [...tableMetricSet.value]
  const fileName = exportFileName.value.trim() || 'simulation_result'

  if (exportFormat.value === 'json') {
    const data: Record<string, unknown> = {
      export_time: new Date().toISOString(),
      record_count: rows.length,
      metrics,
      rows: rows.map(row => ({
        position: row.position,
        distance_km: row.distance,
        channel: row.channel,
        frequency_thz: row.frequency,
        ...Object.fromEntries(metrics.map(metric => [
          metric + '_db',
          tableMetricValue(row, metric),
        ])),
      })),
    }
    if (exportIncludeSummary.value) data.backend_summary = backendSummaryPayload()
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
      fileName + '.json',
    )
  } else {
    const delimiter = exportFormat.value === 'csv' ? ',' : '\t'
    const lines: string[] = []
    if (exportIncludeHeader.value) {
      lines.push(delimitedRow(
        ['位置', '距离', '信道', '频率', ...metrics.map(metric => metricLabels[metric])],
        delimiter,
      ))
      if (exportIncludeUnit.value) {
        lines.push(delimitedRow(
          ['', '(km)', '', '(THz)', ...metrics.map(() => '(dB)')],
          delimiter,
        ))
      }
    }
    for (const row of rows) lines.push(delimitedRow(exportCells(row, metrics), delimiter))
    if (exportIncludeSummary.value) appendBackendSummary(lines, delimiter)
    const mime = exportFormat.value === 'csv'
      ? 'text/csv;charset=utf-8'
      : 'application/vnd.ms-excel;charset=utf-8'
    const extension = exportFormat.value === 'csv' ? '.csv' : '.xlsx'
    downloadBlob(new Blob(['\uFEFF' + lines.join('\n')], { type: mime }), fileName + extension)
  }

  showExportDialog.value = false
  appStore.showNotification({
    type: 'success',
    message: '已导出 ' + rows.length + ' 条后端结果记录',
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const nodeDetail = computed(() => {
  const current = cache.value
  const posIdx = selectedNodeIndex.value
  const chIdx = selectedChannel.value
  if (!current || posIdx < 0 || posIdx >= positionCount.value || chIdx < 0) return null

  return {
    name: textOrMissing(current.positions?.names?.[posIdx]),
    distance: readArrayNumber(current.positions?.distances_km, posIdx),
    channel: textOrMissing(current.channels?.ids?.[chIdx]),
    frequency: readArrayNumber(current.channels?.frequencies_thz, chIdx),
    gsnr: metricValue(current, 'gsnr', posIdx, chIdx),
    osnr: metricValue(current, 'osnr', posIdx, chIdx),
    snrAse: metricValue(current, 'snr_ase', posIdx, chIdx),
    snrNli: metricValue(current, 'snr_nli', posIdx, chIdx),
    signalPower: matrixNumber(
      optionalPowerMatrixFor(current, 'signal_power_matrix_dbm'),
      posIdx,
      chIdx,
    ),
    aseNoisePower: matrixNumber(
      optionalPowerMatrixFor(current, 'ase_noise_power_matrix_dbm'),
      posIdx,
      chIdx,
    ),
    nliNoisePower: matrixNumber(
      optionalPowerMatrixFor(current, 'nli_noise_power_matrix_dbm'),
      posIdx,
      chIdx,
    ),
  }
})

function handleNodeClick(index: number) {
  selectedNodeIndex.value = index
  showNodeDetail.value = true
}

const showReportDialog = ref(false)
const reportTitle = ref('')
const reportAuthor = ref('')
const reportDate = ref('')
const reportFormat = ref<'html' | 'pdf' | 'docx'>('html')
const reportChannelIndex = ref(0)
const reportPositionIndex = ref(-1)
const reportSections = ref({
  linkInfo: true,
  simConfig: true,
  backendSummary: true,
  selectedChannel: true,
  selectedPosition: true,
  fullTable: false,
})
const isGeneratingReport = ref(false)

function exportReport() {
  if (!cache.value) return
  reportTitle.value = linkInfo.value.linkName + ' 后端仿真结果报告'
  reportDate.value = new Date().toISOString().split('T')[0]
  reportChannelIndex.value = selectedChannel.value
  reportPositionIndex.value = selectedPositionIndex.value
  showReportDialog.value = true
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlTable(headers: string[], rows: unknown[][]): string {
  const head = '<tr>' + headers.map(header =>
    '<th>' + escapeHtml(header) + '</th>').join('') + '</tr>'
  const body = rows.map(row =>
    '<tr>' + row.map(value => '<td>' + escapeHtml(value) + '</td>').join('') + '</tr>',
  ).join('')
  return '<table>' + head + body + '</table>'
}

function reportMetricRowsForChannel(current: SimulationCache, channelIndex: number): unknown[][] {
  return Array.from({ length: explicitCount(current.positions?.count) }, (_, posIdx) => [
    textOrMissing(current.positions?.names?.[posIdx]),
    formatNumber(readArrayNumber(current.positions?.distances_km, posIdx), 2),
    ...allMetricKeys.map(metric =>
      formatNumber(metricValue(current, metric, posIdx, channelIndex), 2)),
  ])
}

function reportMetricRowsForPosition(current: SimulationCache, positionIndex: number): unknown[][] {
  return Array.from({ length: explicitCount(current.channels?.count) }, (_, chIdx) => [
    textOrMissing(current.channels?.ids?.[chIdx]),
    formatNumber(readArrayNumber(current.channels?.frequencies_thz, chIdx), 3),
    ...allMetricKeys.map(metric =>
      formatNumber(metricValue(current, metric, positionIndex, chIdx), 2)),
  ])
}

function generateReportHtml(): string {
  const current = cache.value
  if (!current) return ''
  const sections: string[] = [
    '<style>'
      + 'body{font-family:Microsoft YaHei,sans-serif;max-width:960px;margin:0 auto;padding:40px 30px;color:#1f2937;font-size:13px;line-height:1.6;}'
      + 'h1{font-size:22px;text-align:center;border-bottom:2px solid #3b82f6;padding-bottom:12px;}'
      + 'h2{font-size:16px;color:#1e40af;border-left:4px solid #3b82f6;padding-left:10px;margin-top:30px;}'
      + '.meta{text-align:center;color:#6b7280;font-size:12px;margin-bottom:30px;}'
      + 'table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;}'
      + 'th{background:#f3f4f6;text-align:left;padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;}'
      + 'td{padding:5px 10px;border:1px solid #e5e7eb;}'
      + '</style>',
  ]
  let sectionNumber = 0
  const addSection = (title: string, content: string) => {
    sectionNumber += 1
    sections.push('<h2>' + sectionNumber + '. ' + escapeHtml(title) + '</h2>' + content)
  }

  sections.push('<h1>' + escapeHtml(reportTitle.value || '后端链路仿真结果报告') + '</h1>')
  sections.push(
    '<div class="meta">'
      + (reportAuthor.value ? '编制: ' + escapeHtml(reportAuthor.value) + ' | ' : '')
      + '日期: ' + escapeHtml(reportDate.value)
      + ' | 后端结果时间: ' + escapeHtml(textOrMissing(current.timestamp))
      + '</div>',
  )

  if (reportSections.value.linkInfo) {
    addSection('链路基本信息', htmlTable(['字段', '后端返回值'], [
      ['链路', linkInfo.value.linkName],
      ['总长度', formatNumber(current.summary?.total_length_km, 2, ' km')],
      ['Span 数', formatNumber(current.summary?.total_span_count, 0)],
      ['信道数', formatNumber(current.channels?.count, 0)],
      ['位置数', formatNumber(current.positions?.count, 0)],
      ['路由哈希', textOrMissing(current.route_ref?.route_hash)],
      ['缓存有效性', current.is_valid ? '有效' : '无效'],
    ]))
  }

  if (reportSections.value.simConfig) {
    addSection('后端计算模型', htmlTable(['字段', '后端返回值'], [
      ['光纤模型', textOrMissing(current.model_selection?.fiber_model_id)],
      ['EDFA 模型', textOrMissing(current.model_selection?.edfa_model_id)],
      ['BU 模型', textOrMissing(current.model_selection?.bu_model_id)],
    ]))
  }

  if (reportSections.value.backendSummary) {
    addSection(
      '后端摘要',
      htmlTable(
        ['字段', '后端返回值'],
        backendSummaryEntries.value.map(entry => [entry.label, entry.value]),
      ),
    )
  }

  if (reportSections.value.selectedChannel) {
    const channelIndex = reportChannelIndex.value
    addSection(
      '指定信道沿程原始值',
      '<p>信道: '
        + escapeHtml(textOrMissing(current.channels?.ids?.[channelIndex]))
        + '，频率: '
        + escapeHtml(formatNumber(
          readArrayNumber(current.channels?.frequencies_thz, channelIndex),
          3,
          ' THz',
        ))
        + '</p>'
        + htmlTable(
          ['位置', '距离 (km)', 'GSNR', 'OSNR', 'SNR_ASE', 'SNR_NLI'],
          reportMetricRowsForChannel(current, channelIndex),
        ),
    )
  }

  if (reportSections.value.selectedPosition) {
    const positionIndex = reportPositionIndex.value >= 0
      ? reportPositionIndex.value
      : Math.max(0, explicitCount(current.positions?.count) - 1)
    addSection(
      '指定位置频谱原始值',
      '<p>位置: '
        + escapeHtml(textOrMissing(current.positions?.names?.[positionIndex]))
        + '，距离: '
        + escapeHtml(formatNumber(
          readArrayNumber(current.positions?.distances_km, positionIndex),
          2,
          ' km',
        ))
        + '</p>'
        + htmlTable(
          ['信道', '频率 (THz)', 'GSNR', 'OSNR', 'SNR_ASE', 'SNR_NLI'],
          reportMetricRowsForPosition(current, positionIndex),
        ),
    )
  }

  if (reportSections.value.fullTable) {
    addSection(
      '当前筛选数据',
      htmlTable(
        ['位置', '距离 (km)', '信道', '频率 (THz)', 'GSNR', 'OSNR', 'SNR_ASE', 'SNR_NLI'],
        filteredTableRows.value.map(row => [
          row.position,
          formatNumber(row.distance, 2),
          row.channel,
          formatNumber(row.frequency, 3),
          formatNumber(row.gsnr, 2),
          formatNumber(row.osnr, 2),
          formatNumber(row.snr_ase, 2),
          formatNumber(row.snr_nli, 2),
        ]),
      ),
    )
  }

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>'
    + escapeHtml(reportTitle.value)
    + '</title></head><body>'
    + sections.join('\n')
    + '</body></html>'
}

function doGenerateReport() {
  if (!cache.value) return
  isGeneratingReport.value = true
  try {
    const html = generateReportHtml()
    const fileName = (reportTitle.value.trim() || '后端仿真结果报告')
      .replace(/[\\/:*?"<>|]/g, '_')
    if (reportFormat.value === 'html') {
      downloadBlob(
        new Blob([html], { type: 'text/html;charset=utf-8' }),
        fileName + '.html',
      )
    } else if (reportFormat.value === 'pdf') {
      const reportWindow = window.open('', '_blank')
      if (!reportWindow) throw new Error('浏览器阻止了报告窗口')
      reportWindow.document.write(html)
      reportWindow.document.close()
      reportWindow.print()
    } else {
      const wordHtml =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office"'
        + ' xmlns:w="urn:schemas-microsoft-com:office:word"'
        + ' xmlns="http://www.w3.org/TR/REC-html40">'
        + '<head><meta charset="UTF-8"></head><body>'
        + html
        + '</body></html>'
      downloadBlob(
        new Blob([wordHtml], { type: 'application/msword;charset=utf-8' }),
        fileName + '.docx',
      )
    }
    showReportDialog.value = false
    appStore.showNotification({ type: 'success', message: '后端仿真结果报告已生成' })
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: '报告生成失败: ' + (error as Error).message,
    })
  } finally {
    isGeneratingReport.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="flex h-[90vh] w-[95vw] max-w-[1400px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div class="flex flex-shrink-0 items-center justify-between border-b bg-gray-50 px-5 py-3">
          <h3 class="flex items-center gap-2 font-semibold text-gray-800">
            <BarChart2 class="h-5 w-5 text-blue-500" />
            后端链路仿真结果
          </h3>
          <button class="rounded p-1.5 transition-colors hover:bg-gray-200" @click="emit('close')">
            <X class="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <aside class="w-[280px] flex-shrink-0 space-y-4 overflow-y-auto border-r bg-gray-50/50 p-4">
            <section class="space-y-2">
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Info class="h-3.5 w-3.5 text-blue-500" />
                链路信息
              </div>
              <div class="space-y-1.5 rounded-lg border bg-white p-2.5 text-xs">
                <div class="truncate font-medium text-gray-800" :title="linkInfo.linkName">
                  {{ linkInfo.linkName }}
                </div>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-500">
                  <span>总长度</span>
                  <span class="text-right text-gray-700">
                    <span class="block font-mono">{{ formatNumber(linkInfo.totalLength, 3, ' km') }}</span>
                    <span v-if="displayedSummary.totalLength.source" class="block text-[9px] text-gray-400">
                      {{ displayedSummary.totalLength.source }}
                    </span>
                  </span>
                  <span>信道数</span>
                  <span class="text-right font-mono text-gray-700">
                    {{ formatNumber(linkInfo.channelCount, 0) }}
                  </span>
                </div>
              </div>
            </section>

            <section class="space-y-2 border-t pt-3">
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Cpu class="h-3.5 w-3.5 text-blue-500" />
                计算模型
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border bg-white p-2.5 text-xs">
                <span class="text-gray-500">光纤模型</span>
                <span class="text-right text-gray-700">
                  <span class="block font-mono">{{ textOrMissing(displayedModels.fiber.value) }}</span>
                  <span v-if="displayedModels.fiber.source" class="block text-[9px] text-gray-400">{{ displayedModels.fiber.source }}</span>
                </span>
                <span class="text-gray-500">EDFA 模型</span>
                <span class="text-right text-gray-700">
                  <span class="block font-mono">{{ textOrMissing(displayedModels.edfa.value) }}</span>
                  <span v-if="displayedModels.edfa.source" class="block text-[9px] text-gray-400">{{ displayedModels.edfa.source }}</span>
                </span>
                <span class="text-gray-500">BU 模型</span>
                <span class="text-right text-gray-700">
                  <span class="block font-mono">{{ textOrMissing(displayedModels.bu.value) }}</span>
                  <span v-if="displayedModels.bu.source" class="block text-[9px] text-gray-400">{{ displayedModels.bu.source }}</span>
                </span>
              </div>
            </section>

            <section class="space-y-2 border-t pt-3">
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Filter class="h-3.5 w-3.5 text-purple-500" />
                展示筛选
              </div>
              <div>
                <label class="mb-0.5 block text-[10px] text-gray-500">热力图指标</label>
                <select v-model="selectedMetric" class="w-full rounded border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500">
                  <option v-for="metric in allMetricKeys" :key="metric" :value="metric">
                    {{ metricLabels[metric] }}
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-0.5 block text-[10px] text-gray-500">沿程展示信道</label>
                <select v-model="selectedChannel" class="w-full rounded border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500">
                  <option v-for="option in channelOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div v-if="activeTab === 'spectrum'">
                <label class="mb-0.5 block text-[10px] text-gray-500">频谱位置</label>
                <select v-model="selectedPosition" class="w-full rounded border bg-white px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500">
                  <option :value="-1">后端位置序列末端</option>
                  <option v-for="option in positionOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </section>

            <section class="space-y-2 border-t pt-3">
              <div class="text-[10px] leading-5 text-gray-500">
                原始矩阵只来自仿真响应；规划结果与规划配置字段会单独标注来源，不补算工程结论。
              </div>
              <Button variant="outline" class="w-full" :disabled="!cache" @click="exportReport">
                <FileText class="mr-1 h-4 w-4" />
                导出后端结果报告
              </Button>
            </section>
          </aside>

          <main class="flex flex-1 flex-col overflow-hidden">
            <div class="flex flex-shrink-0 items-center gap-3 border-b bg-white px-4 py-2 text-xs">
              <span v-if="cache?.is_valid" class="flex items-center gap-1 text-green-600">
                <span class="h-2 w-2 rounded-full bg-green-500" />
                后端缓存状态：有效
              </span>
              <span v-else class="flex items-center gap-1 text-gray-400">
                <span class="h-2 w-2 rounded-full bg-gray-300" />
                暂无有效后端仿真缓存
              </span>
              <span v-if="cache" class="text-gray-400">
                {{ textOrMissing(cache.timestamp) }}
              </span>
              <span v-if="cache" class="ml-auto text-gray-400">
                {{ textOrMissing(displayedModels.fiber.value) }}
                · {{ textOrMissing(displayedModels.edfa.value) }}
              </span>
            </div>

            <div v-if="cache" class="grid flex-shrink-0 grid-cols-4 gap-3 border-b p-4">
              <div class="rounded-lg bg-blue-50 p-3 text-center">
                <div class="text-lg font-bold text-blue-600">
                  {{ formatNumber(displayedSummary.totalLength.value, 3) }}
                </div>
                <div class="text-[10px] text-gray-500">总长度 (km)</div>
                <div class="text-[9px] text-gray-400">{{ displayedSummary.totalLength.source || '未返回' }}</div>
              </div>
              <div class="rounded-lg bg-purple-50 p-3 text-center">
                <div class="text-lg font-bold text-purple-600">
                  {{ formatNumber(displayedSummary.spanCount.value, 0) }}
                </div>
                <div class="text-[10px] text-gray-500">Span 数</div>
                <div class="text-[9px] text-gray-400">{{ displayedSummary.spanCount.source || '未返回' }}</div>
              </div>
              <div class="rounded-lg bg-orange-50 p-3 text-center">
                <div class="text-lg font-bold text-orange-600">
                  {{ formatNumber(cache.summary?.final_gsnr?.avg_db, 2) }}
                </div>
                <div class="text-[10px] text-gray-500">后端终端 GSNR 均值 (dB)</div>
              </div>
              <div class="rounded-lg bg-green-50 p-3 text-center">
                <div class="text-lg font-bold text-green-600">
                  {{ formatNumber(displayedSummary.capacity.value, 3) }}
                </div>
                <div class="text-[10px] text-gray-500">系统容量 (Tbps)</div>
                <div class="text-[9px] text-gray-400">{{ displayedSummary.capacity.source || '未返回' }}</div>
              </div>
            </div>

            <div class="flex flex-shrink-0 items-center gap-2 border-b bg-white px-4 py-2">
              <button
                v-for="tab in ([
                  { key: 'evolution', label: '沿程原始值' },
                  { key: 'spectrum', label: '频谱原始值' },
                  { key: 'heatmap', label: '热力图' },
                  { key: 'table', label: '数据表' },
                ] as const)"
                :key="tab.key"
                class="rounded px-3 py-1.5 text-xs transition-colors"
                :class="activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
                @click="activeTab = tab.key"
              >
                {{ tab.label }}
              </button>
              <div class="flex-1" />
              <span v-if="cache" class="text-[10px] text-gray-400">
                {{ formatNumber(cache.positions?.count, 0) }} 位置
                × {{ formatNumber(cache.channels?.count, 0) }} 信道
              </span>
            </div>

            <div class="flex-1 overflow-auto p-4">
              <div v-if="!cache" class="flex h-full items-center justify-center text-gray-400">
                <div class="text-center">
                  <BarChart2 class="mx-auto mb-2 h-12 w-12 text-gray-300" />
                  <div class="text-sm">暂无后端仿真结果</div>
                  <div class="mt-1 text-[10px]">请先由后端完成系统规划和物理仿真</div>
                </div>
              </div>

              <div v-else-if="activeTab === 'evolution'" class="space-y-4">
                <div class="rounded-lg border bg-white p-3">
                  <div class="mb-1.5 text-[10px] text-gray-500">指标与信道筛选</div>
                  <div class="flex flex-wrap items-center gap-4">
                    <label v-for="metric in allMetricKeys" :key="metric" class="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        class="rounded accent-blue-500"
                        :checked="selectedMetrics.has(metric)"
                        @change="toggleMetric(metric)"
                      />
                      {{ metricLabels[metric] }}
                    </label>
                    <select v-model="selectedChannel" class="min-w-[260px] rounded border bg-white px-2 py-1 text-xs">
                      <option v-for="option in channelOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                </div>

                <div
                  v-for="chart in evolutionCharts"
                  :key="chart.metricKey"
                  class="rounded-lg border bg-gray-50 p-4"
                >
                  <div class="mb-3 flex items-center justify-between">
                    <h4 class="text-sm font-medium text-gray-700">
                      {{ chart.metricLabel }} 沿程原始值
                    </h4>
                    <span class="flex items-center gap-1 text-[10px] text-gray-500">
                      <span class="h-0.5 w-3" :style="{ background: chart.color }" />
                      {{ chart.channelLabel }}
                    </span>
                  </div>
                  <svg
                    :viewBox="'0 0 ' + chart.width + ' ' + chart.height"
                    class="w-full"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <line
                      v-for="tick in chart.yTicks"
                      :key="'eyg' + chart.metricKey + tick.value"
                      :x1="chart.padding.left"
                      :x2="chart.width - chart.padding.right"
                      :y1="tick.position"
                      :y2="tick.position"
                      stroke="#e5e7eb"
                      stroke-width="0.5"
                    />
                    <path :d="chart.path" fill="none" :stroke="chart.color" stroke-width="2" />
                    <circle
                      v-for="point in chart.points"
                      :key="point.index"
                      :cx="point.cx"
                      :cy="point.cy"
                      r="4"
                      :fill="chart.color"
                      stroke="white"
                      stroke-width="1.5"
                      class="cursor-pointer"
                      @click="handleNodeClick(point.index)"
                    >
                      <title>{{ point.name }}: {{ point.value }} dB</title>
                    </circle>
                    <line
                      :x1="chart.padding.left"
                      :x2="chart.width - chart.padding.right"
                      :y1="chart.xAxisY"
                      :y2="chart.xAxisY"
                      stroke="#9ca3af"
                    />
                    <template v-for="tick in chart.xTicks" :key="'ex' + chart.metricKey + tick.name">
                      <text v-if="tick.show" :x="tick.x" :y="chart.xAxisY + 14" text-anchor="middle" fill="#6b7280" font-size="9">
                        {{ tick.value }}
                      </text>
                      <text v-if="tick.show" :x="tick.x" :y="chart.xAxisY + 28" text-anchor="middle" fill="#374151" font-size="8">
                        {{ tick.name }}
                      </text>
                    </template>
                    <text
                      :x="(chart.padding.left + chart.width - chart.padding.right) / 2"
                      :y="chart.height - 5"
                      text-anchor="middle"
                      fill="#6b7280"
                      font-size="11"
                    >
                      距离 (km)
                    </text>
                    <line
                      :x1="chart.padding.left"
                      :x2="chart.padding.left"
                      :y1="chart.padding.top"
                      :y2="chart.xAxisY"
                      stroke="#9ca3af"
                    />
                    <text
                      v-for="tick in chart.yTicks"
                      :key="'ey' + chart.metricKey + tick.value"
                      :x="chart.padding.left - 8"
                      :y="tick.position + 3"
                      text-anchor="end"
                      fill="#6b7280"
                      font-size="10"
                    >
                      {{ tick.value }}
                    </text>
                  </svg>
                </div>
                <div v-if="evolutionCharts.length === 0" class="rounded-lg border border-dashed p-8 text-center text-xs text-gray-400">
                  后端未提供当前信道与指标的可绘制数据
                </div>
              </div>

              <div v-else-if="activeTab === 'spectrum'" class="space-y-4">
                <div class="flex flex-wrap items-center gap-4 rounded-lg border bg-white p-3 text-xs">
                  <span class="text-gray-500">观测位置</span>
                  <select v-model="selectedPosition" class="min-w-[280px] rounded border bg-white px-2 py-1">
                    <option :value="-1">后端位置序列末端</option>
                    <option v-for="option in positionOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                  <label v-for="metric in allMetricKeys" :key="'s' + metric" class="flex cursor-pointer items-center gap-1 text-gray-700">
                    <input
                      type="checkbox"
                      class="rounded accent-blue-500"
                      :checked="selectedMetrics.has(metric)"
                      @change="toggleMetric(metric)"
                    />
                    {{ metricLabels[metric] }}
                  </label>
                </div>

                <div
                  v-for="chart in spectrumCharts"
                  :key="chart.metricKey"
                  class="rounded-lg border bg-gray-50 p-4"
                >
                  <div class="mb-3 flex items-center justify-between">
                    <h4 class="text-sm font-medium text-gray-700">
                      {{ chart.metricLabel }} 频谱原始值 @ {{ chart.positionLabel }}
                    </h4>
                    <span class="flex items-center gap-1 text-[10px] text-gray-500">
                      <span class="h-0.5 w-3" :style="{ background: chart.color }" />
                      后端矩阵
                    </span>
                  </div>
                  <svg
                    :viewBox="'0 0 ' + chart.width + ' ' + chart.height"
                    class="w-full"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <line
                      v-for="tick in chart.yTicks"
                      :key="'syg' + chart.metricKey + tick.value"
                      :x1="chart.padding.left"
                      :x2="chart.width - chart.padding.right"
                      :y1="tick.position"
                      :y2="tick.position"
                      stroke="#e5e7eb"
                      stroke-width="0.5"
                    />
                    <path :d="chart.path" fill="none" :stroke="chart.color" stroke-width="1.5" />
                    <line
                      :x1="chart.padding.left"
                      :x2="chart.width - chart.padding.right"
                      :y1="chart.xAxisY"
                      :y2="chart.xAxisY"
                      stroke="#9ca3af"
                    />
                    <text
                      v-for="tick in chart.xTicks"
                      :key="'sx' + chart.metricKey + tick.value"
                      :x="tick.position"
                      :y="chart.xAxisY + 16"
                      text-anchor="middle"
                      fill="#6b7280"
                      font-size="10"
                    >
                      {{ tick.value }}
                    </text>
                    <text
                      :x="(chart.padding.left + chart.width - chart.padding.right) / 2"
                      :y="chart.height - 5"
                      text-anchor="middle"
                      fill="#6b7280"
                      font-size="11"
                    >
                      频率 (THz)
                    </text>
                    <line
                      :x1="chart.padding.left"
                      :x2="chart.padding.left"
                      :y1="chart.padding.top"
                      :y2="chart.xAxisY"
                      stroke="#9ca3af"
                    />
                    <text
                      v-for="tick in chart.yTicks"
                      :key="'sy' + chart.metricKey + tick.value"
                      :x="chart.padding.left - 8"
                      :y="tick.position + 3"
                      text-anchor="end"
                      fill="#6b7280"
                      font-size="10"
                    >
                      {{ tick.value }}
                    </text>
                  </svg>
                </div>
                <div v-if="spectrumCharts.length === 0" class="rounded-lg border border-dashed p-8 text-center text-xs text-gray-400">
                  后端未提供当前位置与指标的可绘制数据
                </div>
              </div>

              <div v-else-if="activeTab === 'heatmap'" class="space-y-4">
                <div class="flex items-center gap-3 rounded-lg border bg-white p-3 text-xs">
                  <span class="text-gray-500">显示指标</span>
                  <select v-model="selectedMetric" class="rounded border bg-white px-2 py-1">
                    <option v-for="metric in allMetricKeys" :key="'h' + metric" :value="metric">
                      {{ metricLabels[metric] }}
                    </option>
                  </select>
                </div>

                <div class="rounded-lg border bg-gray-50 p-4">
                  <div class="mb-3 flex items-center justify-between">
                    <h4 class="text-sm font-medium text-gray-700">
                      {{ metricLabels[selectedMetric] }} 后端矩阵热力图
                    </h4>
                    <div class="flex items-center gap-2 text-[10px] text-gray-500">
                      <span>低</span>
                      <span class="h-3 w-24 rounded" style="background: linear-gradient(to right, rgb(0,0,255), rgb(0,255,255), rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))" />
                      <span>高</span>
                    </div>
                  </div>
                  <div v-if="heatmapData" class="overflow-auto">
                    <svg
                      :viewBox="'0 0 ' + heatmapData.svgWidth + ' ' + heatmapData.svgHeight"
                      :style="{ minWidth: heatmapData.svgWidth + 'px', minHeight: heatmapData.svgHeight + 'px' }"
                    >
                      <template v-for="(label, row) in heatmapData.rowLabels" :key="'hl' + row">
                        <text
                          v-if="row % heatmapData.yLabelStep === 0 || row === heatmapData.rowCount - 1"
                          :x="heatmapData.padLeft - 6"
                          :y="heatmapData.padTop + row * heatmapData.cellHeight + heatmapData.cellHeight / 2 + 3"
                          text-anchor="end"
                          fill="#6b7280"
                          font-size="8"
                        >
                          {{ label }}
                        </text>
                      </template>
                      <rect
                        v-for="cell in heatmapData.cells"
                        :key="'hc' + cell.row + '-' + cell.col"
                        :x="heatmapData.padLeft + cell.col * heatmapData.cellWidth"
                        :y="heatmapData.padTop + cell.row * heatmapData.cellHeight"
                        :width="Math.max(1, heatmapData.cellWidth - 1)"
                        :height="Math.max(1, heatmapData.cellHeight - 1)"
                        :fill="getHeatColor(cell.value, heatmapData.colorMin, heatmapData.colorMax)"
                        rx="0.5"
                      >
                        <title>{{ getHeatTooltip(cell) }}</title>
                      </rect>
                      <template v-for="(label, col) in heatmapData.colLabels" :key="'hp' + col">
                        <text
                          v-if="col % heatmapData.xLabelStep === 0 || col === heatmapData.colCount - 1"
                          :x="heatmapData.padLeft + col * heatmapData.cellWidth + heatmapData.cellWidth / 2"
                          :y="heatmapData.padTop + heatmapData.rowCount * heatmapData.cellHeight + 12"
                          text-anchor="end"
                          fill="#374151"
                          font-size="8"
                          :transform="'rotate(-45, '
                            + (heatmapData.padLeft + col * heatmapData.cellWidth + heatmapData.cellWidth / 2)
                            + ', '
                            + (heatmapData.padTop + heatmapData.rowCount * heatmapData.cellHeight + 12)
                            + ')'"
                        >
                          {{ label }}
                        </text>
                      </template>
                    </svg>
                  </div>
                  <div v-else class="p-8 text-center text-xs text-gray-400">
                    后端未提供当前指标的热力图数据
                  </div>
                </div>

                <div class="rounded-lg border bg-white p-4">
                  <div class="mb-2 text-xs font-medium text-gray-700">后端摘要字段</div>
                  <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <template v-for="entry in backendSummaryEntries" :key="entry.label">
                      <span class="text-gray-500">{{ entry.label }}</span>
                      <span class="text-right font-mono text-gray-800">{{ entry.value }}</span>
                    </template>
                  </div>
                </div>
              </div>

              <div v-else-if="activeTab === 'table'" class="space-y-4">
                <div class="space-y-2 rounded-lg border bg-white p-3">
                  <div class="flex flex-wrap items-center gap-4 text-xs">
                    <span class="text-gray-500">位置</span>
                    <select v-model="tablePositionFilter" class="rounded border bg-white px-2 py-1">
                      <option value="all">全部后端位置</option>
                      <option value="rx">后端位置序列末端</option>
                    </select>
                    <span class="ml-2 text-gray-500">信道</span>
                    <select v-model="tableChannelFilter" class="min-w-[220px] rounded border bg-white px-2 py-1">
                      <option value="all">全部后端信道</option>
                      <option v-for="option in channelOptions" :key="'tc' + option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                  <div class="flex flex-wrap items-center gap-4 text-xs">
                    <span class="text-gray-500">指标</span>
                    <label v-for="metric in allMetricKeys" :key="'tm' + metric" class="flex cursor-pointer items-center gap-1 text-gray-700">
                      <input
                        type="checkbox"
                        class="rounded accent-blue-500"
                        :checked="tableMetricSet.has(metric)"
                        @change="toggleTableMetric(metric)"
                      />
                      {{ metricLabels[metric] }}
                    </label>
                  </div>
                  <div class="flex items-center gap-2 border-t pt-2">
                    <button class="rounded bg-blue-50 px-3 py-1 text-xs text-blue-600 hover:bg-blue-100" @click="openExportDialog(false)">
                      导出当前页
                    </button>
                    <button class="rounded bg-gray-50 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="openExportDialog(true)">
                      导出筛选结果
                    </button>
                  </div>
                </div>

                <div class="overflow-hidden rounded-lg border">
                  <div class="max-h-[50vh] overflow-auto">
                    <table class="w-full text-xs">
                      <thead class="sticky top-0 bg-gray-100">
                        <tr>
                          <th class="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600" @click="toggleTableSort('posIdx')">
                            位置 {{ tableSortKey === 'posIdx' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th class="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600" @click="toggleTableSort('channel')">
                            信道 {{ tableSortKey === 'channel' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th class="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium text-gray-600" @click="toggleTableSort('frequency')">
                            频率 (THz) {{ tableSortKey === 'frequency' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th
                            v-for="metric in allMetricKeys.filter(item => tableMetricSet.has(item))"
                            :key="'th' + metric"
                            class="cursor-pointer whitespace-nowrap px-3 py-2 text-right font-medium text-gray-600"
                            @click="toggleTableSort(metric)"
                          >
                            {{ metricLabels[metric] }} (dB)
                            {{ tableSortKey === metric ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y">
                        <tr v-for="row in pagedTableRows" :key="row.posIdx + '-' + row.chIdx" class="hover:bg-gray-50">
                          <td class="px-3 py-1.5 text-gray-800">{{ row.position }}</td>
                          <td class="px-3 py-1.5 text-gray-600">{{ row.channel }}</td>
                          <td class="px-3 py-1.5 font-mono text-gray-600">{{ formatNumber(row.frequency, 3) }}</td>
                          <td
                            v-for="metric in allMetricKeys.filter(item => tableMetricSet.has(item))"
                            :key="'td' + metric"
                            class="px-3 py-1.5 text-right font-mono text-gray-800"
                          >
                            {{ formatNumber(tableMetricValue(row, metric), 2) }}
                          </td>
                        </tr>
                        <tr v-if="pagedTableRows.length === 0">
                          <td :colspan="3 + tableMetricSet.size" class="px-3 py-6 text-center text-gray-400">
                            无匹配的后端数据
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="flex items-center justify-between border-t bg-gray-50 px-3 py-2 text-[10px] text-gray-500">
                    <span>
                      显示
                      {{ tableRowCount > 0 ? (tablePage - 1) * tablePageSize + 1 : 0 }}
                      -
                      {{ Math.min(tablePage * tablePageSize, tableRowCount) }}
                      / 共 {{ tableRowCount }} 条
                    </span>
                    <div class="flex items-center gap-1">
                      <button class="rounded px-2 py-0.5 hover:bg-gray-200 disabled:opacity-40" :disabled="tablePage <= 1" @click="tablePage--">&lt;</button>
                      <span class="px-2">第 {{ tablePage }}/{{ tablePageCount }} 页</span>
                      <button class="rounded px-2 py-0.5 hover:bg-gray-200 disabled:opacity-40" :disabled="tablePage >= tablePageCount" @click="tablePage++">&gt;</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="cache" class="flex-shrink-0 border-t">
              <button class="flex w-full items-center justify-between px-4 py-2 text-xs text-gray-600 hover:bg-gray-50" @click="showNodeDetail = !showNodeDetail">
                <span class="font-medium">节点原始值（点击沿程曲线节点查看）</span>
                <ChevronUp v-if="showNodeDetail" class="h-4 w-4" />
                <ChevronDown v-else class="h-4 w-4" />
              </button>
              <div v-if="showNodeDetail" class="px-4 pb-3">
                <div v-if="nodeDetail">
                  <div class="mb-2 text-xs font-medium text-gray-800">
                    {{ nodeDetail.name }}
                    @ {{ formatNumber(nodeDetail.distance, 2, ' km') }}
                    · {{ nodeDetail.channel }}
                    · {{ formatNumber(nodeDetail.frequency, 3, ' THz') }}
                  </div>
                  <div class="grid grid-cols-2 gap-3 text-xs">
                    <div class="space-y-1.5 rounded border bg-gray-50 p-2.5">
                      <div class="flex justify-between"><span class="text-gray-500">GSNR</span><span class="font-mono text-blue-600">{{ formatNumber(nodeDetail.gsnr, 2, ' dB') }}</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">OSNR</span><span class="font-mono text-purple-600">{{ formatNumber(nodeDetail.osnr, 2, ' dB') }}</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">SNR_ASE</span><span class="font-mono text-amber-600">{{ formatNumber(nodeDetail.snrAse, 2, ' dB') }}</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">SNR_NLI</span><span class="font-mono text-green-600">{{ formatNumber(nodeDetail.snrNli, 2, ' dB') }}</span></div>
                    </div>
                    <div class="space-y-1.5 rounded border bg-gray-50 p-2.5">
                      <div class="flex justify-between"><span class="text-gray-500">信号功率</span><span class="font-mono">{{ formatNumber(nodeDetail.signalPower, 2, ' dBm') }}</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">ASE 噪声功率</span><span class="font-mono">{{ formatNumber(nodeDetail.aseNoisePower, 2, ' dBm') }}</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">NLI 噪声功率</span><span class="font-mono">{{ formatNumber(nodeDetail.nliNoisePower, 2, ' dBm') }}</span></div>
                    </div>
                  </div>
                </div>
                <div v-else class="py-2 text-xs text-gray-400">
                  点击沿程曲线节点查看后端返回的节点与信道值
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showExportDialog" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" @click.self="showExportDialog = false">
      <div class="w-[420px] overflow-hidden rounded-lg bg-white shadow-xl">
        <div class="flex items-center justify-between border-b bg-gray-50 px-5 py-3">
          <h4 class="text-sm font-semibold text-gray-800">导出后端数据</h4>
          <button class="rounded p-1 hover:bg-gray-200" @click="showExportDialog = false">
            <X class="h-4 w-4 text-gray-400" />
          </button>
        </div>
        <div class="space-y-4 p-5">
          <div class="text-xs text-gray-600">
            导出范围：
            <span class="font-medium text-gray-800">{{ exportAllData ? '当前筛选结果' : '当前页数据' }}</span>
            <span class="ml-1 text-blue-600">({{ exportRowCount }} 条记录)</span>
          </div>
          <div class="space-y-1.5">
            <div class="text-xs text-gray-500">导出格式</div>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="exportFormat" type="radio" value="csv" class="accent-blue-500" />CSV 文件</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="exportFormat" type="radio" value="xlsx" class="accent-blue-500" />Excel 兼容文件</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="exportFormat" type="radio" value="json" class="accent-blue-500" />JSON 文件</label>
          </div>
          <div class="space-y-1.5">
            <div class="text-xs text-gray-500">包含内容</div>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="exportIncludeHeader" type="checkbox" class="rounded accent-blue-500" />表头行</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="exportIncludeUnit" type="checkbox" class="rounded accent-blue-500" />单位信息</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="exportIncludeSummary" type="checkbox" class="rounded accent-blue-500" />后端返回摘要</label>
          </div>
          <div>
            <label class="mb-1 block text-xs text-gray-500">文件名</label>
            <input v-model="exportFileName" type="text" class="w-full rounded border bg-white px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 border-t bg-gray-50 px-5 py-3">
          <button class="rounded border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-100" @click="showExportDialog = false">取消</button>
          <button class="rounded bg-blue-500 px-4 py-1.5 text-xs text-white hover:bg-blue-600" @click="doExport">导出</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showReportDialog" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" @click.self="showReportDialog = false">
      <div class="flex max-h-[85vh] w-[520px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div class="flex flex-shrink-0 items-center justify-between border-b bg-gray-50 px-5 py-3">
          <h4 class="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <FileText class="h-4 w-4 text-blue-500" />
            导出后端仿真结果报告
          </h4>
          <button class="rounded p-1 hover:bg-gray-200" @click="showReportDialog = false">
            <X class="h-4 w-4 text-gray-400" />
          </button>
        </div>
        <div class="flex-1 space-y-5 overflow-y-auto p-5">
          <section class="space-y-2">
            <div class="border-b pb-1 text-xs font-medium text-gray-700">报告信息</div>
            <input v-model="reportTitle" type="text" class="w-full rounded border bg-white px-3 py-1.5 text-xs" />
            <div class="grid grid-cols-2 gap-2">
              <input v-model="reportAuthor" type="text" placeholder="编制人员（可选）" class="rounded border bg-white px-3 py-1.5 text-xs" />
              <input v-model="reportDate" type="date" class="rounded border bg-white px-3 py-1.5 text-xs" />
            </div>
          </section>

          <section class="space-y-2">
            <div class="border-b pb-1 text-xs font-medium text-gray-700">报告内容</div>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportSections.linkInfo" type="checkbox" class="rounded accent-blue-500" />链路基本信息</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportSections.simConfig" type="checkbox" class="rounded accent-blue-500" />后端计算模型</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportSections.backendSummary" type="checkbox" class="rounded accent-blue-500" />后端摘要字段</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportSections.selectedChannel" type="checkbox" class="rounded accent-blue-500" />指定信道沿程原始值</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportSections.selectedPosition" type="checkbox" class="rounded accent-blue-500" />指定位置频谱原始值</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportSections.fullTable" type="checkbox" class="rounded accent-blue-500" />当前筛选数据表</label>
          </section>

          <section class="space-y-2">
            <div class="border-b pb-1 text-xs font-medium text-gray-700">原始数据选择</div>
            <label class="block text-[10px] text-gray-500">报告信道</label>
            <select v-model="reportChannelIndex" class="w-full rounded border bg-white px-2 py-1 text-xs">
              <option v-for="option in channelOptions" :key="'rc' + option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <label class="block text-[10px] text-gray-500">报告位置</label>
            <select v-model="reportPositionIndex" class="w-full rounded border bg-white px-2 py-1 text-xs">
              <option v-for="option in positionOptions" :key="'rp' + option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </section>

          <section class="space-y-2">
            <div class="border-b pb-1 text-xs font-medium text-gray-700">导出格式</div>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportFormat" type="radio" value="pdf" class="accent-blue-500" />PDF（浏览器打印）</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportFormat" type="radio" value="docx" class="accent-blue-500" />Word 兼容文件</label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700"><input v-model="reportFormat" type="radio" value="html" class="accent-blue-500" />HTML 网页</label>
          </section>
        </div>
        <div class="flex flex-shrink-0 items-center justify-end gap-2 border-t bg-gray-50 px-5 py-3">
          <button class="rounded border px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-100" @click="showReportDialog = false">取消</button>
          <button
            class="rounded bg-blue-500 px-4 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
            :disabled="isGeneratingReport"
            @click="doGenerateReport"
          >
            {{ isGeneratingReport ? '生成中...' : '生成报告' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
