import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(projectRoot, '.gis-attachment-test-'))
const compiledUtility = join(temporaryDirectory, 'GisAttachmentParser.mjs')

try {
  await build({
    entryPoints: [join(projectRoot, 'src/services/GisAttachmentParser.ts')],
    outfile: compiledUtility,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })

  const { parseShapefileAttachment } = await import(pathToFileURL(compiledUtility).href)

  const pointShp = createPointShapefile(120.5, 30.25)
  const shapefile = await parseShapefileAttachment(new Blob([pointShp]), '冷水珊瑚.shp')
  assert.equal(shapefile.type, 'FeatureCollection')
  assert.equal(shapefile.features.length, 1)
  assert.deepEqual(shapefile.features[0].geometry.coordinates, [120.5, 30.25])

  console.log('Shapefile attachment parsing verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}

function createPointShapefile(longitude, latitude) {
  const buffer = new ArrayBuffer(128)
  const view = new DataView(buffer)
  view.setInt32(0, 9994, false)
  view.setInt32(24, 64, false)
  view.setInt32(28, 1000, true)
  view.setInt32(32, 1, true)
  view.setFloat64(36, longitude, true)
  view.setFloat64(44, latitude, true)
  view.setFloat64(52, longitude, true)
  view.setFloat64(60, latitude, true)
  view.setInt32(100, 1, false)
  view.setInt32(104, 10, false)
  view.setInt32(108, 1, true)
  view.setFloat64(112, longitude, true)
  view.setFloat64(120, latitude, true)
  return buffer
}
