<script setup lang="ts">
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { ref, computed, watch, nextTick } from 'vue'
import { Button } from '@/shared/components/base'
import { BarChart2, X, RefreshCw, Filter, Cpu, ChevronDown, ChevronUp, Target, Info, FileText, AlertTriangle, Download } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { buildSimulationCache } from '@/services/simulationDataBuilder'
import type { SimulationCache } from '@/types/useFile'

const props = defineProps<{
  visible: boolean
  /** 已有的链路计算摘要，用于校准仿真数据 */
  linkCalcSummary?: any
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const connectorStore = useConnectorStore()
const routeStore = useRouteStore()
const routeConnectorElements = computed(() =>
  connectorStore.getElementsForRoute(routeStore.currentRouteId || null)
)

// ============ 仿真配置状态 ============
const selectedMetric = ref<'gsnr' | 'osnr' | 'snr_ase' | 'snr_nli'>('gsnr')
// 沿程演化多指标复选
const selectedMetrics = ref(new Set<string>(['gsnr', 'osnr']))
const toggleMetric = (key: string) => {
  const s = new Set(selectedMetrics.value)
  if (s.has(key)) { if (s.size > 1) s.delete(key) } else s.add(key)
  selectedMetrics.value = s
}
const channelMode = ref<'average' | 'worst' | 'channel'>('average')
const selectedChannel = ref(0)
const selectedPosition = ref(-1) // -1 = Rx (最后一行)
const defaultGsnr = settingsStore.systemPlanningCache?.sweep_config?.target_gsnr_db ?? 12
const targetGsnr = ref(defaultGsnr)
const targetOsnr = ref(18)
const isSimulating = ref(false)
const simulationTime = ref(0) // 仿真耗时(秒)

// ============ 仿真状态机 (7.10) ============
type SimState = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR' | 'PARTIAL'
const simState = ref<SimState>('IDLE')

interface SimulationError {
  code: 'PARAM_ERROR' | 'CALC_OVERFLOW' | 'MODEL_UNSUPPORTED' | 'DATA_MISSING' | 'SERVER_ERROR'
  message: string
  detail?: string
  timestamp: string
}
const simulationError = ref<SimulationError | null>(null)

/** 错误码中文描述 */
const errorCodeLabels: Record<string, string> = {
  PARAM_ERROR: '参数配置错误',
  CALC_OVERFLOW: '计算溢出',
  MODEL_UNSUPPORTED: '模型不支持',
  DATA_MISSING: '数据缺失',
  SERVER_ERROR: '服务器错误',
}

/** 根据错误消息推断错误码 */
function classifyError(err: Error): SimulationError {
  const msg = err.message || '未知错误'
  let code: SimulationError['code'] = 'SERVER_ERROR'
  if (/参数|config|param|range|范围|超出/i.test(msg)) code = 'PARAM_ERROR'
  else if (/溢出|overflow|Infinity|NaN/i.test(msg)) code = 'CALC_OVERFLOW'
  else if (/模型|model|unsupported|不支持/i.test(msg)) code = 'MODEL_UNSUPPORTED'
  else if (/缺失|missing|undefined|null|找不到/i.test(msg)) code = 'DATA_MISSING'
  return {
    code,
    message: msg,
    detail: err.stack?.split('\n').slice(0, 5).join('\n'),
    timestamp: new Date().toLocaleString(),
  }
}

// 仿真结果
const cache = ref<SimulationCache | null>(null)
const restoringCachedResult = ref(false)

// 模型配置——从工程设置读取初始值，若未配置则为空强制选择
const fiberModel = ref<string>(settingsStore.fiberSimulationConfig?.model || '')
const edfaModel = ref<string>(settingsStore.simulationModelConfig?.edfaModel || '')
const buModel = ref<string | null>(null)

/** 当前模型选择是否与已计算结果不一致 */
const configChanged = computed(() => {
  if (!cache.value) return false
  const ms = cache.value.model_selection
  return ms.fiber_model_id !== fiberModel.value || ms.edfa_model_id !== edfaModel.value
})

/** 当前链路是否含有 BU（分支器） */
const hasBu = computed(() => {
  // 从已有仿真结果检查
  if (cache.value) return cache.value.positions.names.some(n => /^BU/i.test(n))
  // 从链路设计元素检查
  return routeConnectorElements.value.some(e => e.type === 'bu')
})

// 计算模型选项（固定算法列表，与器件库 model_id 无关）
const fiberModelOptions = [
  { value: 'GN', label: 'GN 模型' },
  { value: 'EGN', label: 'EGN 模型' },
  { value: 'SSFM', label: 'SSFM 模型' },
]
const edfaModelOptions = [
  { value: 'EDFA_Simple', label: '简化模型' },
  { value: 'EDFA_Full', label: '完整模型' },
  { value: 'EDFA_Raman', label: 'Raman 增强' },
]
const buModelOptions = [
  { value: 'BU_Fixed', label: 'BU 固定损耗' },
]

// ============ 链路信息 ============
const linkInfo = computed(() => {
  if (!cache.value) {
    // 从 connectorStore 统计
    const elements = routeConnectorElements.value
    const amps = elements.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w')
    const bus = elements.filter(e => e.type === 'bu')
    const equalizers = elements.filter(e => e.type === 'equalizer')
    const landings = elements.filter(e => e.type === 'landing' || e.type === 'underwater')
    const fromStation = landings[0]?.name || 'Tx'
    const toStation = landings.length > 1 ? landings[landings.length - 1]?.name || 'Rx' : 'Rx'
    return {
      linkName: `${fromStation} ⇄ ${toStation}`,
      totalLength: 0,
      amplifierCount: amps.length,
      buCount: bus.length,
      equalizerCount: equalizers.length,
      channelCount: settingsStore.systemPlanningConfig?.wdmParams?.channelCount || 96,
    }
  }
  // 从 cache 统计
  const ampCount = cache.value.positions.names.filter(n => n.startsWith('AMP')).length
  const buCount = cache.value.positions.names.filter(n => n.startsWith('BU')).length
  const equalizerCount = cache.value.positions.names.filter(n => n.startsWith('EQ') || n.startsWith('F-ATT')).length
  return {
    linkName: `${cache.value.route_ref.from_station} ⇄ ${cache.value.route_ref.to_station}`,
    totalLength: cache.value.summary.total_length_km,
    amplifierCount: ampCount,
    buCount: buCount,
    equalizerCount,
    channelCount: cache.value.channels.count,
  }
})

// Tab 切换
const activeTab = ref<'evolution' | 'spectrum' | 'heatmap' | 'table'>('evolution')

// 节点详情面板
const showNodeDetail = ref(false)
const selectedNodeIndex = ref(-1)

// ============ 衍生数据 ============

const metricLabels: Record<string, string> = {
  gsnr: 'GSNR', osnr: 'OSNR', snr_ase: 'SNR_ASE', snr_nli: 'SNR_NLI'
}
const metricColors: Record<string, string> = {
  gsnr: '#3b82f6', osnr: '#8b5cf6', snr_ase: '#f59e0b', snr_nli: '#10b981'
}
const allMetricKeys = ['gsnr', 'osnr', 'snr_ase', 'snr_nli'] as const

/** 获取当前选中指标的矩阵 */
const currentMatrix = computed(() => {
  if (!cache.value) return null
  const m = cache.value.metrics
  const map: Record<string, number[][]> = {
    gsnr: m.gsnr_matrix_db,
    osnr: m.osnr_matrix_db,
    snr_ase: m.snr_ase_matrix_db,
    snr_nli: m.snr_nli_matrix_db,
  }
  return map[selectedMetric.value] || m.gsnr_matrix_db
})

/** 信道选项 */
const channelOptions = computed(() => {
  if (!cache.value) return []
  return cache.value.channels.ids.map((id, i) => ({
    value: i,
    label: `${id} (${cache.value!.channels.frequencies_thz[i].toFixed(2)} THz)`,
  }))
})

/** 位置选项 */
const positionOptions = computed(() => {
  if (!cache.value) return []
  return cache.value.positions.names.map((name, i) => ({
    value: i,
    label: `${name} (${cache.value!.positions.distances_km[i].toFixed(1)} km)`,
  }))
})

// ============ 沿程演化图表（多指标堆叠） ============

const evolutionCharts = computed(() => {
  if (!cache.value) return []
  const positions = cache.value.positions
  const mt = cache.value.metrics
  const ch = cache.value.channels
  const metricsMap: Record<string, number[][]> = {
    gsnr: mt.gsnr_matrix_db, osnr: mt.osnr_matrix_db,
    snr_ase: mt.snr_ase_matrix_db, snr_nli: mt.snr_nli_matrix_db,
  }
  const targetMap: Record<string, number | undefined> = {
    gsnr: targetGsnr.value, osnr: targetOsnr.value,
  }

  return [...selectedMetrics.value].filter(k => metricsMap[k]).map(metricKey => {
    const matrix = metricsMap[metricKey]!
    let yValues: number[]
    let channelLabel: string

    if (channelMode.value === 'channel') {
      const j = selectedChannel.value
      yValues = matrix.map(row => row[j] ?? 0)
      channelLabel = ch.ids[j]
        ? `${ch.ids[j]} (${ch.frequencies_thz[j].toFixed(2)} THz)`
        : `Ch${j + 1}`
    } else if (channelMode.value === 'worst') {
      yValues = matrix.map(row => Math.min(...row))
      channelLabel = '最差信道'
    } else {
      yValues = matrix.map(row => row.reduce((a, b) => a + b, 0) / row.length)
      channelLabel = '平均信道'
    }

    const xValues = positions.distances_km
    const p = { top: 30, right: 60, bottom: 80, left: 65 }
    const w = chartWidth
    const h = chartHeight + 40

    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    const yMin = Math.floor(Math.min(...yValues) - 2)
    const yMax = Math.ceil(Math.max(...yValues) + 2)

    const scaleX = (x: number) => p.left + ((x - xMin) / Math.max(1, xMax - xMin)) * (w - p.left - p.right)
    const scaleY = (y: number) => h - p.bottom - ((y - yMin) / Math.max(1, yMax - yMin)) * (h - p.top - p.bottom)

    const path = xValues.map((x, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(x)} ${scaleY(yValues[i])}`).join(' ')

    // X ticks：每个节点位置 + 节点名称
    const maxLabels = 15
    const step = positions.count > maxLabels ? Math.ceil(positions.count / maxLabels) : 1
    const xTicks = xValues.map((x, i) => ({
      value: x.toFixed(x > 100 ? 0 : 1),
      x: scaleX(x),
      name: positions.names[i],
      show: i % step === 0 || i === xValues.length - 1,
    }))

    // Y ticks
    const yTicks: Array<{ value: string; y: number }> = []
    const yStep = (yMax - yMin) / 5
    for (let y = yMin; y <= yMax; y += yStep) {
      yTicks.push({ value: y.toFixed(1), y: scaleY(y) })
    }

    // 目标门限线
    const tv = targetMap[metricKey]
    let targetLine: { y: number; label: string } | null = null
    if (tv != null && tv >= yMin && tv <= yMax) {
      targetLine = { y: scaleY(tv), label: `目标 ${tv} dB` }
    }

    // 数据点
    const points = xValues.map((x, i) => ({
      cx: scaleX(x), cy: scaleY(yValues[i]),
      value: yValues[i].toFixed(2), index: i,
    }))

    // 统计摘要
    const endValue = yValues[yValues.length - 1]
    const margin = tv != null ? endValue - tv : null

    return {
      metricKey,
      metricLabel: metricLabels[metricKey],
      channelLabel,
      color: metricColors[metricKey],
      w, h, p, path, xTicks, yTicks, targetLine, points,
      xAxisY: h - p.bottom,
      summary: {
        endValue: endValue.toFixed(2),
        margin: margin != null ? (margin >= 0 ? `+${margin.toFixed(1)}` : margin.toFixed(1)) : null,
        passed: margin != null ? margin >= 0 : null,
      }
    }
  })
})

// ============ 频谱分布图表（多指标堆叠） ============

const spectrumCharts = computed(() => {
  if (!cache.value) return []
  const positions = cache.value.positions
  const mt = cache.value.metrics
  const ch = cache.value.channels
  const metricsMap: Record<string, number[][]> = {
    gsnr: mt.gsnr_matrix_db, osnr: mt.osnr_matrix_db,
    snr_ase: mt.snr_ase_matrix_db, snr_nli: mt.snr_nli_matrix_db,
  }
  const targetMap: Record<string, number | undefined> = {
    gsnr: targetGsnr.value, osnr: targetOsnr.value,
  }

  const posIdx = selectedPosition.value >= 0 ? selectedPosition.value : positions.count - 1
  const posName = positions.names[posIdx] || 'Rx'

  return [...selectedMetrics.value].filter(k => metricsMap[k]).map(metricKey => {
    const matrix = metricsMap[metricKey]!
    const yValues = matrix[posIdx] || []
    if (yValues.length === 0) return null
    const xValues = ch.frequencies_thz

    const p = chartPadding
    const w = chartWidth
    const h = 260

    const xMin = Math.min(...xValues)
    const xMax = Math.max(...xValues)
    // 将目标门限值纳入Y轴范围，确保门限线始终可见
    const tv = targetMap[metricKey]
    const dataMin = Math.min(...yValues)
    const dataMax = Math.max(...yValues)
    const yMin = Math.floor(Math.min(dataMin, tv ?? dataMin) - 2)
    const yMax = Math.ceil(Math.max(dataMax, tv ?? dataMax) + 2)

    const scaleX = (x: number) => p.left + ((x - xMin) / Math.max(1, xMax - xMin)) * (w - p.left - p.right)
    const scaleY = (y: number) => h - p.bottom - ((y - yMin) / Math.max(1, yMax - yMin)) * (h - p.top - p.bottom)

    const path = xValues.map((x, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(x)} ${scaleY(yValues[i])}`).join(' ')

    // X ticks
    const xStep = Math.max(1, Math.floor(xValues.length / 7))
    const xTicks: Array<{ value: string; x: number }> = []
    for (let i = 0; i < xValues.length; i += xStep) {
      xTicks.push({ value: xValues[i].toFixed(2), x: scaleX(xValues[i]) })
    }
    // Y ticks
    const yTicks: Array<{ value: string; y: number }> = []
    const yStep = (yMax - yMin) / 5
    for (let y = yMin; y <= yMax; y += yStep) {
      yTicks.push({ value: y.toFixed(1), y: scaleY(y) })
    }

    // 目标门限线
    let targetLine: { y: number; label: string } | null = null
    if (tv != null) {
      targetLine = { y: scaleY(tv), label: `目标 ${tv} dB` }
    }

    // 统计摘要
    const minVal = Math.min(...yValues)
    const maxVal = Math.max(...yValues)
    const minIdx = yValues.indexOf(minVal)
    const maxIdx = yValues.indexOf(maxVal)
    const avg = yValues.reduce((a, b) => a + b, 0) / yValues.length

    return {
      metricKey,
      metricLabel: metricLabels[metricKey],
      posName,
      color: metricColors[metricKey],
      w, h, p, path, xTicks, yTicks, targetLine,
      xAxisY: h - p.bottom,
      summary: {
        min: minVal.toFixed(1),
        minChannel: ch.ids[minIdx] || `Ch${minIdx + 1}`,
        max: maxVal.toFixed(1),
        maxChannel: ch.ids[maxIdx] || `Ch${maxIdx + 1}`,
        avg: avg.toFixed(1),
        flatness: (maxVal - minVal).toFixed(1),
      }
    }
  }).filter((x): x is NonNullable<typeof x> => x != null)
})

// ============ 达标率 ============

const complianceStats = computed(() => {
  if (!cache.value) return null
  const rxIdx = cache.value.positions.count - 1
  const rxRow = cache.value.metrics.gsnr_matrix_db[rxIdx] || []
  const target = targetGsnr.value
  const compliant = rxRow.filter(v => v >= target).length
  const rate = rxRow.length > 0 ? (compliant / rxRow.length * 100) : 0
  const nonCompliant = cache.value.channels.ids.filter((_, i) => rxRow[i] < target)
  return {
    rate: Math.round(rate * 10) / 10,
    compliantCount: compliant,
    totalCount: rxRow.length,
    nonCompliantChannels: nonCompliant.slice(0, 10),
    nonCompliantTotal: nonCompliant.length,
  }
})

// ============ 图表常量 ============

const chartPadding = { top: 30, right: 60, bottom: 50, left: 65 }
const chartWidth = 680
const chartHeight = 340

// ============ 热力图 ============

const heatmapData = computed(() => {
  if (!cache.value || !currentMatrix.value) return null
  const matrix = currentMatrix.value
  const pos = cache.value.positions
  const ch = cache.value.channels

  // 行=信道(Y轴), 列=位置(X轴) —— 按规范7.7转置
  const maxCh = 48
  const chStep = Math.max(1, Math.ceil(ch.count / maxCh))
  const sampledChIdx = Array.from({ length: Math.min(maxCh, ch.count) }, (_, i) => i * chStep)

  let min = Infinity
  let max = -Infinity
  const cells: Array<{ row: number; col: number; value: number; chIdx: number; posIdx: number }> = []

  for (let r = 0; r < sampledChIdx.length; r++) {
    const j = sampledChIdx[r]
    for (let c = 0; c < pos.count; c++) {
      const v = matrix[c]?.[j] ?? 0
      min = Math.min(min, v)
      max = Math.max(max, v)
      cells.push({ row: r, col: c, value: v, chIdx: j, posIdx: c })
    }
  }

  // 目标门限
  const target = selectedMetric.value === 'gsnr' ? targetGsnr.value
    : selectedMetric.value === 'osnr' ? targetOsnr.value : null

  // SVG 尺寸计算
  const padLeft = 55
  const padRight = 10
  const padTop = 5
  const padBottom = 60
  const cellW = Math.max(18, Math.floor(560 / pos.count))
  const cellH = Math.max(5, Math.floor(350 / sampledChIdx.length))
  const xLabelStep = Math.max(1, Math.ceil(pos.count / 15))
  const yLabelStep = Math.max(1, Math.ceil(sampledChIdx.length / 12))

  return {
    cells,
    rowCount: sampledChIdx.length,
    colCount: pos.count,
    rowLabels: sampledChIdx.map(j => ch.ids[j]),
    colLabels: pos.names,
    colDistances: pos.distances_km,
    min, max, target,
    cellW, cellH, padLeft, padRight, padTop, padBottom,
    svgW: padLeft + pos.count * cellW + padRight,
    svgH: padTop + sampledChIdx.length * cellH + padBottom,
    xLabelStep, yLabelStep,
  }
})

/** 热力图色块颜色：蓝→青→绿→黄→红 Jet 色阶 */
function getHeatColor(value: number, min: number, max: number) {
  if (max <= min) return '#3b82f6'
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  let r: number, g: number, b: number
  if (t < 0.25) {
    const s = t / 0.25
    r = 0; g = Math.round(s * 255); b = 255
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25
    r = 0; g = 255; b = Math.round((1 - s) * 255)
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25
    r = Math.round(s * 255); g = 255; b = 0
  } else {
    const s = (t - 0.75) / 0.25
    r = 255; g = Math.round((1 - s) * 255); b = 0
  }
  return `rgb(${r},${g},${b})`
}

/** 热力图单元格 Tooltip */
function getHeatTooltip(cell: { row: number; col: number; value: number }) {
  if (!heatmapData.value) return ''
  const d = heatmapData.value
  const lines = [
    `${d.rowLabels[cell.row]} @ ${d.colLabels[cell.col]}`,
    `位置: ${d.colDistances[cell.col].toFixed(1)} km`,
    `${metricLabels[selectedMetric.value]}: ${cell.value.toFixed(2)} dB`,
  ]
  if (d.target != null) {
    const margin = cell.value - d.target
    lines.push(`较目标: ${margin >= 0 ? '+' : ''}${margin.toFixed(1)} dB`)
    lines.push(`状态: ${margin >= 0 ? '✅ 达标' : '❌ 不达标'}`)
  }
  return lines.join('\n')
}

/** 热力图统计摘要（末端统计） */
const heatmapSummary = computed(() => {
  if (!cache.value) return null
  const metric = selectedMetric.value
  const ch = cache.value.channels
  const rxIdx = cache.value.positions.count - 1
  const metricsMap: Record<string, number[][]> = {
    gsnr: cache.value.metrics.gsnr_matrix_db,
    osnr: cache.value.metrics.osnr_matrix_db,
    snr_ase: cache.value.metrics.snr_ase_matrix_db,
    snr_nli: cache.value.metrics.snr_nli_matrix_db,
  }
  const rxRow = metricsMap[metric]?.[rxIdx] || []
  if (rxRow.length === 0) return null

  // GSNR: 直接从 summary 读取
  if (metric === 'gsnr') {
    const fg = cache.value.summary.final_gsnr
    const target = targetGsnr.value
    const compliant = rxRow.filter(v => v >= target).length
    const nonCompliant = ch.ids.filter((_, i) => rxRow[i] < target)
    return {
      metricLabel: 'GSNR',
      min: fg.min_db.toFixed(1), max: fg.max_db.toFixed(1), avg: fg.avg_db.toFixed(1),
      worstChannel: fg.worst_channel, bestChannel: fg.best_channel,
      target, compliantCount: compliant, totalCount: rxRow.length,
      rate: rxRow.length > 0 ? Math.round(compliant / rxRow.length * 1000) / 10 : 0,
      nonCompliantChannels: nonCompliant.slice(0, 10),
      nonCompliantTotal: nonCompliant.length,
    }
  }

  // 其他指标: 从末端行计算
  const minVal = Math.min(...rxRow)
  const maxVal = Math.max(...rxRow)
  const minIdx = rxRow.indexOf(minVal)
  const maxIdx = rxRow.indexOf(maxVal)
  const avg = rxRow.reduce((a, b) => a + b, 0) / rxRow.length
  const target = metric === 'osnr' ? targetOsnr.value : null
  let compliantCount = rxRow.length
  let nonCompliant: string[] = []
  if (target != null) {
    compliantCount = rxRow.filter(v => v >= target).length
    nonCompliant = ch.ids.filter((_, i) => rxRow[i] < target)
  }
  return {
    metricLabel: metricLabels[metric],
    min: minVal.toFixed(1), max: maxVal.toFixed(1), avg: avg.toFixed(1),
    worstChannel: ch.ids[minIdx] || `Ch${minIdx + 1}`,
    bestChannel: ch.ids[maxIdx] || `Ch${maxIdx + 1}`,
    target, compliantCount, totalCount: rxRow.length,
    rate: rxRow.length > 0 ? Math.round(compliantCount / rxRow.length * 1000) / 10 : 0,
    nonCompliantChannels: nonCompliant.slice(0, 10),
    nonCompliantTotal: nonCompliant.length,
  }
})

// ============ 数据表 ============

// 筛选状态
const tablePositionFilter = ref<'all' | 'rx'>('all')
const tableChannelFilter = ref<'all' | 'non_compliant' | 'worst' | 'best'>('all')
const tableMetricSet = ref(new Set<string>(['gsnr', 'osnr', 'snr_ase', 'snr_nli']))
const tablePage = ref(1)
const tablePageSize = 50
const tableSortKey = ref('posIdx')
const tableSortDir = ref<'asc' | 'desc'>('asc')

const toggleTableMetric = (key: string) => {
  const s = new Set(tableMetricSet.value)
  if (s.has(key)) { if (s.size > 1) s.delete(key) } else s.add(key)
  tableMetricSet.value = s
}
const toggleTableSort = (key: string) => {
  if (tableSortKey.value === key) {
    tableSortDir.value = tableSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    tableSortKey.value = key
    tableSortDir.value = 'asc'
  }
  tablePage.value = 1
}

watch([tableChannelFilter, tablePositionFilter], () => { tablePage.value = 1 })

interface TableRow {
  posIdx: number; chIdx: number
  position: string; distance: number
  channel: string; frequency: number
  gsnr: number; osnr: number; snr_ase: number; snr_nli: number
  status: 'pass' | 'warn' | 'fail'
}

const filteredTableRows = computed<TableRow[]>(() => {
  if (!cache.value) return []
  const pos = cache.value.positions
  const ch = cache.value.channels
  const m = cache.value.metrics
  const target = targetGsnr.value

  // 位置筛选
  const posIndices = tablePositionFilter.value === 'rx'
    ? [pos.count - 1]
    : Array.from({ length: pos.count }, (_, i) => i)

  // 信道筛选
  let chIndices: number[]
  if (tableChannelFilter.value === 'non_compliant') {
    const rxGsnr = m.gsnr_matrix_db[pos.count - 1] || []
    chIndices = Array.from({ length: ch.count }, (_, j) => j).filter(j => rxGsnr[j] < target)
  } else if (tableChannelFilter.value === 'worst') {
    const idx = ch.ids.indexOf(cache.value.summary.final_gsnr.worst_channel)
    chIndices = [idx >= 0 ? idx : 0]
  } else if (tableChannelFilter.value === 'best') {
    const idx = ch.ids.indexOf(cache.value.summary.final_gsnr.best_channel)
    chIndices = [idx >= 0 ? idx : ch.count - 1]
  } else {
    chIndices = Array.from({ length: ch.count }, (_, j) => j)
  }

  const rows: TableRow[] = []
  for (const i of posIndices) {
    for (const j of chIndices) {
      const gsnr = m.gsnr_matrix_db[i]?.[j] ?? 0
      rows.push({
        posIdx: i, chIdx: j,
        position: pos.names[i], distance: pos.distances_km[i],
        channel: ch.ids[j], frequency: ch.frequencies_thz[j],
        gsnr,
        osnr: m.osnr_matrix_db[i]?.[j] ?? 0,
        snr_ase: m.snr_ase_matrix_db[i]?.[j] ?? 0,
        snr_nli: m.snr_nli_matrix_db[i]?.[j] ?? 0,
        status: gsnr >= target + 2 ? 'pass' : gsnr >= target ? 'warn' : 'fail',
      })
    }
  }

  // 排序
  const key = tableSortKey.value as keyof TableRow
  const dir = tableSortDir.value === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    const va = a[key]; const vb = b[key]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })
  return rows
})

