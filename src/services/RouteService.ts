import type { Route, RouteSegment, RouteCost, PlanningParams, CostFactors } from '@/types'
import type { IRouteRepository } from '@/repositories'
import { createRouteRepository } from '@/repositories'

/**
 * 路由业务服务
 * 封装路径规划、成本计算等核心业务逻辑
 */
export class RouteService {
    private repository: IRouteRepository

    constructor(repository?: IRouteRepository) {
        this.repository = repository ?? createRouteRepository()
    }

    /**
     * 获取所有已保存的路由
     */
    async getRoutes(): Promise<Route[]> {
        try {
            return await this.repository.getRoutes()
        } catch (error) {
            console.error('获取路由列表失败:', error)
            throw new Error('无法加载路由列表')
        }
    }

    /**
     * 获取路由详情
     * @param routeId 路由ID
     */
    async getRouteById(routeId: string): Promise<Route | null> {
        try {
            return await this.repository.getRouteById(routeId)
        } catch (error) {
            console.error(`获取路由 ${routeId} 详情失败:`, error)
            throw new Error('获取路由详情失败')
        }
    }

    /**
     * 保存路由
     * @param route 路由数据
     */
    async saveRoute(route: Route): Promise<Route> {
        try {
            return await this.repository.saveRoute(route)
        } catch (error) {
            console.error('保存路由失败:', error)
            throw new Error('保存路由失败')
        }
    }

    /**
     * 删除路由
     * @param routeId 路由ID
     */
    async deleteRoute(routeId: string): Promise<void> {
        try {
            await this.repository.deleteRoute(routeId)
        } catch (error) {
            console.error(`删除路由 ${routeId} 失败:`, error)
            throw new Error('删除路由失败')
        }
    }

    /**
     * 获取分段详情
     * @param segmentId 分段ID
     */
    async getSegmentDetails(segmentId: string): Promise<RouteSegment | null> {
        try {
            return await this.repository.getSegmentDetails(segmentId)
        } catch (error) {
            console.error(`获取分段 ${segmentId} 详情失败:`, error)
            throw new Error('获取分段详情失败')
        }
    }

    /**
     * 计算路由成本
     * 根据路由分段和成本因子计算总成本
     * @param route 路由
     * @param costFactors 成本因子
     */
    calculateRouteCost(route: Route, costFactors: CostFactors): RouteCost {
        let cableCost = 0
        let installationCost = 0

        // 计算每个分段的成本
        for (const segment of route.segments) {
            cableCost += segment.cost
            installationCost += segment.length * costFactors.laborCostPerKm
        }

        // 设备成本 (中继器等)
        const equipmentCost = this.calculateEquipmentCost(route)

        // 总成本 (含应急费用)
        const subtotal = cableCost + installationCost + equipmentCost
        const contingency = subtotal * (costFactors.contingencyPercent / 100)
        const totalCost = subtotal + contingency

        return {
            cableCost,
            installationCost,
            equipmentCost,
            totalCost
        }
    }

    /**
     * 计算设备成本 (中继器、分支器等)
     */
    private calculateEquipmentCost(route: Route): number {
        let cost = 0

        // 根据点类型计算设备成本
        for (const point of route.points) {
            switch (point.type) {
                case 'repeater':
                    cost += 500000 // 标准中继器成本
                    break
                case 'branching':
                    cost += 200000 // 分支器成本
                    break
            }
        }

        return cost
    }

    /**
     * 生成 Pareto 最优路径
     * 基于成本和风险的多目标优化
     * @param routes 候选路由列表
     */
    generateParetoRoutes(routes: Route[]): Route[] {
        if (routes.length === 0) return []

        // Pareto 优化: 同时考虑成本和风险
        const paretoFront: Route[] = []

        for (const candidate of routes) {
            let isDominated = false

            // 检查是否被其他解支配
            for (const other of routes) {
                if (other.id === candidate.id) continue

                // other 支配 candidate 的条件:
                // 成本和风险都不差于 candidate，且至少一个更好
                // 使用结构化字段 cost.total 和 risk.overall
                const costBetter = other.cost.total <= candidate.cost.total
                const riskBetter = other.risk.overall <= candidate.risk.overall
                const strictlyBetter = other.cost.total < candidate.cost.total || other.risk.overall < candidate.risk.overall

                if (costBetter && riskBetter && strictlyBetter) {
                    isDominated = true
                    break
                }
            }

            if (!isDominated) {
                paretoFront.push(candidate)
            }
        }

        // 按成本排序返回
        return paretoFront.sort((a, b) => a.cost.total - b.cost.total)
    }

    /**
     * 计算两点间的哈弗辛距离（大圆距离）
     * @param coord1 坐标1 [经度, 纬度]
     * @param coord2 坐标2 [经度, 纬度]
     * @returns 距离 (公里)
     */
    calculateDistance(coord1: [number, number], coord2: [number, number]): number {
        const R = 6371 // 地球半径 (公里)
        const toRad = (deg: number) => deg * Math.PI / 180

        const lat1 = toRad(coord1[1])
        const lat2 = toRad(coord2[1])
        const deltaLat = toRad(coord2[1] - coord1[1])
        const deltaLon = toRad(coord2[0] - coord1[0])

        const a = Math.sin(deltaLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

        return R * c
    }
}

// 创建单例实例
let _routeService: RouteService | null = null

export function useRouteService(): RouteService {
    if (!_routeService) {
        _routeService = new RouteService()
    }
    return _routeService
}
