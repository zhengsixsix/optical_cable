<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { ref, reactive, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { Input, Select } from '@/shared/components/base'
import { X, Cable, Plus } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  presetArmorType?: string  // 预设的铠装类型
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', cableType: { id: string; name: string; armorType: string; unitPrice: number; remarks?: string }): void
}>()

const appStore = useAppStore()
const settingsStore = useSettingsStore()

// 铠装类型选项
const armorTypeOptions = [
  { value: 'LW', label: '轻铠（LW）' },
  { value: 'LWP', label: '轻型保护（LWP）' },
  { value: 'SA', label: '单铠（SA）' },
  { value: 'DA', label: '双铠（DA）' },
  { value: 'RA', label: '岩石铠装（RA）' }
]

// 表单数据
const form = reactive({
  name: '',
  armorType: 'SA',
  unitPrice: '',
  remarks: ''
})

// 监听 visible 变化，重置表单
watch(() => props.visible, (val) => {
  if (val) {
    form.name = ''
    form.armorType = props.presetArmorType || 'SA'
    form.unitPrice = ''
    form.remarks = ''
  }
})

// 验证表单
const validateForm = (): string | null => {
  if (!form.name.trim()) {
    return '请输入缆型名称'
  }
  
  // 检查名称是否重复
  const existingMappings = settingsStore.routePlanningConfig.armorMappings || []
  const nameExists = existingMappings.some(m => m.cableTypeName === form.name.trim())
  if (nameExists) {
    return '缆型名称已存在'
  }
  
  const price = parseFloat(form.unitPrice)
  if (!form.unitPrice || isNaN(price) || price <= 0) {
    return '单价必须为正数'
  }
  
  if (!form.armorType) {
    return '请选择铠装类型'
  }
  
  return null
}

// 创建缆型
const handleCreate = () => {
  const error = validateForm()
  if (error) {
    appStore.showNotification({ type: 'warning', message: error })
    return
  }
  
  const newCableType = {
    id: `cable-${Date.now()}`,
    name: form.name.trim(),
    armorType: form.armorType,
    unitPrice: parseFloat(form.unitPrice),
    remarks: form.remarks.trim() || undefined
  }
  
  emit('created', newCableType)
  emit('close')
  appStore.showNotification({ type: 'success', message: `缆型 "${newCableType.name}" 已创建` })
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
      <div class="w-[420px] max-w-[95vw] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <Cable class="w-6 h-6 text-blue-600" />
            <span class="font-semibold text-lg">新建缆型</span>
          </div>
          <button 
            class="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
            @click="handleClose"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- 内容 -->
        <div class="p-6 space-y-5">
          <!-- 基本信息 -->
          <div class="space-y-4">
            <h4 class="text-sm font-medium text-gray-700 pb-2 border-b">基本信息</h4>
            
            <div class="flex items-center gap-4">
              <label class="w-28 text-sm text-gray-600 text-right shrink-0">缆型名称：</label>
              <Input 
                v-model="form.name" 
                placeholder="如：SA-01" 
                class="flex-1" 
              />
            </div>
            
            <div class="flex items-center gap-4">
              <label class="w-28 text-sm text-gray-600 text-right shrink-0">铠装类型：</label>
              <Select 
                v-model="form.armorType" 
                :options="armorTypeOptions" 
                class="flex-1" 
              />
            </div>
            
            <div class="flex items-center gap-4">
              <label class="w-28 text-sm text-gray-600 text-right shrink-0">单价：</label>
              <Input 
                v-model="form.unitPrice" 
                type="number" 
                step="0.1"
                placeholder="如：19.5" 
                class="flex-1" 
              />
              <span class="text-sm text-gray-500 w-20 shrink-0">千元/km</span>
            </div>
          </div>
          
          <!-- 备注 -->
          <div class="space-y-2">
            <div class="flex items-start gap-4">
              <label class="w-28 text-sm text-gray-600 text-right shrink-0 pt-2">备注说明：</label>
              <textarea
                v-model="form.remarks"
                placeholder="可选，填写缆型的额外说明"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                rows="2"
              />
            </div>
          </div>
          
          <!-- 提示 -->
          <p class="text-xs text-gray-500 bg-gray-50 p-3 rounded">
            💡 提示：新建的缆型将添加到器件库中，可在海缆铠装预选配置中选择使用。
          </p>
        </div>

        <!-- 底部按钮 -->
        <div class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button 
            class="h-8 px-4 py-1.5 text-sm font-medium border rounded-md shadow-sm hover:bg-gray-100 transition-colors"
            @click="handleClose"
          >
            取消
          </button>
          <button 
            class="h-8 px-4 py-1.5 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow inline-flex items-center transition-colors"
            @click="handleCreate"
          >
            <Plus class="w-4 h-4 mr-2" />
            确定
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
