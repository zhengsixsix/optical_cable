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
        if (requestPath === '/plan/planConfig/searchOptimization') {
          return {
            targetGsnrDb: '14.5',
            targetOsnrDb: '16',
            osnrMarginDb: '1.25',
            spanMinKm: '5',
            spanMaxKm: '10',
            spanStepKm: '0.5',
            minSpanLimitKm: '0',
            maxSpanLimitKm: '140',
            optimizationTarget: 'min_amp',
          }
        }
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

await platformApi.platformProjectApi.fixedPlan(123, false)
await platformApi.platformProjectApi.fixedPlan(123, true)
await platformApi.platformProjectApi.optimizedPlan(123, 2, false)
await platformApi.platformProjectApi.optimizedPlan(123, 2, true)
await platformApi.platformProjectApi.simulationPlan(123, 'fixed')
await platformApi.platformProjectApi.simulationPlan(123, 'optimized')
await platformApi.platformProjectApi.queryFixed(123)
await platformApi.platformProjectApi.queryOptimized(123)
await platformApi.platformProjectApi.querySimulation(123)
await platformApi.platformProjectApi.saveResult({
  id: 123,
  'cost.txt': '1 2',
  'risk.txt': '0.1 0.2',
  'FMM_path_result.json': [{ trace: [[1, 2]], total_cost: 3 }],
  'segment_result_base_FixSpacing.json': {
    route_index: 0,
    segment_nodes: [[1, 2]],
    segments: [{ segment_id: 1, start_node_id: 1, end_node_id: 2, length_km: 80 }],
  },
  'segment_result_base_Risk.json': {
    route_index: 0,
    risk_level: [{ level: 1, risk_min: 0, risk_max: 0.3 }],
  },
})
await platformApi.platformPlanConfigApi.saveOptimization({
  projectId: 123,
  targetGsnrDb: 14,
  targetOsnrDb: 16.5,
  osnrMarginDb: null,
  spanMinKm: 5,
  spanMaxKm: 10,
  spanStepKm: 1,
  minSpanLimitKm: 0,
  maxSpanLimitKm: 140,
  optimizationTarget: 'max_gsnr',
})
const optimization = await platformApi.platformPlanConfigApi.searchOptimization(123)
await platformApi.platformDeviceLibraryApi.saveDefault({ id: 99, deviceTypeCd: 'FIB' })

expectEqual(calls, [
  { path: '/plan/project/plan/fixed', payload: { id: 123, clearAll: false } },
  { path: '/plan/project/plan/fixed', payload: { id: 123, clearAll: true } },
  { path: '/plan/project/plan/optimized', payload: { id: 123, fmmPathResultIndex: 2, clearAll: false } },
  { path: '/plan/project/plan/optimized', payload: { id: 123, fmmPathResultIndex: 2, clearAll: true } },
  { path: '/plan/project/plan/simulation', payload: { id: 123, mode: 'fixed' } },
  { path: '/plan/project/plan/simulation', payload: { id: 123, mode: 'optimized' } },
  { path: '/plan/project/query/fixed', payload: { id: 123 } },
  { path: '/plan/project/query/optimized', payload: { id: 123 } },
  { path: '/plan/project/query/simulation', payload: { id: 123 } },
  {
    path: '/plan/project/saveResult',
    payload: {
      id: 123,
      'cost.txt': '1 2',
      'risk.txt': '0.1 0.2',
      'FMM_path_result.json': [{ trace: [[1, 2]], total_cost: 3 }],
      'segment_result_base_FixSpacing.json': {
        route_index: 0,
        segment_nodes: [[1, 2]],
        segments: [{ segment_id: 1, start_node_id: 1, end_node_id: 2, length_km: 80 }],
      },
      'segment_result_base_Risk.json': {
        route_index: 0,
        risk_level: [{ level: 1, risk_min: 0, risk_max: 0.3 }],
      },
    },
  },
  {
    path: '/plan/planConfig/saveOptimization',
    payload: {
      projectId: 123,
      targetGsnrDb: '14',
      targetOsnrDb: '16.5',
      osnrMarginDb: null,
      spanMinKm: '5',
      spanMaxKm: '10',
      spanStepKm: '1',
      minSpanLimitKm: '0',
      maxSpanLimitKm: '140',
      optimizationTarget: 'max_gsnr',
    },
  },
  { path: '/plan/planConfig/searchOptimization', payload: { id: 123 } },
  { path: '/plan/deviceLibrary/saveDefault', payload: { id: 99, deviceTypeCd: 'FIB' } },
], 'system planning Swagger payloads')

