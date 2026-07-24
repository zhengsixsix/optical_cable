<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardContent } from '@/shared/components/base'
import { Printer, Settings, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const rplStore = useRPLStore()
const appStore = useAppStore()
// 只展示 RPL/后端已经提供的元数据。
const stats = computed(() => {
  const table = rplStore.currentTable
  if (!table || table.records.length === 0) {
    return null
  }

  const metadata = table.metadata

  return {
    project: appStore.currentProjectName || table.name,
    totalLength: metadata.totalLength,
    landingStations: metadata.landingStations,
    branchingUnits: metadata.branchingUnits,
  }
})
</script>

<template>
  <Card class="flex-1 flex flex-col min-h-[200px] overflow-hidden">
    <CardHeader>
      <span class="font-semibold text-sm text-gray-700">海底路由信息统计</span>
      <div class="flex gap-1">
        <button class="p-1 hover:bg-gray-200 rounded">
          <Printer class="w-4 h-4 text-gray-500" />
        </button>
        <button class="p-1 hover:bg-gray-200 rounded">
          <Settings class="w-4 h-4 text-gray-500" />
        </button>
        <button class="p-1 hover:bg-gray-200 rounded" title="隐藏" @click="emit('close')">
          <X class="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </CardHeader>
    
    <CardContent class="flex-1 overflow-auto text-sm text-gray-600">
      <!-- 有项目数据时显示统计 -->
      <ul v-if="stats" class="list-disc pl-5 space-y-1.5">
        <li><strong class="text-gray-800">项目:</strong> {{ stats.project }}</li>
        <li><strong class="text-gray-800">总长度:</strong> {{ stats.totalLength }} km</li>
        <li><strong class="text-gray-800">登陆站数量:</strong> {{ stats.landingStations }}</li>
        <li><strong class="text-gray-800">分支器数量:</strong> {{ stats.branchingUnits }}</li>
      </ul>
      <!-- 无项目数据时显示提示 -->
      <div v-else class="text-center text-gray-400 py-8">
        <p>暂无路由数据</p>
        <p class="text-xs mt-1">请打开项目或创建新路由</p>
      </div>
      
    </CardContent>
  </Card>
</template>
