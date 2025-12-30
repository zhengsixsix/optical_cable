import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  SLDTable, 
  SLDEquipment, 
  SLDFiberSegment,
  SLDMetadata,
  SLDTransmissionParams,
  SLDEquipmentType,
  SLDValidationResult
} from '@/types'
import { mockSLDEquipments, mockSLDFiberSegments, mockTransmissionParams, ROUTE_ID, ROUTE_NAME } from '@/data/mockData'
import { dataLinkService } from '@/services'

export const useSLDStore = defineStore('sld', () => {
  // 状态
  const tables = ref<SLDTable[]>([])
  const currentTableId = ref<string | null>(null)
  const selectedEquipmentId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)

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
      id: `sld-${Date.now()}`,
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
    selectedEquipmentId.value = null
    selectedSegmentId.value = null
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
  function addEquipment(equipment: Omit<SLDEquipment, 'id' | 'sequence'>, emitLink = true): SLDEquipment | null {
    if (!currentTable.value) return null
    
    const newEquipment: SLDEquipment = {
      ...equipment,
      id: `eq-${Date.now()}`,
      sequence: currentTable.value.equipments.length + 1,
    }
    
    currentTable.value.equipments.push(newEquipment)
    recalculateSequences()
    updateMetadata()
    
    // 触发数据联动
    if (emitLink) {
      dataLinkService.emit({
        source: 'sld',
        action: 'add',
        data: newEquipment,
        kp: newEquipment.kp,
      })
    }
    
    return newEquipment
  }

  function updateEquipment(equipmentId: string, data: Partial<SLDEquipment>, emitLink = true) {
    if (!currentTable.value) return
    
    const equipment = currentTable.value.equipments.find(e => e.id === equipmentId)
    if (equipment) {
      Object.assign(equipment, data)
      updateMetadata()
      
      // 触发数据联动
      if (emitLink) {
        dataLinkService.emit({
          source: 'sld',
          action: 'update',
          data: equipment,
          kp: equipment.kp,
        })
      }
    }
  }

  function deleteEquipment(equipmentId: string, emitLink = true) {
    if (!currentTable.value) return
    
    const equipment = currentTable.value.equipments.find(e => e.id === equipmentId)
    
    currentTable.value.equipments = currentTable.value.equipments.filter(
      e => e.id !== equipmentId
    )
    // 删除相关光纤段
    currentTable.value.fiberSegments = currentTable.value.fiberSegments.filter(
      s => s.fromEquipmentId !== equipmentId && s.toEquipmentId !== equipmentId
    )
    recalculateSequences()
    updateMetadata()
    
    // 触发数据联动
    if (emitLink && equipment) {
      dataLinkService.emit({
        source: 'sld',
        action: 'delete',
        data: equipment,
        kp: equipment.kp,
      })
    }
  }

  // 光纤段操作
  function addFiberSegment(segment: Omit<SLDFiberSegment, 'id' | 'sequence'>): SLDFiberSegment | null {
    if (!currentTable.value) return null
    
    const newSegment: SLDFiberSegment = {
      ...segment,
      id: `seg-${Date.now()}`,
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

  // 传输参数
  function updateTransmissionParams(params: Partial<SLDTransmissionParams>) {
    if (!currentTable.value) return
    Object.assign(currentTable.value.transmissionParams, params)
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
      currentTable.value.fiberSegments
    )
    currentTable.value.updatedAt = new Date()
  }

  function calculateMetadata(equipments: SLDEquipment[], segments: SLDFiberSegment[]): SLDMetadata {
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0)
    const totalFiberPairs = segments.length > 0 ? segments[0].fiberPairs : 0

    return {
      totalLength,
      totalEquipments: equipments.length,
      terminalCount: equipments.filter(e => e.type === 'TE' || e.type === 'PFE').length,
      repeaterCount: equipments.filter(e => e.type === 'REP').length,
      branchingUnitCount: equipments.filter(e => e.type === 'BU').length,
      jointCount: equipments.filter(e => e.type === 'JOINT').length,
      totalFiberPairs,
      estimatedCapacity: totalFiberPairs * 12, // 简化估算
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

    // 检查是否有终端设备
    const terminals = equipments.filter(e => e.type === 'TE' || e.type === 'PFE')
    if (terminals.length < 2) {
      errors.push({ itemId: '', itemType: 'equipment', field: 'type', message: '至少需要2个终端设备' })
    }

    // 检查光纤段连接
    segments.forEach(seg => {
      const fromEq = equipments.find(e => e.id === seg.fromEquipmentId)
      const toEq = equipments.find(e => e.id === seg.toEquipmentId)
      
      if (!fromEq) {
        errors.push({ itemId: seg.id, itemType: 'segment', field: 'fromEquipmentId', message: `光纤段 ${seg.sequence}: 起始设备不存在` })
      }
      if (!toEq) {
        errors.push({ itemId: seg.id, itemType: 'segment', field: 'toEquipmentId', message: `光纤段 ${seg.sequence}: 终止设备不存在` })
      }

      // 检查衰减
      if (seg.totalLoss > 25) {
        warnings.push({ itemId: seg.id, itemType: 'segment', field: 'totalLoss', message: `光纤段 ${seg.sequence}: 损耗${seg.totalLoss}dB超过建议值25dB` })
      }
    })

    // 检查中继器间距
    const repeaters = equipments.filter(e => e.type === 'REP').sort((a, b) => a.kp - b.kp)
    for (let i = 1; i < repeaters.length; i++) {
      const distance = repeaters[i].kp - repeaters[i-1].kp
      if (distance > 120) {
        warnings.push({ 
          itemId: repeaters[i].id, 
          itemType: 'equipment', 
          field: 'kp', 
          message: `中继器 ${repeaters[i].name}: 与前一中继器间距${distance.toFixed(1)}km超过建议值120km` 
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  // 从RPL生成SLD
  function generateFromRPL(rplTableId: string, rplRecords: any[], tableName: string): SLDTable {
    const table = createTable(tableName)
    
    let prevEquipmentId: string | null = null
    
    rplRecords.forEach((record, index) => {
      // 只为关键点创建设备
      if (['landing', 'repeater', 'branching', 'joint'].includes(record.pointType)) {
        const equipmentType = mapPointTypeToEquipment(record.pointType)
        const equipment = addEquipment({
          name: record.remarks || `${equipmentType}-${index + 1}`,
          type: equipmentType,
          location: `KP ${record.kp.toFixed(1)}`,
          kp: record.kp,
          longitude: record.longitude,
          latitude: record.latitude,
          depth: record.depth,
          specifications: '',
          remarks: '',
        })

        // 创建光纤段
        if (prevEquipmentId && equipment) {
          const prevEq = currentTable.value?.equipments.find(e => e.id === prevEquipmentId)
          const length = prevEq ? record.kp - prevEq.kp : 0
          
          addFiberSegment({
            fromEquipmentId: prevEquipmentId,
            toEquipmentId: equipment.id,
            fromName: prevEq?.name || '',
            toName: equipment.name,
            length,
            fiberPairs: 8,
            fiberPairType: 'working',
            cableType: record.cableType || 'LW',
            attenuation: 0.2,
            totalLoss: length * 0.2,
            remarks: '',
          })
        }

        if (equipment) {
          prevEquipmentId = equipment.id
        }
      }
    })

    return table
  }

  function mapPointTypeToEquipment(pointType: string): SLDEquipmentType {
    const map: Record<string, SLDEquipmentType> = {
      landing: 'TE',
      repeater: 'REP',
      branching: 'BU',
      joint: 'JOINT',
    }
    return map[pointType] || 'JOINT'
  }

  // 初始化加载mock数据
  function initMockData() {
    if (tables.value.length === 0) {
      const table = createTable(`${ROUTE_NAME}_SLD`, ROUTE_ID)
      
      // 更新传输参数
      Object.assign(table.transmissionParams, mockTransmissionParams)
      
      // 添加设备（初始化时不触发联动）
      mockSLDEquipments.forEach(eq => addEquipment(eq, false))
      
      // 添加光纤段，关联设备ID
      const eqs = currentTable.value!.equipments
      mockSLDFiberSegments.forEach((seg, index) => {
        if (index < eqs.length - 1) {
          addFiberSegment({
            ...seg,
            fromEquipmentId: eqs[index].id,
            toEquipmentId: eqs[index + 1].id,
          })
        }
      })
      
      return table
    }
    return null
  }

  // 监听其他模块的数据变更
  function setupDataLinkListener() {
    dataLinkService.subscribe('sld', (event) => {
      if (!currentTable.value) return
      
      // 根据KP查找对应设备
      const equipment = currentTable.value.equipments.find(
        e => Math.abs(e.kp - (event.kp || 0)) < 1
      )
      
      if (event.action === 'add' && !equipment) {
        // RPL新增了关键点，同步创建SLD设备
        const sldData = dataLinkService.rplToSldEquipment(event.data)
        if (sldData) {
          addEquipment(sldData, false)
        }
      } else if (event.action === 'update' && equipment) {
        // 同步更新坐标和深度
        updateEquipment(equipment.id, {
          longitude: event.data.longitude ?? equipment.longitude,
          latitude: event.data.latitude ?? equipment.latitude,
          depth: event.data.depth ?? equipment.depth,
        }, false)
      } else if (event.action === 'delete' && equipment) {
        // 同步删除设备
        deleteEquipment(equipment.id, false)
      }
    })
  }

  // 自动加载mock数据
  initMockData()
  setupDataLinkListener()

  return {
    // State
    tables,
    currentTableId,
    selectedEquipmentId,
    selectedSegmentId,
    // Getters
    currentTable,
    equipments,
    fiberSegments,
    // Actions
    createTable,
    selectTable,
    deleteTable,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    addFiberSegment,
    updateFiberSegment,
    deleteFiberSegment,
    updateTransmissionParams,
    validateTable,
    generateFromRPL,
  }
})
