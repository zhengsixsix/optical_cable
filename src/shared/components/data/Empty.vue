<script setup lang="ts">
import { Package } from 'lucide-vue-next'

interface Props {
  title?: string
  description?: string
}

withDefaults(defineProps<Props>(), {
  title: '暂无数据',
  description: '',
})
</script>

<template>
  <div class="flex flex-col items-center justify-center py-8 text-gray-400">
    <slot name="icon">
      <Package class="w-12 h-12 mb-3 opacity-50" />
    </slot>
    <p class="text-sm font-medium">{{ title }}</p>
    <p v-if="description" class="text-xs mt-1">{{ description }}</p>
    <slot />
  </div>
</template>
