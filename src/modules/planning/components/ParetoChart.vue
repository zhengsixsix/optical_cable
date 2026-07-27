<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { useRouteStore } from '@/stores/route'
import type { Route } from '@/types'
import {
  getParetoFront,
  getValidParetoCandidates,
  sortParetoFront,
  type ValidParetoCandidate,
} from '@/services/ParetoAnalysisService'

interface Props {
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  width: 680,
  height: 360,
})

const emit = defineEmits<{
  (e: 'select-route', routeId: string): void
}>()

type ParetoRoute = ValidParetoCandidate<Route>
type ChartPoint = {
  kind: 'route' | 'edge'
  route: ParetoRoute
  index: number
  x: number
  y: number
  baseX: number
  baseY: number
  groupSize: number
  direction?: number
}

const routeStore = useRouteStore()
const surfaceRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasSize = ref({ width: props.width, height: props.height })
const zoomLevel = ref(1)
const viewCenter = ref<{ cost: number; risk: number } | null>(null)
const dragState = ref<{ x: number; y: number; moved: boolean } | null>(null)
const skipNextClick = ref(false)
const hoveredRouteId = ref<string | null>(null)
const hoveredGroupSize = ref(1)
const hoveredPointKind = ref<'route' | 'edge'>('route')
const tooltipPosition = ref<{ left: number; top: number } | null>(null)

let resizeObserver: ResizeObserver | null = null

const chartRoutes = computed(() => getValidParetoCandidates(routeStore.paretoRoutes))
const paretoFrontRoutes = computed(() => getParetoFront(chartRoutes.value))
const paretoFrontIds = computed(() => new Set(paretoFrontRoutes.value.map(route => route.id)))
const hoveredRoute = computed(() =>
  chartRoutes.value.find(route => route.id === hoveredRouteId.value) ?? null)
const hasChartData = computed(() => chartRoutes.value.length > 0)
const riskIsNormalized = computed(() => chartRoutes.value.length > 0
  && chartRoutes.value.every(route => route.risk.overall >= 0 && route.risk.overall <= 1))
const canvasAriaLabel = computed(() => hasChartData.value
  ? `成本与风险散点图，共 ${chartRoutes.value.length} 个有效方案，其中 ${paretoFrontRoutes.value.length} 个 Pareto 前沿方案`
  : '成本与风险散点图，暂无有效方案')

const margin = { top: 28, right: 24, bottom: 58, left: 72 }
const chartWidth = computed(() => Math.max(1, canvasSize.value.width - margin.left - margin.right))
const chartHeight = computed(() => Math.max(1, canvasSize.value.height - margin.top - margin.bottom))

const compactFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const formatAxisTick = (value: number, span: number) => {
  if (Math.abs(value) >= 10_000) return compactFormatter.format(value)
  const step = Math.abs(span) / 4
  const fractionDigits = step >= 10
    ? 0
    : step >= 1
      ? 2
      : Math.min(6, Math.max(2, Math.ceil(-Math.log10(Math.max(step, Number.EPSILON))) + 1))
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

const formatRisk = (value: number) => riskIsNormalized.value
  ? new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 }).format(value)
  : formatAxisTick(value, visibleRange.value.maxRisk - visibleRange.value.minRisk)

const paddedRange = (values: number[], clampAtZero = false) => {
  if (values.length === 0) return { min: 0, max: 1 }
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = rawMax - rawMin
  const padding = span > 0 ? span * 0.12 : Math.max(Math.abs(rawMin) * 0.05, 1)
  const min = clampAtZero && rawMin >= 0 ? Math.max(0, rawMin - padding) : rawMin - padding
  return { min, max: rawMax + padding }
}

const normalizedRiskRange = (values: number[]) => {
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = rawMax - rawMin
  const padding = span > 0 ? Math.max(span * 0.12, 0.02) : 0.05
  let min = Math.max(0, rawMin - padding)
  let max = Math.min(1, rawMax + padding)
  if (max - min < 0.02) {
    min = Math.max(0, min - 0.01)
    max = Math.min(1, max + 0.01)
  }
  return { min, max }
}

