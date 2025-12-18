<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSLDStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui'
import { X, Save, Radio } from 'lucide-vue-next'
import type { SLDEquipmentType } from '@/types'
import { equipmentTypeOptions } from '@/data/mockData'

const props = defineProps<{
  visible: boolean
  equipmentId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const sldStore = useSLDStore()
const appStore = useAppStore()

const isEdit = computed(() => !!props.equipmentId)
const dialogTitle = computed(() => isEdit.value ? '编辑设备' : '添加设备')

const form = ref({
  name: '',
  type: 'REP' as SLDEquipmentType,
  location: '',
  kp: 0,
  longitude: 0,
  latitude: 0,
  depth: 0,
  specifications: '',
  manufacturer: '',
  remarks: '',
})

watch(() => props.visible, (val) => {
  if (val) {
    if (props.equipmentId) {
      const equipment = sldStore.currentTable?.equipments.find(e => e.id === props.equipmentId)
      if (equipment) {
        form.value = {
          name: equipment.name,
          type: equipment.type,
          location: equipment.location,
          kp: equipment.kp,
          longitude: equipment.longitude,
          latitude: equipment.latitude,
          depth: equipment.depth,
          specifications: equipment.specifications,
          manufacturer: equipment.manufacturer || '',
          remarks: equipment.remarks,
        }
      }
    } else {
      resetForm()
    }
  }
})

function resetForm() {
  form.value = {
    name: '',
    type: 'REP',
    location: '',
    kp: 0,
    longitude: 0,
    latitude: 0,
    depth: 0,
    specifications: '',
    manufacturer: '',
    remarks: '',
  }
}

function handleSave() {
  if (!form.value.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入设备名称' })
    return
  }

  if (isEdit.value && props.equipmentId) {
    sldStore.updateEquipment(props.equipmentId, { ...form.value })
    appStore.showNotification({ type: 'success', message: '设备已更新' })
  } else {
    sldStore.addEquipment({ ...form.value })
    appStore.showNotification({ type: 'success', message: '设备已添加' })
  }

  emit('saved')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <Card class="w-[500px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col bg-white shadow-2xl">
        <CardHeader class="shrink-0 border-b">
          <div class="flex items-center gap-2">
            <Radio class="w-5 h-5 text-purple-600" />
            <span class="font-semibold">{{ dialogTitle }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent class="flex-1 overflow-auto py-4">
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">设备名称 *</label>
                <input
                  v-model="form.name"
                  type="text"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                  placeholder="如: REP-01"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">设备类型</label>
                <Select v-model="form.type" :options="equipmentTypeOptions" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">位置描述</label>
                <input
                  v-model="form.location"
                  type="text"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                  placeholder="如: KP 80"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">KP值 (km)</label>
                <input
                  v-model.number="form.kp"
                  type="number"
                  step="0.1"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">经度</label>
                <input
                  v-model.number="form.longitude"
                  type="number"
                  step="0.000001"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">纬度</label>
                <input
                  v-model.number="form.latitude"
                  type="number"
                  step="0.000001"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">水深 (m)</label>
                <input
                  v-model.number="form.depth"
                  type="number"
                  step="1"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">规格型号</label>
                <input
                  v-model="form.specifications"
                  type="text"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                  placeholder="如: EREP-C+L"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">制造商</label>
                <input
                  v-model="form.manufacturer"
                  type="text"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                v-model="form.remarks"
                rows="2"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-none"
              />
            </div>
          </div>
        </CardContent>

        <div class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
          <Button variant="outline" @click="emit('close')">取消</Button>
          <Button @click="handleSave">
            <Save class="w-4 h-4 mr-1" />
            保存
          </Button>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
