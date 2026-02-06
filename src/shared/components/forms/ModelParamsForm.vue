<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Input } from '@/shared/components/base'
import type { ModelDefinition, ModelInput } from '@/types/useFile'
import { HelpCircle } from 'lucide-vue-next'

const props = defineProps<{
  /** 模型定义 */
  model: ModelDefinition
  /** 当前参数值 (param_id => value) */
  modelValue: Record<string, any>
  /** 是否禁用表单 */
  disabled?: boolean
  /** 是否显示来源提示 */
  showSourceHints?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>): void
}>()

// 内部参数状态
const localParams = ref<Record<string, any>>({})

// 初始化参数值
const initParams = () => {
  const params: Record<string, any> = {}
  props.model.inputs.forEach(input => {
    // 优先使用传入值，其次使用默认值
    if (props.modelValue[input.param_id] !== undefined) {
      params[input.param_id] = props.modelValue[input.param_id]
    } else if (input.default !== undefined) {
      params[input.param_id] = input.default
    } else {
      // 根据类型设置空值
      switch (input.type) {
        case 'float':
        case 'int':
          params[input.param_id] = 0
          break
        case 'string':
          params[input.param_id] = ''
          break
        case 'array':
          params[input.param_id] = []
          break
      }
    }
  })
  localParams.value = params
}

// 监听 model 变化重新初始化
watch(() => props.model.model_id, initParams, { immediate: true })

// 监听外部值变化
watch(() => props.modelValue, (newVal) => {
  if (newVal && Object.keys(newVal).length > 0) {
    Object.keys(newVal).forEach(key => {
      if (localParams.value[key] !== newVal[key]) {
        localParams.value[key] = newVal[key]
      }
    })
  }
}, { deep: true })

// 更新参数值
const updateParam = (paramId: string, value: any, type: ModelInput['type']) => {
  let processedValue = value
  
  // 类型转换
  if (type === 'float') {
    processedValue = parseFloat(value) || 0
  } else if (type === 'int') {
    processedValue = parseInt(value) || 0
  } else if (type === 'array' && typeof value === 'string') {
    try {
      processedValue = JSON.parse(value)
    } catch {
      processedValue = value.split(',').map((v: string) => parseFloat(v.trim()) || v.trim())
    }
  }
  
  localParams.value[paramId] = processedValue
  emit('update:modelValue', { ...localParams.value })
}

// 获取参数约束
const getConstraint = (paramId: string) => {
  return props.model.constraints?.find(c => c.param_id === paramId)
}

// 获取输入字段类型
const getInputType = (input: ModelInput) => {
  switch (input.type) {
    case 'float':
      return 'number'
    case 'int':
      return 'number'
    default:
      return 'text'
  }
}

// 获取步进值
const getStep = (input: ModelInput) => {
  return input.type === 'float' ? '0.001' : '1'
}

// 必填参数
const requiredParams = computed(() => 
  props.model.inputs.filter(i => i.required)
)

// 可选参数
const optionalParams = computed(() => 
  props.model.inputs.filter(i => !i.required)
)

// 数组类型参数的显示值
const getArrayDisplayValue = (value: any) => {
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  return String(value || '')
}
</script>

