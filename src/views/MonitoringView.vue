<script setup lang="ts">
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import MonitorPanel from '@/components/panels/MonitorPanel.vue'
import { Activity, AlertTriangle, CheckCircle, XCircle, Zap, Thermometer, Radio, MapPin } from 'lucide-vue-next'

// 设备列表数据
const devices = ref([
  { id: 'r1', name: '中继器 R1', type: 'repeater', status: 'normal', voltage: '48.2V', temp: '4.2°C', location: 'KP 120' },
  { id: 'r2', name: '中继器 R2', type: 'repeater', status: 'warning', voltage: '47.8V', temp: '5.1°C', location: 'KP 240' },
  { id: 'r3', name: '中继器 R3', type: 'repeater', status: 'normal', voltage: '48.1V', temp: '4.0°C', location: 'KP 360' },
  { id: 'b1', name: '分支器 B1', type: 'branching', status: 'normal', voltage: '48.0V', temp: '3.8°C', location: 'KP 200' },
  { id: 'l1', name: '登陆站 L1', type: 'landing', status: 'error', voltage: '47.5V', temp: '22.5°C', location: '上海' },
  { id: 'l2', name: '登陆站 L2', type: 'landing', status: 'normal', voltage: '48.3V', temp: '21.8°C', location: '冲绳' },
])

// 选中的设备
const selectedDevice = ref<string | null>(null)

// 告警历史
const alarmHistory = ref([
  { id: 1, time: '14:30', device: '登陆站 L1', message: '供电电压异常', level: 'error' },
  { id: 2, time: '12:15', device: '中继器 R2', message: '温度超过阈值', level: 'warning' },
  { id: 3, time: '10:45', device: '中继器 R1', message: '信号恢复正常', level: 'info' },
  { id: 4, time: '09:30', device: '分支器 B1', message: '端口连接正常', level: 'info' },
  { id: 5, time: '08:00', device: '系统', message: '系统启动完成', level: 'info' },
])

// 选中设备的详情
const selectedDeviceInfo = computed(() => {
  if (!selectedDevice.value) return null
  return devices.value.find(d => d.id === selectedDevice.value)
})

// 统计数据
const stats = computed(() => ({
  total: devices.value.length,
  normal: devices.value.filter(d => d.status === 'normal').length,
  warning: devices.value.filter(d => d.status === 'warning').length,
  error: devices.value.filter(d => d.status === 'error').length,
}))

const getStatusClass = (status: string) => {
  switch (status) {
    case 'normal': return 'bg-green-100 text-green-700 border-green-200'
    case 'warning': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'error': return 'bg-red-100 text-red-700 border-red-200'
    default: return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'normal': return CheckCircle
    case 'warning': return AlertTriangle
    case 'error': return XCircle
    default: return Activity
  }
}

const getAlarmClass = (level: string) => {
  switch (level) {
    case 'error': return 'bg-red-50 border-l-4 border-red-500 text-red-700'
    case 'warning': return 'bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700'
    default: return 'bg-blue-50 border-l-4 border-blue-500 text-blue-700'
  }
}

const selectDevice = (id: string) => {
  selectedDevice.value = selectedDevice.value === id ? null : id
}
</script>

