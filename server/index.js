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
import { fileURLToPath } from 'url'
import fs from 'fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// DEM文件路径（相对于server目录）
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
  res.json({ success: true, data: meta })
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
    res.json({ success: true, data: files })
  } catch (error) {
    console.error('共享数据列表获取失败:', error)
    res.status(500).json({ success: false, error: error.message })
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
    const { minX, minY, maxX, maxY, width = 128, height = 128 } = req.query

    // 参数验证
    const bbox = [
      parseFloat(minX),
      parseFloat(minY),
      parseFloat(maxX),
      parseFloat(maxY),
    ]

    if (bbox.some(isNaN)) {
      return res.status(400).json({ success: false, error: '无效的bbox参数' })
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
        availableBboxes: tifCache.map(t => ({ filename: t.filename, bbox: t.bbox }))
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
      return res.status(400).json({ success: false, error: '选择区域超出DEM数据范围' })
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
    res.status(500).json({ success: false, error: error.message })
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
    const { lon, lat } = req.query
    const x = parseFloat(lon)
    const y = parseFloat(lat)

    if (isNaN(x) || isNaN(y)) {
      return res.status(400).json({ success: false, error: '无效的坐标参数' })
    }

    // 找到包含该点的tif
    const tif = tifCache.find(t => {
      const [minX, minY, maxX, maxY] = t.bbox
      return x >= minX && x <= maxX && y >= minY && y <= maxY
    })

    if (!tif) {
      return res.status(404).json({ success: false, error: '该点不在DEM覆盖范围内' })
    }

    // 计算像素坐标
    const [imgMinX, , , imgMaxY] = tif.bbox
    const pixelX = Math.floor((x - imgMinX) / tif.pixelWidth)
    const pixelY = Math.floor((imgMaxY - y) / tif.pixelHeight)

    if (pixelX < 0 || pixelX >= tif.width || pixelY < 0 || pixelY >= tif.height) {
      return res.status(400).json({ success: false, error: '坐标超出范围' })
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
    res.status(500).json({ success: false, error: error.message })
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
    const { mode, extent, segment, sampleCount = 100 } = req.body
    
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
      return res.status(400).json({ success: false, error: '无效的请求参数' })
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
      samplePoints.push({ t, lon, lat, distance: totalDistanceKm * t })
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
    res.status(500).json({ success: false, error: error.message })
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
    const { mode, startPoint, endPoint, waypoints, planningRange, riskConfig } = req.body
    
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
          startPoint: { lon: wp1.lon, lat: wp1.lat },
          endPoint: { lon: wp2.lon, lat: wp2.lat },
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
        { id: 'pareto-route-1', name: '经济路线', coords: route1Coords, riskFactor: 0.6, costFactor: 0.85 },
        { id: 'pareto-route-2', name: '均衡路线', coords: route2Coords, riskFactor: 0.35, costFactor: 1.0 },
        { id: 'pareto-route-3', name: '安全路线', coords: route3Coords, riskFactor: 0.15, costFactor: 1.5 }
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
            startPoint: { lon: lon1, lat: lat1 },
            endPoint: { lon: lon2, lat: lat2 },
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
      return res.status(400).json({ success: false, error: '缺少必要参数' })
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
    res.status(500).json({ success: false, error: error.message })
  }
})

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', tifCount: tifCache.length })
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
