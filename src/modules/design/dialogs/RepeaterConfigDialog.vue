﻿<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { Button } from '@/shared/components/base'
import { useAppStore, useRPLStore, useSettingsStore, useRouteStore } from '@/stores'
import { repeaterPlacementService } from '@/services'
import type { RoutePoint } from '@/types'
import type { ComponentModelParamsConfig } from '@/types/useFile'
import { 
  X, Save, Plus, Trash2, MoveVertical, AlertTriangle, CheckCircle, RotateCcw, Radio, Cpu 
} from 'lucide-vue-next'
import ModelParamsDrawer from '@/shared/components/forms/ModelParamsDrawer.vue'
import { useDerivedDevice, isDerivedInstance } from '@/composables'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', repeaters: RepeaterConfig[]): void
}>()

const appStore = useAppStore()
const rplStore = useRPLStore()
const settingsStore = useSettingsStore()
const routeStore = useRouteStore()
const { createDerivedComponent } = useDerivedDevice()

// 模型参数抽屉状态
const showModelParamsDrawer = ref(false)
const currentEditingRepeater = ref<RepeaterConfig | null>(null)

// 从器件库获取放大器类型选项
const repeaterTypeOptions = computed(() =>
  settingsStore.settings.repeaterTypes.map(r => ({
    value: r.id,
    label: r.name
  }))
)

// 当前选中的放大器类型
const selectedRepeaterTypeId = ref('std')

// 获取当前选中的放大器类型信息
const currentRepeaterType = computed(() => 
  settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterTypeId.value) ||
  settingsStore.settings.repeaterTypes[0]
)

// 从器件库获取放大器类型选项
const amplifierTypes = computed(() => settingsStore.amplifierTypes || [])

// 检查器件库是否有放大器
const hasAmplifierInLibrary = computed(() => amplifierTypes.value.length > 0)

// 生成放大器名称（从器件库获取放大器名称）
function generateRepeaterName(index: number, type?: 'amplifier_e' | 'amplifier_w'): string {
  const deviceType = type || (index % 2 === 0 ? 'amplifier_e' : 'amplifier_w')
  
  // 从器件库获取放大器名称
  const amps = amplifierTypes.value
  if (amps.length === 0) {
    // 器件库为空，使用默认名称
    const fallbackName = deviceType === 'amplifier_e' ? '放大器东' : '放大器西'
    return `${fallbackName}-${String(index + 1).padStart(2, '0')}`
  }
  
  // 使用器件库中的放大器名称，交替使用（如果有多个）
  const ampIndex = deviceType === 'amplifier_e' ? 0 : (amps.length > 1 ? 1 : 0)
  const ampName = amps[ampIndex].name
  const direction = deviceType === 'amplifier_e' ? '东' : '西'
  
  return `${ampName}-${direction}-${String(index + 1).padStart(2, '0')}`
}

function normalizeConstraints(updateInputs = false) {
  let minSpacing = Number(minSpacingConstraint.value) || 0
  let maxSpacing = Number(maxSpacingConstraint.value) || 0
  let maxSlope = Number(maxSlopeConstraint.value) || 0
  let depthMin = Number(depthMinConstraint.value) || 0
  let depthMax = Number(depthMaxConstraint.value) || 0

  if (minSpacing <= 0) minSpacing = 1
  if (maxSpacing <= 0) maxSpacing = minSpacing
  if (minSpacing > maxSpacing) [minSpacing, maxSpacing] = [maxSpacing, minSpacing]
  if (maxSlope <= 0) maxSlope = 15
  if (depthMin > depthMax) [depthMin, depthMax] = [depthMax, depthMin]

  if (updateInputs) {
    minSpacingConstraint.value = Math.round(minSpacing * 10) / 10
    maxSpacingConstraint.value = Math.round(maxSpacing * 10) / 10
    maxSlopeConstraint.value = Math.round(maxSlope * 10) / 10
    depthMinConstraint.value = Math.round(depthMin)
    depthMaxConstraint.value = Math.round(depthMax)
  }

  return { minSpacing, maxSpacing, maxSlope, depthMin, depthMax }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function buildRoutePointsFromRPL(): RoutePoint[] {
  const records = rplStore.currentTable?.records || []
  return records.map((rec, index) => ({
    id: rec.id || `rpl-${index}`,
    coordinates: [rec.longitude, rec.latitude],
    type: rec.pointType === 'landing'
      ? 'landing'
      : rec.pointType === 'branching'
        ? 'branching'
        : rec.pointType === 'repeater'
          ? 'repeater'
          : 'waypoint',
    name: rec.remarks || undefined,
    depth: rec.depth
  }))
}

function buildTerrainFromRoutePoints(points: RoutePoint[]) {
  const terrain: Array<{ kp: number; longitude: number; latitude: number; depth: number; slope: number }> = []
  let kp = 0
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    let slope = 0
    if (i > 0) {
      const prev = points[i - 1]
      const distance = calculateDistance(prev.coordinates, point.coordinates)
      kp += distance
      const prevDepth = prev.depth ?? 3000
      const pointDepth = point.depth ?? 3000
      const depthDiff = Math.abs(pointDepth - prevDepth)
      slope = distance > 0 ? Math.atan(depthDiff / (distance * 1000)) * (180 / Math.PI) : 0
    }
    terrain.push({
      kp,
      longitude: point.coordinates[0],
      latitude: point.coordinates[1],
      depth: point.depth ?? 3000,
      slope
    })
  }
  return terrain
}

