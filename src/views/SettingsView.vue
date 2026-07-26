<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { ref, reactive, computed, watch } from 'vue'
import {useRouter, useRoute} from 'vue-router'
import { armorRiskLevelOptions, useSettingsStore } from '@/stores/settings'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { useRouteStore } from '@/stores/route'
import { useCableSegmentStore } from '@/stores/cableSegment'
import { platformPlanConfigApi, platformPointApi } from '@/services/platform/api'
import { normalizePlanPoint } from '@/services/platform/normalizers'
import type { Id, PlanPoint, PlanPointSaveListItem } from '@/services/platform/types'
import {Card, CardContent, Button, Select, Input} from '@/shared/components/base'
import MapSelectDialog from '@/modules/planning/dialogs/MapSelectDialog.vue'
import type { MapMarker } from '@/modules/planning/dialogs/MapSelectDialog.vue'
import type { MapRange } from '@/modules/planning/dialogs/MapSelectDialog.vue'
import {
  MapPin,
  Radio,
  Database,
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
  Edit,
  Loader2,
  Trash2,
  X,
  Anchor,
  ChevronDown,
  ChevronRight,
} from 'lucide-vue-next'
import type {ArmorRiskLevel, ArmorTypeMapping, BUConfig, RedundancyConfig} from '@/stores/settings'
import {
  fiberModelOptions,
  calculationModelOptions
} from '@/config/uiOptions'

const settingsStore = useSettingsStore()
const dictionaryStore = useDictionaryStore()
const appStore = useAppStore()
const routeStore = useRouteStore()
const cableSegmentStore = useCableSegmentStore()
const router = useRouter()
const route = useRoute()
const validTabs = ['route', 'transmission', 'monitoring'] as const
type SettingsTab = typeof validTabs[number]

const activeTab = ref<SettingsTab>('route')

const syncActiveTabFromQuery = () => {
  const tabQuery = route.query.tab as string
  if (!tabQuery) return

  if (validTabs.includes(tabQuery as SettingsTab)) {
    activeTab.value = tabQuery as SettingsTab
  }
}

// 支持通过路由 query 参数切换 tab（如从系统规划跳转过来）
void syncActiveTabFromQuery()

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
const tabs = [
  {id: 'route', label: '路径规划管理'},
  {id: 'transmission', label: '传输与仿真管理'},
  {id: 'monitoring', label: '监控系统管理'},
] as const

const selectTab = (tab: SettingsTab) => {
  activeTab.value = tab
  void router.replace({ query: { ...route.query, tab } })
}

// 弹窗状态
const showMapSelectDialog = ref(false)
const mapSelectType = ref<'start' | 'end' | 'range'>('start')
const mapSelectTitle = ref('地图选点')

// 选项常量
const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'EUR', label: 'EUR' },
]
// 将坐标对象转换为字符串格式
const formatCoord = (point: { lon: number; lat: number }): string => {
  if (point.lon === 0 && point.lat === 0) return ''
  return `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`
}

interface EditableWaypoint {
  id: string
  platformPointId?: Id
  name: string
  coord: string
  isUnderwater: boolean
}

const formatWaypointCoord = (longitude: number, latitude: number): string =>
  Number.isFinite(longitude) && Number.isFinite(latitude) && (longitude !== 0 || latitude !== 0)
    ? `${longitude},${latitude}`
    : ''

// 多点坐标列表 - USE文件规范: imported_landing_points
const waypoints = ref<EditableWaypoint[]>([])

