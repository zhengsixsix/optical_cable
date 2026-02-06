<script setup lang="ts">
/**
 * 分支器类型编辑对话框
 * 
 * 按甲方需求包含：
 * - 端口数（下拉选择）
 * - 主干插损
 * - 分支插损
 * - 单价与货币
 */

import { ref, watch, computed } from 'vue'
import { Button, Input, Select } from '@/shared/components/base'
import { X } from 'lucide-vue-next'
import type { BranchingUnitType } from '@/types/settings'

const props = defineProps<{
  visible: boolean
  branchingUnit?: BranchingUnitType | null
  isNew?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', bu: BranchingUnitType): void
}>()

// 表单数据
const formData = ref<BranchingUnitType>({
  id: '',
  name: '',
  portCount: 3,
  trunkInsertionLoss: 0.8,
  branchInsertionLoss: 3.5,
  insertionLoss: 0.8,
  wavelengthRange: 1550,
  unitPrice: 180000,
  currency: 'USD'
})

// 端口数选项
const portCountOptions = [
  { value: '2', label: '2 端口' },
  { value: '3', label: '3 端口' },
  { value: '4', label: '4 端口' },
  { value: '6', label: '6 端口' },
  { value: '8', label: '8 端口' }
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
    if (props.branchingUnit) {
      formData.value = JSON.parse(JSON.stringify(props.branchingUnit))
    } else {
      // 新建时生成 ID
      formData.value = {
        id: `bu-${Date.now()}`,
        name: '',
        portCount: 3,
        trunkInsertionLoss: 0.8,
        branchInsertionLoss: 3.5,
        insertionLoss: 0.8,
        wavelengthRange: 1550,
        unitPrice: 180000,
        currency: 'USD'
      }
    }
  }
}, { immediate: true })

// 保存
const handleSave = () => {
  if (!formData.value.name.trim()) {
    return
  }
  // 同步 insertionLoss 为 trunkInsertionLoss（兼容旧字段）
  formData.value.insertionLoss = formData.value.trunkInsertionLoss
  emit('save', formData.value)
}

const title = computed(() => props.isNew ? '新增分支器类型' : '编辑分支器类型')
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      
      <div class="relative bg-white rounded-lg shadow-2xl w-[500px] max-h-[90vh] flex flex-col">
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
            <Input v-model="formData.name" placeholder="如 BU-3Port" />
          </div>
          
          <!-- 端口数 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">端口数</label>
            <Select 
              :model-value="String(formData.portCount)"
              @update:model-value="(v: string) => formData.portCount = Number(v)"
              :options="portCountOptions" 
            />
          </div>
          
          <!-- 插损参数 -->
          <div class="border rounded-lg p-4 bg-gray-50">
            <h3 class="font-medium text-gray-800 mb-4">【插损参数】</h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-600 mb-1">主干插损</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.trunkInsertionLoss" type="number" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-500">dB</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-gray-600 mb-1">分支插损</label>
                <div class="flex items-center gap-2">
                  <Input v-model.number="formData.branchInsertionLoss" type="number" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-500">dB</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 价格 -->
          <div class="border rounded-lg p-4">
            <h3 class="font-medium text-gray-800 mb-4">【价格信息】</h3>
            <div>
              <label class="block text-sm text-gray-600 mb-1">单价</label>
              <div class="flex items-center gap-2">
                <Input v-model.number="formData.unitPrice" type="number" step="1000" class="flex-1" />
                <Select v-model="formData.currency" :options="currencyOptions" class="w-24" />
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
