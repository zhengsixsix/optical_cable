<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores'
import { Button, Input } from '@/shared/components/base'
import { X, Eye, Check, AlertTriangle, Lock, Unlock, Settings, MapPin, ArrowLeft } from 'lucide-vue-next'
import type { CableSegment, CableSegmentSummary } from '@/types/cableSegment'

const props = defineProps<{
  visible: boolean
  segments: CableSegment[]
  summary: CableSegmentSummary | null
  segmentMethod?: string  // 分段方式
  routeId?: string        // 路径ID
  generateTime?: string   // 生成时间
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', segments: CableSegment[]): void
  (e: 'updateSegment', segment: CableSegment): void
  (e: 'goBack'): void
  (e: 'viewOnMap'): void
}>()

const appStore = useAppStore()

// 本地编辑的分段数据
const editableSegments = ref<CableSegment[]>([])

// 列显示配置
const showColumnConfig = ref(false)
const columnConfig = ref({
  segmentId: true,
  startKp: true,
  endKp: true,
  length: true,
  riskLevel: true,
  cableType: true,
  armorType: true,
  slack: true,
  burialDepth: true
})

// 列配置选项
const columnOptions = [
  { key: 'segmentId', label: '分段ID' },
  { key: 'startKp', label: '起点里程' },
  { key: 'endKp', label: '终点里程' },
  { key: 'length', label: '长度' },
  { key: 'riskLevel', label: '风险等级' },
  { key: 'cableType', label: '缆型' },
  { key: 'armorType', label: '铠装类型' },
  { key: 'slack', label: '余量' },
  { key: 'burialDepth', label: '埋深' }
]

// 监听 props.segments 变化，更新本地数据
import { watch } from 'vue'
watch(() => props.segments, (newSegments) => {
  editableSegments.value = newSegments.map(s => ({ ...s }))
}, { immediate: true, deep: true })

// 风险等级标签
const riskLevelLabels: Record<string, { text: string; class: string }> = {
  high: { text: '高风险', class: 'bg-red-100 text-red-700' },
  medium: { text: '中风险', class: 'bg-yellow-100 text-yellow-700' },
  low: { text: '低风险', class: 'bg-green-100 text-green-700' }
}

// 根据风险等级获取铠装类型名称
const getArmorTypeName = (riskLevel: string): string => {
  switch (riskLevel) {
    case 'high': return '双铠'
    case 'medium': return '单铠'
    case 'low': return '轻铠'
    default: return '-'
  }
}

// 切换锁定状态
const toggleLock = (segment: CableSegment) => {
  const index = editableSegments.value.findIndex(s => s.id === segment.id)
  if (index !== -1) {
    editableSegments.value[index].isLocked = !editableSegments.value[index].isLocked
  }
}

// 确认入库
const handleConfirm = () => {
  emit('confirm', editableSegments.value)
  appStore.showNotification({ type: 'success', message: `已确认 ${editableSegments.value.length} 个海缆段配置` })
}

const handleClose = () => {
  emit('close')
}

// 返回修改参数
const handleGoBack = () => {
  emit('goBack')
}

// 在地图中查看
const handleViewOnMap = () => {
  emit('viewOnMap')
  appStore.showNotification({ type: 'info', message: '已在地图中高亮显示海缆段' })
}

// 重置列配置为默认
const resetColumnConfig = () => {
  Object.keys(columnConfig.value).forEach(key => {
    columnConfig.value[key as keyof typeof columnConfig.value] = true
  })
}

