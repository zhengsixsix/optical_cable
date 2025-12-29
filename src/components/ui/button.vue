<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  disabled: false,
  type: 'button',
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const classes = computed(() => {
  const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
  
  const variants: Record<string, string> = {
    default: 'shadow hover:opacity-90',
    destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
    outline: 'border shadow-sm hover:opacity-80',
    secondary: 'shadow-sm hover:opacity-80',
    ghost: 'hover:opacity-80',
    link: 'underline-offset-4 hover:underline',
  }
  
  const sizes: Record<string, string> = {
    default: 'h-8 px-4 py-1.5',
    sm: 'h-7 rounded-sm px-3 text-xs',
    lg: 'h-10 rounded-md px-8',
    icon: 'h-8 w-8',
  }
  
  return cn(base, variants[props.variant], sizes[props.size])
})

function handleClick(event: MouseEvent) {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled"
    :style="variant === 'default' 
      ? { backgroundColor: 'var(--app-primary-color)', color: '#ffffff' } 
      : variant === 'outline' 
        ? { backgroundColor: 'var(--app-card-bg)', color: 'var(--app-text-color)', borderColor: 'var(--app-border-color)' }
        : variant === 'secondary'
          ? { backgroundColor: 'var(--app-bg-secondary)', color: 'var(--app-text-color)' }
          : variant === 'ghost'
            ? { color: 'var(--app-text-color)' }
            : variant === 'link'
              ? { color: 'var(--app-primary-color)' }
              : {}"
    @click="handleClick"
  >
    <slot />
  </button>
</template>
