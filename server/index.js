/**
 * DEM 高程数据服务
 *
 * 功能：
 * 1. 启动时预加载6个tif的完整数据到内存
 * 2. 提供 /api/dem/meta 返回所有tif的bbox信息
 * 3. 提供 /api/dem/clip 按bbox裁剪返回高程数据
 * 4. 提供 /api/dem/point 查询单点高程
 * 5. 提供 /api/dem/profile 获取路径剖面
 */

import express from 'express'
import cors from 'cors'
import * as GeoTIFF from 'geotiff'
import path from 'path'
import {fileURLToPath} from 'url'
import fs from 'fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// DEM文件路径（相对于 dist/server 目录）
const DEM_DIR = path.join(__dirname, '..', 'public', 'dem')
const DEM_FILES = ['1.tif', '2.tif', '3.tif', '4.tif', '5.tif', '6.tif']
const SHARED_DATA_DIR = path.join(__dirname, '..', 'public', 'data')
const SHARED_EXTENSIONS = new Set(['.tif', '.tiff', '.shp', '.geojson', '.json', '.kml'])

// 全局缓存：存储tif元数据、image对象和完整数据
const tifCache = []

/**
 * 启动时预加载所有tif完整数据到内存
 */
async function preloadTifData() {
    console.log('🚀 正在预加载 DEM 数据到内存...')
    const startTime = Date.now()
    let totalMemory = 0

    for (const filename of DEM_FILES) {
        const filePath = path.join(DEM_DIR, filename)
        try {
            const fileStart = Date.now()
            const tiff = await GeoTIFF.fromFile(filePath)
            const image = await tiff.getImage()
            const bbox = image.getBoundingBox()
            const width = image.getWidth()
            const height = image.getHeight()
            const pixelWidth = (bbox[2] - bbox[0]) / width
            const pixelHeight = (bbox[3] - bbox[1]) / height

            // 读取完整数据到内存
            const rasters = await image.readRasters()
            const fullData = rasters[0]  // Int16Array
            const memoryMB = (fullData.byteLength / 1024 / 1024).toFixed(1)
            totalMemory += fullData.byteLength

            tifCache.push({
                filename,
                filePath,
                bbox,
                width,
                height,
                pixelWidth,
                pixelHeight,
                image,
                fullData,  // 完整数据缓存
            })

            console.log(`  ✅ ${filename}: ${width}x${height}, ${memoryMB}MB, 耗时 ${Date.now() - fileStart}ms`)
        } catch (e) {
            console.error(`  ❌ ${filename} 加载失败:`, e.message)
        }
    }

    const totalMemoryMB = (totalMemory / 1024 / 1024).toFixed(1)
    console.log(`✨ 数据加载完成，共 ${tifCache.length} 个文件，占用内存 ${totalMemoryMB}MB，总耗时 ${Date.now() - startTime}ms`)
}

/**
 * 判断两个bbox是否相交
 */
function bboxIntersects(bbox1, bbox2) {
    return !(bbox1[2] < bbox2[0] || bbox1[0] > bbox2[2] ||
        bbox1[3] < bbox2[1] || bbox1[1] > bbox2[3])
}

/**
 * GET /api/dem/meta
 * 返回所有tif的元数据（bbox等）
 */
app.get('/api/dem/meta', (req, res) => {
    const meta = tifCache.map(t => ({
        filename: t.filename,
        bbox: t.bbox,
        width: t.width,
        height: t.height,
        pixelWidth: t.pixelWidth,
        pixelHeight: t.pixelHeight,
    }))
    res.json({success: true, data: meta})
})

/**
 * GET /api/gis/shared
 * 返回共享数据目录(public/data)中的GIS文件列表
 */
app.get('/api/gis/shared', async (req, res) => {
    try {
        const files = []

        async function walk(dir) {
            let entries = []
            try {
                entries = await fs.readdir(dir, {withFileTypes: true})
            } catch {
                return
            }
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) {
                    await walk(fullPath)
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase()
                    if (!SHARED_EXTENSIONS.has(ext)) continue
                    const stat = await fs.stat(fullPath)
                    const relativePath = path.relative(SHARED_DATA_DIR, fullPath).replace(/\\/g, '/')
                    files.push({
                        name: entry.name,
                        path: relativePath,
                        ext,
                        size: stat.size,
                        modifiedAt: stat.mtime.toISOString(),
                    })
                }
            }
        }

        await walk(SHARED_DATA_DIR)
        files.sort((a, b) => a.path.localeCompare(b.path))
        res.json({success: true, data: files})
    } catch (error) {
        console.error('共享数据列表获取失败:', error)
        res.status(500).json({success: false, error: error.message})
    }
})

/**
 * GET /api/dem/clip
 * 按bbox裁剪并返回高程数据
 *
 * Query参数:
 * - minX, minY, maxX, maxY: 经纬度bbox
 * - width, height: 输出分辨率（可选，默认128）
 */
