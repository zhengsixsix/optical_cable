import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CableSegment, CableSegmentSummary } from '@/types'

export const useCableSegmentStore = defineStore('cableSegment', () => {
  // 状态
  const segments = ref<CableSegment[]>([])

  // 后端若提供汇总可直接写入；前端不再根据风险等级和单价自行计算。
  const summary = ref<CableSegmentSummary | null>(null)

  // Actions
  function setSegments(newSegments: CableSegment[], backendSummary: CableSegmentSummary | null = null) {
    segments.value = newSegments
    summary.value = backendSummary
  }

  function clearSegments() {
    segments.value = []
    summary.value = null
  }

  // 导出数据（用于保存到 USE 文件）
  function exportData() {
    return {
      segments: segments.value,
      summary: summary.value,
    }
  }

  // 导入数据（从 USE 文件加载）
  function importData(data: {
    segments?: CableSegment[]
    summary?: CableSegmentSummary | null
  }) {
    if (data.segments) {
      segments.value = data.segments
    }
    summary.value = data.summary ?? null
  }

  return {
    // State
    segments,
    summary,
    // Actions
    setSegments,
    clearSegments,
    exportData,
    importData
  }
})
