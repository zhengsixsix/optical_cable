import { Vector as VectorSource } from 'ol/source'
import { Vector as VectorLayer } from 'ol/layer'
import WebGLPointsLayer from 'ol/layer/WebGLPoints'
import { Style, Stroke, Fill } from 'ol/style'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import BaseLayer from 'ol/layer/Base'

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
