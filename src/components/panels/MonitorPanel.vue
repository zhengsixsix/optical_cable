<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardContent } from '@/components/ui'
import { X } from 'lucide-vue-next'
import { useMonitorStore } from '@/stores'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const monitorStore = useMonitorStore()

// 从 monitor store 计算设备列表
const devices = computed(() => {
  return monitorStore.devices.map(d => ({
    id: d.id,
    name: d.name,
    code: `KP${d.kp}`,
    status: d.status === 'normal' ? 'OK' : d.status === 'warning' ? 'WARN' : 'ALARM'
  }))
})

// 从 monitor store 计算统计数据
const stats = computed(() => {
  const statusSummary = monitorStore.statusSummary
  const hasData = monitorStore.devices.length > 0
  
  return {
    healthStatus: !hasData ? '--' : (statusSummary.error > 0 ? '异常' : statusSummary.warning > 0 ? '警告' : '正常'),
    activeAlarms: monitorStore.activeAlarms,
    gsnr: hasData ? 25 : '--', // TODO: 从实际数据计算
    margin: hasData ? 3 : '--', // TODO: 从实际数据计算
  }
})

// 是否有数据
const hasData = computed(() => monitorStore.devices.length > 0)

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
      <!-- 有数据时显示 -->
      <template v-if="hasData">
        <div class="space-y-1.5">
          <div class="flex justify-between">
            <span class="text-gray-600">总体健康度:</span>
            <span class="font-bold" :class="stats.healthStatus === '正常' ? 'text-success' : stats.healthStatus === '警告' ? 'text-warning' : 'text-danger'">{{ stats.healthStatus }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">活动告警数:</span>
            <span class="font-bold" :class="stats.activeAlarms > 0 ? 'text-danger' : 'text-gray-600'">{{ stats.activeAlarms }}</span>
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
      </template>
      <!-- 无数据时显示提示 -->
      <div v-else class="text-center text-gray-400 py-8">
        <p>暂无监控数据</p>
        <p class="text-xs mt-1">请打开项目</p>
      </div>
    </CardContent>
  </Card>
</template>
