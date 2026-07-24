<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useProjectManager, type CreateProjectParams } from '@/composables/useProjectManager'
import type { Id, PlanPoint, PlanProject } from '@/services/platform/types'

const ProjectDialog = defineAsyncComponent(() => import('@/components/dialogs/ProjectDialog.vue'))
const ProjectWizardDialog = defineAsyncComponent(() => import('@/components/dialogs/ProjectWizardDialog.vue'))
const AccountSettingsDialog = defineAsyncComponent(() => import('@/components/dialogs/AccountSettingsDialog.vue'))
const HelpDialog = defineAsyncComponent(() => import('@/components/dialogs/HelpDialog.vue'))
const RPLManageDialog = defineAsyncComponent(() => import('@/modules/design/dialogs/RPLManageDialog.vue'))
const SLDManageDialog = defineAsyncComponent(() => import('@/modules/design/dialogs/SLDManageDialog.vue'))
const ReportDialog = defineAsyncComponent(() => import('@/components/dialogs/ReportDialog.vue'))
const AppearanceDialog = defineAsyncComponent(() => import('@/components/dialogs/AppearanceDialog.vue'))
const SavePromptDialog = defineAsyncComponent(() => import('@/components/dialogs/SavePromptDialog.vue'))
const SaveAsDialog = defineAsyncComponent(() => import('@/components/dialogs/SaveAsDialog.vue'))
const ImportFileDialog = defineAsyncComponent(() => import('@/components/dialogs/ImportFileDialog.vue'))
const ImportGisDialog = defineAsyncComponent(() => import('@/modules/planning/dialogs/ImportGisDialog.vue'))

interface PlatformProjectDraft {
  project: PlanProject
  points: PlanPoint[]
  status: 'draft' | 'stationed' | 'ready'
}

const appStore = useAppStore()
const projectManager = useProjectManager()
const resumePlatformProject = ref<PlatformProjectDraft | null>(null)

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
  <ProjectWizardDialog
    v-if="appStore.activeDialog === 'new-project'"
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

  <ProjectDialog
    v-if="['open-project', 'save-project', 'save-as-project'].includes(appStore.activeDialog || '')"
    :visible="['open-project', 'save-project', 'save-as-project'].includes(appStore.activeDialog || '')"
    :mode="appStore.activeDialog?.replace('-project', '') as any"
    @close="appStore.closeDialog()"
    @success="handleProjectDialogSuccess"
    @open-platform="handleOpenPlatformProject"
    @continue-platform="handleContinuePlatformProject"
    @open-file="handleOpenProjectFile"
  />

  <AccountSettingsDialog
    v-if="appStore.activeDialog === 'account-settings'"
    :visible="appStore.activeDialog === 'account-settings'"
    @close="appStore.closeDialog()"
  />

  <HelpDialog
    v-if="['about', 'manual', 'support'].includes(appStore.activeDialog || '')"
    :visible="['about', 'manual', 'support'].includes(appStore.activeDialog || '')"
    :mode="(appStore.activeDialog as 'about' | 'manual' | 'support') || 'about'"
    @close="appStore.closeDialog()"
  />

  <RPLManageDialog
    v-if="appStore.activeDialog === 'rpl-manage'"
    :visible="appStore.activeDialog === 'rpl-manage'"
    @close="appStore.closeDialog()"
  />

  <SLDManageDialog
    v-if="appStore.activeDialog === 'sld-manage'"
    :visible="appStore.activeDialog === 'sld-manage'"
    @close="appStore.closeDialog()"
  />

  <ReportDialog
    v-if="appStore.activeDialog === 'cost-report' || appStore.activeDialog === 'perf-report'"
    :visible="appStore.activeDialog === 'cost-report' || appStore.activeDialog === 'perf-report'"
    :mode="appStore.activeDialog === 'cost-report' ? 'cost' : 'perf'"
    @close="appStore.closeDialog()"
  />

  <AppearanceDialog
    v-if="appStore.activeDialog === 'appearance-settings'"
    :visible="appStore.activeDialog === 'appearance-settings'"
    @close="appStore.closeDialog()"
  />

  <SavePromptDialog
    v-if="projectManager.openState.value.showSavePrompt"
    :visible="projectManager.openState.value.showSavePrompt"
    :project-name="projectManager.currentProjectName.value"
    @save="projectManager.handleSavePromptChoice('save')"
    @discard="projectManager.handleSavePromptChoice('discard')"
    @cancel="projectManager.handleSavePromptChoice('cancel')"
  />

  <SaveAsDialog
    v-if="appStore.activeDialog === 'save-as'"
    :visible="appStore.activeDialog === 'save-as'"
    :current-project-name="projectManager.currentProjectName.value"
    :current-project-type="projectManager.currentProjectType.value ?? undefined"
    @close="appStore.closeDialog()"
    @save="({ projectName, savePath }) => { projectManager.saveProjectAs(projectName, savePath); appStore.closeDialog() }"
  />

  <ImportFileDialog
    v-if="appStore.activeDialog === 'import-project'"
    :visible="appStore.activeDialog === 'import-project'"
    import-type="project"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />

  <ImportFileDialog
    v-if="appStore.activeDialog === 'import-rpl'"
    :visible="appStore.activeDialog === 'import-rpl'"
    import-type="rpl"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />

  <ImportGisDialog
    v-if="appStore.activeDialog === 'import-gis'"
    :visible="appStore.activeDialog === 'import-gis'"
    @close="appStore.closeDialog()"
    @success="appStore.closeDialog()"
  />
</template>
