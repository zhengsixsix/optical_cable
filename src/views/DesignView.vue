<script setup lang="ts">
import {ref, computed} from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import {Card, CardHeader, CardContent, Button, Select} from '@/components/ui'
import {useSettingsStore, useAppStore} from '@/stores'
import {Cable, Radio, GitBranch, Calculator, Save, RotateCcw} from 'lucide-vue-next'

const settingsStore = useSettingsStore()
const appStore = useAppStore()

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

const handleSave = () => {
  appStore.showNotification({type: 'success', message: '设计参数已保存'})
  appStore.addLog('INFO', '系统设计参数已更新')
}

const handleReset = () => {
  selectedCableType.value = 'lw'
  selectedRepeaterType.value = 'std'
  repeaterSpacing.value = 80
  targetCapacity.value = 100
  appStore.showNotification({type: 'info', message: '已重置为默认参数'})
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
    <template #left>
      <Card class="flex-1">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <Cable class="w-4 h-4"/>
            电缆参数
          </span>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-gray-600 mb-1">电缆类型</label>
              <Select v-model="selectedCableType" :options="cableTypeOptions"/>
            </div>

            <div>
              <label class="block text-xs text-gray-600 mb-1">
                <Radio class="w-3 h-3 inline mr-1"/>
                中继器类型
              </label>
              <Select v-model="selectedRepeaterType" :options="repeaterTypeOptions"/>
            </div>

            <div>
              <label class="block text-xs text-gray-600 mb-1">中继器间距 (km)</label>
              <input
                  v-model.number="repeaterSpacing"
                  type="range"
                  min="40"
                  max="120"
                  step="5"
                  class="w-full"
              />
              <div class="text-xs text-gray-500 text-right">{{ repeaterSpacing }} km</div>
            </div>

            <div>
              <label class="block text-xs text-gray-600 mb-1">目标容量 (Tbps)</label>
              <input
                  v-model.number="targetCapacity"
                  type="number"
                  min="10"
                  max="500"
                  class="w-full px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #center>
      <Card class="flex-1">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <Calculator class="w-4 h-4"/>
            设计计算结果
          </span>
        </CardHeader>
        <CardContent>
          <div v-if="designResult" class="space-y-6">
            <!-- 系统概览 -->
            <div class="grid grid-cols-3 gap-4">
              <div class="p-4 bg-blue-50 rounded-lg text-center">
                <div class="text-2xl font-bold text-blue-600">{{ designResult.totalLength }}</div>
                <div class="text-xs text-gray-600">总长度 (km)</div>
              </div>
              <div class="p-4 bg-green-50 rounded-lg text-center">
                <div class="text-2xl font-bold text-green-600">{{ designResult.repeaterCount }}</div>
                <div class="text-xs text-gray-600">中继器数量</div>
              </div>
              <div class="p-4 bg-purple-50 rounded-lg text-center">
                <div class="text-2xl font-bold text-purple-600">{{ designResult.maxCapacity }}</div>
                <div class="text-xs text-gray-600">最大容量 (Tbps)</div>
              </div>
            </div>

            <!-- 成本明细 -->
            <div class="border rounded-lg p-4">
              <h3 class="text-sm font-semibold mb-3">成本估算</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600">电缆成本</span>
                  <span class="font-medium">{{ formatCost(designResult.cableCost) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">中继器成本</span>
                  <span class="font-medium">{{ formatCost(designResult.repeaterCost) }}</span>
                </div>
                <div class="flex justify-between pt-2 border-t font-semibold">
                  <span>总计</span>
                  <span class="text-primary">{{ formatCost(designResult.totalCost) }}</span>
                </div>
              </div>
            </div>

            <!-- 容量分析 -->
            <div class="border rounded-lg p-4">
              <h3 class="text-sm font-semibold mb-3">容量分析</h3>
              <div class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600">目标容量</span>
                  <span>{{ targetCapacity }} Tbps</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600">系统容量</span>
                  <span>{{ designResult.maxCapacity }} Tbps</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div
                      class="h-2.5 rounded-full transition-all"
                      :class="targetCapacity <= designResult.maxCapacity ? 'bg-green-500' : 'bg-red-500'"
                      :style="{ width: Math.min(100, (targetCapacity / designResult.maxCapacity) * 100) + '%' }"
                  ></div>
                </div>
                <div
                    class="text-xs"
                    :class="targetCapacity <= designResult.maxCapacity ? 'text-green-600' : 'text-red-600'"
                >
                  {{ targetCapacity <= designResult.maxCapacity ? '✓ 满足容量需求' : '✗ 容量不足，请调整参数' }}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <template #right>
      <Card class="flex-1">
        <CardHeader>
          <span class="font-semibold text-sm flex items-center gap-2">
            <GitBranch class="w-4 h-4"/>
            操作
          </span>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <Button class="w-full" @click="handleSave">
              <Save class="w-4 h-4 mr-2"/>
              保存设计
            </Button>
            <Button variant="outline" class="w-full" @click="handleReset">
              <RotateCcw class="w-4 h-4 mr-2"/>
              重置参数
            </Button>
          </div>

          <div class="mt-6 p-3 bg-gray-50 rounded-lg">
            <h4 class="text-xs font-semibold text-gray-700 mb-2">设计提示</h4>
            <ul class="text-xs text-gray-600 space-y-1 list-disc list-inside">
              <li>LW 电缆适用于深海区域</li>
              <li>SA/DA 电缆用于浅水和登陆段</li>
              <li>中继器间距建议 60-100km</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </template>
  </MainLayout>
</template>
