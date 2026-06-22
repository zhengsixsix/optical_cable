<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useLayerStore } from '@/stores/layer'
import { Select } from '@/shared/components/base'
import { RefreshCw, Download, Maximize2, X, Upload, Settings } from 'lucide-vue-next'
import type { PlanLayerTypeDic } from '@/services/platform/types'
import { detectGisFormat, getPlanLayerFileName } from '@/utils/gisFormat'

const layerStore = useLayerStore()
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
const layerTypeOptions = [
  { value: 'all', label: '所有类型' },
  { value: 'base', label: '基础图层' },
  { value: 'route', label: '路由图层' },
  { value: 'risk', label: '风险图层' },
]

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

const platformLayerDefinitions = [
  { typeDic: 'BATHY', id: 'bathy', storeLayerId: 'elevation', name: '海洋高程图', type: 'base' },
  { typeDic: 'VOLCANO', id: 'volcano', storeLayerId: 'volcano', name: '海洋火山分布', type: 'risk' },
  { typeDic: 'FISHZONE', id: 'fishzone', storeLayerId: 'fishing', name: '海洋渔区分布', type: 'risk' },
  { typeDic: 'SLOPE', id: 'slope', storeLayerId: 'slope', name: '海洋坡度图', type: 'base' },
  { typeDic: 'SEISMIC', id: 'seismic', storeLayerId: 'earthquake', name: '海洋地震分布', type: 'risk' },
  { typeDic: 'SHIPLANE', id: 'shiplane', storeLayerId: 'shipping', name: '海洋航道图', type: 'risk' },
] satisfies Array<{
  typeDic: PlanLayerTypeDic
  id: string
  storeLayerId: string
  name: string
  type: string
}>

// 图层类型显示名
const layerTypeName: Record<string, string> = {
  base: '基础',
  route: '路由',
  risk: '风险',
}

// 图层列表
const layers = computed<PlatformLayerRow[]>(() => {
  const allLayers = platformLayerDefinitions.map((definition) => {
    const platformLayer = layerStore.platformProjectLayers.find(layer => layer.typeDic === definition.typeDic)
    const uploaded = Boolean(platformLayer?.attachmentId)
    const fileName = getPlanLayerFileName(platformLayer)
    const formatInfo = detectGisFormat(fileName)
    const status: PlatformLayerRow['status'] = uploaded ? '已上传' : '未上传'
    const statusClass: PlatformLayerRow['statusClass'] = uploaded ? 'success' : 'info'

    return {
      id: definition.id,
      storeLayerId: definition.storeLayerId,
      name: definition.name,
      type: definition.type,
      typeName: layerTypeName[definition.type],
      visible: uploaded && layerStore.getLayerVisible(definition.storeLayerId),
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

// 全选状态
const uploadedLayers = computed(() => layers.value.filter(l => l.uploaded))
const allChecked = computed(() => uploadedLayers.value.length > 0 && uploadedLayers.value.every(l => l.visible))
const someChecked = computed(() => uploadedLayers.value.some(l => l.visible) && !allChecked.value)

async function handleSelectAll(checked: boolean) {
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

async function loadProjectLayers(showSuccess = false) {
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
  void loadProjectLayers(true)
}

function handleImportGis() {
  emit('import-gis')
}

function handleLayerSettings(layerId: string) {
  appStore.showNotification({ type: 'info', message: `打开 ${layerId} 图层设置` })
}

function handleExport(layerId: string) {
  appStore.openDialog('export')
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
          title="导出图层"
          @click="handleExport('')"
        >
          <Upload class="w-3.5 h-3.5" />
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
      <div v-else-if="!hasPlatformProjectId" class="h-full min-h-[180px] flex flex-col items-center justify-center text-center text-xs text-[#909399] px-6">
        <div class="font-medium text-[#606266] mb-1">暂无平台项目ID</div>
        <div>当前项目还未同步到平台，暂不能加载图层信息</div>
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
            <button
              class="p-0.5 hover:text-blue-500 text-gray-400 transition-colors"
              title="导出"
              @click="handleExport(layer.id)"
            >
              <Upload class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div v-if="layerStore.platformLayersLoading && layers.length === 0" class="py-10 text-center text-xs text-[#909399]">
          正在加载图层列表...
        </div>
        <div v-else-if="!layerStore.platformLayersLoading && layers.length === 0" class="py-10 text-center text-xs text-[#909399]">
          暂无上传图层
        </div>
      </div>
      </template>
    </div>
  </div>
</template>
