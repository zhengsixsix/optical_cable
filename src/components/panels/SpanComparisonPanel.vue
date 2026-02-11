<script setup lang="ts">
/**
 * Span 方案对比面板 (Step 6.1)
 * 展示系统推荐 vs 用户选择的性能对比，支持直接输入 Span 值
 */
import { ref, computed, watch } from 'vue'
import { Button, Input } from '@/shared/components/base'
import { RotateCcw, Check, AlertTriangle } from 'lucide-vue-next'
import type { SpanScanResult, SpanScanPoint } from '@/types/simulation'

const props = defineProps<{
  /** Span 扫描结果 */
  scanResult?: SpanScanResult | null
  /** 链路总长度 (km) */
  totalLength: number
  /** 系统推荐 Span */
  recommendedSpan?: number | null
  /** 用户选定的 Span */
  userSelectedSpan?: number | null
  /** 成本参数 */
  costConfig?: {
    cablePerKm?: number
    repeaterPerUnit?: number
    buPerUnit?: number
    installationPerKm?: number
  }
}>()

const emit = defineEmits<{
  (e: 'update:userSelectedSpan', v: number | null): void
  (e: 'apply-user-selection', spanKm: number): void
  (e: 'restore-recommended'): void
}>()

// 选择模式：'recommended' | 'custom'
const selectionMode = ref<'recommended' | 'custom'>('recommended')
// 自定义输入值
const customSpanInput = ref<number>(80)

// 同步外部用户选择
watch(() => props.userSelectedSpan, (v) => {
  if (v != null) {
    selectionMode.value = 'custom'
    customSpanInput.value = v
  }
}, { immediate: true })

// 当系统推荐变更时初始化
watch(() => props.recommendedSpan, (v) => {
  if (v != null && selectionMode.value === 'recommended') {
    customSpanInput.value = v
  }
}, { immediate: true })

// 处理模式切换
const handleModeChange = (mode: 'recommended' | 'custom') => {
  selectionMode.value = mode
  if (mode === 'recommended') {
    emit('update:userSelectedSpan', null)
  }
}

// 处理自定义输入变化
const handleCustomInput = () => {
  const v = customSpanInput.value
  if (v && v >= 30 && v <= 200) {
    selectionMode.value = 'custom'
    emit('update:userSelectedSpan', v)
  }
}

/** 在扫描点间线性插值 */
const interpolateAtSpan = (spanKm: number): Partial<SpanScanPoint> | null => {
  const pts = props.scanResult?.scanPoints
  if (!pts || pts.length === 0) return null
  if (spanKm <= pts[0].spanLengthKm) return pts[0]
  if (spanKm >= pts[pts.length - 1].spanLengthKm) return pts[pts.length - 1]
  for (let i = 0; i < pts.length - 1; i++) {
    if (spanKm >= pts[i].spanLengthKm && spanKm <= pts[i + 1].spanLengthKm) {
      const t = (spanKm - pts[i].spanLengthKm) / (pts[i + 1].spanLengthKm - pts[i].spanLengthKm)
      const lerp = (a: number, b: number) => a + (b - a) * t
      return {
        spanLengthKm: spanKm,
        avgGsnrDb: lerp(pts[i].avgGsnrDb, pts[i + 1].avgGsnrDb),
        minGsnrDb: lerp(pts[i].minGsnrDb, pts[i + 1].minGsnrDb),
        avgOsnrDb: lerp(pts[i].avgOsnrDb, pts[i + 1].avgOsnrDb),
        gsnrMarginDb: lerp(pts[i].gsnrMarginDb, pts[i + 1].gsnrMarginDb),
        meetTarget: lerp(pts[i].avgGsnrDb, pts[i + 1].avgGsnrDb) >= (props.scanResult?.targetGsnrDb ?? 0),
      }
    }
  }
  return null
}

/** 计算放大器数量 */
const ampCount = (spanKm: number) => {
  if (!props.totalLength || spanKm <= 0) return 0
  return Math.max(0, Math.ceil(props.totalLength / spanKm) - 1)
}

/** 估算链路成本 */
const estimateCost = (spanKm: number) => {
  if (!props.costConfig || !props.totalLength) return null
  const cable = (props.costConfig.cablePerKm || 0) * props.totalLength
  const repeater = (props.costConfig.repeaterPerUnit || 0) * ampCount(spanKm)
  const install = (props.costConfig.installationPerKm || 0) * props.totalLength
  return cable + repeater + install
}

