<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import MonitorPanel from '@/components/panels/MonitorPanel.vue'
import PerformanceChart from '@/components/charts/PerformanceChart.vue'
import MonitoringMap from '@/components/map/MonitoringMap.vue'
import { Activity, AlertTriangle, CheckCircle, XCircle, Zap, Thermometer, Radio, MapPin, ChevronRight, Filter, TrendingDown, TrendingUp, Minus, Link2 } from 'lucide-vue-next'
import { useConnectorStore, useMonitorStore, useRouteStore } from '@/stores'

const connectorStore = useConnectorStore()
const monitorStore = useMonitorStore()
const routeStore = useRouteStore()

// 筛选条件
const filterByType = ref(false)
const filterByHealth = ref(false)
const selectedTypes = ref<string[]>([])
const selectedHealthStatus = ref<string[]>([])
const viewMode = ref<'type' | 'link' | 'all'>('type')

// 展开状态管理
const expandedGroups = ref<Set<string>>(new Set())
const expandedDevices = ref<Set<string>>(new Set())

// 链路选择
const selectedLink = ref<string>('')
const availableLinks = computed(() => {
  const links = new Set<string>()
  devices.value.forEach(d => {
    if (d.location) links.add(d.location.split(' ')[0] || '默认链路')
  })
  return ['全部链路', ...Array.from(links)]
})

// 地图组件引用
const monitoringMapRef = ref<InstanceType<typeof MonitoringMap> | null>(null)

// 设备列表数据 - 从 monitorStore 动态获取
const devices = computed(() => 
  monitorStore.devices.map(d => ({
    ...d,
    neType: d.type,
    location: `KP ${d.kp}`,
    health: d.status === 'normal' ? 95 + Math.random() * 5 : d.status === 'warning' ? 60 + Math.random() * 20 : 20 + Math.random() * 30,
  }))
)

// 筛选后的设备列表
const filteredDevices = computed(() => {
  let result = devices.value
  
  if (filterByType.value && selectedTypes.value.length > 0) {
    result = result.filter(d => selectedTypes.value.includes(d.type))
  }
  
  if (filterByHealth.value && selectedHealthStatus.value.length > 0) {
    result = result.filter(d => selectedHealthStatus.value.includes(d.status))
  }
  
  if (selectedLink.value && selectedLink.value !== '全部链路') {
    result = result.filter(d => d.location.startsWith(selectedLink.value))
  }
  
  return result
})

// 按类型分组的设备
const devicesByType = computed(() => {
  const groups: Record<string, typeof devices.value> = {}
  filteredDevices.value.forEach(d => {
    const type = d.type || '未分类'
    if (!groups[type]) groups[type] = []
    groups[type].push(d)
  })
  return groups
})

// 设备类型列表
const deviceTypes = computed(() => {
  const types = new Set<string>()
  devices.value.forEach(d => types.add(d.type))
  return Array.from(types)
})

// 整体健康度计算
const overallHealth = computed(() => {
  if (devices.value.length === 0) return 0
  const total = devices.value.reduce((sum, d) => sum + (d.health || 0), 0)
  return total / devices.value.length
})

// 健康度趋势（模拟24小时前的数据）
const healthTrend = computed(() => {
  const previous = overallHealth.value + (Math.random() - 0.5) * 10
  return overallHealth.value - previous
})

// 是否有数据
const hasData = computed(() => monitorStore.devices.length > 0)

// 性能历史数据 - 基于选中设备的实时数据生成
const performanceHistory = ref<{ time: string; value: number }[]>([])
const temperatureHistory = ref<{ time: string; value: number }[]>([])

// 根据选中设备生成历史数据
const generateHistoryData = () => {
  if (!hasData.value) {
    performanceHistory.value = []
    temperatureHistory.value = []
    return
  }
  
  const device = selectedDevice.value 
    ? devices.value.find(d => d.id === selectedDevice.value)
    : devices.value[0]
  
  if (!device) {
    performanceHistory.value = []
    temperatureHistory.value = []
    return
  }
  
  const now = new Date()
  const baseOutputPower = device.outputPower || -10
  const baseTemperature = device.temperature || 4
  
  const data: { time: string; value: number }[] = []
  const tempData: { time: string; value: number }[] = []

  for (let i = 29; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000)
    const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    data.push({ time: timeStr, value: baseOutputPower + (Math.random() - 0.5) * 2 })
    tempData.push({ time: timeStr, value: baseTemperature + (Math.random() - 0.5) * 1 })
  }

  performanceHistory.value = data
  temperatureHistory.value = tempData
}

