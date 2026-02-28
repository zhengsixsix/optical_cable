/**
 * A* 栅格寻路算法
 *
 * 基于 DEM 高程数据构建代价栅格，使用 A* 搜索最优海缆路径。
 * 代价函数综合考虑: 距离、坡度、水深、陆地惩罚、避障区域。
 * 支持多权重配置生成 Pareto 候选路线。
 */

import { getElevation } from './demService.js'
import { haversineDistance } from '../utils/geo.js'

// ── 默认权重配置（生成三条差异化路线） ──
const WEIGHT_PROFILES = [
    {
        id: 'economy',
        name: '经济路线',
        distanceWeight: 1.0,      // 最短路径优先
        slopeWeight: 0.3,
        depthWeight: 0.2,
        shallowPenalty: 0.5,      // 浅水区（需铠装）成本惩罚较低
        depthPreference: 0,       // 不偏好特定水深
    },
    {
        id: 'balanced',
        name: '均衡路线',
        distanceWeight: 0.6,
        slopeWeight: 0.6,
        depthWeight: 0.5,
        shallowPenalty: 1.0,
        depthPreference: 0.3,     // 轻度偏好深水区
    },
    {
        id: 'safety',
        name: '安全路线',
        distanceWeight: 0.3,
        slopeWeight: 1.0,         // 坡度敏感 → 避开海底山脊/海沟陡壁
        depthWeight: 1.0,         // 偏好深水区（远离人类活动）
        shallowPenalty: 2.0,      // 强烈避免浅水区
        depthPreference: 0.8,     // 强烈偏好深水区
    },
]

// ── 最小堆（二叉堆优先队列） ──
class MinHeap {
    constructor() {
        this.data = []
    }

    push(node) {
        this.data.push(node)
        this._bubbleUp(this.data.length - 1)
    }

    pop() {
        const top = this.data[0]
        const last = this.data.pop()
        if (this.data.length > 0) {
            this.data[0] = last
            this._sinkDown(0)
        }
        return top
    }

    get size() {
        return this.data.length
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1
            if (this.data[i].f < this.data[parent].f) {
                [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]]
                i = parent
            } else break
        }
    }

    _sinkDown(i) {
        const n = this.data.length
        while (true) {
            let smallest = i
            const left = 2 * i + 1
            const right = 2 * i + 2
            if (left < n && this.data[left].f < this.data[smallest].f) smallest = left
            if (right < n && this.data[right].f < this.data[smallest].f) smallest = right
            if (smallest === i) break
            ;[this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]]
            i = smallest
        }
    }
}

// ── 核心：构建代价栅格 ──

/**
 * 在给定 bbox 范围内按分辨率构建栅格，每个格子存储高程和代价因子
 * @param {number[]} bbox - [minLon, minLat, maxLon, maxLat]
 * @param {number} resolution - 栅格分辨率（米），默认 1000m
 * @param {Array} avoidanceZones - 避障多边形 [{points: [{lon,lat},...]}]
 * @returns {{ cols, rows, lonStep, latStep, grid, bbox }}
 */
function buildCostGrid(bbox, resolution = 1000, avoidanceZones = []) {
    const [minLon, minLat, maxLon, maxLat] = bbox

    // 经纬度步长近似（1° lat ≈ 111km, 1° lon ≈ 111km * cos(lat)）
    const midLat = (minLat + maxLat) / 2
    const kmPerDegLat = 111.0
    const kmPerDegLon = 111.0 * Math.cos(midLat * Math.PI / 180)
    const resKm = resolution / 1000

    const lonStep = resKm / kmPerDegLon
    const latStep = resKm / kmPerDegLat

    const cols = Math.ceil((maxLon - minLon) / lonStep) + 1
    const rows = Math.ceil((maxLat - minLat) / latStep) + 1

    // 限制栅格规模防止内存爆炸（最大 3000x3000 = 9M cells）
    // 对于长距离路线，自动提升分辨率上限
    const maxDim = 3000
    const actualCols = Math.min(cols, maxDim)
    const actualRows = Math.min(rows, maxDim)
    const actualLonStep = (maxLon - minLon) / (actualCols - 1 || 1)
    const actualLatStep = (maxLat - minLat) / (actualRows - 1 || 1)

    // 构建栅格
    // grid[r][c] = { lon, lat, elevation, isLand, isBlocked }
    // 注意：陆地不标记为 isBlocked（改用高代价穿越），只有避障区域才完全阻塞
    const grid = new Array(actualRows)
    for (let r = 0; r < actualRows; r++) {
        grid[r] = new Array(actualCols)
        const lat = minLat + r * actualLatStep
        for (let c = 0; c < actualCols; c++) {
            const lon = minLon + c * actualLonStep
            const elevation = getElevation(lon, lat)
            const isLand = elevation !== null && elevation > 0
            // 只有避障区域完全阻塞；陆地使用高代价穿越（允许穿越窄海峡/小岛）
            const isBlocked = _isInAvoidanceZone(lon, lat, avoidanceZones)

            grid[r][c] = {
                lon,
                lat,
                elevation: elevation ?? 0,
                isLand,
                isBlocked,
            }
        }
    }

    return {
        cols: actualCols,
        rows: actualRows,
        lonStep: actualLonStep,
        latStep: actualLatStep,
        grid,
        bbox,
    }
}

/**
 * 判断点是否在避障多边形内（射线法）
 */
function _isInAvoidanceZone(lon, lat, zones) {
    for (const zone of zones) {
        if (_pointInPolygon(lon, lat, zone.points)) return true
    }
    return false
}

function _pointInPolygon(x, y, polygon) {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lon, yi = polygon[i].lat
        const xj = polygon[j].lon, yj = polygon[j].lat
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside
        }
    }
    return inside
}

// ── 核心：A* 搜索 ──

/**
 * 8 方向邻居偏移 (dr, dc)
 */
const NEIGHBORS = [
    [-1, 0], [1, 0], [0, -1], [0, 1],       // 上下左右
    [-1, -1], [-1, 1], [1, -1], [1, 1],      // 对角线
]

