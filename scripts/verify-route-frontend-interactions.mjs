import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: specifier => { throw new Error(`Unexpected runtime import ${specifier}`) },
  }, { filename })
  return module.exports
}

const { nearestPointOnRoute } = loadTsModule('src/utils/routeGeometry.ts')
const snapped = nearestPointOnRoute([121.4, 39.1], [
  [121.0, 39.0],
  [122.0, 39.0],
])
assert.ok(snapped, 'route snapping did not return a coordinate')
assert.ok(Math.abs(snapped[0] - 121.4) < 1e-9, 'route snapping changed the along-route longitude')
assert.ok(Math.abs(snapped[1] - 39.0) < 1e-9, 'route snapping did not project onto the route')

const mapArea = fs.readFileSync(path.join(root, 'src/modules/planning/components/MapArea.vue'), 'utf8')
for (const [level, color] of [
  ['high', '#dc2626'],
  ['medium', '#d97706'],
  ['low', '#16a34a'],
]) {
  assert.match(mapArea, new RegExp(`${level}: '${color}'`), `missing ${level} risk color`)
}
assert.match(mapArea, /segment\.riskLevel \? riskColors\[segment\.riskLevel\]/, 'segment risk level is not used for line color')
assert.match(mapArea, /routePoints: coords\.map/, 'selected route geometry is not sent to the depth profile')

const depthProfile = fs.readFileSync(path.join(root, 'src/modules/planning/components/DepthProfile.vue'), 'utf8')
for (const interaction of ['handleWheel', 'handleDrag', 'resetZoom']) {
  assert.ok(depthProfile.includes(interaction), `depth profile is missing ${interaction}`)
}
assert.match(depthProfile, /addEventListener\('wheel', handleWheel, \{ passive: false \}\)/, 'depth profile wheel zoom is not registered as a non-passive listener')
assert.match(depthProfile, /defineExpose\(\{ resetZoom \}\)/, 'depth profile reset is not exposed to the panel header')
assert.doesNotMatch(depthProfile, /toggleFullscreen|@click\.stop="zoom(?:In|Out)"/, 'depth profile still contains the removed floating controls')

const rightPanel = fs.readFileSync(path.join(root, 'src/components/panels/RightPanel.vue'), 'utf8')
assert.match(rightPanel, /import \{ RotateCcw, X, Maximize2 \}/, 'right panel does not use the reset icon')
assert.match(rightPanel, /@click="depthProfileRef\?\.resetZoom\(\)"/, 'right panel reset button is not wired to the depth profile')
assert.match(rightPanel, /<DepthProfile ref="depthProfileRef"/, 'right panel is missing the depth profile component ref')
assert.match(rightPanel, /class="h-\[180px\][^"]*rounded-md shadow-none"/, 'depth profile panel is not using the compact card layout')
assert.match(rightPanel, /<CardHeader class="min-h-8 px-2 py-1">/, 'depth profile header is not compact')
assert.doesNotMatch(rightPanel, /\bPrinter\b/, 'right panel still contains the print icon')
assert.match(depthProfile, /padding = \{ top: 8, right: 8, bottom: 30, left: 44 \}/, 'depth profile chart padding is not compact')

const systemDesignMap = fs.readFileSync(path.join(root, 'src/modules/design/components/SystemDesignMap.vue'), 'utf8')
assert.match(systemDesignMap, /nearestPointOnRoute/, 'system design map does not snap amplifier coordinates')
assert.match(systemDesignMap, /props\.coordinatePicking[\s\S]*snapCoordinateToSelectedRoute/, 'coordinate picker does not snap to the selected route')

const connectorDialog = fs.readFileSync(path.join(root, 'src/modules/design/dialogs/ConnectorDialog.vue'), 'utf8')
assert.match(connectorDialog, /if \(!snapAmplifierCoordinate\(\)\) return/, 'amplifier save is not guarded by route snapping')

console.log('route frontend interaction verification passed')