const tableRowCount = computed(() => filteredTableRows.value.length)
const tablePageCount = computed(() => Math.max(1, Math.ceil(tableRowCount.value / tablePageSize)))
const pagedTableRows = computed(() => {
  const start = (tablePage.value - 1) * tablePageSize
  return filteredTableRows.value.slice(start, start + tablePageSize)
})

// ============ 导出对话框 ============

const showExportDialog = ref(false)
const exportAllData = ref(true)
const exportFormat = ref<'csv' | 'xlsx' | 'json'>('csv')
const exportIncludeHeader = ref(true)
const exportIncludeUnit = ref(true)
const exportIncludeSummary = ref(false)
const exportFileName = ref('simulation_result_filtered')

/** 打开导出对话框 */
const openExportDialog = (allData: boolean) => {
  exportAllData.value = allData
  exportFileName.value = allData ? 'simulation_result_all' : 'simulation_result_filtered'
  showExportDialog.value = true
}

const exportRowCount = computed(() => {
  return exportAllData.value ? filteredTableRows.value.length : pagedTableRows.value.length
})

/** 构建统计摘要行 */
function buildSummaryRows(rows: TableRow[], metrics: string[]): string[][] {
  if (rows.length === 0) return []
  const result: string[][] = []
  result.push([]) // 空行分隔
  result.push(['统计摘要', '', '', '', ...metrics.map(() => ''), ''])
  // 各指标的 min/max/avg
  for (const mk of metrics) {
    const vals = rows.map(r => r[mk as keyof TableRow] as number)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    result.push([`${metricLabels[mk]} 最小`, '', '', '', ...metrics.map(k => k === mk ? min.toFixed(2) : ''), ''])
    result.push([`${metricLabels[mk]} 最大`, '', '', '', ...metrics.map(k => k === mk ? max.toFixed(2) : ''), ''])
    result.push([`${metricLabels[mk]} 平均`, '', '', '', ...metrics.map(k => k === mk ? avg.toFixed(2) : ''), ''])
  }
  // 达标统计
  const passCount = rows.filter(r => r.status === 'pass').length
  const warnCount = rows.filter(r => r.status === 'warn').length
  const failCount = rows.filter(r => r.status === 'fail').length
  result.push(['达标', '', '', '', ...metrics.map(() => ''), `${passCount} (${(passCount / rows.length * 100).toFixed(1)}%)`])
  result.push(['接近门限', '', '', '', ...metrics.map(() => ''), `${warnCount} (${(warnCount / rows.length * 100).toFixed(1)}%)`])
  result.push(['不达标', '', '', '', ...metrics.map(() => ''), `${failCount} (${(failCount / rows.length * 100).toFixed(1)}%)`])
  return result
}

