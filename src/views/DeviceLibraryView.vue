<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import DeviceDynamicValueForm from '@/components/settings/DeviceDynamicValueForm.vue'
import DeviceTypeTabs from '@/components/settings/DeviceTypeTabs.vue'
import { Card, CardContent, CardHeader, Button, Input } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { platformDictionaryApi } from '@/services/platform/api'
import {
  buildDeviceValueList,
  deviceValueListToMap,
} from '@/services/platform/deviceAttributes'
import type {
  Id,
  PlanDeviceEntity,
  PlanDeviceLibrary,
  PlatformDictionary,
} from '@/services/platform/types'
import {
  Database,
  Edit2,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-vue-next'

const DEVICE_TYPE_DICTIONARY_TYPE = 'DEVICE_TYPE'

const settingsStore = useSettingsStore()
const appStore = useAppStore()

const deviceTypes = ref<PlatformDictionary[]>([])
const deviceTypesLoading = ref(false)
const activeDeviceTypeCd = ref('')
const searchKeyword = ref('')
const selectedLibraryId = ref<Id | ''>('')

const showLibraryDialog = ref(false)
const showEntityDialog = ref(false)
const libraryValues = ref<Record<string, string>>({})
const entityValues = ref<Record<string, string>>({})
const inheritedLibraryValues = ref<Record<string, string>>({})

const libraryForm = reactive({
  id: undefined as Id | undefined,
  name: '',
  projectId: '' as Id | '',
  deviceTypeCd: '',
  iconId: '' as Id | '',
  iconWidth: 48,
  iconHeight: 48,
  dialogWindowId: '',
})

const entityForm = reactive({
  id: undefined as Id | undefined,
  name: '',
  libraryId: '' as Id | '',
  deviceTypeCd: '',
  projectId: '' as Id | '',
  longitude: '' as number | string,
  latitude: '' as number | string,
  sortNum: 999,
  iconId: '' as Id | '',
  iconWidth: 48,
  iconHeight: 48,
  dialogWindowId: '',
})

const sameId = (left: unknown, right: unknown) => {
  if (left == null || right == null || left === '' || right === '') return false
  return String(left) === String(right)
}

const optionalId = (value: unknown): Id | null => {
  if (value === '' || value == null) return null
  return typeof value === 'number' ? value : String(value)
}

const optionalNumber = (value: unknown): number | null => {
  if (value === '' || value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const currentProjectId = computed(() => appStore.projectState.currentProject?.platformProjectId ?? '')
const currentProjectName = computed(() => appStore.currentProjectName || '未打开项目')

const currentDeviceType = computed(() =>
  deviceTypes.value.find(item => item.code && String(item.code) === activeDeviceTypeCd.value) ?? null,
)

const deviceTypeName = (code?: string | null) => {
  if (!code) return '-'
  return deviceTypes.value.find(item => item.code && String(item.code) === String(code))?.name || code
}

const defaultConfigValues = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {}
  for (const config of settingsStore.platformDeviceConfigs) {
    const code = config.code?.trim()
    if (!code) continue
    result[code] = config.defaultValue == null ? '' : String(config.defaultValue)
  }
  return result
})

const filteredLibraries = computed(() => {
  if (!activeDeviceTypeCd.value) return []
  const keyword = searchKeyword.value.trim().toLowerCase()
  return settingsStore.platformDeviceLibraries.filter(library => {
    if (library.deviceTypeCd && String(library.deviceTypeCd) !== activeDeviceTypeCd.value) return false
    if (!keyword) return true
    return [
      library.id,
      library.name,
      library.typeName,
      library.dialogWindowId,
      library.iconName,
    ].some(value => String(value ?? '').toLowerCase().includes(keyword))
  })
})

const filteredEntities = computed(() => {
  if (!activeDeviceTypeCd.value) return []
  const keyword = searchKeyword.value.trim().toLowerCase()
  return settingsStore.platformDeviceEntities.filter(entity => {
    if (entity.deviceTypeCd && String(entity.deviceTypeCd) !== activeDeviceTypeCd.value) return false
    if (selectedLibraryId.value && !sameId(entity.libraryId, selectedLibraryId.value)) return false
    if (!keyword) return true
    return [
      entity.id,
      entity.name,
      entity.libraryName,
      entity.dialogWindowId,
      entity.longitude,
      entity.latitude,
    ].some(value => String(value ?? '').toLowerCase().includes(keyword))
  })
})

const selectedLibrary = computed(() =>
  settingsStore.platformDeviceLibraries.find(item => sameId(item.id, selectedLibraryId.value)) ?? null,
)

const entityCountByLibraryId = computed(() => {
  const result: Record<string, number> = {}
  for (const entity of settingsStore.platformDeviceEntities) {
    if (entity.libraryId == null) continue
    const key = String(entity.libraryId)
    result[key] = (result[key] ?? 0) + 1
  }
  return result
})

const statistics = computed(() => ({
  deviceTypeCount: deviceTypes.value.length,
  libraryCount: filteredLibraries.value.length,
  entityCount: filteredEntities.value.length,
  configCount: settingsStore.platformDeviceConfigs.length,
}))

const selectedLibraryName = computed(() => selectedLibrary.value?.name || '未选择器件库')

const attributePreview = (library: PlanDeviceLibrary | PlanDeviceEntity) => {
  const valueMap = {
    ...defaultConfigValues.value,
    ...deviceValueListToMap(library.deviceValueList),
  }
  return settingsStore.platformDeviceConfigs
    .filter(config => Boolean(config.code?.trim()))
    .slice(0, 3)
    .map(config => {
      const code = String(config.code)
      return {
        code,
        label: config.name || code,
        value: valueMap[code] || '-',
        unit: config.unit || '',
      }
    })
}

const ensureSelectedLibrary = () => {
  if (selectedLibraryId.value && settingsStore.platformDeviceLibraries.some(item => sameId(item.id, selectedLibraryId.value))) {
    return
  }
  selectedLibraryId.value = settingsStore.platformDeviceLibraries[0]?.id ?? ''
}

const loadDeviceTypes = async () => {
  deviceTypesLoading.value = true
  try {
    deviceTypes.value = (await platformDictionaryApi.listItem(DEVICE_TYPE_DICTIONARY_TYPE)) ?? []
    activeDeviceTypeCd.value = deviceTypes.value[0]?.code ? String(deviceTypes.value[0].code) : ''
    if (!activeDeviceTypeCd.value) selectedLibraryId.value = ''
  } catch (error) {
    deviceTypes.value = []
    activeDeviceTypeCd.value = ''
    selectedLibraryId.value = ''
    appStore.showNotification({ type: 'error', message: `设备类型字典加载失败：${(error as Error).message}` })
  } finally {
    deviceTypesLoading.value = false
  }
}

const loadDeviceData = async (deviceTypeCd: string) => {
  if (!deviceTypeCd) return
  try {
    await Promise.all([
      settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd }),
      settingsStore.loadPlatformDeviceLibraries({ pageNumber: 1, pageSize: 1000, deviceTypeCd }),
      settingsStore.loadPlatformDeviceEntities({ pageNumber: 1, pageSize: 1000, deviceTypeCd }),
    ])
    ensureSelectedLibrary()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件数据加载失败：${(error as Error).message}` })
  }
}

const refreshCurrent = async () => {
  if (!activeDeviceTypeCd.value) {
    await loadDeviceTypes()
    return
  }
  await loadDeviceData(activeDeviceTypeCd.value)
}

const resetLibraryForm = () => {
  Object.assign(libraryForm, {
    id: undefined,
    name: '',
    projectId: currentProjectId.value || '',
    deviceTypeCd: activeDeviceTypeCd.value,
    iconId: '',
    iconWidth: 48,
    iconHeight: 48,
    dialogWindowId: '',
  })
  libraryValues.value = { ...defaultConfigValues.value }
}

const openCreateLibrary = async () => {
  if (!activeDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先配置设备类型字典' })
    return
  }
  await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd: activeDeviceTypeCd.value })
  resetLibraryForm()
  showLibraryDialog.value = true
}

const openEditLibrary = async (library: PlanDeviceLibrary) => {
  if (!library.id) return
  try {
    const detail = await settingsStore.loadPlatformDeviceLibraryDetail(library.id)
    const deviceTypeCd = detail.deviceTypeCd || activeDeviceTypeCd.value
    if (deviceTypeCd) await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd })
    Object.assign(libraryForm, {
      id: detail.id,
      name: detail.name || '',
      projectId: detail.projectId ?? '',
      deviceTypeCd,
      iconId: detail.iconId ?? '',
      iconWidth: detail.iconSize?.width ?? 48,
      iconHeight: detail.iconSize?.height ?? 48,
      dialogWindowId: detail.dialogWindowId || '',
    })
    libraryValues.value = {
      ...defaultConfigValues.value,
      ...deviceValueListToMap(detail.deviceValueList),
    }
    showLibraryDialog.value = true
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库详情加载失败：${(error as Error).message}` })
  }
}

