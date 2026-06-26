<script setup lang="ts">
/**
 * 系统规划一站式配置向导
 * 
 * 流程：
 * Step 1: 选择规划链路 (路由 + RPL)
 * Step 2: 选择性能计算模型
 * Step 3: 配置光纤器件与模型参数
 * Step 4: 配置放大器器件与模型参数
 * Step 5: 配置 WDM 系统参数
 * Step 6: 参数完整性校验 → 开始计算
 */

import { useRouteStore } from '@/stores/route'
import { ref, computed, watch } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import { useSettingsStore } from '@/stores/settings'
import { useRPLStore } from '@/stores/rpl'
import { 
  ChevronLeft, ChevronRight, Check, AlertCircle, 
  MapPin, Cpu, Cable, Radio, Waves, PlayCircle,
  CheckCircle2, XCircle
} from 'lucide-vue-next'
import type { FiberParams, AmplifierParams, ModulationFormat, FECType } from '@/types/simulation'
import { getFiberParamsFromLibrary, getAmplifierParamsFromLibrary } from '@/services/DeviceParamsService'
import {
  getDeviceLibrariesByCategory,
  type RuntimeAmplifierLibrary,
  type RuntimeFiberLibrary,
  toRuntimeAmplifierLibrary,
  toRuntimeFiberLibrary,
} from '@/services/platform/deviceRuntime'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'start-calculation', config: WizardConfig): void
}>()

// 向导配置输出
export interface WizardConfig {
  routeId: string
  rplId: string
  simulationModel: 'GN' | 'EGN' | 'SSFM'
  fiberTypeId: string
  fiberParams: FiberParams
  amplifierTypeId: string
  amplifierParams: AmplifierParams
  wdmParams: {
    channelCount: number
    channelSpacingGHz: number
    launchPower: number
    modulation: string
    fecType: string
  }
  spanScanConfig: {
    spanLengthMinKm: number
    spanLengthMaxKm: number
    spanStepKm: number
  }
}

const settingsStore = useSettingsStore()
const routeStore = useRouteStore()
const rplStore = useRPLStore()

const platformFiberLibraries = computed(() =>
  getDeviceLibrariesByCategory(settingsStore.platformDeviceLibraries, 'fiber')
    .map(toRuntimeFiberLibrary)
    .filter((item): item is RuntimeFiberLibrary => Boolean(item)),
)

const platformAmplifierLibraries = computed(() =>
  getDeviceLibrariesByCategory(settingsStore.platformDeviceLibraries, 'amplifier')
    .map(toRuntimeAmplifierLibrary)
    .filter((item): item is RuntimeAmplifierLibrary => Boolean(item)),
)

// 当前步骤
const currentStep = ref(1)
const totalSteps = 6

// Step 1: 链路选择
const selectedRouteId = ref(routeStore.currentRouteId || '')
const selectedRplId = ref(rplStore.currentTableId || '')

// Step 2: 仿真模型
const selectedModel = ref<'GN' | 'EGN' | 'SSFM'>('GN')

// Step 3: 光纤配置
const selectedFiberTypeId = ref('')
const fiberParams = ref<FiberParams>({
  type: 'G.654.E',
  attenuation: 0.16,
  dispersion: 17,
  dispersionSlope: 0.06,
  effectiveArea: 80,
  nonlinearIndex: 1.3e-20,
  nonlinearCoeff: 0.8
})

// Step 4: 放大器配置
const selectedAmplifierTypeId = ref('')
const amplifierParams = ref<AmplifierParams>({
  type: 'EDFA',
  noiseFigure: 5,
  gain: 16,
  maxOutputPower: 17,
  gainFlatness: 1,
  band: 'C'
})

// Step 5: WDM 参数
const wdmParams = ref({
  channelCount: 96,
  channelSpacingGHz: 50,
  launchPower: 0,
  modulation: 'DP-16QAM',
  fecType: 'SD-FEC'
})

// Span 扫描配置
const spanScanConfig = ref({
  spanLengthMinKm: 40,
  spanLengthMaxKm: 120,
  spanStepKm: 5
})

