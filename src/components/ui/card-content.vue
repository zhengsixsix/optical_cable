<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div :class="cn('p-2 flex-1 overflow-auto', props.class)">
    <slot />
  </div>
</template>
