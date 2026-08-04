import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')

function expect(condition, label) {
  if (!condition) throw new Error(label)
}

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start >= 0 && end > start, `source block not found: ${startMarker}`)
  return source.slice(start, end)
}

const dialogSource = read('src/modules/design/dialogs/LinkConfigDialog.vue')
const platformApiSource = read('src/services/platform/api.ts')
const simulationSource = read('src/services/SimulationApiService.ts')
const resultPanelSource = read('src/modules/design/components/SystemPlanningResultPanel.vue')

expect(
  dialogSource.includes('platformDeviceLibraryApi')
    && dialogSource.includes('platformDeviceConfigApi')
    && dialogSource.includes('DeviceDynamicValueForm'),
  'system planning dialog is missing default-library or dynamic-form dependencies',
)

const libraryLoadSource = block(
  dialogSource,
  'const loadPlanningDeviceEntities = async',
  'const loadPlanningDeviceConfigs = async',
)
expect(
  libraryLoadSource.includes('platformDeviceLibraryApi.search({')
    && libraryLoadSource.includes('deviceTypeCd: planningDeviceTypeCode[type]')
    && libraryLoadSource.includes('isDefault: 1')
    && libraryLoadSource.includes('Number(library.isDefault) === 1')
    && libraryLoadSource.includes('platformDeviceLibraryApi.detail(library.id)'),
  'optimization configuration does not load the explicitly default device library',
)
expect(
  !libraryLoadSource.includes('platformDeviceEntityApi.search')
    && !libraryLoadSource.includes('projectId,'),
  'pre-layout fiber/amplifier configuration still depends on project device instances',
)

const configLoadSource = block(
  dialogSource,
  'const loadPlanningDeviceConfigs = async',
  'const updateFiberDeviceValues =',
)
expect(
  configLoadSource.includes('platformDeviceConfigApi.search({')
    && configLoadSource.includes('deviceTypeCd: planningDeviceTypeCode[type]')
    && configLoadSource.includes('deviceValueListToMap(library.deviceValueList)')
    && configLoadSource.includes('normalizeDeviceConfigs(response.data ?? [])'),
  'default library values and dynamic configuration definitions are not combined',
)

const persistLibrarySource = block(
  dialogSource,
  'const persistPlanningLibrary = async',
  'const persistConnectorEntity = async',
)
expect(
  persistLibrarySource.includes('isDefault: 1')
    && persistLibrarySource.includes('bindFuncList: bindFuncListWithSelectedModel(library, selectedModel)')
    && persistLibrarySource.includes('deviceValueList: buildDeviceValueList(values)')
    && persistLibrarySource.includes('settingsStore.savePlatformDeviceLibrary(payload)'),
  'edited planning parameters or selected functions are not saved back to the default device library',
)
expect(
  dialogSource.includes('value-scope="library"')
    && dialogSource.includes('默认光纤器件库')
    && dialogSource.includes('默认放大器器件库')
    && !dialogSource.includes('value-scope="entity"'),
  'fiber/amplifier forms do not expose default-library scope',
)

expect(
  dialogSource.includes('Span 布局策略')
    && dialogSource.includes('生成固定布局')
    && dialogSource.includes('生成优化布局')
    && dialogSource.includes("activeStep.value === 'model' && spanStrategy.value === 'fixed'")
    && dialogSource.includes("spanStrategy.value === 'auto' && activeStep.value === lastConfigStep.value"),
  'fixed and optimized layout algorithms are not attached to their required wizard stages',
)

const modelOptionSource = block(
  dialogSource,
  'const calculationModelOptionsFromLibrary =',
  '// ============ Step 3: 光纤配置 ============',
)
expect(
  modelOptionSource.includes('library?.bindFuncList')
    && modelOptionSource.includes('item.name?.trim()')
    && modelOptionSource.includes('Number(item.isDefault) === 1')
    && modelOptionSource.includes('bindFuncListWithSelectedModel'),
  'calculation-model options are not derived from device-library function configuration',
)

const modelStepSource = block(dialogSource, '<!-- Step 2: 布局算法选择 -->', '<!-- Step 3: 光纤配置 -->')
const fiberStepSource = block(dialogSource, '<!-- Step 3: 光纤配置 -->', '<!-- Step 4: 放大器配置 -->')
const amplifierStepSource = block(dialogSource, '<!-- Step 4: 放大器配置 -->', '<!-- Step 5: WDM 参数配置 -->')
expect(
  !modelStepSource.includes('光纤性能计算模型：')
    && !modelStepSource.includes('放大器性能计算模型：')
    && fiberStepSource.includes('光纤性能计算模型：')
    && fiberStepSource.includes(':options="fiberCalculationModelOptions"')
    && amplifierStepSource.includes('放大器性能计算模型：')
    && amplifierStepSource.includes(':options="amplifierCalculationModelOptions"'),
  'calculation-model selectors are not placed in their matching device configuration steps',
)

const simulationBlock = block(simulationSource, 'export async function runSimulation', 'const RESULT_POLL_INTERVAL_MS')
expect(
  simulationBlock.includes('platformProjectApi.simulationPlan')
    && !simulationBlock.includes('fixedPlan(')
    && !simulationBlock.includes('optimizedPlan('),
  'physical simulation is not isolated from layout generation',
)

expect(
  dialogSource.includes('deviceEntityList')
    && dialogSource.includes('settingsStore.loadPlatformDeviceEntities({')
    && dialogSource.includes('syncConnectorStoreFromDeviceEntities(entities)')
    && dialogSource.includes('platformDeviceEntityToConnectorElement'),
  'layout-generated device entities are not synchronized after planning',
)

const amplifierResultSource = block(
  dialogSource,
  'const buildLayoutAmplifierInfos =',
  'const platformLayoutTailSpanKm =',
)
expect(
  amplifierResultSource.includes('entityByNodeId')
    && amplifierResultSource.includes('readBackendAmplifierValues')
    && amplifierResultSource.includes('nominalGain: backendValues?.nominalGainDb')
    && amplifierResultSource.includes('maxOutputPower: backendValues?.maxOutputPowerDbm'),
  'backend amplifier entity values are not mapped into planning results by nodeId',
)
expect(
  resultPanelSource.includes('实际增益')
    && resultPanelSource.includes('额定增益')
    && resultPanelSource.includes('实际输出功率')
    && resultPanelSource.includes('最大输出功率'),
  'actual and rated backend amplifier fields are not shown separately',
)
expect(
  platformApiSource.includes("'/plan/deviceLibrary/search'")
    && platformApiSource.includes("'/plan/deviceLibrary/save'")
    && platformApiSource.includes("'/plan/deviceEntity/search'"),
  'required library and generated-entity platform APIs are not connected',
)

console.log('system planning default-library flow verification passed')
