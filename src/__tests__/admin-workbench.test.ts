import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

function countOccurrences(text: string, pattern: string) {
  return text.split(pattern).length - 1
}

describe('admin workbench routing', () => {
  it('defines routed pages for the system management sections', () => {
    const routerSource = source('../router/index.ts')

    expect(routerSource).toContain("path: '/admin'")
    expect(routerSource).toContain("redirect: '/admin/users'")
    expect(routerSource).toContain("path: '/admin/users'")
    expect(routerSource).toContain("path: '/admin/roles'")
    expect(routerSource).toContain("path: '/admin/dictionary'")
    expect(routerSource).toContain("path: '/admin/logs'")
    expect(routerSource).toContain("path: '/admin/layers'")
    expect(routerSource).toContain('requiresAdmin: true')
  })

  it('provides a shared admin layout and page components', () => {
    expect(source('../modules/admin/layout/AdminLayout.vue')).toContain('系统管理')
    expect(source('../modules/admin/views/AdminUsersView.vue')).toContain('账户管理')
    expect(source('../modules/admin/views/AdminRolesView.vue')).toContain('权限管理')
    expect(source('../modules/admin/views/AdminDictionaryView.vue')).toContain('数据字典')
    expect(source('../modules/admin/views/AdminLogsView.vue')).toContain('操作日志')
    expect(source('../modules/admin/views/AdminLayersView.vue')).toContain('平台图层库')
  })

  it('lets admin pages own their titles without a duplicate layout page header', () => {
    const layoutSource = source('../modules/admin/layout/AdminLayout.vue')

    expect(layoutSource).toContain('<RouterView />')
    expect(layoutSource).not.toContain('activeSection')
    expect(layoutSource).not.toContain('sticky top-0')
  })

  it('keeps admin sections routed without opening the four old dialogs', () => {
    const appSource = source('../App.vue')

    expect(appSource).not.toContain('<UserManageDialog')
    expect(appSource).not.toContain('<PermissionManageDialog')
    expect(appSource).not.toContain('<DataDictionaryDialog')
    expect(appSource).not.toContain('<OperationLogDialog')
    expect(appSource).not.toContain('<PlatformLayerLibraryDialog')
  })

  it('renders system management as a single top navigation entry', () => {
    const headerSource = source('../components/layout/AppHeader.vue')

    expect(headerSource).toContain('to="/admin"')
    expect(countOccurrences(headerSource, '系统管理')).toBe(1)
    expect(headerSource).not.toContain('to="/admin/users"')
    expect(headerSource).not.toContain('to="/admin/roles"')
    expect(headerSource).not.toContain('to="/admin/dictionary"')
    expect(headerSource).not.toContain('to="/admin/logs"')
    expect(headerSource).not.toContain('to="/admin/layers"')
    expect(headerSource).not.toContain('账户管理')
    expect(headerSource).not.toContain('权限管理')
    expect(headerSource).not.toContain('数据字典')
    expect(headerSource).not.toContain('操作日志')
    expect(headerSource).not.toContain('平台图层库')
  })
})
