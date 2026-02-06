<script setup lang="ts">
/**
 * 器件库管理界面
 * 
 * 按甲方需求实现：
 * - 光纤类型管理（含模型参数抽屉）
 * - 放大器类型管理（含工作模式、单价）
 * - 分支器类型管理（含主干/分支插损、单价）
 */
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button, Tooltip, Input } from '@/shared/components/base'
import DeviceImportDialog from '@/components/dialogs/DeviceImportDialog.vue'
import FiberTypeDialog from '@/components/dialogs/FiberTypeDialog.vue'
import AmplifierTypeDialog from '@/components/dialogs/AmplifierTypeDialog.vue'
import BranchingUnitTypeDialog from '@/components/dialogs/BranchingUnitTypeDialog.vue'
import { useSettingsStore, useAppStore } from '@/stores'
import { 
  Database, Upload, Plus, Edit2, Trash2, 
  Zap, Radio, GitBranch, Download, Search, Save, RotateCcw
} from 'lucide-vue-next'
import type { FiberType, AmplifierType, BranchingUnitType } from '@/types/settings'

const settingsStore = useSettingsStore()
const appStore = useAppStore()

// 弹窗状态
const showImportDialog = ref(false)

// 当前选中的标签页
const activeTab = ref<'fiber' | 'amplifier' | 'branching'>('fiber')

// 搜索关键词
const searchKeyword = ref('')

// 编辑状态 - 分类型管理
const showFiberDialog = ref(false)
const showAmplifierDialog = ref(false)
const showBranchingDialog = ref(false)
const editingFiber = ref<FiberType | null>(null)
const editingAmplifier = ref<AmplifierType | null>(null)
const editingBranching = ref<BranchingUnitType | null>(null)
const isNewItem = ref(false)

// 过滤后的数据
const filteredFiberTypes = computed(() => {
  if (!searchKeyword.value) return settingsStore.fiberTypes
  const keyword = searchKeyword.value.toLowerCase()
  return settingsStore.fiberTypes.filter(f => 
    f.name.toLowerCase().includes(keyword) || f.id.toLowerCase().includes(keyword)
  )
})

const filteredAmplifierTypes = computed(() => {
  if (!searchKeyword.value) return settingsStore.amplifierTypes
  const keyword = searchKeyword.value.toLowerCase()
  return settingsStore.amplifierTypes.filter(a => 
    a.name.toLowerCase().includes(keyword) || a.id.toLowerCase().includes(keyword)
  )
})

const filteredBranchingUnitTypes = computed(() => {
  if (!searchKeyword.value) return settingsStore.branchingUnitTypes
  const keyword = searchKeyword.value.toLowerCase()
  return settingsStore.branchingUnitTypes.filter(b => 
    b.name.toLowerCase().includes(keyword) || b.id.toLowerCase().includes(keyword)
  )
})

// 统计信息
const statistics = computed(() => ({
  fiberCount: settingsStore.fiberTypes.length,
  amplifierCount: settingsStore.amplifierTypes.length,
  branchingCount: settingsStore.branchingUnitTypes.length,
  totalCount: settingsStore.fiberTypes.length + settingsStore.amplifierTypes.length + settingsStore.branchingUnitTypes.length,
  libraryFile: settingsStore.currentLibraryFile || '未导入'
}))

// 删除器件
const deleteItem = (type: string, id: string) => {
  if (type === 'fiber') {
    settingsStore.removeFiberType(id)
  } else if (type === 'amplifier') {
    settingsStore.removeAmplifierType(id)
  } else if (type === 'branching') {
    settingsStore.removeBranchingUnitType(id)
  }
  appStore.showNotification({ type: 'success', message: '已删除' })
}

// 编辑光纤
const editFiber = (fiber: FiberType) => {
  editingFiber.value = fiber
  isNewItem.value = false
  showFiberDialog.value = true
}

// 编辑放大器
const editAmplifier = (amp: AmplifierType) => {
  editingAmplifier.value = amp
  isNewItem.value = false
  showAmplifierDialog.value = true
}

// 编辑分支器
const editBranching = (bu: BranchingUnitType) => {
  editingBranching.value = bu
  isNewItem.value = false
  showBranchingDialog.value = true
}

