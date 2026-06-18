/**
 * GIS 共享数据服务
 * 线上 Swagger 当前未提供共享 GIS 文件接口；调用方应保持空列表。
 */

export interface SharedGisFile {
  name: string
  path: string
  ext: string
  size: number
  modifiedAt: string
}

export async function fetchSharedGisFiles(): Promise<SharedGisFile[]> {
  return []
}
