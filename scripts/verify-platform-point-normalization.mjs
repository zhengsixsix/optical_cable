import { strict as assert } from 'node:assert'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = process.cwd()
const entryPoint = resolve(root, 'src/services/platform/normalizers.ts')
const outDir = resolve(root, 'tmp/verify-platform-point-normalization')
const outFile = resolve(outDir, 'normalizers.mjs')

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})

const {
  getPlanProjectDraftStatus,
  isPublicFlag,
  normalizePlanPoint,
  normalizePlanPoints,
  normalizePlanProject,
} = await import(pathToFileURL(outFile).href)

const rawPoint = {
  id: '2587642351953379329',
  name: '起点',
  longitude: '117.363281',
  latitude: '36.503906',
  sortNum: '1',
}

const normalizedPoint = normalizePlanPoint(rawPoint)
assert.equal(normalizedPoint.longitude, 117.363281)
assert.equal(normalizedPoint.latitude, 36.503906)
assert.equal(normalizedPoint.sortNum, 1)

const normalizedPoints = normalizePlanPoints([
  rawPoint,
  { id: 'bad', name: '无坐标', longitude: '', latitude: null, sortNum: '2' },
  { id: '2587642351962816513', name: '终点', longitude: '120.571289', latitude: '38.85498', sortNum: '2' },
])

assert.equal(normalizedPoints.length, 2)
assert.equal(getPlanProjectDraftStatus(normalizedPoints), 'ready')
assert.equal(getPlanProjectDraftStatus(normalizedPoints.slice(0, 1)), 'stationed')
assert.equal(getPlanProjectDraftStatus([]), 'draft')

const normalizedProject = normalizePlanProject({
  id: '2584131823181234177',
  name: '第一个项目',
  isPublic: '1',
  pointList: normalizedPoints,
})

assert.equal(normalizedProject.isPublic, 1)
assert.equal(isPublicFlag(normalizedProject.isPublic), true)
assert.equal(isPublicFlag('0'), false)

console.log('Platform point normalization checks passed.')
