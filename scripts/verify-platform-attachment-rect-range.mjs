import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()

function loadTsModule(relativePath, modules = {}, globals = {}) {
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
  vm.runInNewContext(
    output,
    { module, exports: module.exports, require, console, URLSearchParams, ...globals },
    { filename },
  )
  return module.exports
}

function expectEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const calls = []
const expectedBlob = { kind: 'attachment-blob' }
const attachment = loadTsModule(
  'src/services/platform/attachment.ts',
  {
    '@/config/api': { PLATFORM_API_BASE_URL: '/platform-api' },
    './client': {
      getPlatformToken: () => 'test-token',
      PlatformApiError: class PlatformApiError extends Error {},
    },
  },
  {
    fetch: async (url, options) => {
      calls.push({ url, options })
      return { ok: true, blob: async () => expectedBlob }
    },
  },
)

const rectRange = [47.97, 47.496, -11.961, -11.518]

expectEqual(
  attachment.getPlatformAttachmentUrl('folder/file', rectRange),
  '/platform-api/sys/attachment/folder%2Ffile?rectRange=47.97&rectRange=47.496&rectRange=-11.961&rectRange=-11.518',
  'attachment URL with rectRange',
)
expectEqual(
  attachment.getPlatformAttachmentUrl(2590101374495621121n),
  '/platform-api/sys/attachment/2590101374495621121',
  'attachment URL without rectRange',
)

const blob = await attachment.fetchPlatformAttachmentBlob(
  '/platform-api/sys/attachment/42?download=true&rectRange=0',
  rectRange,
)
expectEqual(blob, expectedBlob, 'attachment blob response')
expectEqual(
  calls[0],
  {
    url: '/platform-api/sys/attachment/42?download=true&rectRange=47.97&rectRange=47.496&rectRange=-11.961&rectRange=-11.518',
    options: {
      method: 'GET',
      credentials: 'include',
      headers: { Authorization: 'Bearer test-token' },
    },
  },
  'attachment request with rectRange',
)

await attachment.fetchPlatformAttachmentBlob(42)
expectEqual(calls[1].url, '/platform-api/sys/attachment/42', 'ordinary attachment request remains unchanged')

const mapArea = fs.readFileSync(path.join(root, 'src/modules/planning/components/MapArea.vue'), 'utf8')
if (!/loadPlatformAttachmentShpFeatures\([\s\S]*?viewportRequest\?\.rectRange \?\? getCurrentMapRectRange\(\),[\s\S]*?viewportRequest\?\.signal/.test(mapArea)) {
  throw new Error('vector platform attachments must use the current map rectRange')
}
if (!/rectRange:\$\{rectRange\.join\(','\)\}/.test(mapArea)) {
  throw new Error('GeoTIFF cache key must include rectRange')
}
if (!/createPlatformAttachmentGeoTiffSource\([\s\S]*?layerData\.metadata\.downloadUrl,[\s\S]*?rectRange,[\s\S]*?viewportRequest\?\.signal/.test(mapArea)) {
  throw new Error('GeoTIFF platform attachments must use the current map rectRange')
}

console.log('platform attachment rectRange verification passed')
