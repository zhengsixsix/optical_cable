/**
 * DEM 高程数据服务
 * 管理 tifCache、预加载、查询
 */

import * as GeoTIFF from 'geotiff'
import path from 'path'

// 全局缓存：存储 tif 元数据、image 对象和完整数据
const tifCache = []

/**
 * 获取 tifCache 引用（供路由/其他服务使用）
 */
export function getTifCache() {
    return tifCache
}

/**
 * 启动时预加载所有 tif 完整数据到内存
 */
export async function preloadTifData(demDir, demFiles) {
    console.log('🚀 正在预加载 DEM 数据到内存...')
    const startTime = Date.now()
    let totalMemory = 0

    for (const filename of demFiles) {
        const filePath = path.join(demDir, filename)
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
                fullData,
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
 * 判断两个 bbox 是否相交
 */
export function bboxIntersects(bbox1, bbox2) {
    return !(bbox1[2] < bbox2[0] || bbox1[0] > bbox2[2] ||
        bbox1[3] < bbox2[1] || bbox1[1] > bbox2[3])
}

/**
 * 根据经纬度坐标找到对应的 tif 文件
 */
export function findTifForPoint(x, y) {
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
export function getElevationFromTif(tif, x, y) {
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
 * 查询单点高程（自动查找 tif）
 */
export function getElevation(lon, lat) {
    const tif = findTifForPoint(lon, lat)
    if (!tif) return null
    return getElevationFromTif(tif, lon, lat)
}
