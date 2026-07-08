<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FileText, RefreshCw, Search } from 'lucide-vue-next'
import { Button, Input } from '@/shared/components/base'
import AdminPagination from '../components/AdminPagination.vue'
import { useAppStore } from '@/stores/app'
import { platformLogApi } from '@/services/platform/api'
import type { PageModel } from '@/services/platform/client'

const appStore = useAppStore()
const isLoading = ref(false)
const keyword = ref('')
const logs = ref<Record<string, unknown>[]>([])
const page = ref<PageModel | null>(null)
const pageNumber = ref(1)
const pageSize = ref(10)
const total = ref(0)
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

async function loadLogs(resetPage = false) {
  if (resetPage) pageNumber.value = 1
  isLoading.value = true
  try {
    const response = await platformLogApi.search({
      pageNumber: pageNumber.value,
      pageSize: pageSize.value,
      title: keyword.value.trim() || undefined,
    })
    logs.value = (response.data ?? []) as Record<string, unknown>[]
    page.value = response.page ?? null
    total.value = Number(response.page?.dataTotal ?? logs.value.length)
    if (response.page?.pageNumber) pageNumber.value = Number(response.page.pageNumber)
    if (response.page?.pageSize) pageSize.value = Number(response.page.pageSize)
    selectedIndex.value = logs.value.length > 0 ? 0 : null
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `操作日志加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

function changePage(page: number) {
  pageNumber.value = page
  void loadLogs()
}

function changePageSize(size: number) {
  pageSize.value = size
  void loadLogs(true)
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
      <Button variant="outline" :disabled="isLoading" @click="loadLogs()">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="admin-master-detail-layout admin-log-layout">
      <aside class="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText class="h-4 w-4 text-cyan-700" />
            日志列表
          </div>
          <p class="mt-1 text-xs text-slate-500">共 {{ page?.dataTotal ?? total }} 条审计记录</p>
        </div>

        <div class="flex gap-2 border-b border-slate-200 p-3">
          <Input v-model="keyword" placeholder="按日志标题搜索" class="min-w-0 flex-1" @keyup.enter="loadLogs(true)" />
          <Button variant="outline" :disabled="isLoading" @click="loadLogs(true)">
            <Search class="mr-1 h-4 w-4" />查询
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-2">
          <div v-if="isLoading" class="px-3 py-8 text-center text-sm text-slate-400">正在加载操作日志...</div>
          <template v-else-if="logs.length > 0">
            <button
              v-for="(log, index) in logs"
              :key="index"
              type="button"
              class="mb-1 w-full rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
              :class="selectedIndex === index ? 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-100' : 'text-slate-600'"
              @click="selectedIndex = index"
            >
              <span class="flex items-start justify-between gap-3">
                <span class="min-w-0">
                  <span class="block truncate font-medium text-slate-900">{{ formatValue(log.title) }}</span>
                  <span class="mt-1 block truncate text-xs text-slate-500">
                    {{ formatValue(log.operName) }} / {{ formatValue(log.requestMethod || log.method || log.operUrl) }}
                  </span>
                </span>
                <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {{ formatValue(log.status) }}
                </span>
              </span>
              <span class="mt-1.5 block truncate text-xs text-slate-400">{{ formatValue(log.operTime) }}</span>
            </button>
          </template>
          <div v-else class="px-3 py-10 text-center text-sm text-slate-400">暂无操作日志</div>
        </div>

        <AdminPagination
          :page-number="pageNumber"
          :page-size="pageSize"
          :total="total"
          :loading="isLoading"
          @change-page="changePage"
          @change-page-size="changePageSize"
        />
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <h3 class="text-sm font-semibold text-slate-900">日志详情</h3>
          <p class="mt-1 text-xs text-slate-500">展示选中审计记录的请求和结果字段。</p>
        </div>

        <div v-if="!selectedLog" class="flex flex-1 items-center justify-center px-4 py-10 text-sm text-slate-400">
          请选择一条日志
        </div>
        <div v-else class="min-h-0 flex-1 overflow-auto p-4">
          <dl class="grid gap-4 text-sm md:grid-cols-2">
            <div class="md:col-span-2">
              <dt class="text-xs text-slate-400">标题</dt>
              <dd class="mt-1 text-slate-900">{{ formatValue(selectedLog.title) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">操作人</dt>
              <dd class="mt-1 text-slate-700">{{ formatValue(selectedLog.operName) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">IP</dt>
              <dd class="mt-1 text-slate-700">{{ formatValue(selectedLog.operIp) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">请求方法</dt>
              <dd class="mt-1 font-mono text-xs text-slate-700">{{ formatValue(selectedLog.requestMethod || selectedLog.method) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-400">状态 / 耗时</dt>
              <dd class="mt-1 text-slate-700">{{ formatValue(selectedLog.status) }} / {{ formatValue(selectedLog.costTime) }}</dd>
            </div>
            <div class="md:col-span-2">
              <dt class="text-xs text-slate-400">请求地址</dt>
              <dd class="mt-1 break-all font-mono text-xs text-slate-700">{{ formatValue(selectedLog.operUrl || selectedLog.url) }}</dd>
            </div>
            <div class="md:col-span-2">
              <dt class="text-xs text-slate-400">请求参数</dt>
              <dd class="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700">
                {{ compactJson(selectedLog.operParam) }}
              </dd>
            </div>
            <div class="md:col-span-2">
              <dt class="text-xs text-slate-400">返回结果</dt>
              <dd class="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700">
                {{ compactJson(selectedLog.jsonResult) }}
              </dd>
            </div>
            <div class="md:col-span-2">
              <dt class="text-xs text-slate-400">错误信息</dt>
              <dd class="mt-1 whitespace-pre-wrap text-rose-700">{{ formatValue(selectedLog.errorMsg) }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  </section>
</template>
