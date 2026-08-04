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
const amplifierValueUtils = loadTsModule('src/utils/backendAmplifierValues.ts')
const analysisDialogSource = fs.readFileSync(
  path.join(root, 'src/modules/design/dialogs/SimulationAnalysisDialog.vue'),
  'utf8',
)
const designViewSource = fs.readFileSync(path.join(root, 'src/views/DesignView.vue'), 'utf8')

expect(
  analysisDialogSource.includes('linkCalcSummary?: LinkCalculationSummaryInput | null')
    && analysisDialogSource.includes('props.linkCalcSummary?.totalLength')
    && analysisDialogSource.includes('props.linkCalcSummary?.systemConfig?.spanCount')
    && analysisDialogSource.includes("source: '规划结果'")
    && analysisDialogSource.includes("source: '规划配置'"),
  'simulation analysis dialog does not expose planning values with explicit provenance',
)
expect(
  designViewSource.includes('spanCount?: number')
    && designViewSource.includes('(layout?.spans.length ? layout.spans.length : null)'),
  'design summary does not preserve the backend layout Span count',
)

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
  mode: 'optimized',
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
expect(
  snakeWrapped?.model_selection.fiber_model_id === ''
    && snakeWrapped?.model_selection.edfa_model_id === '',
  'missing backend model_selection was hidden by request-side model values',
)

const fromPower = service.normalizePlatformSimulationCache({
  power_matrices: {
    signal_power_dbm: [[0, -1], [0, -1]],
    ase_noise_power_dbm: [[-20, -21], [-18, -19]],
    nli_noise_power_dbm: [[-25, -26], [-23, -24]],
  },
}, request)
expect(fromPower === null, 'incomplete simulation data without node positions was accepted')

const platformSimulation = service.normalizePlatformSimulationCache({
  data: {
    node_metadata: [
      { node_index: '0', node_type: 'Tx', node_name: 'Tx', position_km: '0.0' },
      { node_index: '1', node_type: 'Rx', node_name: 'Rx', position_km: '160.0' },
    ],
    performance_matrices: {
      signal_power_dbm: [[0, -1], [-2, -3]],
      ase_noise_power_dbm: [[-30, -31], [-28, -29]],
      nli_noise_power_dbm: [[-35, -36], [-33, -34]],
      osnr_per_channel_per_node_db: [[30, 30], [26, 26]],
      gsnr_per_channel_per_node_db: [[28.8, 28.8], [24.8, 24.8]],
    },
    end_statistics: {
      osnr_min_db: '26.0',
      osnr_max_db: '26.0',
      osnr_avg_db: '26.0',
      gsnr_min_db: '24.8',
      gsnr_max_db: '24.8',
      gsnr_avg_db: '24.8',
    },
    total_length_km: '160.0',
    span_count: '1',
    capacity_tbps: '38.4',
    model_selection: {
      fiber_model_id: 'fiber_segment',
      edfa_model_id: 'edfa_segment',
      bu_model_id: null,
    },
  },
}, {
  ...request,
  channelFrequenciesThz: request.channelConfig.channelFrequenciesThz,
  channelCenterFrequencyThz: request.channelConfig.centerFrequencyThz,
  channelSpacingGhz: request.channelConfig.channelSpacingGhz,
})
expect(platformSimulation?.metrics.gsnr_matrix_db[1][0] === 24.8, 'platform GSNR matrix alias was not normalized')
expect(platformSimulation?.metrics.osnr_matrix_db[1][0] === 26, 'platform OSNR matrix alias was not normalized')
expect(Number.isFinite(platformSimulation?.metrics.snr_ase_matrix_db[1][0]), 'ASE SNR was not derived from power matrices')
expect(Number.isFinite(platformSimulation?.metrics.snr_nli_matrix_db[1][0]), 'NLI SNR was not derived from power matrices')
expect(platformSimulation?.positions.distances_km[1] === 160, 'node_metadata positions were not normalized')
expect(platformSimulation?.positions.span_ids.length === 1, 'missing span IDs were not derived from adjacent nodes')
expect(platformSimulation?.channels.ids[0] === 'CH-001', 'missing channel IDs were not generated')
expect(platformSimulation?.channels.frequencies_thz[1] === 193.125, 'configured WDM frequencies were not preserved')
expect(platformSimulation?.summary.final_gsnr?.avg_db === 24.8, 'end_statistics GSNR summary was not normalized')
expect(platformSimulation?.summary.final_osnr?.min_db === 26, 'end_statistics OSNR summary was not normalized')
expect(platformSimulation?.summary.total_length_km === 160, 'root total_length_km was not mapped')
expect(platformSimulation?.summary.total_span_count === 1, 'root span_count was not mapped')
expect(platformSimulation?.summary.system_capacity_tbps === 38.4, 'root capacity_tbps was not mapped')
expect(platformSimulation?.model_selection.fiber_model_id === 'fiber_segment', 'backend fiber model was not mapped')
expect(platformSimulation?.model_selection.edfa_model_id === 'edfa_segment', 'backend EDFA model was not mapped')
expect(platformSimulation?.model_selection.bu_model_id === null, 'absent backend BU model did not remain null')

