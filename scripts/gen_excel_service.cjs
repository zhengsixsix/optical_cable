/**
 * 从 sld_data.json 生成 SLDExcelExportService.ts
 */
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/scripts/sld_data.json', 'utf8'));

// 找出 Trunk 和 Branch 两个 sheet 的数据
const trunkKey = Object.keys(raw).find(k => k.includes('Trunk')) || 'Trunk';
const branchKey = Object.keys(raw).find(k => k.includes('Branch')) || 'Branch';
const trunkData = raw[trunkKey] || [];
const branchData = raw[branchKey] || [];

// 计算每个 sheet 最大列数
const maxTrunkCol = Math.max(...trunkData.map(e => e.c));
const maxBranchCol = Math.max(...branchData.map(e => e.c));
const maxTrunkRow = Math.max(...trunkData.map(e => e.r));
const maxBranchRow = Math.max(...branchData.map(e => e.r));

console.log(`Trunk: ${trunkData.length} cells, maxRow=${maxTrunkRow}, maxCol=${maxTrunkCol}`);
console.log(`Branch: ${branchData.length} cells, maxRow=${maxBranchRow}, maxCol=${maxBranchCol}`);

// 生成 TypeScript 服务文件
const tsContent = `/**
 * SLD Excel 导出服务 - 硬编码示例数据版
 * 数据直接来源于 SLD示例.xlsx，格式/样式与示例文件完全一致
 */
import * as ExcelJS from 'exceljs'

// ──────────────────────────────────────────────────
// 示例数据类型
// ──────────────────────────────────────────────────
interface CellEntry {
  r: number    // 行号
  c: number    // 列号
  v: unknown   // 值 (null = 空 或 slave)
  bold?: 1     // 粗体
  sz?: number  // 字体大小 (默认9)
  bdr?: string // 边框代码
  slave?: 1    // 合并单元格 slave（对应 master 在同行 c-1）
}

// ──────────────────────────────────────────────────
// 硬编码数据：Trunk sheet
// ──────────────────────────────────────────────────
const TRUNK_DATA: CellEntry[] = ${JSON.stringify(trunkData)};

// ──────────────────────────────────────────────────
// 硬编码数据：Branch sheet
// ──────────────────────────────────────────────────
const BRANCH_DATA: CellEntry[] = ${JSON.stringify(branchData)};

// ──────────────────────────────────────────────────
// 样式辅助
// ──────────────────────────────────────────────────
const THIN   = { style: 'thin'   as const }
const MEDIUM = { style: 'medium' as const }
const DOUBLE = { style: 'double' as const }

function getBorder(bdr?: string): Partial<ExcelJS.Borders> | undefined {
  if (!bdr) return undefined
  switch (bdr) {
    case 'thin':     return { top: THIN, bottom: THIN, left: THIN, right: THIN }
    case 'thinDL':   return { top: THIN, bottom: THIN, left: DOUBLE, right: THIN }
    case 'dLtR':     return { left: DOUBLE, right: THIN }
    case 'mLR':      return { left: MEDIUM, right: MEDIUM }
    case 'mTLR':     return { top: MEDIUM, left: MEDIUM, right: MEDIUM }
    case 'mBLR':     return { bottom: MEDIUM, left: MEDIUM, right: MEDIUM }
    case 'thinPart': return { top: THIN, bottom: THIN }
    default: return undefined
  }
}

function writeSheet(ws: ExcelJS.Worksheet, data: CellEntry[], maxCol: number) {
  // 统一列宽
  for (let c = 1; c <= maxCol + 2; c++) {
    ws.getColumn(c).width = 9.36328125
  }

  // 建立 slave 位置索引 key="r,c"
  const slaveMap = new Map<string, CellEntry>()
  data.forEach(e => { if (e.slave) slaveMap.set(\`\${e.r},\${e.c}\`, e) })

  // 写入每个非 slave 单元格；slave 通过 mergeCells 处理
  for (const e of data) {
    if (e.slave) continue

    const cell = ws.getCell(e.r, e.c)
    if (e.v !== null && e.v !== undefined) cell.value = e.v as ExcelJS.CellValue
    cell.font      = { name: 'Calibri', size: e.sz ?? 9, bold: !!e.bold }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }

    // 检查右侧是否有 slave → 创建合并
    const slaveEntry = slaveMap.get(\`\${e.r},\${e.c + 1}\`)
    if (slaveEntry) {
      // 合并 master:slave（同行，两列）
      ws.mergeCells(e.r, e.c, e.r, e.c + 1)
      // 合并后边框：left 取 master，right 取 slave 的 right
      const mb = getBorder(e.bdr)
      const sb = getBorder(slaveEntry.bdr)
      cell.border = {
        top:    mb?.top    ?? sb?.top,
        bottom: mb?.bottom ?? sb?.bottom,
        left:   mb?.left,
        right:  sb?.right  ?? mb?.right,
      }
    } else {
      const border = getBorder(e.bdr)
      if (border) cell.border = border
    }
  }

  // 行高
  const maxRow = Math.max(...data.map(e => e.r))
  for (let r = 1; r <= maxRow; r++) ws.getRow(r).height = 13.5
}

// ──────────────────────────────────────────────────
// 主导出函数
// ──────────────────────────────────────────────────
export async function exportSLDToExcel(_table?: unknown): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SLD Export'
  wb.created = new Date()

  const wsTrunk = wb.addWorksheet('Trunk', { pageSetup: { orientation: 'landscape' } })
  writeSheet(wsTrunk, TRUNK_DATA, ${maxTrunkCol})

  const wsBranch = wb.addWorksheet('Branch', { pageSetup: { orientation: 'landscape' } })
  writeSheet(wsBranch, BRANCH_DATA, ${maxBranchCol})

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  link.href     = url
  link.download = \`SLD_\${ts}.xlsx\`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
`;

fs.writeFileSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/src/services/SLDExcelExportService.ts', tsContent, 'utf8');
console.log('Written: SLDExcelExportService.ts');
console.log('File size:', fs.statSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/src/services/SLDExcelExportService.ts').size, 'bytes');