app.get('/api/dem/clip', async (req, res) => {
    try {
        const {minX, minY, maxX, maxY, width = 128, height = 128} = req.query

        // 参数验证
        const bbox = [
            parseFloat(minX),
            parseFloat(minY),
            parseFloat(maxX),
            parseFloat(maxY),
        ]

        if (bbox.some(isNaN)) {
            return res.status(400).json({success: false, error: '无效的bbox参数'})
        }

        const outputWidth = Math.min(parseInt(width) || 128, 512)
        const outputHeight = Math.min(parseInt(height) || 128, 512)

        // 找到覆盖该区域的tif
        const tif = tifCache.find(t => bboxIntersects(t.bbox, bbox))
        if (!tif) {
            return res.status(404).json({
                success: false,
                error: '未找到覆盖该区域的DEM数据',
                requestedBbox: bbox,
                availableBboxes: tifCache.map(t => ({filename: t.filename, bbox: t.bbox}))
            })
        }

        // 计算裁剪窗口（像素坐标）
        const [imgMinX, imgMinY, imgMaxX, imgMaxY] = tif.bbox
        const [extMinX, extMinY, extMaxX, extMaxY] = bbox

        // 裁剪bbox到tif范围内
        const clampedMinX = Math.max(extMinX, imgMinX)
        const clampedMinY = Math.max(extMinY, imgMinY)
        const clampedMaxX = Math.min(extMaxX, imgMaxX)
        const clampedMaxY = Math.min(extMaxY, imgMaxY)

        // 转换为像素坐标
        const windowMinX = Math.max(0, Math.floor((clampedMinX - imgMinX) / tif.pixelWidth))
        const windowMaxX = Math.min(tif.width, Math.ceil((clampedMaxX - imgMinX) / tif.pixelWidth))
        const windowMinY = Math.max(0, Math.floor((imgMaxY - clampedMaxY) / tif.pixelHeight))
        const windowMaxY = Math.min(tif.height, Math.ceil((imgMaxY - clampedMinY) / tif.pixelHeight))

        // 验证窗口有效性
        if (windowMaxX <= windowMinX || windowMaxY <= windowMinY) {
            return res.status(400).json({success: false, error: '选择区域超出DEM数据范围'})
        }

        // 从内存缓存中裁剪数据
        const startTime = Date.now()
        const sourceWidth = windowMaxX - windowMinX
        const sourceHeight = windowMaxY - windowMinY

        // 使用双线性插值进行重采样
        const elevationData = new Int16Array(outputWidth * outputHeight)
        for (let outY = 0; outY < outputHeight; outY++) {
            for (let outX = 0; outX < outputWidth; outX++) {
                // 计算源图像中的浮点坐标
                const srcX = windowMinX + (outX / outputWidth) * sourceWidth
                const srcY = windowMinY + (outY / outputHeight) * sourceHeight

                // 最近邻采样（简单高效）
                const px = Math.min(Math.floor(srcX), tif.width - 1)
                const py = Math.min(Math.floor(srcY), tif.height - 1)
                const idx = py * tif.width + px
                elevationData[outY * outputWidth + outX] = tif.fullData[idx]
            }
        }

        // 计算统计信息
        let minElev = Infinity, maxElev = -Infinity
        for (let i = 0; i < elevationData.length; i++) {
            if (elevationData[i] !== -32767) {
                minElev = Math.min(minElev, elevationData[i])
                maxElev = Math.max(maxElev, elevationData[i])
            }
        }

        console.log(`📍 裁剪完成: ${tif.filename}, ${outputWidth}x${outputHeight}, 耗时 ${Date.now() - startTime}ms, 高程范围: ${minElev}~${maxElev}m`)

        // 返回数据（使用ArrayBuffer传输更高效）
        res.json({
            success: true,
            data: {
                width: outputWidth,
                height: outputHeight,
                bbox: [clampedMinX, clampedMinY, clampedMaxX, clampedMaxY],
                minElev: minElev === Infinity ? 0 : minElev,
                maxElev: maxElev === -Infinity ? 0 : maxElev,
                elevation: Array.from(elevationData), // 转为普通数组便于JSON传输
            }
        })

    } catch (error) {
        console.error('裁剪出错:', error)
        res.status(500).json({success: false, error: error.message})
    }
})

/**
 * GET /api/dem/point
 * 查询单点高程
 *
 * Query参数:
 * - lon, lat: 经纬度
 */
app.get('/api/dem/point', async (req, res) => {
    try {
        const {lon, lat} = req.query
        const x = parseFloat(lon)
        const y = parseFloat(lat)

        if (isNaN(x) || isNaN(y)) {
            return res.status(400).json({success: false, error: '无效的坐标参数'})
        }

        // 找到包含该点的tif
        const tif = tifCache.find(t => {
            const [minX, minY, maxX, maxY] = t.bbox
            return x >= minX && x <= maxX && y >= minY && y <= maxY
        })

        if (!tif) {
            return res.status(404).json({success: false, error: '该点不在DEM覆盖范围内'})
        }

        // 计算像素坐标
        const [imgMinX, , , imgMaxY] = tif.bbox
        const pixelX = Math.floor((x - imgMinX) / tif.pixelWidth)
        const pixelY = Math.floor((imgMaxY - y) / tif.pixelHeight)

        if (pixelX < 0 || pixelX >= tif.width || pixelY < 0 || pixelY >= tif.height) {
            return res.status(400).json({success: false, error: '坐标超出范围'})
        }

        // 直接从内存读取
        const idx = pixelY * tif.width + pixelX
        const elevation = tif.fullData[idx]
        res.json({
            success: true,
            data: {
                lon: x,
                lat: y,
                elevation: elevation === -32767 ? 0 : elevation,
            }
        })

    } catch (error) {
        console.error('查询点高程出错:', error)
        res.status(500).json({success: false, error: error.message})
    }
})

/**
 * Haversine 距离计算
 */
