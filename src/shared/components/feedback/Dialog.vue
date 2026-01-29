<script setup lang="ts">
import { computed, type Component } from 'vue'
import { X } from 'lucide-vue-next'
import { cn } from '@/shared/utils'

interface Props {
  visible: boolean
  title: string
  icon?: Component
  width?: 'sm' | 'md' | 'lg' | 'xl' | string
  closable?: boolean
  showFooter?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  closable: true,
  width: 'md',
  showFooter: true,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const widthClass = computed(() => {
  const widthMap: Record<string, string> = {
    sm: 'w-[360px]',
    md: 'w-[480px]',
    lg: 'w-[600px]',
    xl: 'w-[800px]',
  }
  return widthMap[props.width] || props.width
})

function handleClose() {
  emit('close')
}

function handleOverlayClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
        @click="handleOverlayClick"
      >
        <Transition
          enter-active-class="transition-all duration-200"
          leave-active-class="transition-all duration-200"
          enter-from-class="opacity-0 scale-95"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="visible"
            :class="cn(
              'bg-white rounded-xl shadow-2xl max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col',
              widthClass
            )"
          >
            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <div class="flex items-center gap-2.5 text-gray-800">
                <component :is="icon" v-if="icon" class="w-5 h-5 text-blue-600" />
                <span class="font-semibold text-lg">{{ title }}</span>
              </div>
              <button
                v-if="closable"
                class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
                @click="handleClose"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            <!-- Body -->
            <div class="p-6 overflow-auto flex-1">
              <slot />
            </div>

            <!-- Footer -->
            <div
              v-if="showFooter && $slots.footer"
              class="px-6 py-4 border-t border-gray-100 flex justify-center gap-3 shrink-0"
            >
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
