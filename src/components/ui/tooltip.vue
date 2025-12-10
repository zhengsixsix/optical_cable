<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'bottom',
  delay: 500,
})

const isVisible = ref(false)
let timeoutId: ReturnType<typeof setTimeout> | null = null

function show() {
  timeoutId = setTimeout(() => {
    isVisible.value = true
  }, props.delay)
}

function hide() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  isVisible.value = false
}
</script>

<template>
  <div class="relative inline-block" @mouseenter="show" @mouseleave="hide">
    <slot />
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isVisible"
        :class="[
          'absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-nowrap',
          {
            'bottom-full left-1/2 -translate-x-1/2 mb-1': placement === 'top',
            'top-full left-1/2 -translate-x-1/2 mt-1': placement === 'bottom',
            'right-full top-1/2 -translate-y-1/2 mr-1': placement === 'left',
            'left-full top-1/2 -translate-y-1/2 ml-1': placement === 'right',
          }
        ]"
      >
        {{ content }}
      </div>
    </Transition>
  </div>
</template>
