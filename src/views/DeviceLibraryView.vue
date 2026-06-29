<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import BindFuncListEditor from '@/components/settings/BindFuncListEditor.vue'
import DeviceDynamicValueForm from '@/components/settings/DeviceDynamicValueForm.vue'
import IconUploadField from '@/components/settings/IconUploadField.vue'
import { Card, CardContent, CardHeader, Button, Input, Select } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { platformDeviceConfigApi, platformDictionaryApi, platformProjectApi } from '@/services/platform/api'
import {
  buildDeviceValueList,
  deviceValueListToMap,
} from '@/services/platform/deviceAttributes'
import { bindFuncDraftsToList, bindFuncListToDrafts, type BindFuncDraft } from '@/services/platform/bindFuncForm'
import type {
  Id,
  PlanDeviceConfig,
  PlanDeviceLibrary,
  PlanDeviceLibrarySearch,
  PlanProject,
  PlatformDictionary,
} from '@/services/platform/types'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
const COMMON_PROJECT_OPTION_VALUE = '__COMMON_DEVICE_LIBRARY__'

const settingsStore = useSettingsStore()
const appStore = useAppStore()

const deviceTypes = ref<PlatformDictionary[]>([])
const deviceTypesLoading = ref(false)
const projectOptions = ref<PlanProject[]>([])
const projectOptionsLoading = ref(false)
const activeDeviceTypeCd = ref('')
const expandedDeviceTypeCd = ref('')
const configDialogDeviceTypeCd = ref('')
const deviceTypeConfigMap = ref<Record<string, PlanDeviceConfig[]>>({})
const deviceTypeConfigLoadingMap = ref<Record<string, boolean>>({})
const configDialogSyncing = ref(false)
const searchKeyword = ref('')
const selectedLibraryId = ref<Id | ''>('')
const libraryPageNumber = ref(1)
const libraryPageSize = ref(10)
const libraryTotal = ref(0)

const libraryPageSizeOptions = [10, 20, 50]

const showLibraryDialog = ref(false)
const showConfigDialog = ref(false)
const showDeviceTypeDialog = ref(false)
const libraryValueDraft = ref<Record<string, string>>({})
const deviceTypeContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  deviceType: null as PlatformDictionary | null,
})
const deviceConfigContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  config: null as PlanDeviceConfig | null,
  deviceTypeCd: '',
})

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
  iconName: '',
  iconWidth: 48,
  iconHeight: 48,
  isDefault: false,
  bindFuncList: [] as BindFuncDraft[],
})

const deviceTypeForm = reactive({
  id: '' as string,
  code: '',
  name: '',
  detail: '',
  sortNum: '' as number | string,
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

const isConfigDataTypeDictionary = computed(() => configForm.dataTypeCd === 'DATA_TYPE')

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

const configDialogDeviceType = computed(() =>
  deviceTypes.value.find(item => item.code && String(item.code) === configDialogDeviceTypeCd.value) ?? null,
)

const projectLabel = (project: PlanProject) => {
  const name = project.name || '未命名项目'
  return project.id == null ? name : `${name} (#${project.id})`
}

const libraryProjectValue = computed({
  get: () => {
    if (libraryForm.projectId === '' || libraryForm.projectId == null) return COMMON_PROJECT_OPTION_VALUE
    return String(libraryForm.projectId)
  },
  set: (value: string) => {
    libraryForm.projectId = value === COMMON_PROJECT_OPTION_VALUE ? '' : value
  },
})

const libraryProjectOptions = computed(() => {
  const options = [
    { value: COMMON_PROJECT_OPTION_VALUE, label: '通用型号' },
    ...projectOptions.value
      .filter(project => project.id != null)
      .map(project => ({ value: String(project.id), label: projectLabel(project) })),
  ]
  const selectedValue = libraryProjectValue.value
  if (
    selectedValue !== COMMON_PROJECT_OPTION_VALUE &&
    !options.some(option => option.value === selectedValue)
  ) {
    options.push({ value: selectedValue, label: `项目 #${selectedValue}` })
  }
  return options
})

const deviceTypeName = (code?: string | null) => {
  if (!code) return '-'
  return deviceTypes.value.find(item => item.code && String(item.code) === String(code))?.name || code
}

const defaultConfigValues = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {}
  for (const config of activeDeviceConfigs.value) {
    const code = config.code?.trim()
    if (!code) continue
    result[code] = config.defaultValue == null ? '' : String(config.defaultValue)
  }
  return result
})

let bindFuncDraftSequence = 0
const nextBindFuncDraftId = (prefix: 'func' | 'param') => `${prefix}-${Date.now()}-${++bindFuncDraftSequence}`

const libraryPageTotal = computed(() => Math.max(1, Math.ceil(libraryTotal.value / libraryPageSize.value)))
const libraryPageStart = computed(() =>
  libraryTotal.value === 0 ? 0 : (libraryPageNumber.value - 1) * libraryPageSize.value + 1,
)
const libraryPageEnd = computed(() => Math.min(libraryPageNumber.value * libraryPageSize.value, libraryTotal.value))

const filteredLibraries = computed(() =>
  settingsStore.platformDeviceLibraries.filter(library =>
    !library.deviceTypeCd || String(library.deviceTypeCd) === activeDeviceTypeCd.value,
  ),
)

