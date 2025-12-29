<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import MonitorPanel from '@/components/panels/MonitorPanel.vue'
import PerformanceChart from '@/components/charts/PerformanceChart.vue'
import MonitoringMap from '@/components/map/MonitoringMap.vue'
import { Activity, AlertTriangle, CheckCircle, XCircle, Zap, Thermometer, Radio, MapPin } from 'lucide-vue-next'
import { mockAlarmHistory } from '@/data/mockData'
import { useConnectorStore } from '@/stores'

const connectorStore = useConnectorStore()

// 地图组件引用
const monitoringMapRef = ref<InstanceType<typeof MonitoringMap> | null>(null)

// 模拟运行时监控数据
const runtimeData: Record<string, any> = {
  'elem-0': { inputPower: -12.5, outputPower: 2.8, pumpCurrent: 285, pfeVoltage: 48.2, pfeCurrent: 1.25, temperature: 4.2, status: 'normal' },
  'elem-1': { inputPower: -13.2, outputPower: 2.5, pumpCurrent: 295, pfeVoltage: 47.8, pfeCurrent: 1.28, temperature: 5.1, status: 'warning' },
  'elem-2': { inputPower: -12.8, outputPower: 2.6, pumpCurrent: 280, pfeVoltage: 48.1, pfeCurrent: 1.22, temperature: 4.0, status: 'normal' },
  'elem-3': { inputPower: -10.5, outputPower: -11.2, pumpCurrent: 0, pfeVoltage: 48.0, pfeCurrent: 0.85, temperature: 3.8, status: 'normal' },
  'elem-4': { inputPower: 0, outputPower: 0, pumpCurrent: 0, pfeVoltage: 380, pfeCurrent: 25.5, temperature: 35.2, status: 'normal' },
  'elem-5': { inputPower: 0, outputPower: 0, pumpCurrent: 0, pfeVoltage: 380, pfeCurrent: 24.8, temperature: 34.5, status: 'normal' },
}

// 设备列表数据 - 合并 connectorStore 位置数据和运行时监控数据
const devices = computed(() =>
  connectorStore.elements.map(elem => {
    const runtime = runtimeData[elem.id] || { status: 'normal', inputPower: 0, outputPower: 0, temperature: 20 }
    return {
      ...elem,
      neType: elem.type,
      location: `KP ${elem.kp}`,
      ...runtime
    }
  })
)

// 性能历史数据（模拟）
const performanceHistory = ref<{ time: string; value: number }[]>([])
const temperatureHistory = ref<{ time: string; value: number }[]>([])

// 生成模拟历史数据
const generateHistoryData = () => {
  const now = new Date()
  const data: { time: string; value: number }[] = []
  const tempData: { time: string; value: number }[] = []

  for (let i = 29; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000)
    const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    data.push({ time: timeStr, value: -10 + Math.random() * 4 - 2 })
    tempData.push({ time: timeStr, value: 3.5 + Math.random() * 1.5 })
  }

  performanceHistory.value = data
  temperatureHistory.value = tempData
}

// 性能曲线图数据
const powerChartSeries = computed(() => [{
  name: '输出光功率',
  data: performanceHistory.value,
  color: '#3b82f6',
  unit: 'dBm'
}])

const tempChartSeries = computed(() => [{
  name: '设备温度',
  data: temperatureHistory.value,
  color: '#f97316',
  unit: '°C'
}])

// 自动刷新性能数据
let refreshTimer: ReturnType<typeof setInterval> | null = null

const refreshPerformanceData = () => {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  // 添加新数据点
  performanceHistory.value.push({ time: timeStr, value: -10 + Math.random() * 4 - 2 })
  temperatureHistory.value.push({ time: timeStr, value: 3.5 + Math.random() * 1.5 })

  // 保持最近30个点
  if (performanceHistory.value.length > 30) performanceHistory.value.shift()
  if (temperatureHistory.value.length > 30) temperatureHistory.value.shift()
}

