<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useSettingsStore, useAppStore } from '@/stores'
import { Card, CardContent, Button, Select } from '@/components/ui'
import MapSelectDialog from '@/components/dialogs/MapSelectDialog.vue'
import { Save, RotateCcw, MapPin, Radio, Activity, Database, Cable, Zap, GitBranch, Waves, Server, AlertTriangle, Plus, Trash2, Upload, Download, X, Edit } from 'lucide-vue-next'
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
  input.onchange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      appStore.showNotification({ type: 'success', message: `器件库文件 ${file.name} 导入成功` })
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

const routeConfig = reactive({
  mode: settingsStore.routePlanningConfig.mode,
  // 点对点模式坐标
  startCoord: '',
  endCoord: '',
  // 多点模式文件
  multiPointFile: '',
  // GIS设置
  planningRange: '',
  gridSize: '',
  // 成本参数
  lightCableCost: '',
  heavyCableCost: '',
  maxConstructionCost: '',
  depthThreshold: '',
})

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

const handleSave = () => {
  // 路径规划配置保存逻辑（简化版，使用字符串格式）
  settingsStore.updateRoutePlanningConfig({
    mode: routeConfig.mode as 'point-to-point' | 'multi-point',
    startPoint: { lon: 0, lat: 0 },
    endPoint: { lon: 0, lat: 0 },
    planningRange: {
      northwest: { lon: 0, lat: 0 },
      southeast: { lon: 0, lat: 0 },
    },
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
    <Card class="flex-1 flex overflow-hidden">
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
                    <input v-model="routeConfig.startCoord" type="text" placeholder="经度,纬度"
                      class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                    <Button size="sm" variant="outline" @click="handleMapSelect('起点')">地图选点</Button>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="w-20 text-sm text-gray-600 text-right shrink-0">终点坐标：</label>
                    <input v-model="routeConfig.endCoord" type="text" placeholder="经度,纬度"
                      class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                    <Button size="sm" variant="outline" @click="handleMapSelect('终点')">地图选点</Button>
                  </div>
                </template>

                <!-- 多点规划模式 -->
                <template v-if="routeConfig.mode === 'multi-point'">
                  <div class="flex items-center gap-4">
                    <label class="w-20 text-sm text-gray-600 text-right shrink-0">多点文件：</label>
                    <input v-model="routeConfig.multiPointFile" type="text" readonly placeholder="请选择多点文件"
                      class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-gray-50 outline-none" />
                    <Button size="sm" variant="outline" @click="handleBrowseMultiPointFile">浏览</Button>
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
                  <input v-model="routeConfig.planningRange" type="text"
                    placeholder="西北角：xxx.xx,xxx.xx，东南角：xxx.xx,xxx.xx"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                  <Button size="sm" variant="outline" @click="handleMapSelect('规划范围')">地图选点</Button>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-20 text-sm text-gray-600 text-right shrink-0">网格大小：</label>
                  <input v-model="routeConfig.gridSize" type="text"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 成本参数 -->
          <Card>
            <CardContent class="p-5">
              <h3 class="text-center font-bold text-gray-800 text-lg mb-4 pb-3 border-b">成本参数</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 text-right shrink-0">轻型海缆单价：</label>
                  <input v-model="routeConfig.lightCableCost" type="text"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                  <span class="text-sm text-gray-500 w-20 shrink-0">千元/公里</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 text-right shrink-0">重型海缆单价：</label>
                  <input v-model="routeConfig.heavyCableCost" type="text"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                  <span class="text-sm text-gray-500 w-20 shrink-0">千元/公里</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 text-right shrink-0">施工成本极大值：</label>
                  <input v-model="routeConfig.maxConstructionCost" type="text"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                  <span class="text-sm text-gray-500 w-20 shrink-0">千元/公里</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-28 text-sm text-gray-600 text-right shrink-0">深浅分界值：</label>
                  <input v-model="routeConfig.depthThreshold" type="text"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                  <span class="text-sm text-gray-500 w-20 shrink-0">千元/公里</span>
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
                  <input v-model.number="transConfig.channelCount" type="number" min="1" max="400"
                    class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  <p class="text-xs text-gray-400 mt-1">范围: 1-400，常用值: 96</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">中心波长 (nm)</label>
                  <input v-model.number="transConfig.centerWavelength" type="number" min="1500" max="1600"
                    class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  <p class="text-xs text-gray-400 mt-1">C波段: 1530-1565nm</p>
                </div>
                <div>
                  <label class="text-xs text-gray-500 mb-1 block">信道带宽 (GHz)</label>
                  <input v-model.number="transConfig.channelBandwidth" type="number" min="25" max="100"
                    class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
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
                  <input v-model="monitorConfig.connectionAddress" type="text"
                    placeholder="tcp://monitor.example.com:1234"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
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
                  <input v-model.number="monitorConfig.powerThreshold" type="number" step="0.1"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                  <span class="text-sm text-gray-500 w-12 shrink-0">dBm</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">温度阈值：</label>
                  <input v-model.number="monitorConfig.temperatureThreshold" type="number" step="0.5"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
                  <span class="text-sm text-gray-500 w-12 shrink-0">°C</span>
                </div>
                <div class="flex items-center gap-4">
                  <label class="w-24 text-sm text-gray-600 text-right shrink-0">BER阈值：</label>
                  <input v-model="monitorConfig.berThreshold" type="text" placeholder="1e-9"
                    class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none" />
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
                <span class="text-sm text-gray-800 font-medium">{{ settingsStore.currentLibraryFile }}</span>
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
            <input v-model="newFiber.name" type="text"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">非线性系数 (γ)：</label>
            <input v-model.number="newFiber.nonlinearCoeff" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">W⁻¹·km⁻¹</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">有效面积 (A_eff)：</label>
            <input v-model.number="newFiber.effectiveArea" type="number" step="1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">μm²</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">色散 (Dispersion)：</label>
            <input v-model.number="newFiber.dispersion" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">ps/nm·km</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">非线性折射率 (n_2)：</label>
            <input v-model.number="newFiber.nonlinearRefractiveIndex" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">×10⁻²⁰ m²/W</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">衰减系数 (α)：</label>
            <input v-model.number="newFiber.attenuationCoeff" type="number" step="0.01"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB/km</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">二阶色散 (β₂)：</label>
            <input v-model.number="newFiber.secondOrderDispersion" type="number" step="1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">ps²</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">光纤仿真模型偏好：</label>
            <select v-model="newFiber.simulationModel"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary">
              <option value="GN">高斯噪声模型 (GN Model)</option>
              <option value="EGN">增强高斯噪声模型 (EGN Model)</option>
            </select>
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
            <input v-model="newAmplifier.name" type="text"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">增益：</label>
            <input v-model.number="newAmplifier.gain" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">带宽：</label>
            <input v-model.number="newAmplifier.bandwidth" type="number" step="1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">nm</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">增益平坦度：</label>
            <input v-model.number="newAmplifier.gainFlatness" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">噪声系数：</label>
            <input v-model.number="newAmplifier.noiseFigure" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">泵浦功率：</label>
            <input v-model.number="newAmplifier.pumpPower" type="number" step="1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">mW</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">输出功率：</label>
            <input v-model.number="newAmplifier.outputPower" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dBm</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-32 text-sm text-gray-600 dark:text-gray-400 text-right">增益范围功率：</label>
            <input v-model.number="newAmplifier.gainRangePower" type="number" step="0.1"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
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
            <input v-model="newBranching.name" type="text"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          <div class="flex items-center gap-3">
            <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right">端口数量：</label>
            <input v-model.number="newBranching.portCount" type="number" min="1" placeholder="请输入端口数量"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">个</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right">端口间插损：</label>
            <input v-model.number="newBranching.insertionLoss" type="number" step="0.1" placeholder="请输入端口间插损"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <span class="text-xs text-gray-500 dark:text-gray-400">dB</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="w-28 text-sm text-gray-600 dark:text-gray-400 text-right">工作波长范围：</label>
            <input v-model.number="newBranching.wavelengthRange" type="number" step="1" placeholder="请输入工作波长范围"
              class="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/30 focus:border-primary" />
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
