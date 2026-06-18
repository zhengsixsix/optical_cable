<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RefreshCw, Save, Trash2 } from 'lucide-vue-next'
import { Button, Input, Select } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { platformDictionaryApi } from '@/services/platform/api'
import type { PlatformDictionary } from '@/services/platform/types'

const appStore = useAppStore()
const isLoading = ref(false)
const dictionaryType = ref('PLAN_TYPE')
const dictionaries = ref<PlatformDictionary[]>([])
const selectableItems = ref<PlatformDictionary[]>([])
const form = reactive({ id: '', type: 'PLAN_TYPE', code: '', name: '', detail: '', sortNum: 999, isValidCd: '1' })

const typeOptions = [
  { value: 'PLAN_TYPE', label: '项目类型' },
  { value: 'LAYER_TYPE', label: '图层分类' },
  { value: 'REGISTER_APPROVAL', label: '注册审批状态' },
  { value: 'IS_VALID', label: '启用状态' },
]

const activeTypeLabel = computed(() => typeOptions.find(item => item.value === dictionaryType.value)?.label ?? dictionaryType.value)

function resetForm() {
  Object.assign(form, { id: '', type: dictionaryType.value, code: '', name: '', detail: '', sortNum: 999, isValidCd: '1' })
}

function editItem(item: PlatformDictionary) {
  Object.assign(form, {
    id: item.id ?? '',
    type: item.type ?? dictionaryType.value,
    code: item.code ?? '',
    name: item.name ?? '',
    detail: item.detail ?? '',
    sortNum: item.sortNum ?? 999,
    isValidCd: item.isValidCd ?? '1',
  })
}

async function loadData() {
  isLoading.value = true
  try {
    form.type = dictionaryType.value
    const [list, items] = await Promise.all([
      platformDictionaryApi.search({ pageNumber: 1, pageSize: 100, type: dictionaryType.value }),
      platformDictionaryApi.listItem(dictionaryType.value),
    ])
    dictionaries.value = list.data ?? []
    selectableItems.value = items ?? []
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `字典加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

async function changeType(type: string) {
  dictionaryType.value = type
  resetForm()
  await loadData()
}

async function saveItem() {
  if (!form.code.trim() || !form.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入字典编码和名称' })
    return
  }
  isLoading.value = true
  try {
    await platformDictionaryApi.save({ ...form, id: form.id || null })
    appStore.showNotification({ type: 'success', message: '字典项已保存' })
    resetForm()
    await loadData()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `保存字典失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

async function removeItem(item: PlatformDictionary) {
  if (!item.id || !item.type || !confirm(`确定删除「${item.name || item.code}」吗？`)) return
  isLoading.value = true
  try {
    await platformDictionaryApi.remove({ id: item.id, type: item.type })
    appStore.showNotification({ type: 'success', message: '字典项已删除' })
    resetForm()
    await loadData()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `删除字典失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  resetForm()
  void loadData()
})
</script>

<template>
  <section class="p-6 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">数据字典</h2>
        <p class="mt-1 text-sm text-slate-500">维护平台枚举、业务分类和可选项，当前分类：{{ activeTypeLabel }}。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadData">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="grid min-h-[620px] grid-cols-[220px_minmax(0,1fr)_340px] gap-4 max-[1180px]:grid-cols-1">
      <aside class="rounded-md border border-slate-200 bg-white p-3">
        <div class="mb-3 text-xs font-semibold uppercase text-slate-400">字典类型</div>
        <button
          v-for="option in typeOptions"
          :key="option.value"
          class="mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
          :class="dictionaryType === option.value ? 'bg-cyan-50 font-medium text-cyan-800' : 'text-slate-600'"
          @click="changeType(option.value)"
        >
          <span>{{ option.label }}</span>
          <span class="text-xs text-slate-400">{{ option.value }}</span>
        </button>
      </aside>

      <main class="grid min-w-0 grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div class="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">维护项</div>
          <div class="max-h-[560px] overflow-auto divide-y divide-slate-100">
            <button
              v-for="item in dictionaries"
              :key="`${item.type}-${item.id}-${item.code}`"
              class="w-full px-4 py-3 text-left hover:bg-cyan-50/60"
              :class="{ 'bg-cyan-50': form.id && form.id === item.id }"
              @click="editItem(item)"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="truncate text-sm font-medium text-slate-900">{{ item.name || item.code }}</span>
                <span class="rounded-full px-2 py-0.5 text-xs" :class="item.isValidCd === '1' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'">
                  {{ item.isValidCd === '1' ? '启用' : '停用' }}
                </span>
              </div>
              <div class="mt-1 text-xs text-slate-500">{{ item.code }} · 排序 {{ item.sortNum ?? '-' }}</div>
              <div v-if="item.detail" class="mt-1 truncate text-xs text-slate-400">{{ item.detail }}</div>
            </button>
            <div v-if="!isLoading && dictionaries.length === 0" class="px-4 py-10 text-center text-sm text-slate-400">暂无字典项</div>
          </div>
        </section>

        <section class="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div class="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">业务可选项</div>
          <div class="max-h-[560px] overflow-auto divide-y divide-slate-100">
            <div v-for="item in selectableItems" :key="`${item.type}-${item.code}`" class="px-4 py-3">
              <div class="text-sm font-medium text-slate-900">{{ item.name || item.code }}</div>
              <div class="mt-1 text-xs text-slate-500">{{ item.code }}</div>
            </div>
            <div v-if="!isLoading && selectableItems.length === 0" class="px-4 py-10 text-center text-sm text-slate-400">暂无可选项</div>
          </div>
        </section>
      </main>

      <aside class="rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <h3 class="font-semibold text-slate-900">字典项编辑</h3>
          <p class="mt-1 text-xs text-slate-500">新增或编辑当前分类下的字典项。</p>
        </div>
        <div class="space-y-3 p-4">
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">类型</span>
            <Select v-model="form.type" :options="typeOptions" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">编码</span>
            <Input v-model="form.code" placeholder="编码" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">名称</span>
            <Input v-model="form.name" placeholder="名称" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">说明</span>
            <Input v-model="form.detail" placeholder="说明" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">排序</span>
            <Input v-model="form.sortNum" type="number" placeholder="排序" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">状态</span>
            <Select v-model="form.isValidCd" :options="[{ value: '1', label: '启用' }, { value: '0', label: '停用' }]" />
          </label>
          <div class="flex gap-2 pt-2">
            <Button class="flex-1" :disabled="isLoading" @click="saveItem">
              <Save class="mr-1 h-4 w-4" />保存
            </Button>
            <Button variant="outline" @click="resetForm">新建</Button>
            <Button v-if="form.id" variant="destructive" @click="removeItem(form as PlatformDictionary)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