function buildTerrainFromRPL() {
  const records = rplStore.currentTable?.records || []
  return records.map((rec, index) => {
    if (index === 0) {
      return {
        kp: rec.kp,
        longitude: rec.longitude,
        latitude: rec.latitude,
        depth: rec.depth,
        slope: 0
      }
    }
    const prev = records[index - 1]
    const distance = calculateDistance([prev.longitude, prev.latitude], [rec.longitude, rec.latitude])
    const depthDiff = Math.abs(rec.depth - prev.depth)
    const slope = distance > 0 ? Math.atan(depthDiff / (distance * 1000)) * (180 / Math.PI) : 0
    return {
      kp: rec.kp,
      longitude: rec.longitude,
      latitude: rec.latitude,
      depth: rec.depth,
      slope
    }
  })
}

function getPlacementContext() {
  const currentRoute = routeStore.selectedRoute
  if (currentRoute?.points && currentRoute.points.length > 1) {
    return {
      routePoints: currentRoute.points,
      terrain: buildTerrainFromRoutePoints(currentRoute.points)
    }
  }
  const records = rplStore.currentTable?.records || []
  if (records.length < 2) return null
  return {
    routePoints: buildRoutePointsFromRPL(),
    terrain: buildTerrainFromRPL()
  }
}

function getRouteTotalLength() {
  const currentRoute = routeStore.selectedRoute
  if (currentRoute?.points && currentRoute.points.length > 1) {
    let total = 0
    for (let i = 1; i < currentRoute.points.length; i++) {
      total += calculateDistance(
        currentRoute.points[i - 1].coordinates,
        currentRoute.points[i].coordinates
      )
    }
    return total
  }
  return rplStore.currentTable?.metadata?.totalLength ?? 0
}

function getAutoTargetSpacing(minSpacing: number, maxSpacing: number) {
  if (placementObjective.value === 'min_count') return maxSpacing
  if (placementObjective.value === 'terrain') return minSpacing
  return (minSpacing + maxSpacing) / 2
}

function applyPlacementStrategy() {
  if (placementStrategy.value === 'auto') {
    autoOptimizeWithConstraints()
  } else {
    generateFixedSpacing()
  }
}

interface RepeaterConfig {
  id: string
  index: number
  name: string
  type: 'amplifier_e' | 'amplifier_w'
  kp: number
  longitude: number
  latitude: number
  depth: number
  spacing: number
  model: string
  gain: number
  powerConsumption: number
  remarks: string
}

// 动态生成类型选项（从器件库获取放大器名称）
const typeOptions = computed(() => {
  const amps = amplifierTypes.value
  if (amps.length === 0) {
    return [
      { value: 'amplifier_e', label: '放大器东' },
      { value: 'amplifier_w', label: '放大器西' }
    ]
  }
  // 使用器件库中的放大器名称
  const eastName = amps[0].name
  const westName = amps.length > 1 ? amps[1].name : amps[0].name
  return [
    { value: 'amplifier_e', label: `${eastName}-东` },
    { value: 'amplifier_w', label: `${westName}-西` }
  ]
})

const repeaters = ref<RepeaterConfig[]>([])
const selectedRepeaterId = ref<string | null>(null)

// 从器件库获取放大器型号选项
const modelOptions = computed(() => 
  settingsStore.settings.repeaterTypes.map(r => ({
    value: r.name,
    label: `${r.name} (${r.maxSpan}km)`
  }))
)

// 从器件库获取间距配置
const recommendedSpacing = computed(() => currentRepeaterType.value?.maxSpan || 80)
const maxSpacing = computed(() => {
  // 最大间距为推荐间距的1.5倍
  return Math.round((currentRepeaterType.value?.maxSpan || 80) * 1.5)
})

type PlacementStrategy = 'auto' | 'fixed'
type PlacementObjective = 'balanced' | 'min_count' | 'terrain'

const placementStrategy = ref<PlacementStrategy>('auto')
const placementObjective = ref<PlacementObjective>('balanced')
const fixedSpacing = ref(recommendedSpacing.value)
const minSpacingConstraint = ref(Math.max(1, Math.round(recommendedSpacing.value * 0.8)))
const maxSpacingConstraint = ref(Math.max(minSpacingConstraint.value, maxSpacing.value))
const maxSlopeConstraint = ref(15)
const depthMinConstraint = ref(1000)
const depthMaxConstraint = ref(5000)

const normalizedMinSpacing = computed(() => {
  const min = Number(minSpacingConstraint.value) || 0
  return min > 0 ? min : 1
})
const normalizedMaxSpacing = computed(() => {
  const max = Number(maxSpacingConstraint.value) || 0
  return Math.max(max, normalizedMinSpacing.value)
})
const placementActionLabel = computed(() =>
  placementStrategy.value === 'auto' ? '自动优化' : '按间距生成'
)

