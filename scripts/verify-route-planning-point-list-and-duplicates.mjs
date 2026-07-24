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
  vm.runInNewContext(output, { module, exports: module.exports, console }, { filename })
  return module.exports
}

const { convertAlgorithmRouteBundle } = loadTsModule('src/services/RouteDataConverter.ts')
const pathResult = {
  real_trace: [[1, 120, 30], [2, 121, 31]],
  total_cost: 100,
  total_risk: 0.2,
  length: 10,
}
const result = convertAlgorithmRouteBundle({
  fmmPaths: [pathResult, { ...pathResult }, { ...pathResult }],
  stationPoints: [
    { sortNum: 1, name: '上海岸站' },
    { sortNum: 2, name: '大连岸站' },
  ],
})

if (result.diagnostics.fmmPathCount !== 3 || result.routes.length !== 3) {
  throw new Error('frontend must keep all backend route alternatives, including duplicate geometry')
}
for (const [index, route] of result.routes.entries()) {
  if (route.points[0]?.name !== '上海岸站' || route.points.at(-1)?.name !== '大连岸站') {
    throw new Error(`route ${index} did not use pointList strictly for station names`)
  }
  if (route.segments.length !== 0 || (result.segmentsByRouteId[route.id] || []).length !== 0) {
    throw new Error(`route ${index} unexpectedly generated cable segments`)
  }
}

console.log('route planning point list and duplicate route verification passed')
