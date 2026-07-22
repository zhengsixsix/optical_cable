import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()

function loadTsModule(relativePath) {
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
  vm.runInNewContext(
    output,
    {
      module,
      exports: module.exports,
      require: specifier => { throw new Error(`Unexpected runtime import ${specifier}`) },
    },
    { filename },
  )
  return module.exports
}

function expect(condition, label) {
  if (!condition) throw new Error(label)
}

const stationNames = loadTsModule('src/utils/routeStationNames.ts')
const layout = loadTsModule('src/utils/systemPlanningLayout.ts')
const icons = loadTsModule('src/utils/systemDesignIcons.ts')

const route = {
  id: 'route-1',
  name: '方案 1',
  points: [
    { id: 'start', type: 'landing', name: '算法起点', coordinates: [120, 30] },
    { id: 'middle', type: 'waypoint', name: '路径点', coordinates: [121, 31] },
    { id: 'end', type: 'landing', name: '算法终点', coordinates: [122, 32] },
  ],
}
const configuredRoute = stationNames.applyConfiguredStationNames(route, {
  startPoint: { name: '上海岸站', lon: 120, lat: 30 },
  endPoint: { name: '大连岸站', lon: 122, lat: 32 },
})
expect(configuredRoute.points[0].name === '上海岸站', 'configured start station name was not applied')
expect(configuredRoute.points[2].name === '大连岸站', 'configured end station name was not applied')

const specificNamesBeatPlaceholders = stationNames.resolveRouteStationNames({
  points: [
    { id: 'start', type: 'landing', name: '上海岸站', coordinates: [120, 30] },
    { id: 'end', type: 'landing', name: '大连岸站', coordinates: [122, 32] },
  ],
}, {
  startPoint: { name: '起点', lon: 120, lat: 30 },
  endPoint: { name: '终点', lon: 122, lat: 32 },
})
expect(specificNamesBeatPlaceholders.startName === '上海岸站', 'generic start placeholder replaced a saved station name')
expect(specificNamesBeatPlaceholders.endName === '大连岸站', 'generic end placeholder replaced a saved station name')

const reversed = stationNames.resolveRouteStationNames({
  points: [...route.points].reverse(),
}, {
  startPoint: { name: '上海岸站', lon: 120, lat: 30 },
  endPoint: { name: '大连岸站', lon: 122, lat: 32 },
})
expect(reversed.startPoint.id === 'start', 'reversed route did not resolve the configured start coordinate')
expect(reversed.endPoint.id === 'end', 'reversed route did not resolve the configured end coordinate')

const resolvedAmplifiers = layout.resolveLayoutAmplifiers({
  totalLengthKm: 160,
  spanKmUsed: 80,
  mode: 'fixed',
  nodes: [],
  spans: [],
  amplifiers: [],
  status: 'success',
  nodeCount: 5,
  amplifierCount: 3,
})
expect(resolvedAmplifiers.length === 3, 'declared amplifier count did not produce matching placements')
expect(resolvedAmplifiers.every(item => Number.isFinite(item.positionKm)), 'amplifier placement contains a non-finite KP')
expect(resolvedAmplifiers.every(item => item.positionKm > 0 && item.positionKm < 160), 'fallback amplifiers were not placed inside the route')

const parsedCountOnlyLayout = layout.parsePlanningLayoutResult({
  total_length_km: 180,
  span_km_used: 60,
  amplifier_placement: { total_edfa_count: 2 },
})
expect(parsedCountOnlyLayout?.amplifierCount === 2, 'nested amplifier count was not parsed')
expect(layout.resolveLayoutAmplifiers(parsedCountOnlyLayout).length === 2, 'count-only layout did not produce map placements')

const parsedNestedSpansLayout = layout.parsePlanningLayoutResult({
  amplifier_placement: {
    total_edfa_count: 2,
    span_details: [
      { span_id: 's1', from_event_id: 'tx', to_event_id: 'amp-1', length_km: 60 },
      { span_id: 's2', from_event_id: 'amp-1', to_event_id: 'amp-2', length_km: 60 },
      { span_id: 's3', from_event_id: 'amp-2', to_event_id: 'rx', length_km: 60 },
    ],
  },
})
expect(parsedNestedSpansLayout?.spans.length === 3, 'nested span details were not parsed')
expect(
  JSON.stringify(layout.resolveLayoutAmplifiers(parsedNestedSpansLayout).map(item => item.positionKm)) === JSON.stringify([60, 120]),
  'nested spans did not provide fallback amplifier positions',
)

const routeLengthFallbackAmplifiers = layout.resolveLayoutAmplifiers({
  totalLengthKm: null,
  spanKmUsed: null,
  mode: 'fixed',
  nodes: [],
  spans: [],
  amplifiers: [],
  status: 'success',
  nodeCount: 4,
  amplifierCount: 2,
}, 150)
expect(
  JSON.stringify(routeLengthFallbackAmplifiers.map(item => item.positionKm)) === JSON.stringify([50, 100]),
  'current route length was not used when the backend omitted layout length',
)

