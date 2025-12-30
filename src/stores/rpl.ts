import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { 
  RPLTable, 
  RPLRecord, 
  RPLMetadata, 
  RPLFilter, 
  RPLValidationResult,
  RPLPointType,
  RPLCableCode 
} from '@/types'
import { mockRPLRecords, ROUTE_ID, ROUTE_NAME } from '@/data/mockData'
import { dataLinkService } from '@/services'

export const useRPLStore = defineStore('rpl', () => {
  // 状态
  const tables = ref<RPLTable[]>([])
  const currentTableId = ref<string | null>(null)
  const selectedRecordIds = ref<string[]>([])
  const filter = ref<RPLFilter>({})
  const isEditing = ref(false)

  // Getters
  const currentTable = computed(() => 
    tables.value.find(t => t.id === currentTableId.value) || null
  )

  const filteredRecords = computed(() => {
    if (!currentTable.value) return []
    
    let records = [...currentTable.value.records]
    
    if (filter.value.pointType?.length) {
      records = records.filter(r => filter.value.pointType!.includes(r.pointType))
    }
    if (filter.value.cableType?.length) {
      records = records.filter(r => filter.value.cableType!.includes(r.cableType))
    }
    if (filter.value.depthRange) {
      const [min, max] = filter.value.depthRange
      records = records.filter(r => r.depth >= min && r.depth <= max)
    }
    if (filter.value.kpRange) {
      const [min, max] = filter.value.kpRange
      records = records.filter(r => r.kp >= min && r.kp <= max)
    }
    
    return records
  })

  const selectedRecords = computed(() => 
    currentTable.value?.records.filter(r => selectedRecordIds.value.includes(r.id)) || []
  )

  // Actions
  function createTable(name: string, routeId: string): RPLTable {
    const newTable: RPLTable = {
      id: `rpl-${Date.now()}`,
      name,
      routeId,
      records: [],
      metadata: calculateMetadata([]),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    tables.value.push(newTable)
    currentTableId.value = newTable.id
    return newTable
  }

  function selectTable(tableId: string | null) {
    currentTableId.value = tableId
    selectedRecordIds.value = []
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

  function addRecord(record: Omit<RPLRecord, 'id' | 'sequence'>, emitLink = true): RPLRecord | null {
    if (!currentTable.value) return null
    
    const newRecord: RPLRecord = {
      ...record,
      id: `rec-${Date.now()}`,
      sequence: currentTable.value.records.length + 1,
    }
    
    currentTable.value.records.push(newRecord)
    recalculateSequences()
    updateMetadata()
    
    // 触发数据联动
    if (emitLink && newRecord.pointType !== 'waypoint') {
      dataLinkService.emit({
        source: 'rpl',
        action: 'add',
        data: newRecord,
        kp: newRecord.kp,
      })
    }
    
    return newRecord
  }

  function updateRecord(recordId: string, data: Partial<RPLRecord>, emitLink = true) {
    if (!currentTable.value) return
    
    const record = currentTable.value.records.find(r => r.id === recordId)
    if (record) {
      const oldKp = record.kp
      Object.assign(record, data)
      updateMetadata()
      
      // 触发数据联动
      if (emitLink && record.pointType !== 'waypoint') {
        dataLinkService.emit({
          source: 'rpl',
          action: 'update',
          data: record,
          kp: record.kp,
        })
      }
    }
  }

  function deleteRecords(recordIds: string[], emitLink = true) {
    if (!currentTable.value) return
    
    // 记录要删除的记录信息用于联动
    const deletedRecords = currentTable.value.records.filter(
      r => recordIds.includes(r.id) && r.pointType !== 'waypoint'
    )
    
    currentTable.value.records = currentTable.value.records.filter(
      r => !recordIds.includes(r.id)
    )
    selectedRecordIds.value = selectedRecordIds.value.filter(
      id => !recordIds.includes(id)
    )
    recalculateSequences()
    updateMetadata()
    
    // 触发数据联动
    if (emitLink) {
      deletedRecords.forEach(record => {
        dataLinkService.emit({
          source: 'rpl',
          action: 'delete',
          data: record,
          kp: record.kp,
        })
      })
    }
  }

  function insertRecord(index: number, record: Omit<RPLRecord, 'id' | 'sequence'>): RPLRecord | null {
    if (!currentTable.value) return null
    
    const newRecord: RPLRecord = {
      ...record,
      id: `rec-${Date.now()}`,
      sequence: index + 1,
    }
    
    currentTable.value.records.splice(index, 0, newRecord)
    recalculateSequences()
    updateMetadata()
    return newRecord
  }

  function moveRecord(fromIndex: number, toIndex: number) {
    if (!currentTable.value) return
    
    const records = currentTable.value.records
    const [removed] = records.splice(fromIndex, 1)
    records.splice(toIndex, 0, removed)
    recalculateSequences()
  }

  function recalculateSequences() {
    if (!currentTable.value) return
    
    let cumulativeLength = 0
    currentTable.value.records.forEach((record, index) => {
      record.sequence = index + 1
      cumulativeLength += record.segmentLength
      record.cumulativeLength = cumulativeLength
      record.kp = cumulativeLength
    })
  }

  function updateMetadata() {
    if (!currentTable.value) return
    currentTable.value.metadata = calculateMetadata(currentTable.value.records)
    currentTable.value.updatedAt = new Date()
  }

  function calculateMetadata(records: RPLRecord[]): RPLMetadata {
    if (records.length === 0) {
      return {
        totalLength: 0,
        totalCableLength: 0,
        landingStations: 0,
        repeaters: 0,
        branchingUnits: 0,
        joints: 0,
        averageDepth: 0,
        maxDepth: 0,
        minDepth: 0,
      }
    }

    const depths = records.map(r => r.depth)
    const totalLength = records.reduce((sum, r) => sum + r.segmentLength, 0)
    const totalSlack = records.reduce((sum, r) => sum + r.segmentLength * (r.slack / 100), 0)

    return {
      totalLength,
      totalCableLength: totalLength + totalSlack,
      landingStations: records.filter(r => r.pointType === 'landing').length,
      repeaters: records.filter(r => r.pointType === 'repeater').length,
      branchingUnits: records.filter(r => r.pointType === 'branching').length,
      joints: records.filter(r => r.pointType === 'joint').length,
      averageDepth: depths.reduce((a, b) => a + b, 0) / depths.length,
      maxDepth: Math.max(...depths),
      minDepth: Math.min(...depths),
    }
  }

  function setFilter(newFilter: RPLFilter) {
    filter.value = newFilter
  }

  function clearFilter() {
    filter.value = {}
  }

  function selectRecords(recordIds: string[]) {
    selectedRecordIds.value = recordIds
  }

  function toggleRecordSelection(recordId: string) {
    const index = selectedRecordIds.value.indexOf(recordId)
    if (index > -1) {
      selectedRecordIds.value.splice(index, 1)
    } else {
      selectedRecordIds.value.push(recordId)
    }
  }

  function selectAllRecords() {
    if (!currentTable.value) return
    selectedRecordIds.value = currentTable.value.records.map(r => r.id)
  }

  function clearSelection() {
    selectedRecordIds.value = []
  }

  // 有效的电缆类型列表
  const validCableTypes: RPLCableCode[] = ['LW', 'LWS', 'SA', 'DA', 'SAS']

  function validateTable(): RPLValidationResult {
    const errors: RPLValidationResult['errors'] = []
    const warnings: RPLValidationResult['warnings'] = []
    
    if (!currentTable.value) {
      return { valid: false, errors: [{ recordId: '', field: '', message: '未选择表格' }], warnings }
    }

    const records = currentTable.value.records

    // 检查起止点
    if (records.length > 0) {
      if (records[0].pointType !== 'landing') {
        errors.push({ recordId: records[0].id, field: 'pointType', message: '第一个点必须是登陆站' })
      }
      if (records[records.length - 1].pointType !== 'landing') {
        errors.push({ recordId: records[records.length - 1].id, field: 'pointType', message: '最后一个点必须是登陆站' })
      }
    }

    let prevCumulativeDistance = 0

    // 检查每条记录
    records.forEach((record, index) => {
      const lineNum = index + 1

      // 1. 序号连续性校验 (Continuity - Pos No.)
      if (record.sequence !== lineNum) {
        errors.push({ 
          recordId: record.id, 
          field: 'sequence', 
          message: `连续性错误: 行${lineNum} 序号不连续，应为 ${lineNum}，实际为 ${record.sequence}` 
        })
      }

      // 2. 格式校验 - 坐标检查
      if (record.longitude < -180 || record.longitude > 180) {
        errors.push({ recordId: record.id, field: 'longitude', message: `格式错误: 行${lineNum} 经度格式无效 (${record.longitude})` })
      }
      if (record.latitude < -90 || record.latitude > 90) {
        errors.push({ recordId: record.id, field: 'latitude', message: `格式错误: 行${lineNum} 纬度格式无效 (${record.latitude})` })
      }

      // 3. 格式校验 - 余缆率非负
      if (record.slack < 0) {
        errors.push({ recordId: record.id, field: 'slack', message: `格式错误: 行${lineNum} Slack % 不能为负数` })
      }
      if (record.slack > 10) {
        warnings.push({ recordId: record.id, field: 'slack', message: `行${lineNum}: 余缆率${record.slack}%超过建议值10%` })
      }

      // 4. 水深检查
      if (record.depth < 0) {
        errors.push({ recordId: record.id, field: 'depth', message: `格式错误: 行${lineNum} 水深不能为负数` })
      }
      if (record.depth > 11000) {
        warnings.push({ recordId: record.id, field: 'depth', message: `行${lineNum}: 水深${record.depth}m超过11000m，请确认` })
      }

      // 5. 引用校验 - Cable Type 必须在器件库中存在
      if (record.cableType && !validCableTypes.includes(record.cableType)) {
        errors.push({ 
          recordId: record.id, 
          field: 'cableType', 
          message: `引用错误: 行${lineNum} 系统器件库中不存在海缆类型: ${record.cableType}` 
        })
      }

      // 6. 距离闭环校验 (Continuity - Distance)
      const expectedCumulative = prevCumulativeDistance + record.segmentLength
      const tolerance = 0.1 // 允许0.1km误差
      if (Math.abs(record.cumulativeLength - expectedCumulative) > tolerance) {
        errors.push({ 
          recordId: record.id, 
          field: 'cumulativeLength', 
          message: `连续性错误: 行${lineNum} 距离计算不闭环 (预期: ${expectedCumulative.toFixed(2)}, 实际: ${record.cumulativeLength.toFixed(2)})` 
        })
      }
      prevCumulativeDistance = record.cumulativeLength

      // 7. 中继器间距检查
      if (index > 0 && record.pointType === 'repeater') {
        const prevRepeaterIndex = records.slice(0, index).reverse().findIndex(r => r.pointType === 'repeater')
        if (prevRepeaterIndex > -1) {
          const distance = record.cumulativeLength - records[index - 1 - prevRepeaterIndex].cumulativeLength
          if (distance > 120) {
            warnings.push({ recordId: record.id, field: 'segmentLength', message: `行${lineNum}: 中继器间距${distance.toFixed(1)}km超过建议值120km` })
          }
        }
      }
    })

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  // 验证导入的RPL文件
  function validateImportedRPL(headers: string[], rows: any[]): RPLValidationResult {
    const errors: RPLValidationResult['errors'] = []
    const warnings: RPLValidationResult['warnings'] = []

    // 必填表头校验
    const requiredHeaders = ['Pos No.', 'Event', 'Latitude', 'Longitude', 'Slack %', 'Cable Type', 'Distance (km) Between', 'Distance (km) Cumulative']
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
    if (missingHeaders.length > 0) {
      errors.push({ 
        recordId: '', 
        field: 'headers', 
        message: `格式错误: 缺失必填表头 [${missingHeaders.join(', ')}]` 
      })
      return { valid: false, errors, warnings }
    }

    let prevCumulativeDistance = 0

    rows.forEach((row, index) => {
      const lineNum = index + 1

      // 序号连续性
      if (row.posNo !== lineNum) {
        errors.push({ 
          recordId: `row-${lineNum}`, 
          field: 'posNo', 
          message: `连续性错误: 行${lineNum} 序号不连续，应为 ${lineNum}` 
        })
      }

      // 经纬度格式校验
      if (isNaN(row.latitude) || row.latitude < -90 || row.latitude > 90) {
        errors.push({ recordId: `row-${lineNum}`, field: 'latitude', message: `格式错误: 行${lineNum} 纬度格式无效` })
      }
      if (isNaN(row.longitude) || row.longitude < -180 || row.longitude > 180) {
        errors.push({ recordId: `row-${lineNum}`, field: 'longitude', message: `格式错误: 行${lineNum} 经度格式无效` })
      }

      // Slack非负校验
      if (row.slack < 0) {
        errors.push({ recordId: `row-${lineNum}`, field: 'slack', message: `格式错误: 行${lineNum} Slack % 不能为负数` })
      }

      // Cable Type引用校验
      if (row.cableType && !validCableTypes.includes(row.cableType)) {
        errors.push({ 
          recordId: `row-${lineNum}`, 
          field: 'cableType', 
          message: `引用错误: 行${lineNum} 系统器件库中不存在海缆类型: ${row.cableType}` 
        })
      }

      // 距离闭环校验
      const expectedCum = prevCumulativeDistance + (row.distBetween || 0)
      if (Math.abs((row.distCumulative || 0) - expectedCum) > 0.1) {
        errors.push({ 
          recordId: `row-${lineNum}`, 
          field: 'distCumulative', 
          message: `连续性错误: 行${lineNum} 距离计算不闭环 (预期: ${expectedCum.toFixed(2)}, 实际: ${row.distCumulative?.toFixed(2)})` 
        })
      }
      prevCumulativeDistance = row.distCumulative || 0
    })

    return { valid: errors.length === 0, errors, warnings }
  }

  // 从路由生成RPL表格
  function generateFromRoute(routeId: string, routeName: string, points: Array<{
    coordinates: [number, number]
    type: string
    name?: string
  }>, segments: Array<{
    length: number
    depth: number
    cableType: string
  }>): RPLTable {
    const table = createTable(`${routeName}_RPL`, routeId)
    
    let cumulativeLength = 0
    points.forEach((point, index) => {
      const segment = segments[index] || segments[segments.length - 1] || { length: 0, depth: 0, cableType: 'LW' }
      cumulativeLength += segment.length

      const record: Omit<RPLRecord, 'id' | 'sequence'> = {
        kp: cumulativeLength,
        longitude: point.coordinates[0],
        latitude: point.coordinates[1],
        depth: segment.depth,
        pointType: mapPointType(point.type),
        cableType: mapCableType(segment.cableType),
        segmentLength: segment.length,
        cumulativeLength,
        slack: 2.5,
        burialDepth: segment.depth < 1500 ? 1.0 : 0,
        remarks: point.name || '',
      }
      
      addRecord(record)
    })

    return table
  }

  function mapPointType(type: string): RPLPointType {
    const map: Record<string, RPLPointType> = {
      landing: 'landing',
      repeater: 'repeater',
      branching: 'branching',
      waypoint: 'waypoint',
    }
    return map[type] || 'waypoint'
  }

  function mapCableType(type: string): RPLCableCode {
    const map: Record<string, RPLCableCode> = {
      lw: 'LW',
      sa: 'SA',
      da: 'DA',
      LW: 'LW',
      SA: 'SA',
      DA: 'DA',
    }
    return map[type] || 'LW'
  }

  // Event名称到pointType的反向映射
  const EVENT_TO_POINT_TYPE: Record<string, RPLPointType> = {
    'Start': 'landing',
    'End': 'landing',
    'Landing Station': 'landing',
    'Repeater': 'repeater',
    'Branching Unit': 'branching',
    'Joint': 'joint',
    'Alter Course': 'waypoint',
    'Waypoint': 'waypoint',
  }

  // 解析度分秒格式的坐标
  function parseDMSCoordinate(dms: string): number | null {
    if (!dms) return null
    // 匹配格式: "1° 17.425' N" 或 "121° 30.500' E"
    const match = dms.match(/([\d.]+)\u00b0\s*([\d.]+)'\s*([NSEW])/i)
    if (!match) return null
    
    const degrees = parseFloat(match[1])
    const minutes = parseFloat(match[2])
    const direction = match[3].toUpperCase()
    
    let decimal = degrees + minutes / 60
    if (direction === 'S' || direction === 'W') {
      decimal = -decimal
    }
    return decimal
  }

  // 解析CSV行，处理引号内的逗号
  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  // 检测是否为新格式表头
  function detectNewFormat(headers: string[]): boolean {
    const newFormatIndicators = ['Latitude (DMS)', 'Longitude (DMS)', 'MPs', 'E.Dist', 'Route Distance']
    return newFormatIndicators.some(indicator => 
      headers.some(h => h.includes(indicator))
    )
  }

  // 从CSV导入(支持新旧格式)
  function importFromCSV(csvContent: string, tableName: string, routeId: string): boolean {
    try {
      const lines = csvContent.trim().split(/\r?\n/).filter(line => !line.startsWith('#') && line.trim())
      if (lines.length < 2) return false

      // 检测是否有二级表头，跳过分组行
      let headerLineIndex = 0
      const firstLine = parseCSVLine(lines[0])
      if (firstLine.some(h => ['Position', 'Coordinates', 'Navigation', 'Cable'].includes(h))) {
        headerLineIndex = 1 // 跳过分组行
      }
      
      const headers = parseCSVLine(lines[headerLineIndex])
      const isNewFormat = detectNewFormat(headers)
      
      const table = createTable(tableName, routeId)
      
      // 构建表头索引映射
      const headerIndex: Record<string, number> = {}
      headers.forEach((h, i) => { headerIndex[h] = i })
      
      for (let i = headerLineIndex + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (cols.length < 5) continue

        let record: Omit<RPLRecord, 'id' | 'sequence'>
        
        if (isNewFormat) {
          // 新格式解析
          const event = cols[headerIndex['Event']] || ''
          const latDMS = cols[headerIndex['Latitude (DMS)']] || ''
          const lonDMS = cols[headerIndex['Longitude (DMS)']] || ''
          const latDec = cols[headerIndex['Latitude (Dec°)']] || cols[headerIndex['Latitude']] || ''
          const routeDistBetween = cols[headerIndex['Between']] || cols[headerIndex['Route Distance Between']] || '0'
          const routeDistCum = cols[headerIndex['Cumulative']] || cols[headerIndex['Route Distance Cumulative']] || '0'
          const cableType = cols[headerIndex['Type']] || cols[headerIndex['Cable Type']] || 'LW'
          const depth = cols[headerIndex['Approx Depth (m)']] || cols[headerIndex['Water Depth (m)']] || '0'
          const burial = cols[headerIndex['Planned Burial (m)']] || cols[headerIndex['Burial Depth (m)']] || '0'
          const remarks = cols[headerIndex['Additional Features']] || cols[headerIndex['Remarks']] || ''
          
          // 解析坐标
          let latitude = parseDMSCoordinate(latDMS)
          if (latitude === null) latitude = parseFloat(latDec) || 0
          
          let longitude = parseDMSCoordinate(lonDMS)
          const lonDecIdx = headers.findIndex(h => h.includes('Longitude') && (h.includes('Dec') || h.includes('°')))
          if (longitude === null && lonDecIdx >= 0) {
            longitude = parseFloat(cols[lonDecIdx]) || 0
          }
          if (longitude === null) longitude = 0
          
          record = {
            kp: parseFloat(routeDistCum) || 0,
            longitude,
            latitude,
            depth: parseFloat(depth) || 0,
            pointType: EVENT_TO_POINT_TYPE[event] || 'waypoint',
            cableType: (cableType as RPLCableCode) || 'LW',
            segmentLength: parseFloat(routeDistBetween) || 0,
            cumulativeLength: parseFloat(routeDistCum) || 0,
            slack: 2.5, // 默认值，可从 Cable Distance 计算
            burialDepth: parseFloat(burial) || 0,
            remarks,
          }
        } else {
          // 旧格式解析
          record = {
            kp: parseFloat(cols[1]) || 0,
            longitude: parseFloat(cols[2]) || 0,
            latitude: parseFloat(cols[3]) || 0,
            depth: parseFloat(cols[4]) || 0,
            pointType: (cols[5] as RPLPointType) || 'waypoint',
            cableType: (cols[6] as RPLCableCode) || 'LW',
            segmentLength: parseFloat(cols[7]) || 0,
            cumulativeLength: parseFloat(cols[8]) || 0,
            slack: parseFloat(cols[9]) || 2.5,
            burialDepth: parseFloat(cols[10]) || 0,
            remarks: cols[11] || '',
          }
        }
        addRecord(record)
      }

      return true
    } catch (e) {
      console.error('CSV导入失败:', e)
      return false
    }
  }

  // 初始化加载mock数据
  function initMockData() {
    if (tables.value.length === 0) {
      const table = createTable(`${ROUTE_NAME}_RPL`, ROUTE_ID)
      // 初始化时不触发联动，避免循环
      mockRPLRecords.forEach(record => addRecord(record, false))
      return table
    }
    return null
  }

  // 监听其他模块的数据变更
  function setupDataLinkListener() {
    dataLinkService.subscribe('rpl', (event) => {
      if (!currentTable.value) return
      
      // 根据KP查找对应记录
      const record = currentTable.value.records.find(
        r => Math.abs(r.kp - (event.kp || 0)) < 1
      )
      
      if (event.action === 'update' && record) {
        // 同步更新坐标和深度
        updateRecord(record.id, {
          longitude: event.data.longitude ?? record.longitude,
          latitude: event.data.latitude ?? record.latitude,
          depth: event.data.depth ?? record.depth,
        }, false)
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
    selectedRecordIds,
    filter,
    isEditing,
    // Getters
    currentTable,
    filteredRecords,
    selectedRecords,
    // Actions
    createTable,
    selectTable,
    deleteTable,
    addRecord,
    updateRecord,
    deleteRecords,
    insertRecord,
    moveRecord,
    setFilter,
    clearFilter,
    selectRecords,
    toggleRecordSelection,
    selectAllRecords,
    clearSelection,
    validateTable,
    validateImportedRPL,
    generateFromRoute,
    importFromCSV,
  }
})