// 性能曲线图数据 - 无数据时返回空
const powerChartSeries = computed(() => {
  if (!hasData.value || performanceHistory.value.length === 0) return []
  return [{
    name: '输出光功率',
    data: performanceHistory.value,
    color: '#3b82f6',
    unit: 'dBm'
  }]
})

const tempChartSeries = computed(() => {
  if (!hasData.value || temperatureHistory.value.length === 0) return []
  return [{
    name: '设备温度',
    data: temperatureHistory.value,
    color: '#f97316',
    unit: '°C'
  }]
})

// 自动刷新性能数据
let refreshTimer: ReturnType<typeof setInterval> | null = null

const refreshPerformanceData = () => {
  if (!hasData.value) return
  
  const device = selectedDevice.value 
    ? devices.value.find(d => d.id === selectedDevice.value)
    : devices.value[0]
  
  if (!device) return
  
  const now = new Date()
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const baseOutputPower = device.outputPower || -10
  const baseTemperature = device.temperature || 4

  performanceHistory.value.push({ time: timeStr, value: baseOutputPower + (Math.random() - 0.5) * 2 })
  temperatureHistory.value.push({ time: timeStr, value: baseTemperature + (Math.random() - 0.5) * 1 })

  if (performanceHistory.value.length > 30) performanceHistory.value.shift()
  if (temperatureHistory.value.length > 30) temperatureHistory.value.shift()
}