<template>
  <div class="space-y-4">
    <!-- 模型信息 -->
    <div class="bg-blue-50 rounded-lg p-3 text-sm">
      <div class="font-medium text-blue-800">{{ model.display_name }}</div>
      <div class="text-blue-600 text-xs mt-1">{{ model.description }}</div>
      <div class="text-blue-500 text-xs mt-1">
        版本: {{ model.version }} · 领域: {{ model.domain }}
      </div>
    </div>
    
    <!-- 必填参数 -->
    <div v-if="requiredParams.length > 0" class="space-y-3">
      <div class="text-sm font-medium text-gray-700 flex items-center gap-1">
        <span class="text-red-500">*</span> 必填参数
      </div>
      
      <div 
        v-for="input in requiredParams" 
        :key="input.param_id"
        class="border rounded-lg p-3 bg-white"
      >
        <div class="flex items-center justify-between mb-1">
          <label class="text-sm font-medium text-gray-700 flex items-center gap-1">
            {{ input.label }}
            <span v-if="input.unit" class="text-gray-400 text-xs">({{ input.unit }})</span>
          </label>
          <div 
            v-if="showSourceHints && input.source_hint" 
            class="flex items-center gap-1 text-xs text-gray-400"
            :title="`自动取值路径: ${input.source_hint}`"
          >
            <HelpCircle class="w-3 h-3" />
            <span class="truncate max-w-[150px]">{{ input.source_hint }}</span>
          </div>
        </div>
        
        <!-- 数值输入 -->
        <template v-if="input.type === 'float' || input.type === 'int'">
          <input
            :type="getInputType(input)"
            :step="getStep(input)"
            :min="getConstraint(input.param_id)?.min"
            :max="getConstraint(input.param_id)?.max"
            :value="localParams[input.param_id]"
            :disabled="disabled"
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            @input="updateParam(input.param_id, ($event.target as HTMLInputElement).value, input.type)"
          />
          <div v-if="getConstraint(input.param_id)" class="text-xs text-gray-400 mt-1">
            范围: {{ getConstraint(input.param_id)?.min ?? '-∞' }} ~ {{ getConstraint(input.param_id)?.max ?? '+∞' }}
          </div>
        </template>
        
        <!-- 字符串输入 -->
        <template v-else-if="input.type === 'string'">
          <input
            type="text"
            :value="localParams[input.param_id]"
            :disabled="disabled"
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            @input="updateParam(input.param_id, ($event.target as HTMLInputElement).value, input.type)"
          />
        </template>
        
        <!-- 数组输入 -->
        <template v-else-if="input.type === 'array'">
          <textarea
            :value="getArrayDisplayValue(localParams[input.param_id])"
            :disabled="disabled"
            rows="2"
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 font-mono"
            placeholder="逗号分隔的值列表"
            @input="updateParam(input.param_id, ($event.target as HTMLTextAreaElement).value, input.type)"
          />
          <div class="text-xs text-gray-400 mt-1">输入逗号分隔的值</div>
        </template>
        
        <!-- 默认值提示 -->
        <div v-if="input.default !== undefined" class="text-xs text-gray-400 mt-1">
          默认值: {{ input.default }}
        </div>
      </div>
    </div>
    
    <!-- 可选参数 -->
    <div v-if="optionalParams.length > 0" class="space-y-3">
      <div class="text-sm font-medium text-gray-500">可选参数</div>
      
      <div 
        v-for="input in optionalParams" 
        :key="input.param_id"
        class="border border-dashed rounded-lg p-3 bg-gray-50"
      >
        <div class="flex items-center justify-between mb-1">
          <label class="text-sm text-gray-600 flex items-center gap-1">
            {{ input.label }}
            <span v-if="input.unit" class="text-gray-400 text-xs">({{ input.unit }})</span>
          </label>
        </div>
        
        <!-- 数值输入 -->
        <template v-if="input.type === 'float' || input.type === 'int'">
          <input
            :type="getInputType(input)"
            :step="getStep(input)"
            :min="getConstraint(input.param_id)?.min"
            :max="getConstraint(input.param_id)?.max"
            :value="localParams[input.param_id]"
            :disabled="disabled"
            :placeholder="input.default !== undefined ? String(input.default) : ''"
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            @input="updateParam(input.param_id, ($event.target as HTMLInputElement).value, input.type)"
          />
        </template>
        
        <!-- 字符串输入 -->
        <template v-else-if="input.type === 'string'">
          <input
            type="text"
            :value="localParams[input.param_id]"
            :disabled="disabled"
            :placeholder="input.default !== undefined ? String(input.default) : ''"
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            @input="updateParam(input.param_id, ($event.target as HTMLInputElement).value, input.type)"
          />
        </template>
        
        <!-- 数组输入 -->
        <template v-else-if="input.type === 'array'">
          <textarea
            :value="getArrayDisplayValue(localParams[input.param_id])"
            :disabled="disabled"
            rows="2"
            class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 font-mono"
            placeholder="逗号分隔的值列表"
            @input="updateParam(input.param_id, ($event.target as HTMLTextAreaElement).value, input.type)"
          />
        </template>
      </div>
    </div>
    
    <!-- 空状态 -->
    <div v-if="model.inputs.length === 0" class="text-center text-gray-400 py-8">
      该模型无需配置参数
    </div>
  </div>
</template>
