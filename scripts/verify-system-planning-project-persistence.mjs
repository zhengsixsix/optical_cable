import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createPinia, setActivePinia } from 'pinia'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(projectRoot, '.planning-persistence-test-'))
const compiledEntry = join(temporaryDirectory, 'planning-persistence.mjs')

const runtimeEntry = `
  export { projectFileService } from './src/services/ProjectFileService.ts'
  export { useSettingsStore } from './src/stores/settings.ts'
`

const timestamp = '2026-07-27T08:00:00.000Z'
const simulationCache = {
  is_valid: true,
  timestamp,
  route_ref: { from_station: 'A', to_station: 'B', route_hash: 'route-hash' },
  model_selection: { fiber_model_id: 'GN', edfa_model_id: 'EDFA_Simple', bu_model_id: null },
  positions: { count: 2, names: ['A', 'B'], distances_km: [0, 120], span_ids: ['span-1'] },
  channels: { count: 3, ids: ['CH-1', 'CH-2', 'CH-3'], frequencies_thz: [193, 193.05, 193.1] },
  metrics: { gsnr_db: [[18, 17, 16]], osnr_db: [[21, 20, 19]] },
  summary: { total_span_count: 1, system_capacity_tbps: 1.2 },
}
const systemPlanningCache = {
  is_valid: true,
  timestamp,
  route_ref: { from_station: 'A', to_station: 'B', route_hash: 'route-hash' },
  config_hash: 'config-hash',
  device_selection: { fiber_spec_id: 'fiber-1', edfa_spec_id: 'edfa-1', bu_spec_id: null },
  model_selection: { fiber_model_id: 'GN', edfa_model_id: 'EDFA_Simple', bu_model_id: null },
  sweep_config: { span_min_km: 40, span_max_km: 120, span_step_km: 5 },
  sweep_results: { points: [] },
  user_decision: null,
  final_plan_cache: null,
}
const platformPlanningResults = {
  fixed: { mode: 'fixed', spans: [{ lengthKm: 60 }] },
  optimized: { mode: 'optimized', spans: [{ lengthKm: 55 }] },
  simulation: { metrics: { gsnr: 18 } },
  errors: [],
}
const platformPlanConfigSnapshot = {
  scope: { topLeftLng: 100, topLeftLat: 40, bottomRightLng: 120, bottomRightLat: 20 },
  gridResolution: 250,
  enableRedundancy: true,
  channelConfig: {
    channelCount: 3,
    baudRateGbaud: 72,
    modulationFormat: 'DP-QPSK',
    launchPowerDbm: [-2, -1, 0],
    channelFrequenciesThz: [193, 193.05, 193.1],
    initialAseNoiseDbm: -91,
    initialNliNoiseDbm: -92,
    centerFrequencyThz: 193.05,
    channelSpacingGhz: 50,
  },
  optimization: {
    targetGsnrDb: 14,
    targetOsnrDb: 16,
    osnrMarginDb: 2,
    spanMinKm: 40,
    spanMaxKm: 120,
    spanStepKm: 5,
    minSpanLimitKm: 30,
    maxSpanLimitKm: 100,
    optimizationTarget: 'max_gsnr',
  },
  spanKm: 60,
  errors: [],
  form: {
    routeId: 'route-1',
    fiberModel: 'GN',
    amplifierModel: 'EDFA_Simple',
    fiberTypeId: 'fiber-1',
    amplifierTypeId: 'edfa-1',
    fiberParams: {},
    amplifierParams: {},
    ssfmParams: { stepSize: 100, samplePoints: 4096, maxIterations: 1000 },
    spanStrategy: 'fixed',
    spanKm: 60,
    spanScanConfig: { min: 40, max: 120, step: 5 },
    optimizationTarget: 'max_gsnr',
    constraints: { minSpanLength: 30, maxSpanLength: 100, osnrMargin: 2 },
    launchPowerMode: 'per_channel',
    launchPowerGroups: { lower: -2, center: -1, upper: 0 },
    savedAt: timestamp,
  },
}

