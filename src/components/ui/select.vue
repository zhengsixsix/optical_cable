<script setup lang="ts">
import { computed } from 'vue'
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from 'radix-vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

/**
 * Select 下拉选择组件
 * 基于 radix-vue 实现的下拉选择器
 */
interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface Props {
  modelValue?: string
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const selectedValue = computed({
  get: () => props.modelValue ?? '',
  set: (value) => emit('update:modelValue', value)
})

const selectedLabel = computed(() => {
  const option = props.options.find(o => o.value === selectedValue.value)
  return option?.label
})
</script>

<template>
  <SelectRoot v-model="selectedValue" :disabled="disabled">
    <SelectTrigger
      :class="cn(
        'flex items-center justify-between w-full px-3 py-2',
        'border rounded-md text-sm',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )"
      style="background-color: var(--app-card-bg); color: var(--app-text-color); border-color: var(--app-border-color);"
    >
      <SelectValue :placeholder="placeholder">
        {{ selectedLabel }}
      </SelectValue>
      <ChevronDown class="w-4 h-4" style="color: var(--app-text-secondary);" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        :class="cn(
          'relative z-[200] min-w-[160px] overflow-hidden',
          'rounded-md border shadow-lg',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2',
          'data-[side=top]:slide-in-from-bottom-2'
        )"
        style="background-color: var(--app-card-bg); border-color: var(--app-border-color);"
        position="popper"
        :side-offset="4"
      >
        <SelectViewport class="p-1 max-h-[300px] overflow-y-auto">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
            :class="cn(
              'relative flex items-center px-3 py-2 text-sm rounded cursor-pointer',
              'select-none outline-none',
              'data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
            )"
            style="color: var(--app-text-color);"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="absolute right-2">
              <Check class="w-4 h-4" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
