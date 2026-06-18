<script setup lang="ts">
import { ref, watch } from 'vue'
import { FileStack, RefreshCw, Search, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { Button, Input } from '@/shared/components/base'
import { platformLogApi } from '@/services/platform/api'
import type { PageModel } from '@/services/platform/client'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const appStore = useAppStore()
const isLoading = ref(false)
const keyword = ref('')
const logs = ref<Record<string, unknown>[]>([])
const page = ref<PageModel | null>(null)

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

async function loadLogs() {
  isLoading.value = true
  try {
    const response = await platformLogApi.search({ pageNumber: 1, pageSize: 50, title: keyword.value.trim() || undefined })
    logs.value = (response.data ?? []) as Record<string, unknown>[]
    page.value = response.page ?? null
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `操作日志加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

watch(() => props.visible, visible => {
  if (visible) loadLogs()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center" @click.self="emit('close')">
      <div class="w-[1040px] max-w-[calc(100vw-32px)] max-h-[86vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <header class="h-14 px-5 border-b flex items-center justify-between">
          <div class="flex items-center gap-2">
            <FileStack class="w-5 h-5 text-blue-600" />
            <div>
              <div class="font-semibold text-slate-900">操作日志</div>
              <div class="text-xs text-slate-500">查看平台接口的业务操作记录</div>
            </div>
          </div>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" :disabled="isLoading" @click="loadLogs">
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')"><X class="w-4 h-4" /></Button>
          </div>
        </header>

        <div class="p-3 border-b flex gap-2">
          <Input v-model="keyword" placeholder="按日志标题搜索" class="w-80" @keyup.enter="loadLogs" />
          <Button variant="outline" :disabled="isLoading" @click="loadLogs"><Search class="w-4 h-4 mr-1" />查询</Button>
          <span class="ml-auto text-xs text-slate-500 self-center">共 {{ page?.dataTotal ?? logs.length }} 条</span>
        </div>

        <main class="flex-1 min-h-0 overflow-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 sticky top-0">
              <tr>
                <th class="text-left px-4 py-2 font-medium">标题</th>
                <th class="text-left px-4 py-2 font-medium">操作人</th>
                <th class="text-left px-4 py-2 font-medium">请求方法</th>
                <th class="text-left px-4 py-2 font-medium">状态</th>
                <th class="text-left px-4 py-2 font-medium">耗时</th>
                <th class="text-left px-4 py-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="(log, index) in logs" :key="index" class="hover:bg-slate-50">
                <td class="px-4 py-2">{{ formatValue(log.title) }}</td>
                <td class="px-4 py-2">{{ formatValue(log.operName) }}</td>
                <td class="px-4 py-2 font-mono text-xs">{{ formatValue(log.requestMethod || log.method || log.operUrl) }}</td>
                <td class="px-4 py-2">{{ formatValue(log.status) }}</td>
                <td class="px-4 py-2">{{ formatValue(log.costTime) }}</td>
                <td class="px-4 py-2">{{ formatValue(log.operTime) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!isLoading && logs.length === 0" class="p-8 text-center text-sm text-slate-400">暂无操作日志</div>
        </main>
      </div>
    </div>
  </Teleport>
</template>
