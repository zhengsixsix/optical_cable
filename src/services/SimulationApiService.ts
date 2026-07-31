/** 平台系统规划与物理仿真 API 客户端。 */
import type { SpanScanResult, SpanScanPoint } from '@/types/simulation'
import type { SimulationCache, SimulationMetricsMatrix } from '@/types/useFile'
import { platformPlanConfigApi, platformProjectApi } from '@/services/platform/api'
import { parsePlanningLayoutResult } from '@/utils/systemPlanningLayout'
import type {
  Id,
  PlanCalculationResult,
  PlanConfigChannel,
  PlanDeviceEntity,
  PlanLayoutCalculationResponse,
  PlanSimulationMode,
} from '@/services/platform/types'

// 导出类型供外部使用
export type { SpanScanResult }

// ========== 请求类型 ==========

/** 仿真计算请求 */
export interface SimulationRequest {
  projectId: Id
  /** 物理仿真直接读取此前生成的 fixed / optimized 布局。 */
  mode: PlanSimulationMode
  linkId: string
  linkName: string
  fiberModel?: string
  amplifierModel?: string
  channelFrequenciesThz?: number[]
  channelCenterFrequencyThz?: number
  channelSpacingGhz?: number
  onProgress?: (progress: SimulationProgressUpdate) => void
}

type SimulationProgressStage =
  | 'simulation-start'
  | 'simulation-poll'
  | 'complete'

interface SimulationProgressUpdate {
  stage: SimulationProgressStage
  progress: number
  message: string
}

// ========== 响应类型 ==========

/** Span 扫描点（与 types/simulation.ts 中的 SpanScanPoint 兼容） */
export type ScanPoint = SpanScanPoint

/** 仿真计算响应 */
export interface SimulationResponse {
  success: boolean
  error?: string
  spanScanResult?: Omit<SpanScanResult, 'linkId' | 'scannedAt' | 'model' | 'gsnrPerSpanDb' | 'osnrPerSpanDb'> & {
    channelFrequencies?: number[]
  }
  detailedResult: PlanCalculationResult
  simulationCache?: SimulationCache
}

export interface LayoutPlanningResponse {
  mode: PlanSimulationMode
  layoutResult: PlanCalculationResult
  deviceEntityList: PlanDeviceEntity[]
  effectiveSpanKm?: number
  spanScanResult?: SimulationResponse['spanScanResult']
}

interface LayoutPlanningRequest {
  projectId: Id
  clearAll: boolean
  onProgress?: (attempt: number) => void
}

interface OptimizedPlanningRequest extends LayoutPlanningRequest {
  fmmPathResultIndex: number
}

// ========== API 调用 ==========

export function isPlatformChannelConfigComplete(
  config: Omit<PlanConfigChannel, 'projectId'> | null | undefined,
  expectedCount?: number,
): boolean {
  const channelCount = Math.max(0, Math.trunc(Number(config?.channelCount) || 0))
  const requiredCount = expectedCount == null
    ? channelCount
    : Math.max(1, Math.trunc(Number(expectedCount) || 0))
  return channelCount > 0
    && channelCount === requiredCount
    && Array.isArray(config?.launchPowerDbm)
    && config.launchPowerDbm.length === requiredCount
}

export async function saveAndVerifyPlanningChannelConfig(
  projectId: Id,
  channelConfig: Omit<PlanConfigChannel, 'projectId'>,
): Promise<void> {
  const channelSaved = await platformPlanConfigApi.saveChannelConfig({
    projectId,
    ...channelConfig,
  })
  if (channelSaved === false) throw new Error('WDM 信道配置保存失败')

  const expectedChannelCount = Math.max(1, Math.trunc(Number(channelConfig.channelCount) || 0))
  let savedChannelConfig: Omit<PlanConfigChannel, 'projectId'> | null = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    savedChannelConfig = await platformPlanConfigApi.searchChannelConfig(projectId)
    if (isPlatformChannelConfigComplete(savedChannelConfig, expectedChannelCount)) return
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 150))
  }

  const powerState = Array.isArray(savedChannelConfig?.launchPowerDbm)
    ? `长度 ${savedChannelConfig.launchPowerDbm.length}`
    : 'null'
  throw new Error(
    `后端未完整保存 WDM 入纤功率向量：launchPowerDbm=${powerState}。`
    + '信道频率由后端依据中心频率与间隔生成；请检查后端 plan_config.value 字段容量及数组序列化逻辑',
  )
}

