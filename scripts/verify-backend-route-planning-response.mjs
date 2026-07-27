import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()
const responsePath = process.argv[2] || path.join(root, 'scripts/fixtures/route-planning-response.json')

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

const routeDataConverter = loadTsModule('src/services/RouteDataConverter.ts')
const routePlanningResultService = loadTsModule('src/services/RoutePlanningResultService.ts')
const routePlanningApiService = loadTsModule('src/services/RoutePlanningApiService.ts', {
  '@/services/platform/api': {
    platformProjectApi: {
      routePlan: async () => {
        throw new Error('routePlan should not be called by this verification')
      },
    },
  },
  '@/services/RouteDataConverter': routeDataConverter,
  '@/services/RoutePlanningResultService': routePlanningResultService,
})

const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'))
const result = routePlanningApiService.convertBackendRoutePlanningData(
  response,
  'backend-response-verification',
)

if (result.routes.length === 0) throw new Error('expected at least one visible real_trace route')
const firstRoute = result.routes[0]
const backendTrace = response.data['FMM_path_result.json']?.[0]?.real_trace || []
if (firstRoute.points.length !== backendTrace.length) {
  throw new Error(`frontend route point count ${firstRoute.points.length} does not match backend real_trace ${backendTrace.length}`)
}
const backendSegments = response.data['segment_result_base_Risk.json']?.segments || []
const backendSegmentRouteIndex = Number(response.data['segment_result_base_Risk.json']?.route_index ?? 0)
if (result.routes.some((route, routeIndex) => {
  const expectedSegmentCount = routeIndex === backendSegmentRouteIndex ? backendSegments.length : 0
  return route.segments.length !== expectedSegmentCount
    || (result.segmentsByRouteId[route.id] || []).length !== expectedSegmentCount
})) {
  throw new Error('only the route referenced by route_index may receive backend segmentation boundaries')
}
const expectedFiles = [
  'FMM_path_result.json',
  'segment_result_base_FixSpacing.json',
  'segment_result_base_Risk.json',
  'cost.txt',
  'risk.txt',
  'pointList',
].filter(filename => response.data[filename] !== null && response.data[filename] !== undefined)
if (JSON.stringify(result.diagnostics.files) !== JSON.stringify(expectedFiles)) {
  throw new Error(`complete route result files should be loaded: ${JSON.stringify(result.diagnostics.files)}`)
}
if (result.rawResultFiles['cost.txt'] !== response.data['cost.txt']
  || result.rawResultFiles['risk.txt'] !== response.data['risk.txt']) {
  throw new Error('cost and risk source sequences must be stored verbatim')
}
if (!result.analysis.costSamples || result.analysis.costSamples.sampleCount === 0) {
  throw new Error(`unexpected cost sequence analysis: ${JSON.stringify(result.analysis.costSamples)}`)
}
const smallSeries = routeDataConverter.summarizeNumericSeries('1 2\n3 4')
if (smallSeries?.sampleCount !== 4
  || smallSeries.min !== 1
  || smallSeries.max !== 4
  || smallSeries.average !== 2.5) {
  throw new Error(`numeric series statistics regressed: ${JSON.stringify(smallSeries)}`)
}
const riskSegmentAnalysis = result.analysis.segmentResults.find(item => item.kind === 'riskBased')
const riskSegments = response.data['segment_result_base_Risk.json']?.segments || []
if (!riskSegmentAnalysis
  || riskSegmentAnalysis.segmentCount !== riskSegments.length) {
  throw new Error(`backend segment result should be retained for analysis: ${JSON.stringify(riskSegmentAnalysis)}`)
}
if (firstRoute.totalCost !== response.data['FMM_path_result.json'][0].total_cost) {
  throw new Error('backend total_cost should be preserved verbatim')
}
if (firstRoute.risk.overall !== response.data['FMM_path_result.json'][0].total_risk) {
  throw new Error('backend total_risk should be preserved verbatim')
}
if (Object.keys(firstRoute.cost).some(key => key !== 'total')) {
  throw new Error('frontend must not synthesize route cost breakdown')
}
if (Object.keys(firstRoute.risk).some(key => key !== 'overall')) {
  throw new Error('frontend must not synthesize route risk categories')
}

const mockLikeResult = routePlanningApiService.convertBackendRoutePlanningData({
  'FMM_path_result.json': [{
    real_trace: [[1, -11.54, 47.54], [2, -11.92, 47.81]],
    total_cost: 3032870.73,
    total_risk: 382653.67,
    length: 56.1,
  }],
  'segment_result_base_Risk.json': { segments: [{ cable_type: 'LW' }] },
  'risk.txt': '1 2\n3 4',
}, 'backend-content-verification')
if (mockLikeResult.routes.length !== 1 || mockLikeResult.routes[0].segments.length !== 0) {
  throw new Error('frontend should display valid backend real_trace without classifying its content')
}
if (!mockLikeResult.rawResultFiles['segment_result_base_Risk.json']
  || mockLikeResult.analysis.riskSamples?.sampleCount !== 4) {
  throw new Error('recognized side-file data should remain available even when incomplete segments cannot be mapped')
}

const missingMetricsResult = routePlanningApiService.convertBackendRoutePlanningData({
  'FMM_path_result.json': [{
    real_trace: [[1, -11.54, 47.54], [2, -11.92, 47.81]],
  }],
}, 'backend-missing-metrics-verification')
if (missingMetricsResult.routes.length !== 1) {
  throw new Error('real_trace should remain visible when optional route metrics are absent')
}
const missingMetricsRoute = missingMetricsResult.routes[0]
for (const metric of ['totalLength', 'totalCost', 'riskScore', 'distance']) {
  if (Object.hasOwn(missingMetricsRoute, metric)) {
    throw new Error(`frontend must not invent absent backend metric ${metric}`)
  }
}
if (Object.keys(missingMetricsRoute.cost).length !== 0 || Object.keys(missingMetricsRoute.risk).length !== 0) {
  throw new Error('frontend must keep cost and risk empty when backend metrics are absent')
}

const missingRealTraceResult = routePlanningApiService.convertBackendRoutePlanningData({
  'FMM_path_result.json': [{
    trace: [[1, 1, 1], [2, 2, 2]],
    total_cost: 10,
    total_risk: 0.1,
    length: 1,
  }],
}, 'backend-missing-real-trace-verification')
if (missingRealTraceResult.routes.length !== 0) {
  throw new Error('matrix trace must not be treated as geographic coordinates')
}
if (!missingRealTraceResult.diagnostics.warnings.some(message => message.includes('real_trace'))) {
  throw new Error('missing real_trace should produce a clear diagnostic')
}

const largeFlatGrid = routeDataConverter.parseNumericGrid(`${'1 '.repeat(160000)}`)
if (!largeFlatGrid
  || largeFlatGrid.rows !== 400
  || largeFlatGrid.columns !== 400
  || largeFlatGrid.min !== 1
  || largeFlatGrid.max !== 1) {
  throw new Error('large flattened result grids must parse without argument-spread overflow')
}

console.log('backend route planning response verification passed')
