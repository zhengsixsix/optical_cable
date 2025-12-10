<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: boolean
  disabled?: boolean
  size?: 'sm' | 'default'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  disabled: false,
  size: 'default',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const isChecked = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const sizeClasses = computed(() => {
  return props.size === 'sm' 
    ? 'h-4 w-7' 
    : 'h-5 w-9'
})

const thumbClasses = computed(() => {
  const base = props.size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const translate = props.modelValue 
    ? (props.size === 'sm' ? 'translate-x-3' : 'translate-x-4')
    : 'translate-x-0'
  return cn(base, translate)
})
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="isChecked"
    :disabled="disabled"
    :class="cn(
      'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
      isChecked ? 'bg-primary' : 'bg-input',
      sizeClasses
    )"
    @click="isChecked = !isChecked"
  >
    <span
      :class="cn(
        'pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform',
        thumbClasses
      )"
    />
  </button>
</template>
