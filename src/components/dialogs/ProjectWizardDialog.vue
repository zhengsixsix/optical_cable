﻿<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FilePlus, X, Loader2, ChevronRight, ChevronLeft, Check, MapPin, Package, CheckCircle, ChevronDown, ChevronUp, Plus, Trash2, Route, GitCommit, Cable } from 'lucide-vue-next'
import { useAppStore, useSettingsStore } from '@/stores'
import { Button, Select } from '@/shared/components/base'
import MapSelectDialog from '@/modules/planning/dialogs/MapSelectDialog.vue'
import CableTypeCreateDialog from '@/modules/planning/dialogs/CableTypeCreateDialog.vue'

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

// 步骤定义
const steps = [
  { id: 1, title: '新建项目', icon: FilePlus, description: '填写项目基本信息' },
  { id: 2, title: '站点位置', icon: MapPin, description: 'GIS设置' },
  { id: 3, title: '器件库管理', icon: Package, description: '可选' },
  { id: 4, title: '完成', icon: CheckCircle, description: '确认创建' },
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
const waypoints = ref<Array<{ id: string; name: string; longitude: number; latitude: number; isUnderwater: boolean }>>([
  { id: 'wp-1', name: '登陆站1', longitude: 0, latitude: 0, isUnderwater: false },
  { id: 'wp-2', name: '登陆站2', longitude: 0, latitude: 0, isUnderwater: false },
  { id: 'wp-3', name: '登陆站3', longitude: 0, latitude: 0, isUnderwater: false }
])

// BU 配置列表（多点模式） - max_ports 对应 USE 文件规范
const buConfigs = ref<Array<{ id: string; name: string; longitude: number; latitude: number; max_ports: number }>>([])

// 铠装映射配置
const armorMappings = ref([
  { riskLevel: 'high', riskThreshold: '3', cableTypeName: 'DA (双铠装)', unitPrice: '24.0' },
  { riskLevel: 'medium', riskThreshold: '2', cableTypeName: 'SA (单铠装)', unitPrice: '19.5' },
  { riskLevel: 'low', riskThreshold: '0', cableTypeName: 'LW (轻型)', unitPrice: '15.0' },
])
const riskLevelLabels: Record<string, string> = { high: '高风险', medium: '中风险', low: '低风险' }

// 风险等级到铠装类型的映射
const riskToArmorType: Record<string, string[]> = {
  high: ['DA', 'RA'],     // 高风险 -> 双铠装/岩石铠装
  medium: ['SA'],         // 中风险 -> 单铠装
  low: ['LW', 'LWP']      // 低风险 -> 轻型/轻型保护
}

// 根据风险等级获取过滤后的缆型选项
const getFilteredCableOptions = (riskLevel: string) => {
  const armorTypes = riskToArmorType[riskLevel] || ['SA']
  const filteredCables = settingsStore.getCableTypesByArmor(armorTypes)
  return filteredCables
    .filter(c => c.name) // 过滤空 name
    .map(c => ({
      value: c.name,
      label: `${c.name} - ¥${c.unitPrice}千元/km`
    }))
}

// 新建缆型弹窗状态
const showCableTypeCreateDialog = ref(false)
const cableTypePresetArmor = ref('')

// 处理缆型选择
const handleCableTypeSelect = (mapping: { riskLevel: string; cableTypeName: string; unitPrice: string }, value: string) => {
  if (value === '__create_new__') {
    // 打开新建缆型弹窗，预设铠装类型
    const armorTypes = riskToArmorType[mapping.riskLevel]
    cableTypePresetArmor.value = armorTypes?.[0] || 'SA'
    showCableTypeCreateDialog.value = true
    return
  }
  // 更新缆型名称
  mapping.cableTypeName = value
  // 更新单价
  const cable = settingsStore.cableTypeDatabase.find(c => c.name === value)
  if (cable) {
    mapping.unitPrice = String(cable.unitPrice)
  }
}

// 铠装类型到风险等级的反向映射
const armorToRisk: Record<string, string> = {
  'DA': 'high',
  'RA': 'high',
  'SA': 'medium',
  'LW': 'low',
  'LWP': 'low'
}

// 处理缆型创建完成
const handleCableTypeCreated = (cableType: { id: string; name: string; armorType: string; unitPrice: number }) => {
  // 添加到 store 的缆型数据库
  settingsStore.addCableTypeSpec({
    id: cableType.id,
    name: cableType.name,
    armorType: cableType.armorType,
    unitPrice: cableType.unitPrice
  })

  // 根据铠装类型找到对应的映射行并更新
  const targetRisk = armorToRisk[cableType.armorType] || 'medium'
  const mapping = armorMappings.value.find(m => m.riskLevel === targetRisk)
  if (mapping) {
    mapping.cableTypeName = cableType.name
    mapping.unitPrice = String(cableType.unitPrice)
  }
}

// 冗余策略配置（多点模式）
const redundancyConfig = ref({
  enabled: false,
  costLimitType: 'relative' as 'relative' | 'absolute',
  relativeCostPercent: '30',
  absoluteCostLimit: ''
})
const costLimitTypeOptions = [
  { value: 'relative', label: '相对成本（%）' },
  { value: 'absolute', label: '绝对成本（万元）' }
]

// GIS 配置 - 与工程设置对齐
const gisConfig = ref({
  rangeMode: 'auto' as 'auto' | 'manual',
  nwLon: '',
  nwLat: '',
  seLon: '',
  seLat: '',
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
    // 格式: "nwLon,nwLat,seLon,seLat" 或者单点 "lon,lat"
    const parts = coordStr.split(',')
    if (parts.length >= 4) {
      gisConfig.value.nwLon = parts[0]
      gisConfig.value.nwLat = parts[1]
      gisConfig.value.seLon = parts[2]
      gisConfig.value.seLat = parts[3]
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
    { id: 'wp-1', name: '登陆站1', longitude: 0, latitude: 0, isUnderwater: false },
    { id: 'wp-2', name: '登陆站2', longitude: 0, latitude: 0, isUnderwater: false },
    { id: 'wp-3', name: '登陆站3', longitude: 0, latitude: 0, isUnderwater: false }
  ]
  buConfigs.value = []
  armorMappings.value = [
    { riskLevel: 'high', riskThreshold: '3', cableTypeName: 'DA (双铠装)', unitPrice: '24.0' },
    { riskLevel: 'medium', riskThreshold: '2', cableTypeName: 'SA (单铠装)', unitPrice: '19.5' },
    { riskLevel: 'low', riskThreshold: '0', cableTypeName: 'LW (轻型)', unitPrice: '15.0' },
  ]
  redundancyConfig.value = { enabled: false, costLimitType: 'relative', relativeCostPercent: '30', absoluteCostLimit: '' }
  gisConfig.value = { rangeMode: 'auto', nwLon: '', nwLat: '', seLon: '', seLat: '', gridResolution: '500' }
  isGisExpanded.value = false
  layerList.value.forEach(item => {
    item.checked = false
    item.value = ''
  })
  deviceList.value = []
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
              fiberCategory: row.fiberCategory || '',
              nonlinearCoeff: row.nonlinearCoeff || 0,
              effectiveArea: row.effectiveArea || 0,
              dispersion: row.dispersion || 0,
              dispersionSlope: row.dispersionSlope || 0,
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
              saturationPower: row.saturationPower || 0,
              gainRangePower: row.gainRangePower || 0,
              operatingMode: row.operatingMode || 'fixed_gain',
              unitPrice: row.unitPrice || 0,
              currency: row.currency || 'USD',
            })
          } else if (currentSection === 'BranchingUnitTypes' && row.name) {
            branchingUnitTypes.push({
              id: `bu-${Date.now()}-${branchingUnitTypes.length}`,
              name: row.name,
              portCount: row.portCount || 0,
              trunkInsertionLoss: row.trunkInsertionLoss || 0,
              branchInsertionLoss: row.branchInsertionLoss || 0,
              insertionLoss: row.trunkInsertionLoss || row.insertionLoss || 0,
              wavelengthRange: row.wavelengthRange || 0,
              unitPrice: row.unitPrice || 0,
              currency: row.currency || 'USD',
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
      } catch {
        // CSV 解析失败时静默处理，文件仍会被添加到列表
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
    armorMappings: armorMappings.value.map(m => ({
      riskLevel: m.riskLevel,
      riskThreshold: parseFloat(m.riskThreshold) || 0,
      cableTypeId: m.riskLevel,
      cableTypeName: m.cableTypeName,
      unitPrice: parseFloat(m.unitPrice) || 0
    })),
    redundancyConfig: {
      enabled: redundancyConfig.value.enabled,
      costLimitType: redundancyConfig.value.costLimitType,
      relativeCostPercent: redundancyConfig.value.costLimitType === 'relative' ? parseFloat(redundancyConfig.value.relativeCostPercent) || 30 : undefined,
      absoluteCostLimit: redundancyConfig.value.costLimitType === 'absolute' ? parseFloat(redundancyConfig.value.absoluteCostLimit) || undefined : undefined
    },
    gisConfig: {
      rangeMode: gisConfig.value.rangeMode,
      planningRange: gisConfig.value.rangeMode === 'manual' ? {
        northwest: {
          lon: parseFloat(gisConfig.value.nwLon) || 0,
          lat: parseFloat(gisConfig.value.nwLat) || 0
        },
        southeast: {
          lon: parseFloat(gisConfig.value.seLon) || 0,
          lat: parseFloat(gisConfig.value.seLat) || 0
        }
      } : null,
      gridResolution: parseFloat(gisConfig.value.gridResolution) || 500
    },
    layers: layerList.value.filter(l => l.checked),
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
                      <div class="w-28 px-2">站点名称</div>
                      <div class="flex-1 px-2">经度</div>
                      <div class="flex-1 px-2">纬度</div>
                      <div class="w-14 text-center">类型</div>
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
                        <div class="w-14 flex justify-center">
                          <button
                            class="px-1.5 py-0.5 text-xs rounded-full transition-colors"
                            :class="wp.isUnderwater 
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                              : 'bg-green-100 text-green-700 hover:bg-green-200'"
                            @click="wp.isUnderwater = !wp.isUnderwater"
                            :title="wp.isUnderwater ? '点击切换为岸上站点' : '点击切换为水下站点'"
                          >
                            {{ wp.isUnderwater ? '水下' : '岸上' }}
                          </button>
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
                              <input v-model="gisConfig.nwLon" placeholder="经度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
                              <input v-model="gisConfig.nwLat" placeholder="纬度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
                            </div>
                          </div>
                          <div class="space-y-1">
                            <span class="text-xs font-semibold text-gray-500 uppercase">东南角 (Bottom-Right)</span>
                            <div class="flex gap-2">
                              <input v-model="gisConfig.seLon" placeholder="经度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
                              <input v-model="gisConfig.seLat" placeholder="纬度" class="w-full h-8 px-2 text-xs font-mono border border-gray-200 rounded focus:border-blue-500 outline-none" />
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

              <!-- 海缆铠装映射配置 -->
              <div>
                <div class="flex items-center gap-2 mb-4">
                  <div class="p-1.5 bg-purple-50 rounded text-purple-600">
                    <Package class="w-4 h-4" />
                  </div>
                  <h4 class="font-semibold text-gray-800">海缆铠装映射</h4>
                </div>

                <div class="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                  <div v-for="mapping in armorMappings" :key="mapping.riskLevel" 
                       class="flex items-center gap-2 p-2 bg-white border rounded-lg hover:shadow-sm hover:border-gray-300 transition-all">
                    <!-- 风险等级标签 -->
                    <div class="w-16 shrink-0 flex flex-col items-center">
                      <span :class="[
                        'text-[11px] font-bold px-2 py-0.5 rounded-full w-full text-center',
                        mapping.riskLevel === 'high' ? 'bg-red-50 text-red-700' :
                        mapping.riskLevel === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-green-50 text-green-700'
                      ]">{{ riskLevelLabels[mapping.riskLevel] }}</span>
                      <span class="text-[9px] text-gray-400 mt-0.5">
                        {{ mapping.riskLevel === 'high' ? '风险≥ 3' : mapping.riskLevel === 'medium' ? '2≤风险<3' : '风险<2' }}
                      </span>
                    </div>
                    <!-- 缆型选择 -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1">
                        <Cable class="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <Select
                          :model-value="mapping.cableTypeName"
                          @update:model-value="(val) => handleCableTypeSelect(mapping, val)"
                          :options="[...getFilteredCableOptions(mapping.riskLevel), { value: '__create_new__', label: '➕ 新建缆型...' }]"
                          placeholder="选择缆型"
                          class="flex-1 h-7 text-sm"
                        />
                      </div>
                    </div>
                    <!-- 单价设置 -->
                    <div class="shrink-0 flex items-center gap-1">
                      <input v-model="mapping.unitPrice" type="number" class="w-16 h-7 px-1.5 text-sm border border-gray-200 rounded focus:border-purple-500 outline-none text-right" />
                      <span class="text-[11px] text-gray-500 w-14">千元/km</span>
                    </div>
                  </div>
                  <p class="text-xs text-gray-500">
                    <span class="text-purple-600 font-medium">提示：</span>根据风险值自动匹配铠装类型
                  </p>
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
                      <input type="checkbox" v-model="redundancyConfig.enabled" class="sr-only peer" />
                      <div class="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                    <span class="text-sm text-gray-500">{{ redundancyConfig.enabled ? '已启用' : '未启用' }}</span>
                  </div>
                  <template v-if="redundancyConfig.enabled">
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
                    冗余策略用于多点规划时为关键节点配置备份路径。
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
    @confirm="handleMapConfirm"
  />

  <!-- 新建缆型弹窗 -->
  <CableTypeCreateDialog
    :visible="showCableTypeCreateDialog"
    :preset-armor-type="cableTypePresetArmor"
    @close="showCableTypeCreateDialog = false"
    @created="handleCableTypeCreated"
  />
</template>
