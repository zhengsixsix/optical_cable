<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useMonitorStore } from '@/stores/monitor'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button, Select } from '@/shared/components/base'
import MonitorPanel from '@/modules/monitoring/panels/MonitorPanel.vue'
import PerformanceChart from '@/components/charts/PerformanceChart.vue'
import MonitoringMap from '@/modules/monitoring/components/MonitoringMap.vue'
import TrendChart from '@/modules/monitoring/components/TrendChart.vue'
import FaultLocationPanel from '@/modules/monitoring/panels/FaultLocationPanel.vue'
import MaintenancePanel from '@/modules/monitoring/panels/MaintenancePanel.vue'
import { Activity, AlertTriangle, CheckCircle, XCircle, Zap, Thermometer, Radio, MapPin, ChevronRight, ChevronDown, Filter, TrendingDown, TrendingUp, Minus, Link2, Download, Trash2, Search, Crosshair, ClipboardList, TrendingUp as TrendIcon } from 'lucide-vue-next'
import type { LogCategory } from '@/types'
import { useConnectorStore } from '@/stores/connector'
import { useRPLStore } from '@/stores/rpl'

const connectorStore = useConnectorStore()
const monitorStore = useMonitorStore()
const routeStore = useRouteStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const rplStore = useRPLStore()

// ★ 从仿真缓存派生链路性能指标（替代硬编码）
const linkMetrics = computed(() => {
  const cache = settingsStore.linkCalcSummaryCache
  if (!cache?.metrics) return null
  return cache.metrics
})
const linkMargin = computed(() => settingsStore.linkCalcSummaryCache?.margin || null)
const linkTotalLength = computed(() => {
  // 优先 RPL 元数据，其次 routeStore
  return rplStore.currentTable?.metadata?.totalLength || routeStore.selectedRoute?.totalLength || 0
})
const linkFiberType = computed(() => {
  // 从 settingsStore 的光纤类型中取第一个
  const ft = settingsStore.fiberTypes?.[0]
  return ft?.name || 'G.654.E'
})

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
    health: deriveDeviceHealth(d.status),
  }))
)

// 根据设备状态和仿真结果派生健康度（替代 Math.random）
function deriveDeviceHealth(status: string): number {
  const margin = linkMargin.value
  // 基础分：仿真裕量越大，健康度越高
  let base = 85
  if (margin) {
    // avgMargin 通常 0~10 dB，映射到 70~100
    base = Math.min(100, 70 + margin.avgMargin * 3)
    if (!margin.meetsRequirement) base = Math.min(base, 60)
  }
  // 根据设备状态进一步调整
  if (status === 'normal') return Math.min(100, base + 5)
  if (status === 'warning') return Math.max(40, base - 20)
  return Math.max(10, base - 50) // error/fault
}

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

// === 日志面板状态 ===
const logFilterLevel = ref<string>('全部')
const logFilterCategory = ref<string>('全部')
const logFilterTime = ref<string>('全部')
const logSearchKeyword = ref('')
const logAlarmFolded = ref(false)

const logCategories: string[] = ['全部', '系统日志', '链路日志', '设备日志', '模块日志', '操作日志', '告警日志']
const logLevels: string[] = ['全部', 'INFO', 'WARN', 'ERROR']
const logTimeOptions: string[] = ['全部', '近 1 小时', '近 6 小时', '近 24 小时']

// 筛选后的日志
const filteredLogs = computed(() => {
  let result = appStore.recentLogs.slice().reverse()
  if (logFilterLevel.value !== '全部') {
    result = result.filter(l => l.level === logFilterLevel.value)
  }
  if (logFilterCategory.value !== '全部') {
    result = result.filter(l => (l.category || '系统日志') === logFilterCategory.value)
  }
  if (logSearchKeyword.value.trim()) {
    const kw = logSearchKeyword.value.trim().toLowerCase()
    result = result.filter(l => l.message.toLowerCase().includes(kw))
  }
  return result
})

