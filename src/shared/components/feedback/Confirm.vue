<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import Dialog from './Dialog.vue'
import { Button } from '../base'

interface Props {
  visible: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'info' | 'warning' | 'danger'
}

const props = withDefaults(defineProps<Props>(), {
  title: '确认操作',
  confirmText: '确定',
  cancelText: '取消',
  type: 'warning',
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <Dialog
    :visible="visible"
    :title="title"
    :icon="AlertTriangle"
    width="sm"
    @close="emit('cancel')"
  >
    <div class="text-center py-4">
      <p class="text-gray-600">{{ message }}</p>
    </div>

    <template #footer>
      <Button
        :variant="type === 'danger' ? 'destructive' : 'default'"
        @click="emit('confirm')"
      >
        {{ confirmText }}
      </Button>
      <Button variant="outline" @click="emit('cancel')">
        {{ cancelText }}
      </Button>
    </template>
  </Dialog>
</template>
