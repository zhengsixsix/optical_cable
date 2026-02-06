<script setup lang="ts">
/**
 * 仿真进度对话框
 * 显示计算进度、结果展示
 */
import { ref, computed, watch } from 'vue'
import { X, Loader2, CheckCircle2, AlertCircle, Activity, BarChart3, Download, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import type { SimulationProgress, SpanScanResult, SpanScanPoint } from '@/types/simulation'

const props = defineProps<{
  visible: boolean
  linkName?: string
}>()

const emit = defineEmits<{
  close: []
  applyRecommendation: [spanKm: number]
}>()

// 进度状态
const progress = ref<SimulationProgress>({
  phase: 'building',
  phaseLabel: '准备中',
  progress: 0
})

// 计算结果
const result = ref<SpanScanResult | null>(null)

// 展开/折叠详细结果
const showDetailedResults = ref(false)

// 阶段图标
const phaseIcons = {
  building: Loader2,
  validating: Loader2,
  computing: Activity,
  analyzing: BarChart3,
  completed: CheckCircle2,
  failed: AlertCircle
}

// 阶段颜色
const phaseColors = computed(() => {
  switch (progress.value.phase) {
    case 'completed':
      return 'text-green-600'
    case 'failed':
      return 'text-red-600'
    default:
      return 'text-blue-600'
  }
})

// 是否正在计算
const isRunning = computed(() => 
  ['building', 'validating', 'computing', 'analyzing'].includes(progress.value.phase)
)

// 更新进度
const updateProgress = (p: SimulationProgress) => {
  progress.value = p
}

// 设置结果
const setResult = (r: SpanScanResult) => {
  result.value = r
}

// 重置状态
const reset = () => {
  progress.value = {
    phase: 'building',
    phaseLabel: '准备中',
    progress: 0
  }
  result.value = null
  showDetailedResults.value = false
}

// 应用推荐配置并关闭
const applyRecommendation = () => {
  if (result.value) {
    emit('applyRecommendation', result.value.recommendedSpanKm)
    emit('close')
  }
}

// 导出结果
const exportResults = () => {
  if (!result.value) return
  
  const data = JSON.stringify(result.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `span-scan-result-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 暴露方法给父组件
defineExpose({
  updateProgress,
  setResult,
  reset
})

// 对话框打开时重置
watch(() => props.visible, (visible) => {
  if (visible) {
    reset()
  }
})
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible" 
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
    >
      <div class="bg-white rounded-xl shadow-2xl w-[700px] max-h-[85vh] flex flex-col">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-xl">
          <div class="flex items-center gap-3">
            <div 
              class="w-8 h-8 rounded-lg flex items-center justify-center"
              :class="progress.phase === 'completed' ? 'bg-green-100' : progress.phase === 'failed' ? 'bg-red-100' : 'bg-blue-100'"
            >
              <component 
                :is="phaseIcons[progress.phase]" 
                class="w-5 h-5"
                :class="[
                  phaseColors,
                  isRunning ? 'animate-spin' : ''
                ]"
              />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">系统规划计算</h2>
              <p class="text-xs text-gray-500">{{ linkName || '链路性能仿真' }}</p>
            </div>
          </div>
          <button 
            v-if="!isRunning"
            class="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            @click="$emit('close')"
          >
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <!-- 主体内容 -->
        <div class="flex-1 overflow-auto p-6 space-y-6">
          <!-- 进度指示 -->
          <div class="space-y-3">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium" :class="phaseColors">{{ progress.phaseLabel }}</span>
              <span class="text-gray-500">{{ progress.progress }}%</span>
            </div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                class="h-full transition-all duration-300 rounded-full"
                :class="progress.phase === 'completed' ? 'bg-green-500' : progress.phase === 'failed' ? 'bg-red-500' : 'bg-blue-500'"
                :style="{ width: `${progress.progress}%` }"
              />
            </div>
            <p v-if="progress.message" class="text-sm text-gray-600">
              {{ progress.message }}
            </p>
            <p v-if="progress.currentSpan && progress.totalSpans" class="text-xs text-gray-500">
              正在计算第 {{ progress.currentSpan }} / {{ progress.totalSpans }} 个 Span 配置
            </p>
          </div>
          
          <!-- 计算结果 -->
          <div v-if="result" class="space-y-4">
            <!-- 推荐配置卡片 -->
            <div class="bg-green-50 border border-green-200 rounded-lg p-4">
              <div class="flex items-center gap-2 mb-3">
                <CheckCircle2 class="w-5 h-5 text-green-600" />
                <span class="font-medium text-green-800">推荐配置</span>
              </div>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-gray-600">推荐 Span 长度：</span>
                  <span class="font-bold text-green-700 text-lg ml-1">{{ result.recommendedSpanKm }} km</span>
                </div>
                <div v-if="result.feasibleRange">
                  <span class="text-gray-600">可行范围：</span>
                  <span class="font-medium">{{ result.feasibleRange[0] }} - {{ result.feasibleRange[1] }} km</span>
                </div>
              </div>
            </div>
            
            <!-- Span 扫描汇总 -->
            <div class="bg-gray-50 rounded-lg p-4">
              <div class="text-sm font-medium text-gray-700 mb-3">Span 扫描结果汇总</div>
              <table class="w-full text-sm">
                <thead class="bg-gray-100">
                  <tr>
                    <th class="px-3 py-2 text-left text-gray-600">Span (km)</th>
                    <th class="px-3 py-2 text-left text-gray-600">平均 GSNR</th>
                    <th class="px-3 py-2 text-left text-gray-600">最小 GSNR</th>
                    <th class="px-3 py-2 text-left text-gray-600">GSNR 余量</th>
                    <th class="px-3 py-2 text-left text-gray-600">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="point in result.scanPoints.slice(0, showDetailedResults ? undefined : 5)" 
                    :key="point.spanLengthKm"
                    class="border-t"
                    :class="point.spanLengthKm === result.recommendedSpanKm ? 'bg-green-50' : ''"
                  >
                    <td class="px-3 py-2">
                      {{ point.spanLengthKm }}
                      <span v-if="point.spanLengthKm === result.recommendedSpanKm" class="text-green-600 text-xs ml-1">★ 推荐</span>
                    </td>
                    <td class="px-3 py-2 font-mono">{{ (point.avgGsnrDb ?? 0).toFixed(2) }} dB</td>
                    <td class="px-3 py-2 font-mono">{{ (point.minGsnrDb ?? 0).toFixed(2) }} dB</td>
                    <td class="px-3 py-2 font-mono" :class="(point.gsnrMarginDb ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">
                      {{ (point.gsnrMarginDb ?? 0) >= 0 ? '+' : '' }}{{ (point.gsnrMarginDb ?? 0).toFixed(2) }} dB
                    </td>
                    <td class="px-3 py-2">
                      <span 
                        class="text-xs px-2 py-0.5 rounded"
                        :class="point.meetTarget ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                      >
                        {{ point.meetTarget ? '✓ 可行' : '✗ 不可行' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
              
              <button 
                v-if="result.scanPoints.length > 5"
                class="mt-3 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                @click="showDetailedResults = !showDetailedResults"
              >
                <component :is="showDetailedResults ? ChevronUp : ChevronDown" class="w-4 h-4" />
                {{ showDetailedResults ? '收起' : `展开全部 ${result.scanPoints.length} 条结果` }}
              </button>
            </div>
            
            <!-- 计算信息 -->
            <div class="text-xs text-gray-500 space-y-1">
              <div>仿真模型：{{ result.model }}</div>
              <div>目标 GSNR：{{ result.targetGsnrDb }} dB</div>
              <div>计算时间：{{ result.scannedAt.toLocaleString() }}</div>
            </div>
          </div>
          
          <!-- 错误信息 -->
          <div v-if="progress.phase === 'failed' && progress.error" class="bg-red-50 border border-red-200 rounded-lg p-4">
            <div class="flex items-center gap-2 text-red-700">
              <AlertCircle class="w-5 h-5" />
              <span class="font-medium">计算失败</span>
            </div>
            <p class="text-sm text-red-600 mt-2">{{ progress.error }}</p>
          </div>
        </div>
        
        <!-- 底部按钮 -->
        <div class="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex justify-between">
          <div>
            <Button 
              v-if="result"
              variant="outline" 
              size="sm"
              @click="exportResults"
            >
              <Download class="w-4 h-4 mr-1" /> 导出结果
            </Button>
          </div>
          <div class="flex gap-3">
            <Button 
              v-if="!isRunning"
              variant="outline" 
              @click="$emit('close')"
            >
              关闭
            </Button>
            <Button 
              v-if="result"
              @click="applyRecommendation"
            >
              应用配置
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