const saveLibrary = async () => {
  if (!libraryForm.deviceTypeCd) {
    appStore.showNotification({ type: 'warning', message: '请选择设备类型' })
    return
  }
  if (!libraryForm.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入器件库名称' })
    return
  }

  try {
    const id = await settingsStore.savePlatformDeviceLibrary({
      id: libraryForm.id,
      projectId: optionalId(libraryForm.projectId),
      name: libraryForm.name.trim(),
      deviceTypeCd: libraryForm.deviceTypeCd,
      iconId: optionalId(libraryForm.iconId),
      iconSize: {
        width: optionalNumber(libraryForm.iconWidth) ?? 48,
        height: optionalNumber(libraryForm.iconHeight) ?? 48,
      },
      dialogWindowId: libraryForm.dialogWindowId || null,
      bindFuncList: [],
      deviceValueList: buildDeviceValueList(libraryValues.value),
    })
    selectedLibraryId.value = id
    await loadDeviceData(activeDeviceTypeCd.value)
    showLibraryDialog.value = false
    appStore.showNotification({ type: 'success', message: '器件库已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库保存失败：${(error as Error).message}` })
  }
}

const deleteLibrary = async (library: PlanDeviceLibrary) => {
  if (!library.id) return
  if (!window.confirm(`确认删除器件库「${library.name || library.id}」？`)) return
  try {
    await settingsStore.removePlatformDeviceLibrary(library.id)
    if (sameId(selectedLibraryId.value, library.id)) selectedLibraryId.value = ''
    await loadDeviceData(activeDeviceTypeCd.value)
    appStore.showNotification({ type: 'success', message: '器件库已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库删除失败：${(error as Error).message}` })
  }
}

const resetEntityForm = () => {
  Object.assign(entityForm, {
    id: undefined,
    name: '',
    libraryId: selectedLibraryId.value || '',
    deviceTypeCd: activeDeviceTypeCd.value,
    projectId: currentProjectId.value || '',
    longitude: '',
    latitude: '',
    sortNum: 999,
    iconId: '',
    iconWidth: 48,
    iconHeight: 48,
    dialogWindowId: '',
  })
  inheritedLibraryValues.value = {}
  entityValues.value = {}
}

const applyLibraryToEntityForm = async (library: PlanDeviceLibrary, resetValues: boolean) => {
  if (!library.id) return
  const detail = await settingsStore.loadPlatformDeviceLibraryDetail(library.id)
  const deviceTypeCd = detail.deviceTypeCd || activeDeviceTypeCd.value
  if (deviceTypeCd) await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd })

  Object.assign(entityForm, {
    libraryId: detail.id ?? '',
    deviceTypeCd,
    dialogWindowId: detail.dialogWindowId || '',
    iconId: detail.iconId ?? '',
    iconWidth: detail.iconSize?.width ?? 48,
    iconHeight: detail.iconSize?.height ?? 48,
  })

  inheritedLibraryValues.value = {
    ...defaultConfigValues.value,
    ...deviceValueListToMap(detail.deviceValueList),
  }
  if (resetValues) {
    entityValues.value = { ...inheritedLibraryValues.value }
  }
}

const openCreateEntity = async (library: PlanDeviceLibrary | null = selectedLibrary.value) => {
  const targetLibrary = library ?? selectedLibrary.value
  if (!targetLibrary?.id) {
    appStore.showNotification({ type: 'warning', message: '请先选择器件库' })
    return
  }
  try {
    selectedLibraryId.value = targetLibrary.id
    resetEntityForm()
    await applyLibraryToEntityForm(targetLibrary, true)
    showEntityDialog.value = true
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库属性加载失败：${(error as Error).message}` })
  }
}

const openEditEntity = async (entity: PlanDeviceEntity) => {
  if (!entity.id) return
  try {
    const detail = await settingsStore.loadPlatformDeviceEntityDetail(entity.id)
    const library = settingsStore.platformDeviceLibraries.find(item => sameId(item.id, detail.libraryId))
    resetEntityForm()
    Object.assign(entityForm, {
      id: detail.id,
      name: detail.name || '',
      libraryId: detail.libraryId ?? '',
      deviceTypeCd: detail.deviceTypeCd || activeDeviceTypeCd.value,
      projectId: detail.projectId ?? '',
      longitude: detail.longitude ?? '',
      latitude: detail.latitude ?? '',
      sortNum: detail.sortNum ?? 999,
      iconId: detail.iconId ?? '',
      iconWidth: detail.iconSize?.width ?? 48,
      iconHeight: detail.iconSize?.height ?? 48,
      dialogWindowId: detail.dialogWindowId || '',
    })

    if (library) {
      await applyLibraryToEntityForm(library, false)
    } else if (detail.deviceTypeCd) {
      await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd: detail.deviceTypeCd })
      inheritedLibraryValues.value = { ...defaultConfigValues.value }
    }
    entityValues.value = {
      ...inheritedLibraryValues.value,
      ...deviceValueListToMap(detail.deviceValueList),
    }
    showEntityDialog.value = true
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件实例详情加载失败：${(error as Error).message}` })
  }
}

