<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSLDStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui'
import { X, Save, Cable } from 'lucide-vue-next'
import type { FiberPairType } from '@/types'
import { fiberPairTypeOptions, cableTypeOptionsSimple as cableTypeOptions } from '@/data/mockData'

const props = defineProps<{
  visible: boolean
  segmentId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const sldStore = useSLDStore()
const appStore = useAppStore()

const isEdit = computed(() => !!props.segmentId)
const dialogTitle = computed(() => isEdit.value ? '编辑光纤段' : '添加光纤段')

const form = ref({
  fromEquipmentId: '',
  toEquipmentId: '',
  length: 0,
  fiberPairs: 8,
  fiberPairType: 'working' as FiberPairType,
  cableType: 'LW',
  attenuation: 0.2,
  remarks: '',
})

const equipmentOptions = computed(() => 
  sldStore.equipments.map(e => ({ value: e.id, label: `${e.name} (${e.type})` }))
)

const totalLoss = computed(() => form.value.length * form.value.attenuation)

watch(() => props.visible, (val) => {
  if (val) {
    if (props.segmentId) {
      const segment = sldStore.currentTable?.fiberSegments.find(s => s.id === props.segmentId)
      if (segment) {
        form.value = {
          fromEquipmentId: segment.fromEquipmentId,
          toEquipmentId: segment.toEquipmentId,
          length: segment.length,
          fiberPairs: segment.fiberPairs,
          fiberPairType: segment.fiberPairType,
          cableType: segment.cableType,
          attenuation: segment.attenuation,
          remarks: segment.remarks,
        }
      }
    } else {
      resetForm()
    }
  }
})

function resetForm() {
  form.value = {
    fromEquipmentId: '',
    toEquipmentId: '',
    length: 0,
    fiberPairs: 8,
    fiberPairType: 'working',
    cableType: 'LW',
    attenuation: 0.2,
    remarks: '',
  }
}

function handleSave() {
  if (!form.value.fromEquipmentId || !form.value.toEquipmentId) {
    appStore.showNotification({ type: 'warning', message: '请选择起始和终止设备' })
    return
  }

  const fromEq = sldStore.equipments.find(e => e.id === form.value.fromEquipmentId)
  const toEq = sldStore.equipments.find(e => e.id === form.value.toEquipmentId)

  const segmentData = {
    fromEquipmentId: form.value.fromEquipmentId,
    toEquipmentId: form.value.toEquipmentId,
    fromName: fromEq?.name || '',
    toName: toEq?.name || '',
    length: form.value.length,
    fiberPairs: form.value.fiberPairs,
    fiberPairType: form.value.fiberPairType,
    cableType: form.value.cableType,
    attenuation: form.value.attenuation,
    totalLoss: totalLoss.value,
    remarks: form.value.remarks,
  }

  if (isEdit.value && props.segmentId) {
    sldStore.updateFiberSegment(props.segmentId, segmentData)
    appStore.showNotification({ type: 'success', message: '光纤段已更新' })
  } else {
    sldStore.addFiberSegment(segmentData)
    appStore.showNotification({ type: 'success', message: '光纤段已添加' })
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
            <Cable class="w-5 h-5 text-purple-600" />
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
                <label class="block text-sm font-medium text-gray-700 mb-1">起始设备 *</label>
                <Select v-model="form.fromEquipmentId" :options="equipmentOptions" placeholder="选择起始设备" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">终止设备 *</label>
                <Select v-model="form.toEquipmentId" :options="equipmentOptions" placeholder="选择终止设备" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">长度 (km)</label>
                <input
                  v-model.number="form.length"
                  type="number"
                  step="0.1"
                  min="0"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">光纤对数</label>
                <input
                  v-model.number="form.fiberPairs"
                  type="number"
                  min="1"
                  max="24"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">光纤类型</label>
                <Select v-model="form.fiberPairType" :options="fiberPairTypeOptions" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">电缆类型</label>
                <Select v-model="form.cableType" :options="cableTypeOptions" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">衰减系数 (dB/km)</label>
                <input
                  v-model.number="form.attenuation"
                  type="number"
                  step="0.01"
                  min="0"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">总损耗 (dB)</label>
                <input
                  :value="totalLoss.toFixed(2)"
                  type="text"
                  readonly
                  class="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-600"
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