// 初始化时基于路由数据生成放大器（如果有路由数据）
function initRepeatersFromRoute() {
  const routeData = rplStore.currentTable?.records ?? []
  const totalLength = getRouteTotalLength()
  const hasRoutePoints = !!(routeStore.selectedRoute?.points && routeStore.selectedRoute.points.length > 1)
  const hasRplPoints = !!(routeData && routeData.length > 1)
  
  if ((!hasRoutePoints && !hasRplPoints) || totalLength === 0) {
    // 没有路由数据，显示空列表
    repeaters.value = []
    return
  }
  
  // 基于路由自动生成放大器
  applyPlacementStrategy()
}

function recalculateSpacing() {
  repeaters.value.sort((a, b) => a.kp - b.kp)
  let prevKP = 0
  repeaters.value.forEach((rep, index) => {
    rep.index = index
    rep.spacing = rep.kp - prevKP
    prevKP = rep.kp
  })
}

function addRepeater() {
  // 检查器件库是否有放大器
  if (!hasAmplifierInLibrary.value) {
    appStore.showNotification({ type: 'warning', message: '请先在器件库中上传放大器类型' })
    return
  }
  
  const routeData = rplStore.currentTable?.records ?? []
  const totalLength = getRouteTotalLength()
  const hasRoutePoints = !!(routeStore.selectedRoute?.points && routeStore.selectedRoute.points.length > 1)
  const hasRplPoints = !!(routeData && routeData.length > 1)
  
  if ((!hasRoutePoints && !hasRplPoints) || totalLength === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据' })
    return
  }
  
  const { minSpacing, maxSpacing } = normalizeConstraints()
  const spacingInput = Number(fixedSpacing.value) || recommendedSpacing.value
  const spacing = clampNumber(spacingInput, minSpacing, maxSpacing)
  if (spacing !== spacingInput) {
    fixedSpacing.value = Math.round(spacing * 10) / 10
  }
  const lastRep = repeaters.value[repeaters.value.length - 1]
  const newKP = lastRep ? lastRep.kp + spacing : spacing
  
  // 检查是否超出总长度
  if (newKP >= totalLength) {
    appStore.showNotification({ type: 'warning', message: `KP ${newKP.toFixed(1)}km 已超过路由总长 ${totalLength.toFixed(1)}km` })
    return
  }
  
  const position = interpolateRoutePosition(routeData, newKP)
  
  const repType = currentRepeaterType.value
  const newType = repeaters.value.length % 2 === 0 ? 'amplifier_e' : 'amplifier_w'
  repeaters.value.push({
    id: `rep-${Date.now()}`,
    index: repeaters.value.length,
    name: generateRepeaterName(repeaters.value.length, newType),
    type: newType,
    kp: Math.round(newKP * 10) / 10,
    longitude: Math.round(position.longitude * 10000) / 10000,
    latitude: Math.round(position.latitude * 10000) / 10000,
    depth: Math.round(position.depth),
    spacing: spacing,
    model: repType?.name || '标准放大器',
    gain: repType?.gain || 15,
    powerConsumption: repType?.powerConsumption || 45,
    remarks: '',
  })
  recalculateSpacing()
}

function deleteRepeater(repId: string) {
  repeaters.value = repeaters.value.filter(r => r.id !== repId)
  recalculateSpacing()
}

function autoOptimizeWithConstraints() {
  if (!hasAmplifierInLibrary.value) {
    appStore.showNotification({ type: 'warning', message: '请先在器件库中上传放大器类型' })
    return
  }

  const context = getPlacementContext()
  if (!context) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据' })
    return
  }

  const { minSpacing, maxSpacing, maxSlope, depthMin, depthMax } = normalizeConstraints(true)
  const targetSpacing = getAutoTargetSpacing(minSpacing, maxSpacing)

  repeaterPlacementService.setConfig({
    targetSpacing,
    minSpacing,
    maxSpacing,
    maxSlope,
    preferredDepthRange: { min: depthMin, max: depthMax },
  })

  const result = repeaterPlacementService.calculatePlacements(
    context.routePoints,
    context.terrain
  )

  const repType = currentRepeaterType.value
  repeaters.value = result.locations.map((loc, index) => {
    const newType = index % 2 === 0 ? 'amplifier_e' : 'amplifier_w'
    return {
      id: `rep-${Date.now()}-${index}`,
      index,
      name: generateRepeaterName(index, newType),
      type: newType,
      kp: Math.round(loc.kp * 10) / 10,
      longitude: Math.round(loc.longitude * 10000) / 10000,
      latitude: Math.round(loc.latitude * 10000) / 10000,
      depth: Math.round(loc.depth),
      spacing: 0,
      model: repType?.name || '标准放大器',
      gain: repType?.gain || 15,
      powerConsumption: repType?.powerConsumption || 45,
      remarks: loc.adjustmentReason ? `优化: ${loc.adjustmentReason}` : '',
    }
  })

  recalculateSpacing()

  if (!result.feasibility.isValid) {
    appStore.showNotification({ 
      type: 'warning', 
      message: `自动优化完成，但存在约束问题：${result.feasibility.issues[0]}` 
    })
  } else if (result.feasibility.warnings.length > 0) {
    appStore.showNotification({ 
      type: 'info', 
      message: `自动优化完成（${result.totalCount} 个放大器），存在 ${result.feasibility.warnings.length} 项提示` 
    })
  } else {
    appStore.showNotification({ 
      type: 'success', 
      message: `已自动优化 ${result.totalCount} 个放大器，调整 ${result.adjustedCount} 个` 
    })
  }
}

