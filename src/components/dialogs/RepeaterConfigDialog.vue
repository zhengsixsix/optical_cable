<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Button } from '@/components/ui'
import { useAppStore, useRPLStore } from '@/stores'
import { mockRepeaterConfigs, repeaterModelOptions, repeaterSpacingConfig } from '@/data/mockData'
import { repeaterPlacementService, type PlacementConfig } from '@/services/RepeaterPlacementService'
import { 
  X, Save, Plus, Trash2, MoveVertical, AlertTriangle, CheckCircle, RotateCcw, Radio, Zap, Map, Settings 
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

// 智能落位配置
const placementConfig = ref<Partial<PlacementConfig>>({
  targetSpacing: 80,
  minSpacing: 60,
  maxSpacing: 100,
  maxSlope: 15,
  searchRadius: 5
})

// 显示智能落位面板
const showPlacementPanel = ref(false)

interface RepeaterConfig {
  id: string
  index: number
  name: string
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

const repeaters = ref<RepeaterConfig[]>([])
const selectedRepeaterId = ref<string | null>(null)

const modelOptions = repeaterModelOptions
const recommendedSpacing = repeaterSpacingConfig.recommended
const maxSpacing = repeaterSpacingConfig.max

function generateMockRepeaters() {
  let prevKP = 0
  repeaters.value = mockRepeaterConfigs.map((cfg, i) => {
    const spacing = cfg.kp - prevKP
    prevKP = cfg.kp
    return {
      id: `rep-${i}`,
      index: i,
      name: cfg.name,
      kp: cfg.kp,
      longitude: cfg.longitude,
      latitude: cfg.latitude,
      depth: cfg.depth,
      spacing,
      model: cfg.model,
      gain: cfg.gain,
      powerConsumption: cfg.powerConsumption,
      remarks: '',
    }
  })
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
  const lastRep = repeaters.value[repeaters.value.length - 1]
  const newKP = lastRep ? lastRep.kp + recommendedSpacing : recommendedSpacing
  
  repeaters.value.push({
    id: `rep-${Date.now()}`,
    index: repeaters.value.length,
    name: `REP-${String(repeaters.value.length + 1).padStart(2, '0')}`,
    kp: newKP,
    longitude: 125,
    latitude: 28,
    depth: 2000,
    spacing: recommendedSpacing,
    model: 'EREP-C+L',
    gain: 15,
    powerConsumption: 45,
    remarks: '',
  })
  recalculateSpacing()
}

function deleteRepeater(repId: string) {
  repeaters.value = repeaters.value.filter(r => r.id !== repId)
  recalculateSpacing()
}

function autoOptimize() {
  if (repeaters.value.length === 0) {
    generateMockRepeaters()
    appStore.showNotification({ type: 'success', message: '已生成默认中继器配置' })
    return
  }
  
  const firstKP = repeaters.value[0].kp - repeaters.value[0].spacing
  const lastRep = repeaters.value[repeaters.value.length - 1]
  const totalLength = lastRep.kp + recommendedSpacing - firstKP
  
  const optimalCount = Math.round(totalLength / recommendedSpacing) - 1
  const optimalSpacing = totalLength / (optimalCount + 1)
  
  repeaters.value = []
  for (let i = 0; i < optimalCount; i++) {
    const kp = firstKP + (i + 1) * optimalSpacing
    repeaters.value.push({
      id: `rep-${i}`,
      index: i,
      name: `REP-${String(i + 1).padStart(2, '0')}`,
      kp: Math.round(kp * 10) / 10,
      longitude: 121.5 + i * 1.5,
      latitude: 31.2 - i * 1.2,
      depth: 2000,
      spacing: optimalSpacing,
      model: 'EREP-C+L',
      gain: 15,
      powerConsumption: 45,
      remarks: '',
    })
  }
  recalculateSpacing()
  appStore.showNotification({ type: 'success', message: `已优化为 ${optimalCount} 个中继器` })
}

// 智能落位算法
function smartPlacement() {
  const routeData = rplStore.currentTable?.records
  if (!routeData || routeData.length === 0) {
    appStore.showNotification({ type: 'warning', message: '请先导入路由数据（RPL）' })
    return
  }
  
  // 配置落位服务
  repeaterPlacementService.setConfig({
    targetSpacing: placementConfig.value.targetSpacing || 80,
    minSpacing: placementConfig.value.minSpacing || 60,
    maxSpacing: placementConfig.value.maxSpacing || 100,
    maxSlope: placementConfig.value.maxSlope || 15,
    searchRadius: placementConfig.value.searchRadius || 5,
    preferredDepthRange: { min: 1000, max: 5000 },
    avoidanceZones: []
  })
  
  // 转换路由数据格式
  const routePoints = routeData.map(r => ({
    id: r.id,
    longitude: r.longitude,
    latitude: r.latitude,
    depth: r.depth || 3000
  }))
  
  // 计算落位
  const result = repeaterPlacementService.calculatePlacements(routePoints)
  
  // 转换结果
  repeaters.value = result.locations.map((loc, i) => ({
    id: loc.id,
    index: loc.index,
    name: `REP-${String(i + 1).padStart(2, '0')}`,
    kp: loc.kp,
    longitude: loc.longitude,
    latitude: loc.latitude,
    depth: loc.depth,
    spacing: i === 0 ? loc.kp : loc.kp - result.locations[i - 1].kp,
    model: 'EREP-C+L',
    gain: 15,
    powerConsumption: 45,
    remarks: loc.adjustmentReason || '',
  }))
  
  recalculateSpacing()
  
  // 显示结果统计
  const message = `智能落位完成: ${result.totalCount}个中继器, 平均间距${result.averageSpacing.toFixed(1)}km`
  if (result.feasibility.warnings.length > 0) {
    appStore.showNotification({ type: 'warning', message: message + ` (有${result.feasibility.warnings.length}个警告)` })
  } else {
    appStore.showNotification({ type: 'success', message })
  }
  
  appStore.addLog('INFO', `智能落位: 最优化比例${(result.statistics.optimalRatio * 100).toFixed(0)}%, 平均评分${result.statistics.averageScore.toFixed(0)}`)
}

function moveRepeater(repId: string, delta: number) {
  const rep = repeaters.value.find(r => r.id === repId)
  if (rep) {
    rep.kp = Math.max(0, rep.kp + delta)
    recalculateSpacing()
  }
}

const hasSpacingWarning = (spacing: number) => spacing > maxSpacing
const hasSpacingError = (spacing: number) => spacing > maxSpacing * 1.2

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
    generateMockRepeaters()
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
            <Button variant="outline" size="sm" @click="smartPlacement" class="border-green-300 text-green-700 hover:bg-green-50">
              <Zap class="w-4 h-4 mr-1" />
              智能落位
            </Button>
            <Button variant="outline" size="sm" @click="showPlacementPanel = !showPlacementPanel">
              <Settings class="w-4 h-4 mr-1" />
              配置
            </Button>
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

        <!-- 智能落位配置面板 -->
        <div v-if="showPlacementPanel" class="px-4 py-3 bg-green-50 border-b space-y-3">
          <div class="text-xs font-medium text-green-700 flex items-center gap-1">
            <Map class="w-3.5 h-3.5" />
            智能落位配置
          </div>
          <div class="grid grid-cols-5 gap-3 text-xs">
            <div>
              <label class="block text-gray-600 mb-1">目标间距(km)</label>
              <input v-model.number="placementConfig.targetSpacing" type="number" min="40" max="120" step="5"
                class="w-full px-2 py-1 border border-gray-300 rounded text-center" />
            </div>
            <div>
              <label class="block text-gray-600 mb-1">最小间距(km)</label>
              <input v-model.number="placementConfig.minSpacing" type="number" min="30" max="100" step="5"
                class="w-full px-2 py-1 border border-gray-300 rounded text-center" />
            </div>
            <div>
              <label class="block text-gray-600 mb-1">最大间距(km)</label>
              <input v-model.number="placementConfig.maxSpacing" type="number" min="60" max="150" step="5"
                class="w-full px-2 py-1 border border-gray-300 rounded text-center" />
            </div>
            <div>
              <label class="block text-gray-600 mb-1">最大坡度(°)</label>
              <input v-model.number="placementConfig.maxSlope" type="number" min="5" max="30" step="1"
                class="w-full px-2 py-1 border border-gray-300 rounded text-center" />
            </div>
            <div>
              <label class="block text-gray-600 mb-1">搜索半径(km)</label>
              <input v-model.number="placementConfig.searchRadius" type="number" min="1" max="20" step="1"
                class="w-full px-2 py-1 border border-gray-300 rounded text-center" />
            </div>
          </div>
          <div class="text-xs text-gray-500">
            提示: 智能落位会自动规避陡坡和不良地形，确保中继器布置在平坦区域
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
                <td class="px-3 py-2 border-b font-medium">{{ rep.name }}</td>
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
                <td colspan="7" class="px-4 py-8 text-center text-gray-400">
                  暂无中继器，点击"添加"按钮添加
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
