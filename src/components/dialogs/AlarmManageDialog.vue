<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui'
import { X, AlertTriangle, CheckCircle, XCircle, Filter, RefreshCw, Download, Trash2 } from 'lucide-vue-next'
import { mockAlarmRecords, alarmFilterOptions } from '@/data/mockData'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 告警级别类型
type AlarmLevel = 'info' | 'warning' | 'major' | 'critical'
type AlarmStatus = 'active' | 'acknowledged' | 'cleared'

interface Alarm {
  id: string
  time: string
  device: string
  deviceType: string
  message: string
  level: AlarmLevel
  status: AlarmStatus
  type: string
}

// 告警数据 - 从集中数据文件导入
const alarms = ref<Alarm[]>([...mockAlarmRecords] as Alarm[])

// 筛选条件
const filterType = ref('all')
const filterLevel = ref('all')
const filterDeviceType = ref('all')
const filterStatus = ref('all')

// 筛选选项 - 从集中数据文件导入
const { typeOptions, levelOptions, deviceTypeOptions, statusOptions } = alarmFilterOptions

// 筛选后的告警列表
const filteredAlarms = computed(() => {
  return alarms.value.filter(alarm => {
    if (filterType.value !== 'all' && alarm.type !== filterType.value) return false
    if (filterLevel.value !== 'all' && alarm.level !== filterLevel.value) return false
    if (filterDeviceType.value !== 'all' && alarm.deviceType !== filterDeviceType.value) return false
    if (filterStatus.value !== 'all' && alarm.status !== filterStatus.value) return false
    return true
  })
})

// 统计数据
const stats = computed(() => ({
  total: alarms.value.length,
  active: alarms.value.filter(a => a.status === 'active').length,
  critical: alarms.value.filter(a => a.level === 'critical' && a.status === 'active').length,
  major: alarms.value.filter(a => a.level === 'major' && a.status === 'active').length,
}))

const getLevelClass = (level: AlarmLevel) => {
  const map: Record<AlarmLevel, string> = {
    info: 'bg-blue-100 text-blue-700 border-blue-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    major: 'bg-orange-100 text-orange-700 border-orange-200',
    critical: 'bg-red-100 text-red-700 border-red-200',
  }
  return map[level]
}

const getLevelText = (level: AlarmLevel) => {
  const map: Record<AlarmLevel, string> = {
    info: '提示',
    warning: '次要',
    major: '重要',
    critical: '紧急',
  }
  return map[level]
}

const getStatusText = (status: AlarmStatus) => {
  const map: Record<AlarmStatus, string> = {
    active: '活动',
    acknowledged: '已确认',
    cleared: '已清除',
  }
  return map[status]
}

const getStatusClass = (status: AlarmStatus) => {
  const map: Record<AlarmStatus, string> = {
    active: 'text-red-600',
    acknowledged: 'text-yellow-600',
    cleared: 'text-gray-400',
  }
  return map[status]
}

const handleAcknowledge = (id: string) => {
  const alarm = alarms.value.find(a => a.id === id)
  if (alarm) {
    alarm.status = 'acknowledged'
  }
}

const handleClear = (id: string) => {
  const alarm = alarms.value.find(a => a.id === id)
  if (alarm) {
    alarm.status = 'cleared'
  }
}

const handleRefresh = () => {
  // 模拟刷新
}

const handleExport = () => {
  // 模拟导出
}

const resetFilters = () => {
  filterType.value = 'all'
  filterLevel.value = 'all'
  filterDeviceType.value = 'all'
  filterStatus.value = 'all'
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[900px] max-h-[85vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <div class="flex items-center gap-3">
            <AlertTriangle class="w-5 h-5 text-orange-500" />
            <span class="font-semibold text-lg">告警管理</span>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" @click="handleRefresh">
              <RefreshCw class="w-4 h-4 mr-1" /> 刷新
            </Button>
            <Button variant="outline" size="sm" @click="handleExport">
              <Download class="w-4 h-4 mr-1" /> 导出
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-hidden p-0 flex flex-col">
          <!-- 统计栏 -->
          <div class="px-4 py-3 bg-gray-50 border-b flex items-center gap-6">
            <div class="text-sm">
              <span class="text-gray-500">总告警:</span>
              <span class="font-semibold ml-1">{{ stats.total }}</span>
            </div>
            <div class="text-sm">
              <span class="text-gray-500">活动:</span>
              <span class="font-semibold text-red-600 ml-1">{{ stats.active }}</span>
            </div>
            <div class="text-sm">
              <span class="text-gray-500">紧急:</span>
              <span class="font-semibold text-red-600 ml-1">{{ stats.critical }}</span>
            </div>
            <div class="text-sm">
              <span class="text-gray-500">重要:</span>
              <span class="font-semibold text-orange-600 ml-1">{{ stats.major }}</span>
            </div>
          </div>
          
          <!-- 筛选栏 -->
          <div class="px-4 py-3 border-b flex items-center gap-3 flex-wrap">
            <Filter class="w-4 h-4 text-gray-400" />
            <Select v-model="filterType" :options="typeOptions" class="w-32" />
            <Select v-model="filterLevel" :options="levelOptions" class="w-32" />
            <Select v-model="filterDeviceType" :options="deviceTypeOptions" class="w-32" />
            <Select v-model="filterStatus" :options="statusOptions" class="w-32" />
            <Button variant="ghost" size="sm" @click="resetFilters">
              重置
            </Button>
          </div>
          
          <!-- 告警列表 -->
          <div class="flex-1 overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">时间</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">设备</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">告警信息</th>
                  <th class="px-4 py-2 text-center font-medium text-gray-600">级别</th>
                  <th class="px-4 py-2 text-center font-medium text-gray-600">状态</th>
                  <th class="px-4 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr 
                  v-for="alarm in filteredAlarms" 
                  :key="alarm.id"
                  :class="[
                    'hover:bg-gray-50',
                    alarm.status === 'cleared' ? 'opacity-60' : ''
                  ]"
                >
                  <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ alarm.time }}</td>
                  <td class="px-4 py-3 font-medium">{{ alarm.device }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ alarm.message }}</td>
                  <td class="px-4 py-3 text-center">
                    <span :class="['text-xs px-2 py-0.5 rounded border', getLevelClass(alarm.level)]">
                      {{ getLevelText(alarm.level) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span :class="['text-xs font-medium', getStatusClass(alarm.status)]">
                      {{ getStatusText(alarm.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <Button 
                        v-if="alarm.status === 'active'"
                        variant="ghost" 
                        size="sm"
                        @click="handleAcknowledge(alarm.id)"
                        title="确认"
                      >
                        <CheckCircle class="w-4 h-4 text-green-600" />
                      </Button>
                      <Button 
                        v-if="alarm.status !== 'cleared'"
                        variant="ghost" 
                        size="sm"
                        @click="handleClear(alarm.id)"
                        title="清除"
                      >
                        <XCircle class="w-4 h-4 text-gray-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredAlarms.length === 0">
                  <td colspan="6" class="px-4 py-8 text-center text-gray-400">
                    暂无告警记录
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>
