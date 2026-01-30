<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button, Tooltip } from '@/shared/components/base'
import { Cpu, Radio, Zap, GitBranch, AlertTriangle, CheckCircle, X, Save, Settings } from 'lucide-vue-next'
import { useSettingsStore, useAppStore } from '@/stores'
import type { FiberSimModel, EDFAModel, BUModel, SimulationModelConfig } from '@/types/systemPlanning'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', config: SimulationModelConfig): void
}>()

const settingsStore = useSettingsStore()
const appStore = useAppStore()

// 本地配置状态
const config = ref<SimulationModelConfig>({
  fiberModel: settingsStore.simulationModelConfig.fiberModel || 'GN',
  edfaModel: settingsStore.simulationModelConfig.edfaModel || 'EDFA_Simple',
  buModel: settingsStore.simulationModelConfig.buModel || 'BU_Fixed',
  saveAsTemplate: false,
  templateName: '',
})

// 光纤传输模型选项
const fiberModelOptions: Array<{ value: FiberSimModel; label: string; description: string }> = [
  { value: 'GN', label: 'GN 模型', description: '高斯噪声模型，计算速度快，适用于长距离传输' },
  { value: 'EGN', label: 'EGN 模型', description: '增强高斯噪声模型，考虑更多非线性效应' },
  { value: 'SSFM', label: 'SSFM 模型', description: '分步傅里叶方法，高精度仿真，计算量大' },
]

// EDFA 模型选项
const edfaModelOptions: Array<{ value: EDFAModel; label: string; description: string }> = [
  { value: 'EDFA_Simple', label: '简化模型', description: '固定增益/噪声系数，计算快速' },
  { value: 'EDFA_Full', label: '完整模型', description: '考虑增益谱形状、ASE噪声特性' },
  { value: 'EDFA_Raman', label: 'Raman 增强', description: '混合 EDFA+Raman 放大' },
]

// BU 模型选项
const buModelOptions: Array<{ value: BUModel; label: string; description: string }> = [
  { value: 'BU_Fixed', label: '固定插损', description: '使用固定的主干/分支插损值' },
  { value: 'BU_WavelengthDependent', label: '波长相关', description: '考虑波长相关的插损特性' },
]

// 参数完整性检查
const parameterCheck = computed(() => {
  const issues: string[] = []
  const warnings: string[] = []
  
  // 检查光纤参数
  if (settingsStore.fiberTypes.length === 0) {
    issues.push('未导入光纤参数，请先在器件库中添加光纤类型')
  } else {
    const selectedModel = config.value.fiberModel
    const fiberWithModel = settingsStore.fiberTypes.filter(f => 
      f.modelDrawers?.[`${selectedModel.toLowerCase()}Params` as keyof typeof f.modelDrawers]
    )
    if (fiberWithModel.length === 0) {
      warnings.push(`当前光纤未配置 ${selectedModel} 模型参数，将使用默认值`)
    }
  }
  
  // 检查放大器参数
  if (settingsStore.amplifierTypes.length === 0) {
    issues.push('未导入放大器参数，请先在器件库中添加放大器类型')
  }
  
  // SSFM 模型警告
  if (config.value.fiberModel === 'SSFM') {
    warnings.push('SSFM 模型计算量大，长链路可能需要较长时间')
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    warnings,
  }
})

// 已保存的模板
const savedTemplates = computed(() => settingsStore.savedSimulationTemplates)

// 应用模板
const applyTemplate = (template: SimulationModelConfig) => {
  config.value = { ...template, saveAsTemplate: false }
  appStore.showNotification({ type: 'info', message: `已应用模板: ${template.templateName}` })
}

// 保存当前配置为模板
const saveCurrentAsTemplate = () => {
  if (!config.value.templateName) {
    appStore.showNotification({ type: 'warning', message: '请输入模板名称' })
    return
  }
  
  settingsStore.saveSimulationTemplate({
    ...config.value,
    saveAsTemplate: true,
  })
  
  appStore.showNotification({ type: 'success', message: `模板 "${config.value.templateName}" 已保存` })
  config.value.saveAsTemplate = false
  config.value.templateName = ''
}

// 确认选择
const handleConfirm = () => {
  settingsStore.updateSimulationModelConfig(config.value)
  emit('confirm', config.value)
  emit('close')
  appStore.addLog('INFO', `选择仿真模型: 光纤=${config.value.fiberModel}, EDFA=${config.value.edfaModel}`)
}

