<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button, Select, Input } from '@/shared/components/base'
import {
  Activity, Monitor, AlertTriangle, Settings, Search, RefreshCw, Download, Filter, CheckCircle, XCircle, Clock, ChevronDown, List, BarChart3, Bell, Shield, Eye, ArrowLeft, Zap, Info, Link2, FileText, Database, Save, HardDrive, Mail, RotateCcw, Trash2, MessageSquare, Upload, Plus
} from 'lucide-vue-next'
import { useMonitorStore } from '@/stores/monitor'
import { useAppStore } from '@/stores/app'
import { generateMonitoringReportHtml } from '@/services/MonitoringReportService'

const monitorStore = useMonitorStore()
const appStore = useAppStore()

// ========== Tabs ==========
const activeTab = ref<'overview' | 'device' | 'alarm' | 'system'>('overview')
const tabs = [
  { id: 'overview' as const, label: '监控总览', icon: BarChart3 },
  { id: 'device' as const, label: '设备监控', icon: Monitor },
  { id: 'alarm' as const, label: '告警管理', icon: Bell },
  { id: 'system' as const, label: '系统管理', icon: Settings },
]

// ========== 监控总览 ==========
const systemHealth = computed(() => {
  const total = monitorStore.devices.length
  if (total === 0) return 0
  const normal = monitorStore.devices.filter(d => d.status === 'normal').length
  return Math.round((normal / total) * 1000) / 10
})

const healthStatus = computed(() => {
  if (systemHealth.value >= 90) return { text: '系统运行良好', color: 'text-green-600' }
  if (systemHealth.value >= 70) return { text: '系统运行一般', color: 'text-yellow-600' }
  return { text: '系统运行异常', color: 'text-red-600' }
})

const onlineDevices = computed(() => monitorStore.devices.filter(d => d.status === 'normal').length)
const totalDevices = computed(() => monitorStore.devices.length)
const onlineRate = computed(() => {
  if (totalDevices.value === 0) return '0%'
  return `${Math.round((onlineDevices.value / totalDevices.value) * 100)}%`
})

const alarmCount = computed(() => monitorStore.alarmHistory.filter(a => a.status === 'active').length)

// 健康度分布
const healthDistribution = computed(() => {
  const s = monitorStore.statusSummary
  const total = s.normal + s.warning + s.error
  return [
    { label: '健康', count: s.normal, percent: total > 0 ? Math.round((s.normal / total) * 100) : 0, color: 'bg-green-500' },
    { label: '预警', count: s.warning, percent: total > 0 ? Math.round((s.warning / total) * 100) : 0, color: 'bg-yellow-500' },
    { label: '故障', count: s.error, percent: total > 0 ? Math.round((s.error / total) * 100) : 0, color: 'bg-red-500' },
  ]
})

// 确定性伪随机，避免重渲染闪烁
const seededRand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ========== 设备监控 ==========
const deviceFilter = ref({
  deviceType: 'all',
  deviceId: '',
  statusFilter: 'all',
})

type ModuleEntry = {
  id: string
  time: string
  moduleType: string
  performance: string
  status: 'normal' | 'warning' | 'error'
  health: number
  remark: string
  deviceName: string
}

const modules = computed<ModuleEntry[]>(() => {
  return monitorStore.devices.map((d, i) => {
    const h = d.status === 'normal' ? 85 + Math.floor(seededRand(i + 500) * 15) :
              d.status === 'warning' ? 50 + Math.floor(seededRand(i + 600) * 20) :
              10 + Math.floor(seededRand(i + 700) * 30)
    return {
      id: d.id,
      time: new Date().toLocaleString('zh-CN'),
      moduleType: d.type === 'repeater' ? '放大器模块' : d.type === 'branching-unit' ? '分支模块' : '终端模块',
      performance: `${d.inputPower.toFixed(1)}dBm / ${d.outputPower.toFixed(1)}dBm`,
      status: d.status,
      health: h,
      remark: d.status === 'normal' ? '正常运行' : d.status === 'warning' ? '性能下降' : '需要维护',
      deviceName: d.name,
    }
  })
})

const filteredModules = computed(() => {
  return modules.value.filter(m => {
    if (deviceFilter.value.statusFilter !== 'all' && m.status !== deviceFilter.value.statusFilter) return false
    if (deviceFilter.value.deviceId && !m.id.toLowerCase().includes(deviceFilter.value.deviceId.toLowerCase())) return false
    return true
  })
})

const statusButtons = [
  { value: 'all', label: '全部' },
  { value: 'error', label: '故障' },
  { value: 'warning', label: '预警' },
  { value: 'normal', label: '正常' },
]

const getStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    normal: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    normal: '正常',
    warning: '预警',
    error: '故障',
  }
  return map[status] || status
}

// ========== 告警管理 ==========
const alarmSubTab = ref<'realtime' | 'history'>('realtime')
const alarmViewMode = ref<'list' | 'timeline'>('list')
const alarmDetailView = ref<AlarmDetail | null>(null)

// 列表筛选条件
const alarmListFilter = ref({
  timeRange: 'all',
  level: 'all',
  objectType: 'all',
  faultType: 'all',
  searchText: '',
})

// 时间轴筛选
const timelineFilter = ref({
  groupBy: 'device',
  target: 'all',
  timeRange: '24h',
})

// 时间轴悬停
const timelineHoverEvt = ref<{ rowIdx: number; evtIdx: number; x: number; y: number } | null>(null)

// 告警统计
const alarmStats = computed(() => ({
  fault: monitorStore.alarmHistory.filter(a => a.level === 'error' && a.status === 'active').length,
  warning: monitorStore.alarmHistory.filter(a => a.level === 'warning' && a.status === 'active').length,
  active: monitorStore.alarmHistory.filter(a => a.status === 'active').length,
}))

// 富化告警详情数据
interface AlarmDetail {
  id: number
  objectId: string
  objectLabel: string
  time: string
  recoveryTime: string
  duration: string
  objectType: string
  alarmType: string
  moduleType: string
  faultType: string
  faultDesc: string
  alarmDesc: string
  status: string
  severity: string
  health: number
  level: string
  rawStatus: string
  device: string
  deviceId: string
}

const moduleTypes = ['OTU', 'ODU', 'EDFA', '链路']
const faultTypeList = ['通信异常', '电压异常', '温度异常', '功率异常']
const objectTypeList = ['设备', '模块', '端口']
const faultDescs: Record<string, string[]> = {
  OTU: ['电压异常', '信号丢失', '光功率偏低'],
  ODU: ['通信异常', '误码率偏高', '超时异常'],
  EDFA: ['增益异常', '泵浦电流偏高', '泄漏电流偏高'],
  '链路': ['OSNR 降低', '信号衰减', '带宽受限'],
}

const buildAlarmDetails = (alarms: typeof monitorStore.alarmHistory): AlarmDetail[] => {
  return alarms.map((a, idx) => {
    const modType = moduleTypes[idx % moduleTypes.length]
    const faults = faultDescs[modType] || ['未知故障']
    const isError = a.level === 'error'
    const durationMin = Math.floor(seededRand(a.id + 1) * 300)
    const durStr = durationMin < 60 ? `${durationMin}分钟` : `${Math.floor(durationMin / 60)}小时${durationMin % 60}分钟`
    const isCleared = a.status === 'cleared' || a.status === 'acknowledged'
    const recoveryOffset = Math.floor(seededRand(a.id + 99) * 120) + 30
    const alarmDate = new Date(a.time.replace(/\//g, '-'))
    const recoveryDate = new Date(alarmDate.getTime() + recoveryOffset * 60000)
    const recoveryStr = isCleared
      ? `${recoveryDate.getMonth() + 1}/${recoveryDate.getDate()} ${String(recoveryDate.getHours()).padStart(2, '0')}:${String(recoveryDate.getMinutes()).padStart(2, '0')}`
      : ''
    return {
      id: a.id,
      objectId: `S1-${modType === '链路' ? 'LINK' : 'MOD'}${String(idx + 1).padStart(3, '0')}`,
      objectLabel: `${a.device} - S1-${modType === '链路' ? 'LINK' : 'MOD'}${String(idx + 1).padStart(3, '0')}`,
      time: a.time,
      recoveryTime: recoveryStr,
      duration: isCleared ? durStr : '持续中',
      objectType: objectTypeList[idx % objectTypeList.length],
      alarmType: isError ? '故障' : '预警',
      moduleType: modType,
      faultType: faultTypeList[idx % faultTypeList.length],
      faultDesc: faults[idx % faults.length],
      alarmDesc: a.message,
      status: isCleared ? '已恢复' : '故障中',
      severity: isError ? '高' : '中',
      health: isError ? 30 + Math.floor(seededRand(a.id + 10) * 25) : 55 + Math.floor(seededRand(a.id + 20) * 25),
      level: a.level,
      rawStatus: a.status,
      device: a.device,
      deviceId: a.deviceId || '',
    }
  })
}

const realtimeAlarmDetails = computed(() =>
  buildAlarmDetails(monitorStore.alarmHistory.filter(a => a.status === 'active'))
)
const historyAlarmDetails = computed(() =>
  buildAlarmDetails(monitorStore.alarmHistory.filter(a => a.status !== 'active'))
)
const currentAlarmDetails = computed(() =>
  alarmSubTab.value === 'realtime' ? realtimeAlarmDetails.value : historyAlarmDetails.value
)

// 筛选后的告警列表
const filteredAlarmDetails = computed(() => {
  let list = currentAlarmDetails.value
  const f = alarmListFilter.value
  if (f.level !== 'all') list = list.filter(a => a.level === f.level)
  if (f.objectType !== 'all') list = list.filter(a => a.objectType === f.objectType)
  if (f.faultType !== 'all') list = list.filter(a => a.faultType === f.faultType)
  if (f.searchText.trim()) {
    const kw = f.searchText.trim().toLowerCase()
    list = list.filter(a =>
      a.objectId.toLowerCase().includes(kw) ||
      a.objectLabel.toLowerCase().includes(kw) ||
      a.device.toLowerCase().includes(kw)
    )
  }
  return list
})

// 时间轴数据生成
interface TimelineEvent {
  startPct: number; widthPct: number; level: string; alarm?: AlarmDetail
}
interface TimelineRow {
  label: string
  events: TimelineEvent[]
}
const timelineHours = [0, 3, 6, 9, 12, 15, 18, 21, 24]

const timelineRows = computed<TimelineRow[]>(() => {
  const details = currentAlarmDetails.value
  const groupBy = timelineFilter.value.groupBy
  const groups: Record<string, AlarmDetail[]> = {}

  if (groupBy === 'device') {
    details.forEach(d => { const k = d.device; if (!groups[k]) groups[k] = []; groups[k].push(d) })
  } else if (groupBy === 'module') {
    details.forEach(d => { const k = d.moduleType; if (!groups[k]) groups[k] = []; groups[k].push(d) })
  } else if (groupBy === 'link') {
    details.forEach(d => {
      const k = d.objectId.includes('LINK') ? '光链路' : `${d.device}链路`
      if (!groups[k]) groups[k] = []; groups[k].push(d)
    })
  } else {
    details.forEach(d => {
      const hm = d.time.match(/(\d{2}):\d{2}$/)
      const h = hm ? parseInt(hm[1]) : 0
      const k = `${String(Math.floor(h / 4) * 4).padStart(2, '0')}:00-${String(Math.floor(h / 4) * 4 + 4).padStart(2, '0')}:00`
      if (!groups[k]) groups[k] = []; groups[k].push(d)
    })
  }

  return Object.entries(groups).slice(0, 8).map(([label, alarms], gi) => {
    const events: TimelineEvent[] = alarms.map((a, i) => {
      const startPct = 10 + (i * 18) + seededRand(a.id + gi * 100) * 10
      const widthPct = 4 + seededRand(a.id + gi * 100 + 50) * 8
      return {
        startPct: Math.min(startPct, 90),
        widthPct: Math.min(widthPct, 100 - Math.min(startPct, 90)),
        level: a.level,
        alarm: a,
      }
    })
    alarms.filter(a => a.rawStatus === 'active').forEach((a, i) => {
      const src = events.find(e => e.alarm?.id === a.id)
      if (src) {
        events.push({
          startPct: src.startPct + src.widthPct,
          widthPct: 12 + seededRand(gi + 200 + i) * 15,
          level: 'duration',
        })
      }
    })
    return { label, events }
  })
})

// 告警关联分析
const correlationHints = computed(() => {
  const details = currentAlarmDetails.value
  const hints: { type: string; icon: string; message: string }[] = []
  // 时间关联
  const tg: Record<string, AlarmDetail[]> = {}
  details.forEach(a => {
    const hk = a.time.slice(0, -2) + '00'
    if (!tg[hk]) tg[hk] = []; tg[hk].push(a)
  })
  Object.entries(tg).forEach(([t, arr]) => {
    if (arr.length >= 2) {
      hints.push({ type: '时间关联', icon: '', message: `${arr.length}个告警在${t.slice(-5)}附近集中发生，可能存在关联` })
    }
  })
  // 同源关联
  const dg: Record<string, AlarmDetail[]> = {}
  details.forEach(a => { if (!dg[a.device]) dg[a.device] = []; dg[a.device].push(a) })
  Object.entries(dg).forEach(([dev, arr]) => {
    if (arr.length >= 2) {
      hints.push({ type: '同源关联', icon: '', message: `${dev}有${arr.length}个模块同时告警，建议检查电源或环境` })
    }
  })
  // 因果关联
  if (details.some(a => a.moduleType === 'OTU') && details.some(a => a.moduleType === 'ODU')) {
    hints.push({ type: '因果关联', icon: '', message: 'ODU通信异常可能由OTU模块故障引起，建议优先排查OTU' })
  }
  return hints.slice(0, 4)
})

// 告警详情 - 性能参数曲线数据
const detailPerfData = computed(() => {
  if (!alarmDetailView.value) return []
  const s = alarmDetailView.value.id
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    voltage: 48 + (seededRand(s + i * 3) - 0.5) * 2,
    power: -12 + (seededRand(s + i * 7) - 0.5) * 4,
    temperature: 4 + seededRand(s + i * 11) * 2,
  }))
})
const detailHealthTrend = computed(() => {
  if (!alarmDetailView.value) return []
  const s = alarmDetailView.value.id
  const base = alarmDetailView.value.health
  return Array.from({ length: 12 }, (_, i) => ({
    label: `${i * 2}h前`,
    value: Math.min(100, Math.max(0, base + 30 - i * 3 + Math.floor(seededRand(s + i * 13) * 10))),
  }))
})
// 关联日志分析 - 状态
const logAnalysisMode = ref<'smart' | 'custom'>('smart')
const logTimelineVisible = ref(false)
const logFilter = ref({
  scope: 'device',
  timeBefore: '30',
  timeAfter: '30',
  logTypes: ['alarm', 'operation', 'device', 'link', 'system'] as string[],
  logLevels: ['info', 'warning', 'error'] as string[],
  keyword: '',
})