/**
 * 在栅格中搜索离目标(r,c)最近的非阻塞(海洋)格子
 * 使用 BFS 从(r,c)出发向外扩展
 * @returns {{ r, c }} 或 null
 */
function _findNearestOceanCell(grid, rows, cols, targetR, targetC, maxRadius = 50) {
    if (!grid[targetR][targetC].isBlocked) return { r: targetR, c: targetC }

    const visited = new Set()
    const queue = [{ r: targetR, c: targetC }]
    visited.add(targetR * cols + targetC)

    while (queue.length > 0) {
        const { r, c } = queue.shift()
        for (const [dr, dc] of NEIGHBORS) {
            const nr = r + dr
            const nc = c + dc
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
            const key = nr * cols + nc
            if (visited.has(key)) continue
            visited.add(key)

            // 检查离原始目标的棋盘距离
            const dist = Math.max(Math.abs(nr - targetR), Math.abs(nc - targetC))
            if (dist > maxRadius) continue

            if (!grid[nr][nc].isBlocked) return { r: nr, c: nc }
            queue.push({ r: nr, c: nc })
        }
    }
    return null
}

/**
 * A* 搜索一条路径
 * @param {Object} costGrid - buildCostGrid 返回的栅格
 * @param {Object} start - { lon, lat }
 * @param {Object} end - { lon, lat }
 * @param {Object} weights - 权重配置
 * @param {Float32Array|null} penaltyMap - 路径排斥惩罚图（可选）
 * @returns {Array|null} 路径坐标 [{lon, lat, elevation}] 或 null
 */
function astarSearch(costGrid, start, end, weights, penaltyMap = null) {
    const { cols, rows, lonStep, latStep, grid, bbox } = costGrid
    const [minLon, minLat] = bbox

    // 起终点映射到栅格坐标
    const startCol = Math.round((start.lon - minLon) / lonStep)
    const startRow = Math.round((start.lat - minLat) / latStep)
    const endCol = Math.round((end.lon - minLon) / lonStep)
    const endRow = Math.round((end.lat - minLat) / latStep)

    // 边界裁剪
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    let sr = clamp(startRow, 0, rows - 1)
    let sc = clamp(startCol, 0, cols - 1)
    let er = clamp(endRow, 0, rows - 1)
    let ec = clamp(endCol, 0, cols - 1)

    // 登陆站在陆地上 → 搜索最近的海洋格子作为实际起终点
    const origSr = sr, origSc = sc, origEr = er, origEc = ec
    const startOcean = _findNearestOceanCell(grid, rows, cols, sr, sc)
    const endOcean = _findNearestOceanCell(grid, rows, cols, er, ec)

    if (!startOcean) {
        console.log(`    ⚠️ 起点附近未找到海洋格子 (${sr},${sc})`)
        return null
    }
    if (!endOcean) {
        console.log(`    ⚠️ 终点附近未找到海洋格子 (${er},${ec})`)
        return null
    }

    sr = startOcean.r; sc = startOcean.c
    er = endOcean.r; ec = endOcean.c

    // 诊断日志
    const startCell = grid[sr][sc]
    const endCell = grid[er][ec]
    console.log(`    📍 起点格子 (${sr},${sc}): lon=${startCell.lon.toFixed(3)}, lat=${startCell.lat.toFixed(3)}, elev=${startCell.elevation}, isLand=${startCell.isLand}, isBlocked=${startCell.isBlocked}`)
    console.log(`    📍 终点格子 (${er},${ec}): lon=${endCell.lon.toFixed(3)}, lat=${endCell.lat.toFixed(3)}, elev=${endCell.elevation}, isLand=${endCell.isLand}, isBlocked=${endCell.isBlocked}`)

    // 启发函数：栅格欧几里得距离 × 最小单步代价
    const heuristic = (r, c) => {
        const dr = r - er
        const dc = c - ec
        return Math.sqrt(dr * dr + dc * dc) * 0.5
    }

    // gScore / fScore 使用 Float64Array
    const gScore = new Float64Array(rows * cols).fill(Infinity)
    const fScore = new Float64Array(rows * cols).fill(Infinity)
    const cameFrom = new Int32Array(rows * cols).fill(-1)
    const closed = new Uint8Array(rows * cols)

    const idx = (r, c) => r * cols + c

    gScore[idx(sr, sc)] = 0
    fScore[idx(sr, sc)] = heuristic(sr, sc)

    const openSet = new MinHeap()
    openSet.push({ r: sr, c: sc, f: fScore[idx(sr, sc)] })

    const { distanceWeight, slopeWeight, depthWeight, shallowPenalty, depthPreference = 0 } = weights

    // 最大扩展节点限制（防止超大栅格搜索太久）
    let expansions = 0
    const maxExpansions = rows * cols

    while (openSet.size > 0) {
        const { r, c } = openSet.pop()
        const ci = idx(r, c)

        if (closed[ci]) continue
        closed[ci] = 1
        expansions++

        if (expansions > maxExpansions) {
            console.log(`    ⚠️ 搜索超过最大扩展数 ${maxExpansions}`)
            break
        }

        // 到达终点
        if (r === er && c === ec) {
            const path = _reconstructPath(cameFrom, grid, cols, sr, sc, er, ec)
            // 如果起终点从陆地跳到了海洋，补回原始登陆站坐标
            if (origSr !== sr || origSc !== sc) {
                const origCell = grid[origSr][origSc]
                path.unshift({ lon: origCell.lon, lat: origCell.lat, elevation: origCell.elevation })
            }
            if (origEr !== er || origEc !== ec) {
                const origCell = grid[origEr][origEc]
                path.push({ lon: origCell.lon, lat: origCell.lat, elevation: origCell.elevation })
            }
            return path
        }

        const currentCell = grid[r][c]

        for (const [dr, dc] of NEIGHBORS) {
            const nr = r + dr
            const nc = c + dc
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue

            const ni = idx(nr, nc)
            if (closed[ni]) continue

            const neighborCell = grid[nr][nc]

            // 避障区域完全阻塞 → 跳过
            if (neighborCell.isBlocked) continue

            // ---- 代价计算 ----
            // 1. 距离代价
            const stepDistKm = haversineDistance(
                currentCell.lon, currentCell.lat,
                neighborCell.lon, neighborCell.lat
            )
            let cost = stepDistKm * distanceWeight

            // 2. 坡度代价（高程差 / 水平距离）
            const elevDiff = Math.abs(neighborCell.elevation - currentCell.elevation)
            const slopeRatio = stepDistKm > 0 ? (elevDiff / 1000) / stepDistKm : 0  // 无量纲
            cost += slopeRatio * 10 * slopeWeight  // 放大到合理量级

            // 3. 水深/陆地代价
            if (neighborCell.isLand) {
                // 陆地：极高代价但允许穿越（处理粗分辨率下窄海峡/小岛被误封的情况）
                // 高程越高 → 代价越大（沿海低地代价较低，高山几乎不可穿越）
                const landElev = Math.max(neighborCell.elevation, 1)
                cost += (50 + landElev * 0.5) * distanceWeight
            } else if (neighborCell.elevation < 0) {
                const depth = Math.abs(neighborCell.elevation)
                // 海底：深水区成本偏低（安全），超深区(>6000m)有额外代价
                if (depth > 6000) {
                    cost += (depth - 6000) / 1000 * depthWeight
                }
                // 浅水区惩罚 (<200m，需要重铠装)
                if (depth < 200) {
                    cost += (200 - depth) / 100 * shallowPenalty
                }
                // 深度偏好：安全路线偏好深水区（2000-5000m 最优），浅水和超深水增加代价
                if (depthPreference > 0) {
                    const optimalDepth = 3500  // 最优铺设深度
                    const depthDeviation = Math.abs(depth - optimalDepth) / 1000
                    cost += depthDeviation * depthPreference
                }
            }

            // 4. 路径排斥惩罚（使后续路线偏离前序路线）
            if (penaltyMap && penaltyMap[ni] > 0) {
                cost += penaltyMap[ni]
            }

            const tentativeG = gScore[ci] + cost
            if (tentativeG < gScore[ni]) {
                cameFrom[ni] = ci
                gScore[ni] = tentativeG
                fScore[ni] = tentativeG + heuristic(nr, nc)
                openSet.push({ r: nr, c: nc, f: fScore[ni] })
            }
        }
    }

    // 没找到路径
    console.log(`    ❌ A*未找到路径: 扩展了 ${expansions} 个节点, openSet剩余 ${openSet.size}`)
    return null
}

