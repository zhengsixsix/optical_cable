<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui'
import { Home, ArrowLeft } from 'lucide-vue-next'

const router = useRouter()

const goHome = () => router.push('/')
const goBack = () => router.back()
</script>

<template>
  <div class="h-screen flex flex-col items-center justify-center bg-gray-100">
    <div class="text-center">
      <h1 class="text-9xl font-bold text-gray-300">404</h1>
      <h2 class="text-2xl font-semibold text-gray-700 mt-4">页面未找到</h2>
      <p class="text-gray-500 mt-2">您访问的页面不存在或已被移除</p>
      
      <div class="flex gap-4 justify-center mt-8">
        <Button variant="outline" @click="goBack">
          <ArrowLeft class="w-4 h-4 mr-2" />
          返回上页
        </Button>
        <Button @click="goHome">
          <Home class="w-4 h-4 mr-2" />
          返回首页
        </Button>
      </div>
    </div>
  </div>
</template>
