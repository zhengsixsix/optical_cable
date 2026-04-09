<script setup lang="ts">
import { useRouteStore } from '@/stores/route'
import { useSettingsStore } from '@/stores/settings'
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSLDStore } from '@/stores/sld'
import { exportSLDFile, exportSLDFileFromRoute } from '@/services/SLDExportService'
import { exportSLDToExcel } from '@/services/SLDExcelExportService'
import {
  DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
  SLD_EXPORT_TEMPLATE_OPTIONS,
} from '@/services/sldDeviceRegistry'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
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
import type { SLDEquipmentType, SLDExportTemplateVersion } from '@/types'

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
const routeStore = useRouteStore()
const settingsStore = useSettingsStore()

const activeTab = ref<'equipments' | 'segments' | 'params'>('equipments')

const currentTable = computed(() => sldStore.currentTable)
const equipments = computed(() => sldStore.equipments)
const fiberSegments = computed(() => sldStore.fiberSegments)
const metadata = computed(() => currentTable.value?.metadata)
const transmissionParams = computed(() => currentTable.value?.transmissionParams)
const exportTemplateOptions = SLD_EXPORT_TEMPLATE_OPTIONS.map(option => ({
  ...option,
  label: option.value === 'legacy-v1' ? '兼容版 V1' : '标准版 2026.04',
}))
const exportTemplateVersion = computed<SLDExportTemplateVersion>(() =>
  currentTable.value?.metadata?.exportTemplateVersion || DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
)

const equipmentTypeLabels: Record<SLDEquipmentType, string> = {
  TE: '终端设备',
  PFE: '供电设备',
  REP: '放大器',
  BU: '分支器',
  EQ: '均衡器',
  JOINT: '接头盒',
  OADM: '光分插复用器',
}

const getEquipmentTypeClass = (type: SLDEquipmentType) => {
  const classes: Record<SLDEquipmentType, string> = {
    TE: 'bg-green-100 text-green-700',
    PFE: 'bg-yellow-100 text-yellow-700',
    REP: 'bg-blue-100 text-blue-700',
    BU: 'bg-purple-100 text-purple-700',
    EQ: 'bg-amber-100 text-amber-700',
    JOINT: 'bg-orange-100 text-orange-700',
    OADM: 'bg-cyan-100 text-cyan-700',
  }
  return classes[type] || 'bg-gray-100 text-gray-600'
}