function generateFixedSpacing() {
  if (!hasAmplifierInLibrary.value) {
    appStore.showNotification({ type: 'warning', message: '请先在器件库中上传放大器类型' })
    return
  }

  const routeData = rplStore.currentTable?.records ?? []
  const totalLength = getRouteTotalLength()

  const hasRoutePoints = !!(routeStore.selectedRoute?.points && routeStore.selectedRoute.points.length > 1)
  const hasRplPoints = !!(routeData && routeData.length > 1)

  if ((!hasRoutePoints && !hasRplPoints) || totalLength === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据' })
    return
  }

  const { minSpacing, maxSpacing } = normalizeConstraints(true)
  const spacingInput = Number(fixedSpacing.value) || recommendedSpacing.value
  const spacing = clampNumber(spacingInput, minSpacing, maxSpacing)
  if (spacing !== spacingInput) {
    fixedSpacing.value = Math.round(spacing * 10) / 10
    appStore.showNotification({ type: 'info', message: `固定间距已调整为 ${spacing.toFixed(1)}km 以满足约束` })
  }

  const currentRoute = routeStore.selectedRoute
  repeaters.value = []
  let repeaterIndex = 0

  if (currentRoute && currentRoute.points && currentRoute.points.length > 1) {
    const mainRouteData = buildFullRouteData(currentRoute.points)
    const mainTrunkLength = mainRouteData.length > 0 ? mainRouteData[mainRouteData.length - 1].kp : 0

    for (let targetKp = spacing; targetKp < mainTrunkLength; targetKp += spacing) {
      const position = interpolateOnMainTrunk(mainRouteData, targetKp)
      const repType = currentRepeaterType.value
      const newType = repeaterIndex % 2 === 0 ? 'amplifier_e' : 'amplifier_w'
      repeaters.value.push({
        id: `rep-${repeaterIndex}`,
        index: repeaterIndex,
        name: generateRepeaterName(repeaterIndex, newType),
        type: newType,
        kp: Math.round(targetKp * 10) / 10,
        longitude: Math.round(position.longitude * 10000) / 10000,
        latitude: Math.round(position.latitude * 10000) / 10000,
        depth: Math.round(position.depth),
        spacing: spacing,
        model: repType?.name || '标准放大器',
        gain: repType?.gain || 15,
        powerConsumption: repType?.powerConsumption || 45,
        remarks: '',
      })
      repeaterIndex++
    }

    // 每条分支线上的放大器（固定间距）
    let buKp = 0
    for (let i = 0; i < currentRoute.points.length; i++) {
      const point = currentRoute.points[i]
      if (i > 0) {
        buKp += calculateDistance(
          currentRoute.points[i - 1].coordinates,
          point.coordinates
        )
      }

      if (point.type === 'branching' && point.branchTo) {
        const buCoord = point.coordinates
        const branchEndCoord = point.branchTo.coord
        const branchLength = calculateDistance(buCoord, branchEndCoord)

        for (let distanceFromBU = spacing; distanceFromBU < branchLength; distanceFromBU += spacing) {
          const ratio = distanceFromBU / branchLength
          const lon = buCoord[0] + (branchEndCoord[0] - buCoord[0]) * ratio
          const lat = buCoord[1] + (branchEndCoord[1] - buCoord[1]) * ratio
          const branchKp = buKp + distanceFromBU

          const repType = currentRepeaterType.value
          const branchType = repeaterIndex % 2 === 0 ? 'amplifier_e' : 'amplifier_w'
          repeaters.value.push({
            id: `rep-branch-${point.id}-${repeaterIndex}`,
            index: repeaterIndex,
            name: `${generateRepeaterName(repeaterIndex, branchType)}[分支]`,
            type: branchType,
            kp: Math.round(branchKp * 10) / 10,
            longitude: Math.round(lon * 10000) / 10000,
            latitude: Math.round(lat * 10000) / 10000,
            depth: 3000,
            spacing: spacing,
            model: repType?.name || '标准放大器',
            gain: repType?.gain || 15,
            powerConsumption: repType?.powerConsumption || 45,
            remarks: `分支线: ${point.name} → ${point.branchTo.name}`,
          })
          repeaterIndex++
        }
      }
    }
  } else {
    for (let targetKp = spacing; targetKp < totalLength; targetKp += spacing) {
      const position = interpolateRoutePosition(routeData, targetKp)

      const repType = currentRepeaterType.value
      const simpleType = repeaterIndex % 2 === 0 ? 'amplifier_e' : 'amplifier_w'
      repeaters.value.push({
        id: `rep-${repeaterIndex}`,
        index: repeaterIndex,
        name: generateRepeaterName(repeaterIndex, simpleType),
        type: simpleType,
        kp: Math.round(targetKp * 10) / 10,
        longitude: Math.round(position.longitude * 10000) / 10000,
        latitude: Math.round(position.latitude * 10000) / 10000,
        depth: Math.round(position.depth),
        spacing: spacing,
        model: repType?.name || '标准放大器',
        gain: repType?.gain || 15,
        powerConsumption: repType?.powerConsumption || 45,
        remarks: '',
      })
      repeaterIndex++
    }
  }

  recalculateSpacing()
  const branchRepeaterCount = repeaters.value.filter(r => r.remarks?.includes('分支线')).length
  appStore.showNotification({ 
    type: 'success', 
    message: `已按固定间距 ${spacing.toFixed(1)}km 生成 ${repeaters.value.length} 个放大器${branchRepeaterCount ? `，分支线 ${branchRepeaterCount} 个` : ''}` 
  })
}