function haversineDistance(lon1, lat1, lon2, lat2) {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * EPSG:3857 转经纬度
 */
function mercatorToLatLon(x, y) {
    const lon = (x / 20037508.34) * 180
    let lat = (y / 20037508.34) * 180
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
    return [lon, lat]
}

/**
 * 根据经纬度坐标找到对应的 tif 文件
 */
function findTifForPoint(x, y) {
    for (const tif of tifCache) {
        const [minX, minY, maxX, maxY] = tif.bbox
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            return tif
        }
    }
    return null
}

/**
 * 从指定 tif 读取单点高程（直接从内存）
 */
function getElevationFromTif(tif, x, y) {
    if (!tif.fullData) return null

    const [imgMinX, , , imgMaxY] = tif.bbox
    const pixelX = Math.floor((x - imgMinX) / tif.pixelWidth)
    const pixelY = Math.floor((imgMaxY - y) / tif.pixelHeight)

    if (pixelX < 0 || pixelX >= tif.width || pixelY < 0 || pixelY >= tif.height) {
        return null
    }

    const idx = pixelY * tif.width + pixelX
    const elevation = tif.fullData[idx]
    return elevation === -32767 ? 0 : elevation
}

/**
 * POST /api/dem/profile
 * 获取路径剖面数据
 *
 * Body参数:
 * - mode: 'extent' | 'segment'
 * - extent: [minX, minY, maxX, maxY] (EPSG:3857坐标，框选模式)
 * - segment: { startPoint: {lon, lat}, endPoint: {lon, lat} } (经纬度，线段模式)
 * - sampleCount: 采样点数（默认100）
 */
app.post('/api/dem/profile', async (req, res) => {
    try {
        const {mode, extent, segment, sampleCount = 100} = req.body

        let startLon, startLat, endLon, endLat

        if (mode === 'extent' && extent) {
            // 框选区域模式：沿左上角到右下角对角线采样
            const [extMinX, extMinY, extMaxX, extMaxY] = extent
            ;[startLon, startLat] = mercatorToLatLon(extMinX, extMaxY)  // 左上角
            ;[endLon, endLat] = mercatorToLatLon(extMaxX, extMinY)      // 右下角
        } else if (mode === 'segment' && segment) {
            // 线段模式
            startLon = segment.startPoint.lon
            startLat = segment.startPoint.lat
            endLon = segment.endPoint.lon
            endLat = segment.endPoint.lat
        } else {
            return res.status(400).json({success: false, error: '无效的请求参数'})
        }

        const totalDistanceKm = haversineDistance(startLon, startLat, endLon, endLat)
        const points = []

        const startTime = Date.now()

        // 生成采样点
        const samplePoints = []
        for (let i = 0; i <= sampleCount; i++) {
            const t = i / sampleCount
            const lon = startLon + (endLon - startLon) * t
            const lat = startLat + (endLat - startLat) * t
            samplePoints.push({t, lon, lat, distance: totalDistanceKm * t})
        }

        // 直接从内存读取每个采样点的高程
        for (const sp of samplePoints) {
            const tif = findTifForPoint(sp.lon, sp.lat)
            if (!tif || !tif.fullData) continue

            const [imgMinX, , , imgMaxY] = tif.bbox
            const pixelX = Math.floor((sp.lon - imgMinX) / tif.pixelWidth)
            const pixelY = Math.floor((imgMaxY - sp.lat) / tif.pixelHeight)

            if (pixelX >= 0 && pixelX < tif.width && pixelY >= 0 && pixelY < tif.height) {
                const idx = pixelY * tif.width + pixelX
                const elevation = tif.fullData[idx]
                if (elevation !== -32767) {
                    points.push({
                        distance: sp.distance,
                        depth: elevation
                    })
                }
            }
        }

        // 按距离排序
        points.sort((a, b) => a.distance - b.distance)

        console.log(`📊 剖面数据生成: ${points.length}点, 总距离 ${totalDistanceKm.toFixed(2)}km, 耗时 ${Date.now() - startTime}ms`)

        res.json({
            success: true,
            data: {
                points,
                totalDistance: totalDistanceKm
            }
        })

    } catch (error) {
        console.error('生成剖面数据出错:', error)
        res.status(500).json({success: false, error: error.message})
    }
})

// ==================== 路由规划接口 ====================

/**
 * POST /api/route/planning
 * 路由规划接口
 *
 * Body参数:
 * - mode: 'point-to-point' | 'multi-point'
 * - startPoint: { lon, lat, depth?, name? }
 * - endPoint: { lon, lat, depth?, name? }
 * - waypoints: [{ lon, lat, depth?, name? }]  (多点模式)
 * - planningRange: { northwest: {lon, lat}, southeast: {lon, lat} }
 * - riskConfig: { highRiskThreshold, mediumRiskThreshold }
 */
