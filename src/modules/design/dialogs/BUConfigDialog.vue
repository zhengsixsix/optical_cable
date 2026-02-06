<script setup lang="ts">
/**
 * BU 配置对话框
 * 
 * 用于拓扑编辑器中双击 BU 节点弹出的配置窗口
 * 包含三个步骤：
 * 1. 器件选择 - 选择 BU 器件并配置参数
 * 2. 主干分支配置 - 配置各方向的下一跳
 * 3. 配置预览 - 显示受影响链路和插损
 */

import { ref, computed, watch, reactive } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import { useSettingsStore, useConnectorStore, useAppStore, useRouteStore, useBUConfigStore } from '@/stores'
import { 
  X, ChevronDown, ChevronUp, Check, AlertCircle, 
  GitBranch, Save, Database
} from 'lucide-vue-next'
import type { ConnectorElement } from '@/types'
import { calculateDistance } from '@/utils/geo'

const props = defineProps<{
  visible: boolean
  buId: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', buId: string): void
}>()

const settingsStore = useSettingsStore()
const connectorStore = useConnectorStore()
const appStore = useAppStore()
const routeStore = useRouteStore()
const buConfigStore = useBUConfigStore()  // 使用共享的 BU 配置 store

// 当前编辑的 BU 元素
const currentBu = computed(() => {
  if (!props.buId) return null
  
  // 优先从 connectorStore 查找
  const fromConnector = connectorStore.elements.find(e => e.id === props.buId)
  if (fromConnector) return fromConnector
  
  // 否则从 routeStore 查找并转换格式
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute) {
    const point = selectedRoute.points.find(p => p.id === props.buId)
    if (point && point.type === 'branching') {
      // 计算 KP（使用 Haversine 公式）
      let kp = 0
      const idx = selectedRoute.points.indexOf(point)
      for (let i = 1; i <= idx; i++) {
        const prev = selectedRoute.points[i - 1]
        const curr = selectedRoute.points[i]
        kp += calculateDistance(prev.coordinates, curr.coordinates)
      }
      
      return {
        id: point.id,
        name: point.name || '分支器',
        type: 'bu' as any,
        kp,
        longitude: point.coordinates[0],
        latitude: point.coordinates[1],
        depth: (point as any).depth || 0,
        status: 'active' as any,
        specifications: '',
        remarks: '',
        buPortCount: 3,
        buTrunkLoss: 0.8,
        buBranchLoss: 3.5,
        buBranchTarget: point.branchTo?.name || '',
        componentRefId: ''
      } as any
    }
  }
  
  return null
})

// 折叠状态
const expandedSections = reactive({
  device: true,
  routing: true,
  preview: true
})

// ============ Step 1: 器件选择 ============
const selectedDeviceId = ref('')
const localParams = reactive({
  trunkLoss: 0.8,
  branchLoss: 3.5
})
const paramsModified = ref(false)

// BU 器件选项
const buDeviceOptions = computed(() => [
  { value: '', label: '-- 请选择 --' },
  ...settingsStore.branchingUnitTypes.map(b => ({
    value: b.id,
    label: `${b.name} - ${b.portCount}端口`
  }))
])

// 获取选中器件
const selectedDevice = computed(() => {
  if (!selectedDeviceId.value) return null
  return settingsStore.branchingUnitTypes.find(b => b.id === selectedDeviceId.value) || null
})

// 从器件加载参数
const loadParamsFromDevice = () => {
  if (selectedDevice.value) {
    localParams.trunkLoss = selectedDevice.value.trunkInsertionLoss
    localParams.branchLoss = selectedDevice.value.branchInsertionLoss
    paramsModified.value = false
  }
}

watch(selectedDeviceId, loadParamsFromDevice)

// 标记参数修改
const markModified = () => {
  paramsModified.value = true
}

// ============ Step 2: 主干分支配置 ============

