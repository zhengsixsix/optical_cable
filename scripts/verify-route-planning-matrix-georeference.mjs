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

function expectClose(actual, expected, label) {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

const { convertAlgorithmRouteBundle } = loadTsModule('src/services/RouteDataConverter.ts')

const result = convertAlgorithmRouteBundle({
  fmmPaths: [{
    trace: [
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ],
    real_trace: [
      [1, 30, 120],
      [2, 29, 121],
      [3, 28, 122],
    ],
  }],
  riskMatrixText: '1 2 3 4\n5 6 7 8\n9 10 11 12',
  costMatrixText: '1 2 3 4\n5 6 7 8\n9 10 11 12',
  files: ['FMM_path_result.json', 'risk.txt', 'cost.txt'],
})

const ref = result.matrixGeoReference
if (!ref) throw new Error('expected matrixGeoReference')

if (ref.rows !== 3 || ref.columns !== 4) {
  throw new Error(`expected 3x4 matrix, got ${ref.rows}x${ref.columns}`)
}

expectClose(ref.west, 119.5, 'west edge')
expectClose(ref.east, 123.5, 'east edge')
expectClose(ref.north, 30.5, 'north edge')
expectClose(ref.south, 27.5, 'south edge')
expectClose(ref.columnStepDegrees, 1, 'column step')
expectClose(ref.rowStepDegrees, -1, 'row step')

console.log('route planning matrix georeference verification passed')
