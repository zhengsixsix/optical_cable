import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function expect(condition, label) {
  if (!condition) throw new Error(label)
}

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start >= 0 && end > start, `source block not found: ${startMarker}`)
  return source.slice(start, end)
}

const dialogPath = path.join(root, 'src/modules/design/dialogs/LinkConfigDialog.vue')
const dialogSource = fs.readFileSync(dialogPath, 'utf8')
const dictionaryStorePath = path.join(root, 'src/stores/dictionary.ts')
const dictionaryStoreSource = fs.readFileSync(dictionaryStorePath, 'utf8')
const platformApiSource = fs.readFileSync(path.join(root, 'src/services/platform/api.ts'), 'utf8')

expect(
  dialogSource.includes('platformDeviceEntityApi')
    && dialogSource.includes('platformDeviceConfigApi')
    && dialogSource.includes('DeviceDynamicValueForm'),
  'system planning dialog is missing project-device or dynamic-form dependencies',
)

const fiberModelLoadSource = block(
  dialogSource,
  'const loadFiberCalculationModels = async',
  'const loadAmplifierCalculationModels = async',
)
const amplifierModelLoadSource = block(
  dialogSource,
  'const loadAmplifierCalculationModels = async',
  '// ============ Step 3: 光纤配置 ============',
)
expect(
  dictionaryStoreSource.includes("fiberCalculationModel: 'FIBER_CALC_MODEL'")
    && platformApiSource.includes("'/sys/dic/search/list'")
    && fiberModelLoadSource.includes('dictionaryStore.searchDictionary({')
    && fiberModelLoadSource.includes('pageNumber: 1')
    && fiberModelLoadSource.includes('pageSize: 10')
    && fiberModelLoadSource.includes('type: PLATFORM_DICTIONARY_TYPES.fiberCalculationModel'),
  'fiber calculation models must use the FIBER_CALC_MODEL dictionary search contract',
)
expect(
  dictionaryStoreSource.includes("amplifierCalculationModel: 'AMP_CALC_MODEL'")
    && platformApiSource.includes("'/sys/dic/search/list'")
    && amplifierModelLoadSource.includes('dictionaryStore.searchDictionary({')
    && amplifierModelLoadSource.includes('pageNumber: 1')
    && amplifierModelLoadSource.includes('pageSize: 10')
    && amplifierModelLoadSource.includes('type: PLATFORM_DICTIONARY_TYPES.amplifierCalculationModel'),
  'amplifier calculation models must use AMP_CALC_MODEL dictionary search with name labels and code values',
)
expect(
  dialogSource.includes('toCalculationModelOptions')
    && dialogSource.includes("const value = String(item.code ?? '').trim()")
    && dialogSource.includes('label: item.name?.trim() || value')
    && dialogSource.includes('loadFiberCalculationModels()')
    && dialogSource.includes(':disabled="fiberModelLoading"')
    && dialogSource.includes('fiberModelError')
    && dialogSource.includes('loadAmplifierCalculationModels()')
    && dialogSource.includes(':disabled="amplifierModelLoading"')
    && dialogSource.includes('amplifierModelError'),
  'calculation model loading states are not wired into the system planning dialog',
)

const entityLoadSource = block(
  dialogSource,
  'const loadPlanningDeviceEntities = async',
  'const loadPlanningDeviceConfigs = async',
)
expect(
  entityLoadSource.includes('platformDeviceEntityApi.search({')
    && entityLoadSource.includes('pageNumber: 1')
    && entityLoadSource.includes('pageSize: 1000')
    && entityLoadSource.includes('projectId,')
    && entityLoadSource.includes('deviceTypeCd: planningDeviceTypeCode[type]'),
  'deviceEntity/search payload does not include the required project and device type filters',
)

const configLoadSource = block(
  dialogSource,
  'const loadPlanningDeviceConfigs = async',
  'const updateFiberDeviceValues =',
)
expect(
  configLoadSource.includes('platformDeviceConfigApi.search({')
    && configLoadSource.includes('pageNumber: 1')
    && configLoadSource.includes('pageSize: 1000')
    && configLoadSource.includes('deviceTypeCd: planningDeviceTypeCode[type]'),
  'deviceConfig/search payload does not match the type-based dynamic configuration contract',
)
expect(
  configLoadSource.includes('deviceValueListToMap(entity.deviceValueList)')
    && configLoadSource.includes('normalizeDeviceConfigs(response.data ?? [])'),
  'entity values and dynamic configuration definitions are not combined for rendering',
)

expect(
  dialogSource.includes("getDeviceTypeCodeForCategory('fiber')")
    && dialogSource.includes("getDeviceTypeCodeForCategory('amplifier')")
    && dialogSource.includes("loadPlanningDeviceEntities('fiber')")
    && dialogSource.includes("loadPlanningDeviceEntities('amplifier')")
    && dialogSource.includes("loadPlanningDeviceConfigs('fiber', selectedEntityId)")
    && dialogSource.includes("loadPlanningDeviceConfigs('amplifier', selectedEntityId)"),
  'FIB and AMP do not both follow entity-search then config-search selection flow',
)

expect(
  dialogSource.includes(':options="fiberTypeOptions"')
    && dialogSource.includes(':configs="fiberDeviceConfigs"')
    && dialogSource.includes(':options="amplifierTypeOptions"')
    && dialogSource.includes(':configs="amplifierDeviceConfigs"'),
  'fiber or amplifier UI is not bound to project entities and dynamic configs',
)
expect(
  !dialogSource.includes('platformFiberLibraries')
    && !dialogSource.includes('platformAmplifierLibraries')
    && !dialogSource.includes('saveFiberParamsToLibrary')
    && !dialogSource.includes('saveAmplifierParamsToLibrary'),
  'fiber or amplifier planning still depends on the platform model library',
)

const topologySource = block(
  dialogSource,
  'const planningRouteBus = computed',
  'const formatRouteCreatedAt =',
)
expect(
  topologySource.includes("point.type === 'branching'")
    && !topologySource.includes('routeConnectorElements'),
  'link topology BU nodes are not strictly sourced from route planning',
)
expect(
  dialogSource.includes("kind: 'station'")
    && dialogSource.includes("kind: 'bu' as const")
    && !dialogSource.includes('linkTopologyDevices'),
  'link topology is not limited to stations and explicit route BU nodes',
)

expect(
  dialogSource.includes('planningDeviceInitializationSequence')
    && dialogSource.includes('initializationSequence !== planningDeviceInitializationSequence || !props.visible'),
  'dialog close/reopen does not invalidate stale asynchronous device initialization',
)

const typesSource = fs.readFileSync(path.join(root, 'src/services/platform/types.ts'), 'utf8')
expect(
  typesSource.includes('positionKm?: number | string | null')
    && typesSource.includes('fiberDeviceValues?: Record<string, string>')
    && typesSource.includes('amplifierDeviceValues?: Record<string, string>'),
  'platform entity or planning snapshot types do not preserve the new device flow',
)

console.log('system planning project-device flow verification passed')
