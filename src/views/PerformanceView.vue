<script setup lang="ts">
import { ref } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Select } from '@/components/ui'
import { mockPerformanceData, performanceDeviceOptions, performanceTimeRangeOptions } from '@/data/mockData'

// 查询条件 - 从集中数据文件导入
const selectedDevice = ref('r1')
const deviceOptions = performanceDeviceOptions

const selectedTimeRange = ref('24h')
const timeRangeOptions = performanceTimeRangeOptions

const performanceData = mockPerformanceData
</script>

<template>
  <MainLayout>
    <template #left>
      <Card class="flex-1">
        <CardHeader>
          <span class="font-semibold text-sm">查询条件</span>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <label class="text-xs text-gray-500">设备选择</label>
            <Select v-model="selectedDevice" :options="deviceOptions" />
          </div>
          <div class="space-y-2">
            <label class="text-xs text-gray-500">时间范围</label>
            <Select v-model="selectedTimeRange" :options="timeRangeOptions" />
          </div>
          <button class="w-full bg-blue-600 text-white text-sm py-2 rounded hover:bg-blue-700 transition">
            查询
          </button>
        </CardContent>
      </Card>
    </template>

    <template #center>
      <div class="h-full flex flex-col gap-2">
        <!-- Chart Section Placeholder -->
        <Card class="h-[300px] shrink-0">
          <CardHeader>
            <span class="font-semibold text-sm">性能趋势图</span>
          </CardHeader>
          <CardContent class="h-[calc(100%-40px)] flex items-center justify-center bg-gray-50">
            <!-- Simulated Chart using CSS -->
            <div class="w-full h-full p-4 flex items-end justify-around gap-2">
              <div class="w-[8%] bg-blue-200 h-[40%] rounded-t hover:bg-blue-300 transition relative group">
                <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">48.2V</div>
              </div>
              <div class="w-[8%] bg-blue-200 h-[50%] rounded-t hover:bg-blue-300 transition relative group">
                 <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">48.3V</div>
              </div>
              <div class="w-[8%] bg-blue-200 h-[45%] rounded-t hover:bg-blue-300 transition relative group">
                 <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">48.2V</div>
              </div>
              <div class="w-[8%] bg-blue-200 h-[60%] rounded-t hover:bg-blue-300 transition relative group">
                 <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">48.4V</div>
              </div>
              <div class="w-[8%] bg-yellow-200 h-[70%] rounded-t hover:bg-yellow-300 transition relative group">
                 <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">48.5V</div>
              </div>
              <div class="w-[8%] bg-blue-200 h-[55%] rounded-t hover:bg-blue-300 transition relative group">
                 <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">48.3V</div>
              </div>
               <div class="w-[8%] bg-blue-200 h-[42%] rounded-t hover:bg-blue-300 transition relative group">
                 <div class="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">48.2V</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Data Table -->
        <Card class="flex-1 overflow-hidden">
          <CardHeader>
             <span class="font-semibold text-sm">历史数据详情</span>
          </CardHeader>
          <CardContent class="h-full overflow-auto p-0">
            <table class="w-full text-sm text-left">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="p-3 border-b">时间</th>
                  <th class="p-3 border-b">设备</th>
                  <th class="p-3 border-b">电压</th>
                  <th class="p-3 border-b">温度</th>
                  <th class="p-3 border-b">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in performanceData" :key="item.id" class="border-b hover:bg-gray-50 transition">
                  <td class="p-3">{{ item.time }}</td>
                  <td class="p-3">{{ item.device }}</td>
                  <td class="p-3">{{ item.voltage }}</td>
                  <td class="p-3">{{ item.temp }}</td>
                  <td class="p-3">
                    <span 
                      class="px-2 py-1 rounded text-xs"
                      :class="item.status === 'Normal' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
                    >
                      {{ item.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </template>
  </MainLayout>
</template>
