<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button, Input } from '@/shared/components/base'
import {
  ClipboardList, Plus, Search, Filter, Clock, User,
  CheckCircle, AlertTriangle, ArrowRight, ChevronRight,
  Calendar, MapPin, Wrench, Ship, FileText, XCircle
} from 'lucide-vue-next'
import { useMonitorStore } from '@/stores'

const monitorStore = useMonitorStore()

// ---------- types ----------
type WorkOrderStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
type WorkOrderPriority = 'urgent' | 'high' | 'medium' | 'low'
type WorkOrderType = 'repair' | 'inspection' | 'preventive' | 'emergency'

interface WorkOrder {
  id: string
  title: string
  type: WorkOrderType
  priority: WorkOrderPriority
  status: WorkOrderStatus
  createdAt: string
  scheduledDate: string
  assignee: string
  description: string
  relatedDeviceId?: string
  relatedFaultId?: string
  kpLocation?: number
  estimatedDuration: string
  activities: WorkOrderActivity[]
}

interface WorkOrderActivity {
  time: string
  action: string
  user: string
}

// ---------- state ----------
const filterStatus = ref<string>('all')
const filterPriority = ref<string>('all')
const searchText = ref('')
const selectedOrderId = ref<string | null>(null)
const showCreateForm = ref(false)

// ---------- 确定性伪随机 ----------
const seededRand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ---------- 创建表单 ----------
const newOrder = ref({
  title: '',
  type: 'repair' as WorkOrderType,
  priority: 'medium' as WorkOrderPriority,
  description: '',
  assignee: '',
  scheduledDate: '',
})

// ---------- 模拟工单数据 ----------
const workOrders = ref<WorkOrder[]>([
  {
    id: 'WO-2026-001',
    title: 'KP87.3 光缆高衰减修复',
    type: 'repair',
    priority: 'urgent',
    status: 'in_progress',
    createdAt: '2026-02-24 08:30',
    scheduledDate: '2026-02-26',
    assignee: '张工',
    description: 'KP87.3 检测到高衰减事件，OTDR 测量确认损耗 18.5dB，疑似外力损伤，需派船修复。',
    kpLocation: 87.3,
    estimatedDuration: '48小时',
    activities: [
      { time: '02-24 08:30', action: '工单创建', user: '系统自动' },
      { time: '02-24 09:00', action: '指派给 张工', user: '李主管' },
      { time: '02-24 14:00', action: '维修船"海缆一号"已出港', user: '张工' },
      { time: '02-25 06:00', action: '已抵达故障区域，开始水下勘查', user: '张工' },
    ],
  },
  {
    id: 'WO-2026-002',
    title: 'R3 中继器泵浦电流异常处理',
    type: 'repair',
    priority: 'high',
    status: 'assigned',
    createdAt: '2026-02-25 10:15',
    scheduledDate: '2026-02-28',
    assignee: '王工',
    description: 'R3 中继器泵浦电流偏高 (+15%)，EDFA 增益开始下降，需远程调参或现场更换。',
    kpLocation: 142.6,
    estimatedDuration: '24小时',
    activities: [
      { time: '02-25 10:15', action: '工单创建', user: '系统自动' },
      { time: '02-25 10:30', action: '指派给 王工', user: '李主管' },
      { time: '02-25 11:00', action: '远程参数调整尝试中', user: '王工' },
    ],
  },
  {
    id: 'WO-2026-003',
    title: 'Q1 季度海缆例行巡检',
    type: 'inspection',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-02-20 09:00',
    scheduledDate: '2026-03-01',
    assignee: '',
    description: '2026年第一季度例行巡检，覆盖全线275km，重点检查浅水段保护状态和中继器运行参数。',
    estimatedDuration: '7天',
    activities: [
      { time: '02-20 09:00', action: '工单创建', user: '系统自动' },
    ],
  },
  {
    id: 'WO-2026-004',
    title: '登陆站A备用电源年度保养',
    type: 'preventive',
    priority: 'low',
    status: 'completed',
    createdAt: '2026-02-15 08:00',
    scheduledDate: '2026-02-18',
    assignee: '赵工',
    description: '登陆站A UPS 及柴油发电机组年度保养维护，包括电池容量测试和切换测试。',
    estimatedDuration: '1天',
    activities: [
      { time: '02-15 08:00', action: '工单创建', user: '李主管' },
      { time: '02-15 08:30', action: '指派给 赵工', user: '李主管' },
      { time: '02-18 09:00', action: '开始现场维护', user: '赵工' },
      { time: '02-18 17:00', action: 'UPS 电池测试通过，发电机切换正常', user: '赵工' },
      { time: '02-18 17:30', action: '工单完成', user: '赵工' },
    ],
  },
  {
    id: 'WO-2026-005',
    title: 'BU-2 分支单元固件升级',
    type: 'preventive',
    priority: 'medium',
    status: 'pending',
    createdAt: '2026-02-23 14:00',
    scheduledDate: '2026-03-05',
    assignee: '王工',
    description: 'BU-2 分支单元固件需升级至 v3.2.1，修复已知的监控数据上报延迟问题。',
    kpLocation: 198.0,
    estimatedDuration: '4小时',
    activities: [
      { time: '02-23 14:00', action: '工单创建', user: '系统自动' },
      { time: '02-23 14:30', action: '指派给 王工', user: '李主管' },
    ],
  },
])

