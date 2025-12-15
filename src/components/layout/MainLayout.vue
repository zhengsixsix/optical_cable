<script setup lang="ts">
import AppHeader from './AppHeader.vue'
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- Header is now in App.vue -->
    
    <!-- 工具栏插槽 -->
    <slot name="toolbar" />
    
    <main class="flex-1 overflow-hidden p-2">
      <div class="h-full grid grid-cols-[300px_1fr_300px] gap-2">
        <!-- 左侧面板 -->
        <aside class="flex flex-col gap-2 overflow-hidden">
          <slot name="left" />
        </aside>

        <!-- 中间区域 -->
        <div class="flex flex-col gap-2 overflow-hidden">
          <slot name="center" />
        </div>

        <!-- 右侧面板 -->
        <aside class="flex flex-col gap-2 overflow-hidden">
          <slot name="right" />
        </aside>
      </div>
    </main>
  </div>
</template>
