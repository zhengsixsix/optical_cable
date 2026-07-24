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

import { useAppStore } from '@/stores/app'
import { useBUConfigStore } from '@/stores/buConfig'
import { useConnectorStore } from '@/stores/connector'
import { ref, computed, watch, reactive } from 'vue'
import { Button, Select, Input } from '@/shared/components/base'
import { useSettingsStore } from '@/stores/settings'
import { 
  X, ChevronDown, ChevronUp, Check, AlertCircle, 
  GitBranch, Database
} from 'lucide-vue-next'
import {
  getDeviceLibrariesByCategory,
  type RuntimeBranchingLibrary,
  toRuntimeBranchingLibrary,
} from '@/services/platform/deviceRuntime'

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
const buConfigStore = useBUConfigStore()  // 使用共享的 BU 配置 store

const platformBranchingLibraries = computed(() =>
  getDeviceLibrariesByCategory(settingsStore.platformDeviceLibraries, 'branching')
    .map(toRuntimeBranchingLibrary)
    .filter((item): item is RuntimeBranchingLibrary => Boolean(item)),
)

// 当前编辑的 BU 元素
const currentBu = computed(() => {
  if (!props.buId) return null
  return connectorStore.elements.find(element => element.id === props.buId && element.type === 'bu') || null
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
  trunkLoss: Number.NaN,
  branchLoss: Number.NaN,
})
const paramsModified = ref(false)

// BU 器件选项
const buDeviceOptions = computed(() => [
  { value: '', label: '-- 请选择 --' },
  ...platformBranchingLibraries.value.map(b => ({
    value: b.id,
    label: `${b.name} - ${b.portCount}端口`
  }))
])

// 获取选中器件
const selectedDevice = computed(() => {
  if (!selectedDeviceId.value) return null
  return platformBranchingLibraries.value.find(b => b.id === selectedDeviceId.value) || null
})

// 从器件加载参数
const loadParamsFromDevice = () => {
  if (selectedDevice.value) {
    localParams.trunkLoss = selectedDevice.value.trunkInsertionLoss
    localParams.branchLoss = selectedDevice.value.branchInsertionLoss
    paramsModified.value = false
  } else {
    localParams.trunkLoss = Number.NaN
    localParams.branchLoss = Number.NaN
  }
}

watch(selectedDeviceId, loadParamsFromDevice)

// 标记参数修改
const markModified = () => {
  paramsModified.value = true
}

// ============ Step 2: 主干分支配置 ============

// 下一跳只列出接线元中明确存在的设备。
const allNodes = computed(() => {
  return connectorStore.elements
    .filter(element => element.id !== props.buId
      && (element.type === 'landing' || element.type === 'underwater' || element.type === 'bu'))
    .map(element => ({ id: element.id, name: element.name, type: element.type }))
})

// 获取可用的下一跳选项
const getNextHopOptions = (_direction: 'upstream' | 'downstream' | 'branch') =>
  allNodes.value.map(node => ({ value: node.id, label: node.name }))

// 下一跳配置
const nextHopConfig = reactive({
  upstream: '',
  downstream: '',
  branch1: ''
})

// 端口数（决定分支数量）
const portCount = computed(() => {
  return selectedDevice.value?.portCount ?? currentBu.value?.buPortCount ?? Number.NaN
})

// ============ Step 3: 配置预览 ============

// 配置完整性检查
const isConfigComplete = computed(() => {
  // 必须选择器件
  if (!selectedDeviceId.value) return false
  if (!Number.isInteger(portCount.value) || portCount.value < 2) return false
  if (!Number.isFinite(localParams.trunkLoss) || localParams.trunkLoss < 0) return false
  if (!Number.isFinite(localParams.branchLoss) || localParams.branchLoss < 0) return false
  
  const requiredHopIds = [
    nextHopConfig.upstream,
    nextHopConfig.downstream,
    ...(portCount.value >= 3 ? [nextHopConfig.branch1] : []),
  ]
  const availableNodeIds = new Set(allNodes.value.map(node => node.id))
  if (requiredHopIds.some(id => !id || id === props.buId || !availableNodeIds.has(id))) return false
  if (new Set(requiredHopIds).size !== requiredHopIds.length) return false
  
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
  if (!props.buId || !currentBu.value || !isConfigComplete.value) return
  
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

// 初始化
watch(() => props.visible, async (visible) => {
  if (visible && props.buId) {
    if (settingsStore.platformDeviceLibraries.length === 0) {
      await settingsStore.loadPlatformDeviceLibraries()
    }

    // 优先从共享的 store 加载
    const cached = buConfigStore.getConfig(props.buId)
    
    if (cached) {
      selectedDeviceId.value = cached.componentRefId || ''
      localParams.trunkLoss = cached.buTrunkLoss ?? Number.NaN
      localParams.branchLoss = cached.buBranchLoss ?? Number.NaN
      nextHopConfig.upstream = cached.buNextHopUpstream || ''
      nextHopConfig.downstream = cached.buNextHopDownstream || ''
      nextHopConfig.branch1 = cached.buNextHopBranch1 || ''
    } else if (currentBu.value) {
      // 否则从 currentBu 加载（新打开时）
      selectedDeviceId.value = currentBu.value.componentRefId || ''
      localParams.trunkLoss = currentBu.value.buTrunkLoss ?? Number.NaN
      localParams.branchLoss = currentBu.value.buBranchLoss ?? Number.NaN
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
          <div v-if="platformBranchingLibraries.length === 0" class="text-center py-8 text-gray-500">
            器件库中暂无 BU 器件，请先新建
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="device in platformBranchingLibraries"
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
