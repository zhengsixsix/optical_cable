<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from 'lucide-vue-next'
import { Button } from '../base'

interface Props {
  accept?: string
  multiple?: boolean
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  accept: '*',
  multiple: false,
  placeholder: '请选择文件',
})

const emit = defineEmits<{
  (e: 'change', files: FileList): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const fileName = ref('')

function handleClick() {
  inputRef.value?.click()
}

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    if (props.multiple) {
      fileName.value = `已选择 ${target.files.length} 个文件`
    } else {
      fileName.value = target.files[0].name
    }
    emit('change', target.files)
  }
}

function clear() {
  fileName.value = ''
  if (inputRef.value) {
    inputRef.value.value = ''
  }
}

defineExpose({ clear })
</script>

<template>
  <div class="flex gap-2">
    <input
      ref="inputRef"
      type="file"
      class="hidden"
      :accept="accept"
      :multiple="multiple"
      @change="handleChange"
    >
    <input
      :value="fileName"
      type="text"
      readonly
      :placeholder="placeholder"
      class="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50 cursor-default"
      style="color: var(--app-text-color); border-color: var(--app-border-color);"
    >
    <Button variant="secondary" @click="handleClick">
      <Upload class="w-4 h-4 mr-1" />
      浏览
    </Button>
  </div>
</template>
