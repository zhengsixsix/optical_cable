<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useAppStore, useSettingsStore, useCableSegmentStore } from '@/stores'
import { Button, Input, Select } from '@/shared/components/base'
import { X, Settings, Lock, Unlock, RotateCcw, Check, Cable } from 'lucide-vue-next'
import type { CableSegment, RiskLevel } from '@/types/cableSegment'

const props = defineProps<{
  visible: boolean
  segment: CableSegment | null
  segmentIndex?: number  // 段落序号（用于显示 SEG-001 格式）
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', segment: CableSegment): void
}>()

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const cableSegmentStore = useCableSegmentStore()

// 本地编辑数据
const editForm = reactive({
  cableTypeId: '',
  cableTypeName: '',
  slack: 3,
  burialDepth: 1.0,
  isLocked: false
})

// 原始数据（用于重置）
const originalData = ref<{
  cableTypeId: string
  cableTypeName: string
  slack: number
  burialDepth: number
  isLocked: boolean
} | null>(null)

// 缆型选项
const cableTypeOptions = computed(() => {
  const armorMappings = settingsStore.routePlanningConfig.armorMappings || []
  return armorMappings
    .filter(m => m.cableTypeId) // 过滤空 id
    .map(m => ({
      value: m.cableTypeId,
      label: m.cableTypeName
    }))
})

// 风险等级标签
const riskLevelLabels: Record<RiskLevel, { text: string; class: string }> = {
  high: { text: '高风险', class: 'bg-red-100 text-red-700' },
  medium: { text: '中风险', class: 'bg-yellow-100 text-yellow-700' },
  low: { text: '低风险', class: 'bg-green-100 text-green-700' }
}

// 监听 segment 变化，初始化表单
watch(() => props.segment, (newSegment) => {
  if (newSegment) {
    editForm.cableTypeId = newSegment.cableTypeId
    editForm.cableTypeName = newSegment.cableTypeName
    editForm.slack = newSegment.slack
    editForm.burialDepth = newSegment.burialDepth
    editForm.isLocked = newSegment.isLocked ?? false
    
    // 保存原始数据
    originalData.value = {
      cableTypeId: newSegment.cableTypeId,
      cableTypeName: newSegment.cableTypeName,
      slack: newSegment.slack,
      burialDepth: newSegment.burialDepth,
      isLocked: newSegment.isLocked ?? false
    }
  }
}, { immediate: true })

// 当缆型选择变化时，更新名称
watch(() => editForm.cableTypeId, (newId) => {
  const mapping = settingsStore.routePlanningConfig.armorMappings?.find(m => m.cableTypeId === newId)
  if (mapping) {
    editForm.cableTypeName = mapping.cableTypeName
  }
})

// 切换锁定状态
const toggleLock = () => {
  editForm.isLocked = !editForm.isLocked
}

// 重置为默认值（根据风险等级）
const handleReset = () => {
  if (!props.segment) return
  
  const riskLevel = props.segment.riskLevel
  const armorMappings = settingsStore.routePlanningConfig.armorMappings || []
  const mapping = armorMappings.find(m => m.riskLevel === riskLevel)
  
  if (mapping) {
    editForm.cableTypeId = mapping.cableTypeId
    editForm.cableTypeName = mapping.cableTypeName
  }
  
  // 默认余量和埋深
  editForm.slack = 3
  editForm.burialDepth = riskLevel === 'high' ? 2.0 : riskLevel === 'medium' ? 1.5 : 1.0
  
  appStore.showNotification({ type: 'info', message: '已重置为默认值' })
}

// 保存更改
const handleSave = () => {
  if (!props.segment) return
  
  // 验证
  if (editForm.slack < 0 || editForm.slack > 20) {
    appStore.showNotification({ type: 'warning', message: '敷设余量应在 0-20% 之间' })
    return
  }
  if (editForm.burialDepth < 0 || editForm.burialDepth > 5) {
    appStore.showNotification({ type: 'warning', message: '埋设深度应在 0-5m 之间' })
    return
  }
  
  const updatedSegment: CableSegment = {
    ...props.segment,
    cableTypeId: editForm.cableTypeId,
    cableTypeName: editForm.cableTypeName,
    slack: editForm.slack,
    burialDepth: editForm.burialDepth,
    isLocked: editForm.isLocked
  }
  
  emit('save', updatedSegment)
  emit('close')
}