const dataRange = computed(() => {
  if (chartRoutes.value.length === 0) {
    return { minCost: 0, maxCost: 100, minRisk: 0, maxRisk: 1 }
  }

  const costs = chartRoutes.value.map(route => route.cost.total)
  const risks = chartRoutes.value.map(route => route.risk.overall)
  const costRange = paddedRange(costs, true)
  const riskRange = riskIsNormalized.value ? normalizedRiskRange(risks) : paddedRange(risks, true)
  return {
    minCost: costRange.min,
    maxCost: costRange.max,
    minRisk: riskRange.min,
    maxRisk: riskRange.max,
  }
})

const visibleRange = computed(() => {
  const range = dataRange.value
  if (zoomLevel.value <= 1) return range

  const baseCostSpan = range.maxCost - range.minCost
  const baseRiskSpan = range.maxRisk - range.minRisk
  const costSpan = baseCostSpan / zoomLevel.value
  const riskSpan = baseRiskSpan / zoomLevel.value
  const defaultCenter = {
    cost: (range.minCost + range.maxCost) / 2,
    risk: (range.minRisk + range.maxRisk) / 2,
  }
  const requestedCenter = viewCenter.value ?? defaultCenter
  const centerCost = range.minCost >= 0
    ? Math.max(costSpan / 2, requestedCenter.cost)
    : requestedCenter.cost
  const minimumRiskCenter = range.minRisk >= 0 ? riskSpan / 2 : Number.NEGATIVE_INFINITY
  const maximumRiskCenter = riskIsNormalized.value ? 1 - riskSpan / 2 : Number.POSITIVE_INFINITY
  const centerRisk = Math.min(maximumRiskCenter, Math.max(minimumRiskCenter, requestedCenter.risk))

  return {
    minCost: centerCost - costSpan / 2,
    maxCost: centerCost + costSpan / 2,
    minRisk: centerRisk - riskSpan / 2,
    maxRisk: centerRisk + riskSpan / 2,
  }
})

const toCanvasX = (cost: number) => {
  const { minCost, maxCost } = visibleRange.value
  return margin.left + ((cost - minCost) / (maxCost - minCost)) * chartWidth.value
}

const toCanvasY = (risk: number) => {
  const { minRisk, maxRisk } = visibleRange.value
  return canvasSize.value.height - margin.bottom
    - ((risk - minRisk) / (maxRisk - minRisk)) * chartHeight.value
}

const buildTicks = (min: number, max: number, targetCount = 5) => {
  const span = max - min
  if (!Number.isFinite(span) || span <= 0) return [min, max]
  const roughStep = span / Math.max(1, targetCount - 1)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude
  const niceMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = niceMultiplier * magnitude
  const start = Math.ceil((min - step * 1e-9) / step) * step
  const ticks: number[] = []
  for (let value = start; value <= max + step * 1e-9 && ticks.length < 12; value += step) {
    ticks.push(Number(value.toPrecision(12)))
  }
  return ticks.length >= 2 ? ticks : [min, max]
}

const routeIsVisible = (route: ParetoRoute) => {
  const { minCost, maxCost, minRisk, maxRisk } = visibleRange.value
  return route.cost.total >= minCost
    && route.cost.total <= maxCost
    && route.risk.overall >= minRisk
    && route.risk.overall <= maxRisk
}

const plottedPoints = (): ChartPoint[] => {
  const groups: Array<Array<{
    route: ParetoRoute
    index: number
    baseX: number
    baseY: number
  }>> = []
  chartRoutes.value.forEach((route, index) => {
    if (!routeIsVisible(route)) return
    const baseX = toCanvasX(route.cost.total)
    const baseY = toCanvasY(route.risk.overall)
    const nearbyGroup = groups.find(group => group.some(point =>
      Math.hypot(point.baseX - baseX, point.baseY - baseY) < 14))
    const point = { route, index, baseX, baseY }
    if (nearbyGroup) nearbyGroup.push(point)
    else groups.push([point])
  })

  return groups.flatMap(group => {
    const centerX = group.reduce((sum, point) => sum + point.baseX, 0) / group.length
    const centerY = group.reduce((sum, point) => sum + point.baseY, 0) / group.length
    return group.map(({ route, index, baseX, baseY }, groupIndex) => {
      const ringIndex = Math.floor(groupIndex / 8)
      const slotIndex = groupIndex % 8
      const slotCount = Math.min(8, group.length - ringIndex * 8)
      const radius = group.length > 1 ? 14 + ringIndex * 8 : 0
      const angle = -Math.PI / 2 + (slotIndex / slotCount) * Math.PI * 2
      const pointInset = 13
      const x = Math.min(
        canvasSize.value.width - margin.right - pointInset,
        Math.max(margin.left + pointInset, centerX + Math.cos(angle) * radius),
      )
      const y = Math.min(
        canvasSize.value.height - margin.bottom - pointInset,
        Math.max(margin.top + pointInset, centerY + Math.sin(angle) * radius),
      )
      return { kind: 'route', route, index, x, y, baseX, baseY, groupSize: group.length }
    })
  })
}

