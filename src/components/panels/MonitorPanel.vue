<script setup lang="ts">
import { Card, CardHeader, CardContent } from '@/components/ui'
import { X } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Mock 设备数据
const devices = [
  { id: 1, name: 'A', code: 'DEV001', status: 'OK' },
  { id: 2, name: 'B', code: 'DEV002', status: 'WARN' },
  { id: 3, name: 'C', code: 'DEV003', status: 'OK' },
  { id: 4, name: 'D', code: 'DEV004', status: 'ALARM' },
  { id: 5, name: 'E', code: 'DEV005', status: 'OK' },
  { id: 6, name: 'F', code: 'DEV006', status: 'OK' },
]

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
          <span class="font-bold text-success">正常</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">活动告警数:</span>
          <span class="font-bold text-danger">1</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">GSNR:</span>
          <span class="font-bold">25 dB</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">余量:</span>
          <span class="font-bold">3 dB</span>
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
