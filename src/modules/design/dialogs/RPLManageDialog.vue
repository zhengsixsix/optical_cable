<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileSpreadsheet, X } from 'lucide-vue-next'
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

const cableSegmentStore = useCableSegmentStore()
const connectorStore = useConnectorStore()
const routeStore = useRouteStore()
const rplStore = useRPLStore()

const showRecordDialog = ref(false)
const editingRecordId = ref<string | undefined>()

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
