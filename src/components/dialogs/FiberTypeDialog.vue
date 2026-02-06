<script setup lang="ts">
/**
 * 光纤类型编辑对话框
 * 
 * 按甲方需求包含：
 * - 基础物理参数（算法无关）
 * - GN 模型参数抽屉
 * - EGN 模型参数抽屉
 * - SSFM 模型参数抽屉
 */

import { ref, watch, computed } from 'vue'
import { Button, Input, Select } from '@/shared/components/base'
import { ChevronDown, ChevronRight, X } from 'lucide-vue-next'
import type { FiberType } from '@/types/settings'

const props = defineProps<{
  visible: boolean
  fiber?: FiberType | null
  isNew?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', fiber: FiberType): void
}>()

// 折叠状态
const expandedDrawers = ref<Set<string>>(new Set())

// 表单数据
const formData = ref<FiberType>({
  id: '',
  name: '',
  fiberCategory: 'G.654.E',
  attenuationCoeff: 0.16,
  dispersion: 21,
  dispersionSlope: 60,
  effectiveArea: 110,
  nonlinearRefractiveIndex: 2.6,
  nonlinearCoeff: 1.4,
  secondOrderDispersion: -21,
  simulationModel: 'GN',
  modelDrawers: {
    gnParams: {
      equivalentNoiseBandwidth: 12.5,
      coherentAccumulationFactor: 1.0
    },
    egnParams: {
      equivalentNoiseBandwidth: 12.5,
      coherentAccumulationFactor: 1.0,
      higherOrderDispersionFactor: 0.05,
      xpmEnhancementFactor: 0.8
    },
    ssfmParams: {
      stepSize: 100,
      maxIterations: 1000,
      samplePoints: 2048,
      nonlinearOrder: 3
    }
  }
})

// 光纤类型选项
const fiberCategoryOptions = [
  { value: 'G.652.D', label: 'G.652.D' },
  { value: 'G.654.E', label: 'G.654.E' },
  { value: 'G.655', label: 'G.655' },
  { value: 'G.656', label: 'G.656' }
]

