import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConnectorElement, ConnectorTable, ConnectorType } from '@/types'
import { mockConnectorElements, ROUTE_ID, ROUTE_NAME } from '@/data/mockData'
import { dataLinkService } from '@/services'

export const useConnectorStore = defineStore('connector', () => {
  const tables = ref<ConnectorTable[]>([])
  const currentTableId = ref<string | null>(null)

  // 当前表格
  const currentTable = computed(() => 
    tables.value.find(t => t.id === currentTableId.value) || null
  )

  // 当前表格的接线元列表
  const elements = computed(() => currentTable.value?.elements || [])

  // 创建新表格
  function createTable(name: string, routeId?: string) {
    const newTable: ConnectorTable = {
      id: `conn-${Date.now()}`,
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
  function selectTable(tableId: string) {
    currentTableId.value = tableId
  }

  // 添加接线元
  function addElement(element: Omit<ConnectorElement, 'id'>, emitLink = true) {
    if (!currentTable.value) return null
    
    const newElement: ConnectorElement = {
      ...element,
      id: `elem-${Date.now()}`
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
        currentTable.value.elements.push(newElement as any)
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

  // 自动加载mock数据
  initMockData()
  setupDataLinkListener()

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
    addElement,
    updateElement,
    deleteElement,
    getElementsByType,
    deleteTable
  }
})
