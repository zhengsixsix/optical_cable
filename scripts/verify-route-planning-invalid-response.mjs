import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()

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

const jsonNodeMetadata = {
  nodeType: 'ARRAY',
  array: true,
  empty: false,
  null: false,
  valueNode: false,
  object: false,
  containerNode: true,
}

try {
  routePlanningApiService.convertBackendRoutePlanningData({
    'cost.txt': '1 2\n3 4',
    'risk.txt': '1 2\n3 4',
    'FMM_path_result.json': jsonNodeMetadata,
  }, 'invalid-json-node-verification')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.includes('FMM_path_result.json') || !message.includes('JsonNode')) {
    throw new Error(`expected clear JsonNode validation error, got: ${message}`)
  }
  console.log('route planning invalid response verification passed')
  process.exit(0)
}

throw new Error('expected invalid JsonNode-style FMM result to throw')
