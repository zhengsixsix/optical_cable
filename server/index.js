/**
 * DEM 高程数据服务
 * 
 * 功能：
 * 1. 启动时预加载6个tif的元数据（秒级）
 * 2. 提供 /api/dem/meta 返回所有tif的bbox信息
 * 3. 提供 /api/dem/clip 按bbox裁剪返回高程数据
 */

import express from 'express'
import cors from 'cors'
import * as GeoTIFF from 'geotiff'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// DEM文件路径（相对于server目录）
const DEM_DIR = path.join(__dirname, '..', 'public', 'dem')
const DEM_FILES = ['1.tif', '2.tif', '3.tif', '4.tif', '5.tif', '6.tif']

// 全局缓存：存储tif元数据和image对象
const tifCache = []

/**
 * 启动时预加载所有tif元数据并预热缓存
 */
async function preloadTifMeta() {
  console.log('🚀 正在预加载 DEM 元数据...')
  const startTime = Date.now()

  for (const filename of DEM_FILES) {
    const filePath = path.join(DEM_DIR, filename)
    try {
      const tiff = await GeoTIFF.fromFile(filePath)
      const image = await tiff.getImage()
      const bbox = image.getBoundingBox()
      const width = image.getWidth()
      const height = image.getHeight()
      const pixelWidth = (bbox[2] - bbox[0]) / width
      const pixelHeight = (bbox[3] - bbox[1]) / height

      tifCache.push({
        filename,
        filePath,
        bbox,
        width,
        height,
        pixelWidth,
        pixelHeight,
        image, // 保留image对象用于后续读取
      })

      console.log(`  ✅ ${filename}: bbox=[${bbox.map(v => v.toFixed(2)).join(', ')}]`)
    } catch (e) {
      console.error(`  ❌ ${filename} 加载失败:`, e.message)
    }
  }

  console.log(`✨ 元数据加载完成，耗时 ${Date.now() - startTime}ms`)
  
  // 预热缓存：对每个tif读取一小块数据，强制加载内部索引
  console.log('🔥 正在预热缓存...')
  const warmupStart = Date.now()
  
  await Promise.all(tifCache.map(async (tif) => {
    try {
      // 读取一个小窗口强制geotiff加载数据
      await tif.image.readRasters({
        window: [0, 0, 10, 10],
        width: 10,
        height: 10,
      })
      console.log(`  🔥 ${tif.filename} 预热完成`)
    } catch (e) {
      console.warn(`  ⚠️ ${tif.filename} 预热失败:`, e.message)
    }
  }))
  
  console.log(`🌟 预热完成，耗时 ${Date.now() - warmupStart}ms`)
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

    // 读取裁剪后的数据
    const startTime = Date.now()
    const rasters = await tif.image.readRasters({
      window: [windowMinX, windowMinY, windowMaxX, windowMaxY],
      width: outputWidth,
      height: outputHeight,
    })

    const rawData = rasters[0]
    
    // GeoTIFF 返回的数据是按行优先存储，但需要水平翻转以匹配坐标系
    // 因为 geotiff 的 x 轴向右，但返回数据可能需要调整
    const elevationData = new Int16Array(outputWidth * outputHeight)
    for (let row = 0; row < outputHeight; row++) {
      for (let col = 0; col < outputWidth; col++) {
        // 数据复制，确保行列顺序正确
        elevationData[row * outputWidth + col] = rawData[row * outputWidth + col]
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

    // 读取单点
    const rasters = await tif.image.readRasters({
      window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
      width: 1,
      height: 1,
    })

    const elevation = rasters[0][0]
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
 * 从指定 tif 读取单点高程
 */
async function getElevationFromTif(tif, x, y) {
  if (!tif.image) return null
  
  const [imgMinX, , , imgMaxY] = tif.bbox
  const pixelX = Math.floor((x - imgMinX) / tif.pixelWidth)
  const pixelY = Math.floor((imgMaxY - y) / tif.pixelHeight)
  
  if (pixelX < 0 || pixelX >= tif.width || pixelY < 0 || pixelY >= tif.height) {
    return null
  }
  
  try {
    const rasters = await tif.image.readRasters({
      window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
      width: 1,
      height: 1,
    })
    const elevation = rasters[0][0]
    return elevation === -32767 ? 0 : elevation
  } catch {
    return null
  }
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
    
    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount
      const lon = startLon + (endLon - startLon) * t
      const lat = startLat + (endLat - startLat) * t
      
      const tif = findTifForPoint(lon, lat)
      if (tif) {
        const elevation = await getElevationFromTif(tif, lon, lat)
        if (elevation !== null) {
          points.push({
            distance: totalDistanceKm * t,
            depth: elevation
          })
        }
      }
    }
    
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
          const elevation = await getElevationFromTif(tif, midLon, midLat)
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
            const elevation = await getElevationFromTif(tif, segMidLon, segMidLat)
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
  await preloadTifMeta()
  
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
