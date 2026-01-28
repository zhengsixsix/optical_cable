import { Vector as VectorSource } from 'ol/source'
import { Vector as VectorLayer } from 'ol/layer'
import WebGLPointsLayer from 'ol/layer/WebGLPoints'
import { Style, Stroke, Fill } from 'ol/style'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import BaseLayer from 'ol/layer/Base'

/**
 * 通用的要素分离函数：将 Multi* 类型拆分为单个要素
 */
function separateFeatures(features: Feature[]): {
    pointFeatures: Feature[]
    lineFeatures: Feature[]
    polygonFeatures: Feature[]
} {
    const pointFeatures: Feature[] = []
    const lineFeatures: Feature[] = []
    const polygonFeatures: Feature[] = []

    features.forEach(f => {
        const geometry = f.getGeometry()
        const type = geometry?.getType()

        if (type === 'Point') {
            pointFeatures.push(f)
        } else if (type === 'MultiPoint') {
            const coordinates = (geometry as any).getCoordinates()
            coordinates.forEach((coord: any) => {
                const pointFeature = new Feature({
                    geometry: new Point(coord),
                    ...f.getProperties()
                })
                pointFeatures.push(pointFeature)
            })
        } else if (type === 'LineString') {
            lineFeatures.push(f)
        } else if (type === 'MultiLineString') {
            const coordinates = (geometry as any).getCoordinates()
            coordinates.forEach((coords: any) => {
                const lineFeature = new Feature({
                    geometry: new LineString(coords),
                    ...f.getProperties()
                })
                lineFeatures.push(lineFeature)
            })
        } else if (type === 'Polygon' || type === 'MultiPolygon') {
            polygonFeatures.push(f)
        }
    })

    return { pointFeatures, lineFeatures, polygonFeatures }
}

/**
 * 创建冷水珊瑚图层组
 * @param features 所有解析出的要素
 * @returns 图层数组 [点图层, 面图层]
 */
export function createColdCoralLayers(features: Feature[]): BaseLayer[] {
    const layers: BaseLayer[] = []

    // 分离点和面要素，并将 MultiPoint 拆分为单个 Point
    const pointFeatures: Feature[] = []
    const polygonFeatures: Feature[] = []

    features.forEach(f => {
        const geometry = f.getGeometry()
        const type = geometry?.getType()

        if (type === 'Point') {
            pointFeatures.push(f)
        } else if (type === 'MultiPoint') {
            // 拆分 MultiPoint 为多个 Point 要素
            const coordinates = (geometry as any).getCoordinates()
            coordinates.forEach((coord: any) => {
                const pointFeature = new Feature({
                    geometry: new Point(coord),
                    // 复制属性
                    ...f.getProperties()
                })
                pointFeatures.push(pointFeature)
            })
        } else {
            polygonFeatures.push(f)
        }
    })

    // 1. 创建点图层 (WebGL 高性能渲染)
    if (pointFeatures.length > 0) {
        const pointSource = new VectorSource({ features: pointFeatures })

        const pointStyle = {
            'circle-radius': 3,
            'circle-fill-color': 'rgba(255, 105, 180, 0.8)', // 珊瑚粉色
            'circle-stroke-color': 'rgba(255, 255, 255, 0.5)',
            'circle-stroke-width': 0.5,
        }

        const pointLayer = new WebGLPointsLayer({
            source: pointSource,
            style: pointStyle,
            zIndex: 90,
            visible: true
        })

        layers.push(pointLayer)
    }

    // 2. 创建面图层 (Vector)
    if (polygonFeatures.length > 0) {
        const polygonSource = new VectorSource({ features: polygonFeatures })

        const polygonLayer = new VectorLayer({
            source: polygonSource,
            style: new Style({
                fill: new Fill({ color: 'rgba(0, 255, 127, 0.6)' }), // 春绿色
                stroke: new Stroke({ color: '#006400', width: 1 })
            }),
            zIndex: 89,
            visible: true
        })

        layers.push(polygonLayer)
    }

    return layers
}

