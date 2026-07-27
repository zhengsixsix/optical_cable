<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSLDStore } from '@/stores/sld'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { Card, CardContent, Button } from '@/shared/components/base'
import { 
  Plus, 
  Trash2, 
  Download, 
  Edit3,
  Cable,
  Radio
} from 'lucide-vue-next'
import type { SLDEquipmentType } from '@/types'
import { getDeviceLibraryNameById } from '@/services/platform/deviceRuntime'
import { getDeviceTypeCodeForSldEquipmentType } from '@/services/platform/deviceTypeAdapter'

const emit = defineEmits<{  
  (e: 'edit-equipment', equipmentId: string): void
  (e: 'edit-segment', segmentId: string): void
}>()

const sldStore = useSLDStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()

const activeTab = ref<'equipments' | 'segments' | 'params'>('equipments')

const currentTable = computed(() => sldStore.currentTable)
const equipments = computed(() => sldStore.equipments)
const fiberSegments = computed(() => sldStore.fiberSegments)
const metadata = computed(() => currentTable.value?.metadata)
const transmissionParams = computed(() => currentTable.value?.transmissionParams)

const hasMeaningfulText = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return Boolean(normalized && normalized !== '-' && normalized !== '未提供')
}

const normalizeMeaningfulText = (value: string | null | undefined) =>
  hasMeaningfulText(value) ? value!.trim() : ''

const getEquipmentTypeLabel = (equipment: { type: SLDEquipmentType; deviceTypeCd?: string }) => {
  const code = equipment.deviceTypeCd?.trim() || getDeviceTypeCodeForSldEquipmentType(equipment.type)
  return dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, code)?.name || code || equipment.type
}

const getCableTypeLabel = (code?: string) =>
  dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.armoringType, code)?.name || code || '-'

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
  const explicitSpecification = normalizeMeaningfulText(equipment.specifications)
  if (explicitSpecification) return explicitSpecification
  if (!equipment.componentRefId) return ''

  let librarySpecification = ''
  switch (equipment.type) {
    case 'REP':
      librarySpecification = getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, equipment.componentRefId, 'amplifier') || ''
      break
    case 'BU':
    case 'OADM':
      librarySpecification = getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, equipment.componentRefId, 'branching') || ''
      break
    case 'EQ':
      librarySpecification = getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, equipment.componentRefId, 'equalizer') || ''
      break
    case 'JOINT':
      librarySpecification = getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, equipment.componentRefId, 'joint') || ''
      break
  }
  return normalizeMeaningfulText(librarySpecification)
}

const hasMeaningfulNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value !== 0

const showEquipmentDepthColumn = computed(() =>
  equipments.value.some(equipment => hasMeaningfulNumber(equipment.depth)))
const showEquipmentSpecificationColumn = computed(() =>
  equipments.value.some(equipment => hasMeaningfulText(getEquipmentSpecification(equipment))))
const equipmentVisibleColumnCount = computed(() => 5
  + Number(showEquipmentDepthColumn.value)
  + Number(showEquipmentSpecificationColumn.value))

const showFiberPairsColumn = computed(() =>
  fiberSegments.value.some(segment => hasMeaningfulNumber(segment.fiberPairs)))
const showCableTypeColumn = computed(() =>
  fiberSegments.value.some(segment => hasMeaningfulText(segment.cableType)))
const showTotalLossColumn = computed(() =>
  fiberSegments.value.some(segment => hasMeaningfulNumber(segment.totalLoss)))
const segmentVisibleColumnCount = computed(() => 5
  + Number(showFiberPairsColumn.value)
  + Number(showCableTypeColumn.value)
  + Number(showTotalLossColumn.value))

const handleDeleteEquipment = (id: string) => {
  sldStore.deleteEquipment(id)
  appStore.showNotification({ type: 'success', message: '设备已删除' })
}

onMounted(() => {
  void Promise.all([
    dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType),
    dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType),
  ]).catch(() => undefined)
})

const handleDeleteSegment = (id: string) => {
  sldStore.deleteFiberSegment(id)
  appStore.showNotification({ type: 'success', message: '光纤段已删除' })
}

