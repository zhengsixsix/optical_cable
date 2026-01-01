<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Info, Settings, Edit3, DollarSign } from 'lucide-vue-next'
import type { SegmentDetail } from '@/types'
import { 
  cableSpecOptions, 
  getRecommendedCableType, 
  getRecommendedSlack, 
  getRecommendedCableLength,
  calculateSegmentCost 
} from '@/data/mockData'

/**
 * SegmentDetailDialog 线段详情弹窗
 * 显示线段基本信息、系统推荐参数、手动设置和预估成本
 */
interface Props {
  visible: boolean
  segmentId: string
  routeLength: number  // 路径长度 (km)
  depth?: number       // 水深 (m)，用于推荐海缆类型
}

const props = withDefaults(defineProps<Props>(), {
  depth: 1000
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'save', data: SegmentDetail): void
  (e: 'close'): void
}>()

// 手动输入类型: 'length' 输入敷设长度, 'slack' 输入敷设余量
const inputType = ref<'length' | 'slack'>('length')

// 手动输入值
const manualCableLength = ref<string>('')
const manualSlack = ref<string>('')
const selectedCableType = ref<string>('')

// 计算推荐值
const recommendedCableType = computed(() => getRecommendedCableType(props.depth))
const recommendedSlack = computed(() => getRecommendedSlack(props.routeLength))
const recommendedCableLength = computed(() => getRecommendedCableLength(props.routeLength))

// 计算余量 (当输入敷设长度时)
const calculatedSlack = computed(() => {
  if (inputType.value === 'length' && manualCableLength.value) {
    const length = parseFloat(manualCableLength.value)
    if (!isNaN(length) && length > props.routeLength) {
      return (length - props.routeLength).toFixed(2)
    }
  }
  return '--'
})

// 计算敷设长度 (当输入余量时)
const calculatedLength = computed(() => {
  if (inputType.value === 'slack' && manualSlack.value) {
    const slack = parseFloat(manualSlack.value)
    if (!isNaN(slack) && slack >= 0) {
      return (props.routeLength + slack).toFixed(2)
    }
  }
  return '--'
})

// 获取实际敷设长度用于成本计算
const actualCableLength = computed(() => {
  if (inputType.value === 'length' && manualCableLength.value) {
    return parseFloat(manualCableLength.value) || 0
  }
  if (inputType.value === 'slack' && manualSlack.value) {
    const slack = parseFloat(manualSlack.value) || 0
    return props.routeLength + slack
  }
  return 0
})

// 计算预估成本
const costEstimate = computed(() => {
  const cableType = selectedCableType.value || recommendedCableType.value
  const length = actualCableLength.value
  
  if (length > 0) {
    return calculateSegmentCost(cableType, length)
  }
  return { materialCost: 0, installationCost: 0, totalCost: 0 }
})

// 格式化成本显示
const formatCost = (cost: number) => {
  if (cost === 0) return '--'
  return cost.toFixed(2)
}

// 重置表单
const resetForm = () => {
  inputType.value = 'length'
  manualCableLength.value = ''
  manualSlack.value = ''
  selectedCableType.value = ''
}

// 保存
const handleSave = () => {
  const data: SegmentDetail = {
    segmentId: props.segmentId,
    routeLength: props.routeLength,
    recommendedCableLength: recommendedCableLength.value,
    recommendedCableType: recommendedCableType.value,
    recommendedSlack: recommendedSlack.value,
    manualCableLength: inputType.value === 'length' ? parseFloat(manualCableLength.value) || undefined : undefined,
    manualSlack: inputType.value === 'slack' ? parseFloat(manualSlack.value) || undefined : undefined,
    selectedCableType: selectedCableType.value || undefined,
    materialCost: costEstimate.value.materialCost,
    installationCost: costEstimate.value.installationCost,
    totalCost: costEstimate.value.totalCost
  }
  emit('save', data)
  handleClose()
}

// 关闭
const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