// 初始化多点坐标
const initWaypoints = () => {
  const stored = settingsStore.routePlanningConfig.waypoints || []
  waypoints.value = stored.map(wp => ({
    id: wp.id,
    platformPointId: wp.platformPointId,
    name: wp.name,
    coord: formatWaypointCoord(wp.lon, wp.lat),
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
  if (!window.confirm('修改起点终点将会清空之前的规划结果数据')) return
  if (type === 'start') {
    mapSelectType.value = 'start'
    mapSelectTitle.value = '选择起点坐标'
  } else {
    mapSelectType.value = 'end'
    mapSelectTitle.value = '选择终点坐标'
  }
  showMapSelectDialog.value = true
}

// 地图框选
const handleMapBoxSelect = () => {
  mapSelectType.value = 'range'
  mapSelectTitle.value = '框选规划范围'
  showMapSelectDialog.value = true
}

// 登陆站编辑弹窗
const showWaypointEditDialog = ref(false)
const editingWaypoint = ref<EditableWaypoint | null>(null)
const stationDetailLoading = ref(false)
const stationSaving = ref(false)
const pendingStationIds = ref<Set<string>>(new Set())
const stationCrudPendingBatch = ref(false)

const openWaypointEditDialog = (wp: EditableWaypoint) => {
  editingWaypoint.value = {...wp}
  showWaypointEditDialog.value = true
}

const closeWaypointEditDialog = () => {
  if (stationSaving.value) return
  showWaypointEditDialog.value = false
  editingWaypoint.value = null
}

const normalizePlatformPointId = (value: Id | null | undefined): Id | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return /^[1-9]\d*$/.test(normalized) ? normalized : null
}

const parseStationCoordinate = (coord: string): { longitude: number; latitude: number } | null => {
  const parts = coord.split(',').map(value => Number(value.trim()))
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null
  const [longitude, latitude] = parts
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null
  return { longitude, latitude }
}

const syncWaypointDraftsToSettings = () => {
  settingsStore.updateRoutePlanningConfig({
    waypoints: waypoints.value.map(waypoint => {
      const coordinate = parseStationCoordinate(waypoint.coord)
      return {
        id: waypoint.id,
        platformPointId: waypoint.platformPointId,
        name: waypoint.name,
        lon: coordinate?.longitude ?? 0,
        lat: coordinate?.latitude ?? 0,
        depth: waypoint.isUnderwater ? 100 : 0,
      }
    }),
  })
  settingsStore.saveToLocalStorage()
}

const setStationPending = (id: string, pending: boolean) => {
  const next = new Set(pendingStationIds.value)
  if (pending) next.add(id)
  else next.delete(id)
  pendingStationIds.value = next
}

const isStationPending = (id: string) => pendingStationIds.value.has(id)

const resolveWaypointPlatformPointId = async (waypoint: EditableWaypoint): Promise<Id | null> => {
  const knownId = normalizePlatformPointId(waypoint.platformPointId)
    ?? normalizePlatformPointId(waypoint.id)
  if (knownId != null) {
    waypoint.platformPointId = knownId
    return knownId
  }

  const projectId = appStore.projectState.currentProject?.platformProjectId
  if (projectId == null) return null

  const waypointIndex = waypoints.value.findIndex(item => item.id === waypoint.id)
  const expectedSortNum = waypointIndex >= 0 ? waypointIndex + 1 : null
  const points = await platformPointApi.searchAll({ projectId })
  const candidates = points
    .map(normalizePlanPoint)
    .filter(point => point?.id != null && (expectedSortNum == null || point.sortNum === expectedSortNum))
  const coordinate = parseStationCoordinate(waypoint.coord)
  const exactMatch = coordinate
    ? candidates.find(point => point?.name === waypoint.name
      && point.longitude === coordinate.longitude
      && point.latitude === coordinate.latitude)
    : null
  const matchedPoint = exactMatch ?? (candidates.length === 1 ? candidates[0] : null)
  const resolvedId = normalizePlatformPointId(matchedPoint?.id)
  if (resolvedId != null) waypoint.platformPointId = resolvedId
  return resolvedId
}

// 编辑已持久化站点时，先以详情接口的数据填充弹窗。
const handleEditWaypoint = async (id: string) => {
  const waypoint = waypoints.value.find(item => item.id === id)
  if (!waypoint || isStationPending(id)) return
  openWaypointEditDialog(waypoint)

  const projectId = appStore.projectState.currentProject?.platformProjectId
  if (projectId == null) return

  stationDetailLoading.value = true
  setStationPending(id, true)
  try {
    const pointId = await resolveWaypointPlatformPointId(waypoint)
    if (pointId == null) return
    const detail = normalizePlanPoint(await platformPointApi.detail(pointId))
    if (!detail) throw new Error('站点详情缺少有效坐标')
    if (detail.projectId != null && String(detail.projectId) !== String(projectId)) {
      throw new Error('站点不属于当前项目')
    }
    if (editingWaypoint.value?.id === id) {
      editingWaypoint.value.platformPointId = detail.id
      editingWaypoint.value.name = detail.name || waypoint.name
      editingWaypoint.value.coord = `${detail.longitude},${detail.latitude}`
    }
    waypoint.platformPointId = detail.id
  } catch (error) {
    closeWaypointEditDialog()
    appStore.showNotification({
      type: 'error',
      message: `站点详情加载失败：${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    stationDetailLoading.value = false
    setStationPending(id, false)
  }
}

const saveWaypointEdit = async () => {
  const draft = editingWaypoint.value
  if (!draft || stationSaving.value) return
  const waypoint = waypoints.value.find(item => item.id === draft.id)
  const waypointIndex = waypoints.value.findIndex(item => item.id === draft.id)
  if (!waypoint || waypointIndex < 0) return

  const name = draft.name.trim()
  const coordinate = parseStationCoordinate(draft.coord)
  if (!name) {
    appStore.showNotification({ type: 'warning', message: '请输入站点名称' })
    return
  }
  if (!coordinate) {
    appStore.showNotification({ type: 'warning', message: '站点坐标无效，经度应为 -180~180，纬度应为 -90~90' })
    return
  }

  stationSaving.value = true
  setStationPending(draft.id, true)
  try {
    const projectId = appStore.projectState.currentProject?.platformProjectId
    let platformPointId = normalizePlatformPointId(draft.platformPointId)
    if (projectId != null) {
      platformPointId ??= await resolveWaypointPlatformPointId(waypoint)
      const savedId = await platformPointApi.save({
        ...(platformPointId != null ? { id: platformPointId } : {}),
        projectId,
        name,
        longitude: coordinate.longitude,
        latitude: coordinate.latitude,
        sortNum: waypointIndex + 1,
      })
      platformPointId = normalizePlatformPointId(savedId)
      if (platformPointId == null) throw new Error('保存接口未返回有效站点 ID')
    }

    waypoint.name = name
    waypoint.coord = `${coordinate.longitude},${coordinate.latitude}`
    waypoint.platformPointId = platformPointId ?? waypoint.platformPointId
    stationCrudPendingBatch.value = true
    syncWaypointDraftsToSettings()
    appStore.setProjectDirty(true)
    routeStore.clearParetoRoutes()
    cableSegmentStore.clearSegments()
    showWaypointEditDialog.value = false
    editingWaypoint.value = null
    appStore.showNotification({ type: 'success', message: '站点已保存' })
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `站点保存失败：${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    stationSaving.value = false
    setStationPending(draft.id, false)
  }
}

const handleRemoveWaypoint = async (id: string) => {
  const waypoint = waypoints.value.find(item => item.id === id)
  if (!waypoint || isStationPending(id)) return
  if (!window.confirm(`确定删除站点“${waypoint.name}”吗？`)) return

  setStationPending(id, true)
  try {
    const projectId = appStore.projectState.currentProject?.platformProjectId
    if (projectId != null) {
      const pointId = await resolveWaypointPlatformPointId(waypoint)
      if (pointId != null) {
        const removed = await platformPointApi.remove(pointId)
        if (removed !== true) throw new Error('删除接口返回 false')
      }
    }
    waypoints.value = waypoints.value.filter(item => item.id !== id)
    stationCrudPendingBatch.value = true
    syncWaypointDraftsToSettings()
    appStore.setProjectDirty(true)
    routeStore.clearParetoRoutes()
    cableSegmentStore.clearSegments()
    appStore.showNotification({ type: 'success', message: '站点已删除' })
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `站点删除失败：${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    setStationPending(id, false)
  }
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

// ========== 字典铠装风险与成本配置 ==========
interface ArmorTypeMappingFormItem {
  armorTypeCode: string
  armorTypeName: string
  riskLevel: ArmorRiskLevel | ''
  unitPrice: string
}

const armorTypeMappings = ref<ArmorTypeMappingFormItem[]>([])
const armorTypeLoading = computed(() => dictionaryStore.isLoading(PLATFORM_DICTIONARY_TYPES.armoringType))
const armorTypeError = computed(() => dictionaryStore.getError(PLATFORM_DICTIONARY_TYPES.armoringType))

const syncArmorTypeMappings = (
  stored = settingsStore.routePlanningConfig.armorTypeMappings || [],
) => {
  const storedByCode = new Map(stored.map(mapping => [mapping.armorTypeCode, mapping]))
  armorTypeMappings.value = dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.armoringType).map(item => {
    const armorTypeCode = String(item.code)
    const current = storedByCode.get(armorTypeCode)
    return {
      armorTypeCode,
      armorTypeName: item.name || armorTypeCode,
      riskLevel: current?.riskLevel || '',
      unitPrice: current ? String(current.unitPrice) : '',
    }
  })
}

const collectArmorTypeMappings = (): { mappings: ArmorTypeMapping[]; error: string | null } => {
  const mappings: ArmorTypeMapping[] = []

  for (const row of armorTypeMappings.value) {
    const priceText = row.unitPrice.trim()
    if (!row.riskLevel && priceText === '') continue
    if (!row.riskLevel) return { mappings: [], error: `请为 ${row.armorTypeName} 选择风险等级` }
    if (priceText === '') return { mappings: [], error: `请填写 ${row.armorTypeName} 的成本` }

    const unitPrice = Number(priceText)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { mappings: [], error: `${row.armorTypeName} 的成本必须是非负数` }
    }
    mappings.push({
      armorTypeCode: row.armorTypeCode,
      riskLevel: row.riskLevel,
      unitPrice,
    })
  }

  return { mappings, error: null }
}

const loadArmorTypes = async () => {
  try {
    await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType)
    syncArmorTypeMappings()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `铠装类型字典加载失败：${(error as Error).message}` })
  }
}

syncArmorTypeMappings()
void loadArmorTypes()

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
          platformPointId: wp.platformPointId,
          name: wp.name,
          coord: formatWaypointCoord(wp.lon, wp.lat),
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
      syncArmorTypeMappings(newConfig.armorTypeMappings || [])
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

// 地图选点确认
const handleMapSelectConfirm = async (coord: string) => {
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
  const previousStart = { lon: startPointConfig.lon, lat: startPointConfig.lat }
  const previousEnd = { lon: endPointConfig.lon, lat: endPointConfig.lat }
  let pointChanged = false

  if (mapSelectType.value === 'start') {
    // 点对点模式的起点
    startPointConfig.lon = lon
    startPointConfig.lat = lat
    routeConfig.startCoord = coord
    pointChanged = true
  } else if (mapSelectType.value === 'end') {
    // 点对点模式的终点
    endPointConfig.lon = lon
    endPointConfig.lat = lat
    routeConfig.endCoord = coord
    pointChanged = true
  } else if (mapSelectType.value === 'range') {
    // 范围框选 - 假设返回 "nwLon,nwLat,seLon,seLat" 格式
    const rangeParts = coord.split(',')
    if (rangeParts.length >= 4) {
      const previousRange = {
        nwLon: gisConfig.nwLon,
        nwLat: gisConfig.nwLat,
        seLon: gisConfig.seLon,
        seLat: gisConfig.seLat,
      }
      gisConfig.nwLon = rangeParts[0]?.trim() || ''
      gisConfig.nwLat = rangeParts[1]?.trim() || ''
      gisConfig.seLon = rangeParts[2]?.trim() || ''
      gisConfig.seLat = rangeParts[3]?.trim() || ''
      const projectId = appStore.projectState.currentProject?.platformProjectId
      if (projectId != null) {
        const loadingKey = `save-planning-scope:${projectId}`
        appStore.showGlobalLoading('正在保存规划范围', '正在提交框选范围', loadingKey)
        try {
          await platformPlanConfigApi.saveScope({
            projectId,
            topLeftLng: Number(gisConfig.nwLon),
            topLeftLat: Number(gisConfig.nwLat),
            bottomRightLng: Number(gisConfig.seLon),
            bottomRightLat: Number(gisConfig.seLat),
          })
          settingsStore.updateRoutePlanningConfig({
            rangeMode: 'manual',
            planningRange: {
              northwest: { lon: Number(gisConfig.nwLon), lat: Number(gisConfig.nwLat) },
              southeast: { lon: Number(gisConfig.seLon), lat: Number(gisConfig.seLat) },
            },
          })
          settingsStore.saveToLocalStorage()
          appStore.showNotification({type: 'success', message: '规划范围已保存'})
        } catch (error) {
          gisConfig.nwLon = previousRange.nwLon
          gisConfig.nwLat = previousRange.nwLat
          gisConfig.seLon = previousRange.seLon
          gisConfig.seLat = previousRange.seLat
          appStore.showNotification({
            type: 'error',
            message: `规划范围保存失败：${error instanceof Error ? error.message : String(error)}`,
          })
          return
        } finally {
          appStore.hideGlobalLoading(loadingKey)
        }
      }
    }
    routeConfig.planningRange = coord
  }

  if (pointChanged) {
    const saved = await persistSelectedStartAndEnd()
    if (!saved) {
      startPointConfig.lon = previousStart.lon
      startPointConfig.lat = previousStart.lat
      endPointConfig.lon = previousEnd.lon
      endPointConfig.lat = previousEnd.lat
      routeConfig.startCoord = `${previousStart.lon},${previousStart.lat}`
      routeConfig.endCoord = `${previousEnd.lon},${previousEnd.lat}`
      return
    }
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

  if (routeConfig.mode === 'multi-point') {
    for (const waypoint of waypoints.value) {
      if (showMapSelectDialog.value && waypoint.id === currentWaypointId.value) continue
      const marker = createExistingMarker(waypoint.name || '登陆站', waypoint.coord, '#2563eb')
      if (marker) markers.push(marker)
    }
  }

  for (const bu of buConfigs.value) {
    const marker = createExistingMarker(bu.name || 'BU', bu.coord, '#7c3aed')
    if (marker) markers.push(marker)
  }

  if (!(showMapSelectDialog.value && mapSelectType.value === 'start')) {
    const startMarker = createExistingMarker(startPointConfig.name || '起点', `${startPointConfig.lon},${startPointConfig.lat}`, '#2563eb')
    if (startMarker) markers.push(startMarker)
  }

  if (!(showMapSelectDialog.value && mapSelectType.value === 'end')) {
    const endMarker = createExistingMarker(endPointConfig.name || '终点', `${endPointConfig.lon},${endPointConfig.lat}`, '#16a34a')
    if (endMarker) markers.push(endMarker)
  }

  return markers
})

const requiredRangeMarkers = computed<MapMarker[]>(() => {
  if (routeConfig.mode === 'multi-point') {
    return waypoints.value.flatMap(waypoint => {
      const marker = createExistingMarker(waypoint.name || '登陆站', waypoint.coord, '#2563eb')
      return marker ? [marker] : []
    })
  }

  const markers = [
    createExistingMarker(startPointConfig.name || '起点', `${startPointConfig.lon},${startPointConfig.lat}`, '#2563eb'),
    createExistingMarker(endPointConfig.name || '终点', `${endPointConfig.lon},${endPointConfig.lat}`, '#16a34a'),
  ]
  return markers.filter((marker): marker is MapMarker => marker !== null)
})

const initialPlanningRange = computed<MapRange | null>(() => {
  if (gisConfig.rangeMode !== 'manual') return null
  const range: MapRange = {
    nwLon: Number(gisConfig.nwLon),
    nwLat: Number(gisConfig.nwLat),
    seLon: Number(gisConfig.seLon),
    seLat: Number(gisConfig.seLat),
  }
  return [range.nwLon, range.nwLat, range.seLon, range.seLat].every(Number.isFinite)
    && range.nwLon < range.seLon
    && range.seLat < range.nwLat
    ? range
    : null
})

const closeSettingsWithoutSaving = () => {
  router.push('/planning')
}

const sameStation = (
  current: { name?: string; lon?: number; lat?: number },
  next: { name?: string; lon?: number; lat?: number },
) => current.name === next.name
  && Number(current.lon) === Number(next.lon)
  && Number(current.lat) === Number(next.lat)

const planningRangeContainsStations = (
  range: { northwest: { lon: number; lat: number }; southeast: { lon: number; lat: number } },
  stations: Array<{ lon: number; lat: number }>,
) => stations.every(station => station.lon >= range.northwest.lon
  && station.lon <= range.southeast.lon
  && station.lat <= range.northwest.lat
  && station.lat >= range.southeast.lat)

interface PlatformStationDraft {
  id: string
  platformPointId?: Id
  name: string
  lon: number
  lat: number
  depth?: number
}

const savePlatformStations = async (
  projectId: string | number,
  stations: PlatformStationDraft[],
): Promise<PlanPoint[]> => {
  const existingPoints = (await platformPointApi.searchAll({ projectId }))
    .sort((a, b) => Number(a.sortNum ?? 0) - Number(b.sortNum ?? 0))
  const pointList: PlanPointSaveListItem[] = stations.map((station, index) => {
    const knownId = normalizePlatformPointId(station.platformPointId)
      ?? normalizePlatformPointId(station.id)
    const existingById = knownId == null
      ? null
      : existingPoints.find(point => String(point.id ?? '') === String(knownId))
    const existingPointToPoint = existingById == null && (station.id === 'start' || station.id === 'end')
      ? existingPoints.find(point => Number(point.sortNum) === index + 1)
      : null
    const existingExact = existingById == null && existingPointToPoint == null
      ? existingPoints.find(point => point.name === station.name
        && Number(point.longitude) === station.lon
        && Number(point.latitude) === station.lat)
      : null
    const existing = existingById ?? existingPointToPoint ?? existingExact
    return {
      id: existing?.id,
      name: station.name,
      longitude: station.lon,
      latitude: station.lat,
      sortNum: index + 1,
    }
  })
  const saved = await platformPointApi.saveList({ projectId, pointList })
  if (saved !== true) throw new Error('批量保存接口返回 false')
  return platformPointApi.searchAll({ projectId })
}

const attachPlatformPointIds = <T extends PlatformStationDraft>(
  stations: T[],
  persistedPoints: PlanPoint[],
): Array<T & { platformPointId?: Id }> => {
  const pointsBySort = new Map(
    persistedPoints.map(point => [Number(point.sortNum), normalizePlatformPointId(point.id)]),
  )
  return stations.map((station, index) => ({
    ...station,
    platformPointId: pointsBySort.get(index + 1) ?? station.platformPointId,
  }))
}

const persistSelectedStartAndEnd = async (): Promise<boolean> => {
  const projectId = appStore.projectState.currentProject?.platformProjectId
  const startPoint = {
    name: startPointConfig.name || '起点',
    lon: Number(startPointConfig.lon),
    lat: Number(startPointConfig.lat),
    depth: startPointConfig.isUnderwater ? 100 : 0,
  }
  const endPoint = {
    name: endPointConfig.name || '终点',
    lon: Number(endPointConfig.lon),
    lat: Number(endPointConfig.lat),
    depth: endPointConfig.isUnderwater ? 100 : 0,
  }
  let stations: PlatformStationDraft[] = [
    { id: 'start', ...startPoint },
    { id: 'end', ...endPoint },
  ]

  if (projectId != null) {
    const loadingKey = `save-route-points:${projectId}`
    appStore.showGlobalLoading('正在保存起点终点', '正在查询站点ID并提交修改', loadingKey)
    try {
      const persistedPoints = await savePlatformStations(projectId, stations)
      stations = attachPlatformPointIds(stations, persistedPoints)
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: `站点保存失败：${error instanceof Error ? error.message : String(error)}`,
      })
      return false
    } finally {
      appStore.hideGlobalLoading(loadingKey)
    }
  }

  settingsStore.updateRoutePlanningConfig({
    startPoint,
    endPoint,
    waypoints: stations,
    isConfigured: stations.every(station => Number.isFinite(station.lon) && Number.isFinite(station.lat)),
  })
  settingsStore.saveToLocalStorage()
  routeStore.clearParetoRoutes()
  cableSegmentStore.clearSegments()
  appStore.showNotification({type: 'success', message: '起点终点已保存，原规划结果已清空'})
  return true
}

const handleSave = async (): Promise<boolean> => {
  const armorResult = collectArmorTypeMappings()
  if (armorResult.error) {
    appStore.showNotification({ type: 'warning', message: armorResult.error })
    return false
  }

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
  const invalidWaypoint = routeConfig.mode === 'multi-point'
    ? waypoints.value.find(waypoint => !waypoint.name.trim() || !parseStationCoordinate(waypoint.coord))
    : null
  if (invalidWaypoint) {
    appStore.showNotification({ type: 'warning', message: `站点“${invalidWaypoint.name || '未命名'}”的名称或坐标无效` })
    return false
  }
  const parsedWaypoints = waypoints.value.flatMap(wp => {
    const coordinate = parseStationCoordinate(wp.coord)
    if (!coordinate) return []
    return [{
      id: wp.id,
      platformPointId: wp.platformPointId,
      name: wp.name.trim(),
      lon: coordinate.longitude,
      lat: coordinate.latitude,
      depth: wp.isUnderwater ? 100 : 0  // 水下站点默认水深100m，岸上站点为0
    }]
  })

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
  let finalWaypoints: PlatformStationDraft[] = parsedWaypoints
  if (routeConfig.mode === 'point-to-point') {
    finalWaypoints = [
      {id: 'start', name: startPointConfig.name || '起点', lon: startPoint.lon, lat: startPoint.lat, depth: startPoint.depth},
      {id: 'end', name: endPointConfig.name || '终点', lon: endPoint.lon, lat: endPoint.lat, depth: endPoint.depth}
    ].filter(wp => wp.lon !== 0 || wp.lat !== 0)
  }

  if (gisConfig.rangeMode === 'manual') {
    const rangeIsValid = planningRange.northwest.lon < planningRange.southeast.lon
      && planningRange.northwest.lat > planningRange.southeast.lat
    if (!rangeIsValid) {
      appStore.showNotification({type: 'warning', message: '规划范围坐标无效，请重新框选'})
      return false
    }
    if (!planningRangeContainsStations(planningRange, finalWaypoints)) {
      appStore.showNotification({type: 'warning', message: '规划范围必须包含所有站点，请重新框选'})
      return false
    }
  }

  const originalConfig = settingsStore.routePlanningConfig
  const stationChanged = stationCrudPendingBatch.value
    || routeConfig.mode !== originalConfig.mode
    || finalWaypoints.length !== (originalConfig.waypoints?.length ?? 0)
    || (routeConfig.mode === 'point-to-point'
      ? !sameStation(originalConfig.startPoint, startPoint) || !sameStation(originalConfig.endPoint, endPoint)
      : finalWaypoints.some((station, index) => !sameStation(originalConfig.waypoints?.[index] ?? {}, station)))

  if (stationChanged && !window.confirm('修改起点终点将会清空之前的规划结果数据')) {
    return false
  }

  const platformProjectId = appStore.projectState.currentProject?.platformProjectId
  if (platformProjectId != null && stationChanged) {
    try {
      const persistedPoints = await savePlatformStations(platformProjectId, finalWaypoints)
      finalWaypoints = attachPlatformPointIds(finalWaypoints, persistedPoints)
      if (routeConfig.mode === 'multi-point') {
        const idsByLocalId = new Map(finalWaypoints.map(point => [point.id, point.platformPointId]))
        waypoints.value = waypoints.value.map(point => ({
          ...point,
          platformPointId: idsByLocalId.get(point.id) ?? point.platformPointId,
        }))
      }
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: `站点保存失败：${error instanceof Error ? error.message : String(error)}`,
      })
      return false
    }
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
    armorTypeMappings: armorResult.mappings,
    redundancyConfig: parsedRedundancyConfig,
    isConfigured,
  })
  stationCrudPendingBatch.value = false

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
    model: fiberConfig.model,
  })

  settingsStore.saveToLocalStorage()
  if (stationChanged) {
    routeStore.clearParetoRoutes()
    cableSegmentStore.clearSegments()
  }
  appStore.showNotification({type: 'success', message: '设置已保存'})
  return true
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
            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">设置管理</h2>
            <p class="text-gray-500 dark:text-gray-400">请先创建或打开项目后，再进行设置管理</p>
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
            <h2 class="font-bold text-gray-800 text-lg">设置管理</h2>
            <p class="text-xs text-gray-500 mt-1">配置路径规划与监控系统</p>
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
                  @click="selectTab(tab.id)">
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
        <!-- 路径规划管理 -->
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
                        <tr v-for="wp in waypoints" :key="wp.id" class="hover:bg-gray-50 transition-colors">
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
                                title="加载详情并编辑"
                                :disabled="isStationPending(wp.id)"
                                @click="handleEditWaypoint(wp.id)"
                              >
                                <Loader2 v-if="isStationPending(wp.id)" class="w-4 h-4 animate-spin"/>
                                <Edit v-else class="w-4 h-4"/>
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
                                :disabled="isStationPending(wp.id)"
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
                        <tr v-for="bu in buConfigs" :key="bu.id"
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

          <!-- 海缆铠装类型 -->
          <Card>
            <CardContent class="p-5">
              <div
                  class="flex items-center justify-between cursor-pointer select-none pb-3 border-b mb-4 group"
                  @click="togglePanel('armorMapping')"
              >
                <h3 class="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">▼
                  海缆铠装类型</h3>
                <component :is="expandedPanels.armorMapping ? ChevronDown : ChevronRight"
                           class="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors"/>
              </div>
              <div v-show="expandedPanels.armorMapping" class="space-y-4">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-semibold text-gray-700">风险等级与成本</label>
                  <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">平台字典</span>
                </div>

                <!-- 铠装映射列表 -->
                <div class="space-y-3">
                  <div v-if="armorTypeLoading" class="h-20 flex items-center justify-center text-sm text-gray-500">
                    正在加载铠装类型
                  </div>
                  <div v-else-if="armorTypeError" class="h-20 flex items-center justify-center text-sm text-red-600">
                    铠装类型加载失败：{{ armorTypeError }}
                  </div>
                  <div v-else-if="armorTypeMappings.length === 0" class="h-20 flex items-center justify-center text-sm text-gray-500">
                    ARMORING_TYPE 字典暂无可用项
                  </div>
                  <div v-else class="space-y-3">
                    <div v-for="mapping in armorTypeMappings" :key="mapping.armorTypeCode"
                         class="grid grid-cols-1 gap-3 rounded-lg border bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_160px_190px] sm:items-center">
                      <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-gray-800">{{ mapping.armorTypeName }}</div>
                        <div class="text-xs font-mono text-gray-400">{{ mapping.armorTypeCode }}</div>
                      </div>
                      <Select
                        v-model="mapping.riskLevel"
                        :options="armorRiskLevelOptions"
                        placeholder="选择风险等级"
                      />
                      <div class="flex min-w-0 items-center gap-2">
                        <Input
                          v-model="mapping.unitPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="填写成本"
                          class="min-w-0 flex-1 text-right"
                        />
                        <span class="shrink-0 text-xs text-gray-500">千元/km</span>
                      </div>
                    </div>
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

        <!-- 监控系统管理 -->
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

      </CardContent>
    </Card>
  </div>

  <!-- 地图选点弹窗 -->
  <MapSelectDialog
    v-model:visible="showMapSelectDialog" 
    :title="mapSelectTitle" 
    :mode="mapSelectType === 'range' ? 'range' : 'point'"
    :existing-markers="existingMapMarkers"
    :required-markers="requiredRangeMarkers"
    :initial-range="initialPlanningRange"
    @confirm="handleMapSelectConfirm"
  />

  <!-- 编辑登陆站弹窗 -->
  <Teleport to="body">
    <div v-if="showWaypointEditDialog && editingWaypoint" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeWaypointEditDialog"/>
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[400px]">
        <div class="px-5 py-3 border-b">
          <h3 class="font-bold text-gray-800 dark:text-gray-100 text-center">编辑登陆站</h3>
        </div>
        <div class="p-5 space-y-4">
          <div class="flex items-center gap-3">
            <label class="w-20 text-sm text-gray-600 dark:text-gray-400 text-right">站点名称：</label>
            <Input v-model="editingWaypoint.name" :disabled="stationDetailLoading || stationSaving"
                   class="flex-1" placeholder="请输入站点名称"/>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-20 text-sm text-gray-600 dark:text-gray-400 text-right">经度：</label>
            <Input :model-value="getCoordLon(editingWaypoint.coord)"
                   :disabled="stationDetailLoading || stationSaving"
                   @update:model-value="setCoordLon(editingWaypoint, $event)" class="flex-1" placeholder="如：121.4737"/>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-20 text-sm text-gray-600 dark:text-gray-400 text-right">纬度：</label>
            <Input :model-value="getCoordLat(editingWaypoint.coord)"
                   :disabled="stationDetailLoading || stationSaving"
                   @update:model-value="setCoordLat(editingWaypoint, $event)" class="flex-1" placeholder="如：31.2304"/>
          </div>
          <div class="flex justify-center">
            <Button size="sm" variant="outline" :disabled="stationDetailLoading || stationSaving"
                    @click="handleWaypointMapSelect(editingWaypoint.id)">
              <MapPin class="w-3.5 h-3.5 mr-1"/>
              地图选点
            </Button>
          </div>
        </div>
        <div class="flex justify-center gap-4 p-4 border-t">
          <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6"
                  :disabled="stationDetailLoading || stationSaving" @click="saveWaypointEdit">
            <Loader2 v-if="stationDetailLoading || stationSaving" class="w-4 h-4 mr-2 animate-spin"/>
            {{ stationDetailLoading ? '加载中' : stationSaving ? '保存中' : '保存' }}
          </Button>
          <Button variant="outline" class="px-6" :disabled="stationSaving" @click="closeWaypointEditDialog">取消</Button>
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