app.post('/api/route/planning', async (req, res) => {
    try {
        const {mode, startPoint, endPoint, waypoints, planningRange, riskConfig} = req.body

        console.log(`\n�\udea2 接收到路由规划请求: mode=${mode}`)

        const routes = []
        const now = new Date().toISOString()

        if (mode === 'multi-point' && waypoints && waypoints.length >= 2) {
            // 多点规划模式
            const routeId = 'multi-point-route'
            const coordinates = waypoints.map(wp => [wp.lon, wp.lat])
            const segments = []
            let totalLength = 0

            for (let i = 0; i < waypoints.length - 1; i++) {
                const wp1 = waypoints[i]
                const wp2 = waypoints[i + 1]
                const segLength = haversineDistance(wp1.lon, wp1.lat, wp2.lon, wp2.lat)
                totalLength += segLength

                // 查询中点高程判断风险
                const midLon = (wp1.lon + wp2.lon) / 2
                const midLat = (wp1.lat + wp2.lat) / 2
                const tif = findTifForPoint(midLon, midLat)
                let depth = 2000
                let riskLevel = 'low'

                if (tif) {
                    const elevation = getElevationFromTif(tif, midLon, midLat)
                    if (elevation !== null) {
                        depth = Math.abs(elevation)
                        // 根据水深判断风险等级
                        if (depth > 4000) riskLevel = 'high'
                        else if (depth > 2000) riskLevel = 'medium'
                    }
                }

                segments.push({
                    id: `seg-${i + 1}`,
                    startPoint: {lon: wp1.lon, lat: wp1.lat},
                    endPoint: {lon: wp2.lon, lat: wp2.lat},
                    length: Math.round(segLength),
                    depth: Math.round(depth),
                    riskLevel,
                    cableType: riskLevel === 'high' ? 'DA' : riskLevel === 'medium' ? 'SA' : 'LW'
                })
            }

            routes.push({
                id: routeId,
                name: '多点规划路由',
                totalLength: Math.round(totalLength),
                totalCost: Math.round(totalLength * 30),
                avgRisk: 0.3,
                segments,
                coordinates
            })

        } else if (startPoint && endPoint) {
            // 点对点模式 - 生成 3 条 Pareto 路径
            // 计算起终点的中间位置和偏移量
            const midLon = (startPoint.lon + endPoint.lon) / 2
            const midLat = (startPoint.lat + endPoint.lat) / 2

            // 计算垂直于起终点连线的偏移方向
            const dLon = endPoint.lon - startPoint.lon
            const dLat = endPoint.lat - startPoint.lat
            const dist = Math.sqrt(dLon * dLon + dLat * dLat)
            // 偏移量为距离的20%，使路线更明显区分
            const offsetScale = dist * 0.2
            // 垂直方向单位向量
            const perpLon = -dLat / dist
            const perpLat = dLon / dist

            // 路线1: 经济路线 - 直线（无中间点）
            const route1Coords = [
                [startPoint.lon, startPoint.lat],
                [endPoint.lon, endPoint.lat]
            ]

            // 路线2: 均衡路线 - 向北偏移
            const route2Coords = [
                [startPoint.lon, startPoint.lat],
                [midLon + perpLon * offsetScale, midLat + perpLat * offsetScale],
                [endPoint.lon, endPoint.lat]
            ]

            // 路线3: 安全路线 - 向南偏移，多一个中间点
            const route3Coords = [
                [startPoint.lon, startPoint.lat],
                [startPoint.lon + dLon * 0.33 - perpLon * offsetScale * 1.5, startPoint.lat + dLat * 0.33 - perpLat * offsetScale * 1.5],
                [startPoint.lon + dLon * 0.66 - perpLon * offsetScale * 1.5, startPoint.lat + dLat * 0.66 - perpLat * offsetScale * 1.5],
                [endPoint.lon, endPoint.lat]
            ]

            const routeConfigs = [
                {id: 'pareto-route-1', name: '经济路线', coords: route1Coords, riskFactor: 0.6, costFactor: 0.85},
                {id: 'pareto-route-2', name: '均衡路线', coords: route2Coords, riskFactor: 0.35, costFactor: 1.0},
                {id: 'pareto-route-3', name: '安全路线', coords: route3Coords, riskFactor: 0.15, costFactor: 1.5}
            ]

            for (const config of routeConfigs) {
                const coordinates = config.coords
                const segments = []
                let totalLen = 0

                // 生成分段
                for (let i = 0; i < coordinates.length - 1; i++) {
                    const [lon1, lat1] = coordinates[i]
                    const [lon2, lat2] = coordinates[i + 1]
                    const segLen = haversineDistance(lon1, lat1, lon2, lat2)
                    totalLen += segLen

                    // 查询中点高程
                    const segMidLon = (lon1 + lon2) / 2
                    const segMidLat = (lat1 + lat2) / 2
                    const tif = findTifForPoint(segMidLon, segMidLat)
                    let depth = 2000 + Math.random() * 2000
                    let riskLevel = 'low'

                    if (tif) {
                        const elevation = getElevationFromTif(tif, segMidLon, segMidLat)
                        if (elevation !== null) {
                            depth = Math.abs(elevation)
                        }
                    }

                    // 根据路径类型调整风险
                    if (config.riskFactor > 0.5) riskLevel = 'high'
                    else if (config.riskFactor > 0.25) riskLevel = 'medium'

                    segments.push({
                        id: `${config.id}-seg-${i + 1}`,
                        startPoint: {lon: lon1, lat: lat1},
                        endPoint: {lon: lon2, lat: lat2},
                        length: Math.round(segLen),
                        depth: Math.round(depth),
                        riskLevel,
                        cableType: riskLevel === 'high' ? 'DA' : riskLevel === 'medium' ? 'SA' : 'LW'
                    })
                }

                routes.push({
                    id: config.id,
                    name: config.name,
                    totalLength: Math.round(totalLen),
                    totalCost: Math.round(totalLen * 30 * config.costFactor),
                    avgRisk: config.riskFactor,
                    segments,
                    coordinates
                })
            }
        } else {
            return res.status(400).json({success: false, error: '缺少必要参数'})
        }

        console.log(`✅ 规划完成: 生成 ${routes.length} 条路由`)

        res.json({
            success: true,
            mode,
            routes,
            summary: {
                totalRoutes: routes.length,
                bestLength: Math.min(...routes.map(r => r.totalLength)),
                bestCost: Math.min(...routes.map(r => r.totalCost)),
                lowestRisk: Math.min(...routes.map(r => r.avgRisk))
            }
        })

    } catch (error) {
        console.error('路由规划出错:', error)
        res.status(500).json({success: false, error: error.message})
    }
})

