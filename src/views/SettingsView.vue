<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount} from 'vue'
import {useRouter, useRoute} from 'vue-router'
import { useProjectManager } from '@/composables'
import { useSettingsStore } from '@/stores/settings'
import {Card, CardContent, Button, Select, Input} from '@/shared/components/base'
import BindFuncListEditor from '@/components/settings/BindFuncListEditor.vue'
import DeviceDynamicValueForm from '@/components/settings/DeviceDynamicValueForm.vue'
import DeviceTypeTabs from '@/components/settings/DeviceTypeTabs.vue'
import IconUploadField from '@/components/settings/IconUploadField.vue'
import MapSelectDialog from '@/modules/planning/dialogs/MapSelectDialog.vue'
import type { MapMarker } from '@/modules/planning/dialogs/MapSelectDialog.vue'
import CableTypeCreateDialog from '@/modules/planning/dialogs/CableTypeCreateDialog.vue'
import {
  MapPin,
  Radio,
  Database,
  Cable,
  Zap,
  GitBranch,
  Waves,
  Server,
  AlertTriangle,
  FilePlus,
  FolderOpen,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
  Edit2,
  Anchor,
  ChevronDown,
  ChevronRight,
} from 'lucide-vue-next'
import type {BUConfig, ArmorMapping, RedundancyConfig} from '@/stores/settings'
import { platformDictionaryApi } from '@/services/platform/api'
import type { Id, PlanDeviceConfig, PlanDeviceEntity, PlanDeviceLibrary, PlatformDictionary } from '@/services/platform/types'
import type { BindFuncDraft } from '@/services/platform/bindFuncForm'
import { bindFuncDraftsToList, bindFuncListToDrafts } from '@/services/platform/bindFuncForm'
import {
  buildDeviceValueList,
  deviceValueListToMap,
  mergeDeviceConfigsWithDefaults,
} from '@/services/platform/deviceAttributes'
import {
  fiberModelOptions,
  planningModeOptions,
  dataSourceOptions,
  calculationModelOptions
} from '@/data/mockData'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const projectManager = useProjectManager()
const router = useRouter()
const route = useRoute()
const activeTab = ref('equipment')

const validTabs = ['equipment', 'route', 'monitoring'] as const

const syncActiveTabFromQuery = async () => {
  const tabQuery = route.query.tab as string
  if (!tabQuery) return

  if (tabQuery === 'transmission') {
    activeTab.value = 'route'
    await router.replace({ query: { ...route.query, tab: 'route' } })
    return
  }

  if (validTabs.includes(tabQuery as typeof validTabs[number])) {
    activeTab.value = tabQuery
  }
}

// 支持通过路由 query 参数切换 tab（如从系统规划跳转过来）
onMounted(() => {
  void syncActiveTabFromQuery()
  void loadPlatformDeviceTypes()
  window.addEventListener('click', closePlatformLibraryContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closePlatformLibraryContextMenu)
})

watch(() => route.query.tab, () => {
  void syncActiveTabFromQuery()
})

// 折叠面板状态
const expandedPanels = ref<Record<string, boolean>>({
  siteLocation: true,
  buConfig: true,
  armorMapping: true,
  redundancy: true,
  gisSettings: true
})

const togglePanel = (panelId: string) => {
  expandedPanels.value[panelId] = !expandedPanels.value[panelId]
}

// 检查是否已打开项目
const hasOpenProject = computed(() => appStore.hasOpenProject)

// 打开新建项目对话框
const handleNewProject = () => {
  appStore.openDialog('new-project')
}

// 打开项目
const handleOpenProject = async () => {
  appStore.openDialog('open-project')
}
const platformLibraryTab = ref<Id | null>(null)
const platformLibraryContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  library: null as PlanDeviceLibrary | null,
})

const tabs = [
  {id: 'equipment', label: '器件实例管理'},
  {id: 'route', label: '路径规划配置'},
  {id: 'monitoring', label: '监控系统配置'},
]

// 弹窗状态
const showPlatformLibraryDialog = ref(false)
const showPlatformConfigDialog = ref(false)
const showPlatformEntityDialog = ref(false)
const showMapSelectDialog = ref(false)
const showCableTypeCreateDialog = ref(false)
const cableTypePresetArmor = ref('')  // 预设的铠装类型
const mapSelectType = ref<'start' | 'end' | 'range'>('start')
const mapSelectTitle = ref('地图选点')

