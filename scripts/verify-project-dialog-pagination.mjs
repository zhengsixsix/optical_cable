import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const relativePath = 'src/components/dialogs/ProjectDialog.vue'
const source = readFileSync(resolve(root, relativePath), 'utf8')
const failures = []

if (/pageSize:\s*100\b/.test(source)) {
  failures.push(`${relativePath} still requests platform projects with pageSize: 100.`)
}

const requiredSnippets = [
  ['platformProjectPageNumber', 'missing platform project page number state.'],
  ['platformProjectPageSize', 'missing platform project page size state.'],
  ['platformProjectTotal', 'missing platform project total state.'],
  ['platformProjectPageTotal', 'missing platform project total page calculation.'],
  ['changePlatformProjectPage', 'missing platform project page change handler.'],
  ['pageNumber: platformProjectPageNumber.value', 'search request does not use the current page number.'],
  ['pageSize: platformProjectPageSize.value', 'search request does not use a 10-item page size state.'],
  ['上一页', 'missing previous page control.'],
  ['下一页', 'missing next page control.'],
]

for (const [snippet, message] of requiredSnippets) {
  if (!source.includes(snippet)) failures.push(`${relativePath} ${message}`)
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Project dialog pagination checks passed.')
