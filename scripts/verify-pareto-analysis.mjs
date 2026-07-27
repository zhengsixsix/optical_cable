import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(projectRoot, '.pareto-analysis-test-'))
const compiledService = join(temporaryDirectory, 'ParetoAnalysisService.mjs')

const candidate = (id, cost, risk) => ({
  id,
  cost: { total: cost },
  risk: { overall: risk },
})

try {
  await build({
    entryPoints: [join(projectRoot, 'src/services/ParetoAnalysisService.ts')],
    outfile: compiledService,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })

  const {
    getParetoFront,
    getValidParetoCandidates,
    isParetoDominated,
    sortParetoFront,
  } = await import(pathToFileURL(compiledService).href)

  const mixed = [candidate('A', 10, 5), candidate('B', 8, 6), candidate('C', 12, 7)]
  assert.deepEqual(
    getParetoFront(mixed).map(item => item.id).sort(),
    ['A', 'B'],
    'a route that is worse in both cost and risk must be excluded from the frontier',
  )
  assert.equal(isParetoDominated(mixed[2], mixed), true)

  const duplicates = [candidate('A', 10, 5), candidate('B', 10, 5), candidate('C', 12, 4)]
  assert.deepEqual(
    getParetoFront(duplicates).map(item => item.id).sort(),
    ['A', 'B', 'C'],
    'equal-metric routes are distinct non-dominated alternatives',
  )

  const equalCost = [candidate('A', 10, 5), candidate('B', 10, 6), candidate('C', 9, 7)]
  assert.deepEqual(
    getParetoFront(equalCost).map(item => item.id).sort(),
    ['A', 'C'],
    'at equal cost, the higher-risk route must be dominated',
  )
  assert.deepEqual(
    sortParetoFront(equalCost).map(item => item.id),
    ['C', 'A', 'B'],
    'frontier sorting must use cost, then risk, then id',
  )

  const withInvalid = [...mixed, candidate('invalid-cost', Number.NaN, 0.2), candidate('invalid-risk', 8, Infinity)]
  assert.deepEqual(
    getValidParetoCandidates(withInvalid).map(item => item.id),
    ['A', 'B', 'C'],
    'non-finite metrics must not enter the chart or export',
  )

  const duplicateIds = [candidate('same-id', 8, 4), candidate('same-id', 9, 5)]
  const duplicateIdFront = getParetoFront(duplicateIds)
  assert.equal(duplicateIdFront.length, 1, 'duplicate route IDs must not disable dominance comparison')
  assert.equal(duplicateIdFront[0].cost.total, 8)

  const realBackendMetrics = [
    candidate('backend-route-0', 398103630.069311, 266732.51994299993),
    candidate('backend-route-1', 398103630.069311, 266685.0151689999),
    candidate('backend-route-2', 594933624.1829829, 71885.72187900002),
  ]
  assert.deepEqual(
    getParetoFront(realBackendMetrics).map(item => item.id).sort(),
    ['backend-route-1', 'backend-route-2'],
    'the three metrics from the supplied backend response must produce the expected frontier',
  )

  console.log('Pareto analysis verification passed')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