/** 执行导出 */
const doExport = () => {
  if (!cache.value) return
  const rows = exportAllData.value ? filteredTableRows.value : pagedTableRows.value
  const metrics = [...tableMetricSet.value]
  const statusText = (s: string) => s === 'pass' ? '达标' : s === 'warn' ? '接近门限' : '不达标'
  const fname = exportFileName.value.trim() || 'simulation_result'

  if (exportFormat.value === 'csv') {
    const lines: string[] = []
    if (exportIncludeHeader.value) {
      const h = ['位置', '距离', '信道', '频率', ...metrics.map(k => metricLabels[k]), '状态']
      lines.push(h.join(','))
      if (exportIncludeUnit.value) {
        const u = ['', '(km)', '', '(THz)', ...metrics.map(() => '(dB)'), '']
        lines.push(u.join(','))
      }
    }
    for (const r of rows) {
      lines.push([r.position, r.distance.toFixed(1), r.channel, r.frequency.toFixed(3),
        ...metrics.map(k => (r[k as keyof TableRow] as number).toFixed(2)),
        statusText(r.status)].join(','))
    }
    if (exportIncludeSummary.value) {
      for (const sr of buildSummaryRows(rows, metrics)) lines.push(sr.join(','))
    }
    const csv = '\uFEFF' + lines.join('\n')
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fname}.csv`)
  } else if (exportFormat.value === 'json') {
    const data: Record<string, unknown> = {
      exportTime: new Date().toISOString(),
      recordCount: rows.length,
      metrics: metrics.map(k => metricLabels[k]),
      rows: rows.map(r => {
        const obj: Record<string, unknown> = {
          position: r.position, distance_km: r.distance,
          channel: r.channel, frequency_thz: r.frequency,
          status: statusText(r.status),
        }
        for (const k of metrics) obj[`${k}_db`] = +(r[k as keyof TableRow] as number).toFixed(2)
        return obj
      }),
    }
    if (exportIncludeSummary.value) {
      const summary: Record<string, unknown> = {}
      for (const mk of metrics) {
        const vals = rows.map(r => r[mk as keyof TableRow] as number)
        summary[mk] = {
          min: +Math.min(...vals).toFixed(2),
          max: +Math.max(...vals).toFixed(2),
          avg: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
        }
      }
      summary.compliance = {
        pass: rows.filter(r => r.status === 'pass').length,
        warn: rows.filter(r => r.status === 'warn').length,
        fail: rows.filter(r => r.status === 'fail').length,
      }
      data.summary = summary
    }
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `${fname}.json`)
  } else {
    // xlsx — 使用 CSV 作为 TSV 变体兼容 Excel 直接打开
    const lines: string[] = []
    if (exportIncludeHeader.value) {
      const h = ['位置', '距离', '信道', '频率', ...metrics.map(k => metricLabels[k]), '状态']
      lines.push(h.join('\t'))
      if (exportIncludeUnit.value) {
        const u = ['', '(km)', '', '(THz)', ...metrics.map(() => '(dB)'), '']
        lines.push(u.join('\t'))
      }
    }
    for (const r of rows) {
      lines.push([r.position, r.distance.toFixed(1), r.channel, r.frequency.toFixed(3),
        ...metrics.map(k => (r[k as keyof TableRow] as number).toFixed(2)),
        statusText(r.status)].join('\t'))
    }
    if (exportIncludeSummary.value) {
      for (const sr of buildSummaryRows(rows, metrics)) lines.push(sr.join('\t'))
    }
    const tsv = '\uFEFF' + lines.join('\n')
    downloadBlob(new Blob([tsv], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${fname}.xlsx`)
  }

  showExportDialog.value = false
  appStore.showNotification({ type: 'success', message: `已导出 ${rows.length} 条数据 (${exportFormat.value.toUpperCase()})` })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ============ 节点详情 ============

const nodeDetail = computed(() => {
  if (!cache.value || selectedNodeIndex.value < 0) return null
  const i = selectedNodeIndex.value
  const pos = cache.value.positions
  const m = cache.value.metrics
  const ch = cache.value.channels

  // 确定查看的信道
  let j: number
  if (channelMode.value === 'channel') {
    j = selectedChannel.value
  } else if (channelMode.value === 'worst') {
    j = ch.ids.indexOf(cache.value.summary.final_gsnr.worst_channel)
    if (j < 0) j = 0
  } else {
    j = Math.floor(ch.count / 2)
  }

  const gsnr = m.gsnr_matrix_db[i]?.[j] ?? 0
  const osnr = m.osnr_matrix_db[i]?.[j] ?? 0
  const snrAse = m.snr_ase_matrix_db[i]?.[j] ?? 0
  const snrNli = m.snr_nli_matrix_db[i]?.[j] ?? 0

  // 本段噪声（与上一节点的差值）
  const prevSnrAse = i > 0 ? (m.snr_ase_matrix_db[i - 1]?.[j] ?? 0) : null
  const prevSnrNli = i > 0 ? (m.snr_nli_matrix_db[i - 1]?.[j] ?? 0) : null

  return {
    name: pos.names[i],
    distance: pos.distances_km[i],
    channelId: ch.ids[j] || `Ch${j + 1}`,
    gsnr: gsnr.toFixed(2),
    osnr: osnr.toFixed(2),
    snr_ase: snrAse.toFixed(2),
    snr_nli: snrNli.toFixed(2),
    cumNli: snrNli !== 0 ? (-snrNli).toFixed(1) : '--',
    cumAse: snrAse !== 0 ? (-snrAse).toFixed(1) : '--',
    segNli: prevSnrNli != null ? (prevSnrNli - snrNli).toFixed(1) : '--',
    segAse: prevSnrAse != null ? (prevSnrAse - snrAse).toFixed(1) : '--',
  }
})

// ============ 操作 ============

/** 仿真前参数校验 */
function validateSimConfig(): string | null {
  if (!fiberModel.value) return '请选择光纤模型'
  if (!edfaModel.value) return '请选择 EDFA 模型'
  const elements = routeConnectorElements.value
  if (!elements || elements.length < 2) return '链路设计中无有效元素，请先完成链路设计'
  const hasFiber = elements.some(e => e.type === 'cable_segment' || e.type === 'fiber')
  if (!hasFiber) return '链路中无光纤段，无法计算'
  return null
}

/** 执行仿真计算 */
const runSimulation = () => {
  // 参数校验
  const err = validateSimConfig()
  if (err) {
    simState.value = 'ERROR'
    simulationError.value = { code: 'PARAM_ERROR', message: err, timestamp: new Date().toLocaleString() }
    appStore.showNotification({ type: 'warning', message: err })
    return
  }

  isSimulating.value = true
  simState.value = 'LOADING'
  simulationError.value = null
  simulationTime.value = 0
  appStore.showNotification({ type: 'info', message: '正在执行链路仿真计算...' })

  const startTime = performance.now()

  setTimeout(() => {
    try {
      const wdmConfig = settingsStore.systemPlanningConfig?.wdmParams
      const result = buildSimulationCache(
        routeConnectorElements.value,
        {
          channelCount: wdmConfig?.channelCount || 96,
          centerFreqTHz: wdmConfig?.centerFreqTHz || 193.1,
          channelSpacingGHz: wdmConfig?.channelSpacingGHz || 50,
          launchPower: wdmConfig?.launchPower || 0,
          modulation: wdmConfig?.modulation || 'DP-16QAM',
        },
        { fiberModel: fiberModel.value, edfaModel: edfaModel.value, buModel: hasBu.value ? buModel.value : null },
        props.linkCalcSummary
      )

      cache.value = result
      settingsStore.updateSimulationCache(result)
      settingsStore.updateSimulationModelConfig({ fiberModel: fiberModel.value as any, edfaModel: edfaModel.value as any })
      // 同步到工程设置的光纤仿真配置
      settingsStore.updateFiberSimulationConfig({ model: fiberModel.value as any })
      simulationTime.value = Math.round((performance.now() - startTime) / 100) / 10
      simState.value = 'SUCCESS'

      appStore.showNotification({ type: 'success', message: `仿真完成 (${fiberModel.value} + ${edfaModel.value})` })
      appStore.addLog('INFO', `链路仿真完成 [${fiberModel.value}/${edfaModel.value}]: 终端 GSNR = ${result.summary.final_gsnr.avg_db.toFixed(2)} dB`)
    } catch (error) {
      simState.value = 'ERROR'
      simulationError.value = classifyError(error as Error)
      appStore.showNotification({ type: 'error', message: '仿真失败: ' + (error as Error).message })
      appStore.addLog('ERROR', `仿真失败 [${simulationError.value.code}]: ${simulationError.value.message}`)
    } finally {
      isSimulating.value = false
    }
  }, 600)
}

