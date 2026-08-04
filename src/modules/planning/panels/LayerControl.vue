<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useLayerStore } from '@/stores/layer'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { Select } from '@/shared/components/base'
import { RefreshCw, Download, Maximize2, X, Settings, CircleDollarSign, ShieldAlert } from 'lucide-vue-next'
import { detectGisFormat, getPlanLayerFileName } from '@/utils/gisFormat'
import { getLocalLayerIdForDictionaryCode } from '@/services/platform/layerTypeAdapter'

const layerStore = useLayerStore()
const dictionaryStore = useDictionaryStore()
const appStore = useAppStore()
const currentProject = computed(() => appStore.projectState.currentProject)
const hasOpenProject = computed(() => currentProject.value !== null)
const currentPlatformProjectId = computed(() => currentProject.value?.platformProjectId ?? null)
const hasPlatformProjectId = computed(() => currentPlatformProjectId.value !== null && currentPlatformProjectId.value !== undefined && currentPlatformProjectId.value !== '')

const emit = defineEmits<{
  (e: 'import-gis'): void
  (e: 'close'): void
}>()

// 图层类型筛选
const layerType = ref('all')
const layerTypeOptions = computed(() => [
  { value: 'all', label: '所有类型' },
  ...dictionaryStore.getOptions(PLATFORM_DICTIONARY_TYPES.layerType),
])

interface PlatformLayerRow {
  id: string
  storeLayerId: string
  name: string
  type: string
  typeName: string
  visible: boolean
  uploaded: boolean
  status: '已上传' | '未上传'
  statusClass: 'success' | 'info'
  fileName: string
  formatLabel: string
}

// 图层列表
const layers = computed<PlatformLayerRow[]>(() => {
  const allLayers = dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.layerType).map((dictionaryItem) => {
    const typeDic = String(dictionaryItem.code)
    const storeLayerId = getLocalLayerIdForDictionaryCode(typeDic)
    const platformLayer = layerStore.platformProjectLayers.find(layer => layer.typeDic === typeDic)
    const uploaded = Boolean(platformLayer?.attachmentId)
    const fileName = getPlanLayerFileName(platformLayer)
    const formatInfo = detectGisFormat(fileName)
    const status: PlatformLayerRow['status'] = uploaded ? '已上传' : '未上传'
    const statusClass: PlatformLayerRow['statusClass'] = uploaded ? 'success' : 'info'

    return {
      id: typeDic,
      storeLayerId,
      name: dictionaryItem.name || typeDic,
      type: typeDic,
      typeName: typeDic,
      visible: uploaded && layerStore.getLayerVisible(storeLayerId),
      uploaded,
      status,
      statusClass,
      fileName,
      formatLabel: uploaded ? formatInfo.label : '',
    }
  })

  if (layerType.value === 'all') return allLayers
  return allLayers.filter(l => l.type === layerType.value)
})

const algorithmLayers = computed(() => [
  { id: 'algorithm-cost', name: '成本底图', typeName: 'COST', icon: CircleDollarSign, color: '#d97706' },
  { id: 'algorithm-risk', name: '风险底图', typeName: 'RISK', icon: ShieldAlert, color: '#dc2626' },
].flatMap(item => {
  const layer = layerStore.getLayerById(item.id)
  return layer?.loaded ? [{ ...item, visible: layer.visible }] : []
}))

const visibleAlgorithmLayers = computed(() =>
  layerType.value === 'all' ? algorithmLayers.value : [])

function handleAlgorithmLayerVisible(id: string, visible: boolean) {
  if (visible) {
    for (const layer of algorithmLayers.value) {
      if (layer.id !== id && layer.visible) {
        layerStore.toggleLayer(layer.id, false)
      }
    }
  }
  layerStore.toggleLayer(id, visible)
}

// 全选状态
const uploadedLayers = computed(() => layers.value.filter(l => l.uploaded))
const selectableLayers = computed(() => [...visibleAlgorithmLayers.value, ...uploadedLayers.value])
const allChecked = computed(() => {
  const algorithmGroupChecked = visibleAlgorithmLayers.value.length === 0
    || visibleAlgorithmLayers.value.some(layer => layer.visible)
  const uploadedGroupChecked = uploadedLayers.value.every(layer => layer.visible)
  return selectableLayers.value.length > 0 && algorithmGroupChecked && uploadedGroupChecked
})
const someChecked = computed(() => selectableLayers.value.some(l => l.visible) && !allChecked.value)

