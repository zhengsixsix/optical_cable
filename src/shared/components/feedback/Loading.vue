<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

interface Props {
  visible: boolean
  text?: string
  fullscreen?: boolean
}

withDefaults(defineProps<Props>(), {
  text: '加载中...',
  fullscreen: false,
})
</script>

<template>
  <Teleport to="body" :disabled="!fullscreen">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        :class="[
          'flex items-center justify-center',
          fullscreen ? 'fixed inset-0 bg-black/30 z-50' : 'absolute inset-0 bg-white/80'
        ]"
      >
        <div class="flex flex-col items-center gap-2 text-gray-600">
          <Loader2 class="w-8 h-8 animate-spin text-blue-500" />
          <span class="text-sm">{{ text }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
