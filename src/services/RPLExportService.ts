/**
 * RPL 导出服务
 * 完全按照示例文件格式：35列(A~AI)，行1元数据，行2-5四级表头，行6常数，行7起每点2行
 *
 * 位置行 (奇数行): A=序号 B=事件 C=纬度度 D=纬度分 E=N/S F=经度度 G=经度分 H=E/W
 *                  I=十进制纬度 J=弧度纬度 K=sin纬度 L=子午线部分 M=距赤道nm N=经度十进制分
 *                  W=累计路由距离km  Z=累计电缆距离km  AB=按类型累计  AD=水深  AF=备注
 * 计算行 (偶数行): O=纬差(度) P=MP差 Q=E距差 R=经差(分) S=航向(弧度) T=距离(nm,6087ft)
 *                  U=方位角°T  V=距离km  X=余缆率%  Y=含余缆距离km  AA=电缆类型  AE=埋设目标
 */
import type { RPLRecord, RPLTable } from '@/types'
import ExcelJS from 'exceljs'

// ── WGS84 椭球常数 ──────────────────────────────────────────
const WGS84_A  = 6378137               // 半长轴 m
const WGS84_E2 = 0.00669437999013      // 离心率²
const WGS84_E  = Math.sqrt(WGS84_E2)
const AH6_CONST = 3437.76019803833     // 半长轴海里数 (1nm = 6087 ft)
const NM_METERS = 6087 * 0.3048       // 1海里(6087ft) = 1855.3576 m
const NM_KM     = NM_METERS / 1000    // km/nm

// Helmert 子午弧级数系数 (预计算，避免重复计算)
const _b  = WGS84_A * Math.sqrt(1 - WGS84_E2)
const _n  = (WGS84_A - _b) / (WGS84_A + _b)
const _n2 = _n * _n
const _n3 = _n * _n2
const _n4 = _n2 * _n2
const _HC0 = WGS84_A / (1 + _n) * (1 + _n2 / 4 + _n4 / 64)
const _HC2 = WGS84_A / (1 + _n) * (3 * _n / 2 - 27 * _n3 / 32)
const _HC4 = WGS84_A / (1 + _n) * (15 * _n2 / 16 - 55 * _n4 / 32)
const _HC6 = WGS84_A / (1 + _n) * (35 * _n3 / 48)

// 事件名称映射
const EVENT_MAP: Record<string, string> = {
  landing:   'BMH',
  repeater:  'Repeater',
  branching: 'Branching Unit',
  joint:     'Joint',
  waypoint:  'AC',
}

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

// ── 地测计算 ─────────────────────────────────────────────────

/** L 列：子午线部分 (Meridional Parts = 等角纬度 × AH6) */
function calcMeridionalParts(phiRad: number): number {
  const sp = Math.sin(phiRad)
  const psi =
    Math.log(Math.tan(Math.PI / 4 + phiRad / 2)) -
    (WGS84_E / 2) * Math.log((1 + WGS84_E * sp) / (1 - WGS84_E * sp))
  return psi * AH6_CONST
}

/** M 列：距赤道海里数 (Helmert 子午弧 / NM_METERS, 1nm=6087ft) */
function calcDistFromEquator(phiRad: number): number {
  const arc =
    _HC0 * phiRad -
    _HC2 * Math.sin(2 * phiRad) +
    _HC4 * Math.sin(4 * phiRad) -
    _HC6 * Math.sin(6 * phiRad)
  return arc / NM_METERS
}

/** 逐点预计算的地测数据结构 */
interface GeoRow {
  record:  RPLRecord
  latDeg:  number   // C: 纬度度
  latMin:  number   // D: 纬度分
  latDir:  string   // E: N/S
  lonDeg:  number   // F: 经度度
  lonMin:  number   // G: 经度分
  lonDir:  string   // H: E/W
  I:       number   // I: 十进制纬度(度)
  J:       number   // J: 弧度纬度
  K:       number   // K: sin纬度
  L:       number   // L: 子午线部分
  M:       number   // M: 距赤道(nm)
  N:       number   // N: 经度十进制分
}

