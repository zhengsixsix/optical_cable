<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const activeIndex = ref('3') // Default to Planning

const handleSelect = (key: string) => {
  activeIndex.value = key
  switch (key) {
    case '3':
      router.push('/planning')
      break
    case '4':
      router.push('/monitoring')
      break
    case '5':
      router.push('/settings')
      break
    // Add other routes as needed
  }
}
</script>

<template>
  <header class="h-[50px] bg-[#003366] text-white flex items-center justify-between px-5 shadow-sm z-50 relative shrink-0">
    <!-- Left: Menu -->
    <div class="flex items-center h-full">
      <nav class="flex h-full">
        <!-- File Menu (Mockup) -->
        <div class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span>文件</span>
          <!-- Dropdown would go here -->
        </div>
        
        <!-- View Menu (Mockup) -->
        <div class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span>视图</span>
        </div>

        <div 
          class="h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors"
          :class="{ 'text-[#ffd04b]': activeIndex === '3' }"
          @click="handleSelect('3')"
        >
          规划
        </div>
        <div 
          class="h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors"
          :class="{ 'text-[#ffd04b]': activeIndex === '4' }"
          @click="handleSelect('4')"
        >
          监控
        </div>
        <div 
          class="h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors"
          :class="{ 'text-[#ffd04b]': activeIndex === '5' }"
          @click="handleSelect('5')"
        >
          设置
        </div>
        <div class="h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          帮助
        </div>
      </nav>
    </div>

    <!-- Center: Title -->
    <div class="absolute left-1/2 -translate-x-1/2 font-semibold text-lg tracking-wide">
      海底光缆智能规划软件
    </div>

    <!-- Right: GIS Button -->
    <div class="flex items-center">
      <button class="bg-gray-500/50 hover:bg-gray-500/70 border border-gray-400/50 text-white text-xs px-3 py-1.5 rounded transition-colors">
        GIS视图
      </button>
    </div>
  </header>
</template>

<style scoped>
/* Optional: specific overrides if tailwind isn't enough */
</style>
