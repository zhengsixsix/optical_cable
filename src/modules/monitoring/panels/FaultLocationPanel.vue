<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
import {
  MapPin, AlertTriangle, Navigation, Crosshair, ChevronRight, RefreshCw,
  Zap, Anchor, ArrowRight, CheckCircle, XCircle, Clock, Target
} from 'lucide-vue-next'
import { useMonitorStore } from '@/stores'

const monitorStore = useMonitorStore()

// ---------- types ----------
interface FaultEvent {
  id: string
  time: string
  kp: number             // 故障位置 (KP km)
  longitude: number
  latitude: number
  depth: number          // 水深 m
  type: 'fiber_break' | 'high_loss' | 'reflection' | 'bend_loss' | 'shunt_fault'
  severity: 'critical' | 'major' | 'minor'
  estimatedLossDb: number
  confidencePct: number  // 定位置信度
  affectedDeviceIds: string[]
  description: string
  status: 'active' | 'investigating' | 'resolved'
}

// ---------- 确定性伪随机 ----------
const seededRand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ---------- 模拟故障事件 ----------
const faultEvents = computed<FaultEvent[]>(() => {
  const devices = monitorStore.devices
  const errorDevices = devices.filter(d => d.status === 'error')
  const warningDevices = devices.filter(d => d.status === 'warning')

  const events: FaultEvent[] = []

  // 从 error 设备生成 critical/major 故障
  errorDevices.forEach((d, i) => {
    events.push({
      id: `fault-${d.id}`,
      time: new Date(Date.now() - Math.floor(seededRand(i + 100) * 7200000)).toLocaleString('zh-CN'),
      kp: d.kp + (seededRand(i + 200) - 0.5) * 5,
      longitude: d.longitude + (seededRand(i + 300) - 0.5) * 0.02,
      latitude: d.latitude + (seededRand(i + 400) - 0.5) * 0.02,
      depth: d.depth || 2000 + Math.floor(seededRand(i + 500) * 3000),
      type: i % 3 === 0 ? 'fiber_break' : i % 3 === 1 ? 'shunt_fault' : 'high_loss',
      severity: 'critical',
      estimatedLossDb: 15 + seededRand(i + 600) * 25,
      confidencePct: 85 + Math.floor(seededRand(i + 700) * 15),
      affectedDeviceIds: [d.id],
      description: i % 3 === 0
        ? `KP${d.kp.toFixed(1)} 附近检测到光纤断裂，OTDR 反射峰异常`
        : i % 3 === 1
        ? `KP${d.kp.toFixed(1)} 供电分流故障，PFE 电压异常`
        : `KP${d.kp.toFixed(1)} 检测到高衰减事件，损耗 ${(15 + seededRand(i + 600) * 25).toFixed(1)} dB`,
      status: 'active',
    })
  })

  // 从 warning 设备生成 minor 故障
  warningDevices.forEach((d, i) => {
    events.push({
      id: `fault-w-${d.id}`,
      time: new Date(Date.now() - Math.floor(seededRand(i + 800) * 86400000)).toLocaleString('zh-CN'),
      kp: d.kp + (seededRand(i + 900) - 0.5) * 3,
      longitude: d.longitude,
      latitude: d.latitude,
      depth: d.depth || 1500 + Math.floor(seededRand(i + 1000) * 2000),
      type: i % 2 === 0 ? 'bend_loss' : 'reflection',
      severity: i % 2 === 0 ? 'major' : 'minor',
      estimatedLossDb: 3 + seededRand(i + 1100) * 8,
      confidencePct: 70 + Math.floor(seededRand(i + 1200) * 25),
      affectedDeviceIds: [d.id],
      description: i % 2 === 0
        ? `KP${d.kp.toFixed(1)} 弯曲损耗增大，可能存在外力干扰`
        : `KP${d.kp.toFixed(1)} 异常反射事件，接头可能松动`,
      status: 'investigating',
    })
  })

  // 如果没有真实故障设备，生成一个演示事件
  if (events.length === 0) {
    events.push({
      id: 'fault-demo-1',
      time: new Date().toLocaleString('zh-CN'),
      kp: 137.5,
      longitude: 120.5,
      latitude: 24.2,
      depth: 3200,
      type: 'high_loss',
      severity: 'minor',
      estimatedLossDb: 4.2,
      confidencePct: 78,
      affectedDeviceIds: [],
      description: 'KP137.5 轻微衰减增大，建议持续监测',
      status: 'investigating',
    })
  }

  return events.sort((a, b) => {
    const order = { critical: 0, major: 1, minor: 2 }
    return order[a.severity] - order[b.severity]
  })
})

