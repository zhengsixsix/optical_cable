<script setup lang="ts">
/**
 * 另存为对话框
 * 用于将项目另存到新位置
 */
import { ref, watch } from 'vue'
import { Save, X, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui'

interface Props {
  visible: boolean
  currentProjectName?: string
  currentProjectType?: 'ucp' | 'use'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', data: { projectName: string; savePath: string }): void
}>()

const projectName = ref('')
const savePath = ref('')
const isProcessing = ref(false)

// 文件夹选择器引用
const folderInputRef = ref<HTMLInputElement | null>(null)

// 重置表单
watch(() => props.visible, (val) => {
  if (val) {
    projectName.value = props.currentProjectName || ''
    savePath.value = ''
    isProcessing.value = false
  }
})

// 浏览文件夹
const handleBrowsePath = () => {
  folderInputRef.value?.click()
}

// 文件夹选择回调
const handleFolderSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const file = target.files[0]
    const relativePath = (file as any).webkitRelativePath || ''
    const folderName = relativePath.split('/')[0] || file.name
    savePath.value = folderName
  }
  target.value = ''
}

// 提交保存
const handleSubmit = async () => {
  if (!projectName.value.trim()) return
  
  isProcessing.value = true
  
  // 模拟保存延迟
  await new Promise(resolve => setTimeout(resolve, 500))
  
  emit('save', {
    projectName: projectName.value.trim(),
    savePath: savePath.value,
  })
  
  isProcessing.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <!-- 文件夹选择器 -->
    <input
      ref="folderInputRef"
      type="file"
      class="hidden"
      webkitdirectory
      @change="handleFolderSelected"
    >
    
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-200"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-lg shadow-2xl w-[420px] overflow-hidden">
        <!-- Header -->
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div class="flex items-center gap-2 text-gray-800">
            <Save class="w-4 h-4 text-blue-600" />
            <span class="font-medium">另存为...</span>
          </div>
          <button 
            class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded transition-colors"
            @click="emit('close')"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 space-y-4">
          <!-- 项目名称 -->
          <div class="flex items-center gap-3">
            <label class="w-[80px] text-sm text-gray-600 shrink-0">项目名称：</label>
            <input 
              v-model="projectName"
              type="text" 
              placeholder="请输入另存项目名称"
              class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
          </div>
          
          <!-- 保存目录 -->
          <div class="flex items-center gap-3">
            <label class="w-[80px] text-sm text-gray-600 shrink-0">保存目录：</label>
            <input 
              v-model="savePath"
              type="text" 
              readonly
              placeholder="请选择项目保存文件夹"
              class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50 cursor-default"
            >
            <button 
              class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors whitespace-nowrap"
              @click="handleBrowsePath"
            >
              浏览
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-gray-100 flex justify-center gap-3">
          <Button 
            :disabled="isProcessing || !projectName.trim()"
            class="min-w-[80px]"
            @click="handleSubmit"
          >
            <Loader2 v-if="isProcessing" class="w-4 h-4 mr-2 animate-spin" />
            {{ isProcessing ? '保存中...' : '保存' }}
          </Button>
          <Button variant="ghost" @click="emit('close')">取消</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