const edgeIndicators = (): ChartPoint[] => {
  if (zoomLevel.value <= 1) return []

  const selectedId = routeStore.selectedRoute?.id
  const candidates = chartRoutes.value
    .filter(route => !routeIsVisible(route)
      && (paretoFrontIds.value.has(route.id) || route.id === selectedId))
    .sort((left, right) => Number(right.id === selectedId) - Number(left.id === selectedId))
  const left = margin.left + 13
  const right = canvasSize.value.width - margin.right - 13
  const top = margin.top + 13
  const bottom = canvasSize.value.height - margin.bottom - 13
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  const indicators: ChartPoint[] = []

  candidates.forEach(route => {
    const targetX = toCanvasX(route.cost.total)
    const targetY = toCanvasY(route.risk.overall)
    const dx = targetX - centerX
    const dy = targetY - centerY
    if (Math.abs(dx) < Number.EPSILON && Math.abs(dy) < Number.EPSILON) return

    const horizontalScale = dx > 0 ? (right - centerX) / dx : (left - centerX) / dx
    const verticalScale = dy > 0 ? (bottom - centerY) / dy : (top - centerY) / dy
    const scale = Math.min(
      horizontalScale > 0 ? horizontalScale : Number.POSITIVE_INFINITY,
      verticalScale > 0 ? verticalScale : Number.POSITIVE_INFINITY,
    )
    const x = centerX + dx * scale
    const y = centerY + dy * scale
    if (indicators.some(indicator => Math.hypot(indicator.x - x, indicator.y - y) < 16)) return

    indicators.push({
      kind: 'edge',
      route,
      index: chartRoutes.value.indexOf(route),
      x,
      y,
      baseX: targetX,
      baseY: targetY,
      groupSize: 1,
      direction: Math.atan2(dy, dx),
    })
  })
  return indicators
}

const frontLineRoutes = computed(() => {
  const uniqueByMetrics = new Map<string, ParetoRoute>()
  sortParetoFront(paretoFrontRoutes.value).forEach(route => {
    const key = `${route.cost.total}\u0000${route.risk.overall}`
    if (!uniqueByMetrics.has(key)) uniqueByMetrics.set(key, route)
  })
  return [...uniqueByMetrics.values()]
})

const routeLabel = (route: ParetoRoute, index: number) => route.name?.trim() || `路径${index + 1}`

