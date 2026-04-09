<script setup lang="ts">
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { useSLDStore } from '@/stores/sld'
import { Card, CardContent, CardHeader, Button } from '@/shared/components/base'
import { Network, Plus, Trash2, Wand2, RotateCcw, X } from 'lucide-vue-next'
import SLDTablePanel from '@/modules/design/panels/SLDTablePanel.vue'
import SLDEquipmentDialog from './SLDEquipmentDialog.vue'
import SLDSegmentDialog from './SLDSegmentDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const sldStore = useSLDStore()
const rplStore = useRPLStore()
const appStore = useAppStore()
const connectorStore = useConnectorStore()
const routeStore = useRouteStore()

const showEquipmentDialog = ref(false)
const showSegmentDialog = ref(false)
const editingEquipmentId = ref<string | undefined>()
const editingSegmentId = ref<string | undefined>()
const showCreateDialog = ref(false)
const newTableName = ref('')

const tables = computed(() => sldStore.tables)
const currentTable = computed(() => sldStore.currentTable)
const rplTables = computed(() => rplStore.tables)

const getSyncableConnectorElements = (routeId?: string) =>
  connectorStore.getElementsForRoute(routeId).filter(e =>
    e.type === 'landing' ||
    e.type === 'underwater' ||
    e.type === 'amplifier_e' ||
    e.type === 'amplifier_w' ||
    e.type === 'ola' ||
    e.type === 'bu' ||
    e.type === 'joint' ||
    e.type === 'equalizer'
  )

const getDefaultTableName = () => `${routeStore.selectedRoute?.name || '当前路由'}_SLD`

function ensureRouteTable(autoSync = false) {
  const routeId = routeStore.currentRouteId || currentTable.value?.routeId || undefined
  const syncable = getSyncableConnectorElements(routeId)

  let table = routeId
    ? sldStore.tables.find(item => item.routeId === routeId) || null
    : sldStore.currentTable

  if (!table && (routeId || syncable.length > 0)) {
    table = sldStore.createTable(getDefaultTableName(), routeId)
  } else if (table && sldStore.currentTableId !== table.id) {
    sldStore.selectTable(table.id)
  }

  if (table && autoSync && syncable.length > 0) {
    sldStore.syncAmplifiersFromConnector(syncable, { routeId })
  }

  return {
    table,
    routeId,
    syncableCount: syncable.length,
  }
}

function handleEditEquipment(equipmentId: string) {
  editingEquipmentId.value = equipmentId || undefined
  showEquipmentDialog.value = true
}

function handleEditSegment(segmentId: string) {
  editingSegmentId.value = segmentId || undefined
  showSegmentDialog.value = true
}

function handleCreateTable() {
  if (!newTableName.value.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入表格名称' })
    return
  }

  sldStore.createTable(newTableName.value.trim(), routeStore.currentRouteId || undefined)
  appStore.showNotification({ type: 'success', message: 'SLD 表格创建成功' })
  newTableName.value = ''
  showCreateDialog.value = false
}

function handleGenerateFromRPL(rplTableId: string, rplTableName: string) {
  const rplTable = rplStore.tables.find(table => table.id === rplTableId)
  if (!rplTable) return

  sldStore.generateFromRPL(rplTableId, rplTable.records, `${rplTableName}_SLD`, rplTable.routeId)
  appStore.showNotification({ type: 'success', message: `已从 RPL "${rplTableName}" 生成 SLD 表格` })
}

function handleDeleteTable(tableId: string) {
  sldStore.deleteTable(tableId)
  appStore.showNotification({ type: 'success', message: '表格已删除' })
}

function syncFromConnector() {
  const { table, routeId, syncableCount } = ensureRouteTable(false)
  if (!table) {
    appStore.showNotification({ type: 'warning', message: '请先选择路由或创建 SLD 表格' })
    return
  }

  const connectorElements = getSyncableConnectorElements(routeId)
  if (connectorElements.length === 0) {
    appStore.showNotification({ type: 'warning', message: '接线元中没有可同步的主干设备' })
    return
  }

  sldStore.syncAmplifiersFromConnector(connectorElements, { routeId })
  appStore.showNotification({ type: 'success', message: `已同步 ${syncableCount} 个设备到 SLD 表格` })
}

function autoCreateFromConnector() {
  const { table, syncableCount } = ensureRouteTable(true)
  if (!table || syncableCount === 0) {
    appStore.showNotification({ type: 'warning', message: '接线元中没有可用设备，请先完成系统设计设备落位' })
    return
  }

  appStore.showNotification({ type: 'success', message: `已自动建表并同步 ${syncableCount} 个设备` })
}