/**
 * 回溯重建路径
 */
function _reconstructPath(cameFrom, grid, cols, sr, sc, er, ec) {
    const path = []
    let ci = er * cols + ec

    while (ci !== -1) {
        const r = Math.floor(ci / cols)
        const c = ci % cols
        const cell = grid[r][c]
        path.push({
            lon: cell.lon,
            lat: cell.lat,
            elevation: cell.elevation,
        })
        if (r === sr && c === sc) break
        ci = cameFrom[ci]
    }

    path.reverse()
    return path
}

// ── 路径简化（Douglas-Peucker） ──

/**
 * 简化路径点，减少冗余点
 * @param {Array} path - [{lon, lat, elevation}]
 * @param {number} epsilonKm - 容差（km）
 */
function simplifyPath(path, epsilonKm = 0.5) {
    if (path.length <= 2) return path

    // 找最远点
    let maxDist = 0
    let maxIdx = 0
    const first = path[0]
    const last = path[path.length - 1]

    for (let i = 1; i < path.length - 1; i++) {
        const d = _perpendicularDistance(path[i], first, last)
        if (d > maxDist) {
            maxDist = d
            maxIdx = i
        }
    }

    if (maxDist > epsilonKm) {
        const left = simplifyPath(path.slice(0, maxIdx + 1), epsilonKm)
        const right = simplifyPath(path.slice(maxIdx), epsilonKm)
        return left.slice(0, -1).concat(right)
    }

    return [first, last]
}

function _perpendicularDistance(point, lineStart, lineEnd) {
    const dAB = haversineDistance(lineStart.lon, lineStart.lat, lineEnd.lon, lineEnd.lat)
    if (dAB === 0) return haversineDistance(point.lon, point.lat, lineStart.lon, lineStart.lat)
    const dAP = haversineDistance(lineStart.lon, lineStart.lat, point.lon, point.lat)
    const dBP = haversineDistance(lineEnd.lon, lineEnd.lat, point.lon, point.lat)
    // 海伦公式求高
    const s = (dAB + dAP + dBP) / 2
    const area = Math.sqrt(Math.max(0, s * (s - dAB) * (s - dAP) * (s - dBP)))
    return (2 * area) / dAB
}

// ── 公共接口：生成 Pareto 多路线 ──

/**
 * 执行 A* 寻路，生成多条 Pareto 候选路线
 *
 * @param {Object} params
 * @param {Object} params.startPoint - { lon, lat }
 * @param {Object} params.endPoint - { lon, lat }
 * @param {Object} [params.planningRange] - { northwest: {lon,lat}, southeast: {lon,lat} }
 * @param {number} [params.gridResolution=1000] - 栅格分辨率(米)
 * @param {Array}  [params.avoidanceZones=[]] - 避障区域
 * @param {Object} [params.riskConfig] - 风险阈值配置
 * @param {Array}  [params.armorMappings] - 铠装映射
 * @returns {{ routes: ParetoRoute[], gridInfo: Object }}
 */
