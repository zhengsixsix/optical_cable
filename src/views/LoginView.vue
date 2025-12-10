<script setup lang="ts">
import {ref} from 'vue'
import {useRouter} from 'vue-router'
import {useUserStore, useAppStore} from '@/stores'
import {User, Lock, Phone, ShieldCheck, Globe, ChevronRight} from 'lucide-vue-next'

const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()

// 表单模式
const mode = ref<'login' | 'register'>('login')

// 登录数据
const username = ref('')
const password = ref('')

// 注册数据
const regUsername = ref('')
const regPassword = ref('')
const regConfirmPassword = ref('')
const regPhone = ref('')

const loading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  errorMessage.value = ''

  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 800))

  const result = userStore.login(username.value, password.value)

  loading.value = false

  if (result.success) {
    appStore.showNotification({type: 'success', message: '登录成功，欢迎进入系统'})
    router.push('/')
  } else {
    errorMessage.value = result.message
  }
}

const handleRegister = async () => {
  if (!regUsername.value || !regPassword.value || !regPhone.value) {
    errorMessage.value = '请填写所有必填项'
    return
  }

  if (regPassword.value !== regConfirmPassword.value) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }

  if (regPassword.value.length < 6) {
    errorMessage.value = '密码长度不能少于6位'
    return
  }

  if (!/^1[3-9]\d{9}$/.test(regPhone.value)) {
    errorMessage.value = '请输入正确的手机号'
    return
  }

  loading.value = true
  errorMessage.value = ''

  await new Promise(resolve => setTimeout(resolve, 800))

  const result = userStore.register({
    username: regUsername.value,
    password: regPassword.value,
    phone: regPhone.value,
  })

  loading.value = false

  if (result.success) {
    appStore.showNotification({type: 'success', message: result.message})
    mode.value = 'login'
    username.value = regUsername.value
    regUsername.value = ''
    regPassword.value = ''
    regConfirmPassword.value = ''
    regPhone.value = ''
  } else {
    errorMessage.value = result.message
  }
}

const switchMode = () => {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  errorMessage.value = ''
}
</script>

