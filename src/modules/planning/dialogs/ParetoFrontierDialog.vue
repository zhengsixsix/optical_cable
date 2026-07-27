<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Download, X } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import ParetoChart from '@/modules/planning/components/ParetoChart.vue'
import { useRouteStore } from '@/stores/route'
import { getParetoFront, getValidParetoCandidates } from '@/services/ParetoAnalysisService'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select-route', routeId: string): void
}>()

const routeStore = useRouteStore()
const dialogRef = ref<HTMLDivElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null
const compactFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 2,
})
const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 2,
})

const validRoutes = computed(() => getValidParetoCandidates(routeStore.paretoRoutes))
const paretoFrontRoutes = computed(() => getParetoFront(validRoutes.value))
const paretoFrontIds = computed(() => new Set(paretoFrontRoutes.value.map(route => route.id)))

const close = () => {
  emit('update:visible', false)
}

const handleDialogKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !dialogRef.value) return

  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter(element => element.offsetParent !== null)
  if (focusable.length === 0) {
    event.preventDefault()
    dialogRef.value.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.visible, async visible => {
  if (visible) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    await nextTick()
    dialogRef.value?.focus()
    return
  }
  if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus()
  previouslyFocusedElement = null
}, { immediate: true })

onBeforeUnmount(() => {
  if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus()
})

const handleSelectRoute = (routeId: string) => {
  routeStore.selectRoute(routeId)
  emit('select-route', routeId)
}

const formatMetric = (value: number | undefined) =>
  Number.isFinite(value) ? compactFormatter.format(value!) : '-'

const formatRisk = (value: number | undefined) => {
  if (!Number.isFinite(value)) return '-'
  return value! >= 0 && value! <= 1 ? percentFormatter.format(value!) : compactFormatter.format(value!)
}

const formatLength = (value: number | undefined) =>
  Number.isFinite(value) ? `${value!.toFixed(1)} km` : '-'

const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`

const exportParetoCsv = () => {
  const generatedAt = new Date().toISOString()
  const selectedId = routeStore.selectedRoute?.id
  const rows = validRoutes.value.map(route => [
    route.id,
    route.name,
    paretoFrontIds.value.has(route.id),
    route.id === selectedId,
    route.cost.total,
    route.risk.overall,
    Number.isFinite(route.totalLength) ? route.totalLength : '',
    Number.isFinite(route.cost.cable) ? route.cost.cable : '',
    Number.isFinite(route.cost.installation) ? route.cost.installation : '',
    Number.isFinite(route.cost.equipment) ? route.cost.equipment : '',
    Number.isFinite(route.risk.seismic) ? route.risk.seismic : '',
    Number.isFinite(route.risk.volcanic) ? route.risk.volcanic : '',
    Number.isFinite(route.risk.depth) ? route.risk.depth : '',
    generatedAt,
  ])
  const csv = [
    [
      'route_id',
      'route_name',
      'is_pareto',
      'is_selected',
      'total_cost',
      'total_risk',
      'length_km',
      'cable_cost',
      'installation_cost',
      'equipment_cost',
      'seismic_risk',
      'volcanic_risk',
      'depth_risk',
      'generated_at',
    ],
    ...rows,
  ].map(row => row.map(escapeCsv).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `Pareto前沿数据_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