export function planRoutes(params) {
    const {
        startPoint,
        endPoint,
        planningRange,
        gridResolution = 1000,
        avoidanceZones = [],
        riskConfig = { highRiskThreshold: 4000, mediumRiskThreshold: 2000 },
    } = params

    const startTime = Date.now()

    // 计算规划 bbox
    const bbox = _computeBbox(startPoint, endPoint, planningRange)

    // 自适应分辨率：如果区域太大，自动增大分辨率防止栅格过粗
    const midLat = (bbox[1] + bbox[3]) / 2
    const bboxWidthKm = (bbox[2] - bbox[0]) * 111 * Math.cos(midLat * Math.PI / 180)
    const bboxHeightKm = (bbox[3] - bbox[1]) * 111
    const maxDimKm = Math.max(bboxWidthKm, bboxHeightKm)
    // 确保每个维度至少 1500 个有效格子，否则自动提升分辨率
    let effectiveResolution = gridResolution
    const desiredMinCells = 1500
    const minResolution = (maxDimKm * 1000) / desiredMinCells
    if (effectiveResolution < minResolution) {
        effectiveResolution = Math.ceil(minResolution / 100) * 100  // 取整百
        console.log(`  📏 分辨率自动调整: ${gridResolution}m → ${effectiveResolution}m (区域跨度 ${maxDimKm.toFixed(0)}km)`)
    }

    console.log(`  📐 规划范围: [${bbox.map(v => v.toFixed(2))}], 分辨率: ${effectiveResolution}m`)

    // 构建代价栅格
    const costGrid = buildCostGrid(bbox, effectiveResolution, avoidanceZones)
    console.log(`  🗺️  栅格构建完成: ${costGrid.cols}×${costGrid.rows} = ${costGrid.cols * costGrid.rows} 格`)

    // 多权重搜索 + 路径排斥
    const routes = []
    const { cols: gridCols, rows: gridRows } = costGrid
    // 排斥半径（格子数）：路线间至少偏移此距离
    const repulsionRadius = Math.max(8, Math.round(Math.min(gridCols, gridRows) * 0.03))
    const repulsionStrength = 5.0  // 排斥代价强度
    let penaltyMap = null

    for (let i = 0; i < WEIGHT_PROFILES.length; i++) {
        const profile = WEIGHT_PROFILES[i]
        const pathStart = Date.now()
        const rawPath = astarSearch(costGrid, startPoint, endPoint, profile, penaltyMap)

        if (!rawPath || rawPath.length < 2) {
            console.log(`  ⚠️ ${profile.name}: 未找到路径`)
            continue
        }

        // 简化路径
        const simplifiedPath = simplifyPath(rawPath, gridResolution / 2000)
        console.log(`  🔍 ${profile.name}: ${rawPath.length} → ${simplifiedPath.length} 点, 耗时 ${Date.now() - pathStart}ms`)

        // 构建 ParetoRoute
        const route = _buildParetoRoute(
            `pareto-route-${i + 1}`,
            profile.name,
            simplifiedPath,
            riskConfig
        )
        routes.push(route)

        // 更新排斥惩罚图：在已找到路径周围添加高斯衰减惩罚
        penaltyMap = _buildRepulsionMap(
            costGrid, rawPath, penaltyMap, repulsionRadius, repulsionStrength
        )
    }

    console.log(`  ⏱️  寻路总耗时: ${Date.now() - startTime}ms`)

    return {
        routes,
        gridInfo: {
            cols: costGrid.cols,
            rows: costGrid.rows,
            resolution: gridResolution,
            bbox,
        },
    }
}

/**
 * 多点路径规划（waypoints 按序连接）
 */
export function planMultiPointRoute(params) {
    const {
        waypoints,
        planningRange,
        gridResolution = 1000,
        avoidanceZones = [],
        riskConfig = { highRiskThreshold: 4000, mediumRiskThreshold: 2000 },
    } = params

    if (!waypoints || waypoints.length < 2) {
        throw new Error('多点模式至少需要 2 个航路点')
    }

    // 全局 bbox 覆盖所有航路点
    const allLons = waypoints.map(w => w.lon)
    const allLats = waypoints.map(w => w.lat)
    const padding = 0.5
    const bbox = [
        Math.min(...allLons) - padding,
        Math.min(...allLats) - padding,
        Math.max(...allLons) + padding,
        Math.max(...allLats) + padding,
    ]

    const costGrid = buildCostGrid(bbox, gridResolution, avoidanceZones)
    console.log(`  🗺️  多点栅格: ${costGrid.cols}×${costGrid.rows}`)

    // 用均衡权重逐段搜索
    const balancedWeights = WEIGHT_PROFILES[1]  // balanced
    const allSegments = []
    const allCoords = []
    let totalLength = 0

    for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i]
        const to = waypoints[i + 1]
        const rawPath = astarSearch(costGrid, from, to, balancedWeights)

        if (!rawPath || rawPath.length < 2) {
            // 回退直线
            const segLen = haversineDistance(from.lon, from.lat, to.lon, to.lat)
            const depth = Math.abs(getElevation((from.lon + to.lon) / 2, (from.lat + to.lat) / 2) || 2000)
            allSegments.push(_makeSegment(`seg-${i + 1}`, from, to, segLen, depth, riskConfig))
            if (i === 0) allCoords.push([from.lon, from.lat])
            allCoords.push([to.lon, to.lat])
            totalLength += segLen
            continue
        }

        const simplified = simplifyPath(rawPath, gridResolution / 2000)

        // 将简化路径拆分为分段
        for (let j = 0; j < simplified.length - 1; j++) {
            const p1 = simplified[j]
            const p2 = simplified[j + 1]
            const segLen = haversineDistance(p1.lon, p1.lat, p2.lon, p2.lat)
            const midElev = (p1.elevation + p2.elevation) / 2
            const depth = Math.abs(midElev)
            allSegments.push(_makeSegment(
                `seg-${allSegments.length + 1}`, p1, p2, segLen, depth, riskConfig
            ))
            totalLength += segLen
        }

        // 坐标合并（避免重复中间点）
        const startIdx = allCoords.length === 0 ? 0 : 1
        for (let j = startIdx; j < simplified.length; j++) {
            allCoords.push([simplified[j].lon, simplified[j].lat])
        }
    }

    const avgRisk = allSegments.length > 0
        ? allSegments.reduce((s, seg) => s + (seg.riskLevel === 'high' ? 1 : seg.riskLevel === 'medium' ? 0.5 : 0), 0) / allSegments.length
        : 0.3

    return {
        routes: [{
            id: 'multi-point-route',
            name: '多点规划路由',
            totalLength: Math.round(totalLength),
            totalCost: Math.round(totalLength * 30),
            avgRisk: parseFloat(avgRisk.toFixed(2)),
            segments: allSegments,
            coordinates: allCoords,
        }],
    }
}

