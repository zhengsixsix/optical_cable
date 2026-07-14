import fs from 'node:fs'
import path from 'node:path'

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

expectIncludes(mapStore, "ref<Projection>('EPSG:3857')", 'map store default projection')
expectNotIncludes(mapArea, "projection: 'EPSG:4326'", 'planning map view projection')
expectIncludes(mapArea, 'toMapCoordinate(', 'planning map coordinate projection helper')
expectIncludes(mapArea, 'fromMapCoordinate(', 'planning map coordinate inverse helper')
expectNotIncludes(mapSelectDialog, "projection: 'EPSG:4326'", 'map select dialog view projection')
expectIncludes(mapSelectDialog, 'toMapCoordinate(', 'map select coordinate projection helper')
expectIncludes(mapSelectDialog, 'fromMapCoordinate(', 'map select coordinate inverse helper')

console.log('map display projection verification passed')
