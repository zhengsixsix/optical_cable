import type { LayerConfig, LayerData } from '@/types'
import type { ILayerRepository } from '@/repositories'
import { createLayerRepository } from '@/repositories'

/**
 * 图层业务服务
 * 封装图层相关的业务逻辑，协调 Repository 和 Store
 */
export class LayerService {
    private repository: ILayerRepository

    constructor(repository?: ILayerRepository) {
        // 支持依赖注入，默认使用工厂创建的实例
        this.repository = repository ?? createLayerRepository()
    }

    /**
     * 加载所有图层配置
     * 用于初始化图层列表
     */
    async loadLayers(): Promise<LayerConfig[]> {
        try {
            const layers = await this.repository.getLayers()
            return layers
        } catch (error) {
            console.error('加载图层失败:', error)
            throw new Error('无法加载图层配置')
        }
    }

    /**
     * 切换图层可见性
     * @param layerId 图层ID
     * @param visible 是否可见
     */
    async toggleLayer(layerId: string, visible: boolean): Promise<void> {
        try {
            await this.repository.updateLayerVisibility(layerId, visible)
        } catch (error) {
            console.error(`切换图层 ${layerId} 可见性失败:`, error)
            throw new Error('切换图层可见性失败')
        }
    }

    /**
     * 获取图层数据
     * @param layerId 图层ID
     */
    async getLayerData(layerId: string): Promise<LayerData | null> {
        try {
            const data = await this.repository.getLayerData(layerId)
            return data
        } catch (error) {
            console.error(`获取图层 ${layerId} 数据失败:`, error)
            throw new Error('获取图层数据失败')
        }
    }

    /**
     * 批量切换图层可见性
     * @param layerIds 图层ID列表
     * @param visible 是否可见
     */
    async toggleLayers(layerIds: string[], visible: boolean): Promise<void> {
        const results = await Promise.allSettled(
            layerIds.map(id => this.toggleLayer(id, visible))
        )

        // 检查是否有失败的操作
        const failures = results.filter(r => r.status === 'rejected')
        if (failures.length > 0) {
            console.warn(`批量切换图层时有 ${failures.length} 个失败`)
        }
    }

    /**
     * 获取可见图层ID列表
     * @param layers 图层配置列表
     */
    getVisibleLayerIds(layers: LayerConfig[]): string[] {
        return layers.filter(layer => layer.visible).map(layer => layer.id)
    }
}

// 创建单例实例
let _layerService: LayerService | null = null

export function useLayerService(): LayerService {
    if (!_layerService) {
        _layerService = new LayerService()
    }
    return _layerService
}
