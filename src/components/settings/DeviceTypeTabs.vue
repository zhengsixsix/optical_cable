<script setup lang="ts">
import type { PlatformDictionary } from '@/services/platform/types'

defineProps<{
  items: PlatformDictionary[]
  modelValue: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const selectItem = (item: PlatformDictionary) => {
  if (!item.code) return
  emit('update:modelValue', String(item.code))
}
</script>

<template>
  <div class="flex min-h-[42px] items-center gap-1 overflow-x-auto border-b" style="border-color: var(--app-border-color)">
    <span v-if="loading" class="px-3 py-2 text-sm text-gray-400">正在加载设备类型...</span>
    <span v-else-if="items.length === 0" class="px-3 py-2 text-sm text-gray-400">暂无设备类型字典数据</span>
    <button
      v-for="item in items"
      v-else
      :key="item.code || item.id"
      type="button"
      class="h-[42px] shrink-0 border-b-2 px-4 text-sm font-medium transition-colors"
      :class="modelValue === item.code
        ? 'border-primary text-primary'
        : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'"
      @click="selectItem(item)"
    >
      {{ item.name || item.code }}
    </button>
  </div>
</template>
