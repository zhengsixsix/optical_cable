<script setup lang="ts">
import { cn } from '@/shared/utils'

interface Props {
  modelValue?: string | number
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'number' | 'password' | 'email'
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  readonly: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
}>()

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  // 对于 number 类型，返回数字值
  if (props.type === 'number') {
    const numValue = target.valueAsNumber
    emit('update:modelValue', isNaN(numValue) ? target.value : numValue)
  } else {
    emit('update:modelValue', target.value)
  }
}
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :class="cn(
      'w-full px-3 py-2 border rounded-md text-sm',
      'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      readonly && 'bg-gray-50 cursor-default'
    )"
    style="background-color: var(--app-card-bg); color: var(--app-text-color); border-color: var(--app-border-color);"
    @input="handleInput"
  >
</template>
