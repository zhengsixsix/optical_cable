﻿import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Notification, LogEntry, LogCategory } from '@/types'
import type { ProjectMetadata } from '@/services/ProjectFileService'

export type ViewType = 'planning' | 'design' | 'monitoring' | 'settings'

// 项目阶段类型
export type ProjectPhase = 
  | 'route-planning'         // 路由规划阶段
  | 'transmission-planning'  // 传输规划阶段
  | 'detailed-design'        // 详细设计阶段
  | 'monitoring'             // 运维监控阶段

// 项目状态
export interface ProjectState {
  currentProject: ProjectMetadata | null
  isDirty: boolean
  lastSavedAt: string | null
  phase: ProjectPhase  // 当前项目阶段
}

// 面板可见性状态类型
export interface PanelVisibility {
  layerInfo: boolean
  routeStats: boolean
  depthProfile: boolean
  terrain3D: boolean
  realtime: boolean
  logPanel: boolean
  dataPanel: boolean
  layerDetailPanel: boolean
  paretoAnalysisPanel: boolean
  segmentConfigPanel: boolean
  repeaterConfigPanel: boolean
}

export interface GlobalLoadingState {
  visible: boolean
  message: string
  detail: string
}

export const useAppStore = defineStore('app', () => {
  // 状态
  const currentView = ref<ViewType>('planning')
  const notifications = ref<Notification[]>([])
  const globalLoading = ref<GlobalLoadingState>({
    visible: false,
    message: '',
    detail: '',
  })
  const globalLoadingKeys = ref<Set<string>>(new Set())
  
  // 项目状态
  const projectState = ref<ProjectState>({
    currentProject: null,
    isDirty: false,
    lastSavedAt: null,
    phase: 'route-planning',
  })
  
  // 面板可见性状态
  const panelVisibility = ref<PanelVisibility>({
    layerInfo: true,
    routeStats: true,
    depthProfile: true,
    terrain3D: true,
    realtime: false,
    logPanel: true,
    dataPanel: false,
    layerDetailPanel: false,
    paretoAnalysisPanel: false,
    segmentConfigPanel: false,
    repeaterConfigPanel: false,
  })
  
  const logs = ref<LogEntry[]>([
    { time: formatTime(), level: 'INFO', message: 'GIS数据源切换至本地文件', category: '系统日志' },
    { time: formatTime(), level: 'INFO', message: '软件界面加载完成', category: '系统日志' },
    { time: formatTime(), level: 'INFO', message: '加载默认配置...', category: '系统日志' },
    { time: formatTime(), level: 'INFO', message: '加载基础GIS数据...', category: '系统日志' },
    { time: formatTime(), level: 'INFO', message: '初始化路由规划模块...', category: '系统日志' },
    { time: formatTime(), level: 'INFO', message: '初始化传感器系统规划模块...', category: '系统日志' },
    { time: formatTime(), level: 'INFO', message: '初始化监控模块...', category: '系统日志' },
    { time: formatTime(), level: 'INFO', message: '系统就绪', category: '系统日志' },
  ])
  const activeDialog = ref<string | null>(null)

  // Getters
  const recentLogs = computed(() => logs.value.slice(-50))
  const hasOpenProject = computed(() => projectState.value.currentProject !== null)
  const currentProjectName = computed(() => projectState.value.currentProject?.name || '')
  const currentProjectType = computed(() => projectState.value.currentProject?.type || null)

  // Actions

  function formatNotificationMessage(message: string): string {
    const compactMessage = message.replace(/\s+/g, ' ').trim()
    if (compactMessage.length <= 240) return compactMessage
    return `${compactMessage.slice(0, 240)}...`
  }

  function getNotificationDuration(notification: Omit<Notification, 'id'>): number {
    if (notification.duration !== undefined) return notification.duration
    return notification.type === 'error' ? 5000 : 3000
  }

  function showNotification(notification: Omit<Notification, 'id'>) {
    const id = `notif-${Date.now()}`
    const duration = getNotificationDuration(notification)
    const newNotification: Notification = {
      ...notification,
      id,
      message: formatNotificationMessage(notification.message),
      duration,
    }
    notifications.value.push(newNotification)

    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, duration)
    }
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  function addLog(level: LogEntry['level'], message: string, category?: LogCategory, extra?: { deviceId?: string; deviceName?: string }) {
    logs.value.push({
      time: formatTime(),
      level,
      message,
      category: category || '系统日志',
      ...extra,
    })

    // 限制日志数量
    if (logs.value.length > 200) {
      logs.value = logs.value.slice(-100)
    }
  }

  function clearLogs() {
    logs.value = []
  }

  // 导出日志到文件
  function exportLogs(format: 'txt' | 'csv' = 'txt') {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
    let content: string
    let mimeType: string
    let extension: string

    if (format === 'csv') {
      content = 'Time,Level,Message\n'
      content += logs.value.map(log => 
        `"${log.time}","${log.level}","${log.message.replace(/"/g, '""')}"`
      ).join('\n')
      mimeType = 'text/csv;charset=utf-8'
      extension = 'csv'
    } else {
      content = `========================================\n`
      content += `海底光缆智能规划软件 - 运行日志\n`
      content += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`
      content += `日志条数: ${logs.value.length}\n`
      content += `========================================\n\n`
      content += logs.value.map(log => 
        `[${log.time}] [${log.level}] ${log.message}`
      ).join('\n')
      mimeType = 'text/plain;charset=utf-8'
      extension = 'txt'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `运行日志_${timestamp}.${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    addLog('INFO', `日志已导出: 运行日志_${timestamp}.${extension}`)
  }

  function showGlobalLoading(message = '正在加载...', detail = '', key = 'global') {
    const nextKeys = new Set(globalLoadingKeys.value)
    nextKeys.add(key)
    globalLoadingKeys.value = nextKeys
    globalLoading.value = {
      visible: true,
      message,
      detail,
    }
  }

  function hideGlobalLoading(key?: string) {
    if (!key) {
      globalLoadingKeys.value = new Set()
      globalLoading.value = {
        visible: false,
        message: '',
        detail: '',
      }
      return
    }

    const nextKeys = new Set(globalLoadingKeys.value)
    nextKeys.delete(key)
    globalLoadingKeys.value = nextKeys
    if (nextKeys.size === 0) {
      globalLoading.value = {
        visible: false,
        message: '',
        detail: '',
      }
    }
  }

  function formatTime(): string {
    const now = new Date()
    return now.toTimeString().split(' ')[0]
  }

  function openDialog(name: string) {
    activeDialog.value = name
  }

  function closeDialog() {
    activeDialog.value = null
  }

  // 设置当前项目
  function setCurrentProject(project: ProjectMetadata | null) {
    projectState.value.currentProject = project
    projectState.value.isDirty = false
    if (project) {
      addLog('INFO', `打开项目: ${project.name}`)
    }
  }

  // 设置项目修改状态
  function setProjectDirty(dirty: boolean) {
    projectState.value.isDirty = dirty
  }

  // 保存项目后更新状态
  function markProjectSaved() {
    projectState.value.isDirty = false
    projectState.value.lastSavedAt = new Date().toISOString()
    if (projectState.value.currentProject) {
      addLog('INFO', `项目已保存: ${projectState.value.currentProject.name}`)
    }
  }

  // 关闭项目
  function closeCurrentProject() {
    const projectName = projectState.value.currentProject?.name
    projectState.value.currentProject = null
    projectState.value.isDirty = false
    projectState.value.lastSavedAt = null
    projectState.value.phase = 'route-planning'
    if (projectName) {
      addLog('INFO', `关闭项目: ${projectName}`)
    }
  }

  // 设置项目阶段
  function setProjectPhase(phase: ProjectPhase) {
    const phaseNames: Record<ProjectPhase, string> = {
      'route-planning': '路由规划',
      'transmission-planning': '传输规划',
      'detailed-design': '详细设计',
      'monitoring': '运维监控',
    }
    projectState.value.phase = phase
    addLog('INFO', `项目阶段切换到: ${phaseNames[phase]}`)
  }

  // 切换面板可见性
  function togglePanel(panelName: keyof PanelVisibility) {
    panelVisibility.value[panelName] = !panelVisibility.value[panelName]
    addLog('INFO', `${panelVisibility.value[panelName] ? '显示' : '隐藏'}${getPanelName(panelName)}面板`)
  }

  function setPanelVisible(panelName: keyof PanelVisibility, visible: boolean) {
    panelVisibility.value[panelName] = visible
  }

  function getPanelName(panelName: keyof PanelVisibility): string {
    const names: Record<keyof PanelVisibility, string> = {
      layerInfo: '图层信息',
      routeStats: '路由统计',
      depthProfile: '水深剖面',
      terrain3D: '地形3D',
      realtime: '实时',
      logPanel: '日志',
      dataPanel: '数据管理',
      layerDetailPanel: '图层详情',
      paretoAnalysisPanel: 'Pareto分析',
      segmentConfigPanel: '分段参数配置',
      repeaterConfigPanel: '放大器配置',
    }
    return names[panelName]
  }

  return {
    currentView,
    notifications,
    globalLoading,
    logs,
    recentLogs,
    activeDialog,
    panelVisibility,
    projectState,
    hasOpenProject,
    currentProjectName,
    currentProjectType,
    showNotification,
    removeNotification,
    addLog,
    clearLogs,
    exportLogs,
    showGlobalLoading,
    hideGlobalLoading,
    openDialog,
    closeDialog,
    togglePanel,
    setPanelVisible,
    setCurrentProject,
    setProjectDirty,
    markProjectSaved,
    closeCurrentProject,
    setProjectPhase,
  }
})