async function handleSelectAll(checked: boolean) {
  if (!checked) {
    for (const layer of visibleAlgorithmLayers.value) {
      handleAlgorithmLayerVisible(layer.id, false)
    }
  } else if (visibleAlgorithmLayers.value.length > 0 && !visibleAlgorithmLayers.value.some(layer => layer.visible)) {
    handleAlgorithmLayerVisible(visibleAlgorithmLayers.value[0].id, true)
  }
  for (const layer of layers.value) {
    if (layer.uploaded) {
      await handleVisibleChange(layer, checked)
    }
  }
}

async function handleVisibleChange(layer: PlatformLayerRow, visible: boolean) {
  if (!layer.uploaded) return

  const loadingKey = `layer:${layer.storeLayerId}`
  if (visible) {
    appStore.showGlobalLoading('正在加载图层...', layer.name, loadingKey)
    await nextTick()
    try {
      await layerStore.loadPlatformLayerDetail(layer.storeLayerId)
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: `图层详情加载失败：${(error as Error).message}`,
        duration: 5000,
      })
      layerStore.setLayerVisible(layer.storeLayerId, false)
      appStore.hideGlobalLoading(loadingKey)
      return
    }
  }

  layerStore.toggleLayer(layer.storeLayerId, visible)
  if (!visible) {
    appStore.hideGlobalLoading(loadingKey)
    return
  }

  setTimeout(() => {
    if (!layerStore.getLayerById(layer.storeLayerId)?.loading) {
      appStore.hideGlobalLoading(loadingKey)
    }
  }, 800)
}

async function loadProjectLayers(showSuccess = false, forceDictionary = false) {
  if (forceDictionary) {
    try {
      await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.layerType, true)
      layerStore.syncDictionaryLayers()
    } catch (error) {
      appStore.showNotification({ type: 'error', message: `图层类型字典加载失败：${(error as Error).message}` })
      return
    }
  }
  if (!hasOpenProject.value) {
    await layerStore.loadPlatformProjectLayers(null)
    return
  }

  if (!hasPlatformProjectId.value) {
    await layerStore.loadPlatformProjectLayers(null)
    if (showSuccess) {
      appStore.showNotification({ type: 'warning', message: '当前项目尚未同步到平台，暂无平台图层数据' })
    }
    return
  }

  try {
    await layerStore.loadPlatformProjectLayers(currentPlatformProjectId.value)
    if (showSuccess) {
      appStore.showNotification({ type: 'success', message: '图层列表已刷新' })
    }
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `图层列表加载失败：${(error as Error).message}`,
      duration: 5000,
    })
  }
}

function handleRefresh() {
  void loadProjectLayers(true, true)
}

function handleImportGis() {
  emit('import-gis')
}

function handleLayerSettings(layerId: string) {
  appStore.showNotification({ type: 'info', message: `打开 ${layerId} 图层设置` })
}

onMounted(() => {
  void loadProjectLayers()
})

watch(currentPlatformProjectId, () => {
  void loadProjectLayers()
})
</script>