interface LogEntry {
  time: string; type: string; level: string; object: string; content: string; isCurrent?: boolean
}

// 生成丰富的模拟日志
const allRelatedLogs = computed<LogEntry[]>(() => {
  if (!alarmDetailView.value) return []
  const a = alarmDetailView.value
  const baseTime = a.time.replace(/(\d{2}):(\d{2})$/, (_, h, m) => {
    const hh = parseInt(h), mm = parseInt(m)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  })
  const offsetTime = (minOffset: number) => {
    const match = baseTime.match(/(\d{2}):(\d{2})$/)
    if (!match) return baseTime
    let hh = parseInt(match[1]), mm = parseInt(match[2]) + minOffset
    while (mm < 0) { mm += 60; hh-- }
    while (mm >= 60) { mm -= 60; hh++ }
    return baseTime.replace(/(\d{2}):(\d{2})$/, `${String(Math.max(0, hh)).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
  }
  return [
    { time: offsetTime(-10), type: '操作日志', level: 'info', object: 'admin', content: '登录监控系统' },
    { time: offsetTime(-7), type: '操作日志', level: 'info', object: 'admin', content: `进入${a.device}配置页面` },
    { time: offsetTime(-5), type: '操作日志', level: 'info', object: 'admin', content: `修改${a.device}电源参数配置` },
    { time: offsetTime(-3), type: '设备日志', level: 'info', object: a.device, content: '配置下发成功' },
    { time: offsetTime(-1), type: '告警日志', level: 'warning', object: `${a.device} / PSU`, content: '电源输出波动' },
    { time: a.time, type: '告警日志', level: a.level, object: `${a.device} / ${a.moduleType}`, content: a.alarmDesc, isCurrent: true },
    { time: offsetTime(0), type: '设备日志', level: 'warning', object: a.device, content: '检测到供电不稳定' },
    { time: offsetTime(1), type: '告警日志', level: 'warning', object: `${a.device} / 端口3`, content: '输出光功率偏低' },
    { time: offsetTime(2), type: '链路日志', level: 'info', object: a.objectId, content: '链路性能参数采集完成' },
    { time: offsetTime(5), type: '系统日志', level: 'info', object: '系统', content: '告警通知已发送至运维人员' },
  ]
})

// 智能推荐日志
const smartRecommendedLogs = computed(() => allRelatedLogs.value.filter(l =>
  l.level !== 'info' || l.type === '操作日志' || l.isCurrent
))

// 智能推荐原因
const smartRecommendReasons = computed(() => {
  if (!alarmDetailView.value) return []
  const a = alarmDetailView.value
  return [
    { type: '时间关联', desc: `${smartRecommendedLogs.value.length}条日志均发生在告警前后10分钟内` },
    { type: '对象关联', desc: `均属于同一设备（${a.device}）` },
    { type: '因果关联', desc: `电源波动(PSU) → ${a.faultDesc}(${a.moduleType}) → 光功率偏低(端口)` },
    { type: '操作关联', desc: '告警前5分钟存在电源参数配置变更' },
  ]
})

// 自定义筛选后的日志
const customFilteredLogs = computed(() => {
  let list = allRelatedLogs.value
  const f = logFilter.value
  const typeMap: Record<string, string> = { alarm: '告警日志', operation: '操作日志', device: '设备日志', link: '链路日志', system: '系统日志' }
  const enabledTypes = f.logTypes.map(t => typeMap[t]).filter(Boolean)
  list = list.filter(l => enabledTypes.includes(l.type))
  list = list.filter(l => f.logLevels.includes(l.level))
  if (f.keyword.trim()) {
    const kw = f.keyword.trim().toLowerCase()
    list = list.filter(l => l.content.toLowerCase().includes(kw) || l.object.toLowerCase().includes(kw))
  }
  return list
})

const displayedLogs = computed(() =>
  logAnalysisMode.value === 'smart' ? smartRecommendedLogs.value : customFilteredLogs.value
)

// 日志统计
const logStats = computed(() => {
  const logs = displayedLogs.value
  const types = ['告警日志', '操作日志', '设备日志', '链路日志', '系统日志']
  return types.map(t => ({ type: t, count: logs.filter(l => l.type === t).length })).filter(s => s.count > 0)
})

const toggleLogType = (t: string) => {
  const idx = logFilter.value.logTypes.indexOf(t)
  if (idx >= 0) logFilter.value.logTypes.splice(idx, 1)
  else logFilter.value.logTypes.push(t)
}
const toggleLogLevel = (l: string) => {
  const idx = logFilter.value.logLevels.indexOf(l)
  if (idx >= 0) logFilter.value.logLevels.splice(idx, 1)
  else logFilter.value.logLevels.push(l)
}

// 日志时间轴数据
const logTimelineData = computed(() => {
  const logs = displayedLogs.value
  const types = [...new Set(logs.map(l => l.type))]
  return types.map(type => ({
    type,
    events: logs.filter(l => l.type === type).map((l, i) => ({
      ...l,
      pct: 10 + (i / Math.max(logs.length - 1, 1)) * 80,
    })),
  }))
})
// SVG 折线点
const perfSvgPoints = computed(() => {
  const d = detailPerfData.value
  if (!d.length) return { voltage: '', power: '', temperature: '' }
  const pts = (vals: number[], mn: number, mx: number) =>
    vals.map((v, i) => `${(i / (vals.length - 1)) * 280 + 10},${55 - ((v - mn) / (mx - mn || 1)) * 45}`).join(' ')
  return {
    voltage: pts(d.map(x => x.voltage), 46, 50),
    power: pts(d.map(x => x.power), -16, -8),
    temperature: pts(d.map(x => x.temperature), 3, 7),
  }
})
const healthSvgPoints = computed(() => {
  const d = detailHealthTrend.value
  if (!d.length) return ''
  return d.map((v, i) => `${(i / (d.length - 1)) * 280 + 10},${55 - (v.value / 100) * 45}`).join(' ')
})

// 设备面板模块列表
const devicePanelModules = computed(() => {
  if (!alarmDetailView.value) return []
  const a = alarmDetailView.value
  return ['OTU', 'ODU', 'EDFA', '光口1', '光口2', '电源'].map(name => ({
    name,
    isAlarm: name === a.moduleType || (name === 'OTU' && a.faultType === '电压异常'),
    isWarning: name !== a.moduleType && a.device === a.device && seededRand(a.id + name.length) > 0.7,
  }))
})

const openAlarmDetail = (alarm: AlarmDetail) => { alarmDetailView.value = alarm }
const closeAlarmDetail = () => { alarmDetailView.value = null }

const getHealthBarColor = (health: number) => {
  if (health >= 70) return 'bg-green-500'
  if (health >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}
const handleAcknowledge = (id: number) => { monitorStore.acknowledgeAlarm(id) }
const handleClearAlarm = (id: number) => { monitorStore.clearAlarm(id) }

// ========== 健康度仪表盘 SVG ==========
const gaugeArc = computed(() => {
  const pct = systemHealth.value / 100
  const angle = pct * 270 // 270度弧
  const startAngle = 135  // 从左下开始
  const endAngle = startAngle + angle
  const r = 80
  const cx = 100
  const cy = 100
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(startAngle))
  const y1 = cy + r * Math.sin(toRad(startAngle))
  const x2 = cx + r * Math.cos(toRad(endAngle))
  const y2 = cy + r * Math.sin(toRad(endAngle))
  const largeArc = angle > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
})

const gaugeBgArc = computed(() => {
  const r = 80
  const cx = 100
  const cy = 100
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const startAngle = 135
  const endAngle = 135 + 270
  const x1 = cx + r * Math.cos(toRad(startAngle))
  const y1 = cy + r * Math.sin(toRad(startAngle))
  const x2 = cx + r * Math.cos(toRad(endAngle))
  const y2 = cy + r * Math.sin(toRad(endAngle))
  return `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`
})

const gaugeColor = computed(() => {
  if (systemHealth.value >= 90) return '#22c55e'
  if (systemHealth.value >= 70) return '#eab308'
  return '#ef4444'
})

// ========== 系统管理 ==========
const systemSubTab = ref<'logs' | 'config' | 'data'>('logs')

// -- 日志查询 --
const sysLogFilter = ref({
  timeRange: 'today',
  level: 'all',
  type: 'all',
  object: 'all',
  keyword: '',
})
const sysLogPage = ref(1)
const sysLogPageSize = ref('20')

interface SysLogEntry {
  id: number
  time: string
  level: 'INFO' | 'WARN' | 'ERROR'
  type: string
  object: string
  content: string
}

const sysLogList = computed<SysLogEntry[]>(() => {
  const now = new Date()
  const types = ['系统日志', '链路日志', '设备日志', '模块日志', '操作日志', '告警日志']
  const levels: SysLogEntry['level'][] = ['INFO', 'WARN', 'ERROR']
  const objects = ['-', 'admin', 'OTN-A', 'OTN-B', 'OTN-C', 'OTN-D', 'Link-01', 'Link-03', 'OTN-A/ODU-2', 'OTN-B/OTU-2', 'operator1']
  const contents = [
    '系统资源检查完成', '修改设备OTN-C配置', '设备上线成功', '健康度低于故障阈值',
    '性能指标正常', '健康度低于警告阈值', '参数同步完成', '用户登录系统',
    '数据备份完成', '链路性能采集完成', '告警规则更新', '设备重启完成',
    '健康度计算完成', '配置文件已保存', '端口状态变化', '监控任务启动',
    '数据清理任务完成', '设备固件版本检查', '自动巡检完成', '用户退出系统',
    '阈值配置变更', '告警通知已发送', '系统时间同步完成', '数据库连接正常',
  ]
  return Array.from({ length: 120 }, (_, i) => {
    const mins = Math.floor(seededRand(i + 2000) * 720)
    const d = new Date(now.getTime() - mins * 60000)
    const lvlIdx = seededRand(i + 3000) < 0.08 ? 2 : seededRand(i + 3000) < 0.25 ? 1 : 0
    return {
      id: i + 1,
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`,
      level: levels[lvlIdx],
      type: types[Math.floor(seededRand(i + 4000) * types.length)],
      object: objects[Math.floor(seededRand(i + 5000) * objects.length)],
      content: contents[Math.floor(seededRand(i + 6000) * contents.length)],
    }
  }).sort((a, b) => b.time.localeCompare(a.time))
})