<template>
  <div class="min-h-screen flex flex-col relative overflow-hidden font-sans bg-[#0b1121]">
    <!-- 背景层 - 改为更稳重的深海风格 -->
    <div class="absolute inset-0 z-0">
      <div class="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#172554] to-[#1e3a8a] opacity-40"></div>
      <!-- 简单的光影效果，去掉网格和光晕 -->
      <div class="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-black/20 to-transparent"></div>
    </div>

    <!-- 头部 LOGO -->
    <header class="relative z-10 px-8 py-6 flex items-center gap-3">
      <div class="w-10 h-10 bg-blue-700 rounded flex items-center justify-center shadow-md">
        <Globe class="w-6 h-6 text-white"/>
      </div>
      <div>
        <h1 class="text-xl font-bold text-white tracking-wide">海缆智能规划系统</h1>
        <p class="text-xs text-blue-200/80 uppercase tracking-wider">Submarine Cable Intelligent Planning System</p>
      </div>
    </header>

    <!-- 主体内容 -->
    <main class="flex-1 relative z-10 flex items-center justify-center px-4">
      <div class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white rounded-lg overflow-hidden shadow-2xl">

        <!-- 左侧宣传区 - 去掉装饰圈，改为纯净的深色背景 -->
        <div class="hidden md:flex flex-col justify-between p-10 bg-[#172554] relative">
          <div class="relative z-10">
            <h2 class="text-3xl font-bold text-white mb-4 leading-tight">
              智能规划<br/>
              <span class="text-blue-300">连接全球未来</span>
            </h2>
            <p class="text-blue-200/80 text-sm leading-relaxed mb-6">
              基于GIS大数据的海缆路由自动寻优，提供高精度、低成本的海洋通信基础设施规划解决方案。
            </p>
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-3 text-blue-100/90 text-sm">
                <div class="p-1.5 bg-blue-800/50 rounded">
                  <ShieldCheck class="w-4 h-4 text-blue-300"/>
                </div>
                <span>国密级数据安全加密</span>
              </div>
              <div class="flex items-center gap-3 text-blue-100/90 text-sm">
                <div class="p-1.5 bg-blue-800/50 rounded">
                  <Globe class="w-4 h-4 text-blue-300"/>
                </div>
                <span>全球海底地形数据覆盖</span>
              </div>
            </div>
          </div>

          <div class="relative z-10 text-xs text-blue-400/60 mt-10">
            &copy; 2025 DeepSea Technology Co.,Ltd.
          </div>
        </div>

        <!-- 右侧登录区 -->
        <div class="bg-white p-10 flex flex-col justify-center min-h-[500px]">
          <div class="mb-8">
            <h3 class="text-2xl font-bold text-gray-800 mb-2">
              {{ mode === 'login' ? '用户登录' : '账户注册' }}
            </h3>
            <div class="h-1 w-12 bg-blue-600 rounded"></div>
          </div>

          <!-- 错误提示 -->
          <div v-if="errorMessage"
               class="mb-6 bg-red-50 border-l-4 border-red-500 p-3 text-sm text-red-700 flex items-center animate-pulse">
            <ShieldCheck class="w-4 h-4 mr-2"/>
            {{ errorMessage }}
          </div>

          <!-- 登录表单 -->
          <div v-if="mode === 'login'" class="space-y-5">
            <div class="space-y-1">
              <label class="text-sm font-medium text-gray-600">账号</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User class="h-5 w-5 text-gray-400"/>
                </div>
                <input
                    v-model="username"
                    type="text"
                    class="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50 focus:bg-white"
                    placeholder="请输入用户名"
                    @keyup.enter="handleLogin"
                >
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-sm font-medium text-gray-600">密码</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock class="h-5 w-5 text-gray-400"/>
                </div>
                <input
                    v-model="password"
                    type="password"
                    class="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50 focus:bg-white"
                    placeholder="请输入密码"
                    @keyup.enter="handleLogin"
                >
              </div>
            </div>

            <div class="flex items-center justify-between text-sm">
              <label class="flex items-center">
                <input type="checkbox" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                <span class="ml-2 text-gray-600">记住账号</span>
              </label>
            </div>

            <button
                @click="handleLogin"
                :disabled="loading"
                class="w-full flex justify-center py-2.5 px-4 border border-transparent rounded shadow-sm text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span v-if="loading" class="mr-2 animate-spin">⟳</span>
              {{ loading ? '登录中...' : '立即登录' }}
            </button>

            <div class="mt-4 p-3 bg-blue-50 rounded text-xs text-blue-800 border border-blue-100">
              <span class="font-bold">默认管理员：</span> admin / 12345678
            </div>
          </div>

          <!-- 注册表单 -->
          <div v-else class="space-y-4">
            <div class="relative">
              <input
                  v-model="regUsername"
                  type="text"
                  class="block w-full px-3 py-2.5 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50"
                  placeholder="用户名"
              >
            </div>
            <div class="relative">
              <input
                  v-model="regPhone"
                  type="tel"
                  class="block w-full px-3 py-2.5 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50"
                  placeholder="手机号码"
              >
            </div>
            <div class="relative">
              <input
                  v-model="regPassword"
                  type="password"
                  class="block w-full px-3 py-2.5 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50"
                  placeholder="设置密码"
              >
            </div>
            <div class="relative">
              <input
                  v-model="regConfirmPassword"
                  type="password"
                  class="block w-full px-3 py-2.5 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-gray-50"
                  placeholder="确认密码"
              >
            </div>

            <button
                @click="handleRegister"
                :disabled="loading"
                class="w-full flex justify-center py-2.5 px-4 border border-transparent rounded shadow-sm text-sm font-medium text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span v-if="loading" class="mr-2 animate-spin">⟳</span>
              {{ loading ? '提交注册' : '注册账号' }}
            </button>
          </div>

          <!-- 底部切换 -->
          <div class="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between">
            <button
                @click="switchMode"
                class="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center group"
            >
              {{ mode === 'login' ? '注册新账号' : '返回登录' }}
              <ChevronRight class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"/>
            </button>
            <span class="text-xs text-gray-400">系统版本 v2.0.0</span>
          </div>

        </div>
      </div>
    </main>

    <!-- 底部版权 -->
    <footer class="relative z-10 py-4 text-center">
      <p class="text-blue-200/50 text-xs">
        Copyright © 2025 DeepSea Technology. All Rights Reserved.
        <span class="mx-2">|</span>
        <a href="#" class="hover:text-white transition-colors">隐私政策</a>
        <span class="mx-2">|</span>
        <a href="#" class="hover:text-white transition-colors">服务条款</a>
      </p>
    </footer>
  </div>
</template>

<style scoped>
/* 覆盖可能存在的全局样式，确保登录页独立风格 */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
  -webkit-box-shadow: 0 0 0 30px #f9fafb inset !important;
  -webkit-text-fill-color: #111827 !important;
}
</style>
