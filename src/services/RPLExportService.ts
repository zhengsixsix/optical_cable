/**
 * RPL 导出服务
 * 完全按照示例文件格式：35列(A~AI)，行1元数据，行2-5四级表头，行6常数，行7起每点2行
 *
 * 除经纬度显示格式外，所有导航、距离、余缆和累计字段均直接序列化 RPL 记录。
 * 后端/导入表缺少明确字段时保持为空；现有数据自动表仅回退到语义等价的基础字段。
 */
import type { RPLRecord, RPLTable } from '@/types'
import type * as ExcelJS from 'exceljs'

// ── WGS84 椭球常数 ──────────────────────────────────────────
const WGS84_A  = 6378137               // 半长轴 m
const WGS84_E2 = 0.00669437999013      // 离心率²
const AH6_CONST = 3437.76019803833     // 半长轴海里数 (1nm = 6087 ft)

// ── 样式常量与辅助函数 ─────────────────────────────────────────

/** 列宽 (A~AI，共35列，来自示例文件) */
const _COL_WIDTHS = [
  4, 32, 7.14, 9, 2, 7.14, 9, 2,          // A-H
  9.71, 9.71, 9.71, 9.71, 11.57, 9.71,   // I-N
  11.29, 10.29, 10.29, 10.57, 10.29, 9.71, // O-T
  11.14, 12, 12, 7.14, 12, 13.86,         // U-Z
  6.71, 14, 12, 9, 8, 37,                 // AA-AF
  14.57, 14.57, 11.86,                     // AG-AI
]

/** 边框 Side 常量 */
const _T = { style: 'thin'   } as ExcelJS.Border
const _M = { style: 'medium' } as ExcelJS.Border
const _D = { style: 'double' } as ExcelJS.Border

function _bdr(
  l?: ExcelJS.Border, r?: ExcelJS.Border,
  t?: ExcelJS.Border, b?: ExcelJS.Border,
): Partial<ExcelJS.Borders> {
  return { left: l, right: r, top: t, bottom: b }
}

/** 表头行有左边框的列集合 (除A列medium外均为thin) */
const _HDR_L_COLS = new Set([3, 6, 21, 22, 24, 25, 27, 29, 30, 32])

/** 位置行边框 (1-indexed, 2行/点位布局，无合并) */
function _posRowBorder(c: number): Partial<ExcelJS.Borders> {
  if (c === 1)  return _bdr(_M, _T, undefined, _T)                    // L=medium, R=thin, B=thin
  if (c === 2)  return _bdr(undefined, undefined, undefined, _T)      // B=thin only
  if (c === 3)  return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin
  if (c === 4 || c === 5) return _bdr(undefined, undefined, undefined, _T) // B=thin
  if (c === 6)  return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin
  if (c >= 7 && c <= 20)  return _bdr(undefined, undefined, undefined, _T) // B=thin
  if (c >= 21 && c <= 23) return _bdr(_T, undefined, undefined, _T)  // L=thin, B=thin
  if (c === 24) return _bdr(_T, undefined, _T, _T)                    // L=thin, T=thin, B=thin
  if (c === 25) return _bdr(_T, _T, _T, _T)                           // box: all thin
  if (c === 26) return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin
  if (c === 27) return _bdr(_T, _T, _T, _T)                           // box: all thin
  if (c === 28) return _bdr(undefined, undefined, undefined, _T)     // B=thin
  if (c === 29) return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin
  if (c === 30) return _bdr(_T, _T, undefined, _T)                    // L=thin, R=thin, B=thin
  if (c === 31) return _bdr(undefined, _T, undefined, _T)             // R=thin (no L), B=thin
  if (c === 32) return _bdr(undefined, _M, undefined, _T)             // R=medium (no L), B=thin
  if (c === 33) return _bdr(_M)                                       // AG: L=medium only
  return {}
}