const selectedLibrary = computed(() =>
  filteredLibraries.value.find(item => sameId(item.id, selectedLibraryId.value)) ?? filteredLibraries.value[0] ?? null,
)

const selectedLibraryDeviceTypeCd = computed(() =>
  selectedLibrary.value?.deviceTypeCd ? String(selectedLibrary.value.deviceTypeCd) : activeDeviceTypeCd.value,
)

const activeDeviceConfigTypeCd = computed(() =>
  showLibraryDialog.value
    ? libraryForm.deviceTypeCd
    : (selectedLibraryDeviceTypeCd.value || activeDeviceTypeCd.value),
)

const activeDeviceConfigs = computed(() => settingsStore.platformDeviceConfigs.filter(config =>
  !config.deviceTypeCd || String(config.deviceTypeCd) === activeDeviceConfigTypeCd.value,
))

const setDeviceTypeConfigCache = (deviceTypeCd: string, configs: PlanDeviceConfig[]) => {
  deviceTypeConfigMap.value = {
    ...deviceTypeConfigMap.value,
    [deviceTypeCd]: configs,
  }
}

const loadDeviceTypeConfigs = async (deviceTypeCd: string) => {
  if (!deviceTypeCd) return []
  deviceTypeConfigLoadingMap.value = {
    ...deviceTypeConfigLoadingMap.value,
    [deviceTypeCd]: true,
  }
  try {
    const response = await platformDeviceConfigApi.search({
      pageNumber: 1,
      pageSize: 1000,
      deviceTypeCd,
    })
    const configs = response.data ?? []
    setDeviceTypeConfigCache(deviceTypeCd, configs)
    return configs
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `属性配置加载失败：${(error as Error).message}` })
    throw error
  } finally {
    deviceTypeConfigLoadingMap.value = {
      ...deviceTypeConfigLoadingMap.value,
      [deviceTypeCd]: false,
    }
  }
}

const refreshDeviceTypeConfigs = async (deviceTypeCd: string) => {
  await loadDeviceTypeConfigs(deviceTypeCd)
  if (deviceTypeCd === activeDeviceConfigTypeCd.value) {
    await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd })
  }
}

const deviceTypeConfigs = (deviceTypeCd?: string | null) =>
  deviceTypeCd ? deviceTypeConfigMap.value[String(deviceTypeCd)] ?? [] : []

const isDeviceTypeConfigLoading = (deviceTypeCd?: string | null) =>
  deviceTypeCd ? Boolean(deviceTypeConfigLoadingMap.value[String(deviceTypeCd)]) : false

const isDeviceTypeExpanded = (deviceType: PlatformDictionary) =>
  Boolean(deviceType.code && expandedDeviceTypeCd.value === String(deviceType.code))

const selectDeviceType = (deviceType: PlatformDictionary) => {
  if (!deviceType.code) return
  const code = String(deviceType.code)
  activeDeviceTypeCd.value = code
  if (expandedDeviceTypeCd.value && expandedDeviceTypeCd.value !== code) {
    expandedDeviceTypeCd.value = ''
  }
}

const toggleDeviceTypeAttrs = async (deviceType: PlatformDictionary) => {
  if (!deviceType.code) return
  const code = String(deviceType.code)
  if (expandedDeviceTypeCd.value === code) {
    expandedDeviceTypeCd.value = ''
    return
  }
  expandedDeviceTypeCd.value = code
  if (!deviceTypeConfigMap.value[code]) {
    try {
      await loadDeviceTypeConfigs(code)
    } catch {
      // Notification is handled in loadDeviceTypeConfigs.
    }
  }
}

const statistics = computed(() => ({
  deviceTypeCount: deviceTypes.value.length,
  libraryCount: libraryTotal.value,
  configCount: activeDeviceConfigs.value.length,
}))