const handleEntityLibraryChange = async () => {
  const library = settingsStore.platformDeviceLibraries.find(item => sameId(item.id, entityForm.libraryId))
  if (!library) return
  try {
    await applyLibraryToEntityForm(library, true)
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库属性加载失败：${(error as Error).message}` })
  }
}

const saveEntity = async () => {
  const libraryId = optionalId(entityForm.libraryId)
  if (!libraryId) {
    appStore.showNotification({ type: 'warning', message: '请选择器件库' })
    return
  }
  if (!entityForm.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入器件实例名称' })
    return
  }

  try {
    await settingsStore.savePlatformDeviceEntity({
      id: entityForm.id,
      name: entityForm.name.trim(),
      deviceTypeCd: entityForm.deviceTypeCd || activeDeviceTypeCd.value || null,
      iconId: optionalId(entityForm.iconId),
      iconSize: {
        width: optionalNumber(entityForm.iconWidth) ?? 48,
        height: optionalNumber(entityForm.iconHeight) ?? 48,
      },
      dialogWindowId: entityForm.dialogWindowId || null,
      bindFuncList: [],
      libraryId,
      longitude: optionalNumber(entityForm.longitude),
      latitude: optionalNumber(entityForm.latitude),
      projectId: optionalId(entityForm.projectId),
      sortNum: optionalNumber(entityForm.sortNum) ?? 999,
      deviceValueList: buildDeviceValueList(entityValues.value),
    })
    await loadDeviceData(activeDeviceTypeCd.value)
    showEntityDialog.value = false
    appStore.showNotification({ type: 'success', message: '器件实例已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件实例保存失败：${(error as Error).message}` })
  }
}

