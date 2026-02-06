<script setup lang="ts">
/**
 * 放大器类型编辑对话框
 * 
 * 按甲方需求包含：
 * - 基础参数（额定增益、噪声系数、输出功率等）
 * - 工作模式选择（固定增益/固定输出功率/APC）
 * - 单价与货币
 * - EDFA 模型参数抽屉
 */

import { ref, watch, computed } from 'vue'
import { Button, Input, Select } from '@/shared/components/base'
import { ChevronDown, ChevronRight, X } from 'lucide-vue-next'
import type { AmplifierType } from '@/types/settings'

const props = defineProps<{
  visible: boolean
  amplifier?: AmplifierType | null
  isNew?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', amplifier: AmplifierType): void
}>()

// 折叠状态
const expandedDrawers = ref<Set<string>>(new Set())

// 表单数据
const formData = ref<AmplifierType>({
  id: '',
  name: '',
  gain: 20,
  bandwidth: 1550,
  gainFlatness: 0.5,
  noiseFigure: 5,
  pumpPower: 100,
  outputPower: 20,
  saturationPower: 20,
  gainRangePower: 0.1,
  operatingMode: 'fixed_gain',
  unitPrice: 180000,
  currency: 'USD',
  modelDrawers: {
    simpleParams: {
      fixedGain: true,
      targetGain: 20
    },
    fullParams: {
      operatingMode: 'fixed_gain',
      targetValue: 20,
      gainFlattening: true,
      transientTime: 0.5
    }
  }
})

// 工作模式选项
const operatingModeOptions = [
  { value: 'fixed_gain', label: '固定增益' },
  { value: 'fixed_output', label: '固定输出功率' },
  { value: 'apc', label: '自动功率控制（APC）' }
]

// 货币选项
const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'EUR', label: 'EUR' }
]

// 初始化表单
watch(() => props.visible, (visible) => {
  if (visible) {
    if (props.amplifier) {
      formData.value = JSON.parse(JSON.stringify(props.amplifier))
      // 确保 modelDrawers 存在
      if (!formData.value.modelDrawers) {
        formData.value.modelDrawers = {
          simpleParams: { fixedGain: true, targetGain: 20 },
          fullParams: { operatingMode: 'fixed_gain', targetValue: 20, gainFlattening: true, transientTime: 0.5 }
        }
      }
    } else {
      // 新建时生成 ID
      formData.value = {
        id: `amp-${Date.now()}`,
        name: '',
        gain: 20,
        bandwidth: 1550,
        gainFlatness: 0.5,
        noiseFigure: 5,
        pumpPower: 100,
        outputPower: 20,
        saturationPower: 20,
        gainRangePower: 0.1,
        operatingMode: 'fixed_gain',
        unitPrice: 180000,
        currency: 'USD',
        modelDrawers: {
          simpleParams: { fixedGain: true, targetGain: 20 },
          fullParams: { operatingMode: 'fixed_gain', targetValue: 20, gainFlattening: true, transientTime: 0.5 }
        }
      }
    }
    expandedDrawers.value.clear()
  }
}, { immediate: true })

// 切换抽屉
const toggleDrawer = (name: string) => {
  if (expandedDrawers.value.has(name)) {
    expandedDrawers.value.delete(name)
  } else {
    expandedDrawers.value.add(name)
  }
}

// 保存
const handleSave = () => {
  if (!formData.value.name.trim()) {
    return
  }
  emit('save', formData.value)
}

