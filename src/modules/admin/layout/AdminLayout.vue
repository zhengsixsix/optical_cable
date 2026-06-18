<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { BookOpen, FileStack, Layers, ShieldCheck, Users } from 'lucide-vue-next'

const route = useRoute()

const sections = [
  {
    to: '/admin/users',
    label: '账户管理',
    description: '用户审批、角色分配与账户状态维护',
    icon: Users,
  },
  {
    to: '/admin/roles',
    label: '权限管理',
    description: '角色资料与功能权限树',
    icon: ShieldCheck,
  },
  {
    to: '/admin/dictionary',
    label: '数据字典',
    description: '平台枚举、分类与业务可选项',
    icon: BookOpen,
  },
  {
    to: '/admin/layers',
    label: '平台图层库',
    description: '规划图层元数据与平台附件',
    icon: Layers,
  },
  {
    to: '/admin/logs',
    label: '操作日志',
    description: '平台接口与业务操作审计',
    icon: FileStack,
  },
]

</script>

<template>
  <div class="h-full min-h-0 overflow-hidden bg-slate-100 text-slate-900">
    <div class="h-full min-h-0 grid grid-cols-[244px_minmax(0,1fr)] max-[900px]:grid-cols-1">
      <aside class="min-h-0 border-r border-slate-200 bg-white max-[900px]:border-r-0 max-[900px]:border-b">
        <div class="px-5 py-5 border-b border-slate-200">
          <div class="text-xs font-semibold uppercase text-slate-400">System Console</div>
          <h2 class="mt-1 text-xl font-semibold tracking-normal text-slate-950">系统管理</h2>
          <p class="mt-2 text-xs leading-5 text-slate-500">集中维护平台账户、权限、图层、字典与审计日志。</p>
        </div>

        <nav class="p-3 space-y-1 max-[900px]:flex max-[900px]:overflow-x-auto max-[900px]:space-y-0 max-[900px]:gap-2">
          <RouterLink
            v-for="section in sections"
            :key="section.to"
            :to="section.to"
            class="group flex items-start gap-3 rounded-md px-3 py-3 text-sm no-underline transition-colors max-[900px]:min-w-[180px]"
            :class="route.path.startsWith(section.to)
              ? 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-100'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'"
          >
            <component :is="section.icon" class="mt-0.5 h-4 w-4 shrink-0" />
            <span class="min-w-0">
              <span class="block font-medium">{{ section.label }}</span>
              <span class="mt-1 block text-xs leading-4 text-slate-500">{{ section.description }}</span>
            </span>
          </RouterLink>
        </nav>
      </aside>

      <main class="min-h-0 min-w-0 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
