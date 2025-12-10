<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores'

const appStore = useAppStore()

const logs = computed(() => appStore.recentLogs)
</script>

<template>
  <div class="h-[150px] bg-white rounded shadow-sm p-2 overflow-hidden flex flex-col">
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
