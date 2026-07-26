<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileSpreadsheet, Trash2, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { useRPLStore } from '@/stores/rpl'
import { Button } from '@/shared/components/base'
import { ensureRplTableFromExistingData } from '@/services/ExistingDataTableSyncService'
import RPLTablePanel from '@/modules/design/panels/RPLTablePanel.vue'
import RPLRecordDialog from './RPLRecordDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()
const cableSegmentStore = useCableSegmentStore()
const connectorStore = useConnectorStore()
const routeStore = useRouteStore()
const rplStore = useRPLStore()

const showRecordDialog = ref(false)
const editingRecordId = ref<string | undefined>()

const tables = computed(() => rplStore.tables)
const currentTable = computed(() => rplStore.currentTable)
const activeRoute = computed(() => routeStore.selectedRoute || routeStore.currentRoute)
const selectedRouteId = computed(() => routeStore.currentRouteId || activeRoute.value?.id || null)
const activeConnectorTable = computed(() => connectorStore.getTableByRoute(selectedRouteId.value))
const activeRouteId = computed(() => selectedRouteId.value || activeConnectorTable.value?.routeId || null)
const activeConnectorElements = computed(() => activeConnectorTable.value?.elements || [])
const activeConnectorCount = computed(() => activeConnectorElements.value.length)
const activeConnectorUpdatedAt = computed(() => activeConnectorTable.value?.updatedAt || '')
const cableSegmentCount = computed(() => cableSegmentStore.segments.length)
const activeRoutePointCount = computed(() => activeRoute.value?.points?.length || 0)
const activeRouteSegmentCount = computed(() => activeRoute.value?.segments?.length || 0)
const activeRouteUpdatedAt = computed(() => activeRoute.value?.updatedAt?.valueOf?.() || 0)

function ensureCurrentRouteTable() {
  if (!props.visible) return
  ensureRplTableFromExistingData(rplStore, {
    route: activeRoute.value,
    routeId: activeRouteId.value,
    routeName: activeRoute.value?.name,
    connectorElements: activeConnectorElements.value,
    cableSegments: cableSegmentStore.segments,
  })
}

watch(
  [
    () => props.visible,
    activeRouteId,
    activeConnectorCount,
    activeConnectorUpdatedAt,
    cableSegmentCount,
    activeRoutePointCount,
    activeRouteSegmentCount,
    activeRouteUpdatedAt,
  ],
  ensureCurrentRouteTable,
  { immediate: true },
)

function handleEditRecord(recordId: string) {
  editingRecordId.value = recordId || undefined
  showRecordDialog.value = true
}

function handleRecordSaved() {
  showRecordDialog.value = false
  editingRecordId.value = undefined
}

function handleDeleteTable(tableId: string) {
  rplStore.deleteTable(tableId)
  appStore.showNotification({ type: 'success', message: '表格已删除' })
}
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
            <FileSpreadsheet class="w-6 h-6 text-blue-600" />
            <span class="font-semibold text-lg">RPL 表格管理</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-5 h-5" />
          </Button>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <div class="w-64 border-r bg-gray-50 flex flex-col shrink-0">
            <div class="p-3 border-b bg-white">
              <h3 class="font-medium text-sm text-gray-700">表格列表</h3>
            </div>
            <div class="flex-1 overflow-auto p-2 space-y-1">
              <div
                v-for="table in tables"
                :key="table.id"
                :class="[
                  'p-3 rounded-lg cursor-pointer transition-colors',
                  currentTable?.id === table.id
                    ? 'bg-blue-100 border border-blue-300'
                    : 'bg-white border border-gray-200 hover:border-blue-200'
                ]"
                @click="rplStore.selectTable(table.id)"
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
                  {{ table.records.length }} 条记录 · {{ table.metadata.totalLength.toFixed(1) }}km
                </div>
              </div>

              <div v-if="tables.length === 0" class="p-4 text-center text-gray-400 text-sm">
                暂无表格
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-hidden">
            <RPLTablePanel
              v-if="currentTable"
              @edit-record="handleEditRecord"
            />
            <div v-else class="h-full flex items-center justify-center text-gray-400">
              <div class="text-center">
                <FileSpreadsheet class="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p class="text-lg">暂无可用的 RPL 数据</p>
                <p class="text-sm mt-2">完成路由规划或系统设备配置后将自动生成</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <RPLRecordDialog
      :visible="showRecordDialog"
      :record-id="editingRecordId"
      @close="showRecordDialog = false"
      @saved="handleRecordSaved"
    />
  </Teleport>
</template>
