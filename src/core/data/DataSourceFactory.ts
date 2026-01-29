import type { IDataSource } from './DataSource'
import { MockDataSource } from './sources/MockDataSource'
import { ApiDataSource } from './sources/ApiDataSource'

/**
 * 数据源工厂
 * 根据环境变量切换 Mock/API 数据源
 */

let dataSourceInstance: IDataSource | null = null

export function getDataSource(): IDataSource {
  if (!dataSourceInstance) {
    // 根据环境变量决定使用哪个数据源
    const useMock = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.DEV

    if (useMock) {
      dataSourceInstance = new MockDataSource()
    } else {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      dataSourceInstance = new ApiDataSource(apiUrl)
    }
  }

  return dataSourceInstance
}

// 用于测试：重置数据源实例
export function resetDataSource(): void {
  dataSourceInstance = null
}

// 用于测试：设置自定义数据源
export function setDataSource(source: IDataSource): void {
  dataSourceInstance = source
}
