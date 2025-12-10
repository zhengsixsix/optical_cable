<script setup lang="ts">
import { ref } from 'vue'
import FloatingPanel from './FloatingPanel.vue'
import ParetoChart from '@/components/visualization/ParetoChart.vue'
import { useRouteStore, useAppStore } from '@/stores'
import { TrendingUp, Target, DollarSign, AlertTriangle } from 'lucide-vue-next'

/**
 * ParetoAnalysisPanel Pareto 分析浮动面板
 * 包含 Pareto 散点图和详细分析
 */
const routeStore = useRouteStore()
const appStore = useAppStore()

const handleSelectRoute = (routeId: string) => {
  routeStore.selectRoute(routeId)
}

const handleClose = () => {
  appStore.setPanelVisible('paretoAnalysisPanel', false)
}

// 格式化成本
const formatCost = (cost: number) => {
  if (cost >= 1000000) return `$${(cost / 1000000).toFixed(2)}M`
  if (cost >= 1000) return `$${(cost / 1000).toFixed(0)}K`
  return `$${cost.toFixed(0)}`
}
</script>

<template>
  <FloatingPanel
    title="Pareto 分析"
    storage-key="pareto-analysis"
    :default-position="{ x: 20, y: 80 }"
    :default-size="{ width: 320, height: 450 }"
    :min-width="280"
    :min-height="350"
    @close="handleClose"
  >
    <div class="p-3 space-y-4">
      <!-- Pareto 散点图 -->
      <ParetoChart
        :width="280"
        :height="180"
        @select-route="handleSelectRoute"
      />

      <!-- 路径对比表格 -->
      <div class="border rounded-lg overflow-hidden">
        <div class="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 flex items-center gap-2">
          <TrendingUp class="w-4 h-4" />
          路径对比
        </div>
        <div class="divide-y">
          <div
            v-for="(route, index) in routeStore.paretoRoutes"
            :key="route.id"
            :class="[
              'px-3 py-2 text-xs cursor-pointer transition-colors',
              routeStore.selectedRoute?.id === route.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            ]"
            @click="routeStore.selectRoute(route.id)"
          >
            <div class="flex justify-between items-center mb-1">
              <span class="font-medium">{{ route.name }}</span>
              <span
                v-if="routeStore.selectedRoute?.id === route.id"
                class="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded"
              >
                已选
              </span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-gray-500">
              <div class="flex items-center gap-1">
                <DollarSign class="w-3 h-3" />
                {{ formatCost(route.cost.total) }}
              </div>
              <div class="flex items-center gap-1">
                <AlertTriangle class="w-3 h-3" />
                {{ (route.risk.overall * 100).toFixed(0) }}%
              </div>
              <div class="flex items-center gap-1">
                <Target class="w-3 h-3" />
                {{ route.distance.toFixed(0) }} km
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 选中路径详情 -->
      <div v-if="routeStore.selectedRoute" class="border rounded-lg p-3">
        <div class="text-xs font-medium text-gray-700 mb-2">成本明细</div>
        <div class="space-y-1 text-xs text-gray-600">
          <div class="flex justify-between">
            <span>电缆成本</span>
            <span>{{ formatCost(routeStore.selectedRoute.cost.cable) }}</span>
          </div>
          <div class="flex justify-between">
            <span>安装成本</span>
            <span>{{ formatCost(routeStore.selectedRoute.cost.installation) }}</span>
          </div>
          <div class="flex justify-between">
            <span>设备成本</span>
            <span>{{ formatCost(routeStore.selectedRoute.cost.equipment) }}</span>
          </div>
          <div class="flex justify-between font-medium pt-1 border-t">
            <span>总计</span>
            <span>{{ formatCost(routeStore.selectedRoute.cost.total) }}</span>
          </div>
        </div>
      </div>
    </div>
  </FloatingPanel>
</template>
