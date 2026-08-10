import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

function expectMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message)
}

const config = read('src/config/geoserver.ts')
const layerStore = read('src/stores/layer.ts')
const layerControl = read('src/modules/planning/panels/LayerControl.vue')
const mapArea = read('src/modules/planning/components/MapArea.vue')
const viteConfig = read('vite.config.ts')

const expectedLayers = {
  CWCORAL: 'cable:WCMC008_CoralReef2021_Py_v4_1',
  FISHZONE: 'cable:fishing_area_NoDuplicate_Classify_two_level',
  SEISMIC: 'cable:earthQuakeData',
  SHIPLANE: 'cable:Ship_area_Classify_two_level',
  VOLCANO: 'cable:volcane_location',
}

for (const [typeDic, layerName] of Object.entries(expectedLayers)) {
  expectMatch(
    config,
    new RegExp(`${typeDic}: '${layerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
    `missing GeoServer mapping for ${typeDic}`,
  )
}

expectMatch(config, /VITE_GEOSERVER_WMS_URL/, 'GeoServer URL must be environment-configurable')
expectMatch(config, /DEFAULT_GEOSERVER_WMS_URL = '\/geoserver\/geo\/wms'/, 'default WMS URL must be same-origin')
expectMatch(viteConfig, /GEOSERVER_PROXY_PATH = '\/geoserver'/, 'Vite must proxy the same-origin GeoServer path')
expectMatch(viteConfig, /DEFAULT_GEOSERVER_PROXY_TARGET = 'http:\/\/47\.92\.110\.176:8960'/, 'GeoServer proxy target is incorrect')
expectMatch(layerStore, /wmsUrl: wmsLayerName \? GEOSERVER_WMS_URL : undefined/, 'store must expose WMS URL metadata')
expectMatch(layerStore, /wmsLayerName: wmsLayerName \?\? undefined/, 'store must expose WMS layer metadata')
expectMatch(
  layerControl,
  /if \(!layer\.wmsLayerName\) \{[\s\S]*?loadPlatformLayerDetail/,
  'WMS-backed clicks must skip the platform layer detail request',
)
expectMatch(mapArea, /import TileWMS from 'ol\/source\/TileWMS'/, 'MapArea must use the OpenLayers WMS source')
expectMatch(mapArea, /new TileWMS\(\{[\s\S]*?LAYERS: metadata\.layerName[\s\S]*?FORMAT: 'image\/png'[\s\S]*?TRANSPARENT: true[\s\S]*?TILED: true/, 'WMS source parameters are incomplete')
expectMatch(
  mapArea,
  /isViewportScopedPlatformLayer[\s\S]*?if \(isGeoServerWmsPlatformLayer\(layerId\)\) return false/,
  'WMS layers must not enter the attachment viewport download flow',
)

for (const layerId of ['volcano', 'earthquake', 'coldCoral', 'fishing', 'shipping']) {
  expectMatch(
    mapArea,
    new RegExp(`isGeoServerWmsPlatformLayer\\('${layerId}'\\)[\\s\\S]*?setPlatformWmsLayerVisible\\('${layerId}'`),
    `${layerId} visibility watcher must use WMS`,
  )
}

console.log('GeoServer WMS planning layer verification passed')