// 获取所有可用的登陆站和 BU 节点
const allNodes = computed(() => {
  const nodes: Array<{ id: string; name: string; type: string; index: number }> = []
  
  // 优先从 routeStore 获取
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute && selectedRoute.points.length > 0) {
    const existsLandingByName = (name?: string) =>
      !!name && nodes.some(n => n.type === 'landing' && n.name === name)
    const existsLandingByCoord = (coord?: [number, number]) => {
      if (!coord) return false
      return nodes.some(n => (n as any).coord &&
        Math.abs((n as any).coord[0] - coord[0]) < 1e-6 &&
        Math.abs((n as any).coord[1] - coord[1]) < 1e-6
      )
    }
    
    let nodeIndex = 0
    selectedRoute.points.forEach((p, idx) => {
      if (p.type === 'landing' || p.type === 'branching') {
        nodes.push({
          id: p.id,
          name: p.name || (p.type === 'landing' ? `登陆站${nodeIndex + 1}` : `分支器`),
          type: p.type === 'landing' && (p as any).isBranchStation ? 'branch-landing' : p.type,
          index: nodeIndex++,
          ...(p.type === 'landing' ? { coord: p.coordinates } : {}),
          ...(p.type === 'landing' && (p as any).isBranchStation ? { branchFrom: (p as any).branchFrom } : {})
        })
        
        // 如果是分支器且有分支登陆站，紧跟其后添加
        if (p.type === 'branching' && p.branchTo) {
          if (!existsLandingByName(p.branchTo.name) && !existsLandingByCoord(p.branchTo.coord as [number, number])) {
            nodes.push({
              id: `branch-${p.id}`,
              name: p.branchTo.name || '分支登陆站',
              type: 'branch-landing',
              index: nodeIndex++
            })
          }
        }
      }
    })
  }
  
  // 如果 routeStore 没数据，回退到 connectorStore
  if (nodes.length === 0) {
    connectorStore.elements.forEach((e, idx) => {
      if (e.type === 'landing' || e.type === 'underwater' || e.type === 'bu') {
        nodes.push({
          id: e.id,
          name: e.name,
          type: e.type,
          index: idx
        })
      }
    })
  }
  
  console.log('[BU Config] allNodes:', nodes, 'buId:', props.buId)
  return nodes
})

// 当前 BU 在节点列表中的索引
const currentBuIndex = computed(() => {
  // 支持多种 ID 格式匹配
  const node = allNodes.value.find(n => 
    n.id === props.buId || 
    n.id === `branch-${props.buId}` ||
    (n.type === 'branching' && n.name === currentBu.value?.name)
  )
  console.log('[BU Config] currentBuIndex:', node?.index, 'found node:', node)
  return node ? node.index : -1
})

// 获取可用的下一跳选项
const getNextHopOptions = (direction: 'upstream' | 'downstream' | 'branch') => {
  const options: Array<{ value: string; label: string }> = []
  const nodes = allNodes.value
  const currentIdx = currentBuIndex.value
  
  console.log(`[BU Config] getNextHopOptions(${direction}): currentIdx=${currentIdx}, nodes count=${nodes.length}`)
  
  // 如果找不到当前 BU，返回所有可选节点
  if (currentIdx === -1) {
    console.log('[BU Config] currentIdx is -1, returning all landing nodes')
    nodes
      .filter(n => n.type === 'landing' || n.type === 'branching')
      .forEach(n => options.push({ value: n.id, label: n.name }))
    return options
  }
  
  if (direction === 'upstream') {
    // 上行：在当前 BU 之前的节点（排除其他 BU 的分支站）
    const upstream = nodes.filter(n => n.index < currentIdx && n.type !== 'branch-landing')
    console.log('[BU Config] upstream nodes:', upstream)
    upstream.reverse().forEach(n => options.push({ value: n.id, label: n.name }))
  } else if (direction === 'downstream') {
    // 下行：在当前 BU 之后的节点（排除 BU 自己的分支站）
    const downstream = nodes.filter(n => n.index > currentIdx && n.type !== 'branch-landing')
    console.log('[BU Config] downstream nodes:', downstream)
    downstream.forEach(n => options.push({ value: n.id, label: n.name }))
  } else {
    // 分支：优先使用 branch-landing
    const currentBuName = currentBu.value?.name
    const branchNodes = nodes.filter(n => 
      n.type === 'branch-landing' && (!(n as any).branchFrom || (n as any).branchFrom === currentBuName)
    )
    if (branchNodes.length > 0) {
      branchNodes.forEach(n => options.push({ value: n.id, label: n.name }))
    } else {
      // 添加所有登陆站作为备选
      nodes
        .filter(n => n.type === 'landing')
        .forEach(n => {
          if (!options.find(o => o.value === n.id)) {
            options.push({ value: n.id, label: n.name })
          }
        })
    }
  }
  
  console.log(`[BU Config] ${direction} options:`, options)
  return options
}

