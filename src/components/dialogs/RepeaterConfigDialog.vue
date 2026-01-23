<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Button } from '@/components/ui'
import { useAppStore, useRPLStore, useSettingsStore, useRouteStore } from '@/stores'
import { 
  X, Save, Plus, Trash2, MoveVertical, AlertTriangle, CheckCircle, RotateCcw, Radio 
} from 'lucide-vue-next'

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

// 从器件库获取中继器类型选项
const repeaterTypeOptions = computed(() =>
  settingsStore.settings.repeaterTypes.map(r => ({
    value: r.id,
    label: r.name
  }))
)

// 当前选中的中继器类型
const selectedRepeaterTypeId = ref('std')

// 获取当前选中的中继器类型信息
const currentRepeaterType = computed(() => 
  settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterTypeId.value) ||
  settingsStore.settings.repeaterTypes[0]
)

// 生成中继器名称（器件库名称 + 序号）
function generateRepeaterName(index: number): string {
  const typeName = currentRepeaterType.value?.name || '中继器'
  return `${typeName}-${String(index + 1).padStart(2, '0')}`
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

const typeOptions = [
  { value: 'amplifier_e', label: '放大器东' },
  { value: 'amplifier_w', label: '放大器西' }
]

const repeaters = ref<RepeaterConfig[]>([])
const selectedRepeaterId = ref<string | null>(null)

// 从器件库获取中继器型号选项
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

// 初始化时基于路由数据生成中继器（如果有路由数据）
function initRepeatersFromRoute() {
  const routeData = rplStore.currentTable?.records
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  
  if (!routeData || routeData.length < 2 || totalLength === 0) {
    // 没有路由数据，显示空列表
    repeaters.value = []
    return
  }
  
  // 基于路由自动生成中继器
  autoOptimize()
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
  const routeData = rplStore.currentTable?.records
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  
  if (!routeData || routeData.length < 2 || totalLength === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据（RPL）' })
    return
  }
  
  const lastRep = repeaters.value[repeaters.value.length - 1]
  const newKP = lastRep ? lastRep.kp + recommendedSpacing.value : recommendedSpacing.value
  
  // 检查是否超出总长度
  if (newKP >= totalLength) {
    appStore.showNotification({ type: 'warning', message: `KP ${newKP.toFixed(1)}km 已超过路由总长 ${totalLength.toFixed(1)}km` })
    return
  }
  
  const position = interpolateRoutePosition(routeData, newKP)
  
  const repType = currentRepeaterType.value
  repeaters.value.push({
    id: `rep-${Date.now()}`,
    index: repeaters.value.length,
    name: generateRepeaterName(repeaters.value.length),
    type: repeaters.value.length % 2 === 0 ? 'amplifier_e' : 'amplifier_w',
    kp: Math.round(newKP * 10) / 10,
    longitude: Math.round(position.longitude * 10000) / 10000,
    latitude: Math.round(position.latitude * 10000) / 10000,
    depth: Math.round(position.depth),
    spacing: repType?.maxSpan || recommendedSpacing.value,
    model: repType?.name || '标准中继器',
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

function autoOptimize() {
  // 从 RPL 获取路由数据
  const routeData = rplStore.currentTable?.records
  const totalLength = rplStore.currentTable?.metadata?.totalLength ?? 0
  
  if (!routeData || routeData.length < 2 || totalLength === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据（RPL）' })
    return
  }
  
  const currentRoute = routeStore.selectedRoute
  const spacing = recommendedSpacing.value
  repeaters.value = []
  let repeaterIndex = 0
  
  // 检查是否有分支结构
  if (currentRoute && currentRoute.points) {
    // 计算主干线长度
    let mainTrunkLength = 0
    for (let i = 1; i < currentRoute.points.length; i++) {
      mainTrunkLength += calculateDistance(
        currentRoute.points[i - 1].coordinates,
        currentRoute.points[i].coordinates
      )
    }
    
    // 主干线上的中继器
    const mainCount = Math.max(1, Math.round(mainTrunkLength / spacing) - 1)
    const mainSpacing = mainTrunkLength / (mainCount + 1)
    
    for (let i = 0; i < mainCount; i++) {
      const targetKp = (i + 1) * mainSpacing
      const position = interpolateOnMainTrunk(buildFullRouteData(currentRoute.points), targetKp)
      
      const repType = currentRepeaterType.value
      repeaters.value.push({
        id: `rep-${repeaterIndex}`,
        index: repeaterIndex,
        name: generateRepeaterName(repeaterIndex),
        type: repeaterIndex % 2 === 0 ? 'amplifier_e' : 'amplifier_w',
        kp: Math.round(targetKp * 10) / 10,
        longitude: Math.round(position.longitude * 10000) / 10000,
        latitude: Math.round(position.latitude * 10000) / 10000,
        depth: Math.round(position.depth),
        spacing: mainSpacing,
        model: repType?.name || '标准中继器',
        gain: repType?.gain || 15,
        powerConsumption: repType?.powerConsumption || 45,
        remarks: '',
      })
      repeaterIndex++
    }
    
    // 每条分支线上的中继器
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
        
        // 分支线上需要的中继器数量
        const branchCount = Math.floor(branchLength / spacing)
        
        for (let j = 1; j <= branchCount; j++) {
          const distanceFromBU = j * spacing
          if (distanceFromBU >= branchLength) break
          
          const ratio = distanceFromBU / branchLength
          const lon = buCoord[0] + (branchEndCoord[0] - buCoord[0]) * ratio
          const lat = buCoord[1] + (branchEndCoord[1] - buCoord[1]) * ratio
          
          // 分支线上的 KP = 分支器 KP + 分支线上的距离
          const branchKp = buKp + distanceFromBU
          
          const repType = currentRepeaterType.value
          repeaters.value.push({
            id: `rep-branch-${point.id}-${j}`,
            index: repeaterIndex,
            name: `${generateRepeaterName(repeaterIndex)}[分支]`,
            type: repeaterIndex % 2 === 0 ? 'amplifier_e' : 'amplifier_w',
            kp: Math.round(branchKp * 10) / 10,
            longitude: Math.round(lon * 10000) / 10000,
            latitude: Math.round(lat * 10000) / 10000,
            depth: 3000,
            spacing: spacing,
            model: repType?.name || '标准中继器',
            gain: repType?.gain || 15,
            powerConsumption: repType?.powerConsumption || 45,
            remarks: `分支线: ${point.name} → ${point.branchTo.name}`,
          })
          repeaterIndex++
        }
      }
    }
    
    recalculateSpacing()
    const branchRepeaterCount = repeaterIndex - mainCount
    appStore.showNotification({ 
      type: 'success', 
      message: `已优化: 主干线 ${mainCount} 个, 分支线 ${branchRepeaterCount} 个中继器` 
    })
    return
  }
  
  // 无分支结构，使用原来的逻辑
  const optimalCount = Math.max(1, Math.round(totalLength / spacing) - 1)
  const optimalSpacing = totalLength / (optimalCount + 1)
  
  for (let i = 0; i < optimalCount; i++) {
    const targetKp = (i + 1) * optimalSpacing
    const position = interpolateRoutePosition(routeData, targetKp)
    
    const repType = currentRepeaterType.value
    repeaters.value.push({
      id: `rep-${i}`,
      index: i,
      name: generateRepeaterName(i),
      type: i % 2 === 0 ? 'amplifier_e' : 'amplifier_w',
      kp: Math.round(targetKp * 10) / 10,
      longitude: Math.round(position.longitude * 10000) / 10000,
      latitude: Math.round(position.latitude * 10000) / 10000,
      depth: Math.round(position.depth),
      spacing: optimalSpacing,
      model: repType?.name || '标准中继器',
      gain: repType?.gain || 15,
      powerConsumption: repType?.powerConsumption || 45,
      remarks: '',
    })
  }
  recalculateSpacing()
  appStore.showNotification({ type: 'success', message: `已优化为 ${optimalCount} 个中继器，平均间距 ${optimalSpacing.toFixed(1)}km` })
}

// 根据 KP 插值计算路由位置
function interpolateRoutePosition(routeData: any[], targetKp: number): { longitude: number; latitude: number; depth: number; isBranch?: boolean; branchId?: string } {
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

const hasSpacingWarning = (spacing: number) => spacing > maxSpacing.value
const hasSpacingError = (spacing: number) => spacing > maxSpacing.value * 1.2

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
    initRepeatersFromRoute()
  }
}, { immediate: true })

