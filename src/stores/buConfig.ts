import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * BU 配置 Store
 * 用于在不同对话框之间共享 BU 配置数据
 */

export interface BUConfigData {
  componentRefId: string
  buTrunkLoss: number
  buBranchLoss: number
  buNextHopUpstream: string
  buNextHopDownstream: string
  buNextHopBranch1: string
}

export const useBUConfigStore = defineStore('buConfig', () => {
  // BU 配置缓存 (buId -> config)
  const configs = ref<Record<string, BUConfigData>>({})

  /**
   * 获取 BU 配置
   */
  function getConfig(buId: string): BUConfigData | null {
    return configs.value[buId] || null
  }

  /**
   * 保存 BU 配置
   */
  function saveConfig(buId: string, config: BUConfigData) {
    configs.value[buId] = { ...config }
  }

  /**
   * 更新 BU 配置的部分字段
   */
  function updateConfig(buId: string, updates: Partial<BUConfigData>) {
    if (configs.value[buId]) {
      configs.value[buId] = { ...configs.value[buId], ...updates }
    } else {
      configs.value[buId] = {
        componentRefId: '',
        buTrunkLoss: 0.8,
        buBranchLoss: 3.5,
        buNextHopUpstream: '',
        buNextHopDownstream: '',
        buNextHopBranch1: '',
        ...updates
      }
    }
  }

  /**
   * 检查 BU 是否已配置完整
   */
  function isConfigured(buId: string): boolean {
    const config = configs.value[buId]
    if (!config) return false
    return !!(
      config.componentRefId &&
      config.buNextHopUpstream &&
      config.buNextHopDownstream
    )
  }

  /**
   * 获取所有已配置的 BU ID
   */
  const configuredBuIds = computed(() => {
    return Object.keys(configs.value).filter(id => isConfigured(id))
  })

  /**
   * 清空所有配置
   */
  function clearAll() {
    configs.value = {}
  }

  return {
    configs,
    getConfig,
    saveConfig,
    updateConfig,
    isConfigured,
    configuredBuIds,
    clearAll
  }
})