/** 计算行边框 (1-indexed, 2行/点位布局，无合并) */
function _calcRowBorder(c: number): Partial<ExcelJS.Borders> {
  if (c === 1)  return _bdr(_M, undefined, _T, _T)                    // L=medium, T=thin, B=thin (no R)
  if (c === 2)  return _bdr(undefined, undefined, _T, _T)             // T=thin, B=thin
  if (c >= 3 && c <= 20)  return _bdr(undefined, undefined, undefined, _T) // B=thin
  if (c >= 21 && c <= 23) return _bdr(_T, undefined, undefined, _T)  // L=thin, B=thin
  if (c === 24) return _bdr(_T, _T, undefined, _T)                    // L=thin, R=thin, B=thin
  if (c === 25) return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin
  if (c === 26) return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin
  if (c === 27) return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin (no R, no T)
  if (c === 28) return _bdr(undefined, undefined, undefined, _T)     // B=thin
  if (c === 29) return _bdr(_T, undefined, undefined, _T)             // L=thin, B=thin
  if (c === 30) return _bdr(_T, _T, undefined, _T)                    // L=thin, R=thin, B=thin
  if (c === 31) return _bdr(_T, _T, undefined, _T)                    // L=thin, R=thin, B=thin
  if (c === 32) return _bdr(undefined, _M, undefined, _T)             // R=medium (no L), B=thin
  if (c === 33) return _bdr(_M)                                       // AG: L=medium only
  return {}
}

/** 对齐 */
const _ALIGN_C  = { horizontal: 'center'           as const, vertical: 'middle' as const }
const _ALIGN_L  = { horizontal: 'left'             as const, vertical: 'middle' as const }
const _ALIGN_CAS = { horizontal: 'centerContinuous' as const, vertical: 'middle' as const }

/** 应用工作表样式 */
function _applyRPLStyles(ws: ExcelJS.Worksheet, numPositions: number): void {
  // 1. 列宽
  _COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // 2. 行高: 表头/常数=13pt, 位置行=13pt, 计算行=12.75pt
  for (let r = 1; r <= 6; r++) ws.getRow(r).height = 13.0
  for (let i = 0; i < numPositions; i++) {
    ws.getRow(7 + i * 2).height = 13.0
    ws.getRow(8 + i * 2).height = 12.75
  }

  // 3. 表头行 1-5: Arial 10pt Bold + section-based 边框
  const _hdrL = (c: number): ExcelJS.Border | undefined =>
    c === 1 ? _M : (_HDR_L_COLS.has(c) ? _T : undefined)
  const _hdrR = (c: number, r: number): ExcelJS.Border | undefined => {
    if (r === 5 && c === 26) return _T  // Z5 额外 R=thin
    return c === 1 ? _T : (c === 30 ? _T : (c === 32 ? _M : undefined))
  }

  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 35; c++) {
      const cell = ws.getCell(r, c)
      cell.font      = { name: 'Arial', size: 10, bold: true }
      cell.alignment = { vertical: 'middle' }
      if (c > 32) continue  // AG+ 仅设字体，无边框

      const t: ExcelJS.Border | undefined =
        r === 1 ? _M :
        (r === 3 && (c === 22 || c === 23 || c === 25 || c === 26)) ? _T :
        undefined
      const b: ExcelJS.Border | undefined =
        (r === 5 && (c === 23 || c === 24 || c === 25 || c === 26 || c === 32)) ? _D :
        undefined
      cell.border = _bdr(_hdrL(c), _hdrR(c, r), t, b)
    }
  }

  // CenterAcross 代替 mergeCells (示例使用 ha=6 即 centerContinuous)
  for (const addr of ['C2', 'F2', 'V2', 'Y2']) {
    ws.getCell(addr).alignment = _ALIGN_CAS
  }

  // 4. 第6行 (常数行): 精确 section-based 边框，Y6/AA6 正常字体
  for (let c = 1; c <= 35; c++) {
    const cell = ws.getCell(6, c)
    cell.font      = { name: 'Arial', size: 10 }
    cell.alignment = { vertical: 'middle' }
    if (c > 32) continue
    const l = c === 1 ? _M : (c === 32 ? _T : undefined)
    const r = c === 32 ? _M : undefined
    // T=double on 1-22 and 27-31; W(23)/X(24)/Y(25)/Z(26)/AF(32) 无T (double来自row5底)
    const t = (c <= 22 || (c >= 27 && c <= 31)) ? _D : undefined
    // B=thin on most; Y6(25) 和 AA6(27) 无B
    const b = (c !== 25 && c !== 27) ? _T : undefined
    cell.border = _bdr(l, r, t, b)
  }

  // 5. 数据行: 2行/点位，无纵向合并
  for (let i = 0; i < numPositions; i++) {
    const pr = 7 + i * 2  // 位置行
    const cr = pr + 1      // 计算行

    // 位置行: 字体 + 边框 + 对齐
    for (let c = 1; c <= 33; c++) {
      const cell = ws.getCell(pr, c)
      cell.font      = { name: 'Arial', size: 10 }
      cell.border    = _posRowBorder(c) as ExcelJS.Borders
      cell.alignment = { vertical: 'middle' }
    }
    ws.getCell(pr, 1).alignment  = _ALIGN_C  // A: 序号
    ws.getCell(pr, 2).alignment  = _ALIGN_C  // B: 事件
    ws.getCell(pr, 4).alignment  = _ALIGN_L  // D: 纬度分
    ws.getCell(pr, 5).alignment  = _ALIGN_L  // E: N/S
    ws.getCell(pr, 7).alignment  = _ALIGN_L  // G: 经度分
    ws.getCell(pr, 8).alignment  = _ALIGN_L  // H: E/W
    ws.getCell(pr, 30).alignment = _ALIGN_C  // AD: 水深
    ws.getCell(pr, 32).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

    // 计算行: 字体 + 边框 + 对齐
    for (let c = 1; c <= 33; c++) {
      const cell = ws.getCell(cr, c)
      cell.font      = { name: 'Arial', size: 10 }
      cell.border    = _calcRowBorder(c) as ExcelJS.Borders
      cell.alignment = { vertical: 'middle' }
    }
    ws.getCell(cr, 21).alignment = _ALIGN_C  // U: 方位角
    ws.getCell(cr, 24).alignment = _ALIGN_C  // X: 余缆率
    ws.getCell(cr, 27).alignment = _ALIGN_C  // AA: 电缆类型
    ws.getCell(cr, 31).alignment = _ALIGN_C  // AE: 埋设目标
  }
}

