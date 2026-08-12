<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import BindFuncListEditor from '@/components/settings/BindFuncListEditor.vue'
import DeviceDynamicValueForm from '@/components/settings/DeviceDynamicValueForm.vue'
import { useConnectorStore } from '@/stores/connector'
import { MapPin, RefreshCw, Save, X } from 'lucide-vue-next'
import {
  buildDeviceValueList,
  deviceValueListToMap,
  normalizeDeviceConfigs,
} from '@/services/platform/deviceAttributes'
import {
  bindFuncDraftsToList,
  bindFuncListToDrafts,
  type BindFuncDraft,
} from '@/services/platform/bindFuncForm'
import { fetchPlatformAttachmentBlob } from '@/services/platform/attachment'
import { platformDeviceEntityToConnectorElement } from '@/services/platform/deviceLibraryMapping'
import { getDeviceLibraryCategory } from '@/services/platform/deviceTypeAdapter'
import { useRouteStore } from '@/stores/route'
import { nearestPointOnRoute, type LonLatCoordinate } from '@/utils/routeGeometry'
import type {
  Id,
  PlanDeviceEntity,
  PlanDeviceLibrary,
} from '@/services/platform/types'

const EMPTY_LIBRARY_ID = '__none__'
const DEFAULT_ICON_SIZE = { width: 48, height: 48 }

type EntityForm = {
  name: string
  deviceTypeCd: string
  libraryId: string
  longitude: number | string
  latitude: number | string
  projectId: Id | ''
  sortNum: number | string
  iconId: Id | ''
  iconWidth: number | string
  iconHeight: number | string
  dialogWindowId: string
  bindFuncList: BindFuncDraft[]
  deviceValues: Record<string, string>
}

const props = defineProps<{
  visible: boolean
  editId?: string | null
  pickingCoordinate?: boolean
  pickedCoordinate?: { longitude: number; latitude: number } | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'pick-coordinate'): void
  (e: 'cancel-pick-coordinate'): void
}>()

const connectorStore = useConnectorStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()
const routeStore = useRouteStore()

const isEdit = computed(() => !!props.editId)
const currentProjectId = computed(() => appStore.projectState.currentProject?.platformProjectId ?? null)
const currentPlatformEntityId = ref<Id | null>(null)
const sourceLoading = ref(false)
const saving = ref(false)
const initializing = ref(false)
const iconPreviewUrl = ref('')
const loadedConfigDeviceTypeCd = ref('')
let iconPreviewRequestId = 0
let bindFuncDraftSequence = 0

const nextBindFuncDraftId = (prefix: 'func' | 'param') => `${prefix}-${Date.now()}-${++bindFuncDraftSequence}`

const normalizeCode = (value: unknown) =>
  String(value ?? '').trim().toUpperCase().replace(/[\s_\-./()（）·:：]+/g, '')

const isSameId = (left: unknown, right: unknown) => {
  if (left == null || right == null || left === '' || right === '') return false
  return String(left) === String(right)
}

const optionalId = (value: unknown): Id | null => {
  if (value == null || value === '' || value === EMPTY_LIBRARY_ID) return null
  return typeof value === 'number' ? value : String(value)
}

const optionalNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const createDefaultForm = (): EntityForm => ({
  name: '',
  deviceTypeCd: '',
  libraryId: EMPTY_LIBRARY_ID,
  longitude: '',
  latitude: '',
  projectId: currentProjectId.value ?? '',
  sortNum: connectorStore.elements.length + 1,
  iconId: '',
  iconWidth: DEFAULT_ICON_SIZE.width,
  iconHeight: DEFAULT_ICON_SIZE.height,
  dialogWindowId: '',
  bindFuncList: [],
  deviceValues: {},
})

const formData = ref<EntityForm>(createDefaultForm())

const fallbackSortNum = () => {
  const currentIndex = connectorStore.elements.findIndex(element => element.id === props.editId)
  return currentIndex >= 0 ? currentIndex + 1 : connectorStore.elements.length + 1
}

const dictionaryDeviceTypeOptions = computed(() =>
  dictionaryStore.getOptions(PLATFORM_DICTIONARY_TYPES.deviceType),
)

const deviceTypeOptions = computed(() => {
  const options = [...dictionaryDeviceTypeOptions.value]
  const selected = formData.value.deviceTypeCd
  if (selected && !options.some(option => option.value === selected)) {
    options.push({ value: selected, label: selected })
  }
  return options
})