const configPreview = (library: PlanDeviceLibrary | null = selectedLibrary.value) => {
  const valueMap = deviceValueListToMap(library?.deviceValueList)
  return activeDeviceConfigs.value
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

const ensureSelectedLibrary = () => {
  if (selectedLibraryId.value && settingsStore.platformDeviceLibraries.some(item => sameId(item.id, selectedLibraryId.value))) {
    return
  }
  selectedLibraryId.value = settingsStore.platformDeviceLibraries[0]?.id ?? ''
}

const buildLibrarySearch = (deviceTypeCd: string): PlanDeviceLibrarySearch => {
  const payload: PlanDeviceLibrarySearch = {
    pageNumber: libraryPageNumber.value,
    pageSize: libraryPageSize.value,
    deviceTypeCd,
  }
  const keyword = searchKeyword.value.trim()
  if (keyword) payload.name = keyword
  return payload
}

const loadDeviceTypes = async () => {
  deviceTypesLoading.value = true
  try {
    deviceTypes.value = (await platformDictionaryApi.listItem(DEVICE_TYPE_DICTIONARY_TYPE)) ?? []
    activeDeviceTypeCd.value = deviceTypes.value[0]?.code ? String(deviceTypes.value[0].code) : ''
    if (!activeDeviceTypeCd.value) {
      selectedLibraryId.value = ''
      libraryTotal.value = 0
    }
  } catch (error) {
    deviceTypes.value = []
    activeDeviceTypeCd.value = ''
    selectedLibraryId.value = ''
    libraryTotal.value = 0
    appStore.showNotification({ type: 'error', message: `设备类型字典加载失败：${(error as Error).message}` })
  } finally {
    deviceTypesLoading.value = false
  }
}

const loadProjectOptions = async () => {
  projectOptionsLoading.value = true
  try {
    const response = await platformProjectApi.search({
      pageNumber: 1,
      pageSize: 100,
    })
    projectOptions.value = response.data ?? []
  } catch (error) {
    projectOptions.value = []
    appStore.showNotification({ type: 'error', message: `项目列表加载失败：${(error as Error).message}` })
  } finally {
    projectOptionsLoading.value = false
  }
}

const ensureProjectOptions = async () => {
  if (projectOptions.value.length > 0 || projectOptionsLoading.value) return
  await loadProjectOptions()
}

const loadDeviceData = async (deviceTypeCd: string) => {
  if (!deviceTypeCd) {
    libraryTotal.value = 0
    return
  }
  try {
    settingsStore.platformDeviceConfigs = []
    const response = await settingsStore.loadPlatformDeviceLibraries(buildLibrarySearch(deviceTypeCd))
    const page = response.page
    libraryTotal.value = Number(page?.dataTotal ?? response.data?.length ?? 0)
    if (page?.pageNumber) libraryPageNumber.value = Number(page.pageNumber)
    if (page?.pageSize) libraryPageSize.value = Number(page.pageSize)
    if (libraryTotal.value === 0) {
      libraryPageNumber.value = 1
    }
    if (libraryTotal.value > 0 && libraryPageNumber.value > libraryPageTotal.value) {
      libraryPageNumber.value = libraryPageTotal.value
      await loadDeviceData(deviceTypeCd)
      return
    }
    ensureSelectedLibrary()
    await loadSelectedLibraryConfigs()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件数据加载失败：${(error as Error).message}` })
  }
}

const loadSelectedLibraryConfigs = async () => {
  const deviceTypeCd = selectedLibraryDeviceTypeCd.value || activeDeviceTypeCd.value
  if (!deviceTypeCd) {
    settingsStore.platformDeviceConfigs = []
    return
  }
  const response = await settingsStore.loadPlatformDeviceConfigs({
    deviceTypeCd,
  })
  setDeviceTypeConfigCache(deviceTypeCd, response.data ?? [])
}

const refreshCurrent = async () => {
  if (!activeDeviceTypeCd.value) {
    await loadDeviceTypes()
    return
  }
  await loadDeviceData(activeDeviceTypeCd.value)
}

const changeLibraryPage = async (page: number) => {
  const nextPage = Math.min(Math.max(1, page), libraryPageTotal.value)
  if (nextPage === libraryPageNumber.value || !activeDeviceTypeCd.value) return
  libraryPageNumber.value = nextPage
  await loadDeviceData(activeDeviceTypeCd.value)
}

const changeLibraryPageSize = async (event: Event) => {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(value) && value > 0) libraryPageSize.value = value
  if (!activeDeviceTypeCd.value) return
  libraryPageNumber.value = 1
  await loadDeviceData(activeDeviceTypeCd.value)
}

const resetLibraryForm = () => {
  Object.assign(libraryForm, {
    id: undefined,
    name: '',
    projectId: currentProjectId.value || '',
    deviceTypeCd: activeDeviceTypeCd.value,
    iconId: '',
    iconName: '',
    iconWidth: 48,
    iconHeight: 48,
    isDefault: false,
    bindFuncList: [],
  })
  libraryValueDraft.value = { ...defaultConfigValues.value }
}

const openCreateLibrary = async () => {
  if (!activeDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先配置设备类型字典' })
    return
  }
  await ensureProjectOptions()
  await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd: activeDeviceTypeCd.value })
  resetLibraryForm()
  showLibraryDialog.value = true
}

const openEditLibrary = async (library: PlanDeviceLibrary) => {
  if (!library.id) return
  try {
    const detail = await settingsStore.loadPlatformDeviceLibraryDetail(library.id)
    const deviceTypeCd = detail.deviceTypeCd || activeDeviceTypeCd.value
    await ensureProjectOptions()
    await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd })
    Object.assign(libraryForm, {
      id: detail.id,
      name: detail.name || '',
      projectId: detail.projectId ?? '',
      deviceTypeCd,
      iconId: detail.iconId ?? '',
      iconName: detail.iconName || '',
      iconWidth: detail.iconSize?.width ?? 48,
      iconHeight: detail.iconSize?.height ?? 48,
      isDefault: Number(detail.isDefault ?? 0) === 1,
      bindFuncList: bindFuncListToDrafts(detail.bindFuncList, nextBindFuncDraftId),
    })
    libraryValueDraft.value = {
      ...defaultConfigValues.value,
      ...deviceValueListToMap(detail.deviceValueList),
    }
    showLibraryDialog.value = true
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库详情加载失败：${(error as Error).message}` })
  }
}

const buildLibraryPayload = (): PlanDeviceLibrary => ({
  id: libraryForm.id,
  projectId: optionalId(libraryForm.projectId),
  name: libraryForm.name.trim(),
  deviceTypeCd: libraryForm.deviceTypeCd,
  iconId: optionalId(libraryForm.iconId),
  iconSize: {
    width: optionalNumber(libraryForm.iconWidth) ?? 48,
    height: optionalNumber(libraryForm.iconHeight) ?? 48,
  },
  isDefault: libraryForm.isDefault ? 1 : 0,
  bindFuncList: bindFuncDraftsToList(libraryForm.bindFuncList),
  deviceValueList: buildDeviceValueList(libraryValueDraft.value),
})

