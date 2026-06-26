<script setup lang="ts">
import { computed } from 'vue'
import { Input } from '@/shared/components/base'
import type { PlanDeviceConfig } from '@/services/platform/types'
import {
  groupDeviceAttributeRows,
  inputTypeForDeviceConfig,
  resolveDeviceAttributeRows,
} from '@/services/platform/deviceAttributes'

const props = defineProps<{
  configs: PlanDeviceConfig[]
  modelValue: Record<string, string>
  libraryValues?: Record<string, string>
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, string>): void
}>()

const recordToValueList = (record?: Record<string, string>) =>
  Object.entries(record ?? {}).map(([configCode, value]) => ({ configCode, value }))

const rows = computed(() => resolveDeviceAttributeRows(
  props.configs,
  recordToValueList(props.libraryValues),
  recordToValueList(props.modelValue),
))

const groups = computed(() => groupDeviceAttributeRows(rows.value))

const updateValue = (configCode: string, value: unknown) => {
  emit('update:modelValue', {
    ...(props.modelValue ?? {}),
    [configCode]: value == null ? '' : String(value),
  })
}

const updateBooleanValue = (configCode: string, event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  updateValue(configCode, checked ? 'true' : 'false')
}

const isChecked = (value: string) => value === 'true' || value === '1'
const isBooleanConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'checkbox'
const isDateTimeConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'datetime-local'
const textInputTypeForConfig = (config: PlanDeviceConfig): 'text' | 'number' =>
  inputTypeForDeviceConfig(config) === 'number' ? 'number' : 'text'
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="configs.length === 0"
      class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
      style="border-color: var(--app-border-color)"
    >
      当前设备类型暂无动态属性配置
    </div>

    <section
      v-for="group in groups"
      :key="group.groupCode"
      class="rounded-md border bg-white p-4 dark:bg-gray-800"
      style="border-color: var(--app-border-color)"
    >
      <h4 class="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{{ group.groupName }}</h4>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div v-for="row in group.rows" :key="row.configCode" class="min-w-0">
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">{{ row.label }}</label>
          <div class="flex min-h-[38px] items-center gap-2">
            <input
              v-if="isBooleanConfig(row.config)"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              :checked="isChecked(row.value)"
              @change="event => updateBooleanValue(row.configCode, event)"
            />
            <input
              v-else-if="isDateTimeConfig(row.config)"
              type="datetime-local"
              :value="row.value"
              class="h-[38px] min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-200"
              style="border-color: var(--app-border-color)"
              @input="event => updateValue(row.configCode, (event.target as HTMLInputElement).value)"
            />
            <Input
              v-else
              :type="textInputTypeForConfig(row.config)"
              :model-value="row.value"
              class="min-w-0 flex-1"
              @update:model-value="value => updateValue(row.configCode, value)"
            />
            <span v-if="row.unit" class="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ row.unit }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