// ── 分支网络路径规划（含 BU）──

/**
 * 分支网络路径规划
 * 接受登陆站 + BU（分支器）列表，确定主干/分支拓扑，逐段 A* 寻路
 *
 * @param {Object} params
 * @param {Array}  params.landingStations - [{id, lon, lat, name}]
 * @param {Array}  params.buNodes - [{id, lon, lat, name}]
 * @param {number} [params.gridResolution=1000]
 * @param {Array}  [params.avoidanceZones=[]]
 * @param {Object} [params.riskConfig]
 * @returns {{ routes: [BranchingNetworkRoute] }}
 */
export function planBranchingNetworkRoute(params) {
    const {
        landingStations,
        buNodes,
        gridResolution = 1000,
        avoidanceZones = [],
        riskConfig = { highRiskThreshold: 4000, mediumRiskThreshold: 2000 },
    } = params

    if (!landingStations || landingStations.length < 2) {
        throw new Error('分支网络至少需要 2 个登陆站')
    }
    if (!buNodes || buNodes.length < 1) {
        throw new Error('分支网络至少需要 1 个 BU')
    }

    const startTime = Date.now()
    console.log(`\n🌐 分支网络规划: ${landingStations.length} 登陆站, ${buNodes.length} BU`)

    // 全局 bbox 覆盖所有点
    const allPoints = [...landingStations, ...buNodes]
    const allLons = allPoints.map(p => p.lon)
    const allLats = allPoints.map(p => p.lat)
    const padding = 0.5
    const bbox = [
        Math.min(...allLons) - padding,
        Math.min(...allLats) - padding,
        Math.max(...allLons) + padding,
        Math.max(...allLats) + padding,
    ]

    const costGrid = buildCostGrid(bbox, gridResolution, avoidanceZones)
    console.log(`  🗺️  栅格: ${costGrid.cols}×${costGrid.rows}`)

    // ── 确定拓扑 ──
    const trunkStart = landingStations[0]
    const trunkEnd = landingStations.length > 1
        ? landingStations[landingStations.length - 1]
        : landingStations[0]

    // 收集所有需要 A* 的 leg
    // legs: [{ id, from, to, type: 'trunk'|'branch' }]
    const legs = []

    if (buNodes.length === 1) {
        const bu = buNodes[0]
        // 主干: 首登陆站 → BU → 尾登陆站
        legs.push({ id: 'trunk-1', from: trunkStart, to: bu, type: 'trunk' })
        if (trunkEnd.id !== trunkStart.id) {
            legs.push({ id: 'trunk-2', from: bu, to: trunkEnd, type: 'trunk' })
        }
        // 分支: BU → 其他登陆站
        const branchLandings = landingStations.filter(
            l => l.id !== trunkStart.id && l.id !== trunkEnd.id
        )
        branchLandings.forEach((landing, i) => {
            legs.push({ id: `branch-${i + 1}`, from: bu, to: landing, type: 'branch', buId: bu.id })
        })
    } else {
        // 多 BU: 主干 = 首登陆站 → BU1 → BU2 → ... → 尾登陆站
        const orderedBUs = [...buNodes] // 保持用户输入顺序
        legs.push({ id: 'trunk-1', from: trunkStart, to: orderedBUs[0], type: 'trunk' })
        for (let i = 0; i < orderedBUs.length - 1; i++) {
            legs.push({ id: `trunk-${i + 2}`, from: orderedBUs[i], to: orderedBUs[i + 1], type: 'trunk' })
        }
        if (trunkEnd.id !== trunkStart.id) {
            legs.push({ id: `trunk-${orderedBUs.length + 1}`, from: orderedBUs[orderedBUs.length - 1], to: trunkEnd, type: 'trunk' })
        }

        // 分支: 每个登陆站(非首尾)连接最近 BU
        const branchLandings = landingStations.filter(
            l => l.id !== trunkStart.id && l.id !== trunkEnd.id
        )
        branchLandings.forEach((landing, i) => {
            let nearestBU = orderedBUs[0]
            let minDist = haversineDistance(landing.lon, landing.lat, orderedBUs[0].lon, orderedBUs[0].lat)
            for (const bu of orderedBUs) {
                const d = haversineDistance(landing.lon, landing.lat, bu.lon, bu.lat)
                if (d < minDist) { minDist = d; nearestBU = bu }
            }
            legs.push({ id: `branch-${i + 1}`, from: nearestBU, to: landing, type: 'branch', buId: nearestBU.id })
        })
    }

    // 命名点（去重）—— 所有方案共享同一拓扑
    const namedPoints = []
    const addedPointIds = new Set()
    const addNamedPoint = (p, type) => {
        if (addedPointIds.has(p.id)) return
        addedPointIds.add(p.id)
        namedPoints.push({ id: p.id, type, lon: p.lon, lat: p.lat, name: p.name || '' })
    }
    landingStations.forEach(l => addNamedPoint(l, 'landing'))
    buNodes.forEach(b => addNamedPoint(b, 'branching'))

    // ── 排斥参数 ──
    const { cols: gridCols, rows: gridRows } = costGrid
    const repulsionRadius = Math.max(8, Math.round(Math.min(gridCols, gridRows) * 0.03))
    const repulsionStrength = 5.0
    let penaltyMap = null

    // ── 外层循环 3 套权重 → 3 条 Pareto 分支路线 ──
    const allRoutes = []

    for (let wi = 0; wi < WEIGHT_PROFILES.length; wi++) {
        const profile = WEIGHT_PROFILES[wi]
        const routeStart = Date.now()
        console.log(`  ── ${profile.name} (${profile.id}) ──`)

        const trunkCoords = []
        const trunkSegments = []
        const branches = []
        let totalLength = 0
        let totalCost = 0
        let segGlobalIdx = 0
        const rawPathsForRepulsion = []  // 收集未简化的原始路径，用于排斥

        for (const leg of legs) {
            const legStart = Date.now()
            const rawPath = astarSearch(costGrid, leg.from, leg.to, profile, penaltyMap)

            let legPath
            if (!rawPath || rawPath.length < 2) {
                console.log(`  ⚠️ ${leg.id}: A*未找到路径, 回退直线`)
                legPath = [
                    { lon: leg.from.lon, lat: leg.from.lat, elevation: getElevation(leg.from.lon, leg.from.lat) || -2000 },
                    { lon: leg.to.lon, lat: leg.to.lat, elevation: getElevation(leg.to.lon, leg.to.lat) || -2000 },
                ]
            } else {
                legPath = simplifyPath(rawPath, gridResolution / 2000)
                rawPathsForRepulsion.push(rawPath)
            }

            // ★ 关键修复：将首尾端点替换为原始精确坐标（消除栅格吸附偏差）
            if (legPath.length > 0) {
                legPath[0] = { ...legPath[0], lon: leg.from.lon, lat: leg.from.lat }
                legPath[legPath.length - 1] = { ...legPath[legPath.length - 1], lon: leg.to.lon, lat: leg.to.lat }
            }

            console.log(`  🔍 ${leg.id} (${leg.type}): ${legPath.length} 点, ${Date.now() - legStart}ms`)

            // 构建 segments
            const legSegments = []
            let legLength = 0
            for (let j = 0; j < legPath.length - 1; j++) {
                const p1 = legPath[j]
                const p2 = legPath[j + 1]
                const segLen = haversineDistance(p1.lon, p1.lat, p2.lon, p2.lat)
                const midDepth = Math.abs((p1.elevation + p2.elevation) / 2)
                const segId = `${leg.type}-seg-${++segGlobalIdx}`
                legSegments.push(_makeSegment(segId, p1, p2, segLen, midDepth, riskConfig))
                legLength += segLen
            }
            totalLength += legLength
            totalCost += Math.round(legLength * 30)

            const legCoords = legPath.map(p => [p.lon, p.lat])

            if (leg.type === 'trunk') {
                const startIdx = trunkCoords.length === 0 ? 0 : 1
                for (let j = startIdx; j < legCoords.length; j++) {
                    trunkCoords.push(legCoords[j])
                }
                trunkSegments.push(...legSegments)
            } else {
                branches.push({
                    fromBuId: leg.buId,
                    toLandingId: leg.to.id,
                    toLandingName: leg.to.name || '',
                    coordinates: legCoords,
                    segments: legSegments,
                    totalLength: Math.round(legLength),
                })
            }
        }

        // 累积排斥惩罚（让下一轮搜索走不同走廊）
        for (const rawPath of rawPathsForRepulsion) {
            penaltyMap = _buildRepulsionMap(costGrid, rawPath, penaltyMap, repulsionRadius, repulsionStrength)
        }

        const allSegments = [...trunkSegments]
        branches.forEach(b => allSegments.push(...b.segments))

        const avgRisk = allSegments.length > 0
            ? allSegments.reduce((s, seg) => s + (seg.riskLevel === 'high' ? 1 : seg.riskLevel === 'medium' ? 0.5 : 0), 0) / allSegments.length
            : 0.3

        console.log(`  ✅ ${profile.name}: ${Math.round(totalLength)}km, ${branches.length} 分支, ${Date.now() - routeStart}ms`)

        allRoutes.push({
            id: `branching-route-${wi + 1}`,
            name: profile.name,
            totalLength: Math.round(totalLength),
            totalCost: Math.round(totalCost * (1 + avgRisk * 0.5)),
            avgRisk: parseFloat(avgRisk.toFixed(2)),
            segments: allSegments,
            coordinates: trunkCoords,
            points: namedPoints,
            branches,
        })
    }

    console.log(`  ⏱️  分支网络规划完成: ${allRoutes.length} 条方案, 耗时 ${Date.now() - startTime}ms`)

    return { routes: allRoutes }
}

