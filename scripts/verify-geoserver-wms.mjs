import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = process.cwd()
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

function expectMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message)
}

function expectNoMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message)
}

const config = read('src/config/geoserver.ts')
const platformApi = read('src/services/platform/api.ts')
const platformTypes = read('src/services/platform/types.ts')
const layerSelection = read('src/services/platform/planLayerSelection.ts')
const layerStore = read('src/stores/layer.ts')
const layerControl = read('src/modules/planning/panels/LayerControl.vue')
const adminLayers = read('src/modules/admin/views/AdminLayersView.vue')
const mapArea = read('src/modules/planning/components/MapArea.vue')
const viteConfig = read('vite.config.ts')
const defaultLayerLoader = layerStore.slice(
  layerStore.indexOf('async function loadPlatformDefaultLayers'),
  layerStore.indexOf('async function loadPlatformProjectLayers'),
)
const projectLayerLoader = layerStore.slice(
  layerStore.indexOf('async function loadPlatformProjectLayers'),
  layerStore.indexOf('\n\n  return {'),
)

expectMatch(config, /VITE_GEOSERVER_WMS_URL/, 'GeoServer URL must be environment-configurable')
expectMatch(config, /DEFAULT_GEOSERVER_WMS_URL = '\/geoserver\/geo\/wms'/, 'default WMS URL must be same-origin')
expectNoMatch(config, /WCMC008|earthQuakeData|Ship_area/, 'WMS layer names must not be hardcoded')
expectMatch(viteConfig, /GEOSERVER_PROXY_PATH = '\/geoserver'/, 'Vite must proxy the same-origin GeoServer path')
expectMatch(viteConfig, /DEFAULT_GEOSERVER_PROXY_TARGET = 'http:\/\/47\.92\.110\.176:8960'/, 'GeoServer proxy target is incorrect')
expectMatch(platformTypes, /geoLayerName\?: string \| null/, 'PlanLayer must expose geoLayerName')
expectMatch(
  platformApi,
  /searchSysDefault:[\s\S]*?URLSearchParams[\s\S]*?\/plan\/planLayer\/searchSysDefault\?\$\{query\}/,
  'platform API must expose the system-default layer query',
)
expectMatch(layerSelection, /layer\?\.geoLayerName\?\.trim\(\)/, 'GeoServer names must come from response geoLayerName')
expectMatch(defaultLayerLoader, /platformPlanLayerApi\.searchSysDefault\(\)/, 'default-layer action must query system defaults')
expectNoMatch(projectLayerLoader, /searchSysDefault/, 'project-layer action must not re-query system defaults')
expectMatch(projectLayerLoader, /platformPlanLayerApi\.search\(\{[\s\S]*?projectId/, 'project-layer action must query the open project')
expectMatch(projectLayerLoader, /mergePlanLayersWithDefaults\([\s\S]*?response\.data \?\? \[\],[\s\S]*?platformDefaultLayers\.value/, 'store must merge project and default layers')
expectMatch(
  projectLayerLoader,
  /catch \(error\)[\s\S]*?platformProjectLayers\.value = \[\.\.\.platformDefaultLayers\.value\]/,
  'failed project queries must keep system-default layers',
)
expectMatch(
  layerStore,
  /requestId = \+\+platformLayersVersion\.value[\s\S]*?requestId !== platformLayersVersion\.value/,
  'stale project-layer list responses must be ignored',
)
expectMatch(
  layerStore,
  /loadPlatformLayerDetail[\s\S]*?requestId !== platformLayersVersion\.value[\s\S]*?currentDetailId/,
  'stale project-layer detail responses must be ignored',
)
expectMatch(
  layerStore,
  /projectId !== null && projectId !== undefined && projectId !== ''/,
  'valid numeric project IDs must not use a truthiness check',
)
expectMatch(layerStore, /wmsUrl: wmsLayerName \? GEOSERVER_WMS_URL : undefined/, 'store must expose WMS URL metadata')
expectMatch(layerStore, /wmsLayerName: wmsLayerName \?\? undefined/, 'store must expose WMS layer metadata')
expectMatch(
  layerControl,
  /const wmsLayerName = getPlanLayerGeoName\(platformLayer\)/,
  'layer panel must use response geoLayerName',
)
expectMatch(
  layerControl,
  /async function initializeLayers\(\)[\s\S]*?loadPlatformDefaultLayers\(\)/,
  'layer panel must load system-default layers when it mounts',
)
expectMatch(
  layerControl,
  /watch\(currentPlatformProjectId,[\s\S]*?initializeLayers\(\)/,
  'layer panel must replace defaults when the open project changes',
)
expectMatch(
  layerControl,
  /initialDefaultLayersPromise[\s\S]*?await initialDefaultLayersPromise[\s\S]*?await loadCurrentProjectLayers\(\)/,
  'project changes must wait for the initial system-default query',
)
expectNoMatch(
  layerControl,
  /v-if="!hasOpenProject"/,
  'layer panel must not hide system-default layers before a project is opened',
)
expectMatch(
  layerControl,
  /if \(!layer\.wmsLayerName\) \{[\s\S]*?loadPlatformLayerDetail/,
  'WMS-backed clicks must skip the platform layer detail request',
)
expectMatch(
  adminLayers,
  /const wmsLayerName = getPlanLayerGeoName\(layer\)[\s\S]*?wmsLayerName: wmsLayerName \?\? undefined/,
  'queried admin layers must use response geoLayerName',
)
expectMatch(mapArea, /import TileWMS from 'ol\/source\/TileWMS'/, 'MapArea must use the OpenLayers WMS source')
expectMatch(mapArea, /new TileWMS\(\{[\s\S]*?LAYERS: metadata\.layerName[\s\S]*?FORMAT: 'image\/png'[\s\S]*?TRANSPARENT: true[\s\S]*?TILED: true/, 'WMS source parameters are incomplete')
expectMatch(
  mapArea,
  /existing && existing\.sourceKey !== sourceKey[\s\S]*?removePlatformWmsLayerRuntime\(layerId\)/,
  'WMS runtime must be replaced when geoLayerName changes',
)
expectMatch(
  mapArea,
  /isViewportScopedPlatformLayer[\s\S]*?if \(isGeoServerWmsPlatformLayer\(layerId\)\) return false/,
  'WMS layers must not enter the attachment viewport download flow',
)

for (const layerId of ['volcano', 'earthquake', 'coldCoral', 'fishing', 'shipping']) {
  expectMatch(
    mapArea,
    new RegExp(`getPlatformWmsSourceKey\\('${layerId}'\\)`),
    `${layerId} watcher must track WMS metadata changes`,
  )
  expectMatch(
    mapArea,
    new RegExp(`isGeoServerWmsPlatformLayer\\('${layerId}'\\)[\\s\\S]*?setPlatformWmsLayerVisible\\('${layerId}'`),
    `${layerId} visibility watcher must use WMS`,
  )
}

const temporaryDirectory = await mkdtemp(path.join(root, '.geoserver-wms-test-'))
const outFile = path.join(temporaryDirectory, 'planLayerSelection.mjs')

try {
  await build({
    entryPoints: [path.resolve(root, 'src/services/platform/planLayerSelection.ts')],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  })

  const {
    getPlanLayerGeoName,
    hasPlanLayerSource,
    mergePlanLayersWithDefaults,
  } = await import(pathToFileURL(outFile).href)

  const defaultLayers = [
    { id: 'default-coral', typeDic: 'CWCORAL', geoLayerName: 'geo:default_coral', isDefault: 1 },
    { id: 'default-fishing', typeDic: 'FISHZONE', geoLayerName: 'geo:default_fishing', isDefault: 1 },
  ]
  const projectLayers = [
    { id: 'project-coral', typeDic: 'cwcoral', attachmentId: '42', geoLayerName: '  geo:project_coral  ' },
    { id: 'project-fishing-placeholder', typeDic: 'FISHZONE' },
    { id: 'project-seismic', typeDic: 'SEISMIC', geoLayerName: 'geo:project_seismic' },
  ]

  const merged = mergePlanLayersWithDefaults(projectLayers, defaultLayers)
  assert.deepEqual(merged.map(layer => layer.id), [
    'project-coral',
    'default-fishing',
    'project-seismic',
  ])
  assert.equal(getPlanLayerGeoName(merged[0]), 'geo:project_coral')
  assert.equal(hasPlanLayerSource(merged[1]), true)
  assert.equal(hasPlanLayerSource({ typeDic: 'VOLCANO' }), false)

  console.log('GeoServer WMS planning layer verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
