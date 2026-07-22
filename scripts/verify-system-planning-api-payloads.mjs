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

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const calls = []
const platformApi = loadTsModule('src/services/platform/api.ts', {
  './client': {
    PLATFORM_USER_KEY: 'platform.auth.user',
    setPlatformToken: () => {},
    platformClient: {
      post: async (requestPath, payload) => {
        calls.push({ path: requestPath, payload })
        return null
      },
      postWithPage: async () => null,
      request: async () => ({ payload: { data: null }, headers: new Headers() }),
    },
  },
  './sm2': {
    encryptPassword: value => value,
  },
})

await platformApi.platformProjectApi.fixedPlan(123)
await platformApi.platformProjectApi.optimizedPlan(123, 2)
await platformApi.platformProjectApi.simulationPlan(123, 2)
await platformApi.platformProjectApi.queryFixed(123)
await platformApi.platformProjectApi.queryOptimized(123)
await platformApi.platformProjectApi.querySimulation(123)

expectEqual(calls, [
  { path: '/plan/project/plan/fixed', payload: { id: 123 } },
  { path: '/plan/project/plan/optimized', payload: { id: 123, fmmPathResultIndex: 2 } },
  { path: '/plan/project/plan/simulation', payload: { id: 123, fmmPathResultIndex: 2 } },
  { path: '/plan/project/query/fixed', payload: { id: 123 } },
  { path: '/plan/project/query/optimized', payload: { id: 123 } },
  { path: '/plan/project/query/simulation', payload: { id: 123 } },
], 'system planning Swagger payloads')

console.log('system planning API payload verification passed')