const fitCanvasLabel = (ctx: CanvasRenderingContext2D, label: string, maxWidth: number) => {
  if (ctx.measureText(label).width <= maxWidth) return label
  let clipped = label
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}…`
}

const drawGridAndAxes = (ctx: CanvasRenderingContext2D) => {
  const width = canvasSize.value.width
  const height = canvasSize.value.height
  const { minCost, maxCost, minRisk, maxRisk } = visibleRange.value
  const xTicks = buildTicks(minCost, maxCost, width < 480 ? 4 : 6)
  const yTicks = buildTicks(minRisk, maxRisk, 5)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#fbfdff'
  ctx.fillRect(margin.left, margin.top, chartWidth.value, chartHeight.value)

  ctx.save()
  ctx.setLineDash([3, 4])
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  xTicks.forEach(cost => {
    const x = toCanvasX(cost)
    ctx.beginPath()
    ctx.moveTo(x, margin.top)
    ctx.lineTo(x, height - margin.bottom)
    ctx.stroke()
  })
  yTicks.forEach(risk => {
    const y = toCanvasY(risk)
    ctx.beginPath()
    ctx.moveTo(margin.left, y)
    ctx.lineTo(width - margin.right, y)
    ctx.stroke()
  })
  ctx.restore()

  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.strokeRect(margin.left, margin.top, chartWidth.value, chartHeight.value)

  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(margin.left, margin.top)
  ctx.lineTo(margin.left, height - margin.bottom)
  ctx.lineTo(width - margin.right, height - margin.bottom)
  ctx.stroke()

  ctx.fillStyle = '#64748b'
  ctx.font = '11px "Microsoft YaHei", sans-serif'
  xTicks.forEach(cost => {
    const x = toCanvasX(cost)
    const label = formatAxisTick(cost, maxCost - minCost)
    const labelHalfWidth = ctx.measureText(label).width / 2
    const labelX = Math.min(
      width - margin.right - labelHalfWidth,
      Math.max(margin.left + labelHalfWidth, x),
    )
    ctx.textAlign = 'center'
    ctx.fillText(label, labelX, height - margin.bottom + 19)
  })
  ctx.textAlign = 'right'
  yTicks.forEach(risk => {
    ctx.fillText(formatRisk(risk), margin.left - 8, toCanvasY(risk) + 4)
  })

  ctx.fillStyle = '#334155'
  ctx.font = '600 12px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('总成本（越低越优）', margin.left + chartWidth.value / 2, height - 10)
  ctx.save()
  ctx.translate(17, margin.top + chartHeight.value / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(riskIsNormalized.value ? '综合风险（百分比，越低越优）' : '综合风险（越低越优）', 0, 0)
  ctx.restore()
}

const drawFrontierLine = (ctx: CanvasRenderingContext2D, indicators: ChartPoint[]) => {
  const segments = frontLineRoutes.value.slice(0, -1).flatMap((route, index) => {
    const nextRoute = frontLineRoutes.value[index + 1]
    return routeIsVisible(route) || routeIsVisible(nextRoute) ? [[route, nextRoute] as const] : []
  })
  if (segments.length === 0) return
  const indicatorByRouteId = new Map(indicators.map(indicator => [indicator.route.id, indicator]))
  const routePosition = (route: ParetoRoute) => {
    const indicator = indicatorByRouteId.get(route.id)
    return indicator
      ? { x: indicator.x, y: indicator.y }
      : { x: toCanvasX(route.cost.total), y: toCanvasY(route.risk.overall) }
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  segments.forEach(([route, nextRoute]) => {
    const start = routePosition(route)
    const end = routePosition(nextRoute)
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
  })
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.lineWidth = 5
  ctx.stroke()

  ctx.beginPath()
  segments.forEach(([route, nextRoute]) => {
    const start = routePosition(route)
    const end = routePosition(nextRoute)
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
  })
  ctx.strokeStyle = '#0f766e'
  ctx.lineWidth = 2.25
  ctx.stroke()
  ctx.restore()
}

const drawEdgeIndicators = (ctx: CanvasRenderingContext2D, indicators: ChartPoint[]) => {
  const selectedId = routeStore.selectedRoute?.id
  indicators.forEach(({ route, x, y, direction = 0 }) => {
    const isSelected = route.id === selectedId
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(direction)
    ctx.beginPath()
    ctx.moveTo(8, 0)
    ctx.lineTo(-5, -6)
    ctx.lineTo(-3, 0)
    ctx.lineTo(-5, 6)
    ctx.closePath()
    ctx.fillStyle = isSelected ? '#f59e0b' : '#0f766e'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  })
}

const roundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.quadraticCurveTo(x, y, x + safeRadius, y)
  ctx.closePath()
}

const drawPoints = (ctx: CanvasRenderingContext2D, points: ChartPoint[]) => {
  const selectedId = routeStore.selectedRoute?.id
  points.forEach(({ baseX, baseY, x, y, groupSize }) => {
    if (groupSize <= 1 || Math.hypot(x - baseX, y - baseY) < 3) return
    ctx.beginPath()
    ctx.moveTo(baseX, baseY)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(baseX, baseY, 1.75, 0, Math.PI * 2)
    ctx.fillStyle = '#94a3b8'
    ctx.fill()
  })

  const pointPriority = ({ route }: ChartPoint) => Number(paretoFrontIds.value.has(route.id))
    + Number(route.id === selectedId) * 2
  const orderedPoints = [...points].sort((left, right) => pointPriority(left) - pointPriority(right))

  orderedPoints.forEach(({ route, x, y }) => {
    const isSelected = route.id === selectedId
    const isHovered = route.id === hoveredRouteId.value
    const isFront = paretoFrontIds.value.has(route.id)

    if (isSelected) {
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, 7.5, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.5
      ctx.stroke()
    } else if (isFront) {
      const radius = isHovered ? 7.5 : 6.5
      ctx.beginPath()
      ctx.moveTo(x, y - radius)
      ctx.lineTo(x + radius, y)
      ctx.lineTo(x, y + radius)
      ctx.lineTo(x - radius, y)
      ctx.closePath()
      ctx.fillStyle = '#0f766e'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else {
      const radius = isHovered ? 6.5 : 5.5
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = isHovered ? '#f1f5f9' : '#ffffff'
      ctx.fill()
      ctx.strokeStyle = isHovered ? '#475569' : '#94a3b8'
      ctx.lineWidth = isHovered ? 2 : 1.75
      ctx.stroke()
    }

    if (isHovered) {
      ctx.beginPath()
      ctx.arc(x, y, isSelected ? 12 : 10.5, 0, Math.PI * 2)
      ctx.strokeStyle = isSelected ? '#d97706' : isFront ? '#2dd4bf' : '#64748b'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  })

  const occupiedLabels: Array<{ left: number; top: number; right: number; bottom: number }> = []
  const prioritizedPoints = [...points].sort((left, right) => {
    const priority = (point: ChartPoint) => Number(point.route.id === selectedId) * 3
      + Number(point.route.id === hoveredRouteId.value) * 2
      + Number(paretoFrontIds.value.has(point.route.id))
    return priority(right) - priority(left)
  })
  prioritizedPoints.forEach(({ route, index, x, y }) => {
    const isPriority = route.id === selectedId || route.id === hoveredRouteId.value
    const isFront = paretoFrontIds.value.has(route.id)
    const showFrontLabel = isFront && paretoFrontRoutes.value.length <= 6
    if (!isPriority && !showFrontLabel) return

    ctx.font = '600 11px "Microsoft YaHei", sans-serif'
    const label = fitCanvasLabel(ctx, routeLabel(route, index), 96)
    const labelWidth = ctx.measureText(label).width + 14
    const labelHeight = 22
    const candidates = [
      [54, 0], [-54, 0], [0, -24], [34, -20], [-34, -20], [34, 22], [-34, 22], [0, 27],
    ] as const
    let placement: { centerX: number; centerY: number; left: number; top: number; right: number; bottom: number } | null = null
    for (const [offsetX, offsetY] of candidates) {
      const centerX = x + offsetX
      const centerY = y + offsetY
      const box = {
        centerX,
        centerY,
        left: centerX - labelWidth / 2,
        right: centerX + labelWidth / 2,
        top: centerY - labelHeight / 2,
        bottom: centerY + labelHeight / 2,
      }
      const inside = box.left >= margin.left && box.right <= canvasSize.value.width - margin.right
        && box.top >= margin.top && box.bottom <= canvasSize.value.height - margin.bottom
      const free = !occupiedLabels.some(existing =>
        box.left < existing.right && box.right > existing.left
        && box.top < existing.bottom && box.bottom > existing.top)
      const clearOfPoints = route.id === selectedId || !points.some(point => point.route.id !== route.id
        && point.x > box.left - 4 && point.x < box.right + 4
        && point.y > box.top - 4 && point.y < box.bottom + 4)
      if (inside && free && clearOfPoints) {
        placement = box
        occupiedLabels.push(box)
        break
      }
    }
    if (!placement) return

    const angle = Math.atan2(placement.centerY - y, placement.centerX - x)
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(angle) * 9, y + Math.sin(angle) * 9)
    ctx.lineTo(placement.centerX, placement.centerY)
    ctx.strokeStyle = route.id === selectedId ? '#fbbf24' : isFront ? '#99f6e4' : '#cbd5e1'
    ctx.lineWidth = 1
    ctx.stroke()

    roundedRectPath(ctx, placement.left, placement.top, labelWidth, labelHeight, 4)
    ctx.fillStyle = route.id === selectedId ? '#fffbeb' : '#ffffff'
    ctx.fill()
    ctx.strokeStyle = route.id === selectedId ? '#fbbf24' : isFront ? '#99f6e4' : '#cbd5e1'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = route.id === selectedId ? '#92400e' : isFront ? '#115e59' : '#334155'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, placement.centerX, placement.centerY + 0.5)
    ctx.textBaseline = 'alphabetic'
  })
}

const drawChart = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(canvasSize.value.width * dpr)
  const pixelHeight = Math.round(canvasSize.value.height * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, canvasSize.value.width, canvasSize.value.height)
  drawGridAndAxes(ctx)

  if (!hasChartData.value) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '13px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      '暂无可比较的成本 / 风险数据',
      margin.left + chartWidth.value / 2,
      margin.top + chartHeight.value / 2,
    )
    return
  }

  const points = plottedPoints()
  const indicators = edgeIndicators()

  ctx.save()
  ctx.beginPath()
  ctx.rect(margin.left, margin.top, chartWidth.value, chartHeight.value)
  ctx.clip()
  drawFrontierLine(ctx, indicators)
  drawPoints(ctx, points)
  drawEdgeIndicators(ctx, indicators)
  ctx.restore()
}

const getCanvasCoordinates = (event: MouseEvent | PointerEvent | WheelEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: (event.clientX - rect.left) * (canvasSize.value.width / rect.width),
    y: (event.clientY - rect.top) * (canvasSize.value.height / rect.height),
  }
}

const findPointAt = (x: number, y: number) => {
  let nearest: ChartPoint | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  const selectedId = routeStore.selectedRoute?.id
  for (const point of [...plottedPoints(), ...edgeIndicators()]) {
    const distance = Math.hypot(x - point.x, y - point.y)
    if (distance > 12) continue
    const isHigherPriority = nearest
      && Math.abs(distance - nearestDistance) <= 0.5
      && Number(point.route.id === selectedId) + Number(paretoFrontIds.value.has(point.route.id))
        > Number(nearest.route.id === selectedId) + Number(paretoFrontIds.value.has(nearest.route.id))
    if (!nearest || distance < nearestDistance - 0.5 || isHigherPriority) {
      nearest = point
      nearestDistance = distance
    }
  }
  return nearest
}

const handleClick = (event: MouseEvent) => {
  if (skipNextClick.value) {
    skipNextClick.value = false
    return
  }
  const position = getCanvasCoordinates(event)
  if (!position) return
  const point = findPointAt(position.x, position.y)
  if (!point) return
  routeStore.selectRoute(point.route.id)
  emit('select-route', point.route.id)
  if (point.kind === 'edge') {
    viewCenter.value = {
      cost: point.route.cost.total,
      risk: point.route.risk.overall,
    }
    hoveredRouteId.value = null
    tooltipPosition.value = null
    drawChart()
  }
}

const resetView = () => {
  zoomLevel.value = 1
  viewCenter.value = null
  drawChart()
}

const setZoom = (nextZoom: number, requestedCenter?: { cost: number; risk: number }) => {
  if (!hasChartData.value) return
  const clampedZoom = Math.min(20, Math.max(1, nextZoom))
  if (clampedZoom <= 1) {
    resetView()
    return
  }
  const range = visibleRange.value
  viewCenter.value = requestedCenter ?? {
    cost: (range.minCost + range.maxCost) / 2,
    risk: (range.minRisk + range.maxRisk) / 2,
  }
  zoomLevel.value = clampedZoom
  drawChart()
}

const currentViewCenter = () => {
  const range = visibleRange.value
  return {
    cost: (range.minCost + range.maxCost) / 2,
    risk: (range.minRisk + range.maxRisk) / 2,
  }
}

const preferredZoomRoute = () => hoveredRoute.value
  ?? chartRoutes.value.find(route => route.id === routeStore.selectedRoute?.id)
  ?? null

const zoomIn = () => {
  const focusRoute = zoomLevel.value <= 1 ? preferredZoomRoute() : null
  setZoom(
    zoomLevel.value * 1.25,
    focusRoute
      ? { cost: focusRoute.cost.total, risk: focusRoute.risk.overall }
      : currentViewCenter(),
  )
}

const zoomOut = () => setZoom(zoomLevel.value * 0.8, currentViewCenter())

const handleWheel = (event: WheelEvent) => {
  if (!hasChartData.value) return
  event.preventDefault()
  const position = getCanvasCoordinates(event)
  if (!position) {
    if (event.deltaY < 0) zoomIn()
    else zoomOut()
    return
  }
  const range = visibleRange.value
  const xRatio = Math.min(1, Math.max(0, (position.x - margin.left) / chartWidth.value))
  const yRatio = Math.min(1, Math.max(0, (canvasSize.value.height - margin.bottom - position.y) / chartHeight.value))
  const focus = {
    cost: range.minCost + xRatio * (range.maxCost - range.minCost),
    risk: range.minRisk + yRatio * (range.maxRisk - range.minRisk),
  }
  const nextZoom = Math.min(20, Math.max(1, zoomLevel.value * (event.deltaY < 0 ? 1.25 : 0.8)))
  if (nextZoom <= 1) {
    resetView()
    return
  }
  const nextCostSpan = (dataRange.value.maxCost - dataRange.value.minCost) / nextZoom
  const nextRiskSpan = (dataRange.value.maxRisk - dataRange.value.minRisk) / nextZoom
  setZoom(nextZoom, {
    cost: focus.cost + (0.5 - xRatio) * nextCostSpan,
    risk: focus.risk + (0.5 - yRatio) * nextRiskSpan,
  })
}

const handlePointerDown = (event: PointerEvent) => {
  if (zoomLevel.value <= 1) return
  const position = getCanvasCoordinates(event)
  if (!position) return
  canvasRef.value?.setPointerCapture(event.pointerId)
  dragState.value = { ...position, moved: false }
}

const handlePointerMove = (event: PointerEvent) => {
  const position = getCanvasCoordinates(event)
  if (!position) return

  if (dragState.value && zoomLevel.value > 1) {
    const dx = position.x - dragState.value.x
    const dy = position.y - dragState.value.y
    if (Math.abs(dx) + Math.abs(dy) > 2) dragState.value.moved = true
    const range = visibleRange.value
    const center = viewCenter.value ?? {
      cost: (range.minCost + range.maxCost) / 2,
      risk: (range.minRisk + range.maxRisk) / 2,
    }
    const proposedCenter = {
      cost: center.cost - (dx / chartWidth.value) * (range.maxCost - range.minCost),
      risk: center.risk + (dy / chartHeight.value) * (range.maxRisk - range.minRisk),
    }
    viewCenter.value = proposedCenter
    dragState.value.x = position.x
    dragState.value.y = position.y
    hoveredRouteId.value = null
    tooltipPosition.value = null
    drawChart()
    return
  }

  const point = findPointAt(position.x, position.y)
  const nextHoveredId = point?.route.id ?? null
  if (nextHoveredId !== hoveredRouteId.value) {
    hoveredRouteId.value = nextHoveredId
    hoveredGroupSize.value = point?.groupSize ?? 1
    hoveredPointKind.value = point?.kind ?? 'route'
    drawChart()
  }
  if (!point || !surfaceRef.value) {
    tooltipPosition.value = null
    return
  }
  const surfaceRect = surfaceRef.value.getBoundingClientRect()
  const tooltipWidth = 220
  const tooltipHeight = hoveredGroupSize.value > 1 ? 104 : 88
  tooltipPosition.value = {
    left: Math.min(
      Math.max(8, event.clientX - surfaceRect.left + 12),
      Math.max(8, surfaceRect.width - tooltipWidth - 8),
    ),
    top: Math.min(
      Math.max(8, event.clientY - surfaceRect.top + 12),
      Math.max(8, surfaceRect.height - tooltipHeight - 8),
    ),
  }
}

const handlePointerUp = (event: PointerEvent) => {
  if (!dragState.value) return
  skipNextClick.value = dragState.value.moved
  dragState.value = null
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId)
  }
}

const handlePointerLeave = () => {
  if (dragState.value) return
  if (hoveredRouteId.value) {
    hoveredRouteId.value = null
    drawChart()
  }
  tooltipPosition.value = null
  hoveredPointKind.value = 'route'
}

const updateCanvasSize = (availableWidth: number) => {
  const width = Math.max(240, Math.round(availableWidth || props.width))
  const aspectRatio = props.height / props.width
  const height = Math.max(220, Math.min(430, Math.round(width * aspectRatio)))
  if (width === canvasSize.value.width && height === canvasSize.value.height) return
  canvasSize.value = { width, height }
  drawChart()
}

watch(() => [routeStore.paretoRoutes, routeStore.selectedRoute], drawChart, { deep: true })
watch(
  () => chartRoutes.value.map(route => `${route.id}:${route.cost.total}:${route.risk.overall}`).join('|'),
  resetView,
)
watch(() => [props.width, props.height], () => {
  updateCanvasSize(surfaceRef.value?.clientWidth || props.width)
})

onMounted(() => {
  if (surfaceRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(entries => {
      updateCanvasSize(entries[0]?.contentRect.width || props.width)
    })
    resizeObserver.observe(surfaceRef.value)
  } else {
    updateCanvasSize(props.width)
  }
  drawChart()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div class="w-full">
    <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div class="flex min-h-10 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-1.5">
        <div class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600" aria-label="图例">
          <span class="inline-flex items-center gap-1.5">
            <span class="relative h-3 w-5" aria-hidden="true">
              <span class="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-teal-700"></span>
              <span class="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-teal-700"></span>
            </span>
            Pareto 前沿
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full border-2 border-slate-400 bg-white" aria-hidden="true"></span>
            其他方案
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" aria-hidden="true"></span>
            当前选中
          </span>
        </div>

        <div class="flex shrink-0 items-center" aria-label="图表缩放">
          <span v-if="zoomLevel > 1" class="hidden w-11 text-center text-[10px] tabular-nums text-slate-500 sm:block">
            {{ Math.round(zoomLevel * 100) }}%
          </span>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:bg-white hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="围绕当前方案放大"
            aria-label="围绕当前方案放大 Pareto 图"
            :disabled="!hasChartData || zoomLevel >= 20"
            @click="zoomIn"
          >
            <ZoomIn class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:bg-white hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="缩小"
            aria-label="缩小 Pareto 图"
            :disabled="!hasChartData || zoomLevel <= 1"
            @click="zoomOut"
          >
            <ZoomOut class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:bg-white hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-35"
            title="适配全部方案"
            aria-label="适配全部 Pareto 方案"
            :disabled="!hasChartData || zoomLevel <= 1"
            @click="resetView"
          >
            <RotateCcw class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref="surfaceRef" class="relative w-full overflow-hidden bg-white">
        <canvas
          ref="canvasRef"
          class="block h-auto w-full select-none touch-none"
          :class="hasChartData ? (zoomLevel > 1 ? (dragState ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer') : 'cursor-default'"
          :style="{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }"
          role="img"
          :aria-label="canvasAriaLabel"
          @click="handleClick"
          @wheel="handleWheel"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerUp"
          @pointerleave="handlePointerLeave"
        />
        <div
          v-if="hoveredRoute && tooltipPosition"
          class="pointer-events-none absolute z-20 w-[220px] max-w-[calc(100%_-_1rem)] rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-xl"
          :style="{ left: `${tooltipPosition.left}px`, top: `${tooltipPosition.top}px` }"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <span class="min-w-0 truncate font-semibold text-slate-900">{{ hoveredRoute.name }}</span>
            <span v-if="hoveredPointKind === 'edge'" class="shrink-0 text-[10px] text-slate-500">当前视图外</span>
          </div>
          <div class="flex items-center justify-between gap-4"><span>总成本</span><span class="font-medium text-slate-900">{{ compactFormatter.format(hoveredRoute.cost.total) }}</span></div>
          <div class="mt-1 flex items-center justify-between gap-4"><span>综合风险</span><span class="font-medium text-slate-900">{{ formatRisk(hoveredRoute.risk.overall) }}</span></div>
          <div class="mt-2 border-t border-slate-100 pt-2 font-medium" :class="paretoFrontIds.has(hoveredRoute.id) ? 'text-teal-700' : 'text-slate-500'">
            {{ paretoFrontIds.has(hoveredRoute.id) ? 'Pareto 前沿方案' : '被其他方案支配' }}
            <span v-if="hoveredGroupSize > 1"> · 同指标 {{ hoveredGroupSize }} 个</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
