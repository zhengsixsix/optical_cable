<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/shared/utils'

interface Props {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'default'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
})

const classes = computed(() => {
  const base = 'inline-flex items-center rounded-md font-medium'

  const variants: Record<string, string> = {
    default: 'bg-gray-100 text-gray-600',
    success: 'bg-green-50 text-green-600 border border-green-200',
    warning: 'bg-yellow-50 text-yellow-600 border border-yellow-200',
    danger: 'bg-red-50 text-red-600 border border-red-200',
    info: 'bg-blue-50 text-blue-600 border border-blue-200',
  }

  const sizes: Record<string, string> = {
    sm: 'px-1.5 py-0.5 text-xs',
    default: 'px-2 py-1 text-xs',
  }

  return cn(base, variants[props.variant], sizes[props.size])
})
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