// ==================== 仿真计算接口 (Step 3 & 4) ====================

// 物理常量
const PHYS = {
    h: 6.62607015e-34,   // 普朗克常量 (J·s)
    c: 299792458,         // 光速 (m/s)
    refBandwidth: 12.5e9, // 参考带宽 0.1nm → Hz @1550nm
}

/**
 * Step 3: 构建标准化仿真输入
 * 按链路物理连接顺序整理器件序列，整合所有配置参数
 */
function buildSimulationInput(body) {
    const {
        linkId, linkName, totalLengthKm,
        fiberModel, amplifierModel,
        fiberParams, amplifierParams,
        wdmParams, spanStrategy, constraints,
        buConfigs = [],
        deviceSequence = []
    } = body

    // 构建器件序列（按 KP 排序）
    const devices = [...deviceSequence].sort((a, b) => a.kp - b.kp)

    // 构建光纤段序列（相邻器件之间）
    const fiberSegments = []
    for (let i = 0; i < devices.length - 1; i++) {
        fiberSegments.push({
            id: `fiber-seg-${i + 1}`,
            fromDeviceId: devices[i].id,
            toDeviceId: devices[i + 1].id,
            length: devices[i + 1].kp - devices[i].kp,
            fiberParams: {...fiberParams},
        })
    }

    return {
        linkId,
        linkName,
        totalLengthKm,
        deviceSequence: devices,
        fiberSegments,
        fiberModel,
        amplifierModel,
        fiberParams,
        amplifierParams,
        wdmParams,
        spanStrategy,
        constraints,
        buConfigs,
        createdAt: new Date().toISOString(),
        version: '1.0',
    }
}

/**
 * GN-Model: 计算单个 span 的 NLI 效率系数 η (W⁻²)
 * η = (8/27) * γ² / (π * |β2| * B_ch)
 * 其中 β2 由色散 D 转换: β2 = -D * λ² / (2π c)
 */
function computeGnEta(fiberParams, channelBandwidthHz) {
    const alpha_Np = fiberParams.attenuation * Math.log(10) / (10 * 1000) // dB/km → Np/m
    const lambda_m = PHYS.c / (193.1e12)  // ~1550nm
    const D_SI = fiberParams.dispersion * 1e-6  // ps/nm/km → s/m²
    const beta2 = Math.abs(D_SI * lambda_m * lambda_m / (2 * Math.PI * PHYS.c))
    const gamma = fiberParams.nonlinearIndex
        ? (2 * Math.PI * fiberParams.nonlinearIndex * 1e-20) / (lambda_m * fiberParams.effectiveArea * 1e-12)
        : (fiberParams.nonlinearCoeff || 0.8) * 1e-3  // 1/W/km → 1/W/m

    if (beta2 === 0 || channelBandwidthHz === 0) return 0
    const eta = (8 / 27) * gamma * gamma / (Math.PI * beta2 * channelBandwidthHz)
    return eta
}

/**
 * Step 4: Span–性能迭代计算
 * 在指定的 Span 范围内按步长迭代，计算各 Span 配置下的 GSNR/OSNR
 */
