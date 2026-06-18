<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FilePlus, FolderOpen, Save, X, Loader2, RefreshCw, Trash2, HardDrive, ArrowRight, CheckCircle2, Clock3, PencilLine } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { Button, Select, Input } from '@/shared/components/base'
import { platformPointApi, platformProjectApi } from '@/services/platform/api'
import type { PlanPoint, PlanProject } from '@/services/platform/types'

interface Props {
  mode: 'new' | 'open' | 'save' | 'save-as'
  visible: boolean
}

interface LayerItem {
  key: string
  label: string
  checked: boolean
  value: string
}

interface PlatformProjectDraft {
  project: PlanProject
  points: PlanPoint[]
  status: 'draft' | 'stationed' | 'ready'
}

type ProjectType = 'use'

const projectTypeOptions = [
  { value: 'use', label: '海缆规划项目 (.use)' }
]

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success', data: { projectType: ProjectType; projectName: string; savePath: string; allowOtherUsers: boolean; layers: LayerItem[] }): void
  (e: 'open-platform', projectId: number): void
  (e: 'continue-platform', draft: PlatformProjectDraft): void
  (e: 'open-file', file: File): void
}>()

const appStore = useAppStore()
const projectType = ref<ProjectType>('use')
const projectName = ref('')
const savePath = ref('')
const allowOtherUsers = ref(false)
const fileName = ref('')
const isProcessing = ref(false)
const platformProjects = ref<PlatformProjectDraft[]>([])
const selectedPlatformProjectId = ref<number | null>(null)
const platformSearchKeyword = ref('')
const platformProjectLoading = ref(false)

// 预加载图层设置
const layerList = ref<LayerItem[]>([
  { key: 'elevation', label: '海洋高程图', checked: false, value: '' },
  { key: 'volcano', label: '海洋火山分布', checked: false, value: '' },
  { key: 'fishery', label: '海洋渔区分布', checked: true, value: '' },
  { key: 'slope', label: '海洋坡度图', checked: false, value: '' },
  { key: 'earthquake', label: '海洋地震分布', checked: false, value: '' },
  { key: 'shipping', label: '海洋航道图', checked: true, value: '' },
])

const resetForm = () => {
  projectType.value = 'use'
  projectName.value = ''
  savePath.value = ''
  allowOtherUsers.value = false
  layerList.value.forEach(item => {
    item.checked = item.key === 'fishery' || item.key === 'shipping'
    item.value = ''
  })
}

watch(() => props.visible, (val) => {
  if (val) {
    if (props.mode === 'new') {
      resetForm()
    } else {
      projectName.value = ''
    }
    fileName.value = ''
    selectedPlatformProjectId.value = null
    if (props.mode === 'open') {
      loadPlatformProjects()
    }
  }
})

const title = computed(() => {
  switch (props.mode) {
    case 'new': return '新建项目'
    case 'open': return '打开项目'
    case 'save': return '保存项目'
    case 'save-as': return '另存为'
    default: return '项目操作'
  }
})

const icon = computed(() => {
  switch (props.mode) {
    case 'new': return FilePlus
    case 'open': return FolderOpen
    case 'save': 
    case 'save-as': return Save
    default: return FilePlus
  }
})

const dialogWidth = computed(() => {
  if (props.mode === 'open') return 'w-[760px]'
  return props.mode === 'new' ? 'w-[480px]' : 'w-[500px]'
})

// 文件选择器引用
const layerInputRef = ref<HTMLInputElement | null>(null)
const currentBrowseItem = ref<LayerItem | null>(null)

// 浏览图层文件
const handleBrowseLayer = (item: LayerItem) => {
  currentBrowseItem.value = item
  layerInputRef.value?.click()
}

// 图层文件选择回调
const handleLayerSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0 && currentBrowseItem.value) {
    currentBrowseItem.value.value = target.files[0].name
    currentBrowseItem.value.checked = true
  }
  target.value = ''
}

