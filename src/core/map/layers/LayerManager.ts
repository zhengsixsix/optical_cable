import type Map from 'ol/Map'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import OSM from 'ol/source/OSM'
import type { Layer } from 'ol/layer'
import { logger } from '@/shared/utils'

export type LayerType = 'base' | 'route' | 'geo' | 'overlay'

export interface LayerConfig {
  id: string
  name: string
  type: LayerType
  visible?: boolean
  zIndex?: number
}

/**
 * 图层管理器
 * 统一管理地图上的所有图层
 */
export class LayerManager {
  private map: Map
  private layers: Map<string, Layer> = new Map()

  constructor(map: Map) {
    this.map = map
    this.initBaseLayers()
  }

  /**
   * 初始化基础图层
   */
  private initBaseLayers(): void {
    // 添加 OSM 底图
    const osmLayer = new TileLayer({
      source: new OSM(),
      visible: true,
      zIndex: 0,
    })
    osmLayer.set('id', 'osm')
    osmLayer.set('name', 'OpenStreetMap')
    this.map.addLayer(osmLayer)
    this.layers.set('osm', osmLayer)

    logger.info('Base layers initialized')
  }

  /**
   * 添加矢量图层
   */
  addVectorLayer(config: LayerConfig): VectorLayer<VectorSource> {
    const { id, name, visible = true, zIndex = 10 } = config

    if (this.layers.has(id)) {
      logger.warn(`Layer ${id} already exists`)
      return this.layers.get(id) as VectorLayer<VectorSource>
    }

    const source = new VectorSource()
    const layer = new VectorLayer({
      source,
      visible,
      zIndex,
    })

    layer.set('id', id)
    layer.set('name', name)
    layer.set('type', config.type)

    this.map.addLayer(layer)
    this.layers.set(id, layer)

    logger.info(`Vector layer added: ${name}`)
    return layer
  }

  /**
   * 添加瓦片图层
   */
  addTileLayer(config: LayerConfig & { url: string }): TileLayer<XYZ> {
    const { id, name, url, visible = true, zIndex = 1 } = config

    if (this.layers.has(id)) {
      logger.warn(`Layer ${id} already exists`)
      return this.layers.get(id) as TileLayer<XYZ>
    }

    const layer = new TileLayer({
      source: new XYZ({ url }),
      visible,
      zIndex,
    })

    layer.set('id', id)
    layer.set('name', name)
    layer.set('type', config.type)

    this.map.addLayer(layer)
    this.layers.set(id, layer)

    logger.info(`Tile layer added: ${name}`)
    return layer
  }

  /**
   * 移除图层
   */
  removeLayer(id: string): boolean {
    const layer = this.layers.get(id)
    if (!layer) return false

    this.map.removeLayer(layer)
    this.layers.delete(id)

    logger.info(`Layer removed: ${id}`)
    return true
  }

  /**
   * 获取图层
   */
  getLayer(id: string): Layer | undefined {
    return this.layers.get(id)
  }

  /**
   * 获取矢量图层
   */
  getVectorLayer(id: string): VectorLayer<VectorSource> | undefined {
    const layer = this.layers.get(id)
    if (layer instanceof VectorLayer) {
      return layer as VectorLayer<VectorSource>
    }
    return undefined
  }

  /**
   * 设置图层可见性
   */
  setLayerVisibility(id: string, visible: boolean): void {
    const layer = this.layers.get(id)
    if (layer) {
      layer.setVisible(visible)
    }
  }

  /**
   * 获取图层可见性
   */
  getLayerVisibility(id: string): boolean {
    const layer = this.layers.get(id)
    return layer?.getVisible() ?? false
  }

  /**
   * 切换图层可见性
   */
  toggleLayerVisibility(id: string): boolean {
    const layer = this.layers.get(id)
    if (!layer) return false

    const newVisibility = !layer.getVisible()
    layer.setVisible(newVisibility)
    return newVisibility
  }

  /**
   * 获取所有图层列表
   */
  getAllLayers(): Array<{ id: string; name: string; type: string; visible: boolean }> {
    return Array.from(this.layers.entries()).map(([id, layer]) => ({
      id,
      name: layer.get('name') || id,
      type: layer.get('type') || 'unknown',
      visible: layer.getVisible(),
    }))
  }

  /**
   * 清空指定图层的要素
   */
  clearLayerFeatures(id: string): void {
    const layer = this.getVectorLayer(id)
    if (layer) {
      layer.getSource()?.clear()
    }
  }

  /**
   * 设置图层 zIndex
   */
  setLayerZIndex(id: string, zIndex: number): void {
    const layer = this.layers.get(id)
    if (layer) {
      layer.setZIndex(zIndex)
    }
  }
}
