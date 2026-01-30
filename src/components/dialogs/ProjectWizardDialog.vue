<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FilePlus, X, Loader2, ChevronRight, ChevronLeft, Check, MapPin, Package, DollarSign, CheckCircle, ChevronDown, ChevronUp, Plus, Trash2, Route, GitCommit } from 'lucide-vue-next'
import { useAppStore } from '@/stores'
import { Button, Select } from '@/shared/components/base'
import MapSelectDialog from '@/modules/planning/dialogs/MapSelectDialog.vue'

interface Props {
  visible: boolean
}

interface LayerItem {
  key: string
  label: string
  checked: boolean
  value: string
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
  }
}

interface CostItem {
  id: string
  name: string
  unit: string
  price: number
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

// 步骤定义
const steps = [
  { id: 1, title: '新建项目', icon: FilePlus, description: '填写项目基本信息' },
  { id: 2, title: '站点位置', icon: MapPin, description: 'GIS设置' },
  { id: 3, title: '器件库管理', icon: Package, description: '可选' },
  { id: 4, title: '成本参数', icon: DollarSign, description: '可选' },
  { id: 5, title: '完成', icon: CheckCircle, description: '确认创建' },
]

const currentStep = ref(1)
const isProcessing = ref(false)

// 步骤1: 项目基本信息
const projectType = ref<ProjectType>('use')
const projectName = ref('')
const allowOtherUsers = ref(false)
const isGisExpanded = ref(false)

// 步骤2: 站点位置与GIS设置
const planningMode = ref<'point-to-point' | 'multi-point'>('point-to-point')
const startStation = ref({ name: '起点', longitude: 0, latitude: 0 })
const endStation = ref({ name: '终点', longitude: 0, latitude: 0 })
// 多点规划站点列表
const waypoints = ref<Array<{ id: string; name: string; longitude: number; latitude: number }>>([
  { id: 'wp-1', name: '登陆站1', longitude: 0, latitude: 0 },
  { id: 'wp-2', name: '登陆站2', longitude: 0, latitude: 0 },
  { id: 'wp-3', name: '登陆站3', longitude: 0, latitude: 0 }
])

const gisPlanningRange = ref('')
const gisGridSize = ref('')
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
  } else {
    gisPlanningRange.value = coordStr
  }
}

const addWaypoint = () => {
  waypoints.value.push({
    id: `wp-${Date.now()}`,
    name: `登陆站${waypoints.value.length + 1}`,
    longitude: 0,
    latitude: 0
  })
}

const removeWaypoint = (id: string) => {
  if (waypoints.value.length > 2) {
    waypoints.value = waypoints.value.filter(w => w.id !== id)
  } else {
    appStore.showNotification({ type: 'warning', message: '多点规划至少需要2个站点' })
  }
}

// 切换规划模式
const setPlanningMode = (mode: 'point-to-point' | 'multi-point') => {
  planningMode.value = mode
}

const layerList = ref<LayerItem[]>([
  { key: 'elevation', label: '海洋高程图', checked: false, value: '' },
  { key: 'volcano', label: '海洋火山分布', checked: false, value: '' },
  { key: 'fishery', label: '海洋渔区分布', checked: false, value: '' },
  { key: 'slope', label: '海洋坡度图', checked: false, value: '' },
  { key: 'earthquake', label: '海洋地震分布', checked: false, value: '' },
  { key: 'shipping', label: '海洋航道图', checked: false, value: '' },
])

// 步骤3: 器件库
const deviceList = ref<DeviceItem[]>([])
const deviceFileInputRef = ref<HTMLInputElement | null>(null)

// 步骤4: 成本参数
// 路径规划成本
const routeCostList = ref<CostItem[]>([
  { id: 'r1', name: '轻型海缆单价', unit: '千元/km', price: 0 },
  { id: 'r2', name: '重型海缆单价', unit: '千元/km', price: 0 },
  { id: 'r3', name: '施工成本极大值', unit: '千元/km', price: 0 },
  { id: 'r4', name: '深浅分界值', unit: '米', price: 0 },
])
// 系统规划成本
const systemCostList = ref<CostItem[]>([
  { id: 's1', name: '光缆成本', unit: '元/km', price: 0 },
  { id: 's2', name: '中继器成本', unit: '元/个', price: 0 },
  { id: 's3', name: '分支器成本', unit: '元/个', price: 0 },
  { id: 's4', name: '岸上站点成本', unit: '元/个', price: 0 },
  { id: 's5', name: '施工成本', unit: '元/km', price: 0 },
])

