import type { GeoTiffData, ElevationData, Extent, ImportResult, ExportFormat, Route, GeoJSON } from '@/types'
import type { IGeoRepository } from '@/repositories'
import { createGeoRepository } from '@/repositories'

/**
 * 地理数据业务服务
 * 封装 GeoTIFF 加载、高程数据处理、导入导出等功能
 */
export class GeoService {
    private repository: IGeoRepository

    constructor(repository?: IGeoRepository) {
        this.repository = repository ?? createGeoRepository()
    }

    /**
     * 加载 GeoTIFF 地形数据
     * @param url 文件URL或路径
     */
    async loadTerrain(url: string): Promise<GeoTiffData> {
        try {
            const data = await this.repository.loadGeoTiff(url)
            return data
        } catch (error) {
            console.error('加载地形数据失败:', error)
            throw new Error('无法加载地形数据')
        }
    }

    /**
     * 获取指定范围的高程数据
     * @param extent 范围 [minX, minY, maxX, maxY]
     */
    async getElevationProfile(extent: Extent): Promise<ElevationData> {
        try {
            const data = await this.repository.getElevationData(extent)
            return data
        } catch (error) {
            console.error('获取高程数据失败:', error)
            throw new Error('无法获取高程数据')
        }
    }

    /**
     * 导入 GIS 文件
     * 支持 GeoJSON, KML, Shapefile 等格式
     * @param file 文件对象
     */
    async importFile(file: File): Promise<ImportResult> {
        try {
            // 验证文件类型
            const validTypes = ['.geojson', '.json', '.kml', '.kmz', '.shp', '.tif', '.tiff']
            const ext = '.' + file.name.split('.').pop()?.toLowerCase()

            if (!validTypes.includes(ext)) {
                return {
                    success: false,
                    message: '不支持的文件格式',
                    errors: [`支持的格式: ${validTypes.join(', ')}`]
                }
            }

            const result = await this.repository.importGisFile(file)
            return result
        } catch (error) {
            console.error('导入文件失败:', error)
            return {
                success: false,
                message: '导入失败',
                errors: [(error as Error).message]
            }
        }
    }

    /**
     * 导出路由数据
     * @param routeId 路由ID
     * @param format 导出格式
     */
    async exportRoute(routeId: string, format: ExportFormat): Promise<Blob> {
        try {
            const blob = await this.repository.exportRouteData(routeId, format)
            return blob
        } catch (error) {
            console.error(`导出路由 ${routeId} 失败:`, error)
            throw new Error('导出路由数据失败')
        }
    }

    /**
     * 触发文件下载
     * @param blob 数据Blob
     * @param filename 文件名
     */
    downloadFile(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    /**
     * 将路由转换为 GeoJSON
     * @param route 路由数据
     */
    routeToGeoJSON(route: Route): GeoJSON.FeatureCollection {
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
                    name: point.name
                }
            })
        }

        // 添加线要素 (连接所有点)
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

        return {
            type: 'FeatureCollection',
            features
        }
    }

    /**
     * 高程数据归一化
     * @param data 高程数据
     * @param min 目标最小值
     * @param max 目标最大值
     */
    normalizeElevation(data: ElevationData, min = 0, max = 1): Float32Array {
        const range = data.maxValue - data.minValue
        const normalized = new Float32Array(data.values.length)

        for (let i = 0; i < data.values.length; i++) {
            const value = data.values[i]
            normalized[i] = ((value - data.minValue) / range) * (max - min) + min
        }

        return normalized
    }

    /**
     * 高程值转换为颜色
     * 使用海洋学常用的配色方案
     * @param value 归一化后的高程值 (0-1)
     */
    elevationToColor(value: number): [number, number, number] {
        // 深海到浅海的渐变色
        const colors = [
            [0, 0, 80],      // 深海 - 深蓝
            [0, 50, 150],    // 中深海 - 蓝色
            [0, 100, 200],   // 浅海 - 浅蓝
            [100, 200, 255], // 近岸 - 浅青
            [200, 255, 200], // 沿海 - 浅绿
        ]

        const idx = Math.min(Math.floor(value * (colors.length - 1)), colors.length - 2)
        const t = (value * (colors.length - 1)) - idx

        const c1 = colors[idx]
        const c2 = colors[idx + 1]

        return [
            Math.round(c1[0] + (c2[0] - c1[0]) * t),
            Math.round(c1[1] + (c2[1] - c1[1]) * t),
            Math.round(c1[2] + (c2[2] - c1[2]) * t)
        ]
    }
}

// 创建单例实例
let _geoService: GeoService | null = null

export function useGeoService(): GeoService {
    if (!_geoService) {
        _geoService = new GeoService()
    }
    return _geoService
}