const deleteEntity = async (entity: PlanDeviceEntity) => {
  if (!entity.id) return
  if (!window.confirm(`确认删除器件实例「${entity.name || entity.id}」？`)) return
  try {
    await settingsStore.removePlatformDeviceEntity(entity.id)
    await loadDeviceData(activeDeviceTypeCd.value)
    appStore.showNotification({ type: 'success', message: '器件实例已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件实例删除失败：${(error as Error).message}` })
  }
}

watch(activeDeviceTypeCd, deviceTypeCd => {
  selectedLibraryId.value = ''
  if (deviceTypeCd) void loadDeviceData(deviceTypeCd)
})

onMounted(() => {
  void loadDeviceTypes()
})
</script>

<template>
  <MainLayout>
    <template #toolbar>
      <div class="flex items-center justify-between border-b bg-white px-4 py-2 dark:bg-gray-900" style="border-color: var(--app-border-color)">
        <div class="flex min-w-0 items-center gap-2">
          <Database class="h-5 w-5 text-blue-500" />
          <span class="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200">器件库管理</span>
          <span class="truncate text-xs text-gray-400">当前项目：{{ currentProjectName }}</span>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="deviceTypesLoading" @click="refreshCurrent">
            <RefreshCw class="mr-1 h-4 w-4" :class="{ 'animate-spin': deviceTypesLoading || settingsStore.deviceLibraryLoading || settingsStore.deviceEntityLoading }" />
            刷新
          </Button>
          <Button size="sm" :disabled="!activeDeviceTypeCd" @click="openCreateLibrary">
            <Plus class="mr-1 h-4 w-4" />
            新增器件库
          </Button>
        </div>
      </div>
    </template>

    <template #left>
      <Card>
        <CardHeader class="pb-2">
          <span class="text-sm font-semibold">字典类型</span>
        </CardHeader>
        <CardContent class="space-y-3 pt-0">
          <div v-if="deviceTypesLoading" class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-gray-400" style="border-color: var(--app-border-color)">
            正在加载设备类型
          </div>
          <div v-else-if="deviceTypes.length === 0" class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-gray-400" style="border-color: var(--app-border-color)">
            暂无 DEVICE_TYPE 字典数据
          </div>
          <button
            v-for="item in deviceTypes"
            v-else
            :key="item.code || item.id"
            type="button"
            class="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors"
            :class="activeDeviceTypeCd === item.code ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'"
            @click="item.code && (activeDeviceTypeCd = String(item.code))"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ item.name || item.code }}</span>
              <span class="block truncate text-xs text-gray-400">{{ item.code }}</span>
            </span>
          </button>

          <div class="border-t pt-3 text-sm dark:border-gray-700">
            <div class="flex justify-between py-1">
              <span class="text-gray-500">类型数</span>
              <span class="font-semibold">{{ statistics.deviceTypeCount }}</span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-gray-500">库型号</span>
              <span class="font-semibold">{{ statistics.libraryCount }}</span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-gray-500">实例</span>
              <span class="font-semibold">{{ statistics.entityCount }}</span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-gray-500">动态属性</span>
              <span class="font-semibold">{{ statistics.configCount }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #center>
      <Card class="flex flex-1 flex-col">
        <CardHeader class="block space-y-3 p-0">
          <DeviceTypeTabs
            v-model="activeDeviceTypeCd"
            :items="deviceTypes"
            :loading="deviceTypesLoading"
          />
          <div class="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ currentDeviceType?.name || '未选择设备类型' }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">器件库定义型号和公共属性，器件实例继承库属性并扩展位置坐标。</div>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative">
                <Search class="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input v-model="searchKeyword" placeholder="搜索名称、编号、窗口" class="w-56 pl-8" />
              </div>
              <Button variant="outline" size="sm" :disabled="!selectedLibrary" @click="openCreateEntity()">
                <MapPin class="mr-1 h-4 w-4" />
                新增实例
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent class="flex-1 overflow-auto p-0">
          <div v-if="!activeDeviceTypeCd" class="flex h-full items-center justify-center p-8 text-sm text-gray-400">
            请先在平台字典中维护 DEVICE_TYPE，页面不会使用默认类型兜底。
          </div>

          <div v-else class="grid h-full min-h-[520px] grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
            <section class="min-w-0 border-r dark:border-gray-700" style="border-color: var(--app-border-color)">
              <div class="flex h-11 items-center justify-between border-b px-3" style="border-color: var(--app-border-color)">
                <div class="flex items-center gap-2 text-sm font-semibold">
                  <Layers class="h-4 w-4 text-blue-500" />
                  器件库
                </div>
                <span class="text-xs text-gray-400">{{ filteredLibraries.length }} 条</span>
              </div>
              <div class="overflow-auto">
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th class="px-3 py-2 text-left font-medium">名称</th>
                      <th class="px-3 py-2 text-left font-medium">属性预览</th>
                      <th class="px-3 py-2 text-left font-medium">实例数</th>
                      <th class="px-3 py-2 text-center font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="library in filteredLibraries"
                      :key="library.id"
                      class="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                      :class="sameId(library.id, selectedLibraryId) ? 'bg-blue-50/80 dark:bg-blue-950/30' : ''"
                      @click="selectedLibraryId = library.id ?? ''"
                    >
                      <td class="px-3 py-3 align-top">
                        <div class="font-medium text-gray-800 dark:text-gray-100">{{ library.name || '-' }}</div>
                        <div class="mt-1 text-xs text-gray-400">
                          {{ library.id || '-' }} · {{ deviceTypeName(library.deviceTypeCd) }}
                        </div>
                      </td>
                      <td class="px-3 py-3 align-top">
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="attribute in attributePreview(library)"
                            :key="attribute.code"
                            class="rounded border px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                          >
                            {{ attribute.label }}: {{ attribute.value }}{{ attribute.unit }}
                          </span>
                          <span v-if="attributePreview(library).length === 0" class="text-xs text-gray-400">暂无属性配置</span>
                        </div>
                      </td>
                      <td class="px-3 py-3 align-top font-mono text-gray-600 dark:text-gray-300">
                        {{ entityCountByLibraryId[String(library.id)] ?? 0 }}
                      </td>
                      <td class="px-3 py-3 text-center align-top">
                        <div class="flex items-center justify-center gap-1">
                          <button class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700" title="新增实例" @click.stop="openCreateEntity(library)">
                            <Plus class="h-4 w-4 text-blue-500" />
                          </button>
                          <button class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700" title="编辑器件库" @click.stop="openEditLibrary(library)">
                            <Edit2 class="h-4 w-4 text-gray-500" />
                          </button>
                          <button class="rounded p-1 hover:bg-red-50 dark:hover:bg-red-950/40" title="删除器件库" @click.stop="deleteLibrary(library)">
                            <Trash2 class="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="filteredLibraries.length === 0">
                      <td colspan="4" class="px-4 py-10 text-center text-gray-400">
                        当前类型暂无器件库
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section class="min-w-0">
              <div class="flex h-11 items-center justify-between border-b px-3" style="border-color: var(--app-border-color)">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold">器件实例</div>
                  <div class="truncate text-xs text-gray-400">所属库：{{ selectedLibraryName }}</div>
                </div>
                <span class="text-xs text-gray-400">{{ filteredEntities.length }} 条</span>
              </div>
              <div class="overflow-auto">
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th class="px-3 py-2 text-left font-medium">名称</th>
                      <th class="px-3 py-2 text-left font-medium">位置</th>
                      <th class="px-3 py-2 text-left font-medium">属性预览</th>
                      <th class="px-3 py-2 text-center font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="entity in filteredEntities"
                      :key="entity.id"
                      class="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                    >
                      <td class="px-3 py-3 align-top">
                        <div class="font-medium text-gray-800 dark:text-gray-100">{{ entity.name || '-' }}</div>
                        <div class="mt-1 text-xs text-gray-400">
                          {{ entity.id || '-' }} · {{ entity.libraryName || selectedLibraryName }}
                        </div>
                      </td>
                      <td class="px-3 py-3 align-top font-mono text-xs text-gray-600 dark:text-gray-300">
                        <div>{{ entity.longitude ?? '-' }}</div>
                        <div>{{ entity.latitude ?? '-' }}</div>
                      </td>
                      <td class="px-3 py-3 align-top">
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="attribute in attributePreview(entity)"
                            :key="attribute.code"
                            class="rounded border px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                          >
                            {{ attribute.label }}: {{ attribute.value }}{{ attribute.unit }}
                          </span>
                          <span v-if="attributePreview(entity).length === 0" class="text-xs text-gray-400">暂无属性配置</span>
                        </div>
                      </td>
                      <td class="px-3 py-3 text-center align-top">
                        <div class="flex items-center justify-center gap-1">
                          <button class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700" title="编辑实例" @click="openEditEntity(entity)">
                            <Edit2 class="h-4 w-4 text-gray-500" />
                          </button>
                          <button class="rounded p-1 hover:bg-red-50 dark:hover:bg-red-950/40" title="删除实例" @click="deleteEntity(entity)">
                            <Trash2 class="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="filteredEntities.length === 0">
                      <td colspan="4" class="px-4 py-10 text-center text-gray-400">
                        当前器件库暂无实例
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>

  <Teleport to="body">
    <div v-if="showLibraryDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showLibraryDialog = false" />
      <div class="relative flex max-h-[88vh] w-[980px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ libraryForm.id ? '修改器件库' : '新增器件库' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showLibraryDialog = false">
            <X class="h-5 w-5" />
          </button>
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto bg-gray-50/60 p-5 dark:bg-gray-900/40">
          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">名称</label>
                <Input v-model="libraryForm.name" placeholder="如 G.654.E / EDFA-20dB" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">设备类型</label>
                <Input :model-value="deviceTypeName(libraryForm.deviceTypeCd)" readonly />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">项目 ID</label>
                <Input v-model="libraryForm.projectId" placeholder="为空表示通用型号" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">参数窗口标识</label>
                <Input v-model="libraryForm.dialogWindowId" placeholder="可选" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">图标 ID</label>
                <Input v-model="libraryForm.iconId" placeholder="可选" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">图标尺寸</label>
                <div class="grid grid-cols-[1fr_16px_1fr] items-center gap-2">
                  <Input v-model="libraryForm.iconWidth" type="number" />
                  <span class="text-center text-xs text-gray-500">×</span>
                  <Input v-model="libraryForm.iconHeight" type="number" />
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <div class="mb-4 flex items-center justify-between">
              <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">动态属性</h4>
              <span class="text-xs text-gray-400">{{ settingsStore.platformDeviceConfigs.length }} 项配置</span>
            </div>
            <DeviceDynamicValueForm
              v-model="libraryValues"
              :configs="settingsStore.platformDeviceConfigs"
            />
          </section>
        </div>
        <div class="flex justify-center gap-4 border-t p-4" style="border-color: var(--app-border-color)">
          <Button class="px-6" :disabled="settingsStore.deviceLibrarySyncing" @click="saveLibrary">保存</Button>
          <Button variant="outline" class="px-6" @click="showLibraryDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showEntityDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showEntityDialog = false" />
      <div class="relative flex max-h-[88vh] w-[1040px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ entityForm.id ? '修改器件实例' : '新增器件实例' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showEntityDialog = false">
            <X class="h-5 w-5" />
          </button>
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto bg-gray-50/60 p-5 dark:bg-gray-900/40">
          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">名称</label>
                <Input v-model="entityForm.name" placeholder="如 器件-001" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">器件库</label>
                <select
                  v-model="entityForm.libraryId"
                  class="h-[38px] w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  style="border-color: var(--app-border-color)"
                  @change="handleEntityLibraryChange"
                >
                  <option value="">请选择器件库</option>
                  <option v-for="library in filteredLibraries" :key="library.id" :value="library.id">
                    {{ library.name || library.id }}
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">设备类型</label>
                <Input :model-value="deviceTypeName(entityForm.deviceTypeCd)" readonly />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">项目 ID</label>
                <Input v-model="entityForm.projectId" placeholder="默认当前项目平台 ID" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">经度</label>
                <Input v-model="entityForm.longitude" type="number" placeholder="实际铺设位置" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">纬度</label>
                <Input v-model="entityForm.latitude" type="number" placeholder="实际铺设位置" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">排序</label>
                <Input v-model="entityForm.sortNum" type="number" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">参数窗口标识</label>
                <Input v-model="entityForm.dialogWindowId" placeholder="可选" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">图标 ID</label>
                <Input v-model="entityForm.iconId" placeholder="默认继承器件库图标" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">图标尺寸</label>
                <div class="grid grid-cols-[1fr_16px_1fr] items-center gap-2">
                  <Input v-model="entityForm.iconWidth" type="number" />
                  <span class="text-center text-xs text-gray-500">×</span>
                  <Input v-model="entityForm.iconHeight" type="number" />
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <div class="mb-4 flex items-center justify-between">
              <div>
                <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">实例属性</h4>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">默认带出器件库属性，可在实例中覆盖。</p>
              </div>
              <span class="text-xs text-gray-400">{{ settingsStore.platformDeviceConfigs.length }} 项配置</span>
            </div>
            <DeviceDynamicValueForm
              v-model="entityValues"
              :configs="settingsStore.platformDeviceConfigs"
              :library-values="inheritedLibraryValues"
            />
          </section>
        </div>
        <div class="flex justify-center gap-4 border-t p-4" style="border-color: var(--app-border-color)">
          <Button class="px-6" :disabled="settingsStore.deviceEntitySyncing" @click="saveEntity">保存</Button>
          <Button variant="outline" class="px-6" @click="showEntityDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