export async function runFixedPlanning(request: LayoutPlanningRequest): Promise<LayoutPlanningResponse> {
  const started = await platformProjectApi.fixedPlan(request.projectId, request.clearAll)
  const rawLayoutResult = await pollPlanningResult(
    () => platformProjectApi.queryFixed(request.projectId),
    started,
    request.onProgress,
  )
  return buildLayoutPlanningResponse(rawLayoutResult, 'fixed')
}

export async function runOptimizedPlanning(request: OptimizedPlanningRequest): Promise<LayoutPlanningResponse> {
  const started = await platformProjectApi.optimizedPlan(
    request.projectId,
    request.fmmPathResultIndex,
    request.clearAll,
  )
  const rawLayoutResult = await pollPlanningResult(
    () => platformProjectApi.queryOptimized(request.projectId),
    started,
    request.onProgress,
  )
  return buildLayoutPlanningResponse(rawLayoutResult, 'optimized')
}

function buildLayoutPlanningResponse(
  value: PlanCalculationResult,
  mode: PlanSimulationMode,
): LayoutPlanningResponse {
  const normalized = normalizeLayoutCalculationResponse(value)
  return {
    mode,
    layoutResult: normalized.layoutResult,
    deviceEntityList: normalized.deviceEntityList,
    effectiveSpanKm: parsePlanningLayoutResult(normalized.layoutResult, mode)?.spanKmUsed ?? undefined,
    spanScanResult: extractSpanScanResult(normalized.layoutResult),
  }
}

/**
 * 调用后端仿真计算接口
 */
export async function runSimulation(request: SimulationRequest): Promise<SimulationResponse> {
  request.onProgress?.({
    stage: 'simulation-start',
    progress: 10,
    message: '正在启动物理仿真',
  })
  const simulationStarted = await platformProjectApi.simulationPlan(
    request.projectId,
    request.mode,
  )
  // 物理仿真查询接口在部分平台版本中只返回 data: null，不能按布局结果
  // 的方式持续轮询，否则布局明明已经成功也会被拖到 30 秒超时。
  // 优先使用启动接口的直接结果；没有结果时只做一次查询，性能结果缺失
  // 仍然允许调用方展示真实的布局、设备和 Span 信息。
  let rawDetailedResult = simulationStarted
  if (!hasPlanningResult(rawDetailedResult)) {
    request.onProgress?.({
      stage: 'simulation-poll',
      progress: 75,
      message: '正在读取物理仿真结果',
    })
    rawDetailedResult = await platformProjectApi.querySimulation(request.projectId)
  }
  const detailedResult = hasPlanningResult(rawDetailedResult)
    ? unwrapSimulationResult(rawDetailedResult)
    : null
  const simulationCache = normalizePlatformSimulationCache(detailedResult, request)

  request.onProgress?.({
    stage: 'complete',
    progress: 100,
    message: '物理仿真完成',
  })

  return {
    success: true,
    detailedResult,
    spanScanResult: extractSpanScanResult(detailedResult),
    simulationCache: simulationCache ?? undefined,
  }
}

const RESULT_POLL_INTERVAL_MS = 1000
const RESULT_POLL_ATTEMPTS = 30

