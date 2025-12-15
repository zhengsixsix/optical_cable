<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSLDStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { 
  Network, 
  Plus, 
  Trash2, 
  Download, 
  CheckCircle,
  X,
  Edit3,
  Cable,
  Radio
} from 'lucide-vue-next'
import type { SLDEquipmentType } from '@/types'

const props = defineProps<{
  visible?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit-equipment', equipmentId: string): void
  (e: 'edit-segment', segmentId: string): void
}>()

const sldStore = useSLDStore()
const appStore = useAppStore()

const activeTab = ref<'equipments' | 'segments' | 'params'>('equipments')

const currentTable = computed(() => sldStore.currentTable)
const equipments = computed(() => sldStore.equipments)
const fiberSegments = computed(() => sldStore.fiberSegments)
const metadata = computed(() => currentTable.value?.metadata)
const transmissionParams = computed(() => currentTable.value?.transmissionParams)

const equipmentTypeLabels: Record<SLDEquipmentType, string> = {
  TE: '终端设备',
  PFE: '供电设备',
  REP: '中继器',
  BU: '分支器',
  JOINT: '接头',
  OADM: '光分插复用器',
}

const getEquipmentTypeClass = (type: SLDEquipmentType) => {
  const classes: Record<SLDEquipmentType, string> = {
    TE: 'bg-green-100 text-green-700',
    PFE: 'bg-yellow-100 text-yellow-700',
    REP: 'bg-blue-100 text-blue-700',
    BU: 'bg-purple-100 text-purple-700',
    JOINT: 'bg-orange-100 text-orange-700',
    OADM: 'bg-cyan-100 text-cyan-700',
  }
  return classes[type] || 'bg-gray-100 text-gray-600'
}

const handleDeleteEquipment = (id: string) => {
  sldStore.deleteEquipment(id)
  appStore.showNotification({ type: 'success', message: '设备已删除' })
}

const handleDeleteSegment = (id: string) => {
  sldStore.deleteFiberSegment(id)
  appStore.showNotification({ type: 'success', message: '光纤段已删除' })
}

const handleValidate = () => {
  const result = sldStore.validateTable()
  if (result.valid) {
    appStore.showNotification({ type: 'success', message: 'SLD表格验证通过' })
  } else {
    appStore.showNotification({ 
      type: 'warning', 
      message: `发现 ${result.errors.length} 个错误, ${result.warnings.length} 个警告` 
    })
  }
}

const handleExportEquipments = () => {
  const csv = sldStore.exportEquipmentsToCSV()
  if (!csv) return
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${currentTable.value?.name || 'SLD'}_设备表_${Date.now()}.csv`
  link.click()
  appStore.showNotification({ type: 'success', message: '导出成功' })
}

const handleExportSegments = () => {
  const csv = sldStore.exportSegmentsToCSV()
  if (!csv) return
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${currentTable.value?.name || 'SLD'}_光纤段表_${Date.now()}.csv`
  link.click()
  appStore.showNotification({ type: 'success', message: '导出成功' })
}