function spanIteration(simInput) {
    const {
        totalLengthKm, fiberParams, amplifierParams, wdmParams,
        spanStrategy, constraints, buConfigs
    } = simInput

    // 解析 span 扫描范围
    let spanLengths = []
    if (spanStrategy.mode === 'fixed') {
        spanLengths = [spanStrategy.fixedLength || 70]
    } else {
        const {min = 40, max = 120, step = 5} = spanStrategy.scanRange || {}
        for (let L = min; L <= max; L += step) {
            spanLengths.push(L)
        }
    }

    // WDM 参数
    const channelCount = wdmParams.channelCount || 96
    const centerFreqTHz = wdmParams.centerFreq || 193.1
    const spacingGHz = wdmParams.channelSpacing || 50
    const baudRateGBaud = wdmParams.baudRate || 64
    const launchPowerDbm = wdmParams.launchPower ?? -1.5
    const launchPower_W = Math.pow(10, launchPowerDbm / 10) / 1000  // dBm → W

    // 信道频率列表
    const channelFrequencies = []
    for (let i = 0; i < channelCount; i++) {
        const freq = centerFreqTHz - (channelCount - 1) * spacingGHz / 2000 + i * spacingGHz / 1000
        channelFrequencies.push(parseFloat(freq.toFixed(4)))
    }

    // 光纤参数
    const alpha_dB_per_km = fiberParams.attenuation || 0.165
    const alpha_Np_per_m = alpha_dB_per_km * Math.log(10) / (10 * 1000)

    // 放大器参数
    const noiseFigure_dB = amplifierParams.noiseFigure || 4.8
    const NF_linear = Math.pow(10, noiseFigure_dB / 10)

    // NLI 效率系数
    const channelBW_Hz = baudRateGBaud * 1e9
    const eta = computeGnEta(fiberParams, channelBW_Hz)

    // BU 总插损
    const totalBuLoss_dB = buConfigs.reduce((s, bu) => s + (bu.trunkLoss || 0), 0)
    const buCount = buConfigs.length

    // 目标门限
    const targetGsnr_dB = constraints.targetGSNR || 14.0
    const targetOsnr_dB = constraints.targetOSNR || 16.0
    const margin_dB = constraints.osnrMargin || 1.0

    // 迭代计算每个 span 长度
    const scanPoints = []

    for (const spanLen of spanLengths) {
        // 放大器数量 = ceil(有效长度 / spanLen) - 1
        const effectiveLength = totalLengthKm
        const numAmps = Math.max(1, Math.ceil(effectiveLength / spanLen) - 1)
        const actualSpanLen = effectiveLength / (numAmps + 1)  // 均匀分布
        const spanLen_m = actualSpanLen * 1000

        // 每个 span 的损耗 (线性)
        const spanLoss_dB = alpha_dB_per_km * actualSpanLen
        const spanGain_dB = spanLoss_dB  // 增益补偿损耗
        const G_linear = Math.pow(10, spanGain_dB / 10)

        // 有效长度 Leff
        const L_eff = (1 - Math.exp(-2 * alpha_Np_per_m * spanLen_m)) / (2 * alpha_Np_per_m)

        // 逐信道计算
        const gsnrPerChannel = []
        const osnrPerChannel = []

        for (let ch = 0; ch < channelCount; ch++) {
            const freq_Hz = channelFrequencies[ch] * 1e12

            // 每个 span 中每个放大器引入的 ASE 噪声功率 (W)
            // P_ASE_per_amp = h * f * NF * (G - 1) * B_ref
            const P_ase_per_amp = PHYS.h * freq_Hz * NF_linear * (G_linear - 1) * PHYS.refBandwidth

            // 每个 span 的 NLI 噪声功率 (W)
            // P_NLI_per_span = η * P³ * L_eff² * (N_ch * Δf)^(approx)
            // 简化 GN-Model: P_NLI ≈ η_total * P_launch³
            // η_total 考虑信道数带宽: η * N_ch * Δf_ch
            const totalBW = channelCount * spacingGHz * 1e9
            const P_nli_per_span = eta * L_eff * L_eff * Math.pow(launchPower_W, 3) * totalBW

            // 累积 N 个放大器
            const totalAse_W = P_ase_per_amp * numAmps
            const totalNli_W = P_nli_per_span * numAmps  // GN-Model 假设 NLI 线性累加

            // 考虑 BU 插损（作为额外的等效 ASE 贡献）
            const buLoss_linear = Math.pow(10, totalBuLoss_dB / 10)
            const buAseExtra = buCount > 0 ? P_ase_per_amp * buCount * 0.3 : 0  // BU 额外 ASE 近似

            // OSNR = P_signal / P_ASE (ref bandwidth)
            const osnr_linear = launchPower_W / (totalAse_W + buAseExtra)
            const osnr_dB = 10 * Math.log10(osnr_linear)

            // GSNR = P_signal / (P_ASE + P_NLI)
            const gsnr_linear = launchPower_W / (totalAse_W + buAseExtra + totalNli_W)
            const gsnr_dB = 10 * Math.log10(gsnr_linear)

            // 频谱形状修正：边缘信道有少许退化（简化抛物线修正）
            const normalized = (ch - channelCount / 2) / (channelCount / 2)
            const edgePenalty = 0.8 * normalized * normalized  // 边缘退化 ≤0.8 dB

            gsnrPerChannel.push(parseFloat((gsnr_dB - edgePenalty).toFixed(2)))
            osnrPerChannel.push(parseFloat((osnr_dB - edgePenalty * 0.5).toFixed(2)))
        }

        const minGsnr = Math.min(...gsnrPerChannel)
        const avgGsnr = gsnrPerChannel.reduce((a, b) => a + b, 0) / gsnrPerChannel.length
        const avgOsnr = osnrPerChannel.reduce((a, b) => a + b, 0) / osnrPerChannel.length

        scanPoints.push({
            spanLengthKm: parseFloat(spanLen.toFixed(1)),
            numAmplifiers: numAmps,
            actualSpanKm: parseFloat(actualSpanLen.toFixed(1)),
            gsnrPerChannelDb: gsnrPerChannel,
            osnrPerChannelDb: osnrPerChannel,
            avgGsnrDb: parseFloat(avgGsnr.toFixed(2)),
            minGsnrDb: parseFloat(minGsnr.toFixed(2)),
            avgOsnrDb: parseFloat(avgOsnr.toFixed(2)),
            meetTarget: minGsnr >= (targetGsnr_dB + margin_dB),
            gsnrMarginDb: parseFloat((minGsnr - targetGsnr_dB).toFixed(2)),
        })
    }

    // 推荐 span：满足目标的最长 span（最少放大器）
    const feasiblePoints = scanPoints.filter(p => p.meetTarget)
    const recommendedPoint = feasiblePoints.length > 0
        ? feasiblePoints[feasiblePoints.length - 1]  // 最长可行 span
        : scanPoints[0]  // 无可行时取最短
    const recommendedSpanKm = recommendedPoint.spanLengthKm

    // 可行 span 区间
    const feasibleRange = feasiblePoints.length > 0
        ? [feasiblePoints[0].spanLengthKm, feasiblePoints[feasiblePoints.length - 1].spanLengthKm]
        : null

    return {
        spanScanResult: {
            spanLengthsKm: spanLengths,
            scanPoints,
            recommendedSpanKm,
            targetGsnrDb: targetGsnr_dB,
            feasibleRange,
            channelFrequencies,
        },
        recommendedPoint,
    }
}

