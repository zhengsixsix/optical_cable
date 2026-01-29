import Map from 'ol/Map'
import View from 'ol/View'
import { fromLonLat, toLonLat } from 'ol/proj'
import { defaults as defaultControls } from 'ol/control'
import { defaults as defaultInteractions } from 'ol/interaction'
import type { Coordinate } from 'ol/coordinate'
import type { Extent } from 'ol/extent'
import { LayerManager } from './layers/LayerManager'
import { logger } from '@/shared/utils'

export interface MapEngineOptions {
  target: string | HTMLElement
  center?: [number, number]
  zoom?: number
}

/**
 * 地图引擎
 * 封装 OpenLayers，提供统一的地图操作接口
 */
export class MapEngine {
  private map: Map | null = null
  private layerManager: LayerManager | null = null
  private isInitialized = false

  /**
   * 初始化地图
   */
  init(options: MapEngineOptions): void {
    if (this.isInitialized) {
      logger.warn('MapEngine already initialized')
      return
    }

    const { target, center = [120, 30], zoom = 5 } = options

    this.map = new Map({
      target,
      view: new View({
        center: fromLonLat(center),
        zoom,
        minZoom: 2,
        maxZoom: 18,
      }),
      controls: defaultControls({
        zoom: true,
        rotate: false,
        attribution: false,
      }),
      interactions: defaultInteractions({
        doubleClickZoom: false,
      }),
    })

    this.layerManager = new LayerManager(this.map)
    this.isInitialized = true

    logger.info('MapEngine initialized')
  }

  /**
   * 销毁地图
   */
  destroy(): void {
    if (this.map) {
      this.map.setTarget(undefined)
      this.map = null
    }
    this.layerManager = null
    this.isInitialized = false
    logger.info('MapEngine destroyed')
  }

  /**
   * 获取原始 Map 实例（慎用）
   */
  getMap(): Map | null {
    return this.map
  }

  /**
   * 获取图层管理器
   */
  getLayerManager(): LayerManager | null {
    return this.layerManager
  }

  /**
   * 设置地图中心
   */
  setCenter(lonLat: [number, number], animate = true): void {
    if (!this.map) return

    const view = this.map.getView()
    if (animate) {
      view.animate({
        center: fromLonLat(lonLat),
        duration: 300,
      })
    } else {
      view.setCenter(fromLonLat(lonLat))
    }
  }

  /**
   * 获取地图中心
   */
  getCenter(): [number, number] | null {
    if (!this.map) return null

    const center = this.map.getView().getCenter()
    if (!center) return null

    return toLonLat(center) as [number, number]
  }

  /**
   * 设置缩放级别
   */
  setZoom(zoom: number, animate = true): void {
    if (!this.map) return

    const view = this.map.getView()
    if (animate) {
      view.animate({ zoom, duration: 300 })
    } else {
      view.setZoom(zoom)
    }
  }

  /**
   * 获取缩放级别
   */
  getZoom(): number | null {
    if (!this.map) return null
    return this.map.getView().getZoom() ?? null
  }

  /**
   * 缩放到指定范围
   */
  fitExtent(extent: Extent, padding = [50, 50, 50, 50]): void {
    if (!this.map) return

    this.map.getView().fit(extent, {
      padding,
      duration: 300,
    })
  }

  /**
   * 屏幕坐标转地理坐标
   */
  pixelToLonLat(pixel: [number, number]): [number, number] | null {
    if (!this.map) return null

    const coordinate = this.map.getCoordinateFromPixel(pixel)
    if (!coordinate) return null

    return toLonLat(coordinate) as [number, number]
  }

  /**
   * 地理坐标转屏幕坐标
   */
  lonLatToPixel(lonLat: [number, number]): [number, number] | null {
    if (!this.map) return null

    const pixel = this.map.getPixelFromCoordinate(fromLonLat(lonLat))
    if (!pixel) return null

    return pixel as [number, number]
  }

  /**
   * 刷新地图尺寸
   */
  updateSize(): void {
    this.map?.updateSize()
  }

  /**
   * 添加点击事件监听
   */
  onClick(callback: (coordinate: [number, number], pixel: [number, number]) => void): () => void {
    if (!this.map) return () => {}

    const handler = (event: any) => {
      const lonLat = toLonLat(event.coordinate) as [number, number]
      callback(lonLat, event.pixel)
    }

    this.map.on('click', handler)

    return () => {
      this.map?.un('click', handler)
    }
  }

  /**
   * 添加双击事件监听
   */
  onDoubleClick(callback: (coordinate: [number, number]) => void): () => void {
    if (!this.map) return () => {}

    const handler = (event: any) => {
      const lonLat = toLonLat(event.coordinate) as [number, number]
      callback(lonLat)
    }

    this.map.on('dblclick', handler)

    return () => {
      this.map?.un('dblclick', handler)
    }
  }

  /**
   * 添加鼠标移动事件监听（节流）
   */
  onPointerMove(callback: (coordinate: [number, number] | null) => void, throttleMs = 50): () => void {
    if (!this.map) return () => {}

    let lastCall = 0
    const handler = (event: any) => {
      const now = Date.now()
      if (now - lastCall < throttleMs) return
      lastCall = now

      if (event.dragging) {
        callback(null)
        return
      }

      const lonLat = toLonLat(event.coordinate) as [number, number]
      callback(lonLat)
    }

    this.map.on('pointermove', handler)

    return () => {
      this.map?.un('pointermove', handler)
    }
  }
}

// 单例导出
let mapEngineInstance: MapEngine | null = null

export function getMapEngine(): MapEngine {
  if (!mapEngineInstance) {
    mapEngineInstance = new MapEngine()
  }
  return mapEngineInstance
}

export function resetMapEngine(): void {
  if (mapEngineInstance) {
    mapEngineInstance.destroy()
    mapEngineInstance = null
  }
}
