import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()
const defaultResponsePath = 'C:\\Users\\Administrator\\.codex\\attachments\\716b98bf-7a83-4803-868a-1e66aeca4c63\\pasted-text.txt'
const responsePath = process.argv[2] || defaultResponsePath

function loadTsModule(relativePath, modules = {}) {
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
  const require = specifier => {
    if (modules[specifier]) return modules[specifier]
    throw new Error(`Unexpected runtime import ${specifier} in ${relativePath}`)
  }
  vm.runInNewContext(output, { module, exports: module.exports, require, console }, { filename })
  return module.exports
}

function assertClose(actual, expected, label, tolerance = 1e-6) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

function assertValidLonLat(coord, label) {
  const [lon, lat] = coord
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error(`${label}: invalid longitude ${lon}`)
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`${label}: invalid latitude ${lat}`)
  }
}

const routeDataConverter = loadTsModule('src/services/RouteDataConverter.ts')
const routePlanningResultService = loadTsModule('src/services/RoutePlanningResultService.ts', {
  jszip: { default: {} },
})
const routePlanningApiService = loadTsModule('src/services/RoutePlanningApiService.ts', {
  '@/services/platform/api': {
    platformProjectApi: {
      routePlan: async () => {
        throw new Error('routePlan should not be called by this verification')
      },
    },
  },
  '@/services/RouteDataConverter': routeDataConverter,
  '@/services/RoutePlanningResultService': routePlanningResultService,
})

const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'))
const result = routePlanningApiService.convertBackendRoutePlanningData(response.data, 'backend-coordinate-order-verification')
const route = result.routes[0]

if (!route) throw new Error('expected at least one visible route')
if (route.rawTrunkCoordinates.length < 2) throw new Error('expected raw trunk coordinates')

const firstCoord = route.rawTrunkCoordinates[0]
assertClose(firstCoord[0], 117.60520148672566, 'first longitude')
assertClose(firstCoord[1], 36.66518811320755, 'first latitude')

const segmentRoute = routeDataConverter.convertSegmentResultToRoute(
  response.data['segment_result_base_FixSpacing.json'],
  0,
  'coordinate order segment route',
  response.data['FMM_path_result.json'][0],
)
const firstSegmentPoint = segmentRoute.points[0]?.coordinates
if (!firstSegmentPoint) throw new Error('expected converted segment route points')
assertClose(firstSegmentPoint[0], 117.60520148672566, 'first segment point longitude')
assertClose(firstSegmentPoint[1], 36.66518811320755, 'first segment point latitude')

result.routes.forEach((item, routeIndex) => {
  item.rawTrunkCoordinates.forEach((coord, coordIndex) => {
    assertValidLonLat(coord, `route ${routeIndex} rawTrunkCoordinates[${coordIndex}]`)
  })
  item.points.forEach((point, pointIndex) => {
    assertValidLonLat(point.coordinates, `route ${routeIndex} points[${pointIndex}]`)
  })
})

console.log('route planning coordinate order verification passed')
