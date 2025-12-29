<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const isChecked = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="isChecked"
    :disabled="disabled"
    :class="cn(
      'peer h-4 w-4 shrink-0 rounded-sm border shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
    )"
    :style="isChecked 
      ? { backgroundColor: 'var(--app-primary-color)', borderColor: 'var(--app-primary-color)', color: '#ffffff' } 
      : { backgroundColor: 'var(--app-card-bg)', borderColor: 'var(--app-border-color)' }"
    @click="isChecked = !isChecked"
  >
    <span class="flex items-center justify-center text-current">
      <Check v-if="isChecked" class="h-3 w-3" />
    </span>
  </button>
</template>