const buildLibraryIconUploadPayload = (): PlanDeviceLibrary => ({
  id: libraryForm.id,
  projectId: optionalId(libraryForm.projectId),
  name: libraryForm.name.trim(),
  deviceTypeCd: libraryForm.deviceTypeCd,
  iconId: optionalId(libraryForm.iconId),
  iconSize: {
    width: optionalNumber(libraryForm.iconWidth) ?? 48,
    height: optionalNumber(libraryForm.iconHeight) ?? 48,
  },
  isDefault: libraryForm.isDefault ? 1 : 0,
  bindFuncList: bindFuncDraftsToList(libraryForm.bindFuncList),
})

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
    const id = await settingsStore.savePlatformDeviceLibrary(buildLibraryPayload())
    selectedLibraryId.value = id
    await loadDeviceData(activeDeviceTypeCd.value)
    showLibraryDialog.value = false
    appStore.showNotification({ type: 'success', message: '器件库已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件库保存失败：${(error as Error).message}` })
  }
}

const ensureLibraryBizId = async (): Promise<Id | null> => {
  if (!libraryForm.deviceTypeCd) {
    throw new Error('请选择设备类型')
  }
  if (!libraryForm.name.trim()) {
    throw new Error('请先填写器件型号名称')
  }

  const id = await settingsStore.savePlatformDeviceLibrary(buildLibraryIconUploadPayload())
  libraryForm.id = id
  selectedLibraryId.value = id
  await loadDeviceData(activeDeviceTypeCd.value)
  return id
}

const handleLibraryIconUploaded = (payload: { iconId: Id; iconName: string }) => {
  libraryForm.iconId = payload.iconId
  libraryForm.iconName = payload.iconName
}

const closeDeviceTypeContextMenu = () => {
  deviceTypeContextMenu.visible = false
  deviceTypeContextMenu.deviceType = null
}

const closeDeviceConfigContextMenu = () => {
  deviceConfigContextMenu.visible = false
  deviceConfigContextMenu.config = null
  deviceConfigContextMenu.deviceTypeCd = ''
}

const closeContextMenus = () => {
  closeDeviceTypeContextMenu()
  closeDeviceConfigContextMenu()
}

const openDeviceTypeContextMenu = (event: MouseEvent, deviceType: PlatformDictionary) => {
  event.preventDefault()
  event.stopPropagation()
  closeDeviceConfigContextMenu()
  const menuWidth = 132
  const menuHeight = 84
  deviceTypeContextMenu.x = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))
  deviceTypeContextMenu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  deviceTypeContextMenu.deviceType = deviceType
  deviceTypeContextMenu.visible = true
}

const openDeviceConfigContextMenu = (event: MouseEvent, config: PlanDeviceConfig, deviceTypeCd?: string | null) => {
  event.preventDefault()
  event.stopPropagation()
  closeDeviceTypeContextMenu()
  const menuWidth = 132
  const menuHeight = 84
  deviceConfigContextMenu.x = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))
  deviceConfigContextMenu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  deviceConfigContextMenu.config = config
  deviceConfigContextMenu.deviceTypeCd = deviceTypeCd ? String(deviceTypeCd) : ''
  deviceConfigContextMenu.visible = true
}

const resetDeviceTypeForm = () => {
  Object.assign(deviceTypeForm, {
    id: '',
    code: '',
    name: '',
    detail: '',
    sortNum: deviceTypes.value.length + 1,
  })
}

const openCreateDeviceType = () => {
  resetDeviceTypeForm()
  showDeviceTypeDialog.value = true
}

const openEditDeviceType = (deviceType: PlatformDictionary) => {
  closeDeviceTypeContextMenu()
  Object.assign(deviceTypeForm, {
    id: deviceType.id || '',
    code: deviceType.code || '',
    name: deviceType.name || '',
    detail: deviceType.detail || '',
    sortNum: deviceType.sortNum ?? '',
  })
  showDeviceTypeDialog.value = true
}

const openContextDeviceTypeEdit = () => {
  if (!deviceTypeContextMenu.deviceType) return
  openEditDeviceType(deviceTypeContextMenu.deviceType)
}

