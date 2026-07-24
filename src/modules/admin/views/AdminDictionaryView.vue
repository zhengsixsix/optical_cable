<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { BookOpen, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-vue-next'
import { Button, Input, Select } from '@/shared/components/base'
import AdminPagination from '../components/AdminPagination.vue'
import { useAppStore } from '@/stores/app'
import { useDictionaryStore } from '@/stores/dictionary'
import type { PlatformDictionary } from '@/services/platform/types'

const DICTIONARY_TYPE_SOURCE = 'DIC_TYPE'

const appStore = useAppStore()
const dictionaryStore = useDictionaryStore()
const isTypeLoading = ref(false)
const isLoading = ref(false)
const isDeleting = ref(false)
const isSaving = ref(false)
const isFormDialogOpen = ref(false)
const dictionaryType = ref('')
const dictionaryTypes = computed(() => dictionaryStore.getItems(DICTIONARY_TYPE_SOURCE, true))
const dictionaries = ref<PlatformDictionary[]>([])
const pageNumber = ref(1)
const pageSize = ref(10)
const total = ref(0)
const form = reactive({ id: '', type: '', code: '', name: '', detail: '', sortNum: 999, isValidCd: '1' })
let dictionaryTypeRequestSequence = 0
let dictionaryDataRequestSequence = 0

const statusOptions = [
  { value: '1', label: '启用' },
  { value: '0', label: '停用' },
]

const isBusy = computed(() => isTypeLoading.value || isLoading.value || isDeleting.value || isSaving.value)
const activeType = computed(() => dictionaryTypes.value.find(item => item.code === dictionaryType.value) ?? null)
const activeTypeLabel = computed(() => activeType.value?.name || dictionaryType.value || '未选择')
const activeTypeOptions = computed(() =>
  dictionaryTypes.value
    .filter((item): item is PlatformDictionary & { code: string } => Boolean(item.code))
    .map(item => ({ value: item.code, label: item.name || item.code }))
)
const hasDictionaryTypes = computed(() => dictionaryTypes.value.length > 0)
const dialogTitle = computed(() => form.id ? '编辑字典项' : '新增字典项')

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
    isValidCd: item.isValidCd === '0' ? '0' : '1',
  })
}

function openCreateDialog() {
  resetForm()
  isFormDialogOpen.value = true
}

function openEditDialog(item: PlatformDictionary) {
  editItem(item)
  isFormDialogOpen.value = true
}

function closeFormDialog() {
  if (isSaving.value) return
  isFormDialogOpen.value = false
}

function clearListData() {
  dictionaries.value = []
  total.value = 0
  pageNumber.value = 1
}

async function loadDictionaryTypes(force = false) {
  const requestSequence = ++dictionaryTypeRequestSequence
  isTypeLoading.value = true
  try {
    await dictionaryStore.loadDictionary(DICTIONARY_TYPE_SOURCE, force)
    if (requestSequence !== dictionaryTypeRequestSequence) return
    dictionaryType.value = dictionaryTypes.value.some(item => item.code === dictionaryType.value)
      ? dictionaryType.value
      : dictionaryTypes.value[0]?.code ?? ''
    resetForm()
    await loadData(true)
  } catch (error) {
    if (requestSequence !== dictionaryTypeRequestSequence) return
    dictionaryType.value = ''
    clearListData()
    resetForm()
    appStore.showNotification({ type: 'error', message: `字典类型加载失败：${(error as Error).message}` })
  } finally {
    if (requestSequence === dictionaryTypeRequestSequence) {
      isTypeLoading.value = false
    }
  }
}

async function loadData(resetPage = false) {
  if (resetPage) pageNumber.value = 1
  const requestedType = dictionaryType.value
  const requestSequence = ++dictionaryDataRequestSequence
  if (!requestedType) {
    clearListData()
    isLoading.value = false
    return
  }

  const requestedPage = pageNumber.value
  const requestedPageSize = pageSize.value
  isLoading.value = true
  try {
    const response = await dictionaryStore.searchDictionary({
      pageNumber: requestedPage,
      pageSize: requestedPageSize,
      type: requestedType,
    })
    if (requestSequence !== dictionaryDataRequestSequence || dictionaryType.value !== requestedType) return

    const responseItems = response.data ?? []
    const responseTotal = Math.max(0, Number(response.page?.dataTotal ?? responseItems.length) || 0)
    const responsePageSize = Math.max(1, Number(response.page?.pageSize ?? requestedPageSize) || requestedPageSize)
    const responsePage = Math.max(1, Number(response.page?.pageNumber ?? requestedPage) || requestedPage)
    const maxPage = Math.max(1, Math.ceil(responseTotal / responsePageSize))
    if (responsePage > maxPage) {
      pageNumber.value = maxPage
      await loadData()
      return
    }

    dictionaries.value = responseItems
    total.value = responseTotal
    pageNumber.value = responsePage
    pageSize.value = responsePageSize
  } catch (error) {
    if (requestSequence === dictionaryDataRequestSequence && dictionaryType.value === requestedType) {
      appStore.showNotification({ type: 'error', message: `字典内容加载失败：${(error as Error).message}` })
    }
  } finally {
    if (requestSequence === dictionaryDataRequestSequence) {
      isLoading.value = false
    }
  }
}

