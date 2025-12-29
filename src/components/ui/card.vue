<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <div
    :class="cn(
      'rounded-lg border shadow-sm',
      props.class,
    )"
    style="background-color: var(--app-card-bg); color: var(--app-text-color); border-color: var(--app-border-color);"
  >
    <slot />
  </div>
</template>
