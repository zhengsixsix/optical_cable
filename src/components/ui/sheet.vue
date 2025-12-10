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
 * Sheet 抽屉组件
 * 从屏幕边缘滑出的面板
 */
interface Props {
  open?: boolean
  title?: string
  description?: string
  side?: 'left' | 'right' | 'top' | 'bottom'
  width?: string
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  side: 'right',
  width: '350px',
  height: '100%'
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

// 根据 side 计算定位样式
const positionClass = computed(() => {
  const base = 'fixed z-[101] bg-white shadow-xl flex flex-col'
  switch (props.side) {
    case 'left':
      return cn(base, 'inset-y-0 left-0 border-r data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left')
    case 'right':
      return cn(base, 'inset-y-0 right-0 border-l data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right')
    case 'top':
      return cn(base, 'inset-x-0 top-0 border-b data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top')
    case 'bottom':
      return cn(base, 'inset-x-0 bottom-0 border-t data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom')
  }
})

const sizeStyle = computed(() => {
  if (props.side === 'left' || props.side === 'right') {
    return { width: props.width }
  }
  return { height: props.height }
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
        class="fixed inset-0 bg-black/30 z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />

      <!-- 抽屉内容 -->
      <DialogContent
        :class="positionClass"
        :style="sizeStyle"
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <DialogTitle v-if="title" class="text-lg font-semibold text-gray-900">
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" class="text-sm text-gray-500 mt-1">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose class="rounded-full p-1.5 hover:bg-gray-100 transition-colors">
            <X class="w-5 h-5 text-gray-500" />
          </DialogClose>
        </div>

        <!-- 主体内容 -->
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <slot />
        </div>

        <!-- 底部按钮区 -->
        <div v-if="$slots.footer" class="px-5 py-4 border-t bg-gray-50 shrink-0">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