// 格式化数字
const formatNumber = (num: number, decimals: number = 2) => {
  return num.toFixed(decimals)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click.self="handleClose"
    >
      <div class="w-[900px] max-w-[95vw] h-[80vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <Eye class="w-6 h-6 text-blue-600" />
            <span class="font-semibold text-lg">海缆段生成 - 结果预览</span>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" @click="showColumnConfig = true">
              <Settings class="w-4 h-4 mr-1" />
              列显示配置
            </Button>
            <Button variant="outline" size="sm" @click="handleViewOnMap">
              <MapPin class="w-4 h-4 mr-1" />
              在地图中查看
            </Button>
            <Button variant="ghost" size="sm" @click="handleClose">
              <X class="w-5 h-5" />
            </Button>
          </div>
        </div>

        <!-- 顶部摘要信息 -->
        <div class="px-6 py-3 border-b bg-white text-sm text-gray-600 flex flex-wrap gap-x-6 gap-y-1">
          <span>分段方式：<b class="text-gray-800">{{ segmentMethod === 'fixed-length' ? '固定长度分段' : '基于风险等级分段' }}</b></span>
          <span>路径ID：<b class="text-gray-800 font-mono">{{ routeId || '-' }}</b></span>
          <span>生成时间：<b class="text-gray-800">{{ generateTime || new Date().toLocaleString() }}</b></span>
          <span>海缆段数量：<b class="text-gray-800">{{ editableSegments.length }} 段</b></span>
          <span>路径总长：<b class="text-gray-800">{{ summary ? formatNumber(summary.totalLength) : '-' }} km</b></span>
        </div>

        <!-- 汇总统计 -->
        <div v-if="summary" class="px-6 py-4 border-b bg-blue-50/50">
          <div class="grid grid-cols-4 gap-4">
            <div class="bg-white rounded-lg p-3 border">
              <div class="text-xs text-gray-500">总长度</div>
              <div class="text-lg font-bold text-gray-800">{{ formatNumber(summary.totalLength) }} km</div>
            </div>
            <div class="bg-white rounded-lg p-3 border border-red-200">
              <div class="text-xs text-red-600">高风险段</div>
              <div class="text-lg font-bold text-red-700">
                {{ summary.highRiskSegments }} 段 / {{ formatNumber(summary.highRiskLength) }} km
              </div>
              <div class="text-xs text-gray-500">预估 {{ formatNumber(summary.highRiskCost) }} 千元</div>
            </div>
            <div class="bg-white rounded-lg p-3 border border-yellow-200">
              <div class="text-xs text-yellow-600">中风险段</div>
              <div class="text-lg font-bold text-yellow-700">
                {{ summary.mediumRiskSegments }} 段 / {{ formatNumber(summary.mediumRiskLength) }} km
              </div>
              <div class="text-xs text-gray-500">预估 {{ formatNumber(summary.mediumRiskCost) }} 千元</div>
            </div>
            <div class="bg-white rounded-lg p-3 border border-green-200">
              <div class="text-xs text-green-600">低风险段</div>
              <div class="text-lg font-bold text-green-700">
                {{ summary.lowRiskSegments }} 段 / {{ formatNumber(summary.lowRiskLength) }} km
              </div>
              <div class="text-xs text-gray-500">预估 {{ formatNumber(summary.lowRiskCost) }} 千元</div>
            </div>
          </div>
          <div class="mt-3 text-right">
            <span class="text-sm text-gray-600">总预估成本：</span>
            <span class="text-xl font-bold text-blue-700">{{ formatNumber(summary.totalCost) }} 千元</span>
          </div>
        </div>

        <!-- 分段列表 -->
        <div class="flex-1 overflow-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr class="border-b-2 border-gray-200">
                <th v-if="columnConfig.segmentId" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">分段ID</th>
                <th v-if="columnConfig.startKp" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">起点里程(km)</th>
                <th v-if="columnConfig.endKp" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">终点里程(km)</th>
                <th v-if="columnConfig.length" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">长度(km)</th>
                <th v-if="columnConfig.riskLevel" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">风险等级</th>
                <th v-if="columnConfig.cableType" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">缆型</th>
                <th v-if="columnConfig.armorType" class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">铠装类型</th>
                <th v-if="columnConfig.slack" class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">余量(%)</th>
                <th v-if="columnConfig.burialDepth" class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">埋深(m)</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">锁定</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-100">
              <tr 
                v-for="(segment, index) in editableSegments" 
                :key="segment.id"
                :class="[
                  'hover:bg-blue-50/50 transition-colors cursor-pointer',
                  segment.isLocked ? 'bg-blue-50/30' : '',
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                ]"
              >
                <td v-if="columnConfig.segmentId" class="px-4 py-3 font-mono text-gray-700 font-medium">S-{{ String(index + 1).padStart(3, '0') }}</td>
                <td v-if="columnConfig.startKp" class="px-4 py-3 font-mono text-gray-700">{{ formatNumber(segment.startKp, 3) }}</td>
                <td v-if="columnConfig.endKp" class="px-4 py-3 font-mono text-gray-700">{{ formatNumber(segment.endKp, 3) }}</td>
                <td v-if="columnConfig.length" class="px-4 py-3">
                  <span class="font-semibold text-gray-800">{{ formatNumber(segment.length) }}</span>
                </td>
                <td v-if="columnConfig.riskLevel" class="px-4 py-3">
                  <span :class="[
                    'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
                    segment.riskLevel === 'high' ? 'bg-red-100 text-red-700 ring-1 ring-red-200' :
                    segment.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' :
                    'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                  ]">
                    {{ riskLevelLabels[segment.riskLevel]?.text || segment.riskLevel }}
                  </span>
                </td>
                <td v-if="columnConfig.cableType" class="px-4 py-3">
                  <span class="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-medium">
                    {{ segment.cableTypeName }}
                  </span>
                </td>
                <td v-if="columnConfig.armorType" class="px-4 py-3">
                  <span class="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                    {{ getArmorTypeName(segment.riskLevel) }}
                  </span>
                </td>
                <td v-if="columnConfig.slack" class="px-4 py-3">
                  <div class="flex items-center justify-center">
                    <input 
                      v-model.number="segment.slack" 
                      type="number" 
                      step="0.1"
                      :disabled="segment.isLocked"
                      class="w-14 px-2 py-1 text-center text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </td>
                <td v-if="columnConfig.burialDepth" class="px-4 py-3">
                  <div class="flex items-center justify-center">
                    <input 
                      v-model.number="segment.burialDepth" 
                      type="number" 
                      step="0.1"
                      :disabled="segment.isLocked"
                      class="w-14 px-2 py-1 text-center text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </td>
                <td class="px-4 py-3 text-center">
                  <button 
                    @click="toggleLock(segment)"
                    :class="[
                      'p-2 rounded-lg transition-all duration-200',
                      segment.isLocked 
                        ? 'bg-blue-500 text-white shadow-sm hover:bg-blue-600' 
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    ]"
                    :title="segment.isLocked ? '点击解锁' : '点击锁定'"
                  >
                    <Lock v-if="segment.isLocked" class="w-4 h-4" />
                    <Unlock v-else class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          
          <!-- 空状态 -->
          <div v-if="editableSegments.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-500">
            <AlertTriangle class="w-12 h-12 mb-3 text-gray-300" />
            <p>暂无分段数据</p>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-6 py-4 border-t bg-gray-50 flex justify-between">
          <div class="flex items-center gap-3">
            <Button variant="outline" @click="handleGoBack">
              <ArrowLeft class="w-4 h-4 mr-1" />
              返回修改参数
            </Button>
            <span class="text-sm text-gray-500">
              <span class="text-blue-600 font-medium">提示：</span>
              锁定的分段在后续调整时保持配置不变
            </span>
          </div>
          <div class="flex gap-3">
            <Button variant="outline" @click="handleClose">取消</Button>
            <Button class="bg-blue-500 hover:bg-blue-600 text-white" @click="handleConfirm">
              <Check class="w-4 h-4 mr-2" />
              确认并入库
            </Button>
          </div>
        </div>

        <!-- 列显示配置弹窗 -->
        <Teleport to="body">
          <div
            v-if="showColumnConfig"
            class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
            @click.self="showColumnConfig = false"
          >
            <div class="w-[320px] bg-white rounded-xl shadow-2xl overflow-hidden">
              <div class="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <span class="font-semibold">列显示配置</span>
                <button class="text-gray-400 hover:text-gray-600" @click="showColumnConfig = false">
                  <X class="w-5 h-5" />
                </button>
              </div>
              <div class="p-5">
                <p class="text-sm text-gray-600 mb-4">请选择要显示的列：</p>
                <div class="space-y-2">
                  <label 
                    v-for="col in columnOptions" 
                    :key="col.key"
                    class="flex items-center gap-2 cursor-pointer"
                  >
                    <input 
                      type="checkbox" 
                      v-model="columnConfig[col.key as keyof typeof columnConfig]" 
                      class="w-4 h-4 accent-blue-500"
                    />
                    <span class="text-sm text-gray-700">{{ col.label }}</span>
                  </label>
                </div>
              </div>
              <div class="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
                <Button variant="outline" size="sm" @click="resetColumnConfig">重置默认</Button>
                <Button size="sm" @click="showColumnConfig = false">确认</Button>
              </div>
            </div>
          </div>
        </Teleport>
      </div>
    </div>
  </Teleport>
</template>
