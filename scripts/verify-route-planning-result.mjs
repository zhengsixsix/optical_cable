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

const converter = loadTsModule('src/services/RouteDataConverter.ts')
const resultService = loadTsModule('src/services/RoutePlanningResultService.ts')
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

const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'))
const rawPaths = response.data['FMM_path_result.json']
const result = apiService.convertBackendRoutePlanningData(response.data, 'verification')

if (result.diagnostics.fmmPathCount !== rawPaths.length) {
  throw new Error(`expected ${rawPaths.length} raw FMM paths, got ${result.diagnostics.fmmPathCount}`)
}
if (result.routes.length !== rawPaths.filter(pathResult => pathResult.real_trace?.length >= 2).length) {
  throw new Error(`unexpected converted route count: ${result.routes.length}`)
}

const first = result.routes[0]
const firstRawPath = rawPaths[0]
const expectedCoordinates = firstRawPath.real_trace.map(point => {
  const [firstValue, secondValue] = point.slice(-2)
  return Math.abs(firstValue) <= 90 && Math.abs(secondValue) > 90
    ? [secondValue, firstValue]
    : [firstValue, secondValue]
})
if (JSON.stringify(first.rawTrunkCoordinates) !== JSON.stringify(expectedCoordinates)) {
  throw new Error('visible route geometry must come only from backend real_trace')
}
if (first.totalLength !== firstRawPath.length
  || first.totalCost !== firstRawPath.total_cost
  || first.risk.overall !== firstRawPath.total_risk) {
  throw new Error('backend route totals must be preserved without frontend calculation')
}
const rawSegments = response.data['segment_result_base_Risk.json']?.segments || []
if (first.segments.length !== rawSegments.length
  || (result.segmentsByRouteId[first.id] || []).length !== rawSegments.length) {
  throw new Error('backend segment results must populate route and cable-segment state')
}
if (rawSegments.length > 0) {
  const segment = first.segments[0]
  if (!segment.startPointId || !segment.endPointId
    || segment.geometryStartIndex !== 0 || segment.geometryEndIndex !== 1) {
    throw new Error('backend segment nodes must map to visible real_trace point boundaries')
  }
}
if (Object.hasOwn(first, 'rawMatrixTraceCoordinates')) {
  throw new Error('matrix trace coordinates must not be retained as display geometry')
}
if (Object.hasOwn(first.algorithmSummary || {}, 'segmentSource')) {
  throw new Error('frontend must not select a segment result variant')
}
for (const filename of ['segment_result_base_Risk.json', 'cost.txt', 'risk.txt']) {
  if (!result.diagnostics.files.includes(filename)) {
    throw new Error(`backend result file was not retained: ${filename}`)
  }
}
if (result.rawResultFiles['cost.txt'] !== response.data['cost.txt']
  || result.rawResultFiles['risk.txt'] !== response.data['risk.txt']) {
  throw new Error('raw cost and risk sequences must survive conversion')
}
if (!result.analysis.segmentResults.some(item => item.sourceFile === 'segment_result_base_Risk.json')) {
  throw new Error('segment side files should remain available for analysis')
}
if (response.data['segment_result_base_FixSpacing.json']
  && !result.analysis.segmentResults.some(item => item.sourceFile === 'segment_result_base_FixSpacing.json')) {
  throw new Error('fixed-spacing segment data should be retained when the backend returns it')
}

const forbiddenFiles = [
  'src/services/RepeaterPlacementService.ts',
  'src/services/OpticalSimulationService.ts',
  'src/services/simulationDataBuilder.ts',
  'src/utils/polyline.ts',
  'src/utils/routePosition.ts',
]
for (const relativePath of forbiddenFiles) {
  if (fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`removed frontend algorithm file returned: ${relativePath}`)
  }
}
if (result.analysis.costGrid?.rows !== 2 || result.analysis.costGrid?.columns !== 2
  || result.analysis.riskGrid?.rows !== 2 || result.analysis.riskGrid?.columns !== 2) {
  throw new Error('cost and risk matrices must retain their drawable grid shape')
}

console.log('route planning backend result verification passed')
