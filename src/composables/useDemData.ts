/**
 * DEM 数据共享管理
 * 所有组件共用同一份 tif 数据缓存，避免重复加载
 */
import { ref } from 'vue'
import * as GeoTIFF from 'geotiff'

export interface TifMeta {
  url: string
  bbox: [number, number, number, number]
  image: any
  pixelWidth: number
  pixelHeight: number
  width: number
  height: number
}

const DEM_FILES = ['/dem/1.tif', '/dem/2.tif', '/dem/3.tif', '/dem/4.tif', '/dem/5.tif', '/dem/6.tif']

// 全局单例缓存
const tifMetaCache = ref<TifMeta[]>([])
const metaLoaded = ref(false)
const loadingPromise = ref<Promise<void> | null>(null)

/**
 * 预加载所有 tif 文件的元数据（全局只加载一次）
 */
export const loadTifMeta = async (): Promise<TifMeta[]> => {
  // 已加载完成，直接返回
  if (metaLoaded.value) {
    return tifMetaCache.value
  }
  
  // 正在加载中，等待完成
  if (loadingPromise.value) {
    await loadingPromise.value
    return tifMetaCache.value
  }
  
  // 开始加载
  loadingPromise.value = (async () => {
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
  })()
  
  await loadingPromise.value
  return tifMetaCache.value
}

/**
 * 根据经纬度坐标找到对应的 tif 文件
 */
export const findTifForPoint = (x: number, y: number): TifMeta | null => {
  for (const meta of tifMetaCache.value) {
    const [minX, minY, maxX, maxY] = meta.bbox
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      return meta
    }
  }
  return null
}

/**
 * 查找与区域有交集的 tif 文件（输入是经纬度坐标）
 */
export const findTifForExtent = (extentLonLat: [number, number, number, number]): TifMeta | null => {
  const [extMinX, extMinY, extMaxX, extMaxY] = extentLonLat
  for (const meta of tifMetaCache.value) {
    const [minX, minY, maxX, maxY] = meta.bbox
    if (extMinX <= maxX && extMaxX >= minX && extMinY <= maxY && extMaxY >= minY) {
      return meta
    }
  }
  return null
}

/**
 * 从指定 tif 读取单点高程
 */
export const getElevationFromTif = async (meta: TifMeta, x: number, y: number): Promise<number | null> => {
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

/**
 * EPSG:3857 转经纬度
 */
export const mercatorToLatLon = (x: number, y: number): [number, number] => {
  const lon = (x / 20037508.34) * 180
  let lat = (y / 20037508.34) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return [lon, lat]
}

/**
 * Haversine 距离计算
 */
export const haversineDistance = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + 
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * 
            Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 获取缓存状态
 */
export const useDemData = () => {
  return {
    tifMetaCache,
    metaLoaded,
    loadTifMeta,
    findTifForPoint,
    findTifForExtent,
    getElevationFromTif,
    mercatorToLatLon,
    haversineDistance,
  }
}
