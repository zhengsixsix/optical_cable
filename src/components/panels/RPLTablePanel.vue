<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRPLStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui'
import { 
  Table, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  X,
  Filter,
  RotateCcw,
  Edit3,
  Copy
} from 'lucide-vue-next'
import type { RPLPointType, RPLCableCode } from '@/types'

const props = defineProps<{
  visible?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit-record', recordId: string): void
}>()

const rplStore = useRPLStore()
const appStore = useAppStore()

const showFilterPanel = ref(false)
const filterPointType = ref<RPLPointType[]>([])
const filterCableType = ref<RPLCableCode[]>([])

const currentTable = computed(() => rplStore.currentTable)
const filteredRecords = computed(() => rplStore.filteredRecords)
const selectedRecordIds = computed(() => rplStore.selectedRecordIds)
const metadata = computed(() => currentTable.value?.metadata)

const pointTypeOptions = [
  { value: 'landing', label: '登陆站' },
  { value: 'repeater', label: '中继器' },
  { value: 'branching', label: '分支器' },
  { value: 'joint', label: '接头' },
  { value: 'waypoint', label: '航路点' },
]

const cableTypeOptions = [
  { value: 'LW', label: 'LW (轻型)' },
  { value: 'LWS', label: 'LWS (轻型加强)' },
  { value: 'SA', label: 'SA (单铠装)' },
  { value: 'DA', label: 'DA (双铠装)' },
  { value: 'SAS', label: 'SAS (单铠装加强)' },
]

const tableOptions = computed(() => 
  rplStore.tables.map(t => ({ value: t.id, label: t.name }))
)

const getPointTypeLabel = (type: RPLPointType) => {
  return pointTypeOptions.find(o => o.value === type)?.label || type
}

const getPointTypeClass = (type: RPLPointType) => {
  const classes: Record<RPLPointType, string> = {
    landing: 'bg-green-100 text-green-700',
    repeater: 'bg-blue-100 text-blue-700',
    branching: 'bg-purple-100 text-purple-700',
    joint: 'bg-orange-100 text-orange-700',
    waypoint: 'bg-gray-100 text-gray-600',
  }
  return classes[type] || 'bg-gray-100 text-gray-600'
}

const isSelected = (recordId: string) => selectedRecordIds.value.includes(recordId)

const handleSelectAll = (checked: boolean) => {
  if (checked) {
    rplStore.selectAllRecords()
  } else {
    rplStore.clearSelection()
  }
}

const handleRowClick = (recordId: string, event: MouseEvent) => {
  if (event.ctrlKey || event.metaKey) {
    rplStore.toggleRecordSelection(recordId)
  } else {
    rplStore.selectRecords([recordId])
  }
}

const handleDeleteSelected = () => {
  if (selectedRecordIds.value.length === 0) return
  rplStore.deleteRecords(selectedRecordIds.value)
  appStore.showNotification({ type: 'success', message: `已删除 ${selectedRecordIds.value.length} 条记录` })
}

const handleValidate = () => {
  const result = rplStore.validateTable()
  if (result.valid) {
    appStore.showNotification({ type: 'success', message: '表格验证通过' })
  } else {
    appStore.showNotification({ 
      type: 'warning', 
      message: `发现 ${result.errors.length} 个错误, ${result.warnings.length} 个警告` 
    })
  }
}

const handleExportCSV = () => {
  const csv = rplStore.exportToCSV()
  if (!csv) return
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${currentTable.value?.name || 'RPL'}_${Date.now()}.csv`
  link.click()
  appStore.showNotification({ type: 'success', message: '导出成功' })
}

const handleExportJSON = () => {
  const json = rplStore.exportToJSON()
  if (!json) return
  
  const blob = new Blob([json], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${currentTable.value?.name || 'RPL'}_${Date.now()}.json`
  link.click()
  appStore.showNotification({ type: 'success', message: '导出成功' })
}

const handleGenerateMock = () => {
  rplStore.generateMockData()
  appStore.showNotification({ type: 'success', message: '已生成示例数据' })
}

const applyFilter = () => {
  rplStore.setFilter({
    pointType: filterPointType.value.length ? filterPointType.value : undefined,
    cableType: filterCableType.value.length ? filterCableType.value : undefined,
  })
  showFilterPanel.value = false
}

