<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshCw, Search } from 'lucide-vue-next'
import { Button, Input } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { platformLogApi } from '@/services/platform/api'
import type { PageModel } from '@/services/platform/client'

const appStore = useAppStore()
const isLoading = ref(false)
const keyword = ref('')
const logs = ref<Record<string, unknown>[]>([])
const page = ref<PageModel | null>(null)
const selectedIndex = ref<number | null>(null)

const selectedLog = computed(() =>
  selectedIndex.value === null ? null : logs.value[selectedIndex.value] ?? null,
)

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function compactJson(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

async function loadLogs() {
  isLoading.value = true
  try {
    const response = await platformLogApi.search({ pageNumber: 1, pageSize: 50, title: keyword.value.trim() || undefined })
    logs.value = (response.data ?? []) as Record<string, unknown>[]
    page.value = response.page ?? null
    selectedIndex.value = logs.value.length > 0 ? 0 : null
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `操作日志加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadLogs()
})
</script>

<template>
  <section class="p-6 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">操作日志</h2>
        <p class="mt-1 text-sm text-slate-500">查询平台接口和业务操作审计记录，选中行后在页面右侧查看详情。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadLogs">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="rounded-md border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <Input v-model="keyword" placeholder="按日志标题搜索" class="max-w-[320px]" @keyup.enter="loadLogs" />
        <Button variant="outline" :disabled="isLoading" @click="loadLogs">
          <Search class="mr-1 h-4 w-4" />查询
        </Button>
        <span class="ml-auto text-xs text-slate-500">共 {{ page?.dataTotal ?? logs.length }} 条</span>
      </div>

      <div class="grid min-h-[560px] grid-cols-[minmax(0,1fr)_360px] max-[1180px]:grid-cols-1">
        <main class="min-w-0 overflow-auto border-r border-slate-200 max-[1180px]:border-r-0 max-[1180px]:border-b">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th class="px-4 py-2 text-left font-medium">标题</th>
                <th class="px-4 py-2 text-left font-medium">操作人</th>
                <th class="px-4 py-2 text-left font-medium">请求方法</th>
                <th class="px-4 py-2 text-left font-medium">状态</th>
                <th class="px-4 py-2 text-left font-medium">耗时</th>
                <th class="px-4 py-2 text-left font-medium">时间</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="(log, index) in logs"
                :key="index"
                class="cursor-pointer hover:bg-slate-50"
                :class="{ 'bg-cyan-50/70': selectedIndex === index }"
                @click="selectedIndex = index"
              >
                <td class="px-4 py-2 text-slate-900">{{ formatValue(log.title) }}</td>
                <td class="px-4 py-2 text-slate-600">{{ formatValue(log.operName) }}</td>
                <td class="px-4 py-2 font-mono text-xs text-slate-600">{{ formatValue(log.requestMethod || log.method || log.operUrl) }}</td>
                <td class="px-4 py-2 text-slate-600">{{ formatValue(log.status) }}</td>
                <td class="px-4 py-2 text-slate-600">{{ formatValue(log.costTime) }}</td>
                <td class="px-4 py-2 text-slate-600">{{ formatValue(log.operTime) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!isLoading && logs.length === 0" class="p-10 text-center text-sm text-slate-400">暂无操作日志</div>
        </main>

        <aside class="min-w-0">
          <div class="border-b border-slate-200 px-4 py-3">
            <h3 class="font-semibold text-slate-900">日志详情</h3>
            <p class="mt-1 text-xs text-slate-500">展示选中审计记录的请求和结果字段。</p>
          </div>
          <div v-if="!selectedLog" class="px-4 py-10 text-center text-sm text-slate-400">请选择一条日志</div>
          <dl v-else class="space-y-4 p-4 text-sm">
            <div>
              <dt class="text-xs text-slate-400">标题</dt>
              <dd class="mt-1 text-slate-900">{{ formatValue(selectedLog.title) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">请求地址</dt>
              <dd class="mt-1 break-all font-mono text-xs text-slate-700">{{ formatValue(selectedLog.operUrl || selectedLog.url) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">操作人 / IP</dt>
              <dd class="mt-1 text-slate-700">{{ formatValue(selectedLog.operName) }} / {{ formatValue(selectedLog.operIp) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">请求参数</dt>
              <dd class="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-700">
                {{ compactJson(selectedLog.operParam) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">返回结果</dt>
              <dd class="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-700">
                {{ compactJson(selectedLog.jsonResult) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">错误信息</dt>
              <dd class="mt-1 whitespace-pre-wrap text-rose-700">{{ formatValue(selectedLog.errorMsg) }}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  </section>
</template>
