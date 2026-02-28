/**
 * 海底光缆智能规划系统 — 服务端入口
 *
 * 模块化架构:
 *   routes/       → API 路由 (dem, routePlanning, simulation)
 *   services/     → 业务逻辑 (demService, gnModel)
 *   middleware/   → 中间件 (errorHandler, logger)
 *   utils/        → 工具函数 (geo, physics)
 */

import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

// Middleware
import { requestLogger } from './middleware/logger.js'
import { errorHandler } from './middleware/errorHandler.js'

// Services
import { preloadTifData, getTifCache } from './services/demService.js'

// Routes
import { createDemRouter, createGisRouter } from './routes/dem.js'
import { createRoutePlanningRouter } from './routes/routePlanning.js'
import { createSimulationRouter } from './routes/simulation.js'

// ── 路径常量 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEM_DIR = path.join(__dirname, '..', 'public', 'dem')
const DEM_FILES = ['1.tif', '2.tif', '3.tif', '4.tif', '5.tif', '6.tif']
const SHARED_DATA_DIR = path.join(__dirname, '..', 'public', 'data')

// ── Express 初始化 ──
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use(requestLogger)

// ── 挂载路由 ──
app.use('/api/dem', createDemRouter(SHARED_DATA_DIR))
app.use('/api/gis', createGisRouter(SHARED_DATA_DIR))
app.use('/api/route', createRoutePlanningRouter())
app.use('/api/simulation', createSimulationRouter())

// ── 健康检查 ──
app.get('/health', (req, res) => {
    res.json({ status: 'ok', tifCount: getTifCache().length })
})

// ── 全局错误处理 ──
app.use(errorHandler)

// ── 启动 ──
async function start() {
    await preloadTifData(DEM_DIR, DEM_FILES)

    app.listen(PORT, () => {
        console.log(`\n🌊 海底光缆规划服务已启动: http://localhost:${PORT}`)
        console.log(`   - GET  /api/dem/meta        获取元数据`)
        console.log(`   - GET  /api/dem/clip        裁剪区域数据`)
        console.log(`   - GET  /api/dem/point       查询单点高程`)
        console.log(`   - POST /api/dem/profile     获取路径剖面`)
        console.log(`   - POST /api/route/planning  路由规划`)
        console.log(`   - POST /api/simulation/run  仿真计算`)
        console.log(`   - GET  /api/gis/shared      共享GIS文件`)
        console.log(`   - GET  /health              健康检查\n`)
    })
}

start().catch(console.error)
