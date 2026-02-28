/**
 * 路由规划 API 路由
 * 使用 A* 栅格寻路算法替代伪直线规划
 */

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { planRoutes, planMultiPointRoute } from '../services/pathfinding.js'

export function createRoutePlanningRouter() {
    const router = Router()

    /**
     * POST /api/route/planning
     * 路由规划接口 — 基于 DEM 的 A* 寻路
     */
    router.post('/planning', asyncHandler(async (req, res) => {
        const {
            mode, startPoint, endPoint, waypoints,
            planningRange, gridResolution, riskConfig,
            avoidanceZones, armorMappings,
        } = req.body

        console.log(`\n🚢 接收到路由规划请求: mode=${mode}`)

        let result

        if (mode === 'multi-point' && waypoints && waypoints.length >= 2) {
            result = planMultiPointRoute({
                waypoints,
                planningRange,
                gridResolution,
                avoidanceZones,
                riskConfig,
            })
        } else if (startPoint && endPoint) {
            result = planRoutes({
                startPoint,
                endPoint,
                planningRange,
                gridResolution,
                avoidanceZones,
                riskConfig,
                armorMappings,
            })
        } else {
            return res.status(400).json({ success: false, error: '缺少必要参数' })
        }

        const { routes } = result

        console.log(`✅ 规划完成: 生成 ${routes.length} 条路由`)

        res.json({
            success: true,
            mode,
            routes,
            summary: {
                totalRoutes: routes.length,
                bestLength: routes.length > 0 ? Math.min(...routes.map(r => r.totalLength)) : 0,
                bestCost: routes.length > 0 ? Math.min(...routes.map(r => r.totalCost)) : 0,
                lowestRisk: routes.length > 0 ? Math.min(...routes.map(r => r.avgRisk)) : 0,
            },
            gridInfo: result.gridInfo,
        })
    }))

    return router
}
