import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

const panel = read('src/modules/design/components/SystemPlanningResultPanel.vue')
const designView = read('src/views/DesignView.vue')
const map = read('src/modules/design/components/SystemDesignMap.vue')

expect(panel.includes('capacityTbps?: number | null'), 'result panel does not accept backend capacity')
expect(panel.includes('displaySystemCapacityTbps'), 'result panel does not render capacity')
expect(panel.includes('Tbps'), 'result panel capacity has no unit')
expect(
  panel.includes('osnr?: MetricSummary | null')
    && panel.includes('gsnr?: MetricSummary | null')
    && panel.includes('power?: MetricSummary | null')
    && panel.includes('qFactor?: MetricSummary | null'),
  'result panel still requires fabricated metric families',
)
expect(
  panel.includes('v-for="row in displayMetricRows"'),
  'result panel does not render only the metrics returned by the backend',
)
expect(panel.includes('USD '), 'system planning costs do not show an explicit currency')
expect(!panel.includes('`$${'), 'result panel still uses an ambiguous currency symbol')

for (const cacheName of [
  'linkCalcSummaryCache',
  'platformPlanningResults',
  'simulationCache',
  'systemPlanningCache',
]) {
  expect(designView.includes(`settingsStore.${cacheName}`), `DesignView does not restore ${cacheName}`)
}
expect(
  designView.includes('normalizePlatformSimulationCache(settingsStore.platformPlanningResults?.simulation)'),
  'raw platform simulation results are not normalized during summary restoration',
)
expect(
  designView.includes('summarizeFinalMatrixRow(simulation?.metrics.gsnr_matrix_db)')
    && designView.includes('summarizeFinalMatrixRow(simulation?.metrics.osnr_matrix_db)'),
  'DesignView does not derive terminal GSNR/OSNR from normalized matrices',
)
expect(
  designView.includes('simulation?.summary.system_capacity_tbps'),
  'DesignView does not restore backend system capacity',
)
expect(
  designView.includes('watch(restoredPlanningSummary') && designView.includes('{ immediate: true }'),
  'DesignView restoration only runs once or does not react to an opened project',
)
expect(
  designView.includes("const SYSTEM_PLANNING_COST_CURRENCY = 'USD'")
    && designView.includes('`CNY ${costInThousands.toFixed(0)}K`'),
  'cost sources do not expose explicit, non-converted currencies',
)
expect(!designView.includes('`$${'), 'DesignView still uses an ambiguous system-planning currency symbol')

expect(
  map.includes('mergePointSource(merged, mainPoints)')
    && map.includes('mergePointSource(merged, props.routePoints)')
    && map.includes('mergePointSource(merged, monitoredPoints, true)'),
  'map does not merge route, planning and monitoring point sources',
)
expect(
  map.includes('const pointSpatialIdentity') && map.includes('const idIndex'),
  'map point merge has no stable deduplication keys',
)
expect(
  map.includes('const pointRenderSignature') && map.includes('pointRenderSignature,'),
  'map redraw does not observe same-count device changes',
)
expect(
  !map.includes('() => monitorStore.devices.length'),
  'map still redraws solely from monitoring device count',
)
expect(
  !map.includes("connectorStore.elements.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w').length"),
  'map still redraws solely from planned amplifier count',
)

console.log('system planning result closure verification passed')
