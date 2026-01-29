import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { setLogCallback, logger } from '@/shared/utils'

/**
 * 全局应用 Store（精简版）
 * 只保留通知和加载状态
 */

export interface Notification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  duration?: number
}

export interface LogEntry {
  time: string
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  message: string
}

export const useAppStore = defineStore('app', () => {
  // 通知状态
  const notifications = ref<Notification[]>([])

  // 加载状态
  const isLoading = ref(false)
  const loadingText = ref('加载中...')

  // 日志
  const logs = ref<LogEntry[]>([])

  // 初始化：设置日志回调
  setLogCallback((entry) => {
    logs.value.push(entry)
    if (logs.value.length > 200) {
      logs.value = logs.value.slice(-100)
    }
  })

  // 最近日志
  const recentLogs = computed(() => logs.value.slice(-50))

  // 显示通知
  function showNotification(notification: Omit<Notification, 'id'>) {
    const id = `notif-${Date.now()}`
    const newNotification: Notification = { ...notification, id }
    notifications.value.push(newNotification)

    const duration = notification.duration ?? 3000
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, duration)
    }
  }

  // 移除通知
  function removeNotification(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  // 设置加载状态
  function setLoading(loading: boolean, text?: string) {
    isLoading.value = loading
    if (text) {
      loadingText.value = text
    } else if (!loading) {
      loadingText.value = '加载中...'
    }
  }

  // 清空日志
  function clearLogs() {
    logs.value = []
  }

  // 导出日志
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

    logger.info(`日志已导出: 运行日志_${timestamp}.${extension}`)
  }

  return {
    // 状态
    notifications,
    isLoading,
    loadingText,
    logs,
    recentLogs,
    // 方法
    showNotification,
    removeNotification,
    setLoading,
    clearLogs,
    exportLogs,
  }
})
