<script setup lang="ts">
/**
 * 保存提示对话框
 * 在关闭/切换项目时提示用户是否保存当前项目
 */
import { X } from 'lucide-vue-next'
import { Button } from '@/components/ui'

interface Props {
  visible: boolean
  projectName: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'save'): void      // 用户选择"是" - 保存后继续
  (e: 'discard'): void   // 用户选择"否" - 不保存直接继续
  (e: 'cancel'): void    // 用户选择"取消" - 取消操作
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-200"
      @click.self="emit('cancel')"
    >
      <div class="bg-white rounded-lg shadow-2xl w-[360px] overflow-hidden">
        <!-- Header -->
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <span class="font-medium text-gray-800">保存提示</span>
          <button 
            class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded transition-colors"
            @click="emit('cancel')"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="px-5 py-6 text-center">
          <p class="text-gray-700">
            是否要保存项目：<span class="font-medium text-gray-900">{{ projectName }}</span>？
          </p>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-gray-100 flex justify-center gap-3">
          <Button 
            class="min-w-[60px]"
            @click="emit('save')"
          >
            是
          </Button>
          <Button 
            variant="outline"
            class="min-w-[60px]"
            @click="emit('discard')"
          >
            否
          </Button>
          <Button 
            variant="ghost"
            class="min-w-[60px]"
            @click="emit('cancel')"
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
