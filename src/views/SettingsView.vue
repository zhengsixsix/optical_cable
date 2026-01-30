<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useSettingsStore, useAppStore } from '@/stores'
import { Card, CardContent, Button, Select, Input } from '@/shared/components/base'
import MapSelectDialog from '@/modules/planning/dialogs/MapSelectDialog.vue'
import { Save, RotateCcw, MapPin, Radio, Activity, Database, Cable, Zap, GitBranch, Waves, Server, AlertTriangle, Plus, Trash2, Upload, Download, X, Edit, FolderOpen, FilePlus } from 'lucide-vue-next'
import type { FiberType, AmplifierType, BranchingUnitType } from '@/types'
import {
  fiberModelOptions,
  planningModeOptions,
  dataSourceOptions,
  calculationModelOptions
} from '@/data/mockData'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const activeTab = ref('equipment')

// 检查是否已打开项目
const hasOpenProject = computed(() => appStore.hasOpenProject)

// 打开新建项目对话框
const handleNewProject = () => {
  appStore.openDialog('new-project')
}

// 打开导入项目对话框
const handleOpenProject = () => {
  appStore.openDialog('open-project')
}
const deviceTypeTab = ref('fiber')

const tabs = [
  { id: 'equipment', label: '器件库配置' },
  { id: 'route', label: '路径规划配置' },
  { id: 'transmission', label: '传输系统配置' },
  { id: 'monitoring', label: '监控系统配置' },
]

// 弹窗状态
const showAddFiberDialog = ref(false)
const showAddAmplifierDialog = ref(false)
const showAddBranchingDialog = ref(false)
const showMapSelectDialog = ref(false)
const mapSelectType = ref<'start' | 'end' | 'range'>('start')
const mapSelectTitle = ref('地图选点')

// 光纤表单
const newFiber = reactive<Omit<FiberType, 'id'>>({
  name: '',
  nonlinearCoeff: 0,
  effectiveArea: 0,
  dispersion: 0,
  nonlinearRefractiveIndex: 0,
  attenuationCoeff: 0,
  secondOrderDispersion: 0,
  simulationModel: 'GN',
})

// 放大器表单
const newAmplifier = reactive<Omit<AmplifierType, 'id'>>({
  name: '',
  gain: 0,
  bandwidth: 0,
  gainFlatness: 0,
  noiseFigure: 0,
  pumpPower: 0,
  outputPower: 0,
  gainRangePower: 0,
})

// 分支器表单
const newBranching = reactive<Omit<BranchingUnitType, 'id'>>({
  name: '',
  portCount: 0,
  trunkInsertionLoss: 0,
  branchInsertionLoss: 0,
  insertionLoss: 0,
  wavelengthRange: 0,
})

// 添加光纤类型
const handleAddFiber = () => {
  if (!newFiber.name) {
    appStore.showNotification({ type: 'warning', message: '请输入光纤类型名称' })
    return
  }
  settingsStore.addFiberType({
    id: `fiber-${Date.now()}`,
    ...newFiber,
  })
  showAddFiberDialog.value = false
  Object.assign(newFiber, {
    name: '', nonlinearCoeff: 0, effectiveArea: 0, dispersion: 0,
    nonlinearRefractiveIndex: 0, attenuationCoeff: 0, secondOrderDispersion: 0, simulationModel: 'GN',
  })
  appStore.showNotification({ type: 'success', message: '光纤类型已添加' })
}

// 删除光纤类型
const handleDeleteFiber = (id: string) => {
  settingsStore.removeFiberType(id)
  appStore.showNotification({ type: 'info', message: '光纤类型已删除' })
}

// 添加放大器类型
const handleAddAmplifier = () => {
  if (!newAmplifier.name) {
    appStore.showNotification({ type: 'warning', message: '请输入放大器类型名称' })
    return
  }
  settingsStore.addAmplifierType({
    id: `amp-${Date.now()}`,
    ...newAmplifier,
  })
  showAddAmplifierDialog.value = false
  Object.assign(newAmplifier, {
    name: '', gain: 0, bandwidth: 0, gainFlatness: 0,
    noiseFigure: 0, pumpPower: 0, outputPower: 0, gainRangePower: 0,
  })
  appStore.showNotification({ type: 'success', message: '放大器类型已添加' })
}

// 删除放大器类型
const handleDeleteAmplifier = (id: string) => {
  settingsStore.removeAmplifierType(id)
  appStore.showNotification({ type: 'info', message: '放大器类型已删除' })
}

// 添加分支器类型
const handleAddBranching = () => {
  if (!newBranching.name) {
    appStore.showNotification({ type: 'warning', message: '请输入分支器类型名称' })
    return
  }
  settingsStore.addBranchingUnitType({
    id: `bu-${Date.now()}`,
    ...newBranching,
  })
  showAddBranchingDialog.value = false
  Object.assign(newBranching, { name: '', portCount: 0, insertionLoss: 0, wavelengthRange: 0 })
  appStore.showNotification({ type: 'success', message: '分支器类型已添加' })
}

// 删除分支器类型
const handleDeleteBranching = (id: string) => {
  settingsStore.removeBranchingUnitType(id)
  appStore.showNotification({ type: 'info', message: '分支器类型已删除' })
}

