<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import GlobalDialogHost from '@/app/GlobalDialogHost.vue'
import AlarmNotification from '@/components/notifications/AlarmNotification.vue'
import Notification from '@/shared/components/feedback/Notification.vue'

const appStore = useAppStore()
const userStore = useUserStore()
const globalLoadingElapsedSeconds = ref(0)
let globalLoadingElapsedTimer: number | null = null

const globalLoadingElapsedText = computed(() => {
  const minutes = Math.floor(globalLoadingElapsedSeconds.value / 60)
  const seconds = globalLoadingElapsedSeconds.value % 60
  return `已用时 ${minutes}分${String(seconds).padStart(2, '0')}秒`
})

watch(
  () => appStore.globalLoading.visible,
  (visible) => {
    if (globalLoadingElapsedTimer !== null) {
      window.clearInterval(globalLoadingElapsedTimer)
      globalLoadingElapsedTimer = null
    }
    globalLoadingElapsedSeconds.value = 0
    if (visible) {
      globalLoadingElapsedTimer = window.setInterval(() => {
        globalLoadingElapsedSeconds.value += 1
      }, 1000)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (globalLoadingElapsedTimer !== null) window.clearInterval(globalLoadingElapsedTimer)
})
onMounted(() => {
  appStore.addLog('INFO', '应用初始化完成')
})
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden" style="background-color: var(--app-bg-color);">
    <AppHeader v-if="userStore.isLoggedIn" />
    <div class="flex-1 overflow-hidden relative">
      <RouterView />
    </div>
  </div>

  <GlobalDialogHost />

  <!-- 告警实时推送通知 -->
  <AlarmNotification />

  <!-- 全局消息通知（showNotification 渲染入口） -->
  <Notification
    :notifications="appStore.notifications"
    @remove="appStore.removeNotification"
  />

  <Transition name="global-loading">
    <div
      v-if="appStore.globalLoading.visible"
      class="global-loading-overlay fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]"
    >
      <div class="min-w-[220px] max-w-[360px] rounded bg-white px-5 py-4 text-center shadow-2xl border border-slate-200">
        <div class="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-blue-100 border-t-blue-600 animate-spin"></div>
        <div class="text-sm font-medium text-slate-800">{{ appStore.globalLoading.message }}</div>
        <Transition name="global-loading-detail" mode="out-in">
          <div
            v-if="appStore.globalLoading.detail"
            :key="appStore.globalLoading.detail"
            class="mt-1 text-xs text-slate-500 truncate"
          >
            {{ appStore.globalLoading.detail }}
          </div>
        </Transition>
        <div class="mt-2 text-xs font-medium tabular-nums text-blue-600">
          {{ globalLoadingElapsedText }}
        </div>
      </div>
    </div>
  </Transition>

</template>

<style>
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.global-loading-enter-active,
.global-loading-leave-active {
  transition: opacity 0.18s ease;
}

.global-loading-enter-from,
.global-loading-leave-to {
  opacity: 0;
}

.global-loading-detail-enter-active,
.global-loading-detail-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.global-loading-detail-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.global-loading-detail-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
