<script setup lang="ts">
import {
  armorRiskLevelOptions,
  useSettingsStore,
  type ArmorRiskLevel,
  type ArmorTypeMapping,
} from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { ref, computed, watch } from 'vue'
import { FilePlus, X, Loader2, ChevronRight, ChevronLeft, Check, MapPin, Package, CheckCircle, Plus, Trash2, Route, GitCommit } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { Button, Select } from '@/shared/components/base'
import MapSelectDialog from '@/modules/planning/dialogs/MapSelectDialog.vue'
import type { MapMarker } from '@/modules/planning/dialogs/MapSelectDialog.vue'
import { deviceImportService } from '@/services/DeviceImportService'
import {
  createProjectWizardSyncState,
  saveProjectWizardStep,
  uploadProjectWizardLayer,
} from '@/services/platform/projectWizardSync'
import { platformPlanLayerApi } from '@/services/platform/api'
import { isPublicFlag, normalizePlanPoints } from '@/services/platform/normalizers'
import type { UppyUploadProgress } from '@/services/platform/uppyUpload'
import type { Id, PlanLayer, PlanLayerTypeDic, PlanPoint } from '@/services/platform/types'

interface Props {
  visible: boolean
  resumeProject?: {
    id: Id
    name?: string
    isPublic?: 0 | 1 | string | null
    points?: PlanPoint[]
  } | null
}

interface LayerItem {
  key: string
  label: string
  checked: boolean
  value: string
  typeDic: PlanLayerTypeDic
  file: File | null
  fileSize: number
  uploadProgress: number
  uploadStatus: 'idle' | 'selected' | 'uploading' | 'uploaded' | 'error'
}

interface DeviceItem {
  id: string
  name: string
  type: string
  file?: string
  // 解析后的数据
  parsedData?: {
    fiberTypes?: any[]
    amplifierTypes?: any[]
    branchingUnitTypes?: any[]
    equalizerTypes?: any[]
    jointBoxTypes?: any[]
  }
}

interface ArmorTypeMappingFormItem {
  id: string
  armorTypeCode: string
  armorTypeName: string
  riskLevel: ArmorRiskLevel | ''
  unitPrice: string
}

type ProjectType = 'use'

const projectTypeOptions = [
  { value: 'use', label: '海缆规划项目 (.use)' }
]

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success', data: any): void
}>()

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()

// 步骤定义
const steps = [
  { id: 1, title: '项目草稿', icon: FilePlus, description: '名称与权限' },
  { id: 2, title: '站点与范围', icon: MapPin, description: '路由输入' },
  { id: 3, title: '资源配置', icon: Package, description: '图层与器件' },
  { id: 4, title: '完成创建', icon: CheckCircle, description: '进入规划' },
]

const currentStep = ref(1)
const isProcessing = ref(false)
const wizardSyncState = createProjectWizardSyncState()

// 步骤1: 项目基本信息
const projectType = ref<ProjectType>('use')
const projectName = ref('')
const allowOtherUsers = ref(false)

// 步骤2: 站点位置与GIS设置
const planningMode = ref<'point-to-point' | 'multi-point'>('point-to-point')
const startStation = ref({ name: '起点', longitude: 0, latitude: 0 })
const endStation = ref({ name: '终点', longitude: 0, latitude: 0 })
// 多点规划站点列表
const waypoints = ref<Array<{ id: string; name: string; longitude: number; latitude: number; isUnderwater: boolean }>>([
  { id: 'wp-1', name: '登陆站1', longitude: 0, latitude: 0, isUnderwater: false },
  { id: 'wp-2', name: '登陆站2', longitude: 0, latitude: 0, isUnderwater: false },
  { id: 'wp-3', name: '登陆站3', longitude: 0, latitude: 0, isUnderwater: false }
])

// BU 配置列表（多点模式） - max_ports 对应 USE 文件规范
const buConfigs = ref<Array<{ id: string; name: string; longitude: number; latitude: number; max_ports: number }>>([])

const armorTypeMappings = ref<ArmorTypeMappingFormItem[]>([])
const armorTypeLoading = computed(() => dictionaryStore.isLoading(PLATFORM_DICTIONARY_TYPES.armoringType))
const armorTypeError = computed(() => dictionaryStore.getError(PLATFORM_DICTIONARY_TYPES.armoringType))
let armorTypeMappingSequence = 0

const armorTypeOptions = computed(() => (
  dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.armoringType).map(item => {
    const value = String(item.code)
    return {
      value,
      label: item.name ? `${item.name} (${value})` : value,
    }
  })
))

const canAddArmorTypeMapping = computed(() => {
  const selectedCodes = new Set(
    armorTypeMappings.value.map(row => row.armorTypeCode).filter(Boolean),
  )
  const availableCount = armorTypeOptions.value.filter(option => !selectedCodes.has(option.value)).length
  const emptyRowCount = armorTypeMappings.value.filter(row => !row.armorTypeCode).length
  return availableCount > emptyRowCount
})

const createArmorTypeMappingId = () => `armor-type-mapping-${++armorTypeMappingSequence}`

const getArmorTypeOptions = (rowId: string) => {
  const selectedCodes = new Set(
    armorTypeMappings.value
      .filter(row => row.id !== rowId && row.armorTypeCode)
      .map(row => row.armorTypeCode),
  )
  return armorTypeOptions.value.map(option => ({
    ...option,
    disabled: selectedCodes.has(option.value),
  }))
}

const addArmorTypeMapping = () => {
  if (!canAddArmorTypeMapping.value) return
  armorTypeMappings.value.push({
    id: createArmorTypeMappingId(),
    armorTypeCode: '',
    armorTypeName: '',
    riskLevel: '',
    unitPrice: '',
  })
}

const removeArmorTypeMapping = (id: string) => {
  armorTypeMappings.value = armorTypeMappings.value.filter(row => row.id !== id)
}

const selectArmorType = (row: ArmorTypeMappingFormItem, armorTypeCode: string) => {
  const dictionaryItem = dictionaryStore
    .getItems(PLATFORM_DICTIONARY_TYPES.armoringType)
    .find(item => String(item.code) === armorTypeCode)
  row.armorTypeCode = armorTypeCode
  row.armorTypeName = dictionaryItem?.name || armorTypeCode
}

const syncArmorTypeMappings = (
  stored = settingsStore.routePlanningConfig.armorTypeMappings || [],
) => {
  const dictionaryItems = dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.armoringType)
  armorTypeMappings.value = stored.map(mapping => {
    const armorTypeCode = String(mapping.armorTypeCode)
    const dictionaryItem = dictionaryItems.find(item => String(item.code) === armorTypeCode)
    return {
      id: createArmorTypeMappingId(),
      armorTypeCode,
      armorTypeName: dictionaryItem?.name || armorTypeCode,
      riskLevel: mapping.riskLevel,
      unitPrice: String(mapping.unitPrice),
    }
  })
}

const collectArmorTypeMappings = (): { mappings: ArmorTypeMapping[]; error: string | null } => {
  const mappings: ArmorTypeMapping[] = []
  const selectedCodes = new Set<string>()

  for (const [index, row] of armorTypeMappings.value.entries()) {
    const armorTypeCode = row.armorTypeCode.trim()
    const priceText = row.unitPrice.trim()
    if (!armorTypeCode) return { mappings: [], error: `请选择第 ${index + 1} 行的铠装类型` }
    if (selectedCodes.has(armorTypeCode)) {
      return { mappings: [], error: `${row.armorTypeName || armorTypeCode} 不能重复添加` }
    }
    selectedCodes.add(armorTypeCode)
    if (!row.riskLevel) return { mappings: [], error: `请为 ${row.armorTypeName || armorTypeCode} 选择风险等级` }
    if (priceText === '') return { mappings: [], error: `请填写 ${row.armorTypeName || armorTypeCode} 的成本` }

    const unitPrice = Number(priceText)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { mappings: [], error: `${row.armorTypeName || armorTypeCode} 的成本必须是非负数` }
    }
    mappings.push({
      armorTypeCode,
      riskLevel: row.riskLevel,
      unitPrice,
    })
  }

  return { mappings, error: null }
}

