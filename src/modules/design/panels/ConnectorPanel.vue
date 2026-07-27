<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { computed, onMounted, ref, watch } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { Edit2, Link2, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { platformDeviceEntityToConnectorElement } from '@/services/platform/deviceLibraryMapping'
import { mergePlatformConnectorElements } from '@/utils/platformDeviceEntityMerge'
import type { Id, PlanDeviceEntity } from '@/services/platform/types'

const connectorStore = useConnectorStore()
const routeStore = useRouteStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()
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

interface PanelEntity extends PlanDeviceEntity {
  localElementId: string
  platformEntityId?: Id
}

const deviceTypeLabel = (entity: PlanDeviceEntity) => {
  const code = entity.deviceTypeCd || ''
  const dictionary = dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, code)
  return entity.typeName || dictionary?.name || code || '-'
}

const libraryLabel = (entity: PlanDeviceEntity) => {
  if (entity.libraryName) return entity.libraryName
  const library = settingsStore.platformDeviceLibraries.find(item => sameId(item.id, entity.libraryId))
  return library?.name || '-'
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
  dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.deviceType)
    .filter(item => item.code)
    .map(item => ({
      key: String(item.code),
      code: String(item.code),
      label: item.name ? `${item.name}` : String(item.code),
    })),
)

const panelEntities = computed<PanelEntity[]>(() => connectorStore.elements
  .filter(element => element.type !== 'cable_segment')
  .map(element => {
  const platformEntity = settingsStore.platformDeviceEntities.find(entity =>
    sameId(entity.id, element.platformEntityId)
  )
  const deviceTypeCd = platformEntity?.deviceTypeCd || element.deviceTypeCd || ''
  const dictionary = dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, deviceTypeCd)
  return {
    ...platformEntity,
    id: platformEntity?.id ?? element.id,
    localElementId: element.id,
    platformEntityId: element.platformEntityId,
    name: element.name || platformEntity?.name,
    deviceTypeCd,
    typeName: platformEntity?.typeName || dictionary?.name || deviceTypeCd,
    libraryId: platformEntity?.libraryId ?? element.componentRefId ?? element.fiberRefId,
    libraryName: platformEntity?.libraryName || element.specifications,
    longitude: element.longitude,
    latitude: element.latitude,
  }
}))

const entityCodeFilterOptions = computed(() => {
  const dictionaryCodes = new Set(dictionaryFilterOptions.value.map(option => normalizeCode(option.code)))
  const options: Array<{ key: string; code: string; label: string }> = []
  const used = new Set<string>()

  for (const entity of panelEntities.value) {
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
  if (filterType.value === 'all') return panelEntities.value
  const selectedCode = normalizeCode(filterType.value)
  return panelEntities.value.filter(entity =>
    normalizeCode(entity.deviceTypeCd) === selectedCode,
  )
})

const ensureConnectorTable = () => {
  const routeId = routeStore.currentRouteId
  if (routeId && connectorStore.selectTableByRoute(routeId)) return true
  if (connectorStore.currentTable) return true
  const projectName = appStore.currentProjectName || '默认接线元表'
  connectorStore.createTable(
    projectName.endsWith('接线元表') ? projectName : `${projectName}_接线元表`,
    routeId || undefined,
  )
  return Boolean(connectorStore.currentTable)
}

const syncConnectorStoreFromEntities = (replacePlatformElements: boolean) => {
  ensureConnectorTable()
  const currentTable = connectorStore.currentTable
  if (!currentTable) return
  const incomingElements = settingsStore.platformDeviceEntities
    .map(platformDeviceEntityToConnectorElement)
    .filter(element => element.type !== 'cable_segment')
  connectorStore.replaceTableElements(mergePlatformConnectorElements(
    currentTable.elements,
    incomingElements,
    { replacePlatformElements },
  ))
}

const loadConnectorEntities = async (deviceTypeCd = filterType.value) => {
  const projectId = currentProjectId.value
  const selectedDeviceTypeCd = deviceTypeCd === 'all' ? '' : deviceTypeCd

  loadingPlatformEntities.value = true
  try {
    await settingsStore.loadPlatformDeviceLibraries()
    if (projectId == null) return
    await settingsStore.loadPlatformDeviceEntities({
      projectId,
      ...(selectedDeviceTypeCd ? { deviceTypeCd: selectedDeviceTypeCd } : {}),
      pageNumber: 1,
      pageSize: 1000,
    })
    syncConnectorStoreFromEntities(!selectedDeviceTypeCd)
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `器件实例加载失败：${(error as Error).message}`,
    })
  } finally {
    loadingPlatformEntities.value = false
  }
}