const resetFilter = () => {
  filterPointType.value = []
  filterCableType.value = []
  rplStore.clearFilter()
  showFilterPanel.value = false
}

const allSelected = computed(() => 
  filteredRecords.value.length > 0 && 
  filteredRecords.value.every(r => selectedRecordIds.value.includes(r.id))
)

const someSelected = computed(() => 
  selectedRecordIds.value.length > 0 && !allSelected.value
)
</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden">
    <CardHeader class="shrink-0 border-b">
      <div class="flex items-center gap-2">
        <FileSpreadsheet class="w-5 h-5 text-blue-600" />
        <span class="font-semibold">RPL 表格管理</span>
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
      <!-- 表格选择和统计信息 -->
      <div class="px-4 py-3 bg-gray-50 border-b space-y-3">
        <!-- 表格选择 -->
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">当前表格:</span>
            <Select 
              v-if="tableOptions.length > 0"
              :model-value="rplStore.currentTableId || ''"
              :options="tableOptions"
              class="w-48"
              @update:model-value="rplStore.selectTable($event)"
            />
            <span v-else class="text-sm text-gray-400">暂无表格</span>
          </div>
        </div>

        <!-- 统计信息 -->
        <div v-if="metadata" class="grid grid-cols-6 gap-4 text-sm">
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.totalLength.toFixed(1) }}</div>
            <div class="text-xs text-gray-500">总长度(km)</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-green-600">{{ metadata.landingStations }}</div>
            <div class="text-xs text-gray-500">登陆站</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.repeaters }}</div>
            <div class="text-xs text-gray-500">中继器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-purple-600">{{ metadata.branchingUnits }}</div>
            <div class="text-xs text-gray-500">分支器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-cyan-600">{{ metadata.maxDepth.toFixed(0) }}</div>
            <div class="text-xs text-gray-500">最大水深(m)</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-gray-600">{{ metadata.averageDepth.toFixed(0) }}</div>
            <div class="text-xs text-gray-500">平均水深(m)</div>
          </div>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="px-4 py-2 border-b flex items-center justify-between bg-white">
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="emit('edit-record', '')">
            <Plus class="w-4 h-4 mr-1" />
            添加
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            :disabled="selectedRecordIds.length === 0"
            @click="handleDeleteSelected"
          >
            <Trash2 class="w-4 h-4 mr-1" />
            删除
          </Button>
          <div class="w-px h-5 bg-gray-300" />
          <Button variant="outline" size="sm" @click="showFilterPanel = !showFilterPanel">
            <Filter class="w-4 h-4 mr-1" />
            筛选
          </Button>
          <Button variant="outline" size="sm" @click="handleValidate">
            <CheckCircle class="w-4 h-4 mr-1" />
            验证
          </Button>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="handleExportCSV">
            <Download class="w-4 h-4 mr-1" />
            导出CSV
          </Button>
          <Button variant="outline" size="sm" @click="handleExportJSON">
            <Download class="w-4 h-4 mr-1" />
            导出JSON
          </Button>
        </div>
      </div>

      <!-- 筛选面板 -->
      <div v-if="showFilterPanel" class="px-4 py-3 border-b bg-blue-50 space-y-3">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">点类型:</span>
            <div class="flex gap-1">
              <label 
                v-for="opt in pointTypeOptions" 
                :key="opt.value"
                class="flex items-center gap-1 px-2 py-1 bg-white border rounded cursor-pointer hover:bg-gray-50"
              >
                <input 
                  type="checkbox" 
                  :value="opt.value"
                  v-model="filterPointType"
                  class="w-3 h-3"
                />
                <span class="text-xs">{{ opt.label }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">电缆类型:</span>
            <div class="flex gap-1">
              <label 
                v-for="opt in cableTypeOptions" 
                :key="opt.value"
                class="flex items-center gap-1 px-2 py-1 bg-white border rounded cursor-pointer hover:bg-gray-50"
              >
                <input 
                  type="checkbox" 
                  :value="opt.value"
                  v-model="filterCableType"
                  class="w-3 h-3"
                />
                <span class="text-xs">{{ opt.label }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <Button size="sm" @click="applyFilter">应用筛选</Button>
          <Button variant="outline" size="sm" @click="resetFilter">
            <RotateCcw class="w-3 h-3 mr-1" />
            重置
          </Button>
        </div>
      </div>

      <!-- 表格内容 -->
      <div class="flex-1 overflow-auto">
        <table class="w-full text-sm border-collapse">
          <thead class="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th class="px-2 py-2 text-center w-10 border-b">
                <input 
                  type="checkbox"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  class="w-4 h-4"
                  @change="handleSelectAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th class="px-2 py-2 text-center w-12 border-b font-medium text-gray-600">序号</th>
              <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">KP(km)</th>
              <th class="px-2 py-2 text-right w-24 border-b font-medium text-gray-600">经度</th>
              <th class="px-2 py-2 text-right w-24 border-b font-medium text-gray-600">纬度</th>
              <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">水深(m)</th>
              <th class="px-2 py-2 text-center w-20 border-b font-medium text-gray-600">点类型</th>
              <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">电缆</th>
              <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">段长(km)</th>
              <th class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600">累计(km)</th>
              <th class="px-2 py-2 text-right w-16 border-b font-medium text-gray-600">余缆%</th>
              <th class="px-2 py-2 text-left border-b font-medium text-gray-600">备注</th>
              <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="record in filteredRecords"
              :key="record.id"
              :class="[
                'hover:bg-blue-50 cursor-pointer transition-colors',
                isSelected(record.id) ? 'bg-blue-100' : ''
              ]"
              @click="handleRowClick(record.id, $event)"
            >
              <td class="px-2 py-1.5 text-center border-b" @click.stop>
                <input 
                  type="checkbox"
                  :checked="isSelected(record.id)"
                  class="w-4 h-4"
                  @change="rplStore.toggleRecordSelection(record.id)"
                />
              </td>
              <td class="px-2 py-1.5 text-center border-b text-gray-500">{{ record.sequence }}</td>
              <td class="px-2 py-1.5 text-right border-b font-mono">{{ record.kp.toFixed(3) }}</td>
              <td class="px-2 py-1.5 text-right border-b font-mono">{{ record.longitude.toFixed(6) }}</td>
              <td class="px-2 py-1.5 text-right border-b font-mono">{{ record.latitude.toFixed(6) }}</td>
              <td class="px-2 py-1.5 text-right border-b">{{ record.depth.toFixed(1) }}</td>
              <td class="px-2 py-1.5 text-center border-b">
                <span :class="['text-xs px-1.5 py-0.5 rounded', getPointTypeClass(record.pointType)]">
                  {{ getPointTypeLabel(record.pointType) }}
                </span>
              </td>
              <td class="px-2 py-1.5 text-center border-b font-mono text-xs">{{ record.cableType }}</td>
              <td class="px-2 py-1.5 text-right border-b">{{ record.segmentLength.toFixed(3) }}</td>
              <td class="px-2 py-1.5 text-right border-b font-medium">{{ record.cumulativeLength.toFixed(3) }}</td>
              <td class="px-2 py-1.5 text-right border-b">{{ record.slack.toFixed(1) }}</td>
              <td class="px-2 py-1.5 text-left border-b text-gray-600 truncate max-w-[120px]" :title="record.remarks">
                {{ record.remarks }}
              </td>
              <td class="px-2 py-1.5 text-center border-b" @click.stop>
                <button 
                  class="p-1 hover:bg-gray-200 rounded"
                  title="编辑"
                  @click="emit('edit-record', record.id)"
                >
                  <Edit3 class="w-3.5 h-3.5 text-gray-500" />
                </button>
              </td>
            </tr>
            <tr v-if="filteredRecords.length === 0">
              <td colspan="13" class="px-4 py-8 text-center text-gray-400">
                <FileSpreadsheet class="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>暂无数据</p>
                <Button variant="outline" size="sm" class="mt-2" @click="handleGenerateMock">
                  生成示例数据
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底部状态栏 -->
      <div class="px-4 py-2 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-500">
        <span>共 {{ filteredRecords.length }} 条记录</span>
        <span v-if="selectedRecordIds.length > 0">已选择 {{ selectedRecordIds.length }} 条</span>
      </div>
    </CardContent>
  </Card>
</template>
