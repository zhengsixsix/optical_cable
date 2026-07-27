<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteStore } from '@/stores/route'
import { cn } from '@/shared/utils'
import { getParetoFront, getValidParetoCandidates } from '@/services/ParetoAnalysisService'

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
const validRoutes = computed(() => getValidParetoCandidates(paretoRoutes.value))
const paretoFrontIds = computed(() => new Set(getParetoFront(validRoutes.value).map(route => route.id)))
const hasParetoMetrics = computed(() => validRoutes.value.length > 0)

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
      <span class="text-sm font-medium text-gray-700">候选路径列表</span>
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
          <span class="min-w-0 flex-1 text-gray-700">
            <span class="flex items-center gap-1.5">
              <span class="min-w-0 flex-1 truncate text-sm">{{ route.name || `路径${index + 1}` }}</span>
              <span
                v-if="Number.isFinite(route.cost.total) && Number.isFinite(route.risk.overall)"
                class="shrink-0 text-[10px] font-medium"
                :class="paretoFrontIds.has(route.id) ? 'text-blue-700' : 'text-gray-400'"
              >
                {{ paretoFrontIds.has(route.id) ? '前沿' : '被支配' }}
              </span>
            </span>
            <span
              v-if="Number.isFinite(route.cost.total) && Number.isFinite(route.risk.overall)"
              class="block truncate text-[11px] text-gray-500"
            >
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
        查看成本-风险图
      </button>
    </div>
    <div v-else-if="paretoRoutes.length > 0" class="border-t bg-gray-50 px-3 py-2 text-center text-xs text-gray-500">
      暂无有效成本 / 风险指标
    </div>
  </div>
</template>
