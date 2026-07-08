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
  vm.runInNewContext(output, { module, exports: module.exports, console }, { filename })
  return module.exports
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const viewport = loadTsModule('src/utils/routePlanningViewport.ts')

expectEqual(viewport.DEFAULT_CHINA_MAP_CENTER, [104, 35], 'default China map center')
if (viewport.DEFAULT_CHINA_MAP_ZOOM < 4 || viewport.DEFAULT_CHINA_MAP_ZOOM > 5.5) {
  throw new Error(`default China map zoom should frame China, got ${viewport.DEFAULT_CHINA_MAP_ZOOM}`)
}

expectEqual(
  viewport.createRoutePlanningRectRangeFromExtent([73.1234567, 18.2345678, 135.3456789, 53.4567891]),
  [135.345679, 73.123457, 18.234568, 53.456789],
  'rectRange order and rounding',
)

expectEqual(
  viewport.createRoutePlanningRectRangeFromExtent([200, 95, -200, -95]),
  [180, -180, -90, 90],
  'rectRange normalization and clamping',
)

console.log('route planning viewport verification passed')