const explicitAmplifier = layout.resolveLayoutAmplifiers({
  totalLengthKm: 160,
  spanKmUsed: 80,
  mode: 'fixed',
  nodes: [],
  spans: [],
  amplifiers: [{
    nodeId: 'amp-1',
    nodeName: 'AMP-01',
    nodeType: 'Amplifier',
    positionKm: 80,
    longitude: 121.25,
    latitude: 31.5,
  }],
  status: 'success',
  nodeCount: 3,
  amplifierCount: 1,
})[0]
expect(explicitAmplifier.longitude === 121.25 && explicitAmplifier.latitude === 31.5, 'backend amplifier coordinates were not preserved')

const fixedLayoutResponse = layout.parsePlanningLayoutResult({
  flag: '1',
  code: '200',
  data: {
    total_length_km: '74.3377',
    span_km_used: '70.0',
    mode: 'fixed',
    nodes: [
      { node_id: '0', node_type: 'Tx', position_km: '0.0', node_name: 'Tx0' },
      { node_id: '1', node_type: 'Amplifier', position_km: '70.0', node_name: 'Amplifier1' },
      { node_id: '2', node_type: 'Rx', position_km: '74.3377', node_name: 'Rx2' },
    ],
    spans: [
      { span_index: '0', start_node_id: '0', end_node_id: '1', length_km: '70.0' },
      { span_index: '1', start_node_id: '1', end_node_id: '2', length_km: '4.3377' },
    ],
    amplifier_placement: [
      { node_id: '1', node_type: 'Amplifier', position_km: '70.0', node_name: 'Amplifier1' },
    ],
    meta: { status: 'success', node_count: '3', amplifier_count: '1' },
  },
})
expect(fixedLayoutResponse?.totalLengthKm === 74.3377, 'fixed API total length string was not normalized')
expect(fixedLayoutResponse?.spans[1]?.lengthKm === 4.3377, 'fixed API tail span was not normalized')
expect(
  layout.resolveLayoutAmplifiers(fixedLayoutResponse)[0]?.positionKm === 70,
  'fixed API amplifier was not kept at KP 70',
)
const selectedFixedLayout = layout.selectPlanningLayoutResult({
  fixed: fixedLayoutResponse,
  optimized: {},
}, 'optimized')
expect(
  selectedFixedLayout?.mode === 'fixed' && selectedFixedLayout?.amplifierCount === 1,
  'empty preferred result prevented the valid fixed layout from being restored',
)

for (const item of icons.systemDeviceLegendItems) {
  const icon = icons.getSystemDeviceIcon(item.type)
  expect(icon.startsWith('/image/'), `legend icon missing for ${item.type}`)
}
expect(
  icons.getSystemDeviceIcon('ola') === icons.getSystemDeviceIcon('amplifier_e'),
  'planned amplifier marker does not use the east-amplifier legend icon',
)

const dialogSource = fs.readFileSync(path.join(root, 'src/modules/design/dialogs/LinkConfigDialog.vue'), 'utf8')
expect(dialogSource.includes('await applyPlanningResult(false)'), 'calculation completion does not auto-apply device placement')
expect(!dialogSource.includes('syncAutoJointsToConnector'), 'system planning still creates joint boxes on the frontend')
expect(
  dialogSource.includes('removeLegacyAutoGeneratedJoints()'),
  'legacy frontend-generated joint boxes are not cleaned up',
)
expect(
  dialogSource.indexOf('const fromLayout = platformLayoutResult.value?.totalLengthKm')
    < dialogSource.indexOf('const fromCalculation = calculationResult.value?.totalLength'),
  'result timeline does not prefer the layout coordinate system',
)
expect(
  dialogSource.includes('布局接口决定设备的 KP；仿真结果只补充设备的性能字段'),
  'simulation amplifier positions can still override the layout API',
)
const resultPanelSource = fs.readFileSync(path.join(root, 'src/modules/design/components/SystemPlanningResultPanel.vue'), 'utf8')
expect(resultPanelSource.includes('const timelinePosition'), 'result timeline does not calculate normalized node positions')
expect(resultPanelSource.includes('class="w-full pb-2"'), 'result timeline is not constrained to the result panel width')
expect(!resultPanelSource.includes('overflow-x-auto pb-2'), 'result timeline still has a horizontal scrollbar')
expect(!resultPanelSource.includes('const timelineWidthPx'), 'result timeline still expands beyond the result panel')
expect(!resultPanelSource.includes("translateX(-100%)"), 'result endpoint is shifted left from its true KP')
const designSource = fs.readFileSync(path.join(root, 'src/views/DesignView.vue'), 'utf8')
expect(designSource.includes('restorePersistedPlanningDevices()'), 'saved planning devices are not restored on design entry')

console.log('system planning map placement verification passed')
