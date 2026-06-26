<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
import { useConnectorStore } from '@/stores/connector'
import { connectorTypeLabels, connectorStatusLabels, connectorFilterLabels } from '@/types'
import type { ConnectorType, ConnectorStatus } from '@/types'
import { Plus, Trash2, Edit2, Link2 } from 'lucide-vue-next'
import { getDeviceLibraryNameById } from '@/services/platform/deviceRuntime'

const connectorStore = useConnectorStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()

// 根据器件ID从器件库获取器件名称
const getComponentName = (type: ConnectorType, refId?: string) => {
  if (!refId) return null
  if (type === 'amplifier_e' || type === 'amplifier_w') {
    return getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, refId, 'amplifier')
  }
  if (type === 'bu') {
    return getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, refId, 'branching')
  }
  if (type === 'joint') {
    return getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, refId, 'joint')
  }
  if (type === 'equalizer') {
    return getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, refId, 'equalizer')
  }
  return null
}

// 根据光纤ID从器件库获取光纤名称
const getFiberName = (refId?: string) => {
  if (!refId) return null
  return getDeviceLibraryNameById(settingsStore.platformDeviceLibraries, refId, 'fiber')
}

const emit = defineEmits<{
  (e: 'edit', id: string): void
  (e: 'add'): void
}>()

// 筛选类型
const filterType = ref<ConnectorType | 'all'>('all')

