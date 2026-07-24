import type * as ExcelJS from 'exceljs'
import type * as SheetJS from 'xlsx'

const EXCEL_IMPORT_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxRows: 100_000,
  maxColumns: 512,
} as const

/**
 * Read the first worksheet of an OOXML workbook and convert it to CSV.
 *
 * ExcelJS is loaded lazily so importing this helper does not pull the fairly
 * large spreadsheet parser into the initial application chunk.  The old
 * SheetJS call sites used the first sheet and omitted completely empty rows;
 * those semantics are intentionally kept here.
 */
export async function readFirstWorksheetAsCsv(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  assertFileSize(arrayBuffer)

  if (isLegacyExcelFile(fileName)) {
    return readLegacyWorksheetAsCsv(arrayBuffer)
  }

  return readOoxmlWorksheetAsCsv(arrayBuffer)
}

async function readOoxmlWorksheetAsCsv(arrayBuffer: ArrayBuffer): Promise<string> {
  const excelJsModule = await import('exceljs')
  const ExcelJSConstructor = excelJsModule.default ?? excelJsModule
  const workbook = new ExcelJSConstructor.Workbook()

  try {
    // ExcelJS's browser typings use Node's Buffer type even though the
    // implementation accepts an ArrayBuffer in browsers.
    const workbookBuffer = arrayBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    await workbook.xlsx.load(workbookBuffer)
  } catch (error) {
    throw new Error(
      `无法读取 .xlsx 文件: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('Excel 文件中没有可读取的工作表')
  }

  assertWorksheetSize(worksheet.rowCount, worksheet.columnCount)
  return worksheetToCsv(worksheet)
}

async function readLegacyWorksheetAsCsv(arrayBuffer: ArrayBuffer): Promise<string> {
  const sheetJsModule = await import('xlsx')
  const SheetJSReader = sheetJsModule.default ?? sheetJsModule

  let workbook: SheetJS.WorkBook
  try {
    workbook = SheetJSReader.read(arrayBuffer, {
      type: 'array',
      // Read one extra row so an oversized legacy sheet is rejected instead
      // of being silently truncated.
      sheetRows: EXCEL_IMPORT_LIMITS.maxRows + 1,
    })
  } catch (error) {
    throw new Error(`无法读取 .xls 文件: ${error instanceof Error ? error.message : String(error)}`)
  }

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('Excel 文件中没有可读取的工作表')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const dimensions = getSheetJsDimensions(worksheet, SheetJSReader.utils.decode_range)
  assertWorksheetSize(dimensions.rows, dimensions.columns)

  return SheetJSReader.utils.sheet_to_csv(worksheet, {
    blankrows: false,
    strip: false,
  })
}

/**
 * Convert a worksheet to CSV while retaining the values users see in cells.
 * The function is exported separately to keep the conversion deterministic
 * and straightforward to verify without involving browser File APIs.
 */
function worksheetToCsv(worksheet: ExcelJS.Worksheet): string {
  const rowCount = worksheet.rowCount
  const columnCount = worksheet.columnCount
  const lines: string[] = []

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const values: string[] = []
    let hasValue = false

    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      const cell = row.getCell(columnNumber)

      // ExcelJS exposes non-master cells of a merged range as Merge values.
      // SheetJS emits the value only once, in the top-left cell.
      const isMergedChild = cell.isMerged && cell.master.address !== cell.address
      const value = isMergedChild ? '' : cellValueToText(cell.value, cell)
      if (value !== '') hasValue = true
      values.push(escapeCsvField(value))
    }

    // Match sheet_to_csv({ blankrows: false }): do not emit wholly empty rows.
    if (hasValue) lines.push(values.join(','))
  }

  return lines.join('\n')
}

function cellValueToText(value: ExcelJS.CellValue, cell: ExcelJS.Cell): string {
  if (value === null || value === undefined) return ''

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (isFormulaValue(value)) {
    return cellValueToText(value.result, cell)
  }

  if (isRichTextValue(value)) {
    return value.richText.map(part => part.text).join('')
  }

  if (isHyperlinkValue(value)) {
    return value.text
  }

  if (isErrorValue(value)) {
    return value.error
  }

  // `cell.text` covers any value kinds added by a newer ExcelJS release while
  // keeping the fallback harmless for an empty value.
  return cell.text || ''
}

function isFormulaValue(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return isRecord(value) && ('formula' in value || 'sharedFormula' in value)
}

function isRichTextValue(value: ExcelJS.CellValue): value is ExcelJS.CellRichTextValue {
  const candidate = value as unknown as Record<string, unknown>
  return Array.isArray(candidate.richText)
}

function isHyperlinkValue(value: ExcelJS.CellValue): value is ExcelJS.CellHyperlinkValue {
  const candidate = value as unknown as Record<string, unknown>
  return typeof candidate.text === 'string' && typeof candidate.hyperlink === 'string'
}

function isErrorValue(value: ExcelJS.CellValue): value is ExcelJS.CellErrorValue {
  const candidate = value as unknown as Record<string, unknown>
  return typeof candidate.error === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function escapeCsvField(value: string): string {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function isLegacyExcelFile(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith('.xls')
}

function assertFileSize(arrayBuffer: ArrayBuffer): void {
  if (arrayBuffer.byteLength > EXCEL_IMPORT_LIMITS.maxFileBytes) {
    throw new Error(`Excel 文件不能超过 ${EXCEL_IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB`)
  }
}

function assertWorksheetSize(rows: number, columns: number): void {
  if (rows > EXCEL_IMPORT_LIMITS.maxRows) {
    throw new Error(`Excel 工作表不能超过 ${EXCEL_IMPORT_LIMITS.maxRows.toLocaleString()} 行`)
  }
  if (columns > EXCEL_IMPORT_LIMITS.maxColumns) {
    throw new Error(`Excel 工作表不能超过 ${EXCEL_IMPORT_LIMITS.maxColumns} 列`)
  }
}

function getSheetJsDimensions(
  worksheet: SheetJS.WorkSheet,
  decodeRange: typeof SheetJS.utils.decode_range,
): { rows: number; columns: number } {
  const sheetMetadata = worksheet as SheetJS.WorkSheet & { '!fullref'?: string }
  const rangeReference = sheetMetadata['!fullref'] || sheetMetadata['!ref']
  if (!rangeReference) return { rows: 0, columns: 0 }

  const range = decodeRange(rangeReference)
  return {
    rows: range.e.r - range.s.r + 1,
    columns: range.e.c - range.s.c + 1,
  }
}