function handleSave() {
  emit('saved', repeaters.value)
  appStore.showNotification({ type: 'success', message: '中继器配置已保存' })
  emit('close')
}

function handleClose() {
  emit('close')
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
            <h3 class="text-sm font-bold text-gray-800">中继器位置配置</h3>
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
            <Button variant="outline" size="sm" @click="autoOptimize">
              <RotateCcw class="w-4 h-4 mr-1" />
              简单优化
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
            <div class="text-xs text-gray-500">中继器数量</div>
          </div>
          <div class="text-center">
            <div class="font-bold text-green-600">{{ avgSpacing.toFixed(1) }}</div>
            <div class="text-xs text-gray-500">平均间距(km)</div>
          </div>
          <div class="text-center">
            <div :class="['font-bold', hasSpacingWarning(maxSpacingValue) ? 'text-orange-600' : 'text-gray-600']">
              {{ maxSpacingValue.toFixed(1) }}
            </div>
            <div class="text-xs text-gray-500">最大间距(km)</div>
          </div>
          <div class="text-center">
            <div class="font-bold text-purple-600">{{ totalPower }}</div>
            <div class="text-xs text-gray-500">总功耗(W)</div>
          </div>
        </div>

        <!-- 推荐提示 -->
        <div class="px-4 py-2 bg-blue-50 border-b text-xs text-blue-700 flex items-center gap-2">
          <AlertTriangle class="w-4 h-4" />
          推荐中继器间距: {{ recommendedSpacing }}km，最大不超过 {{ maxSpacing }}km
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
                    hasSpacingError(rep.spacing) ? 'text-red-600 font-bold' : 
                    hasSpacingWarning(rep.spacing) ? 'text-orange-600' : 'text-gray-700'
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
                  <span v-if="hasSpacingError(rep.spacing)" class="text-xs text-red-600 flex items-center justify-center gap-1">
                    <AlertTriangle class="w-3 h-3" />
                    超限
                  </span>
                  <span v-else-if="hasSpacingWarning(rep.spacing)" class="text-xs text-orange-600 flex items-center justify-center gap-1">
                    <AlertTriangle class="w-3 h-3" />
                    警告
                  </span>
                  <span v-else class="text-xs text-green-600 flex items-center justify-center gap-1">
                    <CheckCircle class="w-3 h-3" />
                    正常
                  </span>
                </td>
                <td class="px-3 py-2 text-center border-b">
                  <div class="flex items-center justify-center gap-1">
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
                    <div class="text-xs">中继器位置将基于路由数据自动计算</div>
                  </div>
                  <div v-else>
                    点击"简单优化"自动生成，或点击"添加"手动添加
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- 底部按钮 -->
        <div class="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <span class="text-xs text-gray-500">
            共 {{ repeaters.length }} 个中继器
            <span v-if="repeaters.some(r => hasSpacingWarning(r.spacing))" class="text-orange-600 ml-2">
              | 存在间距超标的中继器
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
</template>
