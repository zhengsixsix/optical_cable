# System Management Workbench Redesign

## Background

The current platform administration functions are implemented as global dialogs:

- Data dictionary: `src/components/dialogs/DataDictionaryDialog.vue`
- Operation log: `src/components/dialogs/OperationLogDialog.vue`
- Account management: `src/components/dialogs/UserManageDialog.vue`
- Permission management: `src/components/dialogs/PermissionManageDialog.vue`

The requested direction is to stop using popup dialogs for these four functions and redesign them as full pages with stronger layout, visual hierarchy, and presentation quality.

The selected approach is **Option A: System Management Workbench**.

## Goals

- Replace the four modal-style administration experiences with routed page experiences.
- Create a dedicated "System Management" workbench with left-side secondary navigation.
- Keep the existing platform API and Pinia store behavior wherever possible.
- Improve scanning, filtering, editing, and operational clarity for admin workflows.
- Avoid nested modal interactions. Role assignment, dictionary editing, and permission editing happen inside the page.

## Non-Goals

- Do not redesign the whole application shell beyond adding the system management entry.
- Do not change platform API contracts.
- Do not rewrite authentication, password encryption, or session bootstrap behavior.
- Do not refactor unrelated planning, monitoring, or design modules.

## Information Architecture

Add a system management section with these routes:

- `/admin/users` for account management.
- `/admin/roles` for permission and role management.
- `/admin/dictionary` for data dictionary management.
- `/admin/logs` for operation logs.

All four routes use the same workbench frame:

- App header remains at the top.
- A full-page administration surface fills the router view.
- The left rail shows the four administration sections.
- The right content area renders the selected section.

The top navigation gets a "System Management" entry for admin users. Existing settings menu items that currently open these four dialogs should navigate to the corresponding routes instead.

## Visual Direction

The UI should feel like an operations-grade enterprise console:

- Dense but readable layout.
- Light neutral surfaces with restrained blue/teal primary accents and amber attention states.
- Tables first, cards only for summary metrics or repeated domain objects.
- 8px-or-less radii, crisp borders, stable row heights, and compact controls.
- No decorative hero sections, floating marketing cards, oversized typography, or one-note purple/blue gradients.
- Icons use the existing `lucide-vue-next` package.

Accessibility and interaction expectations:

- Button and icon-button targets are at least 44px where practical.
- Icon-only buttons have accessible labels or visible tooltips where the current component system supports them.
- Form labels are visible.
- Destructive actions remain visually separated and use existing confirmation behavior.
- Loading, empty, and error states are shown in-page.

## Page Design

### Shared Workbench Shell

Create a reusable admin layout component with:

- Left navigation rail for the four sections.
- Section title and short operational description.
- Optional metric strip under the page header.
- Main content area with table/list and detail/editor region.
- Consistent refresh, search, filter, and primary action placement.

The shell should be responsive:

- Desktop: rail + main content in a two-column layout.
- Narrow screens: rail becomes horizontal tabs above content.
- Tables keep useful columns visible and allow horizontal scroll only inside the table container when unavoidable.

### Account Management

The page replaces `UserManageDialog.vue`.

Layout:

- Header: title, refresh button, optional search input.
- Metrics: total users, pending approvals, enabled users, disabled/rejected users.
- Main area: user list table grouped or filterable by status.
- Detail side panel: selected user profile and role assignment.

Behaviors:

- Load users and roles when the page enters.
- Keep approve, reject, enable, disable, delete, reset password actions.
- Replace the current nested role editor modal with an in-page role assignment panel.
- Selecting a user opens that user's details on the right; no overlay is used.
- Saving role assignment refreshes the selected user and list state.

### Permission Management

The page replaces `PermissionManageDialog.vue`.

Layout:

- Left column inside content: searchable role list and new role button.
- Main editor: role form fields.
- Permission area: menu/function tree with checked states and selected count.
- Sticky page-level action bar for save and delete.

Behaviors:

- Load roles and menu tree when the page enters.
- Selecting a role loads role detail and selected menu IDs.
- Creating a role clears the editor and keeps the permission tree visible.
- Saving persists the role, then persists role-menu assignments.
- Deleting a role clears the editor when the deleted role was active.

### Data Dictionary

The page replaces `DataDictionaryDialog.vue`.

Layout:

- Left column: dictionary type navigation.
- Main column: dictionary item table/list.
- Right editor: code, name, detail, sort number, enabled state.
- Optional secondary list for business selectable items can appear below or as a side tab inside the main column.

Behaviors:

- Load dictionary entries and selectable items for the selected type.
- Selecting an item fills the editor.
- New item clears the editor but preserves current dictionary type.
- Save and delete reuse existing `platformDictionaryApi`.
- Delete still requires confirmation, but not a custom popup workflow.

### Operation Logs

The page replaces `OperationLogDialog.vue`.

Layout:

- Header filter bar: keyword/title, operator, method/status if supported by available fields.
- Main table: title, operator, method/url, status, cost time, operation time.
- Detail region: selected log record with request URL, parameters/result/error fields when present.
- Page summary: total count and current page metadata from `PageModel`.

Behaviors:

- Load logs when the page enters.
- Searching reloads page 1.
- Selecting a row shows details without an overlay.
- Keep the current search API and format unknown fields defensively.

## Component Boundaries

Preferred structure:

- `src/modules/admin/layout/AdminLayout.vue`
- `src/modules/admin/views/AdminUsersView.vue`
- `src/modules/admin/views/AdminRolesView.vue`
- `src/modules/admin/views/AdminDictionaryView.vue`
- `src/modules/admin/views/AdminLogsView.vue`
- Optional small local components under `src/modules/admin/components/` when repeated UI appears.

The existing dialog components may be removed from `App.vue` global mounting after replacement. If deletion is too risky in one step, leave the files temporarily unused, but no route should open them for these four admin workflows.

## Data Flow

- Account and permission pages continue to use `useUserStore`.
- Dictionary page continues to use `platformDictionaryApi`.
- Logs page continues to use `platformLogApi`.
- Notifications continue through `useAppStore().showNotification`.
- Route access should require authentication. Admin-only pages should also require admin status.

Router metadata:

- Add `requiresAuth: true` to all admin routes.
- Add `requiresAdmin: true` to account and permission management.
- Apply `requiresAdmin: true` to dictionary and logs as well unless there is a product reason to expose them to non-admin users.

## Error Handling

- API errors surface through existing notification toasts.
- In-page loading states disable primary actions and show progress.
- Empty states explain the missing data and provide the relevant next action when available.
- Form validation remains local for required fields before API calls.

## Testing And Verification

Manual verification:

- Log in as `admin`.
- Navigate to each admin route from the top menu and settings menu.
- Confirm no modal overlay appears for the four target functions.
- Confirm account role assignment happens in-page.
- Confirm dictionary create/edit/delete flows load and refresh data.
- Confirm permission role save and menu assignment flow still works.
- Confirm operation log search and detail display work.
- Confirm non-admin access is redirected by existing router guard.

Automated verification:

- Run `npm run build` after implementation.
- Run focused tests if admin or platform tests are added or touched.

## Rollout Notes

The work should be implemented in small pieces:

1. Add admin routes and shared admin layout.
2. Convert account management.
3. Convert permission management.
4. Convert data dictionary.
5. Convert operation logs.
6. Update header/menu links and remove global dialog mounts for these four functions.
7. Build and browser-verify the final experience.