// 导入器件库
const handleImportLibrary = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.csv'
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const lines = text.split('\n').map(line => line.trim()).filter(line => line)
      
      let currentSection = ''
      let headers: string[] = []
      const fiberTypes: any[] = []
      const amplifierTypes: any[] = []
      const branchingUnitTypes: any[] = []
      
      for (const line of lines) {
        // 检测分区标记
        if (line.startsWith('[') && line.endsWith(']')) {
          currentSection = line.slice(1, -1)
          headers = []
          continue
        }
        
        const values = line.split(',').map(v => v.trim())
        
        // 第一行是表头
        if (headers.length === 0) {
          headers = values
          continue
        }
        
        // 解析数据行
        const row: Record<string, any> = {}
        headers.forEach((h, i) => {
          const val = values[i] || ''
          // 数字字段转换
          row[h] = isNaN(Number(val)) ? val : Number(val)
        })
        
        if (currentSection === 'FiberTypes' && row.name) {
          fiberTypes.push({
            id: `fiber-${Date.now()}-${fiberTypes.length}`,
            name: row.name,
            nonlinearCoeff: row.nonlinearCoeff || 0,
            effectiveArea: row.effectiveArea || 0,
            dispersion: row.dispersion || 0,
            nonlinearRefractiveIndex: row.nonlinearRefractiveIndex || 0,
            attenuationCoeff: row.attenuationCoeff || 0,
            secondOrderDispersion: row.secondOrderDispersion || 0,
            simulationModel: row.simulationModel || 'GN',
          })
        } else if (currentSection === 'AmplifierTypes' && row.name) {
          amplifierTypes.push({
            id: `amp-${Date.now()}-${amplifierTypes.length}`,
            name: row.name,
            gain: row.gain || 0,
            bandwidth: row.bandwidth || 0,
            gainFlatness: row.gainFlatness || 0,
            noiseFigure: row.noiseFigure || 0,
            pumpPower: row.pumpPower || 0,
            outputPower: row.outputPower || 0,
            gainRangePower: row.gainRangePower || 0,
          })
        } else if (currentSection === 'BranchingUnitTypes' && row.name) {
          branchingUnitTypes.push({
            id: `bu-${Date.now()}-${branchingUnitTypes.length}`,
            name: row.name,
            portCount: row.portCount || 0,
            insertionLoss: row.insertionLoss || 0,
            wavelengthRange: row.wavelengthRange || 0,
          })
        }
      }
      
      // 更新 store
      fiberTypes.forEach(f => settingsStore.addFiberType(f))
      amplifierTypes.forEach(a => settingsStore.addAmplifierType(a))
      branchingUnitTypes.forEach(b => settingsStore.addBranchingUnitType(b))
      settingsStore.currentLibraryFile = file.name
      
      const total = fiberTypes.length + amplifierTypes.length + branchingUnitTypes.length
      appStore.showNotification({ 
        type: 'success', 
        message: `器件库导入成功：光纤${fiberTypes.length}种，放大器${amplifierTypes.length}种，分支器${branchingUnitTypes.length}种` 
      })
    } catch (err) {
      appStore.showNotification({ type: 'error', message: 'CSV文件解析失败' })
    }
  }
  input.click()
}

