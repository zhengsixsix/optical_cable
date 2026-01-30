<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import { useConnectorStore, useAppStore, useSettingsStore } from '@/stores'
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
const settingsStore = useSettingsStore()

const isEdit = computed(() => !!props.editId)

// 表单数据
const formData = ref({
  name: '',
  type: 'landing' as ConnectorType,
  kp: 0,
  endKp: 0,
  longitude: 0,
  latitude: 0,
  depth: 0,
  status: 'planned' as ConnectorStatus,
  specifications: '',
  manufacturer: '',
  installDate: '',
  remarks: '',
  componentRefId: '__none__',
  fiberRefId: '__none__',
  length: 0
})

// 是否为光纤段类型
const isFiberType = computed(() => formData.value.type === 'fiber')

// 器件库选项（根据类型动态生成）
const componentOptions = computed(() => {
  const type = formData.value.type
  if (type === 'amplifier_e' || type === 'amplifier_w') {
    return settingsStore.amplifierTypes.map(a => ({ value: a.id, label: a.name }))
  }
  if (type === 'bu') {
    return settingsStore.branchingUnitTypes.map(b => ({ value: b.id, label: b.name }))
  }
  return []
})

// 光纤类型选项
const fiberOptions = computed(() => {
  return settingsStore.fiberTypes.map(f => ({ value: f.id, label: f.name }))
})

// 是否显示器件选择
const showComponentSelect = computed(() => {
  const type = formData.value.type
  return type === 'amplifier_e' || type === 'amplifier_w' || type === 'bu'
})

// 是否显示光纤选择（光纤段必须选择光纤类型）
const showFiberSelect = computed(() => {
  return formData.value.type === 'fiber'
})

// 类型选项（排除光纤段，光纤段不能手动创建）
const typeOptions = computed(() => 
  Object.entries(connectorTypeLabels)
    .filter(([value]) => value !== 'fiber')
    .map(([value, label]) => ({ value, label }))
)

// 状态选项
const statusOptions = computed(() =>
  Object.entries(connectorStatusLabels).map(([value, label]) => ({ value, label }))
)

// 重置表单
const resetForm = () => {
  formData.value = {
    name: '',
    type: 'landing',
    kp: 0,
    endKp: 0,
    longitude: 0,
    latitude: 0,
    depth: 0,
    status: 'planned',
    specifications: '',
    manufacturer: '',
    installDate: '',
    remarks: '',
    componentRefId: '__none__',
    fiberRefId: '__none__',
    length: 0
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
        endKp: elem.endKp || 0,
        longitude: elem.longitude,
        latitude: elem.latitude,
        depth: elem.depth,
        status: elem.status,
        specifications: elem.specifications || '',
        manufacturer: elem.manufacturer || '',
        installDate: elem.installDate || '',
        remarks: elem.remarks || '',
        componentRefId: elem.componentRefId || '__none__',
        fiberRefId: elem.fiberRefId || '__none__',
        length: elem.length || 0
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

  // 处理占位符值
  const saveData = {
    ...formData.value,
    componentRefId: formData.value.componentRefId === '__none__' ? '' : formData.value.componentRefId,
    fiberRefId: formData.value.fiberRefId === '__none__' ? '' : formData.value.fiberRefId,
  }

  if (isEdit.value && props.editId) {
    connectorStore.updateElement(props.editId, saveData)
    appStore.showNotification({ type: 'success', message: '接线元已更新' })
  } else {
    connectorStore.addElement(saveData)
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
      <div class="relative bg-white rounded-lg shadow-xl w-[480px] max-h-[90vh] flex flex-col" @click.stop>
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
                <Input v-model="formData.name" placeholder="请输入名称" class="w-full" />
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
              <h4 class="text-xs font-bold text-gray-700 mb-3">{{ isFiberType ? '光纤段信息' : '位置信息' }}</h4>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">{{ isFiberType ? '起始KP (km)' : 'KP (km)' }}</label>
                  <Input v-model="formData.kp" type="number" class="w-full" />
                </div>
                <div v-if="isFiberType">
                  <label class="block text-xs font-medium text-gray-600 mb-1">结束KP (km)</label>
                  <Input v-model="formData.endKp" type="number" class="w-full" />
                </div>
                <div v-if="isFiberType">
                  <label class="block text-xs font-medium text-gray-600 mb-1">长度 (km)</label>
                  <Input v-model="formData.length" type="number" class="w-full" />
                </div>
                <div v-if="!isFiberType">
                  <label class="block text-xs font-medium text-gray-600 mb-1">水深 (m)</label>
                  <Input v-model="formData.depth" type="number" class="w-full" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">经度</label>
                  <Input v-model="formData.longitude" type="number" class="w-full" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">纬度</label>
                  <Input v-model="formData.latitude" type="number" class="w-full" />
                </div>
              </div>
            </div>

            <!-- 器件库选择 -->
            <div v-if="showComponentSelect || showFiberSelect || fiberOptions.length > 0" class="border-t pt-4">
              <h4 class="text-xs font-bold text-gray-700 mb-3">器件库关联</h4>
              <div class="grid grid-cols-2 gap-3">
                <div v-if="showComponentSelect">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    {{ formData.type === 'bu' ? '分支器型号' : '放大器型号' }}
                  </label>
                  <Select 
                    v-model="formData.componentRefId" 
                    :options="[{ value: '__none__', label: '-- 请选择 --' }, ...componentOptions]" 
                    placeholder="请选择"
                  />
                </div>
                <div v-if="showFiberSelect || fiberOptions.length > 0" :class="showFiberSelect ? 'col-span-2' : ''">
                  <label class="block text-xs font-medium text-gray-600 mb-1">
                    光纤类型 {{ showFiberSelect ? '*' : '' }}
                  </label>
                  <Select 
                    v-model="formData.fiberRefId" 
                    :options="[{ value: '__none__', label: '-- 请选择 --' }, ...fiberOptions]" 
                    placeholder="请选择"
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
                  <Input v-model="formData.specifications" placeholder="如: JB-500" class="w-full" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">制造商</label>
                  <Input v-model="formData.manufacturer" class="w-full" />
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