expectEqual(optimization, {
  targetGsnrDb: 14.5,
  targetOsnrDb: 16,
  osnrMarginDb: 1.25,
  spanMinKm: 5,
  spanMaxKm: 10,
  spanStepKm: 0.5,
  minSpanLimitKm: 0,
  maxSpanLimitKm: 140,
  optimizationTarget: 'min_amp',
}, 'planConfig/searchOptimization wire normalization')

const apiSource = fs.readFileSync(path.join(root, 'src/services/platform/api.ts'), 'utf8')
if (apiSource.includes("'/plan/deviceConfig/detail'")) {
  throw new Error('platform API still exposes /plan/deviceConfig/detail, which is absent from Swagger')
}

const dialogSource = fs.readFileSync(
  path.join(root, 'src/modules/design/dialogs/LinkConfigDialog.vue'),
  'utf8',
)
const optimizationBuilderStart = dialogSource.indexOf('function buildPlatformOptimizationConfig')
const optimizationBuilderEnd = dialogSource.indexOf('\n}\n', optimizationBuilderStart)
const optimizationBuilder = dialogSource.slice(optimizationBuilderStart, optimizationBuilderEnd)
for (const field of [
  'targetGsnrDb',
  'targetOsnrDb',
  'osnrMarginDb',
  'spanMinKm',
  'spanMaxKm',
  'spanStepKm',
  'minSpanLimitKm',
  'maxSpanLimitKm',
  'optimizationTarget',
]) {
  if (!optimizationBuilder.includes(`${field}:`)) {
    throw new Error(`planConfig/saveOptimization payload is missing ${field}`)
  }
}
if (!dialogSource.includes("@click=\"optimizationTarget = 'min_amplifiers'\"")
  || !dialogSource.includes("@click=\"optimizationTarget = 'max_gsnr'\"")) {
  throw new Error('optimized planning target is not selectable in the planning dialog')
}

const wdmSaveStart = dialogSource.indexOf('async function savePlatformWdmConfig')
const wdmSaveEnd = dialogSource.indexOf('\n}\n', wdmSaveStart)
const wdmSaveSource = dialogSource.slice(wdmSaveStart, wdmSaveEnd)
if (!wdmSaveSource.includes('channelFrequenciesThz: buildChannelFrequencies(channelCount)')) {
  throw new Error('planConfig/saveChannelConfig payload does not include the displayed channel frequencies')
}

const simulationStart = dialogSource.indexOf('const startCalculation = async () => {')
const simulationEnd = dialogSource.indexOf('\nconst isCalculationResult', simulationStart)
const simulationSource = dialogSource.slice(simulationStart, simulationEnd)
const fixedModeGuard = simulationSource.indexOf("if (spanStrategy.value === 'fixed')")
const fixedWdmSave = simulationSource.indexOf('await savePlatformWdmConfig(projectId)')
const simulationRequest = simulationSource.indexOf('await runSimulation({')
if (fixedModeGuard < 0
  || fixedWdmSave < fixedModeGuard
  || simulationRequest < fixedWdmSave) {
  throw new Error('fixed-spacing physical simulation must save WDM parameters before submission')
}

console.log('system planning API payload verification passed')