interface CoordinateParts {
  degrees: number
  minutes: number
  direction: string
}

function formatCoordinateParts(value: number, positive: string, negative: string): CoordinateParts {
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  return {
    degrees,
    minutes: (absolute - degrees) * 60,
    direction: value >= 0 ? positive : negative,
  }
}

function writeOptionalNumber(cell: ExcelJS.Cell, value: number | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    cell.value = value
  }
}

/**
 * Keep the export schema's optional industry fields compatible with tables
 * generated from the application's route/connector data.  Imported or
 * manually-maintained tables remain explicit-only; their optional columns are
 * never populated from similarly named core fields.
 */
const isExistingDataTable = (table: RPLTable): boolean =>
  table.autoGenerated === true || table.id.startsWith('rpl-auto-')

const finiteValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const textValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

const firstNumber = (
  primary: unknown,
  fallback: unknown,
  allowFallback: boolean,
): number | undefined => {
  const primaryValue = finiteValue(primary)
  if (primaryValue !== undefined) return primaryValue
  return allowFallback ? finiteValue(fallback) : undefined
}

const firstText = (
  primary: unknown,
  fallback: unknown,
  allowFallback: boolean,
): string | undefined => {
  const primaryValue = textValue(primary)
  if (primaryValue !== undefined) return primaryValue
  return allowFallback ? textValue(fallback) : undefined
}

const eventForRecord = (
  record: RPLRecord,
  index: number,
  count: number,
  allowFallback: boolean,
): RPLRecord['event'] | undefined => {
  if (record.event) return record.event
  if (!allowFallback) return undefined

  switch (record.pointType) {
    case 'landing':
      if (count > 1 && index === 0) return 'Start'
      if (count > 1 && index === count - 1) return 'End'
      return 'Landing Station'
    case 'repeater':
      return 'Repeater'
    case 'branching':
      return 'Branching Unit'
    case 'joint':
      return 'Joint'
    default:
      return 'Waypoint'
  }
}

interface ExportRecordValues {
  record: RPLRecord
  event?: RPLRecord['event']
  routeDistanceBetween?: number
  routeDistanceCumulative?: number
  slackPercent?: number
  approxDepth?: number
  targetBurialDepth?: number
  additionalFeatures?: string
}

const prepareRecordForExport = (
  record: RPLRecord,
  index: number,
  count: number,
  allowFallback: boolean,
): ExportRecordValues => ({
  record,
  event: eventForRecord(record, index, count, allowFallback),
  routeDistanceBetween: firstNumber(record.routeDistanceBetween, record.segmentLength, allowFallback),
  routeDistanceCumulative: firstNumber(record.routeDistanceCumulative, record.cumulativeLength, allowFallback),
  slackPercent: firstNumber(record.slackPercent, record.slack, allowFallback),
  approxDepth: firstNumber(record.approxDepth, record.depth, allowFallback),
  targetBurialDepth: firstNumber(record.targetBurialDepth, record.burialDepth, allowFallback),
  additionalFeatures: firstText(record.additionalFeatures, record.remarks, allowFallback),
})