// 下一跳配置
const nextHopConfig = reactive({
  upstream: '',
  downstream: '',
  branch1: ''
})

// 端口数（决定分支数量）
const portCount = computed(() => {
  return selectedDevice.value?.portCount || currentBu.value?.buPortCount || 3
})

// ============ Step 3: 配置预览 ============

// 配置完整性检查
const isConfigComplete = computed(() => {
  // 必须选择器件
  if (!selectedDeviceId.value) return false
  
  // 主干上下行必须配置
  if (!nextHopConfig.upstream || !nextHopConfig.downstream) return false
  
  // 至少一个分支必须配置
  if (portCount.value >= 3 && !nextHopConfig.branch1) return false
  
  return true
})

// 受影响的链路
const affectedLinks = computed(() => {
  const links: Array<{ 
    name: string
    path: string
    loss: number
  }> = []
  
  // 从 allNodes 查找节点（而不是 connectorStore）
  const upstream = allNodes.value.find(n => n.id === nextHopConfig.upstream)
  const downstream = allNodes.value.find(n => n.id === nextHopConfig.downstream)
  const branch1 = allNodes.value.find(n => n.id === nextHopConfig.branch1)
  
  // 主干直通
  if (upstream && downstream) {
    links.push({
      name: `${upstream.name} ⇄ ${downstream.name}`,
      path: '主干直通',
      loss: localParams.trunkLoss
    })
  }
  
  // 主干到分支
  if (upstream && branch1) {
    links.push({
      name: `${upstream.name} ⇄ ${branch1.name}`,
      path: '主干→分支',
      loss: localParams.branchLoss
    })
  }
  
  if (downstream && branch1) {
    links.push({
      name: `${downstream.name} ⇄ ${branch1.name}`,
      path: '主干→分支',
      loss: localParams.branchLoss
    })
  }
  
  return links
})

// ============ 保存配置 ============
const saveConfig = () => {
  if (!props.buId || !currentBu.value) return
  
  // 保存到共享的 BU 配置 store
  buConfigStore.saveConfig(props.buId, {
    componentRefId: selectedDeviceId.value,
    buTrunkLoss: localParams.trunkLoss,
    buBranchLoss: localParams.branchLoss,
    buNextHopUpstream: nextHopConfig.upstream,
    buNextHopDownstream: nextHopConfig.downstream,
    buNextHopBranch1: nextHopConfig.branch1
  })
  
  // 同时尝试更新 connectorStore（如果元素存在）
  const existsInConnector = connectorStore.elements.find(e => e.id === props.buId)
  if (existsInConnector) {
    const branchNode = allNodes.value.find(n => n.id === nextHopConfig.branch1)
    connectorStore.updateElement(props.buId, {
      componentRefId: selectedDeviceId.value,
      buPortCount: portCount.value,
      buTrunkLoss: localParams.trunkLoss,
      buBranchLoss: localParams.branchLoss,
      buNextHopUpstream: nextHopConfig.upstream,
      buNextHopDownstream: nextHopConfig.downstream,
      buBranchTarget: branchNode?.name || ''
    })
  }
  
  appStore.showNotification({ type: 'success', message: `BU ${currentBu.value.name} 配置已保存` })
  emit('save', props.buId)
  emit('close')
}

// 保存到器件库
const saveToLibrary = () => {
  if (!selectedDevice.value) return
  
  // 创建新的器件类型
  const newDevice = {
    id: `bu-${Date.now()}`,
    name: `${selectedDevice.value.name} (派生)`,
    portCount: portCount.value,
    trunkInsertionLoss: localParams.trunkLoss,
    branchInsertionLoss: localParams.branchLoss,
    insertionLoss: localParams.trunkLoss,
    wavelengthRange: selectedDevice.value.wavelengthRange
  }
  
  settingsStore.addBranchingUnitType(newDevice)
  selectedDeviceId.value = newDevice.id
  paramsModified.value = false
  
  appStore.showNotification({ type: 'success', message: '新器件已保存到器件库' })
}

// 器件库选择对话框
const showDeviceLibraryDialog = ref(false)

const openDeviceLibrary = () => {
  showDeviceLibraryDialog.value = true
}

const selectFromLibrary = (deviceId: string) => {
  selectedDeviceId.value = deviceId
  loadParamsFromDevice()
  showDeviceLibraryDialog.value = false
  appStore.showNotification({ type: 'success', message: '已选择器件' })
}

