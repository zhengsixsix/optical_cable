<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

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
    default: 'bg-muted text-muted-foreground',
    success: 'bg-success/10 text-success border border-success/20',
    warning: 'bg-warning/10 text-warning border border-warning/20',
    danger: 'bg-danger/10 text-danger border border-danger/20',
    info: 'bg-primary/10 text-primary border border-primary/20',
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