syncArmorTypeMappings()

// 冗余策略配置（多点模式）
const redundancyConfig = ref({
  enableRedundancy: false,
  costLimitType: 'relative' as 'relative' | 'absolute',
  relativeCostPercent: '30',
  absoluteCostLimit: '',
  criticalNodes: [] as string[]  // 勾选的关键节点ID
})
const costLimitTypeOptions = [
  { value: 'relative', label: '相对成本（%）' },
  { value: 'absolute', label: '绝对成本（万元）' }
]

// 切换关键节点选中状态
const toggleCriticalNode = (id: string) => {
  const idx = redundancyConfig.value.criticalNodes.indexOf(id)
  if (idx >= 0) {
    redundancyConfig.value.criticalNodes.splice(idx, 1)
  } else {
    redundancyConfig.value.criticalNodes.push(id)
  }
}

// 地图选点时显示的已有标记点（让用户知道其他站点在哪）
const existingMapMarkers = computed<MapMarker[]>(() => {
  const markers: MapMarker[] = []
  if (planningMode.value === 'multi-point') {
    for (const wp of waypoints.value) {
      if (wp.longitude !== 0 || wp.latitude !== 0) {
        markers.push({ lon: wp.longitude, lat: wp.latitude, name: wp.name || wp.id, color: '#3b82f6' })
      }
    }
    for (const bu of buConfigs.value) {
      if (bu.longitude !== 0 || bu.latitude !== 0) {
        markers.push({ lon: bu.longitude, lat: bu.latitude, name: bu.name || bu.id, color: '#f97316' })
      }
    }
  } else {
    if (startStation.value.longitude !== 0 || startStation.value.latitude !== 0) {
      markers.push({ lon: startStation.value.longitude, lat: startStation.value.latitude, name: startStation.value.name || '起点', color: '#3b82f6' })
    }
    if (endStation.value.longitude !== 0 || endStation.value.latitude !== 0) {
      markers.push({ lon: endStation.value.longitude, lat: endStation.value.latitude, name: endStation.value.name || '终点', color: '#22c55e' })
    }
  }
  return markers
})

// GIS 配置 - 与工程设置对齐
const gisConfig = ref({
  rangeMode: 'auto' as 'auto' | 'manual',
  topLeftLng: '',
  topLeftLat: '',
  bottomRightLng: '',
  bottomRightLat: '',
  gridResolution: '500'
})
const showMapSelect = ref(false)
const mapSelectType = ref<'start' | 'end' | 'multi-point' | 'range'>('start')
const currentWaypointId = ref<string | null>(null)
const mapSelectTitle = ref('选择起点坐标')

const handleMapSelect = (type: 'start' | 'end' | 'multi-point' | 'range', waypointId?: string) => {
  mapSelectType.value = type
  if (type === 'start') mapSelectTitle.value = '选择起点坐标'
  else if (type === 'end') mapSelectTitle.value = '选择终点坐标'
  else if (type === 'multi-point') {
    mapSelectTitle.value = '选择站点坐标'
    if (waypointId) currentWaypointId.value = waypointId
  }
  else mapSelectTitle.value = '选择规划范围'
  showMapSelect.value = true
}

const handleMapConfirm = (coordStr: string) => {
  const [lon, lat] = coordStr.split(',').map(Number)
  // BU 地图选点
  if (currentBuId.value) {
    const bu = buConfigs.value.find(b => b.id === currentBuId.value)
    if (bu) {
      bu.longitude = lon
      bu.latitude = lat
    }
    currentBuId.value = null
    return
  }
  if (mapSelectType.value === 'start') {
    startStation.value.longitude = lon
    startStation.value.latitude = lat
  } else if (mapSelectType.value === 'end') {
    endStation.value.longitude = lon
    endStation.value.latitude = lat
  } else if (mapSelectType.value === 'multi-point' && currentWaypointId.value) {
    const wp = waypoints.value.find(w => w.id === currentWaypointId.value)
    if (wp) {
      wp.longitude = lon
      wp.latitude = lat
    }
    currentWaypointId.value = null
  } else if (mapSelectType.value === 'range') {
    // 地图框选返回两个点：西北角,东南角
    // 格式: "topLeftLng,topLeftLat,bottomRightLng,bottomRightLat" 或者单点 "lon,lat"
    const parts = coordStr.split(',')
    if (parts.length >= 4) {
      gisConfig.value.topLeftLng = parts[0]
      gisConfig.value.topLeftLat = parts[1]
      gisConfig.value.bottomRightLng = parts[2]
      gisConfig.value.bottomRightLat = parts[3]
    }
  }
}

const addWaypoint = () => {
  waypoints.value.push({
    id: `wp-${Date.now()}`,
    name: `登陆站${waypoints.value.length + 1}`,
    longitude: 0,
    latitude: 0,
    isUnderwater: false
  })
}

const removeWaypoint = (id: string) => {
  if (waypoints.value.length > 2) {
    waypoints.value = waypoints.value.filter(w => w.id !== id)
  } else {
    appStore.showNotification({ type: 'warning', message: '多点规划至少需要2个站点' })
  }
}

// BU 操作
const addBU = () => {
  buConfigs.value.push({
    id: `bu-${Date.now()}`,
    name: `BU${buConfigs.value.length + 1}`,
    longitude: 0,
    latitude: 0,
    max_ports: 3
  })
}

const removeBU = (id: string) => {
  buConfigs.value = buConfigs.value.filter(b => b.id !== id)
}

const currentBuId = ref<string | null>(null)
const handleBuMapSelect = (buId: string) => {
  currentBuId.value = buId
  mapSelectType.value = 'start'
  mapSelectTitle.value = '选择分支器位置'
  showMapSelect.value = true
}

// portLimit 范围: 2-8

// 切换规划模式
const setPlanningMode = (mode: 'point-to-point' | 'multi-point') => {
  planningMode.value = mode
}

const layerList = ref<LayerItem[]>([])
const layerTypeLoading = computed(() => dictionaryStore.isLoading(PLATFORM_DICTIONARY_TYPES.layerType))
const layerTypeError = computed(() => dictionaryStore.getError(PLATFORM_DICTIONARY_TYPES.layerType))

function syncLayerListFromDictionary() {
  const existingByType = new Map(layerList.value.map(item => [item.typeDic, item]))
  layerList.value = dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.layerType).map(item => {
    const typeDic = String(item.code)
    const existing = existingByType.get(typeDic)
    if (existing) {
      return {
        ...existing,
        label: item.name || typeDic,
      }
    }
    return {
      key: typeDic,
      label: item.name || typeDic,
      checked: false,
      value: '',
      typeDic,
      file: null,
      fileSize: 0,
      uploadProgress: 0,
      uploadStatus: 'idle',
    }
  })
}

// 步骤3: 器件库
const deviceList = ref<DeviceItem[]>([])
const deviceFileInputRef = ref<HTMLInputElement | null>(null)