/**
 * 创建海洋渔区图层组
 * @param features 所有解析出的要素
 * @returns 图层数组
 */
export function createFishingLayers(features: Feature[]): BaseLayer[] {
    const layers: BaseLayer[] = []
    const { pointFeatures, lineFeatures, polygonFeatures } = separateFeatures(features)

    // 1. 创建点图层 (WebGL 高性能渲染) - 渔场标记
    if (pointFeatures.length > 0) {
        const pointSource = new VectorSource({ features: pointFeatures })

        const pointStyle = {
            'circle-radius': 5,
            'circle-fill-color': 'rgba(0, 191, 255, 0.8)', // 深天蓝色
            'circle-stroke-color': 'rgba(255, 255, 255, 0.8)',
            'circle-stroke-width': 1,
        }

        const pointLayer = new WebGLPointsLayer({
            source: pointSource,
            style: pointStyle,
            zIndex: 85,
            visible: true
        })

        layers.push(pointLayer)
    }

    // 2. 创建面图层 - 渔区范围
    if (polygonFeatures.length > 0) {
        const polygonSource = new VectorSource({ features: polygonFeatures })

        const polygonLayer = new VectorLayer({
            source: polygonSource,
            style: new Style({
                fill: new Fill({ color: 'rgba(0, 191, 255, 0.3)' }), // 半透明天蓝色
                stroke: new Stroke({ color: '#1e90ff', width: 2 }) // 道奇蓝边框
            }),
            zIndex: 84,
            visible: true
        })

        layers.push(polygonLayer)
    }

    // 3. 创建线图层 - 渔区边界线
    if (lineFeatures.length > 0) {
        const lineSource = new VectorSource({ features: lineFeatures })

        const lineLayer = new VectorLayer({
            source: lineSource,
            style: new Style({
                stroke: new Stroke({ 
                    color: '#1e90ff', 
                    width: 2,
                    lineDash: [5, 3]
                })
            }),
            zIndex: 84,
            visible: true
        })

        layers.push(lineLayer)
    }

    return layers
}

/**
 * 创建航道分布图层组
 * @param features 所有解析出的要素
 * @returns 图层数组
 */
export function createShippingLayers(features: Feature[]): BaseLayer[] {
    const layers: BaseLayer[] = []
    const { pointFeatures, lineFeatures, polygonFeatures } = separateFeatures(features)

    // 1. 创建线图层 - 航道线路
    if (lineFeatures.length > 0) {
        const lineSource = new VectorSource({ features: lineFeatures })

        const lineLayer = new VectorLayer({
            source: lineSource,
            style: new Style({
                stroke: new Stroke({ 
                    color: '#ff6b35', // 橙红色
                    width: 3
                })
            }),
            zIndex: 86,
            visible: true
        })

        layers.push(lineLayer)
    }

    // 2. 创建面图层 - 航道区域
    if (polygonFeatures.length > 0) {
        const polygonSource = new VectorSource({ features: polygonFeatures })

        const polygonLayer = new VectorLayer({
            source: polygonSource,
            style: new Style({
                fill: new Fill({ color: 'rgba(255, 107, 53, 0.25)' }), // 半透明橙色
                stroke: new Stroke({ color: '#ff6b35', width: 2 })
            }),
            zIndex: 85,
            visible: true
        })

        layers.push(polygonLayer)
    }

    // 3. 创建点图层 - 航道轨迹点（密集小点模拟线效果）
    if (pointFeatures.length > 0) {
        const pointSource = new VectorSource({ features: pointFeatures })

        // 使用很小的点，密集排列模拟航道线效果
        const pointStyle = {
            'circle-radius': 1.5,  // 很小的点
            'circle-fill-color': 'rgba(255, 107, 53, 0.7)', // 橙红色
            'circle-stroke-width': 0,  // 无边框
        }

        const pointLayer = new WebGLPointsLayer({
            source: pointSource,
            style: pointStyle,
            zIndex: 87,
            visible: true
        })

        layers.push(pointLayer)
    }

    return layers
}
