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
        calls.push({ path: requestPath, payload: JSON.parse(JSON.stringify(payload)) })
        if (requestPath === '/plan/point/save') return '9007199254740993'
        if (requestPath === '/plan/point/detail') {
          return {
            id: payload.id,
            projectId: 42,
            name: '上海岸站',
            longitude: 121.5,
            latitude: 31.2,
            sortNum: 1,
          }
        }
        return true
      },
      postWithPage: async (requestPath, payload) => {
        calls.push({ path: requestPath, payload: JSON.parse(JSON.stringify(payload)) })
        if (payload.pageNumber === 1) {
          return {
            data: Array.from({ length: 10 }, (_, index) => ({ id: index + 1 })),
            page: { pageNumber: 1, pageTotal: 2, hasNextPage: true },
          }
        }
        return {
          data: [{ id: 11 }],
          page: { pageNumber: 2, pageTotal: 2, hasNextPage: false },
        }
      },
      request: async () => ({ payload: { data: null }, headers: new Headers() }),
    },
  },
  './sm2': {
    encryptPassword: value => value,
  },
})

const points = await platformApi.platformPointApi.searchAll({ projectId: 42, name: '岸站' })
const savedId = await platformApi.platformPointApi.save({
  projectId: 42,
  name: '上海岸站',
  longitude: 121.5,
  latitude: 31.2,
  sortNum: 1,
  projectName: '不应传输',
  coordinate: { x: 121.5, y: 31.2 },
})
const listSaved = await platformApi.platformPointApi.saveList({
  projectId: 42,
  pointList: [{
    id: '9007199254740993',
    projectId: 42,
    name: '上海岸站',
    longitude: 121.5,
    latitude: 31.2,
    sortNum: 1,
    coordinate: { x: 121.5, y: 31.2 },
  }],
})
const detail = await platformApi.platformPointApi.detail('9007199254740993')
const removed = await platformApi.platformPointApi.remove('9007199254740993')

expectEqual(points.length, 11, 'searchAll should consume every point page')
expectEqual(savedId, '9007199254740993', 'save should return the backend point ID')
expectEqual(listSaved, true, 'saveList should return the backend boolean')
expectEqual(detail.projectId, 42, 'detail should return the point detail')
expectEqual(removed, true, 'remove should return the backend boolean')
expectEqual(calls, [
  { path: '/plan/point/search', payload: { projectId: 42, name: '岸站', pageNumber: 1, pageSize: 10 } },
  { path: '/plan/point/search', payload: { projectId: 42, name: '岸站', pageNumber: 2, pageSize: 10 } },
  {
    path: '/plan/point/save',
    payload: {
      projectId: 42,
      name: '上海岸站',
      longitude: 121.5,
      latitude: 31.2,
      sortNum: 1,
    },
  },
  {
    path: '/plan/point/saveList',
    payload: {
      projectId: 42,
      pointList: [{
        id: '9007199254740993',
        name: '上海岸站',
        longitude: 121.5,
        latitude: 31.2,
        sortNum: 1,
      }],
    },
  },
  { path: '/plan/point/detail', payload: { id: '9007199254740993' } },
  { path: '/plan/point/remove', payload: { id: '9007199254740993' } },
], '2.2 station API paths and payloads')

const settingsSource = fs.readFileSync(path.join(root, 'src/views/SettingsView.vue'), 'utf8')
for (const method of ['searchAll', 'save', 'saveList', 'detail', 'remove']) {
  if (!settingsSource.includes(`platformPointApi.${method}(`)) {
    throw new Error(`Settings station management does not call platformPointApi.${method}`)
  }
}
if (!settingsSource.includes('platformPointId: wp.platformPointId')
  || !settingsSource.includes('waypoint.platformPointId =')) {
  throw new Error('station UI does not preserve the backend point ID independently from its local ID')
}
if (settingsSource.includes('pageSize: 1000') || settingsSource.includes('?? existingPoints[index]')) {
  throw new Error('station UI still relies on an out-of-contract page size or positional ID fallback')
}
if (!settingsSource.includes("if (removed !== true)")
  || !settingsSource.includes("if (saved !== true)")) {
  throw new Error('station UI does not reject false saveList/remove results')
}

console.log('Platform 2.2 station management verification passed.')