const deleteDeviceType = async (deviceType: PlatformDictionary) => {
  closeDeviceTypeContextMenu()
  if (!deviceType.id) {
    appStore.showNotification({ type: 'warning', message: '当前设备类型缺少字典 ID，无法删除' })
    return
  }
  if (!window.confirm(`确认删除设备类型「${deviceType.name || deviceType.code || deviceType.id}」？`)) return

  try {
    await platformDictionaryApi.remove({
      id: deviceType.id,
      type: DEVICE_TYPE_DICTIONARY_TYPE,
    })
    if (deviceType.code && expandedDeviceTypeCd.value === String(deviceType.code)) expandedDeviceTypeCd.value = ''
    if (deviceType.code && configDialogDeviceTypeCd.value === String(deviceType.code)) configDialogDeviceTypeCd.value = ''
    await loadDeviceTypes()
    appStore.showNotification({ type: 'success', message: '设备类型已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `设备类型删除失败：${(error as Error).message}` })
  }
}

const deleteContextDeviceType = () => {
  if (!deviceTypeContextMenu.deviceType) return
  void deleteDeviceType(deviceTypeContextMenu.deviceType)
}

const saveDeviceType = async () => {
  const code = deviceTypeForm.code.trim()
  const name = deviceTypeForm.name.trim()
  if (!code) {
    appStore.showNotification({ type: 'warning', message: '请输入设备类型编码' })
    return
  }
  if (!name) {
    appStore.showNotification({ type: 'warning', message: '请输入设备类型名称' })
    return
  }

  try {
    await platformDictionaryApi.save({
      id: deviceTypeForm.id || null,
      type: DEVICE_TYPE_DICTIONARY_TYPE,
      code,
      name,
      detail: deviceTypeForm.detail || null,
      sortNum: optionalNumber(deviceTypeForm.sortNum) ?? 999,
      isValidCd: '1',
    })
    showDeviceTypeDialog.value = false
    await loadDeviceTypes()
    activeDeviceTypeCd.value = code
    appStore.showNotification({ type: 'success', message: deviceTypeForm.id ? '设备类型已更新' : '设备类型已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `设备类型保存失败：${(error as Error).message}` })
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
  if (!activeDeviceTypeCd.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择设备类型' })
    return
  }
  configDialogDeviceTypeCd.value = activeDeviceTypeCd.value
  try {
    await loadDeviceTypeConfigs(configDialogDeviceTypeCd.value)
  } catch {
    return
  }
  resetConfigForm()
  showConfigDialog.value = true
}

const openConfigManagerForType = async (deviceType: PlatformDictionary) => {
  if (!deviceType.code) return
  configDialogDeviceTypeCd.value = String(deviceType.code)
  try {
    await loadDeviceTypeConfigs(configDialogDeviceTypeCd.value)
  } catch {
    return
  }
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

const openEditConfigManager = (config: PlanDeviceConfig, deviceTypeCd?: string | null) => {
  closeDeviceConfigContextMenu()
  configDialogDeviceTypeCd.value = deviceTypeCd || config.deviceTypeCd || expandedDeviceTypeCd.value || activeDeviceTypeCd.value
  openEditConfig(config)
  showConfigDialog.value = true
}

const openContextDeviceConfigEdit = () => {
  if (!deviceConfigContextMenu.config) return
  openEditConfigManager(deviceConfigContextMenu.config, deviceConfigContextMenu.deviceTypeCd)
}

const saveConfig = async () => {
  const deviceTypeCd = configDialogDeviceTypeCd.value || selectedLibraryDeviceTypeCd.value || activeDeviceTypeCd.value
  if (!deviceTypeCd) {
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
    configDialogSyncing.value = true
    await platformDeviceConfigApi.save({
      id: configForm.id ?? null,
      deviceTypeCd,
      name: configForm.name.trim(),
      code: configForm.code.trim(),
      dataTypeCd: configForm.dataTypeCd || 'STRING',
      dataFormat: optionalNumber(configForm.dataFormat),
      dicCode: isConfigDataTypeDictionary.value ? configForm.dicCode || null : null,
      defaultValue: configForm.defaultValue || null,
      description: configForm.description || null,
      jsonField: configForm.jsonField || null,
      unit: configForm.unit || null,
      groupCode: configForm.groupCode || null,
      groupName: configForm.groupName || null,
    })
    await refreshDeviceTypeConfigs(deviceTypeCd)
    resetConfigForm()
    appStore.showNotification({ type: 'success', message: '器件配置已保存' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件配置保存失败：${(error as Error).message}` })
  } finally {
    configDialogSyncing.value = false
  }
}

const deleteConfig = async (config: PlanDeviceConfig, deviceTypeCdOverride?: string | null) => {
  closeDeviceConfigContextMenu()
  const deviceTypeCd = deviceTypeCdOverride || configDialogDeviceTypeCd.value || config.deviceTypeCd || selectedLibraryDeviceTypeCd.value || activeDeviceTypeCd.value
  if (!config.id || !deviceTypeCd) return
  if (!window.confirm(`确认删除器件配置「${config.name || config.code || config.id}」？`)) return

  try {
    configDialogSyncing.value = true
    await platformDeviceConfigApi.remove(config.id)
    await refreshDeviceTypeConfigs(String(deviceTypeCd))
    if (sameId(configForm.id, config.id)) resetConfigForm()
    appStore.showNotification({ type: 'success', message: '器件配置已删除' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `器件配置删除失败：${(error as Error).message}` })
  } finally {
    configDialogSyncing.value = false
  }
}

const deleteContextDeviceConfig = () => {
  if (!deviceConfigContextMenu.config) return
  void deleteConfig(deviceConfigContextMenu.config, deviceConfigContextMenu.deviceTypeCd)
}

watch(activeDeviceTypeCd, deviceTypeCd => {
  selectedLibraryId.value = ''
  libraryPageNumber.value = 1
  if (deviceTypeCd) void loadDeviceData(deviceTypeCd)
})

watch(searchKeyword, () => {
  libraryPageNumber.value = 1
  if (activeDeviceTypeCd.value) void loadDeviceData(activeDeviceTypeCd.value)
})

watch(selectedLibraryId, () => {
  resetConfigForm()
  if (selectedLibrary.value?.id) void loadSelectedLibraryConfigs()
})

onMounted(() => {
  void loadDeviceTypes()
  window.addEventListener('click', closeContextMenus)
  window.addEventListener('resize', closeContextMenus)
  window.addEventListener('scroll', closeContextMenus, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeContextMenus)
  window.removeEventListener('resize', closeContextMenus)
  window.removeEventListener('scroll', closeContextMenus, true)
})
</script>

<template>
  <MainLayout>
    <template #toolbar>
      <div class="flex items-center justify-between border-b bg-white px-4 py-2 dark:bg-gray-900"
        style="border-color: var(--app-border-color)">
        <div class="flex min-w-0 items-center gap-2">
          <Database class="h-5 w-5 text-blue-500" />
          <span class="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200">器件库管理</span>
          <span class="truncate text-xs text-gray-400">当前项目：{{ currentProjectName }}</span>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="deviceTypesLoading" @click="refreshCurrent">
            <RefreshCw class="mr-1 h-4 w-4"
              :class="{ 'animate-spin': deviceTypesLoading || settingsStore.deviceLibraryLoading }" />
            刷新
          </Button>
        </div>
      </div>
    </template>

    <template #left>
      <Card>
        <CardHeader class="flex items-center justify-between gap-2 pb-2">
          <span class="text-sm font-semibold">器件类型</span>
          <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openCreateDeviceType">
            <Plus class="mr-1 h-3.5 w-3.5" />
            新增类型
          </Button>
        </CardHeader>
        <CardContent class="space-y-3 pt-2">
          <div v-if="deviceTypesLoading"
            class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-gray-400"
            style="border-color: var(--app-border-color)">
            正在加载设备类型
          </div>
          <div v-else-if="deviceTypes.length === 0"
            class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-gray-400"
            style="border-color: var(--app-border-color)">
            暂无 DEVICE_TYPE 字典数据
          </div>
          <div v-for="item in deviceTypes" v-else :key="item.code || item.id"
            class="overflow-hidden rounded-md border transition-colors"
            :class="activeDeviceTypeCd === item.code ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'"
            @contextmenu.prevent.stop="openDeviceTypeContextMenu($event, item)">
            <div class="flex w-full items-center gap-2 px-2.5 py-2">
              <button type="button"
                class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-white hover:text-blue-600 dark:hover:bg-gray-900"
                :title="isDeviceTypeExpanded(item) ? '收起属性列表' : '展开属性列表'" @click.stop="toggleDeviceTypeAttrs(item)">
                <ChevronDown v-if="isDeviceTypeExpanded(item)" class="h-4 w-4" />
                <ChevronRight v-else class="h-4 w-4" />
              </button>
              <button type="button" class="min-w-0 flex-1 text-left" @click="selectDeviceType(item)">
                <span class="block truncate text-sm font-medium">{{ item.name || item.code }}</span>
                <span class="block truncate text-xs text-gray-400">{{ item.code }}</span>
              </button>
              <button type="button"
                class="inline-flex h-7 shrink-0 items-center gap-1 rounded px-2 text-xs text-gray-500 transition hover:bg-white hover:text-blue-600 dark:hover:bg-gray-900"
                title="属性配置" @click.stop="openConfigManagerForType(item)">
                <Settings class="h-3.5 w-3.5" />
                属性配置
              </button>
            </div>

            <div v-if="isDeviceTypeExpanded(item)"
              class="border-t bg-white/70 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
              style="border-color: var(--app-border-color)">
              <div v-if="isDeviceTypeConfigLoading(item.code)" class="py-2 text-xs text-gray-400">
                正在加载属性...
              </div>
              <div v-else-if="deviceTypeConfigs(item.code).length === 0" class="py-2 text-xs text-gray-400">
                暂无属性配置
              </div>
              <div v-else class="space-y-1.5">
                <button v-for="config in deviceTypeConfigs(item.code)" :key="String(config.id ?? config.code ?? '')"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30"
                  title="编辑属性" @click.stop="openEditConfigManager(config, item.code ? String(item.code) : '')"
                  @contextmenu.prevent.stop="openDeviceConfigContextMenu($event, config, item.code)">
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-gray-700 dark:text-gray-200">{{ config.name ||
                      config.code }}</span>
                    <span class="block truncate text-gray-400">{{ config.code || '-' }}</span>
                  </span>
                  <span class="shrink-0 rounded border px-1.5 py-0.5 text-[11px] text-gray-500 dark:border-gray-700">
                    {{ config.dataTypeCd || 'STRING' }}{{ config.unit ? ` / ${config.unit}` : '' }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #center>
      <Card class="flex min-h-0 flex-1 flex-col">
        <CardHeader class="block p-0">
          <div class="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ currentDeviceType?.name ||
                '未选择设备类型' }}</div>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative">
                <Search class="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input v-model="searchKeyword" placeholder="搜索名称、编号、窗口" class="w-56 pl-8" />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent class="min-h-0 flex-1 overflow-hidden p-0">
          <div v-if="!activeDeviceTypeCd" class="flex h-full items-center justify-center p-8 text-sm text-gray-400">
            请先在平台字典中维护 DEVICE_TYPE，页面不会使用默认类型兜底。
          </div>

          <div v-else class="flex h-full min-h-[520px] flex-col">
            <section class="flex min-h-0 min-w-0 flex-1 flex-col border-r dark:border-gray-700"
              style="border-color: var(--app-border-color)">
              <div class="flex h-11 items-center justify-between border-b px-3"
                style="border-color: var(--app-border-color)">
                <div class="flex items-center gap-2 text-sm font-semibold">
                  <Layers class="h-4 w-4 text-blue-500" />
                  器件型号
                </div>
                <div class="flex items-center gap-2">
                  <Button size="sm" :disabled="!activeDeviceTypeCd" @click="openCreateLibrary">
                    <Plus class="mr-1 h-4 w-4" />
                    新增器件型号
                  </Button>
                </div>
              </div>
              <div class="min-h-0 flex-1 overflow-auto">
                <table class="w-full text-sm">
                  <thead class="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th class="px-3 py-2 text-left font-medium">名称</th>
                      <th class="px-3 py-2 text-left font-medium">图标</th>
                      <th class="px-3 py-2 text-left font-medium">是否默认</th>
                      <th class="px-3 py-2 text-left font-medium">属性预览</th>
                      <th class="px-3 py-2 text-center font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="library in filteredLibraries" :key="library.id"
                      class="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                      :class="sameId(library.id, selectedLibraryId) ? 'bg-blue-50/80 dark:bg-blue-950/30' : ''"
                      @click="selectedLibraryId = library.id ?? ''">
                      <td class="px-3 py-3 align-top">
                        <div class="font-medium text-gray-800 dark:text-gray-100">{{ library.name || '-' }}</div>
                        <div class="mt-1 text-xs text-gray-400">
                          {{ library.id || '-' }} · {{ deviceTypeName(library.deviceTypeCd) }}
                        </div>
                      </td>
                      <td class="px-3 py-3 align-top text-xs text-gray-500">
                        {{ library.iconId || '-' }}
                      </td>
                      <td class="px-3 py-3 align-top">
                        <span class="rounded border px-2 py-0.5 text-xs"
                          :class="Number(library.isDefault ?? 0) === 1 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'">
                          {{ Number(library.isDefault ?? 0) === 1 ? '默认' : '否' }}
                        </span>
                      </td>
                      <td class="px-3 py-3 align-top">
                        <div class="flex flex-wrap gap-1">
                          <span v-for="attribute in configPreview(library)" :key="attribute.code"
                            class="rounded border px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                            {{ attribute.label }}: {{ attribute.value }}{{ attribute.unit }}
                          </span>
                          <span v-if="configPreview(library).length === 0" class="text-xs text-gray-400">暂无属性配置</span>
                        </div>
                      </td>
                      <td class="px-3 py-3 text-center align-top">
                        <div class="flex items-center justify-center gap-1">
                          <button class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700" title="编辑器件库"
                            @click.stop="openEditLibrary(library)">
                            <Edit2 class="h-4 w-4 text-gray-500" />
                          </button>
                          <button class="rounded p-1 hover:bg-red-50 dark:hover:bg-red-950/40" title="删除器件库"
                            @click.stop="deleteLibrary(library)">
                            <Trash2 class="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="filteredLibraries.length === 0">
                      <td colspan="5" class="px-4 py-10 text-center text-gray-400">当前类型暂无器件型号</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div
                class="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800/60"
                style="border-color: var(--app-border-color)">
                <span>
                  显示 {{ libraryPageStart }}-{{ libraryPageEnd }} / 共 {{ libraryTotal }} 条
                </span>
                <div class="flex items-center gap-2">
                  <span>每页</span>
                  <select :value="libraryPageSize"
                    class="h-7 rounded border bg-white px-2 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300"
                    style="border-color: var(--app-border-color)" @change="changeLibraryPageSize">
                    <option v-for="size in libraryPageSizeOptions" :key="size" :value="size">{{ size }} 条</option>
                  </select>
                  <button type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded border bg-white text-gray-500 transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-900"
                    style="border-color: var(--app-border-color)"
                    :disabled="libraryPageNumber <= 1 || settingsStore.deviceLibraryLoading" title="上一页"
                    @click="changeLibraryPage(libraryPageNumber - 1)">
                    <ChevronLeft class="h-4 w-4" />
                  </button>
                  <span class="min-w-[76px] text-center">第 {{ libraryPageNumber }} / {{ libraryPageTotal }} 页</span>
                  <button type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded border bg-white text-gray-500 transition hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-900"
                    style="border-color: var(--app-border-color)"
                    :disabled="libraryPageNumber >= libraryPageTotal || settingsStore.deviceLibraryLoading" title="下一页"
                    @click="changeLibraryPage(libraryPageNumber + 1)">
                    <ChevronRight class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>

  <Teleport to="body">
    <div v-if="deviceTypeContextMenu.visible"
      class="fixed z-[70] w-[132px] overflow-hidden rounded-md border bg-white py-1 text-sm shadow-lg dark:bg-gray-800"
      :style="{
        left: `${deviceTypeContextMenu.x}px`,
        top: `${deviceTypeContextMenu.y}px`,
        borderColor: 'var(--app-border-color)',
      }" @click.stop @contextmenu.prevent.stop>
      <button type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 transition hover:bg-blue-50 hover:text-blue-700 dark:text-gray-200 dark:hover:bg-blue-950/30"
        @click="openContextDeviceTypeEdit">
        <Edit2 class="h-4 w-4" />
        编辑
      </button>
      <button type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30"
        @click="deleteContextDeviceType">
        <Trash2 class="h-4 w-4" />
        删除
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="deviceConfigContextMenu.visible"
      class="fixed z-[70] w-[132px] overflow-hidden rounded-md border bg-white py-1 text-sm shadow-lg dark:bg-gray-800"
      :style="{
        left: `${deviceConfigContextMenu.x}px`,
        top: `${deviceConfigContextMenu.y}px`,
        borderColor: 'var(--app-border-color)',
      }" @click.stop @contextmenu.prevent.stop>
      <button type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 transition hover:bg-blue-50 hover:text-blue-700 dark:text-gray-200 dark:hover:bg-blue-950/30"
        @click="openContextDeviceConfigEdit">
        <Edit2 class="h-4 w-4" />
        编辑
      </button>
      <button type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30"
        @click="deleteContextDeviceConfig">
        <Trash2 class="h-4 w-4" />
        删除
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showConfigDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showConfigDialog = false" />
      <div
        class="relative flex max-h-[88vh] w-[720px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <div>
            <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ configForm.id ? '编辑属性配置' : '新增属性配置' }}</h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ configDialogDeviceType?.name ||
              configDialogDeviceTypeCd }}
              /
              {{ configDialogDeviceTypeCd }}</p>
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
                <select v-model="configForm.dataTypeCd"
                  class="h-[38px] w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  style="border-color: var(--app-border-color)">
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
              <div class="grid gap-3" :class="isConfigDataTypeDictionary ? 'grid-cols-2' : 'grid-cols-1'">
                <div v-if="isConfigDataTypeDictionary">
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
          <Button class="px-6" :disabled="configDialogSyncing" @click="saveConfig">保存属性配置</Button>
          <Button variant="outline" class="px-6" @click="showConfigDialog = false">关闭</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showLibraryDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showLibraryDialog = false" />
      <div
        class="relative flex max-h-[88vh] w-[980px] max-w-[calc(100vw-48px)] flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ libraryForm.id ? '修改器件型号' : '新增器件型号' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showLibraryDialog = false">
            <X class="h-5 w-5" />
          </button>
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto bg-gray-50/60 p-5 dark:bg-gray-900/40">
          <section class="rounded-md border bg-white dark:bg-gray-800" style="border-color: var(--app-border-color)">
            <div class="border-b px-4 py-3" style="border-color: var(--app-border-color)">
              <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">基础信息</h4>
            </div>
            <div class="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div class="space-y-4">
                <div>
                  <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">名称</label>
                  <Input v-model="libraryForm.name" placeholder="如 G.654.E / EDFA-20dB" />
                </div>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_136px]">
                  <div class="min-w-0">
                    <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">所属项目</label>
                    <Select v-model="libraryProjectValue" :options="libraryProjectOptions"
                      :disabled="projectOptionsLoading" placeholder="请选择项目" />
                  </div>
                  <div>
                    <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">默认</label>
                    <label
                      class="flex h-[38px] cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm text-gray-700 dark:text-gray-200"
                      style="border-color: var(--app-border-color); background-color: var(--app-card-bg);">
                      <input v-model="libraryForm.isDefault" type="checkbox"
                        class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      设为默认
                    </label>
                  </div>
                </div>
              </div>

              <aside class="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"
                style="border-color: var(--app-border-color)">
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-200">图标</span>
                  <span class="text-xs text-gray-400">保存为图标 ID</span>
                </div>
                <IconUploadField variant="preview" :biz-id="libraryForm.id ?? null" :resolve-biz-id="ensureLibraryBizId"
                  :icon-id="libraryForm.iconId" :icon-name="libraryForm.iconName"
                  @uploaded="handleLibraryIconUploaded" />
                <div class="mt-3">
                  <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">图标尺寸（px）</div>
                  <div class="grid grid-cols-[1fr_18px_1fr] items-center gap-2">
                    <Input v-model="libraryForm.iconWidth" type="number" />
                    <span class="text-center text-xs text-gray-400">×</span>
                    <Input v-model="libraryForm.iconHeight" type="number" />
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section class="rounded-md border bg-white p-4 dark:bg-gray-800"
            style="border-color: var(--app-border-color)">
            <DeviceDynamicValueForm v-model="libraryValueDraft" :configs="activeDeviceConfigs" value-scope="library" />
          </section>

          <section class="rounded-md border bg-white p-4 dark:bg-gray-800"
            style="border-color: var(--app-border-color)">
            <BindFuncListEditor v-model="libraryForm.bindFuncList" />
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
    <div v-if="showDeviceTypeDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showDeviceTypeDialog = false" />
      <div class="relative w-[520px] max-w-[calc(100vw-40px)] rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div class="flex items-center justify-between border-b px-5 py-3" style="border-color: var(--app-border-color)">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">{{ deviceTypeForm.id ? '编辑设备类型' : '新增设备类型' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            @click="showDeviceTypeDialog = false">
            <X class="h-5 w-5" />
          </button>
        </div>
        <div class="space-y-4 p-5">
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">编码</label>
            <Input v-model="deviceTypeForm.code" placeholder="如 FIBER / EDFA" :disabled="Boolean(deviceTypeForm.id)" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">名称</label>
            <Input v-model="deviceTypeForm.name" placeholder="如 光纤 / 放大器" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">简介</label>
            <Input v-model="deviceTypeForm.detail" placeholder="可选" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">排序</label>
            <Input v-model="deviceTypeForm.sortNum" type="number" />
          </div>
        </div>
        <div class="flex justify-center gap-4 border-t p-4" style="border-color: var(--app-border-color)">
          <Button class="px-6" @click="saveDeviceType">保存</Button>
          <Button variant="outline" class="px-6" @click="showDeviceTypeDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
