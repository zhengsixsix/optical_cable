import fs from 'node:fs'

const checks = [
  {
    file: 'src/stores/route.ts',
    forbidden: [
      'createRouteRepository',
      'createTransmissionMockRoute',
      'ensureTransmissionMockRoute',
      'transmission-debug-route',
      '调试登陆站',
      '调试路径点',
    ],
  },
  {
    file: 'src/App.vue',
    forbidden: [
      'routeStore.loadRoutes()',
      'useRouteStore',
    ],
  },
  {
    file: 'src/views/DesignView.vue',
    forbidden: [
      'ensureTransmissionMockRoute',
    ],
  },
  {
    file: 'src/repositories/index.ts',
    forbidden: [
      'MockRouteRepository',
      'createRouteRepository',
    ],
  },
  {
    file: 'src/repositories/mock/MockGeoRepository.ts',
    forbidden: [
      'createRouteRepository',
    ],
  },
  {
    file: 'src/data/mockData.ts',
    forbidden: [
      'mockRoutes',
    ],
  },
]

const failures = []

for (const check of checks) {
  const text = fs.readFileSync(check.file, 'utf8')
  for (const token of check.forbidden) {
    if (text.includes(token)) {
      failures.push(`${check.file} still contains ${JSON.stringify(token)}`)
    }
  }
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'))
}

console.log('route planning mock fallback verification passed')
