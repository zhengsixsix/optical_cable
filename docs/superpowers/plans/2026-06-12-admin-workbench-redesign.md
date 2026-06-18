# Admin Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert data dictionary, operation logs, account management, and permission management from global modal dialogs into a routed system management workbench.

**Architecture:** Add a focused `src/modules/admin` module with one shared layout and four routed page components. Keep existing `useUserStore`, `platformDictionaryApi`, and `platformLogApi` data flows, while updating the app shell so these workflows navigate to pages instead of opening dialogs.

**Tech Stack:** Vue 3 `<script setup>`, Vue Router, Pinia, Tailwind utility classes, existing base components, `lucide-vue-next`, Vitest.

---

### Task 1: Source-Level Route And Shell Contract Tests

**Files:**
- Create: `src/__tests__/admin-workbench.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

describe('admin workbench routing', () => {
  it('defines routed pages for the four system management sections', () => {
    const routerSource = source('../router/index.ts')

    expect(routerSource).toContain("path: '/admin'")
    expect(routerSource).toContain("redirect: '/admin/users'")
    expect(routerSource).toContain("path: '/admin/users'")
    expect(routerSource).toContain("path: '/admin/roles'")
    expect(routerSource).toContain("path: '/admin/dictionary'")
    expect(routerSource).toContain("path: '/admin/logs'")
    expect(routerSource).toContain("requiresAdmin: true")
  })

  it('provides a shared admin layout and four page components', () => {
    expect(source('../modules/admin/layout/AdminLayout.vue')).toContain('系统管理')
    expect(source('../modules/admin/views/AdminUsersView.vue')).toContain('账户管理')
    expect(source('../modules/admin/views/AdminRolesView.vue')).toContain('权限管理')
    expect(source('../modules/admin/views/AdminDictionaryView.vue')).toContain('数据字典')
    expect(source('../modules/admin/views/AdminLogsView.vue')).toContain('操作日志')
  })

  it('navigates admin menu items to pages instead of opening the four old dialogs', () => {
    const headerSource = source('../components/layout/AppHeader.vue')
    const appSource = source('../App.vue')

    expect(headerSource).toContain("router.push('/admin/users')")
    expect(headerSource).toContain("router.push('/admin/roles')")
    expect(headerSource).toContain("router.push('/admin/dictionary')")
    expect(headerSource).toContain("router.push('/admin/logs')")
    expect(headerSource).not.toContain("'data-dictionary': 'data-dictionary'")
    expect(headerSource).not.toContain("'operation-log': 'operation-log'")
    expect(headerSource).not.toContain("'permission-manage': 'permission-manage'")
    expect(appSource).not.toContain('<UserManageDialog')
    expect(appSource).not.toContain('<PermissionManageDialog')
    expect(appSource).not.toContain('<DataDictionaryDialog')
    expect(appSource).not.toContain('<OperationLogDialog')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/__tests__/admin-workbench.test.ts`

Expected: FAIL because `src/modules/admin/layout/AdminLayout.vue` and admin routes do not exist yet.

- [ ] **Step 3: Commit after the test is red**

Do not commit the red test alone. Continue to Task 2 and commit when the first green slice is complete.

### Task 2: Admin Layout And Routing

