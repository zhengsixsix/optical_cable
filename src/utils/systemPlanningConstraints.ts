export interface PlanningSpanBounds {
  minKm: number
  maxKm: number
}

export interface PlanningSpanConstraintInput {
  mode: 'fixed' | 'scan'
  scanRange?: {
    min: number
    max: number
  }
  minSpanLength: number
  maxSpanLength: number
}

export type PlanningOptimizationTarget = 'min_amplifiers' | 'max_gsnr'

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

export function resolvePlanningSpanBounds(input: PlanningSpanConstraintInput): PlanningSpanBounds {
  if (!finitePositive(input.minSpanLength) || !finitePositive(input.maxSpanLength)) {
    throw new Error('Span 约束必须是大于 0 的有效数值')
  }
  if (input.minSpanLength > input.maxSpanLength) {
    throw new Error('最小 Span 长度不能大于最大 Span 长度')
  }

  const scanMin = input.mode === 'scan' ? input.scanRange?.min : undefined
  const scanMax = input.mode === 'scan' ? input.scanRange?.max : undefined
  if (input.mode === 'scan' && (!finitePositive(scanMin ?? 0) || !finitePositive(scanMax ?? 0))) {
    throw new Error('自动优化的 Span 扫描范围必须是大于 0 的有效数值')
  }

  const minKm = Math.max(input.minSpanLength, scanMin ?? input.minSpanLength)
  const maxKm = Math.min(input.maxSpanLength, scanMax ?? input.maxSpanLength)
  if (minKm > maxKm) {
    throw new Error(`Span 扫描范围与约束没有交集（扫描 ${scanMin}-${scanMax} km，约束 ${input.minSpanLength}-${input.maxSpanLength} km）`)
  }

  return { minKm, maxKm }
}

export function isSpanWithinBounds(spanKm: number | null | undefined, bounds: PlanningSpanBounds): boolean {
  return typeof spanKm === 'number'
    && Number.isFinite(spanKm)
    && spanKm >= bounds.minKm - 1e-6
    && spanKm <= bounds.maxKm + 1e-6
}

export function selectConstrainedSpanKm(input: {
  optimizedSpanKm?: number | null
  optimizationTarget: PlanningOptimizationTarget
  bounds: PlanningSpanBounds
}): number {
  // 平台优化接口没有 optimizationTarget 字段；最大 GSNR 模式以允许范围内
  // 最短 Span 触发固定布局，确保该选择会真实改变后续布局与仿真输入。
  const requested = input.optimizationTarget === 'max_gsnr'
    ? input.bounds.minKm
    : input.optimizedSpanKm ?? input.bounds.maxKm
  const constrained = Math.min(input.bounds.maxKm, Math.max(input.bounds.minKm, requested))
  return Number(constrained.toFixed(6))
}