const loadDeviceTypeDictionaries = async (force = false) => {
  try {
    await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType, force)
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
  await loadDeviceTypeDictionaries(true)
  await loadConnectorEntities()
}

const handleFilterChange = (deviceTypeCd: string) => {
  filterType.value = deviceTypeCd
}

const localElementIdForEntity = (entity: PanelEntity) => {
  if (entity.localElementId) return entity.localElementId
  const existing = connectorStore.elements.find(element => sameId(element.platformEntityId, entity.id))
  if (existing) return existing.id

  const localElement = platformDeviceEntityToConnectorElement(entity)
  const { id: _ignored, ...localData } = localElement
  return connectorStore.addElement(localData) ?? null
}

const handleEdit = (entity: PanelEntity) => {
  const localId = localElementIdForEntity(entity)
  if (!localId) return
  emit('edit', localId)
}

const deleteConnector = async (entity: PanelEntity) => {
  try {
    if (entity.platformEntityId != null) {
      await settingsStore.removePlatformDeviceEntity(entity.platformEntityId)
    }
    connectorStore.deleteElement(entity.localElementId)
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
  <Card class="flex-1 flex flex-col overflow-hidden">
    <CardHeader class="flex-shrink-0 px-3 py-2">
      <span class="font-semibold text-sm flex items-center gap-2 text-gray-800">
        <Link2 class="w-4 h-4 text-violet-500" />
        接线元管理
      </span>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="sm" class="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50" @click="emit('add')">
          <Plus class="w-4 h-4 mr-1" /> 添加
        </Button>
      </div>
    </CardHeader>

    <CardContent class="flex-1 overflow-hidden flex flex-col p-0">
      <div class="flex gap-x-5 gap-y-1 flex-wrap border-b border-gray-100 px-3 py-2">
        <button
          :class="[
            'py-1 text-xs font-medium transition-colors',
            filterType === 'all'
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-gray-800',
          ]"
          :aria-pressed="filterType === 'all'"
          @click="handleFilterChange('all')"
        >
          全部
        </button>
        <button
          v-for="option in filterOptions"
          :key="option.key"
          :class="[
            'py-1 text-xs font-medium transition-colors',
            normalizeCode(filterType) === normalizeCode(option.code)
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-gray-800',
          ]"
          :aria-pressed="normalizeCode(filterType) === normalizeCode(option.code)"
          @click="handleFilterChange(option.code)"
        >
          {{ option.label }}
        </button>
        <span v-if="dictionaryStore.isLoading(PLATFORM_DICTIONARY_TYPES.deviceType)" class="px-2.5 py-1 text-xs text-gray-400">加载中...</span>
      </div>

      <div class="flex-1 overflow-auto px-3 py-2.5">
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
            :key="entity.localElementId"
            class="rounded-md border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:border-gray-300 group"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-start gap-2">
                  <span class="min-w-0 flex-1 font-semibold text-sm leading-5 text-gray-900 break-words">{{ entity.name || entity.id || '未命名器件实例' }}</span>
                  <span
                    class="mt-0.5 text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 leading-4"
                    :class="typeBadgeClass(entity.deviceTypeCd)"
                  >
                    {{ deviceTypeLabel(entity) }}
                  </span>
                </div>

                <div class="mt-2 flex items-center gap-1.5 text-xs leading-5 text-gray-600">
                  <span class="shrink-0 text-gray-400">器件库</span>
                  <span class="min-w-0 font-medium text-blue-600 break-all">{{ libraryLabel(entity) }}</span>
                </div>

                <div class="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs leading-5 text-gray-600">
                  <div class="min-w-0">
                    <span class="text-gray-400">经度</span>
                    <span class="ml-1 font-mono text-gray-800">{{ formatCoordinate(entity.longitude) }}</span>
                  </div>
                  <div class="min-w-0">
                    <span class="text-gray-400">纬度</span>
                    <span class="ml-1 font-mono text-gray-800">{{ formatCoordinate(entity.latitude) }}</span>
                  </div>
                </div>
              </div>

              <div class="flex gap-1 flex-shrink-0">
                <button
                  class="h-8 w-8 p-0 flex items-center justify-center rounded text-gray-500 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  aria-label="编辑器件实例"
                  title="编辑"
                  @click="handleEdit(entity)"
                >
                  <Edit2 class="w-4 h-4" />
                </button>
                <button
                  class="h-8 w-8 p-0 flex items-center justify-center rounded text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                  aria-label="删除器件实例"
                  title="删除"
                  @click="deleteConnector(entity)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
