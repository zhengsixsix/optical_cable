<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { ref, computed, watch } from 'vue'
import { Button, Select, Tooltip } from '@/shared/components/base'
import { Radio, Waves, Sliders, Calculator, RefreshCw, AlertTriangle, CheckCircle, X } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { MODULATION_PARAMS, type ModulationFormat } from '@/types/simulation'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'config-change', config: WDMConfig): void
  (e: 'calculate'): void
}>()

// WDM配置接口
interface WDMConfig {
  channelCount: number
  channelSpacing: number
  centerWavelength: number
  symbolRate: number
  modulationFormat: ModulationFormat
  launchPower: number
  fecType: 'HD-FEC' | 'SD-FEC' | 'OFEC' | 'None'
}

const settingsStore = useSettingsStore()
const appStore = useAppStore()

// 本地配置状态
const config = ref<WDMConfig>({
  channelCount: settingsStore.transmissionConfig.channelCount || 96,
  channelSpacing: settingsStore.transmissionConfig.channelBandwidth || 50,
  centerWavelength: settingsStore.transmissionConfig.centerWavelength || 1550,
  symbolRate: 64,
  modulationFormat: 'DP-16QAM',
  launchPower: 0,
  fecType: 'SD-FEC'
})

// 波道数量选项
const channelCountOptions = [
  { value: 48, label: '48 波道' },
  { value: 80, label: '80 波道' },
  { value: 96, label: '96 波道' },
  { value: 120, label: '120 波道' },
  { value: 160, label: '160 波道 (C+L)' },
]

// 信道间隔选项 (GHz)
const channelSpacingOptions = [
  { value: 25, label: '25 GHz (紧密)' },
  { value: 37.5, label: '37.5 GHz' },
  { value: 50, label: '50 GHz (标准)' },
  { value: 75, label: '75 GHz' },
  { value: 100, label: '100 GHz (宽松)' },
]

// 调制格式选项
const modulationOptions = [
  { value: 'QPSK', label: 'QPSK (2 bit/sym)' },
  { value: 'DP-QPSK', label: 'DP-QPSK (4 bit/sym)' },
  { value: '8QAM', label: '8QAM (3 bit/sym)' },
  { value: '16QAM', label: '16QAM (4 bit/sym)' },
  { value: 'DP-16QAM', label: 'DP-16QAM (8 bit/sym)' },
  { value: '32QAM', label: '32QAM (5 bit/sym)' },
  { value: '64QAM', label: '64QAM (6 bit/sym)' },
  { value: 'PCS-64QAM', label: 'PCS-64QAM (概率整形)' },
]

// FEC类型选项
const fecOptions = [
  { value: 'HD-FEC', label: 'HD-FEC (硬判决)' },
  { value: 'SD-FEC', label: 'SD-FEC (软判决)' },
  { value: 'OFEC', label: 'OFEC (开放FEC)' },
  { value: 'None', label: '无FEC' },
]

// 符号率选项 (GBaud)
const symbolRateOptions = [
  { value: 32, label: '32 GBaud' },
  { value: 45, label: '45 GBaud' },
  { value: 64, label: '64 GBaud' },
  { value: 96, label: '96 GBaud' },
  { value: 128, label: '128 GBaud' },
]

// 计算属性
const totalBandwidth = computed(() => {
  return config.value.channelCount * config.value.channelSpacing / 1000 // THz
})

const estimatedCapacity = computed(() => {
  const modParams = MODULATION_PARAMS[config.value.modulationFormat]
  if (!modParams) return 0
  
  const bitsPerSymbol = modParams.bitsPerSymbol
  const channelCapacity = config.value.symbolRate * bitsPerSymbol // Gbps per channel
  return (config.value.channelCount * channelCapacity / 1000).toFixed(1) // Tbps
})

const spectralEfficiency = computed(() => {
  const modParams = MODULATION_PARAMS[config.value.modulationFormat]
  return modParams?.spectralEfficiency || 0
})

const requiredGSNR = computed(() => {
  const modParams = MODULATION_PARAMS[config.value.modulationFormat]
  return modParams?.requiredGSNR || 12
})

const wavelengthRange = computed(() => {
  const halfBandwidth = totalBandwidth.value / 2 * 1000 / 125 // nm (approx)
  const center = config.value.centerWavelength
  return {
    start: (center - halfBandwidth).toFixed(1),
    end: (center + halfBandwidth).toFixed(1)
  }
})

