<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Layers, RefreshCw, Save, Search, Trash2 } from 'lucide-vue-next'
import { Button, Input, Select } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useLayerStore } from '@/stores/layer'
import { platformPlanLayerApi } from '@/services/platform/api'
import type { PlanLayer, PlanLayerTypeDic } from '@/services/platform/types'

const appStore = useAppStore()
const layerStore = useLayerStore()
const isLoading = ref(false)
const keyword = ref('')
const typeDic = ref('BATHY')
const layers = ref<PlanLayer[]>([])
const form = reactive({
  id: null as number | null,
  name: '',
  remarks: '',
  isPublic: '0',
  isDefault: '0',
  attachmentId: '',
  typeDic: 'BATHY',
})

const layerTypeOptions = [
  { value: 'BATHY', label: '海洋高程图' },
  { value: 'SLOPE', label: '海洋坡度图' },
  { value: 'VOLCANO', label: '海洋火山分布' },
  { value: 'CWCORAL', label: '冷水珊瑚分布' },
  { value: 'SEISMIC', label: '海洋地震分布' },
  { value: 'FISHZONE', label: '海洋渔区分布' },
  { value: 'SHIPLANE', label: '海洋航道图' },
]

const layerTypeToLocalId: Partial<Record<PlanLayerTypeDic, string>> = {
  BATHY: 'elevation',
  SLOPE: 'slope',
  VOLCANO: 'volcano',
  CWCORAL: 'coldCoral',
  SEISMIC: 'earthquake',
  FISHZONE: 'fishing',
  SHIPLANE: 'shipping',
}

const localLayerTypeMap: Record<string, 'point' | 'heatmap' | 'raster' | 'vector' | 'both'> = {
  elevation: 'raster',
  slope: 'heatmap',
  volcano: 'both',
  coldCoral: 'vector',
  earthquake: 'both',
  fishing: 'point',
  shipping: 'vector',
}

const publicCount = computed(() => layers.value.filter(layer => layer.isPublic === 1).length)
const defaultCount = computed(() => layers.value.filter(layer => layer.isDefault === 1).length)
const activeTypeLabel = computed(() => getLayerTypeLabel(typeDic.value))

function getLayerTypeLabel(value?: string | null) {
  return layerTypeOptions.find(option => option.value === value)?.label ?? '未分类'
}

function getLocalLayerId(layer: PlanLayer) {
  const mapped = layer.typeDic ? layerTypeToLocalId[layer.typeDic] : null
  return mapped ?? `platform-layer-${layer.id}`
}

function resetForm() {
  Object.assign(form, {
    id: null,
    name: '',
    remarks: '',
    isPublic: '0',
    isDefault: '0',
    attachmentId: '',
    typeDic: typeDic.value || 'BATHY',
  })
}

