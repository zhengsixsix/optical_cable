/**
 * 项目数据管理 Store
 * 集中管理项目数据的初始化和清空，是唯一的数据初始化入口
 * 
 * 使用场景：
 * - 打开项目文件 (.use) → ProjectFileService.importProject() 加载数据 → setupDataLinks() + markDataLoaded()
 * - 新建项目 → useProjectManager.createProject() 创建数据 → setupDataLinks() + markDataLoaded()
 * - 演示模式 → loadDemoData() 加载 mock 数据
 * - 关闭项目 → clearProjectData() 清空所有 store
 * 
 * 重要：不要在其他地方直接调用各 store 的 initMockData()，应统一通过此 store
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRPLStore } from './rpl'
import { useSLDStore } from './sld'
import { useConnectorStore } from './connector'
import { useMonitorStore } from './monitor'
import { useRouteStore } from './route'

export const useProjectDataStore = defineStore('projectData', () => {
  // 项目是否已加载数据
  const isDataLoaded = ref(false)

  /**
   * 加载演示数据
   * 新建项目或演示模式时调用，加载 mock 数据供演示
   */
  function loadDemoData() {
    if (isDataLoaded.value) return

    const rplStore = useRPLStore()
    const sldStore = useSLDStore()
    const connectorStore = useConnectorStore()
    const monitorStore = useMonitorStore()

    // 加载演示数据
    rplStore.initMockData()
    sldStore.initMockData()
    connectorStore.initMockData()
    monitorStore.initMockData()

    isDataLoaded.value = true
  }

  /**
   * 设置数据联动监听
   * 打开项目或加载演示数据后调用
   */
  function setupDataLinks() {
    const rplStore = useRPLStore()
    const sldStore = useSLDStore()
    const connectorStore = useConnectorStore()
    const monitorStore = useMonitorStore()

    rplStore.setupDataLinkListener()
    sldStore.setupDataLinkListener()
    connectorStore.setupDataLinkListener()
    monitorStore.setupDataLinkListener()
  }

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

    // 清空各模块数据
    rplStore.clearData()
    sldStore.clearData()
    connectorStore.clearData()
    monitorStore.clearData()
    routeStore.clearParetoRoutes()

    isDataLoaded.value = false
  }

  return {
    isDataLoaded,
    loadDemoData,
    setupDataLinks,
    markDataLoaded,
    clearProjectData,
  }
})