// 导出器件库
const handleExportLibrary = () => {
  const data = {
    fiberTypes: settingsStore.fiberTypes,
    amplifierTypes: settingsStore.amplifierTypes,
    branchingUnitTypes: settingsStore.branchingUnitTypes,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'device-library.csv'
  a.click()
  URL.revokeObjectURL(url)
  appStore.showNotification({ type: 'success', message: '器件库已导出' })
}

// 将坐标对象转换为字符串格式
const formatCoord = (point: { lon: number; lat: number }): string => {
  if (point.lon === 0 && point.lat === 0) return ''
  return `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`
}

// 多点坐标列表
const waypoints = ref<Array<{ id: string; name: string; coord: string }>>([])

// 初始化多点坐标
const initWaypoints = () => {
  const stored = settingsStore.routePlanningConfig.waypoints || []
  waypoints.value = stored.map(wp => ({
    id: wp.id,
    name: wp.name,
    coord: wp.lon && wp.lat ? `${wp.lon},${wp.lat}` : ''
  }))
}
initWaypoints()

// 添加多点坐标
const handleAddWaypoint = () => {
  waypoints.value.push({
    id: `wp-${Date.now()}`,
    name: `登陆站${waypoints.value.length + 1}`,
    coord: ''
  })
}

// 删除多点坐标
const handleRemoveWaypoint = (id: string) => {
  waypoints.value = waypoints.value.filter(wp => wp.id !== id)
}

// 多点地图选点
const currentWaypointId = ref<string | null>(null)
const handleWaypointMapSelect = (id: string) => {
  currentWaypointId.value = id
  mapSelectType.value = 'start' // 复用 start 类型
  mapSelectTitle.value = '选择登陆站坐标'
  showMapSelectDialog.value = true
}

const routeConfig = reactive({
  mode: settingsStore.routePlanningConfig.mode,
  // 点对点模式坐标 - 从 settingsStore 获取已有配置
  startCoord: formatCoord(settingsStore.routePlanningConfig.startPoint),
  endCoord: formatCoord(settingsStore.routePlanningConfig.endPoint),
  // 多点模式文件
  multiPointFile: settingsStore.routePlanningConfig.multiPointFile || '',
  // GIS设置
  planningRange: '',
  gridSize: '',
  // 路径规划成本参数
  lightCableCost: settingsStore.costFactors.lightCableCost?.toString() || '',
  heavyCableCost: settingsStore.costFactors.heavyCableCost?.toString() || '',
  maxConstructionCost: settingsStore.costFactors.maxConstructionCost?.toString() || '',
  depthThreshold: settingsStore.costFactors.depthThreshold?.toString() || '',
  // 系统规划成本参数
  cableCostPerKm: settingsStore.costFactors.cableCostPerKm?.toString() || '',
  installationCostPerKm: settingsStore.costFactors.installationCostPerKm?.toString() || '',
  repeaterCost: settingsStore.costFactors.repeaterCost?.toString() || '',
  branchingUnitCost: settingsStore.costFactors.branchingUnitCost?.toString() || '',
  landingStationCost: settingsStore.costFactors.landingStationCost?.toString() || '',
})

// 监听 settingsStore 的变化，同步更新 routeConfig（当导入项目后自动更新）
watch(
  () => settingsStore.routePlanningConfig,
  (newConfig) => {
    routeConfig.mode = newConfig.mode
    routeConfig.startCoord = formatCoord(newConfig.startPoint)
    routeConfig.endCoord = formatCoord(newConfig.endPoint)
    routeConfig.multiPointFile = newConfig.multiPointFile || ''
    // 同步多点坐标
    if (newConfig.waypoints) {
      waypoints.value = newConfig.waypoints.map(wp => ({
        id: wp.id,
        name: wp.name,
        coord: wp.lon && wp.lat ? `${wp.lon},${wp.lat}` : ''
      }))
    }
  },
  { deep: true }
)

// 监听 costFactors 变化，同步更新成本参数
watch(
  () => settingsStore.costFactors,
  (newCostFactors) => {
    // 路径规划成本
    routeConfig.lightCableCost = newCostFactors.lightCableCost?.toString() || ''
    routeConfig.heavyCableCost = newCostFactors.heavyCableCost?.toString() || ''
    routeConfig.maxConstructionCost = newCostFactors.maxConstructionCost?.toString() || ''
    routeConfig.depthThreshold = newCostFactors.depthThreshold?.toString() || ''
    // 系统规划成本
    routeConfig.cableCostPerKm = newCostFactors.cableCostPerKm?.toString() || ''
    routeConfig.installationCostPerKm = newCostFactors.installationCostPerKm?.toString() || ''
    routeConfig.repeaterCost = newCostFactors.repeaterCost?.toString() || ''
    routeConfig.branchingUnitCost = newCostFactors.branchingUnitCost?.toString() || ''
    routeConfig.landingStationCost = newCostFactors.landingStationCost?.toString() || ''
  },
  { deep: true }
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
    appStore.showNotification({ type: 'success', message: `坐标已选择: ${coord}` })
    return
  }
  
  if (mapSelectType.value === 'start') {
    routeConfig.startCoord = coord
  } else if (mapSelectType.value === 'end') {
    routeConfig.endCoord = coord
  } else if (mapSelectType.value === 'range') {
    routeConfig.planningRange = coord
  }
  appStore.showNotification({ type: 'success', message: `坐标已选择: ${coord}` })
}

// 浏览多点文件
const handleBrowseMultiPointFile = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.csv,.txt,.json'
  input.onchange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      routeConfig.multiPointFile = file.name
      appStore.showNotification({ type: 'success', message: `已选择文件: ${file.name}` })
    }
  }
  input.click()
}

const transConfig = reactive({
  channelCount: settingsStore.transmissionConfig.channelCount,
  centerWavelength: settingsStore.transmissionConfig.centerWavelength,
  channelBandwidth: settingsStore.transmissionConfig.channelBandwidth,
  models: [...settingsStore.transmissionConfig.calculationModels],
})

const monitorConfig = reactive({
  dataSourceType: settingsStore.monitoringConfig.dataSourceType,
  connectionAddress: settingsStore.monitoringConfig.connectionAddress,
  authToken: settingsStore.monitoringConfig.authToken,
  powerThreshold: settingsStore.monitoringConfig.powerThreshold,
  temperatureThreshold: settingsStore.monitoringConfig.temperatureThreshold,
  berThreshold: settingsStore.monitoringConfig.berThreshold,
})

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
    return { lon: parts[0], lat: parts[1] }
  }
  return { lon: 0, lat: 0 }
}