// 告警日志(只显示 WARN/ERROR)
const alarmLogs = computed(() => {
  return appStore.recentLogs.slice().reverse().filter(l => l.level === 'WARN' || l.level === 'ERROR')
})

// 屏蔽的告警索引
const maskedAlarmIndices = ref<Set<number>>(new Set())
const maskAlarm = (index: number) => maskedAlarmIndices.value.add(index)
const maskAllAlarms = () => alarmLogs.value.forEach((_, i) => maskedAlarmIndices.value.add(i))

// 导出日志
const handleExportLogs = () => appStore.exportLogs('csv')
const handleClearLogs = () => appStore.clearLogs()

// === 性能参数图表弹窗 ===
const showChartModal = ref(false)
const chartModalParam = ref<{ name: string; unit: string; value: number | string } | null>(null)
const chartModalDistanceData = ref<{ time: string; value: number }[]>([])
const chartModalTimeData = ref<{ time: string; value: number }[]>([])

// 图表筛选范围
const distanceRangeStart = ref(0)
const distanceRangeEnd = ref(275)
const timeRangeStart = ref(0)
const timeRangeEnd = ref(24)

// 生成沿距离变化数据
const generateDistanceData = (baseValue: number, distStart: number, distEnd: number) => {
  const data: { time: string; value: number }[] = []
  const totalKm = distEnd - distStart
  const steps = Math.min(20, totalKm)
  for (let i = 0; i <= steps; i++) {
    const km = distStart + (totalKm / steps) * i
    // 模拟沿距离衰减
    const decay = (km / 275) * baseValue * 0.4
    data.push({ time: `${km.toFixed(0)}`, value: baseValue - decay + (Math.random() - 0.5) * 0.5 })
  }
  return data
}

// 生成随时间变化数据
const generateTimeData = (baseValue: number, hourStart: number, hourEnd: number) => {
  const data: { time: string; value: number }[] = []
  const totalHours = hourEnd - hourStart
  const steps = Math.min(24, totalHours)
  for (let i = 0; i <= steps; i++) {
    const hour = hourStart + (totalHours / steps) * i
    // 模拟随时间的轻微波动
    const drift = (hour / 24) * baseValue * 0.2
    data.push({ time: `${hour.toFixed(0)}`, value: baseValue - drift + (Math.random() - 0.5) * 0.3 })
  }
  return data
}

// 打开性能参数图表
const openChartModal = (name: string, unit: string, value: number | string) => {
  chartModalParam.value = { name, unit, value }
  const baseValue = typeof value === 'number' ? value : parseFloat(String(value)) || 15
  
  distanceRangeStart.value = 0
  distanceRangeEnd.value = 275
  timeRangeStart.value = 0
  timeRangeEnd.value = 24
  
  chartModalDistanceData.value = generateDistanceData(baseValue, 0, 275)
  chartModalTimeData.value = generateTimeData(baseValue, 0, 24)
  showChartModal.value = true
}

// 应用距离范围
const applyDistanceRange = () => {
  if (!chartModalParam.value) return
  const baseValue = typeof chartModalParam.value.value === 'number' ? chartModalParam.value.value : parseFloat(String(chartModalParam.value.value)) || 15
  chartModalDistanceData.value = generateDistanceData(baseValue, distanceRangeStart.value, distanceRangeEnd.value)
}

// 应用时间范围
const applyTimeRange = () => {
  if (!chartModalParam.value) return
  const baseValue = typeof chartModalParam.value.value === 'number' ? chartModalParam.value.value : parseFloat(String(chartModalParam.value.value)) || 15
  chartModalTimeData.value = generateTimeData(baseValue, timeRangeStart.value, timeRangeEnd.value)
}

// 关闭图表弹窗
const closeChartModal = () => {
  showChartModal.value = false
  chartModalParam.value = null
}

