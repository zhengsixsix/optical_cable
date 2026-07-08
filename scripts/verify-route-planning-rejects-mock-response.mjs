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

const demoFmmPaths = [
  {
    trace: [[1, 1, 1], [2, 2, 2]],
    real_trace: [
      [1, -11.543075471698113, 47.54214159292036],
      [94, -11.927566037735849, 47.81899115044248],
    ],
    total_cost: 3032870.7332219994,
    total_risk: 382653.67831299745,
    length: 56.10387063735551,
  },
]

try {
  routePlanningApiService.convertBackendRoutePlanningData({
    'FMM_path_result.json': demoFmmPaths,
    'segment_result_base_Risk.json': {
      route_index: 0,
      segment_nodes: [
        [1, -11.543075471698113, 47.54214159292036],
        [2, -11.927566037735849, 47.81899115044248],
      ],
      segments: [
        {
          segment_id: 1,
          start_node_id: 1,
          end_node_id: 2,
          cable_type: 'LW',
          length_km: 56.1039,
        },
      ],
    },
    'cost.txt': '1 2\n3 4',
    'risk.txt': '1 2\n3 4',
  }, 'routePlan:mock-verification')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.includes('旧样例') && !message.toLowerCase().includes('mock')) {
    throw new Error(`expected mock route planning rejection, got: ${message}`)
  }
  console.log('route planning mock response rejection verification passed')
  process.exit(0)
}

throw new Error('expected backend mock route planning response to be rejected')
