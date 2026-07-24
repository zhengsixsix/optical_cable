import { ref, shallowRef } from 'vue'
import { fetchDemClip, checkDemService } from '@/services/DemApiService'

export interface TerrainData {
  elevationData: Int16Array
  width: number
  height: number
  extentLonLat: [number, number, number, number]
  minElev: number
  maxElev: number
  elevRange: number
}

const cachedExtent = ref<[number, number, number, number] | null>(null)
const cachedData = shallowRef<TerrainData | null>(null)
const isLoading = ref(false)
const loadingPromise = ref<Promise<TerrainData | null> | null>(null)

function extentEquals(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

function mercatorToLatLon(x: number, y: number): [number, number] {
  const lon = (x / 20037508.34) * 180
  let lat = (y / 20037508.34) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return [lon, lat]
}

function calculateElevationStats(elevationData: Int16Array): { minElev: number; maxElev: number; elevRange: number } {
  let minElev = Infinity
  let maxElev = -Infinity

  for (let i = 0; i < elevationData.length; i++) {
    if (elevationData[i] !== -32767) {
      minElev = Math.min(minElev, elevationData[i])
      maxElev = Math.max(maxElev, elevationData[i])
    }
  }

  const normalizedMin = minElev === Infinity ? 0 : minElev
  const normalizedMax = maxElev === -Infinity ? 0 : maxElev

  return {
    minElev: normalizedMin,
    maxElev: normalizedMax,
    elevRange: normalizedMax - normalizedMin || 1,
  }
}

export async function getTerrainData(
  extent: [number, number, number, number],
): Promise<TerrainData | null> {
  if (cachedExtent.value && cachedData.value && extentEquals(cachedExtent.value, extent)) {
    return cachedData.value
  }

  if (isLoading.value && loadingPromise.value && cachedExtent.value && extentEquals(cachedExtent.value, extent)) {
    return loadingPromise.value
  }

  isLoading.value = true
  cachedExtent.value = extent

  loadingPromise.value = (async () => {
    try {
      const [lonMin, latMin] = mercatorToLatLon(extent[0], extent[1])
      const [lonMax, latMax] = mercatorToLatLon(extent[2], extent[3])
      const extentLonLat: [number, number, number, number] = [lonMin, latMin, lonMax, latMax]

      const apiAvailable = await checkDemService()
      if (!apiAvailable) return null

      const result = await fetchDemClip(extentLonLat, 128, 128)
      const elevationData = new Int16Array(result.elevation)
      const stats = calculateElevationStats(elevationData)
      const data: TerrainData = {
        elevationData,
        width: result.width,
        height: result.height,
        extentLonLat,
        ...stats,
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

function clearTerrainCache() {
  cachedExtent.value = null
  cachedData.value = null
  isLoading.value = false
  loadingPromise.value = null
}

export function useTerrainCache() {
  return {
    cachedExtent,
    cachedData,
    isLoading,
    getTerrainData,
    clearTerrainCache,
  }
}
