<script setup lang="ts">
/**
 * 系统规划结果面板
 * 
 * 显示 Step 4 (性能迭代结果) 和 Step 5 (可视化与推荐) 的内容:
 * - 概览：关键性能指标总结
 * - 性能曲线：跨 Span、跨信道的 GSNR/OSNR 曲线
 * - 放大器详情：EDFA 放置位置、增益、输出功率
 * - 成本分析：设备成本、部署成本分解
 * - 方案推荐：最优 Span 配置及推荐理由
 */

import { ref, computed } from 'vue'
import { Button } from '@/shared/components/base'
import { Activity, ChevronDown, ChevronUp, Download, TrendingUp, Cpu, DollarSign, Clock } from 'lucide-vue-next'
import SpanPerformanceChart from '@/components/charts/SpanPerformanceChart.vue'
import SpanComparisonPanel from '@/components/panels/SpanComparisonPanel.vue'
import type { SpanScanResult } from '@/types/simulation'

const props = defineProps<{
  /** Span 扫描结果 */
  scanResult?: SpanScanResult | null
  /** 链路总长度 (km) */
  totalLength: number
  /** 推荐的 Span 长度 */
  recommendedSpan?: number
  /** 用户选定的 Span 长度 */
  userSelectedSpan?: number | null
  /** EDFA 放置结果 */
  edfaPlacement?: {
    positions: Array<{ kp: number; longitude: number; latitude: number; isBranch?: boolean }>
    count: number
  } | null
  /** 成本配置 */
  costConfig?: {
    cablePerKm?: number
    repeaterPerUnit?: number
    buPerUnit?: number
    installationPerKm?: number
  }
  /** 链路名称 */
  linkName?: string
  /** EOL 老化余量数据 */
  eolMargin?: {
    designLifeYears: number
    degradation: {
      totalPenalty_dB: number
      osnrDegradation_dB: number
      gsnrDegradation_dB: number
      breakdown: Record<string, { label: string; value_dB: number; description: string }>
    }
    bol: { gsnr: { min: number; avg: number; max: number }; osnr: { min: number; avg: number; max: number } }
    eol: { gsnr: { min: number; avg: number; max: number }; osnr: { min: number; avg: number; max: number } }
    eolMeetsTarget: boolean
    eolGsnrMargin_dB: number
    targetGsnr_dB: number
  } | null
}>()

const emit = defineEmits<{
  (e: 'apply-recommendation', spanKm: number): void
  (e: 'apply-user-selection', spanKm: number): void
  (e: 'update:userSelectedSpan', v: number | null): void
  (e: 'restore-recommended'): void
  (e: 'select-span', spanLength: number): void
  (e: 'export-report'): void
  (e: 'recalculate'): void
}>()

// Tab 视图
const activeTab = ref<'overview' | 'performance' | 'amplifier' | 'cost' | 'eol'>('overview')

// 展开/折叠状态
const expandedSections = ref({
  gsnrSummary: true
})

// 计算属性
const hasScanResult = computed(() => !!props.scanResult && props.scanResult.scanPoints.length > 0)

// 性能概览统计
const performanceOverview = computed(() => {
  if (!props.scanResult) return null
  
  const points = props.scanResult.scanPoints
  const feasiblePoints = points.filter(p => p.meetTarget)
  const recommendedPoint = points.find(p => p.spanLengthKm === props.scanResult?.recommendedSpanKm)
  
  return {
    scanRange: {
      min: props.scanResult.spanLengthsKm[0],
      max: props.scanResult.spanLengthsKm[props.scanResult.spanLengthsKm.length - 1],
      step: props.scanResult.spanLengthsKm.length > 1 
        ? props.scanResult.spanLengthsKm[1] - props.scanResult.spanLengthsKm[0]
        : 0
    },
    feasibleRange: props.scanResult.feasibleRange,
    feasibleCount: feasiblePoints.length,
    totalCount: points.length,
    targetGsnr: props.scanResult.targetGsnrDb,
    recommendedSpan: props.scanResult.recommendedSpanKm,
    recommendedGsnr: recommendedPoint?.avgGsnrDb || 0,
    recommendedMargin: recommendedPoint?.gsnrMarginDb || 0,
    bestGsnr: Math.max(...points.map(p => p.avgGsnrDb)),
    worstGsnr: Math.min(...points.map(p => p.minGsnrDb))
  }
})

