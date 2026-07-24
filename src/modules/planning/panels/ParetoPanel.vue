<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteStore } from '@/stores/route'
import { cn } from '@/shared/utils'

/**
 * ParetoPanel Pareto 路径列表面板
 * 单选模式，显示成本X和风险Y
 */
const emit = defineEmits<{
  (e: 'select-route', routeId: string): void
  (e: 'view-pareto-chart'): void
}>()

const routeStore = useRouteStore()

// 使用 storeToRefs 确保响应式正确工作
const { paretoRoutes } = storeToRefs(routeStore)

// 当前选中的路径ID
const selectedRouteId = computed(() => routeStore.selectedRoute?.id)
const hasParetoMetrics = computed(() => paretoRoutes.value.some(route =>
  Number.isFinite(route.cost.total) && Number.isFinite(route.risk.overall)
))

// 选择路径（单选）
const handleSelectRoute = (routeId: string) => {
  routeStore.selectRoute(routeId)
  emit('select-route', routeId)
}

// 查看Pareto前沿图
const handleViewParetoChart = () => {
  emit('view-pareto-chart')
}

const compactFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const formatMetric = (value: number | undefined) =>
  Number.isFinite(value) ? compactFormatter.format(value!) : '-'
</script>

<template>
  <div
    :class="cn(
      'absolute top-16 right-5 w-56 bg-white rounded-lg shadow-lg border overflow-hidden z-10',
      'transition-all duration-300'
    )"
  >
    <!-- 头部标题 -->
    <div class="px-3 py-2 border-b bg-gray-50">
      <span class="text-sm font-medium text-gray-700">Pareto路径列表</span>
    </div>

    <!-- 路径列表 -->
    <div class="max-h-[280px] overflow-y-auto">
      <!-- 无路径提示 -->
      <div
        v-if="paretoRoutes.length === 0"
        class="px-4 py-6 text-center text-gray-500 text-sm"
      >
        <p>暂无路径数据</p>
        <p class="text-xs mt-1">请先进行路由规划</p>
      </div>

      <template v-else>
        <!-- 路径项 (单选) -->
        <div
          v-for="(route, index) in paretoRoutes"
          :key="route.id"
          class="px-3 py-2 border-b flex items-center gap-2 hover:bg-gray-50 cursor-pointer"
          @click="handleSelectRoute(route.id)"
        >
          <input
            type="radio"
            name="pareto-route"
            :checked="selectedRouteId === route.id"
            class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            @click.stop
            @change="handleSelectRoute(route.id)"
          />
          <span class="min-w-0 text-gray-700">
            <span class="block truncate text-sm">路径{{ index + 1 }}</span>
            <span class="block truncate text-[11px] text-gray-500">
              成本 {{ formatMetric(route.cost.total) }} · 风险 {{ formatMetric(route.risk.overall) }}
            </span>
          </span>
        </div>
      </template>
    </div>

    <!-- 底部按钮 -->
    <div v-if="hasParetoMetrics" class="px-3 py-2 border-t bg-gray-50">
      <button
        class="w-full px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors"
        @click="handleViewParetoChart"
      >
        查看Pareto前沿图
      </button>
    </div>
  </div>
</template>