function buildGeoRow(record: RPLRecord): GeoRow {
  const latAbs = Math.abs(record.latitude)
  const latDeg = Math.floor(latAbs)
  const latMin = (latAbs - latDeg) * 60
  const latDir = record.latitude >= 0 ? 'N' : 'S'

  const lonAbs = Math.abs(record.longitude)
  const lonDeg = Math.floor(lonAbs)
  const lonMin = (lonAbs - lonDeg) * 60
  const lonDir = record.longitude >= 0 ? 'E' : 'W'

  const I = latDeg + latMin / 60      // 十进制度
  const J = I * Math.PI / 180         // 弧度
  const K = Math.sin(J)               // sin
  const L = calcMeridionalParts(J)    // 子午线部分
  const M = calcDistFromEquator(J)    // 距赤道nm
  const N = lonDeg * 60 + lonMin      // 经度十进制分

  return { record, latDeg, latMin, latDir, lonDeg, lonMin, lonDir, I, J, K, L, M, N }
}

// ── 导出主函数 ────────────────────────────────────────────────

export async function exportToExcel(table: RPLTable): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
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

  // ─── 行 6: 椭球常数与默认值 ──────────────────────────────
  ws.getCell('Y6').value  = 0.02           // 默认初始余缆(km)
  ws.getCell('AA6').value = 'SA'           // 默认电缆类型
  ws.getCell('AG6').value = WGS84_A        // 半长轴 m
  ws.getCell('AH6').value = AH6_CONST      // 半长轴 nm (6087ft)
  ws.getCell('AI6').value = WGS84_E2       // 离心率²

  // ─── 数据行 (第7行起，每点2行) ────────────────────────────
  // 预计算所有点的地测数据
  const geoRows: GeoRow[] = table.records?.map(buildGeoRow) ?? []

  // 累计值初始化
  let cumDist  = 0     // W列: 路由累计距离 km
  let cumCable = 0.02  // Z列: 电缆累计距离 km (初始0.02来自Y6)
  const cumByType = new Map<string, number>()
  // 第一个点的电缆类型初始累计=0.02
  if (geoRows[0]) {
    cumByType.set(geoRows[0].record.cableType, 0.02)
  }

  for (let i = 0; i < geoRows.length; i++) {
    const curr = geoRows[i]
    const r    = curr.record
    const posRow  = 7 + i * 2   // 位置行 (奇数)
    const calcRow = posRow + 1  // 计算行 (偶数)

    // 确保当前电缆类型已在 map 中
    if (!cumByType.has(r.cableType)) {
      cumByType.set(r.cableType, 0)
    }

    // ── 位置行 ──────────────────────────────────────────────
    ws.getCell(posRow, 1).value  = r.sequence                                          // A: Pos No.
    ws.getCell(posRow, 2).value  = r.event ?? EVENT_MAP[r.pointType] ?? r.pointType   // B: Event
    ws.getCell(posRow, 3).value  = curr.latDeg                                         // C: 纬度度
    ws.getCell(posRow, 4).value  = curr.latMin                                         // D: 纬度分
    ws.getCell(posRow, 5).value  = curr.latDir                                         // E: N/S
    ws.getCell(posRow, 6).value  = curr.lonDeg                                         // F: 经度度
    ws.getCell(posRow, 7).value  = curr.lonMin                                         // G: 经度分
    ws.getCell(posRow, 8).value  = curr.lonDir                                         // H: E/W
    ws.getCell(posRow, 9).value  = curr.I                                              // I: 十进制纬度
    ws.getCell(posRow, 10).value = curr.J                                              // J: 弧度纬度
    ws.getCell(posRow, 11).value = curr.K                                              // K: sin纬度
    ws.getCell(posRow, 12).value = curr.L                                              // L: 子午线部分
    ws.getCell(posRow, 13).value = curr.M                                              // M: 距赤道nm
    ws.getCell(posRow, 14).value = curr.N                                              // N: 经度十进制分
    ws.getCell(posRow, 23).value = cumDist                                             // W: 累计路由距离
    ws.getCell(posRow, 26).value = cumCable                                            // Z: 累计电缆距离
    ws.getCell(posRow, 28).value = cumByType.get(r.cableType) ?? 0                    // AB: 按类型累计
    ws.getCell(posRow, 30).value = r.depth                                             // AD: 水深(m)
    if (r.remarks) {
      ws.getCell(posRow, 32).value = r.remarks                                         // AF: 备注
    }

    // ── 计算行 (仅非末点) ────────────────────────────────────
    if (i < geoRows.length - 1) {
      const next = geoRows[i + 1]
      const nr   = next.record

      // O~R: 差值
      const dLat = next.I - curr.I   // O: 纬差(度)
      const dMP  = next.L - curr.L   // P: MP差
      const dED  = next.M - curr.M   // Q: 距赤道差(nm)
      const dLon = next.N - curr.N   // R: 经差(分)

      // S: 航向(弧度) = atan(|经差| / |MP差|)，始终为第一象限角
      const S = Math.atan(Math.abs(dLon) / Math.abs(dMP))

      // U: 方位角°T (按象限转换)
      const S_deg = S * 180 / Math.PI
      let U: number
      if      (dLat >= 0 && dLon >= 0) U = S_deg          // NE
      else if (dLat >= 0 && dLon <  0) U = 360 - S_deg    // NW
      else if (dLat <  0 && dLon >= 0) U = 180 - S_deg    // SE
      else                              U = 180 + S_deg    // SW

      // T: 航程(nm, 6087ft) = |距赤道差(nm)| / cos(航向)
      const T = Math.abs(dED) / Math.cos(S)

      // V: 距离(km) = T × NM_KM
      const V = T * NM_KM

      // X: 余缆率%(取自下一点)，Y: 含余缆电缆距离
      const slack = nr.slack ?? 0.5
      const Y     = V * (1 + slack / 100)

      // 更新累计值 (供下一个位置行使用)
      cumDist  += V
      cumCable += Y
      if (!cumByType.has(nr.cableType)) {
        cumByType.set(nr.cableType, 0)
      }
      cumByType.set(nr.cableType, cumByType.get(nr.cableType)! + Y)

      // 写入计算数据到 calcRow
      ws.getCell(calcRow, 15).value = dLat           // O: 纬差(度)
      ws.getCell(calcRow, 16).value = dMP            // P: MP差
      ws.getCell(calcRow, 17).value = dED            // Q: 距赤道差
      ws.getCell(calcRow, 18).value = dLon           // R: 经差(分)
      ws.getCell(calcRow, 19).value = S              // S: 航向(弧度)
      ws.getCell(calcRow, 20).value = T              // T: 距离(nm)
      ws.getCell(calcRow, 21).value = U              // U: 方位角°T
      ws.getCell(calcRow, 22).value = V              // V: 距离(km)
      ws.getCell(calcRow, 24).value = slack          // X: 余缆率%
      ws.getCell(calcRow, 25).value = Y              // Y: 含余缆距离(km)
      ws.getCell(calcRow, 27).value = nr.cableType   // AA: 电缆类型
      if (nr.burialDepth) {
        ws.getCell(calcRow, 31).value = nr.burialDepth  // AE: 埋设目标(m)
      }
    }
  }

  // ─── 应用样式 ─────────────────────────────────────────────
  _applyRPLStyles(ws, geoRows.length)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// 下载文件
