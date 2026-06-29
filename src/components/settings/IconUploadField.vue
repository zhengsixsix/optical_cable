<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CheckCircle2, Image as ImageIcon, Upload } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { platformUploadApi } from '@/services/platform/api'
import { fetchPlatformAttachmentBlob } from '@/services/platform/attachment'
import { uploadFileWithUppyTus } from '@/services/platform/uppyUpload'
import type { Id } from '@/services/platform/types'
import { cn } from '@/shared/utils'

const props = defineProps<{
  iconId?: Id | ''
  iconName?: string
  bizId?: Id | null
  resolveBizId?: () => Id | null | Promise<Id | null>
  compact?: boolean
  variant?: 'inline' | 'preview'
}>()

const emit = defineEmits<{
  (e: 'uploaded', value: { iconId: Id; iconName: string }): void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const progress = ref(0)
const previewUrl = ref('')
const appStore = useAppStore()
let previewRequestId = 0

const displayName = computed(() => {
  if (props.iconName) return props.iconName
  if (props.iconId !== '' && props.iconId != null) return `附件 ${props.iconId}`
  return '未上传图标'
})

const hasIcon = computed(() => Boolean(props.iconName || (props.iconId !== '' && props.iconId != null)))
const isPreviewVariant = computed(() => props.variant === 'preview')

function replacePreviewUrl(nextUrl = '') {
  if (previewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = nextUrl
}

watch(
  () => [props.iconId, props.variant] as const,
  async ([iconId, variant]) => {
    const requestId = ++previewRequestId
    if (variant !== 'preview' || iconId == null || iconId === '') {
      replacePreviewUrl()
      return
    }

    try {
      const blob = await fetchPlatformAttachmentBlob(iconId)
      const nextUrl = URL.createObjectURL(blob)
      if (requestId === previewRequestId) {
        replacePreviewUrl(nextUrl)
      } else {
        URL.revokeObjectURL(nextUrl)
      }
    } catch {
      if (requestId === previewRequestId) replacePreviewUrl()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  replacePreviewUrl()
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

async function resolveBizId(): Promise<Id | null> {
  if (props.bizId != null && props.bizId !== '') return props.bizId
  return props.resolveBizId ? await props.resolveBizId() : null
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  isUploading.value = true
  progress.value = 0
  if (isPreviewVariant.value) {
    replacePreviewUrl(URL.createObjectURL(file))
  }

  try {
    const bizId = await resolveBizId()
    if (bizId == null || bizId === '') {
      throw new Error('未获取到器件业务 ID')
    }

    const uploaded = await uploadFileWithUppyTus(file, {
      onProgress: item => { progress.value = item.percent },
    })
    const completed = await platformUploadApi.complete({
      uploadUrl: uploaded.uploadUrl,
      bizId,
      typeDic: 'DEVICE_ICON',
    })
    const iconId = resolveAttachmentId(completed, uploaded.uploadUrl)
    emit('uploaded', { iconId, iconName: uploaded.fileName })
    progress.value = 100
  } catch (error) {
    appStore.showNotification({
      type: 'error',
      message: `图标上传失败：${(error as Error).message}`,
    })
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
    <button
      v-if="isPreviewVariant"
      type="button"
      class="group relative flex h-40 w-full min-w-[180px] flex-col items-center justify-center overflow-hidden rounded-md border border-dashed bg-gray-50 text-center transition hover:border-blue-300 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:hover:bg-blue-950/30"
      style="border-color: var(--app-border-color)"
      :disabled="isUploading"
      @click="openFilePicker"
    >
      <img
        v-if="previewUrl"
        :src="previewUrl"
        alt="图标预览"
        class="h-full w-full object-contain p-3"
      />
      <template v-else>
        <div class="flex h-11 w-11 items-center justify-center rounded-md border bg-white text-gray-400 transition group-hover:text-blue-500 dark:bg-gray-800">
          <ImageIcon class="h-5 w-5" />
        </div>
        <div class="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">上传图片</div>
        <div class="mt-0.5 text-xs text-gray-400">PNG / SVG</div>
      </template>
      <div
        v-if="previewUrl"
        class="absolute bottom-2 rounded bg-black/55 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
      >
        {{ hasIcon ? '更换图片' : '上传图片' }}
      </div>
      <div v-if="isUploading" class="absolute inset-x-3 bottom-3 overflow-hidden rounded-full bg-blue-100">
        <div class="h-1.5 rounded-full bg-blue-500" :style="{ width: `${progress}%` }" />
      </div>
    </button>

    <div
      v-else
      :class="cn(
        'flex items-center rounded-md border bg-white dark:bg-gray-800',
        compact ? 'min-h-[56px] gap-3 px-3 py-2' : 'min-h-[66px] flex-wrap gap-3 px-3 py-2',
      )"
      style="border-color: var(--app-border-color)"
    >
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
        :class="hasIcon ? 'border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40' : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-900'"
      >
        <ImageIcon class="h-5 w-5" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <div class="truncate text-sm font-medium text-gray-700 dark:text-gray-200">{{ displayName }}</div>
          <CheckCircle2 v-if="hasIcon && !isUploading" class="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        </div>
        <div v-if="isUploading" class="mt-1 flex items-center gap-2 text-xs text-blue-600">
          <div class="h-1.5 w-24 overflow-hidden rounded-full bg-blue-100">
            <div class="h-full rounded-full bg-blue-500" :style="{ width: `${progress}%` }" />
          </div>
          {{ progress }}%
        </div>
        <div v-else class="mt-0.5 truncate text-xs text-gray-400">
          {{ hasIcon ? '已绑定图标附件' : '支持图片或 SVG' }}
        </div>
      </div>

      <Button variant="outline" size="sm" class="h-8 shrink-0" :disabled="isUploading" @click="openFilePicker">
        <Upload class="mr-1 h-4 w-4" />
        {{ hasIcon ? '更换' : '上传' }}
      </Button>
    </div>
  </div>
</template>