// ── 路径排斥图 ──

/**
 * 构建/累加排斥惩罚图
 * 在已找到的路径周围添加高斯衰减惩罚，迫使后续搜索走不同走廊
 */
function _buildRepulsionMap(costGrid, rawPath, existingMap, radius, strength) {
    const { cols, rows, lonStep, latStep, bbox } = costGrid
    const [minLon, minLat] = bbox
    const totalCells = rows * cols

    // 初始化或复用已有的惩罚图
    const map = existingMap ? new Float32Array(existingMap) : new Float32Array(totalCells)

    // 将路径点映射到栅格坐标，每隔几个点采样一次以提高性能
    const step = Math.max(1, Math.floor(rawPath.length / 200))  // 最多 200 个采样点
    const pathCells = []
    for (let i = 0; i < rawPath.length; i += step) {
        const p = rawPath[i]
        const c = Math.round((p.lon - minLon) / lonStep)
        const r = Math.round((p.lat - minLat) / latStep)
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
            pathCells.push({ r, c })
        }
    }
    // 确保终点包含
    const lastP = rawPath[rawPath.length - 1]
    const lastC = Math.round((lastP.lon - minLon) / lonStep)
    const lastR = Math.round((lastP.lat - minLat) / latStep)
    if (lastR >= 0 && lastR < rows && lastC >= 0 && lastC < cols) {
        pathCells.push({ r: lastR, c: lastC })
    }

    // 对每个路径采样点，在半径内添加高斯衰减惩罚
    const r2 = radius * radius
    for (const { r: pr, c: pc } of pathCells) {
        const rMin = Math.max(0, pr - radius)
        const rMax = Math.min(rows - 1, pr + radius)
        const cMin = Math.max(0, pc - radius)
        const cMax = Math.min(cols - 1, pc + radius)

        for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
                const dr = r - pr
                const dc = c - pc
                const dist2 = dr * dr + dc * dc
                if (dist2 <= r2) {
                    // 高斯衰减: 路径上最强，距离越远越弱
                    const penalty = strength * Math.exp(-3 * dist2 / r2)
                    const idx = r * cols + c
                    map[idx] = Math.max(map[idx], penalty)  // 取最大值避免重复累加
                }
            }
        }
    }

    return map
}