const filteredSysLogs = computed(() => {
  let list = sysLogList.value
  const f = sysLogFilter.value
  if (f.level !== 'all') list = list.filter(l => l.level === f.level)
  if (f.type !== 'all') list = list.filter(l => l.type === f.type)
  if (f.object !== 'all') list = list.filter(l => l.object === f.object)
  if (f.keyword.trim()) {
    const kw = f.keyword.trim().toLowerCase()
    list = list.filter(l => l.content.toLowerCase().includes(kw) || l.object.toLowerCase().includes(kw))
  }
  return list
})

const sysLogTotalPages = computed(() => Math.max(1, Math.ceil(filteredSysLogs.value.length / Number(sysLogPageSize.value))))
const pagedSysLogs = computed(() => {
  const size = Number(sysLogPageSize.value)
  const start = (sysLogPage.value - 1) * size
  return filteredSysLogs.value.slice(start, start + size)
})

const resetSysLogFilter = () => {
  sysLogFilter.value = { timeRange: 'today', level: 'all', type: 'all', object: 'all', keyword: '' }
  sysLogPage.value = 1
}

const getLevelBadge = (level: string) => {
  if (level === 'ERROR') return 'bg-red-100 text-red-700'
  if (level === 'WARN') return 'bg-yellow-100 text-yellow-700'
  return 'bg-blue-50 text-blue-600'
}

// -- 系统配置 --
const sysConfig = ref({
  name: '海缆健康度管理系统',
  refreshInterval: '5',
  sessionTimeout: '30',
  timezone: 'utc8',
})

const healthThreshold = ref({
  warningThreshold: '70',
  faultThreshold: '50',
  applyDevice: true,
  applyModule: true,
  applyLink: true,
})

const notifyConfig = ref({
  email: true,
  emailReceivers: 'admin@example.com; ops@example.com',
  sms: false,
  smsReceivers: '',
  inApp: true,
  onWarning: true,
  onFault: true,
  onRecovery: true,
})

const interpolationConfig = ref({
  enabled: true,
  method: '样条插值',
  maxGap: '12',
  confidence: '95',
})

const predictionConfig = ref({
  lstmEnabled: true,
  dynamicBaselineEnabled: true,
  lookbackWindow: '72',
  retrainHours: '24',
  forecastHours: '12',
  sensitivity: '85',
})

const reportSections = ref({
  overview: true,
  topology: true,
  devices: true,
  alarms: true,
  prediction: true,
  logs: true,
})

const resetSysConfig = () => {
  sysConfig.value = { name: '海缆健康度管理系统', refreshInterval: '5', sessionTimeout: '30', timezone: 'utc8' }
  healthThreshold.value = { warningThreshold: '70', faultThreshold: '50', applyDevice: true, applyModule: true, applyLink: true }
  notifyConfig.value = { email: true, emailReceivers: 'admin@example.com; ops@example.com', sms: false, smsReceivers: '', inApp: true, onWarning: true, onFault: true, onRecovery: true }
  interpolationConfig.value = { enabled: true, method: '样条插值', maxGap: '12', confidence: '95' }
  predictionConfig.value = { lstmEnabled: true, dynamicBaselineEnabled: true, lookbackWindow: '72', retrainHours: '24', forecastHours: '12', sensitivity: '85' }
  reportSections.value = { overview: true, topology: true, devices: true, alarms: true, prediction: true, logs: true }
}

// 阈值条可视化百分比
const thresholdBarSegments = computed(() => {
  const w = Number(healthThreshold.value.warningThreshold)
  const f = Number(healthThreshold.value.faultThreshold)
  return { fault: f, warning: w - f, normal: 100 - w }
})

// -- 数据管理 --
const storageStats = ref([
  { label: '数据库', used: 136, total: 200, unit: 'GB', detail: '' },
  { label: '日志数据', used: 45, total: 0, unit: 'GB', detail: '1,234,567 条' },
  { label: '健康度数据', used: 82, total: 0, unit: 'GB', detail: '5,678,901 条' },
  { label: '备份存储', used: 24, total: 200, unit: 'GB', detail: '' },
])

const autoBackupConfig = ref({
  enabled: true,
  cycle: 'daily',
  time: '02:00',
  keepCount: '7',
  path: '/data/backup/',
})

interface BackupRecord {
  time: string
  type: '自动' | '手动'
  size: string
  status: 'success' | 'failed'
}

