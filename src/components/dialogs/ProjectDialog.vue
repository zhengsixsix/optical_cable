<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FilePlus, FolderOpen, Save, X, Loader2 } from 'lucide-vue-next'
import { useAppStore } from '@/stores'
import { Button } from '@/components/ui'

interface Props {
  mode: 'new' | 'open' | 'save' | 'save-as'
  visible: boolean
}

interface BaseDataItem {
  key: string
  label: string
  checked: boolean
  value: string
  readonly?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success'): void
}>()

const appStore = useAppStore()
const projectName = ref('新海缆工程')
const savePath = ref('C:\\Projects\\...')
const fileName = ref('')
const isProcessing = ref(false)

const baseDataList = ref<BaseDataItem[]>([
  { key: 'elevation', label: '海洋高程图', checked: true, value: 'default.tif', readonly: true },
  { key: 'volcano', label: '海洋火山分布', checked: false, value: '' },
  { key: 'fishery', label: '海洋渔区分布', checked: false, value: '' },
  { key: 'slope', label: '海洋坡度图', checked: false, value: '' },
  { key: 'earthquake', label: '海洋地震分布图', checked: false, value: '' },
  { key: 'shipping', label: '海洋航道图', checked: false, value: '' },
])

watch(() => props.visible, (val) => {
  if (val) {
    if (props.mode === 'new') {
      projectName.value = '新海缆工程'
    } else {
      projectName.value = ''
    }
    fileName.value = ''
  }
})

const title = computed(() => {
  switch (props.mode) {
    case 'new': return '新建工程'
    case 'open': return '打开工程'
    case 'save': return '保存工程'
    case 'save-as': return '另存为'
    default: return '工程操作'
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
  return props.mode === 'new' ? 'w-[700px]' : 'w-[500px]'
})

const handleBrowse = (item?: BaseDataItem) => {
  appStore.showNotification({ type: 'info', message: '浏览文件功能待实现' })
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
  emit('success')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
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
          <!-- 新建工程表单 -->
          <template v-if="mode === 'new'">
            <div class="bg-gray-50 rounded-lg p-5 mb-5">
              <h4 class="text-base font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">加载基础数据</h4>
              <div class="space-y-3">
                <div 
                  v-for="item in baseDataList" 
                  :key="item.key"
                  class="flex items-center gap-3"
                >
                  <input 
                    v-model="item.checked"
                    type="checkbox" 
                    class="w-4 h-4 cursor-pointer accent-blue-600"
                  >
                  <label class="w-[120px] text-sm text-gray-600 font-medium shrink-0">{{ item.label }}:</label>
                  <template v-if="item.readonly">
                    <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600 truncate">
                      {{ item.value }}
                    </span>
                  </template>
                  <template v-else>
                    <input 
                      v-model="item.value"
                      type="text" 
                      class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                  </template>
                  <button 
                    class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors whitespace-nowrap"
                    @click="handleBrowse(item)"
                  >
                    浏览
                  </button>
                </div>
              </div>
            </div>
            <div class="bg-gray-50 rounded-lg p-5">
              <h4 class="text-base font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">工程文件设置</h4>
              <div class="space-y-3">
                <div class="flex items-center gap-3">
                  <label class="w-[120px] text-sm text-gray-600 font-medium shrink-0">工程名称:</label>
                  <input 
                    v-model="projectName"
                    type="text" 
                    class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                </div>
                <div class="flex items-center gap-3">
                  <label class="w-[120px] text-sm text-gray-600 font-medium shrink-0">文件类型:</label>
                  <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">.ucp</span>
                </div>
                <div class="flex items-center gap-3">
                  <label class="w-[120px] text-sm text-gray-600 font-medium shrink-0">保存位置:</label>
                  <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600 truncate">{{ savePath }}</span>
                  <button 
                    class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors whitespace-nowrap"
                    @click="handleBrowse()"
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
                <p class="text-sm">(例如: Project A.ucp, Project B.ucp...)</p>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">文件名称:</label>
                <input 
                  v-model="fileName"
                  type="text" 
                  class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                <button 
                  class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors whitespace-nowrap"
                  @click="handleBrowse()"
                >
                  浏览
                </button>
              </div>
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">文件类型:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">.ucp</span>
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
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">.ucp</span>
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
                <input 
                  v-model="projectName"
                  type="text" 
                  class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="请输入工程名称"
                >
              </div>
              <div class="flex items-center gap-3">
                <label class="w-[80px] text-sm text-gray-600 font-medium shrink-0">文件类型:</label>
                <span class="flex-1 px-3 py-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-600">.ucp</span>
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
        <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <Button variant="ghost" @click="emit('close')">取消</Button>
          <Button 
            :disabled="isProcessing"
            class="min-w-[80px]"
            @click="handleSubmit"
          >
            <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
            {{ isProcessing ? '处理中...' : '确定' }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
