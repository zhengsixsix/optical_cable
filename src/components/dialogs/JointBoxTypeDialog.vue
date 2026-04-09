<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Input, Select } from '@/shared/components/base'
import { X, Save } from 'lucide-vue-next'
import type { JointBoxSubType, JointBoxType } from '@/types/settings'

const props = defineProps<{
  visible: boolean
  jointBox: JointBoxType | null
  isNew: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', jb: JointBoxType): void
}>()

const form = ref<JointBoxType>({
  id: '',
  name: '',
  subType: 'SJB',
  insertionLoss: 0,
  maxFiberPairs: undefined,
  unitPrice: undefined,
  currency: 'USD',
  remarks: '',
})

const subTypeOptions: Array<{ value: JointBoxSubType; label: string }> = [
  { value: 'BJB', label: 'BJB - 登陆接头盒' },
  { value: 'SEJB', label: 'SEJB - 可扩展接头盒' },
  { value: 'BUJB', label: 'BUJB - 分支单元接头盒' },
  { value: 'SJB', label: 'SJB - 海底接头盒' },
  { value: 'FJB', label: 'FJB - 光纤接头盒' },
  { value: 'LIJB', label: 'LIJB - 登陆界面接头盒' },
]

const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'EUR', label: 'EUR' },
]

watch(() => [props.visible, props.jointBox], () => {
  if (!props.visible) return

  if (props.isNew || !props.jointBox) {
    form.value = {
      id: `jb-${Date.now()}`,
      name: '',
      subType: 'SJB',
      insertionLoss: 0,
      maxFiberPairs: undefined,
      unitPrice: undefined,
      currency: 'USD',
      remarks: '',
    }
    return
  }

  form.value = { ...props.jointBox }
}, { immediate: true })

const title = computed(() => props.isNew ? '添加接头盒型号' : '编辑接头盒型号')

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
            <Input v-model="form.name" placeholder="如：JB-500" class="w-full" />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">子类型 (SLD 图标)</label>
            <Select v-model="form.subType" :options="subTypeOptions" class="w-full" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">
                接头盒插损<span class="text-gray-400">(dB)</span>
              </label>
              <Input v-model.number="form.insertionLoss" type="number" min="0" step="0.01" class="w-full" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">最大光纤对数</label>
              <Input v-model.number="form.maxFiberPairs" type="number" min="1" placeholder="可选" class="w-full" />
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
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-slate-500 focus:border-slate-500 resize-none"
              placeholder="可选备注信息"
            />
          </div>
        </div>

        <div class="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="emit('close')">取消</Button>
          <Button
            size="sm"
            class="bg-slate-600 hover:bg-slate-700 text-white"
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
