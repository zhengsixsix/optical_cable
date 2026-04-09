/**
 * 生成动态 SLDExcelExportService.ts
 * 
 * 核心思路：
 * 1. 从示例文件提取 3 种图形 XML 模板：REP六边形、BU标记栏、BU船形图标
 * 2. 用 buildLayout() 计算真实数据的列位置
 * 3. 为每个设备替换模板中的锚点坐标 (col/row)
 * 4. 用 jszip 把 ExcelJS 生成的单元格 xlsx + 动态 drawing XML 合并输出
 */

const fs = require('fs');

// ──────────────────────────────────────────────────────────────
// Step 1: 从 drawing1.xml 提取模板
// ──────────────────────────────────────────────────────────────

const drawingXml = fs.readFileSync('E:/Desktop/sld_unzip/xl/drawings/drawing1.xml', 'utf8');

function extractAnchor(xml, identifier) {
  const re = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].includes(identifier)) return m[0];
  }
  return null;
}

// 提取 REP 六边形模板（黑色内矩形版 Group 8 — 标准 REP）
const repHexTemplate = extractAnchor(drawingXml, 'Group 8');
// 提取终端六边形模板（白色内矩形版 Group 1 — landing station）
const termHexTemplate = extractAnchor(drawingXml, 'Group 1');
// 提取 BU 标记矩形模板
const buMarkerTemplate = extractAnchor(drawingXml, 'Rectangle 23');
// 提取 BU 船形图标（复杂嵌套 グループ化）
const buIconTemplate = extractAnchor(drawingXml, 'グループ化 73');

if (!repHexTemplate || !termHexTemplate || !buMarkerTemplate || !buIconTemplate) {
  console.error('模板提取失败', {
    rep: !!repHexTemplate, term: !!termHexTemplate,
    marker: !!buMarkerTemplate, icon: !!buIconTemplate
  });
  process.exit(1);
}

console.log('Templates extracted:');
console.log('  REP hex:', repHexTemplate.length, 'bytes');
console.log('  TERM hex:', termHexTemplate.length, 'bytes');
console.log('  BU marker:', buMarkerTemplate.length, 'bytes');
console.log('  BU icon:', buIconTemplate.length, 'bytes');

// ──────────────────────────────────────────────────────────────
// Step 2: 参数化模板（替换 col/row 为占位符）
// ──────────────────────────────────────────────────────────────

/**
 * 将一个 twoCellAnchor XML 参数化
 * 提取 from/to 的 col/row，替换为 {{FROM_COL}}, {{FROM_ROW}}, {{TO_COL}}, {{TO_ROW}}
 * 同时将所有 id="N" 替换为 {{ID_BASE+offset}}
 */
function parameterize(xml) {
  // 读取原始 from/to，必须包含 rowOff + 闭合标签，否则会留下残余标签导致 XML 无效
  const fromM = xml.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff><\/xdr:from>/);
  const toM   = xml.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff><\/xdr:to>/);

  let tmpl = xml;

  // 替换 from
  if (fromM) {
    tmpl = tmpl.replace(
      fromM[0],
      '<xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
    );
  }
  // 替换 to
  if (toM) {
    tmpl = tmpl.replace(
      toM[0],
      '<xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
    );
  }

  // 替换所有 id="N" 为递增占位符
  let idCtr = 0;
  tmpl = tmpl.replace(/\bid="[^"]+"/g, () => `id="{{ID_${idCtr++}}}"`);

  // 替换 name="..." 防止重名
  tmpl = tmpl.replace(/\bname="[^"]+"/g, 'name="{{NAME}}"');

  return { tmpl, origFromCol: fromM ? +fromM[1] : 0, origFromRow: fromM ? +fromM[3] : 0,
           origToCol: toM ? +toM[1] : 0, origToRow: toM ? +toM[3] : 0 };
}

const repHexParam    = parameterize(repHexTemplate);
const termHexParam   = parameterize(termHexTemplate);
const buMarkerParam  = parameterize(buMarkerTemplate);
const buIconParam    = parameterize(buIconTemplate);