// 根据 KP 插值计算路由位置
function interpolateRoutePosition(routeData: any[] | undefined, targetKp: number): { longitude: number; latitude: number; depth: number; isBranch?: boolean; branchId?: string } {
  // 获取当前路由（包含分支信息）
  const currentRoute = routeStore.selectedRoute
  
  // 检查是否有分支结构
  if (currentRoute && currentRoute.points) {
    // 构建包含分支线的完整路由数据
    const fullRouteData = buildFullRouteData(currentRoute.points)
    
    // 先尝试在分支线上查找
    const branchResult = interpolateOnBranchLine(currentRoute.points, targetKp)
    if (branchResult) {
      return branchResult
    }
    
    // 否则在主干线上插值
    return interpolateOnMainTrunk(fullRouteData, targetKp)
  }
  
  // 回退到原来的逻辑（用 RPL 数据）
  const safeRouteData = routeData ?? []
  if (safeRouteData.length === 0) {
    return { longitude: 0, latitude: 0, depth: 3000 }
  }
  const sorted = [...safeRouteData].sort((a, b) => (a.kp || 0) - (b.kp || 0))
  
  let before = sorted[0]
  let after = sorted[sorted.length - 1]
  
  for (let i = 0; i < sorted.length - 1; i++) {
    if ((sorted[i].kp || 0) <= targetKp && (sorted[i + 1].kp || 0) >= targetKp) {
      before = sorted[i]
      after = sorted[i + 1]
      break
    }
  }
  
  const beforeKp = before.kp || 0
  const afterKp = after.kp || beforeKp + 1
  const ratio = afterKp === beforeKp ? 0 : (targetKp - beforeKp) / (afterKp - beforeKp)
  
  return {
    longitude: before.longitude + (after.longitude - before.longitude) * ratio,
    latitude: before.latitude + (after.latitude - before.latitude) * ratio,
    depth: (before.depth || 3000) + ((after.depth || 3000) - (before.depth || 3000)) * ratio
  }
}

// 构建包含分支线的完整路由数据
function buildFullRouteData(routePoints: any[]) {
  const result: Array<{ kp: number; longitude: number; latitude: number; depth: number; isBranch?: boolean }> = []
  let kp = 0
  
  // 主干线点
  for (let i = 0; i < routePoints.length; i++) {
    const point = routePoints[i]
    if (i > 0) {
      const prev = routePoints[i - 1]
      kp += calculateDistance(prev.coordinates, point.coordinates)
    }
    result.push({
      kp,
      longitude: point.coordinates[0],
      latitude: point.coordinates[1],
      depth: 3000,
      isBranch: false
    })
  }
  
  return result
}

// 在分支线上插值
function interpolateOnBranchLine(routePoints: any[], targetKp: number): { longitude: number; latitude: number; depth: number; isBranch: boolean; branchId: string } | null {
  // 计算每个分支器的 KP
  let kp = 0
  const branchingUnits: Array<{ point: any; kp: number }> = []
  
  for (let i = 0; i < routePoints.length; i++) {
    const point = routePoints[i]
    if (i > 0) {
      const prev = routePoints[i - 1]
      kp += calculateDistance(prev.coordinates, point.coordinates)
    }
    if (point.type === 'branching' && point.branchTo) {
      branchingUnits.push({ point, kp })
    }
  }
  
  // 检查 targetKp 是否落在某条分支线上
  for (const bu of branchingUnits) {
    const buCoord = bu.point.coordinates
    const branchEndCoord = bu.point.branchTo.coord
    const branchLength = calculateDistance(buCoord, branchEndCoord)
    
    // 分支线 KP 范围：从分支器 KP 到 分支器 KP + 分支线长度
    const branchStartKp = bu.kp
    const branchEndKp = bu.kp + branchLength
    
    if (targetKp > branchStartKp && targetKp < branchEndKp) {
      // 在这条分支线上
      const distanceFromBU = targetKp - branchStartKp
      const ratio = distanceFromBU / branchLength
      
      return {
        longitude: buCoord[0] + (branchEndCoord[0] - buCoord[0]) * ratio,
        latitude: buCoord[1] + (branchEndCoord[1] - buCoord[1]) * ratio,
        depth: 3000,
        isBranch: true,
        branchId: bu.point.id
      }
    }
  }
  
  return null
}

