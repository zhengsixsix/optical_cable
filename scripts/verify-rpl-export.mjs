import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import ExcelJS from 'exceljs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(projectRoot, '.rpl-export-test-'))
const compiledService = join(temporaryDirectory, 'RPLExportService.mjs')

const metadata = {
  totalLength: 15,
  totalCableLength: 15,
  landingStations: 1,
  repeaters: 0,
  branchingUnits: 0,
  joints: 0,
  averageDepth: 150,
  maxDepth: 200,
  minDepth: 100,
}

async function readRplWorksheet(exportToExcel, table) {
  const blob = await exportToExcel(table)
  assert.ok(blob instanceof Blob, 'RPL export should return a Blob')
  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'RPL export should retain the XLSX MIME type',
  )
  assert.ok(blob.size > 0, 'RPL export should produce workbook bytes')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const worksheet = workbook.getWorksheet('RPL')
  assert.ok(worksheet, 'the exported workbook should contain the RPL worksheet')
  return worksheet
}

try {
  await build({
    entryPoints: [join(projectRoot, 'src/services/RPLExportService.ts')],
    outfile: compiledService,
    bundle: true,
    external: ['exceljs'],
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })

  const { exportToExcel } = await import(pathToFileURL(compiledService).href)
  const createdAt = new Date(Date.UTC(2026, 6, 23, 1, 2, 3))
  const explicitTable = {
    id: 'table-explicit',
    name: 'Explicit RPL fields',
    routeId: '',
    records: [
      {
        id: 'point-1', sequence: 1, kp: 0,
        longitude: 120, latitude: 30, depth: 100,
        pointType: 'landing', cableType: 'SA',
        segmentLength: 0, cumulativeLength: 0, slack: 0.5, burialDepth: 1,
        remarks: 'basic start remark',
        event: 'Start',
        routeDistanceCumulative: 0,
        cableDistanceCumulative: 0,
        approxDepth: 110,
        additionalFeatures: 'explicit start feature',
      },
      {
        id: 'point-2', sequence: 2, kp: 15,
        longitude: 120.1, latitude: 30.1, depth: 200,
        pointType: 'waypoint', cableType: 'LW',
        segmentLength: 15, cumulativeLength: 15, slack: 1, burialDepth: 2,
        remarks: 'basic end remark',
        event: 'End',
        routeDistanceBetween: 12.25,
        routeDistanceCumulative: 12.25,
        slackPercent: 1.75,
        cableDistanceBetween: 12.5,
        cableDistanceCumulative: 12.5,
        approxDepth: 210,
        targetBurialDepth: 2.4,
        additionalFeatures: 'explicit end feature',
      },
    ],
    metadata,
    createdAt,
    updatedAt: createdAt,
  }

  const worksheet = await readRplWorksheet(exportToExcel, explicitTable)
  assert.equal(worksheet.getCell('AE1').value, 'Planned')
  assert.equal(worksheet.getCell('A7').value, 1)
  assert.equal(worksheet.getCell('B7').value, 'Start')
  assert.equal(worksheet.getCell('C7').value, 30)
  assert.equal(worksheet.getCell('F7').value, 120)
  assert.equal(worksheet.getCell('AD7').value, 110)
  assert.equal(worksheet.getCell('AF7').value, 'explicit start feature')
  assert.equal(worksheet.getCell('V8').value, 12.25)
  assert.equal(worksheet.getCell('X8').value, 1.75)
  assert.equal(worksheet.getCell('Y8').value, 12.5)
  assert.equal(worksheet.getCell('AA8').value, 'LW')
  assert.equal(worksheet.getCell('AE8').value, 2.4)
  assert.equal(worksheet.getCell('A9').value, 2)
  assert.equal(worksheet.getCell('B9').value, 'End')
  assert.equal(worksheet.getCell('W9').value, 12.25)
  assert.equal(worksheet.getCell('Z9').value, 12.5)
  assert.equal(worksheet.getCell('AD9').value, 210)
  assert.equal(worksheet.getCell('AF9').value, 'explicit end feature')

  const basicOnlyTable = {
    ...explicitTable,
    id: 'table-basic-only',
    name: 'No industry fallbacks',
    records: [
      {
        id: 'basic-1', sequence: 1, kp: 0,
        longitude: 120, latitude: 30, depth: 100,
        pointType: 'landing', cableType: 'SA',
        segmentLength: 0, cumulativeLength: 0, slack: 0.5, burialDepth: 1,
        remarks: 'must not reach industry columns',
      },
      {
        id: 'basic-2', sequence: 2, kp: 15,
        longitude: 120.1, latitude: 30.1, depth: 200,
        pointType: 'waypoint', cableType: 'LW',
        segmentLength: 15, cumulativeLength: 15, slack: 1, burialDepth: 2,
        remarks: 'must not reach industry columns',
      },
    ],
  }
  const basicWorksheet = await readRplWorksheet(exportToExcel, basicOnlyTable)
  for (const cell of ['B7', 'AD7', 'AF7', 'V8', 'X8', 'Y8', 'AE8', 'W9', 'Z9', 'AD9', 'AF9']) {
    assert.equal(basicWorksheet.getCell(cell).value, null, `${cell} should stay blank without an explicit industry field`)
  }

  console.log('RPL export verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