// 初始化表单
watch(() => props.visible, (visible) => {
  if (visible) {
    if (props.fiber) {
      formData.value = JSON.parse(JSON.stringify(props.fiber))
      // 确保 modelDrawers 存在
      if (!formData.value.modelDrawers) {
        formData.value.modelDrawers = {
          gnParams: { equivalentNoiseBandwidth: 12.5, coherentAccumulationFactor: 1.0 },
          egnParams: { equivalentNoiseBandwidth: 12.5, coherentAccumulationFactor: 1.0, higherOrderDispersionFactor: 0.05, xpmEnhancementFactor: 0.8 },
          ssfmParams: { stepSize: 100, maxIterations: 1000, samplePoints: 2048, nonlinearOrder: 3 }
        }
      }
    } else {
      // 新建时生成 ID
      formData.value = {
        id: `fiber-${Date.now()}`,
        name: '',
        fiberCategory: 'G.654.E',
        attenuationCoeff: 0.16,
        dispersion: 21,
        dispersionSlope: 60,
        effectiveArea: 110,
        nonlinearRefractiveIndex: 2.6,
        nonlinearCoeff: 1.4,
        secondOrderDispersion: -21,
        simulationModel: 'GN',
        modelDrawers: {
          gnParams: { equivalentNoiseBandwidth: 12.5, coherentAccumulationFactor: 1.0 },
          egnParams: { equivalentNoiseBandwidth: 12.5, coherentAccumulationFactor: 1.0, higherOrderDispersionFactor: 0.05, xpmEnhancementFactor: 0.8 },
          ssfmParams: { stepSize: 100, maxIterations: 1000, samplePoints: 2048, nonlinearOrder: 3 }
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

const title = computed(() => props.isNew ? '新增光纤器件' : '编辑光纤器件')
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
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">器件名称 <span class="text-red-500">*</span></label>
              <Input v-model="formData.name" placeholder="如 EDFA01" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">光纤类型</label>
              <Select v-model="formData.fiberCategory" :options="fiberCategoryOptions" />
            </div>
          </div>
          
          <!-- 基础物理参数 -->
          <div class="border rounded-lg p-4 bg-gray-50">
            <h3 class="font-medium text-gray-800 mb-4">【基础物理参数（算法无关）】</h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-600 mb-1">衰减系数 α</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.attenuationCoeff" type="number" step="0.01" class="flex-1" />
                  <span class="text-sm text-gray-500 w-16">dB/km</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">色散系数 D</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.dispersion" type="number" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-500 w-20">ps/nm·km</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">色散斜率 S</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.dispersionSlope" type="number" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-500 w-20">ps/nm²·km</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">有效面积 Aeff</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.effectiveArea" type="number" step="1" class="flex-1" />
                  <span class="text-sm text-gray-500 w-16">μm²</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">非线性折射率 n₂</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.nonlinearRefractiveIndex" type="number" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-500 w-24">×10⁻²⁰ m²/W</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">非线性系数 γ</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.nonlinearCoeff" type="number" step="0.01" class="flex-1" />
                  <span class="text-sm text-gray-500 w-20">W⁻¹·km⁻¹</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- GN 模型参数抽屉 -->
          <div class="border rounded-lg overflow-hidden">
            <button 
              class="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-150 transition-colors"
              @click="toggleDrawer('gn')"
            >
              <span class="font-medium text-gray-700">▶ GN 模型参数（点击展开）</span>
              <component :is="expandedDrawers.has('gn') ? ChevronDown : ChevronRight" class="w-5 h-5 text-gray-500" />
            </button>
            <div v-show="expandedDrawers.has('gn')" class="p-4 bg-white border-t space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">等效噪声带宽</label>
                  <div class="flex items-center gap-2">
                    <Input v-model.number="formData.modelDrawers!.gnParams!.equivalentNoiseBandwidth" type="number" step="0.1" class="flex-1" />
                    <span class="text-sm text-gray-500">GHz</span>
                  </div>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">相干累积因子</label>
                  <Input v-model.number="formData.modelDrawers!.gnParams!.coherentAccumulationFactor" type="number" step="0.01" />
                </div>
              </div>
            </div>
          </div>
          
          <!-- EGN 模型参数抽屉 -->
          <div class="border rounded-lg overflow-hidden">
            <button 
              class="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-150 transition-colors"
              @click="toggleDrawer('egn')"
            >
              <span class="font-medium text-gray-700">▶ EGN 模型参数（点击展开）</span>
              <component :is="expandedDrawers.has('egn') ? ChevronDown : ChevronRight" class="w-5 h-5 text-gray-500" />
            </button>
            <div v-show="expandedDrawers.has('egn')" class="p-4 bg-white border-t space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">等效噪声带宽</label>
                  <div class="flex items-center gap-2">
                    <Input v-model.number="formData.modelDrawers!.egnParams!.equivalentNoiseBandwidth" type="number" step="0.1" class="flex-1" />
                    <span class="text-sm text-gray-500">GHz</span>
                  </div>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">相干累积因子</label>
                  <Input v-model.number="formData.modelDrawers!.egnParams!.coherentAccumulationFactor" type="number" step="0.01" />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">高阶色散修正因子</label>
                  <Input v-model.number="formData.modelDrawers!.egnParams!.higherOrderDispersionFactor" type="number" step="0.01" />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">XPM 增强因子</label>
                  <Input v-model.number="formData.modelDrawers!.egnParams!.xpmEnhancementFactor" type="number" step="0.01" />
                </div>
              </div>
            </div>
          </div>
          
          <!-- SSFM 模型参数抽屉 -->
          <div class="border rounded-lg overflow-hidden">
            <button 
              class="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-150 transition-colors"
              @click="toggleDrawer('ssfm')"
            >
              <span class="font-medium text-gray-700">▶ SSFM 模型参数（点击展开）</span>
              <component :is="expandedDrawers.has('ssfm') ? ChevronDown : ChevronRight" class="w-5 h-5 text-gray-500" />
            </button>
            <div v-show="expandedDrawers.has('ssfm')" class="p-4 bg-white border-t space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">步长</label>
                  <div class="flex items-center gap-2">
                    <Input v-model.number="formData.modelDrawers!.ssfmParams!.stepSize" type="number" step="1" class="flex-1" />
                    <span class="text-sm text-gray-500">m</span>
                  </div>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">最大迭代次数</label>
                  <Input v-model.number="formData.modelDrawers!.ssfmParams!.maxIterations" type="number" step="100" />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">采样点数</label>
                  <Input v-model.number="formData.modelDrawers!.ssfmParams!.samplePoints" type="number" step="256" />
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">非线性项阶数</label>
                  <Input v-model.number="formData.modelDrawers!.ssfmParams!.nonlinearOrder" type="number" step="1" />
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
