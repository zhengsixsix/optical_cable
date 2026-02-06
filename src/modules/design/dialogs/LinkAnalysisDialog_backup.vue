﻿<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/shared/components/base'
import { BarChart2, Cpu, X, RefreshCw, Download, Filter, ChevronDown, ChevronUp, Play, FileText, Info, Settings, Target, Layers } from 'lucide-vue-next'
import { useAppStore } from '@/stores'
import { opticalSimulationService } from '@/services'
import type { DetailedSimulationResult, SimulationModel, OpticalLink } from '@/types/simulation'

const props = defineProps<{
  visible: boolean
  link?: OpticalLink
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()

// 仿真结果
const simulationResult = ref<DetailedSimulationResult | null>(null)
const isSimulating = ref(false)

// 选择的模型
const selectedModel = ref<SimulationModel>('GN')

// 目标门限设置
const targetGsnr = ref(12.5)
const targetOsnr = ref(20.0)

// 显示选项
const activeTab = ref<'evolution' | 'spectrum' | 'heatmap' | 'table'>('evolution')
const displayMode = ref<'average' | 'worst' | 'channel'>('average')
const selectedChannel = ref(0)

// 底部详情面板
const showNodeDetails = ref(false)
const selectedNodeIndex = ref<number | null>(null)

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

// 频谱分布数据（取各信道末端值）
const spectrumPoints = computed(() => {
  if (!simulationResult.value) return []
  return simulationResult.value.channelEvolutions.map((ch, i) => ({
    channelIndex: i,
    centerFreqTHz: ch.centerFreqTHz,
    gsnr: ch.gsnrEvolution[ch.gsnrEvolution.length - 1] ?? 0,
    osnr: ch.osnrEvolution[ch.osnrEvolution.length - 1] ?? 0,
  }))
})

// 频谱分布图表数据
const spectrumChart = computed(() => {
  if (!spectrumPoints.value.length) return null
  const padding = { top: 30, right: 40, bottom: 50, left: 60 }
  const width = 720
  const height = 320
  const points = spectrumPoints.value

  const yMin = Math.floor(Math.min(...points.map(p => Math.min(p.gsnr, p.osnr))) - 2)
  const yMax = Math.ceil(Math.max(...points.map(p => Math.max(p.gsnr, p.osnr))) + 2)
  const xMax = points.length - 1

  const scaleX = (index: number) => padding.left + (index / Math.max(1, xMax)) * (width - padding.left - padding.right)
  const scaleY = (value: number) => height - padding.bottom - ((value - yMin) / (yMax - yMin)) * (height - padding.top - padding.bottom)

  const gsnrPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(p.gsnr)}`).join(' ')
  const osnrPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(p.osnr)}`).join(' ')

  const xTicks = []
  const xStep = Math.max(1, Math.floor(points.length / 6))
  for (let i = 0; i < points.length; i += xStep) {
    xTicks.push({ value: i + 1, x: scaleX(i) })
  }

  const yTicks = []
  const yStep = (yMax - yMin) / 5
  for (let y = yMin; y <= yMax; y += yStep) {
    yTicks.push({ value: y.toFixed(1), y: scaleY(y) })
  }

  return { width, height, padding, gsnrPath, osnrPath, xTicks, yTicks }
})

// 热力图数据（信道 × 跨段）
const heatmapData = computed(() => {
  if (!simulationResult.value) return null
  const channels = simulationResult.value.channelEvolutions
  let min = Infinity
  let max = -Infinity
  const values = channels.map(ch => ch.gsnrEvolution.map(v => {
    min = Math.min(min, v)
    max = Math.max(max, v)
    return v
  }))
  return {
    channels,
    values,
    kpPositions: simulationResult.value.kpPositions,
    min,
    max,
  }
})

const getHeatColor = (value: number, min: number, max: number) => {
  if (max <= min) return 'rgb(59, 130, 246)'
  const ratio = (value - min) / (max - min)
  const r = Math.round(239 - ratio * 180)
  const g = Math.round(68 + ratio * 140)
  const b = Math.round(68 + ratio * 80)
  return `rgb(${r}, ${g}, ${b})`
}

// 表格数据
const spanTableRows = computed(() => simulationResult.value?.spanResults || [])

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
  
  // 放大器位置标记
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