// 筛选后的接线元列表（排除海缆段，海缆段属于路由规划阶段数据）
const filteredElements = computed(() => {
  const base = connectorStore.elements.filter(e => e.type !== 'cable_segment')
  if (filterType.value === 'all') {
    return base
  }
  // 放大器类型合并过滤（amplifier_e 和 amplifier_w 一起过滤）
  if (filterType.value === 'amplifier_e') {
    return base.filter(e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola')
  }
  return base.filter(e => e.type === filterType.value)
})

// 获取类型样式
const getTypeClass = (type: ConnectorType) => {
  const classes: Record<ConnectorType, string> = {
    landing: 'bg-blue-100 text-blue-700',
    amplifier_e: 'bg-green-100 text-green-700',
    amplifier_w: 'bg-green-100 text-green-700',
    bu: 'bg-purple-100 text-purple-700',
    equalizer: 'bg-amber-100 text-amber-700',
    underwater: 'bg-gray-100 text-gray-700',
    cable_segment: 'bg-amber-100 text-amber-700',
    fiber: 'bg-orange-100 text-orange-700',
    ola: 'bg-green-100 text-green-700',
    joint: 'bg-slate-100 text-slate-700'
  }
  return classes[type] || 'bg-gray-100 text-gray-700'
}

// 获取状态样式
const getStatusClass = (status: ConnectorStatus) => {
  const classes: Record<ConnectorStatus, string> = {
    active: 'bg-green-500',
    standby: 'bg-yellow-500',
    fault: 'bg-red-500',
    planned: 'bg-gray-400'
  }
  return classes[status]
}

// 删除接线元
const handleDelete = (id: string) => {
  connectorStore.deleteElement(id)
  appStore.showNotification({ type: 'success', message: '接线元已删除' })
}

</script>

<template>
  <Card class="flex-1 flex flex-col">
    <CardHeader class="pb-2 flex-shrink-0">
      <span class="font-semibold text-sm flex items-center gap-2">
        <Link2 class="w-4 h-4 text-purple-500" />
        接线元管理
      </span>
      <Button variant="ghost" size="sm" class="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50" @click="emit('add')">
        <Plus class="w-4 h-4 mr-1" /> 添加
      </Button>
    </CardHeader>
    <CardContent class="flex-1 overflow-hidden flex flex-col pt-0">
      <!-- 筛选栏 -->
      <div class="flex gap-2 mb-3 flex-wrap border-b border-gray-100 pb-2">
        <button
          :class="[
            'px-2.5 py-1 text-xs font-medium transition-colors border-b-2',
            filterType === 'all' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
          @click="filterType = 'all'"
        >
          全部
        </button>
        <button
          v-for="(label, type) in connectorFilterLabels"
          :key="type"
          :class="[
            'px-2.5 py-1 text-xs font-medium transition-colors border-b-2',
            filterType === type 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
          @click="filterType = type as ConnectorType"
        >
          {{ label }}
        </button>
      </div>

      <!-- 接线元列表 -->
      <div class="flex-1 overflow-auto pr-1">
        <div v-if="filteredElements.length === 0" class="text-center py-8 text-gray-400 text-xs">
          <p>暂无接线元数据</p>
        </div>
        
        <div v-else class="space-y-2">
          <div
            v-for="elem in filteredElements"
            :key="elem.id"
            class="p-2.5 border border-gray-200 rounded-md hover:border-blue-300 transition-colors bg-white group"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1.5">
                  <span
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    :class="getStatusClass(elem.status)"
                    :title="connectorStatusLabels[elem.status]"
                  />
                  <span class="font-bold text-sm text-gray-800 truncate">{{ elem.name }}</span>
                  <span 
                    class="text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0"
                    :class="[getTypeClass(elem.type), 'bg-opacity-50 border-opacity-20']"
                  >
                    {{ connectorTypeLabels[elem.type] }}
                  </span>
                </div>
                <div class="text-xs text-gray-500 space-y-0.5 pl-4">
                  <!-- 海缆段显示 -->
                  <div v-if="elem.type === 'cable_segment'" class="space-y-0.5">
                    <div class="flex items-center gap-3">
                      <span>KP: <span class="font-medium text-gray-700">{{ elem.kp.toFixed(1) }} - {{ elem.endKp?.toFixed(1) }}</span> km</span>
                      <span class="w-px h-3 bg-gray-300"></span>
                      <span>长度: <span class="font-medium text-gray-700">{{ (elem.length || 0).toFixed(1) }}</span> km</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span>缆型: <span class="font-medium text-amber-600">{{ elem.cableTypeName || 'LW' }}</span></span>
                      <span class="w-px h-3 bg-gray-300"></span>
                      <span>余量: <span class="font-medium text-gray-700">{{ elem.slack ?? 3 }}%</span></span>
                      <span class="w-px h-3 bg-gray-300"></span>
                      <span>埋深: <span class="font-medium text-gray-700">{{ elem.burialDepth ?? 1.0 }}m</span></span>
                    </div>
                  </div>
                  <!-- 光纤段显示 -->
                  <div v-else-if="elem.type === 'fiber'" class="flex items-center gap-3">
                    <span>KP: <span class="font-medium text-gray-700">{{ elem.kp.toFixed(1) }} - {{ elem.endKp?.toFixed(1) }}</span> km</span>
                    <span class="w-px h-3 bg-gray-300"></span>
                    <span>长度: <span class="font-medium text-gray-700">{{ (elem.length || (elem.endKp ? elem.endKp - elem.kp : 0)).toFixed(1) }}</span> km</span>
                  </div>
                  <!-- 其他类型显示 -->
                  <div v-else class="flex items-center gap-3">
                    <span>KP: <span class="font-medium text-gray-700">{{ elem.kp.toFixed(1) }}</span> km</span>
                    <span class="w-px h-3 bg-gray-300"></span>
                    <span>水深: <span class="font-medium text-gray-700">{{ elem.depth.toFixed(1) }}</span> m</span>
                  </div>
                  <div v-if="getComponentName(elem.type, elem.componentRefId)" class="text-blue-500">
                    器件: {{ getComponentName(elem.type, elem.componentRefId) }}
                  </div>
                  <div v-if="getFiberName(elem.fiberRefId)" class="text-orange-500">
                    光纤类型: {{ getFiberName(elem.fiberRefId) }}
                  </div>
                  <div v-if="elem.specifications" class="text-gray-400">规格: {{ elem.specifications }}</div>
                  <div v-if="elem.type === 'equalizer'" class="text-amber-600">
                    模式: {{ elem.equalizerRole || 'T' }} · {{ elem.attenuationMode === 'fixed' ? 'F-ATT' : '可调' }}<span v-if="elem.attenuationDb"> · {{ elem.attenuationDb }} dB</span>
                  </div>
                </div>
              </div>
              <div class="flex gap-1 flex-shrink-0">
                <button 
                  class="h-6 w-6 p-0 flex items-center justify-center rounded hover:bg-gray-100" 
                  @click="emit('edit', elem.id)"
                  title="编辑"
                >
                  <Edit2 class="w-3.5 h-3.5 text-gray-500 hover:text-blue-600" />
                </button>
                <button 
                  class="h-6 w-6 p-0 flex items-center justify-center rounded hover:bg-gray-100" 
                  @click="handleDelete(elem.id)"
                  title="删除"
                >
                  <Trash2 class="w-3.5 h-3.5 text-gray-500 hover:text-red-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