// 配置验证
const validation = computed(() => {
  const issues: string[] = []
  const warnings: string[] = []
  
  if (config.value.channelCount > 96 && config.value.channelSpacing < 37.5) {
    warnings.push('高波道数配合窄间隔可能导致串扰')
  }
  
  if (['64QAM', 'PCS-64QAM'].includes(config.value.modulationFormat)) {
    warnings.push('高阶调制格式仅适用于短距离传输')
  }
  
  if (config.value.symbolRate > 64 && config.value.channelSpacing < 50) {
    issues.push('符号率过高，需要更大的信道间隔')
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    warnings
  }
})

// 应用配置
const applyConfig = () => {
  // 更新 transmissionConfig
  settingsStore.updateTransmissionConfig({
    channelCount: config.value.channelCount,
    channelBandwidth: config.value.channelSpacing,
    centerWavelength: config.value.centerWavelength,
  })
  
  // 同时更新 systemPlanningConfig.wdmParams（用于 Span 扫描）
  settingsStore.updateWDMPlanningParams({
    channelCount: config.value.channelCount,
    channelSpacingGHz: config.value.channelSpacing,
    baudRateGbaud: config.value.symbolRate,
    modulation: config.value.modulationFormat,
    fecType: config.value.fecType,
    launchPower: config.value.launchPower,
  })
  
  appStore.showNotification({ type: 'success', message: 'WDM参数已更新' })
  emit('config-change', config.value)
  emit('close')
}

// 重置配置
const resetConfig = () => {
  config.value = {
    channelCount: 96,
    channelSpacing: 50,
    centerWavelength: 1550,
    symbolRate: 64,
    modulationFormat: 'DP-16QAM',
    launchPower: 0,
    fecType: 'SD-FEC'
  }
  appStore.showNotification({ type: 'info', message: '已重置为默认参数' })
}

// 快速预设
const applyPreset = (preset: 'standard' | 'highCapacity' | 'longHaul') => {
  const presets = {
    standard: {
      channelCount: 96,
      channelSpacing: 50,
      symbolRate: 64,
      modulationFormat: 'DP-16QAM' as ModulationFormat,
      launchPower: 0,
      fecType: 'SD-FEC' as const
    },
    highCapacity: {
      channelCount: 160,
      channelSpacing: 37.5,
      symbolRate: 96,
      modulationFormat: 'PCS-64QAM' as ModulationFormat,
      launchPower: -1,
      fecType: 'OFEC' as const
    },
    longHaul: {
      channelCount: 80,
      channelSpacing: 50,
      symbolRate: 64,
      modulationFormat: 'DP-QPSK' as ModulationFormat,
      launchPower: 1,
      fecType: 'SD-FEC' as const
    }
  }
  
  Object.assign(config.value, presets[preset])
  appStore.showNotification({ type: 'info', message: `已应用${preset === 'standard' ? '标准' : preset === 'highCapacity' ? '高容量' : '长距离'}预设` })
}

