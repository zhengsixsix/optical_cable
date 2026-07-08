import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const adminViews = [
  'src/modules/admin/views/AdminUsersView.vue',
  'src/modules/admin/views/AdminRolesView.vue',
  'src/modules/admin/views/AdminDictionaryView.vue',
  'src/modules/admin/views/AdminLayersView.vue',
  'src/modules/admin/views/AdminLogsView.vue',
]

const paginationComponent = resolve(root, 'src/modules/admin/components/AdminPagination.vue')
const failures = []

if (!existsSync(paginationComponent)) {
  failures.push('AdminPagination component is missing.')
}

for (const relativePath of adminViews) {
  const absolutePath = resolve(root, relativePath)
  const source = readFileSync(absolutePath, 'utf8')

  if (!source.includes('AdminPagination')) {
    failures.push(`${relativePath} does not render AdminPagination.`)
  }

  const largePageSizeMatch = source.match(/pageSize:\s*(?:50|100|1000)\b/)
  if (largePageSizeMatch) {
    failures.push(`${relativePath} still uses a fixed large pageSize (${largePageSizeMatch[0]}).`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Admin pagination checks passed.')
