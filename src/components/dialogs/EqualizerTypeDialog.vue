<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Input, Select } from '@/shared/components/base'
import { X, Save } from 'lucide-vue-next'
import type { EqualizerType } from '@/types/settings'

const props = defineProps<{
  visible: boolean
  equalizer: EqualizerType | null
  isNew: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', eq: EqualizerType): void
}>()

const form = ref<EqualizerType>({
  id: '',
  name: '',
  attenuationMode: 'adjustable',
  defaultAttenuationDb: 0,
  unitPrice: undefined,
  currency: 'USD',
  remarks: '',
})

const attenuationModeOptions = [
  { value: 'adjustable', label: '可调光衰' },
  { value: 'fixed', label: '固定光衰 (F-ATT)' },
]

const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'EUR', label: 'EUR' },
]

watch(() => [props.visible, props.equalizer], () => {
  if (!props.visible) return

  if (props.isNew || !props.equalizer) {
    form.value = {
      id: `eq-${Date.now()}`,
      name: '',
      attenuationMode: 'adjustable',
      defaultAttenuationDb: 0,
      unitPrice: undefined,
      currency: 'USD',
      remarks: '',
    }
    return
  }

  form.value = { ...props.equalizer }
}, { immediate: true })

const title = computed(() => props.isNew ? '添加均衡器型号' : '编辑均衡器型号')

const handleSave = () => {
  if (!form.value.name.trim()) return
  emit('save', { ...form.value })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-xl shadow-2xl w-[420px] overflow-hidden flex flex-col">
        <div class="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <span class="font-semibold text-sm">{{ title }}</span>
          <button class="p-1 hover:bg-gray-200 rounded" @click="emit('close')">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div class="p-5 space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">型号名称 *</label>
            <Input v-model="form.name" placeholder="如：EQ-1000" class="w-full" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">光衰模式</label>
              <Select v-model="form.attenuationMode" :options="attenuationModeOptions" class="w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">
                默认光衰值<span class="text-gray-400">(dB)</span>
              </label>
              <Input v-model.number="form.defaultAttenuationDb" type="number" min="0" step="0.1" class="w-full" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">单价</label>
              <Input v-model.number="form.unitPrice" type="number" min="0" placeholder="可选" class="w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">货币</label>
              <Select v-model="form.currency" :options="currencyOptions" class="w-full" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">备注</label>
            <textarea
              v-model="form.remarks"
              rows="2"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-amber-500 focus:border-amber-500 resize-none"
              placeholder="可选备注信息"
            />
          </div>
        </div>

        <div class="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="emit('close')">取消</Button>
          <Button
            size="sm"
            class="bg-amber-500 hover:bg-amber-600 text-white"
            :disabled="!form.name.trim()"
            @click="handleSave"
          >
            <Save class="w-4 h-4 mr-1" />
            {{ isNew ? '添加' : '保存' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