// 导出报告
const exportReport = () => {
  if (!simulationResult.value) return
  
  const report = `
# 链路仿真分析报告
生成时间: ${new Date().toLocaleString()}
仿真模型: ${selectedModel.value}

## 链路信息
- 总长度: ${props.link?.totalLength?.toFixed(1) || 0} km
- 跨段数量: ${simulationResult.value.spanResults?.length || 0}
- 放大器数量: ${(simulationResult.value.spanResults?.length || 1) - 1}

## 仿真结果
- 平均 GSNR: ${simulationResult.value.endToEndAvgGsnr.toFixed(2)} dB
- 最差 GSNR: ${simulationResult.value.endToEndWorstGsnr.toFixed(2)} dB
- 最差信道: Ch ${simulationResult.value.worstChannelIndex + 1}
- 系统状态: ${simulationResult.value.isFeasible ? '可行' : '不可行'}

## 目标门限
- GSNR 门限: ${targetGsnr.value} dB
- OSNR 门限: ${targetOsnr.value} dB
- 裕量: ${(simulationResult.value.endToEndWorstGsnr - targetGsnr.value).toFixed(2)} dB
`
  
  const blob = new Blob([report], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `link_report_${new Date().toISOString().split('T')[0]}.md`
  a.click()
  URL.revokeObjectURL(url)
  
  appStore.showNotification({ type: 'success', message: '报告已导出' })
}

// 点击节点显示详情
const handleNodeClick = (index: number) => {
  selectedNodeIndex.value = index
  showNodeDetails.value = true
}

// 节点详情数据
const selectedNodeData = computed(() => {
  if (selectedNodeIndex.value === null || !simulationResult.value) return null
  
  const idx = selectedNodeIndex.value
  const result = simulationResult.value
  const kp = result.kpPositions[idx] || 0
  const span = result.spanResults?.[idx]
  
  // 获取各信道在该节点的数据
  const channelData = result.channelEvolutions.map((ch, i) => ({
    channelIndex: i + 1,
    centerFreq: ch.centerFreqTHz.toFixed(2),
    gsnr: ch.gsnrEvolution[idx]?.toFixed(2) || '-',
    osnr: ch.osnrEvolution[idx]?.toFixed(2) || '-',
    snrAse: ch.snrAseEvolution?.[idx]?.toFixed(2) || '-',
    snrNli: ch.snrNliEvolution?.[idx]?.toFixed(2) || '-',
  }))
  
  return {
    position: kp.toFixed(1),
    spanIndex: idx,
    avgGsnr: result.avgGsnrEvolution[idx]?.toFixed(2) || '-',
    worstGsnr: result.worstGsnrEvolution[idx]?.toFixed(2) || '-',
    spanLength: span?.length?.toFixed(1) || '-',
    spanLoss: span?.spanLoss?.toFixed(2) || '-',
    channelData,
  }
})

// 链路信息摘要
const linkSummary = computed(() => {
  if (!props.link) return null
  return {
    totalLength: props.link.totalLength?.toFixed(1) || '0',
    spanCount: props.link.spans?.length || 0,
    amplifierCount: Math.max(0, (props.link.spans?.length || 1) - 1),
    channelCount: props.link.wdmParams?.channelCount || 0,
  }
})

// 监听弹窗打开，自动执行仿真
watch(() => props.visible, (visible) => {
  if (visible && props.link) {
    runSimulation()
    showNodeDetails.value = false
    selectedNodeIndex.value = null
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-[1100px] max-h-[90vh] overflow-hidden flex flex-col">
        <!-- 头部 -->
        <div class="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
          <h3 class="font-semibold text-gray-800 flex items-center gap-2">
            <BarChart2 class="w-5 h-5 text-blue-500" />
            链路仿真分析 (Step 7)
          </h3>
          <button class="p-1.5 hover:bg-gray-200 rounded transition-colors" @click="emit('close')">
            <X class="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <!-- 左右分栏内容 -->
        <div class="flex flex-1 overflow-hidden">
          <!-- 左侧：仿真配置面板 -->
          <div class="w-64 border-r bg-gray-50 flex flex-col overflow-y-auto">
            <!-- 链路信息 -->
            <div class="p-3 border-b">
              <h4 class="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-2">
                <Info class="w-3.5 h-3.5" />
                链路信息
              </h4>
              <div v-if="linkSummary" class="space-y-1.5 text-xs">
                <div class="flex justify-between">
                  <span class="text-gray-500">总长度</span>
                  <span class="font-medium">{{ linkSummary.totalLength }} km</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">跨段数量</span>
                  <span class="font-medium">{{ linkSummary.spanCount }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">放大器数量</span>
                  <span class="font-medium">{{ linkSummary.amplifierCount }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">信道数量</span>
                  <span class="font-medium">{{ linkSummary.channelCount }}</span>
                </div>
              </div>
              <div v-else class="text-xs text-gray-400 text-center py-2">未配置链路</div>
            </div>

            <!-- 计算模型 -->
            <div class="p-3 border-b">
              <h4 class="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-2">
                <Settings class="w-3.5 h-3.5" />
                计算模型
              </h4>
              <select
                v-model="selectedModel"
                class="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- 信道显示 -->
            <div class="p-3 border-b">
              <h4 class="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-2">
                <Layers class="w-3.5 h-3.5" />
                信道显示
              </h4>
              <select
                v-model="displayMode"
                class="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 mb-2"
              >
                <option v-for="opt in displayModeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <select
                v-if="displayMode === 'channel'"
                v-model="selectedChannel"
                class="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="opt in channelOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- 目标门限 -->
            <div class="p-3 border-b">
              <h4 class="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-2">
                <Target class="w-3.5 h-3.5" />
                目标门限
              </h4>
              <div class="space-y-2">
                <div>
                  <label class="text-xs text-gray-500">GSNR 门限 (dB)</label>
                  <input
                    v-model.number="targetGsnr"
                    type="number"
                    step="0.5"
                    class="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-500">OSNR 门限 (dB)</label>
                  <input
                    v-model.number="targetOsnr"
                    type="number"
                    step="0.5"
                    class="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="p-3 space-y-2">
              <Button class="w-full" size="sm" @click="runSimulation" :disabled="isSimulating">
                <Play class="w-4 h-4 mr-1" :class="{ 'animate-pulse': isSimulating }" />
                {{ isSimulating ? '仿真中...' : '开始仿真' }}
              </Button>
              <Button variant="outline" class="w-full" size="sm" @click="exportReport" :disabled="!simulationResult">
                <FileText class="w-4 h-4 mr-1" />
                导出报告
              </Button>
              <Button variant="outline" class="w-full" size="sm" @click="exportData" :disabled="!simulationResult">
                <Download class="w-4 h-4 mr-1" />
                导出数据
              </Button>
            </div>
          </div>

          <!-- 右侧：仿真结果面板 -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <!-- Tab 切换 -->
            <div class="px-4 py-2 border-b bg-white flex items-center gap-2">
              <button
                class="px-3 py-1.5 text-xs rounded transition-colors"
                :class="activeTab === 'evolution' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'"
                @click="activeTab = 'evolution'"
              >
                沿程演化
              </button>
              <button
                class="px-3 py-1.5 text-xs rounded transition-colors"
                :class="activeTab === 'spectrum' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'"
                @click="activeTab = 'spectrum'"
              >
                频谱分布
              </button>
              <button
                class="px-3 py-1.5 text-xs rounded transition-colors"
                :class="activeTab === 'heatmap' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'"
                @click="activeTab = 'heatmap'"
              >
                热力图
              </button>
              <button
                class="px-3 py-1.5 text-xs rounded transition-colors"
                :class="activeTab === 'table' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'"
                @click="activeTab = 'table'"
              >
                数据表
              </button>
            </div>

            <!-- 图表内容 -->
            <div class="flex-1 overflow-auto p-4">
              <!-- 结果摘要 -->
              <div v-if="simulationResult" class="grid grid-cols-5 gap-3 mb-4">
                <div class="bg-blue-50 rounded-lg p-2.5 text-center">
                  <div class="text-base font-bold text-blue-600">{{ simulationResult.endToEndAvgGsnr.toFixed(2) }}</div>
                  <div class="text-xs text-gray-500">平均 GSNR</div>
                </div>
                <div class="bg-orange-50 rounded-lg p-2.5 text-center">
                  <div class="text-base font-bold text-orange-600">{{ simulationResult.endToEndWorstGsnr.toFixed(2) }}</div>
                  <div class="text-xs text-gray-500">最差 GSNR</div>
                </div>
                <div class="bg-purple-50 rounded-lg p-2.5 text-center">
                  <div class="text-base font-bold text-purple-600">Ch {{ simulationResult.worstChannelIndex + 1 }}</div>
                  <div class="text-xs text-gray-500">最差信道</div>
                </div>
                <div class="rounded-lg p-2.5 text-center" :class="simulationResult.endToEndWorstGsnr >= targetGsnr ? 'bg-green-50' : 'bg-red-50'">
                  <div class="text-base font-bold" :class="simulationResult.endToEndWorstGsnr >= targetGsnr ? 'text-green-600' : 'text-red-600'">
                    {{ (simulationResult.endToEndWorstGsnr - targetGsnr).toFixed(2) }}
                  </div>
                  <div class="text-xs text-gray-500">GSNR 裕量</div>
                </div>
                <div class="rounded-lg p-2.5 text-center" :class="simulationResult.isFeasible ? 'bg-green-50' : 'bg-red-50'">
                  <div class="text-base font-bold" :class="simulationResult.isFeasible ? 'text-green-600' : 'text-red-600'">
                    {{ simulationResult.isFeasible ? '可行' : '不可行' }}
                  </div>
                  <div class="text-xs text-gray-500">系统状态</div>
                </div>
              </div>

          <!-- 演化曲线图 -->
          <div v-if="activeTab === 'evolution'" class="bg-gray-50 rounded-lg border p-4">
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

              <!-- 放大器位置标记 -->
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

              <!-- 可点击的数据点 -->
              <g v-for="(point, idx) in chartData.kpPositions" :key="'click-' + idx">
                <circle
                  :cx="point.x"
                  :cy="chartData.height - chartData.padding.bottom - ((displayedEvolution?.gsnr[idx] || 0) - chartData.yMin) / (chartData.yMax - chartData.yMin) * (chartData.height - chartData.padding.top - chartData.padding.bottom)"
                  r="5"
                  :fill="selectedNodeIndex === idx ? '#3b82f6' : 'transparent'"
                  :stroke="selectedNodeIndex === idx ? '#3b82f6' : 'transparent'"
                  stroke-width="2"
                  class="cursor-pointer hover:fill-blue-200 hover:stroke-blue-400"
                  @click="handleNodeClick(idx)"
                />
                <circle
                  v-if="selectedNodeIndex === idx"
                  :cx="point.x"
                  :cy="chartData.height - chartData.padding.bottom - ((displayedEvolution?.gsnr[idx] || 0) - chartData.yMin) / (chartData.yMax - chartData.yMin) * (chartData.height - chartData.padding.top - chartData.padding.bottom)"
                  r="3"
                  fill="white"
                />
              </g>
            </svg>
            <div v-if="chartData" class="text-xs text-gray-400 mt-2 text-center">点击曲线上的数据点查看节点详情</div>
            <div v-else class="flex items-center justify-center h-64 text-gray-400">
              <div class="text-center">
                <Cpu class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <div>点击"开始仿真"执行链路分析</div>
              </div>
            </div>
          </div>

          <!-- 频谱分布 -->
          <div v-else-if="activeTab === 'spectrum'" class="bg-gray-50 rounded-lg border p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-medium text-gray-700">频谱分布 (端到端)</h4>
              <div class="flex items-center gap-4 text-xs">
                <span class="flex items-center gap-1">
                  <span class="w-3 h-0.5 bg-blue-500"></span>
                  GSNR
                </span>
                <span class="flex items-center gap-1">
                  <span class="w-3 h-0.5 bg-green-500"></span>
                  OSNR
                </span>
              </div>
            </div>
            <svg v-if="spectrumChart" :width="spectrumChart.width" :height="spectrumChart.height" class="w-full">
              <!-- 网格线 -->
              <g stroke="#e5e7eb" stroke-width="1">
                <line
                  v-for="tick in spectrumChart.yTicks"
                  :key="'sy-' + tick.value"
                  :x1="spectrumChart.padding.left"
                  :y1="tick.y"
                  :x2="spectrumChart.width - spectrumChart.padding.right"
                  :y2="tick.y"
                  stroke-dasharray="4,4"
                />
              </g>
              <!-- GSNR 曲线 -->
              <path
                :d="spectrumChart.gsnrPath"
                fill="none"
                stroke="#3b82f6"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <!-- OSNR 曲线 -->
              <path
                :d="spectrumChart.osnrPath"
                fill="none"
                stroke="#22c55e"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <!-- X 轴 -->
              <g class="x-axis">
                <line
                  :x1="spectrumChart.padding.left"
                  :y1="spectrumChart.height - spectrumChart.padding.bottom"
                  :x2="spectrumChart.width - spectrumChart.padding.right"
                  :y2="spectrumChart.height - spectrumChart.padding.bottom"
                  stroke="#9ca3af"
                  stroke-width="1"
                />
                <g v-for="tick in spectrumChart.xTicks" :key="'sxt-' + tick.value">
                  <text
                    :x="tick.x"
                    :y="spectrumChart.height - spectrumChart.padding.bottom + 18"
                    class="text-xs fill-gray-500"
                    text-anchor="middle"
                  >
                    {{ tick.value }}
                  </text>
                </g>
                <text
                  :x="spectrumChart.width / 2"
                  :y="spectrumChart.height - 10"
                  class="text-xs fill-gray-600"
                  text-anchor="middle"
                >
                  信道编号
                </text>
              </g>
              <!-- Y 轴 -->
              <g class="y-axis">
                <line
                  :x1="spectrumChart.padding.left"
                  :y1="spectrumChart.padding.top"
                  :x2="spectrumChart.padding.left"
                  :y2="spectrumChart.height - spectrumChart.padding.bottom"
                  stroke="#9ca3af"
                  stroke-width="1"
                />
                <g v-for="tick in spectrumChart.yTicks" :key="'syt-' + tick.value">
                  <text
                    :x="spectrumChart.padding.left - 10"
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
                <div>暂无频谱分布数据</div>
              </div>
            </div>
          </div>

          <!-- 热力图 -->
          <div v-else-if="activeTab === 'heatmap'" class="bg-gray-50 rounded-lg border p-4">
            <div class="text-xs text-gray-500 mb-2">颜色代表 GSNR (dB)，横轴为跨段位置，纵轴为信道</div>
            <div v-if="heatmapData" class="overflow-auto">
              <table class="text-[10px] border-collapse">
                <thead>
                  <tr>
                    <th class="px-2 py-1 text-left text-gray-500">Ch</th>
                    <th
                      v-for="(kp, idx) in heatmapData.kpPositions"
                      :key="'kp-' + idx"
                      class="px-1 py-1 text-gray-400 text-right"
                    >
                      {{ kp.toFixed(0) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in heatmapData.values" :key="'row-' + rowIndex">
                    <td class="px-2 py-1 text-gray-600">Ch {{ rowIndex + 1 }}</td>
                    <td
                      v-for="(value, colIndex) in row"
                      :key="'cell-' + rowIndex + '-' + colIndex"
                      class="px-1 py-1 text-right text-white"
                      :style="{ backgroundColor: getHeatColor(value, heatmapData.min, heatmapData.max) }"
                    >
                      {{ value.toFixed(1) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="flex items-center justify-center h-64 text-gray-400">
              <div class="text-center">
                <Cpu class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <div>暂无热力图数据</div>
              </div>
            </div>
          </div>

          <!-- 数据表 -->
          <div v-else class="space-y-4">
            <div class="border rounded-lg p-3">
              <h4 class="text-xs font-bold text-gray-700 mb-2">跨段明细</h4>
              <div class="overflow-auto">
                <table class="w-full text-xs border-collapse">
                  <thead class="bg-gray-100">
                    <tr>
                      <th class="px-2 py-1 text-left">跨段</th>
                      <th class="px-2 py-1 text-right">长度(km)</th>
                      <th class="px-2 py-1 text-right">损耗(dB)</th>
                      <th class="px-2 py-1 text-right">GSNR(dB)</th>
                      <th class="px-2 py-1 text-right">OSNR(dB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in spanTableRows" :key="row.spanId" class="border-b">
                      <td class="px-2 py-1">Span {{ row.index + 1 }}</td>
                      <td class="px-2 py-1 text-right">{{ row.length.toFixed(1) }}</td>
                      <td class="px-2 py-1 text-right">{{ row.spanLoss.toFixed(2) }}</td>
                      <td class="px-2 py-1 text-right">{{ row.gsnr.toFixed(2) }}</td>
                      <td class="px-2 py-1 text-right">{{ row.osnr.toFixed(2) }}</td>
                    </tr>
                    <tr v-if="spanTableRows.length === 0">
                      <td colspan="5" class="px-2 py-4 text-center text-gray-400">暂无跨段数据</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="border rounded-lg p-3">
              <h4 class="text-xs font-bold text-gray-700 mb-2">信道端到端</h4>
              <div class="overflow-auto">
                <table class="w-full text-xs border-collapse">
                  <thead class="bg-gray-100">
                    <tr>
                      <th class="px-2 py-1 text-left">信道</th>
                      <th class="px-2 py-1 text-right">中心频率(THz)</th>
                      <th class="px-2 py-1 text-right">GSNR(dB)</th>
                      <th class="px-2 py-1 text-right">OSNR(dB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="ch in spectrumPoints" :key="'ch-' + ch.channelIndex" class="border-b">
                      <td class="px-2 py-1">Ch {{ ch.channelIndex + 1 }}</td>
                      <td class="px-2 py-1 text-right">{{ ch.centerFreqTHz.toFixed(2) }}</td>
                      <td class="px-2 py-1 text-right">{{ ch.gsnr.toFixed(2) }}</td>
                      <td class="px-2 py-1 text-right">{{ ch.osnr.toFixed(2) }}</td>
                    </tr>
                    <tr v-if="spectrumPoints.length === 0">
                      <td colspan="4" class="px-2 py-4 text-center text-gray-400">暂无信道数据</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部节点详情面板 -->
        <div v-if="showNodeDetails && selectedNodeData" class="border-t bg-gray-50">
          <div
            class="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-100"
            @click="showNodeDetails = !showNodeDetails"
          >
            <h4 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <ChevronDown v-if="showNodeDetails" class="w-4 h-4" />
              <ChevronUp v-else class="w-4 h-4" />
              节点详情 - KP {{ selectedNodeData.position }} km
            </h4>
            <button class="text-gray-400 hover:text-gray-600" @click.stop="showNodeDetails = false">
              <X class="w-4 h-4" />
            </button>
          </div>
          <div class="px-4 pb-3 max-h-48 overflow-auto">
            <!-- 节点摘要 -->
            <div class="grid grid-cols-5 gap-3 mb-3">
              <div class="bg-white rounded border p-2 text-center">
                <div class="text-sm font-bold text-blue-600">{{ selectedNodeData.avgGsnr }}</div>
                <div class="text-xs text-gray-500">平均 GSNR</div>
              </div>
              <div class="bg-white rounded border p-2 text-center">
                <div class="text-sm font-bold text-orange-600">{{ selectedNodeData.worstGsnr }}</div>
                <div class="text-xs text-gray-500">最差 GSNR</div>
              </div>
              <div class="bg-white rounded border p-2 text-center">
                <div class="text-sm font-bold text-gray-700">{{ selectedNodeData.spanIndex }}</div>
                <div class="text-xs text-gray-500">跨段索引</div>
              </div>
              <div class="bg-white rounded border p-2 text-center">
                <div class="text-sm font-bold text-gray-700">{{ selectedNodeData.spanLength }}</div>
                <div class="text-xs text-gray-500">跨段长度(km)</div>
              </div>
              <div class="bg-white rounded border p-2 text-center">
                <div class="text-sm font-bold text-gray-700">{{ selectedNodeData.spanLoss }}</div>
                <div class="text-xs text-gray-500">跨段损耗(dB)</div>
              </div>
            </div>
            <!-- 信道明细表 -->
            <div class="text-xs text-gray-500 mb-1">各信道在该节点的性能参数：</div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs border-collapse">
                <thead class="bg-gray-100">
                  <tr>
                    <th class="px-2 py-1 text-left">信道</th>
                    <th class="px-2 py-1 text-right">中心频率(THz)</th>
                    <th class="px-2 py-1 text-right">GSNR(dB)</th>
                    <th class="px-2 py-1 text-right">OSNR(dB)</th>
                    <th class="px-2 py-1 text-right">SNR_ASE(dB)</th>
                    <th class="px-2 py-1 text-right">SNR_NLI(dB)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="ch in selectedNodeData.channelData.slice(0, 10)" :key="'nch-' + ch.channelIndex" class="border-b">
                    <td class="px-2 py-1">Ch {{ ch.channelIndex }}</td>
                    <td class="px-2 py-1 text-right">{{ ch.centerFreq }}</td>
                    <td class="px-2 py-1 text-right">{{ ch.gsnr }}</td>
                    <td class="px-2 py-1 text-right">{{ ch.osnr }}</td>
                    <td class="px-2 py-1 text-right">{{ ch.snrAse }}</td>
                    <td class="px-2 py-1 text-right">{{ ch.snrNli }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="selectedNodeData.channelData.length > 10" class="text-center text-gray-400 py-1">
                ... 还有 {{ selectedNodeData.channelData.length - 10 }} 个信道
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