onMounted(() => {
  generateHistoryData()
  refreshTimer = setInterval(refreshPerformanceData, 10000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// 选中的设备
const selectedDevice = ref<string | null>(null)

// 告警历史 - 从集中数据文件导入
const alarmHistory = ref([...mockAlarmHistory])

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
    default: return 'bg-primary/5 border-l-4 border-primary text-primary'
  }
}

const selectDevice = (id: string) => {
  selectedDevice.value = selectedDevice.value === id ? null : id
  // 选中设备时跳转到地图对应位置
  if (selectedDevice.value && monitoringMapRef.value) {
    monitoringMapRef.value.flyToDevice(selectedDevice.value)
  }
}

// 地图上点击设备的处理
const handleMapDeviceClick = (deviceId: string) => {
  selectedDevice.value = deviceId
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
            <div v-for="device in devices" :key="device.id" :class="[
              'p-3 cursor-pointer transition-colors',
              selectedDevice === device.id ? 'bg-primary/5' : 'hover:bg-gray-50'
            ]" @click="selectDevice(device.id)">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <component :is="getStatusIcon(device.status)" :class="[
                    'w-4 h-4',
                    device.status === 'normal' ? 'text-green-500' :
                      device.status === 'warning' ? 'text-yellow-500' : 'text-red-500'
                  ]" />
                  <span class="text-sm font-medium">{{ device.name }}</span>
                </div>
                <span :class="['text-xs px-2 py-0.5 rounded border', getStatusClass(device.status)]">
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
              <span :class="['text-xs px-2 py-1 rounded border', getStatusClass(selectedDeviceInfo.status)]">
                {{ selectedDeviceInfo.status === 'normal' ? '运行正常' : selectedDeviceInfo.status === 'warning' ? '告警中' :
                '故障' }}
              </span>
            </div>
            <!-- 基础性能指标 -->
            <div class="grid grid-cols-4 gap-3 mb-3">
              <div class="p-2 bg-white rounded border">
                <div class="text-xs text-gray-500">输入光功率</div>
                <div class="font-semibold text-blue-600">{{ selectedDeviceInfo.inputPower?.toFixed(1) }} dBm</div>
              </div>
              <div class="p-2 bg-white rounded border">
                <div class="text-xs text-gray-500">输出光功率</div>
                <div class="font-semibold text-blue-600">{{ selectedDeviceInfo.outputPower?.toFixed(1) }} dBm</div>
              </div>
              <div class="p-2 bg-white rounded border">
                <div class="text-xs text-gray-500">泵浦电流</div>
                <div class="font-semibold text-purple-600">{{ selectedDeviceInfo.pumpCurrent }} mA</div>
              </div>
              <div class="p-2 bg-white rounded border">
                <div class="text-xs text-gray-500">设备温度</div>
                <div class="font-semibold text-orange-600">{{ selectedDeviceInfo.temperature?.toFixed(1) }} °C</div>
              </div>
            </div>

            <!-- PFE电压电流 -->
            <div class="grid grid-cols-3 gap-3 mb-3">
              <div class="p-2 bg-white rounded border">
                <div class="text-xs text-gray-500">PFE电压</div>
                <div class="font-semibold text-green-600">{{ selectedDeviceInfo.pfeVoltage?.toFixed(1) }} V</div>
              </div>
              <div class="p-2 bg-white rounded border">
                <div class="text-xs text-gray-500">PFE电流</div>
                <div class="font-semibold text-green-600">{{ selectedDeviceInfo.pfeCurrent?.toFixed(2) }} A</div>
              </div>
              <div class="p-2 bg-white rounded border">
                <div class="text-xs text-gray-500">位置</div>
                <div class="font-semibold text-gray-700">{{ selectedDeviceInfo.location }}</div>
              </div>
            </div>

            <!-- SLTE特有指标 (Q值/BER/OSNR) -->
            <div v-if="selectedDeviceInfo.neType === 'SLTE'" class="grid grid-cols-3 gap-3">
              <div class="p-2 bg-blue-50 rounded border border-blue-200">
                <div class="text-xs text-blue-600">Q值</div>
                <div class="font-semibold text-blue-700">{{ selectedDeviceInfo.qValue?.toFixed(1) }} dB</div>
              </div>
              <div class="p-2 bg-blue-50 rounded border border-blue-200">
                <div class="text-xs text-blue-600">BER</div>
                <div class="font-semibold text-blue-700">{{ selectedDeviceInfo.ber?.toExponential(1) }}</div>
              </div>
              <div class="p-2 bg-blue-50 rounded border border-blue-200">
                <div class="text-xs text-blue-600">OSNR</div>
                <div class="font-semibold text-blue-700">{{ selectedDeviceInfo.osnr?.toFixed(1) }} dB</div>
              </div>
            </div>
          </div>

          <!-- 地图视图 -->
          <div class="flex-1 bg-gray-100 rounded-lg min-h-[300px] overflow-hidden">
            <MonitoringMap ref="monitoringMapRef" :devices="devices" :selected-device-id="selectedDevice"
              @device-click="handleMapDeviceClick" />
          </div>
        </CardContent>
      </Card>
    </template>

    <template #right>
      <MonitorPanel />

      <!-- 性能趋势曲线 -->
      <div class="space-y-3">
        <PerformanceChart title="输出光功率趋势" :series="powerChartSeries" :height="150" @refresh="generateHistoryData" />
        <PerformanceChart title="设备温度趋势" :series="tempChartSeries" :height="150" @refresh="generateHistoryData" />
      </div>

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
            <div v-for="alarm in alarmHistory" :key="alarm.id" :class="['px-3 py-2', getAlarmClass(alarm.level)]">
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