function findLayoutCalculationEnvelope(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonValue(value)
  if (!isRecord(parsed)) return null
  if ('layoutResult' in parsed) return parsed
  for (const key of ['data', 'result', 'payload']) {
    if (key in parsed) {
      const envelope = findLayoutCalculationEnvelope(parsed[key])
      if (envelope) return envelope
    }
  }
  return null
}

function normalizeLayoutCalculationResponse(value: unknown): PlanLayoutCalculationResponse {
  const parsed = parseJsonValue(value)
  const envelope = findLayoutCalculationEnvelope(parsed)
  if (!envelope) return { layoutResult: parsed, deviceEntityList: [] }

  const entities = parseJsonValue(envelope.deviceEntityList)
  return {
    layoutResult: parseJsonValue(envelope.layoutResult),
    deviceEntityList: Array.isArray(entities)
      ? entities.filter((entity): entity is PlanDeviceEntity => isRecord(entity))
      : [],
  }
}

function hasPlanningResult(value: unknown): boolean {
  const parsed = parseJsonValue(value)
  if (parsed == null || typeof parsed === 'boolean' || typeof parsed === 'number') return false
  if (typeof parsed === 'string') {
    const text = parsed.trim().toLowerCase()
    return text !== ''
      && text !== 'null'
      && text !== 'undefined'
      && !['pending', 'processing', 'running', 'accepted', 'queued', 'success'].includes(text)
  }
  if (Array.isArray(parsed)) return parsed.length > 0
  if (!isRecord(parsed)) return false

  const status = String(parsed.status ?? parsed.state ?? '').trim().toLowerCase()
  if (parsed.success === false) return true
  if (['pending', 'processing', 'running', 'accepted', 'queued'].includes(status)) return false
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return true

  for (const key of ['data', 'result', 'payload', 'layoutResult', 'fixed_result', 'optimized_result', 'simulation_result']) {
    if (key in parsed && hasPlanningResult(parsed[key])) return true
  }

  const metadataKeys = new Set([
    'status', 'state', 'message', 'msg', 'code', 'success',
    'jobId', 'job_id', 'taskId', 'task_id', 'data', 'result', 'payload',
    'layoutResult', 'deviceEntityList',
  ])
  return Object.keys(parsed).some(key => !metadataKeys.has(key))
}

async function pollPlanningResult(
  query: () => Promise<PlanCalculationResult>,
  fallback: PlanCalculationResult,
  onPoll?: (attempt: number) => void,
): Promise<PlanCalculationResult> {
  if (hasPlanningResult(fallback)) {
    throwIfPlanningFailed(fallback)
    return fallback
  }

  for (let attempt = 0; attempt < RESULT_POLL_ATTEMPTS; attempt += 1) {
    onPoll?.(attempt + 1)
    const result = await query()
    if (hasPlanningResult(result)) {
      throwIfPlanningFailed(result)
      return result
    }
    if (attempt < RESULT_POLL_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, RESULT_POLL_INTERVAL_MS))
    }
  }
  throw new Error('系统规划结果查询超时，请稍后重试')
}

