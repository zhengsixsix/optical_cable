<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { Card, CardHeader, CardContent, Select, Input, Button } from '@/shared/components/base'
import { useConnectorStore, useSettingsStore, useAppStore } from '@/stores'
import { GitBranch, Wrench, Cpu, AlertTriangle } from 'lucide-vue-next'
import type { ConnectorElement } from '@/types'
import type { ComponentModelParamsConfig } from '@/types/useFile'
import { useDerivedDevice, isDerivedInstance } from '@/composables'
import ModelParamsDrawer from '@/shared/components/forms/ModelParamsDrawer.vue'

const connectorStore = useConnectorStore()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const { isComponentModified, createDerivedComponent } = useDerivedDevice()

// 模型参数抽屉状态
const showModelParamsDrawer = ref(false)
const currentEditingBu = ref<ConnectorElement | null>(null)

const buElements = computed(() =>
  connectorStore.elements.filter(e => e.type === 'bu')
)

const buTypeOptions = computed(() => ([
  { value: '', label: '-- 请选择 --' },
  ...settingsStore.branchingUnitTypes.map(b => ({ 
    value: b.id, 
    label: isDerivedInstance(b.id) ? `${b.name}` : b.name 
  }))
]))

const getBuModel = (elem: ConnectorElement) => {
  if (!elem.componentRefId) return null
  return settingsStore.branchingUnitTypes.find(b => b.id === elem.componentRefId) || null
}

const getPortCount = (elem: ConnectorElement) => {
  return elem.buPortCount ?? getBuModel(elem)?.portCount ?? ''
}

const getTrunkLoss = (elem: ConnectorElement) => {
  return elem.buTrunkLoss ?? getBuModel(elem)?.trunkInsertionLoss ?? ''
}

const getBranchLoss = (elem: ConnectorElement) => {
  return elem.buBranchLoss ?? getBuModel(elem)?.branchInsertionLoss ?? ''
}

// 检查 BU 参数是否已修改
const isBuModified = (elem: ConnectorElement) => {
  const model = getBuModel(elem)
  if (!model) return false
  
  // 检查基本参数是否偏离默认值
  if (elem.buPortCount !== undefined && elem.buPortCount !== model.portCount) return true
  if (elem.buTrunkLoss !== undefined && elem.buTrunkLoss !== model.trunkInsertionLoss) return true
  if (elem.buBranchLoss !== undefined && elem.buBranchLoss !== model.branchInsertionLoss) return true
  
  return false
}

const updateBuField = (id: string, patch: Partial<ConnectorElement>) => {
  connectorStore.updateElement(id, patch)
}

const updateBuNumber = (id: string, field: 'buPortCount' | 'buTrunkLoss' | 'buBranchLoss', value: string | number) => {
  if (value === '' || value === null || typeof value === 'undefined') {
    connectorStore.updateElement(id, { [field]: undefined })
    return
  }
  const numValue = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(numValue)) return
  connectorStore.updateElement(id, { [field]: numValue })
}

const applyModelDefaults = (elem: ConnectorElement, force = false) => {
  const model = getBuModel(elem)
  if (!model) return
  const patch: Partial<ConnectorElement> = {}
  if (force || typeof elem.buPortCount === 'undefined') patch.buPortCount = model.portCount
  if (force || typeof elem.buTrunkLoss === 'undefined') patch.buTrunkLoss = model.trunkInsertionLoss
  if (force || typeof elem.buBranchLoss === 'undefined') patch.buBranchLoss = model.branchInsertionLoss
  if (Object.keys(patch).length > 0) {
    connectorStore.updateElement(elem.id, patch)
  }
}

// 打开模型参数配置抽屉
const openModelParams = (elem: ConnectorElement) => {
  currentEditingBu.value = elem
  showModelParamsDrawer.value = true
}

// 保存模型参数
const handleModelParamsSave = (params: Record<string, ComponentModelParamsConfig>) => {
  if (!currentEditingBu.value) return
  
  const elem = currentEditingBu.value
  const model = getBuModel(elem)
  
  if (model) {
    // 检查是否需要创建派生实例
    const originalParams = (model as any).model_params || {}
    const hasChanges = JSON.stringify(params) !== JSON.stringify(originalParams)
    
    if (hasChanges && !isDerivedInstance(model.id)) {
      // 创建派生实例
      const derivedId = createDerivedComponent(model.id, {}, params)
      // 更新 BU 的引用
      connectorStore.updateElement(elem.id, { componentRefId: derivedId })
      appStore.showNotification({ 
        type: 'info', 
        message: `已创建派生实例: ${model.name} [派生]` 
      })
    }
  }
  
  showModelParamsDrawer.value = false
  currentEditingBu.value = null
}

