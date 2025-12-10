import { ref, shallowRef, onUnmounted, type Ref } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import GeoTIFF from 'ol/source/GeoTIFF'
import { DragBox } from 'ol/interaction'
import Feature from 'ol/Feature'
import { fromLonLat, toLonLat } from 'ol/proj'
import { Style, Stroke, Fill } from 'ol/style'
import type { Coordinate, Extent, Projection, ToolMode } from '@/types'

/**
 * OpenLayers 地图操作的组合式函数
 * 封装地图初始化、图层管理、交互等功能
 */
export interface UseMapOptions {
    /** 初始中心点 [经度, 纬度] */
    center?: Coordinate
    /** 初始缩放级别 */
    zoom?: number
    /** 投影 */
    projection?: Projection
    /** 最小缩放 */
    minZoom?: number
    /** 最大缩放 */
    maxZoom?: number
}

export interface UseMapReturn {
    /** 地图实例 (使用 shallowRef 避免响应式代理) */
    map: Ref<Map | null>
    /** 是否正在加载 */
    isLoading: Ref<boolean>
    /** 当前鼠标坐标 */
    mouseCoordinates: Ref<Coordinate>
    /** 是否处于框选模式 */
    isBoxSelecting: Ref<boolean>
    /** 当前选中的范围 */
    selectedExtent: Ref<Extent | null>
    /** 初始化地图 */
    initMap: (container: HTMLElement) => void
    /** 设置中心点 */
    setCenter: (coord: Coordinate, zoom?: number) => void
    /** 添加 GeoTIFF 图层 */
    addGeoTiffLayer: (url: string, options?: GeoTiffLayerOptions) => WebGLTileLayer
    /** 添加矢量图层 */
    addVectorLayer: (source: VectorSource, style?: Style) => VectorLayer<VectorSource>
    /** 移除图层 */
    removeLayer: (layer: TileLayer<any> | VectorLayer<any> | WebGLTileLayer) => void
    /** 启用框选 */
    enableBoxSelect: () => void
    /** 禁用框选 */
    disableBoxSelect: () => void
    /** 缩放至范围 */
    fitToExtent: (extent: Extent, padding?: number[]) => void
    /** 销毁地图 */
    destroy: () => void
}

export interface GeoTiffLayerOptions {
    visible?: boolean
    opacity?: number
    normalize?: boolean
}

export function useMap(options: UseMapOptions = {}): UseMapReturn {
    const {
        center = [0, 20],
        zoom = 2,
        projection = 'EPSG:4326',
        minZoom = 0,
        maxZoom = 18
    } = options

    // 使用 shallowRef 避免 Vue 对 Map 实例进行深度响应式代理
    const map = shallowRef<Map | null>(null)
    const isLoading = ref(true)
    const mouseCoordinates = ref<Coordinate>([0, 0])
    const isBoxSelecting = ref(false)
    const selectedExtent = ref<Extent | null>(null)

    // 内部状态
    let dragBox: DragBox | null = null
    let selectionSource: VectorSource | null = null
    let selectionLayer: VectorLayer<VectorSource> | null = null

    /**
     * 初始化地图
     */
    const initMap = (container: HTMLElement) => {
        if (map.value) {
            console.warn('地图已初始化')
            return
        }

        // 创建底图图层
        const osmLayer = new TileLayer({
            source: new OSM(),
            opacity: 0.5
        })

        // 创建地图实例
        map.value = new Map({
            target: container,
            layers: [osmLayer],
            view: new View({
                projection,
                center,
                zoom,
                minZoom,
                maxZoom
            })
        })

        // 监听鼠标移动
        map.value.on('pointermove', (evt) => {
            mouseCoordinates.value = evt.coordinate as Coordinate
        })

        // 初始化选择图层
        selectionSource = new VectorSource()
        selectionLayer = new VectorLayer({
            source: selectionSource,
            style: new Style({
                stroke: new Stroke({ color: '#165DFF', width: 2, lineDash: [5, 5] }),
                fill: new Fill({ color: 'rgba(22, 93, 255, 0.1)' })
            })
        })
        map.value.addLayer(selectionLayer)

        // 初始化框选交互
        dragBox = new DragBox({
            condition: () => isBoxSelecting.value
        })

        dragBox.on('boxend', () => {
            if (!selectionSource || !dragBox) return

            selectionSource.clear()
            const geometry = dragBox.getGeometry()
            selectionSource.addFeature(new Feature({ geometry }))

            const extent = geometry.getExtent() as Extent
            selectedExtent.value = extent

            // 自动关闭框选模式
            disableBoxSelect()
        })

        isLoading.value = false
    }

    /**
     * 设置地图中心点
     */
    const setCenter = (coord: Coordinate, newZoom?: number) => {
        if (!map.value) return

        const view = map.value.getView()
        view.setCenter(coord)
        if (newZoom !== undefined) {
            view.setZoom(newZoom)
        }
    }

    /**
     * 添加 GeoTIFF 图层
     */
    const addGeoTiffLayer = (url: string, options: GeoTiffLayerOptions = {}): WebGLTileLayer => {
        const { visible = true, opacity = 1, normalize = true } = options

        const source = new GeoTIFF({
            sources: [{ url }],
            normalize,
            wrapX: true
        })

        // RGB 显示样式
        const rgbStyle = {
            color: ['array', ['band', 1], ['band', 2], ['band', 3], 1]
        }

        const layer = new WebGLTileLayer({
            source,
            style: rgbStyle,
            visible,
            opacity
        })

        if (map.value) {
            map.value.addLayer(layer)
        }

        // 监听瓦片加载
        source.on('tileloadend', () => {
            isLoading.value = false
        })

        source.on('tileloaderror', () => {
            console.error('GeoTIFF 瓦片加载失败')
        })

        return layer
    }

    /**
     * 添加矢量图层
     */
    const addVectorLayer = (source: VectorSource, style?: Style): VectorLayer<VectorSource> => {
        const layer = new VectorLayer({ source, style })

        if (map.value) {
            map.value.addLayer(layer)
        }

        return layer
    }

    /**
     * 移除图层
     */
    const removeLayer = (layer: TileLayer<any> | VectorLayer<any> | WebGLTileLayer) => {
        if (map.value) {
            map.value.removeLayer(layer)
        }
    }

    /**
     * 启用框选模式
     */
    const enableBoxSelect = () => {
        if (!map.value || !dragBox) return

        isBoxSelecting.value = true
        map.value.addInteraction(dragBox)
    }

    /**
     * 禁用框选模式
     */
    const disableBoxSelect = () => {
        if (!map.value || !dragBox) return

        isBoxSelecting.value = false
        map.value.removeInteraction(dragBox)
    }

    /**
     * 缩放至指定范围
     */
    const fitToExtent = (extent: Extent, padding: number[] = [20, 20, 20, 20]) => {
        if (!map.value) return

        map.value.getView().fit(extent, { padding })
    }

    /**
     * 销毁地图实例
     */
    const destroy = () => {
        if (map.value) {
            map.value.setTarget(undefined)
            map.value = null
        }
        dragBox = null
        selectionSource = null
        selectionLayer = null
    }

    // 组件卸载时自动清理
    onUnmounted(() => {
        destroy()
    })

    return {
        map,
        isLoading,
        mouseCoordinates,
        isBoxSelecting,
        selectedExtent,
        initMap,
        setCenter,
        addGeoTiffLayer,
        addVectorLayer,
        removeLayer,
        enableBoxSelect,
        disableBoxSelect,
        fitToExtent,
        destroy
    }
}