export function downloadBlob(blob: Blob, filename: string): void {
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

// ── 公开工具函数 (供测试及外部调用) ──────────────────────────

/** 十进制度 → "度° 分' 方向" 字符串 */
export function decimalToDMS(decimal: number, isLat: boolean): string {
  const abs = Math.abs(decimal)
  const deg = Math.floor(abs)
  const min = (abs - deg) * 60
  const dir = isLat
    ? (decimal >= 0 ? 'N' : 'S')
    : (decimal >= 0 ? 'E' : 'W')
  return `${deg}\u00b0 ${min.toFixed(3)}' ${dir}`
}

/** 子午线部分 (接受十进制度，内部转弧度) */
export function calculateMeridionalParts(latDeg: number): number {
  return calcMeridionalParts(latDeg * Math.PI / 180)
}

/** Haversine 球面距离 km (Earth radius ≈ 6371 km) */
export function calculateDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Haversine 球面距离 nm (1 nm = 1.852 km) */
export function calculateDistanceNauticalMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  return calculateDistanceKm(lat1, lon1, lat2, lon2) / 1.852
}

/**
 * 航向弧度 (atan2 标准约定，范围 -π ~ +π)
 * 可直接传给 calculateBearingTrue 转为 0~360°
 */
export function calculateCourseRadians(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const phi1 = lat1 * Math.PI / 180
  const phi2 = lat2 * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon)
  return Math.atan2(y, x)
}

/** 将 calculateCourseRadians 的结果转换为罗盘方位角 0~360° */
export function calculateBearingTrue(courseRad: number): number {
  return (courseRad * 180 / Math.PI + 360) % 360
}
