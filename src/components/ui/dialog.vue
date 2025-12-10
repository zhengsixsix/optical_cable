<script setup lang="ts">
import { computed } from 'vue'
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'radix-vue'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

/**
 * Dialog 对话框组件
 * 基于 radix-vue 实现的模态对话框
 */
interface Props {
  open?: boolean
  title?: string
  description?: string
  width?: string
  closable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  closable: true,
  width: '500px'
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <!-- 触发器插槽 -->
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <!-- 遮罩层 -->
      <DialogOverlay
        class="fixed inset-0 bg-black/50 z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />

      <!-- 对话框内容 -->
      <DialogContent
        :class="cn(
          'fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2',
          'bg-white rounded-lg shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
          'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          'max-h-[90vh] overflow-hidden flex flex-col'
        )"
        :style="{ width }"
      >
        <!-- 头部 -->
        <div v-if="title || closable" class="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <DialogTitle v-if="title" class="text-lg font-semibold text-gray-900">
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" class="text-sm text-gray-500 mt-1">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose
            v-if="closable"
            class="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
          >
            <X class="w-5 h-5 text-gray-500" />
          </DialogClose>
        </div>

        <!-- 主体内容 -->
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <slot />
        </div>

        <!-- 底部按钮区 -->
        <div v-if="$slots.footer" class="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
