/**
 * 统一错误处理中间件
 */

export function errorHandler(err, req, res, _next) {
    const status = err.status || 500
    const message = err.message || '服务器内部错误'

    console.error(`❌ [${req.method} ${req.path}] ${status}: ${message}`)
    if (status === 500) {
        console.error(err.stack)
    }

    res.status(status).json({
        success: false,
        error: message,
    })
}

/**
 * 异步路由包装器 - 自动捕获 async handler 中的错误
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}