**Files:**
- Create: `src/modules/admin/layout/AdminLayout.vue`
- Create: `src/modules/admin/views/AdminUsersView.vue`
- Create: `src/modules/admin/views/AdminRolesView.vue`
- Create: `src/modules/admin/views/AdminDictionaryView.vue`
- Create: `src/modules/admin/views/AdminLogsView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Add the shared layout**

Create `AdminLayout.vue` with left navigation links for `/admin/users`, `/admin/roles`, `/admin/dictionary`, and `/admin/logs`, plus a `<RouterView />` content area.

- [ ] **Step 2: Add minimal page shells**

Create the four view files with page titles, short descriptions, and enough static markup for the Task 1 component tests to pass. These shells are temporary and will be filled in later tasks.

- [ ] **Step 3: Add routes**

Modify `src/router/index.ts` to add:

```ts
{
  path: '/admin',
  component: () => import('@/modules/admin/layout/AdminLayout.vue'),
  redirect: '/admin/users',
  meta: { title: '系统管理', requiresAuth: true, requiresAdmin: true },
  children: [
    {
      path: 'users',
      name: 'admin-users',
      component: () => import('@/modules/admin/views/AdminUsersView.vue'),
      meta: { title: '账户管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: 'roles',
      name: 'admin-roles',
      component: () => import('@/modules/admin/views/AdminRolesView.vue'),
      meta: { title: '权限管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: 'dictionary',
      name: 'admin-dictionary',
      component: () => import('@/modules/admin/views/AdminDictionaryView.vue'),
      meta: { title: '数据字典', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: 'logs',
      name: 'admin-logs',
      component: () => import('@/modules/admin/views/AdminLogsView.vue'),
      meta: { title: '操作日志', requiresAuth: true, requiresAdmin: true },
    },
  ],
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm run test:run -- src/__tests__/admin-workbench.test.ts`

Expected: still FAIL until AppHeader and App.vue are updated in later tasks.

### Task 3: Account Management Page

**Files:**
- Modify: `src/modules/admin/views/AdminUsersView.vue`

- [ ] **Step 1: Implement page state and data loading**

Use `useUserStore` and `useAppStore`. Load users and roles on mount. Keep these state refs: `isLoading`, `actionUserId`, `selectedUserId`, `selectedRoleIds`, `isRoleLoading`, and `isSavingRoles`.

- [ ] **Step 2: Implement computed views**

Add computed values for pending, approved, disabled/rejected, selected user, and metrics.

- [ ] **Step 3: Implement in-page role assignment**

When a user row is selected, load role IDs with `userStore.getUserRoleIds(user.id)` and render role checkboxes in the side panel. Save with `userStore.assignUserRoles`.

- [ ] **Step 4: Preserve user actions**

Keep approve, reject, enable, disable, delete, and reset password actions using existing store methods and `confirm` for destructive/reset actions.

- [ ] **Step 5: Run focused type check through build later**

No separate test command here; Task 8 runs build after all pages are wired.

### Task 4: Permission Management Page

**Files:**
- Modify: `src/modules/admin/views/AdminRolesView.vue`

- [ ] **Step 1: Move role management logic into the page**

Use the current `PermissionManageDialog.vue` logic as behavior reference: role search, role form, menu flattening, role detail loading, menu toggling, save, and delete.

- [ ] **Step 2: Render page layout**

Use a three-region page: role list, role editor, and permission tree. Keep all interactions in-page.

- [ ] **Step 3: Preserve save sequence**

Save the role with `userStore.saveRole`, then save selected menus with `userStore.saveRoleMenus`.

### Task 5: Data Dictionary Page

**Files:**
- Modify: `src/modules/admin/views/AdminDictionaryView.vue`

- [ ] **Step 1: Move dictionary logic into the page**

Use `platformDictionaryApi.search`, `platformDictionaryApi.listItem`, `platformDictionaryApi.save`, and `platformDictionaryApi.remove`.

- [ ] **Step 2: Render page layout**

Use left dictionary type navigation, main dictionary item list/table, and right editor.

- [ ] **Step 3: Preserve validation and refresh**

Validate required code/name before save. After save or delete, reload data and reset the form.

### Task 6: Operation Logs Page

**Files:**
- Modify: `src/modules/admin/views/AdminLogsView.vue`

- [ ] **Step 1: Move log search logic into the page**

Use `platformLogApi.search` and preserve defensive unknown-field formatting.

- [ ] **Step 2: Render table and detail panel**

Render title, operator, method/url, status, cost time, and operation time. Selecting a row shows details in-page.

- [ ] **Step 3: Preserve search behavior**

Search by title/keyword and reload page 1.

### Task 7: Header And App Shell Wiring

**Files:**
- Modify: `src/components/layout/AppHeader.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Update admin menu navigation**

In `AppHeader.vue`, route `data-dictionary`, `operation-log`, `user-manage`, and `permission-manage` to their `/admin/*` pages with `router.push(...)`. Add a top-level `系统管理` menu for admin users if the layout has room, and keep settings menu entries as route shortcuts.

- [ ] **Step 2: Remove global admin dialog imports and mounts**

In `App.vue`, remove imports and template mounts for `UserManageDialog`, `PermissionManageDialog`, `DataDictionaryDialog`, and `OperationLogDialog`.

- [ ] **Step 3: Run focused source tests**

Run: `npm run test:run -- src/__tests__/admin-workbench.test.ts`

Expected: PASS.

### Task 8: Final Verification And Browser Review

**Files:**
- No new files unless fixes are required.

- [ ] **Step 1: Run relevant tests**

Run: `npm run test:run -- src/__tests__/admin-workbench.test.ts src/__tests__/platform-api.test.ts`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS with exit code 0.

- [ ] **Step 3: Browser verify**

Open the dev app, log in as `admin`, navigate to:

- `/#/admin/users`
- `/#/admin/roles`
- `/#/admin/dictionary`
- `/#/admin/logs`

Expected:

- No modal overlay appears for these four workflows.
- The admin rail stays visible.
- Each page renders full-page content.
- Account role assignment is visible in the page side panel.
- Role permissions, dictionary editing, and log detail regions are in-page.

- [ ] **Step 4: Report changed files and verification evidence**

Include test/build commands and their results in the final response.
