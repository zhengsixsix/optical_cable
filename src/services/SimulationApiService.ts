/** 平台系统规划与物理仿真 API 客户端。 */
import type { SpanScanResult, SpanScanPoint } from '@/types/simulation'
import type { SimulationCache, SimulationMetricsMatrix } from '@/types/useFile'
import { platformPlanConfigApi, platformProjectApi } from '@/services/platform/api'
import { parsePlanningLayoutResult } from '@/utils/systemPlanningLayout'
import {
  isSpanWithinBounds,
  resolvePlanningSpanBounds,
  selectConstrainedSpanKm,
  type PlanningOptimizationTarget,
} from '@/utils/systemPlanningConstraints'
import type {
  Id,
  PlanCalculationResult,
  PlanConfigChannel,
  PlanConfigOptimization,
} from '@/services/platform/types'

// 导出类型供外部使用
export type { SpanScanResult }

// ========== 请求类型 ==========

/** Span 策略 */
export interface SpanStrategyPayload {
  mode: 'fixed' | 'scan'
  scanRange?: {
    min: number
    max: number
    step: number
  }
}

/** 仿真计算请求 */
export interface SimulationRequest {
  /** 平台规划项目 ID。Swagger 的仿真接口按项目关联数据。 */
  projectId: Id
  /** FMM_path_result.json 中的原始路线序号。 */
  fmmPathResultIndex: number
  linkId: string
  linkName: string
  totalLengthKm: number
  fiberModel: 'GN' | 'EGN' | 'SSFM' | 'RAMAN' | 'HYBRID'
  amplifierModel: 'EDFA_Simple' | 'EDFA_Full' | 'EDFA_Raman'
  fiberParams: {
    attenuation: number
    effectiveArea: number
    dispersion: number
    dispersionSlope: number
    nonlinearIndex: number
    nonlinearCoeff: number
    fiberName?: string
    /** SSFM 模型专用参数 */
    ssfmParams?: {
      stepSize: number
      samplePoints: number
      maxIterations: number
    }
  }
  amplifierParams: {
    gain: number
    noiseFigure: number
    maxOutputPower: number
    saturationPower: number
    unitPrice?: number
    equalizerUnitPrice?: number
    amplifierName?: string
  }
  channelConfig: Omit<PlanConfigChannel, 'projectId'>
  optimizationConfig: Omit<PlanConfigOptimization, 'projectId'>
  spanKm: number
  spanStrategy: SpanStrategyPayload
  optimizationTarget: PlanningOptimizationTarget
  constraints: {
    maxSpanLength: number
    minSpanLength: number
    osnrMargin: number
  }
  buConfigs: Array<{
    id: string
    name: string
    kp: number
    portCount: number
    trunkLoss: number
    branchLoss: number
  }>
  deviceSequence: Array<{
    id: string
    name: string
    type: string
    kp: number
    equalizerRole?: 'T' | 'S'
    attenuationMode?: 'adjustable' | 'fixed'
    attenuationDb?: number
  }>
  onProgress?: (progress: SimulationProgressUpdate) => void
}

export type SimulationProgressStage =
  | 'layout-start'
  | 'layout-poll'
  | 'simulation-start'
  | 'simulation-poll'
  | 'complete'

export interface SimulationProgressUpdate {
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
  layoutResult: PlanCalculationResult
  fixedLayoutResult?: PlanCalculationResult
  optimizedLayoutResult?: PlanCalculationResult
  effectiveSpanKm?: number
  constraintAdjusted?: boolean
  simulationCache?: SimulationCache
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
    && Array.isArray(config?.channelFrequenciesThz)
    && config.channelFrequenciesThz.length === requiredCount
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
  const frequencyState = Array.isArray(savedChannelConfig?.channelFrequenciesThz)
    ? `长度 ${savedChannelConfig.channelFrequenciesThz.length}`
    : 'null'
  throw new Error(
    `后端未完整保存 WDM 信道向量：launchPowerDbm=${powerState}，`
    + `channelFrequenciesThz=${frequencyState}。请检查后端 plan_config.value 字段容量及数组序列化逻辑`,
  )
}

