/**
 * RPL文件导出服务
 * 按行业标准格式导出Route Position List文件
 * 支持Excel格式（带边框）
 * 包含墨卡托投影、度分秒转换、航向距离计算等完整功能
 */

import type { RPLRecord, RPLTable } from '@/types'
import ExcelJS from 'exceljs'

// ========== 常量定义 ==========
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const EARTH_RADIUS_KM = 6371.0
const EARTH_RADIUS_NM = 3440.065  // 海里

// 行业标准RPL二级表头 - 基于 docs/RPL表头.xlsx
export const RPL_HEADER_GROUPS = [
  { title: '', columns: ['Pos No.', 'Event'] },
  { title: 'Latitude', columns: ['Lat °', 'Lat \'', 'Lat Dir'] },
  { title: 'Longitude', columns: ['Lon °', 'Lon \'', 'Lon Dir'] },
  { title: '', columns: [
    'Decimal Latitude (degrees)', 
    'Radians Latitude', 
    'Sin Latitude', 
    'Meridional Parts', 
    'Distance from Equator',
    'Decimal Longitude (minutes)'
  ]},
  { title: 'Difference', columns: [
    'Difference in Latitude (degrees)', 
    'Difference in MPs', 
    'Difference in E Dist', 
    'Difference in Longitude (minutes)'
  ]},
  { title: '', columns: ['Course (Radians)', 'Distance in nmiles (6087 ft)', 'Bearing °T'] },
  { title: 'Distance (km)', columns: ['Between Positions', 'Cumulative Total'] },
  { title: '', columns: ['Slack %'] },
  { title: 'Cable Distance (km)', columns: ['Between Positions', 'Cumulative Total'] },
  { title: 'Cable', columns: ['Type', 'Cumulative by type', 'Cable Totals By Type (km)'] },
  { title: '', columns: ['Approx Depth (m)', 'Target Burial Depth (m)'] },
  { title: 'Planned', columns: ['Additional Route Features'] }
]

// 平坦化表头用于CSV
export const RPL_STANDARD_HEADERS = RPL_HEADER_GROUPS.flatMap(g => g.columns)

// 点类型映射到行业标准Event名称
const EVENT_TYPE_MAP: Record<string, string> = {
  landing: 'Landing Station',
  repeater: 'Repeater',
  branching: 'Branching Unit',
  joint: 'Joint',
  waypoint: 'Alter Course',
}

// ========== 坐标转换函数 ==========

/**
 * 将十进制度转换为度分秒格式
 * @param decimal 十进制度数
 * @param isLatitude 是否为纬度
 * @returns 度分秒格式字符串，如 "1° 17.425' N"
 */
export function decimalToDMS(decimal: number, isLatitude: boolean): string {
  const abs = Math.abs(decimal)
  const degrees = Math.floor(abs)
  const minutesDecimal = (abs - degrees) * 60
  const direction = isLatitude 
    ? (decimal >= 0 ? 'N' : 'S')
    : (decimal >= 0 ? 'E' : 'W')
  return `${degrees}\u00b0 ${minutesDecimal.toFixed(3)}' ${direction}`
}

/**
 * 将十进制度转换为十进制分
 */
export function decimalDegreesToMinutes(decimal: number): number {
  return decimal * 60
}

// ========== 墨卡托投影计算 ==========

/**
 * 计算墨卡托投影部分 (Meridional Parts)
 * 用于航海图上的纬度表示
 * @param latDeg 纬度(度)
 * @returns 墨卡托部分值
 */
export function calculateMeridionalParts(latDeg: number): number {
  const latRad = Math.abs(latDeg) * DEG_TO_RAD
  // 墨卡托投影公式: M = 7915.7045 * log10(tan(45° + lat/2))
  const tanValue = Math.tan(Math.PI / 4 + latRad / 2)
  const MPs = 7915.7045 * Math.log10(tanValue)
  return latDeg >= 0 ? MPs : -MPs
}

/**
 * 计算赤道距离 (E.Dist)
 * @param latDeg 纬度(度)
 * @returns 赤道距离(海里)
 */
export function calculateDistanceFromEquator(latDeg: number): number {
  // 每度纬度约60海里
  return latDeg * 60
}