const formatCost = (cost: number | null) => {
  if (cost == null) return '-'
  if (cost >= 1e6) return `$${(cost / 1e6).toFixed(2)}M`
  if (cost >= 1e3) return `$${(cost / 1e3).toFixed(0)}K`
  return `$${cost.toFixed(0)}`
}

// 系统推荐方案数据
const recommendedData = computed(() => {
  const span = props.recommendedSpan ?? props.scanResult?.recommendedSpanKm
  if (!span) return null
  const perf = interpolateAtSpan(span)
  return {
    span,
    amps: ampCount(span),
    osnr: perf?.avgOsnrDb ?? 0,
    margin: perf?.gsnrMarginDb ?? 0,
    cost: estimateCost(span),
  }
})

// 用户选择方案数据
const userData = computed(() => {
  const span = props.userSelectedSpan ?? customSpanInput.value
  if (!span) return null
  const perf = interpolateAtSpan(span)
  return {
    span,
    amps: ampCount(span),
    osnr: perf?.avgOsnrDb ?? 0,
    margin: perf?.gsnrMarginDb ?? 0,
    cost: estimateCost(span),
  }
})

// 差异计算
const diff = computed(() => {
  if (!recommendedData.value || !userData.value) return null
  const rd = recommendedData.value
  const ud = userData.value
  return {
    span: ud.span - rd.span,
    amps: ud.amps - rd.amps,
    osnr: ud.osnr - rd.osnr,
    margin: ud.margin - rd.margin,
    costPct: rd.cost && ud.cost ? ((ud.cost - rd.cost) / rd.cost * 100) : null,
  }
})

// 风险等级
const riskLevel = computed(() => {
  const margin = userData.value?.margin ?? 999
  if (margin < 0) return 'danger'
  if (margin < 2) return 'warning'
  return 'safe'
})

const handleApply = () => {
  const span = selectionMode.value === 'recommended'
    ? (props.recommendedSpan ?? props.scanResult?.recommendedSpanKm)
    : (props.userSelectedSpan ?? customSpanInput.value)
  if (span) emit('apply-user-selection', span)
}

const handleRestore = () => {
  selectionMode.value = 'recommended'
  emit('update:userSelectedSpan', null)
  emit('restore-recommended')
}
</script>