const selectedRouteInfo = computed(() => {
  const route = validRoutes.value.find(candidate => candidate.id === routeStore.selectedRoute?.id)
  if (!route) return null
  return {
    id: route.id,
    name: route.name,
    isPareto: paretoFrontIds.value.has(route.id),
    cost: formatMetric(route.cost.total),
    risk: formatRisk(route.risk.overall),
    length: formatLength(route.totalLength),
    costBreakdown: [
      { label: '海缆成本', value: route.cost.cable },
      { label: '施工成本', value: route.cost.installation },
      { label: '设备成本', value: route.cost.equipment },
    ].filter(item => Number.isFinite(item.value)),
    riskBreakdown: [
      { label: '地震风险', value: route.risk.seismic },
      { label: '火山风险', value: route.risk.volcanic },
      { label: '深度风险', value: route.risk.depth },
    ].filter(item => Number.isFinite(item.value)),
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        ref="dialogRef"
        class="flex max-h-[94vh] w-[960px] max-w-[calc(100vw_-_2rem)] flex-col overflow-hidden rounded-lg border-t-2 border-teal-700 bg-white shadow-2xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pareto-dialog-title"
        tabindex="-1"
        @keydown="handleDialogKeydown"
      >
        <div class="flex shrink-0 items-center justify-between border-b bg-slate-50 px-5 py-3.5">
          <div class="min-w-0">
            <h3 id="pareto-dialog-title" class="truncate font-semibold text-slate-900">成本与风险方案分析</h3>
            <p class="mt-0.5 text-xs text-slate-500">
              {{ validRoutes.length }} 个有效方案，其中 {{ paretoFrontRoutes.length }} 个位于 Pareto 前沿
            </p>
          </div>
          <button
            type="button"
            class="ml-4 shrink-0 p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
            title="关闭"
            aria-label="关闭成本与风险方案分析"
            @click="close"
          >
            <X class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 overflow-auto px-5 py-4">
          <ParetoChart
            :width="880"
            :height="420"
            @select-route="handleSelectRoute"
          />

          <div v-if="validRoutes.length > 0" class="mt-5 border-t border-slate-200 pt-4">
            <div class="mb-2 flex items-center justify-between gap-4">
              <h4 class="text-sm font-semibold text-slate-800">方案对比</h4>
              <span class="text-xs text-slate-500">成本与风险均按越低越优计算</span>
            </div>
            <div class="overflow-x-auto border border-slate-200">
              <table class="w-full min-w-[600px] border-collapse text-sm">
                <thead class="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium">方案</th>
                    <th class="w-24 px-3 py-2 text-center font-medium">状态</th>
                    <th class="w-28 px-3 py-2 text-right font-medium">成本</th>
                    <th class="w-28 px-3 py-2 text-right font-medium">风险</th>
                    <th class="w-28 px-3 py-2 text-right font-medium">长度</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="route in validRoutes"
                    :key="route.id"
                    class="border-t border-slate-100 transition-colors hover:bg-slate-50"
                    :class="routeStore.selectedRoute?.id === route.id ? 'bg-amber-50' : ''"
                  >
                    <td class="max-w-[280px] px-3 py-2">
                      <button
                        type="button"
                        class="block max-w-full truncate text-left font-medium text-slate-800 hover:text-teal-700"
                        :title="route.name"
                        @click="handleSelectRoute(route.id)"
                      >
                        {{ route.name || route.id }}
                      </button>
                    </td>
                    <td class="px-3 py-2 text-center">
                      <span
                        class="inline-flex items-center gap-1.5 text-xs font-medium"
                        :class="paretoFrontIds.has(route.id) ? 'text-teal-700' : 'text-slate-500'"
                      >
                        <span class="h-2 w-2 rotate-45" :class="paretoFrontIds.has(route.id) ? 'bg-teal-700' : 'rounded-full bg-slate-400'"></span>
                        {{ paretoFrontIds.has(route.id) ? '前沿' : '被支配' }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-right font-mono text-slate-700">{{ formatMetric(route.cost.total) }}</td>
                    <td class="px-3 py-2 text-right font-mono text-slate-700">{{ formatRisk(route.risk.overall) }}</td>
                    <td class="px-3 py-2 text-right font-mono text-slate-700">{{ formatLength(route.totalLength) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="selectedRouteInfo" class="mt-4 border-t border-slate-200 pt-4">
            <div class="mb-3 flex flex-wrap items-center gap-2">
              <h4 class="min-w-0 truncate text-sm font-semibold text-slate-900">{{ selectedRouteInfo.name }}</h4>
              <span
                class="text-xs font-medium"
                :class="selectedRouteInfo.isPareto ? 'text-teal-700' : 'text-slate-500'"
              >
                {{ selectedRouteInfo.isPareto ? 'Pareto 前沿' : '被其他方案支配' }}
              </span>
            </div>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt class="text-xs text-slate-500">方案 ID</dt>
                <dd class="truncate font-mono text-slate-800" :title="selectedRouteInfo.id">{{ selectedRouteInfo.id }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">总成本</dt>
                <dd class="font-semibold text-slate-900">{{ selectedRouteInfo.cost }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">总风险</dt>
                <dd class="font-semibold text-slate-900">{{ selectedRouteInfo.risk }}</dd>
              </div>
              <div>
                <dt class="text-xs text-slate-500">路径长度</dt>
                <dd class="font-semibold text-slate-900">{{ selectedRouteInfo.length }}</dd>
              </div>
            </dl>
            <div
              v-if="selectedRouteInfo.costBreakdown.length || selectedRouteInfo.riskBreakdown.length"
              class="mt-3 grid gap-x-8 gap-y-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2"
            >
              <div v-if="selectedRouteInfo.costBreakdown.length" class="grid grid-cols-3 gap-3">
                <div v-for="item in selectedRouteInfo.costBreakdown" :key="item.label">
                  <div class="text-slate-500">{{ item.label }}</div>
                  <div class="mt-0.5 font-mono text-slate-800">{{ formatMetric(item.value) }}</div>
                </div>
              </div>
              <div v-if="selectedRouteInfo.riskBreakdown.length" class="grid grid-cols-3 gap-3">
                <div v-for="item in selectedRouteInfo.riskBreakdown" :key="item.label">
                  <div class="text-slate-500">{{ item.label }}</div>
                  <div class="mt-0.5 font-mono text-slate-800">{{ formatRisk(item.value) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex shrink-0 justify-between gap-3 border-t bg-white px-5 py-3.5">
          <Button variant="outline" :disabled="validRoutes.length === 0" @click="exportParetoCsv">
            <Download class="mr-1 h-4 w-4" />
            导出数据
          </Button>
          <Button variant="outline" @click="close">关闭</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
