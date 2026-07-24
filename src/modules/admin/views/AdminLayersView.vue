<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Layers, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-vue-next'
import { Button, Input, Select } from '@/shared/components/base'
import AdminPagination from '../components/AdminPagination.vue'
import { useAppStore } from '@/stores/app'
import { useLayerStore } from '@/stores/layer'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { platformPlanLayerApi } from '@/services/platform/api'
import type { PlanLayer } from '@/services/platform/types'
import {
  getLocalLayerIdForDictionaryCode,
  getRuntimeLayerTypeForDictionaryCode,
} from '@/services/platform/layerTypeAdapter'

const appStore = useAppStore()
const layerStore = useLayerStore()
const dictionaryStore = useDictionaryStore()
const isLoading = ref(false)
const isSaving = ref(false)
const isFormDialogOpen = ref(false)
const keyword = ref('')
const typeDic = ref('')
const layers = ref<PlanLayer[]>([])
const pageNumber = ref(1)
const pageSize = ref(10)
const total = ref(0)
const form = reactive({
  id: null as number | null,
  name: '',
  remarks: '',
  isPublic: '0',
  isDefault: '0',
  attachmentId: '',
  typeDic: '',
})

const layerTypeOptions = computed(() => dictionaryStore.getOptions(PLATFORM_DICTIONARY_TYPES.layerType))

const publicCount = computed(() => layers.value.filter(layer => layer.isPublic === 1).length)
const defaultCount = computed(() => layers.value.filter(layer => layer.isDefault === 1).length)
const activeTypeLabel = computed(() => getLayerTypeLabel(typeDic.value))
const dialogTitle = computed(() => form.id ? '编辑图层' : '新增图层')

function getLayerTypeLabel(value?: string | null) {
  return dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.layerType, value)?.name ?? value ?? '未分类'
}

function getLocalLayerId(layer: PlanLayer) {
  return layer.typeDic ? getLocalLayerIdForDictionaryCode(layer.typeDic) : `platform-layer-${layer.id}`
}

function resetForm() {
  Object.assign(form, {
    id: null,
    name: '',
    remarks: '',
    isPublic: '0',
    isDefault: '0',
    attachmentId: '',
    typeDic: typeDic.value,
  })
}

function openCreateDialog() {
  resetForm()
  isFormDialogOpen.value = true
}

async function openEditDialog(layer: PlanLayer) {
  if (!layer.id) return
  isLoading.value = true
  try {
    const detail = await platformPlanLayerApi.detail(layer.id)
    Object.assign(form, {
      id: detail.id ?? layer.id,
      name: detail.name ?? layer.name ?? '',
      remarks: detail.remarks ?? layer.remarks ?? '',
      isPublic: String(detail.isPublic ?? layer.isPublic ?? 0),
      isDefault: String(detail.isDefault ?? layer.isDefault ?? 0),
      attachmentId: String(detail.attachmentId ?? layer.attachmentId ?? ''),
      typeDic: detail.typeDic ?? layer.typeDic ?? typeDic.value,
    })
    isFormDialogOpen.value = true
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `图层详情加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

function closeFormDialog() {
  if (isSaving.value) return
  isFormDialogOpen.value = false
}

async function loadLayers(resetPage = false) {
  if (resetPage) pageNumber.value = 1
  isLoading.value = true
  try {
    const response = await platformPlanLayerApi.search({
      pageNumber: pageNumber.value,
      pageSize: pageSize.value,
      name: keyword.value.trim() || undefined,
      typeDic: typeDic.value || undefined,
    })
    layers.value = response.data ?? []
    total.value = Number(response.page?.dataTotal ?? layers.value.length)
    if (response.page?.pageNumber) pageNumber.value = Number(response.page.pageNumber)
    if (response.page?.pageSize) pageSize.value = Number(response.page.pageSize)
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `平台图层加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

function changeType(value: string) {
  if (value === typeDic.value) return
  typeDic.value = value
  resetForm()
  void loadLayers(true)
}

function changePage(page: number) {
  pageNumber.value = page
  void loadLayers()
}

function changePageSize(size: number) {
  pageSize.value = size
  void loadLayers(true)
}

async function saveLayer() {
  if (!form.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入图层名称' })
    return
  }
  if (!form.typeDic) {
    appStore.showNotification({ type: 'warning', message: '请选择图层类型' })
    return
  }
  if (!dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.layerType, form.typeDic)) {
    appStore.showNotification({ type: 'warning', message: `LAYER_TYPE 字典中不存在图层类型 ${form.typeDic}` })
    return
  }
  isSaving.value = true
  try {
    await platformPlanLayerApi.save({
      id: form.id ?? undefined,
      name: form.name.trim(),
      remarks: form.remarks,
      isPublic: Number(form.isPublic) as 0 | 1,
      isDefault: Number(form.isDefault) as 0 | 1,
      attachmentId: form.attachmentId.trim() ? Number(form.attachmentId) : null,
      typeDic: form.typeDic as PlanLayer['typeDic'],
    })
    appStore.showNotification({ type: 'success', message: '图层已保存' })
    typeDic.value = form.typeDic
    isFormDialogOpen.value = false
    resetForm()
    await loadLayers()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `保存图层失败：${(error as Error).message}` })
  } finally {
    isSaving.value = false
  }
}

