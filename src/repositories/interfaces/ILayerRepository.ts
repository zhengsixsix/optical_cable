import type { LayerConfig, LayerData } from '@/types'

export interface ILayerRepository {
  getLayers(): Promise<LayerConfig[]>
  getLayerData(layerId: string): Promise<LayerData | null>
  updateLayerVisibility(layerId: string, visible: boolean): Promise<void>
}