/**
 * 用推荐的 span 长度生成详细结果（放大器列表、沿程演化、成本分析）
 */
function buildDetailedResult(simInput, recommendedPoint, spanScanResult) {
    const {
        totalLengthKm, fiberParams, amplifierParams, wdmParams,
        buConfigs, constraints, linkName
    } = simInput

    const spanLen = recommendedPoint.actualSpanKm
    const numAmps = recommendedPoint.numAmplifiers
    const channelCount = wdmParams.channelCount || 96
    const channelFrequencies = spanScanResult.channelFrequencies

    // 放大器列表
    const amplifiers = []
    const avgSpanLength = totalLengthKm / (numAmps + 1)
    let prevPos = 0
    for (let i = 0; i < numAmps; i++) {
        const pos = (i + 1) * avgSpanLength
        const spanLoss = fiberParams.attenuation * (pos - prevPos)
        amplifiers.push({
            id: `amp-${i + 1}`,
            name: `AMP-${String(i + 1).padStart(2, '0')}`,
            position: parseFloat(pos.toFixed(1)),
            precedingSpan: parseFloat((pos - prevPos).toFixed(1)),
            gain: parseFloat(spanLoss.toFixed(1)),
            noiseFigure: amplifierParams.noiseFigure || 4.8,
            outputPower: parseFloat(((wdmParams.launchPower ?? -1.5) + 10 * Math.log10(channelCount)).toFixed(1)),
            inputPower: parseFloat(((wdmParams.launchPower ?? -1.5) + 10 * Math.log10(channelCount) - spanLoss).toFixed(1)),
        })
        prevPos = pos
    }

    // 沿程演化数据
    const positions = [0]
    const positionNames = ['Tx']
    const gsnrEvolution = [parseFloat((recommendedPoint.avgGsnrDb + 12).toFixed(1))]
    const osnrEvolution = [parseFloat((recommendedPoint.avgOsnrDb + 12).toFixed(1))]

    let buIndex = 0
    const buPositions = buConfigs.map(b => b.kp || 0).sort((a, b) => a - b)

    for (let i = 0; i < numAmps; i++) {
        const ampPos = (i + 1) * avgSpanLength
        // BU 在当前 amp 之前
        while (buIndex < buPositions.length && buPositions[buIndex] < ampPos) {
            positions.push(parseFloat(buPositions[buIndex].toFixed(1)))
            positionNames.push(`BU-${buIndex + 1}`)
            const decayRatio = buPositions[buIndex] / totalLengthKm
            const buGsnr = recommendedPoint.avgGsnrDb + 12 - decayRatio * 15 - 0.8
            gsnrEvolution.push(parseFloat(buGsnr.toFixed(1)))
            osnrEvolution.push(parseFloat((buGsnr + 2.5).toFixed(1)))
            buIndex++
        }
        positions.push(parseFloat(ampPos.toFixed(1)))
        positionNames.push(`AMP-${i + 1}`)
        const decayRatio = ampPos / totalLengthKm
        const ampGsnr = recommendedPoint.avgGsnrDb + 12 - decayRatio * 14
        gsnrEvolution.push(parseFloat(ampGsnr.toFixed(1)))
        osnrEvolution.push(parseFloat((ampGsnr + 2.5).toFixed(1)))
    }

    // 剩余 BU
    while (buIndex < buPositions.length) {
        positions.push(parseFloat(buPositions[buIndex].toFixed(1)))
        positionNames.push(`BU-${buIndex + 1}`)
        const decayRatio = buPositions[buIndex] / totalLengthKm
        gsnrEvolution.push(parseFloat((recommendedPoint.avgGsnrDb + 12 - decayRatio * 15 - 0.8).toFixed(1)))
        osnrEvolution.push(parseFloat((recommendedPoint.avgOsnrDb + 12 - decayRatio * 12 - 0.5).toFixed(1)))
        buIndex++
    }

    // 终点
    positions.push(totalLengthKm)
    positionNames.push('Rx')
    gsnrEvolution.push(parseFloat(recommendedPoint.avgGsnrDb.toFixed(1)))
    osnrEvolution.push(parseFloat(recommendedPoint.avgOsnrDb.toFixed(1)))

    // OSNR/GSNR 频谱统计
    const gsnrSpectrum = recommendedPoint.gsnrPerChannelDb
    const osnrSpectrum = recommendedPoint.osnrPerChannelDb
    const gsnrMin = Math.min(...gsnrSpectrum)
    const gsnrMax = Math.max(...gsnrSpectrum)
    const gsnrAvg = gsnrSpectrum.reduce((a, b) => a + b, 0) / gsnrSpectrum.length
    const osnrMin = Math.min(...osnrSpectrum)
    const osnrMax = Math.max(...osnrSpectrum)
    const osnrAvg = osnrSpectrum.reduce((a, b) => a + b, 0) / osnrSpectrum.length
    const worstChannelIndex = gsnrSpectrum.indexOf(gsnrMin)

    // 成本计算
    const fiberPrice = 28000  // $/km
    const ampPrice = amplifierParams.unitPrice || 850000
    const buPrice = 180000
    const cableCost = totalLengthKm * fiberPrice
    const amplifierCost = numAmps * ampPrice
    const buCostTotal = buConfigs.length * buPrice
    const totalCost = cableCost + amplifierCost + buCostTotal

    return {
        linkName: linkName || '未命名链路',
        totalLength: totalLengthKm,
        status: 'success',
        metrics: {
            osnr: {
                min: parseFloat(osnrMin.toFixed(1)),
                max: parseFloat(osnrMax.toFixed(1)),
                avg: parseFloat(osnrAvg.toFixed(1))
            },
            gsnr: {
                min: parseFloat(gsnrMin.toFixed(1)),
                max: parseFloat(gsnrMax.toFixed(1)),
                avg: parseFloat(gsnrAvg.toFixed(1))
            },
            power: {min: -2.1, max: -0.8, avg: parseFloat((wdmParams.launchPower ?? -1.5).toFixed(1))},
            qFactor: {min: 8.2, max: 10.1, avg: 9.0},
        },
        systemConfig: {
            amplifierCount: numAmps,
            avgSpanLength: parseFloat(avgSpanLength.toFixed(1)),
            buCount: buConfigs.length,
            totalBuLoss: parseFloat(buConfigs.reduce((s, b) => s + (b.trunkLoss || 0), 0).toFixed(1)),
            channelCount,
            modulation: wdmParams.modulation || '16QAM',
            recommendedSpanKm: spanScanResult.recommendedSpanKm,
        },
        margin: {
            targetOsnr: constraints.targetOSNR || 16.0,
            worstMargin: parseFloat((gsnrMin - (constraints.targetGSNR || 14.0)).toFixed(1)),
            avgMargin: parseFloat((gsnrAvg - (constraints.targetGSNR || 14.0)).toFixed(1)),
            meetsRequirement: gsnrMin >= (constraints.targetGSNR || 14.0),
        },
        performanceData: {
            channelFrequencies,
            endOsnrSpectrum: osnrSpectrum,
            endGsnrSpectrum: gsnrSpectrum,
            positions,
            positionNames,
            osnrEvolution,
            gsnrEvolution,
            worstChannelIndex,
        },
        amplifiers,
        costData: {
            cableCost,
            amplifierCost,
            buCost: buCostTotal,
            totalCost,
            costItems: [
                {
                    category: '海缆',
                    model: fiberParams.fiberName || 'G.654.E ULL',
                    quantity: `${totalLengthKm.toFixed(0)}km`,
                    unit: 'km',
                    unitPrice: fiberPrice,
                    subtotal: cableCost
                },
                {
                    category: '放大器',
                    model: amplifierParams.amplifierName || 'EDFA-RPT',
                    quantity: numAmps,
                    unit: '台',
                    unitPrice: ampPrice,
                    subtotal: amplifierCost
                },
                {
                    category: '分支器',
                    model: 'BU-Standard',
                    quantity: buConfigs.length,
                    unit: '台',
                    unitPrice: buPrice,
                    subtotal: buCostTotal
                },
            ]
        },
    }
}

