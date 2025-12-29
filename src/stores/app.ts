import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Notification, LogEntry } from '@/types'
import type { ProjectType, ProjectMetadata } from '@/services/ProjectFileService'

export type ViewType = 'planning' | 'design' | 'monitoring' | 'settings'

// 地图选点模式
export interface MapSelectMode {
  active: boolean
  type: 'start' | 'end' | 'range' | null
  callback: ((coord: string) => void) | null
}

// 项目状态
export interface ProjectState {
  currentProject: ProjectMetadata | null
  isDirty: boolean
  lastSavedAt: string | null
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

export const useAppStore = defineStore('app', () => {
  // 状态
  const currentView = ref<ViewType>('planning')
  const notifications = ref<Notification[]>([])
  
  // 项目状态
  const projectState = ref<ProjectState>({
    currentProject: null,
    isDirty: false,
    lastSavedAt: null,
  })
  
  // 面板可见性状态
  const panelVisibility = ref<PanelVisibility>({
    layerInfo: true,
    routeStats: true,
    depthProfile: true,
    terrain3D: true,
    realtime: true,
    logPanel: true,
    dataPanel: false,
    layerDetailPanel: false,
    paretoAnalysisPanel: false,
    segmentConfigPanel: false,
    repeaterConfigPanel: false,
  })
  
  const logs = ref<LogEntry[]>([
    { time: formatTime(), level: 'INFO', message: 'GIS数据源切换至本地文件' },
    { time: formatTime(), level: 'INFO', message: '软件界面加载完成' },
    { time: formatTime(), level: 'INFO', message: '加载默认配置...' },
    { time: formatTime(), level: 'INFO', message: '加载基础GIS数据...' },
    { time: formatTime(), level: 'INFO', message: '初始化路由规划模块...' },
    { time: formatTime(), level: 'INFO', message: '初始化传感器系统规划模块...' },
    { time: formatTime(), level: 'INFO', message: '初始化监控模块...' },
    { time: formatTime(), level: 'INFO', message: '系统就绪' },
  ])
  const isLoading = ref(false)
  const previousView = ref<ViewType | null>(null)

  const activeDialog = ref<string | null>(null)
  
  // 地图选点模式
  const mapSelectMode = ref<MapSelectMode>({
    active: false,
    type: null,
    callback: null,
  })

  // Getters
  const recentLogs = computed(() => logs.value.slice(-50))
  const hasOpenProject = computed(() => projectState.value.currentProject !== null)
  const currentProjectName = computed(() => projectState.value.currentProject?.name || '')
  const currentProjectType = computed(() => projectState.value.currentProject?.type || null)

  // Actions
  function switchView(view: ViewType) {
    previousView.value = currentView.value
    currentView.value = view
    addLog('INFO', `切换到${getViewName(view)}视图`)
  }

  function getViewName(view: ViewType): string {
    const names: Record<ViewType, string> = {
      planning: '路由规划',
      design: '系统设计',
      monitoring: '监控',
      settings: '设置',
    }
    return names[view]
  }

  function showNotification(notification: Omit<Notification, 'id'>) {
    const id = `notif-${Date.now()}`
    const newNotification: Notification = { ...notification, id }
    notifications.value.push(newNotification)

    // 自动移除
    const duration = notification.duration ?? 3000
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, duration)
    }
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  function addLog(level: LogEntry['level'], message: string) {
    logs.value.push({
      time: formatTime(),
      level,
      message,
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

  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  function formatTime(): string {
    const now = new Date()
    return now.toTimeString().split(' ')[0]
  }

  function openDialog(name: string) {
    console.log('[Store] Opening dialog:', name)
    activeDialog.value = name
  }

  function closeDialog() {
    console.log('[Store] Closing dialog')
    activeDialog.value = null
  }

  // 开始地图选点模式
  function startMapSelect(type: 'start' | 'end' | 'range', callback: (coord: string) => void) {
    mapSelectMode.value = {
      active: true,
      type,
      callback,
    }
    switchView('planning')
    addLog('INFO', `进入地图选点模式: ${type === 'start' ? '起点' : type === 'end' ? '终点' : '规划范围'}`)
    showNotification({ type: 'info', message: '请在地图上双击选择坐标点' })
  }

  // 完成地图选点
  function completeMapSelect(coord: string) {
    if (mapSelectMode.value.callback) {
      mapSelectMode.value.callback(coord)
    }
    mapSelectMode.value = { active: false, type: null, callback: null }
    addLog('INFO', `地图选点完成: ${coord}`)
  }

  // 取消地图选点
  function cancelMapSelect() {
    mapSelectMode.value = { active: false, type: null, callback: null }
    addLog('INFO', '取消地图选点')
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
    if (projectName) {
      addLog('INFO', `关闭项目: ${projectName}`)
    }
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
      repeaterConfigPanel: '中继器配置',
    }
    return names[panelName]
  }

  return {
    currentView,
    notifications,
    logs,
    isLoading,
    previousView,
    recentLogs,
    activeDialog,
    panelVisibility,
    mapSelectMode,
    projectState,
    hasOpenProject,
    currentProjectName,
    currentProjectType,
    switchView,
    showNotification,
    removeNotification,
    addLog,
    clearLogs,
    exportLogs,
    setLoading,
    openDialog,
    closeDialog,
    togglePanel,
    setPanelVisible,
    startMapSelect,
    completeMapSelect,
    cancelMapSelect,
    setCurrentProject,
    setProjectDirty,
    markProjectSaved,
    closeCurrentProject,
  }
})