const handleExportEquipments = async () => {
  if (!currentTable.value) return
  try {
    const { exportSLDToExcel } = await import('@/services/SLDExcelExportService')
    await exportSLDToExcel(currentTable.value)
    appStore.showNotification({ type: 'success', message: '导出设备表成功' })
  } catch (e) {
    appStore.showNotification({ type: 'error', message: '导出失败，请重试' })
  }
}

</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden rounded-none border-0 shadow-none">
    <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
      <!-- 统计信息 -->
      <div v-if="metadata" class="px-4 py-3 bg-gray-50 border-b">
        <div class="grid grid-cols-4 xl:grid-cols-7 gap-4 text-sm">
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
      </div>

      <!-- 设备列表 -->
      <div v-if="activeTab === 'equipments'" class="flex-1 flex flex-col overflow-hidden">
        <div class="px-4 py-2 border-b flex items-center justify-end bg-white">
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
                <th v-if="showEquipmentDepthColumn" class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">水深(m)</th>
                <th v-if="showEquipmentSpecificationColumn" class="px-2 py-2 text-left border-b font-medium text-gray-600">规格</th>
                <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="eq in equipments"
                :key="eq.id"
                class="hover:bg-blue-50 transition-colors"
              >
                <td class="px-2 py-1.5 text-center border-b text-gray-500">{{ eq.sequence }}</td>
                <td class="px-2 py-1.5 border-b font-medium">{{ eq.name }}</td>
                <td class="px-2 py-1.5 text-center border-b">
                  <span :class="['text-xs px-1.5 py-0.5 rounded', getEquipmentTypeClass(eq.type)]">
                    {{ getEquipmentTypeLabel(eq) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 text-right border-b font-mono">{{ eq.location === 'KP 未提供' ? '-' : eq.kp?.toFixed(1) ?? '-' }}</td>
                <td v-if="showEquipmentDepthColumn" class="px-2 py-1.5 text-right border-b">{{ eq.depth?.toFixed(0) ?? '-' }}</td>
                <td v-if="showEquipmentSpecificationColumn" class="px-2 py-1.5 border-b text-gray-600 text-xs">{{ getEquipmentSpecification(eq) || '-' }}</td>
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
                <td :colspan="equipmentVisibleColumnCount" class="px-4 py-8 text-center text-gray-400">
                  暂无设备数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 光纤段列表 -->
      <div v-if="activeTab === 'segments'" class="flex-1 flex flex-col overflow-hidden">
        <div class="px-4 py-2 border-b flex items-center bg-white">
          <Button variant="outline" size="sm" @click="emit('edit-segment', '')">
            <Plus class="w-4 h-4 mr-1" />
            添加光纤段
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
                <th v-if="showFiberPairsColumn" class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">光纤对</th>
                <th v-if="showCableTypeColumn" class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">电缆</th>
                <th v-if="showTotalLossColumn" class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">损耗(dB)</th>
                <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="seg in fiberSegments"
                :key="seg.id"
                class="hover:bg-blue-50 transition-colors"
              >
                <td class="px-2 py-1.5 text-center border-b text-gray-500">{{ seg.sequence }}</td>
                <td class="px-2 py-1.5 border-b">{{ seg.fromName }}</td>
                <td class="px-2 py-1.5 border-b">{{ seg.toName }}</td>
                <td class="px-2 py-1.5 text-right border-b font-mono">{{ seg.length?.toFixed(1) ?? '-' }}</td>
                <td v-if="showFiberPairsColumn" class="px-2 py-1.5 text-center border-b">{{ seg.fiberPairs ?? '-' }}</td>
                <td v-if="showCableTypeColumn" class="px-2 py-1.5 text-center border-b text-xs">{{ getCableTypeLabel(seg.cableType) }}</td>
                <td v-if="showTotalLossColumn" class="px-2 py-1.5 text-right border-b">{{ seg.totalLoss?.toFixed(1) ?? '-' }}</td>
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
                <td :colspan="segmentVisibleColumnCount" class="px-4 py-8 text-center text-gray-400">
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
      <div class="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500 shrink-0">
        <span>设备 {{ equipments.length }} 个 · 光纤段 {{ fiberSegments.length }} 段</span>
      </div>
    </CardContent>
  </Card>
</template>
