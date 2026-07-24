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