// 重置表单
const resetForm = () => {
  currentStep.value = 1
  wizardSyncState.projectId = null
  wizardSyncState.layerUploads = {}
  projectType.value = 'use'
  projectName.value = ''
  allowOtherUsers.value = false
  startStation.value = { name: '起点', longitude: 0, latitude: 0 }
  endStation.value = { name: '终点', longitude: 0, latitude: 0 }
  planningMode.value = 'point-to-point'
  waypoints.value = [
    { id: 'wp-1', name: '登陆站1', longitude: 0, latitude: 0, isUnderwater: false },
    { id: 'wp-2', name: '登陆站2', longitude: 0, latitude: 0, isUnderwater: false },
    { id: 'wp-3', name: '登陆站3', longitude: 0, latitude: 0, isUnderwater: false }
  ]
  buConfigs.value = []
  syncArmorTypeMappings()
  redundancyConfig.value = { enableRedundancy: false, costLimitType: 'relative', relativeCostPercent: '30', absoluteCostLimit: '', criticalNodes: [] }
  gisConfig.value = { rangeMode: 'auto', topLeftLng: '', topLeftLat: '', bottomRightLng: '', bottomRightLat: '', gridResolution: '500' }
  layerList.value.forEach(item => {
    item.checked = false
    item.value = ''
    item.file = null
    item.fileSize = 0
    item.uploadProgress = 0
    item.uploadStatus = 'idle'
  })
  deviceList.value = []
}

function applyResumeProject() {
  const resume = props.resumeProject
  if (!resume) return

  wizardSyncState.projectId = resume.id
  projectName.value = resume.name || `平台项目 ${resume.id}`
  allowOtherUsers.value = isPublicFlag(resume.isPublic)

  const points = normalizePlanPoints(resume.points)
    .sort((a, b) => Number(a.sortNum ?? 0) - Number(b.sortNum ?? 0))

  if (points.length >= 3) {
    planningMode.value = 'multi-point'
    waypoints.value = points.map((point, index) => ({
      id: String(point.id ?? `wp-${index + 1}`),
      name: point.name || `登陆站${index + 1}`,
      longitude: point.longitude!,
      latitude: point.latitude!,
      isUnderwater: false,
    }))
    currentStep.value = 3
    return
  }

  if (points.length >= 2) {
    planningMode.value = 'point-to-point'
    startStation.value = {
      name: points[0].name || '起点',
      longitude: points[0].longitude!,
      latitude: points[0].latitude!,
    }
    endStation.value = {
      name: points[points.length - 1].name || '终点',
      longitude: points[points.length - 1].longitude!,
      latitude: points[points.length - 1].latitude!,
    }
    currentStep.value = 3
    return
  }

  currentStep.value = 2
}

function getRestoredLayerFileName(layer: PlanLayer, fallbackLabel: string): string {
  const explicitName = layer.attachmentName || layer.filename
  if (explicitName) return explicitName

  const remarks = layer.remarks?.trim()
  const remarkFileName = remarks?.includes(' - ') ? remarks.split(' - ').pop()?.trim() : ''
  return remarkFileName || layer.name || fallbackLabel
}

async function restoreUploadedLayers() {
  const projectId = props.resumeProject?.id
  if (projectId == null) return

  try {
    for (const item of layerList.value) {
      const response = await platformPlanLayerApi.search({
        pageNumber: 1,
        pageSize: 20,
        projectId,
        typeDic: item.typeDic,
      })
      if (!props.visible || String(props.resumeProject?.id ?? '') !== String(projectId)) return
      const layers = response.data ?? []
      const matched = layers.find(layer => layer.attachmentId || layer.filename || layer.attachmentName)
      if (!matched) continue

      const fileName = getRestoredLayerFileName(matched, item.label)
      item.checked = true
      item.value = fileName
      item.file = null
      item.fileSize = matched.fileSize ?? 0
      item.uploadProgress = 100
      item.uploadStatus = 'uploaded'
      if (matched.id) {
        wizardSyncState.layerUploads[item.key] = {
          layerId: matched.id,
          fileName,
          uploadUrl: '',
        }
      }
    }
  } catch (error) {
    appStore.showNotification({
      type: 'warning',
      message: `已上传图层回显失败：${(error as Error).message}`,
      duration: 5000,
    })
  }
}

let visibleLoadSequence = 0

watch(() => props.visible, async (val) => {
  const loadSequence = ++visibleLoadSequence
  if (val) {
    const [layerResult, armorResult] = await Promise.allSettled([
      dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.layerType),
      dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType),
    ])
    if (!props.visible || loadSequence !== visibleLoadSequence) return

    if (layerResult.status === 'fulfilled') {
      syncLayerListFromDictionary()
    } else {
      appStore.showNotification({ type: 'error', message: `图层类型字典加载失败：${(layerResult.reason as Error).message}` })
    }
    if (armorResult.status === 'rejected') {
      appStore.showNotification({ type: 'error', message: `铠装类型字典加载失败：${(armorResult.reason as Error).message}` })
    }

    resetForm()
    applyResumeProject()
    if (props.resumeProject) {
      void restoreUploadedLayers()
    }
  }
}, { immediate: true })

// 步骤导航
const canGoNext = computed(() => {
  if (currentStep.value === 1) {
    return projectName.value.trim() !== ''
  }
  return true
})

const canGoPrev = computed(() => {
  return currentStep.value > 1
})

const isLastStep = computed(() => {
  return currentStep.value === steps.length
})

const wizardTitle = computed(() => props.resumeProject ? '继续创建平台项目' : '新建项目向导')
const wizardSubtitle = computed(() => props.resumeProject
  ? `继续补全「${projectName.value || props.resumeProject.name || '未命名项目'}」的站点、范围和资源配置`
  : '按步骤创建平台项目草稿、配置站点范围，并进入规划')

function buildWizardSyncPayload() {
  return {
    projectType: projectType.value,
    projectName: projectName.value,
    allowOtherUsers: allowOtherUsers.value,
    planningMode: planningMode.value,
    startStation: startStation.value,
    endStation: endStation.value,
    waypoints: waypoints.value.map(wp => ({
      name: wp.name,
      longitude: wp.longitude,
      latitude: wp.latitude,
    })),
    armorTypeMappings: collectArmorTypeMappings().mappings,
    planConfig: {
      scope: gisConfig.value.rangeMode === 'manual' ? {
        topLeftLng: parseFloat(gisConfig.value.topLeftLng) || 0,
        topLeftLat: parseFloat(gisConfig.value.topLeftLat) || 0,
        bottomRightLng: parseFloat(gisConfig.value.bottomRightLng) || 0,
        bottomRightLat: parseFloat(gisConfig.value.bottomRightLat) || 0,
      } : null,
      gridResolution: parseFloat(gisConfig.value.gridResolution) || 500,
      enableRedundancy: redundancyConfig.value.enableRedundancy,
    },
    layers: layerList.value.map(layer => ({
      key: layer.key,
      label: layer.label,
      checked: layer.checked,
      value: layer.value,
      file: layer.file,
      typeDic: layer.typeDic,
      isDefault: false,
    })),
  }
}

function handleLayerUploadProgress(layerKey: string, progress: UppyUploadProgress) {
  const layer = layerList.value.find(item => item.key === layerKey)
  if (!layer) return
  layer.uploadStatus = 'uploading'
  layer.uploadProgress = progress.percent
}

function markCompletedLayerUploads() {
  for (const layer of layerList.value) {
    const uploaded = wizardSyncState.layerUploads[layer.key]
    if (uploaded && uploaded.fileName === layer.file?.name) {
      layer.uploadStatus = 'uploaded'
      layer.uploadProgress = 100
    }
  }
}