const title = computed(() => props.isNew ? '新增放大器类型' : '编辑放大器类型')
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      
      <div class="relative bg-white rounded-lg shadow-2xl w-[600px] max-h-[90vh] flex flex-col">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h2 class="text-lg font-semibold text-gray-800">{{ title }}</h2>
          <button @click="emit('close')" class="p-1 hover:bg-gray-100 rounded">
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <!-- 内容区域 -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <!-- 基本信息 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">器件名称 <span class="text-red-500">*</span></label>
            <Input v-model="formData.name" placeholder="如 EDFA01" />
          </div>
          
          <!-- 基础参数 -->
          <div class="border rounded-lg p-4 bg-gray-50">
            <h3 class="font-medium text-gray-800 mb-4">【基础参数】</h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-600 mb-1">额定增益</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.gain" type="number" step="0.5" class="flex-1" />
                  <span class="text-sm text-gray-500">dB</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">噪声系数 NF</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.noiseFigure" type="number" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-500">dB</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">最大输出功率</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.outputPower" type="number" step="0.5" class="flex-1" />
                  <span class="text-sm text-gray-500">dBm</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">饱和功率</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.saturationPower" type="number" step="0.5" class="flex-1" />
                  <span class="text-sm text-gray-500">dBm</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">平坦度</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.gainFlatness" type="number" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-500">dB</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">单价</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.unitPrice" type="number" step="1000" class="flex-1" />
                  <Select v-model="formData.currency" :options="currencyOptions" class="w-24" />
                </div>
              </div>
            </div>
          </div>
          
          <!-- 工作模式 -->
          <div class="border rounded-lg p-4">
            <h3 class="font-medium text-gray-800 mb-4">工作模式（可选，默认固定增益）</h3>
            <div class="space-y-2">
              <label 
                v-for="mode in operatingModeOptions" 
                :key="mode.value"
                class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input 
                  type="radio" 
                  :value="mode.value" 
                  v-model="formData.operatingMode"
                  class="text-blue-600"
                />
                <span class="text-sm text-gray-700">{{ mode.label }}</span>
              </label>
            </div>
          </div>
          
          <!-- EDFA_Model_1 参数抽屉（简化模型） -->
          <div class="border rounded-lg overflow-hidden">
            <button 
              class="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-150 transition-colors"
              @click="toggleDrawer('simple')"
            >
              <span class="font-medium text-gray-700">▶ EDFA_Simple 模型参数（点击展开）</span>
              <component :is="expandedDrawers.has('simple') ? ChevronDown : ChevronRight" class="w-5 h-5 text-gray-500" />
            </button>
            <div v-show="expandedDrawers.has('simple')" class="p-4 bg-white border-t space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="flex items-center gap-2 text-sm text-gray-600">
                    <input 
                      type="checkbox" 
                      v-model="formData.modelDrawers!.simpleParams!.fixedGain"
                      class="rounded text-blue-600"
                    />
                    固定增益模式
                  </label>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">目标增益</label>
                  <div class="flex items-center gap-2">
                    <Input v-model.number="formData.modelDrawers!.simpleParams!.targetGain" type="number" step="0.5" class="flex-1" />
                    <span class="text-sm text-gray-500">dB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- EDFA_Model_2 参数抽屉（完整模型） -->
          <div class="border rounded-lg overflow-hidden">
            <button 
              class="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-150 transition-colors"
              @click="toggleDrawer('full')"
            >
              <span class="font-medium text-gray-700">▶ EDFA_Full 模型参数（点击展开）</span>
              <component :is="expandedDrawers.has('full') ? ChevronDown : ChevronRight" class="w-5 h-5 text-gray-500" />
            </button>
            <div v-show="expandedDrawers.has('full')" class="p-4 bg-white border-t space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">工作模式</label>
                  <Select 
                    v-model="formData.modelDrawers!.fullParams!.operatingMode" 
                    :options="operatingModeOptions"
                  />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">目标值</label>
                  <div class="flex items-center gap-2">
                    <Input v-model.number="formData.modelDrawers!.fullParams!.targetValue" type="number" step="0.5" class="flex-1" />
                    <span class="text-sm text-gray-500">dB/dBm</span>
                  </div>
                </div>
                <div>
                  <label class="flex items-center gap-2 text-sm text-gray-600">
                    <input 
                      type="checkbox" 
                      v-model="formData.modelDrawers!.fullParams!.gainFlattening"
                      class="rounded text-blue-600"
                    />
                    增益谱平坦化
                  </label>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">瞬态响应时间</label>
                  <div class="flex items-center gap-2">
                    <Input v-model.number="formData.modelDrawers!.fullParams!.transientTime" type="number" step="0.1" class="flex-1" />
                    <span class="text-sm text-gray-500">ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 底部按钮 -->
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <Button variant="outline" @click="emit('close')">取消</Button>
          <Button @click="handleSave" :disabled="!formData.name.trim()">保存</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
