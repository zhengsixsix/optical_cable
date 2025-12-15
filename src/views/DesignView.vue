<script setup lang="ts">
import { ref, computed } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { Card, CardHeader, CardContent, Button, Select, Tooltip } from '@/components/ui'
import ConnectorPanel from '@/components/panels/ConnectorPanel.vue'
import ConnectorDialog from '@/components/dialogs/ConnectorDialog.vue'
import RepeaterConfigDialog from '@/components/dialogs/RepeaterConfigDialog.vue'
import { useSettingsStore, useAppStore, useConnectorStore } from '@/stores'
import { Cable, Radio, GitBranch, Calculator, Save, RotateCcw, FileSpreadsheet, Link2, Send } from 'lucide-vue-next'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const connectorStore = useConnectorStore()

// 本地编辑状态
const selectedCableType = ref('lw')
const selectedRepeaterType = ref('std')

// 下拉选项
const cableTypeOptions = computed(() =>
  settingsStore.settings.cableTypes.map(c => ({
    value: c.id,
    label: `${c.name} (${c.fiberCount}纤)`
  }))
)

const repeaterTypeOptions = computed(() =>
  settingsStore.settings.repeaterTypes.map(r => ({
    value: r.id,
    label: r.name
  }))
)
const repeaterSpacing = ref(80)
const targetCapacity = ref(100)

// 计算结果
const designResult = computed(() => {
  const cable = settingsStore.settings.cableTypes.find(c => c.id === selectedCableType.value)
  const repeater = settingsStore.settings.repeaterTypes.find(r => r.id === selectedRepeaterType.value)

  if (!cable || !repeater) return null

  const totalLength = 1550 // 模拟总长度 km
  const repeaterCount = Math.ceil(totalLength / repeaterSpacing.value)
  const cableCost = totalLength * cable.costPerKm
  const repeaterCost = repeaterCount * repeater.cost

  return {
    totalLength,
    repeaterCount,
    cableCost,
    repeaterCost,
    totalCost: cableCost + repeaterCost,
    maxCapacity: cable.fiberCount * 10 // Tbps
  }
})

// 显示用中继器列表（最多显示5个）
const displayRepeaters = computed(() => {
  const count = designResult.value?.repeaterCount || 0
  if (count <= 5) {
    return Array.from({ length: count }, (_, i) => ({ id: i + 1, label: `R${i + 1}` }))
  }
  // 超过5个时显示: R1, R2, ..., R19, R20
  return [
    { id: 1, label: 'R1' },
    { id: 2, label: 'R2' },
    { id: -1, label: '...' },
    { id: count - 1, label: `R${count - 1}` },
    { id: count, label: `R${count}` }
  ]
})

const handleSave = () => {
  appStore.showNotification({ type: 'success', message: '设计参数已保存' })
  appStore.addLog('INFO', '系统设计参数已更新')
}

const handleReset = () => {
  selectedCableType.value = 'lw'
  selectedRepeaterType.value = 'std'
  repeaterSpacing.value = 80
  targetCapacity.value = 100
  appStore.showNotification({ type: 'info', message: '已重置为默认参数' })
}

// 弹框状态
const showRepeaterDialog = ref(false)
const showConnectorDialog = ref(false)
const editConnectorId = ref<string | null>(null)

// 打开中继器配置弹框
const openRepeaterPanel = () => {
  showRepeaterDialog.value = true
}

// 打开SLD管理
const openSLD = () => {
  appStore.openDialog('sld-manage')
}

// 打开RPL管理
const openRPL = () => {
  appStore.openDialog('rpl-manage')
}

// 打开接线元添加弹框
const openConnectorAdd = () => {
  if (!connectorStore.currentTable) {
    connectorStore.createTable('默认接线元表')
  }
  editConnectorId.value = null
  showConnectorDialog.value = true
}

// 打开接线元编辑弹框
const openConnectorEdit = (id: string) => {
  editConnectorId.value = id
  showConnectorDialog.value = true
}

