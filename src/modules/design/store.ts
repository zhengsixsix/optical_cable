import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logger } from '@/shared/utils'

/**
 * 系统设计模块 Store
 * 合并原 sld + rpl + connector store
 */

// ==================== SLD 类型定义 ====================
export type SLDEquipmentType = 'TE' | 'PFE' | 'REP' | 'BU' | 'JOINT' | 'OADM'

export interface SLDEquipment {
  id: string
  sequence: number
  name: string
  type: SLDEquipmentType
  location: string
  kp: number
  longitude?: number
  latitude?: number
  depth?: number
  specifications: string
  remarks: string
}

export interface SLDFiberSegment {
  id: string
  sequence: number
  fromEquipmentId: string
  toEquipmentId: string
  fromName: string
  toName: string
  length: number
  fiberPairs: number
  fiberPairType: 'working' | 'spare'
  cableType: string
  attenuation: number
  totalLoss: number
  remarks: string
}

export interface SLDTransmissionParams {
  designCapacity: number
  wavelengths: number
  channelSpacing: number
  modulationFormat: string
  launchPower: number
  osnrRequired: number
  spanLossBudget: number
  systemMargin: number
}

export interface SLDTable {
  id: string
  name: string
  routeId?: string
  equipments: SLDEquipment[]
  fiberSegments: SLDFiberSegment[]
  transmissionParams: SLDTransmissionParams
  createdAt: Date
  updatedAt: Date
}

// ==================== RPL 类型定义 ====================
export type RPLPointType = 'landing' | 'repeater' | 'branching' | 'joint' | 'waypoint'
export type RPLCableCode = 'LW' | 'LWS' | 'SA' | 'DA' | 'SAS'

export interface RPLRecord {
  id: string
  sequence: number
  kp: number
  longitude: number
  latitude: number
  depth: number
  pointType: RPLPointType
  cableType: RPLCableCode
  segmentLength: number
  cumulativeLength: number
  slack: number
  burialDepth: number
  remarks: string
}

export interface RPLTable {
  id: string
  name: string
  routeId: string
  records: RPLRecord[]
  createdAt: Date
  updatedAt: Date
}

// ==================== Connector 类型定义 ====================
export type ConnectorType = 'fiber' | 'power' | 'ground'

export interface ConnectorElement {
  id: string
  name: string
  type: ConnectorType
  kp: number
  longitude?: number
  latitude?: number
  depth?: number
  specifications: string
}

export interface ConnectorTable {
  id: string
  name: string
  routeId?: string
  elements: ConnectorElement[]
  createdAt: string
  updatedAt: string
}

// ==================== 面板可见性 ====================
export interface DesignPanelVisibility {
  sldTable: boolean
  rplTable: boolean
  connectorPanel: boolean
  wdmConfig: boolean
  segmentConfig: boolean
  repeaterConfig: boolean
}

