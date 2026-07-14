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
const responseData = response.data || {}
const rawFmmPaths = responseData['FMM_path_result.json'] || []
const expectedFileCount = [
  'pointList',
  'cost.txt',
  'risk.txt',
  'FMM_path_result.json',
  'segment_result_base_FixSpacing.json',
  'segment_result_base_Risk.json',
].filter(key => responseData[key] !== undefined).length

if (result.diagnostics.fmmPathCount !== rawFmmPaths.length) {
  throw new Error(`expected ${rawFmmPaths.length} raw FMM paths, got ${result.diagnostics.fmmPathCount}`)
}
if (result.routes.length === 0 || result.routes.length > rawFmmPaths.length) {
  throw new Error(`unexpected converted route count: ${result.routes.length}`)
}
if (result.diagnostics.files.length !== expectedFileCount) {
  throw new Error(`diagnostics should include ${expectedFileCount} loaded files, got ${result.diagnostics.files.length}`)
}

const first = result.routes[0]
const firstRawPath = rawFmmPaths[0]
const expectedRealTraceLength = firstRawPath.real_trace?.length || 0
if (!first.rawTrunkCoordinates || first.rawTrunkCoordinates.length !== expectedRealTraceLength) {
  throw new Error(`first FMM route should use ${expectedRealTraceLength} real_trace coordinates`)
}
approx(first.totalLength, firstRawPath.length, 0.01, 'first route length')
if (first.totalCost !== Math.round(firstRawPath.total_cost)) {
  throw new Error(`first total cost should come from FMM total_cost, got ${first.totalCost}`)
}
if (!first.rawMatrixTraceCoordinates || first.rawMatrixTraceCoordinates.length !== firstRawPath.trace.length) {
  throw new Error('first FMM route should keep raw matrix trace coordinates')
}

const firstSegments = result.segmentsByRouteId[first.id]
const expectedRiskSegments = responseData['segment_result_base_Risk.json']?.segments?.length || 0
if (expectedRiskSegments > 0 && (!firstSegments || firstSegments.length !== expectedRiskSegments)) {
  throw new Error('risk-based segment result should attach to first route')
}

function matrixDimensions(text) {
  const rows = String(text || '').trim().split(/\r?\n/).filter(Boolean).map(row => row.trim().split(/\s+/))
  return {
    rows: rows.length,
    columns: rows.reduce((max, row) => Math.max(max, row.length), 0),
  }
}

const expectedCostMatrix = matrixDimensions(responseData['cost.txt'])
const expectedRiskMatrix = matrixDimensions(responseData['risk.txt'])
if (!result.diagnostics.costMatrix || result.diagnostics.costMatrix.rows !== expectedCostMatrix.rows || result.diagnostics.costMatrix.columns !== expectedCostMatrix.columns) {
  throw new Error('cost matrix stats should be available')
}
if (!result.diagnostics.riskMatrix || result.diagnostics.riskMatrix.rows !== expectedRiskMatrix.rows || result.diagnostics.riskMatrix.columns !== expectedRiskMatrix.columns) {
  throw new Error('risk matrix stats should be available')
}

const sliced = polyline.slicePolylineByDistanceKm([[0, 0], [0.1, 0], [0.2, 0]], 2, 12)
if (sliced.length < 2) throw new Error('polyline slice should return clipped coordinates')

console.log('route planning backend response verification passed')
