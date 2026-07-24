<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useMonitorStore } from '@/stores/monitor'
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { ref, computed, onMounted } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Select } from '@/shared/components/base'
import MonitoringMap from '@/modules/monitoring/components/MonitoringMap.vue'
import { Activity, AlertTriangle, CheckCircle, XCircle, Zap, MapPin, ChevronRight, ChevronDown, Filter, Link2, Download, Trash2, Search } from 'lucide-vue-next'
import { useRPLStore } from '@/stores/rpl'
import { firstDeviceLibraryByCategory, toRuntimeFiberLibrary } from '@/services/platform/deviceRuntime'

const monitorStore = useMonitorStore()
const routeStore = useRouteStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()
const rplStore = useRPLStore()

// 后端仿真缓存中的链路性能指标
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
  const fiber = toRuntimeFiberLibrary(
    firstDeviceLibraryByCategory(settingsStore.platformDeviceLibraries, 'fiber'),
  )
  return fiber?.name || ''
})

// 筛选条件
const filterByType = ref(false)
const filterByHealth = ref(false)
const selectedTypes = ref<string[]>([])
const selectedHealthStatus = ref<string[]>([])
const viewMode = ref<'type' | 'link' | 'all'>('type')

// 展开状态管理
const expandedGroups = ref<Set<string>>(new Set())

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
    deviceTypeCd: d.deviceTypeCd || '',
    neType: d.deviceTypeCd || d.type,
    location: `KP ${d.kp}`,
  }))
)

// 筛选后的设备列表
const filteredDevices = computed(() => {
  let result = devices.value
  
  if (filterByType.value && selectedTypes.value.length > 0) {
    result = result.filter(d => selectedTypes.value.includes(d.deviceTypeCd))
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
    const type = d.deviceTypeCd || '未分类'
    if (!groups[type]) groups[type] = []
    groups[type].push(d)
  })
  return groups
})

// 设备类型列表
const deviceTypes = computed(() => dictionaryStore.getOptions(PLATFORM_DICTIONARY_TYPES.deviceType))
const getDeviceTypeLabel = (code: string) =>
  dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, code)?.name || code

// 是否有数据
const hasData = computed(() => monitorStore.devices.length > 0)

onMounted(async () => {
  await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType).catch(() => undefined)
  if (settingsStore.platformDeviceLibraries.length === 0) {
    await settingsStore.loadPlatformDeviceLibraries()
  }
})

// 选中的设备
const selectedDevice = ref<string | null>(null)

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

// 获取分组统计
const getGroupStats = (devices: typeof filteredDevices.value) => {
  return {
    normal: devices.filter(d => d.status === 'normal').length,
    warning: devices.filter(d => d.status === 'warning').length,
    error: devices.filter(d => d.status === 'error').length,
  }
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
              <label v-for="type in deviceTypes" :key="type.value" class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" :value="type.value" v-model="selectedTypes" class="rounded" />
                {{ type.label }}
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
                  <span class="text-sm font-medium">{{ getDeviceTypeLabel(String(type)) }} ({{ groupDevices.length }}台)</span>
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

      <!-- 系统运行日志 -->
      <Card class="shrink-0 h-[260px] flex flex-col overflow-hidden">
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
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span class="text-xs text-gray-500">OSNR:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-700">{{ typeof linkMetrics?.osnr?.avg === 'number' ? `${linkMetrics.osnr.avg.toFixed(1)} dB` : '--' }}</span>
                  <span v-if="linkMargin?.meetsRequirement === true" class="text-xs text-green-500">✓</span>
                  <span v-else-if="linkMargin?.meetsRequirement === false" class="text-xs text-red-500">✗</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span class="text-xs text-gray-500">GSNR:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-700">{{ typeof linkMetrics?.gsnr?.avg === 'number' ? `${linkMetrics.gsnr.avg.toFixed(1)} dB` : '--' }}</span>
                  <span v-if="linkMargin?.meetsRequirement === true" class="text-xs text-green-500">✓</span>
                  <span v-else-if="linkMargin?.meetsRequirement === false" class="text-xs text-red-500">✗</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span class="text-xs text-gray-500">Q因子:</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-700">{{ typeof linkMetrics?.qFactor?.avg === 'number' ? `${linkMetrics.qFactor.avg.toFixed(1)} dB` : '--' }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-gray-100">
                <span class="text-xs text-gray-500">总长度:</span>
                <span class="text-xs font-medium text-gray-700">{{ linkTotalLength > 0 ? linkTotalLength.toFixed(1) + ' km' : '--' }}</span>
              </div>
              <div class="flex items-center justify-between py-1.5">
                <span class="text-xs text-gray-500">光纤类型:</span>
                <span class="text-xs font-medium text-gray-700">{{ linkFiberType || '--' }}</span>
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
                  <span class="text-xs font-bold text-gray-800">{{ getDeviceTypeLabel(String(type)) }} ({{ groupDevices.length }}台)</span>
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
                    <div class="flex items-center gap-1">
                      <span class="w-3"></span>
                      <span class="text-xs text-gray-800">{{ device.name }}</span>
                    </div>
                    <div class="ml-auto flex items-center gap-1.5">
                      <span class="text-xs text-blue-500 cursor-pointer hover:underline" @click.stop="selectDevice(device.id)">详情</span>
                      <span :class="['text-[10px] px-1.5 py-0.5 rounded border', getStatusClass(device.status)]">
                        {{ device.status === 'normal' ? '正常' : device.status === 'warning' ? '告警' : '故障' }}
                      </span>
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
  </MainLayout>

</template>
