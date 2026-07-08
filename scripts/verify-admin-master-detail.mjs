import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const views = [
  'src/modules/admin/views/AdminUsersView.vue',
  'src/modules/admin/views/AdminRolesView.vue',
  'src/modules/admin/views/AdminDictionaryView.vue',
  'src/modules/admin/views/AdminLayersView.vue',
  'src/modules/admin/views/AdminLogsView.vue',
]

const failures = []

for (const relativePath of views) {
  const source = readFileSync(resolve(root, relativePath), 'utf8')
  if (!source.includes('admin-master-detail-layout')) {
    failures.push(`${relativePath} must use the shared admin-master-detail-layout two-column structure.`)
  }
}

for (const relativePath of [
  'src/modules/admin/views/AdminUsersView.vue',
  'src/modules/admin/views/AdminRolesView.vue',
  'src/modules/admin/views/AdminDictionaryView.vue',
  'src/modules/admin/views/AdminLayersView.vue',
]) {
  const source = readFileSync(resolve(root, relativePath), 'utf8')
  if (!source.includes('admin-form-dialog')) {
    failures.push(`${relativePath} must use a shared admin-form-dialog modal instead of a permanent form panel.`)
  }
}

const users = readFileSync(resolve(root, 'src/modules/admin/views/AdminUsersView.vue'), 'utf8')
if (users.includes('const metrics') || users.includes('grid-cols-4')) {
  failures.push('AdminUsersView must not render separate metric cards above the master-detail layout.')
}
if (users.includes('页面内角色分配')) {
  failures.push('AdminUsersView role assignment must be a dialog, not a permanent right-side panel.')
}

const layers = readFileSync(resolve(root, 'src/modules/admin/views/AdminLayersView.vue'), 'utf8')
if (layers.includes('图层信息') || layers.includes('grid-cols-[minmax(0,1fr)_340px]')) {
  failures.push('AdminLayersView must not render a permanent right-side layer form.')
}

const logs = readFileSync(resolve(root, 'src/modules/admin/views/AdminLogsView.vue'), 'utf8')
if (!logs.includes('admin-log-layout')) {
  failures.push('AdminLogsView must use the log-specific master-detail layout variant.')
}
if (logs.includes('grid-cols-[minmax(0,1fr)_360px]')) {
  failures.push('AdminLogsView must not use the old arbitrary split grid.')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Admin master-detail layout checks passed.')
