<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useLayerStore } from '@/stores/layer'
import { useUserStore } from '@/stores/user'
import { ref, onMounted } from 'vue'
import { initAppearance, useProjectManager, type CreateProjectParams } from '@/composables'
import AppHeader from '@/components/layout/AppHeader.vue'
import ImportExportDialog from '@/components/dialogs/ImportExportDialog.vue'
import ProjectDialog from '@/components/dialogs/ProjectDialog.vue'
import ProjectWizardDialog from '@/components/dialogs/ProjectWizardDialog.vue'
import AccountSettingsDialog from '@/components/dialogs/AccountSettingsDialog.vue'
import HelpDialog from '@/components/dialogs/HelpDialog.vue'
import RPLManageDialog from '@/modules/design/dialogs/RPLManageDialog.vue'
import SLDManageDialog from '@/modules/design/dialogs/SLDManageDialog.vue'
import RouteEditDialog from '@/modules/planning/dialogs/RouteEditDialog.vue'
import ReportDialog from '@/components/dialogs/ReportDialog.vue'
import AppearanceDialog from '@/components/dialogs/AppearanceDialog.vue'
import AlarmNotification from '@/components/notifications/AlarmNotification.vue'
import Notification from '@/shared/components/feedback/Notification.vue'
import SavePromptDialog from '@/components/dialogs/SavePromptDialog.vue'
import SaveAsDialog from '@/components/dialogs/SaveAsDialog.vue'
import ImportFileDialog from '@/components/dialogs/ImportFileDialog.vue'
import ImportGisDialog from '@/modules/planning/dialogs/ImportGisDialog.vue'
import type { Id, PlanPoint, PlanProject } from '@/services/platform/types'

interface PlatformProjectDraft {
  project: PlanProject
  points: PlanPoint[]
  status: 'draft' | 'stationed' | 'ready'
}

const layerStore = useLayerStore()
const appStore = useAppStore()
const userStore = useUserStore()
const projectManager = useProjectManager()
const resumePlatformProject = ref<PlatformProjectDraft | null>(null)

onMounted(async () => {
  // 初始化外观设置
  initAppearance()
  appStore.addLog('INFO', '应用初始化完成')
})

// 处理新建项目成功
const handleProjectDialogSuccess = async (data: CreateProjectParams) => {
  const dialogType = appStore.activeDialog
  appStore.closeDialog()
  resumePlatformProject.value = null
  
  if (dialogType === 'new-project') {
    await projectManager.createProject(data)
  }
}

const handleOpenPlatformProject = async (projectId: Id) => {
  appStore.closeDialog()
  await projectManager.openPlatformProject(projectId)
}

const handleOpenProjectFile = async (file: File) => {
  appStore.closeDialog()
  await projectManager.openProjectFromFile(file)
}

const handleContinuePlatformProject = (draft: PlatformProjectDraft) => {
  resumePlatformProject.value = draft
  appStore.openDialog('new-project')
}

const handleProjectWizardClose = () => {
  resumePlatformProject.value = null
  appStore.closeDialog()
}
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden" style="background-color: var(--app-bg-color);">
    <AppHeader v-if="userStore.isLoggedIn" />
    <div class="flex-1 overflow-hidden relative">
      <RouterView />
    </div>
  </div>

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
    :resume-project="resumePlatformProject ? {
      id: resumePlatformProject.project.id!,
      name: resumePlatformProject.project.name,
      isPublic: resumePlatformProject.project.isPublic,
      points: resumePlatformProject.points,
    } : null"
    @close="handleProjectWizardClose"
    @success="handleProjectDialogSuccess"
  />

  <!-- 其他项目操作对话框（打开、保存、另存为） -->
  <ProjectDialog
    :visible="['open-project', 'save-project', 'save-as-project'].includes(appStore.activeDialog || '')"
    :mode="appStore.activeDialog?.replace('-project', '') as any"
    @close="appStore.closeDialog()"
    @success="handleProjectDialogSuccess"
    @open-platform="handleOpenPlatformProject"
    @continue-platform="handleContinuePlatformProject"
    @open-file="handleOpenProjectFile"
  />

  <AccountSettingsDialog
    :visible="appStore.activeDialog === 'account-settings'"
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
        <div v-if="appStore.globalLoading.detail" class="mt-1 text-xs text-slate-500 truncate">
          {{ appStore.globalLoading.detail }}
        </div>
      </div>
    </div>
  </Transition>

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

.global-loading-enter-active,
.global-loading-leave-active {
  transition: opacity 0.18s ease;
}

.global-loading-enter-from,
.global-loading-leave-to {
  opacity: 0;
}
</style>
