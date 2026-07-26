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
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require, console, setTimeout, clearTimeout },
    { filename },
  )
  return module.exports
}

function expect(condition, label) {
  if (!condition) throw new Error(label)
}

const apiState = {
  layout: null,
  simulation: null,
  deviceEntityList: [],
  fixedStart: null,
}
let simulationQueryCalls = 0
let fixedQueryCalls = 0
let fixedPlanCalls = 0
const layoutPlanCalls = []
const planningCallOrder = []
let savedChannelConfig = null
let savedOptimizationConfig = null

const layoutUtils = loadTsModule('src/utils/systemPlanningLayout.ts')
const constraintUtils = loadTsModule('src/utils/systemPlanningConstraints.ts')

const service = loadTsModule('src/services/SimulationApiService.ts', {
  '@/utils/systemPlanningLayout': layoutUtils,
  '@/utils/systemPlanningConstraints': constraintUtils,
  '@/services/platform/api': {
    platformProjectApi: {
      fixedPlan: async (_projectId, clearAll) => {
        fixedPlanCalls += 1
        layoutPlanCalls.push({ mode: 'fixed', clearAll })
        return apiState.fixedStart ?? {
          layoutResult: apiState.layout,
          deviceEntityList: apiState.deviceEntityList,
        }
      },
      optimizedPlan: async (_projectId, _fmmPathResultIndex, clearAll) => {
        planningCallOrder.push('optimizedPlan')
        layoutPlanCalls.push({ mode: 'optimized', clearAll })
        return {
          layoutResult: apiState.layout,
          deviceEntityList: apiState.deviceEntityList,
        }
      },
      simulationPlan: async () => apiState.simulation,
      queryFixed: async () => {
        fixedQueryCalls += 1
        return apiState.layout
      },
      queryOptimized: async () => apiState.layout,
      querySimulation: async () => {
        simulationQueryCalls += 1
        return null
      },
    },
    platformPlanConfigApi: {
      saveChannelConfig: async payload => {
        planningCallOrder.push('saveChannelConfig')
        savedChannelConfig = payload
        return true
      },
      searchChannelConfig: async () => {
        planningCallOrder.push('searchChannelConfig')
        if (!savedChannelConfig) return null
        const { projectId, ...config } = savedChannelConfig
        return config
      },
      saveOptimization: async payload => {
        planningCallOrder.push('saveOptimization')
        savedOptimizationConfig = payload
        return true
      },
      saveSpanKm: async () => {
        planningCallOrder.push('saveSpanKm')
        return true
      },
    },
  },
})

expect(
  service.isPlatformChannelConfigComplete({
    channelCount: '96',
    launchPowerDbm: null,
    channelFrequenciesThz: null,
  }) === false,
  'null WDM vectors were treated as a complete saved channel config',
)

const request = {
  projectId: 123,
  fmmPathResultIndex: 2,
  clearAll: false,
  linkId: 'route-1',
  linkName: 'A ⇄ B',
  totalLengthKm: 160,
  fiberModel: 'GN',
  amplifierModel: 'EDFA_Simple',
  fiberParams: {
    attenuation: 0.165,
    effectiveArea: 130,
    dispersion: 20.5,
    dispersionSlope: 0.06,
    nonlinearIndex: 2.6,
    nonlinearCoeff: 0.8,
  },
  amplifierParams: {
    gain: 18,
    noiseFigure: 4.8,
    maxOutputPower: 21,
    saturationPower: 23,
  },
  channelConfig: {
    channelCount: 2,
    baudRateGbaud: 64,
    modulationFormat: '16QAM',
    launchPowerDbm: [-1.5, -1.5],
    channelFrequenciesThz: [193.075, 193.125],
    initialAseNoiseDbm: -90,
    initialNliNoiseDbm: -90,
    centerFrequencyThz: 193.1,
    channelSpacingGhz: 50,
  },
  optimizationConfig: {
    targetGsnrDb: 14,
    targetOsnrDb: 16,
    osnrMarginDb: 1,
    spanMinKm: 40,
    spanMaxKm: 120,
    spanStepKm: 5,
    minSpanLimitKm: 30,
    maxSpanLimitKm: 100,
    optimizationTarget: 'min_amp',
  },
  spanKm: 80,
  spanStrategy: { mode: 'fixed' },
  constraints: { maxSpanLength: 100, minSpanLength: 30, osnrMargin: 1 },
  buConfigs: [],
  deviceSequence: [],
}

