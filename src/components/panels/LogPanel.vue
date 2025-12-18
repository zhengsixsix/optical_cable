<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores'
import { Download, Trash2 } from 'lucide-vue-next'

const appStore = useAppStore()

const logs = computed(() => appStore.recentLogs)

const handleExport = (format: 'txt' | 'csv') => {
  appStore.exportLogs(format)
}

const handleClear = () => {
  appStore.clearLogs()
}
</script>

<template>
  <div class="h-[150px] bg-white rounded shadow-sm p-2 overflow-hidden flex flex-col">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between mb-1 pb-1 border-b border-gray-100">
      <span class="text-xs font-medium text-gray-600">运行日志 ({{ logs.length }})</span>
      <div class="flex items-center gap-1">
        <button 
          class="p-1 text-gray-400 hover:text-blue-500 transition-colors" 
          title="导出TXT"
          @click="handleExport('txt')"
        >
          <Download class="w-3.5 h-3.5" />
        </button>
        <button 
          class="p-1 text-gray-400 hover:text-red-500 transition-colors" 
          title="清空日志"
          @click="handleClear"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    <!-- 日志列表 -->
    <div class="flex-1 overflow-y-auto font-mono text-xs text-gray-600">
      <div 
        v-for="(log, index) in logs" 
        :key="index" 
        class="mb-0.5"
      >
        <span class="text-gray-400 mr-2">[{{ log.time }}]</span>
        <span 
          :class="[
            'mr-2 font-bold',
            log.level === 'INFO' ? 'text-primary' : 
            log.level === 'WARN' ? 'text-warning' : 'text-danger'
          ]"
        >
          [{{ log.level }}]
        </span>
        <span>{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>
