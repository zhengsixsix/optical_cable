<script setup lang="ts">
import { cn } from '@/shared/utils'

interface Props {
  label: string
  required?: boolean
  labelWidth?: string
  direction?: 'horizontal' | 'vertical'
}

const props = withDefaults(defineProps<Props>(), {
  required: false,
  labelWidth: '110px',
  direction: 'horizontal',
})
</script>

<template>
  <div
    :class="cn(
      'flex gap-3',
      direction === 'horizontal' ? 'items-center' : 'flex-col'
    )"
  >
    <label
      :class="cn(
        'text-sm text-gray-600 shrink-0',
        direction === 'horizontal' && `w-[${labelWidth}]`
      )"
      :style="direction === 'horizontal' ? { width: labelWidth } : {}"
    >
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <div class="flex-1">
      <slot />
    </div>
  </div>
</template>
