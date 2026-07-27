import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import type { 
  RPLTable, 
  RPLRecord, 
  RPLMetadata, 
  RPLFilter, 
  RPLValidationResult,
  RPLPointType,
  RPLCableCode 
} from '@/types'

export const useRPLStore = defineStore('rpl', () => {
  const dictionaryStore = useDictionaryStore()
  // 状态
  const tables = ref<RPLTable[]>([])
  const currentTableId = ref<string | null>(null)
  const selectedRecordIds = ref<string[]>([])
  const filter = ref<RPLFilter>({})

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

  // Actions
  const createEmptyMetadata = (): RPLMetadata => ({
    totalLength: 0,
    totalCableLength: 0,
    landingStations: 0,
    repeaters: 0,
    branchingUnits: 0,
    joints: 0,
    averageDepth: 0,
    maxDepth: 0,
    minDepth: 0,
  })

  const normalizeTables = (source: RPLTable[]): RPLTable[] => {
    const byKey = new Map<string, RPLTable>()
    source.forEach(table => {
      const routeId = String(table.routeId ?? '').trim()
      const key = routeId ? `route:${routeId}` : `table:${table.id}`
      const existing = byKey.get(key)
      if (!existing || table.id === currentTableId.value) {
        byKey.set(key, table)
      }
    })
    return Array.from(byKey.values())
  }

  function createTable(name: string, routeId: string): RPLTable {
    const normalizedRouteId = String(routeId ?? '').trim()
    const existing = normalizedRouteId
      ? tables.value.find(table => String(table.routeId ?? '').trim() === normalizedRouteId)
      : null
    if (existing) {
      selectTable(existing.id)
      return existing
    }

    const newTable: RPLTable = {
      id: `rpl-${Date.now()}`,
      name,
      routeId: normalizedRouteId,
      records: [],
      metadata: createEmptyMetadata(),
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

  function replaceTables(nextTables: RPLTable[]) {
    tables.value = normalizeTables(nextTables)
    if (!tables.value.some(table => table.id === currentTableId.value)) {
      currentTableId.value = tables.value[0]?.id ?? null
    }
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

  function addRecord(record: Omit<RPLRecord, 'id' | 'sequence'>, _emitLink = true): RPLRecord | null {
    if (!currentTable.value) return null
    
    const newRecord: RPLRecord = {
      ...record,
      id: `rec-${Date.now()}`,
      sequence: currentTable.value.records.length + 1,
    }
    
    currentTable.value.records.push(newRecord)
    recalculateSequences()
    updateMetadata()
    
    return newRecord
  }

  function updateRecord(recordId: string, data: Partial<RPLRecord>, _emitLink = true) {
    if (!currentTable.value) return
    
    const record = currentTable.value.records.find(r => r.id === recordId)
    if (record) {
      Object.assign(record, data)
      updateMetadata()
      
    }
  }

  function deleteRecords(recordIds: string[], _emitLink = true) {
    if (!currentTable.value) return
    
    currentTable.value.records = currentTable.value.records.filter(
      r => !recordIds.includes(r.id)
    )
    selectedRecordIds.value = selectedRecordIds.value.filter(
      id => !recordIds.includes(id)
    )
    recalculateSequences()
    updateMetadata()
    
  }

  function recalculateSequences() {
    if (!currentTable.value) return
    currentTable.value.records.forEach((record, index) => {
      record.sequence = index + 1
    })
  }

  function updateMetadata() {
    if (!currentTable.value) return
    const records = currentTable.value.records
    const depths = records.map(record => Number(record.depth)).filter(Number.isFinite)
    const totalLength = records.reduce(
      (max, record) => Math.max(max, Number(record.cumulativeLength) || Number(record.kp) || 0),
      0,
    )
    const explicitCableLengths = records
      .map(record => Number(record.cableDistanceCumulative))
      .filter(Number.isFinite)
    const totalCableLength = explicitCableLengths.length > 0
      ? Math.max(...explicitCableLengths)
      : records.reduce((total, record) => {
          const length = Number(record.segmentLength) || 0
          const slack = Number(record.slack) || 0
          return total + length * (1 + Math.max(0, slack) / 100)
        }, 0)

    currentTable.value.metadata = {
      totalLength,
      totalCableLength,
      landingStations: records.filter(record => record.pointType === 'landing').length,
      repeaters: records.filter(record => record.pointType === 'repeater').length,
      branchingUnits: records.filter(record => record.pointType === 'branching').length,
      joints: records.filter(record => record.pointType === 'joint').length,
      averageDepth: depths.length > 0 ? depths.reduce((sum, depth) => sum + depth, 0) / depths.length : 0,
      maxDepth: depths.length > 0 ? Math.max(...depths) : 0,
      minDepth: depths.length > 0 ? Math.min(...depths) : 0,
    }
    currentTable.value.updatedAt = new Date()
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

  function validateTable(): RPLValidationResult {
    const errors: RPLValidationResult['errors'] = []
    const warnings: RPLValidationResult['warnings'] = []
    
    if (!currentTable.value) {
      return { valid: false, errors: [{ recordId: '', field: '', message: '未选择表格' }], warnings }
    }

    const records = currentTable.value.records

    // 这里只校验字段结构和取值格式，不在前端执行工程规则判定。
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

      // 4. 水深格式检查
      if (record.depth < 0) {
        errors.push({ recordId: record.id, field: 'depth', message: `格式错误: 行${lineNum} 水深不能为负数` })
      }

      // 5. 引用校验 - Cable Type 必须来自平台铠装类型字典
      const armoringTypes = dictionaryStore.getItems(PLATFORM_DICTIONARY_TYPES.armoringType)
      const armoringTypeCodes = new Set(armoringTypes.map(item => item.code))
      if (record.cableType && dictionaryStore.isLoaded(PLATFORM_DICTIONARY_TYPES.armoringType) && !armoringTypeCodes.has(record.cableType)) {
        errors.push({ 
          recordId: record.id, 
          field: 'cableType', 
          message: `引用错误: 行${lineNum} ARMORING_TYPE 字典中不存在铠装类型: ${record.cableType}`
        })
      }

    })

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
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

  function parseOptionalNumber(value: string | undefined): number | undefined {
    if (!value?.trim()) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  // 检测是否为新格式表头 - 基于 docs/RPL表头.xlsx 行业标准
  function detectNewFormat(headers: string[]): boolean {
    const newFormatIndicators = [
      'Decimal Latitude (degrees)', 
      'Radians Latitude', 
      'Meridional Parts', 
      'Distance from Equator',
      'Decimal Longitude (minutes)',
      'Difference in Latitude',
      'Course (Radians)',
      'Distance in nmiles',
      'Bearing °T',
      'Between Positions',
      'Cumulative Total',
      'Cumulative by type',
      'Target Burial Depth'
    ]
    return newFormatIndicators.some(indicator => 
      headers.some(h => h.includes(indicator))
    )
  }

  // 从CSV导入(支持新旧格式)
  function importFromCSV(csvContent: string, tableName: string, routeId = ''): boolean {
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
      
      createTable(tableName, routeId)
      
      // 构建表头索引映射
      const headerIndex: Record<string, number> = {}
      headers.forEach((h, i) => { headerIndex[h] = i })
      
      for (let i = headerLineIndex + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (cols.length < 5) continue

        let record: Omit<RPLRecord, 'id' | 'sequence'>
        
        if (isNewFormat) {
          // 新格式解析 - 基于 docs/RPL表头.xlsx 行业标准
          const event = cols[headerIndex['Event']] || ''
          // 度分秒格式纬经度 (Lat °, Lat ', Lat Dir)
          const latDeg = cols[headerIndex['Lat °']] || ''
          const latMin = cols[headerIndex["Lat '"]] || ''
          const latDir = cols[headerIndex['Lat Dir']] || ''
          const lonDeg = cols[headerIndex['Lon °']] || ''
          const lonMin = cols[headerIndex["Lon '"]] || ''
          const lonDir = cols[headerIndex['Lon Dir']] || ''
          // 十进制格式
          const latDec = cols[headerIndex['Decimal Latitude (degrees)']] || ''
          const lonDecMin = cols[headerIndex['Decimal Longitude (minutes)']] || ''
          // 距离和电缆
          const routeDistBetween = parseOptionalNumber(cols[headerIndex['Between Positions']])
          const routeDistCum = parseOptionalNumber(cols[headerIndex['Cumulative Total']])
          const cableDistanceBetween = parseOptionalNumber(cols[headerIndex['Cable Distance (km) Between Positions']])
          const cableDistanceCumulative = parseOptionalNumber(cols[headerIndex['Cable Distance (km) Cumulative Total']])
          const slackPct = parseOptionalNumber(cols[headerIndex['Slack %']])
          const cableType = cols[headerIndex['Type']] || cols[headerIndex['Cable Type']] || ''
          const depth = parseOptionalNumber(cols[headerIndex['Approx Depth (m)']])
          const burial = parseOptionalNumber(cols[headerIndex['Target Burial Depth (m)']])
          const remarks = cols[headerIndex['Additional Route Features']] || ''
          
          // 解析坐标 - 支持度分秒分列和十进制格式
          let latitude = 0
          let longitude = 0
          
          // 优先使用十进制格式
          if (latDec) {
            latitude = parseFloat(latDec) || 0
          } else if (latDeg && latMin) {
            // 从度分秒分列计算
            const degrees = parseFloat(latDeg) || 0
            const minutes = parseFloat(latMin) || 0
            latitude = degrees + minutes / 60
            if (latDir === 'S') latitude = -latitude
          }
          
          // 经度: Decimal Longitude (minutes) 是分格式，需要转换为度
          if (lonDecMin) {
            longitude = parseFloat(lonDecMin) / 60 || 0
          } else if (lonDeg && lonMin) {
            const degrees = parseFloat(lonDeg) || 0
            const minutes = parseFloat(lonMin) || 0
            longitude = degrees + minutes / 60
            if (lonDir === 'W') longitude = -longitude
          }
          
          record = {
            kp: routeDistCum ?? 0,
            longitude,
            latitude,
            depth: depth ?? 0,
            pointType: EVENT_TO_POINT_TYPE[event] || 'waypoint',
            cableType: cableType as RPLCableCode,
            segmentLength: routeDistBetween ?? 0,
            cumulativeLength: routeDistCum ?? 0,
            slack: slackPct ?? 0,
            burialDepth: burial ?? 0,
            remarks,
            ...(event ? { event: event as RPLRecord['event'] } : {}),
            ...(parseOptionalNumber(latDec) !== undefined ? { decimalLatitudeDegrees: parseOptionalNumber(latDec) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Radians Latitude']]) !== undefined ? { radiansLatitude: parseOptionalNumber(cols[headerIndex['Radians Latitude']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Sin Latitude']]) !== undefined ? { sinLatitude: parseOptionalNumber(cols[headerIndex['Sin Latitude']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Meridional Parts']]) !== undefined ? { meridionalParts: parseOptionalNumber(cols[headerIndex['Meridional Parts']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Distance from Equator']]) !== undefined ? { distanceFromEquator: parseOptionalNumber(cols[headerIndex['Distance from Equator']]) } : {}),
            ...(parseOptionalNumber(lonDecMin) !== undefined ? { decimalLongitudeMinutes: parseOptionalNumber(lonDecMin) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Difference in Latitude']]) !== undefined ? { diffLatitude: parseOptionalNumber(cols[headerIndex['Difference in Latitude']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Difference in MPs']]) !== undefined ? { diffMPs: parseOptionalNumber(cols[headerIndex['Difference in MPs']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Difference in E Dist']]) !== undefined ? { diffEDist: parseOptionalNumber(cols[headerIndex['Difference in E Dist']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Difference in Longitude']]) !== undefined ? { diffLongitude: parseOptionalNumber(cols[headerIndex['Difference in Longitude']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Course (Radians)']]) !== undefined ? { courseRadians: parseOptionalNumber(cols[headerIndex['Course (Radians)']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Distance in nmiles']]) !== undefined ? { distanceNmiles: parseOptionalNumber(cols[headerIndex['Distance in nmiles']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Bearing °T']]) !== undefined ? { bearingT: parseOptionalNumber(cols[headerIndex['Bearing °T']]) } : {}),
            ...(routeDistBetween !== undefined ? { routeDistanceBetween: routeDistBetween } : {}),
            ...(routeDistCum !== undefined ? { routeDistanceCumulative: routeDistCum } : {}),
            ...(cableDistanceBetween !== undefined ? { cableDistanceBetween } : {}),
            ...(cableDistanceCumulative !== undefined ? { cableDistanceCumulative } : {}),
            ...(slackPct !== undefined ? { slackPercent: slackPct } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Cumulative by type']]) !== undefined ? { cumulativeByType: parseOptionalNumber(cols[headerIndex['Cumulative by type']]) } : {}),
            ...(parseOptionalNumber(cols[headerIndex['Cable Totals By Type (km)']]) !== undefined ? { cableTotalsByType: parseOptionalNumber(cols[headerIndex['Cable Totals By Type (km)']]) } : {}),
            ...(depth !== undefined ? { approxDepth: depth } : {}),
            ...(burial !== undefined ? { targetBurialDepth: burial } : {}),
            ...(remarks ? { additionalFeatures: remarks } : {}),
          }
        } else {
          // 旧格式解析
          const routeDistanceBetween = parseOptionalNumber(cols[7])
          const routeDistanceCumulative = parseOptionalNumber(cols[8])
          const slackPercent = parseOptionalNumber(cols[9])
          const approxDepth = parseOptionalNumber(cols[4])
          const targetBurialDepth = parseOptionalNumber(cols[10])
          const additionalFeatures = cols[11] || ''
          record = {
            kp: parseFloat(cols[1]) || 0,
            longitude: parseFloat(cols[2]) || 0,
            latitude: parseFloat(cols[3]) || 0,
            depth: approxDepth ?? 0,
            pointType: (cols[5] as RPLPointType) || 'waypoint',
            cableType: (cols[6] as RPLCableCode) || '',
            segmentLength: routeDistanceBetween ?? 0,
            cumulativeLength: routeDistanceCumulative ?? 0,
            slack: slackPercent ?? 0,
            burialDepth: targetBurialDepth ?? 0,
            remarks: additionalFeatures,
            ...(routeDistanceBetween !== undefined ? { routeDistanceBetween } : {}),
            ...(routeDistanceCumulative !== undefined ? { routeDistanceCumulative } : {}),
            ...(slackPercent !== undefined ? { slackPercent } : {}),
            ...(approxDepth !== undefined ? { approxDepth } : {}),
            ...(targetBurialDepth !== undefined ? { targetBurialDepth } : {}),
            ...(additionalFeatures ? { additionalFeatures } : {}),
          }
        }
        addRecord(record)
      }

      return true
    } catch {
      return false
    }
  }

  // 清空数据
  function clearData() {
    tables.value = []
    currentTableId.value = null
    selectedRecordIds.value = []
    filter.value = {}
  }

  return {
    // State
    tables,
    currentTableId,
    selectedRecordIds,
    filter,
    // Getters
    currentTable,
    filteredRecords,
    // Actions
    createTable,
    selectTable,
    replaceTables,
    setCurrentTableId,
    deleteTable,
    addRecord,
    updateRecord,
    deleteRecords,
    setFilter,
    clearFilter,
    selectRecords,
    toggleRecordSelection,
    selectAllRecords,
    clearSelection,
    validateTable,
    importFromCSV,
    // 项目数据管理
    clearData,
  }
})