// 获取 BU 支持的模型列表
const getBuSupportedModels = (elem: ConnectorElement) => {
  const model = getBuModel(elem)
  if (!model) return ['bu_loss_model']
  return (model as any).supported_models || ['bu_loss_model']
}

// 获取 BU 的模型参数
const getBuModelParams = (elem: ConnectorElement): Record<string, ComponentModelParamsConfig> => {
  const model = getBuModel(elem)
  if (!model) return {}
  return (model as any).model_params || {}
}

watchEffect(() => {
  buElements.value.forEach(elem => {
    applyModelDefaults(elem, false)
  })
})
</script>

<template>
  <Card class="flex-shrink-0">
    <CardHeader class="pb-2">
      <span class="font-semibold text-sm flex items-center gap-2">
        <GitBranch class="w-4 h-4 text-purple-500" />
        BU 配置
      </span>
    </CardHeader>
    <CardContent class="pt-0">
      <div v-if="buElements.length === 0" class="text-xs text-gray-400 py-4 text-center">
        当前链路暂无分支器
      </div>
      <div v-else class="space-y-3 max-h-[260px] overflow-auto pr-1">
        <div
          v-for="bu in buElements"
          :key="bu.id"
          class="border rounded-md p-3 bg-white"
          :class="isBuModified(bu) ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="text-sm font-semibold text-gray-800">{{ bu.name }}</div>
              <span 
                v-if="isBuModified(bu)" 
                class="text-[10px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"
              >
                <AlertTriangle class="w-3 h-3" />
                已修改
              </span>
            </div>
            <div class="text-[10px] text-gray-500">KP {{ bu.kp.toFixed(1) }} · {{ (bu.depth ?? 0).toFixed(0) }}m</div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="col-span-2">
              <label class="block text-[11px] text-gray-500 mb-1">BU 型号</label>
              <Select
                :model-value="bu.componentRefId || ''"
                :options="buTypeOptions"
                @update:model-value="updateBuField(bu.id, { componentRefId: $event || '' })"
              />
            </div>
            <div>
              <label class="block text-[11px] text-gray-500 mb-1">端口数</label>
              <Input
                type="number"
                :model-value="getPortCount(bu)"
                @update:model-value="updateBuNumber(bu.id, 'buPortCount', $event)"
              />
            </div>
            <div>
              <label class="block text-[11px] text-gray-500 mb-1">主干插损 (dB)</label>
              <Input
                type="number"
                :model-value="getTrunkLoss(bu)"
                @update:model-value="updateBuNumber(bu.id, 'buTrunkLoss', $event)"
              />
            </div>
            <div>
              <label class="block text-[11px] text-gray-500 mb-1">分支插损 (dB)</label>
              <Input
                type="number"
                :model-value="getBranchLoss(bu)"
                @update:model-value="updateBuNumber(bu.id, 'buBranchLoss', $event)"
              />
            </div>
            <div class="col-span-2">
              <label class="block text-[11px] text-gray-500 mb-1">分支目标站点</label>
              <Input
                :model-value="bu.buBranchTarget || ''"
                placeholder="输入分支目标站点名称"
                @update:model-value="updateBuField(bu.id, { buBranchTarget: String($event || '') })"
              />
            </div>
            <div class="col-span-2">
              <label class="block text-[11px] text-gray-500 mb-1">备注</label>
              <Input
                :model-value="bu.remarks || ''"
                placeholder="备注/说明"
                @update:model-value="updateBuField(bu.id, { remarks: String($event || '') })"
              />
            </div>
          </div>
          <div class="flex justify-end mt-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              class="text-xs"
              :disabled="!bu.componentRefId" 
              @click="openModelParams(bu)"
            >
              <Cpu class="w-3.5 h-3.5 mr-1" />
              模型参数
            </Button>
            <Button variant="outline" size="sm" class="text-xs" @click="applyModelDefaults(bu, true)">
              <Wrench class="w-3.5 h-3.5 mr-1" />
              应用默认值
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
  
  <!-- 模型参数配置抽屉 -->
  <ModelParamsDrawer
    v-if="currentEditingBu"
    :visible="showModelParamsDrawer"
    domain="BU"
    :supported-models="getBuSupportedModels(currentEditingBu)"
    :model-params="getBuModelParams(currentEditingBu)"
    :device-name="currentEditingBu.name"
    @close="showModelParamsDrawer = false; currentEditingBu = null"
    @save="handleModelParamsSave"
  />
</template>
