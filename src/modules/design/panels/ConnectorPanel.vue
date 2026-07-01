<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { computed, onMounted, ref, watch } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
import { useConnectorStore } from '@/stores/connector'
import { Edit2, Link2, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { platformDeviceEntityToConnectorElement } from '@/services/platform/deviceLibraryMapping'
import type { Id, PlanDeviceEntity, PlatformDictionary } from '@/services/platform/types'

const connectorStore = useConnectorStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const currentProjectId = computed(() => appStore.projectState.currentProject?.platformProjectId ?? null)
const loadingPlatformEntities = ref(false)
const filterType = ref('all')

const emit = defineEmits<{
  (e: 'edit', id: string): void
  (e: 'add'): void
}>()

const normalizeCode = (value: unknown) =>
  String(value ?? '').trim().toUpperCase().replace(/[\s_\-./()（）·:：]+/g, '')

const sameId = (left: unknown, right: unknown) => {
  if (left == null || right == null || left === '' || right === '') return false
  return String(left) === String(right)
}

const dictionaryByCode = computed(() => {
  const map = new Map<string, PlatformDictionary>()
  for (const item of settingsStore.platformDeviceTypeDictionaries) {
    if (!item.code) continue
    map.set(normalizeCode(item.code), item)
  }
  return map
})

const deviceTypeLabel = (entity: PlanDeviceEntity) => {
  const code = entity.deviceTypeCd || ''
  const dictionary = dictionaryByCode.value.get(normalizeCode(code))
  return entity.typeName || dictionary?.name || code || '-'
}

const libraryLabel = (entity: PlanDeviceEntity) => {
  if (entity.libraryName) return entity.libraryName
  const library = settingsStore.platformDeviceLibraries.find(item => sameId(item.id, entity.libraryId))
  return library?.name || '-'
}

const formatValue = (value: unknown) => {
  if (value == null || value === '') return '-'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-'
  return String(value)
}

const formatCoordinate = (value: unknown) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '-'
  return numeric.toFixed(6).replace(/\.?0+$/, '')
}

const badgePalette = [
  'bg-blue-50 text-blue-700 border-blue-100',
  'bg-emerald-50 text-emerald-700 border-emerald-100',
  'bg-amber-50 text-amber-700 border-amber-100',
  'bg-slate-50 text-slate-700 border-slate-100',
  'bg-cyan-50 text-cyan-700 border-cyan-100',
]

const typeBadgeClass = (code?: string | null) => {
  const source = normalizeCode(code)
  const index = Array.from(source).reduce((sum, char) => sum + char.charCodeAt(0), 0) % badgePalette.length
  return badgePalette[index] || badgePalette[0]
}

const dictionaryFilterOptions = computed(() =>
  settingsStore.platformDeviceTypeDictionaries
    .filter(item => item.code)
    .map(item => ({
      key: String(item.code),
      code: String(item.code),
      label: item.name ? `${item.name}` : String(item.code),
    })),
)

const entityCodeFilterOptions = computed(() => {
  const dictionaryCodes = new Set(dictionaryFilterOptions.value.map(option => normalizeCode(option.code)))
  const options: Array<{ key: string; code: string; label: string }> = []
  const used = new Set<string>()

  for (const entity of settingsStore.platformDeviceEntities) {
    const code = entity.deviceTypeCd || ''
    const normalized = normalizeCode(code)
    if (!code || dictionaryCodes.has(normalized) || used.has(normalized)) continue
    used.add(normalized)
    options.push({
      key: code,
      code,
      label: entity.typeName || code,
    })
  }

  return options
})

const filterOptions = computed(() => [
  ...dictionaryFilterOptions.value,
  ...entityCodeFilterOptions.value,
])

const filteredEntities = computed(() => {
  if (filterType.value === 'all') return settingsStore.platformDeviceEntities
  const selectedCode = normalizeCode(filterType.value)
  return settingsStore.platformDeviceEntities.filter(entity =>
    normalizeCode(entity.deviceTypeCd) === selectedCode,
  )
})

const ensureConnectorTable = () => {
  if (connectorStore.currentTable) return true
  const projectName = appStore.currentProjectName || '默认接线元表'
  connectorStore.createTable(projectName.endsWith('接线元表') ? projectName : `${projectName}_接线元表`)
  return Boolean(connectorStore.currentTable)
}

const syncConnectorStoreFromEntities = () => {
  ensureConnectorTable()
  if (!connectorStore.currentTable) return
  connectorStore.currentTable.elements = settingsStore.platformDeviceEntities
    .map(platformDeviceEntityToConnectorElement)
    .filter(element => element.type !== 'cable_segment')
  connectorStore.currentTable.updatedAt = new Date().toISOString()
}

const loadConnectorEntities = async (deviceTypeCd = filterType.value) => {
  const projectId = currentProjectId.value
  const selectedDeviceTypeCd = deviceTypeCd === 'all' ? '' : deviceTypeCd

  loadingPlatformEntities.value = true
  try {
    await settingsStore.loadPlatformDeviceLibraries()
    await settingsStore.loadPlatformDeviceEntities({
      ...(projectId ? { projectId } : {}),
      ...(selectedDeviceTypeCd ? { deviceTypeCd: selectedDeviceTypeCd } : {}),
      pageNumber: 1,
      pageSize: 1000,
    })
    syncConnectorStoreFromEntities()
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `器件实例加载失败：${(error as Error).message}`,
    })
  } finally {
    loadingPlatformEntities.value = false
  }
}