try {
  await build({
    stdin: {
      contents: runtimeEntry,
      resolveDir: projectRoot,
      sourcefile: 'planning-persistence-verification.ts',
      loader: 'ts',
    },
    outfile: compiledEntry,
    bundle: true,
    external: ['vue', 'pinia', 'jszip'],
    define: { 'import.meta.env': '{}' },
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })

  const storage = new Map()
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
    key: index => [...storage.keys()][index] ?? null,
    get length() { return storage.size },
  }

  setActivePinia(createPinia())
  const runtime = await import(pathToFileURL(compiledEntry).href)
  const settingsStore = runtime.useSettingsStore()

  settingsStore.updateWDMPlanningParams({
    channelCount: 3,
    centerFreqTHz: 193.05,
    channelSpacingGHz: 50,
    baudRateGbaud: 72,
    modulation: 'DP-QPSK',
    launchPower: -2,
    shapingMoments: { moment4: 1.4, moment6: 2.1 },
    vectorParams: {
      launchPowerVector: [-2, -1, 0],
      initialAseVector: [-91, -91, -91],
      initialNliVector: [-92, -92, -92],
    },
  })
  settingsStore.updateSimulationCache(simulationCache)
  settingsStore.updateSystemPlanningCache(systemPlanningCache)
  settingsStore.updatePlatformPlanningResults(platformPlanningResults)
  settingsStore.updatePlatformPlanConfigSnapshot(platformPlanConfigSnapshot)

  const project = runtime.projectFileService.createUSEProjectData('Planning persistence', true)
  project.metadata.creator_user_id = ''
  assert.equal(project.system_engineering.wdm_config.channel_count, 3)
  assert.deepEqual(project.system_engineering.wdm_config.launch_power_vector, [-2, -1, 0])
  assert.deepEqual(project.system_engineering.simulation_cache, simulationCache)
  assert.deepEqual(project.system_engineering.system_planning_cache, systemPlanningCache)
  assert.deepEqual(project._app_extensions.designCache.wdmConfig, project.system_engineering.wdm_config)
  assert.deepEqual(project._app_extensions.designCache.simulationCache, simulationCache)
  assert.deepEqual(project._app_extensions.designCache.systemPlanningCache, systemPlanningCache)
  assert.deepEqual(project._app_extensions.designCache.platformPlanningResults, platformPlanningResults)
  assert.deepEqual(project._app_extensions.designCache.platformPlanConfigSnapshot, platformPlanConfigSnapshot)

  settingsStore.updateWDMPlanningParams({ channelCount: 1, launchPower: 99 })
  settingsStore.updateSimulationCache({ ...simulationCache, route_ref: { ...simulationCache.route_ref, route_hash: 'stale' } })
  settingsStore.updateSystemPlanningCache({ ...systemPlanningCache, config_hash: 'stale' })
  settingsStore.updatePlatformPlanningResults(null)
  settingsStore.updatePlatformPlanConfigSnapshot(null)

  const importResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(project),
  ], 'planning-persistence.use', { type: 'application/json' }))
  assert.equal(importResult.success, true, importResult.error)
  assert.equal(settingsStore.systemPlanningConfig.wdmParams.channelCount, 3)
  assert.equal(settingsStore.systemPlanningConfig.wdmParams.centerFreqTHz, 193.05)
  assert.deepEqual(settingsStore.systemPlanningConfig.wdmParams.vectorParams.launchPowerVector, [-2, -1, 0])
  assert.deepEqual(settingsStore.simulationCache, simulationCache)
  assert.deepEqual(settingsStore.systemPlanningCache, systemPlanningCache)
  assert.deepEqual(settingsStore.platformPlanningResults, platformPlanningResults)
  assert.deepEqual(settingsStore.platformPlanConfigSnapshot, platformPlanConfigSnapshot)

  const extensionOnly = JSON.parse(JSON.stringify(project))
  delete extensionOnly.system_engineering.wdm_config
  extensionOnly.system_engineering.simulation_cache = null
  extensionOnly.system_engineering.system_planning_cache = null
  extensionOnly._app_extensions.designCache.wdmConfig.channel_count = 2
  extensionOnly._app_extensions.designCache.wdmConfig.launch_power_vector = [-4, -3]
  extensionOnly._app_extensions.designCache.wdmConfig.initial_ase_vector = [-93, -93]
  extensionOnly._app_extensions.designCache.wdmConfig.initial_nli_vector = [-94, -94]

  const extensionResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(extensionOnly),
  ], 'extension-cache.use', { type: 'application/json' }))
  assert.equal(extensionResult.success, true, extensionResult.error)
  assert.equal(settingsStore.systemPlanningConfig.wdmParams.channelCount, 2)
  assert.deepEqual(settingsStore.systemPlanningConfig.wdmParams.vectorParams.launchPowerVector, [-4, -3])
  assert.deepEqual(settingsStore.simulationCache, simulationCache)
  assert.deepEqual(settingsStore.systemPlanningCache, systemPlanningCache)

  const legacySnapshotProject = JSON.parse(JSON.stringify(project))
  delete legacySnapshotProject._app_extensions.designCache.wdmConfig
  legacySnapshotProject.system_engineering.wdm_config.channel_count = 96
  legacySnapshotProject.system_engineering.wdm_config.launch_power_vector = Array(96).fill(-20)
  legacySnapshotProject.system_engineering.wdm_config.initial_ase_vector = Array(96).fill(-60)
  legacySnapshotProject.system_engineering.wdm_config.initial_nli_vector = Array(96).fill(-200)

  const legacySnapshotResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(legacySnapshotProject),
  ], 'legacy-channel-snapshot.use', { type: 'application/json' }))
  assert.equal(legacySnapshotResult.success, true, legacySnapshotResult.error)
  assert.equal(
    settingsStore.systemPlanningConfig.wdmParams.channelCount,
    3,
    'legacy channel snapshot did not override the stale standard WDM template',
  )
  assert.deepEqual(settingsStore.systemPlanningConfig.wdmParams.vectorParams.launchPowerVector, [-2, -1, 0])

  const emptyProject = runtime.projectFileService.createUSEProjectData('Empty planning state', true)
  emptyProject.metadata.creator_user_id = ''
  emptyProject.system_engineering.simulation_cache = null
  emptyProject.system_engineering.system_planning_cache = null
  emptyProject._app_extensions.designCache.simulationCache = null
  emptyProject._app_extensions.designCache.systemPlanningCache = null
  emptyProject._app_extensions.designCache.platformPlanningResults = null
  emptyProject._app_extensions.designCache.platformPlanConfigSnapshot = null
  settingsStore.updateSimulationCache(simulationCache)
  settingsStore.updateSystemPlanningCache(systemPlanningCache)
  settingsStore.updatePlatformPlanningResults(platformPlanningResults)
  settingsStore.updatePlatformPlanConfigSnapshot(platformPlanConfigSnapshot)

  const emptyResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(emptyProject),
  ], 'empty-planning-state.use', { type: 'application/json' }))
  assert.equal(emptyResult.success, true, emptyResult.error)
  assert.equal(settingsStore.simulationCache, null, 'simulation cache leaked from the previous project')
  assert.equal(settingsStore.systemPlanningCache, null, 'system planning cache leaked from the previous project')
  assert.equal(settingsStore.platformPlanningResults, null, 'platform results leaked from the previous project')
  assert.equal(settingsStore.platformPlanConfigSnapshot, null, 'plan config snapshot leaked from the previous project')

  settingsStore.updateSimulationCache(simulationCache)
  settingsStore.updateSystemPlanningCache(systemPlanningCache)
  settingsStore.updatePlatformPlanningResults(platformPlanningResults)
  settingsStore.updatePlatformPlanConfigSnapshot(platformPlanConfigSnapshot)
  runtime.projectFileService.closeProject()
  assert.equal(settingsStore.simulationCache, null, 'closing a project did not clear simulation cache')
  assert.equal(settingsStore.systemPlanningCache, null, 'closing a project did not clear system planning cache')
  assert.equal(settingsStore.platformPlanningResults, null, 'closing a project did not clear platform results')
  assert.equal(settingsStore.platformPlanConfigSnapshot, null, 'closing a project did not clear plan config snapshot')

  const managerSource = await readFile(join(projectRoot, 'src/composables/useProjectManager.ts'), 'utf8')
  const createProjectSource = managerSource.match(
    /async function createProject[\s\S]*?\n  return \{/,
  )?.[0] ?? ''
  assert.match(
    createProjectSource,
    /if \(hasOpenProject\.value\)[\s\S]*?closeProject\(\)[\s\S]*?else \{\s*settingsStore\.resetProjectSettings\(\)/,
    'creating a project without an active appStore project can retain localStorage planning caches',
  )

  console.log('System planning project persistence verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
