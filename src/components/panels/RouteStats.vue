<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardContent } from '@/components/ui'
import { Printer, Settings, X } from 'lucide-vue-next'
import { useRPLStore, useAppStore } from '@/stores'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const rplStore = useRPLStore()
const appStore = useAppStore()

// 从 RPL store 计算路由统计数据
const stats = computed(() => {
  const table = rplStore.currentTable
  if (!table || table.records.length === 0) {
    return null
  }

  const records = table.records
  const metadata = table.metadata

  // 计算分段信息
  const sections: { id: string; length: number; type: string }[] = []
  let sectionIndex = 1
  let currentType = records[0]?.cableType || 'LW'
  let sectionLength = 0

  records.forEach((record, index) => {
    if (record.cableType !== currentType || index === records.length - 1) {
      // 新类型或最后一条记录
      if (index === records.length - 1) {
        sectionLength += record.segmentLength
      }
      if (sectionLength > 0) {
        sections.push({
          id: String(sectionIndex).padStart(2, '0'),
          length: Math.round(sectionLength),
          type: currentType
        })
        sectionIndex++
      }
      currentType = record.cableType
      sectionLength = record.segmentLength
    } else {
      sectionLength += record.segmentLength
    }
  })

  return {
    project: appStore.currentProjectName || table.name,
    totalLength: Math.round(metadata.totalLength),
    countries: ['中国', '日本'], // TODO: 从数据中推断
    landingStations: metadata.landingStations,
    branchingUnits: metadata.branchingUnits,
    sections
  }
})
</script>

<template>
  <Card class="flex-1 flex flex-col min-h-[200px] overflow-hidden">
    <CardHeader>
      <span class="font-semibold text-sm text-gray-700">海底路由信息统计</span>
      <div class="flex gap-1">
        <button class="p-1 hover:bg-gray-200 rounded">
          <Printer class="w-4 h-4 text-gray-500" />
        </button>
        <button class="p-1 hover:bg-gray-200 rounded">
          <Settings class="w-4 h-4 text-gray-500" />
        </button>
        <button class="p-1 hover:bg-gray-200 rounded" title="隐藏" @click="emit('close')">
          <X class="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </CardHeader>
    
    <CardContent class="flex-1 overflow-auto text-sm text-gray-600">
      <!-- 有项目数据时显示统计 -->
      <ul v-if="stats" class="list-disc pl-5 space-y-1.5">
        <li><strong class="text-gray-800">项目:</strong> {{ stats.project }}</li>
        <li><strong class="text-gray-800">总长度:</strong> {{ stats.totalLength }} km</li>
        <li><strong class="text-gray-800">涉及国家:</strong> {{ stats.countries.join(', ') }}</li>
        <li><strong class="text-gray-800">登陆站数量:</strong> {{ stats.landingStations }}</li>
        <li><strong class="text-gray-800">分支器数量:</strong> {{ stats.branchingUnits }}</li>
        <li><strong class="text-gray-800">路由分段:</strong></li>
        <li 
          v-for="section in stats.sections" 
          :key="section.id"
          class="ml-4 text-xs text-gray-500 list-[circle]"
        >
          Section {{ section.id }}: Len={{ section.length }}km, Type={{ section.type }}
        </li>
      </ul>
      <!-- 无项目数据时显示提示 -->
      <div v-else class="text-center text-gray-400 py-8">
        <p>暂无路由数据</p>
        <p class="text-xs mt-1">请打开项目或创建新路由</p>
      </div>
    </CardContent>
  </Card>
</template>