// 重置表单
const resetForm = () => {
  currentStep.value = 1
  projectType.value = 'use'
  projectName.value = ''
  allowOtherUsers.value = false
  startStation.value = { name: '起点', longitude: 0, latitude: 0 }
  endStation.value = { name: '终点', longitude: 0, latitude: 0 }
  planningMode.value = 'point-to-point'
  waypoints.value = [
    { id: 'wp-1', name: '登陆站1', longitude: 0, latitude: 0 },
    { id: 'wp-2', name: '登陆站2', longitude: 0, latitude: 0 },
    { id: 'wp-3', name: '登陆站3', longitude: 0, latitude: 0 }
  ]
  gisPlanningRange.value = ''
  gisGridSize.value = ''
  isGisExpanded.value = false
  layerList.value.forEach(item => {
    item.checked = false
    item.value = ''
  })
  deviceList.value = []
  routeCostList.value = [
    { id: 'r1', name: '轻型海缆单价', unit: '千元/km', price: 0 },
    { id: 'r2', name: '重型海缆单价', unit: '千元/km', price: 0 },
    { id: 'r3', name: '施工成本极大值', unit: '千元/km', price: 0 },
    { id: 'r4', name: '深浅分界值', unit: '米', price: 0 },
  ]
  systemCostList.value = [
    { id: 's1', name: '光缆成本', unit: '元/km', price: 0 },
    { id: 's2', name: '中继器成本', unit: '元/个', price: 0 },
    { id: 's3', name: '分支器成本', unit: '元/个', price: 0 },
    { id: 's4', name: '岸上站点成本', unit: '元/个', price: 0 },
    { id: 's5', name: '施工成本', unit: '元/km', price: 0 },
  ]
}

watch(() => props.visible, (val) => {
  if (val) {
    resetForm()
  }
})

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

