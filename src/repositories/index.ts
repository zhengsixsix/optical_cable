import type { ILayerRepository, IRouteRepository, IGeoRepository } from './interfaces'
import { MockLayerRepository } from './mock/MockLayerRepository'
import { MockRouteRepository } from './mock/MockRouteRepository'
import { MockGeoRepository } from './mock/MockGeoRepository'

// 仓库工厂 - 当前使用 Mock 实现，未来可切换到真实 API
export function createLayerRepository(): ILayerRepository {
  return new MockLayerRepository()
}

export function createRouteRepository(): IRouteRepository {
  return new MockRouteRepository()
}

export function createGeoRepository(): IGeoRepository {
  return new MockGeoRepository()
}

// 导出接口和实现
export * from './interfaces'
export { MockLayerRepository } from './mock/MockLayerRepository'
export { MockRouteRepository } from './mock/MockRouteRepository'
export { MockGeoRepository } from './mock/MockGeoRepository'
