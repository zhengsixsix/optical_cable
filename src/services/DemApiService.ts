/**
 * DEM API 客户端服务
 * 调用后端Node服务获取高程数据，替代前端直接下载tif文件
 */

export interface DemMeta {
  filename: string
  bbox: [number, number, number, number]
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
}

export interface DemClipResult {
  width: number
  height: number
  bbox: [number, number, number, number]
  minElev: number
  maxElev: number
  elevation: number[]
}

export interface DemPointResult {
  lon: number
  lat: number
  elevation: number
}

// DEM API 服务地址（可通过环境变量配置）
const DEM_API_BASE = import.meta.env.VITE_DEM_API_URL || 'http://localhost:3001'

/**
 * 获取所有DEM元数据
 */
export async function fetchDemMeta(): Promise<DemMeta[]> {
  const response = await fetch(`${DEM_API_BASE}/api/dem/meta`)
  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || '获取DEM元数据失败')
  }
  return result.data
}

/**
 * 裁剪获取区域高程数据
 * @param bbox 经纬度边界 [minX, minY, maxX, maxY]
 * @param width 输出宽度（默认128）
 * @param height 输出高度（默认128）
 */
export async function fetchDemClip(
  bbox: [number, number, number, number],
  width = 128,
  height = 128
): Promise<DemClipResult> {
  const [minX, minY, maxX, maxY] = bbox
  const url = `${DEM_API_BASE}/api/dem/clip?minX=${minX}&minY=${minY}&maxX=${maxX}&maxY=${maxY}&width=${width}&height=${height}`
  
  const response = await fetch(url)
  const result = await response.json()
  
  if (!result.success) {
    throw new Error(result.error || '裁剪DEM数据失败')
  }
  return result.data
}

/**
 * 查询单点高程
 * @param lon 经度
 * @param lat 纬度
 */
export async function fetchDemPoint(lon: number, lat: number): Promise<DemPointResult> {
  const url = `${DEM_API_BASE}/api/dem/point?lon=${lon}&lat=${lat}`
  
  const response = await fetch(url)
  const result = await response.json()
  
  if (!result.success) {
    throw new Error(result.error || '查询高程失败')
  }
  return result.data
}

/**
 * 检查DEM服务是否可用
 */
export async function checkDemService(): Promise<boolean> {
  try {
    const response = await fetch(`${DEM_API_BASE}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3秒超时
    })
    const result = await response.json()
    return result.status === 'ok'
  } catch {
    return false
  }
}

/**
 * 获取DEM API基础地址
 */
export function getDemApiBase(): string {
  return DEM_API_BASE
}