function throwIfPlanningFailed(value: unknown): void {
  const parsed = parseJsonValue(value)
  if (!isRecord(parsed)) return
  const status = String(parsed.status ?? parsed.state ?? '').trim().toLowerCase()
  if (parsed.success === false || ['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    const message = parsed.message ?? parsed.msg ?? parsed.error ?? '平台计算失败'
    throw new Error(String(message))
  }
  for (const key of ['data', 'result', 'payload', 'layoutResult']) {
    if (key in parsed) throwIfPlanningFailed(parsed[key])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function unwrapSimulationResult(value: unknown): unknown {
  let current = parseJsonValue(value)
  const seen = new Set<unknown>()
  const domainKeys = [
    'metrics', 'performance_matrices', 'performanceMatrices', 'positions', 'channels',
    'spanScanResult', 'span_scan_result', 'signal_power_dbm', 'signalPowerDbm',
    'power_matrices', 'powerMatrices', 'node_metadata', 'nodeMetadata',
  ]

  for (let depth = 0; depth < 8 && isRecord(current) && !seen.has(current); depth += 1) {
    const record = current
    seen.add(record)
    if (domainKeys.some(key => key in record)) return record

    let next: unknown = undefined
    for (const key of [
      'simulation_result.json', 'simulationResult', 'simulation_result',
      'result', 'payload', 'data',
    ]) {
      if (!(key in record)) continue
      const candidate = parseJsonValue(record[key])
      if (candidate != null && candidate !== record) {
        next = candidate
        break
      }
    }
    if (next == null) return record
    current = next
  }
  return current
}

function extractSpanScanResult(value: unknown): SimulationResponse['spanScanResult'] {
  const parsed = unwrapSimulationResult(value)
  if (!isRecord(parsed)) return undefined

  const candidates = [
    parsed.spanScanResult,
    parsed.span_scan_result,
    parsed['simulation_result.json'],
    parsed,
  ].map(parseJsonValue)

  for (const rawCandidate of candidates) {
    const candidate = parseJsonValue(rawCandidate)
    if (!isRecord(candidate)) continue
    const spanLengthsKm = numberArray(candidate.spanLengthsKm ?? candidate.span_lengths_km)
    const scanPointsValue = parseJsonValue(candidate.scanPoints ?? candidate.scan_points)
    const targetGsnrDb = finiteNumber(candidate.targetGsnrDb ?? candidate.target_gsnr_db)
    const recommendedSpanKm = finiteNumber(candidate.recommendedSpanKm ?? candidate.recommended_span_km)
    if (spanLengthsKm.length === 0 || !Array.isArray(scanPointsValue)
      || targetGsnrDb == null || recommendedSpanKm == null) continue

    const scanPoints = scanPointsValue
      .map(rawPoint => {
        const point = recordValue(rawPoint)
        if (!point) return null
        const spanLengthKm = finiteNumber(point.spanLengthKm ?? point.span_length_km)
        const avgGsnrDb = finiteNumber(point.avgGsnrDb ?? point.avg_gsnr_db)
        const minGsnrDb = finiteNumber(point.minGsnrDb ?? point.min_gsnr_db)
        const avgOsnrDb = finiteNumber(point.avgOsnrDb ?? point.avg_osnr_db)
        const meetTarget = booleanValue(point.meetTarget ?? point.meet_target)
        const gsnrMarginDb = finiteNumber(point.gsnrMarginDb ?? point.gsnr_margin_db)
        const gsnrPerChannelDb = numberArray(point.gsnrPerChannelDb ?? point.gsnr_per_channel_db)
        const osnrPerChannelDb = numberArray(point.osnrPerChannelDb ?? point.osnr_per_channel_db)
        if (spanLengthKm == null || avgGsnrDb == null || minGsnrDb == null
          || avgOsnrDb == null || meetTarget == null || gsnrMarginDb == null
          || gsnrPerChannelDb.length === 0 || osnrPerChannelDb.length === 0
          || gsnrPerChannelDb.length !== osnrPerChannelDb.length) return null
        const numAmplifiers = finiteNumber(point.numAmplifiers ?? point.num_amplifiers)
        return {
          spanLengthKm,
          gsnrPerChannelDb,
          osnrPerChannelDb,
          avgGsnrDb,
          minGsnrDb,
          avgOsnrDb,
          meetTarget,
          gsnrMarginDb,
          ...(numAmplifiers == null ? {} : { numAmplifiers }),
        }
      })
      .filter((point): point is SpanScanPoint => point != null)

    const channelCount = scanPoints[0]?.gsnrPerChannelDb.length ?? 0
    if (scanPoints.length !== scanPointsValue.length || scanPoints.length !== spanLengthsKm.length
      || scanPoints.some((point, index) => point.spanLengthKm !== spanLengthsKm[index]
        || point.gsnrPerChannelDb.length !== channelCount
        || point.osnrPerChannelDb.length !== channelCount)) continue
    const feasibleRangeValue = numberArray(candidate.feasibleRange ?? candidate.feasible_range ?? candidate.feasible_range_km)

    return {
      spanLengthsKm,
      scanPoints,
      recommendedSpanKm,
      targetGsnrDb,
      feasibleRange: feasibleRangeValue.length >= 2
        ? [feasibleRangeValue[0], feasibleRangeValue[1]]
        : null,
      channelFrequencies: numberArray(candidate.channelFrequencies ?? candidate.channel_frequencies_thz),
    } as SimulationResponse['spanScanResult']
  }
  return undefined
}

function finiteNumber(value: unknown): number | null {
  if (value == null || typeof value === 'boolean') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const numberValue = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(numberValue) ? numberValue : null
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

function numberArray(value: unknown): number[] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  const values = parsed.map(finiteNumber)
  return values.some(item => item == null) ? [] : values as number[]
}

function numberMatrix(value: unknown): number[][] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed) || parsed.length === 0) return []
  const matrix: number[][] = []
  for (const rawRow of parsed) {
    if (!Array.isArray(rawRow) || rawRow.length === 0) return []
    const row = rawRow.map(finiteNumber)
    if (row.some(item => item == null)) return []
    matrix.push(row as number[])
  }
  return matrix
}

