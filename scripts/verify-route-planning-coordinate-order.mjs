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

const { convertPathResultToRoute } = loadTsModule('src/services/RouteDataConverter.ts')
const route = convertPathResultToRoute({
  trace: [[1, 8, 9], [2, 9, 10]],
  real_trace: [
    [1, 117.60520148672566, 36.66518811320755],
    [117.7, 36.7],
    [3, 117.8, 36.8],
  ],
}, 0, 'coordinate contract')

if (!route) throw new Error('expected a route from valid real_trace coordinates')
const expected = [
  [117.60520148672566, 36.66518811320755],
  [117.7, 36.7],
  [117.8, 36.8],
]
if (JSON.stringify(route.rawTrunkCoordinates) !== JSON.stringify(expected)) {
  throw new Error(`backend coordinate contract was not preserved: ${JSON.stringify(route.rawTrunkCoordinates)}`)
}
if (route.rawTrunkCoordinates.some(([longitude, latitude]) => (
  longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90
))) {
  throw new Error('invalid longitude/latitude escaped contract validation')
}
if (Object.hasOwn(route, 'rawMatrixTraceCoordinates')) {
  throw new Error('trace matrix coordinates must not be stored on the route')
}

const latitudeLongitudeRoute = convertPathResultToRoute({
  real_trace: [
    [1, 39.286033277777776, 121.52434945140389],
    [2, 39.28185506597222, 121.52017730453564],
  ],
}, 1, 'backend latitude-longitude response')
if (!latitudeLongitudeRoute) throw new Error('expected the current backend latitude-longitude route to be visible')
if (JSON.stringify(latitudeLongitudeRoute.rawTrunkCoordinates) !== JSON.stringify([
  [121.52434945140389, 39.286033277777776],
  [121.52017730453564, 39.28185506597222],
])) {
  throw new Error(`latitude-longitude response was not normalized: ${JSON.stringify(latitudeLongitudeRoute.rawTrunkCoordinates)}`)
}
if (latitudeLongitudeRoute.algorithmSummary?.coordinateOrder !== 'latitude-longitude') {
  throw new Error('detected coordinate order should remain visible in route analysis metadata')
}

console.log('route planning coordinate contract verification passed')
