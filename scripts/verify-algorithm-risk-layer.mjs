import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = fs.readFileSync(path.join(root, 'src/modules/planning/components/MapArea.vue'), 'utf8')

function expectIncludes(needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`)
  }
}

expectIncludes("import ImageLayer from 'ol/layer/Image'", 'algorithm matrix image layer import')
expectIncludes("import ImageStatic from 'ol/source/ImageStatic'", 'algorithm matrix static source import')
expectIncludes('renderAlgorithmRiskLayer', 'algorithm risk render function')
expectIncludes('matrixGeoReference', 'algorithm matrix georeference use')
expectIncludes('result.matrices.risk', 'algorithm risk matrix use')
expectIncludes('toCurrentMapExtent', 'algorithm image extent projection')

console.log('algorithm risk layer verification passed')
