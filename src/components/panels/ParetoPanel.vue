<script setup lang="ts">
import { computed } from 'vue'
import { useRouteStore } from '@/stores'
import { cn } from '@/lib/utils'

/**
 * ParetoPanel Pareto 路径列表面板
 * 单选模式，显示成本X和风险Y
 */
const emit = defineEmits<{
  (e: 'select-route', routeId: string): void
  (e: 'view-pareto-chart'): void
}>()

const routeStore = useRouteStore()

// 从 routeStore 获取 Pareto 路径
const paretoRoutes = computed(() => routeStore.paretoRoutes)

// 当前选中的路径ID
const selectedRouteId = computed(() => routeStore.selectedRoute?.id)

// 选择路径（单选）
const handleSelectRoute = (routeId: string) => {
  routeStore.selectRoute(routeId)
  emit('select-route', routeId)
}

// 查看Pareto前沿图
const handleViewParetoChart = () => {
  emit('view-pareto-chart')
}

// 格式化成本显示 (万元)
const formatCost = (cost: number) => {
  return (cost / 10000).toFixed(0)
}

// 格式化风险显示
const formatRisk = (risk: number) => {
  return (risk * 10).toFixed(1)
}
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
          <span class="text-sm text-gray-700">
            路径{{ index + 1 }}(成本{{ formatCost(route.cost.total) }}，风险{{ formatRisk(route.risk.overall) }})
          </span>
        </div>
      </template>
    </div>

    <!-- 底部按钮 -->
    <div v-if="paretoRoutes.length > 0" class="px-3 py-2 border-t bg-gray-50">
      <button
        class="w-full px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors"
        @click="handleViewParetoChart"
      >
        查看Pareto前沿图
      </button>
    </div>
  </div>
</template>