async function loadLayers() {
  isLoading.value = true
  try {
    const response = await platformPlanLayerApi.search({
      pageNumber: 1,
      pageSize: 100,
      name: keyword.value.trim() || undefined,
      typeDic: typeDic.value || undefined,
    })
    layers.value = response.data ?? []
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `平台图层加载失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
  }
}

async function editLayer(layer: PlanLayer) {
  if (!layer.id) return
  try {
    const detail = await platformPlanLayerApi.detail(layer.id)
    Object.assign(form, {
      id: detail.id ?? layer.id,
      name: detail.name ?? layer.name ?? '',
      remarks: detail.remarks ?? layer.remarks ?? '',
      isPublic: String(detail.isPublic ?? layer.isPublic ?? 0),
      isDefault: String(detail.isDefault ?? layer.isDefault ?? 0),
      attachmentId: String(detail.attachmentId ?? layer.attachmentId ?? ''),
      typeDic: detail.typeDic ?? layer.typeDic ?? 'BATHY',
    })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `图层详情加载失败：${(error as Error).message}` })
  }
}

async function saveLayer() {
  if (!form.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入图层名称' })
    return
  }
  isLoading.value = true
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
    appStore.showNotification({ type: 'success', message: '图层信息已保存' })
    resetForm()
    await loadLayers()
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `保存图层失败：${(error as Error).message}` })
  } finally {
    isLoading.value = false
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
    type: localLayerTypeMap[key] ?? 'vector',
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

onMounted(() => {
  resetForm()
  void loadLayers()
})
</script>

<template>
  <section class="p-6 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">平台图层库</h2>
        <p class="mt-1 text-sm text-slate-500">集中维护规划图层元数据，并可将平台图层加入当前规划图层列表。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadLayers">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <div class="rounded-md border border-slate-200 bg-white px-4 py-3">
        <div class="text-xs text-slate-500">当前分类</div>
        <div class="mt-1 text-xl font-semibold text-slate-950">{{ activeTypeLabel }}</div>
      </div>
      <div class="rounded-md border border-slate-200 bg-white px-4 py-3">
        <div class="text-xs text-slate-500">已加载图层</div>
        <div class="mt-1 text-xl font-semibold text-cyan-700">{{ layers.length }}</div>
      </div>
      <div class="rounded-md border border-slate-200 bg-white px-4 py-3">
        <div class="text-xs text-slate-500">公开 / 默认</div>
        <div class="mt-1 text-xl font-semibold text-emerald-700">{{ publicCount }} / {{ defaultCount }}</div>
      </div>
    </div>

    <div class="grid min-h-[620px] grid-cols-[minmax(0,1fr)_340px] gap-4 max-[1040px]:grid-cols-1">
      <section class="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="flex flex-wrap gap-2 border-b border-slate-200 p-3">
          <Input v-model="keyword" placeholder="搜索图层名称" class="min-w-[220px] flex-1" @keyup.enter="loadLayers" />
          <Select v-model="typeDic" :options="layerTypeOptions" class="w-44" />
          <Button variant="outline" :disabled="isLoading" @click="loadLayers">
            <Search class="mr-2 h-4 w-4" />
            查询
          </Button>
        </div>

        <div class="max-h-[560px] overflow-auto divide-y divide-slate-100">
          <div v-for="layer in layers" :key="layer.id" class="px-4 py-3 hover:bg-slate-50">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <Layers class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-slate-900">{{ layer.name || `图层 ${layer.id}` }}</div>
                <div class="mt-1 text-xs text-slate-500">
                  {{ getLayerTypeLabel(layer.typeDic) }} · 附件 {{ layer.attachmentId ?? '-' }}
                </div>
                <div v-if="layer.remarks" class="mt-1 truncate text-xs text-slate-400">{{ layer.remarks }}</div>
              </div>
              <div class="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
                <span class="rounded-full px-2 py-0.5" :class="layer.isPublic === 1 ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'">
                  {{ layer.isPublic === 1 ? '公开' : '私有' }}
                </span>
                <span v-if="layer.isDefault === 1" class="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">默认</span>
              </div>
              <div class="flex shrink-0 gap-2">
                <Button size="sm" @click="useLayerInPlanning(layer)">使用</Button>
                <Button size="sm" variant="outline" @click="editLayer(layer)">编辑</Button>
                <Button size="icon" variant="ghost" @click="removeLayer(layer)">
                  <Trash2 class="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          </div>
          <div v-if="!isLoading && layers.length === 0" class="px-4 py-12 text-center text-sm text-slate-400">
            暂无平台图层
          </div>
        </div>
      </section>

      <aside class="rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <h3 class="font-semibold text-slate-900">图层信息</h3>
          <p class="mt-1 text-xs text-slate-500">新增或编辑当前平台图层。</p>
        </div>
        <div class="space-y-3 p-4">
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">图层名称</span>
            <Input v-model="form.name" placeholder="图层名称" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">备注</span>
            <Input v-model="form.remarks" placeholder="备注" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">图层分类</span>
            <Select v-model="form.typeDic" :options="layerTypeOptions" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">附件 ID</span>
            <Input v-model="form.attachmentId" placeholder="附件 ID" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">可见范围</span>
            <Select v-model="form.isPublic" :options="[{ value: '0', label: '私有' }, { value: '1', label: '公开' }]" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-slate-500">默认状态</span>
            <Select v-model="form.isDefault" :options="[{ value: '0', label: '非默认' }, { value: '1', label: '默认图层' }]" />
          </label>
          <div class="flex gap-2 pt-2">
            <Button class="flex-1" :disabled="isLoading" @click="saveLayer">
              <Save class="mr-1 h-4 w-4" />
              保存
            </Button>
            <Button variant="outline" @click="resetForm">新建</Button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
