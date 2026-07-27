<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardContent } from '@/shared/components/base'
import { Printer, Settings, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { useRouteStore } from '@/stores/route'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const rplStore = useRPLStore()
const routeStore = useRouteStore()
const appStore = useAppStore()
const stats = computed(() => {
  const route = routeStore.selectedRoute || routeStore.currentRoute
  if (route) {
    return {
      project: appStore.currentProjectName || route.name,
      totalLength: route.totalLength ?? route.distance ?? 0,
      landingStations: route.points.filter(point => point.type === 'landing').length,
      branchingUnits: route.points.filter(point => point.type === 'branching').length,
      segments: route.segments,
      route,
    }
  }

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
    segments: [],
    route: null,
  }
})

const selectSegment = (segmentId: string) => {
  const route = stats.value?.route
  const segment = route?.segments.find(item => item.id === segmentId)
  if (!route || !segment) return
  const startPoint = route.points.find(point => point.id === segment.startPointId)
  const endPoint = route.points.find(point => point.id === segment.endPointId)
  if (!startPoint || !endPoint) return

  routeStore.selectRoute(route.id)
  routeStore.selectSegmentInfo({
    id: segment.id,
    routeId: route.id,
    startPoint: { lon: startPoint.coordinates[0], lat: startPoint.coordinates[1], name: startPoint.name },
    endPoint: { lon: endPoint.coordinates[0], lat: endPoint.coordinates[1], name: endPoint.name },
    length: segment.length,
    depth: segment.depth,
    cableType: segment.cableType,
    riskLevel: segment.riskLevel,
  })
}
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
      <div v-if="stats" class="space-y-3">
        <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div class="col-span-2"><dt class="text-gray-400">项目</dt><dd class="font-medium text-gray-800 truncate">{{ stats.project }}</dd></div>
          <div><dt class="text-gray-400">总长度</dt><dd class="font-semibold text-gray-800">{{ stats.totalLength.toFixed(1) }} km</dd></div>
          <div><dt class="text-gray-400">路由分段</dt><dd class="font-semibold text-gray-800">{{ stats.segments.length }}</dd></div>
          <div><dt class="text-gray-400">登陆站</dt><dd class="font-semibold text-gray-800">{{ stats.landingStations }}</dd></div>
          <div><dt class="text-gray-400">分支器</dt><dd class="font-semibold text-gray-800">{{ stats.branchingUnits }}</dd></div>
        </dl>

        <div v-if="stats.segments.length" class="border-t pt-2">
          <div class="text-xs font-medium text-gray-600 mb-1.5">分段结果</div>
          <div class="space-y-1">
            <button
              v-for="(segment, index) in stats.segments"
              :key="segment.id"
              class="w-full grid grid-cols-[1fr_auto] gap-2 px-2 py-1.5 text-left text-xs border rounded hover:border-blue-300 hover:bg-blue-50 transition-colors"
              :class="routeStore.selectedSegmentInfo?.id === segment.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
              @click="selectSegment(segment.id)"
            >
              <span class="truncate">Section {{ String(index + 1).padStart(2, '0') }} · {{ segment.cableType || '未标注缆型' }}</span>
              <span class="tabular-nums">{{ segment.length.toFixed(1) }} km</span>
            </button>
          </div>
        </div>
      </div>
      <!-- 无项目数据时显示提示 -->
      <div v-else class="text-center text-gray-400 py-8">
        <p>暂无路由数据</p>
        <p class="text-xs mt-1">请打开项目或创建新路由</p>
      </div>
      
    </CardContent>
  </Card>
</template>
