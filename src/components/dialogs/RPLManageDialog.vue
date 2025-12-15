<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRPLStore, useRouteStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { 
  X, 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Download, 
  Upload,
  Check,
  AlertTriangle
} from 'lucide-vue-next'
import RPLTablePanel from '@/components/panels/RPLTablePanel.vue'
import RPLRecordDialog from './RPLRecordDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const rplStore = useRPLStore()
const routeStore = useRouteStore()
const appStore = useAppStore()

const showRecordDialog = ref(false)
const editingRecordId = ref<string | undefined>()
const showCreateDialog = ref(false)
const newTableName = ref('')
const importFile = ref<File | null>(null)

const tables = computed(() => rplStore.tables)
const currentTable = computed(() => rplStore.currentTable)
const paretoRoutes = computed(() => routeStore.paretoRoutes)

function handleEditRecord(recordId: string) {
  editingRecordId.value = recordId || undefined
  showRecordDialog.value = true
}

function handleRecordSaved() {
  showRecordDialog.value = false
  editingRecordId.value = undefined
}

function handleCreateTable() {
  if (!newTableName.value.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入表格名称' })
    return
  }
  rplStore.createTable(newTableName.value.trim(), 'manual')
  appStore.showNotification({ type: 'success', message: '表格创建成功' })
  newTableName.value = ''
  showCreateDialog.value = false
}

function handleGenerateFromRoute(routeId: string, routeName: string) {
  const route = routeStore.routes.find(r => r.id === routeId)
  if (!route) return
  
  rplStore.generateFromRoute(
    routeId,
    routeName,
    route.points,
    route.segments
  )
  appStore.showNotification({ type: 'success', message: `已从路由 "${routeName}" 生成RPL表格` })
}

function handleDeleteTable(tableId: string) {
  rplStore.deleteTable(tableId)
  appStore.showNotification({ type: 'success', message: '表格已删除' })
}

function handleImportCSV(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    const success = rplStore.importFromCSV(content, file.name.replace('.csv', ''), 'import')
    if (success) {
      appStore.showNotification({ type: 'success', message: '导入成功' })
    } else {
      appStore.showNotification({ type: 'error', message: '导入失败，请检查文件格式' })
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function handleValidateTable() {
  const result = rplStore.validateTable()
  if (result.valid) {
    appStore.showNotification({ type: 'success', message: '表格数据验证通过' })
  } else {
    const errorMsg = result.errors.map(e => e.message).join('; ')
    appStore.showNotification({ type: 'error', message: `验证失败: ${errorMsg}` })
  }
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
        <!-- 头部 -->
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <FileSpreadsheet class="w-6 h-6 text-blue-600" />
            <span class="font-semibold text-lg">RPL 表格管理</span>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" @click="showCreateDialog = true">
              <Plus class="w-4 h-4 mr-1" />
              新建表格
            </Button>
            <label class="inline-flex">
              <input 
                type="file" 
                accept=".csv" 
                class="hidden"
                @change="handleImportCSV"
              />
              <Button variant="outline" size="sm" as="span" class="cursor-pointer">
                <Upload class="w-4 h-4 mr-1" />
                导入CSV
              </Button>
            </label>
            <Button variant="ghost" size="sm" @click="emit('close')">
              <X class="w-5 h-5" />
            </Button>
          </div>
        </div>

        <!-- 主体内容 -->
        <div class="flex-1 flex overflow-hidden">
          <!-- 左侧: 表格列表 -->
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

            <!-- 从路由生成 -->
            <div v-if="paretoRoutes.length > 0" class="p-3 border-t bg-white">
              <h4 class="text-xs font-medium text-gray-500 mb-2">从路由生成</h4>
              <div class="space-y-1">
                <button
                  v-for="route in paretoRoutes"
                  :key="route.id"
                  class="w-full px-2 py-1.5 text-left text-xs bg-gray-50 hover:bg-blue-50 rounded border border-gray-200 hover:border-blue-300 transition-colors"
                  @click="handleGenerateFromRoute(route.id, route.name)"
                >
                  {{ route.name }}
                </button>
              </div>
            </div>
          </div>

          <!-- 右侧: 表格内容 -->
          <div class="flex-1 overflow-hidden">
            <RPLTablePanel 
              v-if="currentTable"
              @edit-record="handleEditRecord"
            />
            <div v-else class="h-full flex items-center justify-center text-gray-400">
              <div class="text-center">
                <FileSpreadsheet class="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p class="text-lg">请选择或创建一个表格</p>
                <p class="text-sm mt-2">可以从左侧选择表格，或从路由自动生成</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建表格对话框 -->
    <div
      v-if="showCreateDialog"
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]"
      @click.self="showCreateDialog = false"
    >
      <Card class="w-[400px] shadow-xl">
        <CardHeader>
          <span class="font-semibold">新建RPL表格</span>
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
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
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

    <!-- 记录编辑对话框 -->
    <RPLRecordDialog
      :visible="showRecordDialog"
      :record-id="editingRecordId"
      @close="showRecordDialog = false"
      @saved="handleRecordSaved"
    />
  </Teleport>
</template>