// ========== 航向和距离计算 ==========

/**
 * 计算两点间的航向(弧度)
 * @param lat1 起点纬度(度)
 * @param lon1 起点经度(度)
 * @param lat2 终点纬度(度)
 * @param lon2 终点经度(度)
 * @returns 航向(弧度)
 */
export function calculateCourseRadians(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * DEG_TO_RAD
  const lat1Rad = lat1 * DEG_TO_RAD
  const lat2Rad = lat2 * DEG_TO_RAD
  
  const x = Math.sin(dLon) * Math.cos(lat2Rad)
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon)
  
  return Math.atan2(x, y)
}

/**
 * 计算真方位角 (Bearing True)
 * @param courseRad 航向(弧度)
 * @returns 真方位角(度)
 */
export function calculateBearingTrue(courseRad: number): number {
  let bearing = courseRad * RAD_TO_DEG
  // 转换为0-360度
  return (bearing + 360) % 360
}

/**
 * 计算两点间的大圆距离(海里)
 * @param lat1 起点纬度(度)
 * @param lon1 起点经度(度)
 * @param lat2 终点纬度(度)
 * @param lon2 终点经度(度)
 * @returns 距离(海里)
 */
export function calculateDistanceNauticalMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1Rad = lat1 * DEG_TO_RAD
  const lat2Rad = lat2 * DEG_TO_RAD
  const dLatRad = (lat2 - lat1) * DEG_TO_RAD
  const dLonRad = (lon2 - lon1) * DEG_TO_RAD
  
  // Haversine公式
  const a = Math.sin(dLatRad / 2) ** 2 + 
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLonRad / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  
  return EARTH_RADIUS_NM * c
}

/**
 * 计算两点间的距离(公里)
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1Rad = lat1 * DEG_TO_RAD
  const lat2Rad = lat2 * DEG_TO_RAD
  const dLatRad = (lat2 - lat1) * DEG_TO_RAD
  const dLonRad = (lon2 - lon1) * DEG_TO_RAD
  
  const a = Math.sin(dLatRad / 2) ** 2 + 
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLonRad / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  
  return EARTH_RADIUS_KM * c
}

// ========== 完整记录计算 ==========

export interface CalculatedRPLRecord extends RPLRecord {
  latitudeDMS: string
  longitudeDMS: string
  decimalLatitudeDegrees: number
  radiansLatitude: number
  sinLatitude: number
  meridionalParts: number
  distanceFromEquator: number
  decimalLongitudeMinutes: number
  diffLatitude: number
  diffMPs: number
  diffEDist: number
  diffLongitude: number
  courseRadians: number
  distanceNmiles: number
  bearingT: number
  routeDistanceBetween: number
  routeDistanceCumulative: number
  cableDistanceBetween: number
  cableDistanceCumulative: number
  cumulativeByType: number
  approxDepth: number
  plannedBurialDepth: number
  additionalFeatures: string
}

/**
 * 计算完整的RPL记录字段
 */
