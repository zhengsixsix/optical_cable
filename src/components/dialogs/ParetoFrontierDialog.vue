<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { Button } from '@/components/ui'
import ParetoChart from '@/components/visualization/ParetoChart.vue'
import { useRouteStore } from '@/stores'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select-route', routeId: string): void
}>()

const routeStore = useRouteStore()

const close = () => {
  emit('update:visible', false)
}

const handleSelectRoute = (routeId: string) => {
  emit('select-route', routeId)
}

// 选中路径的详细信息
const selectedRouteInfo = computed(() => {
  const route = routeStore.selectedRoute
  if (!route) return null
  return {
    id: route.id,
    name: route.name,
    cost: (route.cost.total / 1000000).toFixed(2),
    risk: (route.risk.overall * 100).toFixed(1),
    length: route.totalLength?.toFixed(1) || '-'
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="bg-white rounded-xl shadow-2xl w-[500px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
          <h3 class="font-semibold text-gray-800">Pareto 最优前沿分析</h3>
          <button
            class="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
            @click="close"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 flex-1 overflow-auto">
          <!-- Pareto 图表 -->
          <div class="bg-gray-50 rounded-lg p-4 mb-4">
            <ParetoChart
              :width="440"
              :height="280"
              @select-route="handleSelectRoute"
            />
          </div>

          <!-- 选中路径信息 -->
          <div v-if="selectedRouteInfo" class="bg-blue-50 rounded-lg p-4">
            <div class="text-sm font-medium text-blue-800 mb-2">当前选中: {{ selectedRouteInfo.name }}</div>
            <div class="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div class="text-gray-500">总成本</div>
                <div class="font-semibold text-gray-800">${{ selectedRouteInfo.cost }}M</div>
              </div>
              <div>
                <div class="text-gray-500">风险指数</div>
                <div class="font-semibold text-gray-800">{{ selectedRouteInfo.risk }}%</div>
              </div>
              <div>
                <div class="text-gray-500">路径长度</div>
                <div class="font-semibold text-gray-800">{{ selectedRouteInfo.length }} km</div>
              </div>
            </div>
          </div>

          <div v-else class="text-center text-gray-400 text-sm py-4">
            点击图表中的数据点查看路径详情
          </div>

          <!-- 说明 -->
          <div class="mt-4 text-xs text-gray-500">
            <p>• Pareto 前沿表示在成本和风险之间的最优权衡方案</p>
            <p>• 位于前沿线上的路径方案均为帕累托最优解</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t flex justify-end gap-3">
          <Button variant="outline" @click="close">关闭</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
