import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConnectorElement, ConnectorTable, ConnectorType } from '@/types'

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
  function addElement(element: Omit<ConnectorElement, 'id'>) {
    if (!currentTable.value) return null
    
    const newElement: ConnectorElement = {
      ...element,
      id: `elem-${Date.now()}`
    }
    currentTable.value.elements.push(newElement)
    currentTable.value.updatedAt = new Date().toISOString()
    return newElement.id
  }

  // 更新接线元
  function updateElement(id: string, updates: Partial<ConnectorElement>) {
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
  function deleteElement(id: string) {
    if (!currentTable.value) return false
    
    const index = currentTable.value.elements.findIndex(e => e.id === id)
    if (index === -1) return false
    
    currentTable.value.elements.splice(index, 1)
    currentTable.value.updatedAt = new Date().toISOString()
    return true
  }

  // 按类型筛选
  function getElementsByType(type: ConnectorType) {
    return elements.value.filter(e => e.type === type)
  }

  // 生成模拟数据
  function generateMockData() {
    if (!currentTable.value) {
      createTable('默认接线元表')
    }
    
    const mockElements: Omit<ConnectorElement, 'id'>[] = [
      { name: '接头盒 J1', type: 'joint', kp: 50, longitude: 122.5, latitude: 31.2, depth: 120, status: 'active', specifications: 'UJ-2000', remarks: '' },
      { name: '分支单元 BU1', type: 'bu', kp: 200, longitude: 124.0, latitude: 30.5, depth: 2500, status: 'active', specifications: 'BU-4x4', manufacturer: 'SubCom', remarks: '四路分支' },
      { name: '馈电设备 PFE1', type: 'pfe', kp: 0, longitude: 121.5, latitude: 31.4, depth: 0, status: 'active', specifications: 'PFE-15kV', remarks: '登陆站A' },
      { name: '光放大器 OLA1', type: 'ola', kp: 80, longitude: 123.0, latitude: 31.0, depth: 800, status: 'active', specifications: 'EDFA-20dB', remarks: '' },
      { name: '均衡器 EQ1', type: 'equalizer', kp: 150, longitude: 123.5, latitude: 30.8, depth: 1500, status: 'active', specifications: 'GEQ-C', remarks: '' },
      { name: '耦合器 CP1', type: 'coupler', kp: 300, longitude: 125.0, latitude: 30.0, depth: 3000, status: 'planned', specifications: '1x2-50/50', remarks: '规划中' },
    ]
    
    mockElements.forEach(elem => addElement(elem))
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
    addElement,
    updateElement,
    deleteElement,
    getElementsByType,
    generateMockData,
    deleteTable
  }
})