async function changeType(type: string) {
  if (!type || type === dictionaryType.value) return
  dictionaryType.value = type
  resetForm()
  await loadData(true)
}

function changePage(page: number) {
  pageNumber.value = page
  void loadData()
}

function changePageSize(size: number) {
  pageSize.value = size
  void loadData(true)
}

async function saveItem() {
  const payloadType = form.type || dictionaryType.value
  if (!payloadType) {
    appStore.showNotification({ type: 'warning', message: '请先选择字典类型' })
    return
  }
  if (!form.code.trim() || !form.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入字典编码和名称' })
    return
  }

  isSaving.value = true
  try {
    await dictionaryStore.saveDictionary({
      ...form,
      id: form.id || null,
      type: payloadType,
      code: form.code.trim(),
      name: form.name.trim(),
      detail: form.detail.trim(),
      sortNum: Number(form.sortNum) || 999,
    })
    appStore.showNotification({ type: 'success', message: '字典项已保存' })
    isFormDialogOpen.value = false
    if (payloadType !== dictionaryType.value) dictionaryType.value = payloadType
    resetForm()
    if (payloadType === DICTIONARY_TYPE_SOURCE) {
      await loadDictionaryTypes(true)
    } else {
      await loadData()
    }
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `保存字典失败：${(error as Error).message}` })
  } finally {
    isSaving.value = false
  }
}

async function removeItem(item: PlatformDictionary) {
  if (!item.id || !item.type || !confirm(`确定删除「${item.name || item.code}」吗？`)) return
  isDeleting.value = true
  try {
    await dictionaryStore.removeDictionary({ id: item.id, type: item.type })
    appStore.showNotification({ type: 'success', message: '字典项已删除' })
    if (form.id === item.id) {
      isFormDialogOpen.value = false
      resetForm()
    }
    if (item.type === DICTIONARY_TYPE_SOURCE) {
      await loadDictionaryTypes(true)
    } else {
      await loadData()
    }
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `删除字典失败：${(error as Error).message}` })
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  void loadDictionaryTypes()
})
</script>