// 保存光纤
const saveFiber = (fiber: FiberType) => {
  if (isNewItem.value) {
    settingsStore.addFiberType(fiber)
  } else {
    settingsStore.updateFiberType(fiber.id, fiber)
  }
  showFiberDialog.value = false
  editingFiber.value = null
  appStore.showNotification({ type: 'success', message: '光纤类型已保存' })
}

// 保存放大器
const saveAmplifier = (amp: AmplifierType) => {
  if (isNewItem.value) {
    settingsStore.addAmplifierType(amp)
  } else {
    settingsStore.updateAmplifierType(amp.id, amp)
  }
  showAmplifierDialog.value = false
  editingAmplifier.value = null
  appStore.showNotification({ type: 'success', message: '放大器类型已保存' })
}

// 保存分支器
const saveBranching = (bu: BranchingUnitType) => {
  if (isNewItem.value) {
    settingsStore.addBranchingUnitType(bu)
  } else {
    settingsStore.updateBranchingUnitType(bu.id, bu)
  }
  showBranchingDialog.value = false
  editingBranching.value = null
  appStore.showNotification({ type: 'success', message: '分支器类型已保存' })
}

// 添加新器件
const addNewItem = () => {
  isNewItem.value = true
  
  if (activeTab.value === 'fiber') {
    editingFiber.value = null
    showFiberDialog.value = true
  } else if (activeTab.value === 'amplifier') {
    editingAmplifier.value = null
    showAmplifierDialog.value = true
  } else {
    editingBranching.value = null
    showBranchingDialog.value = true
  }
}

// 获取工作模式显示文本
const getOperatingModeLabel = (mode?: string) => {
  const labels: Record<string, string> = {
    'fixed_gain': '固定增益',
    'fixed_output': '固定输出',
    'apc': 'APC'
  }
  return labels[mode || ''] || '固定增益'
}

