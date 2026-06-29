<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Input, Select } from '@/shared/components/base'
import { platformDictionaryApi } from '@/services/platform/api'
import type { PlanDeviceConfig, PlatformDictionary } from '@/services/platform/types'
import {
  groupDeviceAttributeRows,
  inputTypeForDeviceConfig,
  resolveDeviceAttributeRows,
  type DeviceAttributeRow,
} from '@/services/platform/deviceAttributes'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  configs: PlanDeviceConfig[]
  modelValue: Record<string, string>
  libraryValues?: Record<string, string>
  valueScope?: 'library' | 'entity'
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, string>): void
}>()

const dictionaryOptions = ref<Record<string, Array<{ value: string; label: string }>>>({})
const openGroups = ref<Record<string, boolean>>({})

const recordToValueList = (record?: Record<string, string>) =>
  Object.entries(record ?? {}).map(([configCode, value]) => ({ configCode, value }))

const rows = computed(() => resolveDeviceAttributeRows(
  props.configs,
  recordToValueList(props.libraryValues),
  recordToValueList(props.modelValue),
))

const groups = computed(() => groupDeviceAttributeRows(rows.value))

watch(groups, nextGroups => {
  const nextOpen = { ...openGroups.value }
  for (const group of nextGroups) {
    if (group.kind === 'base') nextOpen[group.groupCode] = true
    else if (nextOpen[group.groupCode] == null) nextOpen[group.groupCode] = false
  }
  openGroups.value = nextOpen
}, { immediate: true })

watch(() => props.configs, async configs => {
  const dicCodes = Array.from(new Set(
    configs
      .filter(config => inputTypeForDeviceConfig(config) === 'select' && config.dicCode)
      .map(config => String(config.dicCode)),
  ))

  await Promise.all(dicCodes.map(async dicCode => {
    if (dictionaryOptions.value[dicCode]) return
    const items = await platformDictionaryApi.listItem(dicCode)
    dictionaryOptions.value = {
      ...dictionaryOptions.value,
      [dicCode]: (items ?? []).map((item: PlatformDictionary) => ({
        value: String(item.code ?? ''),
        label: item.name || item.code || '',
      })).filter(item => item.value),
    }
  }))
}, { immediate: true, deep: true })

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

const toggleGroup = (groupCode: string) => {
  openGroups.value = {
    ...openGroups.value,
    [groupCode]: !openGroups.value[groupCode],
  }
}

const isChecked = (value: string) => value === 'true' || value === '1'
const isBooleanConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'checkbox'
const isDateTimeConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'datetime-local'
const isSelectConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'select'
const textInputTypeForConfig = (config: PlanDeviceConfig): 'text' | 'number' =>
  inputTypeForDeviceConfig(config) === 'number' ? 'number' : 'text'

const optionsForConfig = (config: PlanDeviceConfig) =>
  config.dicCode ? dictionaryOptions.value[String(config.dicCode)] ?? [] : []

const groupTitle = (name: string) => name.startsWith('【') ? name : `【${name}】`
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="configs.length === 0"
      class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500"
      style="border-color: var(--app-border-color)"
    >
      当前设备类型暂无动态属性配置
    </div>

    <section
      v-for="group in groups"
      :key="group.groupCode"
      :class="group.drawer ? 'overflow-hidden rounded-lg border bg-white dark:bg-gray-800' : 'rounded-lg border bg-gray-50 p-4 dark:bg-gray-800/70'"
      style="border-color: var(--app-border-color)"
    >
      <button
        v-if="group.drawer"
        type="button"
        class="flex w-full items-center justify-between bg-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
        @click="toggleGroup(group.groupCode)"
      >
        <span class="flex min-w-0 items-center gap-2 font-medium text-gray-700 dark:text-gray-100">
          <component :is="openGroups[group.groupCode] ? ChevronDown : ChevronRight" class="h-4 w-4 shrink-0 text-gray-500" />
          <span class="truncate">{{ group.groupName }}（点击{{ openGroups[group.groupCode] ? '收起' : '展开' }}）</span>
        </span>
      </button>

      <div v-show="!group.drawer || openGroups[group.groupCode]" :class="group.drawer ? 'border-t bg-white p-4 dark:border-gray-700 dark:bg-gray-800' : ''">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div v-for="row in group.rows" :key="row.configCode" class="min-w-0">
            <div class="mb-1 flex items-center gap-2">
              <label class="block truncate text-sm text-gray-600 dark:text-gray-300">{{ row.label }}</label>
            </div>
            <div class="grid min-h-[38px] grid-cols-[minmax(0,1fr)_80px] items-center gap-2">
              <input
                v-if="isBooleanConfig(row.config)"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                :checked="isChecked(row.value)"
                @change="event => updateBooleanValue(row.configCode, event)"
              />
              <input
                v-else-if="isDateTimeConfig(row.config)"
                type="datetime-local"
                :value="row.value"
                class="h-[38px] min-w-0 rounded-md border bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-200"
                style="border-color: var(--app-border-color)"
                @input="event => updateValue(row.configCode, (event.target as HTMLInputElement).value)"
              />
              <Select
                v-else-if="isSelectConfig(row.config)"
                :model-value="row.value"
                :options="optionsForConfig(row.config)"
                class="min-w-0"
                @update:model-value="value => updateValue(row.configCode, value)"
              />
              <Input
                v-else
                :type="textInputTypeForConfig(row.config)"
                :model-value="row.value"
                class="min-w-0"
                @update:model-value="value => updateValue(row.configCode, value)"
              />
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ row.unit || '' }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