export function calculateFullRecord(
  record: RPLRecord, 
  prevRecord: RPLRecord | null,
  cumulativeByTypeMap: Map<string, number>
): CalculatedRPLRecord {
  const latRad = record.latitude * DEG_TO_RAD
  const mps = calculateMeridionalParts(record.latitude)
  const eDist = calculateDistanceFromEquator(record.latitude)
  
  // 计算差异值
  let diffLat = 0, diffMPs = 0, diffEDist = 0, diffLon = 0
  let courseRad = 0, distNm = 0, bearingT = 0
  let routeDistBetween = 0
  
  if (prevRecord) {
    diffLat = (record.latitude - prevRecord.latitude) * 60 // 转换为分
    diffMPs = mps - calculateMeridionalParts(prevRecord.latitude)
    diffEDist = eDist - calculateDistanceFromEquator(prevRecord.latitude)
    diffLon = (record.longitude - prevRecord.longitude) * 60 // 转换为分
    
    courseRad = calculateCourseRadians(prevRecord.latitude, prevRecord.longitude, record.latitude, record.longitude)
    distNm = calculateDistanceNauticalMiles(prevRecord.latitude, prevRecord.longitude, record.latitude, record.longitude)
    bearingT = calculateBearingTrue(courseRad)
    routeDistBetween = calculateDistanceKm(prevRecord.latitude, prevRecord.longitude, record.latitude, record.longitude)
  }
  
  // 更新分类型累计
  const prevCumByType = cumulativeByTypeMap.get(record.cableType) || 0
  const slack = record.slack ?? 0
  const segmentLength = record.segmentLength ?? 0
  const cableDistBetween = segmentLength * (1 + slack / 100)
  const newCumByType = prevCumByType + cableDistBetween
  cumulativeByTypeMap.set(record.cableType, newCumByType)
  
  return {
    ...record,
    latitudeDMS: decimalToDMS(record.latitude, true),
    longitudeDMS: decimalToDMS(record.longitude, false),
    decimalLatitudeDegrees: record.latitude,
    radiansLatitude: latRad,
    sinLatitude: Math.sin(latRad),
    meridionalParts: mps,
    distanceFromEquator: eDist,
    decimalLongitudeMinutes: decimalDegreesToMinutes(record.longitude),
    diffLatitude: diffLat,
    diffMPs: diffMPs,
    diffEDist: diffEDist,
    diffLongitude: diffLon,
    courseRadians: courseRad,
    distanceNmiles: distNm,
    bearingT: bearingT,
    routeDistanceBetween: routeDistBetween,
    routeDistanceCumulative: record.cumulativeLength,
    cableDistanceBetween: cableDistBetween,
    cableDistanceCumulative: (record.cumulativeLength ?? 0) * (1 + slack / 100),
    cumulativeByType: newCumByType,
    approxDepth: record.depth ?? 0,
    plannedBurialDepth: record.burialDepth ?? 0,
    additionalFeatures: record.remarks || ''
  }
}

