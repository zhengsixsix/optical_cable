import { ref } from 'vue'
import { useAppStore } from '@/stores'

/**
 * 错误处理组合式函数
 * 提供统一的错误处理、通知和日志记录功能
 */
export interface ErrorContext {
    component?: string
    action?: string
    data?: Record<string, unknown>
}

export interface ErrorLog {
    id: string
    timestamp: Date
    message: string
    type: 'error' | 'warning' | 'info'
    context?: ErrorContext
    stack?: string
}

export function useErrorHandler() {
    const appStore = useAppStore()
    const errorLogs = ref<ErrorLog[]>([])

    /**
     * 生成唯一 ID
     */
    const generateId = () => {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * 处理错误并显示通知
     */
    const handleError = (error: Error | string, context?: ErrorContext) => {
        const message = typeof error === 'string' ? error : error.message
        const stack = error instanceof Error ? error.stack : undefined

        // 创建错误日志
        const errorLog: ErrorLog = {
            id: generateId(),
            timestamp: new Date(),
            message,
            type: 'error',
            context,
            stack
        }

        // 添加到日志列表
        errorLogs.value.push(errorLog)

        // 显示错误通知
        appStore.showNotification({
            type: 'error',
            message: formatErrorMessage(message, context)
        })

        // 记录到应用日志
        appStore.addLog('ERROR', formatLogMessage(message, context))

        // 控制台输出
        console.error('[Error]', message, context, stack)

        return errorLog
    }

    /**
     * 处理警告
     */
    const handleWarning = (message: string, context?: ErrorContext) => {
        const warningLog: ErrorLog = {
            id: generateId(),
            timestamp: new Date(),
            message,
            type: 'warning',
            context
        }

        errorLogs.value.push(warningLog)

        appStore.showNotification({
            type: 'warning',
            message: formatErrorMessage(message, context)
        })

        appStore.addLog('WARN', formatLogMessage(message, context))

        console.warn('[Warning]', message, context)

        return warningLog
    }

    /**
     * 格式化错误消息用于显示
     */
    const formatErrorMessage = (message: string, context?: ErrorContext): string => {
        if (context?.action) {
            return `${context.action}失败: ${message}`
        }
        return message
    }

    /**
     * 格式化日志消息
     */
    const formatLogMessage = (message: string, context?: ErrorContext): string => {
        const parts = [message]
        if (context?.component) {
            parts.unshift(`[${context.component}]`)
        }
        if (context?.action) {
            parts.splice(1, 0, context.action)
        }
        return parts.join(' - ')
    }

    /**
     * 异步操作包装器，自动捕获错误
     */
    const withErrorHandling = async <T>(
        fn: () => Promise<T>,
        context?: ErrorContext
    ): Promise<T | null> => {
        try {
            return await fn()
        } catch (error) {
            handleError(error as Error, context)
            return null
        }
    }

    /**
     * 清除错误日志
     */
    const clearErrorLogs = () => {
        errorLogs.value = []
    }

    /**
     * 获取最近的错误
     */
    const getRecentErrors = (count = 10) => {
        return errorLogs.value.slice(-count).reverse()
    }

    return {
        errorLogs,
        handleError,
        handleWarning,
        withErrorHandling,
        clearErrorLogs,
        getRecentErrors
    }
}
