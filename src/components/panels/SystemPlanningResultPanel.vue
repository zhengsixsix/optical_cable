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
import { Activity, ChevronDown, ChevronUp, Download } from 'lucide-vue-next'
import type { SpanScanResult } from '@/types/simulation'

const props = defineProps<{
  /** Span 扫描结果 */
  scanResult?: SpanScanResult | null
  /** 链路总长度 (km) */
  totalLength: number
  /** 推荐的 Span 长度 */
  recommendedSpan?: number
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
}>()

const emit = defineEmits<{
  (e: 'apply-recommendation', spanKm: number): void
  (e: 'export-report'): void
  (e: 'recalculate'): void
}>()

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

      <!-- 概览视图 -->
      <div v-else class="space-y-4">
        
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
    </div>
  </div>
</template>

<style scoped>
.system-planning-result-panel {
  font-family: system-ui, -apple-system, sans-serif;
}
</style>
