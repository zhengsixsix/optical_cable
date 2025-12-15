<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Button, Select } from '@/components/ui'
import { useConnectorStore, useAppStore } from '@/stores'
import { connectorTypeLabels, connectorStatusLabels } from '@/types'
import type { ConnectorType, ConnectorStatus, ConnectorElement } from '@/types'
import { X, Save } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  editId?: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const connectorStore = useConnectorStore()
const appStore = useAppStore()

const isEdit = computed(() => !!props.editId)

// 表单数据
const formData = ref({
  name: '',
  type: 'joint' as ConnectorType,
  kp: 0,
  longitude: 0,
  latitude: 0,
  depth: 0,
  status: 'planned' as ConnectorStatus,
  specifications: '',
  manufacturer: '',
  installDate: '',
  remarks: ''
})

// 类型选项
const typeOptions = computed(() => 
  Object.entries(connectorTypeLabels).map(([value, label]) => ({ value, label }))
)

// 状态选项
const statusOptions = computed(() =>
  Object.entries(connectorStatusLabels).map(([value, label]) => ({ value, label }))
)

// 重置表单
const resetForm = () => {
  formData.value = {
    name: '',
    type: 'joint',
    kp: 0,
    longitude: 0,
    latitude: 0,
    depth: 0,
    status: 'planned',
    specifications: '',
    manufacturer: '',
    installDate: '',
    remarks: ''
  }
}

// 加载编辑数据
watch(() => [props.visible, props.editId], () => {
  if (props.visible && props.editId) {
    const elem = connectorStore.elements.find(e => e.id === props.editId)
    if (elem) {
      formData.value = {
        name: elem.name,
        type: elem.type,
        kp: elem.kp,
        longitude: elem.longitude,
        latitude: elem.latitude,
        depth: elem.depth,
        status: elem.status,
        specifications: elem.specifications || '',
        manufacturer: elem.manufacturer || '',
        installDate: elem.installDate || '',
        remarks: elem.remarks || ''
      }
    }
  } else if (props.visible && !props.editId) {
    resetForm()
    // 生成默认名称
    const count = connectorStore.elements.length + 1
    formData.value.name = `接线元-${String(count).padStart(3, '0')}`
  }
}, { immediate: true })

// 保存
const handleSave = () => {
  if (!formData.value.name.trim()) {
    appStore.showNotification({ type: 'error', message: '请输入名称' })
    return
  }

  if (isEdit.value && props.editId) {
    connectorStore.updateElement(props.editId, formData.value)
    appStore.showNotification({ type: 'success', message: '接线元已更新' })
  } else {
    connectorStore.addElement(formData.value)
    appStore.showNotification({ type: 'success', message: '接线元已添加' })
  }
  
  emit('saved')
  emit('close')
}

// 关闭
const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/50" @click="handleClose" />
      
      <!-- 弹框 -->
      <div class="relative bg-white rounded-lg shadow-xl w-[480px] max-h-[90vh] flex flex-col">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h3 class="text-sm font-bold text-gray-800">
            {{ isEdit ? '编辑接线元' : '添加接线元' }}
          </h3>
          <button class="p-1 hover:bg-gray-200 rounded" @click="handleClose">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>
        
        <!-- 表单内容 -->
        <div class="flex-1 overflow-auto p-4">
          <div class="space-y-4">
            <!-- 基本信息 -->
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-1">名称 *</label>
                <input 
                  v-model="formData.name" 
                  type="text" 
                  class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入名称"
                />
              </div>
              
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">类型</label>
                <Select v-model="formData.type" :options="typeOptions" />
              </div>
              
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">状态</label>
                <Select v-model="formData.status" :options="statusOptions" />
              </div>
            </div>

            <!-- 位置信息 -->
            <div class="border-t pt-4">
              <h4 class="text-xs font-bold text-gray-700 mb-3">位置信息</h4>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">KP (km)</label>
                  <input 
                    v-model.number="formData.kp" 
                    type="number" 
                    step="0.1"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">水深 (m)</label>
                  <input 
                    v-model.number="formData.depth" 
                    type="number" 
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">经度</label>
                  <input 
                    v-model.number="formData.longitude" 
                    type="number" 
                    step="0.0001"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">纬度</label>
                  <input 
                    v-model.number="formData.latitude" 
                    type="number" 
                    step="0.0001"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <!-- 规格信息 -->
            <div class="border-t pt-4">
              <h4 class="text-xs font-bold text-gray-700 mb-3">规格信息</h4>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">规格型号</label>
                  <input 
                    v-model="formData.specifications" 
                    type="text" 
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="如: JB-500"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">制造商</label>
                  <input 
                    v-model="formData.manufacturer" 
                    type="text" 
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div class="col-span-2">
                  <label class="block text-xs font-medium text-gray-600 mb-1">备注</label>
                  <textarea 
                    v-model="formData.remarks" 
                    rows="2"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 底部按钮 -->
        <div class="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50">
          <Button variant="outline" size="sm" @click="handleClose">
            取消
          </Button>
          <Button size="sm" class="bg-blue-600 hover:bg-blue-700 text-white" @click="handleSave">
            <Save class="w-4 h-4 mr-1" />
            {{ isEdit ? '保存' : '添加' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
