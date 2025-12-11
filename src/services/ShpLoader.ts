import type { Feature } from 'ol'
import GeoJSON from 'ol/format/GeoJSON'

/**
 * SHP 数据加载器
 * 使用 Web Worker 在后台线程解析 SHP/ZIP 文件
 */
export class ShpLoader {
    private worker: Worker
    private pendingRequests: Map<string, { resolve: (data: any) => void, reject: (err: any) => void }>
    private geoJSONFormat: GeoJSON

    constructor() {
        // 初始化 Worker
        this.worker = new Worker(new URL('../workers/shp.worker.ts', import.meta.url), { type: 'module' })
        this.pendingRequests = new Map()
        this.geoJSONFormat = new GeoJSON()

        // 监听 Worker 消息
        this.worker.onmessage = (e) => {
            const { type, id, data, error } = e.data
            const request = this.pendingRequests.get(id)

            if (request) {
                if (type === 'success') {
                    request.resolve(data)
                } else {
                    request.reject(new Error(error))
                }
                this.pendingRequests.delete(id)
            }
        }
    }

    /**
     * 加载 SHP/ZIP 文件
     * @param url 文件 URL
     */
    async load(url: string): Promise<any> {
        const id = Math.random().toString(36).substring(7)
        // 转换为绝对 URL，避免 Worker 中解析相对路径出错
        const absoluteUrl = new URL(url, window.location.origin).href

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject })
            this.worker.postMessage({ url: absoluteUrl, id })
        })
    }

    /**
     * 将 GeoJSON 数据转换为 OpenLayers Features
     * @param geojsonData GeoJSON 数据
     */
    parseFeatures(geojsonData: any): Feature[] {
        const collections = Array.isArray(geojsonData) ? geojsonData : [geojsonData]

        return collections.flatMap(collection => {
            // 默认配置
            let dataProjection = 'EPSG:4326'

            // 简单的投影检测：检查第一个要素的坐标
            // 如果坐标值超出经纬度范围 (-180~180)，则假设为 Web Mercator (EPSG:3857)
            if (collection.features && collection.features.length > 0) {
                const firstFeature = collection.features[0]
                const geometry = firstFeature.geometry
                if (geometry && geometry.coordinates) {
                    let coord = geometry.coordinates
                    // 递归获取第一个数字坐标
                    while (Array.isArray(coord) && Array.isArray(coord[0])) {
                        coord = coord[0]
                    }
                    // coord 现在应该是 [x, y]
                    if (Array.isArray(coord) && (Math.abs(coord[0]) > 180 || Math.abs(coord[1]) > 90)) {
                        dataProjection = 'EPSG:3857'
                        console.log(`检测到 EPSG:3857 坐标 (例如: ${coord}), 将自动转换`)
                    } else {
                        console.log(`检测到 EPSG:4326 坐标 (例如: ${coord})`)
                    }
                }
            }

            return this.geoJSONFormat.readFeatures(collection, {
                dataProjection: dataProjection,
                featureProjection: 'EPSG:4326'
            })
        })
    }

    terminate() {
        this.worker.terminate()
    }
}

// 单例模式
let _shpLoader: ShpLoader | null = null

export function useShpLoader(): ShpLoader {
    if (!_shpLoader) {
        _shpLoader = new ShpLoader()
    }
    return _shpLoader
}
