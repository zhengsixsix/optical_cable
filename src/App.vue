<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouteStore, useLayerStore, useAppStore } from '@/stores'
import AppHeader from '@/components/layout/AppHeader.vue'
import ImportExportDialog from '@/components/dialogs/ImportExportDialog.vue'
import ProjectDialog from '@/components/dialogs/ProjectDialog.vue'
import UserManageDialog from '@/components/dialogs/UserManageDialog.vue'
import AlarmManageDialog from '@/components/dialogs/AlarmManageDialog.vue'
import HelpDialog from '@/components/dialogs/HelpDialog.vue'
import RPLManageDialog from '@/components/dialogs/RPLManageDialog.vue'
import SLDManageDialog from '@/components/dialogs/SLDManageDialog.vue'
import RouteEditDialog from '@/components/dialogs/RouteEditDialog.vue'
import ReportDialog from '@/components/dialogs/ReportDialog.vue'
import RPLExportDialog from '@/components/dialogs/RPLExportDialog.vue'
import AlarmNotification from '@/components/notifications/AlarmNotification.vue'

const routeStore = useRouteStore()
const layerStore = useLayerStore()
const appStore = useAppStore()

onMounted(async () => {
  // 初始化数据
  await routeStore.loadRoutes()
  appStore.addLog('INFO', '应用初始化完成')
})
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden bg-[#f0f2f5]">
    <AppHeader />
    <div class="flex-1 overflow-hidden relative">
      <RouterView />
    </div>
  </div>
  
  <!-- 全局通知 -->
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] space-y-2">
      <TransitionGroup name="notification">
        <div
          v-for="notification in appStore.notifications"
          :key="notification.id"
          :class="[
            'px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm',
            {
              'bg-green-500 text-white': notification.type === 'success',
              'bg-yellow-500 text-white': notification.type === 'warning',
              'bg-red-500 text-white': notification.type === 'error',
              'bg-blue-500 text-white': notification.type === 'info',
            }
          ]"
        >
          {{ notification.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>


  <!-- 全局对话框 -->
  <ImportExportDialog
    :visible="appStore.activeDialog === 'import' || appStore.activeDialog === 'export'"
    :mode="appStore.activeDialog === 'import' ? 'import' : 'export'"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />

  <ProjectDialog
    :visible="['new-project', 'open-project', 'save-project', 'save-as-project'].includes(appStore.activeDialog || '')"
    :mode="appStore.activeDialog?.replace('-project', '') as any"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />

  <UserManageDialog
    :visible="appStore.activeDialog === 'user-manage'"
    @close="appStore.closeDialog()"
  />

  <AlarmManageDialog
    :visible="appStore.activeDialog === 'alarm-manager'"
    @close="appStore.closeDialog()"
  />

  <HelpDialog
    :visible="['about', 'manual', 'support'].includes(appStore.activeDialog || '')"
    :mode="(appStore.activeDialog as 'about' | 'manual' | 'support') || 'about'"
    @close="appStore.closeDialog()"
  />

  <RPLManageDialog
    :visible="appStore.activeDialog === 'rpl-manage'"
    @close="appStore.closeDialog()"
  />

  <SLDManageDialog
    :visible="appStore.activeDialog === 'sld-manage'"
    @close="appStore.closeDialog()"
  />

  <RouteEditDialog
    :visible="appStore.activeDialog === 'route-edit'"
    @close="appStore.closeDialog()"
  />

  <ReportDialog
    :visible="appStore.activeDialog === 'cost-report' || appStore.activeDialog === 'perf-report'"
    :mode="appStore.activeDialog === 'cost-report' ? 'cost' : 'perf'"
    @close="appStore.closeDialog()"
  />

  <RPLExportDialog
    :visible="appStore.activeDialog === 'rpl-export'"
    @close="appStore.closeDialog()"
  />

  <!-- 告警实时推送通知 -->
  <AlarmNotification />

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
</style>