// 解析度分秒字符串为单独的度、分、方向
function parseDMSParts(dms: string): { degrees: string, minutes: string, direction: string } {
  // 格式: "1° 17.425' N" 或 "121° 30.500' E"
  const match = dms.match(/([\d.]+)\u00b0\s*([\d.]+)'\s*([NSEW])/i)
  if (match) {
    return { degrees: match[1], minutes: match[2], direction: match[3] }
  }
  return { degrees: '0', minutes: '0', direction: '' }
}

// 将计算后的记录转换为行业标准格式行 - 按 docs/RPL表头.xlsx 结构
function recordToStandardRow(record: CalculatedRPLRecord, index: number, cableTotalsByType: Map<string, number>): (string | number)[] {
  const latParts = parseDMSParts(record.latitudeDMS)
  const lonParts = parseDMSParts(record.longitudeDMS)
  
  return [
    index + 1,                                              // Pos No.
    EVENT_TYPE_MAP[record.pointType] || record.pointType,   // Event
    latParts.degrees,                                       // Lat °
    latParts.minutes,                                       // Lat '
    latParts.direction,                                     // Lat Dir
    lonParts.degrees,                                       // Lon °
    lonParts.minutes,                                       // Lon '
    lonParts.direction,                                     // Lon Dir
    record.decimalLatitudeDegrees.toFixed(6),               // Decimal Latitude (degrees)
    record.radiansLatitude.toFixed(8),                      // Radians Latitude
    record.sinLatitude.toFixed(8),                          // Sin Latitude
    record.meridionalParts.toFixed(3),                      // Meridional Parts
    record.distanceFromEquator.toFixed(3),                  // Distance from Equator
    record.decimalLongitudeMinutes.toFixed(3),              // Decimal Longitude (minutes)
    record.diffLatitude.toFixed(4),                         // Difference in Latitude (degrees)
    record.diffMPs.toFixed(4),                              // Difference in MPs
    record.diffEDist.toFixed(4),                            // Difference in E Dist
    record.diffLongitude.toFixed(4),                        // Difference in Longitude (minutes)
    record.courseRadians.toFixed(6),                        // Course (Radians)
    record.distanceNmiles.toFixed(4),                       // Distance in nmiles (6087 ft)
    record.bearingT.toFixed(2),                             // Bearing °T
    record.routeDistanceBetween.toFixed(3),                 // Distance (km) Between Positions
    record.routeDistanceCumulative.toFixed(3),              // Distance (km) Cumulative Total
    record.slack.toFixed(1),                                // Slack %
    record.cableDistanceBetween.toFixed(3),                 // Cable Distance (km) Between Positions
    record.cableDistanceCumulative.toFixed(3),              // Cable Distance (km) Cumulative Total
    record.cableType,                                       // Cable Type
    record.cumulativeByType.toFixed(3),                     // Cumulative by type
    (cableTotalsByType.get(record.cableType) || 0).toFixed(3), // Cable Totals By Type (km)
    record.approxDepth.toFixed(1),                          // Approx Depth (m)
    record.plannedBurialDepth.toFixed(2),                   // Target Burial Depth (m)
    record.additionalFeatures                               // Planned Additional Route Features
  ]
}

/**
 * 计算全部记录的完整字段
 */
export function calculateAllRecords(records: RPLRecord[]): CalculatedRPLRecord[] {
  const cumulativeByTypeMap = new Map<string, number>()
  const calculatedRecords: CalculatedRPLRecord[] = []
  
  records.forEach((record, index) => {
    const prevRecord = index > 0 ? records[index - 1] : null
    const calculated = calculateFullRecord(record, prevRecord, cumulativeByTypeMap)
    calculatedRecords.push(calculated)
  })
  
  return calculatedRecords
}

// 导出为CSV格式 - 按 docs/RPL表头.xlsx 结构
export function exportToCSV(table: RPLTable): string {
  const rows: string[] = []
  
  // 添加文件头信息
  rows.push(`# Route Position List (RPL)`)
  rows.push(`# Project: ${table.name}`)
  rows.push(`# Route ID: ${table.routeId || 'N/A'}`)
  rows.push(`# Generated: ${new Date().toISOString()}`)
  rows.push(`# Total Points: ${table.records.length}`)
  rows.push(`# Total Length: ${table.metadata.totalLength.toFixed(3)} km`)
  rows.push('')
  
  // 添加二级表头 - 第一行(分组名称)
  const groupRow = RPL_HEADER_GROUPS.map(g => {
    const cols = new Array(g.columns.length).fill('')
    cols[0] = g.title
    return cols
  }).flat()
  rows.push(groupRow.join(','))
  
  // 添加表头 - 第二行(列名称)
  rows.push(RPL_STANDARD_HEADERS.join(','))
  
  // 计算完整字段
  const calculatedRecords = calculateAllRecords(table.records)
  
  // 计算每种电缆类型的总长度
  const cableTotalsByType = new Map<string, number>()
  calculatedRecords.forEach(record => {
    const currentTotal = cableTotalsByType.get(record.cableType) || 0
    cableTotalsByType.set(record.cableType, currentTotal + record.cableDistanceBetween)
  })
  
  // 添加数据行
  calculatedRecords.forEach((record, index) => {
    const row = recordToStandardRow(record, index, cableTotalsByType)
    // CSV转义处理
    const csvRow = row.map(cell => {
      const str = String(cell)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    })
    rows.push(csvRow.join(','))
  })
  
  return rows.join('\n')
}

// 触发文件下载
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 下载 Blob 文件
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 导出为 Excel 格式（带边框和二级表头）
export async function exportToExcel(table: RPLTable): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Submarine Cable Planner'
  workbook.created = new Date()
  
  const worksheet = workbook.addWorksheet('RPL', {
    views: [{ state: 'frozen', ySplit: 9 }] // 冻结前9行（文件头+二级表头）
  })
  
  // 边框样式
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  }
  
  // 表头样式 - 第一级（分组标题）
  const groupHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' } // 蓝色背景
  }
  
  // 表头样式 - 第二级（列名称）
  const columnHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E2F3' } // 浅蓝色背景
  }
  
  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    size: 10
  }
  
  const groupHeaderFont: Partial<ExcelJS.Font> = {
    bold: true,
    size: 10,
    color: { argb: 'FFFFFFFF' } // 白色字体
  }
  
  // 添加文件头信息
  worksheet.addRow(['Route Position List (RPL)'])
  worksheet.addRow([`Project: ${table.name}`])
  worksheet.addRow([`Route ID: ${table.routeId || 'N/A'}`])
  worksheet.addRow([`Generated: ${new Date().toISOString()}`])
  worksheet.addRow([`Total Points: ${table.records.length}`])
  worksheet.addRow([`Total Length: ${table.metadata.totalLength.toFixed(3)} km`])
  worksheet.addRow([]) // 空行
  
  const headerStartRow = 8 // 第一级表头起始行
  
  // 添加二级表头 - 第一行(分组名称)
  const groupRowData: string[] = []
  RPL_HEADER_GROUPS.forEach(g => {
    g.columns.forEach((_, i) => {
      groupRowData.push(i === 0 ? g.title : '')
    })
  })
  const groupRowRef = worksheet.addRow(groupRowData)
  
  // 添加表头 - 第二行(列名称)
  const headerRowRef = worksheet.addRow(RPL_STANDARD_HEADERS)
  
  // 合并单元格并设置样式
  let colIndex = 1
  RPL_HEADER_GROUPS.forEach(group => {
    const startCol = colIndex
    const endCol = colIndex + group.columns.length - 1
    
    // 如果分组有标题且跨多列，合并第一行的单元格
    if (group.title && group.columns.length > 1) {
      worksheet.mergeCells(headerStartRow, startCol, headerStartRow, endCol)
    }
    
    // 设置第一级表头样式
    for (let c = startCol; c <= endCol; c++) {
      const cell = worksheet.getCell(headerStartRow, c)
      cell.fill = groupHeaderFill
      cell.font = groupHeaderFont
      cell.border = thinBorder
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
    
    // 设置第二级表头样式
    for (let c = startCol; c <= endCol; c++) {
      const cell = worksheet.getCell(headerStartRow + 1, c)
      cell.fill = columnHeaderFill
      cell.font = headerFont
      cell.border = thinBorder
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }
    
    colIndex = endCol + 1
  })
  
  // 计算完整字段
  const calculatedRecords = calculateAllRecords(table.records)
  
  // 计算每种电缆类型的总长度
  const cableTotalsByType = new Map<string, number>()
  calculatedRecords.forEach(record => {
    const currentTotal = cableTotalsByType.get(record.cableType) || 0
    cableTotalsByType.set(record.cableType, currentTotal + record.cableDistanceBetween)
  })
  
  // 添加数据行
  calculatedRecords.forEach((record, index) => {
    const rowData = recordToStandardRow(record, index, cableTotalsByType)
    const dataRow = worksheet.addRow(rowData)
    dataRow.eachCell((cell) => {
      cell.border = thinBorder
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
  })
  
  // 设置列宽
  worksheet.columns.forEach((column, index) => {
    const header = RPL_STANDARD_HEADERS[index] || ''
    // 根据表头长度设置列宽，最小12，最大22
    column.width = Math.min(Math.max(header.length + 4, 12), 22)
  })
  
  // 设置表头行高
  worksheet.getRow(headerStartRow).height = 25
  worksheet.getRow(headerStartRow + 1).height = 30
  
  // 生成 Blob
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// 导出RPL文件主函数
export async function exportRPLFile(table: RPLTable, format: 'xlsx' | 'csv' = 'xlsx') {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const baseName = `RPL_${table.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${timestamp}`
  
  if (format === 'xlsx') {
    // 导出 Excel 格式（带边框）
    const blob = await exportToExcel(table)
    downloadBlob(blob, `${baseName}.xlsx`)
  } else {
    // 导出 CSV 格式
    const content = exportToCSV(table)
    downloadFile(content, `${baseName}.csv`, 'text/csv;charset=utf-8')
  }
}

// Vue composable
export function useRPLExport() {
  return {
    exportToCSV,
    exportRPLFile,
    downloadFile,
    RPL_STANDARD_HEADERS,
    RPL_HEADER_GROUPS,
    // 坐标转换函数
    decimalToDMS,
    decimalDegreesToMinutes,
    // 墨卡托投影计算
    calculateMeridionalParts,
    calculateDistanceFromEquator,
    // 航向距离计算
    calculateCourseRadians,
    calculateBearingTrue,
    calculateDistanceNauticalMiles,
    calculateDistanceKm,
    // 完整记录计算
    calculateFullRecord,
    calculateAllRecords,
  }
}
