/**
 * 地形数据缓存
 * 用于在多个 Terrain3D 组件实例间共享数据，避免重复请求
 */
import { ref, shallowRef } from 'vue'
import { fetchDemClip, checkDemService } from '@/services/DemApiService'
import { loadTifMeta, findTifForExtent, mercatorToLatLon } from '@/composables/useDemData'

export interface TerrainData {
  elevationData: Int16Array
  width: number
  height: number
  extentLonLat: [number, number, number, number]
  minElev: number
  maxElev: number
  elevRange: number
}

// 全局缓存
const cachedExtent = ref<[number, number, number, number] | null>(null)
const cachedData = shallowRef<TerrainData | null>(null)
const isLoading = ref(false)
const loadingPromise = ref<Promise<TerrainData | null> | null>(null)

// 检查两个 extent 是否相同
function extentEquals(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

/**
 * 获取地形数据（带缓存）
 */
export async function getTerrainData(
  extent: [number, number, number, number]
): Promise<TerrainData | null> {
  // 如果缓存命中，直接返回
  if (cachedExtent.value && cachedData.value && extentEquals(cachedExtent.value, extent)) {
    return cachedData.value
  }

  // 如果正在加载相同的数据，等待完成
  if (isLoading.value && loadingPromise.value && cachedExtent.value && extentEquals(cachedExtent.value, extent)) {
    return loadingPromise.value
  }

  // 开始新的加载
  isLoading.value = true
  cachedExtent.value = extent

  loadingPromise.value = (async () => {
    try {
      // 将 EPSG:3857 坐标转换为经纬度
      const [lonMin, latMin] = mercatorToLatLon(extent[0], extent[1])
      const [lonMax, latMax] = mercatorToLatLon(extent[2], extent[3])
      const extentLonLat: [number, number, number, number] = [lonMin, latMin, lonMax, latMax]

      let elevationData: Int16Array
      let width: number
      let height: number

      // 优先使用后端 API
      const apiAvailable = await checkDemService()

      if (apiAvailable) {
        const result = await fetchDemClip(extentLonLat, 128, 128)
        elevationData = new Int16Array(result.elevation)
        width = result.width
        height = result.height
      } else {
        // Fallback: 前端直接加载 tif
        await loadTifMeta()
        const tifMeta = findTifForExtent(extentLonLat)
        
        if (!tifMeta || !tifMeta.image) {
          return null
        }

        const { image, bbox, pixelWidth, pixelHeight, width: imgWidth, height: imgHeight } = tifMeta
        const [imgMinX, imgMinY, imgMaxX, imgMaxY] = bbox
        const [extMinX, extMinY, extMaxX, extMaxY] = extentLonLat

        const clampedMinX = Math.max(extMinX, imgMinX)
        const clampedMinY = Math.max(extMinY, imgMinY)
        const clampedMaxX = Math.min(extMaxX, imgMaxX)
        const clampedMaxY = Math.min(extMaxY, imgMaxY)

        const windowMinX = Math.max(0, Math.floor((clampedMinX - imgMinX) / pixelWidth))
        const windowMaxX = Math.min(imgWidth, Math.ceil((clampedMaxX - imgMinX) / pixelWidth))
        const windowMinY = Math.max(0, Math.floor((imgMaxY - clampedMaxY) / pixelHeight))
        const windowMaxY = Math.min(imgHeight, Math.ceil((imgMaxY - clampedMinY) / pixelHeight))

        if (windowMaxX <= windowMinX || windowMaxY <= windowMinY) {
          return null
        }

        const targetSize = 128
        const sampleWidth = Math.min(windowMaxX - windowMinX, targetSize)
        const sampleHeight = Math.min(windowMaxY - windowMinY, targetSize)

        const rasters = await image.readRasters({
          window: [windowMinX, windowMinY, windowMaxX, windowMaxY],
          width: sampleWidth,
          height: sampleHeight,
        })

        elevationData = rasters[0] as Int16Array
        width = sampleWidth
        height = sampleHeight
      }

      // 计算高程统计
      let minElev = Infinity
      let maxElev = -Infinity
      for (let i = 0; i < elevationData.length; i++) {
        if (elevationData[i] !== -32767) {
          minElev = Math.min(minElev, elevationData[i])
          maxElev = Math.max(maxElev, elevationData[i])
        }
      }
      const elevRange = maxElev - minElev || 1

      const data: TerrainData = {
        elevationData,
        width,
        height,
        extentLonLat,
        minElev: minElev === Infinity ? 0 : minElev,
        maxElev: maxElev === -Infinity ? 0 : maxElev,
        elevRange,
      }

      cachedData.value = data
      return data
    } catch {
      return null
    } finally {
      isLoading.value = false
    }
  })()

  return loadingPromise.value
}

/**
 * 清除缓存
 */
export function clearTerrainCache() {
  cachedExtent.value = null
  cachedData.value = null
  isLoading.value = false
  loadingPromise.value = null
}

/**
 * 获取缓存状态
 */
export function useTerrainCache() {
  return {
    cachedExtent,
    cachedData,
    isLoading,
    getTerrainData,
    clearTerrainCache,
  }
}