const goNext = async () => {
  if (currentStep.value < steps.length && canGoNext.value) {
    if (currentStep.value === 1) {
      const checkedWithoutFile = layerList.value.find(layer => layer.checked && !layer.file && layer.uploadStatus !== 'uploaded')
      if (checkedWithoutFile) {
        appStore.showNotification({ type: 'warning', message: `请先为 ${checkedWithoutFile.label} 选择图层文件` })
        return
      }

      const unuploadedLayer = layerList.value.find(layer => layer.checked && layer.file && !isLayerUploadComplete(layer))
      if (unuploadedLayer) {
        appStore.showNotification({ type: 'warning', message: `请先点击 ${unuploadedLayer.label} 的“确定”完成上传` })
        return
      }
    }

    if (currentStep.value === 2) {
      const armorResult = collectArmorTypeMappings()
      if (armorResult.error) {
        appStore.showNotification({ type: 'warning', message: armorResult.error })
        return
      }
    }

    if (currentStep.value === 1 || currentStep.value === 2) {
      isProcessing.value = true
      try {
        await saveProjectWizardStep(wizardSyncState, currentStep.value, buildWizardSyncPayload())
        markCompletedLayerUploads()
        appStore.showNotification({
          type: 'success',
          message: currentStep.value === 1 ? '规划项目已保存' : '项目配置已保存',
        })
      } catch (error) {
        appStore.showNotification({
          type: 'error',
          message: `保存当前步骤失败：${(error as Error).message}`,
          duration: 5000,
        })
        isProcessing.value = false
        return
      } finally {
        isProcessing.value = false
      }
    }
    currentStep.value++
  }
}

const goPrev = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const goToStep = (stepId: number) => {
  // 只能跳转到已完成的步骤或当前步骤
  if (stepId <= currentStep.value) {
    currentStep.value = stepId
  }
}

// 文件选择
const layerInputRef = ref<HTMLInputElement | null>(null)
const currentBrowseItem = ref<LayerItem | null>(null)

const handleBrowseLayer = (item: LayerItem) => {
  currentBrowseItem.value = item
  layerInputRef.value?.click()
}

function isLayerUploadComplete(layer: LayerItem): boolean {
  if (layer.uploadStatus === 'uploaded' && !layer.file && layer.value) return true
  const uploaded = wizardSyncState.layerUploads[layer.key]
  return layer.uploadStatus === 'uploaded' && uploaded?.fileName === layer.file?.name
}

function getLayerActionLabel(layer: LayerItem): string {
  if (layer.uploadStatus === 'uploading') return '上传中'
  if (layer.uploadStatus === 'uploaded') return '更换'
  if (layer.uploadStatus === 'error') return '重试'
  return layer.file ? '确定' : '浏览'
}

async function uploadConfirmedLayer(layer: LayerItem) {
  if (!layer.file || layer.uploadStatus === 'uploading') return

  layer.checked = true
  layer.uploadStatus = 'uploading'
  layer.uploadProgress = 0

  try {
    await uploadProjectWizardLayer(wizardSyncState, buildWizardSyncPayload(), {
      key: layer.key,
      label: layer.label,
      checked: layer.checked,
      value: layer.value,
      file: layer.file,
      typeDic: layer.typeDic,
      isDefault: false,
    }, {
      onLayerProgress: handleLayerUploadProgress,
    })
    layer.uploadStatus = 'uploaded'
    layer.uploadProgress = 100
    appStore.showNotification({ type: 'success', message: `图层已上传: ${layer.label}` })
  } catch (error) {
    layer.uploadStatus = 'error'
    appStore.showNotification({
      type: 'error',
      message: `图层上传失败：${(error as Error).message}`,
      duration: 5000,
    })
  }
}

const handleLayerAction = async (item: LayerItem) => {
  if (item.uploadStatus === 'uploading') return
  if (!item.file || item.uploadStatus === 'uploaded') {
    handleBrowseLayer(item)
    return
  }

  await uploadConfirmedLayer(item)
}

function isSupportedLayerFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ['.tif', '.tiff', '.geojson', '.json', '.zip', '.shp'].some(ext => name.endsWith(ext))
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

const handleLayerSelected = async (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0 && currentBrowseItem.value) {
    const file = target.files[0]
    const layer = currentBrowseItem.value

    if (!isSupportedLayerFile(file)) {
      appStore.showNotification({ type: 'warning', message: '仅支持 .tif/.tiff/.geojson/.json/.zip/.shp 图层文件' })
      target.value = ''
      return
    }

    layer.value = file.name
    layer.file = file
    layer.fileSize = file.size
    layer.checked = true
    layer.uploadProgress = 0
    layer.uploadStatus = 'selected'
    appStore.showNotification({ type: 'success', message: `已选择图层文件: ${file.name} (${formatFileSize(file.size)})` })
  }
  target.value = ''
}

// 器件库文件导入
const handleImportDevice = () => {
  deviceFileInputRef.value?.click()
}

