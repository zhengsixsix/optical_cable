/**
 * 统一日志服务
 * 替代直接使用 console.log
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LogEntry {
  time: string
  level: LogLevel
  message: string
}

type LogCallback = (entry: LogEntry) => void

let logCallback: LogCallback | null = null

// 设置日志回调（由 app store 调用）
export function setLogCallback(callback: LogCallback) {
  logCallback = callback
}

function formatTime(): string {
  return new Date().toTimeString().split(' ')[0]
}

function log(level: LogLevel, message: string) {
  const entry: LogEntry = {
    time: formatTime(),
    level,
    message,
  }

  if (logCallback) {
    logCallback(entry)
  }

  // 开发环境同时输出到控制台
  if (import.meta.env.DEV) {
    const consoleMethods: Record<LogLevel, keyof Console> = {
      DEBUG: 'debug',
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
    }
    const method = consoleMethods[level] as 'debug' | 'info' | 'warn' | 'error'
    console[method](`[${entry.time}] [${level}]`, message)
  }
}

export const logger = {
  debug: (message: string) => log('DEBUG', message),
  info: (message: string) => log('INFO', message),
  warn: (message: string) => log('WARN', message),
  error: (message: string) => log('ERROR', message),
}
