<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, Edit3, Settings, Radio, Route as RouteIcon } from 'lucide-vue-next'
import RouteEditor from '@/components/map/RouteEditor.vue'
import SegmentConfigPanel from '@/components/panels/SegmentConfigPanel.vue'
import RepeaterConfigPanel from '@/components/panels/RepeaterConfigPanel.vue'

const props = defineProps<{
  visible: boolean
  routeId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()
const activeTab = ref<'route' | 'segment' | 'repeater'>('route')

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
            <span class="font-semibold text-lg">路由编辑与配置</span>
          </div>
          <Button variant="ghost" size="sm" @click="handleClose">
            <X class="w-5 h-5" />
          </Button>
        </div>

        <!-- Tab切换 -->
        <div class="px-6 py-2 border-b flex items-center gap-4 bg-white">
          <button 
            :class="['px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2', 
              activeTab === 'route' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100']"
            @click="activeTab = 'route'"
          >
            <RouteIcon class="w-4 h-4" />
            路径编辑
          </button>
          <button 
            :class="['px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2', 
              activeTab === 'segment' ? 'bg-orange-100 text-orange-700' : 'hover:bg-gray-100']"
            @click="activeTab = 'segment'"
          >
            <Settings class="w-4 h-4" />
            分段参数
          </button>
          <button 
            :class="['px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2', 
              activeTab === 'repeater' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100']"
            @click="activeTab = 'repeater'"
          >
            <Radio class="w-4 h-4" />
            中继器配置
          </button>
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-hidden">
          <RouteEditor 
            v-if="activeTab === 'route'"
            :route-id="routeId"
            :active="visible && activeTab === 'route'"
            @close="handleClose"
          />
          <SegmentConfigPanel 
            v-else-if="activeTab === 'segment'"
            :route-id="routeId"
          />
          <RepeaterConfigPanel 
            v-else-if="activeTab === 'repeater'"
            :route-id="routeId"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
