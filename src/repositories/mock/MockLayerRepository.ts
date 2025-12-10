import type { ILayerRepository } from '../interfaces'
import type { LayerConfig, LayerData } from '@/types'

// Mock 图层数据
const mockLayers: LayerConfig[] = [
  { id: 'volcano', name: '火山区域', type: 'both', visible: false, loaded: false, loading: false, zIndex: 100 },
  { id: 'earthquake', name: '地震活动', type: 'both', visible: false, loaded: false, loading: false, zIndex: 100 },
  { id: 'elevation', name: '海洋高程', type: 'raster', visible: true, loaded: true, loading: false, zIndex: 10 },
  { id: 'slope', name: '海洋坡度', type: 'heatmap', visible: false, loaded: false, loading: false, zIndex: 20 },
  { id: 'fishing', name: '海洋渔区分布', type: 'point', visible: false, loaded: false, loading: false, zIndex: 80 },
  { id: 'shipping', name: '航道分布', type: 'vector', visible: false, loaded: false, loading: false, zIndex: 70 },
]

export class MockLayerRepository implements ILayerRepository {
  private layers: LayerConfig[] = [...mockLayers]

  async getLayers(): Promise<LayerConfig[]> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100))
    return [...this.layers]
  }

  async getLayerData(layerId: string): Promise<LayerData | null> {
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const layer = this.layers.find(l => l.id === layerId)
    if (!layer) return null

    return {
      id: layerId,
      metadata: {
        source: `mock://${layerId}`,
        projection: 'EPSG:4326',
      },
    }
  }

  async updateLayerVisibility(layerId: string, visible: boolean): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const layer = this.layers.find(l => l.id === layerId)
    if (layer) {
      layer.visible = visible
    }
  }
}