watch(() => props.visible, (visible) => {
  if (!visible) return
  ensureRouteTable(true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div class="w-[1100px] max-w-[95vw] h-[85vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <Network class="w-6 h-6 text-purple-600" />
            <span class="font-semibold text-lg">SLD 系统布局图管理</span>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="text-green-700 border-green-300 hover:bg-green-50"
              @click="autoCreateFromConnector"
              title="按当前路由自动建表并同步设备"
            >
              <Wand2 class="w-4 h-4 mr-1" />
              自动建表
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="text-blue-700 border-blue-300 hover:bg-blue-50"
              @click="syncFromConnector"
              title="同步当前路由接线元到 SLD"
            >
              <RotateCcw class="w-4 h-4 mr-1" />
              自动同步
            </Button>
            <Button variant="outline" size="sm" @click="showCreateDialog = true">
              <Plus class="w-4 h-4 mr-1" />
              新建表格
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              <X class="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <div class="w-64 border-r bg-gray-50 flex flex-col shrink-0">
            <div class="p-3 border-b bg-white">
              <h3 class="font-medium text-sm text-gray-700">SLD 表格列表</h3>
            </div>

            <div class="flex-1 overflow-auto p-2 space-y-1">
              <div
                v-for="table in tables"
                :key="table.id"
                :class="[
                  'p-3 rounded-lg cursor-pointer transition-colors',
                  currentTable?.id === table.id
                    ? 'bg-purple-100 border border-purple-300'
                    : 'bg-white border border-gray-200 hover:border-purple-200'
                ]"
                @click="sldStore.selectTable(table.id)"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-sm truncate">{{ table.name }}</span>
                  <button
                    class="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-500"
                    @click.stop="handleDeleteTable(table.id)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
                <div class="text-xs text-gray-500">
                  {{ table.equipments.length }} 设备 · {{ table.metadata.totalLength.toFixed(1) }} km
                </div>
              </div>

              <div v-if="tables.length === 0" class="p-4 text-center text-gray-400 text-sm">
                暂无 SLD 表格
              </div>
            </div>

            <div class="p-3 border-t bg-white">
              <h4 class="text-xs font-medium text-gray-500 mb-2">系统设计同步</h4>
              <button
                class="w-full px-2 py-1.5 text-left text-xs bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 hover:border-blue-300 transition-colors flex items-center gap-1.5"
                @click="syncFromConnector"
              >
                <RotateCcw class="w-3 h-3 text-blue-500" />
                <span class="text-blue-700">同步主干设备</span>
              </button>
            </div>

            <div v-if="rplTables.length > 0" class="p-3 border-t bg-white">
              <h4 class="text-xs font-medium text-gray-500 mb-2">从 RPL 生成</h4>
              <div class="space-y-1 max-h-32 overflow-auto">
                <button
                  v-for="rpl in rplTables"
                  :key="rpl.id"
                  class="w-full px-2 py-1.5 text-left text-xs bg-gray-50 hover:bg-purple-50 rounded border border-gray-200 hover:border-purple-300 transition-colors"
                  @click="handleGenerateFromRPL(rpl.id, rpl.name)"
                >
                  {{ rpl.name }}
                </button>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-hidden">
            <SLDTablePanel
              v-if="currentTable"
              @edit-equipment="handleEditEquipment"
              @edit-segment="handleEditSegment"
            />
            <div v-else class="h-full flex items-center justify-center text-gray-400">
              <div class="text-center">
                <Network class="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p class="text-lg">请选择或创建一个 SLD 表格</p>
                <p class="text-sm mt-2">当前弹窗会自动按路由建表并同步主干设备</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showCreateDialog"
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]"
      @click.self="showCreateDialog = false"
    >
      <Card class="w-[400px] shadow-xl">
        <CardHeader>
          <span class="font-semibold">新建 SLD 表格</span>
          <Button variant="ghost" size="sm" @click="showCreateDialog = false">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">表格名称</label>
              <input
                v-model="newTableName"
                type="text"
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500"
                placeholder="请输入表格名称"
                @keyup.enter="handleCreateTable"
              />
            </div>
            <div class="flex justify-end gap-2">
              <Button variant="outline" @click="showCreateDialog = false">取消</Button>
              <Button @click="handleCreateTable">创建</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <SLDEquipmentDialog
      :visible="showEquipmentDialog"
      :equipment-id="editingEquipmentId"
      @close="showEquipmentDialog = false"
      @saved="showEquipmentDialog = false"
    />

    <SLDSegmentDialog
      :visible="showSegmentDialog"
      :segment-id="editingSegmentId"
      @close="showSegmentDialog = false"
      @saved="showSegmentDialog = false"
    />
  </Teleport>
</template>
