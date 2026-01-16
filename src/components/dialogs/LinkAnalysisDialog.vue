<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button, Select } from '@/components/ui'
import { BarChart2, Cpu, X, RefreshCw, Download, Filter } from 'lucide-vue-next'
import { useSettingsStore, useAppStore } from '@/stores'
import { opticalSimulationService } from '@/services'
import type { DetailedSimulationResult, SimulationModel, OpticalLink, ChannelEvolution } from '@/types/simulation'

const props = defineProps<{
  visible: boolean
  link?: OpticalLink
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const settingsStore = useSettingsStore()
const appStore = useAppStore()

// 仿真结果
const simulationResult = ref<DetailedSimulationResult | null>(null)
const isSimulating = ref(false)

// 选择的模型
const selectedModel = ref<SimulationModel>('GN')

// 显示选项
const displayMode = ref<'average' | 'worst' | 'channel'>('average')
const selectedChannel = ref(0)

// 模型选项
const modelOptions = [
  { value: 'GN', label: 'GN 模型' },
  { value: 'EGN', label: 'EGN 模型' },
  { value: 'SSFM', label: 'SSFM 模型' },
]

// 显示模式选项
const displayModeOptions = [
  { value: 'average', label: '平均信道' },
  { value: 'worst', label: '最差信道' },
  { value: 'channel', label: '指定信道' },
]

// 信道选项
const channelOptions = computed(() => {
  if (!simulationResult.value) return []
  return simulationResult.value.channelEvolutions.map((ch, i) => ({
    value: i,
    label: `Ch ${i + 1} (${ch.centerFreqTHz.toFixed(2)} THz)`,
  }))
})

// 当前显示的演化数据
const displayedEvolution = computed(() => {
  if (!simulationResult.value) return null
  
  const result = simulationResult.value
  if (displayMode.value === 'average') {
    return {
      gsnr: result.avgGsnrEvolution,
      label: '平均 GSNR',
    }
  } else if (displayMode.value === 'worst') {
    return {
      gsnr: result.worstGsnrEvolution,
      label: '最差 GSNR',
    }
  } else {
    const channel = result.channelEvolutions[selectedChannel.value]
    return {
      gsnr: channel?.gsnrEvolution || [],
      osnr: channel?.osnrEvolution || [],
      snrAse: channel?.snrAseEvolution || [],
      snrNli: channel?.snrNliEvolution || [],
      label: `信道 ${selectedChannel.value + 1}`,
    }
  }
})

// 图表数据
const chartData = computed(() => {
  if (!simulationResult.value || !displayedEvolution.value) return null
  
  const result = simulationResult.value
  const evolution = displayedEvolution.value
  
  const padding = { top: 30, right: 80, bottom: 50, left: 60 }
  const width = 700
  const height = 350
  
  const kpPositions = result.kpPositions
  const xMin = 0
  const xMax = Math.max(...kpPositions)
  
  // 计算 Y 轴范围
  let yMin = Infinity
  let yMax = -Infinity
  
  for (const v of evolution.gsnr) {
    yMin = Math.min(yMin, v)
    yMax = Math.max(yMax, v)
  }
  if (evolution.osnr) {
    for (const v of evolution.osnr) {
      yMin = Math.min(yMin, v)
      yMax = Math.max(yMax, v)
    }
  }
  
  yMin = Math.floor(yMin - 2)
  yMax = Math.ceil(yMax + 2)
  
  // 缩放函数
  const scaleX = (x: number) => padding.left + (x / xMax) * (width - padding.left - padding.right)
  const scaleY = (y: number) => height - padding.bottom - ((y - yMin) / (yMax - yMin)) * (height - padding.top - padding.bottom)
  
  // 生成路径
  const gsnrPath = kpPositions.map((kp, i) => 
    `${i === 0 ? 'M' : 'L'} ${scaleX(kp)} ${scaleY(evolution.gsnr[i])}`
  ).join(' ')
  
  const osnrPath = evolution.osnr 
    ? kpPositions.map((kp, i) => 
        `${i === 0 ? 'M' : 'L'} ${scaleX(kp)} ${scaleY(evolution.osnr![i])}`
      ).join(' ')
    : null
  
  const snrAsePath = evolution.snrAse
    ? kpPositions.map((kp, i) => 
        `${i === 0 ? 'M' : 'L'} ${scaleX(kp)} ${scaleY(evolution.snrAse![i])}`
      ).join(' ')
    : null
  
  const snrNliPath = evolution.snrNli
    ? kpPositions.map((kp, i) => 
        `${i === 0 ? 'M' : 'L'} ${scaleX(kp)} ${scaleY(evolution.snrNli![i])}`
      ).join(' ')
    : null
  
  // X 轴刻度
  const xTicks = []
  const xStep = xMax / 5
  for (let x = 0; x <= xMax; x += xStep) {
    xTicks.push({ value: Math.round(x), x: scaleX(x) })
  }
  
  // Y 轴刻度
  const yTicks = []
  const yStep = (yMax - yMin) / 5
  for (let y = yMin; y <= yMax; y += yStep) {
    yTicks.push({ value: y.toFixed(1), y: scaleY(y) })
  }
  
  // 中继器位置标记
  const repeaterMarks = kpPositions.slice(1, -1).map(kp => ({
    x: scaleX(kp),
    kp,
  }))
  
  return {
    width,
    height,
    padding,
    gsnrPath,
    osnrPath,
    snrAsePath,
    snrNliPath,
    xTicks,
    yTicks,
    repeaterMarks,
    kpPositions: kpPositions.map(kp => ({ kp, x: scaleX(kp) })),
    yMin,
    yMax,
  }
})

// 执行仿真
const runSimulation = async () => {
  if (!props.link) {
    appStore.showNotification({ type: 'warning', message: '请先配置链路数据' })
    return
  }
  
  isSimulating.value = true
  appStore.showNotification({ type: 'info', message: '正在执行精细仿真...' })
  
  try {
    // 设置模型
    opticalSimulationService.setModel(selectedModel.value)
    
    // 执行仿真
    simulationResult.value = opticalSimulationService.detailedSimulation(props.link)
    
    appStore.showNotification({ type: 'success', message: '精细仿真完成' })
    appStore.addLog('INFO', `链路分析完成: 端到端 GSNR = ${simulationResult.value.endToEndAvgGsnr.toFixed(2)} dB`)
  } catch (error) {
    appStore.showNotification({ type: 'error', message: '仿真失败: ' + (error as Error).message })
  } finally {
    isSimulating.value = false
  }
}

// 导出数据
const exportData = () => {
  if (!simulationResult.value) return
  
  const data = {
    linkId: simulationResult.value.linkId,
    model: simulationResult.value.model,
    simulatedAt: simulationResult.value.simulatedAt,
    kpPositions: simulationResult.value.kpPositions,
    avgGsnrEvolution: simulationResult.value.avgGsnrEvolution,
    worstGsnrEvolution: simulationResult.value.worstGsnrEvolution,
    channelEvolutions: simulationResult.value.channelEvolutions,
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `link_analysis_${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
  
  appStore.showNotification({ type: 'success', message: '数据已导出' })
}

// 监听弹窗打开，自动执行仿真
watch(() => props.visible, (visible) => {
  if (visible && props.link) {
    runSimulation()
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-[850px] max-h-[90vh] overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <BarChart2 class="w-5 h-5 text-blue-500" />
            链路分析 - 精细仿真 (Step 9)
          </h3>
          <button class="p-1.5 hover:bg-gray-200 rounded transition-colors" @click="emit('close')">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <!-- 工具栏 -->
        <div class="px-4 py-2 border-b flex items-center justify-between bg-white">
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">仿真模型:</span>
              <select
                v-model="selectedModel"
                class="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <Button variant="outline" size="sm" @click="runSimulation" :disabled="isSimulating">
              <RefreshCw class="w-4 h-4 mr-1" :class="{ 'animate-spin': isSimulating }" />
              {{ isSimulating ? '计算中...' : '重新计算' }}
            </Button>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <Filter class="w-4 h-4 text-gray-400" />
              <select
                v-model="displayMode"
                class="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="opt in displayModeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <select
              v-if="displayMode === 'channel'"
              v-model="selectedChannel"
              class="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 w-40"
            >
              <option v-for="opt in channelOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <Button variant="outline" size="sm" @click="exportData" :disabled="!simulationResult">
              <Download class="w-4 h-4 mr-1" /> 导出
            </Button>
          </div>
        </div>

        <!-- 图表内容 -->
        <div class="flex-1 overflow-auto p-4">
          <!-- 结果摘要 -->
          <div v-if="simulationResult" class="grid grid-cols-4 gap-3 mb-4">
            <div class="bg-blue-50 rounded-lg p-3 text-center">
              <div class="text-lg font-bold text-blue-600">{{ simulationResult.endToEndAvgGsnr.toFixed(2) }}</div>
              <div class="text-xs text-gray-500">平均 GSNR (dB)</div>
            </div>
            <div class="bg-orange-50 rounded-lg p-3 text-center">
              <div class="text-lg font-bold text-orange-600">{{ simulationResult.endToEndWorstGsnr.toFixed(2) }}</div>
              <div class="text-xs text-gray-500">最差 GSNR (dB)</div>
            </div>
            <div class="bg-purple-50 rounded-lg p-3 text-center">
              <div class="text-lg font-bold text-purple-600">Ch {{ simulationResult.worstChannelIndex + 1 }}</div>
              <div class="text-xs text-gray-500">最差信道</div>
            </div>
            <div class="rounded-lg p-3 text-center" :class="simulationResult.isFeasible ? 'bg-green-50' : 'bg-red-50'">
              <div class="text-lg font-bold" :class="simulationResult.isFeasible ? 'text-green-600' : 'text-red-600'">
                {{ simulationResult.isFeasible ? '可行' : '不可行' }}
              </div>
              <div class="text-xs text-gray-500">系统状态</div>
            </div>
          </div>

          <!-- 演化曲线图 -->
          <div class="bg-gray-50 rounded-lg border p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-medium text-gray-700">{{ displayedEvolution?.label || '' }} 沿链路演化</h4>
              <div class="flex items-center gap-4 text-xs">
                <span class="flex items-center gap-1">
                  <span class="w-3 h-0.5 bg-blue-500"></span>
                  GSNR
                </span>
                <span v-if="displayMode === 'channel'" class="flex items-center gap-1">
                  <span class="w-3 h-0.5 bg-green-500"></span>
                  OSNR
                </span>
                <span v-if="displayMode === 'channel'" class="flex items-center gap-1">
                  <span class="w-3 h-0.5 bg-purple-500"></span>
                  SNR_ASE
                </span>
                <span v-if="displayMode === 'channel'" class="flex items-center gap-1">
                  <span class="w-3 h-0.5 bg-orange-500"></span>
                  SNR_NLI
                </span>
              </div>
            </div>
            
            <svg v-if="chartData" :width="chartData.width" :height="chartData.height" class="w-full">
              <!-- 网格线 -->
              <g stroke="#e5e7eb" stroke-width="1">
                <line
                  v-for="tick in chartData.yTicks"
                  :key="'y-' + tick.value"
                  :x1="chartData.padding.left"
                  :y1="tick.y"
                  :x2="chartData.width - chartData.padding.right"
                  :y2="tick.y"
                  stroke-dasharray="4,4"
                />
              </g>

              <!-- 中继器位置标记 -->
              <g v-for="mark in chartData.repeaterMarks" :key="'rep-' + mark.kp">
                <line
                  :x1="mark.x"
                  :y1="chartData.padding.top"
                  :x2="mark.x"
                  :y2="chartData.height - chartData.padding.bottom"
                  stroke="#94a3b8"
                  stroke-width="1"
                  stroke-dasharray="2,2"
                />
                <circle :cx="mark.x" :cy="chartData.padding.top - 8" r="4" fill="#64748b" />
              </g>

              <!-- SNR_NLI 曲线 -->
              <path
                v-if="chartData.snrNliPath"
                :d="chartData.snrNliPath"
                fill="none"
                stroke="#f97316"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- SNR_ASE 曲线 -->
              <path
                v-if="chartData.snrAsePath"
                :d="chartData.snrAsePath"
                fill="none"
                stroke="#a855f7"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- OSNR 曲线 -->
              <path
                v-if="chartData.osnrPath"
                :d="chartData.osnrPath"
                fill="none"
                stroke="#22c55e"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- GSNR 曲线 -->
              <path
                :d="chartData.gsnrPath"
                fill="none"
                stroke="#3b82f6"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- X 轴 -->
              <g class="x-axis">
                <line
                  :x1="chartData.padding.left"
                  :y1="chartData.height - chartData.padding.bottom"
                  :x2="chartData.width - chartData.padding.right"
                  :y2="chartData.height - chartData.padding.bottom"
                  stroke="#9ca3af"
                  stroke-width="1"
                />
                <g v-for="tick in chartData.xTicks" :key="'xt-' + tick.value">
                  <text
                    :x="tick.x"
                    :y="chartData.height - chartData.padding.bottom + 18"
                    class="text-xs fill-gray-500"
                    text-anchor="middle"
                  >
                    {{ tick.value }}
                  </text>
                </g>
                <text
                  :x="chartData.width / 2"
                  :y="chartData.height - 10"
                  class="text-xs fill-gray-600"
                  text-anchor="middle"
                >
                  KP (km)
                </text>
              </g>

              <!-- Y 轴 -->
              <g class="y-axis">
                <line
                  :x1="chartData.padding.left"
                  :y1="chartData.padding.top"
                  :x2="chartData.padding.left"
                  :y2="chartData.height - chartData.padding.bottom"
                  stroke="#9ca3af"
                  stroke-width="1"
                />
                <g v-for="tick in chartData.yTicks" :key="'yt-' + tick.value">
                  <text
                    :x="chartData.padding.left - 10"
                    :y="tick.y + 4"
                    class="text-xs fill-gray-500"
                    text-anchor="end"
                  >
                    {{ tick.value }}
                  </text>
                </g>
              </g>
            </svg>
            
            <div v-else class="flex items-center justify-center h-64 text-gray-400">
              <div class="text-center">
                <Cpu class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <div>点击"重新计算"执行精细仿真</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="emit('close')">关闭</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
