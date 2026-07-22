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
  vm.runInNewContext(output, { module, exports: module.exports }, { filename })
  return module.exports
}

function expect(condition, label) {
  if (!condition) throw new Error(label)
}

const merge = loadTsModule('src/utils/platformDeviceEntityMerge.ts')
const current = [
  {
    id: 'station-1', name: '配置岸站', type: 'landing', kp: 0,
    longitude: 120, latitude: 30, depth: 0, status: 'active', specifications: '', remarks: '',
  },
  {
    id: 'amp-1', name: 'AMP-01', type: 'ola', kp: 39.9,
    longitude: 121, latitude: 31, depth: 1000, status: 'planned', specifications: 'EDFA', remarks: '',
  },
]

const preserved = merge.mergePlatformConnectorElements(current, [], { replacePlatformElements: true })
expect(preserved.length === 2, 'empty platform response cleared restored planning devices')

const incoming = [
  {
    id: 'entity-station', platformEntityId: 'entity-station', name: '上海岸站', type: 'landing', kp: 0,
    longitude: 120, latitude: 30, depth: 0, status: 'active', specifications: '', remarks: '',
  },
  {
    id: 'entity-amp', platformEntityId: 'entity-amp', name: '平台放大器', type: 'amplifier_e', kp: 0,
    longitude: 121, latitude: 31, depth: 0, status: 'planned', specifications: '', remarks: '',
  },
]
const hydrated = merge.mergePlatformConnectorElements(current, incoming, { replacePlatformElements: true })
expect(hydrated.length === 2, 'platform entities duplicated existing devices instead of merging')
expect(hydrated[0].name === '上海岸站', 'specific platform station name was not restored')
expect(hydrated[1].platformEntityId === 'entity-amp', 'platform amplifier identity was not attached')
expect(hydrated[1].kp === 39.9, 'saved planning KP was overwritten by an empty platform KP')

const filtered = merge.mergePlatformConnectorElements(hydrated, [incoming[1]], { replacePlatformElements: false })
expect(filtered.length === 2, 'filtered platform query removed other devices')

const managerSource = fs.readFileSync(path.join(root, 'src/composables/useProjectManager.ts'), 'utf8')
expect(managerSource.includes('platformDeviceEntityApi.search'), 'platform project opening does not load device entities')
expect(managerSource.includes('platformDeviceEntityToConnectorElement'), 'platform entities are not converted to connector elements')
expect(managerSource.includes('projectDataStore.clearProjectData()'), 'opening a platform project does not clear the previous project state')

const panelSource = fs.readFileSync(path.join(root, 'src/modules/design/panels/ConnectorPanel.vue'), 'utf8')
expect(panelSource.includes('mergePlatformConnectorElements'), 'connector panel still replaces the whole device table')
expect(panelSource.includes('if (projectId == null) return'), 'local projects can still trigger an unscoped platform device query')

const designSource = fs.readFileSync(path.join(root, 'src/views/DesignView.vue'), 'utf8')
expect(designSource.includes('const sameCoordinate ='), 'legacy platform amplifiers are not matched by saved coordinates')
expect(designSource.includes('connectorStore.updateElement(matched.id'), 'legacy amplifier KP is not corrected from the saved layout')

console.log('platform project device restore verification passed')