const direct = service.normalizePlatformSimulationCache({
  metrics: {
    gsnr_matrix_db: [[18, 17], [16, 15]],
    osnr_matrix_db: [[25, 24], [23, 22]],
    snr_ase_matrix_db: [[25, 24], [23, 22]],
    snr_nli_matrix_db: [[20, 19], [18, 17]],
  },
  positions: { names: ['Tx', 'Rx'], distances_km: [0, 160], span_ids: ['span_01'] },
  channels: { ids: ['Ch1', 'Ch2'], frequencies_thz: [193.075, 193.125] },
  summary: {
    final_gsnr: { min_db: 15, avg_db: 16.5, max_db: 18 },
    final_osnr: { min_db: 22, avg_db: 23.5 },
    total_length_km: 160,
    total_span_count: 1,
  },
}, request)
expect(direct?.summary.final_gsnr?.min_db === 15, 'explicit backend summary was not preserved')
expect(direct?.positions.distances_km[1] === 160, 'direct positions were not preserved')

const snakeWrapped = service.normalizePlatformSimulationCache({
  data: JSON.stringify({
    result: {
      performance_matrices: {
        gsnr_matrix_db: [[19, 18], [17, 16]],
        osnr_matrix_db: [[26, 25], [24, 23]],
        snr_ase_matrix_db: [[26, 25], [24, 23]],
        snr_nli_matrix_db: [[22, 21], [20, 19]],
      },
      positions: { span_ids: ['span_01'] },
      channels: { ids: ['Ch1', 'Ch2'], frequencies_thz: [193.075, 193.125] },
      node_metadata: [
        { node_id: 'tx', node_name: 'Tx', position_km: 0 },
        { node_id: 'rx', node_name: 'Rx', position_km: 160 },
      ],
    },
  }),
}, request)
expect(snakeWrapped?.metrics.gsnr_matrix_db[1][1] === 16, 'nested snake_case result was not unwrapped')
expect(snakeWrapped?.positions.names[1] === 'rx', 'snake_case node metadata was not normalized')
expect(
  snakeWrapped?.summary.final_gsnr === undefined && snakeWrapped?.summary.final_osnr === undefined,
  'summary values were derived from metric matrices instead of explicit backend fields',
)

const fromPower = service.normalizePlatformSimulationCache({
  power_matrices: {
    signal_power_dbm: [[0, -1], [0, -1]],
    ase_noise_power_dbm: [[-20, -21], [-18, -19]],
    nli_noise_power_dbm: [[-25, -26], [-23, -24]],
  },
}, request)
expect(fromPower === null, 'power matrices were still converted into frontend-derived GSNR/OSNR metrics')

