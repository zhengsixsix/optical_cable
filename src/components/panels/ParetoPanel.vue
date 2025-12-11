<script setup lang="ts">
import {computed} from 'vue'
import {useRouteStore} from '@/stores'
import {ChevronDown, ChevronUp, Route, DollarSign, AlertTriangle} from 'lucide-vue-next'
import {cn} from '@/lib/utils'

/**
 * ParetoPanel Pareto 路径列表面板
 * 显示多条帕累托最优路径供用户选择
 */
interface Props {
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false
})

const emit = defineEmits<{
  (e: 'update:collapsed', value: boolean): void
  (e: 'select-route', routeId: string): void
}>()

const routeStore = useRouteStore()

const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit('update:collapsed', value)
})

// 从 routeStore 获取 Pareto 路径
const paretoRoutes = computed(() => routeStore.paretoRoutes)

// 当前选中的路由 ID
const selectedRouteId = computed(() => routeStore.selectedRoute?.id)

const handleSelectRoute = (routeId: string) => {
  routeStore.selectRoute(routeId)
  emit('select-route', routeId)
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// 格式化成本显示
const formatCost = (cost: number) => {
  if (cost >= 1000000) {
    return `$${(cost / 1000000).toFixed(1)}M`
  }
  if (cost >= 1000) {
    return `$${(cost / 1000).toFixed(0)}K`
  }
  return `$${cost.toFixed(0)}`
}

// 获取风险等级颜色
const getRiskColor = (risk: number) => {
  if (risk < 0.3) return 'text-green-500'
  if (risk < 0.6) return 'text-yellow-500'
  return 'text-red-500'
}


</script>

<template>
  <div
      :class="cn(
      'absolute top-16 right-5 w-64 bg-white rounded-lg shadow-lg border overflow-hidden z-10',
      'transition-all duration-300'
    )"
  >
    <!-- 头部 -->
    <div
        class="bg-primary text-white px-4 py-3 flex items-center justify-between cursor-pointer"
        @click="toggleCollapse"
    >
      <div class="flex items-center gap-2">
        <Route class="w-4 h-4"/>
        <span class="text-sm font-semibold">Pareto 路径列表</span>
      </div>
      <component :is="isCollapsed ? ChevronDown : ChevronUp" class="w-4 h-4"/>
    </div>

    <!-- 路径列表 -->
    <div
        v-show="!isCollapsed"
        class="max-h-[300px] overflow-y-auto"
    >
      <!-- 无路径提示 -->
      <div
          v-if="paretoRoutes.length === 0"
          class="px-4 py-6 text-center text-gray-500 text-sm"
      >
        <Route class="w-8 h-8 mx-auto mb-2 text-gray-300"/>
        <p>暂无路径数据</p>
        <p class="text-xs mt-1">请先进行路由规划</p>
      </div>

      <!-- 路径项 -->
      <div
          v-for="(route, index) in paretoRoutes"
          :key="route.id"
          :class="cn(
          'px-4 py-3 border-b cursor-pointer transition-colors',
          'hover:bg-gray-50',
          selectedRouteId === route.id && 'bg-blue-50 border-l-2 border-l-primary'
        )"
          @click="handleSelectRoute(route.id)"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-sm">路径 {{ index + 1 }}</span>
          <span
              v-if="selectedRouteId === route.id"
              class="text-xs bg-primary text-white px-2 py-0.5 rounded"
          >
            已选中
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="flex items-center gap-1 text-gray-600">
            <DollarSign class="w-3 h-3"/>
            <span>成本: {{ formatCost(route.cost.total) }}</span>
          </div>
          <div class="flex items-center gap-1" :class="getRiskColor(route.risk.overall)">
            <AlertTriangle class="w-3 h-3"/>
            <span>风险: {{ (route.risk.overall * 100).toFixed(0) }}%</span>
          </div>
        </div>

        <div class="text-xs text-gray-500 mt-1">
          总长度: {{ route.distance.toFixed(1) }} km
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div v-show="!isCollapsed && paretoRoutes.length > 0" class="px-4 py-2 bg-gray-50 border-t">
      <div class="text-xs text-gray-500 text-center">
        共 {{ paretoRoutes.length }} 条最优路径
      </div>
    </div>
  </div>
</template>
