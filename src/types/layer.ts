import type { GeoJSON } from './map'
import type { GisLayerFormat, GisLayerKind, GisLoadStrategy } from '@/utils/gisFormat'

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
  fileName?: string
  extension?: string
  gisFormat?: GisLayerFormat
  gisKind?: GisLayerKind
  loadStrategy?: GisLoadStrategy
  supported?: boolean
  attachmentId?: number | string | null
  attachmentName?: string | null
  platformLayerId?: number | string | null
  typeDic?: string | null
  downloadUrl?: string | null
  wmsUrl?: string
  wmsLayerName?: string
}

// 图层数据
export interface LayerData {
  id: string
  features?: GeoJSON.FeatureCollection
  rasterData?: ArrayBuffer
  metadata: LayerMetadata
}
