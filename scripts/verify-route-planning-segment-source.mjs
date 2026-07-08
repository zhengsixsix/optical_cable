import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()
const defaultResponsePath = 'C:\\Users\\Administrator\\.codex\\attachments\\0a102336-2f4e-4fb9-969f-f201403f6005\\pasted-text.txt'
const responsePath = process.argv[2] || defaultResponsePath

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
const routePlanningResultService = loadTsModule('src/services/RoutePlanningResultService.ts', {
  jszip: { default: {} },
})
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
const result = routePlanningApiService.convertBackendRoutePlanningData(response.data, 'backend-segment-source-verification')
const route = result.routes[0]

if (!route) throw new Error('expected at least one route')
if (route.rawTrunkCoordinates.length !== 10) {
  throw new Error(`expected FMM geometry to keep 10 raw path points, got ${route.rawTrunkCoordinates.length}`)
}
if (route.segments.length !== 2) {
  throw new Error(`expected visible route segments to follow risk-based segment result, got ${route.segments.length}`)
}
if (route.points.length !== 3) {
  throw new Error(`expected visible route points to follow risk-based segment nodes, got ${route.points.length}`)
}
if (route.algorithmSummary?.segmentSource !== 'riskBased') {
  throw new Error(`expected riskBased segment source, got ${route.algorithmSummary?.segmentSource}`)
}
if ((result.segmentsByRouteId[route.id] || []).length !== 2) {
  throw new Error('expected two default cable segments for the visible route')
}

console.log('route planning segment source verification passed')