<template>
  <section class="space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">数据字典</h2>
        <p class="mt-1 text-sm text-slate-500">左侧选择字典类型，右侧维护当前类型下的字典内容。</p>
      </div>
      <Button variant="outline" :disabled="isBusy" @click="loadDictionaryTypes(true)">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isBusy }" />
        刷新
      </Button>
    </div>

    <div class="dictionary-layout admin-master-detail-layout">
      <aside class="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <BookOpen class="h-4 w-4 text-cyan-700" />
            字典类型
          </div>
          <p class="mt-1 text-xs text-slate-500">来自 {{ DICTIONARY_TYPE_SOURCE }} 可选项</p>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-2">
          <div v-if="isTypeLoading" class="px-3 py-8 text-center text-sm text-slate-400">正在加载字典类型...</div>
          <template v-else-if="hasDictionaryTypes">
            <button
              v-for="option in dictionaryTypes"
              :key="option.code"
              type="button"
              class="mb-1 flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
              :class="dictionaryType === option.code ? 'bg-cyan-50 font-medium text-cyan-800 ring-1 ring-cyan-100' : 'text-slate-600'"
              @click="changeType(option.code || '')"
            >
              <span class="min-w-0">
                <span class="block truncate">{{ option.name || option.code }}</span>
                <span class="mt-0.5 block truncate text-xs text-slate-400">{{ option.code }}</span>
              </span>
              <span
                class="shrink-0 rounded-full px-2 py-0.5 text-xs"
                :class="option.editable === 0 ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'"
              >
                {{ option.editable === 0 ? '只读' : '可维护' }}
              </span>
            </button>
          </template>
          <div v-else class="px-3 py-10 text-center text-sm text-slate-400">暂无字典类型</div>
        </div>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">字典内容列表</h3>
            <p class="mt-1 text-xs text-slate-500">当前类型：{{ activeTypeLabel }}，共 {{ total }} 条。</p>
          </div>
          <Button :disabled="isBusy || !hasDictionaryTypes" @click="openCreateDialog">
            <Plus class="mr-2 h-4 w-4" />
            新增
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead class="sticky top-0 z-[1] bg-slate-50 text-xs text-slate-500">
              <tr>
                <th class="border-b border-slate-200 px-4 py-3 font-medium">名称</th>
                <th class="border-b border-slate-200 px-4 py-3 font-medium">编码</th>
                <th class="border-b border-slate-200 px-4 py-3 font-medium">说明</th>
                <th class="w-24 border-b border-slate-200 px-4 py-3 font-medium">排序</th>
                <th class="w-24 border-b border-slate-200 px-4 py-3 font-medium">状态</th>
                <th class="w-32 border-b border-slate-200 px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in dictionaries" :key="`${item.type}-${item.id}-${item.code}`" class="hover:bg-slate-50">
                <td class="border-b border-slate-100 px-4 py-3">
                  <div class="max-w-[220px] truncate font-medium text-slate-900">{{ item.name || item.code }}</div>
                </td>
                <td class="border-b border-slate-100 px-4 py-3">
                  <span class="font-mono text-xs text-slate-600">{{ item.code || '-' }}</span>
                </td>
                <td class="border-b border-slate-100 px-4 py-3">
                  <div class="max-w-[340px] truncate text-slate-500">{{ item.detail || '-' }}</div>
                </td>
                <td class="border-b border-slate-100 px-4 py-3 text-slate-600">{{ item.sortNum ?? '-' }}</td>
                <td class="border-b border-slate-100 px-4 py-3">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="item.isValidCd === '1' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'"
                  >
                    {{ item.isValidCd === '1' ? '启用' : '停用' }}
                  </span>
                </td>
                <td class="border-b border-slate-100 px-4 py-3">
                  <div class="flex justify-end gap-2">
                    <Button size="sm" variant="outline" @click="openEditDialog(item)">
                      <Pencil class="mr-1 h-4 w-4" />
                      编辑
                    </Button>
                    <Button size="icon" variant="ghost" :disabled="isBusy" @click="removeItem(item)">
                      <Trash2 class="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="isLoading" class="px-4 py-8 text-center text-sm text-slate-400">正在加载字典内容...</div>
          <div v-else-if="dictionaries.length === 0" class="px-4 py-12 text-center text-sm text-slate-400">暂无字典内容</div>
        </div>

        <AdminPagination
          :page-number="pageNumber"
          :page-size="pageSize"
          :total="total"
          :loading="isLoading"
          @change-page="changePage"
          @change-page-size="changePageSize"
        />
      </section>
    </div>

    <div
      v-if="isFormDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      @click.self="closeFormDialog"
    >
      <div class="dictionary-dialog admin-form-dialog flex max-h-full flex-col overflow-hidden rounded-md bg-white shadow-xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 class="text-base font-semibold text-slate-950">{{ dialogTitle }}</h3>
            <p class="mt-1 text-xs text-slate-500">当前类型：{{ activeTypeLabel }}</p>
          </div>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            :disabled="isSaving"
            title="关闭"
            @click="closeFormDialog"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="min-h-0 overflow-auto px-5 py-4">
          <div class="grid gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">类型</span>
              <Select v-model="form.type" :options="activeTypeOptions" :disabled="!hasDictionaryTypes || isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">编码</span>
              <Input v-model="form.code" placeholder="编码" :disabled="!hasDictionaryTypes || isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">名称</span>
              <Input v-model="form.name" placeholder="名称" :disabled="!hasDictionaryTypes || isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">说明</span>
              <Input v-model="form.detail" placeholder="说明" :disabled="!hasDictionaryTypes || isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">排序</span>
              <Input v-model="form.sortNum" type="number" placeholder="排序" :disabled="!hasDictionaryTypes || isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">状态</span>
              <Select v-model="form.isValidCd" :options="statusOptions" :disabled="!hasDictionaryTypes || isSaving" />
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button variant="outline" :disabled="isSaving" @click="closeFormDialog">取消</Button>
          <Button :disabled="isSaving || !hasDictionaryTypes" @click="saveItem">
            <Save class="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