// 应用并计算
const applyAndCalculate = () => {
  // 更新 transmissionConfig
  settingsStore.updateTransmissionConfig({
    channelCount: config.value.channelCount,
    channelBandwidth: config.value.channelSpacing,
    centerWavelength: config.value.centerWavelength,
  })
  
  // 同时更新 systemPlanningConfig.wdmParams
  settingsStore.updateWDMPlanningParams({
    channelCount: config.value.channelCount,
    channelSpacingGHz: config.value.channelSpacing,
    baudRateGbaud: config.value.symbolRate,
    modulation: config.value.modulationFormat,
    fecType: config.value.fecType,
    launchPower: config.value.launchPower,
  })
  
  emit('config-change', config.value)
  emit('calculate')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-[520px] max-h-[90vh] overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <Waves class="w-5 h-5 text-blue-500" />
            WDM参数配置
          </h3>
          <div class="flex items-center gap-2">
            <Tooltip content="重置参数">
              <button class="p-1.5 hover:bg-gray-200 rounded transition-colors" @click="resetConfig">
                <RefreshCw class="w-4 h-4 text-gray-500" />
              </button>
            </Tooltip>
            <button class="p-1.5 hover:bg-gray-200 rounded transition-colors" @click="emit('close')">
              <X class="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <!-- 内容 -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- 快速预设 -->
          <div class="flex gap-2">
            <button 
              class="flex-1 px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors"
              @click="applyPreset('standard')"
            >
              标准配置
            </button>
            <button 
              class="flex-1 px-3 py-2 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 rounded border border-purple-200 transition-colors"
              @click="applyPreset('highCapacity')"
            >
              高容量
            </button>
            <button 
              class="flex-1 px-3 py-2 text-sm bg-green-50 hover:bg-green-100 text-green-700 rounded border border-green-200 transition-colors"
              @click="applyPreset('longHaul')"
            >
              长距离
            </button>
          </div>
          
          <!-- 波道配置 -->
          <div class="space-y-3 border rounded-lg p-3">
            <div class="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Radio class="w-4 h-4 text-blue-500" />
              波道配置
            </div>
            
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">波道数量</label>
                <select 
                  v-model="config.channelCount"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option v-for="opt in channelCountOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              
              <div>
                <label class="block text-xs text-gray-500 mb-1">信道间隔</label>
                <select 
                  v-model="config.channelSpacing"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option v-for="opt in channelSpacingOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            
            <div>
              <label class="block text-xs text-gray-500 mb-1">中心波长 (nm)</label>
              <input 
                v-model.number="config.centerWavelength"
                type="number"
                min="1520"
                max="1620"
                step="1"
                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div class="text-xs text-gray-400 mt-1">
                波长范围: {{ wavelengthRange.start }} - {{ wavelengthRange.end }} nm
              </div>
            </div>
          </div>
          
          <!-- 调制与编码 -->
          <div class="space-y-3 border rounded-lg p-3">
            <div class="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Sliders class="w-4 h-4 text-purple-500" />
              调制与编码
            </div>
            
            <div>
              <label class="block text-xs text-gray-500 mb-1">调制格式</label>
              <select 
                v-model="config.modulationFormat"
                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option v-for="opt in modulationOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">符号率</label>
                <select 
                  v-model="config.symbolRate"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option v-for="opt in symbolRateOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              
              <div>
                <label class="block text-xs text-gray-500 mb-1">FEC类型</label>
                <select 
                  v-model="config.fecType"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option v-for="opt in fecOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="text-xs text-gray-500">发射功率</label>
                <span class="text-sm font-mono text-blue-600">{{ config.launchPower }} dBm</span>
              </div>
              <input 
                v-model.number="config.launchPower"
                type="range"
                min="-3"
                max="3"
                step="0.5"
                class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div class="flex justify-between text-xs text-gray-400">
                <span>-3 dBm</span>
                <span>+3 dBm</span>
              </div>
            </div>
          </div>
          
          <!-- 计算结果 -->
          <div class="bg-blue-50 rounded-lg p-4 space-y-3">
            <div class="text-sm font-medium text-blue-700 flex items-center gap-2">
              <Calculator class="w-4 h-4" />
              估算结果
            </div>
            
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="flex justify-between bg-white rounded px-3 py-2">
                <span class="text-gray-500">总带宽:</span>
                <span class="font-medium">{{ totalBandwidth.toFixed(2) }} THz</span>
              </div>
              <div class="flex justify-between bg-white rounded px-3 py-2">
                <span class="text-gray-500">频谱效率:</span>
                <span class="font-medium">{{ spectralEfficiency }} bit/s/Hz</span>
              </div>
              <div class="flex justify-between bg-white rounded px-3 py-2">
                <span class="text-gray-500">预估容量:</span>
                <span class="font-bold text-blue-600">{{ estimatedCapacity }} Tbps</span>
              </div>
              <div class="flex justify-between bg-white rounded px-3 py-2">
                <span class="text-gray-500">所需GSNR:</span>
                <span class="font-medium">{{ requiredGSNR }} dB</span>
              </div>
            </div>
          </div>
          
          <!-- 验证状态 -->
          <div v-if="!validation.isValid || validation.warnings.length > 0" class="space-y-2">
            <div v-for="issue in validation.issues" :key="issue" class="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{{ issue }}</span>
            </div>
            <div v-for="warning in validation.warnings" :key="warning" class="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 rounded-lg p-3">
              <AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{{ warning }}</span>
            </div>
          </div>
          
          <div v-else class="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg p-3">
            <CheckCircle class="w-4 h-4" />
            <span>配置有效</span>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="emit('close')">取消</Button>
          <Button variant="outline" size="sm" @click="applyConfig" :disabled="!validation.isValid">
            应用配置
          </Button>
          <Button size="sm" @click="applyAndCalculate" :disabled="!validation.isValid">
            <Calculator class="w-4 h-4 mr-1" />
            应用并计算GSNR
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
