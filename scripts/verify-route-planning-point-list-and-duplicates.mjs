import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()
const defaultResponsePath = 'C:\\Users\\Administrator\\.codex\\attachments\\92300a80-aeef-47d6-a742-06dc870e9c10\\pasted-text.txt'
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
const result = routePlanningApiService.convertBackendRoutePlanningData(response.data, 'backend-point-list-verification')

if (result.diagnostics.fmmPathCount !== 3) {
  throw new Error(`expected backend to contain 3 FMM paths, got ${result.diagnostics.fmmPathCount}`)
}
if (result.routes.length !== 3) {
  throw new Error(`expected all 3 backend routes to remain selectable, got ${result.routes.length}`)
}

result.routes.forEach((route, index) => {
  const first = route.points[0]
  const last = route.points[route.points.length - 1]
  if (first?.name !== '起点') {
    throw new Error(`route ${index} expected start station name 起点, got ${first?.name}`)
  }
  if (last?.name !== '终点') {
    throw new Error(`route ${index} expected end station name 终点, got ${last?.name}`)
  }
  if ((result.segmentsByRouteId[route.id] || []).length !== 2) {
    throw new Error(`route ${index} expected copied risk-based cable segments`)
  }
})

console.log('route planning point list and duplicate route verification passed')
