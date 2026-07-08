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

const { getSharedRoutePointRenderKey } = loadTsModule('src/utils/routePointRenderKey.ts')

const startA = getSharedRoutePointRenderKey('landing', [117.46511115044248, 36.49670007547169])
const startB = getSharedRoutePointRenderKey('landing', [117.46511115044248, 36.49670007547169])
const branch = getSharedRoutePointRenderKey('branching', [117.46511115044248, 36.49670007547169])
const waypoint = getSharedRoutePointRenderKey('waypoint', [117.46511115044248, 36.49670007547169])

if (!startA || startA !== startB) {
  throw new Error('expected same landing coordinate to share one render key')
}
if (branch === startA) {
  throw new Error('expected landing and branching icons at the same coordinate to stay distinct')
}
if (waypoint !== null) {
  throw new Error('expected waypoint to be skipped from shared endpoint rendering')
}

console.log('shared route point key verification passed')