// 在主干线上插值
function interpolateOnMainTrunk(routeData: any[], targetKp: number): { longitude: number; latitude: number; depth: number } {
  const sorted = [...routeData].sort((a, b) => (a.kp || 0) - (b.kp || 0))
  
  let before = sorted[0]
  let after = sorted[sorted.length - 1]
  
  for (let i = 0; i < sorted.length - 1; i++) {
    if ((sorted[i].kp || 0) <= targetKp && (sorted[i + 1].kp || 0) >= targetKp) {
      before = sorted[i]
      after = sorted[i + 1]
      break
    }
  }
  
  const beforeKp = before.kp || 0
  const afterKp = after.kp || beforeKp + 1
  const ratio = afterKp === beforeKp ? 0 : (targetKp - beforeKp) / (afterKp - beforeKp)
  
  return {
    longitude: before.longitude + (after.longitude - before.longitude) * ratio,
    latitude: before.latitude + (after.latitude - before.latitude) * ratio,
    depth: (before.depth || 3000) + ((after.depth || 3000) - (before.depth || 3000)) * ratio
  }
}

// 计算两点间距离 (km)
function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371 // 地球半径 (km)
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function moveRepeater(repId: string, delta: number) {
  const rep = repeaters.value.find(r => r.id === repId)
  if (rep) {
    rep.kp = Math.max(0, rep.kp + delta)
    recalculateSpacing()
  }
}

const isSpacingAboveMax = (spacing: number) => spacing > normalizedMaxSpacing.value
const isSpacingBelowMin = (spacing: number) => spacing < normalizedMinSpacing.value

const totalRepeaters = computed(() => repeaters.value.length)
const avgSpacing = computed(() => {
  if (repeaters.value.length < 2) return 0
  const total = repeaters.value.reduce((sum, r) => sum + r.spacing, 0)
  return total / repeaters.value.length
})
const maxSpacingValue = computed(() => Math.max(...repeaters.value.map(r => r.spacing), 0))
const totalPower = computed(() => repeaters.value.reduce((sum, r) => sum + r.powerConsumption, 0))

watch(() => props.visible, (val) => {
  if (val && repeaters.value.length === 0) {
    // 基于路由数据初始化，不使用写死数据
    // 使用 nextTick 确保组件已完全挂载
    nextTick(() => {
      initRepeatersFromRoute()
    })
  }
})

function handleSave() {
  emit('saved', repeaters.value)
  appStore.showNotification({ type: 'success', message: '放大器配置已保存' })
  emit('close')
}

function handleClose() {
  emit('close')
}

// 打开模型参数配置抽屉
function openModelParams(rep: RepeaterConfig) {
  currentEditingRepeater.value = rep
  showModelParamsDrawer.value = true
}

// 获取 EDFA 支持的模型列表
function getEdfaSupportedModels(): string[] {
  // 从器件库获取，如果没有则使用默认
  const amps = amplifierTypes.value
  if (amps.length > 0 && (amps[0] as any).supported_models) {
    return (amps[0] as any).supported_models
  }
  return ['edfa_gain_model']
}

// 获取 EDFA 的模型参数
function getEdfaModelParams(): Record<string, ComponentModelParamsConfig> {
  const amps = amplifierTypes.value
  if (amps.length > 0 && (amps[0] as any).model_params) {
    return (amps[0] as any).model_params
  }
  return {}
}