async function syncPlanningPrerequisites(request: SimulationRequest): Promise<void> {
  await saveAndVerifyPlanningChannelConfig(request.projectId, request.channelConfig)

  const optimizationSaved = await platformPlanConfigApi.saveOptimization({
    projectId: request.projectId,
    ...request.optimizationConfig,
  })
  if (optimizationSaved === false) throw new Error('优化目标保存失败')

  const spanSaved = await platformPlanConfigApi.saveSpanKm({
    projectId: request.projectId,
    spanKm: request.spanKm,
  })
  if (spanSaved === false) throw new Error('跨段参数保存失败')
}

/**
 * 调用后端仿真计算接口
 */
export async function runSimulation(request: SimulationRequest): Promise<SimulationResponse> {
  request.onProgress?.({
    stage: 'layout-start',
    progress: 5,
    message: '正在同步 WDM 与布局配置',
  })
  await syncPlanningPrerequisites(request)

  request.onProgress?.({
    stage: 'layout-start',
    progress: 10,
    message: request.spanStrategy.mode === 'fixed' ? '正在生成固定跨距布局' : '正在生成优化布局',
  })

  let layoutResult: PlanCalculationResult
  let fixedLayoutResult: PlanCalculationResult | undefined
  let optimizedLayoutResult: PlanCalculationResult | undefined
  let effectiveSpanKm = request.spanKm
  let constraintAdjusted = false
  const spanBounds = resolvePlanningSpanBounds({
    mode: request.spanStrategy.mode,
    scanRange: request.spanStrategy.scanRange,
    minSpanLength: request.constraints.minSpanLength,
    maxSpanLength: request.constraints.maxSpanLength,
  })

  if (request.spanStrategy.mode === 'fixed') {
    if (!isSpanWithinBounds(request.spanKm, spanBounds)) {
      throw new Error(`固定 Span ${request.spanKm} km 超出约束范围 ${spanBounds.minKm}-${spanBounds.maxKm} km`)
    }
    const started = await platformProjectApi.fixedPlan(request.projectId)
    fixedLayoutResult = await pollPlanningResult(
      () => platformProjectApi.queryFixed(request.projectId),
      started,
      attempt => request.onProgress?.({
        stage: 'layout-poll',
        progress: Math.min(42, 18 + attempt),
        message: '正在等待布局规划结果',
      }),
    )
    layoutResult = fixedLayoutResult
  } else {
    const started = await platformProjectApi.optimizedPlan(request.projectId, request.fmmPathResultIndex)
    optimizedLayoutResult = await pollPlanningResult(
      () => platformProjectApi.queryOptimized(request.projectId),
      started,
      attempt => request.onProgress?.({
        stage: 'layout-poll',
        progress: Math.min(42, 18 + attempt),
        message: '正在等待优化布局结果',
      }),
    )
    layoutResult = optimizedLayoutResult

    const parsedOptimizedLayout = parsePlanningLayoutResult(optimizedLayoutResult, 'optimized')
    const returnedSpanKm = parsedOptimizedLayout?.spanKmUsed
      ?? parsedOptimizedLayout?.spans
        .map(span => span.lengthKm)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .reduce((max, value) => Math.max(max, value), 0)
      ?? request.spanKm
    effectiveSpanKm = selectConstrainedSpanKm({
      optimizedSpanKm: returnedSpanKm,
      optimizationTarget: request.optimizationTarget,
      bounds: spanBounds,
    })
    const requiresConstraintLayout = !isSpanWithinBounds(returnedSpanKm, spanBounds)
      || (request.optimizationTarget === 'max_gsnr' && Math.abs(returnedSpanKm - effectiveSpanKm) > 1e-6)

    if (requiresConstraintLayout) {
      constraintAdjusted = true
      request.onProgress?.({
        stage: 'layout-poll',
        progress: 44,
        message: `优化结果超出目标约束，正在按 ${effectiveSpanKm} km 重新布局`,
      })
      await platformPlanConfigApi.saveSpanKm({
        projectId: request.projectId,
        spanKm: effectiveSpanKm,
      })
      const fixedStarted = await platformProjectApi.fixedPlan(request.projectId)
      fixedLayoutResult = await pollPlanningResult(
        () => platformProjectApi.queryFixed(request.projectId),
        fixedStarted,
        attempt => request.onProgress?.({
          stage: 'layout-poll',
          progress: Math.min(48, 44 + attempt),
          message: '正在等待受约束布局结果',
        }),
      )
      layoutResult = fixedLayoutResult
    } else {
      effectiveSpanKm = returnedSpanKm
    }
  }

  request.onProgress?.({
    stage: 'simulation-start',
    progress: 50,
    message: '布局已完成，正在启动物理仿真',
  })
  const simulationStarted = await platformProjectApi.simulationPlan(
    request.projectId,
    request.fmmPathResultIndex,
  )
  // 物理仿真查询接口在部分平台版本中只返回 data: null，不能按布局结果
  // 的方式持续轮询，否则布局明明已经成功也会被拖到 30 秒超时。
  // 优先使用启动接口的直接结果；没有结果时只做一次查询，性能结果缺失
  // 仍然允许调用方展示真实的布局、设备和 Span 信息。
  let rawDetailedResult = simulationStarted
  if (!hasPlanningResult(rawDetailedResult)) {
    request.onProgress?.({
      stage: 'simulation-poll',
      progress: 78,
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
    message: '系统规划计算完成',
  })

  return {
    success: true,
    layoutResult,
    fixedLayoutResult,
    optimizedLayoutResult,
    effectiveSpanKm,
    constraintAdjusted,
    detailedResult,
    spanScanResult: extractSpanScanResult(detailedResult) ?? extractSpanScanResult(layoutResult),
    simulationCache: simulationCache ?? undefined,
  }
}

const RESULT_POLL_INTERVAL_MS = 1000
const RESULT_POLL_ATTEMPTS = 30

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

  for (const key of ['data', 'result', 'payload', 'fixed_result', 'optimized_result', 'simulation_result']) {
    if (key in parsed && hasPlanningResult(parsed[key])) return true
  }

  const metadataKeys = new Set([
    'status', 'state', 'message', 'msg', 'code', 'success',
    'jobId', 'job_id', 'taskId', 'task_id', 'data', 'result', 'payload',
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
  for (const key of ['data', 'result', 'payload']) {
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
    let spanLengthsKm = numberArray(candidate.spanLengthsKm ?? candidate.span_lengths_km)
    const gsnrRows = numberMatrix(candidate.gsnrPerSpanDb ?? candidate.gsnr_per_span_db)
    const osnrRows = numberMatrix(candidate.osnrPerSpanDb ?? candidate.osnr_per_span_db)
    const scanPointsValue = parseJsonValue(candidate.scanPoints ?? candidate.scan_points)

    if (spanLengthsKm.length === 0 && Array.isArray(scanPointsValue)) {
      spanLengthsKm = scanPointsValue
        .map(rawPoint => {
          const point = recordValue(rawPoint) ?? {}
          return finiteNumber(point.spanLengthKm ?? point.span_length_km)
        })
        .filter((item): item is number => item != null)
    }

    if (spanLengthsKm.length === 0) continue

    const targetGsnrDb = finiteNumber(candidate.targetGsnrDb ?? candidate.target_gsnr_db)
      ?? 14
    const scanPoints = Array.isArray(scanPointsValue)
      ? scanPointsValue.map((rawPoint, index) => {
          const point = recordValue(rawPoint) ?? {}
          const gsnrPerChannelDb = numberArray(point.gsnrPerChannelDb ?? point.gsnr_per_channel_db)
          const osnrPerChannelDb = numberArray(point.osnrPerChannelDb ?? point.osnr_per_channel_db)
          const spanLengthKm = finiteNumber(point.spanLengthKm ?? point.span_length_km)
            ?? spanLengthsKm[index]
            ?? 0
          const avgGsnrDb = finiteNumber(point.avgGsnrDb ?? point.avg_gsnr_db)
            ?? average(gsnrPerChannelDb)
          const avgOsnrDb = finiteNumber(point.avgOsnrDb ?? point.avg_osnr_db)
            ?? average(osnrPerChannelDb)
          return {
            spanLengthKm,
            gsnrPerChannelDb,
            osnrPerChannelDb,
            avgGsnrDb,
            minGsnrDb: finiteNumber(point.minGsnrDb ?? point.min_gsnr_db)
              ?? (gsnrPerChannelDb.length ? Math.min(...gsnrPerChannelDb) : avgGsnrDb),
            avgOsnrDb,
            meetTarget: Boolean(point.meetTarget ?? point.meet_target ?? avgGsnrDb >= targetGsnrDb),
            gsnrMarginDb: finiteNumber(point.gsnrMarginDb ?? point.gsnr_margin_db)
              ?? avgGsnrDb - targetGsnrDb,
            numAmplifiers: finiteNumber(point.numAmplifiers ?? point.num_amplifiers) ?? undefined,
          }
        })
      : spanLengthsKm.map((spanLengthKm, index) => {
          const gsnrPerChannelDb = gsnrRows[index] ?? []
          const osnrPerChannelDb = osnrRows[index] ?? []
          const avgGsnrDb = average(gsnrPerChannelDb)
          const avgOsnrDb = average(osnrPerChannelDb)
          return {
            spanLengthKm,
            gsnrPerChannelDb,
            osnrPerChannelDb,
            avgGsnrDb,
            minGsnrDb: gsnrPerChannelDb.length ? Math.min(...gsnrPerChannelDb) : avgGsnrDb,
            avgOsnrDb,
            meetTarget: avgGsnrDb >= targetGsnrDb,
            gsnrMarginDb: avgGsnrDb - targetGsnrDb,
          }
        })

    if (scanPoints.length === 0) continue
    const averages = scanPoints.map(point => point.avgGsnrDb)
    const bestIndex = averages.reduce((best, current, index) => current > averages[best] ? index : best, 0)
    const feasible = scanPoints
      .filter(point => point.meetTarget || point.avgGsnrDb >= targetGsnrDb)
      .map(point => point.spanLengthKm)
    const feasibleRangeValue = numberArray(candidate.feasibleRange ?? candidate.feasible_range ?? candidate.feasible_range_km)

    return {
      spanLengthsKm,
      scanPoints,
      recommendedSpanKm: finiteNumber(candidate.recommendedSpanKm ?? candidate.recommended_span_km)
        ?? spanLengthsKm[bestIndex]
        ?? spanLengthsKm[0],
      targetGsnrDb,
      feasibleRange: feasibleRangeValue.length >= 2
        ? [feasibleRangeValue[0], feasibleRangeValue[1]]
        : feasible.length > 0
          ? [Math.min(...feasible), Math.max(...feasible)]
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

function numberArray(value: unknown): number[] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed
    .map(finiteNumber)
    .filter((item): item is number => item != null)
}

function numberMatrix(value: unknown): number[][] {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return []
  return parsed
    .map(row => numberArray(row))
    .filter(row => row.length > 0)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, item) => sum + item, 0) / values.length
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

function normalizeMatrix(
  source: number[][],
  rowCount: number,
  columnCount: number,
  fallback?: number[][],
  defaultValue = 0,
): number[][] {
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => {
      const value = source[rowIndex]?.[columnIndex]
      if (typeof value === 'number' && Number.isFinite(value)) return value
      const fallbackValue = fallback?.[rowIndex]?.[columnIndex]
      return typeof fallbackValue === 'number' && Number.isFinite(fallbackValue)
        ? fallbackValue
        : defaultValue
    }),
  )
}

function deriveMetricsFromPower(
  signalPowerDbm: number[][],
  aseNoisePowerDbm: number[][],
  nliNoisePowerDbm: number[][],
): SimulationMetricsMatrix | null {
  const rowCount = signalPowerDbm.length
  const columnCount = signalPowerDbm[0]?.length ?? 0
  if (rowCount === 0 || columnCount === 0) return null

  const signal = normalizeMatrix(signalPowerDbm, rowCount, columnCount)
  const ase = normalizeMatrix(aseNoisePowerDbm, rowCount, columnCount, undefined, -300)
  const nli = normalizeMatrix(nliNoisePowerDbm, rowCount, columnCount, undefined, -300)
  const osnr = signal.map((row, rowIndex) => row.map((value, columnIndex) =>
    value - ase[rowIndex][columnIndex],
  ))
  const snrNli = signal.map((row, rowIndex) => row.map((value, columnIndex) =>
    value - nli[rowIndex][columnIndex],
  ))
  const gsnr = signal.map((row, rowIndex) => row.map((value, columnIndex) => {
    const totalNoiseMw = 10 ** (ase[rowIndex][columnIndex] / 10)
      + 10 ** (nli[rowIndex][columnIndex] / 10)
    return value - 10 * Math.log10(Math.max(totalNoiseMw, Number.EPSILON))
  }))

  return {
    gsnr_matrix_db: gsnr,
    osnr_matrix_db: osnr,
    snr_ase_matrix_db: osnr,
    snr_nli_matrix_db: snrNli,
    signal_power_matrix_dbm: signal,
    ase_noise_power_matrix_dbm: ase,
    nli_noise_power_matrix_dbm: nli,
  }
}

function buildMetrics(root: Record<string, unknown>): SimulationMetricsMatrix | null {
  const metrics = recordValue(readFirst(root, ['metrics', 'performance_matrices', 'performanceMatrices'])) ?? root
  const gsnr = numberMatrix(readFirst(metrics, ['gsnr_matrix_db', 'gsnrMatrixDb', 'gsnr_db']))
  const osnr = numberMatrix(readFirst(metrics, ['osnr_matrix_db', 'osnrMatrixDb', 'osnr_db']))
  const snrAse = numberMatrix(readFirst(metrics, ['snr_ase_matrix_db', 'snrAseMatrixDb', 'snr_ase_db']))
  const snrNli = numberMatrix(readFirst(metrics, ['snr_nli_matrix_db', 'snrNliMatrixDb', 'snr_nli_db']))
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

  const baseMatrix = gsnr.length ? gsnr : osnr.length ? osnr : snrAse.length ? snrAse : snrNli
  if (baseMatrix.length > 0 && (baseMatrix[0]?.length ?? 0) > 0) {
    const rowCount = baseMatrix.length
    const columnCount = baseMatrix[0].length
    return {
      gsnr_matrix_db: normalizeMatrix(gsnr, rowCount, columnCount, osnr),
      osnr_matrix_db: normalizeMatrix(osnr, rowCount, columnCount, gsnr),
      snr_ase_matrix_db: normalizeMatrix(snrAse, rowCount, columnCount, osnr.length ? osnr : gsnr),
      snr_nli_matrix_db: normalizeMatrix(snrNli, rowCount, columnCount, gsnr),
      ...(signalPower.length > 0 ? {
        signal_power_matrix_dbm: normalizeMatrix(signalPower, rowCount, columnCount),
      } : {}),
      ...(asePower.length > 0 ? {
        ase_noise_power_matrix_dbm: normalizeMatrix(asePower, rowCount, columnCount, undefined, -300),
      } : {}),
      ...(nliPower.length > 0 ? {
        nli_noise_power_matrix_dbm: normalizeMatrix(nliPower, rowCount, columnCount, undefined, -300),
      } : {}),
    }
  }

  return deriveMetricsFromPower(
    signalPower,
    asePower,
    nliPower,
  )
}

function buildPositions(
  root: Record<string, unknown>,
  rowCount: number,
  request?: SimulationRequest,
): SimulationCache['positions'] {
  const positions = recordValue(readFirst(root, ['positions']))
  const metadataValue = parseJsonValue(readFirst(root, ['node_metadata', 'nodeMetadata', 'nodes']))
  const metadata = Array.isArray(metadataValue) ? metadataValue : []
  const requestDevices = [...(request?.deviceSequence ?? [])].sort((left, right) => left.kp - right.kp)

  const names = positions ? stringArray(readFirst(positions, ['names', 'node_names'])) : []
  const distances = positions ? numberArray(readFirst(positions, ['distances_km', 'distancesKm'])) : []
  const spanIds = positions ? stringArray(readFirst(positions, ['span_ids', 'spanIds'])) : []

  for (const [index, rawNode] of metadata.entries()) {
    const node = recordValue(rawNode)
    if (!node) continue
    names[index] = String(readFirst(node, ['node_name', 'nodeName', 'name', 'event_id', 'node_id']) ?? `Node-${index + 1}`)
    distances[index] = finiteNumber(readFirst(node, ['position_km', 'positionKm', 'kp_km', 'kpKm', 'kp'])) ?? distances[index]
  }

  if (names.length === 0 && requestDevices.length > 0) {
    requestDevices.forEach((device, index) => {
      names[index] = device.name || `${device.type}-${index + 1}`
      distances[index] = device.kp
    })
  }

  const totalLength = request?.totalLengthKm ?? distances[distances.length - 1] ?? 0
  return {
    count: rowCount,
    names: Array.from({ length: rowCount }, (_, index) =>
      names[index] || (index === 0 ? 'Tx' : index === rowCount - 1 ? 'Rx' : `Node-${index}`),
    ),
    distances_km: Array.from({ length: rowCount }, (_, index) => {
      const value = distances[index]
      return Number.isFinite(value) ? value : rowCount <= 1 ? 0 : totalLength * index / (rowCount - 1)
    }),
    span_ids: Array.from({ length: Math.max(0, rowCount - 1) }, (_, index) =>
      spanIds[index] || `span_${String(index + 1).padStart(2, '0')}`,
    ),
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
): SimulationCache['channels'] {
  const channels = recordValue(readFirst(root, ['channels']))
  const ids = channels ? stringArray(readFirst(channels, ['ids', 'channel_ids'])) : []
  const frequencies = channels
    ? numberArray(readFirst(channels, ['frequencies_thz', 'frequenciesThz']))
    : numberArray(readFirst(root, ['channel_frequencies_thz', 'channelFrequenciesThz', 'channelFrequencies']))
  const fallbackFrequencies = request?.channelConfig.channelFrequenciesThz ?? []
  const center = request?.channelConfig.centerFrequencyThz ?? 193.1
  const spacing = (request?.channelConfig.channelSpacingGhz ?? 50) / 1000
  const start = center - (columnCount - 1) * spacing / 2

  return {
    count: columnCount,
    ids: Array.from({ length: columnCount }, (_, index) => ids[index] || `Ch${index + 1}`),
    frequencies_thz: Array.from({ length: columnCount }, (_, index) =>
      frequencies[index] ?? fallbackFrequencies[index] ?? Number((start + index * spacing).toFixed(6)),
    ),
  }
}

function stats(values: number[]): { min: number; max: number; avg: number; minIndex: number; maxIndex: number } {
  if (values.length === 0) return { min: 0, max: 0, avg: 0, minIndex: 0, maxIndex: 0 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  return {
    min,
    max,
    avg: average(values),
    minIndex: values.indexOf(min),
    maxIndex: values.indexOf(max),
  }
}

function modulationBits(format: string): number {
  if (format.includes('64QAM')) return 6
  if (format.includes('32QAM')) return 5
  if (format.includes('16QAM')) return 4
  if (format.includes('8QAM')) return 3
  return 2
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

  const positions = buildPositions(parsed, rowCount, request)
  const channels = buildChannels(parsed, columnCount, request)
  const finalGsnr = stats(metrics.gsnr_matrix_db[rowCount - 1] ?? [])
  const finalOsnr = stats(metrics.osnr_matrix_db[rowCount - 1] ?? [])
  const totalLength = positions.distances_km[rowCount - 1] ?? request?.totalLengthKm ?? 0
  const modulation = request?.channelConfig.modulationFormat ?? '16QAM'
  const baudRate = request?.channelConfig.baudRateGbaud ?? 64
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
      fiber_model_id: String(readFirst(modelSelection ?? {}, ['fiber_model_id', 'fiberModelId']) ?? request?.fiberModel ?? 'GN'),
      edfa_model_id: String(readFirst(modelSelection ?? {}, ['edfa_model_id', 'edfaModelId']) ?? request?.amplifierModel ?? 'EDFA_Simple'),
      bu_model_id: readFirst(modelSelection ?? {}, ['bu_model_id', 'buModelId']) == null
        ? null
        : String(readFirst(modelSelection ?? {}, ['bu_model_id', 'buModelId'])),
    },
    positions,
    channels,
    metrics,
    summary: {
      total_length_km: totalLength,
      total_span_count: Math.max(0, positions.count - 1),
      final_gsnr: {
        avg_db: finalGsnr.avg,
        min_db: finalGsnr.min,
        max_db: finalGsnr.max,
        worst_channel: channels.ids[finalGsnr.minIndex] ?? 'Ch1',
        best_channel: channels.ids[finalGsnr.maxIndex] ?? 'Ch1',
      },
      final_osnr: {
        avg_db: finalOsnr.avg,
        min_db: finalOsnr.min,
      },
      system_capacity_tbps: Number((columnCount * baudRate * modulationBits(modulation) / 1000).toFixed(2)),
      final_gsnr_avg_db: finalGsnr.avg,
      final_gsnr_min_db: finalGsnr.min,
      final_osnr_avg_db: finalOsnr.avg,
    },
  }
}