// 监听visible变化重置表单
watch(() => props.visible, (val) => {
  if (val) {
    resetForm()
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- 遮罩层 -->
      <div
        class="absolute inset-0 bg-black/30"
        @click="handleClose"
      />
      
      <!-- 弹窗内容 -->
      <div class="relative bg-white rounded-lg shadow-xl w-[520px] max-h-[90vh] overflow-hidden">
        <!-- 头部 -->
        <div class="px-5 py-4 border-b flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">线段详情</h3>
          <button
            class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            @click="handleClose"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
        
        <!-- 内容区域 -->
        <div class="p-5 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          <!-- 基本信息 -->
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-gray-700">
              <Info class="w-4 h-4 text-blue-500" />
              <span class="font-medium">基本信息</span>
            </div>
            <div class="grid grid-cols-2 gap-4 pl-6">
              <div>
                <label class="block text-sm text-gray-500 mb-1">段落ID:</label>
                <input
                  type="text"
                  :value="segmentId"
                  disabled
                  class="w-full px-3 py-2 bg-gray-100 border rounded-lg text-sm text-gray-600"
                />
              </div>
              <div>
                <label class="block text-sm text-gray-500 mb-1">路径长度:</label>
                <div class="flex items-center">
                  <input
                    type="text"
                    :value="routeLength.toFixed(2)"
                    disabled
                    class="flex-1 px-3 py-2 bg-gray-100 border rounded-l-lg text-sm text-gray-600"
                  />
                  <span class="px-3 py-2 bg-gray-50 border border-l-0 rounded-r-lg text-sm text-gray-500">km</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 系统推荐参数 -->
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-gray-700">
              <Settings class="w-4 h-4 text-orange-500" />
              <span class="font-medium">系统推荐参数</span>
            </div>
            <div class="grid grid-cols-3 gap-3 pl-6">
              <div class="bg-blue-50 rounded-lg p-3 text-center">
                <div class="text-xs text-gray-500 mb-1">推荐敷设长度</div>
                <div class="text-lg font-semibold text-blue-600">{{ recommendedCableLength.toFixed(2) }} km</div>
              </div>
              <div class="bg-green-50 rounded-lg p-3 text-center">
                <div class="text-xs text-gray-500 mb-1">推荐海缆类型</div>
                <div class="text-lg font-semibold text-green-600">{{ recommendedCableType }}</div>
              </div>
              <div class="bg-purple-50 rounded-lg p-3 text-center">
                <div class="text-xs text-gray-500 mb-1">推荐敷设余量</div>
                <div class="text-lg font-semibold text-purple-600">{{ recommendedSlack.toFixed(2) }} km</div>
              </div>
            </div>
          </div>
          
          <!-- 手动设置和预估成本并排 -->
          <div class="grid grid-cols-2 gap-5">
            <!-- 手动设置 -->
            <div class="space-y-3">
              <div class="flex items-center gap-2 text-gray-700">
                <Edit3 class="w-4 h-4 text-yellow-500" />
                <span class="font-medium">手动设置</span>
              </div>
              <div class="space-y-3 pl-6">
                <!-- 输入类型选择 -->
                <div class="space-y-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      v-model="inputType"
                      type="radio"
                      value="length"
                      class="w-4 h-4 text-blue-600"
                    />
                    <span class="text-sm text-gray-700">输入敷设长度</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      v-model="inputType"
                      type="radio"
                      value="slack"
                      class="w-4 h-4 text-blue-600"
                    />
                    <span class="text-sm text-gray-700">输入敷设余量</span>
                  </label>
                </div>
                
                <!-- 敷设长度输入 -->
                <div>
                  <label class="block text-sm text-gray-500 mb-1">敷设长度:</label>
                  <div class="flex items-center">
                    <input
                      v-model="manualCableLength"
                      type="number"
                      step="0.01"
                      :disabled="inputType !== 'length'"
                      :placeholder="inputType === 'length' ? '请输入敷设长度' : calculatedLength"
                      class="flex-1 px-3 py-2 border rounded-l-lg text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <span class="px-3 py-2 bg-gray-50 border border-l-0 rounded-r-lg text-sm text-gray-500">km</span>
                  </div>
                </div>
                
                <!-- 计算余量 -->
                <div>
                  <label class="block text-sm text-gray-500 mb-1">计算余量:</label>
                  <div class="flex items-center">
                    <input
                      v-model="manualSlack"
                      type="number"
                      step="0.01"
                      :disabled="inputType !== 'slack'"
                      :placeholder="inputType === 'slack' ? '请输入余量' : calculatedSlack"
                      class="flex-1 px-3 py-2 border rounded-l-lg text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <span class="px-3 py-2 bg-gray-50 border border-l-0 rounded-r-lg text-sm text-gray-500">km</span>
                  </div>
                </div>
                
                <!-- 海缆类型选择 -->
                <div>
                  <label class="block text-sm text-gray-500 mb-1">海缆类型:</label>
                  <select
                    v-model="selectedCableType"
                    class="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="">选择海缆类型</option>
                    <option
                      v-for="opt in cableSpecOptions"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
            
            <!-- 预估成本 -->
            <div class="space-y-3">
              <div class="flex items-center gap-2 text-gray-700">
                <DollarSign class="w-4 h-4 text-red-500" />
                <span class="font-medium">预估成本</span>
              </div>
              <div class="space-y-3 pl-6">
                <div class="flex justify-between items-center py-2 border-b">
                  <span class="text-sm text-gray-500">材料成本:</span>
                  <span class="text-sm text-gray-700">{{ formatCost(costEstimate.materialCost) }} 万元</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b">
                  <span class="text-sm text-gray-500">施工成本:</span>
                  <span class="text-sm text-gray-700">{{ formatCost(costEstimate.installationCost) }} 万元</span>
                </div>
                <div class="flex justify-between items-center py-3 bg-orange-50 rounded-lg px-3 -mx-3">
                  <span class="text-sm font-medium text-gray-700">总成本:</span>
                  <span class="text-lg font-semibold text-orange-600">{{ formatCost(costEstimate.totalCost) }} 万元</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 底部按钮 -->
        <div class="px-5 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            class="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
            @click="handleSave"
          >
            保存
          </button>
          <button
            class="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg transition-colors"
            @click="handleClose"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