async function removeLayer(layer: PlanLayer) {
  if (!layer.id || !confirm(`确定删除图层「${layer.name || layer.id}」吗？`)) return
  isLoading.value = true
  try {
    await platformPlanLayerApi.remove(layer.id)
    appStore.showNotification({ type: 'success', message: '图层已删除' })
    resetForm()
    await loadLayers()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `删除图层失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

function useLayerInPlanning(layer: PlanLayer) {
  if (!layer.id) return
  const key = getLocalLayerId(layer)
  layerStore.upsertLayer({
    id: key,
    name: layer.name || getLayerTypeLabel(layer.typeDic) || `平台图层 ${layer.id}`,
    type: getRuntimeLayerTypeForDictionaryCode(layer.typeDic),
    visible: true,
    loaded: true,
    loading: false,
  })
  layerStore.setLayerVisible(key, true)
  layerStore.setLayerData(key, {
    id: key,
    metadata: {
      source: `platform:${layer.id}:${layer.name || ''}:${layer.attachmentId ?? ''}`,
    },
  })
  appStore.showNotification({ type: 'success', message: `已加入当前规划图层：${layer.name || layer.id}` })
}

onMounted(async () => {
  try {
    await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.layerType)
    typeDic.value = layerTypeOptions.value[0]?.value ?? ''
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `图层类型字典加载失败：${(error as Error).message}` })
  }
  resetForm()
  await loadLayers()
})
</script>

<template>
  <section class="space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">平台图层库</h2>
        <p class="mt-1 text-sm text-slate-500">左侧选择图层分类，右侧维护当前分类下的图层。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadLayers()">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="admin-master-detail-layout admin-wide-master">
      <aside class="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Layers class="h-4 w-4 text-cyan-700" />
            图层分类
          </div>
          <p class="mt-1 text-xs text-slate-500">切换分类后刷新右侧列表</p>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-2">
          <button
            v-for="option in layerTypeOptions"
            :key="option.value"
            type="button"
            class="mb-1 flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
            :class="typeDic === option.value ? 'bg-cyan-50 font-medium text-cyan-800 ring-1 ring-cyan-100' : 'text-slate-600'"
            @click="changeType(option.value)"
          >
            <span class="min-w-0">
              <span class="block truncate">{{ option.label }}</span>
              <span class="mt-0.5 block truncate text-xs text-slate-400">{{ option.value }}</span>
            </span>
          </button>
        </div>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">图层列表</h3>
            <p class="mt-1 text-xs text-slate-500">当前分类：{{ activeTypeLabel }}，共 {{ total }} 条。公开 / 默认：{{ publicCount }} / {{ defaultCount }}</p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <Input v-model="keyword" placeholder="搜索图层名称" class="w-56" @keyup.enter="loadLayers(true)" />
            <Button variant="outline" :disabled="isLoading" @click="loadLayers(true)">
              <Search class="mr-2 h-4 w-4" />
              查询
            </Button>
            <Button :disabled="isLoading" @click="openCreateDialog">
              <Plus class="mr-2 h-4 w-4" />
              新增
            </Button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
            <thead class="sticky top-0 z-[1] bg-slate-50 text-xs text-slate-500">
              <tr>
                <th class="border-b border-slate-200 px-4 py-3 font-medium">图层名称</th>
                <th class="border-b border-slate-200 px-4 py-3 font-medium">附件</th>
                <th class="w-24 border-b border-slate-200 px-4 py-3 font-medium">范围</th>
                <th class="w-24 border-b border-slate-200 px-4 py-3 font-medium">默认</th>
                <th class="w-56 border-b border-slate-200 px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="layer in layers" :key="layer.id" class="hover:bg-slate-50">
                <td class="border-b border-slate-100 px-4 py-3">
                  <div class="font-medium text-slate-900">{{ layer.name || `图层 ${layer.id}` }}</div>
                  <div v-if="layer.remarks" class="mt-1 truncate text-xs text-slate-400">{{ layer.remarks }}</div>
                </td>
                <td class="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                  {{ layer.attachmentId ?? '-' }}
                </td>
                <td class="border-b border-slate-100 px-4 py-3">
                  <span class="rounded-full px-2 py-0.5 text-xs" :class="layer.isPublic === 1 ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'">
                    {{ layer.isPublic === 1 ? '公开' : '私有' }}
                  </span>
                </td>
                <td class="border-b border-slate-100 px-4 py-3">
                  <span v-if="layer.isDefault === 1" class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">默认</span>
                  <span v-else class="text-xs text-slate-400">-</span>
                </td>
                <td class="border-b border-slate-100 px-4 py-3">
                  <div class="flex justify-end gap-2">
                    <Button size="sm" @click="useLayerInPlanning(layer)">使用</Button>
                    <Button size="sm" variant="outline" @click="openEditDialog(layer)">
                      <Pencil class="mr-1 h-4 w-4" />
                      编辑
                    </Button>
                    <Button size="icon" variant="ghost" @click="removeLayer(layer)">
                      <Trash2 class="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="isLoading" class="px-4 py-8 text-center text-sm text-slate-400">正在加载图层...</div>
          <div v-else-if="layers.length === 0" class="px-4 py-12 text-center text-sm text-slate-400">暂无平台图层</div>
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
      <div class="admin-form-dialog flex max-h-full flex-col overflow-hidden rounded-md bg-white shadow-xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 class="text-base font-semibold text-slate-950">{{ dialogTitle }}</h3>
            <p class="mt-1 text-xs text-slate-500">当前分类：{{ getLayerTypeLabel(form.typeDic) }}</p>
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
              <span class="text-xs text-slate-500">图层名称</span>
              <Input v-model="form.name" placeholder="图层名称" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">备注</span>
              <Input v-model="form.remarks" placeholder="备注" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">图层分类</span>
              <Select v-model="form.typeDic" :options="layerTypeOptions" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">附件 ID</span>
              <Input v-model="form.attachmentId" placeholder="附件 ID" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">可见范围</span>
              <Select v-model="form.isPublic" :options="[{ value: '0', label: '私有' }, { value: '1', label: '公开' }]" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">默认状态</span>
              <Select v-model="form.isDefault" :options="[{ value: '0', label: '非默认' }, { value: '1', label: '默认图层' }]" :disabled="isSaving" />
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button variant="outline" :disabled="isSaving" @click="closeFormDialog">取消</Button>
          <Button :disabled="isSaving" @click="saveLayer">
            <Save class="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
