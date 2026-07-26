import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dialogSource = fs.readFileSync(
  path.join(root, 'src/modules/design/dialogs/LinkConfigDialog.vue'),
  'utf8',
)
const simulationSource = fs.readFileSync(
  path.join(root, 'src/services/SimulationApiService.ts'),
  'utf8',
)
const platformApiSource = fs.readFileSync(
  path.join(root, 'src/services/platform/api.ts'),
  'utf8',
)

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function expectIncludes(source, expected, message) {
  expect(source.includes(expected), message)
}

expectIncludes(
  dialogSource,
  '重新计算会删除之前生成的设备实例，是否要同时删除手动添加的设备？',
  'recalculation warning is missing or changed',
)
expectIncludes(dialogSource, '@click="startCalculation(false)"', 'first calculation must use clearAll=false')
expectIncludes(dialogSource, '@click="confirmRecalculation(false)"', 'keep-manual action must use clearAll=false')
expectIncludes(dialogSource, '@click="confirmRecalculation(true)"', 'delete-all action must use clearAll=true')
expectIncludes(dialogSource, '@click="dismissRecalculationConfirmation()"', 'cancel action is missing')
expectIncludes(dialogSource, '保留手动添加', 'keep-manual action label is missing')
expectIncludes(dialogSource, '同时删除', 'delete-all action label is missing')

expect(
  /const startCalculation = async \(clearAll: boolean(?: = false)?\)/.test(dialogSource),
  'startCalculation must accept boolean clearAll',
)
expect(
  /runSimulation\(\{[\s\S]*?\bclearAll,/.test(dialogSource),
  'runSimulation payload must forward clearAll',
)
expect(
  /export interface SimulationRequest \{[\s\S]*?\bclearAll: boolean/.test(simulationSource),
  'SimulationRequest.clearAll must be required boolean',
)
expect(
  /fixedPlan: \(id: Id, clearAll: boolean\)[\s\S]*?\/plan\/project\/plan\/fixed'[\s\S]*?\{ id, clearAll \}/.test(platformApiSource),
  'fixed layout API must forward clearAll',
)
expect(
  /optimizedPlan: \(id: Id, fmmPathResultIndex: number, clearAll: boolean\)[\s\S]*?\/plan\/project\/plan\/optimized'[\s\S]*?\{ id, fmmPathResultIndex, clearAll \}/.test(platformApiSource),
  'optimized layout API must forward clearAll',
)

console.log('system planning clearAll verification passed')
