<script setup lang="ts">
/**
 * 信道性能图表
 * 
 * 显示各 WDM 信道的 GSNR/OSNR 分布：
 * - 条形图展示各信道的性能值
 * - 支持悬停显示详细信息
 * - 显示目标线和警告阈值
 */

import { ref, computed } from 'vue'
import { AlertTriangle, Check } from 'lucide-vue-next'

const props = defineProps<{
  /** 各信道的 GSNR 值数组 */
  channelGsnr: number[]
  /** 各信道的 OSNR 值数组 (可选) */
  channelOsnr?: number[]
  /** 目标 GSNR */
  targetGsnr: number
  /** 信道数量 */
  channelCount: number
  /** 图表高度 */
  height?: number
  /** 标题 */
  title?: string
  /** 是否显示 OSNR 曲线 */
  showOsnr?: boolean
}>()

const chartHeight = computed(() => props.height || 180)

// 悬停的信道
const hoveredChannel = ref<number | null>(null)

// 计算图表数据
const chartData = computed(() => {
  const gsnr = props.channelGsnr
  if (!gsnr || gsnr.length === 0) return null

  const padding = { top: 20, right: 40, bottom: 30, left: 50 }
  const width = 600
  const height = chartHeight.value

  // 数据范围
  const yMin = Math.min(...gsnr) - 2
  const yMax = Math.max(...gsnr) + 2

  // 缩放函数
  const scaleX = (ch: number) => padding.left + (ch / (gsnr.length - 1)) * (width - padding.left - padding.right)
  const scaleY = (y: number) => height - padding.bottom - ((y - yMin) / (yMax - yMin)) * (height - padding.top - padding.bottom)

  // 目标线
  const targetY = scaleY(props.targetGsnr)

  // Y 轴刻度
  const yTicks: Array<{ value: number; y: number }> = []
  const yStep = (yMax - yMin) / 4
  for (let y = yMin; y <= yMax; y += yStep) {
    yTicks.push({ value: parseFloat(y.toFixed(1)), y: scaleY(y) })
  }

  // 条形数据
  const barWidth = Math.max(2, (width - padding.left - padding.right) / gsnr.length - 1)
  const bars = gsnr.map((value, index) => ({
    index,
    value,
    x: scaleX(index) - barWidth / 2,
    y: scaleY(value),
    height: height - padding.bottom - scaleY(value),
    width: barWidth,
    meetsTarget: value >= props.targetGsnr
  }))

  // 统计信息
  const avgGsnr = gsnr.reduce((a, b) => a + b, 0) / gsnr.length
  const minGsnr = Math.min(...gsnr)
  const maxGsnr = Math.max(...gsnr)
  const minChannel = gsnr.indexOf(minGsnr)
  const maxChannel = gsnr.indexOf(maxGsnr)

  return {
    width,
    height,
    padding,
    bars,
    targetY,
    yTicks,
    yMin,
    yMax,
    stats: {
      avg: avgGsnr,
      min: minGsnr,
      max: maxGsnr,
      minChannel: minChannel + 1,
      maxChannel: maxChannel + 1,
      belowTarget: gsnr.filter(v => v < props.targetGsnr).length
    }
  }
})

// 悬停处理
const handleBarHover = (index: number | null) => {
  hoveredChannel.value = index
}
</script>