// 监听打开状态，重置为当前配置
watch(() => props.visible, (visible) => {
  if (visible) {
    config.value = {
      ...settingsStore.simulationModelConfig,
      saveAsTemplate: false,
      templateName: '',
    }
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <Cpu class="w-5 h-5 text-blue-500" />
            选择仿真模型
          </h3>
          <button class="p-1.5 hover:bg-gray-200 rounded transition-colors" @click="emit('close')">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <!-- 内容 -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- 已保存模板 -->
          <div v-if="savedTemplates.length > 0" class="bg-blue-50 rounded-lg p-3">
            <div class="text-sm font-medium text-blue-700 mb-2">快速应用已保存模板</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="template in savedTemplates"
                :key="template.templateName"
                class="px-3 py-1.5 text-sm bg-white border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                @click="applyTemplate(template)"
              >
                {{ template.templateName }}
              </button>
            </div>
          </div>
          
          <!-- 光纤传输模型 -->
          <div class="border rounded-lg p-4">
            <div class="flex items-center gap-2 mb-3">
              <Radio class="w-4 h-4 text-blue-500" />
              <span class="font-medium text-gray-700">光纤传输计算模型</span>
            </div>
            <div class="space-y-2">
              <label
                v-for="option in fiberModelOptions"
                :key="option.value"
                class="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                :class="config.fiberModel === option.value ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'"
              >
                <input
                  v-model="config.fiberModel"
                  type="radio"
                  :value="option.value"
                  class="mt-0.5"
                />
                <div>
                  <div class="font-medium text-gray-800">{{ option.label }}</div>
                  <div class="text-sm text-gray-500">{{ option.description }}</div>
                </div>
              </label>
            </div>
          </div>

          <!-- EDFA 性能模型 -->
          <div class="border rounded-lg p-4">
            <div class="flex items-center gap-2 mb-3">
              <Zap class="w-4 h-4 text-purple-500" />
              <span class="font-medium text-gray-700">EDFA 性能模型</span>
            </div>
            <div class="space-y-2">
              <label
                v-for="option in edfaModelOptions"
                :key="option.value"
                class="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                :class="config.edfaModel === option.value ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-50 border border-transparent'"
              >
                <input
                  v-model="config.edfaModel"
                  type="radio"
                  :value="option.value"
                  class="mt-0.5"
                />
                <div>
                  <div class="font-medium text-gray-800">{{ option.label }}</div>
                  <div class="text-sm text-gray-500">{{ option.description }}</div>
                </div>
              </label>
            </div>
          </div>

          <!-- BU 插损模型 -->
          <div class="border rounded-lg p-4">
            <div class="flex items-center gap-2 mb-3">
              <GitBranch class="w-4 h-4 text-green-500" />
              <span class="font-medium text-gray-700">BU 插损模型</span>
            </div>
            <div class="space-y-2">
              <label
                v-for="option in buModelOptions"
                :key="option.value"
                class="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                :class="config.buModel === option.value ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50 border border-transparent'"
              >
                <input
                  v-model="config.buModel"
                  type="radio"
                  :value="option.value"
                  class="mt-0.5"
                />
                <div>
                  <div class="font-medium text-gray-800">{{ option.label }}</div>
                  <div class="text-sm text-gray-500">{{ option.description }}</div>
                </div>
              </label>
            </div>
          </div>

          <!-- 参数完整性检查 -->
          <div v-if="!parameterCheck.isValid || parameterCheck.warnings.length > 0" class="space-y-2">
            <div v-for="issue in parameterCheck.issues" :key="issue" 
                 class="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{{ issue }}</span>
            </div>
            <div v-for="warning in parameterCheck.warnings" :key="warning"
                 class="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 rounded-lg p-3">
              <AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{{ warning }}</span>
            </div>
          </div>
          
          <div v-else class="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg p-3">
            <CheckCircle class="w-4 h-4" />
            <span>参数配置完整，可以开始计算</span>
          </div>

          <!-- 保存为模板 -->
          <div class="border rounded-lg p-4">
            <div class="flex items-center gap-2 mb-3">
              <Save class="w-4 h-4 text-gray-500" />
              <span class="font-medium text-gray-700">保存为模板</span>
            </div>
            <div class="flex gap-2">
              <input
                v-model="config.templateName"
                type="text"
                placeholder="输入模板名称..."
                class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <Button variant="outline" size="sm" @click="saveCurrentAsTemplate">
                <Save class="w-4 h-4 mr-1" /> 保存
              </Button>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-4 py-3 border-t bg-gray-50 flex justify-between">
          <Button variant="outline" size="sm" @click="$router.push('/device-library')">
            <Settings class="w-4 h-4 mr-1" /> 器件库配置
          </Button>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="emit('close')">取消</Button>
            <Button size="sm" @click="handleConfirm" :disabled="!parameterCheck.isValid">
              <Cpu class="w-4 h-4 mr-1" /> 确认并计算
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