const selectedDeviceTypeName = computed(() => {
  const selected = formData.value.deviceTypeCd
  const dictionary = dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, selected)
  return dictionary?.name || selected || '-'
})

const isAmplifier = computed(() =>
  getDeviceLibraryCategory(formData.value.deviceTypeCd) === 'amplifier',
)

const snapAmplifierCoordinate = () => {
  if (!isAmplifier.value) return true
  const longitude = optionalNumber(formData.value.longitude)
  const latitude = optionalNumber(formData.value.latitude)
  if (longitude === null || latitude === null) {
    appStore.showNotification({ type: 'error', message: '请在路由线上选择放大器位置' })
    return false
  }

  const route = routeStore.selectedRoute
  const routeCoordinates = (route?.rawTrunkCoordinates?.length
    ? route.rawTrunkCoordinates
    : route?.points.map(point => point.coordinates) ?? []) as LonLatCoordinate[]
  const snapped = nearestPointOnRoute([longitude, latitude], routeCoordinates)
  if (!snapped) {
    appStore.showNotification({ type: 'error', message: '当前没有可用于放大器落位的选中路由' })
    return false
  }

  formData.value.longitude = Number(snapped[0].toFixed(6))
  formData.value.latitude = Number(snapped[1].toFixed(6))
  return true
}

const activeDeviceConfigs = computed(() =>
  formData.value.deviceTypeCd
    ? normalizeDeviceConfigs(settingsStore.platformDeviceConfigs)
    : [],
)

const selectedLibrary = computed(() => {
  const id = formData.value.libraryId
  if (!id || id === EMPTY_LIBRARY_ID) return null
  return settingsStore.platformDeviceLibraries.find(library => isSameId(library.id, id)) ?? null
})

const selectedLibraryValues = computed(() => deviceValueListToMap(selectedLibrary.value?.deviceValueList))

const libraryOptions = computed(() =>
  settingsStore.platformDeviceLibraries
    .filter(library => normalizeCode(library.deviceTypeCd) === normalizeCode(formData.value.deviceTypeCd))
    .filter(library => library.id != null)
    .map(library => ({
      value: String(library.id),
      label: library.name || String(library.id),
    })),
)

const librarySelectOptions = computed(() => [
  {
    value: EMPTY_LIBRARY_ID,
    label: formData.value.deviceTypeCd
      ? (libraryOptions.value.length ? '请选择器件库' : '当前类型暂无器件库数据')
      : '请先选择类型',
  },
  ...libraryOptions.value,
])

const loadDeviceConfigsForType = async (deviceTypeCd?: string | null) => {
  if (!deviceTypeCd) {
    settingsStore.clearPlatformDeviceConfigs()
    loadedConfigDeviceTypeCd.value = ''
    return
  }
  if (normalizeCode(loadedConfigDeviceTypeCd.value) === normalizeCode(deviceTypeCd)) return
  await settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd })
  loadedConfigDeviceTypeCd.value = deviceTypeCd
}

const clearInheritedFields = () => {
  formData.value.iconId = ''
  formData.value.iconWidth = DEFAULT_ICON_SIZE.width
  formData.value.iconHeight = DEFAULT_ICON_SIZE.height
  formData.value.dialogWindowId = ''
  formData.value.bindFuncList = []
  formData.value.deviceValues = {}
}

const applyLibraryToForm = async (library: PlanDeviceLibrary | null, fillName = false) => {
  if (!library) {
    clearInheritedFields()
    await loadDeviceConfigsForType(formData.value.deviceTypeCd)
    return
  }

  const detail = library.id ? await settingsStore.loadPlatformDeviceLibraryDetail(library.id) : library
  const deviceTypeCd = detail.deviceTypeCd || formData.value.deviceTypeCd
  await loadDeviceConfigsForType(deviceTypeCd)

  formData.value.libraryId = detail.id == null ? EMPTY_LIBRARY_ID : String(detail.id)
  formData.value.deviceTypeCd = deviceTypeCd
  formData.value.iconId = detail.iconId ?? ''
  formData.value.iconWidth = detail.iconSize?.width ?? DEFAULT_ICON_SIZE.width
  formData.value.iconHeight = detail.iconSize?.height ?? DEFAULT_ICON_SIZE.height
  formData.value.dialogWindowId = detail.dialogWindowId || ''
  formData.value.bindFuncList = bindFuncListToDrafts(detail.bindFuncList, nextBindFuncDraftId)
  formData.value.deviceValues = deviceValueListToMap(detail.deviceValueList)

  if (fillName && !formData.value.name.trim()) {
    const count = connectorStore.elements.length + 1
    formData.value.name = `${detail.name || '接线元'}-${String(count).padStart(3, '0')}`
  }
}