// ── 辅助函数 ──

function _computeBbox(startPoint, endPoint, planningRange) {
    if (planningRange) {
        return [
            planningRange.northwest.lon,
            planningRange.southeast.lat,
            planningRange.southeast.lon,
            planningRange.northwest.lat,
        ]
    }
    // 自动扩展起终点 bbox（各方向扩展 20%）
    const lonMin = Math.min(startPoint.lon, endPoint.lon)
    const lonMax = Math.max(startPoint.lon, endPoint.lon)
    const latMin = Math.min(startPoint.lat, endPoint.lat)
    const latMax = Math.max(startPoint.lat, endPoint.lat)
    const lonPad = Math.max((lonMax - lonMin) * 0.2, 0.5)
    const latPad = Math.max((latMax - latMin) * 0.2, 0.5)
    return [lonMin - lonPad, latMin - latPad, lonMax + lonPad, latMax + latPad]
}

function _buildParetoRoute(id, name, path, riskConfig) {
    const segments = []
    let totalLength = 0
    let riskSum = 0

    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i]
        const p2 = path[i + 1]
        const segLen = haversineDistance(p1.lon, p1.lat, p2.lon, p2.lat)
        totalLength += segLen

        const midDepth = Math.abs((p1.elevation + p2.elevation) / 2)
        const seg = _makeSegment(`${id}-seg-${i + 1}`, p1, p2, segLen, midDepth, riskConfig)
        segments.push(seg)
        riskSum += seg.riskLevel === 'high' ? 1 : seg.riskLevel === 'medium' ? 0.5 : 0
    }

    const avgRisk = segments.length > 0 ? riskSum / segments.length : 0

    return {
        id,
        name,
        totalLength: Math.round(totalLength),
        totalCost: Math.round(totalLength * 30 * (1 + avgRisk * 0.5)),
        avgRisk: parseFloat(avgRisk.toFixed(2)),
        segments,
        coordinates: path.map(p => [p.lon, p.lat]),
    }
}

// ── 放大器沿路由落位 ──

/**
 * 沿路由路径精确放置放大器
 * 后端拥有完整的 A* 路径坐标，可精确沿缆路插值
 *
 * @param {Object} params
 * @param {Array}  params.trunkCoordinates - 主干路径坐标 [[lon,lat], ...]
 * @param {Array}  [params.branches] - 分支路径 [{fromBuId, toLandingName, coordinates}]
 * @param {Array}  [params.namedPoints] - 命名点 [{id, type, lon, lat, name}]
 * @param {number} params.spanLength - 放大器间距 (km)
 * @param {Array}  [params.amplifierKPs] - 仿真生成的放大器 KP 列表（优先使用）
 * @returns {{ amplifiers: Array, fibers: Array }}
 */