const backendAmplifierValues = amplifierValueUtils.readBackendAmplifierValues({
  id: 901,
  nodeId: '1',
  libraryId: 77,
  libraryName: 'Hybrid-CL',
  deviceValueList: [
    { configCode: 'amplifier_type', value: 'EDFA-C' },
    { configCode: 'nominal_gain_db', value: '20.0' },
    { configCode: 'noise_figure_db', value: '5.5' },
    { configCode: 'max_output_power_dbm', value: '17.0' },
  ],
})
expect(backendAmplifierValues?.deviceModel === 'Hybrid-CL', 'backend amplifier library model was not mapped')
expect(backendAmplifierValues?.amplifierType === 'EDFA-C', 'backend amplifier_type was not mapped')
expect(backendAmplifierValues?.nominalGainDb === 20, 'backend nominal_gain_db was not mapped')
expect(backendAmplifierValues?.noiseFigureDb === 5.5, 'backend noise_figure_db was not mapped')
expect(backendAmplifierValues?.maxOutputPowerDbm === 17, 'backend max_output_power_dbm was not mapped')
expect(backendAmplifierValues?.gainDb === null, 'nominal gain was incorrectly treated as actual gain')
expect(backendAmplifierValues?.outputPowerDbm === null, 'maximum output power was incorrectly treated as actual output')

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
apiState.deviceEntityList = [{
  id: 901,
  name: 'AMP-01',
  deviceTypeCd: 'AMP',
  nodeId: '1',
  libraryId: 77,
  libraryName: 'Hybrid-CL',
  deviceValueList: [
    { configCode: 'nominal_gain_db', value: '20.0' },
    { configCode: 'noise_figure_db', value: '5.5' },
    { configCode: 'max_output_power_dbm', value: '17.0' },
  ],
}]
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
const optimizedResponse = await service.runOptimizedPlanning({
  projectId: request.projectId,
  fmmPathResultIndex: request.fmmPathResultIndex,
  clearAll: false,
})
expect(
  planningCallOrder.includes('optimizedPlan'),
  'optimized layout endpoint was not called',
)
expect(optimizedResponse.layoutResult === apiState.layout, 'optimized layout response envelope was not unpacked')
expect(optimizedResponse.deviceEntityList[0]?.id === 901, 'generated device entities were not returned')
expect(
  layoutPlanCalls.some(call => call.mode === 'optimized' && call.clearAll === false),
  'optimized layout did not receive clearAll=false',
)

const layoutCallsBeforeSimulation = layoutPlanCalls.length
const response = await service.runSimulation(request)
expect(response.spanScanResult?.recommendedSpanKm === 80, 'backend recommended Span was not preserved')
expect(
  JSON.stringify(response.spanScanResult?.feasibleRange) === JSON.stringify([70, 80]),
  'backend feasible Span range was not preserved',
)
expect(simulationQueryCalls === 0, 'direct simulation result should not trigger a query')
expect(fixedPlanCalls === fixedPlansBeforeOptimized, 'optimized layout unexpectedly triggered a frontend fixed-plan retry')
expect(
  layoutPlanCalls.length === layoutCallsBeforeSimulation,
  'physical simulation unexpectedly invoked a layout endpoint',
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
const fixedResponse = await service.runFixedPlanning({
  projectId: request.projectId,
  clearAll: true,
})
expect(fixedQueryCalls === fixedQueryCallsBefore + 1, 'empty fixed envelope did not query the bare layout result')
expect(fixedResponse.layoutResult === apiState.layout, 'bare fixed query result was not preserved')
expect(fixedResponse.deviceEntityList.length === 0, 'bare fixed query result created device entities')
expect(
  layoutPlanCalls.some(call => call.mode === 'fixed' && call.clearAll === true),
  'fixed layout did not receive clearAll=true',
)

const layoutCallsBeforeEmptySimulation = layoutPlanCalls.length
const withoutSimulation = await service.runSimulation({ ...request, mode: 'fixed' })
expect(withoutSimulation.success === true, 'physical simulation should complete when result data is null')
expect(withoutSimulation.detailedResult == null, 'null simulation data should remain unavailable')
expect(simulationQueryCalls === 1, 'null simulation data should trigger only one fallback query')
expect(
  layoutPlanCalls.length === layoutCallsBeforeEmptySimulation,
  'empty physical simulation unexpectedly retried fixed planning',
)

const analysisSource = fs.readFileSync(
  path.join(root, 'src/modules/design/dialogs/SimulationAnalysisDialog.vue'),
  'utf8',
)
const linkConfigSource = fs.readFileSync(
  path.join(root, 'src/modules/design/dialogs/LinkConfigDialog.vue'),
  'utf8',
)
const nextStepStart = linkConfigSource.indexOf('const goToNextStep = async () => {')
const nextStepEnd = linkConfigSource.indexOf('const goToPrevStep = () => {', nextStepStart)
const nextStepSource = linkConfigSource.slice(nextStepStart, nextStepEnd)
expect(
  nextStepSource.includes('await runSelectedLayoutPlanning(false)')
    && nextStepSource.includes('await startCalculation()')
    && nextStepSource.indexOf('await runSelectedLayoutPlanning(false)') < nextStepSource.indexOf('await startCalculation()'),
  'the original planning action does not automatically continue with physical simulation',
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
