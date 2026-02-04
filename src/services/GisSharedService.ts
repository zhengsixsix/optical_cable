/**
 * GIS 共享数据服务
 * 从服务器共享目录获取可用的GIS数据文件列表
 */

import { API_ENDPOINTS } from '@/config/api'

export interface SharedGisFile {
  name: string
  path: string
  ext: string
  size: number
  modifiedAt: string
}

export async function fetchSharedGisFiles(): Promise<SharedGisFile[]> {
  const response = await fetch(API_ENDPOINTS.gis.shared)
  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || '获取共享数据失败')
  }
  return result.data || []
}

