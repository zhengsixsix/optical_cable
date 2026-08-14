import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`)
  }
}

function expectNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label}: did not expect to find ${needle}`)
  }
}

const mapStore = read('src/stores/map.ts')
const mapArea = read('src/modules/planning/components/MapArea.vue')
const mapSelectDialog = read('src/modules/planning/dialogs/MapSelectDialog.vue')
const systemDesignMap = read('src/modules/design/components/SystemDesignMap.vue')
const monitoringMap = read('src/modules/monitoring/components/MonitoringMap.vue')
const mars3dPlanningAdapter = read('src/modules/planning/map/Mars3dPlanningAdapter.ts')

expectIncludes(mapStore, "ref<Projection>('EPSG:3857')", 'map store default projection')
expectNotIncludes(mapArea, "projection: 'EPSG:4326'", 'planning map view projection')
expectIncludes(mapArea, 'toMapCoordinate(', 'planning map coordinate projection helper')
expectIncludes(mapArea, 'fromMapCoordinate(', 'planning map coordinate inverse helper')
expectNotIncludes(mapSelectDialog, "projection: 'EPSG:4326'", 'map select dialog view projection')
expectIncludes(mapSelectDialog, 'toMapCoordinate(', 'map select coordinate projection helper')
expectIncludes(mapSelectDialog, 'fromMapCoordinate(', 'map select coordinate inverse helper')
expectIncludes(systemDesignMap, 'normalizeLonLatCoordinate(', 'system design map longitude normalization')
expectIncludes(monitoringMap, 'normalizeLonLatCoordinate(', 'monitoring map longitude normalization')
expectIncludes(mars3dPlanningAdapter, 'normalizeLonLatCoordinate(', '3D planning map longitude normalization')

const outFile = path.join(root, '.map-projection-test.mjs')
await build({
  entryPoints: [path.join(root, 'src/utils/mapProjection.ts')],
  outfile: outFile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})

try {
  const { normalizeLongitude, fromMapCoordinate } = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`)
  const cases = [
    [275, -85],
    [-275, 85],
    [180, -180],
    [-180, -180],
    [540, -180],
    [-540, -180],
    [720, 0],
  ]
  for (const [input, expected] of cases) {
    if (normalizeLongitude(input) !== expected) {
      throw new Error(`longitude ${input} should normalize to ${expected}`)
    }
  }
  const [longitude, latitude] = fromMapCoordinate([275, 40], 'EPSG:4326')
  if (longitude !== -85 || latitude !== 40) {
    throw new Error('EPSG:4326 map coordinates must normalize wrapped longitudes')
  }
} finally {
  fs.rmSync(outFile, { force: true })
}

console.log('map display projection verification passed')
