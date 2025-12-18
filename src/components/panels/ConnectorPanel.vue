<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { useConnectorStore, useAppStore } from '@/stores'
import { connectorTypeLabels, connectorStatusLabels } from '@/types'
import type { ConnectorType, ConnectorStatus } from '@/types'
import { Plus, Trash2, Edit2, Link2 } from 'lucide-vue-next'

const connectorStore = useConnectorStore()
const appStore = useAppStore()

const emit = defineEmits<{
  (e: 'edit', id: string): void
  (e: 'add'): void
}>()

// 筛选类型
const filterType = ref<ConnectorType | 'all'>('all')

// 筛选后的接线元列表
const filteredElements = computed(() => {
  if (filterType.value === 'all') {
    return connectorStore.elements
  }
  return connectorStore.elements.filter(e => e.type === filterType.value)
})

// 获取类型样式
const getTypeClass = (type: ConnectorType) => {
  const classes: Record<ConnectorType, string> = {
    joint: 'bg-gray-100 text-gray-700',
    bu: 'bg-blue-100 text-blue-700',
    pfe: 'bg-yellow-100 text-yellow-700',
    ola: 'bg-green-100 text-green-700',
    equalizer: 'bg-purple-100 text-purple-700',
    coupler: 'bg-orange-100 text-orange-700'
  }
  return classes[type]
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
          v-for="(label, type) in connectorTypeLabels"
          :key="type"
          :class="[
            'px-2.5 py-1 text-xs font-medium transition-colors border-b-2',
            filterType === type 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
          @click="filterType = type"
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
                  <div class="flex items-center gap-3">
                    <span>KP: <span class="font-medium text-gray-700">{{ elem.kp }}</span> km</span>
                    <span class="w-px h-3 bg-gray-300"></span>
                    <span>水深: <span class="font-medium text-gray-700">{{ elem.depth }}</span> m</span>
                  </div>
                  <div v-if="elem.specifications" class="text-gray-400">规格: {{ elem.specifications }}</div>
                </div>
              </div>
              <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="sm" class="h-6 w-6 p-0" @click="emit('edit', elem.id)">
                  <Edit2 class="w-3.5 h-3.5 text-gray-500 hover:text-blue-600" />
                </Button>
                <Button variant="ghost" size="sm" class="h-6 w-6 p-0" @click="handleDelete(elem.id)">
                  <Trash2 class="w-3.5 h-3.5 text-gray-500 hover:text-red-600" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
