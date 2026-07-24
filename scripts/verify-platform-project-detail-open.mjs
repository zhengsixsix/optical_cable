import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()

function expect(condition, label) {
  if (!condition) throw new Error(label)
}

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
  vm.runInNewContext(output, { module, exports: module.exports }, { filename })
  return module.exports
}

const normalizers = loadTsModule('src/services/platform/normalizers.ts')
expect(
  typeof normalizers.normalizePlanProjectDetail === 'function',
  'project detail normalizer is missing',
)

const launchPowerDbm = Array(96).fill('-1.5')
const channelFrequenciesThz = Array.from({ length: 96 }, (_, index) => String(190.725 + index * 0.05))
const detail = normalizers.normalizePlanProjectDetail({
  id: '2588394043456094209',
  name: '大连',
  isPublic: '0',
  pointList: [
    { id: 'start', name: '起点', longitude: '121.525476', latitude: '39.28718', sortNum: '1' },
    { id: 'end', name: '终点', longitude: '121.148339', latitude: '38.726291', sortNum: '2' },
  ],
  scope: {
    topLeftLng: '120.460452',
    topLeftLat: '39.753993',
    bottomRightLng: '122.392156',
    bottomRightLat: '38.550668',
  },
  gridResolution: '500',
  enableRedundancy: 'false',
  channelConfig: {
    channelCount: '96',
    baudRateGbaud: '64.0',
    modulationFormat: '16QAM',
    launchPowerDbm,
    channelFrequenciesThz,
    initialAseNoiseDbm: '-90.0',
    initialNliNoiseDbm: '-90.0',
    centerFrequencyThz: '193.1',
    channelSpacingGhz: '50.0',
  },
  optimization: {
    targetGsnrDb: '14',
    targetOsnrDb: '16',
    osnrMarginDb: null,
    spanMinKm: null,
    spanMaxKm: null,
    spanStepKm: null,
    minSpanLimitKm: null,
    maxSpanLimitKm: null,
    optimizationTarget: null,
  },
  spanKm: '50.0',
  planResult: {
    id: '2588837669741002753',
    projectId: '2588394043456094209',
    routeResult: null,
    fixedResult: { layout: 'fixed' },
    optimizedResult: JSON.stringify({ layout: 'optimized' }),
    simulationResult: { metrics: { gsnr: 18 } },
  },
})

expect(detail.project.pointList[0].longitude === 121.525476, 'detail point longitude was not normalized')
expect(detail.planConfig.scope?.topLeftLng === 120.460452, 'detail scope was not normalized')
expect(detail.planConfig.gridResolution === 500, 'detail grid resolution was not normalized')
expect(detail.planConfig.enableRedundancy === false, 'string false became a truthy redundancy flag')
expect(detail.planConfig.channelConfig?.channelCount === 96, 'detail channel count was not normalized')
expect(detail.planConfig.channelConfig?.launchPowerDbm?.every(value => value === -1.5), 'launch powers were not normalized')
expect(detail.planConfig.channelConfig?.channelFrequenciesThz?.every(value => typeof value === 'number'), 'channel frequencies were not normalized')
expect(detail.planConfig.optimization?.targetGsnrDb === 14, 'optimization target GSNR was not normalized')
expect(detail.planConfig.spanKm === 50, 'detail span length was not normalized')
expect(detail.planningResults?.fixed?.layout === 'fixed', 'fixed result was not restored from project detail')
expect(detail.planningResults?.optimized?.layout === 'optimized', 'serialized optimized result was not parsed')
expect(detail.planningResults?.simulation?.metrics?.gsnr === 18, 'simulation result was not restored from project detail')

const detailWithoutCalculation = normalizers.normalizePlanProjectDetail({
  id: 'no-calculation',
  planResult: {
    routeResult: null,
    fixedResult: null,
    optimizedResult: null,
    simulationResult: null,
  },
})
expect(
  detailWithoutCalculation.planningResults === null,
  'null plan result fields were incorrectly treated as completed calculations',
)

const managerSource = fs.readFileSync(path.join(root, 'src/composables/useProjectManager.ts'), 'utf8')
const openStart = managerSource.indexOf('async function openPlatformProject')
const openEnd = managerSource.indexOf('async function syncCurrentDeviceEntitiesToPlatform', openStart)
expect(openStart >= 0 && openEnd > openStart, 'openPlatformProject source block was not found')
const openSource = managerSource.slice(openStart, openEnd)
expect(openSource.includes('platformProjectApi.detail(projectId)'), 'platform project opening does not load project detail')
expect(openSource.includes('normalizePlanProjectDetail(project)'), 'platform project detail is not normalized before hydration')
expect(!openSource.includes('queryPlanningResults'), 'platform project opening still queries fixed/optimized/simulation separately')
expect(!openSource.includes('platformPlanConfigApi.searchAll'), 'platform project opening still queries plan config separately')
expect(openSource.includes('redundancyConfig:'), 'detail redundancy flag is not restored into route planning settings')

const dialogSource = fs.readFileSync(path.join(root, 'src/components/dialogs/ProjectDialog.vue'), 'utf8')
expect(
  dialogSource.includes("watch([() => props.visible, () => props.mode]")
    && dialogSource.includes("if (mode === 'open')"),
  'project dialog does not reload the platform list when open mode becomes active',
)
expect(dialogSource.includes('{ immediate: true }'), 'project list loading does not cover initially visible dialogs')

const designSource = fs.readFileSync(path.join(root, 'src/views/DesignView.vue'), 'utf8')
const submitStart = designSource.indexOf('const handleSubmit = () => {')
const submitEnd = designSource.indexOf('\n}', submitStart)
expect(submitStart >= 0 && submitEnd > submitStart, 'system planning entry handler was not found')
const submitSource = designSource.slice(submitStart, submitEnd)
expect(
  submitSource.includes('showLinkConfigDialog.value = true')
    && !submitSource.includes('platformDeviceLibraries')
    && !submitSource.includes('return'),
  'system planning entry is still blocked by device-library state',
)

const linkDialogSource = fs.readFileSync(path.join(root, 'src/modules/design/dialogs/LinkConfigDialog.vue'), 'utf8')
expect(
  linkDialogSource.includes('hasRestoredPlanningStepData(targetStep)')
    && linkDialogSource.includes("activeStep.value = restored ? 'result' : resolveRestoredConfigStep()"),
  'restored detail configuration is not directly reachable in the system planning dialog',
)
expect(!linkDialogSource.includes('selectedRplId'), 'system planning link selection still depends on an RPL selection')
expect(!linkDialogSource.includes('路径数据（RPL）'), 'system planning link selection still renders the RPL selector')
expect(
  linkDialogSource.includes("point.type === 'branching'")
    && linkDialogSource.includes('linkTopologyNodes')
    && linkDialogSource.includes("kind: 'station'")
    && linkDialogSource.includes("kind: 'bu' as const"),
  'link topology is not limited to route stations and explicit BU nodes',
)
expect(!linkDialogSource.includes('linkTopologyDevices'), 'link topology still renders general project devices')
expect(!linkDialogSource.includes('<span>项目设备</span>'), 'link basic information still exposes project device counts')

console.log('platform project detail opening verification passed')
