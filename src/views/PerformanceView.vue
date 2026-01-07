<script setup lang="ts">
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Select } from '@/components/ui'
import { performanceTimeRangeOptions } from '@/data/mockData'
import { useMonitorStore } from '@/stores'

const monitorStore = useMonitorStore()

// 设备列表 - 从 monitorStore 动态获取
const deviceOptions = computed(() => 
  monitorStore.devices
    .filter(d => d.type === 'Repeater' || d.type === 'BU')
    .map(d => ({ value: d.id, label: d.name }))
)

const selectedDevice = ref('')
const selectedTimeRange = ref('24h')
const timeRangeOptions = performanceTimeRangeOptions

// 性能数据 - 根据选中设备生成模拟历史记录
const performanceData = computed(() => {
  const device = monitorStore.devices.find(d => d.id === selectedDevice.value)
  if (!device) return []
  
  // 生成模拟历史数据
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const time = new Date(now.getTime() - (5 - i) * 3600000)
    return {
      id: i + 1,
      time: time.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      device: device.name,
      voltage: `${(device.pfeVoltage + (Math.random() - 0.5) * 0.4).toFixed(1)}V`,
      temp: `${(device.temperature + (Math.random() - 0.5) * 0.5).toFixed(1)}°C`,
      status: device.status === 'normal' ? 'Normal' : 'Warning'
    }
  })
})

// 是否有数据
const hasData = computed(() => monitorStore.devices.length > 0)
</script>

<template>
  <MainLayout>
    <template #left>
      <Card class="flex-1">
        <CardHeader>
          <span class="font-semibold text-sm">查询条件</span>
        </CardHeader>
        <CardContent class="space-y-4">
          <template v-if="hasData">
            <div class="space-y-2">
              <label class="text-xs text-gray-500">设备选择</label>
              <Select v-model="selectedDevice" :options="deviceOptions" placeholder="请选择设备" />
            </div>
            <div class="space-y-2">
              <label class="text-xs text-gray-500">时间范围</label>
              <Select v-model="selectedTimeRange" :options="timeRangeOptions" />
            </div>
            <button class="w-full bg-blue-600 text-white text-sm py-2 rounded hover:bg-blue-700 transition">
              查询
            </button>
          </template>
          <div v-else class="text-center text-gray-400 py-4">
            <p>暂无设备数据</p>
            <p class="text-xs mt-1">请先打开项目</p>
          </div>
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
            <template v-if="performanceData.length > 0">
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
            </template>
            <div v-else class="flex items-center justify-center h-full text-gray-400">
              <p>{{ hasData ? '请选择设备查看历史数据' : '暂无性能数据' }}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </MainLayout>
</template>