// 选项常量
const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'EUR', label: 'EUR' },
]
const deviceConfigDataTypes = [
  { value: 'STRING', label: '文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'BOOLEAN', label: '布尔' },
  { value: 'DATETIME', label: '日期时间' },
  { value: 'DATA_TYPE', label: '字典' },
]
const DEVICE_TYPE_DICTIONARY_TYPE = 'DEVICE_TYPE'
const platformDeviceTypeDictionaries = ref<PlatformDictionary[]>([])
const platformDeviceTypeLoading = ref(false)
const activePlatformDeviceTypeCd = ref('')
const platformDeviceTypeOptions = computed(() =>
  platformDeviceTypeDictionaries.value
    .filter(item => item.code)
    .map(item => ({
      value: String(item.code),
      label: item.name || String(item.code),
    })),
)
const defaultPlatformDeviceTypeCode = computed(() => platformDeviceTypeOptions.value[0]?.value ?? '')

let bindFuncDraftSequence = 0
const nextBindFuncDraftId = (prefix: 'func' | 'param') => `${prefix}-${Date.now()}-${++bindFuncDraftSequence}`

const deviceTypeName = (typeCd?: string | null) => {
  return platformDeviceTypeOptions.value.find(item => item.value === typeCd)?.label || typeCd || '-'
}

const platformDeviceTypeCode = (item?: { deviceTypeCd?: string | null } | null) => item?.deviceTypeCd || ''

const filteredPlatformLibraries = computed(() => {
  if (!activePlatformDeviceTypeCd.value) return []
  return settingsStore.platformDeviceLibraries.filter(library =>
    !library.deviceTypeCd || String(library.deviceTypeCd) === activePlatformDeviceTypeCd.value,
  )
})

const selectedPlatformLibrary = computed(() => {
  if (!filteredPlatformLibraries.value.length) return null
  if (platformLibraryTab.value == null) return filteredPlatformLibraries.value[0]
  return filteredPlatformLibraries.value.find(item => item.id != null && String(item.id) === String(platformLibraryTab.value))
    || filteredPlatformLibraries.value[0]
})

const selectedPlatformDeviceTypeCd = computed(() =>
  platformDeviceTypeCode(selectedPlatformLibrary.value) || activePlatformDeviceTypeCd.value,
)

const selectedPlatformLibraryId = computed(() => selectedPlatformLibrary.value?.id ?? null)

const selectedPlatformStoredConfigs = computed(() => {
  return selectedPlatformLibraryId.value ? settingsStore.platformDeviceConfigs : []
})

const activePlatformDeviceConfigs = computed(() =>
  mergeDeviceConfigsWithDefaults(selectedPlatformDeviceTypeCd.value || activePlatformDeviceTypeCd.value, selectedPlatformStoredConfigs.value),
)

const platformConfigPreview = (library?: PlanDeviceLibrary | null) => {
  if (!library?.id || !sameId(library.id, selectedPlatformLibraryId.value)) return []
  const configs = mergeDeviceConfigsWithDefaults(library.deviceTypeCd || activePlatformDeviceTypeCd.value, selectedPlatformStoredConfigs.value)
  const valueMap = deviceValueListToMap(library.deviceValueList)
  return configs
    .filter(config => Boolean(config.code?.trim()))
    .slice(0, 3)
    .map(config => {
      const code = String(config.code)
      const value = valueMap[code] ?? config.defaultValue ?? ''
      return {
        code,
        label: config.name || code,
        value: value === '' ? '-' : String(value),
        unit: config.unit || '',
      }
    })
}

const platformEntityConfigPreview = (entity: PlanDeviceEntity) => {
  const libraryValueMap = deviceValueListToMap(selectedPlatformLibrary.value?.deviceValueList)
  const entityValueMap = deviceValueListToMap(entity.deviceValueList)
  return activePlatformDeviceConfigs.value
    .filter(config => Boolean(config.code?.trim()))
    .slice(0, 3)
    .map(config => {
      const code = String(config.code)
      const value = entityValueMap[code] ?? libraryValueMap[code] ?? config.defaultValue ?? ''
      return {
        code,
        label: config.name || code,
        value: value === '' ? '-' : String(value),
        unit: config.unit || '',
      }
    })
}

const platformEntityList = computed(() => {
  const libraryId = selectedPlatformLibraryId.value
  if (!libraryId) return []
  return settingsStore.platformDeviceEntities.filter(entity => sameId(entity.libraryId, libraryId))
})

const platformEntityLibrariesForType = computed(() =>
  settingsStore.platformDeviceLibraries.filter(library =>
    !library.deviceTypeCd || String(library.deviceTypeCd) === activePlatformDeviceTypeCd.value,
  ),
)

const ensurePlatformLibrarySelection = () => {
  if (platformLibraryTab.value && filteredPlatformLibraries.value.some(item => sameId(item.id, platformLibraryTab.value))) {
    return
  }
  platformLibraryTab.value = filteredPlatformLibraries.value[0]?.id ?? null
}

watch(() => settingsStore.platformDeviceLibraries, () => {
  ensurePlatformLibrarySelection()
}, { deep: true })

const loadSelectedPlatformConfigs = async () => {
  if (!selectedPlatformLibraryId.value || !selectedPlatformDeviceTypeCd.value) {
    settingsStore.platformDeviceConfigs = []
    return
  }

  await settingsStore.loadPlatformDeviceConfigs({
    deviceTypeCd: selectedPlatformDeviceTypeCd.value,
  })
}

const loadSelectedPlatformEntities = async () => {
  if (!selectedPlatformLibraryId.value) {
    settingsStore.platformDeviceEntities = []
    return
  }

  await settingsStore.loadPlatformDeviceEntities({
    pageNumber: 1,
    pageSize: 1000,
    libraryId: selectedPlatformLibraryId.value,
    projectId: appStore.projectState.currentProject?.platformProjectId || null,
  })
}

const defaultPlatformLibraryForm = () => ({
  id: undefined as Id | undefined,
  name: '',
  projectId: appStore.projectState.currentProject?.platformProjectId || '' as Id | '',
  deviceTypeCd: activePlatformDeviceTypeCd.value || defaultPlatformDeviceTypeCode.value,
  iconId: '' as Id | '',
  iconName: '',
  iconWidth: 48,
  iconHeight: 48,
  dialogWindowId: '',
  bindFuncList: [] as BindFuncDraft[],
})

const platformLibraryForm = reactive(defaultPlatformLibraryForm())
const platformEntityForm = reactive({
  id: undefined as Id | undefined,
  name: '',
  deviceTypeCd: '',
  libraryId: '',
  longitude: '' as number | string,
  latitude: '' as number | string,
  sortNum: '' as number | string,
  projectId: appStore.projectState.currentProject?.platformProjectId || '' as Id | '',
  iconId: '' as Id | '',
  iconName: '',
  iconWidth: 48,
  iconHeight: 48,
  dialogWindowId: '',
  bindFuncList: [] as BindFuncDraft[],
  values: {} as Record<string, string>,
  libraryValues: {} as Record<string, string>,
})
const platformConfigForm = reactive({
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

const optionalNumber = (value: unknown): number | undefined => {
  if (value === '' || value == null) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

const optionalId = (value: unknown): Id | undefined => {
  if (value === '' || value == null) return undefined
  return typeof value === 'number' ? value : String(value)
}

const sameId = (left: unknown, right: unknown) => {
  if (left == null || right == null) return false
  return String(left) === String(right)
}

const resetPlatformLibraryForm = () => {
  Object.assign(platformLibraryForm, defaultPlatformLibraryForm())
}

const resetPlatformEntityForm = () => {
  Object.assign(platformEntityForm, {
    id: undefined,
    name: '',
    deviceTypeCd: activePlatformDeviceTypeCd.value,
    libraryId: selectedPlatformLibraryId.value == null ? '' : String(selectedPlatformLibraryId.value),
    longitude: '',
    latitude: '',
    sortNum: '',
    projectId: appStore.projectState.currentProject?.platformProjectId || '',
    iconId: '',
    iconName: '',
    iconWidth: 48,
    iconHeight: 48,
    dialogWindowId: '',
    bindFuncList: [],
    values: {},
    libraryValues: {},
  })
}

const resetPlatformConfigForm = () => {
  Object.assign(platformConfigForm, {
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

const openCreatePlatformConfig = () => {
  if (!selectedPlatformLibrary.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择器件' })
    return
  }
  resetPlatformConfigForm()
  showPlatformConfigDialog.value = true
}

const openEditPlatformConfig = (config: PlanDeviceConfig) => {
  if (!selectedPlatformLibrary.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择器件' })
    return
  }
  Object.assign(platformConfigForm, {
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
  showPlatformConfigDialog.value = true
}

const savePlatformConfig = async () => {
  if (!selectedPlatformLibraryId.value || !selectedPlatformDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择器件' })
    return
  }
  if (!platformConfigForm.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入配置名称' })
    return
  }
  if (!platformConfigForm.code.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入配置编码' })
    return
  }

  try {
    await settingsStore.savePlatformDeviceConfig({
      id: platformConfigForm.id ?? null,
      deviceTypeCd: selectedPlatformDeviceTypeCd.value,
      name: platformConfigForm.name.trim(),
      code: platformConfigForm.code.trim(),
      dataTypeCd: platformConfigForm.dataTypeCd || 'STRING',
      dataFormat: optionalNumber(platformConfigForm.dataFormat) ?? null,
      dicCode: platformConfigForm.dicCode || null,
      defaultValue: platformConfigForm.defaultValue || null,
      description: platformConfigForm.description || null,
      jsonField: platformConfigForm.jsonField || null,
      unit: platformConfigForm.unit || null,
      groupCode: platformConfigForm.groupCode || null,
      groupName: platformConfigForm.groupName || null,
    }, {
      deviceTypeCd: selectedPlatformDeviceTypeCd.value,
    })
    resetPlatformConfigForm()
    showPlatformConfigDialog.value = false
    appStore.showNotification({ type: 'success', message: '器件配置已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件配置保存失败：${(error as Error).message}` })
  }
}

const deletePlatformConfig = async (config: PlanDeviceConfig) => {
  if (!config.id || !selectedPlatformLibraryId.value || !selectedPlatformDeviceTypeCd.value) return
  if (!window.confirm(`确认删除器件配置「${config.name || config.code || config.id}」？`)) return

  try {
    await settingsStore.removePlatformDeviceConfig(config.id, {
      deviceTypeCd: selectedPlatformDeviceTypeCd.value,
    })
    if (sameId(platformConfigForm.id, config.id)) resetPlatformConfigForm()
    appStore.showNotification({ type: 'success', message: '器件配置已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件配置删除失败：${(error as Error).message}` })
  }
}

const loadPlatformDeviceTypes = async () => {
  platformDeviceTypeLoading.value = true
  try {
    platformDeviceTypeDictionaries.value = (await platformDictionaryApi.listItem(DEVICE_TYPE_DICTIONARY_TYPE)) ?? []
    activePlatformDeviceTypeCd.value = defaultPlatformDeviceTypeCode.value
  } catch (error) {
    platformDeviceTypeDictionaries.value = []
    activePlatformDeviceTypeCd.value = ''
    appStore.showNotification({ type: 'warning', message: `设备类型字典加载失败：${(error as Error).message}` })
  } finally {
    platformDeviceTypeLoading.value = false
  }
}

const loadPlatformLibraries = async () => {
  if (!activePlatformDeviceTypeCd.value) {
    platformLibraryTab.value = null
    settingsStore.platformDeviceConfigs = []
    return
  }
  try {
    settingsStore.platformDeviceConfigs = []
    await settingsStore.loadPlatformDeviceLibraries({ pageNumber: 1, pageSize: 1000, deviceTypeCd: activePlatformDeviceTypeCd.value })
    ensurePlatformLibrarySelection()
    await loadSelectedPlatformConfigs()
    await loadSelectedPlatformEntities()
  } catch (error) {
    appStore.showNotification({ type: 'warning', message: `器件库加载失败：${(error as Error).message}` })
  }
}

const selectPlatformLibrary = (library: PlanDeviceLibrary) => {
  platformLibraryTab.value = library.id ?? null
  resetPlatformConfigForm()
  showPlatformConfigDialog.value = false
  closePlatformLibraryContextMenu()
  void loadSelectedPlatformConfigs()
  void loadSelectedPlatformEntities()
}

function closePlatformLibraryContextMenu() {
  platformLibraryContextMenu.visible = false
  platformLibraryContextMenu.library = null
}

const openPlatformLibraryContextMenu = (event: MouseEvent, library: PlanDeviceLibrary) => {
  event.preventDefault()
  event.stopPropagation()
  platformLibraryTab.value = library.id ?? null
  platformLibraryContextMenu.visible = true
  platformLibraryContextMenu.x = event.clientX
  platformLibraryContextMenu.y = event.clientY
  platformLibraryContextMenu.library = library
  resetPlatformConfigForm()
  showPlatformConfigDialog.value = false
  void loadSelectedPlatformConfigs()
  void loadSelectedPlatformEntities()
}

const editContextPlatformLibrary = () => {
  const library = platformLibraryContextMenu.library
  closePlatformLibraryContextMenu()
  if (library) void openEditPlatformLibrary(library)
}

const deleteContextPlatformLibrary = () => {
  const library = platformLibraryContextMenu.library
  closePlatformLibraryContextMenu()
  if (library?.id) void deletePlatformLibrary(library.id)
}

const openCreatePlatformLibrary = async () => {
  if (!activePlatformDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先维护 DEVICE_TYPE 字典' })
    return
  }
  resetPlatformLibraryForm()
  showPlatformLibraryDialog.value = true
}

const applyLibraryToEntityForm = async (libraryId: Id | '') => {
  if (!libraryId) return
  const detail = await settingsStore.loadPlatformDeviceLibraryDetail(libraryId)
  const deviceTypeCd = detail.deviceTypeCd || activePlatformDeviceTypeCd.value
  await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd })
  platformEntityForm.deviceTypeCd = deviceTypeCd
  platformEntityForm.libraryId = String(detail.id ?? libraryId)
  platformEntityForm.libraryValues = deviceValueListToMap(detail.deviceValueList)
  platformEntityForm.values = {
    ...platformEntityForm.libraryValues,
    ...platformEntityForm.values,
  }
  platformEntityForm.bindFuncList = bindFuncListToDrafts(detail.bindFuncList, nextBindFuncDraftId)
  platformEntityForm.iconId = detail.iconId ?? ''
  platformEntityForm.iconName = detail.iconName || ''
  platformEntityForm.iconWidth = detail.iconSize?.width ?? 48
  platformEntityForm.iconHeight = detail.iconSize?.height ?? 48
  platformEntityForm.dialogWindowId = detail.dialogWindowId || ''
}

const openCreatePlatformEntity = async () => {
  if (!activePlatformDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择器件类型' })
    return
  }
  if (!selectedPlatformLibraryId.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择器件型号' })
    return
  }
  resetPlatformEntityForm()
  await applyLibraryToEntityForm(selectedPlatformLibraryId.value)
  showPlatformEntityDialog.value = true
}

const openEditPlatformEntity = async (entity: PlanDeviceEntity) => {
  if (!entity.id) return
  const detail = await settingsStore.loadPlatformDeviceEntityDetail(entity.id)
  resetPlatformEntityForm()
  if (detail.libraryId) await applyLibraryToEntityForm(detail.libraryId)
  Object.assign(platformEntityForm, {
    id: detail.id,
    name: detail.name || '',
    deviceTypeCd: detail.deviceTypeCd || platformEntityForm.deviceTypeCd,
    libraryId: String(detail.libraryId ?? platformEntityForm.libraryId),
    longitude: detail.longitude ?? '',
    latitude: detail.latitude ?? '',
    sortNum: detail.sortNum ?? '',
    projectId: detail.projectId ?? appStore.projectState.currentProject?.platformProjectId ?? '',
    iconId: detail.iconId ?? platformEntityForm.iconId,
    iconName: detail.iconName || platformEntityForm.iconName,
    iconWidth: detail.iconSize?.width ?? platformEntityForm.iconWidth,
    iconHeight: detail.iconSize?.height ?? platformEntityForm.iconHeight,
    dialogWindowId: detail.dialogWindowId || platformEntityForm.dialogWindowId,
    bindFuncList: bindFuncListToDrafts(detail.bindFuncList?.length ? detail.bindFuncList : bindFuncDraftsToList(platformEntityForm.bindFuncList), nextBindFuncDraftId),
    values: {
      ...platformEntityForm.libraryValues,
      ...deviceValueListToMap(detail.deviceValueList),
    },
  })
  showPlatformEntityDialog.value = true
}

const savePlatformEntity = async () => {
  if (!platformEntityForm.libraryId) {
    appStore.showNotification({ type: 'warning', message: '请选择器件型号' })
    return
  }

  try {
    await settingsStore.savePlatformDeviceEntity({
      id: platformEntityForm.id,
      name: platformEntityForm.name || null,
      deviceTypeCd: platformEntityForm.deviceTypeCd || activePlatformDeviceTypeCd.value,
      libraryId: optionalId(platformEntityForm.libraryId) ?? null,
      longitude: optionalNumber(platformEntityForm.longitude) ?? null,
      latitude: optionalNumber(platformEntityForm.latitude) ?? null,
      projectId: optionalId(platformEntityForm.projectId) ?? null,
      sortNum: optionalNumber(platformEntityForm.sortNum) ?? 999,
      iconId: optionalId(platformEntityForm.iconId) ?? null,
      iconSize: {
        width: optionalNumber(platformEntityForm.iconWidth) ?? 48,
        height: optionalNumber(platformEntityForm.iconHeight) ?? 48,
      },
      dialogWindowId: platformEntityForm.dialogWindowId || null,
      bindFuncList: bindFuncDraftsToList(platformEntityForm.bindFuncList),
      deviceValueList: buildDeviceValueList(platformEntityForm.values),
    })
    await loadSelectedPlatformEntities()
    showPlatformEntityDialog.value = false
    appStore.showNotification({ type: 'success', message: '器件实例已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件实例保存失败：${(error as Error).message}` })
  }
}

const deletePlatformEntity = async (entity: PlanDeviceEntity) => {
  if (!entity.id) return
  if (!window.confirm(`确认删除器件实例「${entity.name || entity.id}」？`)) return
  try {
    await settingsStore.removePlatformDeviceEntity(entity.id)
    await loadSelectedPlatformEntities()
    appStore.showNotification({ type: 'success', message: '器件实例已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件实例删除失败：${(error as Error).message}` })
  }
}

const openEditPlatformLibrary = async (library: PlanDeviceLibrary) => {
  if (!library.id) return
  const detail = await settingsStore.loadPlatformDeviceLibraryDetail(library.id)
  const deviceTypeCd = detail.deviceTypeCd || activePlatformDeviceTypeCd.value
  Object.assign(platformLibraryForm, {
    id: detail.id,
    name: detail.name || '',
    projectId: detail.projectId ?? '',
    deviceTypeCd,
    iconId: detail.iconId ?? '',
    iconName: detail.iconName || '',
    iconWidth: detail.iconSize?.width ?? 48,
    iconHeight: detail.iconSize?.height ?? 48,
    dialogWindowId: detail.dialogWindowId || '',
    bindFuncList: bindFuncListToDrafts(detail.bindFuncList, nextBindFuncDraftId),
  })
  showPlatformLibraryDialog.value = true
}

const savePlatformLibrary = async () => {
  if (!platformLibraryForm.deviceTypeCd) {
    appStore.showNotification({ type: 'warning', message: '请选择设备类型' })
    return
  }

  try {
    const wasNew = platformLibraryForm.id == null
    const id = await settingsStore.savePlatformDeviceLibrary(buildPlatformLibraryPayload())
    platformLibraryForm.id = id
    if (wasNew) platformLibraryTab.value = id
    await loadPlatformLibraries()
    showPlatformLibraryDialog.value = false
    appStore.showNotification({ type: 'success', message: '器件库已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库保存失败：${(error as Error).message}` })
  }
}

const buildPlatformLibraryPayload = (): PlanDeviceLibrary => ({
  id: platformLibraryForm.id,
  projectId: optionalId(platformLibraryForm.projectId) ?? null,
  name: platformLibraryForm.name || null,
  deviceTypeCd: platformLibraryForm.deviceTypeCd,
  iconId: optionalId(platformLibraryForm.iconId) ?? null,
  iconSize: {
    width: optionalNumber(platformLibraryForm.iconWidth) ?? 48,
    height: optionalNumber(platformLibraryForm.iconHeight) ?? 48,
  },
  dialogWindowId: platformLibraryForm.dialogWindowId || null,
  bindFuncList: bindFuncDraftsToList(platformLibraryForm.bindFuncList),
})

const ensurePlatformLibraryBizId = async (): Promise<Id | null> => {
  if (!platformLibraryForm.deviceTypeCd) {
    throw new Error('请选择设备类型')
  }

  const id = await settingsStore.savePlatformDeviceLibrary(buildPlatformLibraryPayload())
  platformLibraryForm.id = id
  platformLibraryTab.value = id
  return id
}

const deletePlatformLibrary = async (id?: Id) => {
  if (!id) return
  if (!window.confirm('确认删除这个器件库？')) return
  try {
    await settingsStore.removePlatformDeviceLibrary(id)
    await loadPlatformLibraries()
    appStore.showNotification({ type: 'success', message: '器件库已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库删除失败：${(error as Error).message}` })
  }
}

const handlePlatformLibraryIconUploaded = (payload: { iconId: Id; iconName: string }) => {
  platformLibraryForm.iconId = payload.iconId
  platformLibraryForm.iconName = payload.iconName
}

watch(activePlatformDeviceTypeCd, deviceTypeCd => {
  platformLibraryTab.value = null
  resetPlatformConfigForm()
  showPlatformConfigDialog.value = false
  showPlatformEntityDialog.value = false
  settingsStore.platformDeviceEntities = []
  if (deviceTypeCd) void loadPlatformLibraries()
})

watch(() => platformEntityForm.libraryId, libraryId => {
  if (!showPlatformEntityDialog.value || !libraryId) return
  void applyLibraryToEntityForm(libraryId)
})

// 将坐标对象转换为字符串格式
const formatCoord = (point: { lon: number; lat: number }): string => {
  if (point.lon === 0 && point.lat === 0) return ''
  return `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`
}

// 多点坐标列表 - USE文件规范: imported_landing_points
const waypoints = ref<Array<{ id: string; name: string; coord: string; isUnderwater: boolean }>>([])

// 初始化多点坐标
const initWaypoints = () => {
  const stored = settingsStore.routePlanningConfig.waypoints || []
  waypoints.value = stored.map(wp => ({
    id: wp.id,
    name: wp.name,
    coord: wp.lon && wp.lat ? `${wp.lon},${wp.lat}` : '',
    isUnderwater: (wp.depth && wp.depth > 0) ? true : false  // depth > 0 表示水下站点
  }))
}
initWaypoints()

// 添加多点坐标
const handleAddWaypoint = () => {
  waypoints.value.push({
    id: `wp-${Date.now()}`,
    name: `登陆站${waypoints.value.length + 1}`,
    coord: '',
    isUnderwater: false  // 默认为岸上站点
  })
}

// 删除多点坐标
const handleRemoveWaypoint = (id: string) => {
  waypoints.value = waypoints.value.filter(wp => wp.id !== id)
}

// 编辑登陆站（复用地图选点）
const handleEditWaypoint = (id: string) => {
  const waypoint = waypoints.value.find(wp => wp.id === id)
  if (!waypoint) return
  openWaypointEditDialog(waypoint)
}

// 获取坐标经度
const getCoordLon = (coord: string): string => {
  if (!coord) return ''
  const parts = coord.split(',')
  return parts[0]?.trim() || ''
}

// 获取坐标纬度
const getCoordLat = (coord: string): string => {
  if (!coord) return ''
  const parts = coord.split(',')
  return parts[1]?.trim() || ''
}

// 设置坐标经度（登陆站）
const setCoordLon = (wp: { coord: string }, lon: string | number) => {
  const lat = getCoordLat(wp.coord)
  const lonStr = String(lon)
  wp.coord = lonStr ? `${lonStr},${lat}` : (lat ? `,${lat}` : '')
}

// 设置坐标纬度（登陆站）
const setCoordLat = (wp: { coord: string }, lat: string | number) => {
  const lon = getCoordLon(wp.coord)
  const latStr = String(lat)
  wp.coord = lon ? `${lon},${latStr}` : (latStr ? `,${latStr}` : '')
}

// 设置坐标经度（BU）
const setCoordLonBu = (bu: { coord: string }, lon: string | number) => {
  const lat = getCoordLat(bu.coord)
  const lonStr = String(lon)
  bu.coord = lonStr ? `${lonStr},${lat}` : (lat ? `,${lat}` : '')
}

// 设置坐标纬度（BU）
const setCoordLatBu = (bu: { coord: string }, lat: string | number) => {
  const lon = getCoordLon(bu.coord)
  const latStr = String(lat)
  bu.coord = lon ? `${lon},${latStr}` : (latStr ? `,${latStr}` : '')
}

// 编辑 BU
const handleEditBU = (id: string) => {
  const bu = buConfigs.value.find(item => item.id === id)
  if (!bu) return
  openBuEditDialog(bu)
}

// 多点地图选点
const currentWaypointId = ref<string | null>(null)
const handleWaypointMapSelect = (id: string) => {
  currentWaypointId.value = id
  mapSelectType.value = 'start' // 复用 start 类型
  mapSelectTitle.value = '选择登陆站坐标'
  showMapSelectDialog.value = true
}

// ========== BU 列表配置 ========== USE文件规范: imported_bu_nodes
const buConfigs = ref<Array<{ id: string; name: string; coord: string; max_ports: string }>>([])

// 初始化 BU 配置
const initBuConfigs = () => {
  const stored = settingsStore.routePlanningConfig.buList || []
  buConfigs.value = stored.map(bu => ({
    id: bu.id,
    name: bu.name,
    coord: bu.lon && bu.lat ? `${bu.lon},${bu.lat}` : '',
    max_ports: String(bu.portLimit)
  }))
}
initBuConfigs()

// 添加 BU
const handleAddBU = () => {
  buConfigs.value.push({
    id: `bu-${Date.now()}`,
    name: `BU${buConfigs.value.length + 1}`,
    coord: '',
    max_ports: '3'
  })
}

// 删除 BU
const handleRemoveBU = (id: string) => {
  buConfigs.value = buConfigs.value.filter(bu => bu.id !== id)
}

// BU 地图选点
const currentBuId = ref<string | null>(null)
const handleBuMapSelect = (id: string) => {
  currentBuId.value = id
  mapSelectType.value = 'start' // 复用 start 类型
  mapSelectTitle.value = '选择分支器位置'
  showMapSelectDialog.value = true
}

// 端口上限选项
const portLimitOptions = [
  {value: '3', label: '3端口'},
  {value: '4', label: '4端口'}
]

// ========== 点对点模式配置 ==========
const startPointConfig = reactive({
  name: '',
  lon: '',
  lat: '',
  isUnderwater: false  // 水下站点标志
})

const endPointConfig = reactive({
  name: '',
  lon: '',
  lat: '',
  isUnderwater: false  // 水下站点标志
})

// 初始化点对点配置
const initPointConfig = () => {
  const start = settingsStore.routePlanningConfig.startPoint
  const end = settingsStore.routePlanningConfig.endPoint
  // 名称从 startPoint 和 endPoint 中获取
  startPointConfig.name = start.name || ''
  endPointConfig.name = end.name || ''
  startPointConfig.isUnderwater = (start.depth && start.depth > 0) ? true : false
  endPointConfig.isUnderwater = (end.depth && end.depth > 0) ? true : false
  if (start.lon !== 0 || start.lat !== 0) {
    startPointConfig.lon = String(start.lon)
    startPointConfig.lat = String(start.lat)
  }
  if (end.lon !== 0 || end.lat !== 0) {
    endPointConfig.lon = String(end.lon)
    endPointConfig.lat = String(end.lat)
  }
}
initPointConfig()

// ========== GIS 配置 ==========
const gisConfig = reactive({
  rangeMode: 'auto' as 'auto' | 'manual',
  nwLon: '',
  nwLat: '',
  seLon: '',
  seLat: '',
  gridResolution: '500'
})

// 初始化 GIS 配置
const initGisConfig = () => {
  const config = settingsStore.routePlanningConfig
  const range = config.planningRange
  if (range?.northwest && (range.northwest.lon !== 0 || range.northwest.lat !== 0)) {
    gisConfig.rangeMode = 'manual'
    gisConfig.nwLon = String(range.northwest.lon)
    gisConfig.nwLat = String(range.northwest.lat)
    gisConfig.seLon = String(range.southeast.lon)
    gisConfig.seLat = String(range.southeast.lat)
  }
  // 初始化栅格分辨率
  if (config.gridResolution) {
    gisConfig.gridResolution = String(config.gridResolution)
  }
}
initGisConfig()

// 点对点模式地图选点
const handleMapSelectPoint = (type: 'start' | 'end') => {
  if (type === 'start') {
    mapSelectType.value = 'start'
    mapSelectTitle.value = '选择起点坐标'
  } else {
    mapSelectType.value = 'end'
    mapSelectTitle.value = '选择终点坐标'
  }
  showMapSelectDialog.value = true
}

// 登陆站地图定位（跳转到地图并高亮）
const handleWaypointMapLocate = (id: string) => {
  const wp = waypoints.value.find(w => w.id === id)
  if (wp && wp.coord) {
    appStore.showNotification({type: 'info', message: `定位到登陆站: ${wp.name} (${wp.coord})`})
  } else {
    appStore.showNotification({type: 'warning', message: '该登陆站尚未设置坐标'})
  }
}

// 地图框选
const handleMapBoxSelect = () => {
  mapSelectType.value = 'range'
  mapSelectTitle.value = '框选规划范围'
  showMapSelectDialog.value = true
}

// 登陆站编辑弹窗
const showWaypointEditDialog = ref(false)
const editingWaypoint = ref<{ id: string; name: string; coord: string } | null>(null)

const openWaypointEditDialog = (wp: { id: string; name: string; coord: string }) => {
  editingWaypoint.value = {...wp}
  showWaypointEditDialog.value = true
}

const saveWaypointEdit = () => {
  if (editingWaypoint.value) {
    const wp = waypoints.value.find(w => w.id === editingWaypoint.value!.id)
    if (wp) {
      wp.name = editingWaypoint.value.name
      wp.coord = editingWaypoint.value.coord
    }
  }
  showWaypointEditDialog.value = false
  editingWaypoint.value = null
}

// BU 编辑弹窗 - USE规范: max_ports
const showBuEditDialog = ref(false)
const editingBu = ref<{ id: string; name: string; coord: string; max_ports: string } | null>(null)

const openBuEditDialog = (bu: { id: string; name: string; coord: string; max_ports: string }) => {
  editingBu.value = {...bu}
  showBuEditDialog.value = true
}

const saveBuEdit = () => {
  if (editingBu.value) {
    const bu = buConfigs.value.find(b => b.id === editingBu.value!.id)
    if (bu) {
      bu.name = editingBu.value.name
      bu.coord = editingBu.value.coord
      bu.max_ports = editingBu.value.max_ports
    }
  }
  showBuEditDialog.value = false
  editingBu.value = null
}

// ========== 铠装映射配置 ==========
const armorMappings = ref<Array<{
  riskLevel: string;
  riskThreshold: string;
  cableTypeName: string;
  unitPrice: string
}>>([])

// 初始化铠装映射
const initArmorMappings = () => {
  const stored = settingsStore.routePlanningConfig.armorMappings || []
  if (stored.length > 0) {
    armorMappings.value = stored.map(m => ({
      riskLevel: m.riskLevel,
      riskThreshold: String(m.riskThreshold),
      cableTypeName: m.cableTypeName,
      unitPrice: String(m.unitPrice)
    }))
  } else {
    // 默认值
    armorMappings.value = [
      {riskLevel: 'high', riskThreshold: '3', cableTypeName: 'DA (双铠装)', unitPrice: '24.0'},
      {riskLevel: 'medium', riskThreshold: '2', cableTypeName: 'SA (单铠装)', unitPrice: '19.5'},
      {riskLevel: 'low', riskThreshold: '0', cableTypeName: 'LW (轻型)', unitPrice: '15.0'},
    ]
  }
}
initArmorMappings()

// 风险等级映射
const riskLevelLabels: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险'
}

// ========== 冗余策略配置 ==========
const redundancyConfig = reactive({
  enabled: false,
  costLimitType: 'relative' as 'relative' | 'absolute',
  relativeCostPercent: '30',
  absoluteCostLimit: ''
})

// 初始化冗余策略
const initRedundancyConfig = () => {
  const stored = settingsStore.routePlanningConfig.redundancyConfig
  if (stored) {
    redundancyConfig.enabled = stored.enabled
    redundancyConfig.costLimitType = stored.costLimitType
    redundancyConfig.relativeCostPercent = String(stored.relativeCostPercent || 30)
    redundancyConfig.absoluteCostLimit = stored.absoluteCostLimit ? String(stored.absoluteCostLimit) : ''
  }
}
initRedundancyConfig()

// 成本限制类型选项
const costLimitTypeOptions = [
  {value: 'relative', label: '相对成本（%）'},
  {value: 'absolute', label: '绝对成本（万元）'}
]

const routeConfig = reactive({
  mode: settingsStore.routePlanningConfig.mode,
  // 点对点模式坐标 - 从 settingsStore 获取已有配置
  startCoord: formatCoord(settingsStore.routePlanningConfig.startPoint),
  endCoord: formatCoord(settingsStore.routePlanningConfig.endPoint),
  // GIS设置
  planningRange: '',
  gridSize: '',
})

// 监听 settingsStore 的变化，同步更新 routeConfig（当导入项目后自动更新）
watch(
    () => settingsStore.routePlanningConfig,
    (newConfig) => {
      routeConfig.mode = newConfig.mode
      routeConfig.startCoord = formatCoord(newConfig.startPoint)
      routeConfig.endCoord = formatCoord(newConfig.endPoint)
      // 同步点对点模式的站点名称、坐标和水下状态
      startPointConfig.name = newConfig.startPoint.name || ''
      startPointConfig.lon = newConfig.startPoint.lon ? String(newConfig.startPoint.lon) : ''
      startPointConfig.lat = newConfig.startPoint.lat ? String(newConfig.startPoint.lat) : ''
      startPointConfig.isUnderwater = (newConfig.startPoint.depth && newConfig.startPoint.depth > 0) ? true : false
      endPointConfig.name = newConfig.endPoint.name || ''
      endPointConfig.lon = newConfig.endPoint.lon ? String(newConfig.endPoint.lon) : ''
      endPointConfig.lat = newConfig.endPoint.lat ? String(newConfig.endPoint.lat) : ''
      endPointConfig.isUnderwater = (newConfig.endPoint.depth && newConfig.endPoint.depth > 0) ? true : false
      // 同步多点坐标
      if (newConfig.waypoints) {
        waypoints.value = newConfig.waypoints.map(wp => ({
          id: wp.id,
          name: wp.name,
          coord: wp.lon && wp.lat ? `${wp.lon},${wp.lat}` : '',
          isUnderwater: (wp.depth && wp.depth > 0) ? true : false
        }))
      }
      // 同步 BU 配置
      if (newConfig.buList) {
        buConfigs.value = newConfig.buList.map(bu => ({
          id: bu.id,
          name: bu.name,
          coord: bu.lon && bu.lat ? `${bu.lon},${bu.lat}` : '',
          max_ports: String(bu.portLimit)
        }))
      }
      // 同步铠装映射配置
      if (newConfig.armorMappings && newConfig.armorMappings.length > 0) {
        armorMappings.value = newConfig.armorMappings.map(m => ({
          riskLevel: m.riskLevel,
          riskThreshold: String(m.riskThreshold),
          cableTypeName: m.cableTypeName,
          unitPrice: String(m.unitPrice)
        }))
      }
      // 同步冗余策略配置
      if (newConfig.redundancyConfig) {
        redundancyConfig.enabled = newConfig.redundancyConfig.enabled
        redundancyConfig.costLimitType = newConfig.redundancyConfig.costLimitType
        redundancyConfig.relativeCostPercent = String(newConfig.redundancyConfig.relativeCostPercent || 30)
        redundancyConfig.absoluteCostLimit = newConfig.redundancyConfig.absoluteCostLimit ? String(newConfig.redundancyConfig.absoluteCostLimit) : ''
      }
    },
    {deep: true, immediate: true}
)

// 地图选点功能
const handleMapSelect = (type: string) => {
  if (type === '起点') {
    mapSelectType.value = 'start'
    mapSelectTitle.value = '选择起点坐标'
  } else if (type === '终点') {
    mapSelectType.value = 'end'
    mapSelectTitle.value = '选择终点坐标'
  } else if (type === '规划范围') {
    mapSelectType.value = 'range'
    mapSelectTitle.value = '选择规划范围'
  }
  showMapSelectDialog.value = true
}

// 地图选点确认
const handleMapSelectConfirm = (coord: string) => {
  // 多点规划模式下，如果有当前选中的多点ID
  if (currentWaypointId.value) {
    const wp = waypoints.value.find(w => w.id === currentWaypointId.value)
    if (wp) {
      wp.coord = coord
    }
    currentWaypointId.value = null
    appStore.showNotification({type: 'success', message: `坐标已选择: ${coord}`})
    return
  }

  // BU 地图选点
  if (currentBuId.value) {
    const bu = buConfigs.value.find(b => b.id === currentBuId.value)
    if (bu) {
      bu.coord = coord
    }
    currentBuId.value = null
    appStore.showNotification({type: 'success', message: `分支器位置已选择: ${coord}`})
    return
  }

  // 解析坐标
  const parts = coord.split(',')
  const lon = parts[0]?.trim() || ''
  const lat = parts[1]?.trim() || ''

  if (mapSelectType.value === 'start') {
    // 点对点模式的起点
    startPointConfig.lon = lon
    startPointConfig.lat = lat
    routeConfig.startCoord = coord
  } else if (mapSelectType.value === 'end') {
    // 点对点模式的终点
    endPointConfig.lon = lon
    endPointConfig.lat = lat
    routeConfig.endCoord = coord
  } else if (mapSelectType.value === 'range') {
    // 范围框选 - 假设返回 "nwLon,nwLat,seLon,seLat" 格式
    const rangeParts = coord.split(',')
    if (rangeParts.length >= 4) {
      gisConfig.nwLon = rangeParts[0]?.trim() || ''
      gisConfig.nwLat = rangeParts[1]?.trim() || ''
      gisConfig.seLon = rangeParts[2]?.trim() || ''
      gisConfig.seLat = rangeParts[3]?.trim() || ''
    }
    routeConfig.planningRange = coord
  }
  appStore.showNotification({type: 'success', message: `坐标已选择: ${coord}`})
}

const transConfig = reactive({
  channelCount: settingsStore.transmissionConfig.channelCount,
  centerWavelength: settingsStore.transmissionConfig.centerWavelength,
  channelBandwidth: settingsStore.transmissionConfig.channelBandwidth,
  models: [...settingsStore.transmissionConfig.calculationModels],
})

const projectCostConfig = reactive({
  cableCostPerKm: settingsStore.costFactors.cableCostPerKm || 35000,
  installationCostPerKm: settingsStore.costFactors.installationCostPerKm || 15000,
  repeaterCost: settingsStore.costFactors.repeaterCost || 250000,
  branchingUnitCost: settingsStore.costFactors.branchingUnitCost || 180000,
  equalizerCost: settingsStore.costFactors.equalizerCost || 15000,
  landingStationCost: settingsStore.costFactors.landingStationCost || 5000000,
  currency: settingsStore.costFactors.currency || 'USD',
})

watch(
  () => settingsStore.costFactors,
  (newConfig) => {
    projectCostConfig.cableCostPerKm = newConfig.cableCostPerKm || 35000
    projectCostConfig.installationCostPerKm = newConfig.installationCostPerKm || 15000
    projectCostConfig.repeaterCost = newConfig.repeaterCost || 250000
    projectCostConfig.branchingUnitCost = newConfig.branchingUnitCost || 180000
    projectCostConfig.equalizerCost = newConfig.equalizerCost || 15000
    projectCostConfig.landingStationCost = newConfig.landingStationCost || 5000000
    projectCostConfig.currency = newConfig.currency || 'USD'
  },
  { deep: true, immediate: true }
)

const monitorConfig = reactive({
  dataSourceType: settingsStore.monitoringConfig.dataSourceType,
  connectionAddress: settingsStore.monitoringConfig.connectionAddress,
  authToken: settingsStore.monitoringConfig.authToken,
  pollingInterval: settingsStore.monitoringConfig.pollingInterval,
  requestTimeout: settingsStore.monitoringConfig.requestTimeout,
  protocol: settingsStore.monitoringConfig.protocol,
  authMethod: settingsStore.monitoringConfig.authMethod,
  powerThreshold: settingsStore.monitoringConfig.powerThreshold,
  temperatureThreshold: settingsStore.monitoringConfig.temperatureThreshold,
  berThreshold: settingsStore.monitoringConfig.berThreshold,
  fieldMappings: settingsStore.monitoringConfig.fieldMappings.map(m => ({ ...m })),
})

// 字段映射操作
const addFieldMapping = () => {
  monitorConfig.fieldMappings.push({
    id: `fm-${Date.now()}`,
    sourceField: '',
    targetField: '',
    dataType: 'string',
    description: '',
  })
}

const removeFieldMapping = (id: string) => {
  monitorConfig.fieldMappings = monitorConfig.fieldMappings.filter(m => m.id !== id)
}

const fiberConfig = reactive({
  model: settingsStore.fiberSimulationConfig.model,
})

const toggleModel = (modelId: string) => {
  const index = transConfig.models.indexOf(modelId)
  if (index > -1) {
    transConfig.models.splice(index, 1)
  } else {
    transConfig.models.push(modelId)
  }
}

// 解析坐标字符串 "经度,纬度" 格式
const parseCoordString = (coordStr: string): { lon: number; lat: number } => {
  const parts = coordStr.split(',').map(s => parseFloat(s.trim()))
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return {lon: parts[0], lat: parts[1]}
  }
  return {lon: 0, lat: 0}
}

const createExistingMarker = (name: string, coord: string, color: string): MapMarker | null => {
  const parts = coord.split(',').map(item => parseFloat(item.trim()))
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null
  }

  return {
    lon: parts[0],
    lat: parts[1],
    name,
    color,
  }
}

const existingMapMarkers = computed<MapMarker[]>(() => {
  const markers: MapMarker[] = []

  for (const waypoint of waypoints.value) {
    const marker = createExistingMarker(waypoint.name || '登陆站', waypoint.coord, '#2563eb')
    if (marker) markers.push(marker)
  }

  for (const bu of buConfigs.value) {
    const marker = createExistingMarker(bu.name || 'BU', bu.coord, '#7c3aed')
    if (marker) markers.push(marker)
  }

  const startMarker = createExistingMarker(startPointConfig.name || '起点', `${startPointConfig.lon},${startPointConfig.lat}`, '#2563eb')
  if (startMarker) markers.push(startMarker)

  const endMarker = createExistingMarker(endPointConfig.name || '终点', `${endPointConfig.lon},${endPointConfig.lat}`, '#16a34a')
  if (endMarker) markers.push(endMarker)

  return markers
})

const closeSettingsWithoutSaving = () => {
  router.push('/planning')
}

const handleSave = async () => {
  // 点对点模式：从 startPointConfig 和 endPointConfig 获取
  const startPoint = {
    name: startPointConfig.name || '',
    lon: parseFloat(startPointConfig.lon) || 0,
    lat: parseFloat(startPointConfig.lat) || 0,
    depth: startPointConfig.isUnderwater ? 100 : 0  // 水下站点默认水深100m
  }
  const endPoint = {
    name: endPointConfig.name || '',
    lon: parseFloat(endPointConfig.lon) || 0,
    lat: parseFloat(endPointConfig.lat) || 0,
    depth: endPointConfig.isUnderwater ? 100 : 0  // 水下站点默认水深100m
  }

  // 检查起点终点是否有效配置
  const isStartValid = startPoint.lon !== 0 || startPoint.lat !== 0
  const isEndValid = endPoint.lon !== 0 || endPoint.lat !== 0

  // 解析多点坐标 - USE规范: imported_landing_points
  const parsedWaypoints = waypoints.value.map(wp => {
    const coord = parseCoordString(wp.coord)
    return {
      id: wp.id,
      name: wp.name,
      lon: coord.lon,
      lat: coord.lat,
      depth: wp.isUnderwater ? 100 : 0  // 水下站点默认水深100m，岸上站点为0
    }
  }).filter(wp => wp.lon !== 0 || wp.lat !== 0) // 过滤无效坐标

  // 解析 BU 配置列表 - USE规范: imported_bu_nodes
  const parsedBuList: BUConfig[] = buConfigs.value.map(bu => {
    const coord = parseCoordString(bu.coord)
    const portNum = parseInt(bu.max_ports) || 3
    return {
      id: bu.id,
      name: bu.name,
      lon: coord.lon,
      lat: coord.lat,
      portLimit: Math.max(2, Math.min(8, portNum)) as 3 | 4  // 限制在2-8范围
    }
  }).filter(bu => bu.lon !== 0 || bu.lat !== 0) // 过滤无效坐标

  // 解析铠装映射配置
  const parsedArmorMappings: ArmorMapping[] = armorMappings.value.map(m => ({
    riskLevel: m.riskLevel as 'high' | 'medium' | 'low',
    riskThreshold: parseFloat(m.riskThreshold) || 0,
    cableTypeId: m.riskLevel,  // 使用风险等级作为 ID
    cableTypeName: m.cableTypeName,
    unitPrice: parseFloat(m.unitPrice) || 0
  }))

  // 解析冗余策略配置
  const parsedRedundancyConfig: RedundancyConfig = {
    enabled: redundancyConfig.enabled,
    costLimitType: redundancyConfig.costLimitType,
    relativeCostPercent: redundancyConfig.costLimitType === 'relative' ? parseFloat(redundancyConfig.relativeCostPercent) || 30 : undefined,
    absoluteCostLimit: redundancyConfig.costLimitType === 'absolute' ? parseFloat(redundancyConfig.absoluteCostLimit) || undefined : undefined
  }

  // 多点模式下检查是否配置了足够的点
  const isMultiPointConfigured = routeConfig.mode === 'multi-point' && parsedWaypoints.length >= 2
  const isConfigured = routeConfig.mode === 'point-to-point' ? (isStartValid && isEndValid) : isMultiPointConfigured

  // 解析规划范围
  const planningRange = gisConfig.rangeMode === 'manual' ? {
    northwest: {
      lon: parseFloat(gisConfig.nwLon) || 0,
      lat: parseFloat(gisConfig.nwLat) || 0
    },
    southeast: {
      lon: parseFloat(gisConfig.seLon) || 0,
      lat: parseFloat(gisConfig.seLat) || 0
    }
  } : {
    northwest: {lon: 0, lat: 0},
    southeast: {lon: 0, lat: 0}
  }

  // 点对点模式下，把起点和终点也保存到 waypoints
  let finalWaypoints = parsedWaypoints
  if (routeConfig.mode === 'point-to-point') {
    finalWaypoints = [
      {id: 'start', name: startPointConfig.name || '起点', lon: startPoint.lon, lat: startPoint.lat, depth: startPoint.depth},
      {id: 'end', name: endPointConfig.name || '终点', lon: endPoint.lon, lat: endPoint.lat, depth: endPoint.depth}
    ].filter(wp => wp.lon !== 0 || wp.lat !== 0)
  }

  // 路径规划配置保存
  settingsStore.updateRoutePlanningConfig({
    mode: routeConfig.mode as 'point-to-point' | 'multi-point',
    startPoint,
    endPoint,
    planningRange,
    gridResolution: parseInt(gisConfig.gridResolution) || 500,  // 栅格分辨率
    waypoints: finalWaypoints,
    buList: parsedBuList,
    armorMappings: parsedArmorMappings,
    redundancyConfig: parsedRedundancyConfig,
    isConfigured,
  })

  settingsStore.updateTransmissionConfig({
    channelCount: transConfig.channelCount,
    centerWavelength: transConfig.centerWavelength,
    channelBandwidth: transConfig.channelBandwidth,
    calculationModels: [...transConfig.models],
  })

  settingsStore.updateCostFactors({
    cableCostPerKm: projectCostConfig.cableCostPerKm || 0,
    installationCostPerKm: projectCostConfig.installationCostPerKm || 0,
    repeaterCost: projectCostConfig.repeaterCost || 0,
    branchingUnitCost: projectCostConfig.branchingUnitCost || 0,
    equalizerCost: projectCostConfig.equalizerCost || 0,
    landingStationCost: projectCostConfig.landingStationCost || 0,
    currency: projectCostConfig.currency || 'USD',
  })

  settingsStore.updateMonitoringConfig({
    dataSourceType: monitorConfig.dataSourceType as 'realtime' | 'history',
    connectionAddress: monitorConfig.connectionAddress,
    authToken: monitorConfig.authToken,
    pollingInterval: monitorConfig.pollingInterval,
    requestTimeout: monitorConfig.requestTimeout,
    protocol: monitorConfig.protocol as 'JSON' | 'XML' | 'SNMP' | 'gRPC',
    authMethod: monitorConfig.authMethod as 'apikey' | 'oauth' | 'basic',
    powerThreshold: monitorConfig.powerThreshold,
    temperatureThreshold: monitorConfig.temperatureThreshold,
    berThreshold: monitorConfig.berThreshold,
    fieldMappings: monitorConfig.fieldMappings.map(m => ({ ...m })),
  })

  settingsStore.updateFiberSimulationConfig({
    model: fiberConfig.model as 'GN' | 'EGN' | 'SSFM',
  })

  settingsStore.saveToLocalStorage()
  appStore.showNotification({type: 'success', message: '设置已保存'})
}

const handleReset = () => {
  settingsStore.resetToDefaults()
  Object.assign(projectCostConfig, {
    cableCostPerKm: settingsStore.costFactors.cableCostPerKm || 35000,
    installationCostPerKm: settingsStore.costFactors.installationCostPerKm || 15000,
    repeaterCost: settingsStore.costFactors.repeaterCost || 250000,
    branchingUnitCost: settingsStore.costFactors.branchingUnitCost || 180000,
    equalizerCost: settingsStore.costFactors.equalizerCost || 15000,
    landingStationCost: settingsStore.costFactors.landingStationCost || 5000000,
    currency: settingsStore.costFactors.currency || 'USD',
  })
  Object.assign(routeConfig, {
    mode: settingsStore.routePlanningConfig.mode,
    startLon: settingsStore.routePlanningConfig.startPoint.lon,
    startLat: settingsStore.routePlanningConfig.startPoint.lat,
    endLon: settingsStore.routePlanningConfig.endPoint.lon,
    endLat: settingsStore.routePlanningConfig.endPoint.lat,
    nwLon: settingsStore.routePlanningConfig.planningRange.northwest.lon,
    nwLat: settingsStore.routePlanningConfig.planningRange.northwest.lat,
    seLon: settingsStore.routePlanningConfig.planningRange.southeast.lon,
    seLat: settingsStore.routePlanningConfig.planningRange.southeast.lat,
  })
  appStore.showNotification({type: 'info', message: '已重置为默认设置'})
}

// 开始路由规划 - 保存配置并跳转到规划页面
const handleStartRoutePlanning = () => {
  // 先保存配置
  void handleSave()
  // 跳转到规划页面
  router.push('/planning')
  appStore.showNotification({type: 'info', message: '已跳转到路由规划页面'})
}

// 根据风险等级获取铠装类型映射
const riskToArmorType: Record<string, string[]> = {
  high: ['DA', 'RA'],     // 高风险 -> 双铠装/岩石铠装
  medium: ['SA'],         // 中风险 -> 单铠装
  low: ['LW', 'LWP']      // 低风险 -> 轻型/轻型保护
}

// 缆型选项数据库 - 使用 store 中的数据以实现跨页面同步
// settingsStore.cableTypeDatabase 是共享的缆型数据库

// 根据风险等级获取过滤后的缆型选项
const getFilteredCableOptions = (riskLevel: string) => {
  const armorTypes = riskToArmorType[riskLevel] || ['SA']
  const filteredCables = settingsStore.getCableTypesByArmor(armorTypes)
  return filteredCables.map(c => ({
    value: c.name,
    label: `${c.name} - ¥${c.unitPrice}千元/km`
  }))
}

// 处理缆型选择
const handleCableTypeSelect = (mapping: {
  riskLevel: string;
  cableTypeName: string;
  unitPrice: string
}, value: string) => {
  if (value === '__create_new__') {
    // 打开新建缆型弹窗，预设铠装类型
    const armorTypes = riskToArmorType[mapping.riskLevel]
    const presetArmor = armorTypes?.[0] || 'SA'
    handleOpenCableTypeCreate(presetArmor)
    // 不更新 cableTypeName，保持原来的值
    return
  }
  // 更新缆型名称
  mapping.cableTypeName = value
  // 更新单价 - 使用 store 中的数据
  const cable = settingsStore.cableTypeDatabase.find(c => c.name === value)
  if (cable) {
    mapping.unitPrice = String(cable.unitPrice)
  }
}

// 打开新建缆型弹窗
const handleOpenCableTypeCreate = (presetArmor?: string) => {
  cableTypePresetArmor.value = presetArmor || ''
  showCableTypeCreateDialog.value = true
}

// 处理缆型创建完成
const handleCableTypeCreated = (cableType: { id: string; name: string; armorType: string; unitPrice: number }) => {
  // 添加到 store 的缆型数据库 - 这样其他页面也能访问新建的缆型
  settingsStore.addCableTypeSpec({
    id: cableType.id,
    name: cableType.name,
    armorType: cableType.armorType,
    unitPrice: cableType.unitPrice
  })

  // 根据铠装类型找到对应的映射行并更新
  const armorToRisk: Record<string, string> = {
    'DA': 'high',
    'RA': 'high',
    'SA': 'medium',
    'LW': 'low',
    'LWP': 'low'
  }
  const targetRisk = armorToRisk[cableType.armorType] || 'medium'
  const mapping = armorMappings.value.find(m => m.riskLevel === targetRisk)
  if (mapping) {
    mapping.cableTypeName = cableType.name
    mapping.unitPrice = String(cableType.unitPrice)
  }
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden p-4">
    <!-- 未打开项目时显示提示 -->
    <div v-if="!hasOpenProject" class="h-full flex items-center justify-center">
      <Card class="w-[500px] p-8">
        <div class="text-center space-y-6">
          <div class="w-20 h-20 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <AlertTriangle class="w-10 h-10 text-amber-500"/>
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">工程设置</h2>
            <p class="text-gray-500 dark:text-gray-400">请先创建或打开项目后，再进行工程设置</p>
          </div>
          <div class="flex justify-center gap-4">
            <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6" @click="handleNewProject">
              <FilePlus class="w-4 h-4 mr-2"/>
              新建项目
            </Button>
            <Button variant="outline" class="px-6" @click="handleOpenProject">
              <FolderOpen class="w-4 h-4 mr-2"/>
              打开项目
            </Button>
          </div>
        </div>
      </Card>
    </div>

    <!-- 已打开项目时显示设置内容 -->
    <Card v-else class="flex-1 flex overflow-hidden">
      <!-- 左侧菜单 -->
      <div class="w-56 bg-gray-50 border-r flex-shrink-0 flex flex-col">
        <div class="p-4 border-b bg-white flex items-start justify-between gap-3">
          <div>
            <h2 class="font-bold text-gray-800 text-lg">工程设置</h2>
            <p class="text-xs text-gray-500 mt-1">配置系统参数和器件库</p>
          </div>
          <button
            class="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
            title="返回主页面"
            @click="closeSettingsWithoutSaving"
          >
            <X class="w-4 h-4 mx-auto" />
          </button>
        </div>
        <div class="p-3 space-y-1 flex-1">
          <button v-for="tab in tabs" :key="tab.id" :class="[
            'w-full px-3 py-3 text-left text-sm transition-all rounded-lg',
            activeTab === tab.id
              ? 'text-white shadow-md'
              : 'hover:bg-white dark:hover:bg-white/5 hover:shadow-sm text-gray-700 dark:text-gray-300'
          ]" :style="activeTab === tab.id ? { backgroundColor: 'var(--app-primary-color)' } : {}"
                  @click="activeTab = tab.id">
            <span class="font-medium">{{ tab.label }}</span>
          </button>
        </div>
        <!-- 底部按钮 -->
        <div class="p-3 border-t bg-white space-y-2">
          <Button class="w-full bg-primary hover:bg-primary hover:brightness-90 text-white" @click="handleSave">
            <Save class="w-4 h-4 mr-2"/>
            保存设置
          </Button>
          <Button variant="outline" class="w-full text-xs" @click="handleReset">
            <RotateCcw class="w-3.5 h-3.5 mr-1"/>
            重置默认
          </Button>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <CardContent class="flex-1 overflow-y-auto p-6">
        <!-- 路径规划配置 -->
        <div v-if="activeTab === 'route'" class="space-y-4">
          <!-- 网络拓扑与站点配置 -->
          <Card>
            <CardContent class="p-5">
              <div
                  class="flex items-center justify-between cursor-pointer select-none pb-3 border-b mb-4 group"
                  @click="togglePanel('siteLocation')"
              >
                <h3 class="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">▼
                  网络拓扑与站点配置</h3>
                <component :is="expandedPanels.siteLocation ? ChevronDown : ChevronRight"
                           class="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors"/>
              </div>
              <div v-show="expandedPanels.siteLocation" class="space-y-6">
                <!-- 网络规划模式 - 单选按钮 -->
                <div class="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <label class="text-sm font-semibold text-gray-700 block mb-2">网络规划模式</label>
                  <div class="flex flex-col gap-3">
                    <label class="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-white transition-colors">
                      <input
                          type="radio"
                          name="planningMode"
                          value="point-to-point"
                          v-model="routeConfig.mode"
                          class="w-4 h-4 mt-1 text-primary border-gray-300 focus:ring-primary"
                      />
                      <div>
                        <span class="text-sm font-medium text-gray-800 block">POINT_TO_POINT（点对点海缆规划）</span>
                        <span class="text-xs text-gray-500">适用于两个登陆站之间的单条海缆链路规划</span>
                      </div>
                    </label>
                    <label class="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-white transition-colors">
                      <input
                          type="radio"
                          name="planningMode"
                          value="multi-point"
                          v-model="routeConfig.mode"
                          class="w-4 h-4 mt-1 text-primary border-gray-300 focus:ring-primary"
                      />
                      <div>
                        <span class="text-sm font-medium text-gray-800 block">MULTI_NODE_NETWORK（多点海缆网络规划）</span>
                        <span class="text-xs text-gray-500">适用于包含多个登陆站和分支器(BU)的复杂网络拓扑规划</span>
                      </div>
                    </label>
                    <div class="text-[11px] text-gray-500 bg-blue-50/60 border border-blue-100 rounded px-3 py-2">
                      BU 仅在 MULTI_NODE_NETWORK 模式下使用；POINT_TO_POINT 模式忽略 BU 配置。
                    </div>
                  </div>
                </div>

                <div class="border-t border-dashed my-4"></div>

                <!-- 点对点模式：起点和终点 -->
                <template v-if="routeConfig.mode === 'point-to-point'">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- 起点 -->
                    <div class="space-y-3 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                      <div class="flex items-center justify-between">
                        <label class="text-sm font-bold text-blue-800 flex items-center gap-2">
                          <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                          起点配置
                        </label>
                        <Button size="sm" variant="outline"
                                class="h-7 text-xs bg-white hover:bg-blue-50 text-blue-600 border-blue-200"
                                @click="handleMapSelectPoint('start')">
                          <MapPin class="w-3 h-3 mr-1"/>
                          地图选点
                        </Button>
                      </div>
                      <div class="space-y-3">
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-gray-500 w-10">名称</span>
                          <Input v-model="startPointConfig.name" placeholder="请输入起点名称"
                                 class="flex-1 h-8 text-sm"/>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                          <div class="space-y-1">
                            <span class="text-xs text-gray-400 block">经度</span>
                            <Input v-model="startPointConfig.lon" placeholder="121.4737"
                                   class="w-full h-8 text-sm font-mono"/>
                          </div>
                          <div class="space-y-1">
                            <span class="text-xs text-gray-400 block">纬度</span>
                            <Input v-model="startPointConfig.lat" placeholder="31.2304"
                                   class="w-full h-8 text-sm font-mono"/>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 终点 -->
                    <div class="space-y-3 bg-green-50/50 p-4 rounded-lg border border-green-100">
                      <div class="flex items-center justify-between">
                        <label class="text-sm font-bold text-green-800 flex items-center gap-2">
                          <div class="w-2 h-2 rounded-full bg-green-500"></div>
                          终点配置
                        </label>
                        <Button size="sm" variant="outline"
                                class="h-7 text-xs bg-white hover:bg-green-50 text-green-600 border-green-200"
                                @click="handleMapSelectPoint('end')">
                          <MapPin class="w-3 h-3 mr-1"/>
                          地图选点
                        </Button>
                      </div>
                      <div class="space-y-3">
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-gray-500 w-10">名称</span>
                          <Input v-model="endPointConfig.name" placeholder="请输入终点名称" class="flex-1 h-8 text-sm"/>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                          <div class="space-y-1">
                            <span class="text-xs text-gray-400 block">经度</span>
                            <Input v-model="endPointConfig.lon" placeholder="121.5496"
                                   class="w-full h-8 text-sm font-mono"/>
                          </div>
                          <div class="space-y-1">
                            <span class="text-xs text-gray-400 block">纬度</span>
                            <Input v-model="endPointConfig.lat" placeholder="29.8683"
                                   class="w-full h-8 text-sm font-mono"/>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- 多点模式：登陆站列表 + BU 列表 -->
                <template v-if="routeConfig.mode === 'multi-point'">
                  <!-- 登陆站列表 -->
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <label class="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Anchor class="w-4 h-4 text-primary"/>
                        登陆站列表
                      </label>
                      <Button size="sm" variant="outline"
                              class="h-8 text-xs border-dashed border-gray-300 hover:border-primary hover:text-primary"
                              @click="handleAddWaypoint">
                        <Plus class="w-3.5 h-3.5 mr-1"/>
                        新增登陆站
                      </Button>
                    </div>

                    <!-- 登陆站表格 -->
                    <div class="border rounded-lg overflow-hidden shadow-sm">
                      <table class="w-full text-sm">
                        <thead class="bg-gray-50 border-b">
                        <tr>
                          <th class="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wider w-1/4">
                            名称
                          </th>
                          <th class="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wider">
                            经度
                          </th>
                          <th class="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wider">
                            纬度
                          </th>
                          <th class="px-4 py-2.5 text-center font-semibold text-gray-600 text-xs uppercase tracking-wider w-24">
                            操作
                          </th>
                        </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 bg-white">
                        <tr v-for="(wp, index) in waypoints" :key="wp.id" class="hover:bg-gray-50 transition-colors">
                          <td class="px-4 py-2">
                            <Input v-model="wp.name" placeholder="站点名称" size="sm"
                                   class="h-8 border-transparent focus:border-primary bg-transparent focus:bg-white hover:bg-gray-50"/>
                          </td>
                          <td class="px-4 py-2">
                            <Input
                                :model-value="getCoordLon(wp.coord)"
                                @update:model-value="setCoordLon(wp, $event)"
                                placeholder="经度"
                                size="sm"
                                class="h-8 border-transparent focus:border-primary bg-transparent focus:bg-white hover:bg-gray-50 font-mono text-xs"
                            />
                          </td>
                          <td class="px-4 py-2">
                            <Input
                                :model-value="getCoordLat(wp.coord)"
                                @update:model-value="setCoordLat(wp, $event)"
                                placeholder="纬度"
                                size="sm"
                                class="h-8 border-transparent focus:border-primary bg-transparent focus:bg-white hover:bg-gray-50 font-mono text-xs"
                            />
                          </td>
                          <td class="px-4 py-2">
                            <div class="flex items-center justify-center gap-1">
                              <button
                                class="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
                                title="编辑" 
                                @click="handleEditWaypoint(wp.id)"
                              >
                                <Edit class="w-4 h-4"/>
                              </button>
                              <button
                                class="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                title="地图选点" 
                                @click="handleWaypointMapSelect(wp.id)"
                              >
                                <MapPin class="w-4 h-4"/>
                              </button>
                              <button
                                class="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                title="删除" 
                                @click="handleRemoveWaypoint(wp.id)"
                              >
                                <Trash2 class="w-4 h-4"/>
                              </button>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="waypoints.length === 0">
                          <td colspan="4"
                              class="px-4 py-8 text-center text-gray-400 bg-gray-50/50 dashed border-2 border-gray-100 m-2 rounded-lg">
                            <div class="flex flex-col items-center justify-center gap-2">
                              <Anchor class="w-8 h-8 text-gray-300"/>
                              <span class="text-sm">暂无登陆站，请点击右上角添加</span>
                            </div>
                          </td>
                        </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- BU 列表 -->
                  <div class="space-y-3 pt-2">
                    <div class="flex items-center justify-between">
                      <label class="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <GitBranch class="w-4 h-4 text-purple-500"/>
                        BU (分支器) 列表
                      </label>
                      <Button size="sm" variant="outline"
                              class="h-8 text-xs border-dashed border-gray-300 hover:border-purple-500 hover:text-purple-600"
                              @click="handleAddBU">
                        <Plus class="w-3.5 h-3.5 mr-1"/>
                        新增 BU
                      </Button>
                    </div>

                    <!-- BU 表格 -->
                    <div class="border rounded-lg overflow-hidden shadow-sm">
                      <table class="w-full text-sm">
                        <thead class="bg-purple-50/30 border-b">
                        <tr>
                          <th class="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wider w-1/4">
                            名称
                          </th>
                          <th class="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wider">
                            经度
                          </th>
                          <th class="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wider">
                            纬度
                          </th>
                          <th class="px-4 py-2.5 text-left font-semibold text-gray-600 text-xs uppercase tracking-wider w-24">
                            max_ports
                          </th>
                          <th class="px-4 py-2.5 text-center font-semibold text-gray-600 text-xs uppercase tracking-wider w-24">
                            操作
                          </th>
                        </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 bg-white">
                        <tr v-for="(bu, index) in buConfigs" :key="bu.id"
                            class="hover:bg-purple-50/10 transition-colors">
                          <td class="px-4 py-2">
                            <Input v-model="bu.name" placeholder="BU名称" size="sm"
                                   class="h-8 border-transparent focus:border-purple-500 bg-transparent focus:bg-white hover:bg-gray-50"/>
                          </td>
                          <td class="px-4 py-2">
                            <Input
                                :model-value="getCoordLon(bu.coord)"
                                @update:model-value="setCoordLonBu(bu, $event)"
                                placeholder="经度"
                                size="sm"
                                class="h-8 border-transparent focus:border-purple-500 bg-transparent focus:bg-white hover:bg-gray-50 font-mono text-xs"
                            />
                          </td>
                          <td class="px-4 py-2">
                            <Input
                                :model-value="getCoordLat(bu.coord)"
                                @update:model-value="setCoordLatBu(bu, $event)"
                                placeholder="纬度"
                                size="sm"
                                class="h-8 border-transparent focus:border-purple-500 bg-transparent focus:bg-white hover:bg-gray-50 font-mono text-xs"
                            />
                          </td>
                          <td class="px-4 py-2">
                            <Input
                                v-model="bu.max_ports"
                                type="number"
                                min="2"
                                max="8"
                                placeholder="3"
                                size="sm"
                                class="h-8 w-16 border-transparent focus:border-purple-500 bg-transparent focus:bg-white hover:bg-gray-50 text-center"
                            />
                          </td>
                          <td class="px-4 py-2">
                            <div class="flex items-center justify-center gap-1">
                              <button
                                class="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
                                title="编辑" 
                                @click="handleEditBU(bu.id)"
                              >
                                <Edit class="w-4 h-4"/>
                              </button>
                              <button
                                class="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                title="地图选点" 
                                @click="handleBuMapSelect(bu.id)"
                              >
                                <MapPin class="w-4 h-4"/>
                              </button>
                              <button
                                class="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                title="删除" 
                                @click="handleRemoveBU(bu.id)"
                              >
                                <Trash2 class="w-4 h-4"/>
                              </button>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="buConfigs.length === 0">
                          <td colspan="5"
                              class="px-4 py-8 text-center text-gray-400 bg-gray-50/50 dashed border-2 border-gray-100 m-2 rounded-lg">
                            <div class="flex flex-col items-center justify-center gap-2">
                              <GitBranch class="w-8 h-8 text-gray-300"/>
                              <span class="text-sm">暂无 BU，请点击右上角添加</span>
                            </div>
                          </td>
                        </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </template>
              </div>
            </CardContent>
          </Card>

          <!-- 海缆铠装预选 -->
          <Card>
            <CardContent class="p-5">
              <div
                  class="flex items-center justify-between cursor-pointer select-none pb-3 border-b mb-4 group"
                  @click="togglePanel('armorMapping')"
              >
                <h3 class="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">▼
                  海缆铠装预选</h3>
                <component :is="expandedPanels.armorMapping ? ChevronDown : ChevronRight"
                           class="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors"/>
              </div>
              <div v-show="expandedPanels.armorMapping" class="space-y-4">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-semibold text-gray-700">风险等级与缆型映射规则</label>
                  <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">自动匹配</span>
                </div>

                <!-- 铠装映射列表 -->
                <div class="space-y-3">
                  <div v-for="mapping in armorMappings" :key="mapping.riskLevel"
                       class="flex items-center gap-4 p-4 bg-white border rounded-lg hover:shadow-sm hover:border-gray-300 transition-all group"
                  >
                    <!-- 风险等级标签 -->
                    <div class="w-24 shrink-0 flex flex-col items-center gap-1">
                      <span :class="[
                        'text-xs font-bold px-3 py-1 rounded-full w-full text-center',
                        mapping.riskLevel === 'high' ? 'bg-red-50 text-red-700' :
                        mapping.riskLevel === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-green-50 text-green-700'
                      ]">{{ riskLevelLabels[mapping.riskLevel] }}</span>
                      <span class="text-[10px] text-gray-400">
                        {{
                          mapping.riskLevel === 'high' ? '风险值 ≥ 3' : mapping.riskLevel === 'medium' ? '2 ≤ 风险 < 3' : '风险值 < 2'
                        }}
                      </span>
                    </div>

                    <!-- 阈值设置 (隐藏，因为是固定的逻辑) -->
                    <input type="hidden" v-model="mapping.riskThreshold"/>

                    <!-- 缆型选择 -->
                    <div class="flex-1 flex flex-col gap-1">
                      <label class="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">选择缆型</label>
                      <div class="flex items-center gap-2">
                        <Cable class="w-4 h-4 text-gray-400 group-hover:text-gray-600 shrink-0"/>
                        <Select
                            :model-value="mapping.cableTypeName"
                            @update:model-value="(val) => handleCableTypeSelect(mapping, val)"
                            :options="[...getFilteredCableOptions(mapping.riskLevel), { value: '__create_new__', label: '➕ 新建缆型...' }]"
                            placeholder="请选择缆型"
                            class="flex-1 h-9"
                        />
                      </div>
                    </div>

                    <!-- 单价设置 -->
                    <div class="w-40 flex flex-col gap-1">
                      <label class="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">预估单价</label>
                      <div class="flex items-center gap-1">
                        <Input v-model="mapping.unitPrice" type="number"
                               class="flex-1 h-9 border-gray-200 focus:border-primary text-right"/>
                        <span class="text-xs text-gray-500 shrink-0 w-12">千元/km</span>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- 提示 -->
                <div
                    class="flex items-start gap-3 text-xs text-gray-500 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                  <span class="text-blue-500 mt-0.5">💡</span>
                  <div class="leading-relaxed">
                    <span class="font-medium text-blue-700">自动匹配逻辑说明：</span>
                    系统将分析路由经过区域的风险图层，高风险区域（如断裂带、抛锚区）将自动匹配高防护等级缆型（双铠装），一般区域匹配标准铠装，深海安全区域匹配轻型缆。
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 冗余策略配置 - 仅多点模式显示 -->
          <Card v-if="routeConfig.mode === 'multi-point'">
            <CardContent class="p-5">
              <div
                  class="flex items-center justify-between cursor-pointer select-none pb-3 border-b mb-4 group"
                  @click="togglePanel('redundancy')"
              >
                <h3 class="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">▼
                  冗余策略配置</h3>
                <component :is="expandedPanels.redundancy ? ChevronDown : ChevronRight"
                           class="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors"/>
              </div>
              <div v-show="expandedPanels.redundancy" class="space-y-5">
                <!-- 启用开关 -->
                <div class="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <div class="flex items-center gap-3">
                    <div class="p-2 rounded-full"
                         :class="redundancyConfig.enabled ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'">
                      <GitBranch class="w-5 h-5"/>
                    </div>
                    <div>
                      <span class="text-sm font-bold text-gray-800 block">启用冗余保护路径</span>
                      <span class="text-xs text-gray-500">为关键网络节点自动规划备份路由，提高网络可靠性</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <label class="text-sm text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                      <input type="radio" :value="false" v-model="redundancyConfig.enabled"
                             class="mr-1 text-primary focus:ring-primary"> 关闭
                    </label>
                    <label class="text-sm font-medium text-primary cursor-pointer">
                      <input type="radio" :value="true" v-model="redundancyConfig.enabled"
                             class="mr-1 text-primary focus:ring-primary"> 启用
                    </label>
                  </div>
                </div>

                <!-- 成本限制配置 -->
                <transition
                    enter-active-class="transition duration-300 ease-out"
                    enter-from-class="transform -translate-y-2 opacity-0"
                    enter-to-class="transform translate-y-0 opacity-100"
                    leave-active-class="transition duration-200 ease-in"
                    leave-from-class="transform translate-y-0 opacity-100"
                    leave-to-class="transform -translate-y-2 opacity-0"
                >
                  <div v-if="redundancyConfig.enabled"
                       class="border rounded-lg p-5 bg-white space-y-4 shadow-sm relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                    <h4 class="text-sm font-bold text-gray-800">成本上限控制</h4>

                    <div class="space-y-3">
                      <label
                          class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                          :class="redundancyConfig.costLimitType === 'relative' ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-gray-200'">
                        <input type="radio" name="costLimitType" value="relative"
                               v-model="redundancyConfig.costLimitType"
                               class="w-4 h-4 text-primary border-gray-300 focus:ring-primary"/>
                        <div class="ml-3 flex-1 flex items-center gap-2">
                          <span class="text-sm font-medium text-gray-700">相对成本上限</span>
                          <span class="text-xs text-gray-400">- 允许超出最小生成树成本的百分比</span>
                        </div>
                        <div class="flex items-center gap-2" v-if="redundancyConfig.costLimitType === 'relative'">
                          <Input v-model="redundancyConfig.relativeCostPercent" type="number" placeholder="30"
                                 class="w-20 h-8 text-right bg-white"/>
                          <span class="text-sm text-gray-600 font-medium">%</span>
                        </div>
                      </label>

                      <label
                          class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                          :class="redundancyConfig.costLimitType === 'absolute' ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-gray-200'">
                        <input type="radio" name="costLimitType" value="absolute"
                               v-model="redundancyConfig.costLimitType"
                               class="w-4 h-4 text-primary border-gray-300 focus:ring-primary"/>
                        <div class="ml-3 flex-1 flex items-center gap-2">
                          <span class="text-sm font-medium text-gray-700">绝对成本上限</span>
                          <span class="text-xs text-gray-400">- 网络总建设预算硬性上限</span>
                        </div>
                        <div class="flex items-center gap-2" v-if="redundancyConfig.costLimitType === 'absolute'">
                          <Input v-model="redundancyConfig.absoluteCostLimit" type="number" placeholder="1000"
                                 class="w-24 h-8 text-right bg-white"/>
                          <span class="text-sm text-gray-600 font-medium">万元</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </transition>
              </div>
            </CardContent>
          </Card>

          <!-- GIS与路由算法设置 -->
          <Card>
            <CardContent class="p-5">
              <div
                  class="flex items-center justify-between cursor-pointer select-none pb-3 border-b mb-4 group"
                  @click="togglePanel('gisSettings')"
              >
                <h3 class="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">▼
                  GIS与路由算法设置</h3>
                <component :is="expandedPanels.gisSettings ? ChevronDown : ChevronRight"
                           class="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors"/>
              </div>
              <div v-show="expandedPanels.gisSettings" class="space-y-6">
                <!-- 规划范围 -->
                <div class="space-y-3">
                  <div class="flex items-center gap-2">
                    <label class="text-sm font-bold text-gray-700">规划范围设定</label>
                    <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">限制路由搜索区域</span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label
                        class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                        :class="gisConfig.rangeMode === 'auto' ? 'border-primary bg-primary/5' : 'border-gray-200'">
                      <input
                          type="radio"
                          name="rangeMode"
                          value="auto"
                          v-model="gisConfig.rangeMode"
                          class="w-4 h-4 mt-1 text-primary border-gray-300 focus:ring-primary"
                      />
                      <div class="ml-3">
                        <span class="text-sm font-medium text-gray-800 block">自动全图范围</span>
                        <span class="text-xs text-gray-500 mt-1 block">使用地图可视区域作为规划范围</span>
                      </div>
                    </label>
                    <label
                        class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                        :class="gisConfig.rangeMode === 'manual' ? 'border-primary bg-primary/5' : 'border-gray-200'">
                      <input
                          type="radio"
                          name="rangeMode"
                          value="manual"
                          v-model="gisConfig.rangeMode"
                          class="w-4 h-4 mt-1 text-primary border-gray-300 focus:ring-primary"
                      />
                      <div class="ml-3">
                        <span class="text-sm font-medium text-gray-800 block">手动框选范围</span>
                        <span class="text-xs text-gray-500 mt-1 block">自定义矩形区域作为规划边界</span>
                      </div>
                    </label>
                  </div>

                  <!-- 手动框选时显示坐标输入 -->
                  <transition
                      enter-active-class="transition duration-300 ease-out"
                      enter-from-class="opacity-0 translate-y-2"
                      enter-to-class="opacity-100 translate-y-0"
                  >
                    <div v-if="gisConfig.rangeMode === 'manual'"
                         class="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2">
                      <div class="flex items-end gap-4">
                        <div class="flex-1 grid grid-cols-2 gap-4">
                          <div class="space-y-2">
                            <span class="text-xs font-semibold text-gray-500 uppercase">西北角 (Top-Left)</span>
                            <div class="flex gap-2">
                              <Input v-model="gisConfig.nwLon" placeholder="经度" class="w-full h-8 text-xs font-mono"/>
                              <Input v-model="gisConfig.nwLat" placeholder="纬度" class="w-full h-8 text-xs font-mono"/>
                            </div>
                          </div>
                          <div class="space-y-2">
                            <span class="text-xs font-semibold text-gray-500 uppercase">东南角 (Bottom-Right)</span>
                            <div class="flex gap-2">
                              <Input v-model="gisConfig.seLon" placeholder="经度" class="w-full h-8 text-xs font-mono"/>
                              <Input v-model="gisConfig.seLat" placeholder="纬度" class="w-full h-8 text-xs font-mono"/>
                            </div>
                          </div>
                        </div>
                        <Button size="sm" class="bg-white border hover:bg-gray-50 text-gray-700 h-8"
                                @click="handleMapBoxSelect">
                          <MapPin class="w-3.5 h-3.5 mr-1"/>
                          地图框选
                        </Button>
                      </div>
                    </div>
                  </transition>
                </div>

                <div class="border-t border-gray-100 my-4"></div>

                <!-- 栅格化参数 -->
                <div class="flex items-center gap-6">
                  <div class="flex-1">
                    <label class="text-sm font-bold text-gray-700 block mb-1">栅格化分辨率</label>
                    <span
                        class="text-xs text-gray-500 block">设置路径规划时的网格粒度，数值越小精度越高但计算越慢。</span>
                  </div>
                  <div class="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                    <Input v-model="gisConfig.gridResolution" type="number" placeholder="500"
                           class="w-20 h-8 text-right bg-white"/>
                    <span class="text-sm font-medium text-gray-600">meters</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- 传输与仿真配置 -->
        <div v-if="activeTab === 'transmission'" class="space-y-5">
          <div class="flex items-center gap-3 pb-3 border-b">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Radio class="w-5 h-5 text-primary"/>
            </div>
            <div>
              <h3 class="font-bold text-gray-800 text-lg">传输与仿真配置</h3>
              <p class="text-sm text-gray-500">设置波道参数、计算模型和光纤仿真</p>
            </div>
          </div>

          <Card>
            <CardContent class="p-5 space-y-4">
              <div class="flex items-center gap-2">
                <Database class="w-4 h-4 text-primary"/>
                <h4 class="font-medium text-gray-800 dark:text-gray-100">工程成本参数</h4>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">海缆单价</label>
                  <Input v-model="projectCostConfig.cableCostPerKm" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">单位: {{ projectCostConfig.currency }}/km</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">安装单价</label>
                  <Input v-model="projectCostConfig.installationCostPerKm" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">单位: {{ projectCostConfig.currency }}/km</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">放大器单价</label>
                  <Input v-model="projectCostConfig.repeaterCost" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">单位: {{ projectCostConfig.currency }}/台</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">分支器单价</label>
                  <Input v-model="projectCostConfig.branchingUnitCost" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">单位: {{ projectCostConfig.currency }}/台</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">均衡器单价</label>
                  <Input v-model="projectCostConfig.equalizerCost" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">单位: {{ projectCostConfig.currency }}/台</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">登陆站单价</label>
                  <Input v-model="projectCostConfig.landingStationCost" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">单位: {{ projectCostConfig.currency }}/站</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <label class="text-xs text-gray-500 shrink-0">货币</label>
                <select v-model="projectCostConfig.currency"
                        class="w-24 border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        style="border-color: var(--app-border-color)">
                  <option v-for="opt in currencyOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <div class="grid grid-cols-2 gap-5">
            <!-- 波道参数 -->
            <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4">
              <div class="flex items-center gap-2">
                <Waves class="w-4 h-4 text-primary"/>
                <h4 class="font-medium text-gray-800 dark:text-gray-100">波道参数</h4>
              </div>
              <div class="space-y-4">
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">波道数量</label>
                  <Input v-model="transConfig.channelCount" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">范围: 1-400，常用值: 96</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">中心波长 (nm)</label>
                  <Input v-model="transConfig.centerWavelength" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">C波段: 1530-1565nm</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">信道带宽 (GHz)</label>
                  <Input v-model="transConfig.channelBandwidth" type="number" class="w-full"/>
                  <p class="text-xs text-gray-400 mt-1">常用值: 50 GHz, 100 GHz</p>
                </div>
              </div>
            </div>

            <!-- 计算模型 -->
            <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4">
              <div class="flex items-center gap-2">
                <Server class="w-4 h-4 text-primary"/>
                <h4 class="font-medium text-gray-800 dark:text-gray-100">计算模型</h4>
              </div>
              <div class="space-y-2">
                <label v-for="opt in calculationModelOptions" :key="opt.value" :class="[
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  transConfig.models.includes(opt.value) ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200 dark:border-gray-700 dark:hover:border-gray-600'
                ]">
                  <input type="checkbox" :checked="transConfig.models.includes(opt.value)"
                         @change="toggleModel(opt.value)" class="w-4 h-4 text-primary rounded"/>
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <!-- 光纤仿真模型 -->
            <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4 col-span-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Zap class="w-4 h-4 text-primary"/>
                  <h4 class="font-medium text-gray-800 dark:text-gray-100">光纤仿真模型</h4>
                </div>
                <span class="text-xs text-primary bg-primary/10 px-2 py-1 rounded">非线性效应</span>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <label v-for="opt in fiberModelOptions" :key="opt.value" :class="[
                  'flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                  fiberConfig.model === opt.value ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200 dark:border-gray-700 dark:hover:border-gray-600'
                ]">
                  <input type="radio" :value="opt.value" v-model="fiberConfig.model"
                         class="w-4 h-4 text-primary mt-0.5"/>
                  <div>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ opt.label }}</span>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ opt.desc }}</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 监控系统配置 -->
        <div v-if="activeTab === 'monitoring'" class="space-y-6">
          <!-- NMS连接配置 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 dark:text-gray-100 text-lg mb-4 pb-3 border-b">NMS连接配置</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">数据源类型：</label>
                  <Select v-model="monitorConfig.dataSourceType"
                          :options="[{ value: 'realtime', label: '网络实时数据' }, { value: 'history', label: '历史数据' }]"
                          class="flex-1"/>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">数据源URL：</label>
                  <Input v-model="monitorConfig.connectionAddress" placeholder="ws://nms.example.com:8080/api"
                         class="flex-1"/>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">轮询间隔：</label>
                  <Input v-model="monitorConfig.pollingInterval" type="number" class="flex-1"/>
                  <span class="text-sm text-gray-500 w-8 shrink-0">秒</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">请求超时：</label>
                  <Input v-model="monitorConfig.requestTimeout" type="number" class="flex-1"/>
                  <span class="text-sm text-gray-500 w-8 shrink-0">秒</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">数据协议：</label>
                  <Select v-model="monitorConfig.protocol"
                          :options="[{ value: 'JSON', label: 'JSON' }, { value: 'XML', label: 'XML' }, { value: 'SNMP', label: 'SNMP' }, { value: 'gRPC', label: 'gRPC' }]"
                          class="flex-1"/>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">认证方式：</label>
                  <Select v-model="monitorConfig.authMethod"
                          :options="[{ value: 'apikey', label: 'API Key' }, { value: 'oauth', label: 'OAuth 2.0' }, { value: 'basic', label: 'Basic Auth' }]"
                          class="flex-1"/>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">认证凭据：</label>
                  <Input v-model="monitorConfig.authToken" type="password" placeholder="输入认证Token或API Key"
                         class="flex-1"/>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 告警阈值 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 dark:text-gray-100 text-lg mb-4 pb-3 border-b">告警阈值</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">光功率阈值：</label>
                  <Input v-model="monitorConfig.powerThreshold" type="number" class="flex-1"/>
                  <span class="text-sm text-gray-500 w-12 shrink-0">dBm</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">温度阈值：</label>
                  <Input v-model="monitorConfig.temperatureThreshold" type="number" class="flex-1"/>
                  <span class="text-sm text-gray-500 w-12 shrink-0">°C</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right shrink-0">BER阈值：</label>
                  <Input v-model="monitorConfig.berThreshold" placeholder="1e-9" class="flex-1"/>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 数据字段映射配置 -->
          <Card>
            <CardContent class="p-5">
              <div class="flex items-center justify-between mb-4 pb-3 border-b">
                <h3 class="font-bold text-gray-800 dark:text-gray-100 text-lg">数据字段映射配置</h3>
                <Button size="sm" class="bg-primary hover:bg-primary hover:brightness-90 text-white" @click="addFieldMapping">
                  <Plus class="w-4 h-4 mr-1"/> 添加映射
                </Button>
              </div>
              <div class="border rounded-lg overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="bg-gray-100 dark:bg-white/5">
                    <tr>
                      <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">NMS原始字段</th>
                      <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">系统内部字段</th>
                      <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">数据类型</th>
                      <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">描述</th>
                      <th class="text-center px-3 py-2 font-medium text-gray-700 dark:text-gray-300 w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="monitorConfig.fieldMappings.length === 0">
                      <td colspan="5" class="px-3 py-8 text-center text-gray-400">暂无字段映射，点击“添加映射”新建</td>
                    </tr>
                    <tr v-for="mapping in monitorConfig.fieldMappings" :key="mapping.id"
                        class="border-t hover:bg-gray-50 dark:hover:bg-white/5">
                      <td class="px-3 py-1.5">
                        <Input v-model="mapping.sourceField" placeholder="原始字段" class="text-sm"/>
                      </td>
                      <td class="px-3 py-1.5">
                        <Input v-model="mapping.targetField" placeholder="目标字段" class="text-sm"/>
                      </td>
                      <td class="px-3 py-1.5">
                        <Select v-model="mapping.dataType"
                                :options="[{ value: 'string', label: 'String' }, { value: 'number', label: 'Number' }, { value: 'boolean', label: 'Boolean' }, { value: 'date', label: 'Date' }]"
                                class="text-sm"/>
                      </td>
                      <td class="px-3 py-1.5">
                        <Input v-model="mapping.description" placeholder="字段描述" class="text-sm"/>
                      </td>
                      <td class="px-3 py-1.5 text-center">
                        <button class="text-red-500 hover:text-red-700" @click="removeFieldMapping(mapping.id)">
                          <Trash2 class="w-4 h-4"/>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- 器件实例管理 -->
        <div v-if="activeTab === 'equipment'" class="space-y-6">
          <Card>
            <CardContent class="p-5">
              <div class="mb-4 flex items-center justify-between border-b pb-3">
                <div>
                  <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">器件实例管理</h3>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">选择器件类型和器件型号后，维护当前工程中的器件实例。</p>
                </div>
                <div class="flex gap-2">
                  <Button variant="outline" size="sm" @click="loadPlatformLibraries">刷新</Button>
                </div>
              </div>

              <DeviceTypeTabs
                v-model="activePlatformDeviceTypeCd"
                :items="platformDeviceTypeDictionaries"
                :loading="platformDeviceTypeLoading"
              />

              <div v-if="!activePlatformDeviceTypeCd" class="mt-4 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-gray-400" style="border-color: var(--app-border-color)">
                暂无设备类型字典数据
              </div>

              <div v-else class="mt-3 space-y-4">
                <div v-if="settingsStore.deviceLibraryLoading" class="px-1 py-3 text-sm text-gray-400">
                  正在加载器件型号...
                </div>
                <div
                  v-else
                  class="flex items-center gap-6 overflow-x-auto border-b px-1"
                  style="border-color: var(--app-border-color)"
                >
                  <button
                    v-for="library in filteredPlatformLibraries"
                    :key="String(library.id ?? library.name ?? '')"
                    type="button"
                    class="shrink-0 border-b-2 px-1 pb-2 pt-1 text-sm transition"
                    :class="sameId(platformLibraryTab, library.id)
                      ? 'border-primary font-medium text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'"
                    :title="library.name || '-'"
                    @click="selectPlatformLibrary(library)"
                    @contextmenu="event => openPlatformLibraryContextMenu(event, library)"
                  >
                    {{ library.name || '-' }}
                    <span v-if="Number(library.isDefault ?? 0) === 1" class="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">默认</span>
                  </button>
                  <span v-if="filteredPlatformLibraries.length === 0" class="mb-2 text-sm text-gray-400">暂无器件型号，请到系统设置维护器件库</span>
                </div>

                <section class="rounded-lg border" style="border-color: var(--app-border-color)">
                  <div class="flex items-center justify-between border-b px-3 py-2" style="border-color: var(--app-border-color)">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">器件实例</span>
                        <span class="text-xs text-gray-400">{{ platformEntityList.length }} 条</span>
                      </div>
                      <div class="mt-1 truncate text-xs text-gray-400">
                        当前器件型号：{{ selectedPlatformLibrary?.name || '请选择上方器件型号' }}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" :disabled="!selectedPlatformLibrary" @click="openCreatePlatformEntity">
                      <Plus class="mr-1 h-4 w-4" />
                      新增实例
                    </Button>
                  </div>

                  <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                      <thead class="bg-gray-100 dark:bg-white/5">
                        <tr>
                          <th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">名称</th>
                          <th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">位置</th>
                          <th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">属性预览</th>
                          <th class="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">函数</th>
                          <th class="px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-300">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-if="settingsStore.deviceEntityLoading">
                          <td colspan="5" class="px-3 py-8 text-center text-gray-400">正在加载器件实例...</td>
                        </tr>
                        <tr v-else-if="!selectedPlatformLibrary">
                          <td colspan="5" class="px-3 py-8 text-center text-gray-400">请先在上方选择一个器件型号</td>
                        </tr>
                        <tr v-else-if="platformEntityList.length === 0">
                          <td colspan="5" class="px-3 py-8 text-center text-gray-400">当前器件型号暂无实例</td>
                        </tr>
                        <tr
                          v-for="entity in platformEntityList"
                          v-else
                          :key="String(entity.id ?? entity.name ?? '')"
                          class="border-t hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                          <td class="px-3 py-3 align-top">
                            <div class="font-medium text-gray-800 dark:text-gray-100">{{ entity.name || '-' }}</div>
                            <div class="mt-1 text-xs text-gray-400">{{ entity.id || '-' }} · {{ entity.libraryName || selectedPlatformLibrary?.name || '-' }}</div>
                          </td>
                          <td class="px-3 py-3 align-top text-gray-600 dark:text-gray-300">
                            {{ entity.longitude ?? '-' }}, {{ entity.latitude ?? '-' }}
                          </td>
                          <td class="px-3 py-3 align-top">
                            <div class="flex flex-wrap gap-1">
                              <span
                                v-for="attribute in platformEntityConfigPreview(entity)"
                                :key="attribute.code"
                                class="rounded border px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300"
                              >
                                {{ attribute.label }}: {{ attribute.value }}{{ attribute.unit }}
                              </span>
                              <span v-if="platformEntityConfigPreview(entity).length === 0" class="text-xs text-gray-400">暂无属性配置</span>
                            </div>
                          </td>
                          <td class="px-3 py-3 align-top text-gray-600 dark:text-gray-300">
                            {{ entity.bindFuncList?.find(func => Number(func.isDefault ?? 0) === 1)?.name || entity.bindFuncList?.[0]?.name || '-' }}
                          </td>
                          <td class="px-3 py-3 text-center align-top">
                            <button class="mx-1 text-primary hover:brightness-90" @click="openEditPlatformEntity(entity)">修改</button>
                            <button
                              class="mx-1 text-red-500 hover:text-red-700"
                              @click="deletePlatformEntity(entity)"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  </div>

  <div
    v-if="platformLibraryContextMenu.visible"
    class="fixed z-[60] w-32 overflow-hidden rounded-md border bg-white py-1 text-sm shadow-lg dark:bg-gray-800"
    style="border-color: var(--app-border-color)"
    :style="{ left: `${platformLibraryContextMenu.x}px`, top: `${platformLibraryContextMenu.y}px` }"
    @click.stop
  >
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5" @click="editContextPlatformLibrary">
      <Edit2 class="h-4 w-4" />
      编辑
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" @click="deleteContextPlatformLibrary">
      <Trash2 class="h-4 w-4" />
      删除
    </button>
  </div>

  <!-- 器件库弹窗 -->
  <Teleport to="body">
    <div v-if="showPlatformLibraryDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showPlatformLibraryDialog = false"/>
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[920px] max-w-[calc(100vw-48px)] max-h-[88vh] flex flex-col">
        <div class="px-5 py-3 border-b flex items-center justify-between">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ platformLibraryForm.id ? '修改器件' : '新增器件' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showPlatformLibraryDialog = false">
            <X class="w-5 h-5"/>
          </button>
        </div>
        <div class="p-5 space-y-4 overflow-y-auto flex-1 bg-gray-50/60 dark:bg-gray-900/40">
          <div class="grid grid-cols-[1fr_320px] gap-4">
            <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
              <div class="mb-4 flex items-center justify-between">
                <div>
                  <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">基础信息</h4>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">定义器件名称和平台设备类型。</p>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">名称</label>
                  <Input v-model="platformLibraryForm.name" placeholder="如 器件型号"/>
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">设备类型</label>
                  <Select
                    v-model="platformLibraryForm.deviceTypeCd"
                    :options="platformDeviceTypeOptions"
                    :disabled="platformDeviceTypeLoading || platformDeviceTypeOptions.length === 0"
                    placeholder="请选择设备类型"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">项目 ID</label>
                  <Input v-model="platformLibraryForm.projectId" placeholder="为空表示通用型号"/>
                </div>
                <div class="col-span-2">
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">参数窗口标识</label>
                  <Input v-model="platformLibraryForm.dialogWindowId" placeholder="可选"/>
                </div>
              </div>
            </section>

            <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
              <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">图标配置</h4>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">上传图标后自动绑定平台附件。</p>
              <div class="mt-4 space-y-4">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">图标文件</label>
                  <IconUploadField
                    :biz-id="platformLibraryForm.id ?? null"
                    :resolve-biz-id="ensurePlatformLibraryBizId"
                    :icon-id="platformLibraryForm.iconId"
                    :icon-name="platformLibraryForm.iconName"
                    @uploaded="handlePlatformLibraryIconUploaded"
                  />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">图标尺寸</label>
                  <div class="grid grid-cols-[1fr_16px_1fr] items-center gap-2">
                    <Input v-model="platformLibraryForm.iconWidth" type="number"/>
                    <span class="text-center text-xs text-gray-500">×</span>
                    <Input v-model="platformLibraryForm.iconHeight" type="number"/>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <BindFuncListEditor v-model="platformLibraryForm.bindFuncList"/>
          </section>

        </div>
        <div class="flex justify-center gap-4 p-4 border-t">
          <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6" @click="savePlatformLibrary">保存</Button>
          <Button variant="outline" class="px-6" @click="showPlatformLibraryDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 器件实例弹窗 -->
  <Teleport to="body">
    <div v-if="showPlatformEntityDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showPlatformEntityDialog = false" />
      <div class="relative flex max-h-[88vh] w-[980px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ platformEntityForm.id ? '修改器件实例' : '新增器件实例' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showPlatformEntityDialog = false">
            <X class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto bg-gray-50/60 p-5 dark:bg-gray-900/40">
          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <h4 class="mb-4 text-sm font-semibold text-gray-800 dark:text-gray-100">实例信息</h4>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">名称</label>
                <Input v-model="platformEntityForm.name" placeholder="如 EDFA-001" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">器件类型</label>
                <Select
                  v-model="platformEntityForm.deviceTypeCd"
                  :options="platformDeviceTypeOptions"
                  disabled
                />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">器件型号</label>
                <Select
                  v-model="platformEntityForm.libraryId"
                  :options="platformEntityLibrariesForType.map(library => ({ value: String(library.id ?? ''), label: library.name || String(library.id ?? '') }))"
                  placeholder="请选择器件型号"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">项目 ID</label>
                <Input v-model="platformEntityForm.projectId" placeholder="当前工程平台 ID" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">经度</label>
                <Input v-model="platformEntityForm.longitude" type="number" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">纬度</label>
                <Input v-model="platformEntityForm.latitude" type="number" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">排序</label>
                <Input v-model="platformEntityForm.sortNum" type="number" placeholder="999" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">参数窗口标识</label>
                <Input v-model="platformEntityForm.dialogWindowId" placeholder="可选" />
              </div>
            </div>
          </section>

          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <div class="mb-3 flex items-center justify-between">
              <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">实例属性</h4>
              <span class="text-xs text-gray-400">{{ activePlatformDeviceConfigs.length }} 项</span>
            </div>
            <DeviceDynamicValueForm
              v-model="platformEntityForm.values"
              :configs="activePlatformDeviceConfigs"
              :library-values="platformEntityForm.libraryValues"
            />
          </section>

          <section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <BindFuncListEditor v-model="platformEntityForm.bindFuncList" />
          </section>
        </div>

        <div class="flex justify-center gap-4 border-t p-4" style="border-color: var(--app-border-color)">
          <Button class="px-6" :disabled="settingsStore.deviceEntitySyncing" @click="savePlatformEntity">保存</Button>
          <Button variant="outline" class="px-6" @click="showPlatformEntityDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 器件配置弹窗 -->
  <Teleport to="body">
    <div v-if="showPlatformConfigDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showPlatformConfigDialog = false" />
      <div class="relative flex max-h-[88vh] w-[720px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <div>
            <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ platformConfigForm.id ? '编辑器件配置' : '新增器件配置' }}</h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ deviceTypeName(selectedPlatformDeviceTypeCd) }} / {{ selectedPlatformDeviceTypeCd }}</p>
          </div>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showPlatformConfigDialog = false">
            <X class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto bg-gray-50/60 px-10 py-6 dark:bg-gray-900/40">
          <section class="mx-auto w-full max-w-[640px]">

            <div class="space-y-4">
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">属性名称</label>
                <Input v-model="platformConfigForm.name" placeholder="例如：衰减系数" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">属性编码</label>
                <Input v-model="platformConfigForm.code" placeholder="例如：attenuation" :disabled="Boolean(platformConfigForm.id)" />
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">数据类型</label>
                <select
                  v-model="platformConfigForm.dataTypeCd"
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
                  <Input v-model="platformConfigForm.unit" placeholder="dB/km" />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">默认值</label>
                  <Input v-model="platformConfigForm.defaultValue" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">分组编码</label>
                  <Input v-model="platformConfigForm.groupCode" placeholder="base / GN / EGN / SSFM" />
                  <p class="mt-1 text-xs text-gray-400">base 表示器件模型参数；其他编码会显示为计算模型抽屉。</p>
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">分组名称</label>
                  <Input v-model="platformConfigForm.groupName" placeholder="基础物理参数 / GN 模型参数" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">字典编码</label>
                  <Input v-model="platformConfigForm.dicCode" placeholder="DATA_TYPE 时可填" />
                </div>
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">数据格式</label>
                  <Input v-model="platformConfigForm.dataFormat" type="number" placeholder="可选" />
                </div>
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">JSON 字段</label>
                <Input v-model="platformConfigForm.jsonField" placeholder="如 fiber.alpha / gn.noiseBandwidth" />
                <p class="mt-1 text-xs text-gray-400">用于系统规划和仿真入参映射；为空时使用属性编码。</p>
              </div>
              <div>
                <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">描述</label>
                <Input v-model="platformConfigForm.description" placeholder="可选" />
              </div>
            </div>
          </section>
        </div>

        <div class="flex justify-center gap-4 border-t p-4" style="border-color: var(--app-border-color)">
          <Button class="px-6" :disabled="settingsStore.deviceConfigSyncing" @click="savePlatformConfig">保存器件配置</Button>
          <Button variant="outline" class="px-6" @click="showPlatformConfigDialog = false">关闭</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 地图选点弹窗 -->
  <MapSelectDialog
    v-model:visible="showMapSelectDialog" 
    :title="mapSelectTitle" 
    :mode="mapSelectType === 'range' ? 'range' : 'point'"
    :existing-markers="existingMapMarkers"
    @confirm="handleMapSelectConfirm"
  />

  <!-- 新建缆型弹窗 -->
  <CableTypeCreateDialog
      :visible="showCableTypeCreateDialog"
      :preset-armor-type="cableTypePresetArmor"
      @close="showCableTypeCreateDialog = false"
      @created="handleCableTypeCreated"
  />

  <!-- 编辑登陆站弹窗 -->
  <Teleport to="body">
    <div v-if="showWaypointEditDialog && editingWaypoint" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showWaypointEditDialog = false"/>
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[400px]">
        <div class="px-5 py-3 border-b">
          <h3 class="font-bold text-gray-800 dark:text-gray-100 text-center">编辑登陆站</h3>
        </div>
        <div class="p-5 space-y-4">
          <div class="flex items-center gap-3">
            <label class="w-20 text-sm text-gray-600 dark:text-gray-400 text-right">站点名称：</label>
            <Input v-model="editingWaypoint.name" class="flex-1" placeholder="请输入站点名称"/>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-20 text-sm text-gray-600 dark:text-gray-400 text-right">经度：</label>
            <Input :model-value="getCoordLon(editingWaypoint.coord)"
                   @update:model-value="setCoordLon(editingWaypoint, $event)" class="flex-1" placeholder="如：121.4737"/>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-20 text-sm text-gray-600 dark:text-gray-400 text-right">纬度：</label>
            <Input :model-value="getCoordLat(editingWaypoint.coord)"
                   @update:model-value="setCoordLat(editingWaypoint, $event)" class="flex-1" placeholder="如：31.2304"/>
          </div>
          <div class="flex justify-center">
            <Button size="sm" variant="outline" @click="handleWaypointMapSelect(editingWaypoint.id)">
              <MapPin class="w-3.5 h-3.5 mr-1"/>
              地图选点
            </Button>
          </div>
        </div>
        <div class="flex justify-center gap-4 p-4 border-t">
          <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6" @click="saveWaypointEdit">
            保存
          </Button>
          <Button variant="outline" class="px-6" @click="showWaypointEditDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 编辑 BU 弹窗 -->
  <Teleport to="body">
    <div v-if="showBuEditDialog && editingBu" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showBuEditDialog = false"/>
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[400px]">
        <div class="px-5 py-3 border-b">
          <h3 class="font-bold text-gray-800 dark:text-gray-100 text-center">编辑 BU</h3>
        </div>
        <div class="p-5 space-y-4">
          <div class="flex items-center gap-3">
            <label class="w-24 text-sm text-gray-600 dark:text-gray-400 text-right">BU 名称：</label>
            <Input v-model="editingBu.name" class="flex-1" placeholder="请输入 BU 名称"/>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-24 text-sm text-gray-600 dark:text-gray-400 text-right">经度：</label>
            <Input :model-value="getCoordLon(editingBu.coord)" @update:model-value="setCoordLonBu(editingBu, $event)"
                   class="flex-1" placeholder="如：121.4737"/>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-24 text-sm text-gray-600 dark:text-gray-400 text-right">纬度：</label>
            <Input :model-value="getCoordLat(editingBu.coord)" @update:model-value="setCoordLatBu(editingBu, $event)"
                   class="flex-1" placeholder="如：31.2304"/>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-24 text-sm text-gray-600 dark:text-gray-400 text-right">最大端口：</label>
            <Input v-model="editingBu.max_ports" type="number" min="2" max="8" placeholder="3" class="flex-1"/>
            <span class="text-xs text-gray-500 dark:text-gray-400">个</span>
          </div>
          <div class="flex justify-center">
            <Button size="sm" variant="outline" @click="handleBuMapSelect(editingBu.id)">
              <MapPin class="w-3.5 h-3.5 mr-1"/>
              地图选点
            </Button>
          </div>
        </div>
        <div class="flex justify-center gap-4 p-4 border-t">
          <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6" @click="saveBuEdit">保存
          </Button>
          <Button variant="outline" class="px-6" @click="showBuEditDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