// 初始化配置
watch(() => props.visible, async (visible) => {
  if (visible) {
    if (settingsStore.platformDeviceLibraries.length === 0) {
      await settingsStore.loadPlatformDeviceLibraries()
    }

    // 从 store 加载当前配置
    selectedRouteId.value = routeStore.currentRouteId || ''
    selectedRplId.value = rplStore.currentTableId || ''
    
    // 加载系统规划配置
    const spConfig = settingsStore.systemPlanningConfig
    if (spConfig) {
      if (spConfig.wdmParams) {
        wdmParams.value = {
          channelCount: spConfig.wdmParams.channelCount || 96,
          channelSpacingGHz: spConfig.wdmParams.channelSpacingGHz || 50,
          launchPower: spConfig.wdmParams.launchPower || 0,
          modulation: spConfig.wdmParams.modulation || 'DP-16QAM',
          fecType: spConfig.wdmParams.fecType || 'SD-FEC'
        }
      }
      if (spConfig.spanScanConfig) {
        spanScanConfig.value = {
          spanLengthMinKm: spConfig.spanScanConfig.spanLengthMinKm || 40,
          spanLengthMaxKm: spConfig.spanScanConfig.spanLengthMaxKm || 120,
          spanStepKm: spConfig.spanScanConfig.spanStepKm || 5
        }
      }
    }
    
    // 加载器件库默认值
    if (platformFiberLibraries.value.length > 0) {
      selectedFiberTypeId.value = selectedFiberTypeId.value || platformFiberLibraries.value[0].id
      updateFiberParams()
    }
    if (platformAmplifierLibraries.value.length > 0) {
      selectedAmplifierTypeId.value = selectedAmplifierTypeId.value || platformAmplifierLibraries.value[0].id
      updateAmplifierParams()
    }
    
    currentStep.value = 1
  }
}, { immediate: true })

// 更新光纤参数
const updateFiberParams = () => {
  if (selectedFiberTypeId.value) {
    fiberParams.value = getFiberParamsFromLibrary(selectedFiberTypeId.value)
  }
}

// 更新放大器参数
const updateAmplifierParams = () => {
  if (selectedAmplifierTypeId.value) {
    amplifierParams.value = getAmplifierParamsFromLibrary(selectedAmplifierTypeId.value)
  }
}

watch(selectedFiberTypeId, updateFiberParams)
watch(selectedAmplifierTypeId, updateAmplifierParams)

// 路由选项
const routeOptions = computed(() => 
  routeStore.routes
    .filter(r => r.id)
    .map(r => ({ value: r.id, label: r.name }))
)

// RPL 选项
const rplOptions = computed(() => 
  rplStore.tables
    .filter(t => t.id)
    .map(t => ({ value: t.id, label: t.name }))
)

// 光纤类型选项
const fiberTypeOptions = computed(() => 
  platformFiberLibraries.value
    .filter(f => f.id)
    .map(f => ({
      value: f.id,
      label: `${f.name} (${f.fiberCategory || 'G.654.E'})`
    }))
)

// 放大器类型选项
const amplifierTypeOptions = computed(() => 
  platformAmplifierLibraries.value
    .filter(a => a.id)
    .map(a => ({
      value: a.id,
      label: `${a.name} (NF=${a.noiseFigure}dB)`
    }))
)

// 仿真模型选项
const modelOptions = [
  { value: 'GN', label: 'GN 模型 (高斯噪声)', desc: '适用于大多数场景，计算快速' },
  { value: 'EGN', label: 'EGN 模型 (增强高斯噪声)', desc: '考虑更多非线性效应，精度更高' },
  { value: 'SSFM', label: 'SSFM (分步傅里叶)', desc: '最精确，计算时间较长' }
]

// 调制格式选项
const modulationOptions = [
  { value: 'DP-QPSK', label: 'DP-QPSK (4bit/sym)' },
  { value: 'DP-8QAM', label: 'DP-8QAM (6bit/sym)' },
  { value: 'DP-16QAM', label: 'DP-16QAM (8bit/sym)' },
  { value: 'DP-32QAM', label: 'DP-32QAM (10bit/sym)' },
  { value: 'DP-64QAM', label: 'DP-64QAM (12bit/sym)' }
]

// FEC 类型选项
const fecOptions = [
  { value: 'HD-FEC', label: 'HD-FEC (硬判决)' },
  { value: 'SD-FEC', label: 'SD-FEC (软判决)' },
  { value: 'OFEC', label: 'OFEC (开放FEC)' }
]

