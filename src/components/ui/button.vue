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
    default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
    destructive: 'bg-danger text-danger-foreground shadow-sm hover:bg-danger/90',
    outline: 'border border-input bg-background shadow-sm hover:bg-muted hover:text-foreground',
    secondary: 'bg-muted text-foreground shadow-sm hover:bg-muted/80',
    ghost: 'hover:bg-muted hover:text-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
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
    @click="handleClick"
  >
    <slot />
  </button>
</template>
