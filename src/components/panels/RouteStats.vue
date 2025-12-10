<script setup lang="ts">
import { Card, CardHeader, CardContent } from '@/components/ui'
import { Printer, Settings, X } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Mock 数据
const stats = {
  project: '新海缆工程',
  totalLength: 1245.5,
  countries: ['A', 'B', 'C'],
  landingStations: 4,
  branchingUnits: 2,
  sections: [
    { id: '01', length: 45.2, type: 'LPA' },
    { id: '02', length: 78.3, type: 'SPA' },
    { id: '03', length: 92.1, type: 'LPA' },
    { id: '04', length: 56.8, type: 'SPA' },
    { id: '05', length: 63.4, type: 'LPA' },
  ]
}
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
      <ul class="list-disc pl-5 space-y-1.5">
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
    </CardContent>
  </Card>
</template>
