/**
 * 项目数据管理 Store
 * 集中管理项目数据的加载状态和清空。
 * 
 * 使用场景：
 * - 打开项目文件 (.use) → ProjectFileService.importProject() 加载数据 → setupDataLinks() + markDataLoaded()
 * - 新建项目 → useProjectManager.createProject() 创建数据 → setupDataLinks() + markDataLoaded()
 * - 关闭项目 → clearProjectData() 清空所有 store
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRPLStore } from './rpl'
import { useSLDStore } from './sld'
import { useConnectorStore } from './connector'
import { useMonitorStore } from './monitor'
import { useRouteStore } from './route'
import { useCableSegmentStore } from './cableSegment'

export const useProjectDataStore = defineStore('projectData', () => {
  // 项目是否已加载数据
  const isDataLoaded = ref(false)

  /**
   * 标记数据已加载（从文件加载后调用）
   */
  function markDataLoaded() {
    isDataLoaded.value = true
  }

  /**
   * 清空项目数据
   * 关闭项目时调用，清空各 store 的数据
   */
  function clearProjectData() {
    const rplStore = useRPLStore()
    const sldStore = useSLDStore()
    const connectorStore = useConnectorStore()
    const monitorStore = useMonitorStore()
    const routeStore = useRouteStore()
    const cableSegmentStore = useCableSegmentStore()

    // 清空各模块数据
    rplStore.clearData()
    sldStore.clearData()
    connectorStore.clearData()
    monitorStore.clearData()
    routeStore.clearParetoRoutes()
    cableSegmentStore.clearSegments()

    isDataLoaded.value = false
  }

  return {
    isDataLoaded,
    markDataLoaded,
    clearProjectData,
  }
})