function readFirst(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key]
  }
  return undefined
}

function recordValue(value: unknown): Record<string, unknown> | null {
  const parsed = parseJsonValue(value)
  return isRecord(parsed) ? parsed : null
}

function hasMatrixShape(
  matrix: number[][],
  rowCount: number,
  columnCount: number,
): boolean {
  return matrix.length === rowCount
    && matrix.every(row => row.length === columnCount)
}

function buildMetrics(root: Record<string, unknown>): SimulationMetricsMatrix | null {
  const metrics = recordValue(readFirst(root, ['metrics', 'performance_matrices', 'performanceMatrices'])) ?? root
  let gsnr = numberMatrix(readFirst(metrics, [
    'gsnr_matrix_db', 'gsnrMatrixDb', 'gsnr_db',
    'gsnr_per_channel_per_node_db', 'gsnrPerChannelPerNodeDb',
  ]))
  let osnr = numberMatrix(readFirst(metrics, [
    'osnr_matrix_db', 'osnrMatrixDb', 'osnr_db',
    'osnr_per_channel_per_node_db', 'osnrPerChannelPerNodeDb',
  ]))
  let snrAse = numberMatrix(readFirst(metrics, ['snr_ase_matrix_db', 'snrAseMatrixDb', 'snr_ase_db']))
  let snrNli = numberMatrix(readFirst(metrics, ['snr_nli_matrix_db', 'snrNliMatrixDb', 'snr_nli_db']))
  const powers = recordValue(readFirst(root, ['power_matrices', 'powerMatrices', 'powers'])) ?? metrics
  const signalPower = numberMatrix(readFirst(powers, [
    'signal_power_dbm', 'signalPowerDbm', 'signal_matrix_dbm', 'signalMatrixDbm', 'signal_power_matrix_dbm',
  ]))
  const asePower = numberMatrix(readFirst(powers, [
    'ase_noise_power_dbm', 'aseNoisePowerDbm', 'ase_matrix_dbm', 'aseMatrixDbm', 'ase_noise_power_matrix_dbm',
  ]))
  const nliPower = numberMatrix(readFirst(powers, [
    'nli_noise_power_dbm', 'nliNoisePowerDbm', 'nli_matrix_dbm', 'nliMatrixDbm', 'nli_noise_power_matrix_dbm',
  ]))

  const powerRowCount = signalPower.length
  const powerColumnCount = signalPower[0]?.length ?? 0
  const hasCompletePowerMatrices = powerRowCount > 0
    && powerColumnCount > 0
    && hasMatrixShape(signalPower, powerRowCount, powerColumnCount)
    && hasMatrixShape(asePower, powerRowCount, powerColumnCount)
    && hasMatrixShape(nliPower, powerRowCount, powerColumnCount)
  if (hasCompletePowerMatrices) {
    if (osnr.length === 0) {
      osnr = signalPower.map((row, rowIndex) =>
        row.map((signal, channelIndex) => signal - asePower[rowIndex][channelIndex]))
    }
    if (gsnr.length === 0) {
      gsnr = signalPower.map((row, rowIndex) => row.map((signal, channelIndex) => {
        const aseLinear = 10 ** (asePower[rowIndex][channelIndex] / 10)
        const nliLinear = 10 ** (nliPower[rowIndex][channelIndex] / 10)
        return signal - 10 * Math.log10(aseLinear + nliLinear)
      }))
    }
    if (snrAse.length === 0) snrAse = osnr.map(row => [...row])
    if (snrNli.length === 0) {
      snrNli = signalPower.map((row, rowIndex) =>
        row.map((signal, channelIndex) => signal - nliPower[rowIndex][channelIndex]))
    }
  }

  const rowCount = gsnr.length
  const columnCount = gsnr[0]?.length ?? 0
  if (rowCount === 0 || columnCount === 0
    || !hasMatrixShape(osnr, rowCount, columnCount)
    || !hasMatrixShape(snrAse, rowCount, columnCount)
    || !hasMatrixShape(snrNli, rowCount, columnCount)) return null

  return {
    gsnr_matrix_db: gsnr,
    osnr_matrix_db: osnr,
    snr_ase_matrix_db: snrAse,
    snr_nli_matrix_db: snrNli,
    ...(hasMatrixShape(signalPower, rowCount, columnCount)
      ? { signal_power_matrix_dbm: signalPower }
      : {}),
    ...(hasMatrixShape(asePower, rowCount, columnCount)
      ? { ase_noise_power_matrix_dbm: asePower }
      : {}),
    ...(hasMatrixShape(nliPower, rowCount, columnCount)
      ? { nli_noise_power_matrix_dbm: nliPower }
      : {}),
  }
}

