import type {IGeoRepository} from '../interfaces'
import type {GeoTiffData, ElevationData, Extent, ImportResult, ExportFormat, Route, GeoJSON} from '@/types'
import {createRouteRepository} from '../index'

/**
 * MockGeoRepository
 * 实现 GIS 文件的导入导出功能
 */
export class MockGeoRepository implements IGeoRepository {
    async loadGeoTiff(url: string): Promise<GeoTiffData> {
        await new Promise(resolve => setTimeout(resolve, 500))

        // 返回模拟数据
        return {
            rasters: [],
            width: 1024,
            height: 1024,
            bbox: [-180, -90, 180, 90],
        }
    }

    async getElevationData(extent: Extent): Promise<ElevationData> {
        await new Promise(resolve => setTimeout(resolve, 200))

        const width = 128
        const height = 128
        const values = new Float32Array(width * height)

        // 生成模拟高程数据
        for (let i = 0; i < values.length; i++) {
            values[i] = Math.random() * 8000 - 6000 // -6000 到 2000
        }

        return {
            values,
            width,
            height,
            minValue: -6000,
            maxValue: 2000,
        }
    }

    /**
     * 导入 GIS 文件
     * 支持 GeoJSON 和 JSON 格式的解析
     */
    async importGisFile(file: File): Promise<ImportResult> {
        try {
            const text = await file.text()
            const ext = file.name.split('.').pop()?.toLowerCase()

            if (ext === 'geojson' || ext === 'json') {
                const geojson = JSON.parse(text) as GeoJSON.FeatureCollection

                // 验证 GeoJSON 格式
                if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
                    return {
                        success: false,
                        message: '无效的 GeoJSON 格式',
                        errors: ['文件必须是 FeatureCollection 类型']
                    }
                }

                const featureCount = geojson.features.length
                const pointCount = geojson.features.filter(f => f.geometry.type === 'Point').length
                const lineCount = geojson.features.filter(f => f.geometry.type === 'LineString').length

                return {
                    success: true,
                    message: `成功导入 ${featureCount} 个要素 (${pointCount} 个点, ${lineCount} 条线)`,
                    data: geojson
                }
            }

            if (ext === 'kml') {
                // KML 简单解析（提取坐标）
                const parser = new DOMParser()
                const doc = parser.parseFromString(text, 'text/xml')
                const placemarks = doc.querySelectorAll('Placemark')

                return {
                    success: true,
                    message: `成功导入 ${placemarks.length} 个地标`,
                    data: {placemarkCount: placemarks.length}
                }
            }

            if (ext === 'csv') {
                const lines = text.split('\n').filter(l => l.trim())
                return {
                    success: true,
                    message: `成功导入 ${lines.length - 1} 条记录`,
                    data: {recordCount: lines.length - 1}
                }
            }

            return {
                success: false,
                message: '不支持的文件格式',
                errors: [`不支持的扩展名: .${ext}`]
            }
        } catch (error) {
            return {
                success: false,
                message: '文件解析失败',
                errors: [(error as Error).message]
            }
        }
    }

    /**
     * 导出路由数据
     * 支持 GeoJSON、KML、CSV 格式
     */
    async exportRouteData(routeId: string, format: ExportFormat): Promise<Blob> {
        const routeRepo = createRouteRepository()
        const route = await routeRepo.getRouteById(routeId)

        if (!route) {
            throw new Error(`未找到路由: ${routeId}`)
        }

        switch (format) {
            case 'geojson':
            case 'json':
                return this.toGeoJSON(route)
            case 'kml':
                return this.toKML(route)
            case 'csv':
                return this.toCSV(route)
            default:
                throw new Error(`不支持的导出格式: ${format}`)
        }
    }

    /**
     * 转换为 GeoJSON 格式
     */
    private toGeoJSON(route: Route): Blob {
        const features: GeoJSON.Feature[] = []

        // 添加点要素
        for (const point of route.points) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: point.coordinates
                },
                properties: {
                    id: point.id,
                    type: point.type,
                    name: point.name || ''
                }
            })
        }

        // 添加线要素
        if (route.points.length >= 2) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: route.points.map(p => p.coordinates)
                },
                properties: {
                    id: route.id,
                    name: route.name,
                    totalLength: route.totalLength,
                    totalCost: route.totalCost
                }
            })
        }

        const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features
        }

        return new Blob([JSON.stringify(geojson, null, 2)], {type: 'application/geo+json'})
    }

    /**
     * 转换为 KML 格式
     */
    private toKML(route: Route): Blob {
        const coordinates = route.points.map(p => `${p.coordinates[0]},${p.coordinates[1]},0`).join(' ')

        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${route.name}</name>
    <description>总长度: ${route.totalLength.toFixed(1)} km, 总成本: $${(route.totalCost / 1000000).toFixed(2)}M</description>
    <Placemark>
      <name>${route.name}</name>
      <LineString>
        <coordinates>${coordinates}</coordinates>
      </LineString>
    </Placemark>
    ${route.points.map(p => `
    <Placemark>
      <name>${p.name || p.type}</name>
      <Point>
        <coordinates>${p.coordinates[0]},${p.coordinates[1]},0</coordinates>
      </Point>
    </Placemark>`).join('')}
  </Document>
</kml>`

        return new Blob([kml], {type: 'application/vnd.google-earth.kml+xml'})
    }

    /**
     * 转换为 CSV 格式
     */
    private toCSV(route: Route): Blob {
        const headers = ['点ID', '点类型', '名称', '经度', '纬度']
        const rows = route.points.map(p => [
            p.id,
            p.type,
            p.name || '',
            p.coordinates[0].toFixed(6),
            p.coordinates[1].toFixed(6)
        ])

        const csv = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n')

        return new Blob([csv], {type: 'text/csv'})
    }
}