// Step 6: 参数校验
const validationResults = computed(() => {
  const results: Array<{ key: string; label: string; valid: boolean; message: string }> = []
  
  // 1. 链路选择
  results.push({
    key: 'route',
    label: '规划链路',
    valid: !!selectedRouteId.value && !!selectedRplId.value,
    message: selectedRouteId.value && selectedRplId.value 
      ? `路由: ${routeStore.routes.find(r => r.id === selectedRouteId.value)?.name}`
      : '请选择路由和RPL表格'
  })
  
  // 2. 仿真模型
  results.push({
    key: 'model',
    label: '仿真模型',
    valid: !!selectedModel.value,
    message: `${modelOptions.find(m => m.value === selectedModel.value)?.label}`
  })
  
  // 3. 光纤器件
  const hasFiber = platformFiberLibraries.value.length > 0
  results.push({
    key: 'fiber',
    label: '光纤器件',
    valid: hasFiber,
    message: hasFiber 
      ? `${platformFiberLibraries.value.find(f => f.id === selectedFiberTypeId.value)?.name || '默认'} (α=${fiberParams.value.attenuation}dB/km)`
      : '器件库中无光纤类型，将使用默认参数'
  })
  
  // 4. 放大器器件
  const hasAmplifier = platformAmplifierLibraries.value.length > 0
  results.push({
    key: 'amplifier',
    label: '放大器器件',
    valid: hasAmplifier,
    message: hasAmplifier
      ? `${platformAmplifierLibraries.value.find(a => a.id === selectedAmplifierTypeId.value)?.name || '默认'} (NF=${amplifierParams.value.noiseFigure}dB)`
      : '器件库中无放大器类型，将使用默认参数'
  })
  
  // 5. WDM 参数
  results.push({
    key: 'wdm',
    label: 'WDM参数',
    valid: wdmParams.value.channelCount > 0,
    message: `${wdmParams.value.channelCount}波道, ${wdmParams.value.modulation}, ${wdmParams.value.channelSpacingGHz}GHz间隔`
  })
  
  // 6. Span 扫描范围
  const spanValid = spanScanConfig.value.spanLengthMinKm < spanScanConfig.value.spanLengthMaxKm
  results.push({
    key: 'span',
    label: 'Span扫描范围',
    valid: spanValid,
    message: spanValid 
      ? `${spanScanConfig.value.spanLengthMinKm}-${spanScanConfig.value.spanLengthMaxKm}km, 步长${spanScanConfig.value.spanStepKm}km`
      : '最小值必须小于最大值'
  })
  
  return results
})

// 是否可以开始计算
const canStartCalculation = computed(() => {
  // 必须选择路由和RPL
  if (!selectedRouteId.value || !selectedRplId.value) return false
  // Span 范围必须有效
  if (spanScanConfig.value.spanLengthMinKm >= spanScanConfig.value.spanLengthMaxKm) return false
  return true
})

// 步骤定义
const steps = [
  { num: 1, label: '选择链路', icon: MapPin },
  { num: 2, label: '仿真模型', icon: Cpu },
  { num: 3, label: '光纤配置', icon: Cable },
  { num: 4, label: '放大器配置', icon: Radio },
  { num: 5, label: 'WDM参数', icon: Waves },
  { num: 6, label: '确认计算', icon: PlayCircle }
]

// 导航
const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const goToStep = (step: number) => {
  currentStep.value = step
}

