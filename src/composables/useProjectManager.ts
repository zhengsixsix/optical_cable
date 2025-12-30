/**
 * 项目管理 Composable
 * 整合打开/保存/另存为/关闭项目的完整业务流程
 */

import { ref, computed } from 'vue'
import { useAppStore, useUserStore } from '@/stores'
import { projectFileService, type OpenProjectResult, type ProjectMetadata } from '@/services/ProjectFileService'

// 保存提示对话框的用户选择
export type SavePromptChoice = 'save' | 'discard' | 'cancel'

// 打开项目的流程状态
interface OpenProjectState {
  pendingFile: File | null
  showSavePrompt: boolean
}

export function useProjectManager() {
  const appStore = useAppStore()
  const userStore = useUserStore()
  
  // 状态
  const openState = ref<OpenProjectState>({
    pendingFile: null,
    showSavePrompt: false,
  })
  
  const showSaveAsDialog = ref(false)
  const isProcessing = ref(false)
  
  // 计算属性
  const hasOpenProject = computed(() => appStore.hasOpenProject)
  const currentProjectName = computed(() => appStore.currentProjectName)
  const currentProjectType = computed(() => appStore.currentProjectType)
  const isDirty = computed(() => appStore.projectState.isDirty)
  
  /**
   * 打开项目文件
   * 完整流程：检查当前项目 → 提示保存 → 选择文件 → 权限验证 → 加载
   */
  async function openProject(): Promise<void> {
    // 1. 先让用户选择文件
    const file = await projectFileService.openFileDialog('.ucp,.use')
    if (!file) return
    
    // 2. 检查当前是否有未保存的项目
    if (hasOpenProject.value && isDirty.value) {
      // 保存待打开的文件，显示保存提示对话框
      openState.value.pendingFile = file
      openState.value.showSavePrompt = true
      return
    }
    
    // 3. 直接打开文件
    await doOpenFile(file)
  }
  
  /**
   * 处理保存提示对话框的用户选择
   */
  async function handleSavePromptChoice(choice: SavePromptChoice): Promise<void> {
    openState.value.showSavePrompt = false
    
    if (choice === 'cancel') {
      // 取消操作，清除待打开的文件
      openState.value.pendingFile = null
      return
    }
    
    if (choice === 'save') {
      // 先保存当前项目
      const saved = await saveProject()
      if (!saved) {
        // 保存失败，取消操作
        openState.value.pendingFile = null
        return
      }
    }
    
    // 关闭当前项目并打开新文件
    if (openState.value.pendingFile) {
      closeProject()
      await doOpenFile(openState.value.pendingFile)
      openState.value.pendingFile = null
    }
  }
  
  /**
   * 执行打开文件操作
   */
  async function doOpenFile(file: File): Promise<OpenProjectResult> {
    isProcessing.value = true
    
    try {
      const result = await projectFileService.importProject(file)
      
      if (!result.success) {
        // 处理错误
        if (result.errorType === 'permission') {
          appStore.showNotification({
            type: 'error',
            message: result.error || '无法打开项目：权限不足',
          })
        } else if (result.errorType === 'format') {
          appStore.showNotification({
            type: 'error',
            message: result.error || '无效的项目文件格式',
          })
        } else {
          appStore.showNotification({
            type: 'error',
            message: result.error || '打开项目失败',
          })
        }
        return result
      }
      
      // 成功打开
      const project = result.project!
      const metadata: ProjectMetadata = {
        name: project.name || project.projectName,
        path: file.name,
        type: project.type,
        lastModified: project.updatedAt,
        creatorId: project.creatorId || project.creatorUserId,
        allowOtherUsers: project.allowOtherUsers,
      }
      
      appStore.setCurrentProject(metadata)
      appStore.showNotification({
        type: 'success',
        message: `项目已打开：${metadata.name}`,
      })
      
      return result
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 保存当前项目
   */
  async function saveProject(): Promise<boolean> {
    if (!hasOpenProject.value) {
      appStore.showNotification({
        type: 'warning',
        message: '当前没有打开的项目',
      })
      return false
    }
    
    isProcessing.value = true
    
    try {
      const success = projectFileService.saveProject()
      
      if (success) {
        appStore.markProjectSaved()
        appStore.showNotification({
          type: 'success',
          message: `项目已保存：${currentProjectName.value}`,
        })
      } else {
        appStore.showNotification({
          type: 'error',
          message: '保存项目失败',
        })
      }
      
      return success
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 另存为
   */
  function openSaveAsDialog(): void {
    showSaveAsDialog.value = true
  }
  
  /**
   * 执行另存为操作
   */
  async function saveProjectAs(projectName: string, savePath: string): Promise<boolean> {
    isProcessing.value = true
    
    try {
      const projectType = currentProjectType.value || 'ucp'
      
      // 根据项目类型导出
      if (projectType === 'use') {
        projectFileService.exportUSE(projectName)
      } else {
        projectFileService.exportUCP(projectName)
      }
      
      // 更新当前项目信息
      const newMetadata: ProjectMetadata = {
        name: projectName,
        path: `${savePath}/${projectName}.${projectType}`,
        type: projectType,
        lastModified: new Date().toISOString(),
        creatorId: userStore.currentUser?.id || '',
        allowOtherUsers: false,
      }
      
      appStore.setCurrentProject(newMetadata)
      appStore.markProjectSaved()
      appStore.showNotification({
        type: 'success',
        message: `项目已另存为：${projectName}`,
      })
      
      return true
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: '另存项目失败',
      })
      return false
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 关闭当前项目
   */
  function closeProject(): void {
    projectFileService.closeProject()
    appStore.closeCurrentProject()
  }
  
  /**
   * 检查是否可以安全关闭（无未保存更改）
   */
  function canSafelyClose(): boolean {
    return !hasOpenProject.value || !isDirty.value
  }
  
  /**
   * 标记项目已修改
   */
  function markDirty(): void {
    appStore.setProjectDirty(true)
  }
  
  return {
    // 状态
    openState,
    showSaveAsDialog,
    isProcessing,
    
    // 计算属性
    hasOpenProject,
    currentProjectName,
    currentProjectType,
    isDirty,
    
    // 方法
    openProject,
    handleSavePromptChoice,
    saveProject,
    openSaveAsDialog,
    saveProjectAs,
    closeProject,
    canSafelyClose,
    markDirty,
  }
}