const handleSave = () => {
  // 解析用户输入的起点终点坐标
  const startPoint = parseCoordString(routeConfig.startCoord)
  const endPoint = parseCoordString(routeConfig.endCoord)
  
  // 检查起点终点是否有效配置
  const isStartValid = startPoint.lon !== 0 || startPoint.lat !== 0
  const isEndValid = endPoint.lon !== 0 || endPoint.lat !== 0
  
  // 解析多点坐标
  const parsedWaypoints = waypoints.value.map(wp => {
    const coord = parseCoordString(wp.coord)
    return {
      id: wp.id,
      name: wp.name,
      lon: coord.lon,
      lat: coord.lat
    }
  }).filter(wp => wp.lon !== 0 || wp.lat !== 0) // 过滤无效坐标
  
  // 多点模式下检查是否配置了足够的点
  const isMultiPointConfigured = routeConfig.mode === 'multi-point' && parsedWaypoints.length >= 3
  const isConfigured = routeConfig.mode === 'point-to-point' ? (isStartValid && isEndValid) : isMultiPointConfigured
  
  // 路径规划配置保存
  settingsStore.updateRoutePlanningConfig({
    mode: routeConfig.mode as 'point-to-point' | 'multi-point',
    startPoint,
    endPoint,
    planningRange: {
      northwest: { lon: 0, lat: 0 },
      southeast: { lon: 0, lat: 0 },
    },
    multiPointFile: routeConfig.multiPointFile,
    waypoints: parsedWaypoints,
    isConfigured,
  })

  settingsStore.updateTransmissionConfig({
    channelCount: transConfig.channelCount,
    centerWavelength: transConfig.centerWavelength,
    channelBandwidth: transConfig.channelBandwidth,
    calculationModels: [...transConfig.models],
  })

  settingsStore.updateMonitoringConfig({
    dataSourceType: monitorConfig.dataSourceType as 'realtime' | 'history',
    connectionAddress: monitorConfig.connectionAddress,
    authToken: monitorConfig.authToken,
    powerThreshold: monitorConfig.powerThreshold,
    temperatureThreshold: monitorConfig.temperatureThreshold,
    berThreshold: monitorConfig.berThreshold,
  })

  settingsStore.updateFiberSimulationConfig({
    model: fiberConfig.model as 'GN' | 'EGN',
  })

  // 保存成本参数
  settingsStore.updateCostFactors({
    // 路径规划成本
    lightCableCost: routeConfig.lightCableCost ? parseFloat(routeConfig.lightCableCost) : undefined,
    heavyCableCost: routeConfig.heavyCableCost ? parseFloat(routeConfig.heavyCableCost) : undefined,
    maxConstructionCost: routeConfig.maxConstructionCost ? parseFloat(routeConfig.maxConstructionCost) : undefined,
    depthThreshold: routeConfig.depthThreshold ? parseFloat(routeConfig.depthThreshold) : undefined,
    // 系统规划成本
    cableCostPerKm: routeConfig.cableCostPerKm ? parseFloat(routeConfig.cableCostPerKm) : undefined,
    installationCostPerKm: routeConfig.installationCostPerKm ? parseFloat(routeConfig.installationCostPerKm) : undefined,
    repeaterCost: routeConfig.repeaterCost ? parseFloat(routeConfig.repeaterCost) : undefined,
    branchingUnitCost: routeConfig.branchingUnitCost ? parseFloat(routeConfig.branchingUnitCost) : undefined,
    landingStationCost: routeConfig.landingStationCost ? parseFloat(routeConfig.landingStationCost) : undefined,
  })

  settingsStore.saveToLocalStorage()
  appStore.showNotification({ type: 'success', message: '设置已保存' })
}

