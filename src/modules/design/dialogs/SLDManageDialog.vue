<script setup lang="ts">
import { computed, ref } from 'vue'
import { Network, Plus, Trash2, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useRouteStore } from '@/stores/route'
import { useSLDStore } from '@/stores/sld'
import { Button, Card, CardContent, CardHeader } from '@/shared/components/base'
import SLDTablePanel from '@/modules/design/panels/SLDTablePanel.vue'
import SLDEquipmentDialog from './SLDEquipmentDialog.vue'
import SLDSegmentDialog from './SLDSegmentDialog.vue'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()
const routeStore = useRouteStore()
const sldStore = useSLDStore()

const showEquipmentDialog = ref(false)
const showSegmentDialog = ref(false)
const editingEquipmentId = ref<string | undefined>()
const editingSegmentId = ref<string | undefined>()
const showCreateDialog = ref(false)
const newTableName = ref('')

const tables = computed(() => sldStore.tables)
const currentTable = computed(() => sldStore.currentTable)

function handleEditEquipment(equipmentId: string) {
  editingEquipmentId.value = equipmentId || undefined
  showEquipmentDialog.value = true
}

function handleEditSegment(segmentId: string) {
  editingSegmentId.value = segmentId || undefined
  showSegmentDialog.value = true
}

function handleCreateTable() {
  const name = newTableName.value.trim()
  if (!name) {
    appStore.showNotification({ type: 'warning', message: '请输入表格名称' })
    return
  }

  sldStore.createTable(name, routeStore.currentRouteId || undefined)
  appStore.showNotification({ type: 'success', message: 'SLD 表格创建成功' })
  newTableName.value = ''
  showCreateDialog.value = false
}

function handleDeleteTable(tableId: string) {
  sldStore.deleteTable(tableId)
  appStore.showNotification({ type: 'success', message: '表格已删除' })
}
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
            <Button variant="outline" size="sm" @click="showCreateDialog = true">
              <Plus class="mr-1 h-4 w-4" />
              新建表格
            </Button>
            <Button variant="ghost" size="sm" title="关闭" @click="emit('close')">
              <X class="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <aside class="flex w-64 shrink-0 flex-col border-r bg-gray-50">
            <div class="border-b bg-white p-3">
              <h3 class="text-sm font-medium text-gray-700">SLD 表格列表</h3>
            </div>
            <div class="flex-1 space-y-1 overflow-auto p-2">
              <div
                v-for="table in tables"
                :key="table.id"
                class="cursor-pointer border p-3 transition-colors"
                :class="currentTable?.id === table.id ? 'border-purple-300 bg-purple-100' : 'border-gray-200 bg-white hover:border-purple-200'"
                @click="sldStore.selectTable(table.id)"
              >
                <div class="mb-1 flex items-center justify-between">
                  <span class="truncate text-sm font-medium">{{ table.name }}</span>
                  <button
                    class="p-1 text-gray-400 hover:bg-red-100 hover:text-red-500"
                    title="删除表格"
                    @click.stop="handleDeleteTable(table.id)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
                <div class="text-xs text-gray-500">
                  {{ table.equipments.length }} 设备 · {{ table.metadata.totalLength.toFixed(1) }} km
                </div>
              </div>
              <div v-if="tables.length === 0" class="p-4 text-center text-sm text-gray-400">
                暂无 SLD 表格
              </div>
            </div>
          </aside>

          <main class="flex-1 overflow-hidden">
            <SLDTablePanel
              v-if="currentTable"
              @edit-equipment="handleEditEquipment"
              @edit-segment="handleEditSegment"
            />
            <div v-else class="flex h-full items-center justify-center text-gray-400">
              <div class="text-center">
                <Network class="mx-auto mb-4 h-16 w-16 opacity-30" />
                <p class="text-lg">暂无 SLD 表格</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>

    <div
      v-if="showCreateDialog"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      @click.self="showCreateDialog = false"
    >
      <Card class="w-[400px] shadow-xl">
        <CardHeader>
          <span class="font-semibold">新建 SLD 表格</span>
          <Button variant="ghost" size="sm" title="关闭" @click="showCreateDialog = false">
            <X class="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">表格名称</label>
              <input
                v-model="newTableName"
                type="text"
                class="w-full rounded border px-3 py-2 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
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