<template>
  <div class="span-comparison-panel space-y-3">
    <!-- 选择方式 -->
    <div class="bg-gray-50 rounded-lg p-3 border">
      <div class="text-xs font-medium text-gray-600 mb-2">选择方式</div>
      <div class="space-y-2">
        <label class="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio" name="span-mode" value="recommended"
            :checked="selectionMode === 'recommended'"
            class="accent-blue-500"
            @change="handleModeChange('recommended')"
          />
          <span>系统推荐</span>
          <span class="text-blue-600 font-mono font-medium ml-auto">
            {{ recommendedData?.span ?? '-' }} km
          </span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio" name="span-mode" value="custom"
            :checked="selectionMode === 'custom'"
            class="accent-purple-500"
            @change="handleModeChange('custom')"
          />
          <span>用户自定义</span>
        </label>
        <div v-if="selectionMode === 'custom'" class="flex items-center gap-2 ml-6">
          <span class="text-xs text-gray-500">目标 Span:</span>
          <Input
            v-model.number="customSpanInput"
            type="number" min="30" max="200" step="1"
            class="w-20 text-sm"
            @change="handleCustomInput"
            @keyup.enter="handleCustomInput"
          />
          <span class="text-xs text-gray-500">km</span>
        </div>
      </div>
    </div>

    <!-- 方案对比 -->
    <div v-if="recommendedData && userData && selectionMode === 'custom'" class="border rounded-lg overflow-hidden">
      <div class="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 border-b">方案对比</div>
      <div class="text-sm divide-y">
        <!-- 表头 -->
        <div class="grid grid-cols-4 px-3 py-1.5 bg-gray-50/50 text-xs text-gray-500 font-medium">
          <span>指标</span>
          <span class="text-center">系统推荐</span>
          <span class="text-center">用户选择</span>
          <span class="text-right">差异</span>
        </div>
        <!-- Span 长度 -->
        <div class="grid grid-cols-4 px-3 py-1.5 items-center">
          <span class="text-xs text-gray-600">Span 长度</span>
          <span class="text-center font-mono text-xs">{{ recommendedData.span }} km</span>
          <span class="text-center font-mono text-xs text-purple-600">{{ userData.span }} km</span>
          <span class="text-right font-mono text-xs" :class="diff!.span > 0 ? 'text-amber-600' : 'text-green-600'">
            {{ diff!.span > 0 ? '+' : '' }}{{ diff!.span }}
          </span>
        </div>
        <!-- 放大器数量 -->
        <div class="grid grid-cols-4 px-3 py-1.5 items-center">
          <span class="text-xs text-gray-600">放大器数量</span>
          <span class="text-center font-mono text-xs">{{ recommendedData.amps }} 台</span>
          <span class="text-center font-mono text-xs text-purple-600">{{ userData.amps }} 台</span>
          <span class="text-right font-mono text-xs" :class="diff!.amps < 0 ? 'text-green-600' : 'text-amber-600'">
            {{ diff!.amps > 0 ? '+' : '' }}{{ diff!.amps }}
          </span>
        </div>
        <!-- 末端 OSNR -->
        <div class="grid grid-cols-4 px-3 py-1.5 items-center">
          <span class="text-xs text-gray-600">末端 OSNR</span>
          <span class="text-center font-mono text-xs">{{ recommendedData.osnr.toFixed(1) }} dB</span>
          <span class="text-center font-mono text-xs text-purple-600">{{ userData.osnr.toFixed(1) }} dB</span>
          <span class="text-right font-mono text-xs" :class="diff!.osnr < 0 ? 'text-amber-600' : 'text-green-600'">
            {{ diff!.osnr > 0 ? '+' : '' }}{{ diff!.osnr.toFixed(1) }}
          </span>
        </div>
        <!-- 系统裕量 -->
        <div class="grid grid-cols-4 px-3 py-1.5 items-center">
          <span class="text-xs text-gray-600">系统裕量</span>
          <span class="text-center font-mono text-xs">{{ recommendedData.margin.toFixed(1) }} dB</span>
          <span class="text-center font-mono text-xs" :class="userData.margin < 2 ? 'text-red-600' : 'text-purple-600'">
            {{ userData.margin.toFixed(1) }} dB
          </span>
          <span class="text-right font-mono text-xs" :class="diff!.margin < 0 ? 'text-red-600' : 'text-green-600'">
            {{ diff!.margin > 0 ? '+' : '' }}{{ diff!.margin.toFixed(1) }}
          </span>
        </div>
        <!-- 链路成本 -->
        <div class="grid grid-cols-4 px-3 py-1.5 items-center">
          <span class="text-xs text-gray-600">链路成本</span>
          <span class="text-center font-mono text-xs">{{ formatCost(recommendedData.cost) }}</span>
          <span class="text-center font-mono text-xs text-purple-600">{{ formatCost(userData.cost) }}</span>
          <span v-if="diff!.costPct != null" class="text-right font-mono text-xs" :class="diff!.costPct < 0 ? 'text-green-600' : 'text-amber-600'">
            {{ diff!.costPct > 0 ? '+' : '' }}{{ diff!.costPct.toFixed(0) }}%
          </span>
          <span v-else class="text-right text-xs text-gray-400">-</span>
        </div>
      </div>
    </div>

    <!-- 风险提示 -->
    <div
      v-if="selectionMode === 'custom' && riskLevel !== 'safe'"
      class="flex items-start gap-2 p-2.5 rounded-lg text-xs"
      :class="riskLevel === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'"
    >
      <AlertTriangle class="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span v-if="riskLevel === 'danger'">
        用户选择方案系统裕量为负值，链路不可行，请调整 Span 长度！
      </span>
      <span v-else>
        用户选择方案裕量较低（&lt;2 dB），建议关注长期稳定性和环境裕量。
      </span>
    </div>

    <!-- 操作按钮 -->
    <div class="flex gap-2">
      <Button
        v-if="selectionMode === 'custom'"
        variant="outline" size="sm" class="flex-1 text-xs"
        @click="handleRestore"
      >
        <RotateCcw class="w-3 h-3 mr-1" />
        恢复系统推荐
      </Button>
      <Button
        size="sm" class="flex-1 text-xs"
        :class="selectionMode === 'custom' ? 'bg-purple-600 hover:bg-purple-700' : ''"
        @click="handleApply"
      >
        <Check class="w-3 h-3 mr-1" />
        {{ selectionMode === 'custom' ? '应用用户选择' : '应用推荐方案' }}
      </Button>
    </div>
  </div>
</template>
