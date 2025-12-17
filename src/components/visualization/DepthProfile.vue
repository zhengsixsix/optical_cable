<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import * as GeoTIFF from 'geotiff'

interface ProfilePoint {
  distance: number
  depth: number
}

interface Props {
  extent?: [number, number, number, number]
}

const props = defineProps<Props>()

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)
const hasData = ref(false)
const profileData = ref<ProfilePoint[]>([])

const hoverInfo = ref({
  visible: false,
  x: 0,
  y: 0,
  distance: 0,
  depth: 0
})

// 多 tif 文件支持
interface TifMeta {
  url: string
  bbox: [number, number, number, number]
  image: any
  pixelWidth: number
  pixelHeight: number
  width: number
  height: number
}

const DEM_FILES = ['/dem/1.tif', '/dem/2.tif', '/dem/3.tif', '/dem/4.tif', '/dem/5.tif', '/dem/6.tif']
const tifMetaCache = ref<TifMeta[]>([])
const metaLoaded = ref(false)

// 预加载所有 tif 文件的元数据
const loadTifMeta = async () => {
  if (metaLoaded.value) return
  
  const metas: TifMeta[] = []
  await Promise.all(DEM_FILES.map(async (url) => {
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
      const image = await tiff.getImage()
      const bbox = image.getBoundingBox() as [number, number, number, number]
      const width = image.getWidth()
      const height = image.getHeight()
      const pixelWidth = (bbox[2] - bbox[0]) / width
      const pixelHeight = (bbox[3] - bbox[1]) / height
      
      metas.push({ url, bbox, image, pixelWidth, pixelHeight, width, height })
    } catch (e) {
      console.warn(`加载 ${url} 元数据失败:`, e)
    }
  }))
  
  tifMetaCache.value = metas
  metaLoaded.value = true
}

// 根据坐标找到对应的 tif 文件
const findTifForPoint = (x: number, y: number): TifMeta | null => {
  for (const meta of tifMetaCache.value) {
    const [minX, minY, maxX, maxY] = meta.bbox
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      return meta
    }
  }
  return null
}

// 从指定 tif 读取单点高程
const getElevationFromTif = async (meta: TifMeta, x: number, y: number): Promise<number | null> => {
  if (!meta.image) return null
  
  const [imgMinX, , , imgMaxY] = meta.bbox
  const pixelX = Math.floor((x - imgMinX) / meta.pixelWidth)
  const pixelY = Math.floor((imgMaxY - y) / meta.pixelHeight)
  
  if (pixelX < 0 || pixelX >= meta.width || pixelY < 0 || pixelY >= meta.height) {
    return null
  }
  
  try {
    const rasters = await meta.image.readRasters({
      window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
      width: 1,
      height: 1,
    })
    const elevation = (rasters[0] as Int16Array)[0]
    return elevation === -32767 ? 0 : elevation
  } catch {
    return null
  }
}

// EPSG:3857 转经纬度
const mercatorToLatLon = (x: number, y: number): [number, number] => {
  const lon = (x / 20037508.34) * 180
  let lat = (y / 20037508.34) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return [lon, lat]
}

// Haversine 距离计算
const haversineDistance = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + 
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * 
            Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 加载剖面数据
const loadProfileData = async (extent: [number, number, number, number]) => {
  loading.value = true
  hasData.value = false
  
  try {
    // 预加载 tif 元数据
    await loadTifMeta()
    
    const [extMinX, extMinY, extMaxX, extMaxY] = extent
    const centerY = (extMinY + extMaxY) / 2
    
    const [startLon, startLat] = mercatorToLatLon(extMinX, centerY)
    const [endLon, endLat] = mercatorToLatLon(extMaxX, centerY)
    const totalDistanceKm = haversineDistance(startLon, startLat, endLon, endLat)
    
    const sampleCount = 100
    const points: ProfilePoint[] = []
    
    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount
      const x = extMinX + (extMaxX - extMinX) * t
      const y = centerY
      
      // 转换为经纬度坐标（tif 文件是经纬度坐标系）
      const [lon, lat] = mercatorToLatLon(x, y)
      
      // 从多个 tif 中查找对应的文件
      const tifMeta = findTifForPoint(lon, lat)
      if (tifMeta) {
        const elevation = await getElevationFromTif(tifMeta, lon, lat)
        if (elevation !== null) {
          points.push({
            distance: totalDistanceKm * t,
            depth: elevation
          })
        }
      }
    }
    
    profileData.value = points
    hasData.value = points.length > 0
    nextTick(() => drawProfile())
  } catch (error) {
    console.error('加载剖面数据失败:', error)
  } finally {
    loading.value = false
  }
}

