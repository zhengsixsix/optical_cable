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
      post: async (path, payload) => {
        calls.push({ path, payload })
        return null
      },
      postWithPage: async (path, payload) => {
        calls.push({ path, payload })
        return null
      },
      request: async (path, payload) => {
        calls.push({ path, payload })
        return { payload: { data: null }, headers: new Headers() }
      },
    },
  },
  './sm2': {
    encryptPassword: value => value,
  },
})

await platformApi.platformProjectApi.routePlan(123, [135.1, 73.2, 18.3, 53.4])
expectEqual(calls[0], {
  path: '/plan/project/plan/route',
  payload: { id: '123', rectRange: [135.1, 73.2, 18.3, 53.4] },
}, 'routePlan payload with rectRange')

calls.length = 0
await platformApi.platformProjectApi.routePlan('abc')
expectEqual(calls[0], {
  path: '/plan/project/plan/route',
  payload: { id: 'abc' },
}, 'routePlan payload without rectRange')

console.log('route plan payload verification passed')
