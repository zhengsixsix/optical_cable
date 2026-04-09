<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button, Select } from '@/shared/components/base'
import ModelParamsForm from './ModelParamsForm.vue'
import { useSettingsStore } from '@/stores/settings'
import type { ModelDefinition, ModelDomain, ComponentModelParamsConfig } from '@/types/useFile'
import { X, Save, RotateCcw, Cpu, AlertTriangle, CheckCircle } from 'lucide-vue-next'

const props = defineProps<{
  /** 是否显示 */
  visible: boolean
  /** 器件类型 (用于过滤模型) */
  domain: ModelDomain
  /** 器件支持的模型 ID 列表 */
  supportedModels: string[]
  /** 当前器件的模型参数配置 */
  modelParams: Record<string, ComponentModelParamsConfig>
  /** 器件名称 (用于标题显示) */
  deviceName?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', params: Record<string, ComponentModelParamsConfig>): void
}>()

const settingsStore = useSettingsStore()

// 从设置中获取所有可用模型
const allModels = computed(() => settingsStore.models || [])

// 过滤出当前器件支持的模型
const availableModels = computed(() => {
  return allModels.value.filter(m => 
    m.domain === props.domain && 
    props.supportedModels.includes(m.model_id)
  )
})

// 模型选项
const modelOptions = computed(() => [
  { value: '', label: '-- 请选择模型 --' },
  ...availableModels.value.map(m => ({
    value: m.model_id,
    label: `${m.display_name} (v${m.version})`
  }))
])

// 当前选中的模型 ID
const selectedModelId = ref('')

// 当前选中的模型定义
const selectedModel = computed(() => 
  availableModels.value.find(m => m.model_id === selectedModelId.value)
)

// 本地参数编辑状态
const localModelParams = ref<Record<string, ComponentModelParamsConfig>>({})

// 当前模型的参数值
const currentParams = computed({
  get: () => localModelParams.value[selectedModelId.value]?.params || {},
  set: (val) => {
    if (selectedModelId.value) {
      localModelParams.value[selectedModelId.value] = {
        is_configured: true,
        params: val
      }
    }
  }
})

// 初始化
const initState = () => {
  // 深拷贝传入的参数
  localModelParams.value = JSON.parse(JSON.stringify(props.modelParams || {}))
  
  // 选择第一个已配置的模型，或第一个支持的模型
  const configuredModel = Object.keys(localModelParams.value).find(
    id => localModelParams.value[id]?.is_configured
  )
  if (configuredModel && props.supportedModels.includes(configuredModel)) {
    selectedModelId.value = configuredModel
  } else if (props.supportedModels.length > 0) {
    selectedModelId.value = props.supportedModels[0]
  }
}

// 监听 visible 变化初始化
watch(() => props.visible, (val) => {
  if (val) {
    initState()
  }
})

// 获取模型配置状态
const getModelStatus = (modelId: string) => {
  const config = localModelParams.value[modelId]
  if (!config) return 'unconfigured'
  return config.is_configured ? 'configured' : 'partial'
}

// 保存配置
const handleSave = () => {
  emit('save', localModelParams.value)
  emit('close')
}

// 重置当前模型参数
const resetCurrentParams = () => {
  if (!selectedModel.value) return
  
  const defaultParams: Record<string, any> = {}
  selectedModel.value.inputs.forEach(input => {
    if (input.default !== undefined) {
      defaultParams[input.param_id] = input.default
    }
  })
  
  localModelParams.value[selectedModelId.value] = {
    is_configured: false,
    params: defaultParams
  }
}

// 更新参数值
const updateParams = (params: Record<string, any>) => {
  if (selectedModelId.value) {
    localModelParams.value[selectedModelId.value] = {
      is_configured: true,
      params
    }
  }
}

// 检查是否有未保存的更改
const hasChanges = computed(() => {
  return JSON.stringify(localModelParams.value) !== JSON.stringify(props.modelParams)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="visible" class="fixed inset-0 z-50 flex justify-end">
        <!-- 遮罩 -->
        <div class="absolute inset-0 bg-black/30" @click="emit('close')" />
        
        <!-- 抽屉内容 -->
        <div class="relative w-[480px] max-w-full bg-white shadow-xl flex flex-col h-full">
          <!-- 头部 -->
          <div class="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Cpu class="w-5 h-5 text-purple-500" />
              <h3 class="font-semibold text-gray-800">
                模型参数配置
                <span v-if="deviceName" class="text-sm font-normal text-gray-500">
                  - {{ deviceName }}
                </span>
              </h3>
            </div>
            <button 
              class="p-1.5 hover:bg-gray-200 rounded transition-colors" 
              @click="emit('close')"
            >
              <X class="w-4 h-4 text-gray-500" />
            </button>
          </div>
          
          <!-- 模型选择 -->
          <div class="px-4 py-3 border-b bg-white">
            <label class="block text-sm font-medium text-gray-700 mb-2">选择计算模型</label>
            <Select
              v-model="selectedModelId"
              :options="modelOptions"
              class="w-full"
            />
            
            <!-- 模型状态列表 -->
            <div v-if="supportedModels.length > 1" class="mt-3 flex flex-wrap gap-2">
              <div
                v-for="modelId in supportedModels"
                :key="modelId"
                class="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
                :class="[
                  selectedModelId === modelId 
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                ]"
                @click="selectedModelId = modelId"
              >
                <CheckCircle 
                  v-if="getModelStatus(modelId) === 'configured'" 
                  class="w-3 h-3 text-green-500" 
                />
                <AlertTriangle 
                  v-else-if="getModelStatus(modelId) === 'partial'" 
                  class="w-3 h-3 text-yellow-500" 
                />
                <span 
                  v-else 
                  class="w-3 h-3 rounded-full bg-gray-300" 
                />
                <span>{{ allModels.find(m => m.model_id === modelId)?.display_name || modelId }}</span>
              </div>
            </div>
          </div>
          
          <!-- 参数表单 -->
          <div class="flex-1 overflow-y-auto p-4">
            <template v-if="selectedModel">
              <ModelParamsForm
                :model="selectedModel"
                :model-value="currentParams"
                :show-source-hints="true"
                @update:model-value="updateParams"
              />
            </template>
            
            <div v-else class="text-center text-gray-400 py-12">
              <Cpu class="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>请选择要配置的计算模型</p>
            </div>
          </div>
          
          <!-- 底部操作 -->
          <div class="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
            <div class="text-xs text-gray-500">
              <span v-if="hasChanges" class="text-orange-600">
                * 有未保存的更改
              </span>
              <span v-else class="text-green-600">
                配置已同步
              </span>
            </div>
            <div class="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                :disabled="!selectedModel"
                @click="resetCurrentParams"
              >
                <RotateCcw class="w-4 h-4 mr-1" />
                重置
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                @click="emit('close')"
              >
                取消
              </Button>
              <Button 
                size="sm" 
                :disabled="!hasChanges"
                @click="handleSave"
              >
                <Save class="w-4 h-4 mr-1" />
                保存配置
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from > div:last-child,
.drawer-leave-to > div:last-child {
  transform: translateX(100%);
}
</style>