// 绘制剖面图
const drawProfile = () => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const dpr = window.devicePixelRatio || 1
  const rect = container.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  canvas.style.width = rect.width + 'px'
  canvas.style.height = rect.height + 'px'
  ctx.scale(dpr, dpr)
  
  const width = rect.width
  const height = rect.height
  const padding = { top: 20, right: 15, bottom: 30, left: 45 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  
  const seabedData = profileData.value
  if (seabedData.length === 0) return
  
  const maxDistance = Math.max(...seabedData.map(d => d.distance))
  const depths = seabedData.map(d => d.depth)
  const minElev = Math.min(...depths)
  const maxElev = Math.max(...depths)
  const elevRange = maxElev - minElev || 1
  
  const xScale = (distance: number) => padding.left + (distance / maxDistance) * chartWidth
  const yScale = (elev: number) => padding.top + ((maxElev - elev) / elevRange) * chartHeight
  const seaLevelY = yScale(0)
  
  ctx.clearRect(0, 0, width, height)
  
  // 天空背景
  if (seaLevelY > padding.top) {
    const skyGradient = ctx.createLinearGradient(0, padding.top, 0, seaLevelY)
    skyGradient.addColorStop(0, '#87CEEB')
    skyGradient.addColorStop(1, '#E0F4FF')
    ctx.fillStyle = skyGradient
    ctx.fillRect(padding.left, padding.top, chartWidth, seaLevelY - padding.top)
  }
  
  // 海水背景
  if (seaLevelY < height - padding.bottom) {
    const waterGradient = ctx.createLinearGradient(0, seaLevelY, 0, height - padding.bottom)
    waterGradient.addColorStop(0, '#4A90D9')
    waterGradient.addColorStop(1, '#0D2B3E')
    ctx.fillStyle = waterGradient
    ctx.fillRect(padding.left, seaLevelY, chartWidth, height - padding.bottom - seaLevelY)
  }
  
  // 海平面线
  ctx.beginPath()
  ctx.strokeStyle = '#2196F3'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 3])
  ctx.moveTo(padding.left, seaLevelY)
  ctx.lineTo(width - padding.right, seaLevelY)
  ctx.stroke()
  ctx.setLineDash([])
  
  // 地形填充
  ctx.beginPath()
  ctx.moveTo(xScale(seabedData[0].distance), yScale(seabedData[0].depth))
  seabedData.forEach(point => ctx.lineTo(xScale(point.distance), yScale(point.depth)))
  ctx.lineTo(xScale(seabedData[seabedData.length - 1].distance), height - padding.bottom)
  ctx.lineTo(padding.left, height - padding.bottom)
  ctx.closePath()
  
  const terrainGradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom)
  terrainGradient.addColorStop(0, '#8B7355')
  terrainGradient.addColorStop(0.5, '#4682B4')
  terrainGradient.addColorStop(1, '#2F4F4F')
  ctx.fillStyle = terrainGradient
  ctx.fill()
  
  // 海底轮廓
  ctx.beginPath()
  ctx.strokeStyle = '#5D4037'
  ctx.lineWidth = 2
  ctx.moveTo(xScale(seabedData[0].distance), yScale(seabedData[0].depth))
  seabedData.forEach(point => ctx.lineTo(xScale(point.distance), yScale(point.depth)))
  ctx.stroke()
  
  // 海缆线路
  const cableData = seabedData.map(p => ({ distance: p.distance, depth: p.depth + 5 }))
  ctx.beginPath()
  ctx.strokeStyle = '#FF5722'
  ctx.lineWidth = 3
  ctx.moveTo(xScale(cableData[0].distance), yScale(cableData[0].depth))
  cableData.forEach(point => ctx.lineTo(xScale(point.distance), yScale(point.depth)))
  ctx.stroke()
  
  // 存储交互数据
  ;(canvas as any)._profileData = { seabedData, xScale, yScale, padding, maxDistance, chartWidth, chartHeight }
}

// 鼠标事件
const handleMouseMove = (e: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const data = (canvas as any)._profileData
  if (!data) return
  
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  if (x < data.padding.left || x > data.padding.left + data.chartWidth) {
    hoverInfo.value.visible = false
    return
  }
  
  const distance = ((x - data.padding.left) / data.chartWidth) * data.maxDistance
  const nearestPoint = data.seabedData.reduce((prev: ProfilePoint, curr: ProfilePoint) => 
    Math.abs(curr.distance - distance) < Math.abs(prev.distance - distance) ? curr : prev
  )
  
  hoverInfo.value = {
    visible: true,
    x: x + 10,
    y: y - 40,
    distance: nearestPoint.distance,
    depth: Math.abs(nearestPoint.depth)
  }
}

const handleMouseLeave = () => {
  hoverInfo.value.visible = false
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(() => {
    drawProfile()
    if (containerRef.value) {
      resizeObserver = new ResizeObserver(() => drawProfile())
      resizeObserver.observe(containerRef.value)
      containerRef.value.addEventListener('mousemove', handleMouseMove)
      containerRef.value.addEventListener('mouseleave', handleMouseLeave)
    }
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  containerRef.value?.removeEventListener('mousemove', handleMouseMove)
  containerRef.value?.removeEventListener('mouseleave', handleMouseLeave)
})

watch(() => props.extent, (newExtent) => {
  if (newExtent) loadProfileData(newExtent)
}, { immediate: true })
</script>

<template>
  <div ref="containerRef" class="w-full h-full relative bg-gray-50 rounded overflow-hidden">
    <canvas ref="canvasRef" class="block w-full h-full" />
    
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500 text-xs bg-gray-50/90">
      <Loader2 class="w-6 h-6 text-primary animate-spin" />
      <span>加载剖面数据...</span>
    </div>
    
    <div v-if="!hasData && !loading" class="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
      <span>框选区域后显示水深剖面</span>
    </div>
    
    <div 
      v-if="hoverInfo.visible"
      class="absolute bg-black/80 text-white px-2 py-1 rounded text-xs pointer-events-none z-10"
      :style="{ left: hoverInfo.x + 'px', top: hoverInfo.y + 'px' }"
    >
      <div>距离: {{ hoverInfo.distance.toFixed(2) }} km</div>
      <div>水深: {{ hoverInfo.depth.toFixed(1) }} m</div>
    </div>
  </div>
</template>