function buildPositions(
  root: Record<string, unknown>,
  rowCount: number,
): SimulationCache['positions'] | null {
  const positions = recordValue(readFirst(root, ['positions']))
  const metadataValue = parseJsonValue(readFirst(root, ['node_metadata', 'nodeMetadata', 'nodes']))
  const metadata = Array.isArray(metadataValue) ? metadataValue : []

  const names = positions
    ? stringArray(readFirst(positions, ['names', 'node_names', 'node_ids', 'nodeIds']))
    : []
  const distances = positions ? numberArray(readFirst(positions, ['distances_km', 'distancesKm'])) : []
  let spanIds = positions ? stringArray(readFirst(positions, ['span_ids', 'spanIds'])) : []

  for (const [index, rawNode] of metadata.entries()) {
    const node = recordValue(rawNode)
    if (!node) continue
    const name = readFirst(node, ['node_id', 'nodeId', 'event_id', 'eventId', 'node_name', 'nodeName', 'name'])
    const distance = finiteNumber(readFirst(node, ['position_km', 'positionKm', 'kp_km', 'kpKm', 'kp']))
    if (name != null && String(name).trim()) names[index] = String(name)
    if (distance != null) distances[index] = distance
  }

  if (spanIds.length === 0 && names.length === rowCount) {
    spanIds = Array.from({ length: Math.max(0, rowCount - 1) }, (_, index) =>
      `${names[index]} -> ${names[index + 1]}`)
  }

  if (names.length !== rowCount
    || distances.length !== rowCount
    || spanIds.length !== Math.max(0, rowCount - 1)
    || names.some(name => !name.trim())
    || spanIds.some(spanId => !spanId.trim())) return null

  return {
    count: rowCount,
    names,
    distances_km: distances,
    span_ids: spanIds,
  }
}

function stringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed.map(item => String(item ?? ''))
}

