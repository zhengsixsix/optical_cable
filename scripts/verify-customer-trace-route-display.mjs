import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function expectIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`)
  }
}

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath)
  const source = read(relativePath)
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

const { convertAlgorithmRouteBundle } = loadTsModule('src/services/RouteDataConverter.ts')

const result = convertAlgorithmRouteBundle({
  fmmPaths: [
    {
      trace: [
        [1, 9, 26],
        [2, 10, 25],
        [3, 101, 85],
      ],
      real_trace: [
        [1, 25.62, 121.05],
        [2, 25.59, 121.04],
        [3, 22.63, 121.96],
      ],
    },
    {
      trace: [
        [1, 9, 26],
        [2, 11, 25],
        [3, 101, 85],
      ],
      real_trace: [
        [1, 25.62, 121.05],
        [2, 25.56, 121.04],
        [3, 22.63, 121.96],
      ],
    },
    {
      trace: [
        [1, 9, 26],
        [2, 8, 25],
        [3, 5, 0],
      ],
      real_trace: [
        [1, 25.62, 121.05],
        [2, 25.65, 121.04],
        [3, 25.75, 120.65],
      ],
    },
  ],
  riskMatrixText: '1 2 3\n4 5 6\n7 8 9',
  costMatrixText: '1 2 3\n4 5 6\n7 8 9',
})

const firstTrace = result.routes[0]?.rawMatrixTraceCoordinates
if (!firstTrace || firstTrace.length !== 3) {
  throw new Error('expected rawMatrixTraceCoordinates on converted route')
}

if (firstTrace[0][0] !== 9 || firstTrace[0][1] !== 26 || firstTrace[2][0] !== 101 || firstTrace[2][1] !== 85) {
  throw new Error(`unexpected rawMatrixTraceCoordinates: ${JSON.stringify(firstTrace)}`)
}

const mapArea = read('src/modules/planning/components/MapArea.vue')
expectIncludes(mapArea, 'customerTraceRouteLimit = 2', 'customer route display limit')
expectIncludes(mapArea, "customerTraceRouteColors = ['#ef4444', '#22c55e']", 'customer route colors')
expectIncludes(mapArea, 'renderCustomerTraceRoutes(routes)', 'customer trace render branch')
expectIncludes(mapArea, 'rawMatrixTraceCoordinates', 'customer trace source coordinates')
expectIncludes(mapArea, 'getCustomerTracePlotCoordinates', 'customer trace row/column plotting helper')
expectIncludes(mapArea, 'map(([row, column]) => [column, row]', 'customer trace column-row plot order')
expectIncludes(mapArea, 'isCustomerTraceRoute', 'customer trace route feature marker')

console.log('customer trace route display verification passed')
