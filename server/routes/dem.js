/**
 * DEM 高程数据 API 路由
 */

import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getTifCache, bboxIntersects, findTifForPoint } from '../services/demService.js'
import { haversineDistance, mercatorToLatLon } from '../utils/geo.js'

const SHARED_EXTENSIONS = new Set(['.tif', '.tiff', '.shp', '.geojson', '.json', '.kml'])

export function createDemRouter(sharedDataDir) {
    const router = Router()

    /**
     * GET /api/dem/meta
     */
    router.get('/meta', (req, res) => {
        const tifCache = getTifCache()
        const meta = tifCache.map(t => ({
            filename: t.filename,
            bbox: t.bbox,
            width: t.width,
            height: t.height,
            pixelWidth: t.pixelWidth,
            pixelHeight: t.pixelHeight,
        }))
        res.json({ success: true, data: meta })
    })

    /**
     * GET /api/dem/clip
     */
    router.get('/clip', asyncHandler(async (req, res) => {
        const { minX, minY, maxX, maxY, width = 128, height = 128 } = req.query

        const bbox = [parseFloat(minX), parseFloat(minY), parseFloat(maxX), parseFloat(maxY)]
        if (bbox.some(isNaN)) {
            return res.status(400).json({ success: false, error: '无效的bbox参数' })
        }

        const outputWidth = Math.min(parseInt(width) || 128, 512)
        const outputHeight = Math.min(parseInt(height) || 128, 512)

        const tifCache = getTifCache()
        const tif = tifCache.find(t => bboxIntersects(t.bbox, bbox))
        if (!tif) {
            return res.status(404).json({
                success: false,
                error: '未找到覆盖该区域的DEM数据',
                requestedBbox: bbox,
                availableBboxes: tifCache.map(t => ({ filename: t.filename, bbox: t.bbox }))
            })
        }

        const [imgMinX, imgMinY, imgMaxX, imgMaxY] = tif.bbox
        const [extMinX, extMinY, extMaxX, extMaxY] = bbox

        const clampedMinX = Math.max(extMinX, imgMinX)
        const clampedMinY = Math.max(extMinY, imgMinY)
        const clampedMaxX = Math.min(extMaxX, imgMaxX)
        const clampedMaxY = Math.min(extMaxY, imgMaxY)

        const windowMinX = Math.max(0, Math.floor((clampedMinX - imgMinX) / tif.pixelWidth))
        const windowMaxX = Math.min(tif.width, Math.ceil((clampedMaxX - imgMinX) / tif.pixelWidth))
        const windowMinY = Math.max(0, Math.floor((imgMaxY - clampedMaxY) / tif.pixelHeight))
        const windowMaxY = Math.min(tif.height, Math.ceil((imgMaxY - clampedMinY) / tif.pixelHeight))

        if (windowMaxX <= windowMinX || windowMaxY <= windowMinY) {
            return res.status(400).json({ success: false, error: '选择区域超出DEM数据范围' })
        }

        const startTime = Date.now()
        const sourceWidth = windowMaxX - windowMinX
        const sourceHeight = windowMaxY - windowMinY

        const elevationData = new Int16Array(outputWidth * outputHeight)
        for (let outY = 0; outY < outputHeight; outY++) {
            for (let outX = 0; outX < outputWidth; outX++) {
                const srcX = windowMinX + (outX / outputWidth) * sourceWidth
                const srcY = windowMinY + (outY / outputHeight) * sourceHeight
                const px = Math.min(Math.floor(srcX), tif.width - 1)
                const py = Math.min(Math.floor(srcY), tif.height - 1)
                const idx = py * tif.width + px
                elevationData[outY * outputWidth + outX] = tif.fullData[idx]
            }
        }

        let minElev = Infinity, maxElev = -Infinity
        for (let i = 0; i < elevationData.length; i++) {
            if (elevationData[i] !== -32767) {
                minElev = Math.min(minElev, elevationData[i])
                maxElev = Math.max(maxElev, elevationData[i])
            }
        }

        console.log(`📍 裁剪完成: ${tif.filename}, ${outputWidth}x${outputHeight}, 耗时 ${Date.now() - startTime}ms, 高程范围: ${minElev}~${maxElev}m`)

        res.json({
            success: true,
            data: {
                width: outputWidth,
                height: outputHeight,
                bbox: [clampedMinX, clampedMinY, clampedMaxX, clampedMaxY],
                minElev: minElev === Infinity ? 0 : minElev,
                maxElev: maxElev === -Infinity ? 0 : maxElev,
                elevation: Array.from(elevationData),
            }
        })
    }))

    /**
     * GET /api/dem/point
     */
    router.get('/point', asyncHandler(async (req, res) => {
        const { lon, lat } = req.query
        const x = parseFloat(lon)
        const y = parseFloat(lat)

        if (isNaN(x) || isNaN(y)) {
            return res.status(400).json({ success: false, error: '无效的坐标参数' })
        }

        const tif = findTifForPoint(x, y)
        if (!tif) {
            return res.status(404).json({ success: false, error: '该点不在DEM覆盖范围内' })
        }

        const [imgMinX, , , imgMaxY] = tif.bbox
        const pixelX = Math.floor((x - imgMinX) / tif.pixelWidth)
        const pixelY = Math.floor((imgMaxY - y) / tif.pixelHeight)

        if (pixelX < 0 || pixelX >= tif.width || pixelY < 0 || pixelY >= tif.height) {
            return res.status(400).json({ success: false, error: '坐标超出范围' })
        }

        const idx = pixelY * tif.width + pixelX
        const elevation = tif.fullData[idx]
        res.json({
            success: true,
            data: { lon: x, lat: y, elevation: elevation === -32767 ? 0 : elevation }
        })
    }))

    /**
     * POST /api/dem/profile
     */
    router.post('/profile', asyncHandler(async (req, res) => {
        const { mode, extent, segment, sampleCount = 100 } = req.body

        let startLon, startLat, endLon, endLat

        if (mode === 'extent' && extent) {
            const [extMinX, extMinY, extMaxX, extMaxY] = extent
            ;[startLon, startLat] = mercatorToLatLon(extMinX, extMaxY)
            ;[endLon, endLat] = mercatorToLatLon(extMaxX, extMinY)
        } else if (mode === 'segment' && segment) {
            startLon = segment.startPoint.lon
            startLat = segment.startPoint.lat
            endLon = segment.endPoint.lon
            endLat = segment.endPoint.lat
        } else {
            return res.status(400).json({ success: false, error: '无效的请求参数' })
        }

        const totalDistanceKm = haversineDistance(startLon, startLat, endLon, endLat)
        const points = []
        const startTime = Date.now()

        const samplePoints = []
        for (let i = 0; i <= sampleCount; i++) {
            const t = i / sampleCount
            const lon = startLon + (endLon - startLon) * t
            const lat = startLat + (endLat - startLat) * t
            samplePoints.push({ t, lon, lat, distance: totalDistanceKm * t })
        }

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
                    points.push({ distance: sp.distance, depth: elevation })
                }
            }
        }

        points.sort((a, b) => a.distance - b.distance)

        console.log(`📊 剖面数据生成: ${points.length}点, 总距离 ${totalDistanceKm.toFixed(2)}km, 耗时 ${Date.now() - startTime}ms`)

        res.json({
            success: true,
            data: { points, totalDistance: totalDistanceKm }
        })
    }))

    return router
}

/**
 * 创建 GIS 共享数据路由
 */
export function createGisRouter(sharedDataDir) {
    const router = Router()

    router.get('/shared', asyncHandler(async (req, res) => {
        const files = []

        async function walk(dir) {
            let entries = []
            try {
                entries = await fs.readdir(dir, { withFileTypes: true })
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
                    const relativePath = path.relative(sharedDataDir, fullPath).replace(/\\/g, '/')
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

        await walk(sharedDataDir)
        files.sort((a, b) => a.path.localeCompare(b.path))
        res.json({ success: true, data: files })
    }))

    return router
}
