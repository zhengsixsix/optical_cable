<script setup lang="ts">
import { Card, CardHeader, CardContent } from '@/components/ui'
import { X } from 'lucide-vue-next'
import { mockMonitorPanelDevices, mockMonitorPanelStats } from '@/data/mockData'

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 设备数据 - 从集中数据文件导入
const devices = mockMonitorPanelDevices
const stats = mockMonitorPanelStats

function getStatusClass(status: string) {
  switch (status) {
    case 'OK': return 'text-success'
    case 'WARN': return 'text-warning'
    case 'ALARM': return 'text-danger'
    default: return 'text-gray-500'
  }
}
</script>

<template>
  <Card class="flex-1 flex flex-col min-h-[200px] overflow-hidden">
    <CardHeader>
      <span class="font-semibold text-sm text-gray-700">实时性能概览</span>
      <button class="p-1 hover:bg-gray-200 rounded" title="隐藏" @click="emit('close')">
        <X class="w-4 h-4 text-gray-500" />
      </button>
    </CardHeader>
    
    <CardContent class="flex-1 overflow-auto text-xs">
      <div class="space-y-1.5">
        <div class="flex justify-between">
          <span class="text-gray-600">总体健康度:</span>
          <span class="font-bold text-success">{{ stats.healthStatus }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">活动告警数:</span>
          <span class="font-bold text-danger">{{ stats.activeAlarms }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">GSNR:</span>
          <span class="font-bold">{{ stats.gsnr }} dB</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">余量:</span>
          <span class="font-bold">{{ stats.margin }} dB</span>
        </div>
      </div>
      
      <hr class="my-2 border-gray-200" />
      
      <div class="space-y-1">
        <div 
          v-for="device in devices" 
          :key="device.id"
          class="flex justify-between text-gray-600"
        >
          <span>设备 {{ device.name }} ({{ device.code }}):</span>
          <span :class="['font-bold', getStatusClass(device.status)]">
            {{ device.status }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
