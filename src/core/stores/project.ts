import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logger } from '@/shared/utils'

/**
 * 项目状态 Store
 * 管理当前项目的状态
 */

export type ProjectType = 'ucp' | 'use'

export interface ProjectMetadata {
  id: string
  name: string
  type: ProjectType
  filePath?: string
  createdAt: string
  updatedAt: string
}

export const useProjectStore = defineStore('project', () => {
  // 当前项目
  const currentProject = ref<ProjectMetadata | null>(null)

  // 项目是否已修改
  const isDirty = ref(false)

  // 上次保存时间
  const lastSavedAt = ref<string | null>(null)

  // 计算属性
  const hasOpenProject = computed(() => currentProject.value !== null)
  const projectName = computed(() => currentProject.value?.name || '')
  const projectType = computed(() => currentProject.value?.type || null)

  // 设置当前项目
  function setProject(project: ProjectMetadata | null) {
    currentProject.value = project
    isDirty.value = false
    lastSavedAt.value = null

    if (project) {
      logger.info(`打开项目: ${project.name}`)
    }
  }

  // 创建新项目
  function createProject(name: string, type: ProjectType): ProjectMetadata {
    const project: ProjectMetadata = {
      id: `project-${Date.now()}`,
      name,
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setProject(project)
    logger.info(`创建项目: ${name} (${type})`)

    return project
  }

  // 标记项目已修改
  function markDirty() {
    isDirty.value = true
  }

  // 标记项目已保存
  function markSaved() {
    isDirty.value = false
    lastSavedAt.value = new Date().toISOString()

    if (currentProject.value) {
      currentProject.value.updatedAt = lastSavedAt.value
      logger.info(`项目已保存: ${currentProject.value.name}`)
    }
  }

  // 关闭项目
  function closeProject() {
    const projectName = currentProject.value?.name
    currentProject.value = null
    isDirty.value = false
    lastSavedAt.value = null

    if (projectName) {
      logger.info(`关闭项目: ${projectName}`)
    }
  }

  // 更新项目名称
  function renameProject(newName: string) {
    if (currentProject.value) {
      currentProject.value.name = newName
      markDirty()
    }
  }

  return {
    // 状态
    currentProject,
    isDirty,
    lastSavedAt,
    // 计算属性
    hasOpenProject,
    projectName,
    projectType,
    // 方法
    setProject,
    createProject,
    markDirty,
    markSaved,
    closeProject,
    renameProject,
  }
})
