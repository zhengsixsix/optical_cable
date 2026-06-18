<script setup lang="ts">
import { computed, ref } from 'vue'
import { Upload } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import { platformUploadApi } from '@/services/platform/api'
import { uploadFileWithUppyTus } from '@/services/platform/uppyUpload'
import type { Id } from '@/services/platform/types'

const props = defineProps<{
  iconId?: Id | ''
  iconName?: string
}>()

const emit = defineEmits<{
  (e: 'uploaded', value: { iconId: Id; iconName: string }): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const progress = ref(0)
const uploadError = ref('')

const displayName = computed(() => {
  if (props.iconName) return props.iconName
  if (props.iconId !== '' && props.iconId != null) return `附件 ${props.iconId}`
  return '未上传图标'
})

function resolveAttachmentId(response: unknown, fallback: Id): Id {
  const source = response as Record<string, unknown> | null
  const value = source?.attachmentId ?? source?.id ?? source?.data
  if (typeof value === 'number' || typeof value === 'string') return value
  return fallback
}

function openFilePicker() {
  if (isUploading.value) return
  fileInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  isUploading.value = true
  progress.value = 0
  uploadError.value = ''

  try {
    const uploaded = await uploadFileWithUppyTus(file, {
      onProgress: item => { progress.value = item.percent },
    })
    const completed = await platformUploadApi.complete({
      uploadUrl: uploaded.uploadUrl,
      typeDic: 'LAYER',
    })
    const iconId = resolveAttachmentId(completed, uploaded.uploadUrl)
    emit('uploaded', { iconId, iconName: uploaded.fileName })
    progress.value = 100
  } catch (error) {
    uploadError.value = (error as Error).message
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*,.svg"
      class="hidden"
      @change="handleFileChange"
    />
    <div
      class="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
      style="border-color: var(--app-border-color)"
    >
      <div class="min-w-0">
        <div class="truncate text-sm text-gray-700 dark:text-gray-200">{{ displayName }}</div>
        <div v-if="isUploading" class="mt-1 text-xs text-blue-600">上传中 {{ progress }}%</div>
        <div v-else-if="uploadError" class="mt-1 text-xs text-red-500">{{ uploadError }}</div>
        <div v-else class="mt-1 text-xs text-gray-400">支持图片或 SVG，上传后自动绑定附件。</div>
      </div>
      <Button variant="outline" size="sm" class="shrink-0" :disabled="isUploading" @click="openFilePicker">
        <Upload class="mr-1 h-4 w-4" />
        上传图标
      </Button>
    </div>
  </div>
</template>
