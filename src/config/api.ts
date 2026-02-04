/**
 * API 配置中心
 * 统一管理所有后端服务的 API 地址
 */

// 后端服务基础地址（通过环境变量配置，默认 localhost:3001）
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// API 端点配置
export const API_ENDPOINTS = {
  // 健康检查
  health: `${API_BASE_URL}/health`,
  
  // DEM 高程数据服务
  dem: {
    meta: `${API_BASE_URL}/api/dem/meta`,
    clip: `${API_BASE_URL}/api/dem/clip`,
    point: `${API_BASE_URL}/api/dem/point`,
    profile: `${API_BASE_URL}/api/dem/profile`,
  },
  
  // 路由规划服务
  route: {
    planning: `${API_BASE_URL}/api/route/planning`,
  },
  
  // GIS 共享数据服务
  gis: {
    shared: `${API_BASE_URL}/api/gis/shared`,
  },
} as const

/**
 * 获取 API 基础地址
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL
}

/**
 * 检查后端服务是否可用
 * @param timeoutMs 超时时间（毫秒），默认 3000
 */
export async function checkApiHealth(timeoutMs = 3000): Promise<boolean> {
  try {
    const response = await fetch(API_ENDPOINTS.health, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const result = await response.json()
    return result.status === 'ok'
  } catch {
    return false
  }
}