// ---------- 从告警生成工单 ----------
// 检查是否有 error 设备没有对应工单
const missingWorkOrders = computed(() => {
  const errorDevices = monitorStore.devices.filter(d => d.status === 'error')
  return errorDevices.filter(d =>
    !workOrders.value.some(wo => wo.relatedDeviceId === d.id)
  )
})

// ---------- 筛选 ----------
const filteredOrders = computed(() => {
  let result = workOrders.value

  if (filterStatus.value !== 'all') {
    result = result.filter(o => o.status === filterStatus.value)
  }
  if (filterPriority.value !== 'all') {
    result = result.filter(o => o.priority === filterPriority.value)
  }
  if (searchText.value.trim()) {
    const kw = searchText.value.trim().toLowerCase()
    result = result.filter(o =>
      o.title.toLowerCase().includes(kw) ||
      o.id.toLowerCase().includes(kw) ||
      o.assignee.toLowerCase().includes(kw)
    )
  }

  // 排序: urgent > high > medium > low, 再按状态
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 }
  const statusOrder = { in_progress: 0, assigned: 1, pending: 2, completed: 3, cancelled: 4 }
  return result.sort((a, b) =>
    statusOrder[a.status] - statusOrder[b.status] || priorityOrder[a.priority] - priorityOrder[b.priority]
  )
})

// ---------- 统计 ----------
const stats = computed(() => ({
  total: workOrders.value.length,
  pending: workOrders.value.filter(o => o.status === 'pending').length,
  inProgress: workOrders.value.filter(o => o.status === 'in_progress' || o.status === 'assigned').length,
  completed: workOrders.value.filter(o => o.status === 'completed').length,
}))