const getEquipmentSpecification = (equipment: { type: SLDEquipmentType; componentRefId?: string; specifications?: string }) => {
  if (equipment.specifications?.trim()) return equipment.specifications
  if (!equipment.componentRefId) return ''

  switch (equipment.type) {
    case 'REP':
      return settingsStore.amplifierTypes.find(item => item.id === equipment.componentRefId)?.name || ''
    case 'BU':
    case 'OADM':
      return settingsStore.branchingUnitTypes.find(item => item.id === equipment.componentRefId)?.name || ''
    case 'EQ':
      return settingsStore.equalizerTypes.find(item => item.id === equipment.componentRefId)?.name || ''
    case 'JOINT':
      return settingsStore.jointBoxTypes.find(item => item.id === equipment.componentRefId)?.name || ''
    default:
      return ''
  }
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

const handleExportEquipments = async () => {
  if (!currentTable.value) return
  try {
    await exportSLDToExcel(currentTable.value)
    appStore.showNotification({ type: 'success', message: '导出设备表成功' })
  } catch (e) {
    appStore.showNotification({ type: 'error', message: '导出失败，请重试' })
  }
}

const handleExportXML = () => {
  // 优先导出当前 SLD 表格，避免丢失同步进来的均衡器/接头盒等设备
  if (currentTable.value && currentTable.value.equipments.length > 0) {
    exportSLDFile(currentTable.value)
    appStore.showNotification({ type: 'success', message: '导出 SLD XML 成功' })
    return
  }

  // 当 SLD 表格为空时，回退到当前路由的基础导出
  const currentRoute = routeStore.currentRoute
  if (currentRoute && currentRoute.points.length > 0) {
    exportSLDFileFromRoute(currentRoute, currentRoute.name, 2)
    appStore.showNotification({ type: 'success', message: '从路由导出 SLD XML 成功' })
    return
  }

  if (!currentTable.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择路由或 SLD 表格' })
    return
  }
  appStore.showNotification({ type: 'warning', message: '当前 SLD 表格没有设备可导出' })
}

const handleTemplateVersionChange = (event: Event) => {
  const version = (event.target as HTMLSelectElement).value as SLDExportTemplateVersion
  if (!currentTable.value) return
  sldStore.setExportTemplateVersion(version)
}

</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden">
    <CardHeader class="shrink-0 border-b">
      <div class="flex items-center gap-2">
        <Network class="w-5 h-5 text-purple-600" />
        <span class="font-semibold">SLD 表格管理</span>
      </div>
      <Button v-if="props.visible !== undefined" variant="ghost" size="sm" @click="emit('close')">
        <X class="w-4 h-4" />
      </Button>
    </CardHeader>

    <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
      <!-- 统计信息 -->
      <div v-if="metadata" class="px-4 py-3 bg-gray-50 border-b">
        <div class="grid grid-cols-4 xl:grid-cols-8 gap-4 text-sm">
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.totalLength?.toFixed(1) ?? '-' }}</div>
            <div class="text-xs text-gray-500">总长度(km)</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-green-600">{{ metadata.terminalCount }}</div>
            <div class="text-xs text-gray-500">终端</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.repeaterCount }}</div>
            <div class="text-xs text-gray-500">放大器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-purple-600">{{ metadata.branchingUnitCount }}</div>
            <div class="text-xs text-gray-500">分支器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-amber-600">{{ metadata.equalizerCount }}</div>
            <div class="text-xs text-gray-500">均衡器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-orange-600">{{ metadata.jointCount }}</div>
            <div class="text-xs text-gray-500">接头盒</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-cyan-600">{{ metadata.totalFiberPairs }}</div>
            <div class="text-xs text-gray-500">光纤对</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-indigo-600">{{ metadata.estimatedCapacity }}</div>
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
        <label class="flex items-center gap-2 text-xs text-gray-500">
          <span>导出版本</span>
          <select
            class="h-8 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
            :value="exportTemplateVersion"
            @change="handleTemplateVersionChange"
          >
            <option
              v-for="option in exportTemplateOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <Button variant="outline" size="sm" @click="handleExportXML">
          <Download class="w-4 h-4 mr-1" />
          导出XML
        </Button>
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
            导出设备表
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
                <td class="px-2 py-1.5 text-right border-b font-mono">{{ eq.kp?.toFixed(1) ?? '-' }}</td>
                <td class="px-2 py-1.5 text-right border-b">{{ eq.depth?.toFixed(0) ?? '-' }}</td>
                <td class="px-2 py-1.5 border-b text-gray-600 text-xs">{{ getEquipmentSpecification(eq) }}</td>
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
          <span class="text-xs text-gray-400">完整数据请使用顶部“导出XML”</span>
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
                <td class="px-2 py-1.5 text-right border-b font-mono">{{ seg.length?.toFixed(1) ?? '-' }}</td>
                <td class="px-2 py-1.5 text-center border-b">{{ seg.fiberPairs ?? '-' }}</td>
                <td class="px-2 py-1.5 text-center border-b font-mono text-xs">{{ seg.cableType ?? '-' }}</td>
                <td class="px-2 py-1.5 text-right border-b">{{ seg.totalLoss?.toFixed(1) ?? '-' }}</td>
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
        <span>模板 {{ exportTemplateVersion }}</span>
      </div>
    </CardContent>
  </Card>
</template>
