<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/shared/components/base'
import { X, Edit3, Route as RouteIcon } from 'lucide-vue-next'
import RouteEditor from '@/modules/planning/components/RouteEditor.vue'

const props = defineProps<{
  visible: boolean
  routeId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click.self="handleClose"
    >
      <div class="w-[1000px] max-w-[95vw] h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <Edit3 class="w-6 h-6 text-green-600" />
            <span class="font-semibold text-lg">路由编辑</span>
            <span class="text-xs text-gray-400 ml-2">
              <RouteIcon class="w-3 h-3 inline mr-1" />
              拖拽调整路径点位置
            </span>
          </div>
          <Button variant="ghost" size="sm" @click="handleClose">
            <X class="w-5 h-5" />
          </Button>
        </div>

        <!-- 内容区域 - 直接显示路径编辑器 -->
        <div class="flex-1 overflow-hidden">
          <RouteEditor 
            :route-id="routeId"
            :active="visible"
            @close="handleClose"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
