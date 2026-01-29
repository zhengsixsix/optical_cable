<script setup lang="ts">
import { cn } from '@/shared/utils'

interface Props {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div
    :class="cn('flex items-center justify-between p-2 border-b', props.class)"
    style="background-color: var(--app-bg-secondary); border-color: var(--app-border-color);"
  >
    <div class="flex items-center gap-2">
      <slot name="icon" />
      <slot name="title" />
    </div>
    <div class="flex gap-1">
      <slot name="actions" />
    </div>
  </div>
</template>