// 提交参数
const handleSubmit = () => {
  appStore.showNotification({ type: 'info', message: '正在提交参数到后端计算...' })
  appStore.addLog('INFO', '提交传输系统参数')

  // 模拟提交延迟
  setTimeout(() => {
    appStore.showNotification({ type: 'success', message: '参数提交成功，计算结果已更新' })
    appStore.addLog('INFO', '传输系统计算完成')
  }, 1500)
}

// 格式化成本
const formatCost = (cost: number) => {
  if (cost >= 1000000) return `$${(cost / 1000000).toFixed(2)}M`
  if (cost >= 1000) return `$${(cost / 1000).toFixed(0)}K`
  return `$${cost.toFixed(0)}`
}
</script>

<template>
  <MainLayout>
    <!-- 传输系统规划工具栏 -->
    <template #toolbar>
      <div class="flex items-center justify-between px-4 py-2 bg-white border-b">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700">3. 传输系统规划</span>
          <span class="text-xs text-gray-400">| 参数配置 → 接线元 → 中继器 → 提交 → 结果</span>
        </div>
        <div class="flex items-center gap-2">
          <Tooltip content="3.1.3 中继器位置手动调整">
            <Button variant="outline" size="sm" @click="openRepeaterPanel">
              <Radio class="w-4 h-4 mr-1" /> 中继器配置
            </Button>
          </Tooltip>
          <Tooltip content="3.1.4 参数提交">
            <Button size="sm" @click="handleSubmit">
              <Send class="w-4 h-4 mr-1" /> 提交计算
            </Button>
          </Tooltip>
          <div class="w-px h-5 bg-gray-300" />
          <Tooltip content="3.1.6 RPL表格管理">
            <Button variant="outline" size="sm" @click="openRPL">
              <FileSpreadsheet class="w-4 h-4 mr-1" /> RPL
            </Button>
          </Tooltip>
          <Tooltip content="3.1.7 SLD表格管理">
            <Button variant="outline" size="sm" @click="openSLD">
              <FileSpreadsheet class="w-4 h-4 mr-1" /> SLD
            </Button>
          </Tooltip>
        </div>
      </div>
    </template>

    <template #left>
      <!-- 3.1.1 参数配置界面 -->
      <Card class="flex-shrink-0">
        <CardHeader class="pb-2">
          <span class="font-semibold text-sm flex items-center gap-2">
            <Cable class="w-4 h-4 text-blue-500" />
            参数配置
          </span>
        </CardHeader>
        <CardContent class="pt-0">
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1 font-medium">电缆类型</label>
              <Select v-model="selectedCableType" :options="cableTypeOptions" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1 font-medium">中继器类型</label>
              <Select v-model="selectedRepeaterType" :options="repeaterTypeOptions" />
            </div>
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="text-xs text-gray-500 font-medium">中继器间距</label>
                <span class="text-xs font-bold text-blue-600">{{ repeaterSpacing }} km</span>
              </div>
              <input v-model.number="repeaterSpacing" type="range" min="40" max="120" step="5"
                class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1 font-medium">目标容量 (Tbps)</label>
              <input v-model.number="targetCapacity" type="number" min="10" max="500"
                class="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors" />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 3.1.2 接线元管理 -->
      <ConnectorPanel class="flex-1 mt-2 min-h-0" @add="openConnectorAdd" @edit="openConnectorEdit" />
    </template>

    <template #center>
      <!-- 中间区域：系统布局图/可视化 -->
      <Card class="flex-1 flex flex-col">
        <CardHeader class="flex-shrink-0 bg-gray-50/50 border-b">
          <span class="font-semibold text-sm flex items-center gap-2 text-gray-700">
            <Calculator class="w-4 h-4" />
            系统布局图
          </span>
        </CardHeader>
        <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
          <!-- 系统示意图 -->
          <div class="flex-1 bg-white p-6 flex flex-col justify-center">
            <div class="relative py-8">
              <!-- 背景线 -->
              <div class="absolute top-1/2 left-0 right-0 h-px bg-gray-200" />

              <!-- 主光缆线 -->
              <div class="relative mx-12">
                <div class="h-1 bg-blue-600 rounded-full" />

                <!-- 设备标记 -->
                <div class="absolute -top-8 left-0 right-0 flex justify-between items-end">
                  <!-- 登陆站A -->
                  <div class="text-center -ml-4 group">
                    <div
                      class="w-8 h-8 bg-white border-2 border-green-600 rounded flex items-center justify-center text-green-700 text-xs font-bold shadow-sm group-hover:bg-green-50 transition-colors">
                      L1
                    </div>
                    <div class="text-xs mt-2 text-gray-600 font-medium">登陆站A</div>
                  </div>

                  <!-- 中继器 -->
                  <template v-for="item in displayRepeaters" :key="item.id">
                    <div v-if="item.label === '...'" class="text-center">
                      <div
                        class="w-6 h-6 flex items-center justify-center text-gray-400 font-bold text-lg bg-white z-10">
                        ...</div>
                      <div class="text-xs mt-2 text-gray-400">×{{ (designResult?.repeaterCount || 0) - 4 }}</div>
                    </div>
                    <div v-else class="text-center group cursor-pointer">
                      <div
                        class="w-6 h-6 bg-white border-2 border-blue-600 rounded-full flex items-center justify-center text-blue-700 text-[10px] font-bold shadow-sm group-hover:bg-blue-50 transition-colors z-10 relative">
                        {{ item.label }}
                      </div>
                      <div class="text-[10px] mt-2 text-gray-500">中继器</div>
                    </div>
                  </template>

                  <!-- 登陆站B -->
                  <div class="text-center -mr-4 group">
                    <div
                      class="w-8 h-8 bg-white border-2 border-green-600 rounded flex items-center justify-center text-green-700 text-xs font-bold shadow-sm group-hover:bg-green-50 transition-colors">
                      L2
                    </div>
                    <div class="text-xs mt-2 text-gray-600 font-medium">登陆站B</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 图例 -->
            <div class="flex justify-center gap-8 mt-4 pt-4 border-t border-gray-100">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 bg-white border-2 border-green-600 rounded" />
                <span class="text-xs text-gray-600">登陆站</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 bg-white border-2 border-blue-600 rounded-full" />
                <span class="text-xs text-gray-600">中继器 (×{{ designResult?.repeaterCount || 0 }})</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-6 h-1 bg-blue-600 rounded-full" />
                <span class="text-xs text-gray-600">光缆</span>
              </div>
            </div>
          </div>

          <!-- 系统概览数据 -->
          <div v-if="designResult" class="grid grid-cols-4 border-t border-gray-200">
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designResult.totalLength.toLocaleString() }}</div>
              <div class="text-[10px] text-gray-500">总长度 (km)</div>
            </div>
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designResult.repeaterCount }}</div>
              <div class="text-[10px] text-gray-500">中继器数</div>
            </div>
            <div class="p-3 text-center border-r border-gray-200 bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ designResult.maxCapacity }}</div>
              <div class="text-[10px] text-gray-500">容量 (Tbps)</div>
            </div>
            <div class="p-3 text-center bg-gray-50/30">
              <div class="text-sm font-semibold text-gray-800">{{ formatCost(designResult.totalCost) }}</div>
              <div class="text-[10px] text-gray-500">总成本</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #right>
      <!-- 3.1.5 结果反馈展示 -->
      <Card class="flex-1 flex flex-col">
        <CardHeader class="pb-2 flex-shrink-0 bg-gray-50/50 border-b">
          <span class="font-semibold text-sm flex items-center gap-2 text-gray-700">
            <GitBranch class="w-4 h-4 text-gray-600" />
            结果反馈
          </span>
        </CardHeader>
        <CardContent class="pt-4 flex-1 flex flex-col bg-white">
          <div v-if="designResult" class="space-y-4 flex-1">
            <!-- 系统概览 -->
            <div class="grid grid-cols-2 gap-3">
              <div class="p-3 bg-gray-50 rounded border border-gray-200 text-center">
                <div class="text-lg font-bold text-blue-700">{{ designResult.totalLength.toLocaleString() }}</div>
                <div class="text-xs text-gray-500 mt-1">总长度 (km)</div>
              </div>
              <div class="p-3 bg-gray-50 rounded border border-gray-200 text-center">
                <div class="text-lg font-bold text-blue-700">{{ designResult.repeaterCount }}</div>
                <div class="text-xs text-gray-500 mt-1">中继器数</div>
              </div>
            </div>

            <!-- 成本明细 -->
            <div class="border border-gray-200 rounded p-3">
              <h4 class="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2 border-b pb-2">
                <span class="w-1 h-3 bg-gray-500 rounded-sm"></span>
                成本估算
              </h4>
              <div class="space-y-2 text-xs">
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">电缆成本</span>
                  <span class="font-mono">{{ formatCost(designResult.cableCost) }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-600">中继器成本</span>
                  <span class="font-mono">{{ formatCost(designResult.repeaterCost) }}</span>
                </div>
                <div class="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                  <span class="font-bold text-gray-700">总计</span>
                  <span class="font-bold text-gray-900 font-mono">{{ formatCost(designResult.totalCost) }}</span>
                </div>
              </div>
            </div>

            <!-- 容量状态 -->
            <div class="border border-gray-200 rounded p-3">
              <h4 class="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2 border-b pb-2">
                <span class="w-1 h-3 bg-gray-500 rounded-sm"></span>
                容量分析
              </h4>
              <div class="flex items-center gap-3 mb-2">
                <div class="flex-1 bg-gray-100 rounded-sm h-3 overflow-hidden border border-gray-200">
                  <div class="h-full transition-all duration-300"
                    :class="targetCapacity <= designResult.maxCapacity ? 'bg-green-600' : 'bg-red-600'"
                    :style="{ width: Math.min(100, (targetCapacity / designResult.maxCapacity) * 100) + '%' }" />
                </div>
                <span class="text-xs font-mono text-gray-700 w-16 text-right">{{ designResult.maxCapacity }} Tbps</span>
              </div>
              <div class="text-xs font-medium flex items-center gap-1.5"
                :class="targetCapacity <= designResult.maxCapacity ? 'text-green-700' : 'text-red-700'">
                <span class="flex items-center justify-center w-4 h-4 rounded-full text-[10px] text-white"
                  :class="targetCapacity <= designResult.maxCapacity ? 'bg-green-600' : 'bg-red-600'">
                  {{ targetCapacity <= designResult.maxCapacity ? '✓' : '!' }} </span>
                    {{ targetCapacity <= designResult.maxCapacity ? '满足容量需求' : '容量不足，请调整参数' }} </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="mt-auto pt-4 border-t border-gray-100 space-y-2 flex-shrink-0">
              <Button class="w-full bg-blue-600 hover:bg-blue-700 text-white" size="sm" @click="handleSave">
                <Save class="w-4 h-4 mr-2" /> 保存设计
              </Button>
              <Button variant="outline" class="w-full border-gray-300 hover:bg-gray-50 text-gray-700" size="sm"
                @click="handleReset">
                <RotateCcw class="w-4 h-4 mr-2" /> 重置参数
              </Button>
            </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>

  <!-- 弹框组件 -->
  <RepeaterConfigDialog 
    :visible="showRepeaterDialog" 
    @close="showRepeaterDialog = false"
    @saved="showRepeaterDialog = false"
  />
  <ConnectorDialog 
    :visible="showConnectorDialog" 
    :edit-id="editConnectorId"
    @close="showConnectorDialog = false"
    @saved="showConnectorDialog = false"
  />
</template>
