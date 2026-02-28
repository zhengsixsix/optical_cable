/**
 * 路由规划 API 路由
 * 使用 A* 栅格寻路算法替代伪直线规划
 */

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { planRoutes, planMultiPointRoute, planBranchingNetworkRoute, placeAmplifiersOnRoute } from '../services/pathfinding.js'

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
            avoidanceZones, armorMappings, buList,
        } = req.body

        console.log(`\n🚢 接收到路由规划请求: mode=${mode}, buList=${buList?.length || 0}`)

        let result

        if (mode === 'multi-point' && buList && buList.length > 0 && waypoints && waypoints.length >= 2) {
            // 多点 + BU → 分支网络 A* 规划
            result = planBranchingNetworkRoute({
                landingStations: waypoints.map(w => ({ id: w.name || `wp-${w.lon}`, lon: w.lon, lat: w.lat, name: w.name || '' })),
                buNodes: buList.map(b => ({ id: b.id || b.name, lon: b.lon, lat: b.lat, name: b.name || '' })),
                gridResolution,
                avoidanceZones,
                riskConfig,
            })
        } else if (mode === 'multi-point' && waypoints && waypoints.length >= 2) {
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

    /**
     * POST /api/route/amplifier-placement
     * 放大器沿路由落位 — 后端基于实际 A* 路径坐标精确插值
     */
    router.post('/amplifier-placement', asyncHandler(async (req, res) => {
        const { trunkCoordinates, branches, namedPoints, spanLength, amplifierKPs } = req.body

        if (!trunkCoordinates || trunkCoordinates.length < 2) {
            return res.status(400).json({ success: false, error: '缺少主干坐标 trunkCoordinates' })
        }

        const branchArr = branches || []
        console.log(`\n🔧 放大器落位请求: 主干 ${trunkCoordinates.length} 点, ${branchArr.length} 分支`)
        // 详细打印分支信息
        branchArr.forEach((b, i) => {
            const c = b.coordinates || []
            console.log(`  分支[${i}]: ${b.fromBuId} → ${b.toLandingName}, ${c.length} 点${c.length > 0 ? `, 首点=[${c[0]}]` : ''}`)
        })

        const result = placeAmplifiersOnRoute({
            trunkCoordinates,
            branches: branchArr,
            namedPoints: namedPoints || [],
            spanLength: spanLength || 80,
            amplifierKPs: amplifierKPs || null,
        })

        // 返回分支诊断信息
        const branchDiag = branchArr.map((b, i) => {
            const c = b.coordinates || []
            return { index: i, fromBuId: b.fromBuId, toLandingName: b.toLandingName, coordCount: c.length }
        })

        res.json({
            success: true,
            amplifiers: result.amplifiers,
            fibers: result.fibers,
            debug: { branchesReceived: branchArr.length, branchDetails: branchDiag },
        })
    }))

    return router
}