<template>
  <div class="channel-performance-chart">
    <!-- 标题和统计 -->
    <div class="flex items-center justify-between mb-2">
      <div class="text-sm font-medium text-gray-700">{{ title || '信道性能分布' }}</div>
      <div v-if="chartData" class="flex items-center gap-4 text-xs text-gray-500">
        <span>
          平均: <span class="font-mono text-gray-700">{{ chartData.stats.avg.toFixed(2) }} dB</span>
        </span>
        <span>
          最小: <span class="font-mono text-amber-600">{{ chartData.stats.min.toFixed(2) }} dB (Ch{{ chartData.stats.minChannel }})</span>
        </span>
        <span>
          最大: <span class="font-mono text-green-600">{{ chartData.stats.max.toFixed(2) }} dB (Ch{{ chartData.stats.maxChannel }})</span>
        </span>
      </div>
    </div>

    <!-- 图例 -->
    <div class="flex items-center gap-4 text-xs mb-2">
      <span class="flex items-center gap-1">
        <span class="w-3 h-3 bg-blue-500 rounded-sm"></span>
        GSNR ≥ 目标
      </span>
      <span class="flex items-center gap-1">
        <span class="w-3 h-3 bg-red-400 rounded-sm"></span>
        GSNR &lt; 目标
      </span>
      <span class="flex items-center gap-1">
        <span class="w-6 h-0.5 bg-red-500 border-dashed"></span>
        目标 GSNR ({{ targetGsnr }} dB)
      </span>
    </div>

    <!-- SVG 图表 -->
    <div class="relative bg-gray-50 rounded-lg border">
      <svg
        v-if="chartData"
        :viewBox="`0 0 ${chartData.width} ${chartData.height}`"
        preserveAspectRatio="xMidYMid meet"
        class="w-full h-auto"
      >
        <!-- 网格线 -->
        <g class="grid-lines" stroke="#e5e7eb" stroke-width="1">
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

        <!-- 目标线 -->
        <line
          :x1="chartData.padding.left"
          :y1="chartData.targetY"
          :x2="chartData.width - chartData.padding.right"
          :y2="chartData.targetY"
          stroke="#ef4444"
          stroke-width="2"
          stroke-dasharray="6,4"
        />
        <text
          :x="chartData.width - chartData.padding.right + 5"
          :y="chartData.targetY + 4"
          class="text-xs fill-red-500"
        >
          {{ targetGsnr }} dB
        </text>

        <!-- 条形图 -->
        <g v-for="bar in chartData.bars" :key="bar.index">
          <rect
            :x="bar.x"
            :y="bar.y"
            :width="bar.width"
            :height="Math.max(1, bar.height)"
            :fill="bar.meetsTarget ? '#3b82f6' : '#f87171'"
            :opacity="hoveredChannel === bar.index ? 1 : 0.8"
            class="cursor-pointer transition-opacity"
            @mouseenter="handleBarHover(bar.index)"
            @mouseleave="handleBarHover(null)"
          />
        </g>

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
          <!-- X 轴标签 -->
          <text
            :x="chartData.padding.left"
            :y="chartData.height - 8"
            class="text-xs fill-gray-500"
            text-anchor="start"
          >
            Ch 1
          </text>
          <text
            :x="chartData.width / 2"
            :y="chartData.height - 8"
            class="text-xs fill-gray-500"
            text-anchor="middle"
          >
            信道
          </text>
          <text
            :x="chartData.width - chartData.padding.right"
            :y="chartData.height - 8"
            class="text-xs fill-gray-500"
            text-anchor="end"
          >
            Ch {{ channelCount }}
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
            <line
              :x1="chartData.padding.left - 5"
              :y1="tick.y"
              :x2="chartData.padding.left"
              :y2="tick.y"
              stroke="#9ca3af"
            />
            <text
              :x="chartData.padding.left - 8"
              :y="tick.y + 4"
              class="text-xs fill-gray-500"
              text-anchor="end"
            >
              {{ tick.value }}
            </text>
          </g>
          <text
            :x="12"
            :y="chartData.height / 2"
            class="text-xs fill-gray-600"
            text-anchor="middle"
            :transform="`rotate(-90, 12, ${chartData.height / 2})`"
          >
            GSNR (dB)
          </text>
        </g>
      </svg>

      <!-- 无数据提示 -->
      <div v-else class="flex items-center justify-center h-40 text-gray-400">
        暂无信道性能数据
      </div>

      <!-- 悬停提示 -->
      <div
        v-if="hoveredChannel !== null && chartData"
        class="absolute bg-white shadow-lg rounded-lg p-2 text-xs border z-10 pointer-events-none"
        :style="{
          left: `${(chartData.bars[hoveredChannel]?.x || 0) + 10}px`,
          top: `${Math.max(20, (chartData.bars[hoveredChannel]?.y || 0) - 50)}px`
        }"
      >
        <div class="font-medium text-gray-800 mb-1 flex items-center gap-1">
          Ch {{ hoveredChannel + 1 }}
          <Check v-if="chartData.bars[hoveredChannel]?.meetsTarget" class="w-3 h-3 text-green-500" />
          <AlertTriangle v-else class="w-3 h-3 text-red-500" />
        </div>
        <div class="text-gray-600">
          GSNR: <span class="font-mono">{{ channelGsnr[hoveredChannel]?.toFixed(2) }} dB</span>
        </div>
        <div v-if="channelOsnr && channelOsnr[hoveredChannel]" class="text-gray-600">
          OSNR: <span class="font-mono">{{ channelOsnr[hoveredChannel]?.toFixed(2) }} dB</span>
        </div>
      </div>
    </div>

    <!-- 底部统计 -->
    <div v-if="chartData" class="mt-2 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="text-gray-500">总信道数: {{ channelCount }}</span>
        <span v-if="chartData.stats.belowTarget > 0" class="text-red-600 flex items-center gap-1">
          <AlertTriangle class="w-3 h-3" />
          {{ chartData.stats.belowTarget }} 信道低于目标
        </span>
        <span v-else class="text-green-600 flex items-center gap-1">
          <Check class="w-3 h-3" />
          全部满足目标
        </span>
      </div>
      <div class="text-gray-500">
        波动范围: {{ (chartData.stats.max - chartData.stats.min).toFixed(2) }} dB
      </div>
    </div>
  </div>
</template>

<style scoped>
.channel-performance-chart svg text {
  font-family: system-ui, -apple-system, sans-serif;
}
</style>