// 导出器件库
const exportLibrary = () => {
  const data = {
    fiberTypes: settingsStore.fiberTypes,
    amplifierTypes: settingsStore.amplifierTypes,
    branchingUnitTypes: settingsStore.branchingUnitTypes,
    exportedAt: new Date().toISOString()
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `device_library_${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
  
  appStore.showNotification({ type: 'success', message: '器件库已导出' })
}

// 清空器件库
const clearLibrary = () => {
  if (!confirm('确定要清空所有器件数据吗？此操作不可恢复。')) return
  
  // 清空所有数据
  while (settingsStore.fiberTypes.length > 0) {
    settingsStore.removeFiberType(settingsStore.fiberTypes[0].id)
  }
  while (settingsStore.amplifierTypes.length > 0) {
    settingsStore.removeAmplifierType(settingsStore.amplifierTypes[0].id)
  }
  while (settingsStore.branchingUnitTypes.length > 0) {
    settingsStore.removeBranchingUnitType(settingsStore.branchingUnitTypes[0].id)
  }
  
  appStore.showNotification({ type: 'info', message: '器件库已清空' })
}
</script>

<template>
  <MainLayout>
    <template #toolbar>
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b">
        <div class="flex items-center gap-2">
          <Database class="w-5 h-5 text-blue-500" />
          <span class="text-sm font-medium text-gray-700">器件库管理</span>
          <span class="text-xs text-gray-400 ml-2">
            当前库: {{ statistics.libraryFile }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="showImportDialog = true">
            <Upload class="w-4 h-4 mr-1" /> 导入
          </Button>
          <Button variant="outline" size="sm" @click="exportLibrary">
            <Download class="w-4 h-4 mr-1" /> 导出
          </Button>
          <Button variant="outline" size="sm" @click="clearLibrary" class="text-red-600 hover:bg-red-50">
            <Trash2 class="w-4 h-4 mr-1" /> 清空
          </Button>
        </div>
      </div>
    </template>

    <template #left>
      <!-- 统计概览 -->
      <Card>
        <CardHeader class="pb-2">
          <span class="font-semibold text-sm">器件统计</span>
        </CardHeader>
        <CardContent class="pt-0 space-y-3">
          <div class="grid grid-cols-1 gap-2">
            <div 
              class="p-3 rounded-lg cursor-pointer transition-colors"
              :class="activeTab === 'fiber' ? 'bg-blue-100 border-blue-300' : 'bg-gray-50 hover:bg-gray-100'"
              @click="activeTab = 'fiber'"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Radio class="w-4 h-4 text-blue-500" />
                  <span class="text-sm">光纤类型</span>
                </div>
                <span class="text-lg font-bold text-blue-600">{{ statistics.fiberCount }}</span>
              </div>
            </div>
            
            <div 
              class="p-3 rounded-lg cursor-pointer transition-colors"
              :class="activeTab === 'amplifier' ? 'bg-purple-100 border-purple-300' : 'bg-gray-50 hover:bg-gray-100'"
              @click="activeTab = 'amplifier'"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Zap class="w-4 h-4 text-purple-500" />
                  <span class="text-sm">放大器类型</span>
                </div>
                <span class="text-lg font-bold text-purple-600">{{ statistics.amplifierCount }}</span>
              </div>
            </div>
            
            <div 
              class="p-3 rounded-lg cursor-pointer transition-colors"
              :class="activeTab === 'branching' ? 'bg-green-100 border-green-300' : 'bg-gray-50 hover:bg-gray-100'"
              @click="activeTab = 'branching'"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <GitBranch class="w-4 h-4 text-green-500" />
                  <span class="text-sm">分支器类型</span>
                </div>
                <span class="text-lg font-bold text-green-600">{{ statistics.branchingCount }}</span>
              </div>
            </div>
          </div>
          
          <div class="pt-2 border-t">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">总计</span>
              <span class="font-bold">{{ statistics.totalCount }} 条</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #center>
      <Card class="flex-1 flex flex-col">
        <CardHeader class="pb-2 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <!-- 标签页 -->
            <div class="flex gap-1">
              <button 
                class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                :class="activeTab === 'fiber' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'"
                @click="activeTab = 'fiber'"
              >
                <Radio class="w-3.5 h-3.5 inline mr-1" /> 光纤
              </button>
              <button 
                class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                :class="activeTab === 'amplifier' ? 'bg-purple-100 text-purple-700' : 'hover:bg-gray-100'"
                @click="activeTab = 'amplifier'"
              >
                <Zap class="w-3.5 h-3.5 inline mr-1" /> 放大器
              </button>
              <button 
                class="px-3 py-1.5 text-sm rounded-lg transition-colors"
                :class="activeTab === 'branching' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'"
                @click="activeTab = 'branching'"
              >
                <GitBranch class="w-3.5 h-3.5 inline mr-1" /> 分支器
              </button>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <!-- 搜索框 -->
            <div class="relative">
              <Search class="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
              <Input v-model="searchKeyword" placeholder="搜索..." class="pl-8 w-48" />
            </div>
            <Button size="sm" @click="addNewItem">
              <Plus class="w-4 h-4 mr-1" /> 添加
            </Button>
          </div>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-0">
          <!-- 光纤类型表格 - 按甲方需求格式 -->
          <div v-if="activeTab === 'fiber'" class="overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">非线性系数<br/><span class="text-xs text-gray-400">W⁻¹·km⁻¹</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">有效面积<br/><span class="text-xs text-gray-400">μm²</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">色散<br/><span class="text-xs text-gray-400">ps/nm·km</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">非线性折射率<br/><span class="text-xs text-gray-400">×10⁻²⁰ m²/W</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">衰减系数<br/><span class="text-xs text-gray-400">dB/km</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">二阶色散<br/><span class="text-xs text-gray-400">ps²/km</span></th>
                  <th class="px-3 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="fiber in filteredFiberTypes" 
                  :key="fiber.id"
                  class="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td class="px-3 py-3 font-medium">{{ fiber.name }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ fiber.nonlinearCoeff }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ fiber.effectiveArea }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ fiber.dispersion }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ fiber.nonlinearRefractiveIndex }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ fiber.attenuationCoeff }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ fiber.secondOrderDispersion }}</td>
                  <td class="px-3 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button class="p-1 hover:bg-gray-100 rounded" @click="editFiber(fiber)">
                        <Edit2 class="w-4 h-4 text-gray-500" />
                      </button>
                      <button class="p-1 hover:bg-red-100 rounded" @click="deleteItem('fiber', fiber.id)">
                        <Trash2 class="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredFiberTypes.length === 0">
                  <td colspan="8" class="px-4 py-8 text-center text-gray-400">
                    暂无数据，请导入或添加
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- 放大器类型表格 - 按甲方需求格式 -->
          <div v-if="activeTab === 'amplifier'" class="overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">额定增益<br/><span class="text-xs text-gray-400">dB</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">噪声系数<br/><span class="text-xs text-gray-400">dB</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">最大输出功率<br/><span class="text-xs text-gray-400">dBm</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">饱和功率<br/><span class="text-xs text-gray-400">dBm</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">平坦度<br/><span class="text-xs text-gray-400">dB</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">工作模式</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">单价</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">货币</th>
                  <th class="px-3 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="amp in filteredAmplifierTypes" 
                  :key="amp.id"
                  class="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td class="px-3 py-3 font-medium">{{ amp.name }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ amp.gain }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ amp.noiseFigure }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ amp.outputPower }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ amp.saturationPower || '-' }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ amp.gainFlatness }}</td>
                  <td class="px-3 py-3">
                    <span class="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">
                      {{ getOperatingModeLabel(amp.operatingMode) }}
                    </span>
                  </td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ amp.unitPrice || '-' }}</td>
                  <td class="px-3 py-3 text-gray-600">{{ amp.currency || '-' }}</td>
                  <td class="px-3 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button class="p-1 hover:bg-gray-100 rounded" @click="editAmplifier(amp)">
                        <Edit2 class="w-4 h-4 text-gray-500" />
                      </button>
                      <button class="p-1 hover:bg-red-100 rounded" @click="deleteItem('amplifier', amp.id)">
                        <Trash2 class="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredAmplifierTypes.length === 0">
                  <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                    暂无数据，请导入或添加
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- 分支器类型表格 - 按甲方需求格式 -->
          <div v-if="activeTab === 'branching'" class="overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">端口数</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">主干插损<br/><span class="text-xs text-gray-400">dB</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">分支插损<br/><span class="text-xs text-gray-400">dB</span></th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">单价</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-600">货币</th>
                  <th class="px-3 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="bu in filteredBranchingUnitTypes" 
                  :key="bu.id"
                  class="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td class="px-3 py-3 font-medium">{{ bu.name }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ bu.portCount }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ bu.trunkInsertionLoss }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ bu.branchInsertionLoss }}</td>
                  <td class="px-3 py-3 font-mono text-gray-600">{{ bu.unitPrice || '-' }}</td>
                  <td class="px-3 py-3 text-gray-600">{{ bu.currency || '-' }}</td>
                  <td class="px-3 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button class="p-1 hover:bg-gray-100 rounded" @click="editBranching(bu)">
                        <Edit2 class="w-4 h-4 text-gray-500" />
                      </button>
                      <button class="p-1 hover:bg-red-100 rounded" @click="deleteItem('branching', bu.id)">
                        <Trash2 class="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredBranchingUnitTypes.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-gray-400">
                    暂无数据，请导入或添加
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>
  
  <!-- 导入弹窗 -->
  <DeviceImportDialog 
    :visible="showImportDialog" 
    @close="showImportDialog = false"
    @imported="showImportDialog = false"
  />
  
  <!-- 光纤类型编辑弹窗 -->
  <FiberTypeDialog
    :visible="showFiberDialog"
    :fiber="editingFiber"
    :is-new="isNewItem"
    @close="showFiberDialog = false"
    @save="saveFiber"
  />
  
  <!-- 放大器类型编辑弹窗 -->
  <AmplifierTypeDialog
    :visible="showAmplifierDialog"
    :amplifier="editingAmplifier"
    :is-new="isNewItem"
    @close="showAmplifierDialog = false"
    @save="saveAmplifier"
  />
  
  <!-- 分支器类型编辑弹窗 -->
  <BranchingUnitTypeDialog
    :visible="showBranchingDialog"
    :branchingUnit="editingBranching"
    :is-new="isNewItem"
    @close="showBranchingDialog = false"
    @save="saveBranching"
  />
</template>
