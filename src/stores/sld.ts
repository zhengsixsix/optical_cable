import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  SLDTable, 
  SLDEquipment, 
  SLDFiberSegment,
  SLDMetadata,
  SLDTransmissionParams,
  SLDEquipmentType,
  SLDValidationResult,
  SLDExportTemplateVersion,
} from '@/types'
import { mockSLDEquipments, mockSLDFiberSegments, mockTransmissionParams, ROUTE_ID, ROUTE_NAME } from '@/data/mockData'
import { dataLinkService } from '@/services'
import { normalizeEqualizerConfig } from '@/utils/equalizer'
import { getRoutePositionAtKP } from '@/utils/routePosition'
import { useSettingsStore } from '@/stores/settings'
import { useRPLStore } from '@/stores/rpl'
import { useRouteStore } from '@/stores/route'
import {
  buildSldEquipmentConfigParams,
  createSldMetadataVersionFields,
  DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
  resolveBranchingSubTypeFromValue,
  resolveJointSubTypeFromValue,
  resolveSldSymbolCode,
} from '@/services/sldDeviceRegistry'

export const useSLDStore = defineStore('sld', () => {
  // 状态
  const tables = ref<SLDTable[]>([])
  const currentTableId = ref<string | null>(null)
  const selectedEquipmentId = ref<string | null>(null)
  const selectedSegmentId = ref<string | null>(null)

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
      syncSource: equipment.syncSource || 'manual',
      id: createId('eq'),
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

  // 传输参数
  function updateTransmissionParams(params: Partial<SLDTransmissionParams>) {
    if (!currentTable.value) return
    Object.assign(currentTable.value.transmissionParams, params)
    currentTable.value.updatedAt = new Date()
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

  function getEquipmentSortWeight(type: SLDEquipmentType) {
    switch (type) {
      case 'TE':
        return 0
      case 'PFE':
        return 1
      case 'REP':
        return 2
      case 'BU':
        return 3
      case 'EQ':
        return 4
      case 'JOINT':
        return 5
      case 'OADM':
        return 6
      default:
        return 9
    }
  }

  function sortEquipmentsByKp() {
    if (!currentTable.value) return
    currentTable.value.equipments = [...currentTable.value.equipments].sort((a, b) =>
      a.kp - b.kp ||
      getEquipmentSortWeight(a.type) - getEquipmentSortWeight(b.type) ||
      a.sequence - b.sequence
    )
  }

  function segmentPairKey(fromEquipmentId: string, toEquipmentId: string) {
    return [fromEquipmentId, toEquipmentId].sort().join('::')
  }

  function inferJointSubType(value?: string): SLDEquipment['jointSubType'] | undefined {
    return resolveJointSubTypeFromValue(value)
  }

  function inferBranchingSubType(value?: string): SLDEquipment['buSubType'] | undefined {
    return resolveBranchingSubTypeFromValue(value)
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
      estimatedCapacity: totalFiberPairs * 12, // 简化估算
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

    // 检查放大器间距
    const repeaters = equipments.filter(e => e.type === 'REP').sort((a, b) => a.kp - b.kp)
    for (let i = 1; i < repeaters.length; i++) {
      const distance = repeaters[i].kp - repeaters[i-1].kp
      if (distance > 120) {
        warnings.push({ 
          itemId: repeaters[i].id, 
          itemType: 'equipment', 
          field: 'kp', 
          message: `放大器 ${repeaters[i].name}: 与前一放大器间距${distance.toFixed(1)}km超过建议值120km` 
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  // 从RPL生成SLD
  function generateFromRPL(rplTableId: string, rplRecords: any[], tableName: string, routeId?: string): SLDTable {
    const table = createTable(tableName, routeId)
    
    let prevEquipmentId: string | null = null
    
    rplRecords.forEach((record, index) => {
      // 只为关键点创建设备
      if (['landing', 'repeater', 'branching', 'joint'].includes(record.pointType)) {
        const equipmentType = mapPointTypeToEquipment(record.pointType)
        const equipment = addEquipment({
          name: record.remarks || `${getEquipmentTypeChinese(equipmentType)}-${index + 1}`,
          type: equipmentType,
          location: `KP ${record.kp.toFixed(1)}`,
          kp: record.kp,
          longitude: record.longitude,
          latitude: record.latitude,
          depth: record.depth,
          specifications: '',
          remarks: '',
          syncSource: 'rpl',
          syncRouteId: routeId,
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
            syncSource: 'rpl',
            syncRouteId: routeId,
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

  function getEquipmentTypeChinese(equipmentType: SLDEquipmentType): string {
    const map: Record<string, string> = {
      'TE': '岸上站点',
      'PFE': '水下站点',
      'REP': '放大器',
      'BU': '水下分支器',
      'EQ': '均衡器',
      'JOINT': '接头盒',
      'OADM': '光分插复用器',
    }
    return map[equipmentType] || equipmentType
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

  // 从接线元同步主干设备到 SLD 表格
  function syncAmplifiersFromConnector(connectorElements: Array<{
    id: string
    name: string
    type: string
    kp: number
    longitude: number
    latitude: number
    depth: number
    specifications?: string
    remarks?: string
    equalizerRole?: 'T' | 'S'
    attenuationMode?: 'adjustable' | 'fixed'
    attenuationDb?: number
    componentRefId?: string
    jointSubType?: SLDEquipment['jointSubType']
    buSubType?: SLDEquipment['buSubType']
  }>, options: { routeId?: string } = {}) {
    if (!currentTable.value) return

    const routeId = options.routeId || currentTable.value.routeId
    if (!currentTable.value.routeId && routeId) {
      currentTable.value.routeId = routeId
    }

    const settingsStore = useSettingsStore()
    const rplStore = useRPLStore()
    const routeStore = useRouteStore()
    const connectorTypeToSld: Partial<Record<string, SLDEquipmentType>> = {
      amplifier_e: 'REP',
      amplifier_w: 'REP',
      ola: 'REP',
      landing: 'TE',
      underwater: 'PFE',
      bu: 'BU',   // 动态覆盖，見下方
      equalizer: 'EQ',
      joint: 'JOINT',
    }

    const isConnectorSyncedEquipment = (equipment: SLDEquipment) =>
      equipment.syncSource === 'connector-trunk' &&
      (!routeId || !equipment.syncRouteId || equipment.syncRouteId === routeId)

    const syncElements = connectorElements
      .filter(e => ['landing', 'underwater', 'amplifier_e', 'amplifier_w', 'ola', 'bu', 'equalizer', 'joint'].includes(e.type))
      .sort((a, b) => a.kp - b.kp)

    if (syncElements.length === 0) return

    const routeRplTable = routeId
      ? (rplStore.tables.find(table => table.routeId === routeId) || (rplStore.currentTable?.routeId === routeId ? rplStore.currentTable : null))
      : rplStore.currentTable
    const routeForDepth = routeId
      ? (routeStore.routes.find(route => route.id === routeId) || routeStore.selectedRoute)
      : routeStore.selectedRoute
    const routeRplRecords = routeRplTable?.records || []
    const routeTotalLength = routeRplTable?.metadata?.totalLength ?? routeForDepth?.totalLength

    const resolveElementPosition = (element: { kp: number; longitude: number; latitude: number; depth: number }) => {
      const hasNonZeroDepth = Number.isFinite(element.depth) && Math.abs(element.depth) > 0
      const hasCoordinates = Number.isFinite(element.longitude) && Number.isFinite(element.latitude)
      if (hasNonZeroDepth && hasCoordinates) return null
      if (!routeForDepth && routeRplRecords.length === 0) return null
      return getRoutePositionAtKP(element.kp, routeForDepth as { points: any[]; segments: any[] } | null, {
        configuredTotalLength: routeTotalLength,
        rplRecords: routeRplRecords,
      })
    }

    const manualSegmentRefs = new Set(
      currentTable.value.fiberSegments
        .filter(segment => segment.syncSource !== 'connector-trunk')
        .flatMap(segment => [segment.fromEquipmentId, segment.toEquipmentId])
    )

    const syncedConnectorIds = new Set<string>()

    syncElements.forEach(elem => {
      // 分支器：如果对应器件库里的 subType 是 ROADM 或 OADM，则映射到 SLD OADM 类型
      let sldType = connectorTypeToSld[elem.type]
      const amplifierLib = (elem.type === 'amplifier_e' || elem.type === 'amplifier_w' || elem.type === 'ola') && elem.componentRefId
        ? settingsStore.amplifierTypes.find(a => a.id === elem.componentRefId)
        : undefined
      const buLib = elem.type === 'bu' && elem.componentRefId
        ? settingsStore.branchingUnitTypes.find(b => b.id === elem.componentRefId)
        : undefined
      const jointLib = elem.type === 'joint' && elem.componentRefId
        ? settingsStore.jointBoxTypes.find(j => j.id === elem.componentRefId)
        : undefined
      const equalizerLib = elem.type === 'equalizer' && elem.componentRefId
        ? settingsStore.equalizerTypes.find(e => e.id === elem.componentRefId)
        : undefined
      if (elem.type === 'bu' && elem.componentRefId) {
        if (buLib?.subType === 'ROADM' || buLib?.subType === 'OADM') {
          sldType = 'OADM'
        }
      }
      if (!sldType) return

      syncedConnectorIds.add(elem.id)

      const resolvedPosition = resolveElementPosition(elem)
      const resolvedLongitude = resolvedPosition ? resolvedPosition.longitude : elem.longitude
      const resolvedLatitude = resolvedPosition ? resolvedPosition.latitude : elem.latitude
      const resolvedDepth = resolvedPosition ? resolvedPosition.depth : elem.depth

      const normalizedEqualizer = sldType === 'EQ' ? normalizeEqualizerConfig(elem) : null
      const componentModelName =
        amplifierLib?.name ||
        buLib?.name ||
        jointLib?.name ||
        equalizerLib?.name ||
        undefined
      // 接头盒子类型：从器件库查询 JointBoxType.subType
      const jointSubType = sldType === 'JOINT'
        ? elem.jointSubType || jointLib?.subType || inferJointSubType(componentModelName || elem.specifications || elem.name)
        : undefined
      const buSubType = (sldType === 'BU' || sldType === 'OADM')
        ? elem.buSubType || buLib?.subType || inferBranchingSubType(componentModelName || elem.specifications || elem.name)
        : undefined
      const draftEquipment = {
        name: elem.name,
        type: sldType,
        jointSubType,
        buSubType,
        equalizerRole: normalizedEqualizer?.equalizerRole,
        attenuationMode: normalizedEqualizer?.attenuationMode,
        attenuationDb: normalizedEqualizer?.attenuationDb,
        specifications: elem.specifications || componentModelName || '',
        configParams: componentModelName ? { ModelName: componentModelName } : undefined,
      } satisfies Pick<
        SLDEquipment,
        | 'name'
        | 'type'
        | 'jointSubType'
        | 'buSubType'
        | 'equalizerRole'
        | 'attenuationMode'
        | 'attenuationDb'
        | 'specifications'
        | 'configParams'
      >
      const symbolCode = resolveSldSymbolCode(draftEquipment)
      const configParams = buildSldEquipmentConfigParams(
        draftEquipment,
        componentModelName ? { ModelName: componentModelName } : {},
      )
      const nextEquipment: Partial<SLDEquipment> = {
        name: elem.name,
        type: sldType,
        symbolCode,
        location: `KP ${elem.kp.toFixed(1)}`,
        kp: elem.kp,
        longitude: resolvedLongitude,
        latitude: resolvedLatitude,
        depth: resolvedDepth,
        specifications: elem.specifications || componentModelName || '',
        remarks: elem.remarks || '由系统规划同步生成',
        syncSource: 'connector-trunk',
        syncRouteId: routeId,
        sourceConnectorId: elem.id,
        componentRefId: elem.componentRefId,
        equalizerRole: normalizedEqualizer?.equalizerRole,
        attenuationMode: normalizedEqualizer?.attenuationMode,
        attenuationDb: normalizedEqualizer?.attenuationDb,
        jointSubType,
        buSubType,
        configParams,
      }

      const existingEquipment = currentTable.value?.equipments.find(e =>
        e.sourceConnectorId === elem.id ||
        (
          isConnectorSyncedEquipment(e) &&
          !e.sourceConnectorId &&
          e.type === sldType &&
          Math.abs(e.kp - elem.kp) < 0.001 &&
          e.name === elem.name
        )
      )

      if (existingEquipment) {
        updateEquipment(existingEquipment.id, nextEquipment, false)
      } else {
        addEquipment(nextEquipment as Omit<SLDEquipment, 'id' | 'sequence'>, false)
      }
    })

    currentTable.value.equipments
      .filter(e => isConnectorSyncedEquipment(e) && !syncedConnectorIds.has(e.sourceConnectorId || ''))
      .forEach(equipment => {
        if (!manualSegmentRefs.has(equipment.id)) {
          deleteEquipment(equipment.id, false)
        }
      })

    sortEquipmentsByKp()
    recalculateSequences()

    currentTable.value.fiberSegments = currentTable.value.fiberSegments.filter(segment =>
      !(segment.syncSource === 'connector-trunk' && (!routeId || !segment.syncRouteId || segment.syncRouteId === routeId))
    )

    const manualSegmentKeys = new Set(
      currentTable.value.fiberSegments
        .filter(segment => segment.syncSource !== 'connector-trunk')
        .map(segment => segmentPairKey(segment.fromEquipmentId, segment.toEquipmentId))
    )

    const chainEquipments = currentTable.value.equipments
      .filter(equipment => equipment.type === 'TE' || equipment.type === 'PFE' || isConnectorSyncedEquipment(equipment))
      .sort((a, b) =>
        a.kp - b.kp ||
        getEquipmentSortWeight(a.type) - getEquipmentSortWeight(b.type) ||
        a.sequence - b.sequence
      )

    for (let index = 0; index < chainEquipments.length - 1; index++) {
      const from = chainEquipments[index]
      const to = chainEquipments[index + 1]
      if (from.id === to.id) continue
      if (manualSegmentKeys.has(segmentPairKey(from.id, to.id))) continue

      const length = Math.round((to.kp - from.kp) * 1000) / 1000
      const cableNo = String(index + 1).padStart(2, '0')
      addFiberSegment({
        fromEquipmentId: from.id,
        toEquipmentId: to.id,
        fromName: from.name,
        toName: to.name,
        length,
        fiberPairs: 8,
        fiberPairType: 'working',
        cableType: 'LW',
        attenuation: 0.2,
        totalLoss: Math.round(length * 0.2 * 1000) / 1000,
        remarks: `AUTO-${cableNo}`,
        syncSource: 'connector-trunk',
        syncRouteId: routeId,
      })
    }

    recalculateSequences()
    updateMetadata()
  }

  // 清空数据
  function clearData() {
    tables.value = []
    currentTableId.value = null
    selectedEquipmentId.value = null
    selectedSegmentId.value = null
  }

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
    setExportTemplateVersion,
    validateTable,
    generateFromRPL,
    // 项目数据管理
    initMockData,
    setupDataLinkListener,
    syncAmplifiersFromConnector,
    clearData,
  }
})
