import type { GeoJSON, ImportResult } from '@/types'
import GeoJSONFormat from 'ol/format/GeoJSON'
import type Geometry from 'ol/geom/Geometry'
import type GeometryCollection from 'ol/geom/GeometryCollection'
import type MultiLineString from 'ol/geom/MultiLineString'
import type MultiPolygon from 'ol/geom/MultiPolygon'
import type Polygon from 'ol/geom/Polygon'
import type SimpleGeometry from 'ol/geom/SimpleGeometry'

const geoJSONFormat = new GeoJSONFormat()

function hasValidFlatCoordinates(geometry: SimpleGeometry, minimumPositions: number): boolean {
  const stride = geometry.getStride()
  const coordinates = geometry.getFlatCoordinates()
  return stride >= 2
    && coordinates.length >= stride * minimumPositions
    && coordinates.length % stride === 0
    && coordinates.every(Number.isFinite)
}

function hasValidGeometry(geometry: Geometry | null | undefined): boolean {
  if (!geometry) return true
  switch (geometry.getType()) {
    case 'GeometryCollection':
      return (geometry as GeometryCollection).getGeometries().every(hasValidGeometry)
    case 'Point':
    case 'MultiPoint':
      return hasValidFlatCoordinates(geometry as SimpleGeometry, 1)
    case 'LineString':
      return hasValidFlatCoordinates(geometry as SimpleGeometry, 2)
    case 'LinearRing':
      return hasValidFlatCoordinates(geometry as SimpleGeometry, 4)
    case 'Polygon': {
      const rings = (geometry as Polygon).getLinearRings()
      return rings.length > 0 && rings.every(hasValidGeometry)
    }
    case 'MultiLineString': {
      const lines = (geometry as MultiLineString).getLineStrings()
      return lines.length > 0 && lines.every(hasValidGeometry)
    }
    case 'MultiPolygon': {
      const polygons = (geometry as MultiPolygon).getPolygons()
      return polygons.length > 0 && polygons.every(hasValidGeometry)
    }
    default:
      return false
  }
}

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection {
  if (!value || typeof value !== 'object') return false
  const collection = value as Record<string, unknown>
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return false

  try {
    const features = geoJSONFormat.readFeatures(collection, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326',
    })
    return features.length === collection.features.length
      && features.every(feature => hasValidGeometry(feature.getGeometry()))
  } catch {
    return false
  }
}

/**
 * 地理数据业务服务
 * 封装用户提供的 GIS 文件解析。
 */
export class GeoService {
  async importFile(file: File): Promise<ImportResult> {
    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
    if (extension !== '.geojson' && extension !== '.json') {
      return {
        success: false,
        message: '不支持的文件格式',
        errors: ['支持的格式: .geojson, .json'],
      }
    }

    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isFeatureCollection(parsed)) {
        return {
          success: false,
          message: '无效的 GeoJSON 格式',
          errors: ['文件必须是有效的 GeoJSON FeatureCollection'],
        }
      }

      const geojson = parsed
      const pointCount = geojson.features.filter(feature => feature.geometry?.type === 'Point').length
      const lineCount = geojson.features.filter(feature => feature.geometry?.type === 'LineString').length
      return {
        success: true,
        message: `成功解析 ${geojson.features.length} 个要素（${pointCount} 个点，${lineCount} 条线）`,
        data: geojson,
      }
    } catch (error) {
      return {
        success: false,
        message: 'GeoJSON 解析失败',
        errors: [(error as Error).message],
      }
    }
  }
}

let _geoService: GeoService | null = null

export function useGeoService(): GeoService {
  if (!_geoService) {
    _geoService = new GeoService()
  }
  return _geoService
}
