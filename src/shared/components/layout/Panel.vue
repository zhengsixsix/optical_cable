<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { cn } from '@/shared/utils'
import { Card, CardHeader, CardContent } from '../base'

interface Props {
  title: string
  closable?: boolean
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  closable: true,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <Card :class="cn('flex flex-col overflow-hidden', props.class)">
    <CardHeader>
      <span class="font-semibold text-sm" style="color: var(--app-text-color);">
        {{ title }}
      </span>
      <div class="flex gap-1">
        <slot name="actions" />
        <button
          v-if="closable"
          class="p-1 hover:bg-gray-200 rounded"
          title="关闭"
          @click="emit('close')"
        >
          <X class="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </CardHeader>
    <CardContent class="flex-1 overflow-auto">
      <slot />
    </CardContent>
  </Card>
</template>