const backupRecords = ref<BackupRecord[]>([
  { time: '2026-01-20 02:00', type: '自动', size: '2.3 GB', status: 'success' },
  { time: '2026-01-19 02:00', type: '自动', size: '2.2 GB', status: 'success' },
  { time: '2026-01-18 14:30', type: '手动', size: '2.2 GB', status: 'success' },
  { time: '2026-01-18 02:00', type: '自动', size: '2.1 GB', status: 'success' },
  { time: '2026-01-17 02:00', type: '自动', size: '2.1 GB', status: 'success' },
])
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const buildReportFilename = (ext: string) => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')
  const base = (sysConfig.value.name || '监控分析报告').replace(/[\\/:*?"<>|]/g, '_')
  return `${base}_${timestamp}.${ext}`
}

const buildMonitoringReportData = () => ({
  title: `${sysConfig.value.name || '监控分析报告'} - 监控分析报告`,
  exportTime: new Date().toLocaleString('zh-CN'),
  systemHealth: systemHealth.value,
  onlineDevices: onlineDevices.value,
  totalDevices: totalDevices.value,
  activeAlarmCount: alarmCount.value,
  devices: monitorStore.devices.map(device => ({
    id: device.id,
    name: device.name,
    type: device.type,
    kp: device.kp,
    status: device.status,
    inputPower: device.inputPower,
    outputPower: device.outputPower,
    temperature: device.temperature,
    osnr: device.osnr,
    ber: device.ber,
  })),
  alarms: monitorStore.alarmHistory.slice(0, 50).map(alarm => ({
    id: alarm.id,
    time: alarm.time,
    device: alarm.device,
    level: alarm.level,
    status: alarm.status,
    message: alarm.message,
  })),
  interpolation: {
    enabled: interpolationConfig.value.enabled,
    method: interpolationConfig.value.method,
    maxGap: Number(interpolationConfig.value.maxGap),
    confidence: Number(interpolationConfig.value.confidence),
  },
  prediction: {
    lstmEnabled: predictionConfig.value.lstmEnabled,
    dynamicBaselineEnabled: predictionConfig.value.dynamicBaselineEnabled,
    lookbackWindow: Number(predictionConfig.value.lookbackWindow),
    retrainHours: Number(predictionConfig.value.retrainHours),
    forecastHours: Number(predictionConfig.value.forecastHours),
    sensitivity: Number(predictionConfig.value.sensitivity),
  },
  logs: appStore.logs.slice(-50).map(log => ({
    time: log.time,
    level: log.level,
    type: log.category || '系统日志',
    object: log.deviceName || log.deviceId || '-',
    content: log.message,
  })),
})

const exportSystemLogs = (format: 'txt' | 'csv' = 'txt') => {
  appStore.exportLogs(format)
  appStore.showNotification({
    type: 'success',
    message: format === 'csv' ? '系统日志已导出为 CSV' : '系统日志已导出',
  })
}

const exportMonitoringAnalysisReport = (format: 'pdf' | 'word' | 'html' = 'pdf') => {
  const html = generateMonitoringReportHtml(buildMonitoringReportData(), reportSections.value)

  if (format === 'pdf') {
    const win = window.open('', '_blank')
    if (!win) {
      appStore.showNotification({ type: 'error', message: '无法打开打印窗口，请检查浏览器拦截设置' })
      return
    }
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 300)
  } else if (format === 'word') {
    const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body>${html}</body></html>`
    downloadBlob(new Blob([docHtml], { type: 'application/msword;charset=utf-8' }), buildReportFilename('doc'))
  } else {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), buildReportFilename('html'))
  }

  appStore.addLog('INFO', `监控分析报告已导出: ${format.toUpperCase()}`)
  appStore.showNotification({ type: 'success', message: `监控分析报告已导出为 ${format.toUpperCase()}` })
}

const saveMonitoringConfig = () => {
  appStore.addLog('INFO', '监控中心配置已保存')
  appStore.showNotification({ type: 'success', message: '监控配置已保存，插值与预测设置已生效' })
}

const runBackupNow = () => {
  backupRecords.value.unshift({
    time: new Date().toLocaleString('zh-CN'),
    type: '手动',
    size: '2.4 GB',
    status: 'success',
  })
  backupRecords.value = backupRecords.value.slice(0, 10)
  appStore.addLog('INFO', '已创建监控数据手动备份')
  appStore.showNotification({ type: 'success', message: '已创建手动备份记录' })
}
</script>

<template>
  <div class="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
    <Card class="flex-1 flex flex-col bg-white dark:bg-gray-900 rounded-none border-0 shadow-none overflow-hidden">
      <!-- Header -->
      <CardHeader class="flex items-center justify-between border-b shrink-0">
        <div>
          <div class="flex items-center gap-3">
            <Activity class="w-5 h-5 text-primary" />
            <span class="font-semibold text-lg">监控中心</span>
          </div>
          <div class="text-xs text-gray-400 mt-0.5 ml-8">设备监控 · 状态总览 · 历史告警</div>
        </div>
      </CardHeader>

        <!-- Tab bar -->
        <div class="flex border-b shrink-0">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="[
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? ''
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            ]"
            :style="activeTab === tab.id ? { borderColor: 'var(--app-primary-color)', color: 'var(--app-primary-color)' } : {}"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
          </button>
        </div>

        <!-- Content -->
        <CardContent class="flex-1 overflow-auto p-5">

          <!-- =============== 监控总览 =============== -->
          <div v-if="activeTab === 'overview'" class="space-y-5">
            <!-- 顶部统计卡片 -->
            <div class="grid grid-cols-3 gap-4">
              <!-- 系统健康度 -->
              <div class="bg-gradient-to-br from-blue-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl border p-5 flex flex-col items-center">
                <svg viewBox="0 0 200 160" class="w-40 h-32">
                  <path :d="gaugeBgArc" fill="none" stroke="#e5e7eb" stroke-width="14" stroke-linecap="round"/>
                  <path :d="gaugeArc" fill="none" :stroke="gaugeColor" stroke-width="14" stroke-linecap="round"/>
                  <text x="100" y="95" text-anchor="middle" class="text-3xl font-bold" :fill="gaugeColor" font-size="32">
                    {{ systemHealth }}%
                  </text>
                  <text x="100" y="118" text-anchor="middle" fill="#6b7280" font-size="12">系统健康度</text>
                </svg>
                <p :class="['text-sm font-medium mt-1', healthStatus.color]">{{ healthStatus.text }}</p>
                <p class="text-xs text-gray-400 mt-1">较24小时前 <span class="text-green-500">↑ 0.5%</span></p>
              </div>

              <!-- 设备在线率 & 告警数 -->
              <div class="space-y-4">
                <div class="bg-gradient-to-br from-green-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl border p-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm text-gray-500">设备在线率</span>
                    <Monitor class="w-4 h-4 text-green-500" />
                  </div>
                  <div class="text-2xl font-bold text-gray-800 dark:text-gray-100">{{ onlineDevices }}/{{ totalDevices }}</div>
                  <div class="text-xs text-gray-400 mt-1">在线率 {{ onlineRate }}</div>
                </div>
                <div class="bg-gradient-to-br from-red-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl border p-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm text-gray-500">活跃告警</span>
                    <AlertTriangle class="w-4 h-4 text-red-500" />
                  </div>
                  <div class="text-2xl font-bold text-gray-800 dark:text-gray-100">{{ alarmCount }}</div>
                  <div class="text-xs text-gray-400 mt-1">故障 {{ alarmStats.fault }} · 预警 {{ alarmStats.warning }}</div>
                </div>
              </div>

              <!-- 健康度分布 -->
              <div class="bg-gradient-to-br from-purple-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl border p-4">
                <div class="text-sm text-gray-500 mb-3">健康度分布</div>
                <div class="space-y-3">
                  <div v-for="item in healthDistribution" :key="item.label" class="space-y-1">
                    <div class="flex justify-between text-xs">
                      <span class="text-gray-600 dark:text-gray-300">{{ item.label }}</span>
                      <span class="text-gray-500">{{ item.count }} 台 ({{ item.percent }}%)</span>
                    </div>
                    <div class="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div :class="[item.color, 'h-full rounded-full transition-all']" :style="{ width: item.percent + '%' }"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 设备状态列表 -->
            <Card>
              <CardContent class="p-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="font-semibold text-gray-700 dark:text-gray-200">设备运行状态</h4>
                  <Button variant="outline" size="sm"><RefreshCw class="w-3.5 h-3.5 mr-1"/> 刷新</Button>
                </div>
                <div class="border rounded-lg overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-50 dark:bg-white/5">
                      <tr>
                        <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">设备名称</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">类型</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">位置</th>
                        <th class="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">状态</th>
                        <th class="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">温度</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="monitorStore.devices.length === 0">
                        <td colspan="5" class="px-3 py-6 text-center text-gray-400">暂无设备数据</td>
                      </tr>
                      <tr v-for="device in monitorStore.devices.slice(0, 8)" :key="device.id"
                          class="border-t hover:bg-gray-50 dark:hover:bg-white/5">
                        <td class="px-3 py-2 font-medium text-gray-700 dark:text-gray-200">{{ device.name }}</td>
                        <td class="px-3 py-2 text-gray-500">{{ device.type }}</td>
                        <td class="px-3 py-2 text-gray-500">{{ device.location }}</td>
                        <td class="px-3 py-2 text-center">
                          <span :class="['px-2 py-0.5 rounded-full text-xs font-medium', getStatusBadge(device.status)]">
                            {{ getStatusText(device.status) }}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-center text-gray-500">{{ device.temperature.toFixed(1) }}°C</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- =============== 设备监控 =============== -->
          <div v-if="activeTab === 'device'" class="space-y-4">
            <!-- 筛选栏 -->
            <div class="flex items-center gap-3 flex-wrap">
              <div class="flex items-center gap-2">
                <Filter class="w-4 h-4 text-gray-400" />
                <Input v-model="deviceFilter.deviceId" placeholder="搜索设备ID/名称" class="w-48"/>
              </div>
              <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                <button
                  v-for="btn in statusButtons"
                  :key="btn.value"
                  :class="[
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    deviceFilter.statusFilter === btn.value
                      ? 'bg-white dark:bg-gray-700 text-primary shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  ]"
                  @click="deviceFilter.statusFilter = btn.value"
                >
                  {{ btn.label }}
                </button>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm"><Download class="w-3.5 h-3.5 mr-1"/> 导出</Button>
                <Button variant="outline" size="sm"><RefreshCw class="w-3.5 h-3.5 mr-1"/> 刷新</Button>
              </div>
            </div>

            <!-- 模块表格 -->
            <div class="border rounded-lg overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-white/5">
                  <tr>
                    <th class="text-left px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">模块ID</th>
                    <th class="text-left px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">设备</th>
                    <th class="text-left px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">时间</th>
                    <th class="text-left px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">模块类型</th>
                    <th class="text-left px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">性能</th>
                    <th class="text-center px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">状态</th>
                    <th class="text-center px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">健康度</th>
                    <th class="text-left px-3 py-2.5 font-medium text-gray-600 dark:text-gray-300">备注</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="filteredModules.length === 0">
                    <td colspan="8" class="px-3 py-8 text-center text-gray-400">暂无匹配的模块数据</td>
                  </tr>
                  <tr v-for="m in filteredModules" :key="m.id"
                      class="border-t hover:bg-gray-50 dark:hover:bg-white/5">
                    <td class="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">{{ m.id.slice(0, 8) }}</td>
                    <td class="px-3 py-2 text-gray-700 dark:text-gray-200">{{ m.deviceName }}</td>
                    <td class="px-3 py-2 text-gray-500 text-xs">{{ m.time }}</td>
                    <td class="px-3 py-2 text-gray-600 dark:text-gray-300">{{ m.moduleType }}</td>
                    <td class="px-3 py-2 text-gray-600 dark:text-gray-300 font-mono text-xs">{{ m.performance }}</td>
                    <td class="px-3 py-2 text-center">
                      <span :class="['px-2 py-0.5 rounded-full text-xs font-medium', getStatusBadge(m.status)]">
                        {{ getStatusText(m.status) }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-center">
                      <div class="flex items-center justify-center gap-1.5">
                        <div class="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            :class="[m.health >= 80 ? 'bg-green-500' : m.health >= 50 ? 'bg-yellow-500' : 'bg-red-500', 'h-full rounded-full']"
                            :style="{ width: m.health + '%' }"
                          ></div>
                        </div>
                        <span class="text-xs text-gray-500">{{ m.health }}%</span>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-gray-500 text-xs">{{ m.remark }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- =============== 告警管理 =============== -->
          <div v-if="activeTab === 'alarm'" class="space-y-4">

            <!-- ===== 告警详情视图 ===== -->
            <div v-if="alarmDetailView" class="space-y-4">
              <!-- 返回 + 标题 -->
              <div class="flex items-center gap-3">
                <button class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" @click="closeAlarmDetail">
                  <ArrowLeft class="w-4 h-4" /> 返回告警列表
                </button>
                <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">告警详情 - {{ alarmDetailView.objectId }}</span>
                <span :class="['ml-2 px-2 py-0.5 rounded-full text-xs font-medium', alarmDetailView.level === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700']">
                  {{ alarmDetailView.alarmType }}
                </span>
              </div>

              <!-- 基本信息 -->
              <Card>
                <CardContent class="p-4">
                  <h4 class="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-3">告警基本信息</h4>
                  <div class="grid grid-cols-4 gap-x-6 gap-y-2.5 text-sm">
                    <div><span class="text-gray-400">告警对象</span><div class="font-medium text-gray-700 dark:text-gray-200">{{ alarmDetailView.objectLabel }}</div></div>
                    <div><span class="text-gray-400">对象类型</span><div class="text-gray-600 dark:text-gray-300">{{ alarmDetailView.objectType }}</div></div>
                    <div><span class="text-gray-400">告警级别</span><div :class="alarmDetailView.level === 'error' ? 'text-red-600 font-medium' : 'text-yellow-600 font-medium'">{{ alarmDetailView.alarmType }} / {{ alarmDetailView.severity }}</div></div>
                    <div><span class="text-gray-400">模块类型</span><div class="text-gray-600 dark:text-gray-300">{{ alarmDetailView.moduleType }}</div></div>
                    <div><span class="text-gray-400">发生时间</span><div class="text-gray-600 dark:text-gray-300">{{ alarmDetailView.time }}</div></div>
                    <div><span class="text-gray-400">恢复时间</span><div class="text-gray-600 dark:text-gray-300">{{ alarmDetailView.recoveryTime || '--' }}</div></div>
                    <div><span class="text-gray-400">持续时长</span><div class="text-gray-600 dark:text-gray-300">{{ alarmDetailView.duration }}</div></div>
                    <div><span class="text-gray-400">当前状态</span><div :class="alarmDetailView.status === '故障中' ? 'text-red-600 font-medium' : 'text-green-600'">{{ alarmDetailView.status }}</div></div>
                    <div class="col-span-3"><span class="text-gray-400">故障描述</span><div class="text-gray-600 dark:text-gray-300">{{ alarmDetailView.faultDesc }} - {{ alarmDetailView.alarmDesc }}</div></div>
                    <div><span class="text-gray-400">健康度</span>
                      <div class="flex items-center gap-2 mt-0.5">
                        <div class="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div :class="[getHealthBarColor(alarmDetailView.health), 'h-full rounded-full']" :style="{ width: alarmDetailView.health + '%' }"></div>
                        </div>
                        <span class="text-sm font-mono font-medium" :class="alarmDetailView.health < 40 ? 'text-red-600' : alarmDetailView.health < 70 ? 'text-yellow-600' : 'text-green-600'">{{ alarmDetailView.health }}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <!-- 设备面板可视化 -->
              <Card>
                <CardContent class="p-4">
                  <h4 class="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-3">设备面板可视化</h4>
                  <div class="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                    <div class="text-xs text-gray-400 mb-2">{{ alarmDetailView.device }} - 模块布局</div>
                    <div class="grid grid-cols-6 gap-2">
                      <div v-for="mod in devicePanelModules" :key="mod.name"
                        :class="[
                          'rounded-lg border-2 p-3 text-center text-xs font-medium transition-all cursor-pointer',
                          mod.isAlarm ? 'border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 shadow-sm shadow-red-200' :
                          mod.isWarning ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                          'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        ]">
                        <div class="text-lg mb-1">{{ mod.isAlarm ? '⚠️' : mod.isWarning ? '⚡' : '✅' }}</div>
                        {{ mod.name }}
                        <div class="text-[10px] mt-0.5 opacity-70">{{ mod.isAlarm ? '告警' : mod.isWarning ? '预警' : '正常' }}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <!-- 性能参数波形回放 -->
              <Card>
                <CardContent class="p-4">
                  <h4 class="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-3">性能参数波形回放</h4>
                  <div class="grid grid-cols-3 gap-4">
                    <div v-for="(param, key) in { voltage: '电压 (V)', power: '光功率 (dBm)', temperature: '温度 (°C)' }" :key="key" class="border rounded-lg p-3">
                      <div class="text-xs text-gray-500 mb-1">{{ param }}</div>
                      <svg viewBox="0 0 300 65" class="w-full h-12">
                        <polyline :points="(perfSvgPoints as any)[key]" fill="none" stroke="var(--app-primary-color)" stroke-width="1.5" stroke-linejoin="round" />
                        <line x1="10" y1="55" x2="290" y2="55" stroke="#e5e7eb" stroke-width="0.5" />
                        <line x1="10" y1="32" x2="290" y2="32" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="4" />
                        <line x1="10" y1="10" x2="290" y2="10" stroke="#e5e7eb" stroke-width="0.5" />
                      </svg>
                      <div class="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>0h</span><span>12h</span><span>24h</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <!-- 健康度变化曲线 -->
              <Card>
                <CardContent class="p-4">
                  <h4 class="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-3">健康度变化曲线</h4>
                  <div class="border rounded-lg p-3">
                    <svg viewBox="0 0 300 65" class="w-full h-16">
                      <defs><linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--app-primary-color)" stop-opacity="0.2"/><stop offset="100%" stop-color="var(--app-primary-color)" stop-opacity="0"/></linearGradient></defs>
                      <polyline :points="healthSvgPoints" fill="none" stroke="var(--app-primary-color)" stroke-width="2" stroke-linejoin="round" />
                      <line x1="10" y1="55" x2="290" y2="55" stroke="#e5e7eb" stroke-width="0.5" />
                      <line x1="10" y1="32" x2="290" y2="32" stroke="#fbbf24" stroke-width="0.5" stroke-dasharray="4" />
                      <text x="292" y="35" font-size="6" fill="#fbbf24">预警线</text>
                    </svg>
                    <div class="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>当前</span><span>12h前</span><span>24h前</span></div>
                  </div>
                </CardContent>
              </Card>

              <!-- 关联日志分析 -->
              <Card>
                <CardContent class="p-4 space-y-3">
                  <div class="flex items-center justify-between">
                    <h4 class="font-semibold text-sm text-gray-700 dark:text-gray-200">关联日志分析</h4>
                    <div class="flex items-center gap-3">
                      <!-- 获取模式切换 -->
                      <span class="text-xs text-gray-400">获取模式：</span>
                      <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                        <button :class="['px-2.5 py-1 text-xs font-medium rounded-md transition-colors', logAnalysisMode === 'smart' ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700']" @click="logAnalysisMode = 'smart'">智能推荐</button>
                        <button :class="['px-2.5 py-1 text-xs font-medium rounded-md transition-colors', logAnalysisMode === 'custom' ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700']" @click="logAnalysisMode = 'custom'">自定义筛选</button>
                      </div>
                    </div>
                  </div>

                  <!-- 智能推荐模式提示 -->
                  <div v-if="logAnalysisMode === 'smart'" class="border rounded-lg bg-blue-50/50 dark:bg-blue-900/10 p-2.5 flex items-start gap-2 text-xs">
                    <Info class="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <span class="text-gray-600 dark:text-gray-300">系统识别到 <strong>{{ smartRecommendedLogs.length }}</strong> 条可能相关的日志，包含 <span v-for="(s, si) in logStats" :key="si"><span v-if="si > 0">、</span>{{ s.count }}条{{ s.type }}</span></span>
                  </div>

                  <!-- 自定义筛选条件 -->
                  <div v-if="logAnalysisMode === 'custom'" class="border rounded-lg p-3 space-y-2.5 text-xs">
                    <div class="flex items-center gap-4 flex-wrap">
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">关联范围：</span>
                        <div class="flex gap-1">
                          <button v-for="s in [{v:'device',l:'同一设备'},{v:'link',l:'同一链路'},{v:'module',l:'同一模块'},{v:'global',l:'全局'}]" :key="s.v"
                            :class="['px-2 py-1 rounded border text-xs', logFilter.scope === s.v ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300']"
                            @click="logFilter.scope = s.v">{{ s.l }}</button>
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">时间范围：</span>
                        <span class="text-gray-400">告警前</span>
                        <div class="w-20"><Select v-model="logFilter.timeBefore" :options="[{value:'15',label:'15分钟'},{value:'30',label:'30分钟'},{value:'60',label:'60分钟'}]" /></div>
                        <span class="text-gray-400">~ 告警后</span>
                        <div class="w-20"><Select v-model="logFilter.timeAfter" :options="[{value:'15',label:'15分钟'},{value:'30',label:'30分钟'},{value:'60',label:'60分钟'}]" /></div>
                      </div>
                    </div>
                    <div class="flex items-center gap-4 flex-wrap">
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">日志类型：</span>
                        <label v-for="t in [{v:'alarm',l:'告警日志'},{v:'operation',l:'操作日志'},{v:'device',l:'设备日志'},{v:'link',l:'链路日志'},{v:'system',l:'系统日志'}]" :key="t.v"
                          class="flex items-center gap-1 cursor-pointer" @click="toggleLogType(t.v)">
                          <span :class="['w-3.5 h-3.5 rounded border flex items-center justify-center', logFilter.logTypes.includes(t.v) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600']">
                            <CheckCircle v-if="logFilter.logTypes.includes(t.v)" class="w-2.5 h-2.5 text-white" />
                          </span>
                          <span class="text-gray-600 dark:text-gray-300">{{ t.l }}</span>
                        </label>
                      </div>
                    </div>
                    <div class="flex items-center gap-4 flex-wrap">
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">日志级别：</span>
                        <label v-for="lv in [{v:'info',l:'INFO'},{v:'warning',l:'WARNING'},{v:'error',l:'ERROR'}]" :key="lv.v"
                          class="flex items-center gap-1 cursor-pointer" @click="toggleLogLevel(lv.v)">
                          <span :class="['w-3.5 h-3.5 rounded border flex items-center justify-center', logFilter.logLevels.includes(lv.v) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600']">
                            <CheckCircle v-if="logFilter.logLevels.includes(lv.v)" class="w-2.5 h-2.5 text-white" />
                          </span>
                          <span class="text-gray-600 dark:text-gray-300">{{ lv.l }}</span>
                        </label>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">关键字：</span>
                        <Input v-model="logFilter.keyword" placeholder="搜索日志内容" class="w-40" />
                      </div>
                    </div>
                  </div>

                  <!-- 日志表格 -->
                  <div class="border rounded-lg overflow-hidden">
                    <table class="w-full text-xs">
                      <thead class="bg-gray-50 dark:bg-white/5">
                        <tr>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">时间</th>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">类型</th>
                          <th class="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">级别</th>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">对象</th>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">内容</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-if="displayedLogs.length === 0">
                          <td colspan="5" class="px-3 py-6 text-center text-gray-400">暂无匹配的关联日志</td>
                        </tr>
                        <tr v-for="(log, li) in displayedLogs" :key="li" :class="['border-t', log.isCurrent ? 'bg-red-50/50 dark:bg-red-900/10' : '']">
                          <td class="px-3 py-2 text-gray-500 whitespace-nowrap">{{ log.time }}</td>
                          <td class="px-3 py-2">
                            <span :class="['px-1.5 py-0.5 rounded text-[10px] font-medium',
                              log.type === '告警日志' ? 'bg-red-100 text-red-700' :
                              log.type === '设备日志' ? 'bg-blue-100 text-blue-700' :
                              log.type === '操作日志' ? 'bg-green-100 text-green-700' :
                              log.type === '系统日志' ? 'bg-gray-100 text-gray-700' :
                              'bg-purple-100 text-purple-700'
                            ]">{{ log.type }}</span>
                          </td>
                          <td class="px-3 py-2 text-center">
                            <span :class="['px-1.5 py-0.5 rounded text-[10px]',
                              log.level === 'error' ? 'bg-red-500 text-white' :
                              log.level === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                              'text-gray-400'
                            ]">{{ log.level === 'error' ? '故障' : log.level === 'warning' ? '预警' : 'INFO' }}</span>
                          </td>
                          <td class="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{{ log.object }}</td>
                          <td class="px-3 py-2 text-gray-600 dark:text-gray-300">
                            {{ log.content }}
                            <span v-if="log.isCurrent" class="ml-1 text-[10px] text-red-500 font-medium">← 当前告警</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <!-- 统计 + 推荐原因 -->
                  <div class="flex items-start gap-4">
                    <!-- 统计 -->
                    <div class="text-xs text-gray-400 shrink-0">
                      统计：<span v-for="(s, si) in logStats" :key="si"><span v-if="si > 0"> | </span>{{ s.type }} {{ s.count }}条</span>
                    </div>
                  </div>

                  <!-- 智能推荐原因 -->
                  <div v-if="logAnalysisMode === 'smart'" class="border rounded-lg bg-amber-50/50 dark:bg-amber-900/10 p-2.5 space-y-1.5">
                    <div class="text-xs font-medium text-gray-600 dark:text-gray-300">推荐原因：</div>
                    <div v-for="(r, ri) in smartRecommendReasons" :key="ri" class="flex items-start gap-1.5 text-xs text-gray-500">
                      <span class="text-gray-400">·</span>
                      <span><strong class="text-gray-600 dark:text-gray-300">{{ r.type }}</strong>：{{ r.desc }}</span>
                    </div>
                  </div>

                  <!-- 操作按钮 -->
                  <div class="flex items-center gap-2">
                    <Button variant="outline" size="sm" @click="logTimelineVisible = !logTimelineVisible">
                      <Clock class="w-3.5 h-3.5 mr-1" /> {{ logTimelineVisible ? '隐藏时间轴' : '查看日志时间轴' }}
                    </Button>
                    <Button variant="outline" size="sm" @click="saveMonitoringConfig">
                      <Download class="w-3.5 h-3.5 mr-1" /> 导出日志
                    </Button>
                  </div>

                  <!-- 日志时间轴 -->
                  <div v-if="logTimelineVisible" class="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 space-y-3">
                    <div class="flex items-center justify-between">
                      <h5 class="text-xs font-semibold text-gray-700 dark:text-gray-200">关联日志时间轴</h5>
                      <button class="text-xs text-gray-400 hover:text-gray-600" @click="logTimelineVisible = false">× 关闭</button>
                    </div>
                    <div class="space-y-1">
                      <div v-for="row in logTimelineData" :key="row.type" class="flex items-center h-8">
                        <div class="w-20 shrink-0 text-[10px] text-gray-500 text-right pr-2 truncate">{{ row.type }}</div>
                        <div class="flex-1 relative h-4 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                          <div v-for="(evt, ei) in row.events" :key="ei"
                            :class="['absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-700',
                              evt.isCurrent ? 'bg-red-500 w-3 h-3 ring-2 ring-red-200' :
                              evt.level === 'error' ? 'bg-red-500' :
                              evt.level === 'warning' ? 'bg-yellow-500' : 'bg-blue-400'
                            ]"
                            :style="{ left: evt.pct + '%' }"
                            :title="`${evt.time} ${evt.content}`"
                          ></div>
                        </div>
                      </div>
                    </div>
                    <!-- 分析提示 -->
                    <div v-if="logAnalysisMode === 'smart'" class="text-[11px] text-gray-500 space-y-0.5 border-t pt-2">
                      <div>💡 分析提示：</div>
                      <div>· 电源参数配置变更后，数分钟内出现电源波动预警</div>
                      <div>· PSU预警发生后，{{ alarmDetailView?.moduleType }}模块触发{{ alarmDetailView?.faultDesc }}故障</div>
                      <div>· 建议检查配置变更内容，并核查电源模块状态</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <!-- ===== 告警列表/时间轴视图 ===== -->
            <template v-else>
              <!-- 子标签: 实时告警 / 历史告警 -->
              <div class="flex gap-4">
                <button
                  :class="['text-sm font-medium pb-1 border-b-2 transition-colors',
                    alarmSubTab === 'realtime' ? '' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300']"
                  :style="alarmSubTab === 'realtime' ? { borderColor: 'var(--app-primary-color)', color: 'var(--app-primary-color)' } : {}"
                  @click="alarmSubTab = 'realtime'"
                >实时告警</button>
                <button
                  :class="['text-sm font-medium pb-1 border-b-2 transition-colors',
                    alarmSubTab === 'history' ? '' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300']"
                  :style="alarmSubTab === 'history' ? { borderColor: 'var(--app-primary-color)', color: 'var(--app-primary-color)' } : {}"
                  @click="alarmSubTab = 'history'"
                >历史告警</button>
              </div>

              <!-- 告警统计卡片 -->
              <div class="grid grid-cols-3 gap-3">
                <div class="rounded-xl border border-red-200 dark:border-red-800 bg-gradient-to-b from-red-50 to-white dark:from-red-900/20 dark:to-gray-900 p-4 text-center">
                  <div class="text-3xl font-bold text-red-500 mb-1">{{ alarmStats.fault }}</div>
                  <div class="text-xs text-gray-500">故障告警</div>
                </div>
                <div class="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-gradient-to-b from-yellow-50 to-white dark:from-yellow-900/20 dark:to-gray-900 p-4 text-center">
                  <div class="text-3xl font-bold text-yellow-500 mb-1">{{ alarmStats.warning }}</div>
                  <div class="text-xs text-gray-500">预警告警</div>
                </div>
                <div class="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-b from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-900 p-4 text-center">
                  <div class="text-3xl font-bold text-blue-500 mb-1">{{ alarmStats.active }}</div>
                  <div class="text-xs text-gray-500">活跃告警</div>
                </div>
              </div>

              <!-- 视图模式切换 -->
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-500">视图模式：</span>
                <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button
                    :class="['px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      alarmViewMode === 'list' ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700']"
                    @click="alarmViewMode = 'list'"
                  >列表视图</button>
                  <button
                    :class="['px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      alarmViewMode === 'timeline' ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700']"
                    @click="alarmViewMode = 'timeline'"
                  >时间轴视图</button>
                </div>
              </div>

              <!-- ========= 列表视图 ========= -->
              <div v-if="alarmViewMode === 'list'" class="space-y-3">
                <!-- 筛选栏 -->
                <div class="flex items-center gap-2 flex-wrap">
                  <div class="flex items-center gap-1.5">
                    <Filter class="w-3.5 h-3.5 text-gray-400" />
                    <div class="w-28"><Select v-model="alarmListFilter.timeRange" :options="[{ value: 'all', label: '全部时间' }, { value: 'today', label: '今天' }, { value: '7d', label: '最近7天' }, { value: '30d', label: '最近30天' }]" /></div>
                  </div>
                  <div class="w-24"><Select v-model="alarmListFilter.level" :options="[{ value: 'all', label: '全部级别' }, { value: 'error', label: '故障' }, { value: 'warning', label: '预警' }]" /></div>
                  <div class="w-24"><Select v-model="alarmListFilter.objectType" :options="[{ value: 'all', label: '全部类型' }, { value: '设备', label: '设备' }, { value: '模块', label: '模块' }, { value: '端口', label: '端口' }]" /></div>
                  <div class="w-28"><Select v-model="alarmListFilter.faultType" :options="[{ value: 'all', label: '全部故障' }, { value: '通信异常', label: '通信异常' }, { value: '电压异常', label: '电压异常' }, { value: '温度异常', label: '温度异常' }, { value: '功率异常', label: '功率异常' }]" /></div>
                  <div class="flex items-center gap-1.5">
                    <Search class="w-3.5 h-3.5 text-gray-400" />
                    <Input v-model="alarmListFilter.searchText" placeholder="对象ID/名称搜索" class="w-40" />
                  </div>
                </div>

                <!-- 表格 -->
                <div class="border rounded-lg overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead class="bg-gray-50 dark:bg-white/5">
                      <tr>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">对象标识</th>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">告警时间</th>
                        <th v-if="alarmSubTab === 'history'" class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">恢复时间</th>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">持续时长</th>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">对象类型</th>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">模块类型</th>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">故障类型</th>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">告警级别</th>
                        <th class="text-left px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 min-w-[140px]">告警描述</th>
                        <th class="text-center px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">当前状态<br/>健康度</th>
                        <th class="text-center px-2.5 py-2.5 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="filteredAlarmDetails.length === 0">
                        <td :colspan="alarmSubTab === 'history' ? 11 : 10" class="px-3 py-8 text-center text-gray-400 text-sm">
                          暂无{{ alarmSubTab === 'realtime' ? '实时' : '历史' }}告警
                        </td>
                      </tr>
                      <tr v-for="a in filteredAlarmDetails" :key="a.id"
                          class="border-t hover:bg-gray-50 dark:hover:bg-white/5 align-top">
                        <td class="px-2.5 py-2.5">
                          <div class="font-semibold text-gray-800 dark:text-gray-100">{{ a.objectId }}</div>
                          <div class="text-gray-400 mt-0.5 leading-tight">{{ a.objectLabel }}</div>
                        </td>
                        <td class="px-2.5 py-2.5 text-gray-500 whitespace-nowrap">{{ a.time }}</td>
                        <td v-if="alarmSubTab === 'history'" class="px-2.5 py-2.5 text-gray-500 whitespace-nowrap">{{ a.recoveryTime || '--' }}</td>
                        <td class="px-2.5 py-2.5 text-gray-500 whitespace-nowrap">{{ a.duration }}</td>
                        <td class="px-2.5 py-2.5 text-gray-600 dark:text-gray-300">{{ a.objectType }}</td>
                        <td class="px-2.5 py-2.5 text-gray-600 dark:text-gray-300">{{ a.moduleType }}</td>
                        <td class="px-2.5 py-2.5 text-gray-600 dark:text-gray-300">{{ a.faultType }}</td>
                        <td class="px-2.5 py-2.5">
                          <span :class="['font-medium', a.level === 'error' ? 'text-red-600' : 'text-yellow-600']">{{ a.alarmType }}</span>
                        </td>
                        <td class="px-2.5 py-2.5 text-gray-500 leading-relaxed">{{ a.alarmDesc }}</td>
                        <td class="px-2.5 py-2.5 text-center">
                          <div class="flex flex-col items-center gap-1">
                            <span :class="['text-xs font-medium', a.status === '故障中' ? 'text-red-600' : 'text-green-600']">{{ a.status }}</span>
                            <div class="flex items-center gap-1.5 w-full justify-center">
                              <div class="w-14 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div :class="[getHealthBarColor(a.health), 'h-full rounded-full']" :style="{ width: a.health + '%' }"></div>
                              </div>
                              <span class="text-gray-500 font-mono">{{ a.health }}%</span>
                            </div>
                          </div>
                        </td>
                        <td class="px-2.5 py-2.5 text-center">
                          <button class="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-white" style="background-color: var(--app-primary-color)" @click="openAlarmDetail(a)">
                            <Eye class="w-3 h-3" /> 查看
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- ========= 时间轴视图 ========= -->
              <div v-if="alarmViewMode === 'timeline'" class="space-y-4">
                <!-- 筛选栏 -->
                <div class="flex items-center gap-4 flex-wrap text-sm">
                  <div class="flex items-center gap-1.5">
                    <span class="text-gray-500 whitespace-nowrap">聚合方式：</span>
                    <div class="w-32"><Select v-model="timelineFilter.groupBy" :options="[{ value: 'device', label: '按设备' }, { value: 'module', label: '按模块/板卡' }, { value: 'link', label: '按链路' }, { value: 'timeWindow', label: '按时间窗口' }]" /></div>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-gray-500 whitespace-nowrap">对象：</span>
                    <div class="w-20"><Select v-model="timelineFilter.target" :options="[{ value: 'all', label: '全部' }]" /></div>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-gray-500 whitespace-nowrap">时间范围：</span>
                    <div class="w-32"><Select v-model="timelineFilter.timeRange" :options="[{ value: '24h', label: '最近24小时' }, { value: '12h', label: '最近12小时' }, { value: '7d', label: '最近7天' }]" /></div>
                  </div>
                </div>

                <!-- 时间轴图 -->
                <div class="border rounded-lg bg-white dark:bg-gray-900 p-4 relative">
                  <!-- 标题 + 图例 -->
                  <div class="flex items-center justify-between mb-4">
                    <h4 class="font-semibold text-sm text-gray-700 dark:text-gray-200">告警时间轴</h4>
                    <div class="flex items-center gap-4 text-xs text-gray-500">
                      <span class="flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> 故障告警
                      </span>
                      <span class="flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span> 预警告警
                      </span>
                      <span class="flex items-center gap-1.5">
                        <span class="w-6 h-1.5 rounded bg-gray-300 dark:bg-gray-600 inline-block"></span> 故障持续
                      </span>
                    </div>
                  </div>

                  <!-- X 轴时间刻度 -->
                  <div class="ml-24 flex justify-between text-xs text-gray-400 mb-2 pr-1">
                    <span v-for="h in timelineHours" :key="h">{{ String(h).padStart(2, '0') }}:00</span>
                  </div>

                  <!-- 时间轴行 -->
                  <div class="space-y-1">
                    <div v-for="(row, ri) in timelineRows" :key="row.label" class="flex items-center h-9">
                      <div class="w-24 shrink-0 text-xs text-gray-600 dark:text-gray-300 font-medium pr-3 text-right truncate">{{ row.label }}</div>
                      <div class="flex-1 relative h-5 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
                        <template v-for="(evt, ei) in row.events" :key="ei">
                          <div
                            v-if="evt.level === 'duration'"
                            class="absolute top-1/2 -translate-y-1/2 h-2 rounded bg-gray-300 dark:bg-gray-600"
                            :style="{ left: evt.startPct + '%', width: evt.widthPct + '%' }"
                          ></div>
                          <div
                            v-else
                            :class="[
                              'absolute top-1/2 -translate-y-1/2 h-3 rounded-sm cursor-pointer transition-all',
                              evt.level === 'error' ? 'bg-red-500 hover:bg-red-600' : 'bg-yellow-500 hover:bg-yellow-600',
                              timelineHoverEvt && timelineHoverEvt.rowIdx === ri && timelineHoverEvt.evtIdx === ei ? 'ring-2 ring-offset-1 ring-blue-400 h-4' : ''
                            ]"
                            :style="{ left: evt.startPct + '%', width: Math.max(evt.widthPct, 1.5) + '%' }"
                            @mouseenter="timelineHoverEvt = { rowIdx: ri, evtIdx: ei, x: evt.startPct, y: ri * 36 }"
                            @mouseleave="timelineHoverEvt = null"
                            @click="evt.alarm && openAlarmDetail(evt.alarm)"
                          ></div>
                        </template>
                      </div>
                    </div>
                    <div v-if="timelineRows.length === 0" class="text-center text-gray-400 py-8 text-sm">暂无告警时间轴数据</div>
                  </div>

                  <!-- 悬停提示框 -->
                  <div v-if="timelineHoverEvt && timelineRows[timelineHoverEvt.rowIdx]?.events[timelineHoverEvt.evtIdx]?.alarm"
                    class="absolute z-10 bg-white dark:bg-gray-800 border rounded-lg shadow-lg p-3 text-xs w-56 pointer-events-none"
                    :style="{ left: Math.min(timelineHoverEvt.x + 26, 70) + '%', top: (timelineHoverEvt.y + 60) + 'px' }">
                    <div class="font-semibold text-gray-700 dark:text-gray-200 mb-1">{{ timelineRows[timelineHoverEvt.rowIdx].events[timelineHoverEvt.evtIdx].alarm!.objectId }}</div>
                    <div class="text-gray-500">{{ timelineRows[timelineHoverEvt.rowIdx].events[timelineHoverEvt.evtIdx].alarm!.alarmDesc }}</div>
                    <div class="flex justify-between mt-1.5 text-gray-400">
                      <span>{{ timelineRows[timelineHoverEvt.rowIdx].events[timelineHoverEvt.evtIdx].alarm!.time }}</span>
                      <span :class="timelineRows[timelineHoverEvt.rowIdx].events[timelineHoverEvt.evtIdx].alarm!.level === 'error' ? 'text-red-500' : 'text-yellow-500'">
                        {{ timelineRows[timelineHoverEvt.rowIdx].events[timelineHoverEvt.evtIdx].alarm!.alarmType }}
                      </span>
                    </div>
                    <div class="text-gray-400 mt-1">点击查看详情</div>
                  </div>
                </div>

                <!-- 告警关联分析提示 -->
                <div v-if="correlationHints.length > 0" class="border rounded-lg bg-blue-50/50 dark:bg-blue-900/10 p-3 space-y-2">
                  <div class="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    告警关联分析
                  </div>
                  <div v-for="(hint, hi) in correlationHints" :key="hi" class="flex items-start gap-2 text-xs">
                    <span>{{ hint.icon }}</span>
                    <div>
                      <span class="font-medium text-gray-600 dark:text-gray-300">{{ hint.type }}：</span>
                      <span class="text-gray-500">{{ hint.message }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- =============== 系统管理 =============== -->
          <div v-if="activeTab === 'system'" class="space-y-4">
            <!-- 子模块 Tab -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button v-for="st in [{id:'logs' as const,label:'日志查询',icon:FileText},{id:'config' as const,label:'系统配置',icon:Settings},{id:'data' as const,label:'数据管理',icon:Database}]" :key="st.id"
                :class="['flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors', systemSubTab === st.id ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700']"
                @click="systemSubTab = st.id">
                <component :is="st.icon" class="w-4 h-4" /> {{ st.label }}
              </button>
            </div>

            <!-- ========= 日志查询 ========= -->
            <div v-if="systemSubTab === 'logs'" class="space-y-4">
              <!-- 查询条件 -->
              <Card>
                <CardContent class="p-4 space-y-3">
                  <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <Search class="w-4 h-4" /> 查询条件
                  </div>
                  <div class="flex items-center gap-3 flex-wrap text-xs">
                    <div class="flex items-center gap-1.5">
                      <span class="text-gray-500 whitespace-nowrap">时间范围：</span>
                      <div class="flex gap-1">
                        <button v-for="tr in [{v:'today',l:'今天'},{v:'7d',l:'近7天'},{v:'30d',l:'近30天'},{v:'all',l:'全部'}]" :key="tr.v"
                          :class="['px-2 py-1 rounded border text-xs', sysLogFilter.timeRange === tr.v ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300']"
                          @click="sysLogFilter.timeRange = tr.v">{{ tr.l }}</button>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 flex-wrap text-xs">
                    <div class="flex items-center gap-1.5">
                      <span class="text-gray-500 whitespace-nowrap">日志级别：</span>
                      <div class="w-24"><Select v-model="sysLogFilter.level" :options="[{value:'all',label:'全部'},{value:'INFO',label:'INFO'},{value:'WARN',label:'WARN'},{value:'ERROR',label:'ERROR'}]" /></div>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class="text-gray-500 whitespace-nowrap">日志类型：</span>
                      <div class="w-24"><Select v-model="sysLogFilter.type" :options="[{value:'all',label:'全部'},{value:'系统日志',label:'系统日志'},{value:'链路日志',label:'链路日志'},{value:'设备日志',label:'设备日志'},{value:'模块日志',label:'模块日志'},{value:'操作日志',label:'操作日志'},{value:'告警日志',label:'告警日志'}]" /></div>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class="text-gray-500 whitespace-nowrap">对象：</span>
                      <div class="w-28"><Select v-model="sysLogFilter.object" :options="[{value:'all',label:'全部'},{value:'admin',label:'admin'},{value:'OTN-A',label:'OTN-A'},{value:'OTN-B',label:'OTN-B'},{value:'OTN-C',label:'OTN-C'},{value:'OTN-D',label:'OTN-D'},{value:'Link-01',label:'Link-01'},{value:'Link-03',label:'Link-03'}]" /></div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 text-xs">
                    <div class="flex items-center gap-1.5">
                      <span class="text-gray-500 whitespace-nowrap">关键字：</span>
                      <Input v-model="sysLogFilter.keyword" placeholder="搜索日志内容" class="w-56" />
                    </div>
                    <Button size="sm" @click="sysLogPage = 1">
                      <Search class="w-3.5 h-3.5 mr-1" /> 查询
                    </Button>
                    <Button variant="outline" size="sm" @click="resetSysLogFilter">
                      <RotateCcw class="w-3.5 h-3.5 mr-1" /> 重置
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <!-- 查询结果 -->
              <Card>
                <CardContent class="p-4 space-y-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-600 dark:text-gray-300">
                      共查询到 <strong>{{ filteredSysLogs.length }}</strong> 条记录
                    </div>
                    <Button variant="outline" size="sm">
                      <Download class="w-3.5 h-3.5 mr-1" /> 导出
                    </Button>
                  </div>
                  <div class="border rounded-lg overflow-hidden">
                    <table class="w-full text-xs">
                      <thead class="bg-gray-50 dark:bg-white/5">
                        <tr>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">时间</th>
                          <th class="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">级别</th>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">类型</th>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">对象</th>
                          <th class="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">内容</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-if="pagedSysLogs.length === 0">
                          <td colspan="5" class="px-3 py-6 text-center text-gray-400">暂无日志记录</td>
                        </tr>
                        <tr v-for="log in pagedSysLogs" :key="log.id" class="border-t hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                          <td class="px-3 py-2 text-gray-500 whitespace-nowrap">{{ log.time }}</td>
                          <td class="px-3 py-2 text-center">
                            <span :class="['px-1.5 py-0.5 rounded text-[10px] font-medium', getLevelBadge(log.level)]">{{ log.level }}</span>
                          </td>
                          <td class="px-3 py-2">
                            <span :class="['px-1.5 py-0.5 rounded text-[10px] font-medium',
                              log.type === '告警日志' ? 'bg-red-100 text-red-700' :
                              log.type === '设备日志' ? 'bg-blue-100 text-blue-700' :
                              log.type === '操作日志' ? 'bg-green-100 text-green-700' :
                              log.type === '链路日志' ? 'bg-purple-100 text-purple-700' :
                              log.type === '模块日志' ? 'bg-cyan-100 text-cyan-700' :
                              'bg-gray-100 text-gray-700'
                            ]">{{ log.type }}</span>
                          </td>
                          <td class="px-3 py-2 text-gray-600 dark:text-gray-300">{{ log.object }}</td>
                          <td class="px-3 py-2 text-gray-600 dark:text-gray-300">{{ log.content }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <!-- 分页 -->
                  <div class="flex items-center justify-between text-xs">
                    <div class="flex items-center gap-1">
                      <button :disabled="sysLogPage <= 1" :class="['px-2 py-1 rounded border', sysLogPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-50']" @click="sysLogPage = Math.max(1, sysLogPage - 1)">&lt;</button>
                      <template v-for="p in Math.min(sysLogTotalPages, 7)" :key="p">
                        <button :class="['px-2.5 py-1 rounded border', sysLogPage === p ? 'border-blue-400 bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50']" @click="sysLogPage = p">{{ p }}</button>
                      </template>
                      <span v-if="sysLogTotalPages > 7" class="px-1 text-gray-400">...</span>
                      <button v-if="sysLogTotalPages > 7" :class="['px-2.5 py-1 rounded border text-gray-500 hover:bg-gray-50']" @click="sysLogPage = sysLogTotalPages">{{ sysLogTotalPages }}</button>
                      <button :disabled="sysLogPage >= sysLogTotalPages" :class="['px-2 py-1 rounded border', sysLogPage >= sysLogTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-50']" @click="sysLogPage = Math.min(sysLogTotalPages, sysLogPage + 1)">&gt;</button>
                    </div>
                    <div class="flex items-center gap-1.5 text-gray-500">
                      每页显示：<div class="w-16"><Select v-model="sysLogPageSize" :options="[{value:'10',label:'10条'},{value:'20',label:'20条'},{value:'50',label:'50条'}]" /></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <!-- ========= 系统配置 ========= -->
            <div v-if="systemSubTab === 'config'" class="space-y-4">
              <Card>
                <CardContent class="p-4 space-y-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <Zap class="w-4 h-4" /> 插值补全与预测模型
                  </div>
                  <div class="grid grid-cols-2 gap-4 text-xs">
                    <div class="border rounded-lg p-3 space-y-3">
                      <div class="flex items-center justify-between">
                        <span class="font-medium text-gray-700">插值补全</span>
                        <button class="flex items-center gap-2" @click="interpolationConfig.enabled = !interpolationConfig.enabled">
                          <span :class="['w-4 h-4 rounded border flex items-center justify-center', interpolationConfig.enabled ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                            <CheckCircle v-if="interpolationConfig.enabled" class="w-3 h-3 text-white" />
                          </span>
                          <span class="text-gray-500">{{ interpolationConfig.enabled ? '启用' : '关闭' }}</span>
                        </button>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="w-24 text-right text-gray-500">补全方法</span>
                        <div class="flex-1">
                          <Select v-model="interpolationConfig.method" :options="[{ value: '样条插值', label: '样条插值' }, { value: '线性插值', label: '线性插值' }, { value: '卡尔曼滤波', label: '卡尔曼滤波' }]" />
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="w-24 text-right text-gray-500">最大缺口</span>
                        <Input v-model="interpolationConfig.maxGap" class="w-16" />
                        <span class="text-gray-400">采样点</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="w-24 text-right text-gray-500">置信阈值</span>
                        <Input v-model="interpolationConfig.confidence" class="w-16" />
                        <span class="text-gray-400">%</span>
                      </div>
                    </div>
                    <div class="border rounded-lg p-3 space-y-3">
                      <div class="flex items-center justify-between">
                        <span class="font-medium text-gray-700">LSTM 与动态基线</span>
                        <div class="flex items-center gap-3">
                          <label class="flex items-center gap-1.5 cursor-pointer" @click="predictionConfig.lstmEnabled = !predictionConfig.lstmEnabled">
                            <span :class="['w-4 h-4 rounded border flex items-center justify-center', predictionConfig.lstmEnabled ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                              <CheckCircle v-if="predictionConfig.lstmEnabled" class="w-3 h-3 text-white" />
                            </span>
                            <span class="text-gray-500">LSTM</span>
                          </label>
                          <label class="flex items-center gap-1.5 cursor-pointer" @click="predictionConfig.dynamicBaselineEnabled = !predictionConfig.dynamicBaselineEnabled">
                            <span :class="['w-4 h-4 rounded border flex items-center justify-center', predictionConfig.dynamicBaselineEnabled ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                              <CheckCircle v-if="predictionConfig.dynamicBaselineEnabled" class="w-3 h-3 text-white" />
                            </span>
                            <span class="text-gray-500">动态基线</span>
                          </label>
                        </div>
                      </div>
                      <div class="grid grid-cols-2 gap-2">
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-right text-gray-500">回看窗</span>
                          <Input v-model="predictionConfig.lookbackWindow" class="w-16" />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-right text-gray-500">重训周期</span>
                          <Input v-model="predictionConfig.retrainHours" class="w-16" />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-right text-gray-500">预测时长</span>
                          <Input v-model="predictionConfig.forecastHours" class="w-16" />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="w-20 text-right text-gray-500">灵敏度</span>
                          <Input v-model="predictionConfig.sensitivity" class="w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="flex justify-end">
                    <Button size="sm" @click="saveMonitoringConfig">
                      <Save class="w-3.5 h-3.5 mr-1" /> 保存插值与预测配置
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <!-- 基础配置 -->
              <Card>
                <CardContent class="p-4 space-y-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <Settings class="w-4 h-4" /> 基础配置
                  </div>
                  <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                    <div class="flex items-center gap-2 col-span-2">
                      <span class="text-gray-500 whitespace-nowrap w-24 text-right">系统名称：</span>
                      <Input v-model="sysConfig.name" class="flex-1" />
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-gray-500 whitespace-nowrap w-24 text-right">数据刷新间隔：</span>
                      <Input v-model="sysConfig.refreshInterval" class="w-16" />
                      <span class="text-gray-400">秒</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-gray-500 whitespace-nowrap w-24 text-right">会话超时：</span>
                      <Input v-model="sysConfig.sessionTimeout" class="w-16" />
                      <span class="text-gray-400">分钟</span>
                    </div>
                    <div class="flex items-center gap-2 col-span-2">
                      <span class="text-gray-500 whitespace-nowrap w-24 text-right">时区设置：</span>
                      <div class="w-48"><Select v-model="sysConfig.timezone" :options="[{value:'utc8',label:'UTC+8 北京时间'},{value:'utc0',label:'UTC+0 格林威治'},{value:'utc9',label:'UTC+9 东京'}]" /></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <!-- 健康度阈值配置 -->
              <Card>
                <CardContent class="p-4 space-y-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <Activity class="w-4 h-4" /> 健康度阈值配置
                  </div>
                  <!-- 阈值可视化条 -->
                  <div class="space-y-2">
                    <div class="flex h-8 rounded-lg overflow-hidden border">
                      <div class="bg-red-500 flex items-center justify-center text-white text-[10px] font-medium" :style="{ width: thresholdBarSegments.fault + '%' }">
                        🔴 故障
                      </div>
                      <div class="bg-yellow-400 flex items-center justify-center text-white text-[10px] font-medium" :style="{ width: thresholdBarSegments.warning + '%' }">
                        🟡 警告
                      </div>
                      <div class="bg-green-500 flex items-center justify-center text-white text-[10px] font-medium" :style="{ width: thresholdBarSegments.normal + '%' }">
                        🟢 正常
                      </div>
                    </div>
                    <div class="flex justify-between text-[10px] text-gray-400 px-1">
                      <span>0%</span>
                      <span :style="{ marginLeft: thresholdBarSegments.fault - 8 + '%' }">{{ healthThreshold.faultThreshold }}%</span>
                      <span>{{ healthThreshold.warningThreshold }}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-4 text-xs">
                    <div class="flex items-center gap-2">
                      <span class="text-gray-500 whitespace-nowrap">警告阈值：</span>
                      <Input v-model="healthThreshold.warningThreshold" class="w-16" />
                      <span class="text-gray-400">%（健康度低于此值进入警告状态）</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-gray-500 whitespace-nowrap">故障阈值：</span>
                      <Input v-model="healthThreshold.faultThreshold" class="w-16" />
                      <span class="text-gray-400">%（健康度低于此值进入故障状态）</span>
                    </div>
                  </div>
                  <!-- 应用范围 -->
                  <div class="border rounded-lg p-3 space-y-2">
                    <div class="text-xs font-medium text-gray-600 dark:text-gray-300">应用范围</div>
                    <div class="flex items-center gap-5 text-xs">
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="healthThreshold.applyDevice = !healthThreshold.applyDevice">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', healthThreshold.applyDevice ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600']">
                          <CheckCircle v-if="healthThreshold.applyDevice" class="w-3 h-3 text-white" />
                        </span>
                        <span class="text-gray-600 dark:text-gray-300">设备健康度</span>
                      </label>
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="healthThreshold.applyModule = !healthThreshold.applyModule">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', healthThreshold.applyModule ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600']">
                          <CheckCircle v-if="healthThreshold.applyModule" class="w-3 h-3 text-white" />
                        </span>
                        <span class="text-gray-600 dark:text-gray-300">模块健康度</span>
                      </label>
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="healthThreshold.applyLink = !healthThreshold.applyLink">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', healthThreshold.applyLink ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600']">
                          <CheckCircle v-if="healthThreshold.applyLink" class="w-3 h-3 text-white" />
                        </span>
                        <span class="text-gray-600 dark:text-gray-300">链路健康度</span>
                      </label>
                    </div>
                  </div>
                  <div class="text-[11px] text-gray-400 flex items-start gap-1">
                    <Info class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    说明：其他告警（如功率、温度等）由网管平台推送，本系统仅处理健康度相关告警。
                  </div>
                </CardContent>
              </Card>

              <!-- 通知配置 -->
              <Card>
                <CardContent class="p-4 space-y-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <Bell class="w-4 h-4" /> 通知配置
                  </div>
                  <div class="text-xs text-gray-500 -mt-2">健康度告警通知：</div>
                  <div class="space-y-3 text-xs">
                    <!-- 邮件 -->
                    <div class="flex items-center gap-3">
                      <label class="flex items-center gap-1.5 cursor-pointer w-24" @click="notifyConfig.email = !notifyConfig.email">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', notifyConfig.email ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                          <CheckCircle v-if="notifyConfig.email" class="w-3 h-3 text-white" />
                        </span>
                        <Mail class="w-3.5 h-3.5 text-gray-400" />
                        <span class="text-gray-600">邮件通知</span>
                      </label>
                      <span class="text-gray-400">接收邮箱：</span>
                      <Input v-model="notifyConfig.emailReceivers" :disabled="!notifyConfig.email" class="flex-1" placeholder="多个邮箱用分号分隔" />
                    </div>
                    <!-- 短信 -->
                    <div class="flex items-center gap-3">
                      <label class="flex items-center gap-1.5 cursor-pointer w-24" @click="notifyConfig.sms = !notifyConfig.sms">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', notifyConfig.sms ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                          <CheckCircle v-if="notifyConfig.sms" class="w-3 h-3 text-white" />
                        </span>
                        <MessageSquare class="w-3.5 h-3.5 text-gray-400" />
                        <span class="text-gray-600">短信通知</span>
                      </label>
                      <span class="text-gray-400">接收号码：</span>
                      <Input v-model="notifyConfig.smsReceivers" :disabled="!notifyConfig.sms" class="flex-1" placeholder="多个号码用分号分隔" />
                    </div>
                    <!-- 系统内通知 -->
                    <div class="flex items-center gap-3">
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="notifyConfig.inApp = !notifyConfig.inApp">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', notifyConfig.inApp ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                          <CheckCircle v-if="notifyConfig.inApp" class="w-3 h-3 text-white" />
                        </span>
                        <Monitor class="w-3.5 h-3.5 text-gray-400" />
                        <span class="text-gray-600">系统内通知（在监控中心实时显示）</span>
                      </label>
                    </div>
                  </div>
                  <!-- 触发条件 -->
                  <div class="border-t pt-3 space-y-2">
                    <div class="text-xs text-gray-500">通知触发条件：</div>
                    <div class="flex items-center gap-5 text-xs">
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="notifyConfig.onWarning = !notifyConfig.onWarning">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', notifyConfig.onWarning ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                          <CheckCircle v-if="notifyConfig.onWarning" class="w-3 h-3 text-white" />
                        </span>
                        <span class="text-gray-600">进入警告状态时通知</span>
                      </label>
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="notifyConfig.onFault = !notifyConfig.onFault">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', notifyConfig.onFault ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                          <CheckCircle v-if="notifyConfig.onFault" class="w-3 h-3 text-white" />
                        </span>
                        <span class="text-gray-600">进入故障状态时通知</span>
                      </label>
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="notifyConfig.onRecovery = !notifyConfig.onRecovery">
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', notifyConfig.onRecovery ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                          <CheckCircle v-if="notifyConfig.onRecovery" class="w-3 h-3 text-white" />
                        </span>
                        <span class="text-gray-600">状态恢复正常时通知</span>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <!-- 保存/重置按钮 -->
              <div class="flex items-center gap-3">
                <Button variant="outline" @click="resetSysConfig">
                  <RotateCcw class="w-4 h-4 mr-1" /> 恢复默认
                </Button>
                <Button @click="saveMonitoringConfig">
                  <Save class="w-4 h-4 mr-1" /> 保存配置
                </Button>
              </div>
            </div>

            <!-- ========= 数据管理 ========= -->
            <div v-if="systemSubTab === 'data'" class="space-y-4">
              <Card>
                <CardContent class="p-4 space-y-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                      <FileText class="w-4 h-4" /> 分析报告导出
                    </div>
                    <div class="text-xs text-gray-400">支持 PDF / Word / HTML</div>
                  </div>
                  <div class="grid grid-cols-3 gap-3 text-xs">
                    <label class="flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2">
                      <input v-model="reportSections.overview" type="checkbox" class="w-4 h-4 accent-blue-500" />
                      <span>运行总览</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2">
                      <input v-model="reportSections.topology" type="checkbox" class="w-4 h-4 accent-blue-500" />
                      <span>拓扑图</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2">
                      <input v-model="reportSections.devices" type="checkbox" class="w-4 h-4 accent-blue-500" />
                      <span>设备数据</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2">
                      <input v-model="reportSections.alarms" type="checkbox" class="w-4 h-4 accent-blue-500" />
                      <span>告警明细</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2">
                      <input v-model="reportSections.prediction" type="checkbox" class="w-4 h-4 accent-blue-500" />
                      <span>插值与预测</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer border rounded-lg px-3 py-2">
                      <input v-model="reportSections.logs" type="checkbox" class="w-4 h-4 accent-blue-500" />
                      <span>日志样本</span>
                    </label>
                  </div>
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-gray-500 gap-3">
                    <span>导出内容会包含当前拓扑图、设备状态、告警、插值补全和 LSTM/动态基线配置。</span>
                    <Button variant="outline" size="sm" @click="exportSystemLogs('csv')">
                      <Download class="w-3.5 h-3.5 mr-1" /> 导出日志
                    </Button>
                  </div>
                  <div class="flex items-center gap-3">
                    <Button variant="outline" size="sm" @click="exportMonitoringAnalysisReport('pdf')">
                      <Download class="w-3.5 h-3.5 mr-1" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" @click="exportMonitoringAnalysisReport('word')">
                      <FileText class="w-3.5 h-3.5 mr-1" /> Word
                    </Button>
                    <Button variant="outline" size="sm" @click="exportMonitoringAnalysisReport('html')">
                      <Eye class="w-3.5 h-3.5 mr-1" /> HTML
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <!-- 存储状态 -->
              <Card>
                <CardContent class="p-4 space-y-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <HardDrive class="w-4 h-4" /> 存储状态
                  </div>
                  <div class="grid grid-cols-4 gap-3">
                    <div v-for="(s, si) in storageStats" :key="si" class="border rounded-lg p-3 space-y-2">
                      <div class="text-xs font-medium text-gray-600 dark:text-gray-300">{{ s.label }}</div>
                      <template v-if="s.total > 0">
                        <div class="text-lg font-bold text-gray-700 dark:text-gray-200">{{ Math.round(s.used / s.total * 100) }}%</div>
                        <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div :class="['h-full rounded-full', s.used / s.total > 0.8 ? 'bg-red-500' : s.used / s.total > 0.6 ? 'bg-yellow-500' : 'bg-green-500']" :style="{ width: (s.used / s.total * 100) + '%' }"></div>
                        </div>
                        <div class="text-[10px] text-gray-400">{{ s.used }} / {{ s.total }} {{ s.unit }}</div>
                      </template>
                      <template v-else>
                        <div class="text-lg font-bold text-gray-700 dark:text-gray-200">{{ s.used }} {{ s.unit }}</div>
                        <div class="text-[10px] text-gray-400">{{ s.detail }}</div>
                      </template>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <!-- 数据备份 -->
              <Card>
                <CardContent class="p-4 space-y-4">
                  <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <Database class="w-4 h-4" /> 数据备份
                  </div>
                  <!-- 自动备份设置 -->
                  <div class="border rounded-lg p-3 space-y-3">
                    <div class="text-xs font-medium text-gray-600 dark:text-gray-300">自动备份设置</div>
                    <div class="flex items-center gap-4 flex-wrap text-xs">
                      <label class="flex items-center gap-1.5 cursor-pointer" @click="autoBackupConfig.enabled = !autoBackupConfig.enabled">
                        <span class="text-gray-500">自动备份：</span>
                        <span :class="['w-4 h-4 rounded border flex items-center justify-center', autoBackupConfig.enabled ? 'bg-blue-500 border-blue-500' : 'border-gray-300']">
                          <CheckCircle v-if="autoBackupConfig.enabled" class="w-3 h-3 text-white" />
                        </span>
                        <span class="text-gray-600">启用</span>
                      </label>
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">备份周期：</span>
                        <div class="w-20"><Select v-model="autoBackupConfig.cycle" :options="[{value:'daily',label:'每天'},{value:'weekly',label:'每周'},{value:'monthly',label:'每月'}]" /></div>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">执行时间：</span>
                        <div class="w-20"><Select v-model="autoBackupConfig.time" :options="[{value:'00:00',label:'00:00'},{value:'02:00',label:'02:00'},{value:'04:00',label:'04:00'},{value:'06:00',label:'06:00'}]" /></div>
                      </div>
                    </div>
                    <div class="flex items-center gap-4 flex-wrap text-xs">
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">保留份数：</span>
                        <Input v-model="autoBackupConfig.keepCount" class="w-14" />
                        <span class="text-gray-400">份（超出自动删除最旧备份）</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-gray-500 whitespace-nowrap">备份路径：</span>
                        <Input v-model="autoBackupConfig.path" class="w-48" />
                      </div>
                    </div>
                  </div>

                  <!-- 备份记录 -->
                  <div class="border rounded-lg overflow-hidden">
                    <div class="bg-gray-50 dark:bg-white/5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">备份记录</div>
                    <table class="w-full text-xs">
                      <thead class="bg-gray-50/50 dark:bg-white/[0.02]">
                        <tr>
                          <th class="text-left px-3 py-2 font-medium text-gray-500">备份时间</th>
                          <th class="text-center px-3 py-2 font-medium text-gray-500">类型</th>
                          <th class="text-center px-3 py-2 font-medium text-gray-500">大小</th>
                          <th class="text-center px-3 py-2 font-medium text-gray-500">状态</th>
                          <th class="text-center px-3 py-2 font-medium text-gray-500">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(b, bi) in backupRecords" :key="bi" class="border-t">
                          <td class="px-3 py-2 text-gray-600 dark:text-gray-300">{{ b.time }}</td>
                          <td class="px-3 py-2 text-center">
                            <span :class="['px-1.5 py-0.5 rounded text-[10px]', b.type === '手动' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600']">{{ b.type }}</span>
                          </td>
                          <td class="px-3 py-2 text-center text-gray-500">{{ b.size }}</td>
                          <td class="px-3 py-2 text-center">
                            <span :class="b.status === 'success' ? 'text-green-600' : 'text-red-500'">{{ b.status === 'success' ? '✅' : '❌' }}</span>
                          </td>
                          <td class="px-3 py-2 text-center">
                            <div class="flex items-center justify-center gap-2">
                              <button class="text-blue-500 hover:text-blue-700 hover:underline"><Download class="w-3 h-3 inline" /> 下载</button>
                              <button class="text-green-500 hover:text-green-700 hover:underline"><Upload class="w-3 h-3 inline" /> 恢复</button>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <!-- 操作按钮 -->
                  <div class="flex items-center gap-3">
                    <Button variant="outline" size="sm">
                      <Save class="w-3.5 h-3.5 mr-1" /> 保存设置
                    </Button>
                    <Button size="sm" @click="runBackupNow">
                      <Plus class="w-3.5 h-3.5 mr-1" /> 立即备份
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

      </CardContent>
    </Card>
  </div>
</template>
