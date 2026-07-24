// 坐标类型
export type Coordinate = [number, number]

// 范围类型 [minX, minY, maxX, maxY]
export type Extent = [number, number, number, number]

// 投影类型
export type Projection = 'EPSG:4326' | 'EPSG:3857'

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