// 放大器详细列表
const amplifierDetails = computed(() => {
  if (!props.edfaPlacement?.positions?.length) return []
  const positions = [...props.edfaPlacement.positions].sort((a, b) => a.kp - b.kp)
  let prevKp = 0
  return positions.map((pos, idx) => {
    const spacing = pos.kp - prevKp
    prevKp = pos.kp
    return { index: idx + 1, kp: pos.kp, spacing, isBranch: pos.isBranch }
  })
})

// 成本分析
const costAnalysis = computed(() => {
  if (!props.costConfig || !props.totalLength) return null
  const cfg = props.costConfig
  const ampCount = props.edfaPlacement?.count || 0
  const cable = (cfg.cablePerKm || 0) * props.totalLength
  const repeater = (cfg.repeaterPerUnit || 0) * ampCount
  const install = (cfg.installationPerKm || 0) * props.totalLength
  const total = cable + repeater + install
  return { cable, repeater, install, total, ampCount }
})

const formatCost = (v: number) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

// 导出报告
const handleExportReport = () => {
  emit('export-report')
}
</script>

<template>
  <div class="system-planning-result-panel flex flex-col h-full">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between border-b bg-gray-50 px-3 py-2">
      <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Activity class="w-4 h-4 text-blue-500" />
        <span>{{ linkName || '链路' }} - 性能概览</span>
      </div>
      <Button variant="ghost" size="sm" class="text-xs" @click="handleExportReport">
        <Download class="w-3 h-3 mr-1" />
        导出
      </Button>
    </div>

    <!-- Tab 导航 -->
    <div v-if="hasScanResult" class="flex border-b bg-gray-50/50">
      <button
        class="flex-1 px-2 py-1.5 text-xs font-medium transition-colors"
        :class="activeTab === 'overview' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'overview'"
      >
        概览
      </button>
      <button
        class="flex-1 px-2 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1"
        :class="activeTab === 'performance' ? 'text-purple-600 border-b-2 border-purple-500 bg-white' : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'performance'"
      >
        <TrendingUp class="w-3 h-3" />
        性能曲线
      </button>
      <button
        class="flex-1 px-2 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1"
        :class="activeTab === 'amplifier' ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'amplifier'"
      >
        <Cpu class="w-3 h-3" />
        放大器
      </button>
      <button
        class="flex-1 px-2 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1"
        :class="activeTab === 'cost' ? 'text-green-600 border-b-2 border-green-500 bg-white' : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'cost'"
      >
        <DollarSign class="w-3 h-3" />
        成本
      </button>
      <button
        v-if="eolMargin"
        class="flex-1 px-2 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1"
        :class="activeTab === 'eol' ? 'text-orange-600 border-b-2 border-orange-500 bg-white' : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'eol'"
      >
        <Clock class="w-3 h-3" />
        EOL
      </button>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-auto p-4">
      <!-- 无数据提示 -->
      <div v-if="!hasScanResult" class="flex items-center justify-center h-full text-gray-400">
        <div class="text-center">
          <Activity class="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <div class="text-sm">请先执行系统规划计算</div>
          <div class="text-xs text-gray-400 mt-1">点击"开始计算"按钮启动 Span 扫描</div>
        </div>
      </div>

      <!-- === 概览 Tab === -->
      <div v-else-if="activeTab === 'overview'" class="space-y-4">
        <!-- 关键指标卡片 -->
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div class="text-xs text-blue-600 mb-1">推荐 Span</div>
            <div class="text-xl font-bold text-blue-800">
              {{ performanceOverview?.recommendedSpan || '-' }} km
            </div>
          </div>
          <div class="p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
            <div class="text-xs text-green-600 mb-1">GSNR 余量</div>
            <div class="text-xl font-bold" 
              :class="(performanceOverview?.recommendedMargin || 0) >= 3 ? 'text-green-800' : 'text-amber-600'">
              {{ performanceOverview?.recommendedMargin?.toFixed(1) || '-' }} dB
            </div>
          </div>
          <div class="p-3 bg-gray-50 rounded-lg border">
            <div class="text-xs text-gray-500 mb-1">放大器数量</div>
            <div class="text-lg font-semibold text-gray-800">
              {{ edfaPlacement?.count || '-' }}
            </div>
          </div>
          <div class="p-3 bg-gray-50 rounded-lg border">
            <div class="text-xs text-gray-500 mb-1">可行区间</div>
            <div class="text-lg font-semibold text-gray-800">
              <span v-if="performanceOverview?.feasibleRange">
                {{ performanceOverview.feasibleRange[0] }}-{{ performanceOverview.feasibleRange[1] }} km
              </span>
              <span v-else class="text-red-500">无</span>
            </div>
          </div>
        </div>
        
        <!-- GSNR 汇总 -->
        <div class="border rounded-lg overflow-hidden">
          <button 
            class="w-full flex items-center justify-between p-3 bg-gray-50 text-sm font-medium text-gray-700"
            @click="expandedSections.gsnrSummary = !expandedSections.gsnrSummary"
          >
            <span>GSNR 性能汇总</span>
            <component :is="expandedSections.gsnrSummary ? ChevronUp : ChevronDown" class="w-4 h-4" />
          </button>
          <div v-show="expandedSections.gsnrSummary" class="p-3 space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">目标 GSNR</span>
              <span class="font-mono">{{ performanceOverview?.targetGsnr?.toFixed(1) }} dB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">推荐配置平均 GSNR</span>
              <span class="font-mono text-green-600">{{ performanceOverview?.recommendedGsnr?.toFixed(2) }} dB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">扫描范围最佳 GSNR</span>
              <span class="font-mono">{{ performanceOverview?.bestGsnr?.toFixed(2) }} dB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">扫描范围最差 GSNR</span>
              <span class="font-mono text-amber-600">{{ performanceOverview?.worstGsnr?.toFixed(2) }} dB</span>
            </div>
            <div class="flex justify-between pt-2 border-t">
              <span class="text-gray-500">可行配置数 / 总配置数</span>
              <span class="font-mono">{{ performanceOverview?.feasibleCount }} / {{ performanceOverview?.totalCount }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- === 性能曲线 Tab === -->
      <div v-else-if="activeTab === 'performance'" class="space-y-4">
        <SpanPerformanceChart
          v-if="scanResult"
          :scan-result="scanResult"
          :height="200"
          :show-osnr="true"
          :user-selected-span="userSelectedSpan"
          :recommended-span="recommendedSpan"
          @select-span="(v: number) => emit('select-span', v)"
          @update:user-selected-span="(v: number | null) => emit('update:userSelectedSpan', v)"
        />
        <SpanComparisonPanel
          :scan-result="scanResult"
          :total-length="totalLength"
          :recommended-span="recommendedSpan"
          :user-selected-span="userSelectedSpan"
          :cost-config="costConfig"
          @update:user-selected-span="(v: number | null) => emit('update:userSelectedSpan', v)"
          @apply-user-selection="(v: number) => emit('apply-user-selection', v)"
          @restore-recommended="emit('restore-recommended')"
        />
      </div>

      <!-- === 放大器详情 Tab === -->
      <div v-else-if="activeTab === 'amplifier'" class="space-y-3">
        <div class="text-xs text-gray-500">共 {{ edfaPlacement?.count || 0 }} 台放大器</div>
        <div v-if="amplifierDetails.length > 0" class="border rounded-lg overflow-hidden">
          <div class="grid grid-cols-4 px-3 py-1.5 bg-gray-50 text-xs text-gray-500 font-medium border-b">
            <span>序号</span><span>KP (km)</span><span>跨段 (km)</span><span>类型</span>
          </div>
          <div class="max-h-[400px] overflow-auto divide-y">
            <div
              v-for="amp in amplifierDetails" :key="amp.index"
              class="grid grid-cols-4 px-3 py-1.5 text-xs"
              :class="amp.spacing > 100 ? 'bg-red-50' : amp.spacing > 90 ? 'bg-amber-50' : ''"
            >
              <span class="font-mono">#{{ amp.index }}</span>
              <span class="font-mono">{{ amp.kp.toFixed(1) }}</span>
              <span class="font-mono" :class="amp.spacing > 100 ? 'text-red-600 font-bold' : ''">
                {{ amp.spacing.toFixed(1) }}
              </span>
              <span>{{ amp.isBranch ? '分支' : '主干' }}</span>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400 text-center py-8">暂无放大器数据</div>
      </div>

      <!-- === 成本分析 Tab === -->
      <div v-else-if="activeTab === 'cost'" class="space-y-3">
        <div v-if="costAnalysis" class="space-y-3">
          <div class="p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
            <div class="text-xs text-green-600 mb-1">总成本估算</div>
            <div class="text-xl font-bold text-green-800">{{ formatCost(costAnalysis.total) }}</div>
          </div>
          <div class="border rounded-lg divide-y">
            <div class="flex justify-between px-3 py-2 text-sm">
              <span class="text-gray-600">海缆成本</span>
              <span class="font-mono">{{ formatCost(costAnalysis.cable) }}</span>
            </div>
            <div class="flex justify-between px-3 py-2 text-sm">
              <span class="text-gray-600">放大器成本 ({{ costAnalysis.ampCount }} 台)</span>
              <span class="font-mono">{{ formatCost(costAnalysis.repeater) }}</span>
            </div>
            <div class="flex justify-between px-3 py-2 text-sm">
              <span class="text-gray-600">施工成本</span>
              <span class="font-mono">{{ formatCost(costAnalysis.install) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400 text-center py-8">请在工程设置中配置成本参数</div>
      </div>

      <!-- === EOL 老化余量 Tab === -->
      <div v-else-if="activeTab === 'eol' && eolMargin" class="space-y-4">
        <!-- EOL 状态卡片 -->
        <div class="p-3 rounded-lg border"
          :class="eolMargin.eolMeetsTarget ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'"
        >
          <div class="text-xs mb-1" :class="eolMargin.eolMeetsTarget ? 'text-green-600' : 'text-red-600'">
            {{ eolMargin.designLifeYears }} 年 EOL 状态
          </div>
          <div class="text-xl font-bold" :class="eolMargin.eolMeetsTarget ? 'text-green-800' : 'text-red-800'">
            {{ eolMargin.eolMeetsTarget ? '✅ 达标' : '❌ 不达标' }}
          </div>
          <div class="text-xs mt-1" :class="eolMargin.eolMeetsTarget ? 'text-green-600' : 'text-red-600'">
            EOL GSNR 余量: {{ eolMargin.eolGsnrMargin_dB.toFixed(1) }} dB
          </div>
        </div>

        <!-- BOL / EOL 对比 -->
        <div class="border rounded-lg overflow-hidden">
          <div class="p-3 bg-gray-50 text-sm font-medium text-gray-700">BOL / EOL 性能对比</div>
          <div class="divide-y text-sm">
            <div class="grid grid-cols-4 px-3 py-1.5 bg-gray-50 text-xs text-gray-500 font-medium">
              <span>指标</span><span class="text-right">BOL</span><span class="text-right">EOL</span><span class="text-right">退化</span>
            </div>
            <div class="grid grid-cols-4 px-3 py-2">
              <span class="text-gray-600 text-xs">GSNR min</span>
              <span class="text-right font-mono text-xs text-blue-600">{{ eolMargin.bol.gsnr.min.toFixed(1) }} dB</span>
              <span class="text-right font-mono text-xs text-orange-600">{{ eolMargin.eol.gsnr.min.toFixed(1) }} dB</span>
              <span class="text-right font-mono text-xs text-red-500">-{{ eolMargin.degradation.totalPenalty_dB.toFixed(1) }} dB</span>
            </div>
            <div class="grid grid-cols-4 px-3 py-2">
              <span class="text-gray-600 text-xs">GSNR avg</span>
              <span class="text-right font-mono text-xs text-blue-600">{{ eolMargin.bol.gsnr.avg.toFixed(1) }} dB</span>
              <span class="text-right font-mono text-xs text-orange-600">{{ eolMargin.eol.gsnr.avg.toFixed(1) }} dB</span>
              <span class="text-right font-mono text-xs text-red-500">-{{ eolMargin.degradation.totalPenalty_dB.toFixed(1) }} dB</span>
            </div>
            <div class="grid grid-cols-4 px-3 py-2">
              <span class="text-gray-600 text-xs">OSNR avg</span>
              <span class="text-right font-mono text-xs text-blue-600">{{ eolMargin.bol.osnr.avg.toFixed(1) }} dB</span>
              <span class="text-right font-mono text-xs text-orange-600">{{ eolMargin.eol.osnr.avg.toFixed(1) }} dB</span>
              <span class="text-right font-mono text-xs text-red-500">-{{ eolMargin.degradation.osnrDegradation_dB.toFixed(1) }} dB</span>
            </div>
          </div>
        </div>

        <!-- 退化分项明细 -->
        <div class="border rounded-lg overflow-hidden">
          <div class="p-3 bg-gray-50 text-sm font-medium text-gray-700">退化分项明细</div>
          <div class="divide-y">
            <div
              v-for="(item, key) in eolMargin.degradation.breakdown"
              :key="key"
              class="flex items-center justify-between px-3 py-2"
            >
              <div>
                <div class="text-xs text-gray-700">{{ item.label }}</div>
                <div class="text-[10px] text-gray-400">{{ item.description }}</div>
              </div>
              <span class="font-mono text-xs text-red-500">{{ item.value_dB.toFixed(2) }} dB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.system-planning-result-panel {
  font-family: system-ui, -apple-system, sans-serif;
}
</style>