const handleReset = () => {
  settingsStore.resetToDefaults()
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
  appStore.showNotification({ type: 'info', message: '已重置为默认设置' })
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden p-4">
    <!-- 未打开项目时显示提示 -->
    <div v-if="!hasOpenProject" class="h-full flex items-center justify-center">
      <Card class="w-[500px] p-8">
        <div class="text-center space-y-6">
          <div class="w-20 h-20 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <AlertTriangle class="w-10 h-10 text-amber-500" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">工程设置</h2>
            <p class="text-gray-500 dark:text-gray-400">请先创建或导入项目后，再进行工程设置</p>
          </div>
          <div class="flex justify-center gap-4">
            <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6" @click="handleNewProject">
              <FilePlus class="w-4 h-4 mr-2" />
              新建项目
            </Button>
            <Button variant="outline" class="px-6" @click="handleOpenProject">
              <FolderOpen class="w-4 h-4 mr-2" />
              导入项目
            </Button>
          </div>
        </div>
      </Card>
    </div>

    <!-- 已打开项目时显示设置内容 -->
    <Card v-else class="flex-1 flex overflow-hidden">
      <!-- 左侧菜单 -->
      <div class="w-56 bg-gray-50 border-r flex-shrink-0 flex flex-col">
        <div class="p-4 border-b bg-white">
          <h2 class="font-bold text-gray-800 text-lg">工程设置</h2>
          <p class="text-xs text-gray-500 mt-1">配置系统参数和器件库</p>
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
            <Save class="w-4 h-4 mr-2" />
            保存设置
          </Button>
          <Button variant="outline" class="w-full" @click="handleReset">
            <RotateCcw class="w-4 h-4 mr-2" />
            重置默认
          </Button>
        </div>
      </div>

      <!-- 右侧内容区 -->
      <CardContent class="flex-1 overflow-y-auto p-6">
        <!-- 路径规划配置 -->
        <div v-if="activeTab === 'route'" class="space-y-6">
          <!-- 站点位置 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">站点位置</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <label class="w-20 text-sm text-gray-600 text-right shrink-0">规划模式：</label>
                  <Select v-model="routeConfig.mode" :options="planningModeOptions" class="flex-1" />
                </div>

                <!-- 点对点模式 -->
                <template v-if="routeConfig.mode === 'point-to-point'">
                  <div class="flex items-center gap-4">
                    <label class="w-20 text-sm text-gray-600 text-right shrink-0">起点坐标：</label>
                    <Input v-model="routeConfig.startCoord" placeholder="经度,纬度" class="flex-1" />
                    <Button size="sm" variant="outline" @click="handleMapSelect('起点')">地图选点</Button>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-20 text-sm text-gray-600 text-right shrink-0">终点坐标：</label>
                    <Input v-model="routeConfig.endCoord" placeholder="经度,纬度" class="flex-1" />
                    <Button size="sm" variant="outline" @click="handleMapSelect('终点')">地图选点</Button>
                  </div>
                </template>

                <!-- 多点规划模式 -->
                <template v-if="routeConfig.mode === 'multi-point'">
                  <div class="space-y-3">
                    <!-- 多点列表 -->
                    <div v-for="(wp, index) in waypoints" :key="wp.id" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <span class="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center shrink-0">{{ index + 1 }}</span>
                      <Input v-model="wp.name" placeholder="站点名称" class="w-24" />
                      <Input v-model="wp.coord" placeholder="经度,纬度" class="flex-1" />
                      <Button size="sm" variant="outline" @click="handleWaypointMapSelect(wp.id)">
                        <MapPin class="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" class="text-red-500 hover:bg-red-50" @click="handleRemoveWaypoint(wp.id)">
                        <Trash2 class="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    
                    <!-- 添加按钮 -->
                    <Button size="sm" variant="outline" class="w-full border-dashed" @click="handleAddWaypoint">
                      <Plus class="w-4 h-4 mr-1" />
                      添加登陆站
                    </Button>
                    
                    <!-- 提示 -->
                    <p v-if="waypoints.length < 3" class="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      提示：多点规划至少需要3个登陆站，系统将自动在分支点添加分支器连接各站点
                    </p>
                  </div>
                </template>
              </div>
            </CardContent>
          </Card>

          <!-- GIS设置 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">GIS设置</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <label class="w-20 text-sm text-gray-600 text-right shrink-0">规划范围：</label>
                  <Input v-model="routeConfig.planningRange" placeholder="西北角：xxx.xx,xxx.xx，东南角：xxx.xx,xxx.xx" class="flex-1" />
                  <Button size="sm" variant="outline" @click="handleMapSelect('规划范围')">地图选点</Button>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-20 text-sm text-gray-600 text-right shrink-0">网格大小：</label>
                  <Input v-model="routeConfig.gridSize" class="flex-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 成本参数 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">成本参数</h3>
              
              <!-- 路径规划成本 -->
              <div class="mb-4">
                <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span class="w-1 h-4 bg-blue-500 rounded"></span>
                  路径规划成本
                </h4>
                <div class="space-y-3 pl-3">
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">轻型海缆单价：</label>
                    <Input v-model="routeConfig.lightCableCost" placeholder="如：15" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">千元/公里</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">重型海缆单价：</label>
                    <Input v-model="routeConfig.heavyCableCost" placeholder="如：25" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">千元/公里</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">施工成本极大值：</label>
                    <Input v-model="routeConfig.maxConstructionCost" placeholder="如：100" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">千元/公里</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">深浅分界值：</label>
                    <Input v-model="routeConfig.depthThreshold" placeholder="如：1000" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">米</span>
                  </div>
                </div>
              </div>
              
              <!-- 系统规划成本 -->
              <div class="pt-4 border-t border-gray-200">
                <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span class="w-1 h-4 bg-green-500 rounded"></span>
                  系统规划成本
                </h4>
                <div class="space-y-3 pl-3">
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">电缆单价：</label>
                    <Input v-model="routeConfig.cableCostPerKm" placeholder="如：35000" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">元/公里</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">安装单价：</label>
                    <Input v-model="routeConfig.installationCostPerKm" placeholder="如：15000" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">元/公里</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">中继器单价：</label>
                    <Input v-model="routeConfig.repeaterCost" placeholder="如：250000" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">元/个</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">分支器单价：</label>
                    <Input v-model="routeConfig.branchingUnitCost" placeholder="如：180000" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">元/个</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-28 text-sm text-gray-600 text-right shrink-0">登陆站成本：</label>
                    <Input v-model="routeConfig.landingStationCost" placeholder="如：5000000" class="flex-1" />
                    <span class="text-sm text-gray-500 w-20 shrink-0">元/个</span>
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
              <Radio class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 class="font-bold text-gray-800 text-lg">传输与仿真配置</h3>
              <p class="text-sm text-gray-500">设置波道参数、计算模型和光纤仿真</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-5">
            <!-- 波道参数 -->
            <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4">
              <div class="flex items-center gap-2">
                <Waves class="w-4 h-4 text-primary" />
                <h4 class="font-medium text-gray-800 dark:text-gray-100">波道参数</h4>
              </div>
              <div class="space-y-4">
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">波道数量</label>
                  <Input v-model="transConfig.channelCount" type="number" class="w-full" />
                  <p class="text-xs text-gray-400 mt-1">范围: 1-400，常用值: 96</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">中心波长 (nm)</label>
                  <Input v-model="transConfig.centerWavelength" type="number" class="w-full" />
                  <p class="text-xs text-gray-400 mt-1">C波段: 1530-1565nm</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">信道带宽 (GHz)</label>
                  <Input v-model="transConfig.channelBandwidth" type="number" class="w-full" />
                  <p class="text-xs text-gray-400 mt-1">常用值: 50 GHz, 100 GHz</p>
                </div>
              </div>
            </div>

            <!-- 计算模型 -->
            <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4">
              <div class="flex items-center gap-2">
                <Server class="w-4 h-4 text-primary" />
                <h4 class="font-medium text-gray-800 dark:text-gray-100">计算模型</h4>
              </div>
              <div class="space-y-2">
                <label v-for="opt in calculationModelOptions" :key="opt.value" :class="[
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  transConfig.models.includes(opt.value) ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200 dark:border-gray-700 dark:hover:border-gray-600'
                ]">
                  <input type="checkbox" :checked="transConfig.models.includes(opt.value)"
                    @change="toggleModel(opt.value)" class="w-4 h-4 text-primary rounded" />
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <!-- 光纤仿真模型 -->
            <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4 col-span-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Zap class="w-4 h-4 text-primary" />
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
                    class="w-4 h-4 text-primary mt-0.5" />
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
          <!-- 数据源 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">数据源</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">数据源类型：</label>
                  <Select v-model="monitorConfig.dataSourceType" :options="[{ value: 'realtime', label: '网络实时数据' }]"
                    class="flex-1" />
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">连接地址：</label>
                  <Input v-model="monitorConfig.connectionAddress" placeholder="tcp://monitor.example.com:1234" class="flex-1" />
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">认证信息：</label>
                  <Button size="sm"
                    @click="appStore.showNotification({ type: 'info', message: '认证配置功能开发中' })">配置</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 告警阈值 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">告警阈值</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">光功率阈值：</label>
                  <Input v-model="monitorConfig.powerThreshold" type="number" class="flex-1" />
                  <span class="text-sm text-gray-500 w-12 shrink-0">dBm</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">温度阈值：</label>
                  <Input v-model="monitorConfig.temperatureThreshold" type="number" class="flex-1" />
                  <span class="text-sm text-gray-500 w-12 shrink-0">°C</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">BER阈值：</label>
                  <Input v-model="monitorConfig.berThreshold" placeholder="1e-9" class="flex-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 告警显示字段设置 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">告警显示字段设置</h3>
              <div class="space-y-3">
                <div class="grid grid-cols-4 gap-4" v-for="row in 4" :key="row">
                  <label v-for="col in 4" :key="col" class="flex items-center gap-2">
                    <input type="checkbox" class="w-4 h-4 text-primary border-gray-300 rounded" />
                    <span class="text-sm text-gray-600">字段{{ (row - 1) * 4 + col }}</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- 器件库配置 -->
        <div v-if="activeTab === 'equipment'" class="space-y-6">
          <!-- 器件库管理 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">器件库管理</h3>
              <div class="flex items-center justify-center gap-4 mb-4">
                <span class="text-sm text-gray-600">当前器件库文件：</span>
                <span class="text-sm text-gray-800 font-medium">{{ settingsStore.currentLibraryFile || '未导入' }}</span>
              </div>
              <div class="flex justify-center gap-4">
                <Button variant="outline" @click="handleImportLibrary">导入器件库</Button>
                <Button variant="outline" @click="handleExportLibrary">导出器件库</Button>
              </div>
            </CardContent>
          </Card>

          <!-- 器件类型管理 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 dark:text-gray-100 text-lg mb-4 pb-3 border-b">器件类型管理</h3>

              <!-- 器件类型标签 -->
              <div class="flex border-b mb-4">
                <button :class="[
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  deviceTypeTab === 'fiber'
                    ? ''
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                ]"
                  :style="deviceTypeTab === 'fiber' ? { borderColor: 'var(--app-primary-color)', color: 'var(--app-primary-color)', backgroundColor: 'rgba(var(--app-primary-rgb), 0.05)' } : {}"
                  @click="deviceTypeTab = 'fiber'">光纤类型管理</button>
                <button :class="[
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  deviceTypeTab === 'amplifier'
                    ? ''
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                ]"
                  :style="deviceTypeTab === 'amplifier' ? { borderColor: 'var(--app-primary-color)', color: 'var(--app-primary-color)', backgroundColor: 'rgba(var(--app-primary-rgb), 0.05)' } : {}"
                  @click="deviceTypeTab = 'amplifier'">放大器类型管理</button>
                <button :class="[
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  deviceTypeTab === 'branching'
                    ? ''
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                ]"
                  :style="deviceTypeTab === 'branching' ? { borderColor: 'var(--app-primary-color)', color: 'var(--app-primary-color)', backgroundColor: 'rgba(var(--app-primary-rgb), 0.05)' } : {}"
                  @click="deviceTypeTab = 'branching'">分支器类型管理</button>
              </div>

              <!-- 光纤类型管理 -->
              <div v-if="deviceTypeTab === 'fiber'">
                <div class="mb-3">
                  <Button size="sm" class="bg-primary hover:bg-primary hover:brightness-90 text-white"
                    @click="showAddFiberDialog = true">
                    <Plus class="w-4 h-4 mr-1" />
                    增加光纤类型
                  </Button>
                </div>
                <div class="border rounded-lg overflow-hidden">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-100 dark:bg-white/5">
                      <tr>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">光纤类型名称</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">非线性系数</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">有效面积</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">色散</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">非线性折射率</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">衰减系数</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">二阶色散</th>
                        <th class="text-center px-3 py-2 font-medium text-gray-700 dark:text-gray-300">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="settingsStore.fiberTypes.length === 0">
                        <td colspan="8" class="px-3 py-8 text-center text-gray-400">暂无数据，请先导入器件库</td>
                      </tr>
                      <tr v-for="fiber in settingsStore.fiberTypes" :key="fiber.id"
                        class="border-t hover:bg-gray-50 dark:hover:bg-white/5">
                        <td class="px-3 py-2">{{ fiber.name }}</td>
                        <td class="px-3 py-2">{{ fiber.nonlinearCoeff }}</td>
                        <td class="px-3 py-2">{{ fiber.effectiveArea }}</td>
                        <td class="px-3 py-2">{{ fiber.dispersion }}</td>
                        <td class="px-3 py-2">{{ fiber.nonlinearRefractiveIndex }} × 10⁻²⁰</td>
                        <td class="px-3 py-2">{{ fiber.attenuationCoeff }}</td>
                        <td class="px-3 py-2">{{ fiber.secondOrderDispersion }}</td>
                        <td class="px-3 py-2 text-center">
                          <button class="text-primary hover:text-primary hover:brightness-90 mx-1">修改</button>
                          <button class="text-red-500 hover:text-red-700 mx-1"
                            @click="handleDeleteFiber(fiber.id)">删除</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- 放大器类型管理 -->
              <div v-if="deviceTypeTab === 'amplifier'">
                <div class="mb-3">
                  <Button size="sm" class="bg-primary hover:bg-primary hover:brightness-90 text-white"
                    @click="showAddAmplifierDialog = true">
                    <Plus class="w-4 h-4 mr-1" />
                    增加放大器类型
                  </Button>
                </div>
                <div class="border rounded-lg overflow-hidden">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-100 dark:bg-white/5">
                      <tr>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">放大器类型名称</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">增益</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">带宽</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">增益平坦度</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">噪声系数</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">泵浦功率</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">输出功率</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">增益范围功率</th>
                        <th class="text-center px-3 py-2 font-medium text-gray-700 dark:text-gray-300">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="settingsStore.amplifierTypes.length === 0">
                        <td colspan="9" class="px-3 py-8 text-center text-gray-400">暂无数据，请先导入器件库</td>
                      </tr>
                      <tr v-for="amp in settingsStore.amplifierTypes" :key="amp.id"
                        class="border-t hover:bg-gray-50 dark:hover:bg-white/5">
                        <td class="px-3 py-2">{{ amp.name }}</td>
                        <td class="px-3 py-2">{{ amp.gain }}</td>
                        <td class="px-3 py-2">{{ amp.bandwidth }}</td>
                        <td class="px-3 py-2">{{ amp.gainFlatness }}</td>
                        <td class="px-3 py-2">{{ amp.noiseFigure }}</td>
                        <td class="px-3 py-2">{{ amp.pumpPower }}</td>
                        <td class="px-3 py-2">{{ amp.outputPower }}</td>
                        <td class="px-3 py-2">{{ amp.gainRangePower }}</td>
                        <td class="px-3 py-2 text-center">
                          <button class="text-blue-500 hover:text-blue-700 mx-1">修改</button>
                          <button class="text-red-500 hover:text-red-700 mx-1"
                            @click="handleDeleteAmplifier(amp.id)">删除</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- 分支器类型管理 -->
              <div v-if="deviceTypeTab === 'branching'">
                <div class="mb-3">
                  <Button size="sm" class="bg-primary hover:bg-primary hover:brightness-90 text-white"
                    @click="showAddBranchingDialog = true">
                    <Plus class="w-4 h-4 mr-1" />
                    增加分支器类型
                  </Button>
                </div>
                <div class="border rounded-lg overflow-hidden">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-100 dark:bg-white/5">
                      <tr>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">分支器类型名称</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">端口数量</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">端口间插损</th>
                        <th class="text-left px-3 py-2 font-medium text-gray-700 dark:text-gray-300">工作波长范围</th>
                        <th class="text-center px-3 py-2 font-medium text-gray-700 dark:text-gray-300">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="settingsStore.branchingUnitTypes.length === 0">
                        <td colspan="5" class="px-3 py-8 text-center text-gray-400">暂无数据，请先导入器件库</td>
                      </tr>
                      <tr v-for="bu in settingsStore.branchingUnitTypes" :key="bu.id"
                        class="border-t hover:bg-gray-50 dark:hover:bg-white/5">
                        <td class="px-3 py-2">{{ bu.name }}</td>
                        <td class="px-3 py-2">{{ bu.portCount }}</td>
                        <td class="px-3 py-2">{{ bu.insertionLoss }}</td>
                        <td class="px-3 py-2">{{ bu.wavelengthRange }}</td>
                        <td class="px-3 py-2 text-center">
                          <button class="text-primary hover:text-primary hover:brightness-90 mx-1">修改</button>
                          <button class="text-red-500 hover:text-red-700 mx-1"
                            @click="handleDeleteBranching(bu.id)">删除</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  </div>

  <!-- 新增光纤器件弹窗 -->
  <Teleport to="body">
    <div v-if="showAddFiberDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showAddFiberDialog = false" />
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[450px]">
        <div class="px-5 py-3 border-b">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">新增光纤器件</h3>
        </div>
        <div class="p-5 space-y-4">
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">光纤类型名称：</label>
            <Input v-model="newFiber.name" class="flex-1" />
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">非线性系数 (γ)：</label>
            <Input v-model="newFiber.nonlinearCoeff" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">W⁻¹·km⁻¹</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">有效面积 (A_eff)：</label>
            <Input v-model="newFiber.effectiveArea" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">μm²</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">色散 (Dispersion)：</label>
            <Input v-model="newFiber.dispersion" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">ps/nm·km</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">非线性折射率 (n_2)：</label>
            <Input v-model="newFiber.nonlinearRefractiveIndex" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">×10⁻²⁰ m²/W</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">衰减系数 (α)：</label>
            <Input v-model="newFiber.attenuationCoeff" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB/km</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">二阶色散 (β₂)：</label>
            <Input v-model="newFiber.secondOrderDispersion" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">ps²</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">光纤仿真模型偏好：</label>
            <Select v-model="newFiber.simulationModel" :options="[{ value: 'GN', label: '高斯噪声模型 (GN Model)' }, { value: 'EGN', label: '增强高斯噪声模型 (EGN Model)' }]" class="flex-1" />
          </div>
        </div>
        <div class="flex justify-center gap-4 p-4 border-t">
          <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6"
            @click="handleAddFiber">保存</Button>
          <Button variant="outline" class="px-6" @click="showAddFiberDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 新增放大器弹窗 -->
  <Teleport to="body">
    <div v-if="showAddAmplifierDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showAddAmplifierDialog = false" />
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[450px]">
        <div class="px-5 py-3 border-b">
          <h3 class="font-bold text-gray-800 dark:text-gray-100">新增放大器类型</h3>
        </div>
        <div class="p-5 space-y-4">
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">放大器类型名称：</label>
            <Input v-model="newAmplifier.name" class="flex-1" />
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">增益：</label>
            <Input v-model="newAmplifier.gain" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">带宽：</label>
            <Input v-model="newAmplifier.bandwidth" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">nm</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">增益平坦度：</label>
            <Input v-model="newAmplifier.gainFlatness" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">噪声系数：</label>
            <Input v-model="newAmplifier.noiseFigure" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">泵浦功率：</label>
            <Input v-model="newAmplifier.pumpPower" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">mW</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">输出功率：</label>
            <Input v-model="newAmplifier.outputPower" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dBm</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">增益范围功率：</label>
            <Input v-model="newAmplifier.gainRangePower" type="number" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
        </div>
        <div class="flex justify-center gap-4 p-4 border-t">
          <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6"
            @click="handleAddAmplifier">保存</Button>
          <Button variant="outline" class="px-6" @click="showAddAmplifierDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 增加分支器类型弹窗 -->
  <Teleport to="body">
    <div v-if="showAddBranchingDialog" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showAddBranchingDialog = false" />
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[400px]">
        <div class="px-5 py-3 border-b">
          <h3 class="font-bold text-gray-800 dark:text-gray-100 text-center">增加分支器类型</h3>
        </div>
        <div class="p-5 space-y-4">
          <div class="flex items-center gap-3">
            <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right">分支器类型名称：</label>
            <Input v-model="newBranching.name" class="flex-1" />
          </div>
          <div class="flex items-center gap-3">
            <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right">端口数量：</label>
            <Input v-model="newBranching.portCount" type="number" placeholder="请输入端口数量" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">个</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right">端口间插损：</label>
            <Input v-model="newBranching.insertionLoss" type="number" placeholder="请输入端口间插损" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right">工作波长范围：</label>
            <Input v-model="newBranching.wavelengthRange" type="number" placeholder="请输入工作波长范围" class="flex-1" />
            <span class="text-xs text-gray-500 dark:text-gray-400">nm</span>
          </div>
        </div>
        <div class="flex justify-center gap-4 p-4 border-t">
          <Button class="bg-primary hover:bg-primary hover:brightness-90 text-white px-6"
            @click="handleAddBranching">保存</Button>
          <Button variant="outline" class="px-6" @click="showAddBranchingDialog = false">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 地图选点弹窗 -->
  <MapSelectDialog v-model:visible="showMapSelectDialog" :title="mapSelectTitle" @confirm="handleMapSelectConfirm" />
</template>