// 沿距离图表数据
const distanceChartSeries = computed(() => {
  if (!chartModalParam.value || chartModalDistanceData.value.length === 0) return []
  return [{
    name: chartModalParam.value.name,
    data: chartModalDistanceData.value,
    color: '#3b82f6',
    unit: chartModalParam.value.unit
  }]
})

// 随时间图表数据
const timeChartSeries = computed(() => {
  if (!chartModalParam.value || chartModalTimeData.value.length === 0) return []
  return [{
    name: chartModalParam.value.name,
    data: chartModalTimeData.value,
    color: '#3b82f6',
    unit: chartModalParam.value.unit
  }]
})

// === 右侧面板 Tab ===
const rightPanelTab = ref<'link' | 'fault' | 'maintenance'>('link')

// === 中心区域底部 Tab ===
const centerBottomTab = ref<'log' | 'trend'>('log')

// === 链路设备子设备层级 ===
// 展开的子设备节点
const expandedSubDevices = ref<Set<string>>(new Set())
const toggleSubDevice = (key: string) => {
  if (expandedSubDevices.value.has(key)) {
    expandedSubDevices.value.delete(key)
  } else {
    expandedSubDevices.value.add(key)
  }
}

// 模拟子设备/模块数据
const getSubDevices = (device: any) => {
  // 根据设备类型生成模拟子设备
  const baseHealth = device.health || 90
  if (device.type === 'landing' || device.type === 'LandingStation') {
    return [
      { id: `${device.id}-dev1`, name: '设备1', health: Math.min(99, baseHealth + 2), status: 'normal' as const },
      { id: `${device.id}-dev2`, name: '设备2', health: Math.max(80, baseHealth - 1), status: 'normal' as const },
    ]
  }
  if (device.type === 'Repeater' || device.type === 'amplifier_e') {
    return [
      { id: `${device.id}-edfa`, name: 'EDFA 模块', health: baseHealth, status: device.status },
    ]
  }
  return []
}
</script>

