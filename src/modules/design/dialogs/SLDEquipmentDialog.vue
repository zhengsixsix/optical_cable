<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSLDStore } from '@/stores/sld'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { Card, CardHeader, CardContent, Button, Select } from '@/shared/components/base'
import { X, Save, Radio } from 'lucide-vue-next'
import {
  getDeviceTypeCodeForSldEquipmentType,
  getSldEquipmentTypeForDeviceTypeCode,
} from '@/services/platform/deviceTypeAdapter'
import { normalizeEqualizerConfig, validateEqualizerConfig } from '@/utils/equalizer'

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
const dictionaryStore = useDictionaryStore()

const isEdit = computed(() => !!props.equipmentId)
const dialogTitle = computed(() => isEdit.value ? '编辑设备' : '添加设备')
const isEqualizerType = computed(() =>
  getSldEquipmentTypeForDeviceTypeCode(form.value.deviceTypeCd) === 'EQ',
)
const equipmentTypeOptions = computed(() => dictionaryStore.getOptions(PLATFORM_DICTIONARY_TYPES.deviceType))

function getAvailableDeviceTypeCode(type: Parameters<typeof getDeviceTypeCodeForSldEquipmentType>[0]): string {
  const code = getDeviceTypeCodeForSldEquipmentType(type)
  return code && dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, code) ? code : ''
}

const equalizerRoleOptions = [
  { value: 'T', label: 'T (蓝色)' },
  { value: 'S', label: 'S (红色)' },
]

const attenuationModeOptions = [
  { value: 'adjustable', label: '可调光衰' },
  { value: 'fixed', label: '固定光衰 (F-ATT)' },
]

interface SLDEquipmentForm {
  name: string
  deviceTypeCd: string
  location: string
  kp: number
  longitude: number
  latitude: number
  depth: number
  specifications: string
  manufacturer: string
  remarks: string
  equalizerRole: 'T' | 'S'
  attenuationMode: 'adjustable' | 'fixed'
  attenuationDb: number
}

const form = ref<SLDEquipmentForm>({
  name: '',
  deviceTypeCd: '',
  location: '',
  kp: 0,
  longitude: 0,
  latitude: 0,
  depth: 0,
  specifications: '',
  manufacturer: '',
  remarks: '',
  equalizerRole: 'T' as 'T' | 'S',
  attenuationMode: 'adjustable' as 'adjustable' | 'fixed',
  attenuationDb: 0,
})

watch([() => props.visible, () => props.equipmentId], async ([visible, equipmentId]) => {
  if (!visible) return

  try {
    await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType)
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件类型字典加载失败：${(error as Error).message}` })
  }
  if (!props.visible || props.equipmentId !== equipmentId) return

  if (equipmentId) {
    const equipment = sldStore.currentTable?.equipments.find(e => e.id === equipmentId)
    if (equipment) {
      form.value = {
        name: equipment.name,
        deviceTypeCd: equipment.deviceTypeCd || getAvailableDeviceTypeCode(equipment.type),
        location: equipment.location,
        kp: equipment.kp,
        longitude: equipment.longitude,
        latitude: equipment.latitude,
        depth: equipment.depth,
        specifications: equipment.specifications,
        manufacturer: equipment.manufacturer || '',
        remarks: equipment.remarks,
        equalizerRole: equipment.equalizerRole || 'T',
        attenuationMode: equipment.attenuationMode || 'adjustable',
        attenuationDb: equipment.attenuationDb ?? 0,
      }
    } else {
      resetForm()
    }
  } else {
    resetForm()
  }
}, { immediate: true })

function resetForm() {
  form.value = {
    name: '',
    deviceTypeCd: '',
    location: '',
    kp: 0,
    longitude: 0,
    latitude: 0,
    depth: 0,
    specifications: '',
    manufacturer: '',
    remarks: '',
    equalizerRole: 'T',
    attenuationMode: 'adjustable',
    attenuationDb: 0,
  }
}

function handleSave() {
  if (!form.value.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入设备名称' })
    return
  }
  const deviceTypeCd = form.value.deviceTypeCd
  if (!deviceTypeCd) {
    appStore.showNotification({ type: 'warning', message: '当前没有可用的设备类型，无法保存' })
    return
  }
  if (!dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, deviceTypeCd)) {
    appStore.showNotification({ type: 'warning', message: `DEVICE_TYPE 字典中不存在器件类型 ${deviceTypeCd}` })
    return
  }
  const currentEquipment = props.equipmentId
    ? sldStore.currentTable?.equipments.find(equipment => equipment.id === props.equipmentId)
    : null
  const equipmentType = getSldEquipmentTypeForDeviceTypeCode(deviceTypeCd, currentEquipment?.type)
  if (!equipmentType) {
    appStore.showNotification({ type: 'warning', message: `器件类型 ${deviceTypeCd} 暂无 SLD 行为映射，无法保存为 SLD 设备` })
    return
  }

  if (isEqualizerType.value) {
    const validationMessage = validateEqualizerConfig(form.value)
    if (validationMessage) {
      appStore.showNotification({ type: 'warning', message: validationMessage })
      return
    }
  }

  const equalizerFields = isEqualizerType.value
    ? normalizeEqualizerConfig(form.value)
    : {
        equalizerRole: undefined,
        attenuationMode: undefined,
        attenuationDb: undefined,
      }

  const payload = {
    ...form.value,
    ...equalizerFields,
    type: equipmentType,
    deviceTypeCd,
  }

  if (isEdit.value && props.equipmentId) {
    sldStore.updateEquipment(props.equipmentId, payload)
    appStore.showNotification({ type: 'success', message: '设备已更新' })
  } else {
    sldStore.addEquipment(payload)
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
                <Select v-model="form.deviceTypeCd" :options="equipmentTypeOptions" />
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

            <div v-if="isEqualizerType" class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">均衡器位号</label>
                <Select v-model="form.equalizerRole" :options="equalizerRoleOptions" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">光衰模式</label>
                <Select v-model="form.attenuationMode" :options="attenuationModeOptions" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">光衰值 (dB)</label>
                <input
                  v-model.number="form.attenuationDb"
                  type="number"
                  step="0.1"
                  min="0"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                />
              </div>
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
