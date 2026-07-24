import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConnectorElement, ConnectorTable } from '@/types'

export const useConnectorStore = defineStore('connector', () => {
  const tables = ref<ConnectorTable[]>([])
  const currentTableId = ref<string | null>(null)
  let idCounter = 0

  function createId(prefix: string) {
    idCounter += 1
    return `${prefix}-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`
  }

  // 当前表格
  const currentTable = computed(() => 
    tables.value.find(t => t.id === currentTableId.value) || null
  )

  // 当前表格的接线元列表
  const elements = computed(() => currentTable.value?.elements || [])

  // 创建新表格
  function createTable(name: string, routeId?: string) {
    const newTable: ConnectorTable = {
      id: createId('conn'),
      name,
      routeId,
      elements: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    tables.value.push(newTable)
    currentTableId.value = newTable.id
    return newTable.id
  }

  // 选择表格
  function selectTable(tableId: string | null) {
    currentTableId.value = tableId
  }

  function replaceTables(nextTables: ConnectorTable[]) {
    tables.value = nextTables
  }

  function setCurrentTableId(tableId: string | null) {
    currentTableId.value = tableId
  }

  /** 替换指定接线元表的元素，可按调用场景维护更新时间。 */
  function replaceTableElements(
    elementsToReplace: ConnectorElement[],
    tableId = currentTableId.value,
    updateTimestamp = true,
  ) {
    const table = tables.value.find(item => item.id === tableId)
    if (!table) return false

    table.elements = elementsToReplace
    if (updateTimestamp) {
      table.updatedAt = new Date().toISOString()
    }
    return true
  }

  function getTableByRoute(routeId?: string | null) {
    if (routeId) {
      return tables.value.find(t => t.routeId === routeId) || null
    }
    return currentTable.value || tables.value[0] || null
  }

  function selectTableByRoute(routeId?: string | null, options: { clearOnMissing?: boolean } = {}) {
    const matchedTable = getTableByRoute(routeId)
    if (!matchedTable) {
      if (options.clearOnMissing) {
        currentTableId.value = null
      }
      return false
    }
    if (currentTableId.value !== matchedTable.id) {
      currentTableId.value = matchedTable.id
    }
    return true
  }

  function getElementsForRoute(routeId?: string | null) {
    return getTableByRoute(routeId)?.elements || []
  }

  // 添加接线元
  function addElement(element: Omit<ConnectorElement, 'id'>, _emitLink = true) {
    if (!currentTable.value) return null
    
    const newElement: ConnectorElement = {
      ...element,
      id: createId('elem')
    }
    currentTable.value.elements.push(newElement)
    currentTable.value.updatedAt = new Date().toISOString()
    
    return newElement.id
  }

  // 更新接线元
  function updateElement(id: string, updates: Partial<ConnectorElement>, _emitLink = true) {
    if (!currentTable.value) return false
    
    const index = currentTable.value.elements.findIndex(e => e.id === id)
    if (index === -1) return false
    
    currentTable.value.elements[index] = {
      ...currentTable.value.elements[index],
      ...updates
    }
    currentTable.value.updatedAt = new Date().toISOString()
    
    return true
  }

  // 删除接线元
  function deleteElement(id: string, _emitLink = true) {
    if (!currentTable.value) return false
    
    const index = currentTable.value.elements.findIndex(e => e.id === id)
    if (index === -1) return false
    
    currentTable.value.elements.splice(index, 1)
    currentTable.value.updatedAt = new Date().toISOString()
    
    return true
  }

  // 清空数据
  function clearData() {
    tables.value = []
    currentTableId.value = null
  }

  // 删除表格
  function deleteTable(tableId: string) {
    const index = tables.value.findIndex(t => t.id === tableId)
    if (index === -1) return false
    
    tables.value.splice(index, 1)
    if (currentTableId.value === tableId) {
      currentTableId.value = tables.value[0]?.id || null
    }
    return true
  }

  return {
    tables,
    currentTableId,
    currentTable,
    elements,
    createTable,
    selectTable,
    replaceTables,
    setCurrentTableId,
    replaceTableElements,
    selectTableByRoute,
    getTableByRoute,
    getElementsForRoute,
    addElement,
    updateElement,
    deleteElement,
    deleteTable,
    // 项目数据管理
    clearData,
  }
})
