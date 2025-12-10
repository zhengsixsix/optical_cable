// 坐标类型
export type Coordinate = [number, number]

// 范围类型 [minX, minY, maxX, maxY]
export type Extent = [number, number, number, number]

// 投影类型
export type Projection = 'EPSG:4326' | 'EPSG:3857'

// 地图状态
export interface MapState {
  center: Coordinate
  zoom: number
  projection: Projection
  extent: Extent | null
  selectedExtent: Extent | null
}

// 地图工具模式
export type ToolMode = 'select' | 'pan' | 'draw'

// GeoTIFF 数据
export interface GeoTiffData {
  rasters: ArrayBuffer[]
  width: number
  height: number
  bbox: Extent
  noDataValue?: number
}

// 高程数据
export interface ElevationData {
  values: Float32Array | Int16Array
  width: number
  height: number
  minValue: number
  maxValue: number
}

// GeoJSON 类型定义
export namespace GeoJSON {
  export interface Feature {
    type: 'Feature'
    geometry: Geometry
    properties: Record<string, unknown>
  }

  export interface FeatureCollection {
    type: 'FeatureCollection'
    features: Feature[]
  }

  export type Geometry = Point | LineString | Polygon | MultiPoint | MultiLineString | MultiPolygon

  export interface Point {
    type: 'Point'
    coordinates: [number, number]
  }

  export interface LineString {
    type: 'LineString'
    coordinates: [number, number][]
  }

  export interface Polygon {
    type: 'Polygon'
    coordinates: [number, number][][]
  }

  export interface MultiPoint {
    type: 'MultiPoint'
    coordinates: [number, number][]
  }

  export interface MultiLineString {
    type: 'MultiLineString'
    coordinates: [number, number][][]
  }

  export interface MultiPolygon {
    type: 'MultiPolygon'
    coordinates: [number, number][][][]
  }
}