// ── 导出主函数 ────────────────────────────────────────────────

export async function exportToExcel(table: RPLTable): Promise<Blob> {
  const excelJsModule = await import('exceljs')
  const ExcelJSConstructor = excelJsModule.default ?? excelJsModule
  const wb = new ExcelJSConstructor.Workbook()
  const ws = wb.addWorksheet('RPL')

  // ─── 行 1: 元数据 ────────────────────────────────────────
  ws.getCell('AE1').value = 'Planned'
  ws.getCell('AG1').value = 'Blank RPL created'
  ws.getCell('AH1').value = table.createdAt instanceof Date
    ? table.createdAt
    : new Date(table.createdAt)

  // ─── 行 2: 一级表头 ───────────────────────────────────────
  const row2: [string, string][] = [
    ['A2', 'Pos'],          ['B2', 'Event'],
    ['C2', 'Latitude'],     ['F2', 'Longitude'],
    ['I2', 'Decimal'],      ['J2', 'Radians'],    ['K2', 'Sin'],
    ['L2', 'Meridional'],   ['M2', 'Distance from'],
    ['N2', 'Decimal'],
    ['O2', 'Difference'],   ['P2', 'Difference'],
    ['Q2', 'Difference'],   ['R2', 'Difference'],
    ['S2', 'Course'],       ['T2', 'Distance'],    ['U2', 'Bearing'],
    ['V2', 'Distance (km)'],['X2', 'Slack'],       ['Y2', 'Cable Distance (km)'],
    ['AA2', 'Cable'],       ['AB2', 'Cumulative'], ['AC2', 'Cable Totals'],
    ['AD2', 'Approx'],      ['AE2', 'Target'],     ['AF2', 'Additional Route Features'],
    ['AG2', 'A'],           ['AH2', 'AA'],         ['AI2', 'EE'],
  ]
  for (const [addr, val] of row2) ws.getCell(addr).value = val

  // ─── 行 3: 二级表头 ───────────────────────────────────────
  const row3: [string, string][] = [
    ['A3', 'No.'],
    ['I3', 'Latitude'],   ['J3', 'Latitude'],  ['K3', 'Latitude'],
    ['L3', 'Parts'],      ['M3', 'Equator'],   ['N3', 'Longitude'],
    ['O3', 'in Latitude'],['P3', 'in MPs'],    ['Q3', 'in E Dist'],
    ['R3', 'in Longitude'],
    ['S3', '(Radians)'],  ['T3', 'in nmiles'], ['U3', '°T'],
    ['V3', 'Between'],    ['W3', 'Cumulative'],['X3', '%'],
    ['Y3', 'Between'],    ['Z3', 'Cumulative'],
    ['AA3', 'Type'],      ['AB3', 'by type'],  ['AC3', 'By Type'],
    ['AD3', 'Depth'],     ['AE3', 'Burial'],
    ['AG3', '(Semi-major Axis)'],
    ['AH3', '(Semi-major Axis in'],
    ['AI3', '(Eccentricity^2)'],
  ]
  for (const [addr, val] of row3) ws.getCell(addr).value = val

  // ─── 行 4: 三级表头 ───────────────────────────────────────
  const row4: [string, string][] = [
    ['I4', '(degrees)'], ['N4', '(minutes)'],
    ['O4', '(degrees)'], ['R4', '(minutes)'],
    ['T4', '(6087 ft)'],
    ['V4', 'Positions'], ['W4', 'Total'],
    ['Y4', 'Positions'], ['Z4', 'Total'],
    ['AC4', '(km)'],     ['AD4', '(m)'],    ['AE4', 'Depth'],
    ['AH4', '   feet)'],
  ]
  for (const [addr, val] of row4) ws.getCell(addr).value = val

  // ─── 行 5: 四级表头 ───────────────────────────────────────
  ws.getCell('AE5').value = '(m)'

  // ─── 行 6: 模板椭球常数 ──────────────────────────────────
  ws.getCell('AG6').value = WGS84_A        // 半长轴 m
  ws.getCell('AH6').value = AH6_CONST      // 半长轴 nm (6087ft)
  ws.getCell('AI6').value = WGS84_E2       // 离心率²

  // ─── 数据行 (第7行起，每点2行) ────────────────────────────
  const records = table.records ?? []
  const preparedRecords = records.map((record, index) =>
    prepareRecordForExport(record, index, records.length, isExistingDataTable(table)),
  )

  for (let i = 0; i < preparedRecords.length; i++) {
    const prepared = preparedRecords[i]
    const r = prepared.record
    const posRow  = 7 + i * 2   // 位置行 (奇数)
    const calcRow = posRow + 1  // 计算行 (偶数)
    const latitude = formatCoordinateParts(r.latitude, 'N', 'S')
    const longitude = formatCoordinateParts(r.longitude, 'E', 'W')

    // ── 位置行 ──────────────────────────────────────────────
    ws.getCell(posRow, 1).value  = r.sequence                                          // A: Pos No.
    if (prepared.event) ws.getCell(posRow, 2).value = prepared.event                 // B: Event
    ws.getCell(posRow, 3).value  = latitude.degrees                                    // C: 纬度度
    ws.getCell(posRow, 4).value  = latitude.minutes                                    // D: 纬度分
    ws.getCell(posRow, 5).value  = latitude.direction                                  // E: N/S
    ws.getCell(posRow, 6).value  = longitude.degrees                                   // F: 经度度
    ws.getCell(posRow, 7).value  = longitude.minutes                                   // G: 经度分
    ws.getCell(posRow, 8).value  = longitude.direction                                 // H: E/W
    writeOptionalNumber(ws.getCell(posRow, 9), r.decimalLatitudeDegrees)             // I: 十进制纬度
    writeOptionalNumber(ws.getCell(posRow, 10), r.radiansLatitude)                     // J: 弧度纬度
    writeOptionalNumber(ws.getCell(posRow, 11), r.sinLatitude)                         // K: sin纬度
    writeOptionalNumber(ws.getCell(posRow, 12), r.meridionalParts)                     // L: 子午线部分
    writeOptionalNumber(ws.getCell(posRow, 13), r.distanceFromEquator)                 // M: 距赤道nm
    writeOptionalNumber(ws.getCell(posRow, 14), r.decimalLongitudeMinutes)             // N: 经度十进制分
    writeOptionalNumber(ws.getCell(posRow, 23), prepared.routeDistanceCumulative)
    writeOptionalNumber(ws.getCell(posRow, 26), r.cableDistanceCumulative)
    writeOptionalNumber(ws.getCell(posRow, 28), r.cumulativeByType)
    writeOptionalNumber(ws.getCell(posRow, 29), r.cableTotalsByType)
    writeOptionalNumber(ws.getCell(posRow, 30), prepared.approxDepth)
    if (prepared.additionalFeatures) {
      ws.getCell(posRow, 32).value = prepared.additionalFeatures                       // AF: 备注
    }

    // ── 区间行：仅写下一条记录明确携带的区间字段 ──────────────
    if (i < records.length - 1) {
      const next = preparedRecords[i + 1]
      const nextRecord = next.record
      writeOptionalNumber(ws.getCell(calcRow, 15), nextRecord.diffLatitude)
      writeOptionalNumber(ws.getCell(calcRow, 16), nextRecord.diffMPs)
      writeOptionalNumber(ws.getCell(calcRow, 17), nextRecord.diffEDist)
      writeOptionalNumber(ws.getCell(calcRow, 18), nextRecord.diffLongitude)
      writeOptionalNumber(ws.getCell(calcRow, 19), nextRecord.courseRadians)
      writeOptionalNumber(ws.getCell(calcRow, 20), nextRecord.distanceNmiles)
      writeOptionalNumber(ws.getCell(calcRow, 21), nextRecord.bearingT)
      writeOptionalNumber(ws.getCell(calcRow, 22), next.routeDistanceBetween)
      writeOptionalNumber(ws.getCell(calcRow, 24), next.slackPercent)
      writeOptionalNumber(ws.getCell(calcRow, 25), nextRecord.cableDistanceBetween)
      if (nextRecord.cableType) ws.getCell(calcRow, 27).value = nextRecord.cableType
      writeOptionalNumber(ws.getCell(calcRow, 31), next.targetBurialDepth)
    }
  }

  // ─── 应用样式 ─────────────────────────────────────────────
  _applyRPLStyles(ws, records.length)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// 下载文件
function downloadBlob(blob: Blob, filename: string): void {
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 导出 RPL 为 xlsx
export async function exportRPLFile(
  table:   RPLTable,
  _format: 'xlsx' = 'xlsx'
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const name = `RPL_${table.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${date}`
  const blob = await exportToExcel(table)
  downloadBlob(blob, `${name}.xlsx`)
}

export function useRPLExport() {
  return { exportRPLFile, exportToExcel, downloadBlob }
}
