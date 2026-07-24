import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = relativePath => readFile(resolve(root, relativePath), 'utf8')
const exists = async relativePath => {
  try {
    await access(resolve(root, relativePath))
    return true
  } catch {
    return false
  }
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath))
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.vue'))) {
      files.push(entryPath)
    }
  }
  return files
}

const removedFiles = [
  'src/services/index.ts',
  'src/composables/index.ts',
  'src/services/DataLinkService.ts',
  'src/services/PhaseValidationService.ts',
  'src/services/RepeaterPlacementService.ts',
  'src/services/OpticalSimulationService.ts',
  'src/services/PlanningInsightService.ts',
  'src/services/simulationDataBuilder.ts',
  'src/services/simulationService.ts',
  'src/composables/useAmplifierPlacement.ts',
  'src/composables/useDerivedDevice.ts',
  'src/composables/useLinkCostSummary.ts',
  'src/composables/useSpanCalculation.ts',
  'src/utils/geo.ts',
  'src/utils/polyline.ts',
  'src/utils/routeLength.ts',
  'src/utils/routePosition.ts',
]
for (const relativePath of removedFiles) {
  assert.equal(await exists(relativePath), false, `${relativePath} should stay removed`)
}

const [
  app,
  dialogHost,
  header,
  importDialog,
  rplDialog,
  projectFiles,
  rplExport,
  monitorStore,
  settingsView,
  router,
  viteConfig,
  packageJson,
] = await Promise.all([
  read('src/App.vue'),
  read('src/app/GlobalDialogHost.vue'),
  read('src/components/layout/AppHeader.vue'),
  read('src/components/dialogs/ImportFileDialog.vue'),
  read('src/modules/design/dialogs/RPLManageDialog.vue'),
  read('src/services/ProjectFileService.ts'),
  read('src/services/RPLExportService.ts'),
  read('src/stores/monitor.ts'),
  read('src/views/SettingsView.vue'),
  read('src/router/index.ts'),
  read('vite.config.ts'),
  read('package.json'),
])

assert.match(app, /GlobalDialogHost/)
assert.match(dialogHost, /defineAsyncComponent/)
assert.match(dialogHost, /activeDialog/)
assert.match(header, /import\(['"]@\/services\/RPLExportService['"]\)/)
assert.match(header, /import\(['"]@\/services\/SLDExportService['"]\)/)
assert.doesNotMatch(projectFiles, /^import\s+JSZip\s+from\s+['"]jszip['"]/m)
assert.match(projectFiles, /await import\(['"]jszip['"]\)/)
assert.doesNotMatch(projectFiles, /restoreMonitorDevicesToConnector/)
assert.doesNotMatch(projectFiles, /\$patch\s*\(\s*\{\s*devices/)
assert.doesNotMatch(rplExport, /^import\s+ExcelJS\s+from\s+['"]exceljs['"]/m)
assert.match(rplExport, /await import\(['"]exceljs['"]\)/)
assert.match(importDialog, /readFirstWorksheetAsCsv\([^,]+,\s*fileName\)/)
assert.match(rplDialog, /readFirstWorksheetAsCsv\([^,]+,\s*file\.name\)/)
assert.match(settingsView, /transmission.*传输与仿真管理/s)
assert.match(router, /requiresRoute/)
assert.doesNotMatch(router, /requiresUSE/)
assert.doesNotMatch(viteConfig, /['"]vendor-data['"]/)
assert.doesNotMatch(monitorStore, /Math\.random|setInterval\s*\(/)

for (const fallback of [
  /approxDepth\s*\?\?\s*(?:r\.)?depth/,
  /targetBurialDepth\s*\?\?\s*(?:r\.)?burialDepth/,
  /additionalFeatures\s*\?\?\s*(?:r\.)?remarks/,
  /routeDistanceBetween\s*\?\?\s*(?:r\.)?segmentLength/,
  /routeDistanceCumulative\s*\?\?\s*(?:r\.)?cumulativeLength/,
]) {
  assert.doesNotMatch(rplExport, fallback, `RPL export fallback returned: ${fallback}`)
}

const sourcePaths = await collectSourceFiles(resolve(root, 'src'))
const sourceEntries = await Promise.all(sourcePaths.map(async filePath => ({
  filePath,
  source: await readFile(filePath, 'utf8'),
})))
const sourceCorpus = sourceEntries.map(entry => entry.source).join('\n')
for (const marker of [
  'rawMatrixTraceCoordinates',
  'matrixGeoReference',
  'renderAlgorithmRiskLayer',
  'convertSegmentResultToRoute',
  'applyPlatformAmplifierPlacements',
]) {
  assert.equal(sourceCorpus.includes(marker), false, `frontend algorithm marker returned: ${marker}`)
}

const directStoreWrites = []
const storeWritePattern = /\b[A-Za-z][A-Za-z0-9_]*Store(?:\??\.[A-Za-z][A-Za-z0-9_]*)+\s*=(?!=)/g
for (const { filePath, source } of sourceEntries) {
  for (const match of source.matchAll(storeWritePattern)) {
    const line = source.slice(0, match.index).split('\n').length
    directStoreWrites.push(`${relative(root, filePath).replaceAll('\\', '/')}:${line}: ${match[0].trim()}`)
  }
}
assert.deepEqual(
  directStoreWrites,
  [],
  `store state must be changed through explicit actions:\n${directStoreWrites.join('\n')}`,
)

const packageData = JSON.parse(packageJson)
assert.equal('@vueuse/core' in (packageData.dependencies ?? {}), false)
assert.equal('class-variance-authority' in (packageData.dependencies ?? {}), false)
assert.equal(packageData.scripts?.['test:excel-import'], 'node scripts/verify-excel-import.mjs')
assert.equal(packageData.scripts?.['test:rpl-export'], 'node scripts/verify-rpl-export.mjs')
assert.equal(
  packageData.scripts?.['test:route-results'],
  'node scripts/verify-backend-route-planning-response.mjs && node scripts/verify-route-planning-result.mjs',
)
assert.equal(packageData.scripts?.['test:project-import'], 'node scripts/verify-project-import-isolation.mjs')

console.log('Architecture checks passed (src)')
