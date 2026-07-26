import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(projectRoot, '.sld-export-test-'))
const compiledService = join(temporaryDirectory, 'SLDExportService.mjs')
const compiledExistingDataService = join(temporaryDirectory, 'SLDExistingDataService.mjs')

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
  await build({
    entryPoints: [join(projectRoot, 'src/services/SLDExistingDataService.ts')],
    outfile: compiledExistingDataService,
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

  const { buildSLDExistingDataDraft } = await import(pathToFileURL(compiledExistingDataService).href)
  const route = {
    id: 'route-with-repeater',
    name: 'Route with repeater',
    points: [
      { id: 'landing-a', coordinates: [120, 30], type: 'landing', name: 'A' },
      { id: 'landing-b', coordinates: [121, 31], type: 'landing', name: 'B' },
    ],
    segments: [{
      id: 'route-span',
      startPointId: 'landing-a',
      endPointId: 'landing-b',
      length: 100,
      cableType: 'SA',
    }],
    totalLength: 100,
    cost: {},
    risk: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const draft = buildSLDExistingDataDraft(route, [{
    id: 'rep-1',
    name: 'REP-1',
    type: 'amplifier_e',
    kp: 50,
    longitude: 120.5,
    latitude: 30.5,
    depth: 2000,
    status: 'planned',
    specifications: 'AMP-X',
    remarks: '',
  }], route.id)
  assert.equal(draft.equipments.length, 3)
  assert.deepEqual(
    draft.fiberSegments.map(segment => [
      segment.fromKey,
      segment.toKey,
      segment.data.length,
      segment.data.cableType,
    ]),
    [
      ['route-point:landing-a', 'connector:rep-1', 50, 'SA'],
      ['connector:rep-1', 'route-point:landing-b', 50, 'SA'],
    ],
    'an intermediate system device must split the route span instead of creating an overlapping direct span',
  )

  const snakeCaseKpDraft = buildSLDExistingDataDraft({
    ...route,
    id: 'route-snake-case-kp',
    points: [
      route.points[0],
      {
        id: 'route-repeater',
        coordinates: [120.5, 30.5],
        type: 'repeater',
        name: 'Route REP',
        position_km: 50,
      },
      route.points[1],
    ],
    segments: [],
  })
  assert.deepEqual(
    snakeCaseKpDraft.equipments.map(equipment => equipment.data.kp),
    [0, 50, 100],
    'backend snake_case KP extensions must be retained in the SLD',
  )

  console.log('SLD explicit total loss verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
