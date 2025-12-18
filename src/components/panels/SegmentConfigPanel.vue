<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouteStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui'
import { 
  mockSegmentConfigs, 
  type SegmentConfigData,
  cableTypeOptions,
  burialMethodOptions,
  protectionOptions
} from '@/data/mockData'
import { 
  Settings, 
  Save, 
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2
} from 'lucide-vue-next'

const props = defineProps<{
  routeId?: string
}>()

const emit = defineEmits<{
  (e: 'update', segments: SegmentConfigData[]): void
  (e: 'close'): void
}>()

const routeStore = useRouteStore()
const appStore = useAppStore()

const segments = ref<SegmentConfigData[]>([])
const selectedSegmentId = ref<string | null>(null)

// 根据水深自动推荐电缆类型
function recommendCableType(depth: number): string {
  if (depth < 200) return 'DA'
  if (depth < 1000) return 'SA'
  if (depth < 1500) return 'LWS'
  return 'LW'
}

// 根据水深自动推荐埋设深度
function recommendBurialDepth(depth: number): number {
  if (depth > 1500) return 0
  if (depth > 1000) return 0.5
  if (depth > 200) return 1.0
  return 1.5
}

// 根据水深推荐余缆率
function recommendSlack(depth: number): number {
  if (depth > 3000) return 3.5
  if (depth > 1500) return 3.0
  if (depth > 500) return 2.5
  return 2.0
}

// 初始化分段数据 - 使用集中管理的mock数据
function initSegments() {
  segments.value = JSON.parse(JSON.stringify(mockSegmentConfigs))
}

function toggleExpand(segId: string) {
  const seg = segments.value.find(s => s.id === segId)
  if (seg) {
    seg.expanded = !seg.expanded
  }
}

function applyRecommendation(segId: string) {
  const seg = segments.value.find(s => s.id === segId)
  if (seg) {
    seg.cableType = recommendCableType(seg.avgDepth)
    seg.slack = recommendSlack(seg.avgDepth)
    seg.burialDepth = recommendBurialDepth(seg.avgDepth)
    seg.burialMethod = seg.avgDepth < 1500 ? 'plow' : 'none'
    seg.protection = seg.avgDepth < 200 ? 'rock' : 'none'
  }
}

function applyToAll(segId: string) {
  const source = segments.value.find(s => s.id === segId)
  if (!source) return

  segments.value.forEach(seg => {
    if (seg.id !== segId) {
      seg.cableType = source.cableType
      seg.slack = source.slack
      seg.burialMethod = source.burialMethod
      seg.protection = source.protection
    }
  })
  appStore.showNotification({ type: 'success', message: '已应用到所有分段' })
}

function resetAll() {
  segments.value.forEach(seg => {
    applyRecommendation(seg.id)
  })
  appStore.showNotification({ type: 'info', message: '已重置为推荐值' })
}

function handleSave() {
  emit('update', segments.value)
  appStore.showNotification({ type: 'success', message: '分段参数已保存' })
}

const totalLength = computed(() => segments.value.reduce((sum, s) => sum + s.length, 0))
const totalCableLength = computed(() => 
  segments.value.reduce((sum, s) => sum + s.length * (1 + s.slack / 100), 0)
)

watch(() => props.routeId, () => {
  initSegments()
}, { immediate: true })
</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden">
    <CardHeader class="shrink-0 border-b">
      <div class="flex items-center gap-2">
        <Settings class="w-5 h-5 text-orange-600" />
        <span class="font-semibold">分段参数配置</span>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="resetAll">
          <RotateCcw class="w-4 h-4 mr-1" />
          重置推荐
        </Button>
        <Button size="sm" @click="handleSave">
          <Save class="w-4 h-4 mr-1" />
          保存
        </Button>
      </div>
    </CardHeader>

    <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
      <!-- 统计信息 -->
      <div class="px-4 py-3 bg-gray-50 border-b grid grid-cols-4 gap-4 text-sm">
        <div class="text-center">
          <div class="font-semibold text-blue-600">{{ segments.length }}</div>
          <div class="text-xs text-gray-500">分段数</div>
        </div>
        <div class="text-center">
          <div class="font-semibold text-green-600">{{ totalLength.toFixed(1) }}</div>
          <div class="text-xs text-gray-500">路由长度(km)</div>
        </div>
        <div class="text-center">
          <div class="font-semibold text-orange-600">{{ totalCableLength.toFixed(1) }}</div>
          <div class="text-xs text-gray-500">电缆长度(km)</div>
        </div>
        <div class="text-center">
          <div class="font-semibold text-purple-600">{{ ((totalCableLength / totalLength - 1) * 100).toFixed(1) }}%</div>
          <div class="text-xs text-gray-500">平均余缆率</div>
        </div>
      </div>

      <!-- 分段列表 -->
      <div class="flex-1 overflow-auto">
        <div class="divide-y">
          <div 
            v-for="seg in segments" 
            :key="seg.id"
            class="bg-white"
          >
            <!-- 分段头部 -->
            <div 
              class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              @click="toggleExpand(seg.id)"
            >
              <div class="flex items-center gap-4">
                <span class="text-sm font-medium text-gray-700 w-20">
                  KP {{ seg.startKP }} - {{ seg.endKP }}
                </span>
                <span class="text-sm text-gray-500">{{ seg.length }} km</span>
                <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{{ seg.cableType }}</span>
                <span class="text-xs text-gray-500">水深 {{ seg.avgDepth }}m</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">余缆 {{ seg.slack }}%</span>
                <component :is="seg.expanded ? ChevronUp : ChevronDown" class="w-4 h-4 text-gray-400" />
              </div>
            </div>

            <!-- 分段详情 -->
            <div v-if="seg.expanded" class="px-4 py-4 bg-gray-50 border-t space-y-4">
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">电缆类型</label>
                  <Select v-model="seg.cableType" :options="cableTypeOptions" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">余缆率 (%)</label>
                  <input
                    v-model.number="seg.slack"
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">埋设深度 (m)</label>
                  <input
                    v-model.number="seg.burialDepth"
                    type="number"
                    step="0.1"
                    min="0"
                    max="3"
                    class="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">埋设方式</label>
                  <Select v-model="seg.burialMethod" :options="burialMethodOptions" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">防护方式</label>
                  <Select v-model="seg.protection" :options="protectionOptions" />
                </div>
              </div>

              <div class="flex items-center justify-between pt-2 border-t">
                <div class="text-xs text-gray-500">
                  平均水深: {{ seg.avgDepth }}m · 最大水深: {{ seg.maxDepth }}m
                </div>
                <div class="flex gap-2">
                  <Button variant="outline" size="sm" @click="applyRecommendation(seg.id)">
                    <RotateCcw class="w-3 h-3 mr-1" />
                    推荐值
                  </Button>
                  <Button variant="outline" size="sm" @click="applyToAll(seg.id)">
                    <Copy class="w-3 h-3 mr-1" />
                    应用到全部
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
