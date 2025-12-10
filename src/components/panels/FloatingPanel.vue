<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { X, Minus, Maximize2, Minimize2 } from 'lucide-vue-next'
import { usePanel, type PanelPosition, type PanelSize } from '@/composables/usePanel'
import { cn } from '@/lib/utils'

/**
 * FloatingPanel 通用浮动面板组件
 * 支持拖拽、调整大小、最小化、关闭等功能
 */
interface Props {
  title?: string
  storageKey?: string
  defaultPosition?: PanelPosition
  defaultSize?: PanelSize
  minWidth?: number
  minHeight?: number
  resizable?: boolean
  closable?: boolean
  minimizable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '面板',
  resizable: true,
  closable: true,
  minimizable: true,
  minWidth: 200,
  minHeight: 100
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const {
  position,
  size,
  isDragging,
  isResizing,
  isMinimized,
  isVisible,
  startDrag,
  startResize,
  toggleMinimize,
  close
} = usePanel({
  defaultPosition: props.defaultPosition,
  defaultSize: props.defaultSize,
  minWidth: props.minWidth,
  minHeight: props.minHeight,
  storageKey: props.storageKey
})

const handleClose = () => {
  close()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      :class="cn(
        'fixed bg-white rounded-lg shadow-lg border overflow-hidden z-50',
        'transition-shadow',
        (isDragging || isResizing) && 'shadow-xl'
      )"
      :style="{
        left: position.x + 'px',
        top: position.y + 'px',
        width: isMinimized ? '200px' : size.width + 'px',
        height: isMinimized ? '40px' : size.height + 'px',
      }"
    >
      <!-- 标题栏 -->
      <div
        :class="cn(
          'h-10 px-3 bg-primary text-white flex items-center justify-between',
          'cursor-move select-none'
        )"
        @mousedown.prevent="startDrag"
      >
        <span class="text-sm font-medium truncate">{{ title }}</span>
        
        <div class="flex items-center gap-1">
          <!-- 最小化按钮 -->
          <button
            v-if="minimizable"
            class="p-1 rounded hover:bg-white/20 transition-colors"
            @click.stop="toggleMinimize"
          >
            <component :is="isMinimized ? Maximize2 : Minus" class="w-4 h-4" />
          </button>
          
          <!-- 关闭按钮 -->
          <button
            v-if="closable"
            class="p-1 rounded hover:bg-white/20 transition-colors"
            @click.stop="handleClose"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 内容区域 -->
      <div
        v-show="!isMinimized"
        class="overflow-auto"
        :style="{ height: `calc(${size.height}px - 40px)` }"
      >
        <slot />
      </div>

      <!-- 调整大小手柄 -->
      <div
        v-if="resizable && !isMinimized"
        class="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize"
        @mousedown.prevent="startResize"
      >
        <svg
          class="w-4 h-4 text-gray-400"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M11 0v5h5zm3 11H8v5h6zm-6 0H2v5h6z" />
        </svg>
      </div>
    </div>
  </Teleport>
</template>