// 保存模型参数
function handleModelParamsSave(params: Record<string, ComponentModelParamsConfig>) {
  if (!currentEditingRepeater.value) return
  
  // 在实际应用中，这里会创建派生实例并更新放大器的引用
  appStore.showNotification({ 
    type: 'success', 
    message: `已保存 ${currentEditingRepeater.value.name} 的模型参数` 
  })
  
  showModelParamsDrawer.value = false
  currentEditingRepeater.value = null
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/50" @click="handleClose" />
      
      <!-- 弹框 -->
      <div class="relative bg-white rounded-lg shadow-xl w-[900px] max-h-[85vh] flex flex-col">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div class="flex items-center gap-2">
            <Radio class="w-5 h-5 text-blue-600" />
            <h3 class="text-sm font-bold text-gray-800">放大器位置配置</h3>
          </div>
          <div class="flex items-center gap-2">
            <!-- 器件类型选择 -->
            <div class="flex items-center gap-1">
              <span class="text-xs text-gray-500">器件类型:</span>
              <select 
                v-model="selectedRepeaterTypeId"
                class="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
              >
                <option v-for="opt in repeaterTypeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <Button variant="outline" size="sm" @click="applyPlacementStrategy">
              <RotateCcw class="w-4 h-4 mr-1" />
              {{ placementActionLabel }}
            </Button>
            <Button variant="outline" size="sm" @click="addRepeater">
              <Plus class="w-4 h-4 mr-1" />
              添加
            </Button>
            <button class="p-1 hover:bg-gray-200 rounded ml-2" @click="handleClose">
              <X class="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
        
        <!-- 统计信息 -->
        <div class="px-4 py-3 bg-gray-50 border-b grid grid-cols-4 gap-4 text-sm">
          <div class="text-center">
            <div class="font-bold text-blue-600">{{ totalRepeaters }}</div>
            <div class="text-xs text-gray-500">放大器数量</div>
          </div>
          <div class="text-center">
            <div class="font-bold text-green-600">{{ avgSpacing.toFixed(1) }}</div>
            <div class="text-xs text-gray-500">平均间距(km)</div>
          </div>
          <div class="text-center">
            <div :class="['font-bold', isSpacingAboveMax(maxSpacingValue) ? 'text-orange-600' : 'text-gray-600']">
              {{ maxSpacingValue.toFixed(1) }}
            </div>
            <div class="text-xs text-gray-500">最大间距(km)</div>
          </div>
          <div class="text-center">
            <div class="font-bold text-purple-600">{{ totalPower }}</div>
            <div class="text-xs text-gray-500">总功耗(W)</div>
          </div>
        </div>

        <!-- 策略与约束 -->
        <div class="px-4 py-3 border-b bg-white text-xs text-gray-700">
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-gray-500">布设策略</span>
              <label class="flex items-center gap-1 cursor-pointer">
                <input v-model="placementStrategy" type="radio" class="accent-blue-500" value="auto" />
                自动优化
              </label>
              <label class="flex items-center gap-1 cursor-pointer">
                <input v-model="placementStrategy" type="radio" class="accent-blue-500" value="fixed" />
                固定间距
              </label>
            </div>
            <div v-if="placementStrategy === 'fixed'" class="flex items-center gap-2">
              <span class="text-gray-500">固定间距(km)</span>
              <input
                v-model.number="fixedSpacing"
                type="number"
                step="0.1"
                min="0.1"
                class="w-20 px-2 py-1 border border-gray-300 rounded bg-white"
              />
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-gray-500">优化目标</span>
              <select v-model="placementObjective" class="px-2 py-1 border border-gray-300 rounded bg-white">
                <option value="balanced">均衡</option>
                <option value="min_count">少放大器</option>
                <option value="terrain">地形优先</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500">最小间距(km)</span>
              <input
                v-model.number="minSpacingConstraint"
                type="number"
                step="0.1"
                min="0.1"
                class="w-20 px-2 py-1 border border-gray-300 rounded bg-white"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500">最大间距(km)</span>
              <input
                v-model.number="maxSpacingConstraint"
                type="number"
                step="0.1"
                min="0.1"
                class="w-20 px-2 py-1 border border-gray-300 rounded bg-white"
              />
            </div>
            <div v-if="placementStrategy === 'auto'" class="flex items-center gap-2">
              <span class="text-gray-500">最大坡度(°)</span>
              <input
                v-model.number="maxSlopeConstraint"
                type="number"
                step="0.1"
                min="0"
                class="w-20 px-2 py-1 border border-gray-300 rounded bg-white"
              />
            </div>
            <div v-if="placementStrategy === 'auto'" class="flex items-center gap-2">
              <span class="text-gray-500">优选水深(m)</span>
              <input
                v-model.number="depthMinConstraint"
                type="number"
                step="1"
                min="0"
                class="w-20 px-2 py-1 border border-gray-300 rounded bg-white"
              />
              <span class="text-gray-400">-</span>
              <input
                v-model.number="depthMaxConstraint"
                type="number"
                step="1"
                min="0"
                class="w-20 px-2 py-1 border border-gray-300 rounded bg-white"
              />
            </div>
          </div>
        </div>
        <!-- 推荐提示 -->
        <div class="px-4 py-2 bg-blue-50 border-b text-xs text-blue-700 flex flex-wrap items-center gap-2">
          <AlertTriangle class="w-4 h-4" />
          <span>器件推荐间距: {{ recommendedSpacing }}km</span>
          <span>约束间距: {{ normalizedMinSpacing }}-{{ normalizedMaxSpacing }}km</span>
          <span v-if="placementStrategy === 'auto'">
            坡度≤{{ maxSlopeConstraint }}°，水深 {{ depthMinConstraint }}-{{ depthMaxConstraint }}m
          </span>
        </div>
        
        <!-- 表格内容 -->
        <div class="flex-1 overflow-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th class="px-3 py-2 text-left border-b font-medium text-gray-600">名称</th>
                <th class="px-3 py-2 text-center w-24 border-b font-medium text-gray-600">类型</th>
                <th class="px-3 py-2 text-right w-24 border-b font-medium text-gray-600">KP(km)</th>
                <th class="px-3 py-2 text-right w-24 border-b font-medium text-gray-600">间距(km)</th>
                <th class="px-3 py-2 text-right w-20 border-b font-medium text-gray-600">水深(m)</th>
                <th class="px-3 py-2 text-center w-36 border-b font-medium text-gray-600">型号</th>
                <th class="px-3 py-2 text-center w-20 border-b font-medium text-gray-600">状态</th>
                <th class="px-3 py-2 text-center w-28 border-b font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="rep in repeaters"
                :key="rep.id"
                :class="[
                  'hover:bg-blue-50 transition-colors',
                  selectedRepeaterId === rep.id ? 'bg-blue-100' : ''
                ]"
                @click="selectedRepeaterId = rep.id"
              >
                <td class="px-3 py-2 border-b">
                  <input
                    v-model="rep.name"
                    type="text"
                    class="w-24 px-2 py-1 border border-gray-300 rounded text-sm font-medium"
                  />
                </td>
                <td class="px-3 py-2 text-center border-b">
                  <select 
                    v-model="rep.type"
                    class="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </td>
                <td class="px-3 py-2 text-right border-b font-mono">
                  <input
                    v-model.number="rep.kp"
                    type="number"
                    step="0.1"
                    class="w-20 px-2 py-1 text-right border border-gray-300 rounded text-sm"
                    @change="recalculateSpacing"
                  />
                </td>
                <td class="px-3 py-2 text-right border-b">
                  <span :class="[
                    'font-mono',
                    isSpacingAboveMax(rep.spacing) ? 'text-red-600 font-bold' : 
                    isSpacingBelowMin(rep.spacing) ? 'text-orange-600' : 'text-gray-700'
                  ]">
                    {{ rep.spacing.toFixed(1) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-right border-b text-gray-600">{{ rep.depth.toFixed(0) }}</td>
                <td class="px-3 py-2 text-center border-b">
                  <select 
                    v-model="rep.model"
                    class="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </td>
                <td class="px-3 py-2 text-center border-b">
                  <span v-if="isSpacingAboveMax(rep.spacing)" class="text-xs text-red-600 flex items-center justify-center gap-1">
                    <AlertTriangle class="w-3 h-3" />
                    过大
                  </span>
                  <span v-else-if="isSpacingBelowMin(rep.spacing)" class="text-xs text-orange-600 flex items-center justify-center gap-1">
                    <AlertTriangle class="w-3 h-3" />
                    过小
                  </span>
                  <span v-else class="text-xs text-green-600 flex items-center justify-center gap-1">
                    <CheckCircle class="w-3 h-3" />
                    正常
                  </span>
                </td>
                <td class="px-3 py-2 text-center border-b">
                  <div class="flex items-center justify-center gap-1">
                    <button 
                      class="p-1 hover:bg-purple-100 rounded" 
                      title="模型参数"
                      @click.stop="openModelParams(rep)"
                    >
                      <Cpu class="w-3.5 h-3.5 text-purple-500" />
                    </button>
                    <button 
                      class="p-1 hover:bg-gray-200 rounded" 
                      title="向前移动1km"
                      @click.stop="moveRepeater(rep.id, -1)"
                    >
                      <MoveVertical class="w-3.5 h-3.5 text-gray-500 rotate-90" />
                    </button>
                    <button 
                      class="p-1 hover:bg-gray-200 rounded" 
                      title="向后移动1km"
                      @click.stop="moveRepeater(rep.id, 1)"
                    >
                      <MoveVertical class="w-3.5 h-3.5 text-gray-500 -rotate-90" />
                    </button>
                    <button 
                      class="p-1 hover:bg-red-100 rounded" 
                      title="删除"
                      @click.stop="deleteRepeater(rep.id)"
                    >
                      <Trash2 class="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="repeaters.length === 0">
                <td colspan="8" class="px-4 py-8 text-center text-gray-400">
                  <div v-if="!rplStore.currentTable?.records?.length" class="space-y-2">
                    <div>请先导入路由数据（RPL）</div>
                    <div class="text-xs">放大器位置将基于路由数据自动计算</div>
                  </div>
                  <div v-else>
                    点击"{{ placementActionLabel }}"自动生成，或点击"添加"手动添加
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- 底部按钮 -->
        <div class="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <span class="text-xs text-gray-500">
            共 {{ repeaters.length }} 个放大器
            <span v-if="repeaters.some(r => isSpacingAboveMax(r.spacing) || isSpacingBelowMin(r.spacing))" class="text-orange-600 ml-2">
              | 存在间距不符合约束的放大器
            </span>
          </span>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="handleClose">
              取消
            </Button>
            <Button size="sm" class="bg-blue-600 hover:bg-blue-700 text-white" @click="handleSave">
              <Save class="w-4 h-4 mr-1" />
              保存配置
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
  
  <!-- 模型参数配置抽屉 -->
  <ModelParamsDrawer
    v-if="currentEditingRepeater"
    :visible="showModelParamsDrawer"
    domain="EDFA"
    :supported-models="getEdfaSupportedModels()"
    :model-params="getEdfaModelParams()"
    :device-name="currentEditingRepeater.name"
    @close="showModelParamsDrawer = false; currentEditingRepeater = null"
    @save="handleModelParamsSave"
  />
</template>
