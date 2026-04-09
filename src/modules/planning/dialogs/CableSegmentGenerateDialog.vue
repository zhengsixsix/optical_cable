<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { reactive, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { Button, Input, Select, Card, CardContent } from '@/shared/components/base'
import { X, Scissors, Settings, AlertCircle } from 'lucide-vue-next'
import type { SegmentGenerateConfig, SegmentMethod } from '@/types/cableSegment'
import { defaultSegmentGenerateConfig } from '@/types/cableSegment'

const props = defineProps<{
  visible: boolean
  routeId?: string
  routeLength?: number  // 路由总长度(km)
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'generate', config: SegmentGenerateConfig): void
}>()

const appStore = useAppStore()
const settingsStore = useSettingsStore()

// 分段方式选项
const methodOptions = [
  { value: 'fixed-length', label: '固定长度分段' },
  { value: 'risk-based', label: '基于风险等级分段' }
]

// 从设置中读取风险阈值
const armorMappings = computed(() => settingsStore.routePlanningConfig.armorMappings || [])
const highRiskThreshold = computed(() => {
  const mapping = armorMappings.value.find(m => m.riskLevel === 'high')
  return mapping?.riskThreshold ?? 3
})
const mediumRiskThreshold = computed(() => {
  const mapping = armorMappings.value.find(m => m.riskLevel === 'medium')
  return mapping?.riskThreshold ?? 2
})

// 配置表单
const config = reactive<{
  method: string
  targetLength: string
  minLength: string
  maxLength: string
}>({
  method: defaultSegmentGenerateConfig.method,
  targetLength: String(defaultSegmentGenerateConfig.targetLength || 2.0),
  minLength: String(defaultSegmentGenerateConfig.minLength || 1.0),
  maxLength: String(defaultSegmentGenerateConfig.maxLength || 5.0)
})

// 预估分段数
const estimatedSegments = computed(() => {
  if (!props.routeLength) return '-'
  if (config.method === 'fixed-length') {
    const length = parseFloat(config.targetLength) || 2.0
    return Math.ceil(props.routeLength / length)
  }
  return '根据风险分布计算'
})

// 验证配置
const validateConfig = (): string | null => {
  if (config.method === 'fixed-length') {
    const targetLength = parseFloat(config.targetLength)
    if (!targetLength || targetLength <= 0) {
      return '目标长度必须大于0'
    }
    if (targetLength < 5) {
      return '目标长度建议不小于5km，实际海缆段通常为25-100km'
    }
  } else {
    const minLen = parseFloat(config.minLength)
    const maxLen = parseFloat(config.maxLength)
    
    if (minLen >= maxLen) {
      return '最小长度必须小于最大长度'
    }
    if (minLen <= 0) {
      return '最小长度必须大于0'
    }
  }
  return null
}