// ---------- 选中故障 ----------
const selectedFaultId = ref<string | null>(null)
const selectedFault = computed(() => faultEvents.value.find(f => f.id === selectedFaultId.value) || null)

const selectFault = (id: string) => {
  selectedFaultId.value = selectedFaultId.value === id ? null : id
}

// ---------- OTDR 模拟曲线数据 ----------
const totalCableKm = 275
const otdrSteps = 60

const otdrTracePoints = computed(() => {
  const points: { km: number; loss: number }[] = []
  let cumulativeLoss = 0
  const fiberLossPerKm = 0.18  // dB/km

  for (let i = 0; i <= otdrSteps; i++) {
    const km = (totalCableKm / otdrSteps) * i
    cumulativeLoss += fiberLossPerKm * (totalCableKm / otdrSteps)

    // 在每个放大器位置恢复增益 (模拟)
    if (i > 0 && i % 8 === 0) cumulativeLoss -= 12

    // 在故障位置添加损耗尖峰
    const nearbyFault = faultEvents.value.find(f => Math.abs(f.kp - km) < (totalCableKm / otdrSteps))
    if (nearbyFault) {
      cumulativeLoss += nearbyFault.estimatedLossDb * 0.3
    }

    const noise = (seededRand(i * 31) - 0.5) * 0.5
    points.push({ km, loss: cumulativeLoss + noise })
  }
  return points
})

// SVG dimensions for OTDR trace
const otdrSvgW = 680
const otdrSvgH = 180
const otdrPad = { top: 20, right: 40, bottom: 30, left: 50 }
const otdrChartW = otdrSvgW - otdrPad.left - otdrPad.right
const otdrChartH = otdrSvgH - otdrPad.top - otdrPad.bottom

const otdrYRange = computed(() => {
  const losses = otdrTracePoints.value.map(p => p.loss)
  const min = Math.min(...losses) - 2
  const max = Math.max(...losses) + 2
  return { min, max }
})

const otdrToX = (km: number) => otdrPad.left + (km / totalCableKm) * otdrChartW
const otdrToY = (loss: number) => {
  const { min, max } = otdrYRange.value
  return otdrPad.top + otdrChartH * (1 - (loss - min) / (max - min))
}

const otdrPolyline = computed(() =>
  otdrTracePoints.value.map(p => `${otdrToX(p.km)},${otdrToY(p.loss)}`).join(' ')
)

// 故障标记点
const faultMarkers = computed(() =>
  faultEvents.value.map(f => ({
    x: otdrToX(f.kp),
    y: otdrToY(otdrTracePoints.value.reduce((closest, p) =>
      Math.abs(p.km - f.kp) < Math.abs(closest.km - f.kp) ? p : closest
    ).loss),
    fault: f,
  }))
)

// ---------- helpers ----------
const faultTypeLabel: Record<string, string> = {
  fiber_break: '光纤断裂',
  high_loss: '高衰减',
  reflection: '异常反射',
  bend_loss: '弯曲损耗',
  shunt_fault: '供电故障',
}

const severityConfig: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: '紧急', color: 'text-red-700', bg: 'bg-red-100 border-red-200' },
  major:    { label: '重要', color: 'text-yellow-700', bg: 'bg-yellow-100 border-yellow-200' },
  minor:    { label: '一般', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-200' },
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle }> = {
  active:        { label: '活跃', icon: XCircle },
  investigating: { label: '排查中', icon: Clock },
  resolved:      { label: '已解决', icon: CheckCircle },
}

// 推荐操作
const getRecommendations = (fault: FaultEvent): string[] => {
  const recs: string[] = []
  switch (fault.type) {
    case 'fiber_break':
      recs.push('派遣维修船进行海缆打捞修复')
      recs.push('启用备用路由切换，降低业务影响')
      recs.push('通知上下游登陆站进行流量调度')
      break
    case 'shunt_fault':
      recs.push('检查 PFE 供电模块输出电压')
      recs.push('远程调整供电参数，尝试恢复')
      recs.push('如无法远程恢复，安排海上维护')
      break
    case 'high_loss':
      recs.push('执行 OTDR 精确测量确认损耗位置')
      recs.push('检查附近是否有渔业活动或锚损')
      recs.push('持续监测 24h，判断是否恶化')
      break
    case 'bend_loss':
      recs.push('分析海底地形变化，评估外力风险')
      recs.push('结合 DTS 温度数据排除热损伤')
      recs.push('安排 ROV 巡检确认海缆状态')
      break
    case 'reflection':
      recs.push('对接头执行 OTDR 详细分析')
      recs.push('监测反射强度变化趋势')
      recs.push('在下次维护窗口安排接头处理')
      break
  }
  return recs
}
</script>