// 通用浏览文件（用于打开/另存为模式）
const projectFileInputRef = ref<HTMLInputElement | null>(null)
const handleBrowse = () => {
  projectFileInputRef.value?.click()
}
const handleProjectFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    fileName.value = file.name
    if (props.mode === 'open') {
      emit('open-file', file)
      emit('close')
    } else if (props.mode === 'save-as') {
      savePath.value = file.name
    }
  }
  target.value = ''
}

const selectedPlatformProject = computed(() =>
  platformProjects.value.find(item => item.project.id === selectedPlatformProjectId.value) ?? null,
)

function getProjectDraftStatus(points: PlanPoint[]): PlatformProjectDraft['status'] {
  const validPoints = points.filter(point => typeof point.longitude === 'number' && typeof point.latitude === 'number')
  if (validPoints.length === 0) return 'draft'
  if (validPoints.length < 2) return 'stationed'
  return 'ready'
}

function getStatusLabel(status: PlatformProjectDraft['status']) {
  if (status === 'draft') return '项目草稿'
  if (status === 'stationed') return '待补站点'
  return '可打开'
}

function getStatusClass(status: PlatformProjectDraft['status']) {
  if (status === 'draft') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'stationed') return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function getProjectName(project: PlanProject) {
  return project.name || '未命名项目'
}

function getPointProgressLabel(draft: PlatformProjectDraft) {
  const count = draft.points.length
  if (draft.status === 'ready') return `${count} 个站点，配置完整`
  if (draft.status === 'stationed') return '1 个站点，待补终点'
  return '待配置站点'
}

function getStatusIcon(status: PlatformProjectDraft['status']) {
  if (status === 'ready') return CheckCircle2
  if (status === 'stationed') return PencilLine
  return Clock3
}

function openOrContinuePlatformProject(draft: PlatformProjectDraft) {
  if (!draft.project.id) return
  selectedPlatformProjectId.value = draft.project.id
  if (draft.status === 'ready') {
    emit('open-platform', draft.project.id)
    return
  }
  emit('continue-platform', draft)
}

async function loadPlatformProjects() {
  platformProjectLoading.value = true
  try {
    const response = await platformProjectApi.search({
      pageNumber: 1,
      pageSize: 100,
      name: platformSearchKeyword.value.trim() || undefined,
    })
    const projects = response.data ?? []
    platformProjects.value = await Promise.all(projects.map(async project => {
      if (!project.id) return { project, points: [], status: 'draft' as const }
      try {
        const pointResponse = await platformPointApi.search({ pageNumber: 1, pageSize: 100, projectId: project.id })
        const points = pointResponse.data ?? []
        return { project, points, status: getProjectDraftStatus(points) }
      } catch {
        return { project, points: [], status: 'draft' as const }
      }
    }))
    selectedPlatformProjectId.value = platformProjects.value[0]?.project.id ?? null
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `平台项目加载失败：${(error as Error).message}` })
  } finally {
    platformProjectLoading.value = false
  }
}

async function deletePlatformProject(project: PlanProject) {
  if (!project.id) return
  isProcessing.value = true
  try {
    await platformProjectApi.remove(project.id)
    platformProjects.value = platformProjects.value.filter(item => item.project.id !== project.id)
    if (selectedPlatformProjectId.value === project.id) {
      selectedPlatformProjectId.value = platformProjects.value[0]?.project.id ?? null
    }
    appStore.showNotification({ type: 'success', message: `平台项目已删除：${getProjectName(project)}` })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `删除平台项目失败：${(error as Error).message}` })
  } finally {
    isProcessing.value = false
  }
}

