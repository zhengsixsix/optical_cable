import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConnectorElement, ConnectorTable, ConnectorType } from '@/types'
import { mockConnectorElements, ROUTE_ID, ROUTE_NAME } from '@/data/mockData'
import { dataLinkService } from '@/services'

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
  function addElement(element: Omit<ConnectorElement, 'id'>, emitLink = true) {
    if (!currentTable.value) return null
    
    const newElement: ConnectorElement = {
      ...element,
      id: createId('elem')
    }
    currentTable.value.elements.push(newElement)
    currentTable.value.updatedAt = new Date().toISOString()
    
    // 触发数据联动
    if (emitLink) {
      dataLinkService.emit({
        source: 'connector',
        action: 'add',
        data: newElement,
        kp: newElement.kp,
      })
    }
    
    return newElement.id
  }

  // 更新接线元
  function updateElement(id: string, updates: Partial<ConnectorElement>, emitLink = true) {
    if (!currentTable.value) return false
    
    const index = currentTable.value.elements.findIndex(e => e.id === id)
    if (index === -1) return false
    
    currentTable.value.elements[index] = {
      ...currentTable.value.elements[index],
      ...updates
    }
    currentTable.value.updatedAt = new Date().toISOString()
    
    // 触发数据联动
    if (emitLink) {
      dataLinkService.emit({
        source: 'connector',
        action: 'update',
        data: currentTable.value.elements[index],
        kp: currentTable.value.elements[index].kp,
      })
    }
    
    return true
  }

  // 删除接线元
  function deleteElement(id: string, emitLink = true) {
    if (!currentTable.value) return false
    
    const index = currentTable.value.elements.findIndex(e => e.id === id)
    if (index === -1) return false
    
    const element = currentTable.value.elements[index]
    currentTable.value.elements.splice(index, 1)
    currentTable.value.updatedAt = new Date().toISOString()
    
    // 触发数据联动
    if (emitLink) {
      dataLinkService.emit({
        source: 'connector',
        action: 'delete',
        data: element,
        kp: element.kp,
      })
    }
    
    return true
  }

  // 批量添加接线元（一次性添加，只触发一次更新）
  function addElements(elementsToAdd: Omit<ConnectorElement, 'id'>[], emitLink = false) {
    if (!currentTable.value) return []
    
    const ids: string[] = []
    
    const newElements: ConnectorElement[] = elementsToAdd.map((element, index) => {
      const newElement: ConnectorElement = {
        ...element,
        id: createId(`elem-${index}`)
      }
      ids.push(newElement.id)
      return newElement
    })
    
    // 一次性替换数组，避免大量 push 触发多次响应式更新
    currentTable.value.elements = currentTable.value.elements.concat(newElements)
    currentTable.value.updatedAt = new Date().toISOString()
    
    // 可选：触发数据联动
    if (emitLink) {
      newElements.forEach(newElement => {
        dataLinkService.emit({
          source: 'connector',
          action: 'add',
          data: newElement,
          kp: newElement.kp,
        })
      })
    }
    
    return ids
  }

  // 批量删除接线元（根据类型删除，只触发一次更新）
  function deleteElementsByType(types: ConnectorType[], emitLink = false) {
    if (!currentTable.value) return 0
    
    const before = currentTable.value.elements.length
    currentTable.value.elements = currentTable.value.elements.filter(
      e => !types.includes(e.type)
    )
    const deleted = before - currentTable.value.elements.length
    
    if (deleted > 0) {
      currentTable.value.updatedAt = new Date().toISOString()
    }
    return deleted
  }

  // 按类型筛选
  function getElementsByType(type: ConnectorType) {
    return elements.value.filter(e => e.type === type)
  }

  // 初始化加载mock数据
  function initMockData() {
    if (tables.value.length === 0) {
      createTable(`${ROUTE_NAME}_接线元`, ROUTE_ID)
      // 初始化时不触发联动，使用索引确保唯一ID
      mockConnectorElements.forEach((elem, index) => {
        if (!currentTable.value) return
        const newElement = {
          ...elem,
          id: `elem-${index}`
        }
        currentTable.value.elements.push(newElement as ConnectorElement)
      })
      if (currentTable.value) {
        currentTable.value.updatedAt = new Date().toISOString()
      }
    }
  }

  // 监听其他模块的数据变更
  function setupDataLinkListener() {
    dataLinkService.subscribe('connector', (event) => {
      if (!currentTable.value) return
      
      // 根据KP查找对应接线元
      const element = currentTable.value.elements.find(
        e => Math.abs(e.kp - (event.kp || 0)) < 1
      )
      
      if (event.action === 'add' && !element) {
        // RPL新增了关键点，同步创建接线元
        const connData = dataLinkService.rplToConnectorElement(event.data)
        if (connData) {
          addElement(connData, false)
        }
      } else if (event.action === 'update' && element) {
        // 同步更新坐标和深度
        updateElement(element.id, {
          longitude: event.data.longitude ?? element.longitude,
          latitude: event.data.latitude ?? element.latitude,
          depth: event.data.depth ?? element.depth,
        }, false)
      } else if (event.action === 'delete' && element) {
        // 同步删除接线元
        deleteElement(element.id, false)
      }
    })
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
    selectTableByRoute,
    getTableByRoute,
    getElementsForRoute,
    addElement,
    addElements,
    updateElement,
    deleteElement,
    deleteElementsByType,
    getElementsByType,
    deleteTable,
    // 项目数据管理
    initMockData,
    setupDataLinkListener,
    clearData,
  }
})