<template>
  <div class="space-y-4">
    <!-- OTDR 曲线图 -->
    <Card>
      <CardHeader>
        <span class="font-semibold text-sm flex items-center gap-2">
          <Crosshair class="w-4 h-4 text-blue-500" />
          光时域反射 (OTDR) 分析
        </span>
        <Button variant="outline" size="sm">
          <RefreshCw class="w-3.5 h-3.5 mr-1" /> 重新测量
        </Button>
      </CardHeader>
      <CardContent class="p-3">
        <svg :viewBox="`0 0 ${otdrSvgW} ${otdrSvgH}`" class="w-full" style="max-height: 220px">
          <!-- 网格 -->
          <line v-for="i in 5" :key="'gy' + i"
            :x1="otdrPad.left" :y1="otdrPad.top + (otdrChartH / 5) * i"
            :x2="otdrSvgW - otdrPad.right" :y2="otdrPad.top + (otdrChartH / 5) * i"
            stroke="#f0f0f0" stroke-width="1" />

          <!-- Y 轴标签 -->
          <text v-for="i in 6" :key="'ylab' + i"
            :x="otdrPad.left - 5"
            :y="otdrPad.top + (otdrChartH / 5) * (5 - (i - 1)) + 3"
            text-anchor="end" fill="#9ca3af" font-size="9">
            {{ (otdrYRange.min + ((otdrYRange.max - otdrYRange.min) / 5) * (i - 1)).toFixed(0) }}
          </text>

          <!-- X 轴标签 -->
          <text v-for="km in [0, 50, 100, 150, 200, 275]" :key="'xlab' + km"
            :x="otdrToX(km)" :y="otdrSvgH - 5"
            text-anchor="middle" fill="#9ca3af" font-size="9">
            {{ km }}km
          </text>

          <!-- OTDR 曲线 -->
          <polyline :points="otdrPolyline"
            fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-linejoin="round" />

          <!-- 故障标记 -->
          <g v-for="m in faultMarkers" :key="m.fault.id"
            class="cursor-pointer" @click="selectFault(m.fault.id)">
            <!-- 竖直参考线 -->
            <line :x1="m.x" :y1="otdrPad.top" :x2="m.x" :y2="otdrPad.top + otdrChartH"
              :stroke="m.fault.severity === 'critical' ? '#ef4444' : m.fault.severity === 'major' ? '#f59e0b' : '#3b82f6'"
              stroke-width="1" stroke-dasharray="3 2" opacity="0.5" />
            <!-- 标记圆点 -->
            <circle :cx="m.x" :cy="m.y" r="5"
              :fill="m.fault.severity === 'critical' ? '#ef4444' : m.fault.severity === 'major' ? '#f59e0b' : '#3b82f6'"
              stroke="#fff" stroke-width="2" />
            <!-- 标签 -->
            <text :x="m.x" :y="otdrPad.top - 5" text-anchor="middle"
              :fill="m.fault.severity === 'critical' ? '#ef4444' : '#f59e0b'" font-size="8" font-weight="bold">
              KP{{ m.fault.kp.toFixed(0) }}
            </text>
          </g>

          <!-- 轴标签 -->
          <text :x="otdrSvgW / 2" :y="otdrSvgH" text-anchor="middle" fill="#9ca3af" font-size="9">距离 (km)</text>
          <text :x="12" :y="otdrSvgH / 2" text-anchor="middle" fill="#9ca3af" font-size="9"
            transform="rotate(-90, 12, 90)">衰减 (dB)</text>
        </svg>
      </CardContent>
    </Card>

    <!-- 故障事件列表 -->
    <Card>
      <CardHeader>
        <span class="font-semibold text-sm flex items-center gap-2">
          <AlertTriangle class="w-4 h-4 text-red-500" />
          故障事件 ({{ faultEvents.length }})
        </span>
      </CardHeader>
      <CardContent class="p-0">
        <div class="divide-y max-h-[350px] overflow-auto">
          <div v-for="fault in faultEvents" :key="fault.id"
            :class="[
              'px-4 py-3 cursor-pointer transition-colors',
              selectedFaultId === fault.id ? 'bg-blue-50' : 'hover:bg-gray-50'
            ]"
            @click="selectFault(fault.id)">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span :class="['text-xs px-1.5 py-0.5 rounded border font-medium', severityConfig[fault.severity].bg, severityConfig[fault.severity].color]">
                    {{ severityConfig[fault.severity].label }}
                  </span>
                  <span class="text-sm font-medium text-gray-800">{{ faultTypeLabel[fault.type] }}</span>
                  <span class="text-xs text-gray-400">KP{{ fault.kp.toFixed(1) }}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">{{ fault.description }}</div>
                <div class="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                  <span class="flex items-center gap-1"><Clock class="w-3 h-3" />{{ fault.time }}</span>
                  <span class="flex items-center gap-1"><Anchor class="w-3 h-3" />水深 {{ fault.depth }}m</span>
                  <span class="flex items-center gap-1"><Target class="w-3 h-3" />置信度 {{ fault.confidencePct }}%</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span :class="['text-xs flex items-center gap-1', fault.status === 'active' ? 'text-red-500' : fault.status === 'investigating' ? 'text-yellow-500' : 'text-green-500']">
                  <component :is="statusConfig[fault.status].icon" class="w-3.5 h-3.5" />
                  {{ statusConfig[fault.status].label }}
                </span>
                <ChevronRight :class="['w-4 h-4 text-gray-400 transition-transform', selectedFaultId === fault.id && 'rotate-90']" />
              </div>
            </div>

            <!-- 展开详情 -->
            <div v-if="selectedFaultId === fault.id" class="mt-3 pt-3 border-t space-y-3">
              <!-- 定位信息 -->
              <div class="grid grid-cols-3 gap-3 text-xs">
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <div class="text-gray-400 mb-0.5">位置</div>
                  <div class="font-medium text-gray-700">KP {{ fault.kp.toFixed(1) }} km</div>
                  <div class="text-gray-400 mt-0.5">{{ fault.longitude.toFixed(3) }}°E, {{ fault.latitude.toFixed(3) }}°N</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <div class="text-gray-400 mb-0.5">估计损耗</div>
                  <div class="font-medium" :class="fault.estimatedLossDb > 10 ? 'text-red-600' : 'text-yellow-600'">
                    {{ fault.estimatedLossDb.toFixed(1) }} dB
                  </div>
                  <div class="text-gray-400 mt-0.5">置信度 {{ fault.confidencePct }}%</div>
                </div>
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <div class="text-gray-400 mb-0.5">海底环境</div>
                  <div class="font-medium text-gray-700">水深 {{ fault.depth }}m</div>
                  <div class="text-gray-400 mt-0.5">{{ fault.depth > 3000 ? '深海区域' : fault.depth > 1000 ? '大陆斜坡' : '浅海区域' }}</div>
                </div>
              </div>

              <!-- 影响范围 -->
              <div v-if="fault.affectedDeviceIds.length > 0">
                <div class="text-xs font-medium text-gray-600 mb-1.5">受影响设备</div>
                <div class="flex flex-wrap gap-2">
                  <div v-for="devId in fault.affectedDeviceIds" :key="devId"
                    class="flex items-center gap-1.5 text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200">
                    <Zap class="w-3 h-3" />
                    {{ monitorStore.devices.find(d => d.id === devId)?.name || devId }}
                  </div>
                </div>
              </div>

              <!-- 推荐操作 -->
              <div>
                <div class="text-xs font-medium text-gray-600 mb-1.5">推荐操作</div>
                <div class="space-y-1">
                  <div v-for="(rec, ri) in getRecommendations(fault)" :key="ri"
                    class="flex items-start gap-2 text-xs text-gray-600">
                    <ArrowRight class="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
                    <span>{{ rec }}</span>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="flex items-center gap-2">
                <Button size="sm">
                  <Navigation class="w-3.5 h-3.5 mr-1" /> 地图定位
                </Button>
                <Button variant="outline" size="sm">
                  <Crosshair class="w-3.5 h-3.5 mr-1" /> 精确测量
                </Button>
                <Button variant="outline" size="sm">
                  创建工单
                </Button>
              </div>
            </div>
          </div>

          <div v-if="faultEvents.length === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
            暂无故障事件
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
