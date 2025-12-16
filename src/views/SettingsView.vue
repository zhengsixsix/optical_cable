<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useSettingsStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui'
import { Save, RotateCcw, MapPin, Radio, Activity, Cpu } from 'lucide-vue-next'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const activeTab = ref('route')

const tabs = [
  { id: 'route', label: '路径规划配置', icon: MapPin },
  { id: 'transmission', label: '传输系统配置', icon: Radio },
  { id: 'fiber', label: '光纤仿真模型' },
  { id: 'monitoring', label: '监控系统配置', icon: Activity },
  { id: 'cable', label: '器件库-电缆', icon: Cpu },
  { id: 'repeater', label: '器件库-中继器' },
  { id: 'branching', label: '器件库-分支器' },
  { id: 'cost', label: '成本因子' },
]

// 路径规划配置本地状态
const routeConfig = reactive({
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

// 传输系统配置本地状态
const transConfig = reactive({
  channelCount: settingsStore.transmissionConfig.channelCount,
  centerWavelength: settingsStore.transmissionConfig.centerWavelength,
  channelBandwidth: settingsStore.transmissionConfig.channelBandwidth,
  models: [...settingsStore.transmissionConfig.calculationModels],
})

// 监控系统配置本地状态
const monitorConfig = reactive({
  dataSourceType: settingsStore.monitoringConfig.dataSourceType,
  connectionAddress: settingsStore.monitoringConfig.connectionAddress,
  authToken: settingsStore.monitoringConfig.authToken,
  powerThreshold: settingsStore.monitoringConfig.powerThreshold,
  temperatureThreshold: settingsStore.monitoringConfig.temperatureThreshold,
  berThreshold: settingsStore.monitoringConfig.berThreshold,
})

// 光纤仿真配置本地状态
const fiberConfig = reactive({
  model: settingsStore.fiberSimulationConfig.model,
})

// 光纤仿真模型选项
const fiberModelOptions = [
  { value: 'GN', label: 'GN Model (高斯噪声模型)', desc: '适用于计算速度要求高、精度要求一般的场景' },
  { value: 'EGN', label: 'EGN Model (增强型高斯噪声模型)', desc: '适用于仿真精度要求高、可容忍较长计算时间的场景' },
]

// 规划模式选项
const planningModeOptions = [
  { value: 'point-to-point', label: '点对点规划' },
  { value: 'multi-point', label: '多点规划' },
]

// 数据源类型选项
const dataSourceOptions = [
  { value: 'realtime', label: '网络实时数据' },
  { value: 'history', label: '导入历史数据' },
]

// 计算模型选项
const calculationModelOptions = [
  { value: 'power', label: '计算光功率衰减' },
  { value: 'ase', label: '计算线性噪声 (ASE等)' },
  { value: 'nli', label: '计算非线性噪声 (NLI)' },
  { value: 'amp', label: '封装光放大器增益与噪声模型' },
  { value: 'passive', label: '计算无源器件插入损耗' },
]

const toggleModel = (modelId: string) => {
  const index = transConfig.models.indexOf(modelId)
  if (index > -1) {
    transConfig.models.splice(index, 1)
  } else {
    transConfig.models.push(modelId)
  }
}

const handleSave = () => {
  // 保存路径规划配置
  settingsStore.updateRoutePlanningConfig({
    mode: routeConfig.mode as 'point-to-point' | 'multi-point',
    startPoint: { lon: routeConfig.startLon, lat: routeConfig.startLat },
    endPoint: { lon: routeConfig.endLon, lat: routeConfig.endLat },
    planningRange: {
      northwest: { lon: routeConfig.nwLon, lat: routeConfig.nwLat },
      southeast: { lon: routeConfig.seLon, lat: routeConfig.seLat },
    },
  })
  
  // 保存传输系统配置
  settingsStore.updateTransmissionConfig({
    channelCount: transConfig.channelCount,
    centerWavelength: transConfig.centerWavelength,
    channelBandwidth: transConfig.channelBandwidth,
    calculationModels: [...transConfig.models],
  })
  
  // 保存监控系统配置
  settingsStore.updateMonitoringConfig({
    dataSourceType: monitorConfig.dataSourceType as 'realtime' | 'history',
    connectionAddress: monitorConfig.connectionAddress,
    authToken: monitorConfig.authToken,
    powerThreshold: monitorConfig.powerThreshold,
    temperatureThreshold: monitorConfig.temperatureThreshold,
    berThreshold: monitorConfig.berThreshold,
  })
  
  // 保存光纤仿真配置
  settingsStore.updateFiberSimulationConfig({
    model: fiberConfig.model as 'GN' | 'EGN',
  })
  
  settingsStore.saveToLocalStorage()
  appStore.showNotification({ type: 'success', message: '设置已保存' })
}

const handleReset = () => {
  settingsStore.resetToDefaults()
  // 重新加载本地状态
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
    <main class="flex-1 overflow-hidden">
      <Card class="h-full flex">
        <!-- 左侧选项卡 -->
        <div class="w-52 bg-gray-50 border-r shrink-0">
          <div class="p-3 border-b bg-white">
            <h2 class="font-semibold text-gray-700">项目设置</h2>
          </div>
          <div class="py-2">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              :class="[
                'w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2',
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white' 
                  : 'hover:bg-gray-100 text-gray-700'
              ]"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- 右侧内容 -->
        <div class="flex-1 flex flex-col min-w-0">
          <CardContent class="flex-1 overflow-auto">
            <!-- 路径规划配置 -->
            <div v-if="activeTab === 'route'" class="space-y-6 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">路径规划配置</h3>
              
              <!-- 规划模式 -->
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">规划模式</h4>
                <div class="flex gap-4">
                  <label 
                    v-for="opt in planningModeOptions" 
                    :key="opt.value"
                    class="flex items-center gap-2 cursor-pointer"
                  >
                    <input 
                      type="radio" 
                      :value="opt.value" 
                      v-model="routeConfig.mode"
                      class="w-4 h-4 text-blue-600"
                    />
                    <span class="text-sm">{{ opt.label }}</span>
                  </label>
                </div>
              </div>
              
              <!-- 起止点坐标 -->
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">起止点坐标</h4>
                <div class="grid grid-cols-2 gap-6">
                  <div class="space-y-3">
                    <div class="text-sm font-medium text-gray-600">起点坐标</div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="text-xs text-gray-500">经度</label>
                        <input 
                          v-model.number="routeConfig.startLon"
                          type="number" 
                          step="0.0001"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500">纬度</label>
                        <input 
                          v-model.number="routeConfig.startLat"
                          type="number" 
                          step="0.0001"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="space-y-3">
                    <div class="text-sm font-medium text-gray-600">终点坐标</div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="text-xs text-gray-500">经度</label>
                        <input 
                          v-model.number="routeConfig.endLon"
                          type="number" 
                          step="0.0001"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500">纬度</label>
                        <input 
                          v-model.number="routeConfig.endLat"
                          type="number" 
                          step="0.0001"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 规划范围 -->
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">GIS规划范围</h4>
                <div class="grid grid-cols-2 gap-6">
                  <div class="space-y-3">
                    <div class="text-sm font-medium text-gray-600">西北角</div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="text-xs text-gray-500">经度</label>
                        <input 
                          v-model.number="routeConfig.nwLon"
                          type="number" 
                          step="0.01"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500">纬度</label>
                        <input 
                          v-model.number="routeConfig.nwLat"
                          type="number" 
                          step="0.01"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="space-y-3">
                    <div class="text-sm font-medium text-gray-600">东南角</div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="text-xs text-gray-500">经度</label>
                        <input 
                          v-model.number="routeConfig.seLon"
                          type="number" 
                          step="0.01"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500">纬度</label>
                        <input 
                          v-model.number="routeConfig.seLat"
                          type="number" 
                          step="0.01"
                          class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 传输系统配置 -->
            <div v-if="activeTab === 'transmission'" class="space-y-6 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">传输系统配置</h3>
              
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">基本参数</h4>
                <div class="grid grid-cols-3 gap-4">
                  <div>
                    <label class="text-xs text-gray-500">波道数量</label>
                    <input 
                      v-model.number="transConfig.channelCount"
                      type="number" 
                      min="1" 
                      max="400"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">中心波长 (nm)</label>
                    <input 
                      v-model.number="transConfig.centerWavelength"
                      type="number" 
                      min="1500" 
                      max="1600"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">信道带宽 (GHz)</label>
                    <input 
                      v-model.number="transConfig.channelBandwidth"
                      type="number" 
                      min="25" 
                      max="100"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
              
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">计算模型</h4>
                <div class="space-y-2">
                  <label 
                    v-for="opt in calculationModelOptions" 
                    :key="opt.value"
                    class="flex items-center gap-3 p-2 rounded hover:bg-white cursor-pointer"
                  >
                    <input 
                      type="checkbox" 
                      :checked="transConfig.models.includes(opt.value)"
                      @change="toggleModel(opt.value)"
                      class="w-4 h-4 text-blue-600 rounded"
                    />
                    <span class="text-sm">{{ opt.label }}</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- 光纤仿真模型配置 -->
            <div v-if="activeTab === 'fiber'" class="space-y-6 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">光纤仿真模型配置</h3>
              
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">仿真模型偏好</h4>
                <p class="text-xs text-gray-500 mb-3">选择光纤非线性效应计算模型，影响仿真精度和计算速度</p>
                <div class="space-y-3">
                  <label 
                    v-for="opt in fiberModelOptions" 
                    :key="opt.value"
                    :class="[
                      'flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
                      fiberConfig.model === opt.value 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    ]"
                  >
                    <input 
                      type="radio" 
                      :value="opt.value" 
                      v-model="fiberConfig.model"
                      class="w-4 h-4 text-blue-600 mt-0.5"
                    />
                    <div>
                      <span class="text-sm font-medium">{{ opt.label }}</span>
                      <p class="text-xs text-gray-500 mt-1">{{ opt.desc }}</p>
                    </div>
                  </label>
                </div>
              </div>
              
              <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 class="font-medium text-blue-700 mb-2">模型说明</h4>
                <ul class="text-xs text-blue-600 space-y-1">
                  <li><strong>GN Model</strong>: 高斯噪声模型，时间复杂度低，适合快速估算</li>
                  <li><strong>EGN Model</strong>: 增强型高斯噪声模型，时间复杂度高，适合精确仿真</li>
                </ul>
              </div>
            </div>

            <!-- 监控系统配置 -->
            <div v-if="activeTab === 'monitoring'" class="space-y-6 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">监控系统配置</h3>
              
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">数据源配置</h4>
                <div class="space-y-4">
                  <div>
                    <label class="text-xs text-gray-500">数据源类型</label>
                    <div class="flex gap-4 mt-2">
                      <label 
                        v-for="opt in dataSourceOptions" 
                        :key="opt.value"
                        class="flex items-center gap-2 cursor-pointer"
                      >
                        <input 
                          type="radio" 
                          :value="opt.value" 
                          v-model="monitorConfig.dataSourceType"
                          class="w-4 h-4 text-blue-600"
                        />
                        <span class="text-sm">{{ opt.label }}</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">连接地址 (WebSocket)</label>
                    <input 
                      v-model="monitorConfig.connectionAddress"
                      type="text" 
                      placeholder="ws://localhost:8080/monitor"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">认证Token</label>
                    <input 
                      v-model="monitorConfig.authToken"
                      type="password" 
                      placeholder="输入用户鉴权Token"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                    <p class="text-xs text-gray-400 mt-1">用于第三方告警源的身份验证</p>
                  </div>
                </div>
              </div>
              
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <h4 class="font-medium text-gray-700">告警阈值</h4>
                <div class="grid grid-cols-3 gap-4">
                  <div>
                    <label class="text-xs text-gray-500">光功率阈值 (dBm)</label>
                    <input 
                      v-model.number="monitorConfig.powerThreshold"
                      type="number" 
                      step="0.1"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">温度阈值 (°C)</label>
                    <input 
                      v-model.number="monitorConfig.temperatureThreshold"
                      type="number" 
                      step="0.5"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">BER阈值</label>
                    <input 
                      v-model="monitorConfig.berThreshold"
                      type="text" 
                      placeholder="1e-6"
                      class="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- 电缆类型 -->
            <div v-if="activeTab === 'cable'" class="space-y-4 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">电缆类型配置</h3>
              <div 
                v-for="cable in settingsStore.cableTypes" 
                :key="cable.id"
                class="p-4 bg-gray-50 rounded-lg space-y-2"
              >
                <div class="font-medium">{{ cable.name }}</div>
                <div class="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <label class="text-gray-500">成本/km</label>
                    <div class="font-medium">${{ cable.costPerKm.toLocaleString() }}</div>
                  </div>
                  <div>
                    <label class="text-gray-500">最大深度</label>
                    <div class="font-medium">{{ cable.maxDepth }}m</div>
                  </div>
                  <div>
                    <label class="text-gray-500">光纤数</label>
                    <div class="font-medium">{{ cable.fiberCount }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 中继器 -->
            <div v-if="activeTab === 'repeater'" class="space-y-4 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">中继器配置</h3>
              <div 
                v-for="repeater in settingsStore.repeaterTypes" 
                :key="repeater.id"
                class="p-4 bg-gray-50 rounded-lg space-y-2"
              >
                <div class="font-medium">{{ repeater.name }}</div>
                <div class="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <label class="text-gray-500">成本</label>
                    <div class="font-medium">${{ repeater.cost.toLocaleString() }}</div>
                  </div>
                  <div>
                    <label class="text-gray-500">最大跨距</label>
                    <div class="font-medium">{{ repeater.maxSpan }}km</div>
                  </div>
                  <div>
                    <label class="text-gray-500">功耗</label>
                    <div class="font-medium">{{ repeater.powerConsumption }}W</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 分支单元 -->
            <div v-if="activeTab === 'branching'" class="space-y-4 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">分支单元配置</h3>
              <div 
                v-for="bu in settingsStore.branchingUnits" 
                :key="bu.id"
                class="p-4 bg-gray-50 rounded-lg space-y-2"
              >
                <div class="font-medium">{{ bu.name }}</div>
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label class="text-gray-500">成本</label>
                    <div class="font-medium">${{ bu.cost.toLocaleString() }}</div>
                  </div>
                  <div>
                    <label class="text-gray-500">端口数</label>
                    <div class="font-medium">{{ bu.portCount }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 成本因子 -->
            <div v-if="activeTab === 'cost'" class="space-y-4 max-w-3xl">
              <h3 class="font-semibold text-gray-700 text-lg">成本因子配置</h3>
              <div class="p-4 bg-gray-50 rounded-lg space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="text-sm text-gray-500">人工成本/km</label>
                    <div class="font-medium">${{ settingsStore.costFactors.laborCostPerKm.toLocaleString() }}</div>
                  </div>
                  <div>
                    <label class="text-sm text-gray-500">船舶成本/天</label>
                    <div class="font-medium">${{ settingsStore.costFactors.vesselCostPerDay.toLocaleString() }}</div>
                  </div>
                  <div>
                    <label class="text-sm text-gray-500">勘测成本/km</label>
                    <div class="font-medium">${{ settingsStore.costFactors.surveyingCostPerKm.toLocaleString() }}</div>
                  </div>
                  <div>
                    <label class="text-sm text-gray-500">应急预算比例</label>
                    <div class="font-medium">{{ settingsStore.costFactors.contingencyPercent }}%</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <!-- 底部按钮 -->
          <div class="p-4 border-t flex justify-end gap-2 shrink-0">
            <Button variant="outline" @click="handleReset">
              <RotateCcw class="w-4 h-4 mr-1" /> 重置默认
            </Button>
            <Button @click="handleSave">
              <Save class="w-4 h-4 mr-1" /> 保存设置
            </Button>
          </div>
        </div>
      </Card>
    </main>
  </div>
</template>