function buildChannels(
  root: Record<string, unknown>,
  columnCount: number,
  request?: SimulationRequest,
): SimulationCache['channels'] | null {
  const channels = recordValue(readFirst(root, ['channels']))
  let ids = channels
    ? stringArray(readFirst(channels, ['ids', 'channel_ids', 'channelIds']))
    : stringArray(readFirst(root, ['channel_ids', 'channelIds']))
  let frequencies = channels
    ? numberArray(readFirst(channels, ['frequencies_thz', 'frequenciesThz']))
    : numberArray(readFirst(root, ['channel_frequencies_thz', 'channelFrequenciesThz', 'channelFrequencies']))
  if (ids.length === 0) {
    ids = Array.from({ length: columnCount }, (_, index) => `CH-${String(index + 1).padStart(3, '0')}`)
  }
  if (frequencies.length === 0
    && Array.isArray(request?.channelFrequenciesThz)
    && request.channelFrequenciesThz.length === columnCount
    && request.channelFrequenciesThz.every(Number.isFinite)) {
    frequencies = [...request.channelFrequenciesThz]
  }
  if (frequencies.length === 0) {
    const center = finiteNumber(request?.channelCenterFrequencyThz)
    const spacingGhz = finiteNumber(request?.channelSpacingGhz)
    if (center != null && spacingGhz != null && spacingGhz > 0) {
      const start = center - ((columnCount - 1) / 2) * (spacingGhz / 1000)
      frequencies = Array.from({ length: columnCount }, (_, index) =>
        start + index * (spacingGhz / 1000))
    }
  }
  if (ids.length !== columnCount
    || frequencies.length !== columnCount
    || ids.some(id => !id.trim())) return null

  return {
    count: columnCount,
    ids,
    frequencies_thz: frequencies,
  }
}

function buildSimulationSummary(root: Record<string, unknown>): SimulationCache['summary'] {
  const source = recordValue(readFirst(root, ['summary', 'end_statistics', 'endStatistics'])) ?? {}
  const gsnrSource = recordValue(readFirst(source, ['final_gsnr', 'finalGsnr'])) ?? {}
  const osnrSource = recordValue(readFirst(source, ['final_osnr', 'finalOsnr'])) ?? {}
  const result: SimulationCache['summary'] = {}

  const totalLengthKm = finiteNumber(readFirst(source, ['total_length_km', 'totalLengthKm']))
  if (totalLengthKm != null) result.total_length_km = totalLengthKm

  const totalSpanCount = finiteNumber(readFirst(source, ['total_span_count', 'totalSpanCount']))
  if (totalSpanCount != null) result.total_span_count = totalSpanCount

  const finalGsnr: NonNullable<SimulationCache['summary']['final_gsnr']> = {}
  const gsnrAvg = finiteNumber(readFirst(gsnrSource, ['avg_db', 'avgDb'])
    ?? readFirst(source, ['final_gsnr_avg_db', 'finalGsnrAvgDb', 'gsnr_avg_db', 'gsnrAvgDb']))
  const gsnrMin = finiteNumber(readFirst(gsnrSource, ['min_db', 'minDb'])
    ?? readFirst(source, ['final_gsnr_min_db', 'finalGsnrMinDb', 'gsnr_min_db', 'gsnrMinDb']))
  const gsnrMax = finiteNumber(readFirst(gsnrSource, ['max_db', 'maxDb'])
    ?? readFirst(source, ['gsnr_max_db', 'gsnrMaxDb']))
  const worstChannel = readFirst(gsnrSource, ['worst_channel', 'worstChannel'])
  const bestChannel = readFirst(gsnrSource, ['best_channel', 'bestChannel'])
  if (gsnrAvg != null) finalGsnr.avg_db = gsnrAvg
  if (gsnrMin != null) finalGsnr.min_db = gsnrMin
  if (gsnrMax != null) finalGsnr.max_db = gsnrMax
  if (typeof worstChannel === 'string' && worstChannel.trim()) finalGsnr.worst_channel = worstChannel
  if (typeof bestChannel === 'string' && bestChannel.trim()) finalGsnr.best_channel = bestChannel
  if (Object.keys(finalGsnr).length > 0) result.final_gsnr = finalGsnr

  const finalOsnr: NonNullable<SimulationCache['summary']['final_osnr']> = {}
  const osnrAvg = finiteNumber(readFirst(osnrSource, ['avg_db', 'avgDb'])
    ?? readFirst(source, ['final_osnr_avg_db', 'finalOsnrAvgDb', 'osnr_avg_db', 'osnrAvgDb']))
  const osnrMin = finiteNumber(readFirst(osnrSource, ['min_db', 'minDb'])
    ?? readFirst(source, ['osnr_min_db', 'osnrMinDb']))
  if (osnrAvg != null) finalOsnr.avg_db = osnrAvg
  if (osnrMin != null) finalOsnr.min_db = osnrMin
  if (Object.keys(finalOsnr).length > 0) result.final_osnr = finalOsnr

  const systemCapacityTbps = finiteNumber(readFirst(source, ['system_capacity_tbps', 'systemCapacityTbps']))
  if (systemCapacityTbps != null) result.system_capacity_tbps = systemCapacityTbps
  if (gsnrAvg != null) result.final_gsnr_avg_db = gsnrAvg
  if (gsnrMin != null) result.final_gsnr_min_db = gsnrMin
  if (osnrAvg != null) result.final_osnr_avg_db = osnrAvg

  return result
}