// ---------- helpers ----------
const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: '紧急', color: 'text-red-700', bg: 'bg-red-100 border-red-200' },
  high:   { label: '高', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-200' },
  medium: { label: '中', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-200' },
  low:    { label: '低', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-200' },
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: '待处理', color: 'text-gray-600', bg: 'bg-gray-100' },
  assigned:    { label: '已指派', color: 'text-blue-600', bg: 'bg-blue-100' },
  in_progress: { label: '进行中', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  completed:   { label: '已完成', color: 'text-green-600', bg: 'bg-green-100' },
  cancelled:   { label: '已取消', color: 'text-gray-400', bg: 'bg-gray-50' },
}

const typeConfig: Record<string, { label: string; icon: typeof Wrench }> = {
  repair:     { label: '维修', icon: Wrench },
  inspection: { label: '巡检', icon: Search },
  preventive: { label: '预防', icon: CheckCircle },
  emergency:  { label: '应急', icon: AlertTriangle },
}

const selectOrder = (id: string) => {
  selectedOrderId.value = selectedOrderId.value === id ? null : id
}

const createWorkOrder = () => {
  if (!newOrder.value.title.trim()) return

  const id = `WO-2026-${String(workOrders.value.length + 1).padStart(3, '0')}`
  const now = new Date()
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  workOrders.value.unshift({
    id,
    title: newOrder.value.title,
    type: newOrder.value.type,
    priority: newOrder.value.priority,
    status: newOrder.value.assignee ? 'assigned' : 'pending',
    createdAt: timeStr,
    scheduledDate: newOrder.value.scheduledDate || '待定',
    assignee: newOrder.value.assignee,
    description: newOrder.value.description,
    estimatedDuration: '待评估',
    activities: [
      { time: timeStr.slice(5), action: '工单创建', user: '当前用户' },
      ...(newOrder.value.assignee ? [{ time: timeStr.slice(5), action: `指派给 ${newOrder.value.assignee}`, user: '当前用户' }] : []),
    ],
  })

  // 重置表单
  newOrder.value = { title: '', type: 'repair', priority: 'medium', description: '', assignee: '', scheduledDate: '' }
  showCreateForm.value = false
}

// 更新工单状态
const updateOrderStatus = (orderId: string, newStatus: WorkOrderStatus) => {
  const order = workOrders.value.find(o => o.id === orderId)
  if (!order) return
  order.status = newStatus
  const now = new Date()
  const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const actionMap: Record<string, string> = {
    assigned: '工单已指派',
    in_progress: '开始处理',
    completed: '工单完成',
    cancelled: '工单取消',
  }
  order.activities.push({ time: timeStr, action: actionMap[newStatus] || '状态变更', user: '当前用户' })
}
</script>

<template>
  <div class="space-y-4">
    <!-- 统计卡片 -->
    <div class="grid grid-cols-4 gap-3">
      <div class="bg-gradient-to-br from-blue-50 to-white rounded-xl border p-3 text-center">
        <div class="text-2xl font-bold text-blue-600">{{ stats.total }}</div>
        <div class="text-xs text-gray-500">总工单</div>
      </div>
      <div class="bg-gradient-to-br from-gray-50 to-white rounded-xl border p-3 text-center">
        <div class="text-2xl font-bold text-gray-600">{{ stats.pending }}</div>
        <div class="text-xs text-gray-500">待处理</div>
      </div>
      <div class="bg-gradient-to-br from-yellow-50 to-white rounded-xl border p-3 text-center">
        <div class="text-2xl font-bold text-yellow-600">{{ stats.inProgress }}</div>
        <div class="text-xs text-gray-500">进行中</div>
      </div>
      <div class="bg-gradient-to-br from-green-50 to-white rounded-xl border p-3 text-center">
        <div class="text-2xl font-bold text-green-600">{{ stats.completed }}</div>
        <div class="text-xs text-gray-500">已完成</div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="flex items-center gap-3 flex-wrap">
      <div class="flex items-center gap-1.5">
        <Search class="w-4 h-4 text-gray-400" />
        <Input v-model="searchText" placeholder="搜索工单号/标题/负责人" class="w-52" />
      </div>
      <select v-model="filterStatus" class="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white">
        <option value="all">全部状态</option>
        <option value="pending">待处理</option>
        <option value="assigned">已指派</option>
        <option value="in_progress">进行中</option>
        <option value="completed">已完成</option>
      </select>
      <select v-model="filterPriority" class="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white">
        <option value="all">全部优先级</option>
        <option value="urgent">紧急</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <Button class="ml-auto" size="sm" @click="showCreateForm = !showCreateForm">
        <Plus class="w-3.5 h-3.5 mr-1" /> 新建工单
      </Button>
    </div>

    <!-- 创建工单表单 -->
    <Card v-if="showCreateForm">
      <CardHeader>
        <span class="font-semibold text-sm">新建维护工单</span>
        <button class="text-gray-400 hover:text-gray-600" @click="showCreateForm = false">
          <XCircle class="w-4 h-4" />
        </button>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-gray-500 mb-1 block">标题 *</label>
            <Input v-model="newOrder.title" placeholder="工单标题" />
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">负责人</label>
            <Input v-model="newOrder.assignee" placeholder="指派负责人" />
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">类型</label>
            <select v-model="newOrder.type" class="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white">
              <option value="repair">维修</option>
              <option value="inspection">巡检</option>
              <option value="preventive">预防性维护</option>
              <option value="emergency">应急</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">优先级</label>
            <select v-model="newOrder.priority" class="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white">
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500 mb-1 block">计划日期</label>
            <input type="date" v-model="newOrder.scheduledDate"
              class="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white" />
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 mb-1 block">描述</label>
          <textarea v-model="newOrder.description" rows="2" placeholder="工单描述"
            class="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5" />
        </div>
        <div class="flex items-center gap-2">
          <Button size="sm" @click="createWorkOrder">创建</Button>
          <Button variant="outline" size="sm" @click="showCreateForm = false">取消</Button>
        </div>
      </CardContent>
    </Card>

    <!-- 工单列表 -->
    <Card>
      <CardHeader>
        <span class="font-semibold text-sm flex items-center gap-2">
          <ClipboardList class="w-4 h-4 text-blue-500" />
          维护工单 ({{ filteredOrders.length }})
        </span>
      </CardHeader>
      <CardContent class="p-0">
        <div class="divide-y max-h-[500px] overflow-auto">
          <div v-for="order in filteredOrders" :key="order.id"
            :class="[
              'px-4 py-3 cursor-pointer transition-colors',
              selectedOrderId === order.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            ]"
            @click="selectOrder(order.id)">
            <!-- 工单头部 -->
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs text-gray-400 font-mono">{{ order.id }}</span>
                  <span :class="['text-xs px-1.5 py-0.5 rounded border font-medium', priorityConfig[order.priority].bg, priorityConfig[order.priority].color]">
                    {{ priorityConfig[order.priority].label }}
                  </span>
                  <span :class="['text-xs px-1.5 py-0.5 rounded font-medium', statusConfig[order.status].bg, statusConfig[order.status].color]">
                    {{ statusConfig[order.status].label }}
                  </span>
                  <span class="text-xs text-gray-400 flex items-center gap-1">
                    <component :is="typeConfig[order.type].icon" class="w-3 h-3" />
                    {{ typeConfig[order.type].label }}
                  </span>
                </div>
                <div class="text-sm font-medium text-gray-800 mt-1">{{ order.title }}</div>
                <div class="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                  <span v-if="order.assignee" class="flex items-center gap-1"><User class="w-3 h-3" />{{ order.assignee }}</span>
                  <span class="flex items-center gap-1"><Calendar class="w-3 h-3" />{{ order.scheduledDate }}</span>
                  <span v-if="order.kpLocation" class="flex items-center gap-1"><MapPin class="w-3 h-3" />KP{{ order.kpLocation }}</span>
                  <span class="flex items-center gap-1"><Clock class="w-3 h-3" />{{ order.estimatedDuration }}</span>
                </div>
              </div>
              <ChevronRight :class="['w-4 h-4 text-gray-400 transition-transform', selectedOrderId === order.id && 'rotate-90']" />
            </div>

            <!-- 展开详情 -->
            <div v-if="selectedOrderId === order.id" class="mt-3 pt-3 border-t space-y-3">
              <!-- 描述 -->
              <div>
                <div class="text-xs font-medium text-gray-600 mb-1">详细描述</div>
                <div class="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">{{ order.description }}</div>
              </div>

              <!-- 信息卡片 -->
              <div class="grid grid-cols-4 gap-2 text-xs">
                <div class="bg-gray-50 rounded p-2">
                  <div class="text-gray-400">创建时间</div>
                  <div class="font-medium text-gray-700 mt-0.5">{{ order.createdAt }}</div>
                </div>
                <div class="bg-gray-50 rounded p-2">
                  <div class="text-gray-400">计划日期</div>
                  <div class="font-medium text-gray-700 mt-0.5">{{ order.scheduledDate }}</div>
                </div>
                <div class="bg-gray-50 rounded p-2">
                  <div class="text-gray-400">预计工期</div>
                  <div class="font-medium text-gray-700 mt-0.5">{{ order.estimatedDuration }}</div>
                </div>
                <div class="bg-gray-50 rounded p-2">
                  <div class="text-gray-400">负责人</div>
                  <div class="font-medium text-gray-700 mt-0.5">{{ order.assignee || '未指派' }}</div>
                </div>
              </div>

              <!-- 活动时间线 -->
              <div>
                <div class="text-xs font-medium text-gray-600 mb-2">活动记录</div>
                <div class="relative pl-4 space-y-2">
                  <div class="absolute left-1.5 top-1 bottom-1 w-px bg-gray-200"></div>
                  <div v-for="(act, ai) in order.activities" :key="ai" class="relative flex items-start gap-2">
                    <div :class="['absolute -left-2.5 w-2 h-2 rounded-full border-2 border-white mt-1',
                      ai === order.activities.length - 1 ? 'bg-blue-500' : 'bg-gray-300']"></div>
                    <div class="text-xs pl-1">
                      <span class="text-gray-400 font-mono">{{ act.time }}</span>
                      <span class="text-gray-600 ml-2">{{ act.action }}</span>
                      <span class="text-gray-400 ml-1">({{ act.user }})</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="flex items-center gap-2">
                <template v-if="order.status === 'pending'">
                  <Button size="sm" @click.stop="updateOrderStatus(order.id, 'assigned')">
                    <User class="w-3.5 h-3.5 mr-1" /> 指派
                  </Button>
                </template>
                <template v-if="order.status === 'assigned'">
                  <Button size="sm" @click.stop="updateOrderStatus(order.id, 'in_progress')">
                    <ArrowRight class="w-3.5 h-3.5 mr-1" /> 开始处理
                  </Button>
                </template>
                <template v-if="order.status === 'in_progress'">
                  <Button size="sm" @click.stop="updateOrderStatus(order.id, 'completed')">
                    <CheckCircle class="w-3.5 h-3.5 mr-1" /> 完成
                  </Button>
                </template>
                <template v-if="order.status !== 'completed' && order.status !== 'cancelled'">
                  <Button variant="outline" size="sm" @click.stop="updateOrderStatus(order.id, 'cancelled')">
                    取消
                  </Button>
                </template>
                <Button variant="outline" size="sm">
                  <FileText class="w-3.5 h-3.5 mr-1" /> 导出报告
                </Button>
              </div>
            </div>
          </div>

          <div v-if="filteredOrders.length === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
            暂无匹配的维护工单
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
