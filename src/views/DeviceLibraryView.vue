<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import DeviceTypeTabs from '@/components/settings/DeviceTypeTabs.vue'
import { Card, CardContent, CardHeader, Button, Input } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { platformDictionaryApi } from '@/services/platform/api'
import {
  mergeDeviceConfigsWithDefaults,
} from '@/services/platform/deviceAttributes'
import type {
  Id,
  PlanDeviceConfig,
  PlanDeviceLibrary,
  PlatformDictionary,
} from '@/services/platform/types'
import {
  Database,
  Edit2,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Settings,
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
const showConfigDialog = ref(false)

const deviceConfigDataTypes = [
  { value: 'STRING', label: '文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'BOOLEAN', label: '布尔' },
  { value: 'DATETIME', label: '日期时间' },
  { value: 'DATA_TYPE', label: '字典' },
]

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

const configForm = reactive({
  id: undefined as Id | undefined,
  name: '',
  code: '',
  dataTypeCd: 'STRING',
  dataFormat: '' as number | string,
  dicCode: '',
  defaultValue: '',
  unit: '',
  groupCode: '',
  groupName: '',
  jsonField: '',
  description: '',
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
  for (const config of effectiveDeviceConfigs.value) {
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

const selectedLibrary = computed(() =>
  filteredLibraries.value.find(item => sameId(item.id, selectedLibraryId.value)) ?? filteredLibraries.value[0] ?? null,
)

const selectedLibraryDeviceTypeCd = computed(() =>
  selectedLibrary.value?.deviceTypeCd ? String(selectedLibrary.value.deviceTypeCd) : activeDeviceTypeCd.value,
)

const selectedLibraryScopedConfigs = computed(() => {
  return selectedLibrary.value?.id ? settingsStore.platformDeviceConfigs : []
})

const effectiveDeviceConfigs = computed(() =>
  selectedLibrary.value
    ? mergeDeviceConfigsWithDefaults(selectedLibraryDeviceTypeCd.value, selectedLibraryScopedConfigs.value)
    : [],
)

const statistics = computed(() => ({
  deviceTypeCount: deviceTypes.value.length,
  libraryCount: filteredLibraries.value.length,
  configCount: effectiveDeviceConfigs.value.length,
}))

const configPreview = () => {
  return effectiveDeviceConfigs.value
    .filter(config => Boolean(config.code?.trim()))
    .slice(0, 3)
    .map(config => {
      const code = String(config.code)
      return {
        code,
        label: config.name || code,
        value: config.defaultValue == null || config.defaultValue === '' ? '-' : String(config.defaultValue),
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
    settingsStore.platformDeviceConfigs = []
    await settingsStore.loadPlatformDeviceLibraries({ pageNumber: 1, pageSize: 1000, deviceTypeCd })
    ensureSelectedLibrary()
    await loadSelectedLibraryConfigs()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件数据加载失败：${(error as Error).message}` })
  }
}

const loadSelectedLibraryConfigs = async () => {
  if (!selectedLibrary.value?.id || !selectedLibraryDeviceTypeCd.value) {
    settingsStore.platformDeviceConfigs = []
    return
  }
  await settingsStore.loadPlatformDeviceConfigs({
    deviceTypeCd: selectedLibraryDeviceTypeCd.value,
  })
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
}

const openCreateLibrary = async () => {
  if (!activeDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先配置设备类型字典' })
    return
  }
  resetLibraryForm()
  showLibraryDialog.value = true
}

const openEditLibrary = async (library: PlanDeviceLibrary) => {
  if (!library.id) return
  try {
    const detail = await settingsStore.loadPlatformDeviceLibraryDetail(library.id)
    const deviceTypeCd = detail.deviceTypeCd || activeDeviceTypeCd.value
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

const resetConfigForm = () => {
  Object.assign(configForm, {
    id: undefined,
    name: '',
    code: '',
    dataTypeCd: 'STRING',
    dataFormat: '',
    dicCode: '',
    defaultValue: '',
    unit: '',
    groupCode: '',
    groupName: '',
    jsonField: '',
    description: '',
  })
}

const openConfigManager = async () => {
  if (!selectedLibrary.value?.id || !selectedLibraryDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择设备类型' })
    return
  }
  await loadSelectedLibraryConfigs()
  resetConfigForm()
  showConfigDialog.value = true
}

const openEditConfig = (config: PlanDeviceConfig) => {
  Object.assign(configForm, {
    id: config.id,
    name: config.name || '',
    code: config.code || '',
    dataTypeCd: config.dataTypeCd || 'STRING',
    dataFormat: config.dataFormat ?? '',
    dicCode: config.dicCode || '',
    defaultValue: config.defaultValue || '',
    unit: config.unit || '',
    groupCode: config.groupCode || '',
    groupName: config.groupName || '',
    jsonField: config.jsonField || '',
    description: config.description || '',
  })
}

const saveConfig = async () => {
  if (!selectedLibrary.value?.id || !selectedLibraryDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择设备类型' })
    return
  }
  if (!configForm.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入属性名称' })
    return
  }
  if (!configForm.code.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入属性编码' })
    return
  }

  try {
    await settingsStore.savePlatformDeviceConfig({
      id: configForm.id ?? null,
      deviceTypeCd: selectedLibraryDeviceTypeCd.value,
      name: configForm.name.trim(),
      code: configForm.code.trim(),
      dataTypeCd: configForm.dataTypeCd || 'STRING',
      dataFormat: optionalNumber(configForm.dataFormat),
      dicCode: configForm.dicCode || null,
      defaultValue: configForm.defaultValue || null,
      description: configForm.description || null,
      jsonField: configForm.jsonField || null,
      unit: configForm.unit || null,
      groupCode: configForm.groupCode || null,
      groupName: configForm.groupName || null,
    }, {
      deviceTypeCd: selectedLibraryDeviceTypeCd.value,
    })
    resetConfigForm()
    appStore.showNotification({ type: 'success', message: '器件配置已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件配置保存失败：${(error as Error).message}` })
  }
}

const deleteConfig = async (config: PlanDeviceConfig) => {
  if (!config.id || !selectedLibrary.value?.id || !selectedLibraryDeviceTypeCd.value) return
  if (!window.confirm(`确认删除器件配置「${config.name || config.code || config.id}」？`)) return

  try {
    await settingsStore.removePlatformDeviceConfig(config.id, {
      deviceTypeCd: selectedLibraryDeviceTypeCd.value,
    })
    if (sameId(configForm.id, config.id)) resetConfigForm()
    appStore.showNotification({ type: 'success', message: '器件配置已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件配置删除失败：${(error as Error).message}` })
  }
}

watch(activeDeviceTypeCd, deviceTypeCd => {
  selectedLibraryId.value = ''
  if (deviceTypeCd) void loadDeviceData(deviceTypeCd)
})

watch(selectedLibraryId, () => {
  resetConfigForm()
  if (selectedLibrary.value?.id) void loadSelectedLibraryConfigs()
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
            <RefreshCw class="mr-1 h-4 w-4" :class="{ 'animate-spin': deviceTypesLoading || settingsStore.deviceLibraryLoading }" />
            刷新
          </Button>
          <Button variant="outline" size="sm" :disabled="!activeDeviceTypeCd" @click="openConfigManager">
            <Settings class="mr-1 h-4 w-4" />
            器件配置
          </Button>
          <Button size="sm" :disabled="!activeDeviceTypeCd" @click="openCreateLibrary">
            <Plus class="mr-1 h-4 w-4" />
            新增器件
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
              <span class="text-gray-500">器件配置</span>
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
              <div class="text-xs text-gray-500 dark:text-gray-400">这里维护器件定义和器件配置；工程实例在系统规划中通过添加接线元创建。</div>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative">
                <Search class="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input v-model="searchKeyword" placeholder="搜索名称、编号、窗口" class="w-56 pl-8" />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent class="flex-1 overflow-auto p-0">
          <div v-if="!activeDeviceTypeCd" class="flex h-full items-center justify-center p-8 text-sm text-gray-400">
            请先在平台字典中维护 DEVICE_TYPE，页面不会使用默认类型兜底。
          </div>

          <div v-else class="h-full min-h-[520px]">
            <section class="min-w-0 border-r dark:border-gray-700" style="border-color: var(--app-border-color)">
              <div class="flex h-11 items-center justify-between border-b px-3" style="border-color: var(--app-border-color)">
                <div class="flex items-center gap-2 text-sm font-semibold">
                  <Layers class="h-4 w-4 text-blue-500" />
                  器件
                </div>
                <span class="text-xs text-gray-400">{{ filteredLibraries.length }} 条</span>
              </div>
              <div class="overflow-auto">
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th class="px-3 py-2 text-left font-medium">名称</th>
                      <th class="px-3 py-2 text-left font-medium">器件配置</th>
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
                            v-for="attribute in configPreview()"
                            :key="attribute.code"
                            class="rounded border px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                          >
                            {{ attribute.label }}: {{ attribute.value }}{{ attribute.unit }}
                          </span>
                          <span v-if="configPreview().length === 0" class="text-xs text-gray-400">暂无器件配置</span>
                        </div>
                      </td>
                      <td class="px-3 py-3 text-center align-top">
                        <div class="flex items-center justify-center gap-1">
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
                      <td colspan="3" class="px-4 py-10 text-center text-gray-400">当前类型暂无器件</td>
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
    <div v-if="showConfigDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showConfigDialog = false" />
      <div class="relative flex max-h-[88vh] w-[720px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <div>
            <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ configForm.id ? '编辑器件配置' : '新增器件配置' }}</h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ currentDeviceType?.name || activeDeviceTypeCd }} / {{ activeDeviceTypeCd }}</p>
          </div>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showConfigDialog = false">
            <X class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto bg-gray-50/60 px-10 py-6 dark:bg-gray-900/40">
          <section class="mx-auto w-full max-w-[640px]">

            <div class="space-y-4">
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">属性名称</label>
                <Input v-model="configForm.name" placeholder="例如：衰减系数" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">属性编码</label>
                <Input v-model="configForm.code" placeholder="例如：attenuation" :disabled="Boolean(configForm.id)" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">数据类型</label>
                <select
                  v-model="configForm.dataTypeCd"
                  class="h-[38px] w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  style="border-color: var(--app-border-color)"
                >
                  <option v-for="type in deviceConfigDataTypes" :key="type.value" :value="type.value">
                    {{ type.label }} / {{ type.value }}
                  </option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">单位</label>
                  <Input v-model="configForm.unit" placeholder="dB/km" />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">默认值</label>
                  <Input v-model="configForm.defaultValue" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">分组编码</label>
                  <Input v-model="configForm.groupCode" placeholder="base / GN / EGN / SSFM" />
                  <p class="mt-1 text-xs text-gray-400">base 表示器件模型参数；其他编码会显示为计算模型抽屉。</p>
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">分组名称</label>
                  <Input v-model="configForm.groupName" placeholder="基础物理参数 / GN 模型参数" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">字典编码</label>
                  <Input v-model="configForm.dicCode" placeholder="DATA_TYPE 时可填" />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">数据格式</label>
                  <Input v-model="configForm.dataFormat" type="number" placeholder="可选" />
                </div>
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">JSON 字段</label>
                <Input v-model="configForm.jsonField" placeholder="如 fiber.alpha / gn.noiseBandwidth" />
                <p class="mt-1 text-xs text-gray-400">用于系统规划和仿真入参映射；为空时使用属性编码。</p>
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">描述</label>
                <Input v-model="configForm.description" placeholder="可选" />
              </div>
            </div>
          </section>
        </div>

        <div class="flex justify-center gap-4 border-t p-4" style="border-color: var(--app-border-color)">
          <Button class="px-6" :disabled="settingsStore.deviceConfigSyncing" @click="saveConfig">保存器件配置</Button>
          <Button variant="outline" class="px-6" @click="showConfigDialog = false">关闭</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showLibraryDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showLibraryDialog = false" />
      <div class="relative flex max-h-[88vh] w-[980px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ libraryForm.id ? '修改器件' : '新增器件' }}</h3>
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

        </div>
        <div class="flex justify-center gap-4 border-t p-4" style="border-color: var(--app-border-color)">
          <Button class="px-6" :disabled="settingsStore.deviceLibrarySyncing" @click="saveLibrary">保存</Button>
          <Button variant="outline" class="px-6" @click="showLibraryDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
