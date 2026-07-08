import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()
const responsePath = process.argv[2]

if (!responsePath) {
  throw new Error('Usage: node scripts/verify-backend-route-planning-response.mjs <response-json-file>')
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
const result = routePlanningApiService.convertBackendRoutePlanningData(response.data, 'backend-response-verification')

if (result.routes.length === 0) throw new Error('expected at least one visible route')
if (!result.segmentsByRouteId[result.routes[0].id]?.length) throw new Error('expected segments for the first route')
if (!result.diagnostics.files.includes('FMM_path_result.json')) throw new Error('expected FMM path file in diagnostics')
if (!result.diagnostics.costMatrix) throw new Error('expected parsed cost matrix diagnostics')
if (!result.diagnostics.riskMatrix) throw new Error('expected parsed risk matrix diagnostics')

console.log('backend route planning response verification passed')
