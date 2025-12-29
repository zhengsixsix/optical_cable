<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div :class="cn('flex items-center justify-between p-2 border-b', props.class)" style="background-color: var(--app-bg-secondary); border-color: var(--app-border-color);">
    <slot />
  </div>
</template>
