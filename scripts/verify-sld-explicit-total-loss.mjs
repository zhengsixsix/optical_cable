import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(projectRoot, '.sld-export-test-'))
const compiledService = join(temporaryDirectory, 'SLDExportService.mjs')

function createTable(totalLoss) {
  const now = new Date('2026-07-23T00:00:00.000Z')
  return {
    id: 'sld-explicit-loss',
    name: 'Explicit total loss',
    routeId: '',
    equipments: [
      { id: 'tx', sequence: 1, name: 'Tx', type: 'TE', kp: 0 },
      { id: 'rx', sequence: 2, name: 'Rx', type: 'TE', kp: 100 },
    ],
    fiberSegments: [{
      id: 'span-1',
      sequence: 1,
      fromEquipmentId: 'tx',
      toEquipmentId: 'rx',
      fromName: 'Tx',
      toName: 'Rx',
      length: 100,
      fiberPairs: 2,
      fiberPairType: 'working',
      cableType: 'LW',
      attenuation: 0.17,
      ...(totalLoss === undefined ? {} : { totalLoss }),
      remarks: '',
    }],
    transmissionParams: { designCapacity: 20 },
    metadata: {
      totalLength: 100,
      totalFiberPairs: 2,
      exportTemplateVersion: 'standard-v2026.04',
    },
    createdAt: now,
    updatedAt: now,
  }
}

try {
  await build({
    entryPoints: [join(projectRoot, 'src/services/SLDExportService.ts')],
    outfile: compiledService,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })

  const { exportToXML } = await import(pathToFileURL(compiledService).href)
  const missingXml = exportToXML(createTable(undefined))
  assert.doesNotMatch(missingXml, /key="TotalLoss"/, 'missing totalLoss must stay absent')

  const explicitXml = exportToXML(createTable(17.25))
  assert.match(explicitXml, /<Param key="TotalLoss" value="17\.25" \/>/)

  const source = await readFile(join(projectRoot, 'src/services/SLDExportService.ts'), 'utf8')
  assert.doesNotMatch(source, /parseFromXML|exportEquipmentsToCSV/, 'unused SLD import and CSV helpers must stay removed')
  assert.doesNotMatch(source, /length\s*\*\s*[^\n]*attenuation|attenuation\s*\*\s*[^\n]*length/)

  console.log('SLD explicit total loss verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