const resetForm = () => {
  currentPlatformEntityId.value = null
  loadedConfigDeviceTypeCd.value = ''
  settingsStore.clearPlatformDeviceConfigs()
  formData.value = createDefaultForm()
}

const replaceIconPreviewUrl = (nextUrl = '') => {
  if (iconPreviewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(iconPreviewUrl.value)
  }
  iconPreviewUrl.value = nextUrl
}

const ensureSourceData = async () => {
  sourceLoading.value = true
  try {
    await Promise.all([
      dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.deviceType),
      settingsStore.ensurePlatformDeviceLibrariesLoaded(),
    ])
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `器件实例基础数据加载失败：${(error as Error).message}`,
    })
  } finally {
    sourceLoading.value = false
  }
}

const applyEntityToForm = async (entity: PlanDeviceEntity, library?: PlanDeviceLibrary | null) => {
  const libraryValues = deviceValueListToMap(library?.deviceValueList)
  const entityValues = deviceValueListToMap(entity.deviceValueList)
  const deviceTypeCd = entity.deviceTypeCd || library?.deviceTypeCd || ''
  await loadDeviceConfigsForType(deviceTypeCd)

  currentPlatformEntityId.value = entity.id ?? null
  formData.value = {
    name: entity.name || '',
    deviceTypeCd,
    libraryId: entity.libraryId == null
      ? (library?.id == null ? EMPTY_LIBRARY_ID : String(library.id))
      : String(entity.libraryId),
    longitude: entity.longitude ?? '',
    latitude: entity.latitude ?? '',
    projectId: entity.projectId ?? currentProjectId.value ?? '',
    sortNum: entity.sortNum ?? fallbackSortNum(),
    iconId: entity.iconId ?? library?.iconId ?? '',
    iconWidth: entity.iconSize?.width ?? library?.iconSize?.width ?? DEFAULT_ICON_SIZE.width,
    iconHeight: entity.iconSize?.height ?? library?.iconSize?.height ?? DEFAULT_ICON_SIZE.height,
    dialogWindowId: entity.dialogWindowId || library?.dialogWindowId || '',
    bindFuncList: bindFuncListToDrafts(
      entity.bindFuncList?.length ? entity.bindFuncList : library?.bindFuncList,
      nextBindFuncDraftId,
    ),
    deviceValues: {
      ...libraryValues,
      ...entityValues,
    },
  }
}

const initializeCreate = async () => {
  resetForm()
  if (!formData.value.name.trim()) {
    const count = connectorStore.elements.length + 1
    formData.value.name = `接线元-${String(count).padStart(3, '0')}`
  }
}

const initializeEdit = async () => {
  resetForm()
  const element = connectorStore.elements.find(item => item.id === props.editId)
  if (!element) return

  if (element.platformEntityId) {
    const detail = await settingsStore.loadPlatformDeviceEntityDetail(element.platformEntityId)
    let library: PlanDeviceLibrary | null = null
    if (detail.libraryId) {
      try {
        library = await settingsStore.loadPlatformDeviceLibraryDetail(detail.libraryId)
      } catch {
        library = selectedLibrary.value
      }
    }
    await applyEntityToForm(detail, library)
    return
  }

  const libraryId = element.componentRefId || element.fiberRefId || EMPTY_LIBRARY_ID
  const library = settingsStore.platformDeviceLibraries.find(item => isSameId(item.id, libraryId)) ?? null
  formData.value = {
    ...createDefaultForm(),
    name: element.name || '',
    deviceTypeCd: library?.deviceTypeCd || '',
    libraryId: library?.id == null ? EMPTY_LIBRARY_ID : String(library.id),
    longitude: element.longitude ?? '',
    latitude: element.latitude ?? '',
    projectId: currentProjectId.value ?? '',
    sortNum: fallbackSortNum(),
  }
  await applyLibraryToForm(library)
}

