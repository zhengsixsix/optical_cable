<script setup lang="ts">
interface Props {
  title?: string
}

defineProps<Props>()
</script>

<template>
  <div class="space-y-3">
    <h4 v-if="title" class="text-sm font-medium text-gray-800 mb-3">
      {{ title }}
    </h4>
    <slot />
  </div>
</template>
