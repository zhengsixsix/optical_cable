import type { IGeoRepository } from '../interfaces'
import type { ElevationData, ExportFormat, Extent, GeoJSON, GeoTiffData, ImportResult } from '@/types'

/**
 * GIS repository placeholder.
 * It parses user-provided GIS files, but does not synthesize route fixture data.
 */
export class MockGeoRepository implements IGeoRepository {
  async loadGeoTiff(_url: string): Promise<GeoTiffData> {
    return {
      rasters: [],
      width: 0,
      height: 0,
      bbox: [0, 0, 0, 0],
    }
  }

  async getElevationData(_extent: Extent): Promise<ElevationData> {
    return {
      values: new Float32Array(0),
      width: 0,
      height: 0,
      minValue: 0,
      maxValue: 0,
    }
  }

  async importGisFile(file: File): Promise<ImportResult> {
    try {
      const text = await file.text()
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (ext === 'geojson' || ext === 'json') {
        const geojson = JSON.parse(text) as GeoJSON.FeatureCollection
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
          return {
            success: false,
            message: '无效的 GeoJSON 格式',
            errors: ['文件必须是 FeatureCollection 类型'],
          }
        }

        const pointCount = geojson.features.filter(f => f.geometry.type === 'Point').length
        const lineCount = geojson.features.filter(f => f.geometry.type === 'LineString').length
        return {
          success: true,
          message: `成功导入 ${geojson.features.length} 个要素（${pointCount} 个点，${lineCount} 条线）`,
          data: geojson,
        }
      }

      if (ext === 'kml') {
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'text/xml')
        const placemarks = doc.querySelectorAll('Placemark')
        return {
          success: true,
          message: `成功导入 ${placemarks.length} 个地标`,
          data: { placemarkCount: placemarks.length },
        }
      }

      if (ext === 'csv') {
        const lines = text.split('\n').filter(line => line.trim())
        return {
          success: true,
          message: `成功导入 ${Math.max(0, lines.length - 1)} 条记录`,
          data: { recordCount: Math.max(0, lines.length - 1) },
        }
      }

      return {
        success: false,
        message: '不支持的文件格式',
        errors: [`不支持的扩展名: .${ext ?? ''}`],
      }
    } catch (error) {
      return {
        success: false,
        message: '文件解析失败',
        errors: [(error as Error).message],
      }
    }
  }

  async exportRouteData(routeId: string, format: ExportFormat): Promise<Blob> {
    throw new Error(`路由导出需要真实路由数据源: ${routeId}, ${format}`)
  }
}