onMounted(() => {
  if (hasData.value) {
    generateHistoryData()
    refreshTimer = setInterval(refreshPerformanceData, 10000)
  }
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

// 选中的设备
const selectedDevice = ref<string | null>(null)

// 告警历史 - 从 monitorStore 动态获取
const alarmHistory = computed(() => monitorStore.alarmHistory)

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
  if (selectedDevice.value && monitoringMapRef.value) {
    monitoringMapRef.value.flyToDevice(selectedDevice.value)
  }
}

// 地图上点击设备的处理
const handleMapDeviceClick = (deviceId: string) => {
  selectedDevice.value = deviceId
}

// 切换分组展开状态
const toggleGroup = (groupKey: string) => {
  if (expandedGroups.value.has(groupKey)) {
    expandedGroups.value.delete(groupKey)
  } else {
    expandedGroups.value.add(groupKey)
  }
}

// 切换设备展开状态
const toggleDeviceExpand = (deviceId: string) => {
  if (expandedDevices.value.has(deviceId)) {
    expandedDevices.value.delete(deviceId)
  } else {
    expandedDevices.value.add(deviceId)
  }
}

// 获取健康度颜色
const getHealthColor = (health: number) => {
  if (health >= 80) return 'text-green-600'
  if (health >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

// 获取健康度进度条颜色
const getHealthBarColor = (health: number) => {
  if (health >= 80) return 'bg-green-500'
  if (health >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

// 获取分组统计
const getGroupStats = (devices: typeof filteredDevices.value) => {
  return {
    normal: devices.filter(d => d.status === 'normal').length,
    warning: devices.filter(d => d.status === 'warning').length,
    error: devices.filter(d => d.status === 'error').length,
  }
}

// 获取分组平均健康度
const getGroupHealth = (devices: typeof filteredDevices.value) => {
  if (devices.length === 0) return 0
  return devices.reduce((sum, d) => sum + (d.health || 0), 0) / devices.length
}

// 性能参数图表弹窗
const showChartModal = ref(false)
const chartModalParam = ref<{ name: string; unit: string; value: number | string } | null>(null)
const chartModalData = ref<{ time: string; value: number }[]>([])

// 打开性能参数图表
const openChartModal = (name: string, unit: string, value: number | string) => {
  chartModalParam.value = { name, unit, value }
  
  // 生成模拟历史数据
  const now = new Date()
  const data: { time: string; value: number }[] = []
  const baseValue = typeof value === 'number' ? value : parseFloat(String(value)) || 15
  
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600000)
    const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    data.push({ 
      time: timeStr, 
      value: baseValue + (Math.random() - 0.5) * baseValue * 0.1 
    })
  }
  
  chartModalData.value = data
  showChartModal.value = true
}

// 关闭图表弹窗
const closeChartModal = () => {
  showChartModal.value = false
  chartModalParam.value = null
}

// 图表数据
const chartSeries = computed(() => {
  if (!chartModalParam.value || chartModalData.value.length === 0) return []
  return [{
    name: chartModalParam.value.name,
    data: chartModalData.value,
    color: '#3b82f6',
    unit: chartModalParam.value.unit
  }]
})
</script>

<template>
  <MainLayout>
    <template #left>
      <!-- 系统设备健康总览 -->
      <Card class="shrink-0">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <Activity class="w-4 h-4" />
            系统设备健康总览
          </span>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 整体健康度趋势 -->
          <div v-if="hasData">
            <div class="text-xs text-gray-500 mb-1">整体健康度趋势</div>
            <div class="flex items-baseline gap-2">
              <span :class="['text-2xl font-bold', getHealthColor(overallHealth)]">
                {{ overallHealth.toFixed(1) }}%
              </span>
              <span v-if="healthTrend > 0" class="text-green-500 text-sm flex items-center">
                <TrendingUp class="w-3 h-3 mr-0.5" />+{{ healthTrend.toFixed(1) }}%
              </span>
              <span v-else-if="healthTrend < 0" class="text-red-500 text-sm flex items-center">
                <TrendingDown class="w-3 h-3 mr-0.5" />{{ healthTrend.toFixed(1) }}%
              </span>
              <span v-else class="text-gray-400 text-sm flex items-center">
                <Minus class="w-3 h-3 mr-0.5" />0%
              </span>
            </div>
            <div class="text-xs text-gray-400 mb-2">24小时: {{ (overallHealth + 2.5).toFixed(1) }}%</div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div :class="['h-full transition-all', getHealthBarColor(overallHealth)]" 
                   :style="{ width: overallHealth + '%' }"></div>
            </div>
          </div>
          <div v-else class="text-center text-gray-400 py-4 text-sm">
            暂无数据
          </div>

          <!-- 状态卡片 -->
          <div class="grid grid-cols-4 gap-2">
            <div class="p-2 bg-gray-50 rounded text-center border-2 border-blue-200">
              <div class="text-xs text-gray-500">总数</div>
              <div class="text-lg font-bold text-blue-600">{{ stats.total }}</div>
            </div>
            <div class="p-2 bg-green-50 rounded text-center border-2 border-green-200">
              <div class="text-xs text-green-600">正常</div>
              <div class="text-lg font-bold text-green-600">{{ stats.normal }}</div>
            </div>
            <div class="p-2 bg-yellow-50 rounded text-center border-2 border-yellow-200">
              <div class="text-xs text-yellow-600">告警</div>
              <div class="text-lg font-bold text-yellow-600">{{ stats.warning }}</div>
            </div>
            <div class="p-2 bg-red-50 rounded text-center border-2 border-red-200">
              <div class="text-xs text-red-600">故障</div>
              <div class="text-lg font-bold text-red-600">{{ stats.error }}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 筛选选项 -->
      <Card class="shrink-0">
        <CardContent class="py-3 space-y-3">
          <!-- 按设备类型筛选 -->
          <div>
            <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
              <input type="checkbox" v-model="filterByType" class="rounded" />
              <Filter class="w-3 h-3" />
              按设备类型筛选
            </label>
            <div v-if="filterByType" class="ml-5 mt-2 space-y-1">
              <label v-for="type in deviceTypes" :key="type" class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" :value="type" v-model="selectedTypes" class="rounded" />
                {{ type }}
              </label>
            </div>
          </div>
          
          <!-- 按健康度筛选 -->
          <div>
            <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
              <input type="checkbox" v-model="filterByHealth" class="rounded" />
              <Filter class="w-3 h-3" />
              按健康度筛选
            </label>
            <div v-if="filterByHealth" class="ml-5 mt-2 space-y-1">
              <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" value="normal" v-model="selectedHealthStatus" class="rounded" />
                <span class="w-2 h-2 bg-green-500 rounded-full"></span>正常
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" value="warning" v-model="selectedHealthStatus" class="rounded" />
                <span class="w-2 h-2 bg-yellow-500 rounded-full"></span>告警
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" value="error" v-model="selectedHealthStatus" class="rounded" />
                <span class="w-2 h-2 bg-red-500 rounded-full"></span>故障
              </label>
            </div>
          </div>

          <!-- 查看方式 -->
          <div>
            <div class="text-xs text-gray-500 mb-1">查看方式</div>
            <select v-model="viewMode" class="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white">
              <option value="type">按设备类型</option>
              <option value="link">按链路划分</option>
              <option value="all">所有设备列表</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <!-- 设备列表 - 树形结构 -->
      <Card class="flex-1 overflow-hidden flex flex-col">
        <CardHeader>
          <span class="font-semibold text-sm">设备列表</span>
          <span class="text-xs text-gray-400">({{ filteredDevices.length }})</span>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto p-0">
          <!-- 按类型分组视图 -->
          <template v-if="viewMode === 'type'">
            <div v-for="(groupDevices, type) in devicesByType" :key="type" class="border-b last:border-b-0">
              <!-- 分组头部 -->
              <div class="px-3 py-2 bg-gray-50 cursor-pointer flex items-center justify-between" 
                   @click="toggleGroup(type)">
                <div class="flex items-center gap-2">
                  <ChevronRight :class="['w-4 h-4 transition-transform', expandedGroups.has(type) && 'rotate-90']" />
                  <span class="text-sm font-medium">{{ type }} ({{ groupDevices.length }}台)</span>
                </div>
                <div class="text-xs text-gray-500">
                  <span class="text-green-600">正常:{{ getGroupStats(groupDevices).normal }}</span>
                  <span v-if="getGroupStats(groupDevices).warning" class="ml-1 text-yellow-600">告警:{{ getGroupStats(groupDevices).warning }}</span>
                  <span v-if="getGroupStats(groupDevices).error" class="ml-1 text-red-600">故障:{{ getGroupStats(groupDevices).error }}</span>
                </div>
              </div>
              
              <!-- 分组内容 -->
              <div v-if="expandedGroups.has(type)" class="divide-y">
                <div v-for="device in groupDevices" :key="device.id" 
                     :class="['px-3 py-2 cursor-pointer transition-colors', selectedDevice === device.id ? 'bg-blue-50' : 'hover:bg-gray-50']">
                  <div class="flex items-center justify-between" @click="selectDevice(device.id)">
                    <div class="flex items-center gap-2">
                      <span :class="['w-2 h-2 rounded-full', device.status === 'normal' ? 'bg-green-500' : device.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500']"></span>
                      <span class="text-sm">{{ device.name }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span :class="['text-sm font-medium', getHealthColor(device.health)]">{{ device.health?.toFixed(0) }}%</span>
                    </div>
                  </div>
                  <div class="mt-1 ml-4 text-xs text-gray-400 flex items-center gap-1">
                    <MapPin class="w-3 h-3" />{{ device.location }}
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 所有设备列表视图 -->
          <template v-else>
            <div class="divide-y">
              <div v-for="device in filteredDevices" :key="device.id" :class="[
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
                  <div class="flex items-center gap-2">
                    <span :class="['text-sm font-medium', getHealthColor(device.health)]">{{ device.health?.toFixed(0) }}%</span>
                    <span :class="['text-xs px-2 py-0.5 rounded border', getStatusClass(device.status)]">
                      {{ device.status === 'normal' ? '正常' : device.status === 'warning' ? '告警' : '故障' }}
                    </span>
                  </div>
                </div>
                <div class="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <MapPin class="w-3 h-3" />
                  {{ device.location }}
                </div>
              </div>
            </div>
          </template>
        </CardContent>
      </Card>
    </template>

    <template #center>
      <!-- 监控主视图 - 只显示地图，设备详情通过气泡框展示 -->
      <Card class="flex-1 flex flex-col overflow-hidden">
        <CardHeader>
          <span class="font-semibold text-sm">实时监控</span>
        </CardHeader>
        <CardContent class="flex-1 p-2">
          <!-- 地图视图 -->
          <div class="w-full h-full bg-gray-100 rounded-lg overflow-hidden">
            <MonitoringMap ref="monitoringMapRef" :devices="devices" :selected-device-id="selectedDevice"
              @device-click="handleMapDeviceClick" />
          </div>
        </CardContent>
      </Card>
    </template>

    <template #right>
      <!-- 链路状态 -->
      <Card class="shrink-0">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <Link2 class="w-4 h-4" />
            链路状态
          </span>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 链路选择 -->
          <div>
            <div class="text-xs text-gray-500 mb-1">选择链路</div>
            <select v-model="selectedLink" class="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-gray-50">
              <option v-for="link in availableLinks" :key="link" :value="link">{{ link }}</option>
            </select>
          </div>
          
          <!-- 链路性能参数 -->
          <div v-if="hasData">
            <div class="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
              <Zap class="w-3 h-3" />链路性能参数
            </div>
            <div class="space-y-1">
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                   @click="openChartModal('OSNR', 'dB', 18.5)">
                <span class="text-xs text-gray-500">OSNR:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">18.5 dB</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                   @click="openChartModal('GSNR', 'dB', 15.2)">
                <span class="text-xs text-gray-500">GSNR:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">15.2 dB</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                   @click="openChartModal('BER', '', 1.2e-12)">
                <span class="text-xs text-gray-500">BER:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">1.2e-12</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                   @click="openChartModal('Q因子', 'dB', 8.2)">
                <span class="text-xs text-gray-500">Q因子:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">8.2 dB</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span class="text-xs text-gray-500">总长度:</span>
                <span class="text-xs font-medium text-gray-700">275 km</span>
              </div>
              <div class="flex items-center justify-between py-1.5">
                <span class="text-xs text-gray-500">光纤类型:</span>
                <span class="text-xs font-medium text-gray-700">G.654.E</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 链路设备健康度 -->
      <Card class="flex-1 overflow-hidden flex flex-col">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <Activity class="w-4 h-4" />
            链路设备健康度
          </span>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto space-y-3">
          <template v-if="hasData">
            <!-- 按类型分组的设备健康度 -->
            <div v-for="(groupDevices, type) in devicesByType" :key="type" class="space-y-2">
              <!-- 分组标题 -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-700">{{ type }}</span>
                  <span class="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">{{ groupDevices.length }}台</span>
                </div>
                <span class="text-xs text-gray-400">平均: {{ getGroupHealth(groupDevices).toFixed(0) }}%</span>
              </div>
              
              <!-- 设备卡片 -->
              <div v-for="device in groupDevices" :key="device.id" 
                   class="p-3 bg-gray-50 border rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                   @click="selectDevice(device.id)">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span :class="['text-xs', device.status === 'normal' ? 'text-green-500' : device.status === 'warning' ? 'text-yellow-500' : 'text-red-500']">
                      {{ device.status === 'normal' ? '●' : '▲' }}
                    </span>
                    <span class="text-sm font-medium text-gray-800">{{ device.name }}</span>
                  </div>
                  <span :class="['text-sm font-bold', getHealthColor(device.health)]">{{ device.health?.toFixed(0) }}%</span>
                </div>
                <!-- 健康度进度条 -->
                <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <div :class="['h-full transition-all', getHealthBarColor(device.health)]" 
                       :style="{ width: device.health + '%' }"></div>
                </div>
                <!-- 设备参数 -->
                <div class="grid grid-cols-2 gap-x-4 text-xs text-gray-500">
                  <div>深度: {{ device.depth?.toFixed(0) || 0 }}m</div>
                  <div>温度: {{ device.temperature?.toFixed(1) || '--' }}°C</div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="h-full flex items-center justify-center text-gray-400 text-sm">
            暂无设备数据
          </div>
        </CardContent>
      </Card>

      <!-- 告警历史 -->
      <Card class="shrink-0 max-h-48 overflow-hidden flex flex-col">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle class="w-4 h-4" />
            告警历史
          </span>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto p-0">
          <div v-if="alarmHistory.length === 0" class="h-full flex items-center justify-center text-gray-400 text-sm py-4">
            暂无告警记录
          </div>
          <div v-else class="divide-y">
            <div v-for="alarm in alarmHistory.slice(0, 5)" :key="alarm.id" :class="['px-3 py-2', getAlarmClass(alarm.level)]">
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

  <!-- 性能参数图表弹窗 -->
  <Teleport to="body">
    <div v-if="showChartModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- 遮罩层 -->
      <div class="absolute inset-0 bg-black/50" @click="closeChartModal"></div>
      
      <!-- 弹窗内容 -->
      <div class="relative bg-white rounded-xl shadow-2xl w-[800px] max-w-[90vw] max-h-[80vh] overflow-hidden">
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-800">{{ chartModalParam?.name }} 性能参数图表</h3>
            <p class="text-sm text-gray-500">参数变化趋势分析</p>
          </div>
          <button @click="closeChartModal" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        
        <!-- 内容 -->
        <div class="p-6">
          <!-- 当前值显示 -->
          <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="flex items-center justify-between">
              <span class="text-sm text-blue-700">当前值</span>
              <span class="text-2xl font-bold text-blue-600">
                {{ chartModalParam?.value }} {{ chartModalParam?.unit }}
              </span>
            </div>
          </div>
          
          <!-- 图表区域 -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-50 p-4 rounded-lg border">
              <div class="text-sm font-medium text-gray-700 mb-3 text-center">沿距离变化</div>
              <PerformanceChart 
                :title="''" 
                :series="chartSeries" 
                :height="200"
              />
            </div>
            <div class="bg-gray-50 p-4 rounded-lg border">
              <div class="text-sm font-medium text-gray-700 mb-3 text-center">随时间变化</div>
              <PerformanceChart 
                :title="''" 
                :series="chartSeries" 
                :height="200"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