// 开始计算
const startCalculation = () => {
  if (!canStartCalculation.value) return
  
  // 同步选择到 store
  if (selectedRouteId.value && routeStore.currentRouteId !== selectedRouteId.value) {
    // 通过设置 currentRouteId 来切换路由
    const route = routeStore.routes.find(r => r.id === selectedRouteId.value)
    if (route) {
      routeStore.currentRouteId = selectedRouteId.value
    }
  }
  if (selectedRplId.value && rplStore.currentTableId !== selectedRplId.value) {
    // 通过设置 currentTableId 来切换 RPL
    const table = rplStore.tables.find(t => t.id === selectedRplId.value)
    if (table) {
      rplStore.currentTableId = selectedRplId.value
    }
  }
  
  // 保存配置到 settingsStore
  settingsStore.updateSystemPlanningConfig({
    wdmParams: {
      channelCount: wdmParams.value.channelCount,
      channelSpacingGHz: wdmParams.value.channelSpacingGHz,
      launchPower: wdmParams.value.launchPower,
      modulation: wdmParams.value.modulation as ModulationFormat,
      fecType: wdmParams.value.fecType as FECType,
      centerFreqTHz: 193.1,
      baudRateGbaud: 64,
    },
    spanScanConfig: {
      ...spanScanConfig.value,
      targetGsnrDb: 12,
      marginDb: 3
    }
  })
  
  const config: WizardConfig = {
    routeId: selectedRouteId.value,
    rplId: selectedRplId.value,
    simulationModel: selectedModel.value,
    fiberTypeId: selectedFiberTypeId.value,
    fiberParams: fiberParams.value,
    amplifierTypeId: selectedAmplifierTypeId.value,
    amplifierParams: amplifierParams.value,
    wdmParams: wdmParams.value,
    spanScanConfig: spanScanConfig.value
  }
  
  emit('start-calculation', config)
  emit('close')
}