export function placeAmplifiersOnRoute(params) {
    const {
        trunkCoordinates = [],
        branches = [],
        namedPoints = [],
        spanLength = 80,
        amplifierKPs = null,
    } = params

    console.log(`\n📍 放大器落位: 主干 ${trunkCoordinates.length} 点, ${branches.length} 分支, 间距 ${spanLength}km`)

    const result = { amplifiers: [], fibers: [] }

    // ── 辅助：沿坐标序列计算累积距离 ──
    const buildCumulativeDistances = (coords) => {
        const dists = [0]
        for (let i = 1; i < coords.length; i++) {
            const d = haversineDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
            dists.push(dists[i - 1] + d)
        }
        return dists
    }

    // ── 辅助：在坐标序列上按 KP 插值得到精确经纬度 ──
    const interpolateAtKP = (coords, cumDists, targetKP) => {
        const totalLen = cumDists[cumDists.length - 1]
        if (targetKP <= 0) return { lon: coords[0][0], lat: coords[0][1] }
        if (targetKP >= totalLen) return { lon: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] }
        for (let i = 0; i < cumDists.length - 1; i++) {
            if (cumDists[i + 1] >= targetKP) {
                const segLen = cumDists[i + 1] - cumDists[i]
                const ratio = segLen > 0 ? (targetKP - cumDists[i]) / segLen : 0
                return {
                    lon: coords[i][0] + (coords[i + 1][0] - coords[i][0]) * ratio,
                    lat: coords[i][1] + (coords[i + 1][1] - coords[i][1]) * ratio,
                }
            }
        }
        return { lon: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] }
    }

    // ── 沿坐标序列按间距放置放大器 ──
    const placeAlongPath = (coords, cumDists, kpOffset, ampPrefix, isBranch, branchInfo) => {
        const totalLen = cumDists[cumDists.length - 1]
        const amps = []
        const fibs = []

        if (amplifierKPs && !isBranch) {
            // 使用仿真提供的 KP 列表（仅主干）
            for (let i = 0; i < amplifierKPs.length; i++) {
                const kp = amplifierKPs[i].position ?? amplifierKPs[i]
                const pos = interpolateAtKP(coords, cumDists, kp)
                amps.push({
                    name: amplifierKPs[i].name || `${ampPrefix}-${String(i + 1).padStart(2, '0')}`,
                    kp: Math.round(kp * 10) / 10,
                    longitude: pos.lon,
                    latitude: pos.lat,
                    gain: amplifierKPs[i].gain || 0,
                    noiseFigure: amplifierKPs[i].noiseFigure || 0,
                    precedingSpan: amplifierKPs[i].precedingSpan || 0,
                    isBranch: false,
                })
            }
        } else {
            // 按等间距放置
            if (totalLen < spanLength) {
                // 路径太短，不放放大器
            } else {
                const count = Math.floor(totalLen / spanLength)
                for (let j = 1; j <= count; j++) {
                    const targetKm = j * spanLength
                    if (targetKm >= totalLen) break
                    const pos = interpolateAtKP(coords, cumDists, targetKm)
                    amps.push({
                        name: `${ampPrefix}-${String(j).padStart(2, '0')}`,
                        kp: Math.round((kpOffset + targetKm) * 10) / 10,
                        longitude: pos.lon,
                        latitude: pos.lat,
                        gain: 0,
                        noiseFigure: 0,
                        precedingSpan: spanLength,
                        isBranch,
                        branchInfo: branchInfo || null,
                    })
                }
            }
        }

        // 生成光纤段（使用描述性命名：光纤段 Tx-AMP-01, 光纤段 AMP-01-AMP-02, 光纤段 AMP-25-Rx）
        const allKPs = [0, ...amps.map(a => a.kp - kpOffset), totalLen]
        // 构建节点名列表：Tx → AMP-01 → AMP-02 → ... → Rx
        const nodeNames = ['Tx', ...amps.map(a => a.name), 'Rx']
        for (let i = 0; i < allKPs.length - 1; i++) {
            const startKP = allKPs[i]
            const endKP = allKPs[i + 1]
            const startPos = interpolateAtKP(coords, cumDists, startKP)
            const fromName = nodeNames[i] || `N${i}`
            const toName = nodeNames[i + 1] || `N${i + 1}`
            fibs.push({
                name: `光纤段 ${fromName}-${toName}`,
                kp: Math.round((kpOffset + startKP) * 10) / 10,
                endKp: Math.round((kpOffset + endKP) * 10) / 10,
                longitude: startPos.lon,
                latitude: startPos.lat,
                length: Math.round(endKP - startKP),
                isBranch,
            })
        }

        return { amps, fibs }
    }

    // ── 1) 主干落位 ──
    if (trunkCoordinates.length >= 2) {
        const trunkDists = buildCumulativeDistances(trunkCoordinates)
        const trunkLen = trunkDists[trunkDists.length - 1]
        console.log(`  📏 主干总长: ${Math.round(trunkLen)}km`)

        const { amps, fibs } = placeAlongPath(
            trunkCoordinates, trunkDists, 0, 'AMP', false, null
        )
        result.amplifiers.push(...amps)
        result.fibers.push(...fibs)
        console.log(`  🔧 主干放大器: ${amps.length} 个`)
    }

    // ── 2) 分支落位 ──
    let branchAmpGlobalIdx = result.amplifiers.length
    console.log(`  🌿 分支数据: ${branches.length} 个分支`)
    for (let bi = 0; bi < branches.length; bi++) {
        const branch = branches[bi]
        const branchCoords = branch.coordinates || []
        console.log(`  🌿 分支[${bi}]: ${branch.fromBuId} → ${branch.toLandingName}, ${branchCoords.length} 点`)
        if (branchCoords.length < 2) {
            console.log(`    ⚠️ 跳过: 坐标点不足`)
            continue
        }
        // 打印前后几个坐标点以确认格式
        console.log(`    首点: [${branchCoords[0]}], 尾点: [${branchCoords[branchCoords.length - 1]}]`)

        const branchDists = buildCumulativeDistances(branchCoords)
        const branchLen = branchDists[branchDists.length - 1]
        console.log(`    总长: ${Math.round(branchLen)}km, spanLength: ${spanLength}km`)
        if (branchLen < spanLength) {
            console.log(`    ⚠️ 跳过: 路径太短 (${Math.round(branchLen)}km < ${spanLength}km)`)
            continue
        }

        // 找到 BU 在主干上的 KP 作为分支起始偏移
        let buKpOffset = 0
        if (trunkCoordinates.length >= 2 && branch.fromBuId) {
            const buPt = namedPoints.find(p => p.id === branch.fromBuId)
            if (buPt) {
                const trunkDists2 = buildCumulativeDistances(trunkCoordinates)
                // 找主干上离 BU 最近的点
                let bestDist = Infinity
                let bestKp = 0
                for (let i = 0; i < trunkCoordinates.length; i++) {
                    const d = haversineDistance(buPt.lon, buPt.lat, trunkCoordinates[i][0], trunkCoordinates[i][1])
                    if (d < bestDist) { bestDist = d; bestKp = trunkDists2[i] }
                }
                buKpOffset = bestKp
            }
        }

        branchAmpGlobalIdx++
        const prefix = `B-AMP${branchAmpGlobalIdx > 100 ? '' : '-'}${branchAmpGlobalIdx}`
        const branchInfo = `${branch.fromBuId || 'BU'} → ${branch.toLandingName || '登陆站'}`

        const { amps, fibs } = placeAlongPath(
            branchCoords, branchDists, buKpOffset, `BAMP`, true, branchInfo
        )
        // 重命名
        amps.forEach((a, i) => {
            a.name = `AMP-${String(result.amplifiers.length + i + 1).padStart(2, '0')}`
            a.branchInfo = branchInfo
        })
        result.amplifiers.push(...amps)
        result.fibers.push(...fibs)
        console.log(`  🔧 分支 ${branchInfo}: ${amps.length} 个放大器, ${Math.round(branchLen)}km`)
    }

    console.log(`  ✅ 落位完成: 共 ${result.amplifiers.length} 个放大器, ${result.fibers.length} 段光纤`)
    return result
}

function _makeSegment(id, p1, p2, length, depth, riskConfig) {
    const { highRiskThreshold = 4000, mediumRiskThreshold = 2000 } = riskConfig || {}
    let riskLevel = 'low'
    if (depth > highRiskThreshold) riskLevel = 'high'
    else if (depth > mediumRiskThreshold) riskLevel = 'medium'

    let cableType = 'LW'  // 轻型
    if (depth < 200) cableType = 'DA'       // 浅水双铠装
    else if (depth < 1000) cableType = 'SA'  // 单铠装
    else cableType = 'LW'                    // 轻型

    return {
        id,
        startPoint: { lon: p1.lon, lat: p1.lat },
        endPoint: { lon: p2.lon, lat: p2.lat },
        length: Math.round(length),
        depth: Math.round(depth),
        riskLevel,
        cableType,
    }
}
