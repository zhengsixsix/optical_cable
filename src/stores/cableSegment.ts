import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  CableSegment, 
  CableSegmentSummary, 
  SegmentGenerateConfig,
  RiskLevel 
} from '@/types'
import { defaultSegmentGenerateConfig } from '@/types/cableSegment'
import { useSettingsStore } from './settings'

export const useCableSegmentStore = defineStore('cableSegment', () => {
  // 状态
  const segments = ref<CableSegment[]>([])
  const currentRouteId = ref<string | null>(null)
  const generateConfig = ref<SegmentGenerateConfig>({ ...defaultSegmentGenerateConfig })

  // Getters
  const summary = computed<CableSegmentSummary | null>(() => {
    if (segments.value.length === 0) return null

    const settingsStore = useSettingsStore()
    const armorMappings = settingsStore.routePlanningConfig.armorMappings || []

    // 获取各风险等级单价
    const getPriceByRisk = (risk: RiskLevel): number => {
      const mapping = armorMappings.find(m => m.riskLevel === risk)
      return mapping?.unitPrice || 15  // 默认 15 千元/km
    }

    const highRisk = segments.value.filter(s => s.riskLevel === 'high')
    const mediumRisk = segments.value.filter(s => s.riskLevel === 'medium')
    const lowRisk = segments.value.filter(s => s.riskLevel === 'low')

    const highLength = highRisk.reduce((sum, s) => sum + s.length, 0)
    const mediumLength = mediumRisk.reduce((sum, s) => sum + s.length, 0)
    const lowLength = lowRisk.reduce((sum, s) => sum + s.length, 0)

    const highCost = highLength * getPriceByRisk('high')
    const mediumCost = mediumLength * getPriceByRisk('medium')
    const lowCost = lowLength * getPriceByRisk('low')

    return {
      totalSegments: segments.value.length,
      totalLength: highLength + mediumLength + lowLength,
      highRiskSegments: highRisk.length,
      highRiskLength: highLength,
      highRiskCost: highCost,
      mediumRiskSegments: mediumRisk.length,
      mediumRiskLength: mediumLength,
      mediumRiskCost: mediumCost,
      lowRiskSegments: lowRisk.length,
      lowRiskLength: lowLength,
      lowRiskCost: lowCost,
      totalCost: highCost + mediumCost + lowCost
    }
  })

  const lockedSegments = computed(() => 
    segments.value.filter(s => s.isLocked)
  )

  // Actions
  function setCurrentRoute(routeId: string) {
    currentRouteId.value = routeId
    // 加载该路由的分段数据（如果有）
  }

  function setGenerateConfig(config: Partial<SegmentGenerateConfig>) {
    generateConfig.value = { ...generateConfig.value, ...config }
  }

  /**
   * 基于配置生成海缆段
   * @param routeLength 路由总长度(km)
   * @param riskData 风险数据数组 [{ kp, riskValue }]
   */
  function generateSegments(
    routeLength: number, 
    riskData: Array<{ kp: number; riskValue: number }> = []
  ): CableSegment[] {
    const settingsStore = useSettingsStore()
    const armorMappings = settingsStore.routePlanningConfig.armorMappings || []
    const config = generateConfig.value

    // 获取风险等级和缆型映射
    const getRiskLevel = (riskValue: number): RiskLevel => {
      const highThreshold = config.highRiskThreshold || 3
      const mediumThreshold = config.mediumRiskThreshold || 2
      if (riskValue >= highThreshold) return 'high'
      if (riskValue >= mediumThreshold) return 'medium'
      return 'low'
    }

    const getCableInfo = (risk: RiskLevel) => {
      const mapping = armorMappings.find(m => m.riskLevel === risk)
      return {
        cableTypeId: mapping?.cableTypeId || risk,
        cableTypeName: mapping?.cableTypeName || (risk === 'high' ? 'DA (双铠装)' : risk === 'medium' ? 'SA (单铠装)' : 'LW (轻型)')
      }
    }

    const newSegments: CableSegment[] = []
    
    // 保留锁定的分段
    const locked = segments.value.filter(s => s.isLocked && s.routeId === currentRouteId.value)

    if (config.method === 'fixed-length') {
      // 固定长度分段
      const targetLength = config.targetLength || 50.0
      let currentKp = 0
      let segmentIndex = 0

      while (currentKp < routeLength) {
        const startKp = currentKp
        const endKp = Math.min(currentKp + targetLength, routeLength)
        const length = endKp - startKp

        // 查找该段的平均风险值
        const segmentRiskData = riskData.filter(r => r.kp >= startKp && r.kp < endKp)
        const avgRisk = segmentRiskData.length > 0 
          ? segmentRiskData.reduce((sum, r) => sum + r.riskValue, 0) / segmentRiskData.length
          : 1 // 默认低风险

        const riskLevel = getRiskLevel(avgRisk)
        const cableInfo = getCableInfo(riskLevel)

        // 检查是否与锁定分段重叠
        const overlappingLocked = locked.find(l => 
          (startKp >= l.startKp && startKp < l.endKp) ||
          (endKp > l.startKp && endKp <= l.endKp)
        )

        if (!overlappingLocked) {
          newSegments.push({
            id: `seg-${Date.now()}-${segmentIndex}`,
            routeId: currentRouteId.value || '',
            startKp,
            endKp,
            length,
            riskLevel,
            cableTypeId: cableInfo.cableTypeId,
            cableTypeName: cableInfo.cableTypeName,
            armorType: riskLevel === 'high' ? '双铠' : riskLevel === 'medium' ? '单铠' : '轻铠',
            slack: 3,  // 默认敷设余量 3%
            burialDepth: riskLevel === 'high' ? 2.0 : riskLevel === 'medium' ? 1.5 : 1.0,
            isLocked: false
          })
        }

        currentKp = endKp
        segmentIndex++
      }
    } else {
      // 风险等级分段
      const minLength = config.minLength || 10.0
      const maxLength = config.maxLength || 100.0

      // 按风险等级变化点分段
      if (riskData.length > 0) {
        let currentKp = 0
        let currentRisk = getRiskLevel(riskData[0]?.riskValue || 1)
        let segmentIndex = 0

        for (let i = 0; i < riskData.length; i++) {
          const point = riskData[i]
          const pointRisk = getRiskLevel(point.riskValue)

          // 风险等级变化或达到最大长度时分段
          const segmentLength = point.kp - currentKp
          const shouldSplit = pointRisk !== currentRisk || segmentLength >= maxLength

          if (shouldSplit && segmentLength >= minLength) {
            const cableInfo = getCableInfo(currentRisk)
            
            newSegments.push({
              id: `seg-${Date.now()}-${segmentIndex}`,
              routeId: currentRouteId.value || '',
              startKp: currentKp,
              endKp: point.kp,
              length: segmentLength,
              riskLevel: currentRisk,
              cableTypeId: cableInfo.cableTypeId,
              cableTypeName: cableInfo.cableTypeName,
              armorType: currentRisk === 'high' ? '双铠' : currentRisk === 'medium' ? '单铠' : '轻铠',
              slack: 3,
              burialDepth: currentRisk === 'high' ? 2.0 : currentRisk === 'medium' ? 1.5 : 1.0,
              isLocked: false
            })

            currentKp = point.kp
            currentRisk = pointRisk
            segmentIndex++
          }
        }

        // 处理最后一段
        if (currentKp < routeLength) {
          const cableInfo = getCableInfo(currentRisk)
          newSegments.push({
            id: `seg-${Date.now()}-${segmentIndex}`,
            routeId: currentRouteId.value || '',
            startKp: currentKp,
            endKp: routeLength,
            length: routeLength - currentKp,
            riskLevel: currentRisk,
            cableTypeId: cableInfo.cableTypeId,
            cableTypeName: cableInfo.cableTypeName,
            armorType: currentRisk === 'high' ? '双铠' : currentRisk === 'medium' ? '单铠' : '轻铠',
            slack: 3,
            burialDepth: currentRisk === 'high' ? 2.0 : currentRisk === 'medium' ? 1.5 : 1.0,
            isLocked: false
          })
        }
      } else {
        // 无风险数据时按固定长度分段（使用最大长度）
        let currentKp = 0
        let segmentIndex = 0
        while (currentKp < routeLength) {
          const endKp = Math.min(currentKp + maxLength, routeLength)
          const cableInfo = getCableInfo('low')
          
          newSegments.push({
            id: `seg-${Date.now()}-${segmentIndex}`,
            routeId: currentRouteId.value || '',
            startKp: currentKp,
            endKp,
            length: endKp - currentKp,
            riskLevel: 'low',
            cableTypeId: cableInfo.cableTypeId,
            cableTypeName: cableInfo.cableTypeName,
            armorType: '轻铠',
            slack: 3,
            burialDepth: 1.0,
            isLocked: false
          })

          currentKp = endKp
          segmentIndex++
        }
      }
    }

    // 合并锁定的分段
    segments.value = [...locked, ...newSegments].sort((a, b) => a.startKp - b.startKp)
    
    return segments.value
  }

  function updateSegment(segmentId: string, data: Partial<CableSegment>) {
    const segment = segments.value.find(s => s.id === segmentId)
    if (segment) {
      Object.assign(segment, data)
    }
  }

  function setSegments(newSegments: CableSegment[]) {
    segments.value = newSegments
  }

  function clearSegments() {
    segments.value = segments.value.filter(s => s.isLocked)
  }

  function toggleLock(segmentId: string) {
    const segment = segments.value.find(s => s.id === segmentId)
    if (segment) {
      segment.isLocked = !segment.isLocked
    }
  }

  function lockAll() {
    segments.value.forEach(s => s.isLocked = true)
  }

  function unlockAll() {
    segments.value.forEach(s => s.isLocked = false)
  }

  // 导出数据（用于保存到 USE 文件）
  function exportData() {
    return {
      segments: segments.value,
      config: generateConfig.value
    }
  }

  // 导入数据（从 USE 文件加载）
  function importData(data: { segments?: CableSegment[], config?: SegmentGenerateConfig }) {
    if (data.segments) {
      segments.value = data.segments
    }
    if (data.config) {
      generateConfig.value = { ...defaultSegmentGenerateConfig, ...data.config }
    }
  }

  return {
    // State
    segments,
    currentRouteId,
    generateConfig,
    // Getters
    summary,
    lockedSegments,
    // Actions
    setCurrentRoute,
    setGenerateConfig,
    generateSegments,
    updateSegment,
    setSegments,
    clearSegments,
    toggleLock,
    lockAll,
    unlockAll,
    exportData,
    importData
  }
})
