import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const filename = path.join(process.cwd(), 'src/utils/systemPlanningConstraints.ts')
const source = fs.readFileSync(filename, 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText

const module = { exports: {} }
vm.runInNewContext(output, { module, exports: module.exports }, { filename })

const {
  isSpanWithinBounds,
  resolvePlanningSpanBounds,
  selectConstrainedSpanKm,
} = module.exports

const equal = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const scanBounds = resolvePlanningSpanBounds({
  mode: 'scan',
  scanRange: { min: 40, max: 120 },
  minSpanLength: 30,
  maxSpanLength: 100,
})
equal(scanBounds, { minKm: 40, maxKm: 100 }, 'scan and constraint intersection')
equal(isSpanWithinBounds(73, scanBounds), true, 'span within bounds')
equal(isSpanWithinBounds(101, scanBounds), false, 'span outside bounds')

equal(selectConstrainedSpanKm({
  optimizedSpanKm: 115,
  optimizationTarget: 'min_amplifiers',
  bounds: scanBounds,
}), 100, 'minimum amplifier objective clamps optimized span')

equal(selectConstrainedSpanKm({
  optimizedSpanKm: 73,
  optimizationTarget: 'max_gsnr',
  bounds: scanBounds,
}), 40, 'maximum GSNR objective uses shortest allowed span')

let rejectedEmptyIntersection = false
try {
  resolvePlanningSpanBounds({
    mode: 'scan',
    scanRange: { min: 110, max: 120 },
    minSpanLength: 30,
    maxSpanLength: 100,
  })
} catch (error) {
  rejectedEmptyIntersection = String(error).includes('没有交集')
}
equal(rejectedEmptyIntersection, true, 'empty intersection validation')

console.log('system planning constraint verification passed')
