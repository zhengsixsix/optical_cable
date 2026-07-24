import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createPinia, setActivePinia } from 'pinia'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(projectRoot, '.project-import-test-'))
const compiledEntry = join(temporaryDirectory, 'project-import.mjs')

const runtimeEntry = `
  export { projectFileService } from './src/services/ProjectFileService.ts'
  export { useRPLStore } from './src/stores/rpl.ts'
  export { useSLDStore } from './src/stores/sld.ts'
  export { useConnectorStore } from './src/stores/connector.ts'
  export { useMonitorStore } from './src/stores/monitor.ts'
  export { useRouteStore } from './src/stores/route.ts'
  export { useCableSegmentStore } from './src/stores/cableSegment.ts'
  export { convertAlgorithmRouteBundle } from './src/services/RouteDataConverter.ts'
`

try {
  await build({
    stdin: {
      contents: runtimeEntry,
      resolveDir: projectRoot,
      sourcefile: 'project-import-verification.ts',
      loader: 'ts',
    },
    outfile: compiledEntry,
    bundle: true,
    external: ['vue', 'pinia', 'jszip'],
    define: {
      'import.meta.env': '{}',
    },
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
  const rplStore = runtime.useRPLStore()
  const sldStore = runtime.useSLDStore()
  const connectorStore = runtime.useConnectorStore()
  const monitorStore = runtime.useMonitorStore()
  const routeStore = runtime.useRouteStore()
  const cableSegmentStore = runtime.useCableSegmentStore()

  const now = new Date('2026-07-23T00:00:00.000Z')
  rplStore.replaceTables([{
    id: 'old-rpl',
    name: 'Old RPL',
    routeId: 'old-route',
    records: [],
    metadata: {
      totalLength: 0,
      totalCableLength: 0,
      landingStations: 0,
      repeaters: 0,
      branchingUnits: 0,
      joints: 0,
      averageDepth: 0,
      maxDepth: 0,
      minDepth: 0,
    },
    createdAt: now,
    updatedAt: now,
  }])
  rplStore.setCurrentTableId('old-rpl')
  sldStore.replaceTables([{
    id: 'old-sld',
    name: 'Old SLD',
    routeId: 'old-route',
    equipments: [],
    fiberSegments: [],
    transmissionParams: {},
    createdAt: now,
    updatedAt: now,
  }])
  sldStore.setCurrentTableId('old-sld')
  connectorStore.replaceTables([{
    id: 'old-connector',
    name: 'Old Connector',
    routeId: 'old-route',
    elements: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }])
  connectorStore.setCurrentTableId('old-connector')
  monitorStore.replaceAlarmHistory([{
    id: 1,
    time: now.toISOString(),
    device: 'old-device',
    message: 'old-alarm',
    level: 'warning',
    status: 'active',
  }])
  routeStore.setParetoRoutes([{
    id: 'old-route',
    name: 'Old Route',
    points: [],
    segments: [],
    totalLength: 0,
    totalCost: 0,
    riskScore: 0,
    cost: { cable: 0, installation: 0, equipment: 0, total: 0 },
    risk: { seismic: 0, volcanic: 0, depth: 0, overall: 0 },
    distance: 0,
    createdAt: now,
    updatedAt: now,
  }])
  cableSegmentStore.setSegments([{
    id: 'old-segment',
    routeId: 'old-route',
    startKp: 0,
    endKp: 1,
    length: 1,
    riskLevel: 'low',
    cableTypeId: 'LW',
    cableTypeName: 'LW',
    armorType: '轻铠',
    slack: 0,
    burialDepth: 0,
    isLocked: false,
  }])

  const emptyProject = runtime.projectFileService.createUSEProjectData('Empty project', true)
  emptyProject.metadata.creator_user_id = ''
  emptyProject.route_engineering.geometry_pool = []
  emptyProject.route_engineering.key_events = []
  emptyProject.route_engineering.segments = []
  emptyProject.route_engineering.spans = []
  emptyProject._app_extensions.routePlanning.rplTables = []
  emptyProject._app_extensions.routePlanning.routes = []
  emptyProject._app_extensions.transmissionPlanning.sldTables = []
  emptyProject._app_extensions.connectorTables = []
  emptyProject._app_extensions.monitorData = { devices: [], alarmHistory: [] }
  emptyProject._app_extensions.cableSegments = { segments: [], currentRouteId: null }

  const emptyResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(emptyProject),
  ], 'empty-project.use', { type: 'application/json' }))
  assert.equal(emptyResult.success, true, emptyResult.error)
  assert.equal(rplStore.tables.length, 0, 'empty project should not retain the previous RPL table')
  assert.equal(sldStore.tables.length, 0, 'empty project should not retain the previous SLD table')
  assert.equal(connectorStore.tables.length, 0, 'empty project should not retain the previous connector table')
  assert.equal(monitorStore.alarmHistory.length, 0, 'empty project should not retain alarms')
  assert.equal(routeStore.routes.length, 0, 'empty project should not retain routes')
  assert.equal(cableSegmentStore.segments.length, 0, 'empty project should not retain cable segments')

  const fallbackProject = runtime.projectFileService.createUSEProjectData('Monitor fallback', true)
  fallbackProject.metadata.creator_user_id = ''
  delete fallbackProject._app_extensions.connectorTables
  fallbackProject._app_extensions.monitorData = {
    devices: [{
      id: 'monitor-device',
      name: 'Monitor device',
      type: 'amplifier_e',
      longitude: 120,
      latitude: 30,
      depth: 1000,
      kp: 10,
    }, {
      id: 'monitor-device-2',
      name: 'Monitor device 2',
      type: 'landing',
      longitude: 121,
      latitude: 31,
      depth: 2000,
      kp: 30,
    }],
    alarmHistory: [],
  }

  const fallbackResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(fallbackProject),
  ], 'monitor-fallback.use', { type: 'application/json' }))
  assert.equal(fallbackResult.success, true, fallbackResult.error)
  assert.equal(connectorStore.elements.length, 0, 'monitor telemetry must not create connector devices')
  assert.equal(monitorStore.devices.length, 0, 'telemetry without explicit connector identity must remain hidden')
  assert.equal(routeStore.routes.length, 0, 'monitor telemetry must not create a display route')
  assert.equal(rplStore.tables.length, 0, 'monitor telemetry must not create RPL data')
  assert.equal(cableSegmentStore.segments.length, 0, 'monitor telemetry must not create cable segments')

  const geometryProject = runtime.projectFileService.createUSEProjectData('Geometry fallback', true)
  geometryProject.metadata.creator_user_id = ''
  geometryProject.route_engineering.geometry_pool = [
    [120, 30, -100, 0],
    [121, 31, -2000, 25],
  ]
  geometryProject.route_engineering.key_events = [{
    event_id: 'geometry-start',
    type: 'LandStation',
    geo_index: 0,
    name: 'Geometry start',
  }, {
    event_id: 'geometry-end',
    type: 'LandStation',
    geo_index: 1,
    name: 'Geometry end',
  }]
  geometryProject.route_engineering.segments = [{
    segment_id: 'geometry-segment',
    geometry_range: {
      start_index: 0,
      end_index: 1,
      start_km: 0,
      end_km: 25,
      length_km: 25,
    },
    is_locked: false,
  }]
  geometryProject.route_engineering.spans = []
  geometryProject._app_extensions.routePlanning.routes = []
  geometryProject._app_extensions.connectorTables = []
  geometryProject._app_extensions.monitorData = { devices: [], alarmHistory: [] }

  const geometryResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(geometryProject),
  ], 'geometry-fallback.use', { type: 'application/json' }))
  assert.equal(geometryResult.success, true, geometryResult.error)
  assert.equal(routeStore.routes.length, 0, 'geometry_pool must not create a route result')
  assert.equal(rplStore.tables.length, 0, 'route engineering geometry must not create RPL data')
  assert.equal(connectorStore.elements.length, 0, 'key events must not create connector devices')
  assert.equal(cableSegmentStore.segments.length, 0, 'engineering segments must not create cable segments')

  const snapshotProject = runtime.projectFileService.createUSEProjectData('Connector snapshot', true)
  snapshotProject.metadata.creator_user_id = ''
  snapshotProject._app_extensions.connectorTables = [{
    id: 'snapshot-table',
    name: 'Snapshot table',
    routeId: 'route-main',
    elements: [{
      id: 'snapshot-device',
      name: 'Snapshot device',
      type: 'joint',
      longitude: 121,
      latitude: 31,
      depth: 900,
      kp: 20,
      status: 'active',
      specifications: '',
      remarks: '',
    }],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }]
  snapshotProject._app_extensions.monitorData = {
    devices: [{
      id: 'snapshot-device',
      status: 'warning',
      inputPower: -3.2,
      outputPower: 8.4,
      pumpCurrent: 1.1,
      pfeVoltage: 9.2,
      pfeCurrent: 0.7,
      temperature: 41,
    }],
    alarmHistory: [],
  }
  snapshotProject._app_extensions.routePlanning.routes = [{
    id: 'snapshot-route',
    name: 'Snapshot route',
    points: [],
    segments: [],
    totalLength: 12,
    totalCost: 345,
    riskScore: 0.25,
    cost: { total: 345 },
    risk: { overall: 0.25 },
    distance: 12,
    createdAt: now,
    updatedAt: now,
  }]

  const snapshotResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(snapshotProject),
  ], 'connector-snapshot.use', { type: 'application/json' }))
  assert.equal(snapshotResult.success, true, snapshotResult.error)
  assert.equal(connectorStore.elements.length, 1)
  assert.equal(connectorStore.elements[0].id, 'snapshot-device', 'connector snapshot should win over monitor fallback')
  assert.equal(routeStore.routes[0].id, 'snapshot-route', 'routeStore snapshot should win over display-only fallbacks')
  assert.equal(routeStore.routes[0].totalCost, 345, 'real route planning fields must be restored verbatim')
  assert.notEqual(routeStore.routes[0].displayOnly, true)
  assert.equal(monitorStore.devices.length, 1, 'explicit runtime snapshot should join its connector identity')
  assert.equal(monitorStore.devices[0].status, 'warning')
  assert.equal(monitorStore.devices[0].inputPower, -3.2)

  const algorithmResult = runtime.convertAlgorithmRouteBundle({
    fmmPaths: [{
      real_trace: [[1, 121, 39], [2, 121.1, 39.1]],
      total_cost: 100,
      total_risk: 10,
      length: 15,
    }, {
      real_trace: [[1, 122, 38], [2, 122.1, 38.1]],
      total_cost: 200,
      total_risk: 5,
      length: 16,
    }],
    riskBased: {
      route_index: 1,
      segment_nodes: [[1, 122, 38], [2, 122.1, 38.1]],
      segments: [{
        segment_id: 1,
        start_node_id: 1,
        end_node_id: 2,
        cable_type: 'BACKEND-CABLE',
        length_km: 16,
      }],
      risk_level: [{ level: 'BACKEND-RISK', risk_min: 2, risk_max: 3 }],
    },
    costText: '1 2 3 4',
    riskText: '5 6 7 8',
    source: 'persistence-verification',
    files: ['FMM_path_result.json', 'segment_result_base_Risk.json', 'cost.txt', 'risk.txt'],
  })
  routeStore.setAlgorithmRouteResult(algorithmResult)
  routeStore.selectRoute(algorithmResult.routes[1].id)

  const persistedRouteProject = runtime.projectFileService.createUSEProjectData('Route result persistence', true)
  const persistedRouteExtension = persistedRouteProject._app_extensions.routePlanning
  assert.equal(
    persistedRouteExtension.algorithmResult.rawResultFiles['cost.txt'],
    '1 2 3 4',
    'project export should store the raw route cost sequence',
  )
  assert.equal(
    persistedRouteExtension.algorithmResult.analysis.segmentResults[0].riskLevels[0].value,
    'BACKEND-RISK',
    'project export should store backend segment analysis without replacing its values',
  )
  assert.equal(persistedRouteExtension.selectedRouteId, algorithmResult.routes[1].id)

  const persistedRouteResult = await runtime.projectFileService.importProject(new File([
    JSON.stringify(persistedRouteProject),
  ], 'route-result-persistence.use', { type: 'application/json' }))
  assert.equal(persistedRouteResult.success, true, persistedRouteResult.error)
  assert.equal(routeStore.algorithmRouteResult.rawResultFiles['risk.txt'], '5 6 7 8')
  assert.equal(routeStore.algorithmRouteResult.routes.length, 2)
  assert.equal(routeStore.currentRouteId, algorithmResult.routes[1].id, 'selected Pareto route should survive project import')

  const invalidResult = await runtime.projectFileService.importProject(new File([
    'not valid JSON',
  ], 'invalid.use', { type: 'application/json' }))
  assert.equal(invalidResult.success, false)
  assert.equal(
    connectorStore.elements[0].id,
    'snapshot-device',
    'parse failures should leave the current project stores untouched',
  )
  assert.equal(routeStore.currentRouteId, algorithmResult.routes[1].id)

  const projectManagerSource = await readFile(join(projectRoot, 'src/composables/useProjectManager.ts'), 'utf8')
  const doOpenFileBlock = projectManagerSource.match(
    /async function doOpenFile[\s\S]*?\n  async function openProjectFromFile/,
  )?.[0] ?? ''
  assert.doesNotMatch(doOpenFileBlock, /clearParetoRoutes\(|clearSegments\(/)

  assert.doesNotMatch(projectManagerSource, /displayOnly:\s*true/)

  const projectFileSource = await readFile(join(projectRoot, 'src/services/ProjectFileService.ts'), 'utf8')
  assert.doesNotMatch(projectFileSource, /restoreMonitorDevicesToConnector/)
  assert.doesNotMatch(projectFileSource, /depth\s*<\s*500\s*\?\s*['"]high['"]/)
  assert.doesNotMatch(projectFileSource, /avgDepth\s*<\s*500/)
  assert.doesNotMatch(projectFileSource, /mapRiskLevel\(record\.riskLevel\s*\|\|\s*['"]low['"]\)/)
  assert.doesNotMatch(projectFileSource, /average_risk_value:\s*record\.avgRiskValue\s*\|\|/)
  assert.match(projectFileSource, /replaceRuntimeData\(ext\.monitorData\.devices \|\| \[\]\)/)

  console.log('Project import isolation verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
