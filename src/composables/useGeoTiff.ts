import { ref } from 'vue'
import * as GeoTIFF from 'geotiff'
import { useErrorHandler } from './useErrorHandler'

/**
 * GeoTIFF 文件解析组合式函数
 * 封装 GeoTIFF 文件的加载、解析和数据提取
 */
export interface GeoTiffMetadata {
    width: number
    height: number
    boundingBox: [number, number, number, number]
    pixelWidth: number
    pixelHeight: number
    noDataValue?: number
    samplesPerPixel: number
}

export interface GeoTiffData {
    metadata: GeoTiffMetadata
    rasters: ArrayBuffer[]
}

export function useGeoTiff() {
    const { handleError, withErrorHandling } = useErrorHandler()

    const isLoading = ref(false)
    const progress = ref(0)
    const currentData = ref<GeoTiffData | null>(null)

    /**
     * 加载 GeoTIFF 文件
     */
    const loadGeoTiff = async (url: string): Promise<GeoTiffData | null> => {
        isLoading.value = true
        progress.value = 0

        try {
            // 获取文件
            const response = await fetch(url)
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            progress.value = 30
            const arrayBuffer = await response.arrayBuffer()

            progress.value = 50
            // 解析 GeoTIFF
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
            const image = await tiff.getImage()

            progress.value = 70

            // 提取元数据
            const bbox = image.getBoundingBox()
            const width = image.getWidth()
            const height = image.getHeight()

            const metadata: GeoTiffMetadata = {
                width,
                height,
                boundingBox: bbox as [number, number, number, number],
                pixelWidth: (bbox[2] - bbox[0]) / width,
                pixelHeight: (bbox[3] - bbox[1]) / height,
                samplesPerPixel: image.getSamplesPerPixel()
            }

            progress.value = 100

            const data: GeoTiffData = {
                metadata,
                rasters: []
            }

            currentData.value = data
            return data
        } catch (error) {
            handleError(error as Error, {
                component: 'useGeoTiff',
                action: '加载 GeoTIFF'
            })
            return null
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 读取指定窗口的栅格数据
     */
    const readRasters = async (
        url: string,
        window: [number, number, number, number],
        targetWidth?: number,
        targetHeight?: number
    ): Promise<TypedArray[] | null> => {
        return withErrorHandling(async () => {
            const response = await fetch(url)
            const arrayBuffer = await response.arrayBuffer()
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
            const image = await tiff.getImage()

            const rasters = await image.readRasters({
                window,
                width: targetWidth,
                height: targetHeight
            })

            return rasters as unknown as TypedArray[]
        }, { component: 'useGeoTiff', action: '读取栅格数据' })
    }

    /**
     * 获取指定坐标的高程值
     */
    const getElevationAt = async (
        url: string,
        x: number,
        y: number
    ): Promise<number | null> => {
        return withErrorHandling(async () => {
            const response = await fetch(url)
            const arrayBuffer = await response.arrayBuffer()
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
            const image = await tiff.getImage()

            const bbox = image.getBoundingBox()
            const width = image.getWidth()
            const height = image.getHeight()

            const pixelWidth = (bbox[2] - bbox[0]) / width
            const pixelHeight = (bbox[3] - bbox[1]) / height

            // 计算像素坐标
            const pixelX = Math.floor((x - bbox[0]) / pixelWidth)
            const pixelY = Math.floor((bbox[3] - y) / pixelHeight)

            if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
                return null
            }

            // 读取单个像素
            const rasters = await image.readRasters({
                window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
                width: 1,
                height: 1
            })

            const value = (rasters[0] as Int16Array)[0]
            return value === -32767 ? null : value
        }, { component: 'useGeoTiff', action: '获取高程值' })
    }

    /**
     * 坐标转换: EPSG:3857 到经纬度
     */
    const mercatorToLatLon = (x: number, y: number): [number, number] => {
        const lon = (x / 20037508.34) * 180
        let lat = (y / 20037508.34) * 180
        lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
        return [lon, lat]
    }

    /**
     * 坐标转换: 经纬度到 EPSG:3857
     */
    const latLonToMercator = (lon: number, lat: number): [number, number] => {
        const x = lon * 20037508.34 / 180
        let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180)
        y = y * 20037508.34 / 180
        return [x, y]
    }

    return {
        isLoading,
        progress,
        currentData,
        loadGeoTiff,
        readRasters,
        getElevationAt,
        mercatorToLatLon,
        latLonToMercator
    }
}

// 类型定义
type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array
