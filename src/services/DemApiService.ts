/**
 * DEM API 客户端服务
 * 线上 Swagger 当前未提供 DEM 相关接口；调用方应使用本地数据回退或保持空态。
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

/**
 * 获取所有DEM元数据
 */
export async function fetchDemMeta(): Promise<DemMeta[]> {
  return []
}

/**
 * 裁剪获取区域高程数据
 * @param bbox 经纬度边界 [minX, minY, maxX, maxY]
 * @param width 输出宽度（默认128）
 * @param height 输出高度（默认128）
 */
export async function fetchDemClip(
  _bbox: [number, number, number, number],
  _width = 128,
  _height = 128
): Promise<DemClipResult> {
  throw new Error('线上 Swagger 暂未提供 DEM 裁剪接口')
}

/**
 * 查询单点高程
 * @param lon 经度
 * @param lat 纬度
 */
export async function fetchDemPoint(lon: number, lat: number): Promise<DemPointResult> {
  return { lon, lat, elevation: 0 }
}

/**
 * 检查DEM服务是否可用
 */
export async function checkDemService(): Promise<boolean> {
  return false
}

/**
 * 获取DEM API基础地址
 */
export function getDemApiBase(): string {
  return ''
}