// 新建器件
const showNewDeviceDialog = ref(false)
const newDeviceName = ref('')
const newDevicePortCount = ref('3')

const openNewDeviceDialog = () => {
  newDeviceName.value = 'BU-新器件'
  newDevicePortCount.value = '3'
  showNewDeviceDialog.value = true
}

const createNewDevice = () => {
  if (!newDeviceName.value) {
    appStore.showNotification({ type: 'warning', message: '请输入器件名称' })
    return
  }
  
  const newDevice = {
    id: `bu-${Date.now()}`,
    name: newDeviceName.value,
    portCount: parseInt(newDevicePortCount.value),
    trunkInsertionLoss: 0.8,
    branchInsertionLoss: 3.5,
    insertionLoss: 0.8,
    wavelengthRange: 1550  // 工作波长 (nm)
  }
  
  settingsStore.addBranchingUnitType(newDevice)
  selectedDeviceId.value = newDevice.id
  loadParamsFromDevice()
  showNewDeviceDialog.value = false
  
  appStore.showNotification({ type: 'success', message: `器件 "${newDeviceName.value}" 已创建` })
}

// 初始化
watch(() => props.visible, (visible) => {
  if (visible && props.buId) {
    console.log('[BU Config] Dialog opened, buId:', props.buId)
    
    // 优先从共享的 store 加载
    const cached = buConfigStore.getConfig(props.buId)
    console.log('[BU Config] buConfigStore:', cached)
    
    if (cached) {
      console.log('[BU Config] Loading from store:', cached)
      selectedDeviceId.value = cached.componentRefId || ''
      localParams.trunkLoss = cached.buTrunkLoss || 0.8
      localParams.branchLoss = cached.buBranchLoss || 3.5
      nextHopConfig.upstream = cached.buNextHopUpstream || ''
      nextHopConfig.downstream = cached.buNextHopDownstream || ''
      nextHopConfig.branch1 = cached.buNextHopBranch1 || ''
    } else if (currentBu.value) {
      // 否则从 currentBu 加载（新打开时）
      console.log('[BU Config] Loading from currentBu')
      selectedDeviceId.value = currentBu.value.componentRefId || ''
      localParams.trunkLoss = currentBu.value.buTrunkLoss || 0.8
      localParams.branchLoss = currentBu.value.buBranchLoss || 3.5
      nextHopConfig.upstream = (currentBu.value as any).buNextHopUpstream || ''
      nextHopConfig.downstream = (currentBu.value as any).buNextHopDownstream || ''
      
      // 从分支目标名称反查 ID
      const branchTargetName = currentBu.value.buBranchTarget
      if (branchTargetName) {
        const branchTarget = allNodes.value.find(n => n.name === branchTargetName)
        nextHopConfig.branch1 = branchTarget?.id || ''
      } else {
        nextHopConfig.branch1 = ''
      }
    }
    
    paramsModified.value = false
  }
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible && currentBu" 
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="$emit('close')"
    >
      <div class="bg-white rounded-xl shadow-2xl w-[600px] max-h-[85vh] flex flex-col">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-xl">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <GitBranch class="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">BU 配置 - {{ currentBu.name }}</h2>
              <p class="text-xs text-gray-500">KP {{ currentBu.kp.toFixed(1) }} km</p>
            </div>
          </div>
          <button 
            class="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            @click="$emit('close')"
          >
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <!-- 内容区 -->
        <div class="flex-1 overflow-auto p-6 space-y-4">
          <!-- Step 1: 器件选择 -->
          <div class="border rounded-lg">
            <button 
              class="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 rounded-t-lg"
              @click="expandedSections.device = !expandedSections.device"
            >
              <span class="font-medium text-gray-800 flex items-center gap-2">
                <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center">1</span>
                器件选择
              </span>
              <component :is="expandedSections.device ? ChevronUp : ChevronDown" class="w-5 h-5 text-gray-400" />
            </button>
            
            <div v-if="expandedSections.device" class="p-4 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">当前器件：</label>
                <Select v-model="selectedDeviceId" :options="buDeviceOptions" class="w-full" />
              </div>
              
              <!-- 器件参数 -->
              <div v-if="selectedDeviceId" class="bg-gray-50 rounded-lg p-4">
                <div class="text-sm font-medium text-gray-700 mb-3">器件参数</div>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b">
                      <th class="text-left py-2 text-gray-500 font-medium">参数名称</th>
                      <th class="text-left py-2 text-gray-500 font-medium">数值</th>
                      <th class="text-left py-2 text-gray-500 font-medium">单位</th>
                      <th class="text-left py-2 text-gray-500 font-medium">来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="border-b border-gray-100">
                      <td class="py-2">主干插损 (thru_loss)</td>
                      <td class="py-2">
                        <Input 
                          v-model.number="localParams.trunkLoss" 
                          type="number"
                          step="0.1"
                          class="w-24"
                          @input="markModified"
                        />
                      </td>
                      <td class="py-2 text-gray-500">dB</td>
                      <td class="py-2">
                        <span 
                          class="text-xs px-2 py-0.5 rounded"
                          :class="paramsModified ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'"
                        >
                          {{ paramsModified ? '已修改' : '器件库' }}
                        </span>
                      </td>
                    </tr>
                    <tr class="border-b border-gray-100">
                      <td class="py-2">分支插损 (branch_loss)</td>
                      <td class="py-2">
                        <Input 
                          v-model.number="localParams.branchLoss" 
                          type="number"
                          step="0.1"
                          class="w-24"
                          @input="markModified"
                        />
                      </td>
                      <td class="py-2 text-gray-500">dB</td>
                      <td class="py-2">
                        <span 
                          class="text-xs px-2 py-0.5 rounded"
                          :class="paramsModified ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'"
                        >
                          {{ paramsModified ? '已修改' : '器件库' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div class="flex gap-2">
                <Button variant="outline" size="sm" @click="openDeviceLibrary">
                  <Database class="w-4 h-4 mr-1" /> 从器件库选择...
                </Button>
                <Button variant="outline" size="sm" @click="openNewDeviceDialog">新建器件...</Button>
                <Button 
                  v-if="paramsModified" 
                  variant="outline" 
                  size="sm"
                  @click="saveToLibrary"
                >
                  <Save class="w-4 h-4 mr-1" /> 保存到器件库
                </Button>
              </div>
            </div>
          </div>
          
          <!-- Step 2: 主干分支配置 -->
          <div class="border rounded-lg">
            <button 
              class="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50"
              @click="expandedSections.routing = !expandedSections.routing"
            >
              <span class="font-medium text-gray-800 flex items-center gap-2">
                <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center">2</span>
                主干分支配置
              </span>
              <component :is="expandedSections.routing ? ChevronUp : ChevronDown" class="w-5 h-5 text-gray-400" />
            </button>
            
            <div v-if="expandedSections.routing" class="p-4">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b">
                    <th class="text-left py-2 text-gray-500 font-medium">方向</th>
                    <th class="text-left py-2 text-gray-500 font-medium">路径类型</th>
                    <th class="text-left py-2 text-gray-500 font-medium">下一跳</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 font-medium">主干上行</td>
                    <td class="py-2 text-gray-500">主干</td>
                    <td class="py-2">
                      <Select 
                        v-model="nextHopConfig.upstream" 
                        :options="getNextHopOptions('upstream')"
                        class="w-40"
                      />
                    </td>
                  </tr>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 font-medium">主干下行</td>
                    <td class="py-2 text-gray-500">主干</td>
                    <td class="py-2">
                      <Select 
                        v-model="nextHopConfig.downstream" 
                        :options="getNextHopOptions('downstream')"
                        class="w-40"
                      />
                    </td>
                  </tr>
                  <tr v-if="portCount >= 3" class="border-b border-gray-100">
                    <td class="py-2 font-medium">分支1</td>
                    <td class="py-2 text-gray-500">分支</td>
                    <td class="py-2">
                      <Select 
                        v-model="nextHopConfig.branch1" 
                        :options="getNextHopOptions('branch')"
                        class="w-40"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              
              <div class="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-start gap-2">
                <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>💡 下一跳：到达该方向的下一个 BU 或 登陆站</span>
              </div>
            </div>
          </div>
          
          <!-- Step 3: 配置预览 -->
          <div class="border rounded-lg">
            <button 
              class="w-full px-4 py-3 flex items-center justify-between text-left bg-gray-50 rounded-b-lg"
              @click="expandedSections.preview = !expandedSections.preview"
            >
              <span class="font-medium text-gray-800 flex items-center gap-2">
                <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center">3</span>
                配置预览
              </span>
              <component :is="expandedSections.preview ? ChevronUp : ChevronDown" class="w-5 h-5 text-gray-400" />
            </button>
            
            <div v-if="expandedSections.preview" class="p-4 space-y-4">
              <!-- 配置状态 -->
              <div 
                class="flex items-center gap-2 text-sm"
                :class="isConfigComplete ? 'text-green-600' : 'text-amber-600'"
              >
                <component :is="isConfigComplete ? Check : AlertCircle" class="w-4 h-4" />
                {{ isConfigComplete ? '✅ 配置完整' : '⚠️ 配置不完整，请完成所有必填项' }}
              </div>
              
              <!-- 受影响链路 -->
              <div v-if="affectedLinks.length > 0">
                <div class="text-sm text-gray-700 mb-2">此 BU 将影响以下链路：</div>
                <table class="w-full text-sm border rounded-lg overflow-hidden">
                  <thead class="bg-gray-100">
                    <tr>
                      <th class="text-left px-3 py-2 text-gray-600">链路</th>
                      <th class="text-left px-3 py-2 text-gray-600">经过路径</th>
                      <th class="text-left px-3 py-2 text-gray-600">插损</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="link in affectedLinks" :key="link.name" class="border-t">
                      <td class="px-3 py-2">{{ link.name }}</td>
                      <td class="px-3 py-2 text-gray-500">{{ link.path }}</td>
                      <td class="px-3 py-2 font-mono">{{ link.loss.toFixed(1) }} dB</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div v-else class="text-sm text-gray-500 text-center py-4">
                请先完成下一跳配置以查看受影响链路
              </div>
            </div>
          </div>
        </div>
        
        <!-- 底部按钮 -->
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <Button variant="outline" @click="$emit('close')">取消</Button>
          <Button :disabled="!isConfigComplete" @click="saveConfig">
            <Check class="w-4 h-4 mr-1" /> 确认保存
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
  
  <!-- 新建器件对话框 -->
  <Teleport to="body">
    <div 
      v-if="showNewDeviceDialog" 
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1001]"
      @click.self="showNewDeviceDialog = false"
    >
      <div class="bg-white rounded-lg shadow-xl w-[400px]">
        <div class="px-4 py-3 border-b flex items-center justify-between">
          <h3 class="font-semibold text-gray-800">新建 BU 器件</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="showNewDeviceDialog = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">器件名称</label>
            <Input v-model="newDeviceName" class="w-full" placeholder="输入器件名称" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">端口数</label>
<Select 
              v-model="newDevicePortCount" 
              :options="[
                { value: '3', label: '3端口（主干2 + 分支1）' },
                { value: '4', label: '4端口（主干2 + 分支2）' },
                { value: '5', label: '5端口（主干2 + 分支3）' }
              ]" 
              class="w-full" 
            />
          </div>
          <div class="text-xs text-gray-500">
            创建后可在上方编辑主干插损和分支插损参数
          </div>
        </div>
        <div class="px-4 py-3 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="showNewDeviceDialog = false">取消</Button>
          <Button size="sm" @click="createNewDevice">创建</Button>
        </div>
      </div>
    </div>
  </Teleport>
  
  <!-- 器件库选择对话框 -->
  <Teleport to="body">
    <div 
      v-if="showDeviceLibraryDialog" 
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1001]"
      @click.self="showDeviceLibraryDialog = false"
    >
      <div class="bg-white rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col">
        <div class="px-4 py-3 border-b flex items-center justify-between">
          <h3 class="font-semibold text-gray-800">从器件库选择 BU</h3>
          <button class="text-gray-400 hover:text-gray-600" @click="showDeviceLibraryDialog = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <div v-if="settingsStore.branchingUnitTypes.length === 0" class="text-center py-8 text-gray-500">
            器件库中暂无 BU 器件，请先新建
          </div>
          <div v-else class="space-y-2">
            <div 
              v-for="device in settingsStore.branchingUnitTypes" 
              :key="device.id"
              class="p-3 border rounded-lg cursor-pointer transition-colors"
              :class="selectedDeviceId === device.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-400'"
              @click="selectFromLibrary(device.id)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium text-gray-800">{{ device.name }}</div>
                  <div class="text-xs text-gray-500">{{ device.portCount }} 端口</div>
                </div>
                <div class="text-right text-xs">
                  <div>主干插损: {{ device.trunkInsertionLoss }} dB</div>
                  <div>分支插损: {{ device.branchInsertionLoss }} dB</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="px-4 py-3 border-t flex justify-end">
          <Button variant="outline" size="sm" @click="showDeviceLibraryDialog = false">关闭</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
