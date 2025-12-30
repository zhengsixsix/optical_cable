<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore, useUserStore, useMapStore } from '@/stores'
import { useProjectManager } from '@/composables'
import type { Projection } from '@/types'
import {
  FileText, FolderOpen, Save, FilePlus, LogOut,
  Download, Upload, ChevronRight, FileType,
  Image as ImageIcon, MoreHorizontal, Settings,
  FileInput, Globe, FileSpreadsheet, User, Users
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const userStore = useUserStore()
const mapStore = useMapStore()
const projectManager = useProjectManager()

// 暴露给 App.vue 使用
defineExpose({ projectManager })

// 坐标系选项
const coordSystemOptions = [
  { value: 'EPSG:4326', label: 'WGS84 (EPSG:4326)' },
  { value: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
]
const currentCoordSystem = ref<Projection>(mapStore.projection)

// 监听坐标系变化，同步到 mapStore
watch(currentCoordSystem, (newProj) => {
  mapStore.setProjection(newProj)
  appStore.addLog('INFO', `坐标系已切换为 ${newProj}`)
  appStore.showNotification({ type: 'info', message: `坐标系已切换为 ${newProj}` })
})

// 视图选项
const viewOptions = [
  { value: 'gis', label: 'GIS视图' },
  { value: 'alarm', label: '告警视图' },
  { value: 'system', label: '系统规划视图' },
]
const currentView = ref('gis')

// 当前用户显示
const displayUserName = computed(() => {
  if (!userStore.currentUser) return null
  return userStore.currentUser.username
})

const handleLogout = () => {
  userStore.logout()
  appStore.showNotification({ type: 'info', message: '已退出登录' })
  router.push('/login')
}

const handleViewChange = (view: string) => {
  currentView.value = view
  if (view === 'gis') {
    router.push('/planning')
  } else if (view === 'alarm') {
    router.push('/monitoring')
  } else if (view === 'system') {
    router.push('/design')
  }
}

// 是否显示传输系统和监控菜单（无项目或 USE 项目时显示）
const showTransmissionMenu = computed(() => {
  const projectType = projectManager.currentProjectType.value
  // 没有打开项目 或 打开的是 USE 项目 时显示
  return !projectType || projectType === 'use'
})

// 项目操作处理
const handleOpenProject = () => {
  projectManager.openProject()
}

const handleSaveProject = () => {
  projectManager.saveProject()
}

const handleSaveAsProject = () => {
  projectManager.openSaveAsDialog()
}

const showModal = (key: string) => {
  console.log(`Menu Action: ${key}`)

  const map: Record<string, string> = {
    '新建工程': 'new-project',
    'import': 'import',
    'importGis': 'import',
    'export': 'export',
    'export_pdf': 'export',
    'export_png': 'export',
    'export_excel': 'export',
    'export_cost_report': 'cost-report',
    'export_perf_report': 'perf-report',
    '显示风格设置': 'appearance-settings',
    '关于软件': 'about',
    '用户手册': 'manual',
    '联系支持': 'support',
    '告警管理': 'alarm-manager'
  }

  const dialogKey = map[key] || key
  appStore.openDialog(dialogKey)
}

const refreshView = () => {
  console.log('Refreshing view...')
  window.location.reload()
}

const toggleLog = () => {
  appStore.togglePanel('logPanel')
}

const togglePanel = (panel: string) => {
  const panelMap: Record<string, keyof typeof appStore.panelVisibility> = {
    'layerInfo': 'layerInfo',
    'routeStats': 'routeStats',
    'depthProfile': 'depthProfile',
    'terrain3D': 'terrain3D',
    'realtime': 'realtime',
  }

  const panelKey = panelMap[panel]
  if (panelKey) {
    appStore.togglePanel(panelKey)
  }
}
</script>

<template>
  <header class="h-[50px] flex items-center justify-between px-5 shadow-sm z-50 relative shrink-0"
    style="background-color: var(--app-header-bg); color: var(--app-header-text);">
    <!-- Left: Menu -->
    <div class="flex items-center h-full">
      <nav class="flex h-full text-sm">

        <!-- File Menu -->
        <!-- File Menu (Premium Glassmorphism) -->
        <div class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span class="font-medium tracking-wide">文件</span>

          <!-- Main Dropdown -->
          <div
            class="absolute top-full left-0 pt-2 hidden group-hover:block z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              class="min-w-[240px] bg-white/95 backdrop-blur-md border border-white/20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-lg py-2">

              <!-- Standard Items -->
              <a href="#" @click.prevent="showModal('新建工程')"
                class="group/item flex items-center justify-between px-4 py-2.5 hover:bg-blue-50/80 text-gray-700 hover:text-blue-600 transition-colors">
                <div class="flex items-center gap-3">
                  <FilePlus class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                  <span class="text-sm">新建工程...</span>
                </div>
                <span class="text-xs text-gray-400 font-light">Ctrl+N</span>
              </a>

              <a href="#" @click.prevent="handleOpenProject"
                class="group/item flex items-center justify-between px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                <div class="flex items-center gap-3">
                  <FolderOpen class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                  <span class="text-sm">打开工程...</span>
                </div>
                <span class="text-xs text-gray-400 font-light">Ctrl+O</span>
              </a>

              <a href="#" @click.prevent="handleSaveProject"
                class="group/item flex items-center justify-between px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                <div class="flex items-center gap-3">
                  <Save class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                  <span class="text-sm">保存工程</span>
                </div>
                <span class="text-xs text-gray-400 font-light">Ctrl+S</span>
              </a>

              <a href="#" @click.prevent="handleSaveAsProject"
                class="group/item flex items-center justify-between px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                <div class="flex items-center gap-3">
                  <FileText class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                  <span class="text-sm">另存为...</span>
                </div>
              </a>

              <div class="h-px bg-gray-100 my-1 mx-2"></div>

              <!-- Import Submenu -->
              <div class="relative group/sub">
                <a href="#"
                  class="group/item flex items-center justify-between px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                  <div class="flex items-center gap-3">
                    <Upload class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                    <span class="text-sm">导入</span>
                  </div>
                  <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
                </a>

                <!-- Sub Dropdown -->
                <div
                  class="absolute left-full top-0 pl-1 hidden group-hover/sub:block z-50 animate-in fade-in slide-in-from-left-2 duration-200">
                  <div
                    class="min-w-[200px] bg-white/95 backdrop-blur-md border border-white/20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-lg py-2 -mt-2">
                    <a href="#" @click.prevent="showModal('import')"
                      class="group/item flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                      <FileInput class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                      <span class="text-sm">从本地文件导入...</span>
                    </a>
                    <a href="#" @click.prevent="showModal('importGis')"
                      class="group/item flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                      <Globe class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                      <span class="text-sm">导入 GIS 数据...</span>
                    </a>
                  </div>
                </div>
              </div>

              <!-- Export Submenu -->
              <div class="relative group/sub">
                <a href="#"
                  class="group/item flex items-center justify-between px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                  <div class="flex items-center gap-3">
                    <Download class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                    <span class="text-sm">导出</span>
                  </div>
                  <ChevronRight class="w-3.5 h-3.5 text-gray-400" />
                </a>

                <!-- Sub Dropdown -->
                <div
                  class="absolute left-full top-0 pl-1 hidden group-hover/sub:block z-50 animate-in fade-in slide-in-from-left-2 duration-200">
                  <div
                    class="min-w-[200px] bg-white/95 backdrop-blur-md border border-white/20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-lg py-2 -mt-2">
                    <a href="#" @click.prevent="showModal('export_pdf')"
                      class="group/item flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                      <FileType class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                      <span class="text-sm">导出为 PDF</span>
                    </a>
                    <a href="#" @click.prevent="showModal('export_png')"
                      class="group/item flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                      <ImageIcon class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                      <span class="text-sm">导出为 PNG (高清)</span>
                    </a>
                    <a href="#" @click.prevent="showModal('export_excel')"
                      class="group/item flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                      <FileSpreadsheet class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                      <span class="text-sm">导出报表数据</span>
                    </a>
                    <div class="h-px bg-gray-100 my-1 mx-2"></div>
                    <a href="#" @click.prevent="showModal('export_cost_report')"
                      class="group/item flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                      <FileText class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                      <span class="text-sm">导出成本报告</span>
                    </a>
                    <a href="#" @click.prevent="showModal('export_perf_report')"
                      class="group/item flex items-center gap-3 px-4 py-2.5 hover:bg-primary/10 text-gray-700 hover:text-primary transition-colors">
                      <FileText class="w-4 h-4 text-gray-400 group-hover/item:text-primary" />
                      <span class="text-sm">导出性能报告</span>
                    </a>
                  </div>
                </div>
              </div>

              <div class="h-px bg-gray-100 my-1 mx-2"></div>

              <a href="#" @click.prevent="showModal('exit')"
                class="group/item flex items-center justify-between px-4 py-2.5 hover:bg-red-50 text-gray-700 hover:text-red-600 transition-colors">
                <div class="flex items-center gap-3">
                  <LogOut class="w-4 h-4 text-gray-400 group-hover/item:text-red-500" />
                  <span class="text-sm">退出</span>
                </div>
                <span class="text-xs text-gray-400 font-light">Alt+F4</span>
              </a>

            </div>
          </div>
        </div>

        <!-- View Menu -->
        <div class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span>视图</span>
          <div
            class="absolute top-full left-0 bg-white text-gray-800 shadow-lg rounded-b-md py-1 min-w-[200px] hidden group-hover:block border border-gray-200 z-50">
            <a href="#" @click.prevent="refreshView"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">刷新视图</a>
            <a href="#" @click.prevent="toggleLog"
              class="flex items-center justify-between px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
              <span>日志面板</span>
              <span v-if="appStore.panelVisibility.logPanel" class="text-green-500 text-xs">显示</span>
            </a>
            <div class="border-t border-gray-200 my-1"></div>
            <div class="px-4 py-1 text-xs text-gray-400">主面板</div>
            <a href="#" @click.prevent="togglePanel('layerInfo')"
              class="flex items-center justify-between px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
              <span>图层信息</span>
              <span v-if="appStore.panelVisibility.layerInfo" class="text-green-500 text-xs">显示</span>
            </a>
            <a href="#" @click.prevent="togglePanel('routeStats')"
              class="flex items-center justify-between px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
              <span>路由统计</span>
              <span v-if="appStore.panelVisibility.routeStats" class="text-green-500 text-xs">显示</span>
            </a>
            <a href="#" @click.prevent="togglePanel('depthProfile')"
              class="flex items-center justify-between px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
              <span>水深剖面</span>
              <span v-if="appStore.panelVisibility.depthProfile" class="text-green-500 text-xs">显示</span>
            </a>
            <a href="#" @click.prevent="togglePanel('terrain3D')"
              class="flex items-center justify-between px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
              <span>地形3D</span>
              <span v-if="appStore.panelVisibility.terrain3D" class="text-green-500 text-xs">显示</span>
            </a>
            <a href="#" @click.prevent="togglePanel('realtime')"
              class="flex items-center justify-between px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
              <span>实时面板</span>
              <span v-if="appStore.panelVisibility.realtime" class="text-green-500 text-xs">显示</span>
            </a>
          </div>
        </div>

        <!-- Planning Menu -->
        <div class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span
            :class="{ 'text-[#ffd04b] font-medium': $route.path.includes('/planning') || $route.path.includes('/design') }">规划</span>
          <div
            class="absolute top-full left-0 bg-white text-gray-800 shadow-lg rounded-b-md py-1 min-w-[150px] hidden group-hover:block border border-gray-200 z-50">
            <RouterLink to="/planning"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700"
              active-class="bg-primary/10 text-primary font-medium">海缆路由规划
            </RouterLink>
            <!-- 传输系统规划：无项目或 USE 项目时显示 -->
            <RouterLink v-if="showTransmissionMenu" to="/design"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700"
              active-class="bg-primary/10 text-primary font-medium">传输系统规划
            </RouterLink>
          </div>
        </div>

        <!-- Monitoring Menu - 无项目或 USE 项目时显示 -->
        <div v-if="showTransmissionMenu" class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span
            :class="{ 'text-[#ffd04b] font-medium': $route.path.includes('/monitoring') || $route.path.includes('/performance') }">监控</span>
          <div
            class="absolute top-full left-0 bg-white text-gray-800 shadow-lg rounded-b-md py-1 min-w-[150px] hidden group-hover:block border border-gray-200 z-50">
            <RouterLink to="/monitoring"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700"
              active-class="bg-primary/10 text-primary font-medium">实时监控
            </RouterLink>
            <a href="#" @click.prevent="showModal('告警管理')"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">告警管理...</a>
            <RouterLink to="/performance"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700"
              active-class="bg-primary/10 text-primary font-medium">性能历史查询
            </RouterLink>
          </div>
        </div>

        <!-- Settings Menu -->
        <div class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span :class="{ 'text-[#ffd04b] font-medium': $route.path.includes('/settings') }">设置</span>
          <div
            class="absolute top-full left-0 bg-white text-gray-800 shadow-lg rounded-b-md py-1 min-w-[150px] hidden group-hover:block border border-gray-200 z-50">
            <RouterLink to="/settings"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700"
              active-class="bg-primary/10 text-primary font-medium">工程设置</RouterLink>
            <a href="#" @click.prevent="showModal('显示风格设置')"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">显示风格设置...</a>
            <!-- 管理员专属：账户管理 -->
            <template v-if="userStore.isAdmin">
              <div class="border-t border-gray-200 my-1"></div>
              <a href="#" @click.prevent="showModal('user-manage')"
                class="flex items-center gap-2 px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
                <Users class="w-4 h-4" />
                账户管理
              </a>
            </template>
          </div>
        </div>

        <!-- Help Menu -->
        <div class="relative group h-full flex items-center px-4 cursor-pointer hover:bg-white/10 transition-colors">
          <span>帮助</span>
          <div
            class="absolute top-full right-0 bg-white text-gray-800 shadow-lg rounded-b-md py-1 min-w-[150px] hidden group-hover:block border border-gray-200 z-50">
            <a href="#" @click.prevent="showModal('关于软件')"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">关于软件</a>
            <a href="#" @click.prevent="showModal('用户手册')"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">用户手册</a>
            <a href="#" @click.prevent="showModal('联系支持')"
              class="block px-4 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">联系支持</a>
          </div>
        </div>

      </nav>
    </div>

    <!-- Center: Title -->
    <div class="absolute left-1/2 -translate-x-1/2 pointer-events-none">
      <h1 class="font-bold text-lg tracking-wide m-0">海底光缆智能规划软件</h1>
    </div>

    <!-- Right: 坐标系、视图切换、用户信息 -->
    <div class="flex items-center gap-3">
      <!-- 坐标系切换 -->
      <select v-model="currentCoordSystem"
        class="bg-white/10 border border-white/20 text-white text-xs px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-primary/60">
        <option v-for="opt in coordSystemOptions" :key="opt.value" :value="opt.value" class="text-gray-800">
          {{ opt.label }}
        </option>
      </select>

      <!-- 视图切换 -->
      <select v-model="currentView" @change="handleViewChange(currentView)"
        class="bg-white/10 border border-white/20 text-white text-xs px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-primary/60">
        <option v-for="opt in viewOptions" :key="opt.value" :value="opt.value" class="text-gray-800">
          {{ opt.label }}
        </option>
      </select>

      <!-- 用户信息 -->
      <div v-if="displayUserName" class="relative group">
        <button
          class="flex items-center gap-2 hover:bg-primary border text-white text-xs px-3 py-1.5 rounded transition-colors"
          :style="{ backgroundColor: 'rgba(var(--app-primary-rgb), 0.8)', borderColor: 'rgba(var(--app-primary-rgb), 0.5)' }">
          <User class="w-3.5 h-3.5" />
          {{ displayUserName }}
        </button>
        <!-- 使用pt-1包装器避免hover间隙问题 -->
        <div class="absolute top-full right-0 pt-1 hidden group-hover:block z-50">
          <div class="bg-white text-gray-800 shadow-lg rounded-md py-1 min-w-[120px] border border-gray-200">
            <div class="px-3 py-2 text-xs text-gray-500 border-b">
              {{ userStore.isAdmin ? '管理员' : '普通用户' }}
            </div>
            <a href="#" @click.prevent="handleLogout"
              class="flex items-center gap-2 px-3 py-2 hover:bg-primary/10 hover:text-primary text-sm no-underline text-gray-700">
              <LogOut class="w-4 h-4" />
              退出登录
            </a>
          </div>
        </div>
      </div>
      <RouterLink v-else to="/login"
        class="bg-primary/80 hover:bg-primary border border-primary/50 text-white text-xs px-3 py-1.5 rounded transition-colors no-underline">
        登录
      </RouterLink>
    </div>
  </header>
</template>

<style scoped>
/* Ensure overrides */
</style>