const loadDeviceTypeDictionaries = async () => {
  try {
    await settingsStore.loadPlatformDeviceTypeDictionaries()
    if (filterType.value !== 'all' && !filterOptions.value.some(option => normalizeCode(option.code) === normalizeCode(filterType.value))) {
      filterType.value = 'all'
    }
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `器件类型字典加载失败：${(error as Error).message}`,
    })
  }
}

const refreshPanelData = async () => {
  await loadDeviceTypeDictionaries()
  await loadConnectorEntities()
}

const handleFilterChange = (deviceTypeCd: string) => {
  filterType.value = deviceTypeCd
  void loadConnectorEntities(deviceTypeCd)
}

const localElementIdForEntity = (entity: PlanDeviceEntity) => {
  const existing = connectorStore.elements.find(element => sameId(element.platformEntityId, entity.id))
  if (existing) return existing.id

  const localElement = platformDeviceEntityToConnectorElement(entity)
  const { id: _ignored, ...localData } = localElement
  return connectorStore.addElement(localData) ?? null
}

const handleEdit = (entity: PlanDeviceEntity) => {
  const localId = localElementIdForEntity(entity)
  if (!localId) return
  emit('edit', localId)
}

const deleteConnector = async (entity: PlanDeviceEntity) => {
  if (!entity.id) return

  try {
    await settingsStore.removePlatformDeviceEntity(entity.id)
    const localElement = connectorStore.elements.find(element => sameId(element.platformEntityId, entity.id))
    if (localElement) connectorStore.deleteElement(localElement.id)
    appStore.showNotification({ type: 'success', message: '器件实例已删除' })
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `器件实例删除失败：${(error as Error).message}`,
    })
  }
}

onMounted(() => {
  void loadDeviceTypeDictionaries()
  void loadConnectorEntities()
})

watch(currentProjectId, () => {
  void loadConnectorEntities()
})
</script>

<template>
  <Card class="flex-1 flex flex-col">
    <CardHeader class="pb-2 flex-shrink-0">
      <span class="font-semibold text-sm flex items-center gap-2">
        <Link2 class="w-4 h-4 text-purple-500" />
        接线元管理
      </span>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          :disabled="loadingPlatformEntities || settingsStore.deviceTypeDictionaryLoading"
          title="刷新器件类型字典和平台器件实例"
          @click="refreshPanelData"
        >
          <RefreshCw class="w-4 h-4" :class="loadingPlatformEntities || settingsStore.deviceTypeDictionaryLoading ? 'animate-spin' : ''" />
        </Button>
        <Button variant="ghost" size="sm" class="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50" @click="emit('add')">
          <Plus class="w-4 h-4 mr-1" /> 添加
        </Button>
      </div>
    </CardHeader>

    <CardContent class="flex-1 overflow-hidden flex flex-col pt-0">
      <div class="flex gap-2 mb-3 flex-wrap border-b border-gray-100 pb-2">
        <button
          :class="[
            'px-2.5 py-1 text-xs font-medium transition-colors border-b-2',
            filterType === 'all'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          ]"
          @click="handleFilterChange('all')"
        >
          全部
        </button>
        <button
          v-for="option in filterOptions"
          :key="option.key"
          :class="[
            'px-2.5 py-1 text-xs font-medium transition-colors border-b-2',
            normalizeCode(filterType) === normalizeCode(option.code)
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          ]"
          @click="handleFilterChange(option.code)"
        >
          {{ option.label }}
        </button>
        <span v-if="settingsStore.deviceTypeDictionaryLoading" class="px-2.5 py-1 text-xs text-gray-400">加载中...</span>
      </div>

      <div class="flex-1 overflow-auto pr-1">
        <div v-if="loadingPlatformEntities" class="text-center py-8 text-gray-400 text-xs">
          <RefreshCw class="mx-auto mb-2 h-5 w-5 animate-spin text-blue-500" />
          <p>正在加载器件实例...</p>
        </div>
        <div v-else-if="filteredEntities.length === 0" class="text-center py-8 text-gray-400 text-xs">
          <p>暂无器件实例数据</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="entity in filteredEntities"
            :key="entity.id ?? `${entity.name}-${entity.deviceTypeCd}-${entity.libraryId}`"
            class="p-2.5 border border-gray-200 rounded-md hover:border-blue-300 transition-colors bg-white group"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="font-bold text-sm text-gray-800 truncate">{{ entity.name || entity.id || '未命名器件实例' }}</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0"
                    :class="typeBadgeClass(entity.deviceTypeCd)"
                  >
                    {{ deviceTypeLabel(entity) }}
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-x-3 gap-y-1 pl-0 text-xs text-gray-500">
                  <div>
                    器件库：
                    <span class="font-medium text-blue-600">{{ libraryLabel(entity) }}</span>
                  </div>
                  <div>
                    经度：
                    <span class="font-medium text-gray-700">{{ formatCoordinate(entity.longitude) }}</span>
                  </div>
                  <div>
                    纬度：
                    <span class="font-medium text-gray-700">{{ formatCoordinate(entity.latitude) }}</span>
                  </div>
                </div>
              </div>

              <div class="flex gap-1 flex-shrink-0">
                <button
                  class="h-6 w-6 p-0 flex items-center justify-center rounded hover:bg-gray-100"
                  title="编辑"
                  @click="handleEdit(entity)"
                >
                  <Edit2 class="w-3.5 h-3.5 text-gray-500 hover:text-blue-600" />
                </button>
                <button
                  class="h-6 w-6 p-0 flex items-center justify-center rounded hover:bg-gray-100"
                  title="删除"
                  @click="deleteConnector(entity)"
                >
                  <Trash2 class="w-3.5 h-3.5 text-gray-500 hover:text-red-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