<template>
  <div class="flex flex-col flex-1 rounded shadow-sm overflow-hidden text-sm" style="background-color: var(--app-card-bg); color: var(--app-text-color);">
    <!-- Panel Header -->
    <div class="flex items-center justify-between px-3 py-2" style="background-color: var(--app-bg-secondary); border-bottom: 1px solid var(--app-border-color);">
      <span class="font-semibold">图层信息</span>
      <div class="flex gap-1">
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="刷新图层"
          :disabled="layerStore.platformLayersLoading"
          @click="handleRefresh"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': layerStore.platformLayersLoading }" />
        </button>
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="导入本地GIS数据"
          @click="handleImportGis"
        >
          <Download class="w-3.5 h-3.5" />
        </button>
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="浮动/全屏"
        >
          <Maximize2 class="w-3.5 h-3.5" />
        </button>
        <button 
          class="p-1 hover:text-blue-500 text-gray-400 transition-colors" 
          title="隐藏"
          @click="emit('close')"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    
    <div class="flex-1 overflow-auto p-2">
      <div v-if="!hasOpenProject" class="h-full min-h-[180px] flex flex-col items-center justify-center text-center text-xs text-[#909399] px-6">
        <div class="font-medium text-[#606266] mb-1">尚未打开项目</div>
        <div>请先新建或打开项目后查看图层信息</div>
      </div>
      <template v-else>
      <!-- 图层类型筛选 -->
      <div class="mb-2">
        <Select 
          v-model="layerType" 
          :options="layerTypeOptions"
          placeholder="选择类型"
        />
      </div>

      <!-- Layer Table -->
      <div class="text-xs">
        <!-- Table Header -->
        <div class="flex items-center py-1.5 border-b border-[#ebeef5] text-[#909399] font-medium">
          <div class="w-[24px] flex justify-center">
            <input 
              type="checkbox"
              :checked="allChecked"
              :indeterminate="someChecked"
              class="w-3.5 h-3.5 cursor-pointer accent-blue-500"
              @change="handleSelectAll(($event.target as HTMLInputElement).checked)"
            >
          </div>
          <span class="flex-1 pl-1">名称</span>
          <span class="w-[40px] text-center">类型</span>
          <span class="w-[52px] text-center">状态</span>
          <span class="w-[44px] text-center">操作</span>
        </div>

        <!-- Algorithm result layers use the same table as platform layers. -->
        <div
          v-for="layer in visibleAlgorithmLayers"
          :key="layer.id"
          class="flex items-center py-2 border-b border-dashed border-[#ebeef5] hover:bg-gray-50"
        >
          <div class="w-[24px] flex justify-center">
            <input
              type="checkbox"
              :checked="layer.visible"
              class="w-3.5 h-3.5 accent-blue-500"
              @change="handleAlgorithmLayerVisible(layer.id, ($event.target as HTMLInputElement).checked)"
            >
          </div>
          <div class="flex flex-1 min-w-0 items-center gap-1.5 pl-1">
            <div class="truncate text-[#606266]">{{ layer.name }}</div>
          </div>
          <span class="w-[40px] text-center text-[#909399]">{{ layer.typeName }}</span>
          <div class="w-[52px] flex justify-center">
            <span class="text-[10px] text-green-600">已生成</span>
          </div>
          <div class="w-[44px] flex justify-center gap-0.5">
            <button
              class="p-0.5 hover:text-blue-500 text-gray-400 transition-colors"
              title="设置"
              @click="handleLayerSettings(layer.id)"
            >
              <Settings class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Layer Rows -->
        <div 
          v-for="layer in layers" 
          :key="layer.id"
          class="flex items-center py-2 border-b border-dashed border-[#ebeef5] hover:bg-gray-50"
        >
          <div class="w-[24px] flex justify-center">
            <input 
              type="checkbox"
              :checked="layer.visible"
              :disabled="!layer.uploaded"
              class="w-3.5 h-3.5 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              @change="handleVisibleChange(layer, ($event.target as HTMLInputElement).checked)"
            >
          </div>
          <div class="flex-1 min-w-0 pl-1" :title="layer.fileName ? `${layer.name} · ${layer.formatLabel} · ${layer.fileName}` : layer.name">
            <div class="truncate text-[#606266]">{{ layer.name }}</div>
          </div>
          <span class="w-[40px] text-center text-[#909399]">{{ layer.typeName }}</span>
          <div class="w-[52px] flex justify-center">
            <span 
              class="px-1.5 py-0.5 rounded text-[10px]"
              :class="{
                'text-green-600': layer.statusClass === 'success',
                'text-gray-400': layer.statusClass === 'info'
              }"
            >
              {{ layer.status }}
            </span>
          </div>
          <div class="w-[44px] flex justify-center gap-0.5">
            <button
              class="p-0.5 hover:text-blue-500 text-gray-400 transition-colors"
              title="设置"
              @click="handleLayerSettings(layer.id)"
            >
              <Settings class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div v-if="layerStore.platformLayersLoading && layers.length === 0" class="py-10 text-center text-xs text-[#909399]">
          正在加载图层列表...
        </div>
        <div v-else-if="!layerStore.platformLayersLoading && layers.length === 0 && visibleAlgorithmLayers.length === 0" class="py-10 text-center text-xs text-[#909399]">
          暂无上传图层
        </div>
      </div>
      </template>
    </div>
  </div>
</template>