const close = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/50" @click="close" />
      
      <!-- 向导面板 -->
      <div class="relative bg-white rounded-xl shadow-2xl w-[800px] max-h-[90vh] flex flex-col overflow-hidden">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h2 class="text-lg font-semibold text-white">系统规划配置向导</h2>
            <p class="text-sm text-blue-100">完成以下配置后开始 Span 性能扫描计算</p>
          </div>
          <button @click="close" class="text-white/80 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <!-- 步骤指示器 -->
        <div class="px-6 py-4 border-b bg-gray-50">
          <div class="flex items-center justify-between">
            <template v-for="(step, index) in steps" :key="step.num">
              <button 
                class="flex flex-col items-center gap-1 group"
                :class="{ 'cursor-pointer': true }"
                @click="goToStep(step.num)"
              >
                <div 
                  class="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  :class="{
                    'bg-blue-600 text-white': currentStep === step.num,
                    'bg-green-500 text-white': currentStep > step.num,
                    'bg-gray-200 text-gray-500 group-hover:bg-gray-300': currentStep < step.num
                  }"
                >
                  <Check v-if="currentStep > step.num" class="w-5 h-5" />
                  <component v-else :is="step.icon" class="w-5 h-5" />
                </div>
                <span 
                  class="text-xs font-medium"
                  :class="{
                    'text-blue-600': currentStep === step.num,
                    'text-green-600': currentStep > step.num,
                    'text-gray-500': currentStep < step.num
                  }"
                >
                  {{ step.label }}
                </span>
              </button>
              <div 
                v-if="index < steps.length - 1"
                class="flex-1 h-0.5 mx-2"
                :class="{
                  'bg-green-500': currentStep > step.num,
                  'bg-gray-200': currentStep <= step.num
                }"
              />
            </template>
          </div>
        </div>
        
        <!-- 步骤内容 -->
        <div class="flex-1 overflow-y-auto p-6">
          <!-- Step 1: 选择链路 -->
          <div v-show="currentStep === 1" class="space-y-6">
            <div class="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <MapPin class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 class="font-medium text-blue-900">选择规划链路</h3>
                <p class="text-sm text-blue-700">选择要进行系统规划的路由和对应的 RPL 路由表</p>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">路由</label>
                <Select 
                  v-model="selectedRouteId" 
                  :options="routeOptions"
                  placeholder="选择路由..."
                />
                <p v-if="routeOptions.length === 0" class="mt-2 text-sm text-amber-600">
                  <AlertCircle class="w-4 h-4 inline mr-1" />
                  暂无路由，请先在路由规划中创建
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">RPL 路由表</label>
                <Select 
                  v-model="selectedRplId" 
                  :options="rplOptions"
                  placeholder="选择RPL表格..."
                />
                <p v-if="rplOptions.length === 0" class="mt-2 text-sm text-amber-600">
                  <AlertCircle class="w-4 h-4 inline mr-1" />
                  暂无 RPL 表格，请先导入路由数据
                </p>
              </div>
            </div>
            
            <!-- 链路信息预览 -->
            <div v-if="selectedRouteId && selectedRplId" class="p-4 bg-gray-50 rounded-lg">
              <h4 class="text-sm font-medium text-gray-700 mb-2">链路信息</h4>
              <div class="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span class="text-gray-500">总长度:</span>
                  <span class="ml-2 font-medium">{{ rplStore.currentTable?.metadata?.totalLength?.toFixed(1) || '-' }} km</span>
                </div>
                <div>
                  <span class="text-gray-500">RPL点数:</span>
                  <span class="ml-2 font-medium">{{ rplStore.currentTable?.records?.length || 0 }}</span>
                </div>
                <div>
                  <span class="text-gray-500">路由点数:</span>
                  <span class="ml-2 font-medium">{{ routeStore.selectedRoute?.points?.length || 0 }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Step 2: 仿真模型 -->
          <div v-show="currentStep === 2" class="space-y-6">
            <div class="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Cpu class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 class="font-medium text-blue-900">选择仿真模型</h3>
                <p class="text-sm text-blue-700">选择用于计算光纤非线性损伤的仿真模型</p>
              </div>
            </div>
            
            <div class="space-y-3">
              <label
                v-for="option in modelOptions"
                :key="option.value"
                class="flex items-start p-4 border rounded-lg cursor-pointer transition-all"
                :class="{
                  'border-blue-500 bg-blue-50': selectedModel === option.value,
                  'border-gray-200 hover:border-gray-300': selectedModel !== option.value
                }"
              >
                <input 
                  type="radio" 
                  :value="option.value" 
                  v-model="selectedModel"
                  class="mt-1 text-blue-600"
                />
                <div class="ml-3">
                  <div class="font-medium text-gray-900">{{ option.label }}</div>
                  <div class="text-sm text-gray-500">{{ option.desc }}</div>
                </div>
              </label>
            </div>
          </div>
          
          <!-- Step 3: 光纤配置 -->
          <div v-show="currentStep === 3" class="space-y-6">
            <div class="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Cable class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 class="font-medium text-blue-900">光纤器件配置</h3>
                <p class="text-sm text-blue-700">选择光纤类型并配置相关参数</p>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">光纤类型</label>
              <Select 
                v-model="selectedFiberTypeId" 
                :options="fiberTypeOptions"
                placeholder="选择光纤类型..."
              />
              <p v-if="fiberTypeOptions.length === 0" class="mt-2 text-sm text-amber-600">
                <AlertCircle class="w-4 h-4 inline mr-1" />
                器件库中无光纤类型，将使用默认参数
              </p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">衰减系数 (dB/km)</label>
                <Input v-model.number="fiberParams.attenuation" type="number" step="0.01" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">色散系数 (ps/nm/km)</label>
                <Input v-model.number="fiberParams.dispersion" type="number" step="0.1" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">有效面积 (μm²)</label>
                <Input v-model.number="fiberParams.effectiveArea" type="number" step="1" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">非线性系数 (1/W/km)</label>
                <Input v-model.number="fiberParams.nonlinearCoeff" type="number" step="0.01" />
              </div>
            </div>
          </div>
          
          <!-- Step 4: 放大器配置 -->
          <div v-show="currentStep === 4" class="space-y-6">
            <div class="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Radio class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 class="font-medium text-blue-900">放大器器件配置</h3>
                <p class="text-sm text-blue-700">选择放大器类型并配置相关参数</p>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">放大器类型</label>
              <Select 
                v-model="selectedAmplifierTypeId" 
                :options="amplifierTypeOptions"
                placeholder="选择放大器类型..."
              />
              <p v-if="amplifierTypeOptions.length === 0" class="mt-2 text-sm text-amber-600">
                <AlertCircle class="w-4 h-4 inline mr-1" />
                器件库中无放大器类型，将使用默认参数
              </p>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">噪声系数 NF (dB)</label>
                <Input v-model.number="amplifierParams.noiseFigure" type="number" step="0.1" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">增益 (dB)</label>
                <Input v-model.number="amplifierParams.gain" type="number" step="0.5" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">最大输出功率 (dBm)</label>
                <Input v-model.number="amplifierParams.maxOutputPower" type="number" step="0.5" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">增益平坦度 (dB)</label>
                <Input v-model.number="amplifierParams.gainFlatness" type="number" step="0.1" />
              </div>
            </div>
          </div>
          
          <!-- Step 5: WDM 参数 -->
          <div v-show="currentStep === 5" class="space-y-6">
            <div class="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <Waves class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 class="font-medium text-blue-900">WDM 系统参数</h3>
                <p class="text-sm text-blue-700">配置波分复用传输系统参数</p>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">波道数量</label>
                <Input v-model.number="wdmParams.channelCount" type="number" min="1" max="192" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">信道间隔 (GHz)</label>
                <Select 
                  :model-value="String(wdmParams.channelSpacingGHz)" 
                  @update:model-value="(v: string) => wdmParams.channelSpacingGHz = Number(v)"
                  :options="[
                    { value: '25', label: '25 GHz' },
                    { value: '50', label: '50 GHz' },
                    { value: '75', label: '75 GHz' },
                    { value: '100', label: '100 GHz' }
                  ]"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">发射功率 (dBm/ch)</label>
                <Input v-model.number="wdmParams.launchPower" type="number" step="0.5" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">调制格式</label>
                <Select v-model="wdmParams.modulation" :options="modulationOptions" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">FEC 类型</label>
                <Select v-model="wdmParams.fecType" :options="fecOptions" />
              </div>
            </div>
            
            <div class="border-t pt-4">
              <h4 class="text-sm font-medium text-gray-700 mb-3">Span 扫描范围</h4>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">最小 Span (km)</label>
                  <Input v-model.number="spanScanConfig.spanLengthMinKm" type="number" min="20" max="100" />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">最大 Span (km)</label>
                  <Input v-model.number="spanScanConfig.spanLengthMaxKm" type="number" min="50" max="200" />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">扫描步长 (km)</label>
                  <Input v-model.number="spanScanConfig.spanStepKm" type="number" min="1" max="20" />
                </div>
              </div>
            </div>
          </div>
          
          <!-- Step 6: 参数校验 -->
          <div v-show="currentStep === 6" class="space-y-6">
            <div class="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
              <PlayCircle class="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 class="font-medium text-blue-900">参数确认</h3>
                <p class="text-sm text-blue-700">检查以下配置，确认无误后开始计算</p>
              </div>
            </div>
            
            <div class="space-y-3">
              <div 
                v-for="result in validationResults" 
                :key="result.key"
                class="flex items-center justify-between p-3 rounded-lg"
                :class="result.valid ? 'bg-green-50' : 'bg-amber-50'"
              >
                <div class="flex items-center gap-3">
                  <CheckCircle2 v-if="result.valid" class="w-5 h-5 text-green-600" />
                  <AlertCircle v-else class="w-5 h-5 text-amber-600" />
                  <span class="font-medium text-gray-700">{{ result.label }}</span>
                </div>
                <span class="text-sm" :class="result.valid ? 'text-green-700' : 'text-amber-700'">
                  {{ result.message }}
                </span>
              </div>
            </div>
            
            <div v-if="!canStartCalculation" class="p-4 bg-red-50 rounded-lg">
              <div class="flex items-center gap-2 text-red-700">
                <XCircle class="w-5 h-5" />
                <span class="font-medium">无法开始计算</span>
              </div>
              <p class="mt-1 text-sm text-red-600">请确保已选择路由和 RPL 表格，且 Span 扫描范围有效</p>
            </div>
          </div>
        </div>
        
        <!-- 底部按钮 -->
        <div class="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <Button 
            variant="outline" 
            @click="prevStep"
            :disabled="currentStep === 1"
          >
            <ChevronLeft class="w-4 h-4 mr-1" />
            上一步
          </Button>
          
          <div class="text-sm text-gray-500">
            步骤 {{ currentStep }} / {{ totalSteps }}
          </div>
          
          <Button 
            v-if="currentStep < totalSteps"
            @click="nextStep"
          >
            下一步
            <ChevronRight class="w-4 h-4 ml-1" />
          </Button>
          
          <Button 
            v-else
            :disabled="!canStartCalculation"
            @click="startCalculation"
            class="bg-green-600 hover:bg-green-700"
          >
            <PlayCircle class="w-4 h-4 mr-1" />
            开始计算
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
