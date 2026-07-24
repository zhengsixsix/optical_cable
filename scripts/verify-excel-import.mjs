import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import ExcelJS from 'exceljs'
import * as SheetJS from 'xlsx'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Keep the temporary module under the project so Node's package resolver can
// find the workspace's `exceljs` dependency from the compiled helper.
const temporaryDirectory = await mkdtemp(join(projectRoot, '.excel-import-test-'))
const compiledUtility = join(temporaryDirectory, 'excelWorkbook.mjs')

try {
  // Compile the TypeScript helper in isolation so this check exercises the
  // same implementation used by the Vue components without requiring a test
  // runner or a second spreadsheet parser.
  await build({
    entryPoints: [join(projectRoot, 'src/utils/excelWorkbook.ts')],
    outfile: compiledUtility,
    bundle: true,
    external: ['exceljs'],
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })

  const { readFirstWorksheetAsCsv } = await import(pathToFileURL(compiledUtility).href)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('RPL')

  worksheet.addRow([
    'Header',
    'comma,value',
    'quote "value"',
    'line\nbreak',
    42,
    true,
    false,
    null,
    new Date(Date.UTC(2024, 0, 2, 3, 4, 5)),
  ])
  worksheet.getCell('J1').value = { formula: 'E1*2', result: 84 }
  worksheet.addRow([null, null, null, null, null, null, null, null, null, null])
  worksheet.addRow(['tail'])
  worksheet.mergeCells('A4:B4')
  worksheet.getCell('A4').value = 'merged'

  const workbookBuffer = await workbook.xlsx.writeBuffer()
  const csv = await readFirstWorksheetAsCsv(workbookBuffer, 'fixture.xlsx')
  assert.equal(
    csv,
    'Header,"comma,value","quote ""value""","line\nbreak",42,true,false,,2024-01-02T03:04:05.000Z,84\n' +
      'tail,,,,,,,,,\n' +
      'merged,,,,,,,,,',
    'numbers, strings, dates, formulas, empty cells, blank rows, and CSV escaping should be preserved',
  )
  assert.equal(csv.includes('\n\n'), false, 'completely empty rows should be omitted')

  // Keep the legacy BIFF path covered as well.  This is intentionally a real
  // .xls payload rather than an OOXML file with a different extension.
  const legacyWorksheet = SheetJS.utils.aoa_to_sheet([
    ['Pos No.', 'Event', 'Distance'],
    [1, 'Start', 0],
    [2, 'End', 12.5],
  ])
  const legacyWorkbook = SheetJS.utils.book_new()
  SheetJS.utils.book_append_sheet(legacyWorkbook, legacyWorksheet, 'RPL')
  const legacyBuffer = SheetJS.write(legacyWorkbook, { bookType: 'xls', type: 'buffer' })
  const legacyCsv = await readFirstWorksheetAsCsv(legacyBuffer, 'fixture.xls')
  assert.equal(legacyCsv, 'Pos No.,Event,Distance\n1,Start,0\n2,End,12.5', 'legacy .xls import should remain supported')

  const oversizedBuffer = new ArrayBuffer(20 * 1024 * 1024 + 1)
  await assert.rejects(
    () => readFirstWorksheetAsCsv(oversizedBuffer, 'oversized.xlsx'),
    /不能超过 20 MB/,
    'oversized workbooks should be rejected before parsing',
  )

  const wideWorkbook = new ExcelJS.Workbook()
  wideWorkbook.addWorksheet('Wide').getCell(1, 513).value = 'too wide'
  const wideBuffer = await wideWorkbook.xlsx.writeBuffer()
  await assert.rejects(
    () => readFirstWorksheetAsCsv(wideBuffer, 'wide.xlsx'),
    /不能超过 512 列/,
    'workbooks with excessive column counts should be rejected',
  )

  const tallWorkbook = new ExcelJS.Workbook()
  tallWorkbook.addWorksheet('Tall').getCell(100_001, 1).value = 'too tall'
  const tallBuffer = await tallWorkbook.xlsx.writeBuffer()
  await assert.rejects(
    () => readFirstWorksheetAsCsv(tallBuffer, 'tall.xlsx'),
    /不能超过 100,000 行/,
    'workbooks with excessive row counts should be rejected',
  )

  console.log('Excel import verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