/** 导出报告 — 打开报告对话框 */
const exportReport = () => {
  if (!cache.value) return
  // 预填报告标题
  reportTitle.value = `${linkInfo.value.linkName} 链路仿真分析报告`
  reportDate.value = new Date().toISOString().split('T')[0]
  showReportDialog.value = true
}

/** 点击图表节点 */
const handleNodeClick = (index: number) => {
  selectedNodeIndex.value = index
  showNodeDetail.value = true
}

/** 导出数据 */
const exportData = () => {
  if (!cache.value) return
  const blob = new Blob([JSON.stringify(cache.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `simulation_cache_${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
  appStore.showNotification({ type: 'success', message: '仿真数据已导出' })
}

// ============ 报告导出 (7.9) ============

const showReportDialog = ref(false)
const reportTitle = ref('')
const reportAuthor = ref('')
const reportDate = ref('')
const reportFormat = ref<'html' | 'pdf' | 'docx'>('html')
const reportSections = ref({
  linkInfo: true,
  simConfig: true,
  evolution: true,
  spectrum: true,
  heatmap: true,
  statsSummary: true,
  fullTable: false,
})
const reportChartChannel = ref<'worst' | 'average' | 'channel'>('worst')
const reportChartChannelIdx = ref(0)
const reportSpectrumPos = ref<'rx' | 'custom'>('rx')
const reportSpectrumPosIdx = ref(-1)
const isGeneratingReport = ref(false)

/** 生成报告 HTML 内容 */
function generateReportHtml(): string {
  if (!cache.value) return ''
  const c = cache.value
  const sections: string[] = []

  // CSS
  sections.push(`<style>
    body { font-family: 'Microsoft YaHei', sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 30px; color: #1f2937; font-size: 13px; line-height: 1.6; }
    h1 { font-size: 22px; text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; }
    h2 { font-size: 16px; color: #1e40af; border-left: 4px solid #3b82f6; padding-left: 10px; margin-top: 30px; }
    .meta { text-align: center; color: #6b7280; font-size: 12px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0; }
    th { background: #f3f4f6; text-align: left; padding: 6px 10px; border: 1px solid #e5e7eb; font-weight: 600; }
    td { padding: 5px 10px; border: 1px solid #e5e7eb; }
    .pass { color: #16a34a; } .warn { color: #d97706; } .fail { color: #dc2626; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
    .stat-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .stat-card .value { font-size: 18px; font-weight: 700; }
    .stat-card .label { font-size: 11px; color: #6b7280; }
  </style>`)

  // 标题与元信息
  sections.push(`<h1>${escHtml(reportTitle.value || '链路仿真分析报告')}</h1>`)
  sections.push(`<div class="meta">`)
  if (reportAuthor.value) sections.push(`编制: ${escHtml(reportAuthor.value)} &nbsp;|&nbsp; `)
  sections.push(`日期: ${escHtml(reportDate.value)} &nbsp;|&nbsp; 生成时间: ${new Date().toLocaleString()}</div>`)

  // 1. 链路基本信息
  if (reportSections.value.linkInfo) {
    sections.push(`<h2>1. 链路基本信息</h2>`)
    sections.push(`<table>
      <tr><th>链路名称</th><td>${escHtml(linkInfo.value.linkName)}</td></tr>
      <tr><th>总长度</th><td>${c.summary.total_length_km.toFixed(1)} km</td></tr>
      <tr><th>放大器数量</th><td>${linkInfo.value.amplifierCount}</td></tr>
      <tr><th>BU 数量</th><td>${linkInfo.value.buCount}</td></tr>
      <tr><th>均衡器数量</th><td>${linkInfo.value.equalizerCount}</td></tr>
      <tr><th>信道数</th><td>${c.channels.count}</td></tr>
      <tr><th>Span 数</th><td>${c.summary.total_span_count}</td></tr>
      <tr><th>仿真时间</th><td>${c.timestamp}</td></tr>
    </table>`)
  }

  // 2. 仿真配置参数
  if (reportSections.value.simConfig) {
    sections.push(`<h2>2. 仿真配置参数</h2>`)
    sections.push(`<table>
      <tr><th>光纤模型</th><td>${c.model_selection.fiber_model_id}</td></tr>
      <tr><th>EDFA 模型</th><td>${c.model_selection.edfa_model_id}</td></tr>
      <tr><th>BU 模型</th><td>${c.model_selection.bu_model_id || '无'}</td></tr>
      <tr><th>中心频率</th><td>${c.channels.frequencies_thz[Math.floor(c.channels.count / 2)]?.toFixed(2) || '--'} THz</td></tr>
      <tr><th>信道间隔</th><td>${c.channels.count > 1 ? ((c.channels.frequencies_thz[1] - c.channels.frequencies_thz[0]) * 1000).toFixed(1) : '--'} GHz</td></tr>
      <tr><th>目标 GSNR</th><td>${targetGsnr.value} dB</td></tr>
      <tr><th>目标 OSNR</th><td>${targetOsnr.value} dB</td></tr>
    </table>`)
  }

  // 3. 沿程演化（文字摘要）
  if (reportSections.value.evolution) {
    sections.push(`<h2>3. 沿程演化分析</h2>`)
    sections.push(`<p>报告图表选项: ${reportChartChannel.value === 'worst' ? '最差信道' : reportChartChannel.value === 'average' ? '平均值' : '指定信道'}</p>`)
    // 各指标末端值
    const rxIdx = c.positions.count - 1
    const mt = c.metrics
    for (const mk of allMetricKeys) {
      let chLabel: string
      let val: number
      if (reportChartChannel.value === 'worst') {
        val = Math.min(...(mt[`${mk}_matrix_db` as keyof typeof mt] as number[][])[rxIdx])
        chLabel = '最差信道'
      } else if (reportChartChannel.value === 'average') {
        const row = (mt[`${mk}_matrix_db` as keyof typeof mt] as number[][])[rxIdx]
        val = row.reduce((a, b) => a + b, 0) / row.length
        chLabel = '平均'
      } else {
        val = (mt[`${mk}_matrix_db` as keyof typeof mt] as number[][])[rxIdx]?.[reportChartChannelIdx.value] ?? 0
        chLabel = c.channels.ids[reportChartChannelIdx.value] || `Ch${reportChartChannelIdx.value + 1}`
      }
      sections.push(`<p>${metricLabels[mk]} (${chLabel}) 末端值: <strong>${val.toFixed(2)} dB</strong></p>`)
    }
  }

  // 4. 频谱分布（文字摘要）
  if (reportSections.value.spectrum) {
    const posIdx = reportSpectrumPos.value === 'rx' ? c.positions.count - 1 : (reportSpectrumPosIdx.value >= 0 ? reportSpectrumPosIdx.value : c.positions.count - 1)
    const posName = c.positions.names[posIdx] || 'Rx'
    sections.push(`<h2>4. 频谱分布分析 @ ${escHtml(posName)}</h2>`)
    const gsnrRow = c.metrics.gsnr_matrix_db[posIdx] || []
    if (gsnrRow.length > 0) {
      const min = Math.min(...gsnrRow), max = Math.max(...gsnrRow)
      const avg = gsnrRow.reduce((a, b) => a + b, 0) / gsnrRow.length
      sections.push(`<p>GSNR 范围: ${min.toFixed(2)} ~ ${max.toFixed(2)} dB, 平均: ${avg.toFixed(2)} dB, 不平坦度: ${(max - min).toFixed(2)} dB</p>`)
    }
  }

  // 5. 热力图说明
  if (reportSections.value.heatmap) {
    sections.push(`<h2>5. 热力图概览</h2>`)
    sections.push(`<p>热力图展示 ${c.channels.count} 信道 × ${c.positions.count} 位置的 GSNR 分布。颜色映射: 蓝(低) → 青 → 绿 → 黄 → 红(高)。</p>`)
  }

  // 6. 性能统计
  if (reportSections.value.statsSummary) {
    const fg = c.summary.final_gsnr
    const target = targetGsnr.value
    const rxRow = c.metrics.gsnr_matrix_db[c.positions.count - 1] || []
    const compliant = rxRow.filter(v => v >= target).length
    const rate = rxRow.length > 0 ? (compliant / rxRow.length * 100).toFixed(1) : '0'
    sections.push(`<h2>6. 性能统计</h2>`)
    sections.push(`<div class="stat-grid">
      <div class="stat-card"><div class="value" style="color:#3b82f6">${c.summary.total_length_km.toFixed(0)}</div><div class="label">总长度 (km)</div></div>
      <div class="stat-card"><div class="value" style="color:#8b5cf6">${c.summary.total_span_count}</div><div class="label">Span 数</div></div>
      <div class="stat-card"><div class="value" style="color:#f59e0b">${fg.avg_db.toFixed(2)}</div><div class="label">终端 GSNR 均值 (dB)</div></div>
      <div class="stat-card"><div class="value" style="color:#10b981">${c.summary.system_capacity_tbps}</div><div class="label">系统容量 (Tbps)</div></div>
    </div>`)
    sections.push(`<table>
      <tr><th>指标</th><th>最小值</th><th>最大值</th><th>平均值</th><th>最差信道</th><th>最佳信道</th></tr>
      <tr><td>GSNR</td><td>${fg.min_db.toFixed(2)} dB</td><td>${fg.max_db.toFixed(2)} dB</td><td>${fg.avg_db.toFixed(2)} dB</td><td>${fg.worst_channel}</td><td>${fg.best_channel}</td></tr>
    </table>`)
    sections.push(`<p>达标率: <strong class="${+rate >= 100 ? 'pass' : +rate >= 90 ? 'warn' : 'fail'}">${rate}%</strong> (${compliant}/${rxRow.length} 信道, 目标 ≥ ${target} dB)</p>`)
  }

  // 7. 完整数据表
  if (reportSections.value.fullTable) {
    sections.push(`<h2>7. 完整数据表</h2>`)
    const rxIdx = c.positions.count - 1
    sections.push(`<table><tr><th>信道</th><th>频率 (THz)</th><th>GSNR (dB)</th><th>OSNR (dB)</th><th>状态</th></tr>`)
    for (let j = 0; j < c.channels.count; j++) {
      const gsnr = c.metrics.gsnr_matrix_db[rxIdx]?.[j] ?? 0
      const osnr = c.metrics.osnr_matrix_db[rxIdx]?.[j] ?? 0
      const st = gsnr >= targetGsnr.value + 2 ? 'pass' : gsnr >= targetGsnr.value ? 'warn' : 'fail'
      const stText = st === 'pass' ? '✅ 达标' : st === 'warn' ? '⚠️ 接近门限' : '❌ 不达标'
      sections.push(`<tr><td>${c.channels.ids[j]}</td><td>${c.channels.frequencies_thz[j].toFixed(3)}</td><td class="${st}">${gsnr.toFixed(2)}</td><td>${osnr.toFixed(2)}</td><td class="${st}">${stText}</td></tr>`)
    }
    sections.push(`</table>`)
  }

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escHtml(reportTitle.value)}</title></head><body>${sections.join('\n')}</body></html>`
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 执行报告生成 */
const doGenerateReport = () => {
  if (!cache.value) return
  isGeneratingReport.value = true

  setTimeout(() => {
    try {
      const html = generateReportHtml()
      const fname = (reportTitle.value.trim() || '仿真分析报告').replace(/[\\/:*?"<>|]/g, '_')

      if (reportFormat.value === 'html') {
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${fname}.html`)
      } else if (reportFormat.value === 'pdf') {
        // 使用浏览器打印功能模拟 PDF 导出
        const win = window.open('', '_blank')
        if (win) {
          win.document.write(html)
          win.document.close()
          setTimeout(() => { win.print() }, 500)
        }
      } else {
        // docx fallback: 使用 HTML 格式的 Word 兼容文件
        const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--></head><body>${html}</body></html>`
        downloadBlob(new Blob([docHtml], { type: 'application/msword;charset=utf-8' }), `${fname}.docx`)
      }

      showReportDialog.value = false
      appStore.showNotification({ type: 'success', message: `报告已生成 (${reportFormat.value.toUpperCase()})` })
    } catch (err) {
      appStore.showNotification({ type: 'error', message: '报告生成失败: ' + (err as Error).message })
    } finally {
      isGeneratingReport.value = false
    }
  }, 300)
}

// 模型变更自动重算
watch([fiberModel, edfaModel], () => {
  // 只在已有结果且模型确实变更时自动重新计算
  if (cache.value && configChanged.value && !isSimulating.value && !restoringCachedResult.value) {
    runSimulation()
  }
})

// 打开时加载缓存 + 同步工程设置中的模型配置
watch(() => props.visible, async (visible) => {
  if (visible) {
    restoringCachedResult.value = true
    if (settingsStore.simulationCache?.is_valid) {
      const cachedFiber = settingsStore.simulationCache.model_selection.fiber_model_id
      const cachedEdfa = settingsStore.simulationCache.model_selection.edfa_model_id
      if (fiberModelOptions.some(option => option.value === cachedFiber)) fiberModel.value = cachedFiber
      if (edfaModelOptions.some(option => option.value === cachedEdfa)) edfaModel.value = cachedEdfa
      buModel.value = settingsStore.simulationCache.model_selection.bu_model_id
      cache.value = settingsStore.simulationCache
      simState.value = 'SUCCESS'
    } else {
      const settingsFiber = settingsStore.fiberSimulationConfig?.model
      const settingsEdfa = settingsStore.simulationModelConfig?.edfaModel
      if (settingsFiber && fiberModelOptions.some(option => option.value === settingsFiber)) {
        fiberModel.value = settingsFiber
      }
      if (settingsEdfa && edfaModelOptions.some(option => option.value === settingsEdfa)) {
        edfaModel.value = settingsEdfa
      }
    }
    await nextTick()
    restoringCachedResult.value = false
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-[95vw] h-[90vh] max-w-[1400px] overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-5 py-3 border-b flex items-center justify-between bg-gray-50 flex-shrink-0">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <BarChart2 class="w-5 h-5 text-blue-500" />
            链路仿真分析
          </h3>
          <button class="p-1.5 hover:bg-gray-200 rounded transition-colors" @click="emit('close')">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <!-- 主体：左右分栏 -->
        <div class="flex-1 flex overflow-hidden">
          <!-- 左侧：仿真配置面板 -->
          <div class="w-[280px] flex-shrink-0 border-r bg-gray-50/50 overflow-y-auto p-4 space-y-4">

            <!-- ① 链路信息 -->
            <div class="space-y-2">
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Info class="w-3.5 h-3.5 text-blue-500" />
                链路信息
              </div>
              <div class="bg-white rounded-lg border p-2.5 space-y-1.5 text-xs">
                <div class="font-medium text-gray-800 truncate" :title="linkInfo.linkName">{{ linkInfo.linkName }}</div>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-500">
                  <span>总长度</span>
                  <span class="text-right font-mono text-gray-700">{{ linkInfo.totalLength > 0 ? linkInfo.totalLength.toFixed(0) + ' km' : '--' }}</span>
                  <span>放大器</span>
                  <span class="text-right font-mono text-gray-700">{{ linkInfo.amplifierCount }}</span>
                  <template v-if="hasBu">
                    <span>BU</span>
                    <span class="text-right font-mono text-gray-700">{{ linkInfo.buCount }}</span>
                  </template>
                  <template v-if="linkInfo.equalizerCount > 0">
                    <span>均衡器</span>
                    <span class="text-right font-mono text-gray-700">{{ linkInfo.equalizerCount }}</span>
                  </template>
                  <span>信道数</span>
                  <span class="text-right font-mono text-gray-700">{{ linkInfo.channelCount }}</span>
                </div>
              </div>
            </div>

            <!-- ② 计算模型 -->
            <div class="border-t pt-3 space-y-2">
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Cpu class="w-3.5 h-3.5 text-blue-500" />
                计算模型
              </div>
              <div class="space-y-1.5">
                <div>
                  <label class="text-[10px] text-gray-500 mb-0.5 block">光纤模型</label>
                  <select v-model="fiberModel"
                    class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white transition-colors"
                    :class="!fiberModel ? 'border-red-300 bg-red-50' : configChanged ? 'border-orange-400 bg-orange-50' : ''">
                    <option value="" disabled>请选择光纤模型</option>
                    <option v-for="opt in fiberModelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] text-gray-500 mb-0.5 block">EDFA 模型</label>
                  <select v-model="edfaModel"
                    class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white transition-colors"
                    :class="!edfaModel ? 'border-red-300 bg-red-50' : configChanged ? 'border-orange-400 bg-orange-50' : ''">
                    <option value="" disabled>请选择 EDFA 模型</option>
                    <option v-for="opt in edfaModelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </div>
                <div v-if="hasBu">
                  <label class="text-[10px] text-gray-500 mb-0.5 block">BU 模型</label>
                  <select v-model="buModel" class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white">
                    <option :value="null">无</option>
                    <option v-for="opt in buModelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- ③ 信道显示 -->
            <div class="border-t pt-3 space-y-2">
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Filter class="w-3.5 h-3.5 text-purple-500" />
                信道显示
              </div>
              <!-- 性能指标 -->
              <div>
                <label class="text-[10px] text-gray-500 mb-0.5 block">性能指标</label>
                <select v-model="selectedMetric" class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="gsnr">GSNR</option>
                  <option value="osnr">OSNR</option>
                  <option value="snr_ase">SNR_ASE</option>
                  <option value="snr_nli">SNR_NLI</option>
                </select>
              </div>
              <!-- 信道模式 - radio 按钮组 -->
              <div class="space-y-1">
                <label class="text-[10px] text-gray-500 block">信道模式</label>
                <label class="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input type="radio" v-model="channelMode" value="channel" class="accent-blue-500" />
                  指定信道
                </label>
                <label class="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input type="radio" v-model="channelMode" value="average" class="accent-blue-500" />
                  平均值
                </label>
                <label class="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input type="radio" v-model="channelMode" value="worst" class="accent-blue-500" />
                  最差信道
                </label>
              </div>
              <!-- 指定信道下拉 -->
              <div v-if="channelMode === 'channel'">
                <label class="text-[10px] text-gray-500 mb-0.5 block">选择信道</label>
                <select v-model="selectedChannel" class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white">
                  <option v-for="opt in channelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <!-- 最差信道自动定位提示 -->
              <div v-if="channelMode === 'worst' && cache" class="text-[10px] text-orange-600 bg-orange-50 rounded px-2 py-1">
                最差信道: {{ cache.summary.final_gsnr.worst_channel }} ({{ cache.summary.final_gsnr.min_db.toFixed(2) }} dB)
              </div>
              <!-- 频谱分布位置选择 -->
              <div v-if="activeTab === 'spectrum'">
                <label class="text-[10px] text-gray-500 mb-0.5 block">频谱位置</label>
                <select v-model="selectedPosition" class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white">
                  <option :value="-1">Rx (终端)</option>
                  <option v-for="opt in positionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </div>

            <!-- ④ 目标门限 -->
            <div class="border-t pt-3 space-y-2">
              <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Target class="w-3.5 h-3.5 text-orange-500" />
                目标门限
              </div>
              <div>
                <label class="text-[10px] text-gray-500 mb-0.5 block">目标 GSNR (dB)</label>
                <input v-model.number="targetGsnr" type="number" step="0.5" min="0" max="40"
                  class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <div>
                <label class="text-[10px] text-gray-500 mb-0.5 block">目标 OSNR (dB)</label>
                <input v-model.number="targetOsnr" type="number" step="0.5" min="0" max="50"
                  class="w-full px-2 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <!-- 达标率 -->
              <div v-if="complianceStats" class="p-2.5 rounded-lg text-xs"
                :class="complianceStats.rate >= 100 ? 'bg-green-50 border border-green-200' : complianceStats.rate >= 90 ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'">
                <div class="font-medium" :class="complianceStats.rate >= 100 ? 'text-green-700' : complianceStats.rate >= 90 ? 'text-yellow-700' : 'text-red-700'">
                  达标率: {{ complianceStats.rate }}%
                </div>
                <div class="text-gray-500 mt-0.5">{{ complianceStats.compliantCount }} / {{ complianceStats.totalCount }} 信道达标</div>
                <div v-if="complianceStats.nonCompliantTotal > 0" class="text-gray-400 mt-0.5">
                  不达标: {{ complianceStats.nonCompliantChannels.join(', ') }}{{ complianceStats.nonCompliantTotal > 10 ? ` 等${complianceStats.nonCompliantTotal}个` : '' }}
                </div>
              </div>
            </div>

            <!-- ⑤ 操作按钮 -->
            <div class="border-t pt-3 space-y-2">
              <Button class="w-full" @click="runSimulation" :disabled="isSimulating">
                <RefreshCw class="w-4 h-4 mr-1" :class="{ 'animate-spin': isSimulating }" />
                {{ isSimulating ? '计算中...' : '开始仿真' }}
              </Button>
              <Button variant="outline" class="w-full" @click="exportReport" :disabled="!cache">
                <FileText class="w-4 h-4 mr-1" /> 导出报告
              </Button>
            </div>
          </div>

          <!-- 右侧：仿真结果面板 -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- 仿真状态栏 -->
            <div class="px-4 py-2 border-b flex items-center gap-3 text-xs flex-shrink-0 bg-white">
              <span v-if="simState === 'LOADING'" class="flex items-center gap-1 text-blue-600">
                <RefreshCw class="w-3 h-3 animate-spin" />
                计算中...
              </span>
              <span v-else-if="simState === 'ERROR'" class="flex items-center gap-1 text-red-600">
                <span class="w-2 h-2 rounded-full bg-red-500" />
                仿真失败
              </span>
              <span v-else-if="simState === 'SUCCESS' && cache?.is_valid" class="flex items-center gap-1 text-green-600">
                <span class="w-2 h-2 rounded-full bg-green-500" />
                有效
              </span>
              <span v-else-if="cache" class="flex items-center gap-1 text-yellow-600">
                <span class="w-2 h-2 rounded-full bg-yellow-400" />
                已过期
              </span>
              <span v-else class="flex items-center gap-1 text-gray-400">
                <span class="w-2 h-2 rounded-full bg-gray-300" />
                未计算
              </span>
              <span v-if="simState === 'ERROR' && simulationError" class="text-red-400">{{ simulationError.timestamp }}</span>
              <span v-else-if="cache" class="text-gray-400">{{ cache.timestamp }}</span>
              <span v-if="simulationTime > 0" class="text-gray-400">耗时 {{ simulationTime }}s</span>
              <span v-if="cache" class="text-gray-400 ml-auto">
                {{ cache.model_selection.fiber_model_id }} · {{ cache.model_selection.edfa_model_id }}{{ cache.model_selection.bu_model_id ? ' · ' + cache.model_selection.bu_model_id : '' }}
              </span>
            </div>

            <!-- 结果摘要 -->
            <div v-if="cache" class="grid grid-cols-4 gap-3 p-4 border-b flex-shrink-0">
              <div class="bg-blue-50 rounded-lg p-3 text-center">
                <div class="text-lg font-bold text-blue-600">{{ cache.summary.total_length_km.toFixed(0) }}</div>
                <div class="text-[10px] text-gray-500">总长度 (km)</div>
              </div>
              <div class="bg-purple-50 rounded-lg p-3 text-center">
                <div class="text-lg font-bold text-purple-600">{{ cache.summary.total_span_count }}</div>
                <div class="text-[10px] text-gray-500">Span 数</div>
              </div>
              <div class="bg-orange-50 rounded-lg p-3 text-center">
                <div class="text-lg font-bold text-orange-600">{{ cache.summary.final_gsnr.avg_db.toFixed(2) }}</div>
                <div class="text-[10px] text-gray-500">终端 GSNR 均值 (dB)</div>
              </div>
              <div class="bg-green-50 rounded-lg p-3 text-center">
                <div class="text-lg font-bold text-green-600">{{ cache.summary.system_capacity_tbps }}</div>
                <div class="text-[10px] text-gray-500">系统容量 (Tbps)</div>
              </div>
            </div>

            <!-- Tab 切换 -->
            <div class="px-4 py-2 border-b bg-white flex items-center gap-2 flex-shrink-0">
              <button v-for="tab in ([
                { key: 'evolution', label: '沿程演化' },
                { key: 'spectrum', label: '频谱分布' },
                { key: 'heatmap', label: '热力图' },
                { key: 'table', label: '数据表' },
              ] as const)" :key="tab.key"
                class="px-3 py-1.5 text-xs rounded transition-colors"
                :class="activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'"
                @click="activeTab = tab.key"
              >
                {{ tab.label }}
              </button>
              <div class="flex-1" />
              <span v-if="cache" class="text-[10px] text-gray-400">
                {{ cache.positions.count }} 位置 × {{ cache.channels.count }} 信道 · {{ cache.model_selection.fiber_model_id }}
              </span>
            </div>

            <!-- 图表内容区 -->
            <div class="flex-1 overflow-auto p-4">
              <!-- 加载中 -->
              <div v-if="simState === 'LOADING'" class="flex items-center justify-center h-full">
                <div class="text-center">
                  <RefreshCw class="w-10 h-10 mx-auto mb-3 text-blue-400 animate-spin" />
                  <div class="text-sm text-gray-500">正在执行链路仿真计算...</div>
                  <div class="text-[10px] text-gray-400 mt-1">根据链路复杂度可能需要几秒</div>
                </div>
              </div>

              <!-- 仿真失败 -->
              <div v-else-if="simState === 'ERROR' && simulationError" class="flex items-center justify-center h-full">
                <div class="w-[460px] bg-red-50 border border-red-200 rounded-lg p-6">
                  <div class="flex items-center gap-2 mb-3">
                    <AlertTriangle class="w-5 h-5 text-red-500" />
                    <span class="font-semibold text-red-700">仿真失败</span>
                    <span class="text-[10px] text-red-400 ml-auto">{{ simulationError.timestamp }}</span>
                  </div>
                  <div class="mb-3">
                    <div class="text-xs text-red-600 mb-1">
                      <span class="inline-block px-1.5 py-0.5 bg-red-100 rounded text-[10px] font-mono mr-1.5">{{ simulationError.code }}</span>
                      {{ errorCodeLabels[simulationError.code] || simulationError.code }}
                    </div>
                    <div class="text-xs text-red-800 bg-white rounded border border-red-100 p-2.5">
                      {{ simulationError.message }}
                    </div>
                  </div>
                  <div v-if="simulationError.detail" class="mb-3">
                    <button class="text-[10px] text-red-400 underline" @click="simulationError.detail = simulationError.detail ? undefined : simulationError.detail">查看详情</button>
                    <pre class="mt-1 text-[10px] text-red-400 bg-white rounded border border-red-100 p-2 overflow-auto max-h-[100px] font-mono">{{ simulationError.detail }}</pre>
                  </div>
                  <div class="flex items-center gap-2">
                    <Button size="sm" @click="runSimulation">
                      <RefreshCw class="w-3.5 h-3.5 mr-1" />
                      重新计算
                    </Button>
                    <span class="text-[10px] text-red-400">请检查参数配置后重试</span>
                  </div>
                </div>
              </div>

              <!-- 无数据提示 (IDLE) -->
              <div v-else-if="!cache" class="flex items-center justify-center h-full text-gray-400">
                <div class="text-center">
                  <BarChart2 class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <div class="text-sm">请点击「开始仿真」执行计算</div>
                </div>
              </div>

              <!-- 沿程演化视图 -->
              <div v-else-if="activeTab === 'evolution'" class="space-y-4">
                <!-- 指标选择 -->
                <div class="bg-white rounded-lg border p-3">
                  <div class="text-[10px] text-gray-500 mb-1.5">指标选择</div>
                  <div class="flex items-center gap-4">
                    <label v-for="mk in allMetricKeys" :key="mk" class="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                      <input type="checkbox" :checked="selectedMetrics.has(mk)" @change="toggleMetric(mk)" class="accent-blue-500 rounded" />
                      {{ metricLabels[mk] }}
                    </label>
                  </div>
                </div>
                <!-- 信道筛选 -->
                <div class="bg-white rounded-lg border p-3 space-y-2">
                  <div class="text-[10px] text-gray-500">信道筛选</div>
                  <div class="flex items-center gap-4 text-xs">
                    <span class="text-gray-500">显示模式:</span>
                    <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="channelMode" value="channel" class="accent-blue-500" /> 指定信道</label>
                    <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="channelMode" value="average" class="accent-blue-500" /> 平均值</label>
                    <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="channelMode" value="worst" class="accent-blue-500" /> 最差信道</label>
                  </div>
                  <div v-if="channelMode === 'channel'" class="flex items-center gap-2 text-xs">
                    <span class="text-gray-500">信道选择:</span>
                    <select v-model="selectedChannel" class="px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white flex-1 max-w-[240px]">
                      <option v-for="opt in channelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                  <div v-if="cache" class="text-[10px] text-gray-400">
                    最差信道: {{ cache.summary.final_gsnr.worst_channel }} (来自仿真结果)
                  </div>
                </div>
                <!-- 堆叠图表 -->
                <div v-for="chart in evolutionCharts" :key="chart.metricKey" class="bg-gray-50 rounded-lg border p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h4 class="font-medium text-gray-700 text-sm">{{ chart.metricLabel }} 沿程演化曲线</h4>
                    <div class="flex items-center gap-3 text-[10px]">
                      <span class="flex items-center gap-1"><span class="w-3 h-0.5" :style="{ background: chart.color }" />{{ chart.channelLabel }}</span>
                      <span v-if="chart.targetLine" class="flex items-center gap-1"><span class="w-3 h-0.5 bg-red-400" style="border-top:1px dashed" />目标门限</span>
                    </div>
                  </div>
                  <svg :viewBox="`0 0 ${chart.w} ${chart.h}`" class="w-full" preserveAspectRatio="xMidYMid meet">
                    <!-- 网格 -->
                    <line v-for="tick in chart.yTicks" :key="'yg'+chart.metricKey+tick.value" :x1="chart.p.left" :x2="chart.w - chart.p.right" :y1="tick.y" :y2="tick.y" stroke="#e5e7eb" stroke-width="0.5" />
                    <!-- 目标线 -->
                    <line v-if="chart.targetLine" :x1="chart.p.left" :x2="chart.w - chart.p.right"
                      :y1="chart.targetLine.y" :y2="chart.targetLine.y" stroke="#f87171" stroke-width="1" stroke-dasharray="6 3" />
                    <text v-if="chart.targetLine" :x="chart.w - chart.p.right + 4" :y="chart.targetLine.y + 3" fill="#f87171" font-size="9">{{ chart.targetLine.label }}</text>
                    <!-- 曲线 -->
                    <path :d="chart.path" fill="none" :stroke="chart.color" stroke-width="2" />
                    <!-- 数据点 -->
                    <circle v-for="pt in chart.points" :key="pt.index"
                      :cx="pt.cx" :cy="pt.cy" r="4" :fill="chart.color" stroke="white" stroke-width="1.5"
                      class="cursor-pointer" @click="handleNodeClick(pt.index)">
                      <title>{{ cache!.positions.names[pt.index] }}: {{ pt.value }} dB</title>
                    </circle>
                    <!-- X轴线 -->
                    <line :x1="chart.p.left" :x2="chart.w - chart.p.right" :y1="chart.xAxisY" :y2="chart.xAxisY" stroke="#9ca3af" stroke-width="1" />
                    <!-- X轴距离标签 + 节点名称 -->
                    <template v-for="tick in chart.xTicks" :key="'xn'+chart.metricKey+tick.name">
                      <text v-if="tick.show" :x="tick.x" :y="chart.xAxisY + 14" text-anchor="middle" fill="#6b7280" font-size="9">{{ tick.value }}</text>
                      <text v-if="tick.show" :x="tick.x" :y="chart.xAxisY + 25" text-anchor="middle" fill="#9ca3af" font-size="8">▲</text>
                      <text v-if="tick.show" :x="tick.x" :y="chart.xAxisY + 37" text-anchor="middle" fill="#374151" font-size="8" font-weight="500">{{ tick.name }}</text>
                    </template>
                    <!-- X轴标签 -->
                    <text :x="(chart.p.left + chart.w - chart.p.right) / 2" :y="chart.h - 5" text-anchor="middle" fill="#6b7280" font-size="11">距离 (km)</text>
                    <!-- Y轴 -->
                    <line :x1="chart.p.left" :x2="chart.p.left" :y1="chart.p.top" :y2="chart.xAxisY" stroke="#9ca3af" stroke-width="1" />
                    <text v-for="tick in chart.yTicks" :key="'y'+chart.metricKey+tick.value" :x="chart.p.left - 8" :y="tick.y + 3" text-anchor="end" fill="#6b7280" font-size="10">{{ tick.value }}</text>
                    <text :x="15" :y="(chart.p.top + chart.xAxisY) / 2" text-anchor="middle" fill="#6b7280" font-size="11" :transform="`rotate(-90, 15, ${(chart.p.top + chart.xAxisY) / 2})`">{{ chart.metricLabel }} (dB)</text>
                  </svg>
                  <!-- 统计摘要栏 -->
                  <div class="mt-2 px-2 py-1.5 bg-white rounded border text-xs flex items-center gap-4">
                    <span class="text-gray-600">末端值: <span class="font-mono font-medium">{{ chart.summary.endValue }} dB</span></span>
                    <span v-if="chart.summary.margin != null" class="text-gray-600">裕量: <span class="font-mono font-medium" :class="chart.summary.passed ? 'text-green-600' : 'text-red-600'">{{ chart.summary.margin }} dB</span></span>
                    <span v-if="chart.summary.passed != null">状态: {{ chart.summary.passed ? '✅' : '❌' }}</span>
                  </div>
                </div>
              </div>

              <!-- 频谱分布视图 -->
              <div v-else-if="activeTab === 'spectrum'" class="space-y-4">
                <!-- 位置选择 -->
                <div class="bg-white rounded-lg border p-3">
                  <div class="flex items-center gap-3 text-xs">
                    <span class="text-gray-500">观测位置:</span>
                    <select v-model="selectedPosition" class="px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white flex-1 max-w-[280px]">
                      <option :value="-1">Rx (终端)</option>
                      <option v-for="opt in positionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                </div>
                <!-- 堆叠图表 -->
                <div v-for="chart in spectrumCharts" :key="chart.metricKey" class="bg-gray-50 rounded-lg border p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h4 class="font-medium text-gray-700 text-sm">{{ chart.metricLabel }} 频谱分布 @ {{ chart.posName }}</h4>
                    <div class="flex items-center gap-3 text-[10px]">
                      <span class="flex items-center gap-1"><span class="w-3 h-0.5" :style="{ background: chart.color }" />频谱曲线</span>
                      <span v-if="chart.targetLine" class="flex items-center gap-1"><span class="w-3 h-0.5 bg-red-400" style="border-top:1px dashed" />目标门限</span>
                    </div>
                  </div>
                  <svg :viewBox="`0 0 ${chart.w} ${chart.h}`" class="w-full" preserveAspectRatio="xMidYMid meet">
                    <!-- 网格 -->
                    <line v-for="tick in chart.yTicks" :key="'syg'+chart.metricKey+tick.value" :x1="chart.p.left" :x2="chart.w - chart.p.right" :y1="tick.y" :y2="tick.y" stroke="#e5e7eb" stroke-width="0.5" />
                    <!-- 目标线 -->
                    <line v-if="chart.targetLine" :x1="chart.p.left" :x2="chart.w - chart.p.right"
                      :y1="chart.targetLine.y" :y2="chart.targetLine.y" stroke="#f87171" stroke-width="1" stroke-dasharray="6 3" />
                    <text v-if="chart.targetLine" :x="chart.w - chart.p.right + 4" :y="chart.targetLine.y + 3" fill="#f87171" font-size="9">{{ chart.targetLine.label }}</text>
                    <!-- 曲线 -->
                    <path :d="chart.path" fill="none" :stroke="chart.color" stroke-width="1.5" />
                    <!-- X轴 -->
                    <line :x1="chart.p.left" :x2="chart.w - chart.p.right" :y1="chart.xAxisY" :y2="chart.xAxisY" stroke="#9ca3af" stroke-width="1" />
                    <text v-for="tick in chart.xTicks" :key="'sx'+chart.metricKey+tick.value" :x="tick.x" :y="chart.xAxisY + 16" text-anchor="middle" fill="#6b7280" font-size="10">{{ tick.value }}</text>
                    <text :x="(chart.p.left + chart.w - chart.p.right) / 2" :y="chart.h - 5" text-anchor="middle" fill="#6b7280" font-size="11">频率 (THz)</text>
                    <!-- Y轴 -->
                    <line :x1="chart.p.left" :x2="chart.p.left" :y1="chart.p.top" :y2="chart.xAxisY" stroke="#9ca3af" stroke-width="1" />
                    <text v-for="tick in chart.yTicks" :key="'sy'+chart.metricKey+tick.value" :x="chart.p.left - 8" :y="tick.y + 3" text-anchor="end" fill="#6b7280" font-size="10">{{ tick.value }}</text>
                    <text :x="15" :y="(chart.p.top + chart.xAxisY) / 2" text-anchor="middle" fill="#6b7280" font-size="11" :transform="`rotate(-90, 15, ${(chart.p.top + chart.xAxisY) / 2})`">{{ chart.metricLabel }} (dB)</text>
                  </svg>
                  <!-- 统计摘要栏 -->
                  <div class="mt-2 px-2 py-1.5 bg-white rounded border text-xs space-y-0.5">
                    <div class="flex items-center gap-4">
                      <span class="text-gray-600">最小: <span class="font-mono font-medium">{{ chart.summary.min }} dB</span> <span class="text-gray-400">({{ chart.summary.minChannel }})</span></span>
                      <span class="text-gray-600">最大: <span class="font-mono font-medium">{{ chart.summary.max }} dB</span> <span class="text-gray-400">({{ chart.summary.maxChannel }})</span></span>
                    </div>
                    <div class="flex items-center gap-4">
                      <span class="text-gray-600">平均: <span class="font-mono font-medium">{{ chart.summary.avg }} dB</span></span>
                      <span class="text-gray-600">不平坦度: <span class="font-mono font-medium">{{ chart.summary.flatness }} dB</span></span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 热力图视图 -->
              <div v-else-if="activeTab === 'heatmap'" class="space-y-4">
                <!-- 指标选择 -->
                <div class="bg-white rounded-lg border p-3">
                  <div class="flex items-center gap-3 text-xs">
                    <span class="text-gray-500">显示指标:</span>
                    <select v-model="selectedMetric" class="px-2 py-1 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="gsnr">GSNR</option>
                      <option value="osnr">OSNR</option>
                      <option value="snr_ase">SNR_ASE</option>
                      <option value="snr_nli">SNR_NLI</option>
                    </select>
                  </div>
                </div>
                <!-- 热力图 -->
                <div class="bg-gray-50 rounded-lg border p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h4 class="font-medium text-gray-700 text-sm">{{ metricLabels[selectedMetric] }} 演化热力图 (信道 × 位置)</h4>
                    <div class="flex items-center gap-2 text-[10px] text-gray-500">
                      <span>{{ heatmapData?.min.toFixed(1) }} dB</span>
                      <span class="w-24 h-3 rounded" style="background: linear-gradient(to right, rgb(0,0,255), rgb(0,255,255), rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))" />
                      <span>{{ heatmapData?.max.toFixed(1) }} dB</span>
                    </div>
                  </div>
                  <div v-if="heatmapData" class="overflow-auto">
                    <svg :viewBox="`0 0 ${heatmapData.svgW} ${heatmapData.svgH}`"
                      :style="{ minWidth: heatmapData.svgW + 'px', minHeight: heatmapData.svgH + 'px' }">
                      <!-- Y轴信道标签 -->
                      <template v-for="(label, r) in heatmapData.rowLabels" :key="'chl'+r">
                        <text v-if="r % heatmapData.yLabelStep === 0 || r === heatmapData.rowCount - 1"
                          :x="heatmapData.padLeft - 6" :y="heatmapData.padTop + r * heatmapData.cellH + heatmapData.cellH / 2 + 3"
                          text-anchor="end" fill="#6b7280" font-size="8">{{ label }}</text>
                      </template>
                      <!-- 色块 -->
                      <rect v-for="cell in heatmapData.cells" :key="`h${cell.row}-${cell.col}`"
                        :x="heatmapData.padLeft + cell.col * heatmapData.cellW"
                        :y="heatmapData.padTop + cell.row * heatmapData.cellH"
                        :width="Math.max(1, heatmapData.cellW - 1)"
                        :height="Math.max(1, heatmapData.cellH - 1)"
                        :fill="getHeatColor(cell.value, heatmapData.min, heatmapData.max)" rx="0.5">
                        <title>{{ getHeatTooltip(cell) }}</title>
                      </rect>
                      <!-- X轴位置标签（旋转 -45°） -->
                      <template v-for="(label, c) in heatmapData.colLabels" :key="'pl'+c">
                        <text v-if="c % heatmapData.xLabelStep === 0 || c === heatmapData.colCount - 1"
                          :x="heatmapData.padLeft + c * heatmapData.cellW + heatmapData.cellW / 2"
                          :y="heatmapData.padTop + heatmapData.rowCount * heatmapData.cellH + 12"
                          text-anchor="end" fill="#374151" font-size="8" font-weight="500"
                          :transform="`rotate(-45, ${heatmapData.padLeft + c * heatmapData.cellW + heatmapData.cellW / 2}, ${heatmapData.padTop + heatmapData.rowCount * heatmapData.cellH + 12})`">{{ label }}</text>
                      </template>
                      <!-- 轴标签 -->
                      <text :x="10" :y="heatmapData.padTop + heatmapData.rowCount * heatmapData.cellH / 2"
                        text-anchor="middle" fill="#6b7280" font-size="10"
                        :transform="`rotate(-90, 10, ${heatmapData.padTop + heatmapData.rowCount * heatmapData.cellH / 2})`">信道</text>
                      <text :x="heatmapData.padLeft + heatmapData.colCount * heatmapData.cellW / 2"
                        :y="heatmapData.svgH - 3"
                        text-anchor="middle" fill="#6b7280" font-size="10">位置</text>
                    </svg>
                  </div>
                </div>
                <!-- 统计摘要 -->
                <div v-if="heatmapSummary" class="bg-white rounded-lg border p-4 space-y-3">
                  <div class="text-xs text-gray-500">末端 {{ heatmapSummary.metricLabel }} 统计</div>
                  <div class="grid grid-cols-5 gap-2 text-xs">
                    <div class="bg-gray-50 rounded-lg p-2 text-center">
                      <div class="text-[10px] text-gray-400">最小值</div>
                      <div class="font-mono font-medium text-red-600">{{ heatmapSummary.min }} dB</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2 text-center">
                      <div class="text-[10px] text-gray-400">最大值</div>
                      <div class="font-mono font-medium text-green-600">{{ heatmapSummary.max }} dB</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2 text-center">
                      <div class="text-[10px] text-gray-400">平均值</div>
                      <div class="font-mono font-medium text-blue-600">{{ heatmapSummary.avg }} dB</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2 text-center">
                      <div class="text-[10px] text-gray-400">最差信道</div>
                      <div class="font-mono font-medium text-orange-600">{{ heatmapSummary.worstChannel }}</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2 text-center">
                      <div class="text-[10px] text-gray-400">最佳信道</div>
                      <div class="font-mono font-medium text-green-600">{{ heatmapSummary.bestChannel }}</div>
                    </div>
                  </div>
                  <div v-if="heatmapSummary.target != null" class="text-xs space-y-1 border-t pt-2">
                    <div :class="heatmapSummary.rate >= 100 ? 'text-green-600' : heatmapSummary.rate >= 90 ? 'text-yellow-600' : 'text-red-600'">
                      达标信道: {{ heatmapSummary.compliantCount }}/{{ heatmapSummary.totalCount }} ({{ heatmapSummary.rate }}%)
                      {{ heatmapSummary.rate >= 100 ? '✅' : '' }}
                    </div>
                    <div v-if="heatmapSummary.nonCompliantTotal > 0" class="text-gray-400">
                      未达标信道: {{ heatmapSummary.nonCompliantChannels.join(', ') }}{{ heatmapSummary.nonCompliantTotal > 10 ? ` 等${heatmapSummary.nonCompliantTotal}个` : '' }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 数据表视图 -->
              <div v-else-if="activeTab === 'table'" class="space-y-4">
                <!-- 数据筛选 -->
                <div class="bg-white rounded-lg border p-3 space-y-2">
                  <div class="flex items-center gap-4 text-xs flex-wrap">
                    <span class="text-gray-500">位置:</span>
                    <select v-model="tablePositionFilter" class="px-2 py-1 text-xs border rounded bg-white">
                      <option value="all">全部位置</option>
                      <option value="rx">仅末端 (Rx)</option>
                    </select>
                    <span class="text-gray-500 ml-2">信道:</span>
                    <select v-model="tableChannelFilter" class="px-2 py-1 text-xs border rounded bg-white">
                      <option value="all">全部信道</option>
                      <option value="non_compliant">未达标信道</option>
                      <option value="worst">最差信道</option>
                      <option value="best">最佳信道</option>
                    </select>
                  </div>
                  <div class="flex items-center gap-4 text-xs">
                    <span class="text-gray-500">指标:</span>
                    <label v-for="mk in allMetricKeys" :key="'tm'+mk" class="flex items-center gap-1 cursor-pointer text-gray-700">
                      <input type="checkbox" :checked="tableMetricSet.has(mk)" @change="toggleTableMetric(mk)" class="accent-blue-500 rounded" />
                      {{ metricLabels[mk] }}
                    </label>
                  </div>
                  <div class="flex items-center gap-2 pt-1 border-t">
                    <button class="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100" @click="openExportDialog(false)">导出选中数据</button>
                    <button class="px-3 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100" @click="openExportDialog(true)">导出全部数据</button>
                  </div>
                </div>
                <!-- 数据表 -->
                <div class="border rounded-lg overflow-hidden">
                  <div class="overflow-auto max-h-[50vh]">
                    <table class="w-full text-xs">
                      <thead class="bg-gray-100 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap" @click="toggleTableSort('posIdx')">
                            位置 {{ tableSortKey === 'posIdx' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th class="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap" @click="toggleTableSort('channel')">
                            信道 {{ tableSortKey === 'channel' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th class="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">频率 (THz)</th>
                          <th v-if="tableMetricSet.has('gsnr')" class="px-3 py-2 text-right font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap" @click="toggleTableSort('gsnr')">
                            GSNR (dB) {{ tableSortKey === 'gsnr' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th v-if="tableMetricSet.has('osnr')" class="px-3 py-2 text-right font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap" @click="toggleTableSort('osnr')">
                            OSNR (dB) {{ tableSortKey === 'osnr' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th v-if="tableMetricSet.has('snr_ase')" class="px-3 py-2 text-right font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap" @click="toggleTableSort('snr_ase')">
                            SNR_ASE (dB) {{ tableSortKey === 'snr_ase' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th v-if="tableMetricSet.has('snr_nli')" class="px-3 py-2 text-right font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap" @click="toggleTableSort('snr_nli')">
                            SNR_NLI (dB) {{ tableSortKey === 'snr_nli' ? (tableSortDir === 'asc' ? '▲' : '▼') : '' }}
                          </th>
                          <th class="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">状态</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y">
                        <tr v-for="(row, idx) in pagedTableRows" :key="idx" class="hover:bg-gray-50">
                          <td class="px-3 py-1.5 text-gray-800">{{ row.position }}</td>
                          <td class="px-3 py-1.5 text-gray-600">{{ row.channel }}</td>
                          <td class="px-3 py-1.5 text-gray-600">{{ row.frequency.toFixed(3) }}</td>
                          <td v-if="tableMetricSet.has('gsnr')" class="px-3 py-1.5 text-right font-mono"
                            :class="row.status === 'fail' ? 'text-red-600' : row.status === 'warn' ? 'text-yellow-600' : 'text-gray-800'">
                            {{ row.gsnr.toFixed(2) }}
                          </td>
                          <td v-if="tableMetricSet.has('osnr')" class="px-3 py-1.5 text-right font-mono text-gray-800">{{ row.osnr.toFixed(2) }}</td>
                          <td v-if="tableMetricSet.has('snr_ase')" class="px-3 py-1.5 text-right font-mono text-gray-800">{{ row.snr_ase.toFixed(2) }}</td>
                          <td v-if="tableMetricSet.has('snr_nli')" class="px-3 py-1.5 text-right font-mono text-gray-800">{{ row.snr_nli.toFixed(2) }}</td>
                          <td class="px-3 py-1.5 text-center">{{ row.status === 'pass' ? '✅' : row.status === 'warn' ? '⚠️' : '❌' }}</td>
                        </tr>
                        <tr v-if="pagedTableRows.length === 0">
                          <td :colspan="3 + [...tableMetricSet].length + 1" class="px-3 py-6 text-center text-gray-400">无匹配数据</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <!-- 分页 -->
                  <div class="px-3 py-2 bg-gray-50 border-t flex items-center justify-between text-[10px] text-gray-500">
                    <span>显示 {{ tableRowCount > 0 ? (tablePage - 1) * tablePageSize + 1 : 0 }}-{{ Math.min(tablePage * tablePageSize, tableRowCount) }} / 共 {{ tableRowCount }} 条</span>
                    <div class="flex items-center gap-1">
                      <button class="px-2 py-0.5 rounded hover:bg-gray-200 disabled:opacity-40" :disabled="tablePage <= 1" @click="tablePage--">&lt;</button>
                      <span class="px-2">第 {{ tablePage }}/{{ tablePageCount }} 页</span>
                      <button class="px-2 py-0.5 rounded hover:bg-gray-200 disabled:opacity-40" :disabled="tablePage >= tablePageCount" @click="tablePage++">&gt;</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部：节点详情面板 -->
            <div v-if="cache" class="border-t flex-shrink-0">
              <button class="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-600 hover:bg-gray-50" @click="showNodeDetail = !showNodeDetail">
                <span class="font-medium">节点详情 (点击曲线上的节点查看)</span>
                <ChevronUp v-if="showNodeDetail" class="w-4 h-4" />
                <ChevronDown v-else class="w-4 h-4" />
              </button>
              <div v-if="showNodeDetail" class="px-4 pb-3">
                <div v-if="nodeDetail">
                  <div class="text-xs font-medium text-gray-800 mb-2">
                    选中节点: {{ nodeDetail.name }} @ {{ nodeDetail.distance.toFixed(1) }} km · {{ nodeDetail.channelId }}
                  </div>
                  <div class="grid grid-cols-3 gap-3 text-xs">
                    <!-- 信噪比指标 -->
                    <div class="bg-gray-50 rounded border p-2.5 space-y-1.5">
                      <div class="flex justify-between"><span class="text-gray-500">GSNR</span><span class="font-mono text-blue-600">{{ nodeDetail.gsnr }} dB</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">OSNR</span><span class="font-mono text-purple-600">{{ nodeDetail.osnr }} dB</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">累积NLI</span><span class="font-mono">{{ nodeDetail.cumNli }} dB</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">累积ASE</span><span class="font-mono">{{ nodeDetail.cumAse }} dB</span></div>
                    </div>
                    <!-- 噪声分量 -->
                    <div class="bg-gray-50 rounded border p-2.5 space-y-1.5">
                      <div class="flex justify-between"><span class="text-gray-500">SNR_ASE</span><span class="font-mono text-amber-600">{{ nodeDetail.snr_ase }} dB</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">SNR_NLI</span><span class="font-mono text-green-600">{{ nodeDetail.snr_nli }} dB</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">本段NLI</span><span class="font-mono">{{ nodeDetail.segNli }} dB</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">本段ASE</span><span class="font-mono">{{ nodeDetail.segAse }} dB</span></div>
                    </div>
                    <!-- 放大器状态 -->
                    <div class="bg-gray-50 rounded border p-2.5 space-y-1.5">
                      <div class="flex justify-between"><span class="text-gray-500">输入功率</span><span class="font-mono">-- dBm</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">输出功率</span><span class="font-mono">-- dBm</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">增益</span><span class="font-mono">-- dB</span></div>
                      <div class="flex justify-between"><span class="text-gray-500">NF</span><span class="font-mono">-- dB</span></div>
                    </div>
                  </div>
                </div>
                <div v-else class="text-xs text-gray-400 py-2">点击图表上的节点查看详细参数</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 导出配置对话框 -->
  <Teleport to="body">
    <div v-if="showExportDialog" class="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" @click.self="showExportDialog = false">
      <div class="bg-white rounded-lg shadow-xl w-[420px] overflow-hidden">
        <div class="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h4 class="font-semibold text-gray-800 text-sm">导出数据</h4>
          <button class="p-1 hover:bg-gray-200 rounded" @click="showExportDialog = false">
            <X class="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div class="p-5 space-y-4">
          <!-- 导出范围 -->
          <div class="text-xs text-gray-600">
            导出范围：<span class="font-medium text-gray-800">{{ exportAllData ? '当前筛选结果' : '当前页数据' }}</span>
            <span class="text-blue-600 ml-1">({{ exportRowCount }} 条记录)</span>
          </div>

          <!-- 导出格式 -->
          <div class="space-y-1.5">
            <div class="text-xs text-gray-500">导出格式：</div>
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="radio" v-model="exportFormat" value="csv" class="accent-blue-500" />
                CSV 文件 (.csv)
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="radio" v-model="exportFormat" value="xlsx" class="accent-blue-500" />
                Excel 文件 (.xlsx)
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="radio" v-model="exportFormat" value="json" class="accent-blue-500" />
                JSON 文件 (.json)
              </label>
            </div>
          </div>

          <!-- 包含内容 -->
          <div class="space-y-1.5">
            <div class="text-xs text-gray-500">包含内容：</div>
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="exportIncludeHeader" class="accent-blue-500 rounded" />
                表头行
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="exportIncludeUnit" class="accent-blue-500 rounded" />
                单位信息
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="exportIncludeSummary" class="accent-blue-500 rounded" />
                统计摘要
              </label>
            </div>
          </div>

          <!-- 文件名 -->
          <div class="space-y-1">
            <div class="text-xs text-gray-500">文件名：</div>
            <input v-model="exportFileName" type="text" class="w-full px-3 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-5 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button class="px-4 py-1.5 text-xs text-gray-600 rounded border hover:bg-gray-100" @click="showExportDialog = false">取消</button>
          <button class="px-4 py-1.5 text-xs text-white bg-blue-500 rounded hover:bg-blue-600" @click="doExport">导出</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 报告导出对话框 -->
  <Teleport to="body">
    <div v-if="showReportDialog" class="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" @click.self="showReportDialog = false">
      <div class="bg-white rounded-lg shadow-xl w-[520px] max-h-[85vh] overflow-hidden flex flex-col">
        <div class="px-5 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
          <h4 class="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <FileText class="w-4 h-4 text-blue-500" />
            导出仿真报告
          </h4>
          <button class="p-1 hover:bg-gray-200 rounded" @click="showReportDialog = false">
            <X class="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div class="p-5 space-y-5 overflow-y-auto flex-1">
          <!-- 报告信息 -->
          <div class="space-y-2">
            <div class="text-xs font-medium text-gray-700 border-b pb-1">报告信息</div>
            <div class="space-y-1.5">
              <div>
                <label class="text-[10px] text-gray-500 mb-0.5 block">报告标题</label>
                <input v-model="reportTitle" type="text" class="w-full px-3 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-[10px] text-gray-500 mb-0.5 block">编制人员</label>
                  <input v-model="reportAuthor" type="text" placeholder="可选" class="w-full px-3 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white" />
                </div>
                <div>
                  <label class="text-[10px] text-gray-500 mb-0.5 block">报告日期</label>
                  <input v-model="reportDate" type="date" class="w-full px-3 py-1.5 text-xs border rounded focus:ring-2 focus:ring-blue-500 bg-white" />
                </div>
              </div>
            </div>
          </div>

          <!-- 报告内容 -->
          <div class="space-y-2">
            <div class="text-xs font-medium text-gray-700 border-b pb-1">报告内容</div>
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="reportSections.linkInfo" class="accent-blue-500 rounded" />
                链路基本信息
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="reportSections.simConfig" class="accent-blue-500 rounded" />
                仿真配置参数
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="reportSections.evolution" class="accent-blue-500 rounded" />
                沿程演化图表
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="reportSections.spectrum" class="accent-blue-500 rounded" />
                频谱分布图表
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="reportSections.heatmap" class="accent-blue-500 rounded" />
                热力图
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="reportSections.statsSummary" class="accent-blue-500 rounded" />
                统计摘要表
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" v-model="reportSections.fullTable" class="accent-blue-500 rounded" />
                完整数据表
                <span class="text-[10px] text-gray-400">(可能导致文件较大)</span>
              </label>
            </div>
          </div>

          <!-- 图表选项 -->
          <div class="space-y-2">
            <div class="text-xs font-medium text-gray-700 border-b pb-1">图表选项</div>
            <div class="flex items-center gap-3 text-xs">
              <span class="text-gray-500 whitespace-nowrap">沿程演化信道:</span>
              <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="reportChartChannel" value="worst" class="accent-blue-500" /> 最差信道</label>
              <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="reportChartChannel" value="average" class="accent-blue-500" /> 平均值</label>
              <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="reportChartChannel" value="channel" class="accent-blue-500" /> 指定信道</label>
            </div>
            <div v-if="reportChartChannel === 'channel'" class="ml-4">
              <select v-model="reportChartChannelIdx" class="px-2 py-1 text-xs border rounded bg-white">
                <option v-for="opt in channelOptions" :key="'rc'+opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="flex items-center gap-3 text-xs">
              <span class="text-gray-500 whitespace-nowrap">频谱分布位置:</span>
              <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="reportSpectrumPos" value="rx" class="accent-blue-500" /> 末端 (Rx)</label>
              <label class="flex items-center gap-1 cursor-pointer"><input type="radio" v-model="reportSpectrumPos" value="custom" class="accent-blue-500" /> 指定位置</label>
            </div>
            <div v-if="reportSpectrumPos === 'custom'" class="ml-4">
              <select v-model="reportSpectrumPosIdx" class="px-2 py-1 text-xs border rounded bg-white">
                <option v-for="opt in positionOptions" :key="'rp'+opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
          </div>

          <!-- 导出格式 -->
          <div class="space-y-2">
            <div class="text-xs font-medium text-gray-700 border-b pb-1">导出格式</div>
            <div class="space-y-1">
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="radio" v-model="reportFormat" value="pdf" class="accent-blue-500" />
                PDF 文档 (.pdf)
                <span class="text-[10px] text-gray-400">— 通过浏览器打印</span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="radio" v-model="reportFormat" value="docx" class="accent-blue-500" />
                Word 文档 (.docx)
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="radio" v-model="reportFormat" value="html" class="accent-blue-500" />
                HTML 网页 (.html)
              </label>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-5 py-3 border-t bg-gray-50 flex items-center justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-1.5 text-xs text-gray-600 rounded border hover:bg-gray-100" @click="showReportDialog = false">取消</button>
          <button class="px-4 py-1.5 text-xs text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50"
            :disabled="isGeneratingReport" @click="doGenerateReport">
            <span v-if="isGeneratingReport">生成中...</span>
            <span v-else>生成报告</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