<template>
  <MainLayout>
    <template #left>
      <!-- 系统设备面板 -->
      <Card class="shrink-0">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <Activity class="w-4 h-4" />
            系统设备
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
            <Select v-model="viewMode" :options="[{ value: 'type', label: '按设备类型' }, { value: 'link', label: '按链路划分' }, { value: 'all', label: '所有设备列表' }]" />
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
      <!-- 海缆系统拓扑显示区域 -->
      <Card class="flex-1 flex flex-col overflow-hidden">
        <CardHeader>
          <span class="font-semibold text-sm">海缆系统拓扑显示</span>
        </CardHeader>
        <CardContent class="flex-1 p-2">
          <!-- 地图视图 -->
          <div class="w-full h-full bg-gray-100 rounded-lg overflow-hidden">
            <MonitoringMap ref="monitoringMapRef" :devices="devices" :selected-device-id="selectedDevice"
              @device-click="handleMapDeviceClick" />
          </div>
        </CardContent>
      </Card>

      <!-- 底部区域 Tab 切换 -->
      <div class="flex border-b shrink-0 bg-white rounded-t-lg">
        <button
          :class="['flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
            centerBottomTab === 'log' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
          @click="centerBottomTab = 'log'">
          <Activity class="w-3.5 h-3.5" /> 系统日志
        </button>
        <button
          :class="['flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
            centerBottomTab === 'trend' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
          @click="centerBottomTab = 'trend'">
          <TrendingUp class="w-3.5 h-3.5" /> 性能趋势
        </button>
      </div>

      <!-- 性能趋势图 -->
      <div v-if="centerBottomTab === 'trend'" class="shrink-0">
        <TrendChart :device-id="selectedDevice" />
      </div>

      <!-- 系统运行日志 -->
      <Card v-if="centerBottomTab === 'log'" class="shrink-0 h-[260px] flex flex-col overflow-hidden">
        <CardHeader class="shrink-0">
          <span class="font-semibold text-sm flex items-center gap-2">
            <Activity class="w-4 h-4" />
            系统运行日志
          </span>
          <div class="flex items-center gap-2">
            <button @click="handleExportLogs" class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <Download class="w-3 h-3" /> 导出
            </button>
            <button @click="handleClearLogs" class="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1">
              <Trash2 class="w-3 h-3" /> 清空
            </button>
          </div>
        </CardHeader>
        <!-- 筛选栏 -->
        <div class="px-3 py-1.5 border-b bg-gray-50 flex items-center gap-2 text-xs shrink-0 flex-wrap">
          <label class="flex items-center gap-1 text-gray-500">级别:
            <select v-model="logFilterLevel" class="border border-gray-300 rounded px-1 py-0.5 text-xs bg-white">
              <option v-for="l in logLevels" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1 text-gray-500">类型:
            <select v-model="logFilterCategory" class="border border-gray-300 rounded px-1 py-0.5 text-xs bg-white">
              <option v-for="c in logCategories" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1 text-gray-500">时间:
            <select v-model="logFilterTime" class="border border-gray-300 rounded px-1 py-0.5 text-xs bg-white">
              <option v-for="t in logTimeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
          <div class="flex items-center gap-1 ml-auto">
            <Search class="w-3 h-3 text-gray-400" />
            <input v-model="logSearchKeyword" type="text" placeholder="关键字搜索..." 
                   class="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-28 bg-white" />
          </div>
        </div>
        <!-- 告警摘要 -->
        <div v-if="alarmLogs.length > 0" class="px-3 py-1.5 border-b bg-orange-50 shrink-0">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-orange-700 flex items-center gap-1">
              <AlertTriangle class="w-3 h-3" /> 告警 ({{ alarmLogs.length }})
            </span>
            <div class="flex items-center gap-2">
              <button @click="logAlarmFolded = !logAlarmFolded" class="text-xs text-gray-500 hover:text-gray-700">{{ logAlarmFolded ? '展开' : '折叠' }}</button>
              <button @click="maskAllAlarms" class="text-xs text-gray-500 hover:text-gray-700">全部屏蔽</button>
            </div>
          </div>
          <div v-if="!logAlarmFolded" class="mt-1 space-y-1">
            <template v-for="(alarm, i) in alarmLogs.slice(0, 5)" :key="i">
              <div v-if="!maskedAlarmIndices.has(i)" 
                   :class="['flex items-center justify-between px-2 py-1 rounded text-xs', alarm.level === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700']">
                <div class="flex items-center gap-2">
                  <span :class="['font-medium px-1 py-0.5 rounded text-[10px]', alarm.level === 'ERROR' ? 'bg-red-200' : 'bg-yellow-200']">{{ alarm.level === 'ERROR' ? '故障' : '预警' }}</span>
                  <span>{{ alarm.message }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button class="text-blue-600 hover:underline">详情</button>
                  <button @click="maskAlarm(i)" class="text-gray-500 hover:text-gray-700">屏蔽</button>
                </div>
              </div>
            </template>
          </div>
        </div>
        <!-- 日志流 -->
        <CardContent class="flex-1 overflow-auto p-0 text-xs">
          <div class="divide-y">
            <div v-for="(log, index) in filteredLogs.slice(0, 50)" :key="index"
                 :class="['px-3 py-1.5 flex items-start gap-2', 
                   log.level === 'ERROR' ? 'bg-red-50' : log.level === 'WARN' ? 'bg-yellow-50' : ''
                 ]">
              <span class="text-gray-400 whitespace-nowrap font-mono">{{ log.time }}</span>
              <span :class="[
                'whitespace-nowrap',
                log.level === 'ERROR' ? 'text-red-600' : 
                log.level === 'WARN' ? 'text-yellow-600' : 
                'text-gray-400'
              ]">●</span>
              <span :class="[
                'font-medium whitespace-nowrap',
                log.level === 'ERROR' ? 'text-red-600' : 
                log.level === 'WARN' ? 'text-yellow-600' : 
                'text-gray-500'
              ]">{{ log.level }}</span>
              <span class="text-gray-400 whitespace-nowrap">│</span>
              <span class="text-gray-500 whitespace-nowrap">{{ log.category || '系统日志' }}</span>
              <span class="text-gray-400 whitespace-nowrap">│</span>
              <span :class="[
                log.level === 'ERROR' ? 'text-red-700' : 
                log.level === 'WARN' ? 'text-yellow-700' : 
                'text-gray-700'
              ]">{{ log.message }}</span>
              <span v-if="log.level === 'WARN' || log.level === 'ERROR'" 
                    class="ml-auto text-blue-500 hover:underline cursor-pointer whitespace-nowrap">详情 →</span>
            </div>
          </div>
          <div v-if="filteredLogs.length === 0" class="h-full flex items-center justify-center text-gray-400 py-4">
            暂无日志记录
          </div>
        </CardContent>
      </Card>
    </template>

    <template #right>
      <!-- 右侧面板 Tab -->
      <div class="flex border-b shrink-0 bg-white rounded-t-lg mb-2">
        <button
          :class="['flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
            rightPanelTab === 'link' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
          @click="rightPanelTab = 'link'">
          <Link2 class="w-3.5 h-3.5" /> 链路
        </button>
        <button
          :class="['flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
            rightPanelTab === 'fault' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
          @click="rightPanelTab = 'fault'">
          <Crosshair class="w-3.5 h-3.5" /> 故障定位
        </button>
        <button
          :class="['flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
            rightPanelTab === 'maintenance' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
          @click="rightPanelTab = 'maintenance'">
          <ClipboardList class="w-3.5 h-3.5" /> 工单
        </button>
      </div>

      <!-- 故障定位面板 -->
      <FaultLocationPanel v-if="rightPanelTab === 'fault'" />

      <!-- 维护工单面板 -->
      <MaintenancePanel v-if="rightPanelTab === 'maintenance'" />

      <!-- 链路状态 (原有内容) -->
      <template v-if="rightPanelTab === 'link'">
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
                   @click="openChartModal('OSNR', 'dB', linkMetrics?.osnr?.avg ?? 18.5)">
                <span class="text-xs text-gray-500">OSNR:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">{{ (linkMetrics?.osnr?.avg ?? 18.5).toFixed(1) }} dB</span>
                  <span class="text-xs" :class="linkMargin?.meetsRequirement !== false ? 'text-green-500' : 'text-red-500'">{{ linkMargin?.meetsRequirement !== false ? '✓' : '✗' }}</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                   @click="openChartModal('GSNR', 'dB', linkMetrics?.gsnr?.avg ?? 15.2)">
                <span class="text-xs text-gray-500">GSNR:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">{{ (linkMetrics?.gsnr?.avg ?? 15.2).toFixed(1) }} dB</span>
                  <span class="text-xs" :class="linkMargin?.meetsRequirement !== false ? 'text-green-500' : 'text-red-500'">{{ linkMargin?.meetsRequirement !== false ? '✓' : '✗' }}</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                   @click="openChartModal('BER', '', linkMetrics ? Math.pow(10, -(linkMetrics.qFactor?.avg ?? 7) * 1.5) : 1.2e-12)">
                <span class="text-xs text-gray-500">BER:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">{{ linkMetrics ? Math.pow(10, -(linkMetrics.qFactor?.avg ?? 7) * 1.5).toExponential(1) : '1.2e-12' }}</span>
                  <span class="text-xs text-green-500">✓</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                   @click="openChartModal('Q因子', 'dB', linkMetrics?.qFactor?.avg ?? 8.2)">
                <span class="text-xs text-gray-500">Q因子:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-green-600">{{ (linkMetrics?.qFactor?.avg ?? 8.2).toFixed(1) }} dB</span>
                  <span class="text-xs text-green-500">✓</span>
                  <span class="text-xs text-blue-500 hover:underline">详情</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span class="text-xs text-gray-500">总长度:</span>
                <span class="text-xs font-medium text-gray-700">{{ linkTotalLength > 0 ? linkTotalLength.toFixed(1) + ' km' : '--' }}</span>
              </div>
              <div class="flex items-center justify-between py-1.5">
                <span class="text-xs text-gray-500">光纤类型:</span>
                <span class="text-xs font-medium text-gray-700">{{ linkFiberType }}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 链路设备信息 -->
      <Card class="flex-1 overflow-hidden flex flex-col">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <ChevronDown class="w-4 h-4" />
            链路设备信息
          </span>
        </CardHeader>
        <CardContent class="flex-1 overflow-auto space-y-2 p-2">
          <template v-if="hasData">
            <!-- 按类型分组的设备信息 -->
            <div v-for="(groupDevices, type) in devicesByType" :key="type" 
                 class="border rounded-lg overflow-hidden">
              <!-- 分组标题 -->
              <div class="px-3 py-2 bg-gray-50 cursor-pointer flex items-center justify-between" 
                   @click="toggleGroup('right-' + type)">
                <div class="flex items-center gap-2">
                  <ChevronRight :class="['w-3.5 h-3.5 transition-transform text-gray-500', expandedGroups.has('right-' + type) && 'rotate-90']" />
                  <span class="text-xs font-bold text-gray-800">{{ type }} ({{ groupDevices.length }}台)</span>
                </div>
              </div>
              <!-- 分组状态概要 -->
              <div v-if="expandedGroups.has('right-' + type)" class="px-3 py-1 text-xs">
                <span v-if="getGroupStats(groupDevices).normal > 0" class="text-green-600">正常: {{ getGroupStats(groupDevices).normal }}</span>
                <span v-if="getGroupStats(groupDevices).warning > 0" class="ml-2 text-yellow-600">告警: {{ getGroupStats(groupDevices).warning }}</span>
                <span v-if="getGroupStats(groupDevices).error > 0" class="ml-2 text-red-600">故障: {{ getGroupStats(groupDevices).error }}</span>
              </div>
              
              <!-- 设备列表 - 树形结构 -->
              <div v-if="expandedGroups.has('right-' + type)" class="px-2 pb-2">
                <div v-for="(device, dIdx) in groupDevices" :key="device.id" class="relative">
                  <!-- 树线 -->
                  <div class="absolute left-3 top-0 bottom-0 border-l border-gray-300" 
                       :class="{ 'border-transparent': dIdx === groupDevices.length - 1 }"></div>
                  
                  <!-- 设备节点 -->
                  <div class="flex items-center py-1.5 pl-6 relative">
                    <!-- 横线 -->
                    <div class="absolute left-3 top-1/2 w-3 border-t border-gray-300"></div>
                    <div class="flex items-center gap-1 cursor-pointer" @click="toggleSubDevice(device.id)">
                      <ChevronRight v-if="getSubDevices(device).length > 0" 
                                    :class="['w-3 h-3 transition-transform text-gray-400', expandedSubDevices.has(device.id) && 'rotate-90']" />
                      <span v-else class="w-3"></span>
                      <span class="text-xs text-gray-800">{{ device.name }}</span>
                    </div>
                    <div class="ml-auto flex items-center gap-1.5">
                      <span class="text-xs text-blue-500 cursor-pointer hover:underline" @click.stop="selectDevice(device.id)">详情</span>
                      <span :class="['text-xs font-bold', getHealthColor(device.health)]">{{ device.health?.toFixed(0) }}%</span>
                      <span :class="['text-[10px] px-1.5 py-0.5 rounded border', getStatusClass(device.status)]">
                        {{ device.status === 'normal' ? '正常' : device.status === 'warning' ? '告警' : '故障' }}
                      </span>
                    </div>
                  </div>
                  
                  <!-- 子设备/模块 -->
                  <div v-if="expandedSubDevices.has(device.id) && getSubDevices(device).length > 0" class="ml-6">
                    <div v-for="(sub, sIdx) in getSubDevices(device)" :key="sub.id" class="relative">
                      <div class="absolute left-3 top-0 bottom-0 border-l border-gray-200"
                           :class="{ 'border-transparent': sIdx === getSubDevices(device).length - 1 }"></div>
                      <div class="flex items-center py-1 pl-6 relative">
                        <div class="absolute left-3 top-1/2 w-3 border-t border-gray-200"></div>
                        <span class="text-xs text-gray-400 mr-1">›</span>
                        <span class="text-xs text-gray-600">{{ sub.name }}</span>
                        <div class="ml-auto flex items-center gap-1.5">
                          <span class="text-xs text-blue-500 cursor-pointer hover:underline">详情</span>
                          <span :class="['text-xs font-bold', getHealthColor(sub.health)]">{{ sub.health?.toFixed(0) }}%</span>
                          <span :class="['text-[10px] px-1.5 py-0.5 rounded border', getStatusClass(sub.status)]">
                            {{ sub.status === 'normal' ? '正常' : sub.status === 'warning' ? '告警' : '故障' }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="h-full flex items-center justify-center text-gray-400 text-sm">
            暂无设备数据
          </div>
        </CardContent>
      </Card>
      </template>
    </template>
  </MainLayout>

  <!-- 性能参数图表弹窗 -->
  <Teleport to="body">
    <div v-if="showChartModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- 遮罩层 -->
      <div class="absolute inset-0 bg-black/50" @click="closeChartModal"></div>
      
      <!-- 弹窗内容 -->
      <div class="relative bg-white rounded-xl shadow-2xl w-[860px] max-w-[90vw] max-h-[85vh] overflow-auto">
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-white flex items-center justify-between sticky top-0 z-10">
          <div>
            <h3 class="text-lg font-bold text-gray-900">{{ chartModalParam?.name }} 性能参数图表</h3>
            <p class="text-sm text-gray-500">当前值: {{ chartModalParam?.value }}{{ chartModalParam?.unit }} · 趋势分析</p>
          </div>
          <button @click="closeChartModal" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        
        <!-- 内容 -->
        <div class="p-6 space-y-4">
          <!-- 筛选控件 -->
          <div class="space-y-2 bg-gray-50 p-4 rounded-lg border">
            <div class="flex items-center gap-3">
              <span class="text-sm text-gray-600 whitespace-nowrap">距离范围 (km):</span>
              <input v-model.number="distanceRangeStart" type="number" min="0" 
                     class="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              <span class="text-gray-400">至</span>
              <input v-model.number="distanceRangeEnd" type="number" min="0" 
                     class="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              <button @click="applyDistanceRange" 
                      class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">应用</button>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm text-gray-600 whitespace-nowrap">时间范围 (小时):</span>
              <input v-model.number="timeRangeStart" type="number" min="0" 
                     class="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              <span class="text-gray-400">至</span>
              <input v-model.number="timeRangeEnd" type="number" min="0" 
                     class="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              <button @click="applyTimeRange" 
                      class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">应用</button>
            </div>
          </div>
          
          <!-- 图表区域 -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-50 p-4 rounded-lg border">
              <div class="text-sm font-medium text-gray-700 mb-3 text-center">沿距离变化</div>
              <PerformanceChart 
                :title="''" 
                :series="distanceChartSeries" 
                :height="220"
              />
            </div>
            <div class="bg-gray-50 p-4 rounded-lg border">
              <div class="text-sm font-medium text-gray-700 mb-3 text-center">随时间变化</div>
              <PerformanceChart 
                :title="''" 
                :series="timeChartSeries" 
                :height="220"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