const handleGenerateMock = () => {
  sldStore.generateMockData()
  appStore.showNotification({ type: 'success', message: '已生成示例数据' })
}
</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden">
    <CardHeader class="shrink-0 border-b">
      <div class="flex items-center gap-2">
        <Network class="w-5 h-5 text-purple-600" />
        <span class="font-semibold">SLD 表格管理</span>
      </div>
      <div class="flex items-center gap-2">
        <Button v-if="!currentTable" variant="outline" size="sm" @click="handleGenerateMock">
          <Plus class="w-4 h-4 mr-1" />
          生成示例
        </Button>
        <Button v-if="props.visible !== undefined" variant="ghost" size="sm" @click="emit('close')">
          <X class="w-4 h-4" />
        </Button>
      </div>
    </CardHeader>

    <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
      <!-- 统计信息 -->
      <div v-if="metadata" class="px-4 py-3 bg-gray-50 border-b">
        <div class="grid grid-cols-6 gap-4 text-sm">
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.totalLength.toFixed(1) }}</div>
            <div class="text-xs text-gray-500">总长度(km)</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-green-600">{{ metadata.terminalCount }}</div>
            <div class="text-xs text-gray-500">终端</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.repeaterCount }}</div>
            <div class="text-xs text-gray-500">中继器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-purple-600">{{ metadata.branchingUnitCount }}</div>
            <div class="text-xs text-gray-500">分支器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-cyan-600">{{ metadata.totalFiberPairs }}</div>
            <div class="text-xs text-gray-500">光纤对</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-orange-600">{{ metadata.estimatedCapacity }}</div>
            <div class="text-xs text-gray-500">容量(Tbps)</div>
          </div>
        </div>
      </div>

      <!-- Tab切换 -->
      <div class="px-4 py-2 border-b flex items-center gap-4 bg-white">
        <button 
          :class="['px-3 py-1.5 text-sm rounded transition-colors', activeTab === 'equipments' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100']"
          @click="activeTab = 'equipments'"
        >
          <Radio class="w-4 h-4 inline mr-1" />
          设备列表
        </button>
        <button 
          :class="['px-3 py-1.5 text-sm rounded transition-colors', activeTab === 'segments' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100']"
          @click="activeTab = 'segments'"
        >
          <Cable class="w-4 h-4 inline mr-1" />
          光纤段
        </button>
        <button 
          :class="['px-3 py-1.5 text-sm rounded transition-colors', activeTab === 'params' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100']"
          @click="activeTab = 'params'"
        >
          传输参数
        </button>
        <div class="flex-1" />
        <Button variant="outline" size="sm" @click="handleValidate">
          <CheckCircle class="w-4 h-4 mr-1" />
          验证
        </Button>
      </div>

      <!-- 设备列表 -->
      <div v-if="activeTab === 'equipments'" class="flex-1 flex flex-col overflow-hidden">
        <div class="px-4 py-2 border-b flex items-center justify-between bg-white">
          <Button variant="outline" size="sm" @click="emit('edit-equipment', '')">
            <Plus class="w-4 h-4 mr-1" />
            添加设备
          </Button>
          <Button variant="outline" size="sm" @click="handleExportEquipments">
            <Download class="w-4 h-4 mr-1" />
            导出CSV
          </Button>
        </div>
        <div class="flex-1 overflow-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th class="px-2 py-2 text-center w-12 border-b font-medium text-gray-600">序号</th>
                <th class="px-2 py-2 text-left border-b font-medium text-gray-600">名称</th>
                <th class="px-2 py-2 text-center w-24 border-b font-medium text-gray-600">类型</th>
                <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">KP(km)</th>
                <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">水深(m)</th>
                <th class="px-2 py-2 text-left border-b font-medium text-gray-600">规格</th>
                <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="eq in equipments"
                :key="eq.id"
                class="hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <td class="px-2 py-1.5 text-center border-b text-gray-500">{{ eq.sequence }}</td>
                <td class="px-2 py-1.5 border-b font-medium">{{ eq.name }}</td>
                <td class="px-2 py-1.5 text-center border-b">
                  <span :class="['text-xs px-1.5 py-0.5 rounded', getEquipmentTypeClass(eq.type)]">
                    {{ equipmentTypeLabels[eq.type] }}
                  </span>
                </td>
                <td class="px-2 py-1.5 text-right border-b font-mono">{{ eq.kp.toFixed(1) }}</td>
                <td class="px-2 py-1.5 text-right border-b">{{ eq.depth.toFixed(0) }}</td>
                <td class="px-2 py-1.5 border-b text-gray-600 text-xs">{{ eq.specifications }}</td>
                <td class="px-2 py-1.5 text-center border-b">
                  <div class="flex items-center justify-center gap-1">
                    <button class="p-1 hover:bg-gray-200 rounded" @click="emit('edit-equipment', eq.id)">
                      <Edit3 class="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button class="p-1 hover:bg-red-100 rounded" @click="handleDeleteEquipment(eq.id)">
                      <Trash2 class="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="equipments.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-gray-400">
                  暂无设备数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 光纤段列表 -->
      <div v-if="activeTab === 'segments'" class="flex-1 flex flex-col overflow-hidden">
        <div class="px-4 py-2 border-b flex items-center justify-between bg-white">
          <Button variant="outline" size="sm" @click="emit('edit-segment', '')">
            <Plus class="w-4 h-4 mr-1" />
            添加光纤段
          </Button>
          <Button variant="outline" size="sm" @click="handleExportSegments">
            <Download class="w-4 h-4 mr-1" />
            导出CSV
          </Button>
        </div>
        <div class="flex-1 overflow-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th class="px-2 py-2 text-center w-12 border-b font-medium text-gray-600">序号</th>
                <th class="px-2 py-2 text-left border-b font-medium text-gray-600">起始</th>
                <th class="px-2 py-2 text-left border-b font-medium text-gray-600">终止</th>
                <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">长度(km)</th>
                <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">光纤对</th>
                <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">电缆</th>
                <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">损耗(dB)</th>
                <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="seg in fiberSegments"
                :key="seg.id"
                class="hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <td class="px-2 py-1.5 text-center border-b text-gray-500">{{ seg.sequence }}</td>
                <td class="px-2 py-1.5 border-b">{{ seg.fromName }}</td>
                <td class="px-2 py-1.5 border-b">{{ seg.toName }}</td>
                <td class="px-2 py-1.5 text-right border-b font-mono">{{ seg.length.toFixed(1) }}</td>
                <td class="px-2 py-1.5 text-center border-b">{{ seg.fiberPairs }}</td>
                <td class="px-2 py-1.5 text-center border-b font-mono text-xs">{{ seg.cableType }}</td>
                <td class="px-2 py-1.5 text-right border-b">{{ seg.totalLoss.toFixed(1) }}</td>
                <td class="px-2 py-1.5 text-center border-b">
                  <div class="flex items-center justify-center gap-1">
                    <button class="p-1 hover:bg-gray-200 rounded" @click="emit('edit-segment', seg.id)">
                      <Edit3 class="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button class="p-1 hover:bg-red-100 rounded" @click="handleDeleteSegment(seg.id)">
                      <Trash2 class="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="fiberSegments.length === 0">
                <td colspan="8" class="px-4 py-8 text-center text-gray-400">
                  暂无光纤段数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 传输参数 -->
      <div v-if="activeTab === 'params'" class="flex-1 overflow-auto p-4">
        <div v-if="transmissionParams" class="grid grid-cols-2 gap-4">
          <div class="space-y-3">
            <h3 class="font-medium text-gray-700 border-b pb-2">容量参数</h3>
            <div class="flex justify-between">
              <span class="text-gray-600">设计容量</span>
              <span class="font-mono">{{ transmissionParams.designCapacity }} Tbps</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">波长数</span>
              <span class="font-mono">{{ transmissionParams.wavelengths }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">通道间隔</span>
              <span class="font-mono">{{ transmissionParams.channelSpacing }} GHz</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">调制格式</span>
              <span class="font-mono">{{ transmissionParams.modulationFormat }}</span>
            </div>
          </div>
          <div class="space-y-3">
            <h3 class="font-medium text-gray-700 border-b pb-2">性能参数</h3>
            <div class="flex justify-between">
              <span class="text-gray-600">发射功率</span>
              <span class="font-mono">{{ transmissionParams.launchPower }} dBm</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">所需OSNR</span>
              <span class="font-mono">{{ transmissionParams.osnrRequired }} dB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">跨段损耗预算</span>
              <span class="font-mono">{{ transmissionParams.spanLossBudget }} dB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">系统余量</span>
              <span class="font-mono">{{ transmissionParams.systemMargin }} dB</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部状态栏 -->
      <div class="px-4 py-2 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-500 shrink-0">
        <span>设备 {{ equipments.length }} 个 · 光纤段 {{ fiberSegments.length }} 段</span>
      </div>
    </CardContent>
  </Card>
</template>