<template>
  <MainLayout>
    <template #left>
      <!-- 设备统计 -->
      <Card class="shrink-0">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <Activity class="w-4 h-4" />
            设备状态统计
          </span>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-2">
            <div class="p-2 bg-gray-50 rounded text-center">
              <div class="text-xl font-bold text-gray-700">{{ stats.total }}</div>
              <div class="text-xs text-gray-500">设备总数</div>
            </div>
            <div class="p-2 bg-green-50 rounded text-center">
              <div class="text-xl font-bold text-green-600">{{ stats.normal }}</div>
              <div class="text-xs text-green-600">正常</div>
            </div>
            <div class="p-2 bg-yellow-50 rounded text-center">
              <div class="text-xl font-bold text-yellow-600">{{ stats.warning }}</div>
              <div class="text-xs text-yellow-600">告警</div>
            </div>
            <div class="p-2 bg-red-50 rounded text-center">
              <div class="text-xl font-bold text-red-600">{{ stats.error }}</div>
              <div class="text-xs text-red-600">故障</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 设备列表 -->
      <Card class="flex-1 overflow-hidden flex flex-col">
        <CardHeader>
          <span class="font-semibold text-sm">设备列表</span>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto p-0">
          <div class="divide-y">
            <div 
              v-for="device in devices" 
              :key="device.id"
              :class="[
                'p-3 cursor-pointer transition-colors',
                selectedDevice === device.id ? 'bg-blue-50' : 'hover:bg-gray-50'
              ]"
              @click="selectDevice(device.id)"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <component :is="getStatusIcon(device.status)" 
                    :class="[
                      'w-4 h-4',
                      device.status === 'normal' ? 'text-green-500' : 
                      device.status === 'warning' ? 'text-yellow-500' : 'text-red-500'
                    ]"
                  />
                  <span class="text-sm font-medium">{{ device.name }}</span>
                </div>
                <span 
                  :class="['text-xs px-2 py-0.5 rounded border', getStatusClass(device.status)]"
                >
                  {{ device.status === 'normal' ? '正常' : device.status === 'warning' ? '告警' : '故障' }}
                </span>
              </div>
              <div class="mt-1 text-xs text-gray-500 flex items-center gap-1">
                <MapPin class="w-3 h-3" />
                {{ device.location }}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #center>
      <!-- 监控主视图 -->
      <Card class="flex-1 flex flex-col overflow-hidden">
        <CardHeader>
          <span class="font-semibold text-sm">实时监控</span>
        </CardHeader>
        <CardContent class="flex-1 flex flex-col">
          <!-- 选中设备详情 -->
          <div v-if="selectedDeviceInfo" class="mb-4 p-4 bg-gray-50 rounded-lg">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-gray-700">{{ selectedDeviceInfo.name }}</h3>
              <span 
                :class="['text-xs px-2 py-1 rounded border', getStatusClass(selectedDeviceInfo.status)]"
              >
                {{ selectedDeviceInfo.status === 'normal' ? '运行正常' : selectedDeviceInfo.status === 'warning' ? '告警中' : '故障' }}
              </span>
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div class="flex items-center gap-2">
                <Zap class="w-4 h-4 text-blue-500" />
                <div>
                  <div class="text-xs text-gray-500">供电电压</div>
                  <div class="font-medium">{{ selectedDeviceInfo.voltage }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Thermometer class="w-4 h-4 text-orange-500" />
                <div>
                  <div class="text-xs text-gray-500">设备温度</div>
                  <div class="font-medium">{{ selectedDeviceInfo.temp }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <MapPin class="w-4 h-4 text-green-500" />
                <div>
                  <div class="text-xs text-gray-500">位置</div>
                  <div class="font-medium">{{ selectedDeviceInfo.location }}</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 系统拓扑图占位 -->
          <div class="flex-1 bg-gray-100 rounded-lg flex items-center justify-center min-h-[200px]">
            <div class="text-center text-gray-500">
              <Radio class="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p class="text-sm font-medium">系统拓扑视图</p>
              <p class="text-xs mt-1">选择左侧设备查看详情</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #right>
      <MonitorPanel />
      
      <!-- 告警历史 -->
      <Card class="flex-1 overflow-hidden flex flex-col">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle class="w-4 h-4" />
            告警历史
          </span>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto p-0">
          <div class="divide-y">
            <div 
              v-for="alarm in alarmHistory"
              :key="alarm.id"
              :class="['px-3 py-2', getAlarmClass(alarm.level)]"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium">{{ alarm.device }}</span>
                <span class="text-xs opacity-70">{{ alarm.time }}</span>
              </div>
              <div class="text-xs mt-1">{{ alarm.message }}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>
</template>