const handleSubmit = async () => {
  if (props.mode === 'new' && !projectName.value) return
  if (props.mode === 'open') {
    if (!selectedPlatformProjectId.value) return
    if (selectedPlatformProject.value?.status !== 'ready') {
      emit('continue-platform', selectedPlatformProject.value!)
      return
    }
    emit('open-platform', selectedPlatformProjectId.value)
    return
  }
  if (props.mode === 'save-as' && !projectName.value) return
  
  isProcessing.value = true
  await new Promise(resolve => setTimeout(resolve, 800))
  
  appStore.showNotification({ 
    type: 'success', 
    message: `${title.value}成功` 
  })
  
  isProcessing.value = false
  emit('success', {
    projectType: projectType.value,
    projectName: projectName.value,
    savePath: savePath.value,
    allowOtherUsers: allowOtherUsers.value,
    layers: layerList.value.filter(l => l.checked)
  })
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <!-- 图层文件选择器 -->
    <input
      ref="layerInputRef"
      type="file"
      class="hidden"
      accept=".tif,.tiff,.geojson,.json"
      @change="handleLayerSelected"
    >
    <!-- 项目文件选择器 (用于打开/另存为) -->
    <input
      ref="projectFileInputRef"
      type="file"
      class="hidden"
      accept=".use"
      @change="handleProjectFileSelected"
    >
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-200"
      @click.self="emit('close')"
    >
      <div 
        :class="['bg-white rounded-xl shadow-2xl max-w-[90vw] overflow-hidden transform transition-all scale-100', dialogWidth]"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div class="flex items-center gap-2.5 text-gray-800">
            <component :is="icon" class="w-5 h-5 text-blue-600" />
            <span class="font-semibold text-lg">{{ title }}</span>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
            @click="emit('close')"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-6">
          <!-- 新建项目表单 -->
          <template v-if="mode === 'new'">
            <!-- 项目基本信息 -->
            <div class="space-y-3 mb-5">
              <!-- 项目类型 -->
              <div class="flex items-center gap-3">
                <label class="w-[110px] text-sm text-gray-600 shrink-0">项目类型：</label>
                <Select 
                  v-model="projectType"
                  :options="projectTypeOptions"
                  class="flex-1"
                />
              </div>
              <!-- 项目名称 -->
              <div class="flex items-center gap-3">
                <label class="w-[110px] text-sm text-gray-600 shrink-0">项目名称：</label>
                <Input v-model="projectName" placeholder="请输入项目名称" class="flex-1" />
              </div>
              <!-- 允许其他用户打开 -->
              <div class="flex items-center gap-3">
                <input 
                  v-model="allowOtherUsers"
                  type="checkbox" 
                  id="allowOtherUsers"
                  class="w-4 h-4 cursor-pointer accent-blue-600"
                >
                <label for="allowOtherUsers" class="text-sm text-gray-600 cursor-pointer">项目允许其他用户打开</label>
              </div>
            </div>

            <!-- 预加载图层设置 -->
            <div class="border border-gray-200 rounded-lg p-4">
              <h4 class="text-sm font-medium text-gray-800 mb-4 text-center">预加载图层设置</h4>
              <div class="space-y-2">
                <div 
                  v-for="item in layerList" 
                  :key="item.key"
                  class="flex items-center gap-2"
                >
                  <input 
                    v-model="item.checked"
                    type="checkbox" 
                    :id="item.key"
                    class="w-4 h-4 cursor-pointer accent-blue-600"
                  >
                  <label :for="item.key" class="w-[90px] text-sm text-gray-600 shrink-0 cursor-pointer">{{ item.label }}：</label>
                  <input 
                    v-model="item.value"
                    type="text" 
                    readonly
                    placeholder="请选择保存目录"
                    class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm bg-gray-50 cursor-default"
                  >
                  <button 
                    class="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors whitespace-nowrap"
                    @click="handleBrowseLayer(item)"
                  >
                    浏览
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- 打开工程表单 -->
          <template v-else-if="mode === 'open'">
            <div class="space-y-3">
              <div class="flex gap-2">
                <Input
                  v-model="platformSearchKeyword"
                  placeholder="搜索平台项目名称"
                  class="flex-1"
                  @keyup.enter="loadPlatformProjects"
                />
                <Button variant="outline" :disabled="platformProjectLoading" @click="loadPlatformProjects">
                  <RefreshCw class="w-4 h-4 mr-1" :class="{ 'animate-spin': platformProjectLoading }" />
                  刷新
                </Button>
              </div>

              <div class="h-[360px] border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <div v-if="platformProjectLoading" class="h-full flex items-center justify-center text-gray-500">
                  <Loader2 class="w-5 h-5 mr-2 animate-spin" />
                  正在加载平台项目
                </div>
                <div v-else-if="platformProjects.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400">
                  <FolderOpen class="w-10 h-10 mb-2 text-gray-300" />
                  <p>暂无平台项目</p>
                </div>
                <div v-else class="h-full overflow-auto divide-y divide-gray-100 bg-white">
                  <div
                    v-for="draft in platformProjects"
                    :key="draft.project.id"
                    role="button"
                    tabindex="0"
                    class="w-full text-left px-4 py-3.5 hover:bg-blue-50 transition-colors grid grid-cols-[24px_minmax(0,1fr)_116px_40px] items-center gap-3"
                    :class="selectedPlatformProjectId === draft.project.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''"
                    @click="selectedPlatformProjectId = draft.project.id ?? null"
                    @keydown.enter="selectedPlatformProjectId = draft.project.id ?? null"
                    @keydown.space.prevent="selectedPlatformProjectId = draft.project.id ?? null"
                  >
                    <component :is="getStatusIcon(draft.status)" class="w-5 h-5 text-blue-500" />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 min-w-0 pr-4">
                        <span class="font-medium text-gray-900 truncate">{{ getProjectName(draft.project) }}</span>
                        <span :class="['text-[10px] px-1.5 py-0.5 rounded border shrink-0', getStatusClass(draft.status)]">{{ getStatusLabel(draft.status) }}</span>
                      </div>
                      <div class="mt-1 flex items-center gap-2 text-xs text-gray-500 min-w-0 pr-4">
                        <span class="shrink-0">{{ getPointProgressLabel(draft) }}</span>
                        <span class="text-gray-300">/</span>
                        <span class="shrink-0">{{ draft.project.isPublic === 1 ? '公开' : '私有' }}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      :variant="draft.status === 'ready' ? 'outline' : 'default'"
                      class="w-full justify-center"
                      @click.stop="openOrContinuePlatformProject(draft)"
                    >
                      {{ draft.status === 'ready' ? '打开' : '继续创建' }}
                      <ArrowRight class="w-3.5 h-3.5 ml-1" />
                    </Button>
                    <button
                      type="button"
                      class="w-9 h-9 inline-flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                      @click.stop="deletePlatformProject(draft.project)"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-between pt-1 border-t border-gray-100">
                <span class="text-xs text-gray-500">也可以打开本地 .use 工程文件</span>
                <Button variant="outline" @click="handleBrowse">
                  <HardDrive class="w-4 h-4 mr-1" />
                  本地文件
                </Button>
              </div>
            </div>
          </template>

          <!-- 保存工程表单 -->
          <template v-else-if="mode === 'save'">
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">工程名称:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">{{ projectName || '当前工程' }}</span>
              </div>
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">文件类型:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">.use</span>
              </div>
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">保存位置:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600 truncate">{{ savePath }}</span>
              </div>
            </div>
          </template>

          <!-- 另存为表单 -->
          <template v-else-if="mode === 'save-as'">
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">工程名称:</label>
                <Input v-model="projectName" placeholder="请输入工程名称" class="flex-1" />
              </div>
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">文件类型:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">.use</span>
              </div>
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">保存位置:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600 truncate">{{ savePath }}</span>
                <button
                  class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors whitespace-nowrap"
                  @click="handleBrowse()"
                >
                  浏览
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 flex justify-center gap-3">
          <Button 
            :disabled="isProcessing || (mode === 'open' && !selectedPlatformProjectId)"
            class="min-w-[80px]"
            @click="handleSubmit"
          >
            <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
            {{ isProcessing ? '处理中...' : mode === 'open' ? (selectedPlatformProject?.status === 'ready' ? '打开平台项目' : '继续创建') : '保存' }}
          </Button>
          <Button variant="ghost" @click="emit('close')">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
