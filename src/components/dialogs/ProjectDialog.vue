<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FilePlus, FolderOpen, Save, X, Loader2 } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { Button, Select, Input } from '@/shared/components/base'

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

type ProjectType = 'use'

const projectTypeOptions = [
  { value: 'use', label: '海缆规划项目 (.use)' }
]

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success', data: { projectType: ProjectType; projectName: string; savePath: string; allowOtherUsers: boolean; layers: LayerItem[] }): void
}>()

const appStore = useAppStore()
const projectType = ref<ProjectType>('use')
const projectName = ref('')
const savePath = ref('')
const allowOtherUsers = ref(false)
const fileName = ref('')
const isProcessing = ref(false)

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
    fileName.value = target.files[0].name
    if (props.mode === 'save-as') {
      savePath.value = target.files[0].name
    }
  }
  target.value = ''
}

const handleSubmit = async () => {
  if (props.mode === 'new' && !projectName.value) return
  if (props.mode === 'open' && !fileName.value) return
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
            <div class="h-[150px] border border-gray-300 rounded-lg mb-4 bg-gray-50 flex items-center justify-center text-gray-400 italic overflow-auto">
              <div class="text-center">
                <FolderOpen class="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>最近项目列表 / 文件浏览区域</p>
                <p class="text-sm">(例如: Project A.use, Project B.use...)</p>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">文件名称:</label>
                <Input v-model="fileName" class="flex-1" />
                <button 
                  class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors whitespace-nowrap"
                  @click="handleBrowse()"
                >
                  浏览
                </button>
              </div>
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">文件类型:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">.use</span>
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
            :disabled="isProcessing"
            class="min-w-[80px]"
            @click="handleSubmit"
          >
            <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
            {{ isProcessing ? '处理中...' : '保存' }}
          </Button>
          <Button variant="ghost" @click="emit('close')">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
