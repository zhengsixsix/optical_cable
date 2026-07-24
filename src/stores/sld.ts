import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  SLDTable, 
  SLDEquipment, 
  SLDFiberSegment,
  SLDMetadata,
  SLDTransmissionParams,
  SLDValidationResult,
  SLDExportTemplateVersion,
} from '@/types'
import {
  createSldMetadataVersionFields,
  DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
} from '@/services/sldDeviceRegistry'

export const useSLDStore = defineStore('sld', () => {
  // 状态
  const tables = ref<SLDTable[]>([])
  const currentTableId = ref<string | null>(null)

  function createId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  // Getters
  const currentTable = computed(() => 
    tables.value.find(t => t.id === currentTableId.value) || null
  )

  const equipments = computed(() => currentTable.value?.equipments || [])
  const fiberSegments = computed(() => currentTable.value?.fiberSegments || [])

  // Actions
  function createTable(name: string, routeId?: string): SLDTable {
    const defaultTransmissionParams: SLDTransmissionParams = {
      designCapacity: 100,
      wavelengths: 96,
      channelSpacing: 50,
      modulationFormat: '16QAM',
      launchPower: 1,
      osnrRequired: 20,
      spanLossBudget: 20,
      systemMargin: 3,
    }

    const newTable: SLDTable = {
      id: createId('sld'),
      name,
      routeId,
      equipments: [],
      fiberSegments: [],
      transmissionParams: defaultTransmissionParams,
      metadata: calculateMetadata([], []),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    tables.value.push(newTable)
    currentTableId.value = newTable.id
    return newTable
  }

  function selectTable(tableId: string | null) {
    currentTableId.value = tableId
  }

  function replaceTables(nextTables: SLDTable[]) {
    tables.value = nextTables
  }

  function setCurrentTableId(tableId: string | null) {
    currentTableId.value = tableId
  }

  function deleteTable(tableId: string) {
    const index = tables.value.findIndex(t => t.id === tableId)
    if (index > -1) {
      tables.value.splice(index, 1)
      if (currentTableId.value === tableId) {
        currentTableId.value = tables.value[0]?.id || null
      }
    }
  }

  // 设备操作
  function addEquipment(equipment: Omit<SLDEquipment, 'id' | 'sequence'>, _emitLink = true): SLDEquipment | null {
    if (!currentTable.value) return null
    
    const newEquipment: SLDEquipment = {
      ...equipment,
      syncSource: equipment.syncSource || 'manual',
      id: createId('eq'),
      sequence: currentTable.value.equipments.length + 1,
    }
    
    currentTable.value.equipments.push(newEquipment)
    recalculateSequences()
    updateMetadata()
    
    return newEquipment
  }

  function updateEquipment(equipmentId: string, data: Partial<SLDEquipment>, _emitLink = true) {
    if (!currentTable.value) return
    
    const equipment = currentTable.value.equipments.find(e => e.id === equipmentId)
    if (equipment) {
      Object.assign(equipment, data)
      updateMetadata()
      
    }
  }

  function deleteEquipment(equipmentId: string, _emitLink = true) {
    if (!currentTable.value) return
    
    currentTable.value.equipments = currentTable.value.equipments.filter(
      e => e.id !== equipmentId
    )
    // 删除相关光纤段
    currentTable.value.fiberSegments = currentTable.value.fiberSegments.filter(
      s => s.fromEquipmentId !== equipmentId && s.toEquipmentId !== equipmentId
    )
    recalculateSequences()
    updateMetadata()
    
  }

  // 光纤段操作
  function addFiberSegment(segment: Omit<SLDFiberSegment, 'id' | 'sequence'>): SLDFiberSegment | null {
    if (!currentTable.value) return null
    
    const newSegment: SLDFiberSegment = {
      ...segment,
      syncSource: segment.syncSource || 'manual',
      id: createId('seg'),
      sequence: currentTable.value.fiberSegments.length + 1,
    }
    
    currentTable.value.fiberSegments.push(newSegment)
    updateMetadata()
    return newSegment
  }

  function updateFiberSegment(segmentId: string, data: Partial<SLDFiberSegment>) {
    if (!currentTable.value) return
    
    const segment = currentTable.value.fiberSegments.find(s => s.id === segmentId)
    if (segment) {
      Object.assign(segment, data)
      updateMetadata()
    }
  }

  function deleteFiberSegment(segmentId: string) {
    if (!currentTable.value) return
    
    currentTable.value.fiberSegments = currentTable.value.fiberSegments.filter(
      s => s.id !== segmentId
    )
    updateMetadata()
  }

  function setExportTemplateVersion(version: SLDExportTemplateVersion) {
    if (!currentTable.value) return
    currentTable.value.metadata = {
      ...currentTable.value.metadata,
      ...createSldMetadataVersionFields(currentTable.value.metadata),
      exportTemplateVersion: version || DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
    }
    currentTable.value.updatedAt = new Date()
  }

  function recalculateSequences() {
    if (!currentTable.value) return
    currentTable.value.equipments.forEach((eq, index) => {
      eq.sequence = index + 1
    })
    currentTable.value.fiberSegments.forEach((seg, index) => {
      seg.sequence = index + 1
    })
  }

  function updateMetadata() {
    if (!currentTable.value) return
    currentTable.value.metadata = calculateMetadata(
      currentTable.value.equipments,
      currentTable.value.fiberSegments,
      currentTable.value.metadata,
    )
    currentTable.value.updatedAt = new Date()
  }

  function calculateMetadata(
    equipments: SLDEquipment[],
    segments: SLDFiberSegment[],
    previous?: Partial<SLDMetadata>,
  ): SLDMetadata {
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0)
    const totalFiberPairs = segments.length > 0 ? segments[0].fiberPairs : 0

    return {
      totalLength,
      totalEquipments: equipments.length,
      terminalCount: equipments.filter(e => e.type === 'TE' || e.type === 'PFE').length,
      repeaterCount: equipments.filter(e => e.type === 'REP').length,
      branchingUnitCount: equipments.filter(e => e.type === 'BU').length,
      equalizerCount: equipments.filter(e => e.type === 'EQ').length,
      jointCount: equipments.filter(e => e.type === 'JOINT').length,
      totalFiberPairs,
      ...createSldMetadataVersionFields(previous),
    }
  }

  function validateTable(): SLDValidationResult {
    const errors: SLDValidationResult['errors'] = []
    const warnings: SLDValidationResult['warnings'] = []
    
    if (!currentTable.value) {
      return { valid: false, errors: [{ itemId: '', itemType: 'equipment', field: '', message: '未选择表格' }], warnings }
    }

    const equipments = currentTable.value.equipments
    const segments = currentTable.value.fiberSegments

    // 这里只校验引用完整性，不在前端执行损耗或跨段工程判定。
    segments.forEach(seg => {
      const fromEq = equipments.find(e => e.id === seg.fromEquipmentId)
      const toEq = equipments.find(e => e.id === seg.toEquipmentId)
      
      if (!fromEq) {
        errors.push({ itemId: seg.id, itemType: 'segment', field: 'fromEquipmentId', message: `光纤段 ${seg.sequence}: 起始设备不存在` })
      }
      if (!toEq) {
        errors.push({ itemId: seg.id, itemType: 'segment', field: 'toEquipmentId', message: `光纤段 ${seg.sequence}: 终止设备不存在` })
      }
    })

    return { valid: errors.length === 0, errors, warnings }
  }

  // 清空数据
  function clearData() {
    tables.value = []
    currentTableId.value = null
  }

  return {
    // State
    tables,
    currentTableId,
    // Getters
    currentTable,
    equipments,
    fiberSegments,
    // Actions
    createTable,
    selectTable,
    replaceTables,
    setCurrentTableId,
    deleteTable,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    addFiberSegment,
    updateFiberSegment,
    deleteFiberSegment,
    setExportTemplateVersion,
    validateTable,
    // 项目数据管理
    clearData,
  }
})
