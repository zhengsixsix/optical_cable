import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()
const responsePath = process.argv[2]

if (!responsePath) {
  throw new Error('Usage: node scripts/verify-route-planning-result.mjs <response-json-file>')
}

function loadTsModule(relativePath, modules = {}) {
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
  const require = specifier => {
    if (modules[specifier]) return modules[specifier]
    throw new Error(`Unexpected runtime import ${specifier} in ${relativePath}`)
  }
  vm.runInNewContext(output, { module, exports: module.exports, require, console }, { filename })
  return module.exports
}

function approx(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

const converter = loadTsModule('src/services/RouteDataConverter.ts')
const resultService = loadTsModule('src/services/RoutePlanningResultService.ts', {
  jszip: { default: {} },
})
const apiService = loadTsModule('src/services/RoutePlanningApiService.ts', {
  '@/services/platform/api': {
    platformProjectApi: {
      routePlan: async () => {
        throw new Error('routePlan should not be called by this verification')
      },
    },
  },
  '@/services/RouteDataConverter': converter,
  '@/services/RoutePlanningResultService': resultService,
})
const polyline = loadTsModule('src/utils/polyline.ts')

const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'))
const result = apiService.convertBackendRoutePlanningData(response.data, 'verification')

if (result.diagnostics.fmmPathCount !== 3) throw new Error('expected 3 raw FMM paths')
if (result.routes.length !== 2) throw new Error(`expected 2 visible routes, got ${result.routes.length}`)
if (result.diagnostics.files.length !== 5) throw new Error('diagnostics should include the five loaded files')

const first = result.routes[0]
if (!first.rawTrunkCoordinates || first.rawTrunkCoordinates.length !== 94) {
  throw new Error('first FMM route should use 94 real_trace coordinates')
}
approx(first.totalLength, 56.10, 0.01, 'first route length')
if (first.totalCost !== 3032871) {
  throw new Error(`first total cost should come from FMM total_cost, got ${first.totalCost}`)
}

const firstSegments = result.segmentsByRouteId[first.id]
if (!firstSegments || firstSegments.length !== 6) {
  throw new Error('risk-based segment result should attach to first route')
}
if (!result.diagnostics.costMatrix || result.diagnostics.costMatrix.rows !== 105 || result.diagnostics.costMatrix.columns !== 112) {
  throw new Error('cost matrix stats should be available')
}
if (!result.diagnostics.riskMatrix || result.diagnostics.riskMatrix.rows !== 105 || result.diagnostics.riskMatrix.columns !== 112) {
  throw new Error('risk matrix stats should be available')
}

const sliced = polyline.slicePolylineByDistanceKm([[0, 0], [0.1, 0], [0.2, 0]], 2, 12)
if (sliced.length < 2) throw new Error('polyline slice should return clipped coordinates')

console.log('route planning backend response verification passed')