// 生成配置
const handleGenerate = () => {
  const error = validateConfig()
  if (error) {
    appStore.showNotification({ type: 'warning', message: error })
    return
  }
  
  const generateConfig: SegmentGenerateConfig = {
    method: config.method as SegmentMethod,
    targetLength: parseFloat(config.targetLength) || 50.0,
    highRiskThreshold: highRiskThreshold.value,
    mediumRiskThreshold: mediumRiskThreshold.value,
    minLength: parseFloat(config.minLength) || 10.0,
    maxLength: parseFloat(config.maxLength) || 100.0
  }
  
  emit('generate', generateConfig)
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click.self="handleClose"
    >
      <div class="w-[500px] max-w-[95vw] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <Scissors class="w-6 h-6 text-orange-600" />
            <span class="font-semibold text-lg">海缆段生成配置</span>
          </div>
          <Button variant="ghost" size="sm" @click="handleClose">
            <X class="w-5 h-5" />
          </Button>
        </div>

        <!-- 内容 -->
        <div class="p-6 space-y-5">
          <!-- 路由信息 -->
          <div class="bg-blue-50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle class="w-5 h-5 text-blue-500 shrink-0" />
            <div class="text-sm text-blue-700">
              <span>路由总长度：</span>
              <span class="font-semibold">{{ routeLength ? routeLength.toFixed(2) : '-' }} km</span>
              <span class="mx-2">|</span>
              <span>预估分段数：</span>
              <span class="font-semibold">{{ estimatedSegments }}</span>
            </div>
          </div>

          <!-- 分段方式选择 -->
          <div class="space-y-3">
            <label class="block text-sm font-medium text-gray-700">分段方式</label>
            <div class="grid grid-cols-2 gap-3">
              <button
                v-for="opt in methodOptions"
                :key="opt.value"
                :class="[
                  'p-4 rounded-lg border-2 text-left transition-all',
                  config.method === opt.value 
                    ? 'border-orange-500 bg-orange-50' 
                    : 'border-gray-200 hover:border-gray-300'
                ]"
                @click="config.method = opt.value"
              >
                <div class="font-medium text-gray-800">{{ opt.label }}</div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ opt.value === 'fixed-length' ? '按固定长度均匀分段' : '按风险等级智能分段' }}
                </div>
              </button>
            </div>
          </div>

          <!-- 固定长度分段参数 -->
          <div v-if="config.method === 'fixed-length'" class="space-y-4 p-4 bg-gray-50 rounded-lg">
            <h4 class="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Settings class="w-4 h-4" />
              固定长度参数
            </h4>
            <div class="flex items-center gap-4">
              <label class="w-24 text-sm text-gray-600 shrink-0">目标长度：</label>
              <Input v-model="config.targetLength" type="number" step="0.1" class="flex-1" />
              <span class="text-sm text-gray-500 w-12">km</span>
            </div>
            <!-- 说明 -->
            <div class="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 mt-3">
              <div class="font-medium mb-1">💡 说明：</div>
              <ul class="list-disc list-inside space-y-0.5 text-blue-600">
                <li>实际海缆段通常为 25~100 km，建议根据路由总长合理设置</li>
                <li>缆型根据「工程设置」中的风险映射规则分配</li>
                <li>余量与埋深由算法自动计算</li>
              </ul>
            </div>
          </div>

          <!-- 风险等级分段参数 -->
          <div v-if="config.method === 'risk-based'" class="space-y-4 p-4 bg-gray-50 rounded-lg">
            <h4 class="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Settings class="w-4 h-4" />
              风险等级阈值
            </h4>
            <!-- 风险阈值显示（从路径规划设置中读取，只读） -->
            <div class="flex items-center gap-6 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-gray-600">高风险 ≥</span>
                <span class="px-3 py-1.5 bg-red-50 border border-red-200 rounded text-red-700 font-medium">{{ highRiskThreshold }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-gray-600">中风险 ≥</span>
                <span class="px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 font-medium">{{ mediumRiskThreshold }}</span>
              </div>
            </div>
            <p class="text-xs text-gray-500">风险阈值已在「工程设置 → 海缆铠装预选」中配置</p>
            
            <h4 class="text-sm font-medium text-gray-700 flex items-center gap-2 pt-2 border-t">
              <Settings class="w-4 h-4" />
              海缆段长度约束
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="flex items-center gap-3">
                <label class="text-sm text-gray-600 shrink-0">最小长度</label>
                <Input v-model="config.minLength" type="number" step="0.1" class="flex-1" />
                <span class="text-sm text-gray-500">km</span>
              </div>
              <div class="flex items-center gap-3">
                <label class="text-sm text-gray-600 shrink-0">最大长度</label>
                <Input v-model="config.maxLength" type="number" step="0.1" class="flex-1" />
                <span class="text-sm text-gray-500">km</span>
              </div>
            </div>
            
            <!-- 说明 -->
            <div class="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 mt-3">
              <div class="font-medium mb-1">💡 说明：</div>
              <ul class="list-disc list-inside space-y-0.5 text-blue-600">
                <li>系统优先保证高风险区域完整覆盖于独立段</li>
                <li>缆型根据「工程设置」中的风险映射规则分配</li>
                <li>余量与埋深由算法自动计算</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <Button variant="outline" @click="handleClose">取消</Button>
          <Button class="bg-orange-500 hover:bg-orange-600 text-white" @click="handleGenerate">
            <Scissors class="w-4 h-4 mr-2" />
            生成预览
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