// ──────────────────────────────────────────────────────────────
// Step 3: 生成 TypeScript 服务文件
// ──────────────────────────────────────────────────────────────

function jsStr(s) {
  // 转换为 JS 字符串字面量（处理反引号）
  return JSON.stringify(s);
}

const ts = `/**
 * SLD Excel 导出服务 — 动态真实数据版
 *
 * 实现原理：
 *  1. buildLayout(table) → 计算每个设备的 Excel 列位置
 *  2. writeSheet(ws, layout, table) → 用 ExcelJS 写单元格数据（文字/数字/边框）
 *  3. generateDrawingXml(layout) → 根据设备类型和列位动态生成 drawing XML
 *     - REP/JOINT/OADM → 六边形图形（黑色内矩形）
 *     - 终端 BJB/PFE  → 六边形图形（白色内矩形）
 *     - BU 分支器     → 半透明标记栏 + 船形图标
 *  4. jszip 合并：把 ExcelJS xlsx + drawing XML 合成最终输出
 *
 * 图形模板直接提取自 SLD示例.xlsx 的 drawing1.xml，确保与示例完全一致。
 */

import * as ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { SLDTable, SLDEquipment, SLDFiberSegment } from '@/types'

// ═══════════════════════════════════════════════════
// 布局常量（与 buildLayout 一致）
// ═══════════════════════════════════════════════════

const R_FP    = 0   // 行偏移：光纤对数行（0-indexed，相对 section 起始行）
const R_LAND  = 1   // LAND 行
const R_TYPE  = 2   // 电缆类型 / 站点字母
const R_DIST  = 3   // 距离值
const R_ID    = 4   // 电缆编号
const R_EQUIP = 5   // 设备名称
const R_SEC   = 6   // 次要 / 分支标签
const SECTION_ROWS = 10

const COL_WIDTH  = 9.36328125
const ROW_HEIGHT = 13.5

// ═══════════════════════════════════════════════════
// 图形模板（提取自 drawing1.xml）
// {{FROM_COL}} {{FROM_ROW}} {{TO_COL}} {{TO_ROW}} 为位置占位符
// {{ID_N}} 为形状 ID 占位符，{{NAME}} 为名称占位符
// ═══════════════════════════════════════════════════

// REP 六边形（黑色内矩形 — 标准深海设备：REP/JOINT/OADM）
const TPL_REP_HEX    = ${jsStr(repHexParam.tmpl)}

// 终端六边形（白色内矩形 — 近岸设备：BJB/PFE/终端）
const TPL_TERM_HEX   = ${jsStr(termHexParam.tmpl)}

// BU 标记栏（半透明矩形 — 分支器列标记）
const TPL_BU_MARKER  = ${jsStr(buMarkerParam.tmpl)}

// BU 船形图标（复杂嵌套组 — 分支器视觉图标）
const TPL_BU_ICON    = ${jsStr(buIconParam.tmpl)}

// ═══════════════════════════════════════════════════
// 布局类型
// ═══════════════════════════════════════════════════

type ColKind =
  | 'term' | 'approach' | 'bjb'
  | 'first-span' | 'span' | 'equip' | 'bu'

interface ColDef {
  kind:       ColKind
  col:        number            // 1-based Excel 列号
  equipment?: SLDEquipment
  segment?:   SLDFiberSegment
  letter?:    string
  polarity?:  '+' | '-'
  mergeNext?: boolean
}

// ═══════════════════════════════════════════════════
// 列布局构建
// ═══════════════════════════════════════════════════

function buildLayout(table: SLDTable): ColDef[] {
  const equips = [...table.equipments].sort((a, b) => a.sequence - b.sequence)
  const segs   = [...table.fiberSegments].sort((a, b) => a.sequence - b.sequence)

  const segTo = (eq: SLDEquipment) =>
    segs.find(s => s.toEquipmentId === eq.id || s.toName === eq.name)
  const segBetween = (from: SLDEquipment, to: SLDEquipment) =>
    segs.find(s =>
      (s.fromEquipmentId === from.id || s.fromName === from.name) &&
      (s.toEquipmentId   === to.id   || s.toName   === to.name)
    )

  const cols: ColDef[] = []
  let ci = 1
  const push = (d: Omit<ColDef, 'col'>) => cols.push({ ...d, col: ++ci })
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let termCount = 0
  let firstDeepSpanDone = false

  for (let i = 0; i < equips.length; i++) {
    const eq   = equips[i]
    const prev = equips[i - 1]

    if (i === 0 && eq.type === 'TE') {
      push({ kind: 'term', equipment: eq, letter: LETTERS[termCount++], polarity: '+' })
      if (equips[i + 1]?.type === 'PFE') {
        const pfe = equips[i + 1]
        const s   = segBetween(eq, pfe)
        if (s) push({ kind: 'approach', segment: s })
        push({ kind: 'bjb', equipment: pfe })
        i++; firstDeepSpanDone = false
      }
      continue
    }
    if (eq.type === 'TE' && i === equips.length - 1) {
      const s = segTo(eq)
      if (s) push({ kind: 'approach', segment: s })
      push({ kind: 'term', equipment: eq, letter: LETTERS[termCount++], polarity: '-' })
      continue
    }
    if (eq.type === 'PFE' && i === equips.length - 2) {
      const inSeg = segTo(eq)
      if (inSeg) { push({ kind: 'span', segment: inSeg, mergeNext: true }); push({ kind: 'equip', equipment: eq }) }
      else push({ kind: 'bjb', equipment: eq })
      continue
    }
    if (eq.type === 'BU') {
      const s = segTo(eq)
      if (s) push({ kind: 'span', segment: s, mergeNext: false })
      push({ kind: 'bu', equipment: eq })
      firstDeepSpanDone = true
      continue
    }
    const s = segTo(eq)
    if (s) {
      if (!firstDeepSpanDone && prev && (prev.type === 'TE' || prev.type === 'PFE')) {
        push({ kind: 'first-span', segment: s }); firstDeepSpanDone = true
      } else {
        push({ kind: 'span', segment: s, mergeNext: true })
      }
    }
    push({ kind: 'equip', equipment: eq })
  }
  return cols
}

// ═══════════════════════════════════════════════════
// 单元格写入
// ═══════════════════════════════════════════════════

const THIN   = { style: 'thin'   as const }
const MEDIUM = { style: 'medium' as const }
const DOUBLE = { style: 'double' as const }

function getBorder(bdr?: string) {
  if (!bdr) return undefined
  switch (bdr) {
    case 'thin':     return { top: THIN, bottom: THIN, left: THIN, right: THIN }
    case 'thinDL':   return { top: THIN, bottom: THIN, left: DOUBLE, right: THIN }
    case 'mLR':      return { left: MEDIUM, right: MEDIUM }
    case 'mTLR':     return { top: MEDIUM, left: MEDIUM, right: MEDIUM }
    case 'mBLR':     return { bottom: MEDIUM, left: MEDIUM, right: MEDIUM }
    default: return undefined
  }
}

function setCell(
  ws: ExcelJS.Worksheet, row: number, col: number, value: ExcelJS.CellValue,
  opts: { font?: Partial<ExcelJS.Font>; border?: Partial<ExcelJS.Borders> } = {}
) {
  const cell = ws.getCell(row, col)
  cell.value = value
  cell.font  = { name: 'Calibri', size: 9, ...opts.font }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  if (opts.border) cell.border = opts.border
}

function writeSheet(ws: ExcelJS.Worksheet, cols: ColDef[], table: SLDTable, startRow = 1) {
  const totalCols = cols.length > 0 ? Math.max(...cols.map(c => c.col)) + 2 : 20
  for (let c = 1; c <= totalCols; c++) ws.getColumn(c).width = COL_WIDTH
  for (let r = startRow; r <= startRow + SECTION_ROWS - 1; r++) ws.getRow(r).height = ROW_HEIGHT

  const F_BOLD = { bold: true }
  const F_FP   = { size: 11 }

  // 预填默认字体
  for (let rOff = 0; rOff <= 6; rOff++) {
    const rn = startRow + rOff
    const sz = (rOff === R_FP || rOff === R_SEC) ? 11 : 9
    for (let c = 2; c <= totalCols; c++) {
      const cell = ws.getCell(rn, c)
      if (!cell.value) { cell.font = { name: 'Calibri', size: sz }; cell.alignment = { horizontal: 'center', vertical: 'middle' } }
    }
  }

  const fpLabel = (seg?: SLDFiberSegment) => seg?.fiberPairs ? \`\${seg.fiberPairs}FP\` : ''
  const cableType = (seg?: SLDFiberSegment) => (seg?.cableType || '').toUpperCase() || 'SA'

  const slaveMap = new Map<string, ColDef>()
  cols.forEach(c => { /* for future use */ })

  for (const c of cols) {
    const r   = (off: number) => startRow + off
    const col = c.col
    switch (c.kind) {
      case 'term': {
        setCell(ws, r(R_FP),   col, null, { font: F_FP })
        setCell(ws, r(R_LAND), col, null, { font: { name: 'Calibri', size: 9 }, border: getBorder('mTLR') })
        setCell(ws, r(R_TYPE), col, c.letter ?? '', { border: getBorder('mLR') })
        setCell(ws, r(R_DIST), col, null, { border: getBorder('mLR') })
        setCell(ws, r(R_ID),   col, c.polarity ? \`(\${c.polarity})\` : '', { border: getBorder('mLR') })
        setCell(ws, r(R_EQUIP),col, null, { border: getBorder('mBLR') })
        setCell(ws, r(R_SEC),  col, null, { font: F_FP })
        break
      }
      case 'approach': {
        const seg = c.segment!
        setCell(ws, r(R_LAND), col, 'LAND')
        setCell(ws, r(R_TYPE), col, null)
        setCell(ws, r(R_DIST), col, seg.length, { font: F_BOLD, border: getBorder('thin') })
        setCell(ws, r(R_ID),   col, null)
        break
      }
      case 'bjb':
        setCell(ws, r(R_EQUIP), col, c.equipment?.name ?? '', { font: F_BOLD })
        break
      case 'first-span': {
        const seg = c.segment!
        setCell(ws, r(R_FP),   col, fpLabel(seg), { font: F_FP })
        setCell(ws, r(R_TYPE), col, \`\${cableType(seg)}(S/E)\`, { font: F_BOLD })
        setCell(ws, r(R_DIST), col, seg.length, { font: F_BOLD, border: getBorder('thin') })
        setCell(ws, r(R_ID),   col, seg.id || \`\${seg.fromName}-\${seg.toName}\`, { font: F_BOLD })
        break
      }
      case 'span': {
        const seg = c.segment!
        setCell(ws, r(R_FP),   col, fpLabel(seg), { font: F_FP })
        setCell(ws, r(R_TYPE), col, cableType(seg), { font: F_BOLD })
        setCell(ws, r(R_DIST), col, seg.length, { font: F_BOLD, border: getBorder('thin') })
        setCell(ws, r(R_ID),   col, seg.id || \`\${seg.fromName}-\${seg.toName}\`, { font: F_BOLD })
        if (c.mergeNext) ws.mergeCells(r(R_DIST), col, r(R_DIST), col + 1)
        break
      }
      case 'equip': {
        setCell(ws, r(R_TYPE), col, null, { border: { left: DOUBLE, right: THIN } })
        setCell(ws, r(R_ID),   col, null, { border: { left: DOUBLE, right: THIN } })
        setCell(ws, r(R_EQUIP),col, c.equipment?.name ?? '', { font: F_BOLD })
        break
      }
      case 'bu': {
        setCell(ws, r(R_DIST), col, c.equipment?.name ?? 'BU', { font: F_BOLD, border: getBorder('mLR') })
        setCell(ws, r(R_EQUIP),col, c.equipment?.name ?? '', { font: F_BOLD })
        break
      }
    }
  }
}

// ═══════════════════════════════════════════════════
// 动态 Drawing XML 生成
// ═══════════════════════════════════════════════════

/**
 * 用模板 + 新位置生成一个 twoCellAnchor XML 块
 * excelCol: 1-indexed Excel 列
 * sectionStartRow: 0-indexed 行偏移（section 起始行）
 * idBase: 形状 ID 起始值（每个 anchor 独立递增）
 */
function fillTemplate(
  tmpl: string,
  fromCol0: number, fromRow0: number,
  toCol0:   number, toRow0:   number,
  idBase:   number,
  name:     string,
): string {
  let result = tmpl
  result = result.replace(/\\{\\{FROM_COL\\}\\}/g, String(fromCol0))
  result = result.replace(/\\{\\{FROM_ROW\\}\\}/g, String(fromRow0))
  result = result.replace(/\\{\\{TO_COL\\}\\}/g,   String(toCol0))
  result = result.replace(/\\{\\{TO_ROW\\}\\}/g,   String(toRow0))
  result = result.replace(/\\{\\{NAME\\}\\}/g, name)
  let idCtr = idBase
  result = result.replace(/\\{\\{ID_\\d+\\}\\}/g, () => String(idCtr++))
  return result
}

/**
 * 根据 layout 生成 drawing1.xml (Trunk sheet) 内容
 */
function generateDrawingXml(layout: ColDef[], sectionStartRow = 0): string {
  const shapes: string[] = []
  let idBase = 100  // 从 100 开始避免与模板 ID 冲突

  for (const c of layout) {
    const excelCol = c.col          // 1-indexed
    const col0     = excelCol - 1   // 0-indexed
    // 设备图形列跨度：形状从 [col-2,0-indexed] 到 [col-1,0-indexed]
    // 即形状 TO = 设备列（0-indexed），FROM = 设备列-1（0-indexed）
    const shapeFromCol = col0 - 1
    const shapeTo      = col0
    const shapeFromRow = sectionStartRow + R_TYPE  // row2 (0-indexed)
    const shapeToRow   = sectionStartRow + R_EQUIP // row5 (0-indexed)

    switch (c.kind) {
      case 'bjb':
      case 'equip': {
        // 深海设备（REP/JOINT/OADM/PFE）或终端 BJB：六边形
        const isTerminalArea = c.kind === 'bjb' || c.equipment?.type === 'PFE'
        const tpl = isTerminalArea ? TPL_TERM_HEX : TPL_REP_HEX
        shapes.push(fillTemplate(
          tpl, shapeFromCol, shapeFromRow, shapeTo, shapeToRow,
          idBase, c.equipment?.name ?? 'equip'
        ))
        idBase += 10
        break
      }
      case 'bu': {
        // BU：标记栏 + 船形图标
        // 标记栏：从 [col-1, rowFP] 到 [col, rowSec]（全高度竖条）
        const markerFromRow = sectionStartRow + R_LAND
        const markerToRow   = sectionStartRow + R_EQUIP
        shapes.push(fillTemplate(
          TPL_BU_MARKER,
          shapeFromCol, markerFromRow, shapeTo, markerToRow,
          idBase, c.equipment?.name ?? 'BU_MARKER'
        ))
        idBase += 5
        // 船形图标：覆盖 rowFP→rowType 行，列同标记栏
        const iconFromRow = sectionStartRow + R_FP
        const iconToRow   = sectionStartRow + R_TYPE
        shapes.push(fillTemplate(
          TPL_BU_ICON,
          shapeFromCol, iconFromRow, shapeTo + 1, iconToRow + 1,
          idBase, c.equipment?.name ?? 'BU_ICON'
        ))
        idBase += 50
        break
      }
      default:
        break
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    ...shapes,
    '</xdr:wsDr>',
  ].join('\\n')
}

// ═══════════════════════════════════════════════════
// jszip 合并：把 ExcelJS xlsx + drawing XML 合成输出
// ═══════════════════════════════════════════════════

/**
 * 向 ExcelJS 生成的 xlsx 注入 drawing XML
 * 需要：
 *  1. 在 xl/drawings/ 目录放入 drawing1.xml
 *  2. 在 xl/drawings/_rels/ 放入 drawing1.xml.rels（空关系）
 *  3. 在 xl/worksheets/_rels/sheet1.xml.rels 添加 drawing 关系
 *  4. 更新 [Content_Types].xml 加入 drawing 类型
 */
async function injectDrawing(xlsxBuf: ArrayBuffer, drawingXml: string): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(xlsxBuf)

  // 1. 写入 drawing1.xml
  zip.file('xl/drawings/drawing1.xml', drawingXml)

  // 2. 写入 drawing1.xml.rels（无子关系）
  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
  )

  // 3. 修改 sheet1.xml.rels，加入 drawing 关系
  const relsPath = 'xl/worksheets/_rels/sheet1.xml.rels'
  let relsXml = ''
  try { relsXml = await zip.file(relsPath)!.async('string') } catch { /* new file */ }
  if (!relsXml || relsXml.trim() === '') {
    relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  }
  const drawingRelId = 'rId_drawing1'
  if (!relsXml.includes(drawingRelId)) {
    relsXml = relsXml.replace(
      '</Relationships>',
      \`<Relationship Id="\${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>\`
    )
    zip.file(relsPath, relsXml)
  }

  // 4. 在 sheet1.xml 中添加 <drawing r:id="..."/> 引用（如尚未存在）
  const sheetPath = 'xl/worksheets/sheet1.xml'
  let sheetXml = await zip.file(sheetPath)!.async('string')
  if (!sheetXml.includes('<drawing')) {
    sheetXml = sheetXml.replace(
      '</worksheet>',
      \`<drawing r:id="\${drawingRelId}"/></worksheet>\`
    )
    zip.file(sheetPath, sheetXml)
  }

  // 5. 更新 [Content_Types].xml
  const ctPath = '[Content_Types].xml'
  let ctXml = await zip.file(ctPath)!.async('string')
  const drawingContentType = 'application/vnd.openxmlformats-officedocument.drawing+xml'
  if (!ctXml.includes(drawingContentType)) {
    ctXml = ctXml.replace(
      '</Types>',
      \`<Override PartName="/xl/drawings/drawing1.xml" ContentType="\${drawingContentType}"/></Types>\`
    )
    zip.file(ctPath, ctXml)
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  return buf
}

// ═══════════════════════════════════════════════════
// 主导出函数
// ═══════════════════════════════════════════════════

export async function exportSLDToExcel(table: SLDTable): Promise<void> {
  // 1. 构建列布局
  const layout = buildLayout(table)

  // 2. ExcelJS 生成单元格数据
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SLD Export'
  wb.created = new Date()
  const ws = wb.addWorksheet('Trunk', { pageSetup: { orientation: 'landscape' } })
  writeSheet(ws, layout, table, 1)

  // 3. 生成 drawing XML（根据真实布局动态定位图形）
  const drawingXml = generateDrawingXml(layout, 0)

  // 4. ExcelJS → ArrayBuffer
  const xlsxBuf = await wb.xlsx.writeBuffer() as ArrayBuffer

  // 5. jszip 注入 drawing XML
  const finalBuf = await injectDrawing(xlsxBuf, drawingXml)

  // 6. 下载
  const blob = new Blob([finalBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  link.href     = url
  link.download = \`SLD_\${table.name.replace(/[^\\w\\u4e00-\\u9fa5]/g, '_')}_\${ts}.xlsx\`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
`;

fs.writeFileSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/src/services/SLDExcelExportService.ts', ts, 'utf8');
const size = fs.statSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/src/services/SLDExcelExportService.ts').size;
console.log('\nWritten SLDExcelExportService.ts:', size, 'bytes (~' + Math.round(size / 1024) + ' KB)');
