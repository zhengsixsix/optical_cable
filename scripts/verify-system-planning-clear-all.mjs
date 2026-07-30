import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const dialogSource = read('src/modules/design/dialogs/LinkConfigDialog.vue')
const simulationSource = read('src/services/SimulationApiService.ts')
const platformApiSource = read('src/services/platform/api.ts')

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function sourceBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start >= 0 && end > start, `source block not found: ${startMarker}`)
  return source.slice(start, end)
}

expect(
  /fixedPlan: \(id: Id, clearAll: boolean\)[\s\S]*?\/plan\/project\/plan\/fixed'[\s\S]*?\{ id, clearAll \}/.test(platformApiSource),
  'fixed layout API must forward clearAll',
)
expect(
  /optimizedPlan: \(id: Id, fmmPathResultIndex: number, clearAll: boolean\)[\s\S]*?\/plan\/project\/plan\/optimized'[\s\S]*?\{ id, fmmPathResultIndex, clearAll \}/.test(platformApiSource),
  'optimized layout API must forward clearAll',
)

const fixedPlanning = sourceBlock(simulationSource, 'export async function runFixedPlanning', 'export async function runOptimizedPlanning')
const optimizedPlanning = sourceBlock(simulationSource, 'export async function runOptimizedPlanning', 'function buildLayoutPlanningResponse')
expect(fixedPlanning.includes('fixedPlan(request.projectId, request.clearAll)'), 'fixed planning did not forward clearAll')
expect(optimizedPlanning.includes('request.clearAll'), 'optimized planning did not forward clearAll')

const simulation = sourceBlock(simulationSource, 'export async function runSimulation', 'const RESULT_POLL_INTERVAL_MS')
expect(simulation.includes('simulationPlan('), 'physical simulation endpoint is not called')
expect(!simulation.includes('fixedPlan('), 'physical simulation still calls fixed planning')
expect(!simulation.includes('optimizedPlan('), 'physical simulation still calls optimized planning')
expect(!simulation.includes('saveChannelConfig'), 'physical simulation still saves planning configuration')
expect(!simulation.includes('saveOptimization'), 'physical simulation still saves optimization configuration')

const startCalculation = sourceBlock(dialogSource, 'const startCalculation = async', 'const isCalculationResult')
expect(startCalculation.includes('await runSimulation({'), 'result-page calculation does not call physical simulation')
expect(startCalculation.includes("mode: spanStrategy.value === 'fixed' ? 'fixed' : 'optimized'"), 'simulation mode does not use the selected layout')
expect(!startCalculation.includes('runFixedPlanning'), 'result-page calculation still invokes fixed planning')
expect(!startCalculation.includes('runOptimizedPlanning'), 'result-page calculation still invokes optimized planning')
expect(!dialogSource.includes('重新计算会删除之前生成的设备实例'), 'physical re-simulation still shows a layout deletion warning')

console.log('system planning phase separation verification passed')