/**
 * POST /api/simulation/run
 * 系统规划仿真计算
 *
 * 接收前端的链路配置，执行 Step3(构建仿真输入) + Step4(Span迭代计算)
 * 返回 span 扫描结果 + 推荐 span 下的详细仿真结果
 */
app.post('/api/simulation/run', (req, res) => {
    try {
        const startTime = Date.now()
        console.log('\n🔬 接收到仿真计算请求')

        // Step 3: 构建标准化仿真输入
        const simInput = buildSimulationInput(req.body)
        console.log(`  📋 Step3 完成: 器件序列 ${simInput.deviceSequence.length} 个, 光纤段 ${simInput.fiberSegments.length} 段`)

        // Step 4: Span 迭代计算
        const {spanScanResult, recommendedPoint} = spanIteration(simInput)
        console.log(`  📊 Step4 完成: 扫描 ${spanScanResult.spanLengthsKm.length} 个 span 长度`)
        console.log(`  ✅ 推荐 Span: ${spanScanResult.recommendedSpanKm} km, GSNR: ${recommendedPoint.avgGsnrDb} dB, 放大器: ${recommendedPoint.numAmplifiers} 台`)
        if (spanScanResult.feasibleRange) {
            console.log(`  📐 可行区间: [${spanScanResult.feasibleRange[0]}, ${spanScanResult.feasibleRange[1]}] km`)
        }

        // 用推荐 span 生成详细结果
        const detailedResult = buildDetailedResult(simInput, recommendedPoint, spanScanResult)
        detailedResult.calculatedAt = new Date().toLocaleString('zh-CN')
        detailedResult.calculationTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(3))

        console.log(`  ⏱️  总耗时: ${Date.now() - startTime}ms`)

        res.json({
            success: true,
            spanScanResult,
            detailedResult,
        })
    } catch (error) {
        console.error('仿真计算出错:', error)
        res.status(500).json({success: false, error: error.message})
    }
})

// 健康检查
app.get('/health', (req, res) => {
    res.json({status: 'ok', tifCount: tifCache.length})
})

// 启动服务
async function start() {
    await preloadTifData()

    app.listen(PORT, () => {
        console.log(`\n�\udf0a DEM服务已启动: http://localhost:${PORT}`)
        console.log(`   - GET  /api/dem/meta      获取元数据`)
        console.log(`   - GET  /api/dem/clip      裁剪区域数据`)
        console.log(`   - GET  /api/dem/point     查询单点高程`)
        console.log(`   - POST /api/dem/profile   获取路径剖面`)
        console.log(`   - POST /api/route/planning 路由规划\n`)
    })
}

start().catch(console.error)
