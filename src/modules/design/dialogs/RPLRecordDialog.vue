<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { Card, CardHeader, CardContent, Button, Select } from '@/shared/components/base'
import { X, Save, MapPin } from 'lucide-vue-next'
import type { RPLPointType, RPLCableCode } from '@/types'
import { pointTypeOptions } from '@/config/uiOptions'

const props = defineProps<{
  visible: boolean
  recordId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const rplStore = useRPLStore()
const appStore = useAppStore()
const dictionaryStore = useDictionaryStore()
const cableTypeOptions = computed(() => dictionaryStore.getOptions(PLATFORM_DICTIONARY_TYPES.armoringType))

const isEdit = computed(() => !!props.recordId)
const dialogTitle = computed(() => isEdit.value ? '编辑RPL记录' : '添加RPL记录')

interface RPLRecordForm {
  longitude: number
  latitude: number
  depth: number
  pointType: RPLPointType | ''
  cableType: RPLCableCode | ''
  segmentLength: number
  slack: number
  burialDepth: number
  remarks: string
}

const form = ref<RPLRecordForm>({
  longitude: 0,
  latitude: 0,
  depth: 0,
  pointType: '',
  cableType: '',
  segmentLength: 0,
  slack: 2.5,
  burialDepth: 0,
  remarks: '',
})

watch(() => props.visible, async (val) => {
  if (val) {
    try {
      await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType)
    } catch (error) {
      appStore.showNotification({ type: 'error', message: `铠装类型字典加载失败：${(error as Error).message}` })
    }
    if (props.recordId) {
      const record = rplStore.currentTable?.records.find(r => r.id === props.recordId)
      if (record) {
        form.value = {
          longitude: record.longitude,
          latitude: record.latitude,
          depth: record.depth,
          pointType: record.pointType,
          cableType: record.cableType,
          segmentLength: record.segmentLength,
          slack: record.slack,
          burialDepth: record.burialDepth,
          remarks: record.remarks,
        }
      }
    } else {
      resetForm()
    }
  }
})

function resetForm() {
  form.value = {
    longitude: 0,
    latitude: 0,
    depth: 0,
    pointType: '',
    cableType: '',
    segmentLength: 0,
    slack: 2.5,
    burialDepth: 0,
    remarks: '',
  }
}

function handleSave() {
  const validatedTypes = validateForm()
  if (!validatedTypes) return

  if (isEdit.value && props.recordId) {
    rplStore.updateRecord(props.recordId, {
      longitude: form.value.longitude,
      latitude: form.value.latitude,
      depth: form.value.depth,
      pointType: validatedTypes.pointType,
      cableType: validatedTypes.cableType,
      segmentLength: form.value.segmentLength,
      slack: form.value.slack,
      burialDepth: form.value.burialDepth,
      remarks: form.value.remarks,
    })
    appStore.showNotification({ type: 'success', message: '记录已更新' })
  } else {
    rplStore.addRecord({
      kp: 0,
      longitude: form.value.longitude,
      latitude: form.value.latitude,
      depth: form.value.depth,
      pointType: validatedTypes.pointType,
      cableType: validatedTypes.cableType,
      segmentLength: form.value.segmentLength,
      cumulativeLength: 0,
      slack: form.value.slack,
      burialDepth: form.value.burialDepth,
      remarks: form.value.remarks,
    })
    appStore.showNotification({ type: 'success', message: '记录已添加' })
  }

  emit('saved')
  emit('close')
}

function validateForm(): { pointType: RPLPointType; cableType: RPLCableCode } | null {
  if (!form.value.pointType) {
    appStore.showNotification({ type: 'error', message: '当前没有可用的点类型，无法保存' })
    return null
  }
  if (!form.value.cableType) {
    appStore.showNotification({ type: 'error', message: '当前没有可用的电缆类型，无法保存' })
    return null
  }
  if (!dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.armoringType, form.value.cableType)) {
    appStore.showNotification({ type: 'error', message: `ARMORING_TYPE 字典中不存在铠装类型 ${form.value.cableType}` })
    return null
  }
  if (form.value.longitude < -180 || form.value.longitude > 180) {
    appStore.showNotification({ type: 'error', message: '经度必须在 -180 到 180 之间' })
    return null
  }
  if (form.value.latitude < -90 || form.value.latitude > 90) {
    appStore.showNotification({ type: 'error', message: '纬度必须在 -90 到 90 之间' })
    return null
  }
  if (form.value.depth < 0) {
    appStore.showNotification({ type: 'error', message: '水深不能为负数' })
    return null
  }
  if (form.value.segmentLength < 0) {
    appStore.showNotification({ type: 'error', message: '分段长度不能为负数' })
    return null
  }
  return {
    pointType: form.value.pointType,
    cableType: form.value.cableType,
  }
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] backdrop-blur-sm"
      @click.self="handleClose"
    >
      <Card class="w-[500px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col bg-white shadow-2xl">
        <CardHeader class="shrink-0 border-b">
          <div class="flex items-center gap-2">
            <MapPin class="w-5 h-5 text-blue-600" />
            <span class="font-semibold">{{ dialogTitle }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="handleClose">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent class="flex-1 overflow-auto py-4">
          <div class="space-y-4">
            <!-- 坐标 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">经度</label>
                <input
                  v-model.number="form.longitude"
                  type="number"
                  step="0.000001"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                  placeholder="-180 ~ 180"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">纬度</label>
                <input
                  v-model.number="form.latitude"
                  type="number"
                  step="0.000001"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                  placeholder="-90 ~ 90"
                />
              </div>
            </div>

            <!-- 水深和分段长度 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">水深 (m)</label>
                <input
                  v-model.number="form.depth"
                  type="number"
                  step="0.1"
                  min="0"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">分段长度 (km)</label>
                <input
                  v-model.number="form.segmentLength"
                  type="number"
                  step="0.001"
                  min="0"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
              </div>
            </div>

            <!-- 类型选择 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">点类型</label>
                <Select v-model="form.pointType" :options="pointTypeOptions" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">电缆类型</label>
                <Select v-model="form.cableType" :options="cableTypeOptions" />
              </div>
            </div>

            <!-- 余缆率和埋设深度 -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">余缆率 (%)</label>
                <input
                  v-model.number="form.slack"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">埋设深度 (m)</label>
                <input
                  v-model.number="form.burialDepth"
                  type="number"
                  step="0.1"
                  min="0"
                  class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
              </div>
            </div>

            <!-- 备注 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                v-model="form.remarks"
                rows="2"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none"
                placeholder="可选备注信息"
              />
            </div>
          </div>
        </CardContent>

        <!-- 底部操作 -->
        <div class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
          <Button variant="outline" @click="handleClose">取消</Button>
          <Button @click="handleSave">
            <Save class="w-4 h-4 mr-1" />
            保存
          </Button>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