/** Convert the platform's intentionally loose Object response into the cache used by Step 7. */
export function normalizePlatformSimulationCache(
  value: unknown,
  request?: SimulationRequest,
): SimulationCache | null {
  const parsed = unwrapSimulationResult(value)
  if (!isRecord(parsed)) return null

  const metrics = buildMetrics(parsed)
  if (!metrics) return null
  const rowCount = metrics.gsnr_matrix_db.length
  const columnCount = metrics.gsnr_matrix_db[0]?.length ?? 0
  if (rowCount === 0 || columnCount === 0) return null

  const positions = buildPositions(parsed, rowCount)
  const channels = buildChannels(parsed, columnCount, request)
  if (!positions || !channels) return null
  const routeParts = request?.linkName.split(/\s*[⇄↔]\s*/) ?? []
  const routeRef = recordValue(readFirst(parsed, ['route_ref', 'routeRef']))
  const modelSelection = recordValue(readFirst(parsed, ['model_selection', 'modelSelection']))

  return {
    is_valid: true,
    timestamp: String(readFirst(parsed, ['timestamp', 'calculated_at', 'calculatedAt']) ?? new Date().toISOString()),
    route_ref: {
      from_station: String(readFirst(routeRef ?? {}, ['from_station', 'fromStation']) ?? routeParts[0] ?? 'Tx'),
      to_station: String(readFirst(routeRef ?? {}, ['to_station', 'toStation']) ?? routeParts[1] ?? 'Rx'),
      route_hash: String(readFirst(routeRef ?? {}, ['route_hash', 'routeHash']) ?? request?.linkId ?? ''),
    },
    model_selection: {
      fiber_model_id: String(readFirst(modelSelection ?? {}, ['fiber_model_id', 'fiberModelId']) ?? request?.fiberModel ?? ''),
      edfa_model_id: String(readFirst(modelSelection ?? {}, ['edfa_model_id', 'edfaModelId']) ?? request?.amplifierModel ?? ''),
      bu_model_id: readFirst(modelSelection ?? {}, ['bu_model_id', 'buModelId']) == null
        ? null
        : String(readFirst(modelSelection ?? {}, ['bu_model_id', 'buModelId'])),
    },
    positions,
    channels,
    metrics,
    summary: buildSimulationSummary(parsed),
  }
}