export const useDesignStore = defineStore('design', () => {
  // ==================== SLD 状态 ====================
  const sldTables = ref<SLDTable[]>([])
  const currentSldTableId = ref<string | null>(null)
  const selectedEquipmentId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)

  // ==================== RPL 状态 ====================
  const rplTables = ref<RPLTable[]>([])
  const currentRplTableId = ref<string | null>(null)
  const selectedRecordIds = ref<string[]>([])

  // ==================== Connector 状态 ====================
  const connectorTables = ref<ConnectorTable[]>([])
  const currentConnectorTableId = ref<string | null>(null)

  // ==================== 面板状态 ====================
  const panelVisibility = ref<DesignPanelVisibility>({
    sldTable: true,
    rplTable: true,
    connectorPanel: false,
    wdmConfig: false,
    segmentConfig: false,
    repeaterConfig: false,
  })

  // ==================== 计算属性 ====================
  const currentSldTable = computed(() =>
    sldTables.value.find(t => t.id === currentSldTableId.value) || null
  )

  const currentRplTable = computed(() =>
    rplTables.value.find(t => t.id === currentRplTableId.value) || null
  )

  const currentConnectorTable = computed(() =>
    connectorTables.value.find(t => t.id === currentConnectorTableId.value) || null
  )

  const equipments = computed(() => currentSldTable.value?.equipments || [])
  const fiberSegments = computed(() => currentSldTable.value?.fiberSegments || [])
  const rplRecords = computed(() => currentRplTable.value?.records || [])
  const connectorElements = computed(() => currentConnectorTable.value?.elements || [])

  // ==================== SLD 操作 ====================
  function createSldTable(name: string, routeId?: string): SLDTable {
    const defaultParams: SLDTransmissionParams = {
      designCapacity: 100,
      wavelengths: 96,
      channelSpacing: 50,
      modulationFormat: '16QAM',
      launchPower: 1,
      osnrRequired: 20,
      spanLossBudget: 20,
      systemMargin: 3,
    }

    const table: SLDTable = {
      id: `sld-${Date.now()}`,
      name,
      routeId,
      equipments: [],
      fiberSegments: [],
      transmissionParams: defaultParams,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    sldTables.value.push(table)
    currentSldTableId.value = table.id
    logger.info(`创建 SLD 表格: ${name}`)
    return table
  }

  function selectSldTable(tableId: string | null) {
    currentSldTableId.value = tableId
    selectedEquipmentId.value = null
    selectedSegmentId.value = null
  }

  function addEquipment(equipment: Omit<SLDEquipment, 'id' | 'sequence'>): SLDEquipment | null {
    if (!currentSldTable.value) return null

    const newEquipment: SLDEquipment = {
      ...equipment,
      id: `eq-${Date.now()}`,
      sequence: currentSldTable.value.equipments.length + 1,
    }

    currentSldTable.value.equipments.push(newEquipment)
    currentSldTable.value.updatedAt = new Date()
    return newEquipment
  }

  function updateEquipment(equipmentId: string, data: Partial<SLDEquipment>) {
    if (!currentSldTable.value) return

    const equipment = currentSldTable.value.equipments.find(e => e.id === equipmentId)
    if (equipment) {
      Object.assign(equipment, data)
      currentSldTable.value.updatedAt = new Date()
    }
  }

  function deleteEquipment(equipmentId: string) {
    if (!currentSldTable.value) return

    currentSldTable.value.equipments = currentSldTable.value.equipments.filter(
      e => e.id !== equipmentId
    )
    currentSldTable.value.fiberSegments = currentSldTable.value.fiberSegments.filter(
      s => s.fromEquipmentId !== equipmentId && s.toEquipmentId !== equipmentId
    )
    currentSldTable.value.updatedAt = new Date()
  }

  // ==================== RPL 操作 ====================
  function createRplTable(name: string, routeId: string): RPLTable {
    const table: RPLTable = {
      id: `rpl-${Date.now()}`,
      name,
      routeId,
      records: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    rplTables.value.push(table)
    currentRplTableId.value = table.id
    logger.info(`创建 RPL 表格: ${name}`)
    return table
  }

  function selectRplTable(tableId: string | null) {
    currentRplTableId.value = tableId
    selectedRecordIds.value = []
  }

  function addRplRecord(record: Omit<RPLRecord, 'id' | 'sequence'>): RPLRecord | null {
    if (!currentRplTable.value) return null

    const newRecord: RPLRecord = {
      ...record,
      id: `rec-${Date.now()}`,
      sequence: currentRplTable.value.records.length + 1,
    }

    currentRplTable.value.records.push(newRecord)
    currentRplTable.value.updatedAt = new Date()
    return newRecord
  }

  function updateRplRecord(recordId: string, data: Partial<RPLRecord>) {
    if (!currentRplTable.value) return

    const record = currentRplTable.value.records.find(r => r.id === recordId)
    if (record) {
      Object.assign(record, data)
      currentRplTable.value.updatedAt = new Date()
    }
  }

  function deleteRplRecords(recordIds: string[]) {
    if (!currentRplTable.value) return

    currentRplTable.value.records = currentRplTable.value.records.filter(
      r => !recordIds.includes(r.id)
    )
    selectedRecordIds.value = selectedRecordIds.value.filter(id => !recordIds.includes(id))
    currentRplTable.value.updatedAt = new Date()
  }

  // ==================== Connector 操作 ====================
  function createConnectorTable(name: string, routeId?: string): string {
    const table: ConnectorTable = {
      id: `conn-${Date.now()}`,
      name,
      routeId,
      elements: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    connectorTables.value.push(table)
    currentConnectorTableId.value = table.id
    logger.info(`创建 Connector 表格: ${name}`)
    return table.id
  }

  function addConnectorElement(element: Omit<ConnectorElement, 'id'>): string | null {
    if (!currentConnectorTable.value) return null

    const newElement: ConnectorElement = {
      ...element,
      id: `elem-${Date.now()}`,
    }

    currentConnectorTable.value.elements.push(newElement)
    currentConnectorTable.value.updatedAt = new Date().toISOString()
    return newElement.id
  }

  // ==================== 面板操作 ====================
  function togglePanel(panelName: keyof DesignPanelVisibility) {
    panelVisibility.value[panelName] = !panelVisibility.value[panelName]
  }

  function setPanelVisible(panelName: keyof DesignPanelVisibility, visible: boolean) {
    panelVisibility.value[panelName] = visible
  }

  // ==================== 清理操作 ====================
  function clearAllData() {
    sldTables.value = []
    rplTables.value = []
    connectorTables.value = []
    currentSldTableId.value = null
    currentRplTableId.value = null
    currentConnectorTableId.value = null
    selectedEquipmentId.value = null
    selectedSegmentId.value = null
    selectedRecordIds.value = []
    logger.info('清空所有设计数据')
  }

  return {
    // SLD 状态
    sldTables,
    currentSldTableId,
    selectedEquipmentId,
    selectedSegmentId,
    currentSldTable,
    equipments,
    fiberSegments,
    // SLD 操作
    createSldTable,
    selectSldTable,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    // RPL 状态
    rplTables,
    currentRplTableId,
    selectedRecordIds,
    currentRplTable,
    rplRecords,
    // RPL 操作
    createRplTable,
    selectRplTable,
    addRplRecord,
    updateRplRecord,
    deleteRplRecords,
    // Connector 状态
    connectorTables,
    currentConnectorTableId,
    currentConnectorTable,
    connectorElements,
    // Connector 操作
    createConnectorTable,
    addConnectorElement,
    // 面板状态
    panelVisibility,
    togglePanel,
    setPanelVisible,
    // 清理
    clearAllData,
  }
})
