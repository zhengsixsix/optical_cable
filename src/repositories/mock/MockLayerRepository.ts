import type { ILayerRepository } from '../interfaces'
import type { LayerConfig, LayerData } from '@/types'
import { mockLayers as importedMockLayers } from '@/data/mockData'

export class MockLayerRepository implements ILayerRepository {
  private layers: LayerConfig[] = JSON.parse(JSON.stringify(importedMockLayers))

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
