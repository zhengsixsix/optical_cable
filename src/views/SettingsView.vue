<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useSettingsStore, useAppStore } from '@/stores'
import { Card, CardHeader, CardContent, Button, Select } from '@/components/ui'
import { Save, RotateCcw, MapPin, Radio, Activity, Database, Cable, Zap, GitBranch, DollarSign, Waves, Server, Thermometer, AlertTriangle } from 'lucide-vue-next'
import {
  fiberModelOptions,
  planningModeOptions,
  dataSourceOptions,
  calculationModelOptions
} from '@/data/mockData'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const activeTab = ref('route')

const tabs = [
  { id: 'route', label: '路径规划配置', icon: MapPin, desc: '起止点、规划范围、规划模式' },
  { id: 'transmission', label: '传输与仿真', icon: Radio, desc: '波道参数、计算模型、光纤仿真' },
  { id: 'monitoring', label: '监控系统配置', icon: Activity, desc: '数据源、告警阈值、连接配置' },
  { id: 'equipment', label: '器件库与成本', icon: Database, desc: '电缆、中继器、分支器、成本因子' },
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
        <div class="w-64 bg-gray-50 border-r shrink-0">
          <div class="p-4 border-b bg-white">
            <h2 class="font-semibold text-gray-800 text-lg">项目设置</h2>
            <p class="text-xs text-gray-500 mt-1">配置系统参数和器件库</p>
          </div>
          <div class="p-3 space-y-1">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              :class="[
                'w-full px-3 py-3 text-left text-sm transition-all rounded-lg flex items-start gap-3',
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'hover:bg-white hover:shadow-sm text-gray-700'
              ]"
              @click="activeTab = tab.id"
            >
              <component 
                :is="tab.icon" 
                :class="['w-5 h-5 shrink-0 mt-0.5', activeTab === tab.id ? 'text-white' : 'text-blue-500']" 
              />
              <div>
                <div class="font-medium">{{ tab.label }}</div>
                <div :class="['text-xs mt-0.5', activeTab === tab.id ? 'text-blue-100' : 'text-gray-400']">
                  {{ tab.desc }}
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- 右侧内容 -->
        <div class="flex-1 flex flex-col min-w-0">
          <CardContent class="flex-1 overflow-auto">
            <!-- 路径规划配置 -->
            <div v-if="activeTab === 'route'" class="space-y-6">
              <div class="flex items-center gap-3 pb-4 border-b">
                <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <MapPin class="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800 text-lg">路径规划配置</h3>
                  <p class="text-sm text-gray-500">设置海缆路径的起止点和规划范围</p>
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-6">
                <!-- 左列 -->
                <div class="space-y-5">
                  <!-- 规划模式 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                      <Waves class="w-4 h-4 text-blue-500" />
                      <h4 class="font-medium text-gray-800">规划模式</h4>
                    </div>
                    <div class="space-y-2">
                      <label 
                        v-for="opt in planningModeOptions" 
                        :key="opt.value"
                        :class="[
                          'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
                          routeConfig.mode === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                        ]"
                      >
                        <input type="radio" :value="opt.value" v-model="routeConfig.mode" class="w-4 h-4 text-blue-600" />
                        <span class="text-sm font-medium">{{ opt.label }}</span>
                      </label>
                    </div>
                  </div>

                  <!-- 起点坐标 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 rounded-full bg-green-500"></div>
                      <h4 class="font-medium text-gray-800">起点坐标</h4>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">经度 (Longitude)</label>
                        <input v-model.number="routeConfig.startLon" type="number" step="0.0001"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">纬度 (Latitude)</label>
                        <input v-model.number="routeConfig.startLat" type="number" step="0.0001"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                      </div>
                    </div>
                    <p class="text-xs text-gray-400">示例: 上海 (121.4737, 31.2304)</p>
                  </div>

                  <!-- 终点坐标 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 rounded-full bg-red-500"></div>
                      <h4 class="font-medium text-gray-800">终点坐标</h4>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">经度 (Longitude)</label>
                        <input v-model.number="routeConfig.endLon" type="number" step="0.0001"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">纬度 (Latitude)</label>
                        <input v-model.number="routeConfig.endLat" type="number" step="0.0001"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                      </div>
                    </div>
                    <p class="text-xs text-gray-400">示例: 东京 (139.6917, 35.6895)</p>
                  </div>
                </div>

                <!-- 右列 -->
                <div class="space-y-5">
                  <!-- GIS规划范围 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <MapPin class="w-4 h-4 text-blue-500" />
                        <h4 class="font-medium text-gray-800">GIS规划范围</h4>
                      </div>
                      <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">边界框</span>
                    </div>
                    
                    <div class="space-y-4">
                      <div class="p-3 bg-gray-50 rounded-lg">
                        <div class="text-xs font-medium text-gray-600 mb-2">西北角 (左上)</div>
                        <div class="grid grid-cols-2 gap-3">
                          <div>
                            <label class="text-xs text-gray-400">经度</label>
                            <input v-model.number="routeConfig.nwLon" type="number" step="0.01"
                              class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                          </div>
                          <div>
                            <label class="text-xs text-gray-400">纬度</label>
                            <input v-model.number="routeConfig.nwLat" type="number" step="0.01"
                              class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                          </div>
                        </div>
                      </div>
                      
                      <div class="p-3 bg-gray-50 rounded-lg">
                        <div class="text-xs font-medium text-gray-600 mb-2">东南角 (右下)</div>
                        <div class="grid grid-cols-2 gap-3">
                          <div>
                            <label class="text-xs text-gray-400">经度</label>
                            <input v-model.number="routeConfig.seLon" type="number" step="0.01"
                              class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                          </div>
                          <div>
                            <label class="text-xs text-gray-400">纬度</label>
                            <input v-model.number="routeConfig.seLat" type="number" step="0.01"
                              class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 提示信息 -->
                  <div class="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h4 class="font-medium text-blue-700 mb-2 text-sm">配置说明</h4>
                    <ul class="text-xs text-blue-600 space-y-1.5">
                      <li>- 起止点坐标用于定义海缆的登陆站位置</li>
                      <li>- GIS规划范围限制路径搜索的地理边界</li>
                      <li>- 坐标格式为 WGS84 经纬度</li>
                      <li>- 修改后需点击"保存设置"生效</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <!-- 传输与仿真配置 (合并) -->
            <div v-if="activeTab === 'transmission'" class="space-y-6">
              <div class="flex items-center gap-3 pb-4 border-b">
                <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Radio class="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800 text-lg">传输与仿真配置</h3>
                  <p class="text-sm text-gray-500">设置波道参数、计算模型和光纤仿真偏好</p>
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-6">
                <!-- 左列 -->
                <div class="space-y-5">
                  <!-- 波道参数 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                      <Waves class="w-4 h-4 text-green-500" />
                      <h4 class="font-medium text-gray-800">波道参数</h4>
                    </div>
                    <div class="space-y-4">
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">波道数量</label>
                        <input v-model.number="transConfig.channelCount" type="number" min="1" max="400"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
                        <p class="text-xs text-gray-400 mt-1">范围: 1-400，常用值: 96</p>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">中心波长 (nm)</label>
                        <input v-model.number="transConfig.centerWavelength" type="number" min="1500" max="1600"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
                        <p class="text-xs text-gray-400 mt-1">C波段: 1530-1565nm</p>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">信道带宽 (GHz)</label>
                        <input v-model.number="transConfig.channelBandwidth" type="number" min="25" max="100"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
                        <p class="text-xs text-gray-400 mt-1">常用值: 50 GHz, 100 GHz</p>
                      </div>
                    </div>
                  </div>

                  <!-- 计算模型 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                      <Server class="w-4 h-4 text-green-500" />
                      <h4 class="font-medium text-gray-800">计算模型</h4>
                    </div>
                    <div class="space-y-2">
                      <label 
                        v-for="opt in calculationModelOptions" 
                        :key="opt.value"
                        :class="[
                          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                          transConfig.models.includes(opt.value) ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-gray-200'
                        ]"
                      >
                        <input type="checkbox" :checked="transConfig.models.includes(opt.value)" @change="toggleModel(opt.value)"
                          class="w-4 h-4 text-green-600 rounded" />
                        <span class="text-sm font-medium">{{ opt.label }}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <!-- 右列 -->
                <div class="space-y-5">
                  <!-- 光纤仿真模型 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Zap class="w-4 h-4 text-green-500" />
                        <h4 class="font-medium text-gray-800">光纤仿真模型</h4>
                      </div>
                      <span class="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">非线性效应</span>
                    </div>
                    <p class="text-xs text-gray-500">选择仿真模型影响计算精度和速度</p>
                    <div class="space-y-3">
                      <label 
                        v-for="opt in fiberModelOptions" 
                        :key="opt.value"
                        :class="[
                          'flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                          fiberConfig.model === opt.value ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-gray-200'
                        ]"
                      >
                        <input type="radio" :value="opt.value" v-model="fiberConfig.model" class="w-4 h-4 text-green-600 mt-0.5" />
                        <div>
                          <span class="text-sm font-medium">{{ opt.label }}</span>
                          <p class="text-xs text-gray-500 mt-1">{{ opt.desc }}</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <!-- 模型说明 -->
                  <div class="bg-green-50 border border-green-200 rounded-xl p-4">
                    <h4 class="font-medium text-green-700 mb-2 text-sm">模型对比</h4>
                    <div class="space-y-2 text-xs text-green-600">
                      <div class="flex justify-between p-2 bg-white/50 rounded">
                        <span>GN Model</span>
                        <span>速度快，精度一般</span>
                      </div>
                      <div class="flex justify-between p-2 bg-white/50 rounded">
                        <span>EGN Model</span>
                        <span>速度慢，精度高</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 监控系统配置 -->
            <div v-if="activeTab === 'monitoring'" class="space-y-6">
              <div class="flex items-center gap-3 pb-4 border-b">
                <div class="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Activity class="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800 text-lg">监控系统配置</h3>
                  <p class="text-sm text-gray-500">配置数据源连接和告警阈值参数</p>
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-6">
                <!-- 左列 -->
                <div class="space-y-5">
                  <!-- 数据源配置 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center gap-2">
                      <Server class="w-4 h-4 text-orange-500" />
                      <h4 class="font-medium text-gray-800">数据源配置</h4>
                    </div>
                    <div class="space-y-4">
                      <div>
                        <label class="text-xs text-gray-500 mb-2 block">数据源类型</label>
                        <div class="space-y-2">
                          <label 
                            v-for="opt in dataSourceOptions" 
                            :key="opt.value"
                            :class="[
                              'flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
                              monitorConfig.dataSourceType === opt.value ? 'border-orange-500 bg-orange-50' : 'border-gray-100 hover:border-gray-200'
                            ]"
                          >
                            <input type="radio" :value="opt.value" v-model="monitorConfig.dataSourceType" class="w-4 h-4 text-orange-600" />
                            <span class="text-sm font-medium">{{ opt.label }}</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">连接地址 (WebSocket)</label>
                        <input v-model="monitorConfig.connectionAddress" type="text" placeholder="ws://localhost:8080/monitor"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">认证Token</label>
                        <input v-model="monitorConfig.authToken" type="password" placeholder="输入用户鉴权Token"
                          class="w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
                        <p class="text-xs text-gray-400 mt-1">用于第三方告警源的身份验证</p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 右列 -->
                <div class="space-y-5">
                  <!-- 告警阈值 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <AlertTriangle class="w-4 h-4 text-orange-500" />
                        <h4 class="font-medium text-gray-800">告警阈值</h4>
                      </div>
                      <span class="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">关键参数</span>
                    </div>
                    <div class="space-y-4">
                      <div class="p-3 bg-gray-50 rounded-lg">
                        <label class="text-xs text-gray-500 mb-1 block">光功率阈值 (dBm)</label>
                        <input v-model.number="monitorConfig.powerThreshold" type="number" step="0.1"
                          class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
                        <p class="text-xs text-gray-400 mt-1">低于此值触发告警</p>
                      </div>
                      <div class="p-3 bg-gray-50 rounded-lg">
                        <label class="text-xs text-gray-500 mb-1 block">温度阈值 (°C)</label>
                        <input v-model.number="monitorConfig.temperatureThreshold" type="number" step="0.5"
                          class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
                        <p class="text-xs text-gray-400 mt-1">高于此值触发告警</p>
                      </div>
                      <div class="p-3 bg-gray-50 rounded-lg">
                        <label class="text-xs text-gray-500 mb-1 block">误码率阈值 (BER)</label>
                        <input v-model="monitorConfig.berThreshold" type="text" placeholder="1e-6"
                          class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500" />
                        <p class="text-xs text-gray-400 mt-1">科学计数法格式</p>
                      </div>
                    </div>
                  </div>

                  <!-- 说明 -->
                  <div class="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <h4 class="font-medium text-orange-700 mb-2 text-sm">监控说明</h4>
                    <ul class="text-xs text-orange-600 space-y-1.5">
                      <li>- 实时数据源需要 WebSocket 服务支持</li>
                      <li>- 历史数据模式用于离线分析</li>
                      <li>- 阈值设置影响告警灵敏度</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <!-- 器件库与成本 (合并) -->
            <div v-if="activeTab === 'equipment'" class="space-y-6">
              <div class="flex items-center gap-3 pb-4 border-b">
                <div class="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Database class="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800 text-lg">器件库与成本配置</h3>
                  <p class="text-sm text-gray-500">管理电缆、中继器、分支器类型及成本参数</p>
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-6">
                <!-- 左列 -->
                <div class="space-y-5">
                  <!-- 电缆类型 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Cable class="w-4 h-4 text-purple-500" />
                        <h4 class="font-medium text-gray-800">电缆类型</h4>
                      </div>
                      <span class="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">{{ settingsStore.cableTypes.length }} 种</span>
                    </div>
                    <div class="space-y-3">
                      <div 
                        v-for="cable in settingsStore.cableTypes" 
                        :key="cable.id"
                        class="p-3 bg-gray-50 rounded-lg"
                      >
                        <div class="font-medium text-sm text-gray-800 mb-2">{{ cable.name }}</div>
                        <div class="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span class="text-gray-400">成本/km</span>
                            <div class="font-semibold text-gray-700">${{ cable.costPerKm.toLocaleString() }}</div>
                          </div>
                          <div>
                            <span class="text-gray-400">最大深度</span>
                            <div class="font-semibold text-gray-700">{{ cable.maxDepth }}m</div>
                          </div>
                          <div>
                            <span class="text-gray-400">光纤数</span>
                            <div class="font-semibold text-gray-700">{{ cable.fiberCount }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 中继器 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Zap class="w-4 h-4 text-purple-500" />
                        <h4 class="font-medium text-gray-800">中继器类型</h4>
                      </div>
                      <span class="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">{{ settingsStore.repeaterTypes.length }} 种</span>
                    </div>
                    <div class="space-y-3">
                      <div 
                        v-for="repeater in settingsStore.repeaterTypes" 
                        :key="repeater.id"
                        class="p-3 bg-gray-50 rounded-lg"
                      >
                        <div class="font-medium text-sm text-gray-800 mb-2">{{ repeater.name }}</div>
                        <div class="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span class="text-gray-400">成本</span>
                            <div class="font-semibold text-gray-700">${{ repeater.cost.toLocaleString() }}</div>
                          </div>
                          <div>
                            <span class="text-gray-400">最大跨距</span>
                            <div class="font-semibold text-gray-700">{{ repeater.maxSpan }}km</div>
                          </div>
                          <div>
                            <span class="text-gray-400">功耗</span>
                            <div class="font-semibold text-gray-700">{{ repeater.powerConsumption }}W</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 右列 -->
                <div class="space-y-5">
                  <!-- 分支器 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <GitBranch class="w-4 h-4 text-purple-500" />
                        <h4 class="font-medium text-gray-800">分支器类型</h4>
                      </div>
                      <span class="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">{{ settingsStore.branchingUnits.length }} 种</span>
                    </div>
                    <div class="space-y-3">
                      <div 
                        v-for="bu in settingsStore.branchingUnits" 
                        :key="bu.id"
                        class="p-3 bg-gray-50 rounded-lg"
                      >
                        <div class="font-medium text-sm text-gray-800 mb-2">{{ bu.name }}</div>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span class="text-gray-400">成本</span>
                            <div class="font-semibold text-gray-700">${{ bu.cost.toLocaleString() }}</div>
                          </div>
                          <div>
                            <span class="text-gray-400">端口数</span>
                            <div class="font-semibold text-gray-700">{{ bu.portCount }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 成本因子 -->
                  <div class="bg-white border rounded-xl p-5 space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <DollarSign class="w-4 h-4 text-purple-500" />
                        <h4 class="font-medium text-gray-800">成本因子</h4>
                      </div>
                      <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">工程成本</span>
                    </div>
                    <div class="space-y-3">
                      <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 bg-gray-50 rounded-lg">
                          <span class="text-xs text-gray-400">人工成本/km</span>
                          <div class="font-semibold text-gray-700">${{ settingsStore.costFactors.laborCostPerKm.toLocaleString() }}</div>
                        </div>
                        <div class="p-3 bg-gray-50 rounded-lg">
                          <span class="text-xs text-gray-400">船舶成本/天</span>
                          <div class="font-semibold text-gray-700">${{ settingsStore.costFactors.vesselCostPerDay.toLocaleString() }}</div>
                        </div>
                        <div class="p-3 bg-gray-50 rounded-lg">
                          <span class="text-xs text-gray-400">勘测成本/km</span>
                          <div class="font-semibold text-gray-700">${{ settingsStore.costFactors.surveyingCostPerKm.toLocaleString() }}</div>
                        </div>
                        <div class="p-3 bg-gray-50 rounded-lg">
                          <span class="text-xs text-gray-400">应急预算比例</span>
                          <div class="font-semibold text-gray-700">{{ settingsStore.costFactors.contingencyPercent }}%</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 说明 -->
                  <div class="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 class="font-medium text-purple-700 mb-2 text-sm">器件库说明</h4>
                    <ul class="text-xs text-purple-600 space-y-1.5">
                      <li>- 电缆类型按深度和用途分类</li>
                      <li>- 中继器跨距影响布放间隔</li>
                      <li>- 成本因子用于总价估算</li>
                    </ul>
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
