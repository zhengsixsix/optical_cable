<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Network, X } from 'lucide-vue-next'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { useSLDStore } from '@/stores/sld'
import { ensureSldTableFromExistingData } from '@/services/ExistingDataTableSyncService'
import { Button } from '@/shared/components/base'
import SLDTablePanel from '@/modules/design/panels/SLDTablePanel.vue'
import SLDEquipmentDialog from './SLDEquipmentDialog.vue'
import SLDSegmentDialog from './SLDSegmentDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const cableSegmentStore = useCableSegmentStore()
const connectorStore = useConnectorStore()
const routeStore = useRouteStore()
const sldStore = useSLDStore()

const showEquipmentDialog = ref(false)
const showSegmentDialog = ref(false)
const editingEquipmentId = ref<string | undefined>()
const editingSegmentId = ref<string | undefined>()

const currentTable = computed(() => sldStore.currentTable)
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

function handleEditEquipment(equipmentId: string) {
  editingEquipmentId.value = equipmentId || undefined
  showEquipmentDialog.value = true
}

function handleEditSegment(segmentId: string) {
  editingSegmentId.value = segmentId || undefined
  showSegmentDialog.value = true
}

function ensureCurrentRouteTable() {
  if (!props.visible) return
  ensureSldTableFromExistingData(sldStore, {
    route: activeRoute.value,
    routeId: activeRouteId.value,
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
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <div class="flex h-[85vh] w-[1100px] max-w-[95vw] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div class="flex shrink-0 items-center justify-between border-b bg-gray-50 px-6 py-4">
          <div class="flex items-center gap-3">
            <Network class="h-6 w-6 text-purple-600" />
            <span class="text-lg font-semibold">SLD 系统布局图管理</span>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" title="关闭" @click="emit('close')">
              <X class="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <main class="flex-1 overflow-hidden">
            <SLDTablePanel
              v-if="currentTable"
              @edit-equipment="handleEditEquipment"
              @edit-segment="handleEditSegment"
            />
            <div v-else class="flex h-full items-center justify-center text-gray-400">
              <div class="text-center">
                <Network class="mx-auto mb-4 h-16 w-16 opacity-30" />
                <p class="text-lg">暂无可用的 SLD 数据</p>
                <p class="mt-2 text-sm">完成路由规划或系统设备配置后将自动生成</p>
              </div>
            </div>
          </main>
        </div>
      </div>
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
