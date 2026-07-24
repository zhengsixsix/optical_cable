import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const root = process.cwd()
const srcRoot = resolve(root, 'src')
const dictionaryStorePath = resolve(srcRoot, 'stores/dictionary.ts')
const platformApiPath = resolve(srcRoot, 'services/platform/api.ts')
const uiOptionsPath = resolve(srcRoot, 'config/uiOptions.ts')
const settingsStorePath = resolve(srcRoot, 'stores/settings.ts')
const deviceTypeAdapterPath = resolve(srcRoot, 'services/platform/deviceTypeAdapter.ts')
const deviceLibraryMappingPath = resolve(srcRoot, 'services/platform/deviceLibraryMapping.ts')
const projectWizardPath = resolve(srcRoot, 'components/dialogs/ProjectWizardDialog.vue')
const settingsViewPath = resolve(srcRoot, 'views/SettingsView.vue')
const mockDataPath = resolve(srcRoot, 'data/mockData.ts')
const failures = []

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx|vue|js|mjs)$/.test(entry.name) ? [path] : []
  })
}

function displayPath(path) {
  return relative(root, path).replaceAll('\\', '/')
}

const dictionaryStore = readFileSync(dictionaryStorePath, 'utf8')
const uiOptions = readFileSync(uiOptionsPath, 'utf8')
const settingsStore = readFileSync(settingsStorePath, 'utf8')
const deviceLibraryMapping = readFileSync(deviceLibraryMappingPath, 'utf8')
const projectWizard = readFileSync(projectWizardPath, 'utf8')
const settingsView = readFileSync(settingsViewPath, 'utf8')
const files = sourceFiles(srcRoot)

for (const [property, type] of [
  ['armoringType', 'ARMORING_TYPE'],
  ['deviceType', 'DEVICE_TYPE'],
  ['layerType', 'LAYER_TYPE'],
]) {
  if (!dictionaryStore.includes(`${property}: '${type}'`)) {
    failures.push(`Dictionary store must define PLATFORM_DICTIONARY_TYPES.${property} as ${type}.`)
  }
}

if (!dictionaryStore.includes('platformDictionaryApi.listItemByType(key)')) {
  failures.push('Dictionary store must load platform dictionary values through the listItem endpoint.')
}

for (const [path, source] of [
  [projectWizardPath, projectWizard],
  [settingsViewPath, settingsView],
]) {
  if (!source.includes('loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType)')) {
    failures.push(`${displayPath(path)} must load ARMORING_TYPE through the unified dictionary store.`)
  }
  if (!source.includes('getItems(PLATFORM_DICTIONARY_TYPES.armoringType)')) {
    failures.push(`${displayPath(path)} must render armoring rows from the unified dictionary store.`)
  }
  if (!source.includes('armorRiskLevelOptions') || !source.includes('mapping.unitPrice')) {
    failures.push(`${displayPath(path)} must edit risk and cost on ARMORING_TYPE-driven rows.`)
  }
  if (/\briskLevelLabels\b|\briskThreshold\b/.test(source)) {
    failures.push(`${displayPath(path)} restores the fabricated risk-to-armoring mapping.`)
  }
}

if (!projectWizard.includes('loadDictionary(PLATFORM_DICTIONARY_TYPES.layerType)')
  || !projectWizard.includes('}, { immediate: true })')) {
  failures.push('ProjectWizardDialog must initialize LAYER_TYPE rows on its first visible render.')
}

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  if (file !== dictionaryStorePath && /['"](?:ARMORING_TYPE|DEVICE_TYPE|LAYER_TYPE)['"]/.test(source)) {
    failures.push(`${displayPath(file)} hard-codes a managed platform dictionary type.`)
  }
  if (file !== dictionaryStorePath && file !== platformApiPath && /\bplatformDictionaryApi\b/.test(source)) {
    failures.push(`${displayPath(file)} bypasses the unified dictionary store.`)
  }
  if (/\bcategoryMatchers\b/.test(source)) {
    failures.push(`${displayPath(file)} restores name-based device category guessing.`)
  }
  if (/['"]UNKNOWN['"]/.test(source)) {
    failures.push(`${displayPath(file)} restores a fabricated UNKNOWN business value.`)
  }
  if (/\b(?:DA|SA|LW|LWP|RA)\b|struct_(?:da|sa|lw|lwp|ra)_/i.test(source)) {
    failures.push(`${displayPath(file)} hard-codes an ARMORING_TYPE value instead of using the platform dictionary.`)
  }
  if (file !== deviceTypeAdapterPath && /['"](?:FIB|AMP|SPL|EQL|SCL)['"]/.test(source)) {
    failures.push(`${displayPath(file)} duplicates a runtime device type code outside the central adapter.`)
  }
}

for (const optionName of [
  'calculationModelOptions',
  'fiberModelOptions',
  'fiberPairTypeOptions',
  'pointTypeOptions',
]) {
  const emptyOptionPattern = new RegExp(`export\\s+const\\s+${optionName}[^=]*=\\s*\\[\\s*\\]`)
  if (!emptyOptionPattern.test(uiOptions)) {
    failures.push(`src/config/uiOptions.ts must keep ${optionName} empty until a real data source exists.`)
  }
}

if (/export\s+const\s+(?:cableTypeOptions|equipmentTypeOptions)\b/.test(uiOptions)) {
  failures.push('src/config/uiOptions.ts must not restore static cable or equipment type options.')
}

for (const legacySymbol of [
  'DEVICE_TYPE_DICTIONARY_TYPE',
  'platformDeviceTypeDictionaries',
  'deviceTypeDictionaryPromise',
  'deviceTypeDictionaryLoading',
  'loadPlatformDeviceTypeDictionaries',
]) {
  if (settingsStore.includes(legacySymbol)) {
    failures.push(`src/stores/settings.ts still contains legacy dictionary cache symbol ${legacySymbol}.`)
  }
}

if (existsSync(mockDataPath)) {
  failures.push('src/data/mockData.ts must remain deleted.')
}

if (/deviceTypeCd:\s*getDeviceTypeCodeForCategory/.test(deviceLibraryMapping)
  || /\|\|\s*getDeviceTypeCodeForConnectorType/.test(deviceLibraryMapping)) {
  failures.push('Platform device writes must not invent deviceTypeCd from an internal runtime type.')
}

if (!deviceLibraryMapping.includes("deviceTypeCd: deviceTypeCd?.trim() || undefined")) {
  failures.push('Imported platform libraries must receive an explicitly dictionary-validated deviceTypeCd.')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Platform dictionary source checks passed.')
