const fs = require('fs')
const path = require('path')
const ExcelJS = require('exceljs')
const JSZip = require('jszip')

const SECTION_SPACING = 16
const EQUIPMENT_ROW_OFFSET = 5 // zero-based offset within section, i.e. Excel row +6

function classifyShape(xml) {
  if (/prst=\"line\"/.test(xml)) return 'CENTER_LINE'
  if (/diagCross/.test(xml) && /(1D4ED8|3B82F6)/.test(xml)) return 'EQ_BLUE'
  if (/diagCross/.test(xml) && /(B91C1C|EF4444)/.test(xml)) return 'EQ_RED'
  if (/prst=\"snip2SameRect\"/.test(xml) || /<a:glow\b/.test(xml)) return 'BU_ICON'
  if (/alpha val=\"20000\"/.test(xml) && /prst=\"rect\"/.test(xml)) return 'BU_MARKER'
  if (/prst=\"diamond\"/.test(xml) && /<a:noFill\/>/.test(xml)) return 'JB_HOLLOW'
  if (/prst=\"triangle\"/.test(xml)) return 'BOWTIE_TRI'
  if (/FF0000/.test(xml) && /prst=\"rect\"/.test(xml)) return 'OADM_BAR'
  if (/a:custGeom/.test(xml) && /<a:srgbClr val=\"FFFFFF\"\/>/.test(xml)) return 'TERM_HEX'
  if (/a:custGeom/.test(xml) && /<a:srgbClr val=\"000000\"\/>/.test(xml)) return 'REP_HEX'
  return 'OTHER'
}

function parseAnchors(drawingXml) {
  const anchors = []
  const anchorRe = /<xdr:twoCellAnchor>[\s\S]*?<\/xdr:twoCellAnchor>/g
  let match
  while ((match = anchorRe.exec(drawingXml)) !== null) {
    const xml = match[0]
    const from = xml.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
    const to = xml.match(/<xdr:to>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
    if (!from || !to) continue
    const fromCol = Number(from[1])
    const fromRow = Number(from[2])
    const toCol = Number(to[1])
    const toRow = Number(to[2])
    anchors.push({
      fromCol,
      fromRow,
      toCol,
      toRow,
      section: Math.floor(fromRow / SECTION_SPACING),
      excelCol: toCol + 1,
      shape: classifyShape(xml),
    })
  }
  return anchors
}

async function parseWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.getWorksheet('Trunk') || workbook.worksheets[0]
  if (!sheet) {
    throw new Error(`No worksheet found in ${filePath}`)
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const drawingXml = await zip.file('xl/drawings/drawing1.xml')?.async('string')
  const anchors = drawingXml ? parseAnchors(drawingXml) : []
  const maxSectionFromShapes = anchors.length ? Math.max(...anchors.map(anchor => anchor.section)) : 0

  const labelsByKey = new Map()
  for (let section = 0; section <= maxSectionFromShapes + 1; section += 1) {
    const rowNum = 1 + section * SECTION_SPACING + EQUIPMENT_ROW_OFFSET
    const row = sheet.getRow(rowNum)
    if (!row) continue
    for (let col = 2; col <= 200; col += 1) {
      const raw = row.getCell(col).value
      const label = typeof raw === 'string' ? raw.trim() : ''
      if (!label) continue
      labelsByKey.set(`${section}:${col}`, label)
    }
  }

  const groupedByColumn = new Map()
  for (const anchor of anchors) {
    const key = `${anchor.section}:${anchor.excelCol}`
    const list = groupedByColumn.get(key) || []
    list.push(anchor.shape)
    groupedByColumn.set(key, list)
  }

  const rows = []
  for (const [key, shapes] of groupedByColumn.entries()) {
    const [sectionStr, colStr] = key.split(':')
    const section = Number(sectionStr)
    const col = Number(colStr)
    const label = labelsByKey.get(key) || ''
    const sortedShapes = [...new Set(shapes)].sort()
    rows.push({
      section,
      col,
      label,
      shapeSignature: sortedShapes.join('+'),
      shapeCount: shapes.length,
    })
  }

  rows.sort((a, b) => a.section - b.section || a.col - b.col)
  return { filePath, rows, anchorCount: anchors.length }
}

function printSummary(result) {
  console.log(`\n=== ${result.filePath} ===`)
  console.log(`anchors: ${result.anchorCount}`)
  for (const row of result.rows) {
    console.log(
      `[S${row.section + 1} C${row.col}] ${row.label || '(no-label)'} -> ${row.shapeSignature} (${row.shapeCount})`,
    )
  }

  const jointNames = new Set(['BJB', 'SEJB', 'BUJB', 'SJB', 'FJB', 'LIJB'])
  const jointRows = result.rows.filter(row => jointNames.has(row.label))
  if (jointRows.length) {
    console.log('joint signatures:')
    for (const row of jointRows) {
      console.log(`  ${row.label}: ${row.shapeSignature}`)
    }
  }
}

function diffSummaries(a, b) {
  const mapA = new Map(a.rows.map(row => [row.label, row.shapeSignature]))
  const mapB = new Map(b.rows.map(row => [row.label, row.shapeSignature]))
  const labels = [...new Set([...mapA.keys(), ...mapB.keys()])].sort()
  console.log(`\n=== label signature diff ===`)
  for (const label of labels) {
    if (!label) continue
    const sa = mapA.get(label) || '(missing)'
    const sb = mapB.get(label) || '(missing)'
    if (sa !== sb) {
      console.log(`${label}: sample=${sa} | export=${sb}`)
    }
  }
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length < 1) {
    console.error('Usage: node scripts/analyze_sld_shapes.cjs <xlsx1> [xlsx2]')
    process.exit(1)
  }
  const resolved = files.map(file => path.resolve(file))
  const results = []
  for (const file of resolved) {
    if (!fs.existsSync(file)) {
      throw new Error(`File not found: ${file}`)
    }
    results.push(await parseWorkbook(file))
  }
  results.forEach(printSummary)
  if (results.length >= 2) {
    diffSummaries(results[0], results[1])
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