apiState.layout = {
  total_length_km: '160.0',
  span_km_used: '80.0',
  nodes: [
    { node_id: '0', node_type: 'Tx', position_km: '0.0', node_name: 'Tx0' },
    { node_id: '1', node_type: 'Amplifier', position_km: '80.0', node_name: 'Amplifier1' },
    { node_id: '2', node_type: 'Rx', position_km: '160.0', node_name: 'Rx2' },
  ],
  spans: [
    { span_index: '0', start_node_id: '0', end_node_id: '1', length_km: '80.0' },
    { span_index: '1', start_node_id: '1', end_node_id: '2', length_km: '80.0' },
  ],
  amplifier_placement: [
    { node_id: '1', node_type: 'Amplifier', position_km: '80.0', node_name: 'Amplifier1' },
  ],
  meta: { status: 'success', node_count: '3', amplifier_count: '1' },
}
apiState.deviceEntityList = [{ id: 901, name: 'AMP-01', deviceTypeCd: 'AMP' }]
apiState.simulation = {
  span_scan_result: {
    target_gsnr_db: 14,
    span_lengths_km: [70, 80, 90],
    recommended_span_km: 80,
    feasible_range_km: [70, 80],
    scan_points: [
      {
        span_length_km: 70,
        gsnr_per_channel_db: [15, 14.5],
        osnr_per_channel_db: [20, 19.5],
        avg_gsnr_db: 14.75,
        min_gsnr_db: 14.5,
        avg_osnr_db: 19.75,
        meet_target: true,
        gsnr_margin_db: 0.5,
      },
      {
        span_length_km: 80,
        gsnr_per_channel_db: [17, 16.5],
        osnr_per_channel_db: [21, 20.5],
        avg_gsnr_db: 16.75,
        min_gsnr_db: 16.5,
        avg_osnr_db: 20.75,
        meet_target: true,
        gsnr_margin_db: 2.5,
      },
      {
        span_length_km: 90,
        gsnr_per_channel_db: [13, 12.5],
        osnr_per_channel_db: [19, 18.5],
        avg_gsnr_db: 12.75,
        min_gsnr_db: 12.5,
        avg_osnr_db: 18.75,
        meet_target: false,
        gsnr_margin_db: -1.5,
      },
    ],
  },
}
const fixedPlansBeforeOptimized = fixedPlanCalls
const response = await service.runSimulation({
  ...request,
  spanStrategy: { mode: 'scan', scanRange: { min: 70, max: 90, step: 10 } },
})
expect(
  planningCallOrder.indexOf('saveChannelConfig') >= 0
    && planningCallOrder.indexOf('searchChannelConfig') > planningCallOrder.indexOf('saveChannelConfig')
    && planningCallOrder.indexOf('searchChannelConfig') < planningCallOrder.indexOf('optimizedPlan')
    && planningCallOrder.indexOf('saveChannelConfig') < planningCallOrder.indexOf('optimizedPlan'),
  'optimized layout started before WDM channel config was saved and verified',
)
expect(response.spanScanResult?.recommendedSpanKm === 80, 'backend recommended Span was not preserved')
expect(
  JSON.stringify(response.spanScanResult?.feasibleRange) === JSON.stringify([70, 80]),
  'backend feasible Span range was not preserved',
)
expect(simulationQueryCalls === 0, 'direct simulation result should not trigger a query')
expect(fixedPlanCalls === fixedPlansBeforeOptimized, 'optimized layout unexpectedly triggered a frontend fixed-plan retry')
expect(response.constraintAdjusted === false, 'frontend reported a locally adjusted optimized layout')
expect(
  JSON.stringify(savedOptimizationConfig) === JSON.stringify({
    projectId: request.projectId,
    ...request.optimizationConfig,
  }),
  'complete optimization config was not forwarded to planConfig/saveOptimization',
)
expect(response.layoutResult === apiState.layout, 'optimized layout response envelope was not unpacked')
expect(response.deviceEntityList[0]?.id === 901, 'generated device entities were not returned')
expect(
  layoutPlanCalls.some(call => call.mode === 'optimized' && call.clearAll === false),
  'optimized layout did not receive clearAll=false',
)

const nestedLayout = layoutUtils.parsePlanningLayoutResult({
  data: {
    layoutResult: JSON.stringify(apiState.layout),
    deviceEntityList: apiState.deviceEntityList,
  },
}, 'fixed')
expect(nestedLayout?.totalLengthKm === 160, 'nested layoutResult envelope was not normalized')

apiState.simulation = null
apiState.fixedStart = { layoutResult: null, deviceEntityList: [] }
const fixedQueryCallsBefore = fixedQueryCalls
const withoutSimulation = await service.runSimulation({
  ...request,
  clearAll: true,
  spanStrategy: { mode: 'fixed' },
})
expect(withoutSimulation.success === true, 'layout should succeed when simulation data is null')
expect(withoutSimulation.detailedResult == null, 'null simulation data should remain unavailable')
expect(simulationQueryCalls === 1, 'null simulation data should trigger only one fallback query')
expect(fixedQueryCalls === fixedQueryCallsBefore + 1, 'empty fixed envelope did not query the bare layout result')
expect(withoutSimulation.layoutResult === apiState.layout, 'bare fixed query result was not preserved')
expect(withoutSimulation.deviceEntityList.length === 0, 'bare fixed query result created device entities')
expect(
  layoutPlanCalls.some(call => call.mode === 'fixed' && call.clearAll === true),
  'fixed layout did not receive clearAll=true',
)

const analysisSource = fs.readFileSync(
  path.join(root, 'src/modules/design/dialogs/SimulationAnalysisDialog.vue'),
  'utf8',
)
expect(!analysisSource.includes('simulationDataBuilder'), 'simulation analysis still imports the frontend simulator')
expect(!analysisSource.includes('const runSimulation'), 'simulation analysis still exposes a frontend recalculation path')
expect(!analysisSource.includes('updateSimulationCache'), 'simulation analysis still mutates the backend simulation cache')
expect(
  analysisSource.includes('const value = settingsStore.simulationCache')
    && analysisSource.includes('return value?.is_valid ? value : null'),
  'simulation analysis is not reading the authoritative backend cache',
)
expect(
  !fs.existsSync(path.join(root, 'src/services/simulationDataBuilder.ts')),
  'frontend simulationDataBuilder algorithm file still exists',
)

console.log('system planning result normalization verification passed')
