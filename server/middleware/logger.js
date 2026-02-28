/**
 * 请求日志中间件
 */

export function requestLogger(req, res, next) {
    const start = Date.now()
    const { method, path } = req

    res.on('finish', () => {
        const duration = Date.now() - start
        const status = res.statusCode
        const icon = status < 400 ? '✅' : status < 500 ? '⚠️' : '❌'
        console.log(`${icon} [${method} ${path}] ${status} - ${duration}ms`)
    })

    next()
}
