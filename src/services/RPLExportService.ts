/**
 * RPL文件导出服务
 * 按行业标准格式导出Route Position List文件
 * 支持CSV格式
 * 包含墨卡托投影、度分秒转换、航向距离计算等完整功能
 */

import type { RPLRecord, RPLTable } from '@/types'

// ========== 常量定义 ==========
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const EARTH_RADIUS_KM = 6371.0
const EARTH_RADIUS_NM = 3440.065  // 海里

// 行业标准RPL二级表头
export const RPL_HEADER_GROUPS = [
  { title: 'Position', columns: ['Pos No.', 'Event'] },
  { title: 'Coordinates', columns: ['Latitude (DMS)', 'Latitude (Dec°)', 'Latitude (Rad)', 'Sin(Lat)', 'MPs', 'E.Dist', 'Longitude (DMS)', 'Longitude (Dec′)'] },
  { title: 'Differences', columns: ['Diff Lat', 'Diff MPs', 'Diff E.Dist', 'Diff Long'] },
  { title: 'Navigation', columns: ['Course (Rad)', 'Distance (NM)', 'Bearing T'] },
  { title: 'Route Distance (km)', columns: ['Between', 'Cumulative'] },
  { title: 'Cable Distance (km)', columns: ['Between', 'Cumulative', 'By Type'] },
  { title: 'Cable', columns: ['Type', 'Approx Depth (m)', 'Planned Burial (m)'] },
  { title: '', columns: ['Additional Features'] }
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
  const cableDistBetween = record.segmentLength * (1 + record.slack / 100)
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
    cableDistanceCumulative: record.cumulativeLength * (1 + record.slack / 100),
    cumulativeByType: newCumByType,
    approxDepth: record.depth,
    plannedBurialDepth: record.burialDepth,
    additionalFeatures: record.remarks || ''
  }
}

// 将计算后的记录转换为行业标准格式行
function recordToStandardRow(record: CalculatedRPLRecord, index: number): (string | number)[] {
  return [
    index + 1,                                              // Pos No.
    EVENT_TYPE_MAP[record.pointType] || record.pointType,   // Event
    record.latitudeDMS,                                     // Latitude (DMS)
    record.decimalLatitudeDegrees.toFixed(6),               // Latitude (Dec°)
    record.radiansLatitude.toFixed(8),                      // Latitude (Rad)
    record.sinLatitude.toFixed(8),                          // Sin(Lat)
    record.meridionalParts.toFixed(3),                      // MPs
    record.distanceFromEquator.toFixed(3),                  // E.Dist
    record.longitudeDMS,                                    // Longitude (DMS)
    record.decimalLongitudeMinutes.toFixed(3),              // Longitude (Dec′)
    record.diffLatitude.toFixed(4),                         // Diff Lat
    record.diffMPs.toFixed(4),                              // Diff MPs
    record.diffEDist.toFixed(4),                            // Diff E.Dist
    record.diffLongitude.toFixed(4),                        // Diff Long
    record.courseRadians.toFixed(6),                        // Course (Rad)
    record.distanceNmiles.toFixed(4),                       // Distance (NM)
    record.bearingT.toFixed(2),                             // Bearing T
    record.routeDistanceBetween.toFixed(3),                 // Route Distance Between
    record.routeDistanceCumulative.toFixed(3),              // Route Distance Cumulative
    record.cableDistanceBetween.toFixed(3),                 // Cable Distance Between
    record.cableDistanceCumulative.toFixed(3),              // Cable Distance Cumulative
    record.cumulativeByType.toFixed(3),                     // Cable Cumulative By Type
    record.cableType,                                       // Cable Type
    record.approxDepth.toFixed(1),                          // Approx Depth
    record.plannedBurialDepth.toFixed(2),                   // Planned Burial
    record.additionalFeatures                               // Additional Features
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

// 导出为CSV格式
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
  
  // 添加数据行
  calculatedRecords.forEach((record, index) => {
    const row = recordToStandardRow(record, index)
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

// 导出RPL文件主函数
export function exportRPLFile(table: RPLTable, format: 'csv' = 'csv') {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const baseName = `RPL_${table.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${timestamp}`
  const content = exportToCSV(table)
  downloadFile(content, `${baseName}.csv`, 'text/csv;charset=utf-8')
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