const goNext = () => {
  if (currentStep.value < steps.length && canGoNext.value) {
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

const handleLayerSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0 && currentBrowseItem.value) {
    currentBrowseItem.value.value = target.files[0].name
    currentBrowseItem.value.checked = true
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
    
    // 尝试解析 CSV 文件
    let parsedData: { fiberTypes?: any[]; amplifierTypes?: any[]; branchingUnitTypes?: any[] } | undefined
    
    if (file.name.endsWith('.csv')) {
      try {
        const text = await file.text()
        const lines = text.split('\n').map(line => line.trim()).filter(line => line)
        
        let currentSection = ''
        let headers: string[] = []
        const fiberTypes: any[] = []
        const amplifierTypes: any[] = []
        const branchingUnitTypes: any[] = []
        
        for (const line of lines) {
          if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1)
            headers = []
            continue
          }
          
          const values = line.split(',').map(v => v.trim())
          
          if (headers.length === 0) {
            headers = values
            continue
          }
          
          const row: Record<string, any> = {}
          headers.forEach((h, i) => {
            const val = values[i] || ''
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
              trunkInsertionLoss: row.trunkInsertionLoss || 0,
              branchInsertionLoss: row.branchInsertionLoss || 0,
              insertionLoss: row.insertionLoss || 0,
              wavelengthRange: row.wavelengthRange || 0,
            })
          }
        }
        
        if (fiberTypes.length > 0 || amplifierTypes.length > 0 || branchingUnitTypes.length > 0) {
          parsedData = { fiberTypes, amplifierTypes, branchingUnitTypes }
          appStore.showNotification({
            type: 'success',
            message: `解析成功：光纤${fiberTypes.length}种，放大器${amplifierTypes.length}种，分支器${branchingUnitTypes.length}种`
          })
        }
      } catch (err) {
        console.error('CSV解析失败:', err)
      }
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
    planningMode: planningMode.value,
    startStation: startStation.value,
    endStation: endStation.value,
    waypoints: waypoints.value,
    gisConfig: {
      planningRange: gisPlanningRange.value,
      gridSize: gisGridSize.value
    },
    layers: layerList.value.filter(l => l.checked),
    devices: deviceList.value,
    routeCosts: routeCostList.value.filter(c => c.price > 0),
    systemCosts: systemCostList.value.filter(c => c.price > 0),
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
      accept=".tif,.tiff,.geojson,.json"
      @change="handleLayerSelected"
    >
    <input
      ref="deviceFileInputRef"
      type="file"
      class="hidden"
      accept=".json,.xml,.csv"
      @change="handleDeviceFileSelected"
    >

    <div
      v-if="visible"
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-300"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-[900px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden transform transition-all scale-100">
        <!-- Header -->
        <div class="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div class="flex items-center gap-3 text-gray-800">
            <div class="p-2 bg-blue-50 rounded-lg text-blue-600">
              <FilePlus class="w-6 h-6" />
            </div>
            <div>
              <h3 class="font-bold text-xl">新建项目向导</h3>
              <p class="text-xs text-gray-400 mt-0.5">请按照步骤完成项目配置</p>
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

              <!-- GIS图层设置 (可折叠) -->
              <div class="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  class="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                  @click="isGisExpanded = !isGisExpanded"
                >
                  <div class="flex items-center gap-2 text-gray-800">
                    <MapPin class="w-4 h-4 text-blue-600" />
                    <span class="font-medium text-sm">GIS图层配置</span>
                    <span class="text-xs text-gray-500 ml-2" v-if="!isGisExpanded">
                      {{ layerList.filter(l => l.checked).length > 0 ? `已选 ${layerList.filter(l => l.checked).length} 个图层` : '(可选)' }}
                    </span>
                  </div>
                  <component :is="isGisExpanded ? ChevronUp : ChevronDown" class="w-4 h-4 text-gray-500" />
                </button>

                <div v-show="isGisExpanded" class="p-4 bg-white border-t border-gray-200 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div class="text-sm text-blue-800 bg-blue-50/50 p-3 rounded-lg border border-blue-100 mb-4">
                    <p class="text-blue-600/80 text-xs">选择并上传所需的地理信息图层，这些数据将用于路由规划的底图显示。</p>
                  </div>

                  <div class="grid grid-cols-2 gap-3">
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
                          @click="handleBrowseLayer(item)"
                        >
                          浏览
                        </button>
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
                      <div class="w-32 px-2">站点名称</div>
                      <div class="flex-1 px-2">经度</div>
                      <div class="flex-1 px-2">纬度</div>
                      <div class="w-32 text-center">操作</div>
                    </div>
                    <div class="max-h-[240px] overflow-y-auto">
                      <div
                        v-for="(wp, index) in waypoints"
                        :key="wp.id"
                        class="flex items-center px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                      >
                        <div class="w-8 text-center text-sm text-gray-500">{{ index + 1 }}</div>
                        <div class="w-32 px-2">
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
                        <div class="w-32 flex justify-center gap-2">
                          <Button size="sm" variant="ghost" class="h-7 w-7 p-0 text-blue-600" title="地图选点" @click="handleMapSelect('multi-point', wp.id)">
                            <MapPin class="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" class="h-7 w-7 p-0 text-red-500" title="删除站点" @click="removeWaypoint(wp.id)">
                            <Trash2 class="w-4 h-4" />
                          </Button>
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
                </div>
              </div>

              <div class="border-t border-gray-100 my-4"></div>

              <!-- GIS设置 -->
              <div>
                <div class="flex items-center gap-2 mb-4">
                  <div class="p-1.5 bg-blue-50 rounded text-blue-600">
                    <MapPin class="w-4 h-4" />
                  </div>
                  <h4 class="font-semibold text-gray-800">GIS设置</h4>
                </div>

                <div class="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-4">
                  <div class="space-y-3">
                    <div class="flex items-center gap-4">
                      <label class="w-20 text-sm font-medium text-gray-600 text-right shrink-0">规划范围</label>
                      <div class="flex-1 flex items-center gap-2">
                        <input
                          v-model="gisPlanningRange"
                          type="text"
                          placeholder="西北角：xxx.xx,xxx.xx，东南角：xxx.xx,xxx.xx"
                          class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                        >
                        <Button size="sm" variant="outline" class="h-9 px-3 text-xs bg-white" @click="handleMapSelect('range')">
                          地图选点
                        </Button>
                      </div>
                    </div>
                    <div class="flex items-center gap-4">
                      <label class="w-20 text-sm font-medium text-gray-600 text-right shrink-0">网格大小</label>
                      <input
                        v-model="gisGridSize"
                        type="text"
                        class="flex-1 px-3 py-2 text-sm border border-gray-200 rounded focus:border-blue-500 outline-none"
                      >
                    </div>
                  </div>
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
                您可以导入现有的器件库文件（JSON/XML/CSV），以便在项目中直接使用预设的设备参数。
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

          <!-- 步骤4: 成本参数 -->
          <div v-if="currentStep === 4" class="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
            <div class="max-w-4xl mx-auto">
              <div class="flex items-center justify-between mb-6">
                <div>
                  <h4 class="text-lg font-semibold text-gray-800">成本估算参数</h4>
                  <p class="text-sm text-gray-500 mt-1">设置基础单价，用于自动计算项目预估成本</p>
                </div>
                <Button variant="ghost" size="sm" class="text-gray-500" @click="goNext">
                  暂不设置，直接下一步
                </Button>
              </div>

              <!-- 路径规划成本 -->
              <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mb-6">
                <div class="px-6 py-3 bg-blue-50 border-b border-blue-100">
                  <h5 class="font-semibold text-blue-800 flex items-center gap-2">
                    <span class="w-1.5 h-4 bg-blue-500 rounded"></span>
                    路径规划成本
                  </h5>
                </div>
                <table class="w-full">
                  <thead class="bg-gray-50/80 border-b border-gray-200">
                    <tr>
                      <th class="px-6 py-3 text-left text-sm font-semibold text-gray-600 w-1/3">费用项目</th>
                      <th class="px-6 py-3 text-left text-sm font-semibold text-gray-600 w-1/4">计价单位</th>
                      <th class="px-6 py-3 text-left text-sm font-semibold text-gray-600">预估单价</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="cost in routeCostList" :key="cost.id" class="hover:bg-gray-50/50 transition-colors">
                      <td class="px-6 py-3">
                        <span class="font-medium text-gray-800">{{ cost.name }}</span>
                      </td>
                      <td class="px-6 py-3">
                        <span class="px-2.5 py-1 bg-blue-50 rounded text-xs text-blue-600 font-medium">{{ cost.unit }}</span>
                      </td>
                      <td class="px-6 py-3">
                        <div class="relative max-w-[200px]">
                          <input
                            v-model.number="cost.price"
                            type="number"
                            min="0"
                            placeholder="0"
                            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-right"
                          >
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- 系统规划成本 -->
              <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div class="px-6 py-3 bg-green-50 border-b border-green-100">
                  <h5 class="font-semibold text-green-800 flex items-center gap-2">
                    <span class="w-1.5 h-4 bg-green-500 rounded"></span>
                    系统规划成本
                  </h5>
                </div>
                <table class="w-full">
                  <thead class="bg-gray-50/80 border-b border-gray-200">
                    <tr>
                      <th class="px-6 py-3 text-left text-sm font-semibold text-gray-600 w-1/3">费用项目</th>
                      <th class="px-6 py-3 text-left text-sm font-semibold text-gray-600 w-1/4">计价单位</th>
                      <th class="px-6 py-3 text-left text-sm font-semibold text-gray-600">预估单价</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="cost in systemCostList" :key="cost.id" class="hover:bg-gray-50/50 transition-colors">
                      <td class="px-6 py-3">
                        <span class="font-medium text-gray-800">{{ cost.name }}</span>
                      </td>
                      <td class="px-6 py-3">
                        <span class="px-2.5 py-1 bg-green-50 rounded text-xs text-green-600 font-medium">{{ cost.unit }}</span>
                      </td>
                      <td class="px-6 py-3">
                        <div class="relative max-w-[200px]">
                          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                          <input
                            v-model.number="cost.price"
                            type="number"
                            min="0"
                            placeholder="0"
                            class="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-right"
                          >
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 步骤5: 完成 -->
          <div v-if="currentStep === 5" class="h-full flex flex-col items-center justify-center animate-in zoom-in-95 fade-in duration-500">
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
    @confirm="handleMapConfirm"
  />
</template>
