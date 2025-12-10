<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div :class="cn('flex items-center justify-between p-2 bg-muted border-b', props.class)">
    <slot />
  </div>
</template>
