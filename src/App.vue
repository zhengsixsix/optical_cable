<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouteStore, useLayerStore, useAppStore, useUserStore } from '@/stores'
import { initAppearance, useProjectManager, type CreateProjectParams } from '@/composables'
import AppHeader from '@/components/layout/AppHeader.vue'
import ImportExportDialog from '@/components/dialogs/ImportExportDialog.vue'
import ProjectDialog from '@/components/dialogs/ProjectDialog.vue'
import ProjectWizardDialog from '@/components/dialogs/ProjectWizardDialog.vue'
import UserManageDialog from '@/components/dialogs/UserManageDialog.vue'
import AlarmManageDialog from '@/components/dialogs/AlarmManageDialog.vue'
import HelpDialog from '@/components/dialogs/HelpDialog.vue'
import RPLManageDialog from '@/components/dialogs/RPLManageDialog.vue'
import SLDManageDialog from '@/components/dialogs/SLDManageDialog.vue'
import RouteEditDialog from '@/components/dialogs/RouteEditDialog.vue'
import ReportDialog from '@/components/dialogs/ReportDialog.vue'
import AppearanceDialog from '@/components/dialogs/AppearanceDialog.vue'
import AlarmNotification from '@/components/notifications/AlarmNotification.vue'
import SavePromptDialog from '@/components/dialogs/SavePromptDialog.vue'
import SaveAsDialog from '@/components/dialogs/SaveAsDialog.vue'
import ImportFileDialog from '@/components/dialogs/ImportFileDialog.vue'
import ImportGisDialog from '@/components/dialogs/ImportGisDialog.vue'

const routeStore = useRouteStore()
const layerStore = useLayerStore()
const appStore = useAppStore()
const userStore = useUserStore()
const projectManager = useProjectManager()

onMounted(async () => {
  // 初始化外观设置
  initAppearance()
  // 初始化数据
  await routeStore.loadRoutes()
  appStore.addLog('INFO', '应用初始化完成')
})

// 处理新建项目成功
const handleProjectDialogSuccess = async (data: CreateProjectParams) => {
  const dialogType = appStore.activeDialog
  appStore.closeDialog()
  
  if (dialogType === 'new-project') {
    await projectManager.createProject(data)
  }
}
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden" style="background-color: var(--app-bg-color);">
    <AppHeader v-if="userStore.isLoggedIn" />
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

  <!-- 新建项目向导对话框 -->
  <ProjectWizardDialog
    :visible="appStore.activeDialog === 'new-project'"
    @close="appStore.closeDialog()"
    @success="handleProjectDialogSuccess"
  />

  <!-- 其他项目操作对话框（打开、保存、另存为） -->
  <ProjectDialog
    :visible="['open-project', 'save-project', 'save-as-project'].includes(appStore.activeDialog || '')"
    :mode="appStore.activeDialog?.replace('-project', '') as any"
    @close="appStore.closeDialog()"
    @success="handleProjectDialogSuccess"
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

  <AppearanceDialog
    :visible="appStore.activeDialog === 'appearance-settings'"
    @close="appStore.closeDialog()"
  />

  <!-- 告警实时推送通知 -->
  <AlarmNotification />

  <!-- 保存提示对话框 -->
  <SavePromptDialog
    :visible="projectManager.openState.value.showSavePrompt"
    :project-name="projectManager.currentProjectName.value"
    @save="projectManager.handleSavePromptChoice('save')"
    @discard="projectManager.handleSavePromptChoice('discard')"
    @cancel="projectManager.handleSavePromptChoice('cancel')"
  />

  <!-- 另存为对话框 -->
  <SaveAsDialog
    :visible="appStore.activeDialog === 'save-as'"
    :current-project-name="projectManager.currentProjectName.value"
    :current-project-type="projectManager.currentProjectType.value ?? undefined"
    @close="appStore.closeDialog()"
    @save="({ projectName, savePath }) => { projectManager.saveProjectAs(projectName, savePath); appStore.closeDialog() }"
  />

  <!-- 导入工程对话框 -->
  <ImportFileDialog
    :visible="appStore.activeDialog === 'import-project'"
    import-type="project"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />

  <!-- 导入 RPL 文件对话框 -->
  <ImportFileDialog
    :visible="appStore.activeDialog === 'import-rpl'"
    import-type="rpl"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />

  <!-- 导入 GIS 数据对话框 -->
  <ImportGisDialog
    :visible="appStore.activeDialog === 'import-gis'"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />

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
