<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

interface Props {
  pageNumber: number
  pageSize: number
  total: number
  loading?: boolean
  pageSizeOptions?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  pageSizeOptions: () => [10, 20, 50],
})

const emit = defineEmits<{
  (e: 'change-page', page: number): void
  (e: 'change-page-size', pageSize: number): void
}>()

const pageTotal = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const pageStart = computed(() => props.total === 0 ? 0 : (props.pageNumber - 1) * props.pageSize + 1)
const pageEnd = computed(() => Math.min(props.pageNumber * props.pageSize, props.total))

function changePage(page: number) {
  const nextPage = Math.min(Math.max(1, page), pageTotal.value)
  if (nextPage !== props.pageNumber) emit('change-page', nextPage)
}

function changePageSize(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(value) && value > 0 && value !== props.pageSize) {
    emit('change-page-size', value)
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
    <span>显示 {{ pageStart }}-{{ pageEnd }} / 共 {{ total }} 条</span>
    <div class="flex items-center gap-2">
      <span>每页</span>
      <select
        :value="pageSize"
        class="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"
        :disabled="loading"
        @change="changePageSize"
      >
        <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }} 条</option>
      </select>
      <button
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="pageNumber <= 1 || loading"
        title="上一页"
        @click="changePage(pageNumber - 1)"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>
      <span class="min-w-[76px] text-center">第 {{ pageNumber }} / {{ pageTotal }} 页</span>
      <button
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="pageNumber >= pageTotal || loading"
        title="下一页"
        @click="changePage(pageNumber + 1)"
      >
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
