// 图层类型
export type LayerType = 'point' | 'heatmap' | 'raster' | 'vector' | 'both'

// 图层配置
export interface LayerConfig {
  id: string
  name: string
  type: LayerType
  visible: boolean
  loaded: boolean
  loading: boolean
  error?: boolean
  opacity?: number
  zIndex?: number
}

// 图层元数据
export interface LayerMetadata {
  source: string
  projection?: string
  extent?: [number, number, number, number]
  resolution?: number
  bands?: number
}

// 图层数据
export interface LayerData {
  id: string
  features?: GeoJSON.FeatureCollection
  rasterData?: ArrayBuffer
  metadata: LayerMetadata
}

// 火山数据
export interface VolcanoData {
  latitude: number
  longitude: number
}

// 地震数据
export interface EarthquakeData {
  latitude: number
  longitude: number
  magnitude: number
}