watch(() => [props.visible, props.editId], async () => {
  if (!props.visible) return
  initializing.value = true
  try {
    await ensureSourceData()
    if (props.editId) {
      await initializeEdit()
    } else {
      await initializeCreate()
    }
  } finally {
    initializing.value = false
  }
}, { immediate: true })

watch(() => formData.value.deviceTypeCd, async () => {
  if (!props.visible || initializing.value) return
  const library = selectedLibrary.value
  if (library && normalizeCode(library.deviceTypeCd) === normalizeCode(formData.value.deviceTypeCd)) return
  formData.value.libraryId = EMPTY_LIBRARY_ID
  clearInheritedFields()
  await loadDeviceConfigsForType(formData.value.deviceTypeCd)
})

watch(() => formData.value.libraryId, async () => {
  if (!props.visible || initializing.value) return
  await applyLibraryToForm(selectedLibrary.value)
})

watch(
  () => [formData.value.iconId, props.visible] as const,
  async ([iconId, visible]) => {
    const requestId = ++iconPreviewRequestId
    if (!visible || iconId == null || iconId === '') {
      replaceIconPreviewUrl()
      return
    }

    try {
      const blob = await fetchPlatformAttachmentBlob(iconId)
      const nextUrl = URL.createObjectURL(blob)
      if (requestId === iconPreviewRequestId) {
        replaceIconPreviewUrl(nextUrl)
      } else {
        URL.revokeObjectURL(nextUrl)
      }
    } catch {
      if (requestId === iconPreviewRequestId) replaceIconPreviewUrl()
    }
  },
  { immediate: true },
)

watch(
  () => props.pickedCoordinate,
  (coordinate) => {
    if (!props.visible || !coordinate) return
    formData.value.longitude = Number(coordinate.longitude.toFixed(6))
    formData.value.latitude = Number(coordinate.latitude.toFixed(6))
  },
)

onBeforeUnmount(() => {
  replaceIconPreviewUrl()
})

const buildPlatformEntityPayload = (): PlanDeviceEntity => {
  const library = selectedLibrary.value
  const libraryId = optionalId(formData.value.libraryId)

  return {
    id: currentPlatformEntityId.value ?? undefined,
    name: formData.value.name.trim() || null,
    deviceTypeCd: formData.value.deviceTypeCd || library?.deviceTypeCd || null,
    iconId: optionalId(formData.value.iconId) ?? null,
    iconSize: {
      width: optionalNumber(formData.value.iconWidth) ?? DEFAULT_ICON_SIZE.width,
      height: optionalNumber(formData.value.iconHeight) ?? DEFAULT_ICON_SIZE.height,
    },
    dialogWindowId: formData.value.dialogWindowId || null,
    bindFuncList: bindFuncDraftsToList(formData.value.bindFuncList),
    libraryId,
    longitude: optionalNumber(formData.value.longitude),
    latitude: optionalNumber(formData.value.latitude),
    projectId: optionalId(formData.value.projectId) ?? currentProjectId.value ?? null,
    sortNum: optionalNumber(formData.value.sortNum) ?? connectorStore.elements.length + 1,
    deviceValueList: buildDeviceValueList(formData.value.deviceValues),
  }
}

const syncLocalElement = (entity: PlanDeviceEntity) => {
  const connectorElement = platformDeviceEntityToConnectorElement(entity)
  const { id: _connectorId, ...localData } = connectorElement

  if (isEdit.value && props.editId) {
    connectorStore.updateElement(props.editId, localData)
  } else {
    connectorStore.addElement(localData)
  }
}

const handleSave = async () => {
  if (!formData.value.deviceTypeCd) {
    appStore.showNotification({ type: 'error', message: '请选择类型' })
    return
  }
  if (!dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.deviceType, formData.value.deviceTypeCd)) {
    appStore.showNotification({ type: 'error', message: `DEVICE_TYPE 字典中不存在器件类型 ${formData.value.deviceTypeCd}` })
    return
  }

  if (!optionalId(formData.value.libraryId)) {
    appStore.showNotification({ type: 'error', message: '请选择器件库' })
    return
  }

  if (!selectedLibrary.value) {
    appStore.showNotification({ type: 'error', message: '请选择已有器件库' })
    return
  }

  if (!snapAmplifierCoordinate()) return

  saving.value = true
  try {
    const payload = buildPlatformEntityPayload()
    const platformEntityId = await settingsStore.savePlatformDeviceEntity(payload)
    currentPlatformEntityId.value = platformEntityId

    const savedEntity: PlanDeviceEntity = {
      ...payload,
      id: platformEntityId,
      typeName: selectedDeviceTypeName.value,
      libraryName: selectedLibrary.value.name || null,
    }
    syncLocalElement(savedEntity)

    appStore.showNotification({ type: 'success', message: '器件实例已保存' })
    emit('saved')
    emit('close')
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `器件实例保存失败：${(error as Error).message}`,
    })
  } finally {
    saving.value = false
  }
}