const handleDeviceFileSelected = async (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    
    // 统一使用 deviceImportService 解析
    let parsedData: { fiberTypes?: any[]; amplifierTypes?: any[]; branchingUnitTypes?: any[]; equalizerTypes?: any[]; jointBoxTypes?: any[] } | undefined
    
    try {
      const result = await deviceImportService.importFile(file)
      const s = result.summary
      const total = s.fiberCount + s.amplifierCount + s.branchingUnitCount + s.equalizerCount + s.jointCount
      if (result.success && total > 0) {
        parsedData = {
          fiberTypes: result.fiberTypes,
          amplifierTypes: result.amplifierTypes,
          branchingUnitTypes: result.branchingUnitTypes,
          equalizerTypes: result.equalizerTypes,
          jointBoxTypes: result.jointBoxTypes,
        }
        appStore.showNotification({
          type: 'success',
          message: `解析成功：光纤${s.fiberCount}、放大器${s.amplifierCount}、分支器${s.branchingUnitCount}、均衡器${s.equalizerCount}、接头盒${s.jointCount}`
        })
      } else {
        appStore.showNotification({
          type: 'warning',
          message: result.errors[0]?.message || '器件库文件中没有可导入的有效器件',
        })
        target.value = ''
        return
      }
    } catch (err) {
      appStore.showNotification({ type: 'warning', message: `文件解析失败: ${(err as Error).message}` })
      target.value = ''
      return
    }
    
    deviceList.value.push({
      id: `device-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      type: '器件库',
      file: file.name,
      parsedData
    })
  }
  target.value = ''
}

const removeDevice = (id: string) => {
  deviceList.value = deviceList.value.filter(d => d.id !== id)
}

// 提交
const handleSubmit = async () => {
  const armorResult = collectArmorTypeMappings()
  if (armorResult.error) {
    appStore.showNotification({ type: 'warning', message: armorResult.error })
    return
  }

  isProcessing.value = true
  await new Promise(resolve => setTimeout(resolve, 800))

  appStore.showNotification({
    type: 'success',
    message: '项目创建成功'
  })

  isProcessing.value = false
  emit('success', {
    projectType: projectType.value,
    projectName: projectName.value,
    savePath: '',
    allowOtherUsers: allowOtherUsers.value,
    platformProjectId: wizardSyncState.projectId,
    planningMode: planningMode.value,
    startStation: startStation.value,
    endStation: endStation.value,
    // USE文件规范: imported_landing_points
    waypoints: waypoints.value.map(wp => ({
      id: wp.id,
      name: wp.name,
      longitude: wp.longitude,
      latitude: wp.latitude,
      // depth 字段用于区分水下/岸上站点
      depth: wp.isUnderwater ? 100 : 0
    })),
    // USE文件规范: imported_bu_nodes
    buConfigs: buConfigs.value.map(bu => ({
      id: bu.id,
      name: bu.name,
      longitude: bu.longitude,
      latitude: bu.latitude,
      portLimit: Math.min(8, Math.max(2, bu.max_ports || 3))
    })),
    armorTypeMappings: armorResult.mappings,
    planConfig: {
      scope: gisConfig.value.rangeMode === 'manual' ? {
        topLeftLng: parseFloat(gisConfig.value.topLeftLng) || 0,
        topLeftLat: parseFloat(gisConfig.value.topLeftLat) || 0,
        bottomRightLng: parseFloat(gisConfig.value.bottomRightLng) || 0,
        bottomRightLat: parseFloat(gisConfig.value.bottomRightLat) || 0,
      } : null,
      gridResolution: parseFloat(gisConfig.value.gridResolution) || 500,
      enableRedundancy: redundancyConfig.value.enableRedundancy,
    },
    layers: layerList.value.filter(l => l.checked).map(l => ({
      key: l.key,
      label: l.label,
      checked: l.checked,
      value: l.value,
    })),
    devices: deviceList.value,
  })
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <!-- 文件选择器 -->
    <input
      ref="layerInputRef"
      type="file"
      class="hidden"
      accept=".tif,.tiff,.geojson,.json,.zip,.shp"
      @change="handleLayerSelected"
    >
    <input
      ref="deviceFileInputRef"
      type="file"
      class="hidden"
      accept=".json,.csv"
      @change="handleDeviceFileSelected"
    >

    <div
      v-if="visible"
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-300"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-[900px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden transform transition-all scale-100">
        <!-- Header -->
        <div class="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-white">
          <div class="flex items-center gap-3 text-gray-800">
            <div class="p-2 bg-blue-50 rounded-lg text-blue-600">
              <FilePlus class="w-6 h-6" />
            </div>
            <div>
              <h3 class="font-bold text-xl">{{ wizardTitle }}</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ wizardSubtitle }}</p>
            </div>
          </div>
          <button
            class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
            @click="emit('close')"
          >
            <X class="w-6 h-6" />
          </button>
        </div>

        <!-- 步骤条 -->
        <div class="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
          <div class="flex items-center justify-between">
            <template v-for="(step, index) in steps" :key="step.id">
              <div
                class="flex items-center cursor-pointer group relative z-10"
                :class="{ 'opacity-60 grayscale': step.id > currentStep }"
                @click="goToStep(step.id)"
              >
                <div
                  class="flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all shadow-sm"
                  :class="[
                    step.id < currentStep ? 'bg-green-500 border-green-500 text-white shadow-green-200' :
                    step.id === currentStep ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200 ring-4 ring-blue-50' :
                    'bg-white border-gray-200 text-gray-400'
                  ]"
                >
                  <Check v-if="step.id < currentStep" class="w-6 h-6 stroke-[3]" />
                  <component v-else :is="step.icon" class="w-6 h-6" />
                </div>
                <div class="ml-3 hidden sm:block">
                  <p
                    class="text-base font-bold transition-colors"
                    :class="step.id <= currentStep ? 'text-gray-800' : 'text-gray-400'"
                  >
                    {{ step.title }}
                  </p>
                  <p class="text-xs text-gray-400 font-medium">{{ step.description }}</p>
                </div>
              </div>
              <div
                v-if="index < steps.length - 1"
                class="flex-1 h-1 mx-4 rounded-full relative overflow-hidden bg-gray-100"
              >
                <div
                  class="absolute inset-0 bg-green-500 transition-all duration-500 ease-out"
                  :style="{ width: step.id < currentStep ? '100%' : '0%' }"
                ></div>
              </div>
            </template>
          </div>
        </div>

        <!-- Body -->
        <div class="p-8 min-h-[450px] bg-white flex-1 overflow-y-auto custom-scrollbar">
          <!-- 步骤1: 项目基本信息 -->
          <div v-if="currentStep === 1" class="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300">
            <div class="max-w-3xl mx-auto space-y-6">
              <div class="space-y-2">
                <label class="text-sm font-semibold text-gray-700 block">项目类型</label>
                <div class="grid grid-cols-2 gap-4">
                  <div
                    v-for="opt in projectTypeOptions"
                    :key="opt.value"
                    class="relative border-2 rounded-xl p-4 cursor-pointer transition-all hover:border-blue-400"
                    :class="projectType === opt.value ? 'border-blue-600 bg-blue-50/30' : 'border-gray-200'"
                    @click="projectType = opt.value as ProjectType"
                  >
                    <div class="flex items-center gap-3">
                      <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                        :class="projectType === opt.value ? 'border-blue-600' : 'border-gray-300'"
                      >
                        <div v-if="projectType === opt.value" class="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      </div>
                      <span class="font-medium text-gray-800">{{ opt.label }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-semibold text-gray-700 block">项目名称</label>
                <input
                  v-model="projectName"
                  type="text"
                  placeholder="请输入项目名称"
                  class="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-gray-300"
                >
              </div>

              <div class="pt-2">
                <label class="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    v-model="allowOtherUsers"
                    type="checkbox"
                    class="w-5 h-5 cursor-pointer accent-blue-600 rounded"
                  >
                  <div>
                    <span class="text-sm font-medium text-gray-800 block">允许协作</span>
                    <span class="text-xs text-gray-500 block">允许其他用户查看和编辑此项目</span>
                  </div>
                </label>
              </div>

              <div class="border border-gray-200 rounded-xl overflow-hidden">
                <div class="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
                  <div class="flex items-center gap-2 text-gray-800">
                    <MapPin class="w-4 h-4 text-blue-600" />
                    <span class="font-medium text-sm">平台图层与本地 GIS 文件</span>
                    <span class="text-xs text-gray-500 ml-2">
                      {{ layerList.filter(l => l.checked).length > 0 ? `已选 ${layerList.filter(l => l.checked).length} 个图层` : '可选' }}
                    </span>
                  </div>
                </div>

                <div class="p-4 bg-white">
                  <div v-if="layerTypeLoading" class="flex h-16 items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    正在加载图层类型
                  </div>
                  <div v-else-if="layerTypeError" class="flex min-h-16 items-center justify-center text-sm text-red-600">
                    图层类型加载失败：{{ layerTypeError }}
                  </div>
                  <div v-else-if="layerList.length === 0" class="flex h-16 items-center justify-center text-sm text-gray-500">
                    LAYER_TYPE 字典暂无可用项
                  </div>
                  <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div
                      v-for="item in layerList"
                      :key="item.key"
                      class="border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow bg-white group"
                      :class="{ 'ring-1 ring-blue-500/20 border-blue-500': item.checked }"
                    >
                      <div class="flex items-center gap-2 mb-2">
                        <input
                          v-model="item.checked"
                          type="checkbox"
                          :id="item.key"
                          class="w-4 h-4 cursor-pointer accent-blue-600 rounded"
                        >
                        <label :for="item.key" class="font-medium text-gray-700 cursor-pointer select-none text-sm flex-1">{{ item.label }}</label>
                      </div>

                      <div class="flex gap-2 pl-6">
                        <div class="flex-1 relative">
                          <input
                            v-model="item.value"
                            type="text"
                            readonly
                            placeholder="未选择"
                            class="w-full pl-2 pr-6 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 cursor-default focus:outline-none"
                          >
                          <CheckCircle v-if="item.value" class="w-3 h-3 text-green-500 absolute right-1.5 top-2" />
                        </div>
                        <button
                          class="px-2 py-1.5 bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 text-gray-600 text-xs rounded transition-all font-medium shadow-sm whitespace-nowrap"
                          :disabled="item.uploadStatus === 'uploading'"
                          :class="{ 'opacity-60 cursor-not-allowed': item.uploadStatus === 'uploading' }"
                          @click="handleLayerAction(item)"
                        >
                          {{ getLayerActionLabel(item) }}
                        </button>
                      </div>

                      <div v-if="item.value || item.uploadStatus === 'error'" class="pl-6 mt-2 space-y-1">
                        <div class="flex items-center justify-between text-[11px]">
                          <span class="text-gray-500">{{ item.fileSize ? formatFileSize(item.fileSize) : '' }}</span>
                          <span
                            :class="[
                              item.uploadStatus === 'uploaded' ? 'text-green-600' :
                              item.uploadStatus === 'error' ? 'text-red-600' :
                              item.uploadStatus === 'uploading' ? 'text-blue-600' :
                              'text-gray-500'
                            ]"
                          >
                            {{
                              item.uploadStatus === 'uploaded' ? '已上传' :
                              item.uploadStatus === 'error' ? '上传失败' :
                              item.uploadStatus === 'uploading' ? `${item.uploadProgress}%` :
                              '待确认'
                            }}
                          </span>
                        </div>
                        <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            class="h-full rounded-full transition-all"
                            :class="item.uploadStatus === 'error' ? 'bg-red-500' : item.uploadStatus === 'uploaded' ? 'bg-green-500' : 'bg-blue-500'"
                            :style="{ width: `${item.uploadStatus === 'selected' ? 0 : item.uploadProgress}%` }"
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤2: 站点位置与GIS设置 -->
          <div v-if="currentStep === 2" class="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
            <div class="max-w-4xl mx-auto space-y-8">
              <!-- 站点位置设置 -->
              <div>
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2">
                    <div class="p-1.5 bg-blue-50 rounded text-blue-600">
                      <MapPin class="w-4 h-4" />
                    </div>
                    <h4 class="font-semibold text-gray-800">站点位置</h4>
                  </div>

                  <!-- 规划模式切换 -->
                  <div class="bg-gray-100 p-1 rounded-lg inline-flex text-xs font-medium" style="position: relative; z-index: 10;">
                    <div
                      class="px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none"
                      :class="planningMode === 'point-to-point' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
                      @click="setPlanningMode('point-to-point')"
                    >
                      <Route class="w-3.5 h-3.5" />
                      <span>点对点规划</span>
                    </div>
                    <div
                      class="px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none"
                      :class="planningMode === 'multi-point' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
                      @click="setPlanningMode('multi-point')"
                    >
                      <GitCommit class="w-3.5 h-3.5" />
                      <span>多点规划</span>
                    </div>
                  </div>
                </div>

                <!-- 点对点模式界面 -->
                <div v-if="planningMode === 'point-to-point'" class="grid grid-cols-2 gap-6 animate-in fade-in duration-300">
                  <!-- 起点 -->
                  <div class="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-medium text-gray-700">起点设置</span>
                      <div class="flex items-center gap-2">
                        <Button size="sm" variant="outline" class="h-6 px-2 text-xs bg-white" @click="handleMapSelect('start')">
                          <MapPin class="w-3 h-3 mr-1" />
                          地图选点
                        </Button>
                        <span class="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Start</span>
                      </div>
                    </div>
                    <div class="space-y-2">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 w-10">名称</span>
                        <input
                          v-model="startStation.name"
                          type="text"
                          class="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                        >
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 w-10">经度</span>
                        <input
                          v-model.number="startStation.longitude"
                          type="number"
                          step="0.000001"
                          class="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                        >
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 w-10">纬度</span>
                        <input
                          v-model.number="startStation.latitude"
                          type="number"
                          step="0.000001"
                          class="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                        >
                      </div>
                    </div>
                  </div>

                  <!-- 终点 -->
                  <div class="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-medium text-gray-700">终点设置</span>
                      <div class="flex items-center gap-2">
                        <Button size="sm" variant="outline" class="h-6 px-2 text-xs bg-white" @click="handleMapSelect('end')">
                          <MapPin class="w-3 h-3 mr-1" />
                          地图选点
                        </Button>
                        <span class="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">End</span>
                      </div>
                    </div>
                    <div class="space-y-2">
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 w-10">名称</span>
                        <input
                          v-model="endStation.name"
                          type="text"
                          class="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                        >
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 w-10">经度</span>
                        <input
                          v-model.number="endStation.longitude"
                          type="number"
                          step="0.000001"
                          class="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                        >
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500 w-10">纬度</span>
                        <input
                          v-model.number="endStation.latitude"
                          type="number"
                          step="0.000001"
                          class="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                        >
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 多点规划模式界面 -->
                <div v-else class="space-y-3 animate-in fade-in duration-300">
                  <div class="border border-gray-200 rounded-xl overflow-hidden">
                    <div class="bg-gray-50 px-4 py-2 border-b border-gray-200 flex text-xs font-medium text-gray-500">
                      <div class="w-8 text-center">序号</div>
                      <div class="w-28 px-2">站点名称</div>
                      <div class="flex-1 px-2">经度</div>
                      <div class="flex-1 px-2">纬度</div>
                      <div class="w-20 text-center">操作</div>
                    </div>
                    <div class="max-h-[240px] overflow-y-auto">
                      <div
                        v-for="(wp, index) in waypoints"
                        :key="wp.id"
                        class="flex items-center px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                      >
                        <div class="w-8 text-center text-sm text-gray-500">{{ index + 1 }}</div>
                        <div class="w-28 px-2">
                          <input
                            v-model="wp.name"
                            type="text"
                            class="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                          >
                        </div>
                        <div class="flex-1 px-2">
                          <input
                            v-model.number="wp.longitude"
                            type="number"
                            step="0.000001"
                            class="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                          >
                        </div>
                        <div class="flex-1 px-2">
                          <input
                            v-model.number="wp.latitude"
                            type="number"
                            step="0.000001"
                            class="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                          >
                        </div>
                        <div class="w-20 flex justify-center gap-1">
                          <button 
                            type="button"
                            class="h-7 w-7 p-0 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded transition-colors" 
                            title="地图选点" 
                            @click="handleMapSelect('multi-point', wp.id)"
                          >
                            <MapPin class="w-4 h-4" />
                          </button>
                          <button 
                            type="button"
                            class="h-7 w-7 p-0 flex items-center justify-center text-red-500 hover:bg-red-50 rounded transition-colors" 
                            title="删除站点" 
                            @click="removeWaypoint(wp.id)"
                          >
                            <Trash2 class="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="p-2 bg-gray-50 border-t border-gray-200">
                      <Button variant="outline" class="w-full border-dashed text-gray-600 hover:text-blue-600 hover:border-blue-300" @click="addWaypoint">
                        <Plus class="w-4 h-4 mr-2" />
                        添加站点
                      </Button>
                    </div>
                  </div>
                  <p class="text-xs text-gray-500 ml-1">
                    <span class="text-blue-600 font-medium">提示：</span>
                    多点规划至少需要配置 3 个站点，系统将自动在分支点添加分支器连接各个站点。
                  </p>

                  <!-- BU 配置列表 -->
                  <div class="mt-4 border border-orange-200 rounded-xl overflow-hidden">
                    <div class="bg-orange-50 px-4 py-2 border-b border-orange-200 flex items-center justify-between">
                      <span class="text-sm font-medium text-orange-700">分支器（BU）配置</span>
                      <span class="text-xs text-orange-500">可选</span>
                    </div>
                    <div v-if="buConfigs.length > 0">
                      <div class="bg-orange-50/50 px-4 py-1.5 border-b border-orange-100 flex text-xs font-medium text-orange-600">
                        <div class="w-8 text-center">序号</div>
                        <div class="w-24 px-2">名称</div>
                        <div class="flex-1 px-2">经度</div>
                        <div class="flex-1 px-2">纬度</div>
                        <div class="w-20 px-2">最大端口</div>
                        <div class="w-16 text-center">操作</div>
                      </div>
                      <div class="max-h-[160px] overflow-y-auto">
                        <div
                          v-for="(bu, index) in buConfigs"
                          :key="bu.id"
                          class="flex items-center px-4 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50"
                        >
                          <div class="w-8 text-center text-sm text-orange-500">{{ index + 1 }}</div>
                          <div class="w-24 px-2">
                            <input v-model="bu.name" type="text" class="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-orange-500 outline-none" />
                          </div>
                          <div class="flex-1 px-2">
                            <input v-model.number="bu.longitude" type="number" step="0.000001" placeholder="经度" class="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-orange-500 outline-none" />
                          </div>
                          <div class="flex-1 px-2">
                            <input v-model.number="bu.latitude" type="number" step="0.000001" placeholder="纬度" class="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-orange-500 outline-none" />
                          </div>
                          <div class="w-20 px-2">
                            <input v-model.number="bu.max_ports" type="number" min="2" max="8" class="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:border-orange-500 outline-none" />
                          </div>
                          <div class="w-16 flex justify-center gap-1">
                            <button 
                              type="button"
                              class="h-6 w-6 p-0 flex items-center justify-center text-orange-600 hover:bg-orange-50 rounded transition-colors" 
                              title="地图选点" 
                              @click="handleBuMapSelect(bu.id)"
                            >
                              <MapPin class="w-3.5 h-3.5" />
                            </button>
                            <button 
                              type="button"
                              class="h-6 w-6 p-0 flex items-center justify-center text-red-500 hover:bg-red-50 rounded transition-colors" 
                              title="删除" 
                              @click="removeBU(bu.id)"
                            >
                              <Trash2 class="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="p-2 bg-gray-50 border-t border-gray-200">
                      <Button variant="outline" size="sm" class="w-full border-dashed text-orange-600 hover:border-orange-300" @click="addBU">
                        <Plus class="w-3.5 h-3.5 mr-1" />
                        添加分支器
                      </Button>
                    </div>
                  </div>
                  <p class="text-xs text-gray-500 ml-1">
                    <span class="text-orange-600 font-medium">提示：</span>
                    max_ports 为该 BU 节点最大允许的端口数上限，作为路由规划时的分支数量约束。
                  </p>
                </div>
              </div>

              <div class="border-t border-gray-100 my-4"></div>

              <!-- GIS设置 -->
              <div>
                <div class="flex items-center gap-2 mb-3">
                  <div class="p-1.5 bg-blue-50 rounded text-blue-600">
                    <MapPin class="w-4 h-4" />
                  </div>
                  <h4 class="font-semibold text-gray-800">GIS与路由算法设置</h4>
                </div>

                <div class="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-4">
                  <!-- 规划范围设定 -->
                  <div class="space-y-3">
                    <div class="flex items-center gap-2">
                      <label class="text-sm font-bold text-gray-700">规划范围设定</label>
                      <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">限制路由搜索区域</span>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <label
                        class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-white transition-colors"
                        :class="gisConfig.rangeMode === 'auto' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'">
                        <input
                          type="radio"
                          name="rangeMode"
                          value="auto"
                          v-model="gisConfig.rangeMode"
                          class="w-4 h-4 mt-0.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div class="ml-2">
                          <span class="text-sm font-medium text-gray-800 block">自动全图范围</span>
                          <span class="text-xs text-gray-500">使用地图可视区域作为规划范围</span>
                        </div>
                      </label>
                      <label
                        class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-white transition-colors"
                        :class="gisConfig.rangeMode === 'manual' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'">
                        <input
                          type="radio"
                          name="rangeMode"
                          value="manual"
                          v-model="gisConfig.rangeMode"
                          class="w-4 h-4 mt-0.5 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div class="ml-2">
                          <span class="text-sm font-medium text-gray-800 block">手动框选范围</span>
                          <span class="text-xs text-gray-500">自定义矩形区域作为规划边界</span>
                        </div>
                      </label>
                    </div>

                    <!-- 手动框选时显示坐标输入 -->
                    <div v-if="gisConfig.rangeMode === 'manual'" class="bg-white p-3 rounded-lg border border-gray-200">
                      <div class="flex items-end gap-3">
                        <div class="flex-1 grid grid-cols-2 gap-3">
                          <div class="space-y-1">
                            <span class="text-xs font-semibold text-gray-500 uppercase">西北角 (Top-Left)</span>
                            <div class="flex gap-2">
                              <input v-model="gisConfig.topLeftLng" placeholder="经度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
                              <input v-model="gisConfig.topLeftLat" placeholder="纬度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
                            </div>
                          </div>
                          <div class="space-y-1">
                            <span class="text-xs font-semibold text-gray-500 uppercase">东南角 (Bottom-Right)</span>
                            <div class="flex gap-2">
                              <input v-model="gisConfig.bottomRightLng" placeholder="经度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
                              <input v-model="gisConfig.bottomRightLat" placeholder="纬度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" class="h-8 px-3 text-xs bg-white shrink-0" @click="handleMapSelect('range')">
                          <MapPin class="w-3 h-3 mr-1" />
                          地图框选
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div class="border-t border-gray-200 my-2"></div>

                  <!-- 栅格化参数 -->
                  <div class="flex items-center gap-4">
                    <div class="flex-1">
                      <label class="text-sm font-bold text-gray-700 block">栅格化分辨率</label>
                      <span class="text-xs text-gray-500">设置路径规划时的网格粒度，数值越小精度越高但计算越慢</span>
                    </div>
                    <div class="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200">
                      <input v-model="gisConfig.gridResolution" type="number" placeholder="500" class="w-20 h-8 px-2 text-sm text-right border border-gray-200 rounded focus:border-blue-500 outline-none" />
                      <span class="text-sm font-medium text-gray-600">meters</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="border-t border-gray-100 my-4"></div>

              <!-- 海缆铠装风险与成本配置 -->
              <div>
                <div class="mb-4 flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2">
                    <div class="rounded bg-purple-50 p-1.5 text-purple-600">
                      <Package class="h-4 w-4" />
                    </div>
                    <h4 class="font-semibold text-gray-800">海缆铠装配置</h4>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="armorTypeLoading || !!armorTypeError || !canAddArmorTypeMapping"
                    @click="addArmorTypeMapping"
                  >
                    <Plus class="mr-1 h-3.5 w-3.5" />
                    新增
                  </Button>
                </div>

                <div class="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                  <div v-if="armorTypeLoading" class="h-14 flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 class="w-4 h-4 animate-spin" />
                    正在加载铠装类型
                  </div>
                  <div v-else-if="armorTypeError" class="h-14 flex items-center justify-center text-sm text-red-600">
                    铠装类型加载失败：{{ armorTypeError }}
                  </div>
                  <div v-else-if="armorTypeOptions.length === 0" class="h-14 flex items-center justify-center text-sm text-gray-500">
                    ARMORING_TYPE 字典暂无可用项
                  </div>
                  <div v-else-if="armorTypeMappings.length === 0" class="h-14 flex items-center justify-center text-sm text-gray-500">
                    暂无铠装配置
                  </div>
                  <div v-else class="space-y-2">
                    <div v-for="mapping in armorTypeMappings" :key="mapping.id"
                         class="grid grid-cols-1 gap-2 rounded-lg border bg-white px-3 py-2 sm:grid-cols-[minmax(180px,1fr)_140px_170px_32px] sm:items-center">
                      <Select
                        :model-value="mapping.armorTypeCode"
                        :options="getArmorTypeOptions(mapping.id)"
                        placeholder="选择铠装类型"
                        @update:model-value="value => selectArmorType(mapping, value)"
                      />
                      <Select
                        v-model="mapping.riskLevel"
                        :options="armorRiskLevelOptions"
                        placeholder="选择风险等级"
                      />
                      <div class="flex min-w-0 items-center gap-1.5">
                        <input
                          v-model="mapping.unitPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="填写成本"
                          class="h-9 min-w-0 flex-1 rounded border border-gray-200 px-2 text-right text-sm outline-none focus:border-purple-500"
                        />
                        <span class="shrink-0 text-[11px] text-gray-500">千元/km</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-red-500 hover:bg-red-50 hover:text-red-600"
                        title="删除铠装配置"
                        @click="removeArmorTypeMapping(mapping.id)"
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 冗余策略配置 - 仅多点模式 -->
              <div v-if="planningMode === 'multi-point'" class="mt-4">
                <div class="flex items-center gap-2 mb-4">
                  <div class="p-1.5 bg-indigo-50 rounded text-indigo-600">
                    <GitCommit class="w-4 h-4" />
                  </div>
                  <h4 class="font-semibold text-gray-800">冗余策略配置</h4>
                </div>

                <div class="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                  <div class="flex items-center gap-4">
                    <span class="text-sm text-gray-600">启用冗余：</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" v-model="redundancyConfig.enableRedundancy" class="sr-only peer" />
                      <div class="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                    <span class="text-sm text-gray-500">{{ redundancyConfig.enableRedundancy ? '已启用' : '未启用' }}</span>
                  </div>
                  <template v-if="redundancyConfig.enableRedundancy">
                    <!-- 关键节点勾选 -->
                    <div>
                      <span class="text-sm font-medium text-gray-600 block mb-2">关键节点（仅为勾选节点的链路生成备份路径）：</span>
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="wp in waypoints"
                          :key="wp.id"
                          type="button"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-sm"
                          :class="redundancyConfig.criticalNodes.includes(wp.id) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'"
                          @click="toggleCriticalNode(wp.id)"
                        >
                          <MapPin class="w-3.5 h-3.5" />
                          {{ wp.name || wp.id }}
                        </button>
                        <button
                          v-for="bu in buConfigs"
                          :key="bu.id"
                          type="button"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-sm"
                          :class="redundancyConfig.criticalNodes.includes(bu.id) ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'"
                          @click="toggleCriticalNode(bu.id)"
                        >
                          <GitCommit class="w-3.5 h-3.5" />
                          {{ bu.name || bu.id }}
                        </button>
                      </div>
                      <p v-if="redundancyConfig.criticalNodes.length === 0" class="text-xs text-amber-600 mt-1">未勾选则默认为所有节点生成备份</p>
                    </div>
                    <div class="flex items-center gap-4">
                      <span class="text-sm text-gray-600">限制类型：</span>
                      <Select v-model="redundancyConfig.costLimitType" :options="costLimitTypeOptions" class="w-36" />
                    </div>
                    <div class="flex items-center gap-4">
                      <span class="text-sm text-gray-600">{{ redundancyConfig.costLimitType === 'relative' ? '成本增加：' : '成本上限：' }}</span>
                      <input 
                        v-if="redundancyConfig.costLimitType === 'relative'"
                        v-model="redundancyConfig.relativeCostPercent" 
                        type="number" 
                        placeholder="30" 
                        class="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:border-indigo-500 outline-none text-right" 
                      />
                      <input 
                        v-else
                        v-model="redundancyConfig.absoluteCostLimit" 
                        type="number" 
                        placeholder="1000" 
                        class="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:border-indigo-500 outline-none text-right" 
                      />
                      <span class="text-sm text-gray-500">{{ redundancyConfig.costLimitType === 'relative' ? '%' : '万元' }}</span>
                    </div>
                  </template>
                  <p class="text-xs text-gray-500">
                    <span class="text-indigo-600 font-medium">提示：</span>
                    启用后，后端 A* 规划将为勾选的关键节点链路生成地理分离的备份路径。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤3: 器件库管理 -->
          <div v-if="currentStep === 3" class="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
            <div class="max-w-3xl mx-auto text-center py-6" v-if="deviceList.length === 0">
              <div class="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-dashed border-gray-200">
                <Package class="w-10 h-10 text-gray-300" />
              </div>
              <h4 class="text-lg font-semibold text-gray-800 mb-2">暂无器件库数据</h4>
              <p class="text-gray-500 mb-8 max-w-md mx-auto">
                您可以导入现有的器件库文件（JSON/CSV），以便在项目中直接使用器件参数。
              </p>
              <div class="flex justify-center gap-4">
                <Button variant="outline" class="w-32" @click="goNext">跳过</Button>
                <Button class="w-40" @click="handleImportDevice">
                  <Package class="w-4 h-4 mr-2" />
                  导入文件
                </Button>
              </div>
            </div>

            <div v-else class="max-w-3xl mx-auto">
              <div class="flex items-center justify-between mb-6">
                <h4 class="text-lg font-semibold text-gray-800">已导入器件库</h4>
                <Button size="sm" @click="handleImportDevice">
                  <Package class="w-4 h-4 mr-2" />
                  继续导入
                </Button>
              </div>

              <div class="space-y-3">
                <div
                  v-for="device in deviceList"
                  :key="device.id"
                  class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all group"
                >
                  <div class="flex items-center gap-4">
                    <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                      <Package class="w-5 h-5" />
                    </div>
                    <div>
                      <p class="font-semibold text-gray-800">{{ device.name }}</p>
                      <p class="text-sm text-gray-500">{{ device.file }}</p>
                    </div>
                  </div>
                  <button
                    class="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    @click="removeDevice(device.id)"
                  >
                    <X class="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 步骤4: 完成 -->
          <div v-if="currentStep === 4" class="h-full flex flex-col items-center justify-center animate-in zoom-in-95 fade-in duration-500">
            <div class="w-24 h-24 bg-gradient-to-br from-green-100 to-green-50 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-green-100 ring-8 ring-green-50/50">
              <CheckCircle class="w-12 h-12 text-green-600" />
            </div>

            <h3 class="text-2xl font-bold text-gray-800 mb-2">准备就绪！</h3>
            <p class="text-gray-500 mb-8">您的新项目已配置完成，点击下方按钮开始工作。</p>

            <div class="bg-gray-50 rounded-2xl p-6 w-full max-w-md border border-gray-100 space-y-4 shadow-sm">
              <div class="flex justify-between items-center pb-4 border-b border-gray-200">
                <span class="text-gray-500 text-sm">项目名称</span>
                <span class="text-gray-900 font-bold text-lg">{{ projectName }}</span>
              </div>
              <div class="space-y-3">
                <div class="flex justify-between text-sm">
                  <span class="text-gray-500">项目类型</span>
                  <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium border border-blue-100">
                    系统设计 (.use)
                  </span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-500">预加载图层</span>
                  <span class="text-gray-800 font-medium">{{ layerList.filter(l => l.checked).length }} 个图层</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-500">器件库</span>
                  <span class="text-gray-800 font-medium" :class="deviceList.length ? 'text-green-600' : 'text-gray-400'">
                    {{ deviceList.length > 0 ? `已导入 ${deviceList.length} 个文件` : '未导入' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-5 border-t border-gray-100 flex justify-between bg-gray-50/80 backdrop-blur-sm shrink-0">
          <Button
            v-if="canGoPrev"
            variant="outline"
            class="px-6"
            @click="goPrev"
          >
            <ChevronLeft class="w-4 h-4 mr-2" />
            上一步
          </Button>
          <div v-else></div>

          <div class="flex gap-3">
            <Button variant="ghost" class="text-gray-500 hover:text-gray-700" @click="emit('close')">取消</Button>
            <Button
              v-if="!isLastStep"
              :disabled="!canGoNext"
              class="px-8 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200"
              @click="goNext"
            >
              下一步
              <ChevronRight class="w-4 h-4 ml-2" />
            </Button>
            <Button
              v-else
              :disabled="isProcessing"
              class="px-8 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 text-white"
              @click="handleSubmit"
            >
              <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
              {{ isProcessing ? '正在创建...' : '完成创建' }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 地图选点对话框 -->
  <MapSelectDialog
    v-model:visible="showMapSelect"
    :title="mapSelectTitle"
    :mode="mapSelectType === 'range' ? 'range' : 'point'"
    :existing-markers="existingMapMarkers"
    @confirm="handleMapConfirm"
  />

</template>