const handleClose = () => {
  emit('close')
}

// 格式化数字
const formatNumber = (num: number, decimals: number = 3) => {
  return num.toFixed(decimals)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && segment"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click.self="handleClose"
    >
      <div class="w-[480px] max-w-[95vw] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <Cable class="w-6 h-6 text-blue-600" />
            <span class="font-semibold text-lg">海缆段配置</span>
          </div>
          <Button variant="ghost" size="sm" @click="handleClose">
            <X class="w-5 h-5" />
          </Button>
        </div>

        <!-- 内容 -->
        <div class="p-6 space-y-5">
          <!-- 基本信息 -->
          <div class="bg-gray-50 rounded-lg p-4 space-y-2">
            <h4 class="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
              <Settings class="w-4 h-4" />
              基本信息
            </h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">段落ID：</span>
                <span class="font-mono text-gray-800 font-medium">SEG-{{ String((segmentIndex ?? 0) + 1).padStart(3, '0') }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">起点里程：</span>
                <span class="font-mono text-gray-800">{{ formatNumber(segment.startKp) }} km</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">终点里程：</span>
                <span class="font-mono text-gray-800">{{ formatNumber(segment.endKp) }} km</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">几何长度：</span>
                <span class="font-bold text-blue-700">{{ formatNumber(segment.length, 2) }} km</span>
              </div>
            </div>
          </div>

          <!-- 参数配置 -->
          <div class="space-y-4">
            <h4 class="text-sm font-medium text-gray-700">参数配置</h4>
            
            <!-- 缆型选择 -->
            <div class="flex items-center gap-4">
              <label class="w-24 text-sm text-gray-600 text-right shrink-0">缆型选择：</label>
              <Select 
                v-model="editForm.cableTypeId" 
                :options="cableTypeOptions"
                :disabled="editForm.isLocked"
                class="flex-1"
              />
            </div>
            
            <!-- 敷设余量 -->
            <div class="flex items-center gap-4">
              <label class="w-24 text-sm text-gray-600 text-right shrink-0">敷设余量：</label>
              <Input 
                v-model.number="editForm.slack" 
                type="number" 
                step="0.1"
                min="0"
                max="20"
                :disabled="editForm.isLocked"
                class="flex-1"
              />
              <span class="text-sm text-gray-500 w-8">%</span>
            </div>
            
            <!-- 埋设深度 -->
            <div class="flex items-center gap-4">
              <label class="w-24 text-sm text-gray-600 text-right shrink-0">埋设深度：</label>
              <Input 
                v-model.number="editForm.burialDepth" 
                type="number" 
                step="0.1"
                min="0"
                max="5"
                :disabled="editForm.isLocked"
                class="flex-1"
              />
              <span class="text-sm text-gray-500 w-8">m</span>
            </div>
          </div>

          <!-- 锁定选项 -->
          <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
            <button 
              @click="toggleLock"
              :class="[
                'p-2 rounded-lg transition-colors',
                editForm.isLocked 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white text-gray-500 border hover:border-blue-300'
              ]"
            >
              <Lock v-if="editForm.isLocked" class="w-5 h-5" />
              <Unlock v-else class="w-5 h-5" />
            </button>
            <div class="flex-1">
              <div class="text-sm font-medium" :class="editForm.isLocked ? 'text-blue-700' : 'text-gray-700'">
                {{ editForm.isLocked ? '已锁定此段配置' : '锁定此段配置' }}
              </div>
              <div class="text-xs text-gray-500">
                锁定后，该段参数不会被批量操作或系统自动计算修改
              </div>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <Button variant="outline" @click="handleReset">
            <RotateCcw class="w-4 h-4 mr-2" />
            重置
          </Button>
          <Button class="bg-blue-500 hover:bg-blue-600 text-white" @click="handleSave">
            <Check class="w-4 h-4 mr-2" />
            应用
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