const handleClose = () => {
  emit('close')
}

const handleCoordinatePickToggle = () => {
  if (props.pickingCoordinate) {
    emit('cancel-pick-coordinate')
  } else {
    emit('pick-coordinate')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="handleClose" />

      <div class="relative flex max-h-[90vh] w-[720px] max-w-[calc(100vw-32px)] flex-col rounded-lg bg-white shadow-xl" @click.stop>
        <div class="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
          <h3 class="text-sm font-bold text-gray-800">
            {{ isEdit ? '编辑接线元' : '添加接线元' }}
          </h3>
          <button class="rounded p-1 hover:bg-gray-200" @click="handleClose">
            <X class="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div class="flex-1 overflow-auto p-4">
          <div v-if="sourceLoading" class="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <RefreshCw class="h-4 w-4 animate-spin text-blue-500" />
            <span>正在加载器件实例数据...</span>
          </div>

          <div v-else class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="mb-1 block text-xs font-medium text-gray-600">名称</label>
                <Input v-model="formData.name" placeholder="请输入名称" class="w-full" />
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">类型</label>
                <Select
                  v-model="formData.deviceTypeCd"
                  :options="deviceTypeOptions"
                  :disabled="deviceTypeOptions.length === 0"
                  placeholder="请选择类型"
                />
              </div>

              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">器件库 *</label>
                <Select
                  v-model="formData.libraryId"
                  :options="librarySelectOptions"
                  :disabled="libraryOptions.length === 0"
                  placeholder="请选择器件库"
                />
              </div>
            </div>

            <div v-if="iconPreviewUrl" class="border-t pt-4">
              <div class="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                <img
                  :src="iconPreviewUrl"
                  alt="器件图标"
                  class="h-12 w-12 shrink-0 object-contain"
                />
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-gray-800">{{ selectedLibrary?.name || formData.name || '器件图标' }}</div>
                  <div class="text-xs text-gray-500">{{ selectedDeviceTypeName }}</div>
                </div>
              </div>
            </div>

            <div class="border-t pt-4">
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-xs font-medium text-gray-600">经纬度</span>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-8 text-xs"
                  :disabled="pickingCoordinate"
                  @click="handleCoordinatePickToggle"
                >
                  <MapPin class="mr-1 h-3.5 w-3.5" />
                  {{ pickingCoordinate ? '选择中...' : '地图选点' }}
                </Button>
              </div>
              <div
                v-if="pickingCoordinate"
                class="mb-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700"
              >
                请在弹出的地图窗口中点击接线元位置，坐标会自动填入。
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-600">经度</label>
                  <Input v-model="formData.longitude" type="number" class="w-full" />
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-gray-600">纬度</label>
                  <Input v-model="formData.latitude" type="number" class="w-full" />
                </div>
              </div>
            </div>

            <div class="border-t pt-4">
              <div class="mb-3">
                <h4 class="text-sm font-semibold text-gray-800">实例参数</h4>
                <p class="mt-1 text-xs text-gray-500">选择器件库后会带入模板参数，可在这里按当前接线元调整。</p>
              </div>
              <DeviceDynamicValueForm
                v-model="formData.deviceValues"
                :configs="activeDeviceConfigs"
                :library-values="selectedLibraryValues"
                value-scope="entity"
              />
            </div>

            <div class="border-t pt-4">
              <BindFuncListEditor v-model="formData.bindFuncList" />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t bg-gray-50 px-4 py-3">
          <Button variant="outline" size="sm" @click="handleClose">
            取消
          </Button>
          <Button size="sm" class="bg-blue-600 text-white hover:bg-blue-700" :disabled="saving || sourceLoading" @click="handleSave">
            <Save class="mr-1 h-4 w-4" />
            {{ saving ? '保存中...' : isEdit ? '保存' : '添加' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
