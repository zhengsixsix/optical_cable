<script setup lang="ts">
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button, Tooltip } from '@/components/ui'
import DeviceImportDialog from '@/components/dialogs/DeviceImportDialog.vue'
import { useSettingsStore, useAppStore } from '@/stores'
import { 
  Database, Upload, Plus, Edit2, Trash2, RefreshCw, 
  Zap, Radio, GitBranch, Download, Search, Filter
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

// 编辑状态
const editingItem = ref<any>(null)
const showEditDialog = ref(false)

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

// 编辑器件
const editItem = (type: string, item: any) => {
  editingItem.value = { ...item, _type: type }
  showEditDialog.value = true
}

// 保存编辑
const saveEdit = () => {
  if (!editingItem.value) return
  
  const { _type, ...data } = editingItem.value
  
  if (_type === 'fiber') {
    settingsStore.updateFiberType(data.id, data)
  } else if (_type === 'amplifier') {
    settingsStore.updateAmplifierType(data.id, data)
  } else if (_type === 'branching') {
    settingsStore.updateBranchingUnitType(data.id, data)
  }
  
  showEditDialog.value = false
  editingItem.value = null
  appStore.showNotification({ type: 'success', message: '已保存' })
}

// 添加新器件
const addNewItem = () => {
  const timestamp = Date.now()
  
  if (activeTab.value === 'fiber') {
    const newFiber: FiberType = {
      id: `fiber-${timestamp}`,
      name: '新光纤类型',
      nonlinearCoeff: 1.4,
      effectiveArea: 80,
      dispersion: 17,
      nonlinearRefractiveIndex: 2.6,
      attenuationCoeff: 0.2,
      secondOrderDispersion: -21,
      simulationModel: 'GN'
    }
    settingsStore.addFiberType(newFiber)
    editItem('fiber', newFiber)
  } else if (activeTab.value === 'amplifier') {
    const newAmp: AmplifierType = {
      id: `amp-${timestamp}`,
      name: '新放大器类型',
      gain: 20,
      bandwidth: 1550,
      gainFlatness: 0.5,
      noiseFigure: 5,
      pumpPower: 100,
      outputPower: 17,
      gainRangePower: 0.1
    }
    settingsStore.addAmplifierType(newAmp)
    editItem('amplifier', newAmp)
  } else {
    const newBU: BranchingUnitType = {
      id: `bu-${timestamp}`,
      name: '新分支器类型',
      portCount: 3,
      trunkInsertionLoss: 0.5,
      branchInsertionLoss: 3.0,
      insertionLoss: 0.5,
      wavelengthRange: 1550
    }
    settingsStore.addBranchingUnitType(newBU)
    editItem('branching', newBU)
  }
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
              <Search class="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                v-model="searchKeyword"
                type="text"
                placeholder="搜索..."
                class="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
              />
            </div>
            <Button size="sm" @click="addNewItem">
              <Plus class="w-4 h-4 mr-1" /> 添加
            </Button>
          </div>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-0">
          <!-- 光纤类型表格 -->
          <div v-if="activeTab === 'fiber'" class="overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">名称</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">非线性系数</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">有效面积</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">色散</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">衰减</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">仿真模型</th>
                  <th class="px-4 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="fiber in filteredFiberTypes" 
                  :key="fiber.id"
                  class="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td class="px-4 py-3 font-medium">{{ fiber.name }}</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ fiber.nonlinearCoeff }}</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ fiber.effectiveArea }} μm²</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ fiber.dispersion }} ps/nm·km</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ fiber.attenuationCoeff }} dB/km</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">
                      {{ fiber.simulationModel }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button class="p-1 hover:bg-gray-100 rounded" @click="editItem('fiber', fiber)">
                        <Edit2 class="w-4 h-4 text-gray-500" />
                      </button>
                      <button class="p-1 hover:bg-red-100 rounded" @click="deleteItem('fiber', fiber.id)">
                        <Trash2 class="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredFiberTypes.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-gray-400">
                    暂无数据，请导入或添加
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- 放大器类型表格 -->
          <div v-if="activeTab === 'amplifier'" class="overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">名称</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">增益</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">噪声系数</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">输出功率</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">增益平坦度</th>
                  <th class="px-4 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="amp in filteredAmplifierTypes" 
                  :key="amp.id"
                  class="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td class="px-4 py-3 font-medium">{{ amp.name }}</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ amp.gain }} dB</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ amp.noiseFigure }} dB</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ amp.outputPower }} dBm</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ amp.gainFlatness }} dB</td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button class="p-1 hover:bg-gray-100 rounded" @click="editItem('amplifier', amp)">
                        <Edit2 class="w-4 h-4 text-gray-500" />
                      </button>
                      <button class="p-1 hover:bg-red-100 rounded" @click="deleteItem('amplifier', amp.id)">
                        <Trash2 class="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredAmplifierTypes.length === 0">
                  <td colspan="6" class="px-4 py-8 text-center text-gray-400">
                    暂无数据，请导入或添加
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- 分支器类型表格 -->
          <div v-if="activeTab === 'branching'" class="overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">名称</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">端口数</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">插入损耗</th>
                  <th class="px-4 py-2 text-left font-medium text-gray-600">波长范围</th>
                  <th class="px-4 py-2 text-center font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="bu in filteredBranchingUnitTypes" 
                  :key="bu.id"
                  class="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td class="px-4 py-3 font-medium">{{ bu.name }}</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ bu.portCount }}</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ bu.insertionLoss }} dB</td>
                  <td class="px-4 py-3 font-mono text-gray-600">{{ bu.wavelengthRange }} nm</td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button class="p-1 hover:bg-gray-100 rounded" @click="editItem('branching', bu)">
                        <Edit2 class="w-4 h-4 text-gray-500" />
                      </button>
                      <button class="p-1 hover:bg-red-100 rounded" @click="deleteItem('branching', bu.id)">
                        <Trash2 class="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredBranchingUnitTypes.length === 0">
                  <td colspan="5" class="px-4 py-8 text-center text-gray-400">
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
  
  <!-- 编辑弹窗 -->
  <div v-if="showEditDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
    <Card class="w-[500px] max-h-[80vh] flex flex-col bg-white shadow-2xl">
      <CardHeader class="flex items-center justify-between border-b">
        <span class="font-semibold">编辑器件参数</span>
        <button class="p-1 hover:bg-gray-100 rounded" @click="showEditDialog = false">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </CardHeader>
      <CardContent v-if="editingItem" class="flex-1 overflow-auto p-4 space-y-4">
        <!-- 通用字段 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">名称</label>
          <input 
            v-model="editingItem.name"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <!-- 光纤字段 -->
        <template v-if="editingItem._type === 'fiber'">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">非线性系数 (W⁻¹·km⁻¹)</label>
              <input v-model.number="editingItem.nonlinearCoeff" type="number" step="0.1" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">有效面积 (μm²)</label>
              <input v-model.number="editingItem.effectiveArea" type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">色散 (ps/nm·km)</label>
              <input v-model.number="editingItem.dispersion" type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">衰减系数 (dB/km)</label>
              <input v-model.number="editingItem.attenuationCoeff" type="number" step="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">仿真模型</label>
            <select v-model="editingItem.simulationModel" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="GN">GN Model</option>
              <option value="EGN">EGN Model</option>
            </select>
          </div>
        </template>
        
        <!-- 放大器字段 -->
        <template v-if="editingItem._type === 'amplifier'">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">增益 (dB)</label>
              <input v-model.number="editingItem.gain" type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">噪声系数 (dB)</label>
              <input v-model.number="editingItem.noiseFigure" type="number" step="0.1" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">输出功率 (dBm)</label>
              <input v-model.number="editingItem.outputPower" type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">增益平坦度 (dB)</label>
              <input v-model.number="editingItem.gainFlatness" type="number" step="0.1" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
        </template>
        
        <!-- 分支器字段 -->
        <template v-if="editingItem._type === 'branching'">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">端口数</label>
              <input v-model.number="editingItem.portCount" type="number" min="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">插入损耗 (dB)</label>
              <input v-model.number="editingItem.insertionLoss" type="number" step="0.1" class="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
        </template>
      </CardContent>
      <div class="p-4 border-t flex justify-end gap-2">
        <Button variant="outline" @click="showEditDialog = false">取消</Button>
        <Button @click="saveEdit">保存</Button>
      </div>
    </Card>
  </div>
</template>
