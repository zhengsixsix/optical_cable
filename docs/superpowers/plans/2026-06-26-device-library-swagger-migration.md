# Device Library Swagger Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将器件库相关前端逻辑全量迁移到 Swagger 的 `deviceLibrary/deviceEntity/deviceConfig/deviceValue` 模型。

**Architecture:** 先补齐平台类型和 API，再新增动态属性解析助手，然后让 `DeviceLibraryView.vue` 与 `SettingsView.vue` 共用同一套字典 tab、动态属性表单和保存 payload。最后把仿真、规划、SLD 读取参数的入口改成从 `deviceValueList` 解析，不再依赖旧的 `fiberTypes/amplifierTypes` 主模型。

**Tech Stack:** Vue 3, TypeScript, Pinia, Vite, Tailwind CSS, existing `platformClient`, existing base UI components.

---

## File Structure

- Modify `src/services/platform/types.ts`
  - Add Swagger-aligned device config/value types.
  - Extend `PlanDeviceLibrary` and `PlanDeviceEntity` with `projectId` and `deviceValueList`.
- Modify `src/services/platform/api.ts`
  - Add `platformDeviceConfigApi`.
  - Add `platformDeviceValueApi`.
  - Update endpoint definitions to include `deviceValueList`.
- Create `src/services/platform/deviceAttributes.ts`
  - Own all dynamic attribute mapping, grouping, inheritance, and payload conversion.
- Create `src/components/settings/DeviceDynamicValueForm.vue`
  - Render dynamic fields from `deviceConfig`.
  - Emit `{ [configCode]: value }` updates.
- Create `src/components/settings/DeviceTypeTabs.vue`
  - Render only dictionary-returned device types. No hard-coded fallback tabs.
- Modify `src/stores/settings.ts`
  - Add platform device config state and loaders.
  - Load library/entity details before editing.
  - Keep old arrays only where unrelated legacy code still compiles; do not use them as platform device-library source of truth.
- Rewrite `src/views/DeviceLibraryView.vue`
  - Platform-backed device type tabs, library list, library editor, entity list, entity editor.
- Modify `src/views/SettingsView.vue`
  - Replace the device-library section with the same platform model and shared form pieces.
- Modify parameter consumers that currently reference old device arrays:
  - `src/services/DeviceParamsService.ts`
  - `src/services/DeviceImportService.ts`
  - `src/services/ProjectFileService.ts`
  - `src/services/simulationService.ts`
  - `src/services/simulationDataBuilder.ts`
  - `src/services/platform/deviceLibraryMapping.ts`
  - `src/stores/sld.ts`
  - `src/views/DesignView.vue`
  - `src/views/MonitoringView.vue`
  - `src/composables/useProjectManager.ts`
  - `src/composables/useDerivedDevice.ts`
  - `src/composables/useAmplifierPlacement.ts`
  - `src/modules/design/panels/SLDTablePanel.vue`
  - `src/modules/design/panels/ConnectorPanel.vue`
  - `src/modules/design/dialogs/ConnectorDialog.vue`
  - `src/modules/design/dialogs/BUConfigDialog.vue`
  - `src/modules/design/dialogs/SimulationModelSelectDialog.vue`
  - `src/modules/design/dialogs/LinkConfigDialog.vue`
  - `src/modules/design/dialogs/SystemPlanningWizard.vue`
  - `src/modules/planning/components/MapArea.vue`
  - `src/modules/planning/dialogs/CableSegmentConfigDialog.vue`
  - `src/components/dialogs/ProjectWizardDialog.vue`

---

### Task 1: Add Swagger Device Types And API Wrappers

**Files:**
- Modify: `src/services/platform/types.ts`
- Modify: `src/services/platform/api.ts`

- [ ] **Step 1: Add device config and value types**

Add these interfaces to `src/services/platform/types.ts` after `PlatformBindFunc`:

```ts
export type PlanDeviceDataType = 'DATA_TYPE' | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'DATETIME'

export interface PlanDeviceConfig {
  id?: Id
  deviceTypeCd?: string | null
  deviceTypeName?: string | null
  name?: string | null
  code?: string | null
  dataTypeCd?: PlanDeviceDataType | string | null
  dataTypeName?: string | null
  dataFormat?: number | null
  dicCode?: string | null
  defaultValue?: string | null
  description?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
}

export interface PlanDeviceConfigSearch extends PagedSearch {
  id?: Id | null
  deviceTypeCd: string
  name?: string | null
  code?: string | null
  dataTypeCd?: PlanDeviceDataType | string | null
  dicCode?: string | null
  defaultValue?: string | null
  description?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
}

export interface PlanDeviceConfigSave {
  id?: Id | null
  deviceTypeCd: string
  name?: string | null
  code: string
  dataTypeCd?: PlanDeviceDataType | string | null
  dataFormat?: number | null
  dicCode?: string | null
  defaultValue?: string | null
  description?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
}

export interface PlanDeviceValueSave {
  id?: Id | null
  configCode?: string | null
  value?: string | null
}

export interface PlanDeviceValueSimple {
  deviceTypeCd?: string | null
  deviceTypeName?: string | null
  configName?: string | null
  configCode?: string | null
  dataTypeCd?: PlanDeviceDataType | string | null
  dataFormat?: number | null
  dicCode?: string | null
  defaultValue?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
  value?: string | null
}

export interface PlanDeviceValue {
  id?: Id
  deviceTypeCd?: string | null
  deviceTypeName?: string | null
  configCode?: string | null
  deviceLibraryId?: Id | null
  deviceLibraryName?: string | null
  deviceEntityId?: Id | null
  deviceEntityName?: string | null
  value?: string | null
}

export interface PlanDeviceValueSearch extends PagedSearch {
  id?: Id | null
  deviceTypeCd?: string | null
  configCode?: string | null
  deviceLibraryId?: Id | null
  deviceEntityId?: Id | null
  entityIsNull?: boolean | null
  value?: string | null
}
```

- [ ] **Step 2: Extend library and entity interfaces**

Update `PlanDeviceLibrary` and `PlanDeviceEntity` in `src/services/platform/types.ts`:

```ts
export interface PlanDeviceLibrary {
  id?: Id
  projectId?: Id | null
  name?: string | null
  deviceTypeCd?: string | null
  typeName?: string | null
  iconId?: Id | null
  iconName?: string | null
  iconSize?: PlatformIconSize | null
  dialogWindowId?: string | null
  dialogWindowName?: string | null
  bindFuncList?: PlatformBindFunc[] | null
  deviceValueList?: PlanDeviceValueSave[] | PlanDeviceValueSimple[] | null
}

export interface PlanDeviceEntity {
  id?: Id
  name?: string | null
  deviceTypeCd?: string | null
  typeName?: string | null
  iconId?: Id | null
  iconName?: string | null
  iconSize?: PlatformIconSize | null
  dialogWindowId?: string | null
  dialogWindowName?: string | null
  bindFuncList?: PlatformBindFunc[] | null
  libraryId?: Id | null
  libraryName?: string | null
  longitude?: number | null
  latitude?: number | null
  projectId?: Id | null
  sortNum?: number | null
  deviceValueList?: PlanDeviceValueSave[] | PlanDeviceValueSimple[] | null
}
```

- [ ] **Step 3: Add API wrappers**

Add imports in `src/services/platform/api.ts`:

```ts
  PlanDeviceConfig,
  PlanDeviceConfigSave,
  PlanDeviceConfigSearch,
  PlanDeviceValue,
  PlanDeviceValueSave,
  PlanDeviceValueSearch,
```

Add wrappers after `platformDeviceEntityApi`:

```ts
export const platformDeviceConfigApi = {
  search: (payload: PlanDeviceConfigSearch) =>
    platformClient.postWithPage<PlanDeviceConfig[]>('/plan/deviceConfig/search', payload),
  save: (payload: PlanDeviceConfigSave) =>
    platformClient.post<number | string>('/plan/deviceConfig/save', payload),
  detail: (id: Id) => platformClient.post<PlanDeviceConfig>('/plan/deviceConfig/detail', { id }),
  remove: (id: Id) => platformClient.post<boolean>('/plan/deviceConfig/remove', { id }),
}

export const platformDeviceValueApi = {
  search: (payload: PlanDeviceValueSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlanDeviceValue[]>('/plan/deviceValue/search', payload),
  save: (payload: PlanDeviceValueSave) =>
    platformClient.post<number | string>('/plan/deviceValue/save', payload),
  detail: (id: Id) => platformClient.post<PlanDeviceValue>('/plan/deviceValue/detail', { id }),
  remove: (id: Id) => platformClient.post<boolean>('/plan/deviceValue/remove', { id }),
}
```

- [ ] **Step 4: Update endpoint definitions**

Update `deviceLibrarySave` default payload in `platformEndpointDefinitions.push(...)`:

```ts
{
  key: 'deviceLibrarySave',
  group: '2.5 Device Library Management',
  name: 'Save device library',
  path: '/plan/deviceLibrary/save',
  defaultPayload: {
    id: null,
    projectId: null,
    name: '',
    deviceTypeCd: '',
    iconId: null,
    iconSize: { width: 48, height: 48 },
    dialogWindowId: null,
    bindFuncList: [],
    deviceValueList: [{ configCode: '', value: '' }],
  },
}
```

Update `deviceEntitySave` default payload:

```ts
{
  key: 'deviceEntitySave',
  group: '2.6 Device Entity Management',
  name: 'Save device entity',
  path: '/plan/deviceEntity/save',
  defaultPayload: {
    id: null,
    name: '',
    deviceTypeCd: '',
    iconId: null,
    iconSize: { width: 48, height: 48 },
    dialogWindowId: null,
    bindFuncList: [],
    libraryId: null,
    longitude: null,
    latitude: null,
    projectId: null,
    sortNum: 999,
    deviceValueList: [{ configCode: '', value: '' }],
  },
}
```

Add endpoint definitions for `deviceConfig` and `deviceValue` with Swagger paths and payloads.

- [ ] **Step 5: Verify types compile**

Run:

```powershell
npm run build
```

Expected: the build may fail later because consumers still need migration, but there should be no syntax error in `types.ts` or `api.ts`.

---

### Task 2: Add Dynamic Attribute Helpers

**Files:**
- Create: `src/services/platform/deviceAttributes.ts`

- [ ] **Step 1: Create helper module**

Create `src/services/platform/deviceAttributes.ts`:

```ts
import type {
  PlanDeviceConfig,
  PlanDeviceValueSave,
  PlanDeviceValueSimple,
} from './types'

export interface DeviceAttributeRow {
  config: PlanDeviceConfig
  configCode: string
  label: string
  groupCode: string
  groupName: string
  unit: string
  value: string
  inheritedValue: string
  source: 'entity' | 'library' | 'default' | 'empty'
}

export function deviceValueListToMap(
  values?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const item of values ?? []) {
    const code = item.configCode?.trim()
    if (!code) continue
    result[code] = item.value == null ? '' : String(item.value)
  }
  return result
}

export function buildDeviceValueList(values: Record<string, unknown>): PlanDeviceValueSave[] {
  return Object.entries(values)
    .filter(([configCode]) => configCode.trim().length > 0)
    .map(([configCode, value]) => ({
      configCode,
      value: value == null ? null : String(value),
    }))
}

export function resolveDeviceAttributeRows(
  configs: PlanDeviceConfig[],
  libraryValues?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null,
  entityValues?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null,
): DeviceAttributeRow[] {
  const libraryMap = deviceValueListToMap(libraryValues)
  const entityMap = deviceValueListToMap(entityValues)

  return configs
    .filter(config => Boolean(config.code))
    .map(config => {
      const code = String(config.code)
      const defaultValue = config.defaultValue == null ? '' : String(config.defaultValue)
      const hasEntity = Object.prototype.hasOwnProperty.call(entityMap, code)
      const hasLibrary = Object.prototype.hasOwnProperty.call(libraryMap, code)
      const value = hasEntity ? entityMap[code] : hasLibrary ? libraryMap[code] : defaultValue
      const source = hasEntity ? 'entity' : hasLibrary ? 'library' : defaultValue ? 'default' : 'empty'

      return {
        config,
        configCode: code,
        label: config.name || code,
        groupCode: config.groupCode || 'base',
        groupName: config.groupName || '基础参数',
        unit: config.unit || '',
        value,
        inheritedValue: hasLibrary ? libraryMap[code] : defaultValue,
        source,
      }
    })
}

export function groupDeviceAttributeRows(rows: DeviceAttributeRow[]) {
  const groups: Array<{ groupCode: string; groupName: string; rows: DeviceAttributeRow[] }> = []
  const index = new Map<string, number>()

  for (const row of rows) {
    const key = row.groupCode
    const existing = index.get(key)
    if (existing == null) {
      index.set(key, groups.length)
      groups.push({ groupCode: row.groupCode, groupName: row.groupName, rows: [row] })
    } else {
      groups[existing].rows.push(row)
    }
  }

  return groups
}

export function inputTypeForDeviceConfig(config: PlanDeviceConfig): 'text' | 'number' | 'checkbox' | 'datetime-local' {
  if (config.dataTypeCd === 'NUMBER') return 'number'
  if (config.dataTypeCd === 'BOOLEAN') return 'checkbox'
  if (config.dataTypeCd === 'DATETIME') return 'datetime-local'
  return 'text'
}
```

- [ ] **Step 2: Build-check helper**

Run:

```powershell
npm run build
```

Expected: helper file compiles. Any remaining failures should reference unmigrated consumers, not `deviceAttributes.ts`.

---

### Task 3: Add Shared Dynamic UI Components

**Files:**
- Create: `src/components/settings/DeviceTypeTabs.vue`
- Create: `src/components/settings/DeviceDynamicValueForm.vue`

- [ ] **Step 1: Create dictionary-only tab component**

Create `DeviceTypeTabs.vue`:

```vue
<script setup lang="ts">
import type { PlatformDictionary } from '@/services/platform/types'

defineProps<{
  items: PlatformDictionary[]
  modelValue: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto border-b">
    <span v-if="loading" class="px-3 py-2 text-sm text-gray-400">正在加载设备类型...</span>
    <span v-else-if="items.length === 0" class="px-3 py-2 text-sm text-gray-400">暂无设备类型字典数据</span>
    <button
      v-for="item in items"
      :key="item.code || item.id"
      type="button"
      class="border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap"
      :class="modelValue === item.code ? 'border-primary text-primary' : 'border-transparent text-gray-600 hover:text-gray-900'"
      @click="item.code && emit('update:modelValue', String(item.code))"
    >
      {{ item.name || item.code }}
    </button>
  </div>
</template>
```

- [ ] **Step 2: Create dynamic value form**

Create `DeviceDynamicValueForm.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Input, Select } from '@/shared/components/base'
import type { PlanDeviceConfig } from '@/services/platform/types'
import {
  groupDeviceAttributeRows,
  inputTypeForDeviceConfig,
  resolveDeviceAttributeRows,
} from '@/services/platform/deviceAttributes'

const props = defineProps<{
  configs: PlanDeviceConfig[]
  modelValue: Record<string, string>
  libraryValues?: Record<string, string>
  readonlyInherited?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, string>): void
}>()

const rows = computed(() => {
  const libraryList = Object.entries(props.libraryValues ?? {}).map(([configCode, value]) => ({ configCode, value }))
  const valueList = Object.entries(props.modelValue ?? {}).map(([configCode, value]) => ({ configCode, value }))
  return resolveDeviceAttributeRows(props.configs, libraryList, valueList)
})

const groups = computed(() => groupDeviceAttributeRows(rows.value))

const updateValue = (configCode: string, value: unknown) => {
  emit('update:modelValue', {
    ...props.modelValue,
    [configCode]: value == null ? '' : String(value),
  })
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="configs.length === 0" class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-gray-400">
      当前设备类型暂无动态属性配置
    </div>

    <section
      v-for="group in groups"
      :key="group.groupCode"
      class="rounded-md border bg-white p-4 dark:bg-gray-800"
      style="border-color: var(--app-border-color)"
    >
      <h4 class="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{{ group.groupName }}</h4>
      <div class="grid grid-cols-2 gap-4">
        <div v-for="row in group.rows" :key="row.configCode">
          <label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">{{ row.label }}</label>
          <div class="flex items-center gap-2">
            <input
              v-if="inputTypeForDeviceConfig(row.config) === 'checkbox'"
              type="checkbox"
              :checked="row.value === 'true' || row.value === '1'"
              @change="event => updateValue(row.configCode, (event.target as HTMLInputElement).checked ? 'true' : 'false')"
            />
            <Input
              v-else
              :type="inputTypeForDeviceConfig(row.config)"
              :model-value="row.value"
              class="flex-1"
              @update:model-value="value => updateValue(row.configCode, value)"
            />
            <span v-if="row.unit" class="w-20 shrink-0 text-xs text-gray-500">{{ row.unit }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 3: Remove unused import**

If `Select` is unused after writing the component, remove it from the import line:

```ts
import { Input } from '@/shared/components/base'
```

- [ ] **Step 4: Build-check components**

Run:

```powershell
npm run build
```

Expected: Vue compiler accepts both new components.

---

### Task 4: Update Settings Store Platform Device State

**Files:**
- Modify: `src/stores/settings.ts`

- [ ] **Step 1: Import new APIs and types**

Change imports:

```ts
import { platformDeviceConfigApi, platformDeviceEntityApi, platformDeviceLibraryApi } from '@/services/platform/api'
import type {
  PlanDeviceConfig,
  PlanDeviceConfigSearch,
  PlanDeviceEntity,
  PlanDeviceEntitySearch,
  PlanDeviceLibrary,
} from '@/services/platform/types'
```

- [ ] **Step 2: Add device config state**

Near platform device refs, add:

```ts
const platformDeviceConfigs = ref<PlanDeviceConfig[]>([])
const deviceConfigLoading = ref(false)
const deviceConfigSyncError = ref<string | null>(null)
```

- [ ] **Step 3: Add config loader**

Add function:

```ts
async function loadPlatformDeviceConfigs(search: PlanDeviceConfigSearch) {
  deviceConfigLoading.value = true
  deviceConfigSyncError.value = null
  try {
    const response = await platformDeviceConfigApi.search({
      pageNumber: 1,
      pageSize: 1000,
      ...search,
    })
    platformDeviceConfigs.value = response.data ?? []
    return response
  } catch (error) {
    deviceConfigSyncError.value = error instanceof Error ? error.message : '器件配置加载失败'
    throw error
  } finally {
    deviceConfigLoading.value = false
  }
}
```

- [ ] **Step 4: Add detail loaders**

Add:

```ts
async function loadPlatformDeviceLibraryDetail(id: number | string) {
  const detail = await platformDeviceLibraryApi.detail(id)
  const index = platformDeviceLibraries.value.findIndex(item => String(item.id) === String(id))
  if (index >= 0) platformDeviceLibraries.value[index] = { ...platformDeviceLibraries.value[index], ...detail }
  return detail
}

async function loadPlatformDeviceEntityDetail(id: number | string) {
  const detail = await platformDeviceEntityApi.detail(id)
  const index = platformDeviceEntities.value.findIndex(item => String(item.id) === String(id))
  if (index >= 0) platformDeviceEntities.value[index] = { ...platformDeviceEntities.value[index], ...detail }
  return detail
}
```

- [ ] **Step 5: Preserve `deviceValueList` on local optimistic save**

In `savePlatformDeviceLibrary`, ensure `payload.deviceValueList` is preserved:

```ts
const payload: PlanDeviceLibrary = {
  ...library,
  iconSize: library.iconSize ?? { width: 48, height: 48 },
  bindFuncList: library.bindFuncList ?? [],
  deviceValueList: library.deviceValueList ?? [],
}
```

In `savePlatformDeviceEntity`, ensure the saved object retains `deviceValueList`:

```ts
const saved = { ...entity, id, deviceValueList: entity.deviceValueList ?? [] }
```

- [ ] **Step 6: Export new state and functions**

Return:

```ts
platformDeviceConfigs,
deviceConfigLoading,
deviceConfigSyncError,
loadPlatformDeviceConfigs,
loadPlatformDeviceLibraryDetail,
loadPlatformDeviceEntityDetail,
```

- [ ] **Step 7: Build-check store**

Run:

```powershell
npm run build
```

Expected: any failures should identify call sites needing the new APIs.

---

### Task 5: Rewrite DeviceLibraryView To Platform Model

**Files:**
- Modify: `src/views/DeviceLibraryView.vue`

- [ ] **Step 1: Replace old local imports**

Remove imports for old typed dialogs:

```ts
import FiberTypeDialog from '@/components/dialogs/FiberTypeDialog.vue'
import AmplifierTypeDialog from '@/components/dialogs/AmplifierTypeDialog.vue'
import BranchingUnitTypeDialog from '@/components/dialogs/BranchingUnitTypeDialog.vue'
import EqualizerTypeDialog from '@/components/dialogs/EqualizerTypeDialog.vue'
import JointBoxTypeDialog from '@/components/dialogs/JointBoxTypeDialog.vue'
```

Add:

```ts
import { reactive, ref, computed, watch, onMounted } from 'vue'
import DeviceTypeTabs from '@/components/settings/DeviceTypeTabs.vue'
import DeviceDynamicValueForm from '@/components/settings/DeviceDynamicValueForm.vue'
import { platformDictionaryApi } from '@/services/platform/api'
import type { Id, PlanDeviceLibrary, PlanDeviceEntity, PlatformDictionary } from '@/services/platform/types'
import {
  buildDeviceValueList,
  deviceValueListToMap,
} from '@/services/platform/deviceAttributes'
```

- [ ] **Step 2: Replace tab source with dictionary data**

Add state:

```ts
const deviceTypes = ref<PlatformDictionary[]>([])
const deviceTypesLoading = ref(false)
const activeDeviceTypeCd = ref('')

const loadDeviceTypes = async () => {
  deviceTypesLoading.value = true
  try {
    deviceTypes.value = await platformDictionaryApi.listItem('DEVICE_TYPE')
    activeDeviceTypeCd.value = deviceTypes.value[0]?.code ? String(deviceTypes.value[0].code) : ''
  } finally {
    deviceTypesLoading.value = false
  }
}
```

No fallback list is allowed.

- [ ] **Step 3: Load configs and libraries by dictionary-selected code**

Add watcher:

```ts
watch(activeDeviceTypeCd, async deviceTypeCd => {
  if (!deviceTypeCd) return
  await Promise.all([
    settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd }),
    settingsStore.loadPlatformDeviceLibraries({ pageNumber: 1, pageSize: 1000, deviceTypeCd }),
  ])
}, { immediate: false })
```

- [ ] **Step 4: Add library form state**

```ts
const showLibraryDialog = ref(false)
const libraryValues = ref<Record<string, string>>({})
const libraryForm = reactive({
  id: undefined as Id | undefined,
  name: '',
  projectId: '' as Id | '',
  deviceTypeCd: '',
  iconId: '' as Id | '',
  iconWidth: 48,
  iconHeight: 48,
  dialogWindowId: '',
})
```

- [ ] **Step 5: Open create/edit library with detail values**

```ts
const openCreateLibrary = () => {
  Object.assign(libraryForm, {
    id: undefined,
    name: '',
    projectId: '',
    deviceTypeCd: activeDeviceTypeCd.value,
    iconId: '',
    iconWidth: 48,
    iconHeight: 48,
    dialogWindowId: '',
  })
  libraryValues.value = {}
  showLibraryDialog.value = true
}

const openEditLibrary = async (library: PlanDeviceLibrary) => {
  const detail = library.id ? await settingsStore.loadPlatformDeviceLibraryDetail(library.id) : library
  Object.assign(libraryForm, {
    id: detail.id,
    name: detail.name || '',
    projectId: detail.projectId ?? '',
    deviceTypeCd: detail.deviceTypeCd || activeDeviceTypeCd.value,
    iconId: detail.iconId ?? '',
    iconWidth: detail.iconSize?.width ?? 48,
    iconHeight: detail.iconSize?.height ?? 48,
    dialogWindowId: detail.dialogWindowId || '',
  })
  libraryValues.value = deviceValueListToMap(detail.deviceValueList)
  showLibraryDialog.value = true
}
```

- [ ] **Step 6: Save library using Swagger payload**

```ts
const saveLibrary = async () => {
  const payload: PlanDeviceLibrary = {
    id: libraryForm.id,
    projectId: libraryForm.projectId || null,
    name: libraryForm.name || null,
    deviceTypeCd: libraryForm.deviceTypeCd || null,
    iconId: libraryForm.iconId || null,
    iconSize: { width: Number(libraryForm.iconWidth) || 48, height: Number(libraryForm.iconHeight) || 48 },
    dialogWindowId: libraryForm.dialogWindowId || null,
    bindFuncList: [],
    deviceValueList: buildDeviceValueList(libraryValues.value),
  }
  await settingsStore.savePlatformDeviceLibrary(payload)
  await settingsStore.loadPlatformDeviceLibraries({ pageNumber: 1, pageSize: 1000, deviceTypeCd: activeDeviceTypeCd.value })
  showLibraryDialog.value = false
}
```

- [ ] **Step 7: Add entity form with inherited values**

Use the same pattern as the library form, but store:

```ts
const entityValues = ref<Record<string, string>>({})
const inheritedLibraryValues = ref<Record<string, string>>({})
```

When creating an entity, call library detail and set:

```ts
inheritedLibraryValues.value = deviceValueListToMap(detail.deviceValueList)
entityValues.value = { ...inheritedLibraryValues.value }
```

Save with:

```ts
deviceValueList: buildDeviceValueList(entityValues.value)
```

- [ ] **Step 8: Replace template**

The template must use:

```vue
<DeviceTypeTabs
  v-model="activeDeviceTypeCd"
  :items="deviceTypes"
  :loading="deviceTypesLoading"
/>
```

Library and entity dialogs must include:

```vue
<DeviceDynamicValueForm
  v-model="libraryValues"
  :configs="settingsStore.platformDeviceConfigs"
/>
```

For entity:

```vue
<DeviceDynamicValueForm
  v-model="entityValues"
  :configs="settingsStore.platformDeviceConfigs"
  :library-values="inheritedLibraryValues"
/>
```

- [ ] **Step 9: Build-check page**

Run:

```powershell
npm run build
```

Expected: no references to removed old dialog components inside `DeviceLibraryView.vue`.

---

### Task 6: Update SettingsView Device Library Section

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: Remove old add-device modal state from equipment section**

Remove state and handlers used only by old local forms:

```ts
showAddFiberDialog
showAddAmplifierDialog
showAddBranchingDialog
showAddEqualizerDialog
showAddJointDialog
newFiber
newAmplifier
newBranching
newEqualizer
newJoint
```

Keep unrelated route, planning, and monitoring settings state unchanged.

- [ ] **Step 2: Reuse dictionary-only tabs**

Import:

```ts
import DeviceTypeTabs from '@/components/settings/DeviceTypeTabs.vue'
import DeviceDynamicValueForm from '@/components/settings/DeviceDynamicValueForm.vue'
import {
  buildDeviceValueList,
  deviceValueListToMap,
} from '@/services/platform/deviceAttributes'
```

Use existing `platformDeviceTypeDictionaries` as the source. Do not append any default options if the dictionary is empty.

- [ ] **Step 3: Add dynamic values to existing platform forms**

Extend form defaults:

```ts
deviceValues: {} as Record<string, string>,
libraryValues: {} as Record<string, string>,
```

For library form, only `deviceValues` is needed.

For entity form, `libraryValues` stores inherited values and `deviceValues` stores current instance values.

- [ ] **Step 4: Load configs when device type changes**

Add:

```ts
watch(() => platformLibraryForm.deviceTypeCd, deviceTypeCd => {
  if (deviceTypeCd) void settingsStore.loadPlatformDeviceConfigs({ deviceTypeCd })
})
```

Also load configs when selected platform library changes.

- [ ] **Step 5: Edit library through detail endpoint**

Update `openEditPlatformLibrary` to call `loadPlatformDeviceLibraryDetail` before populating form:

```ts
const detail = library.id ? await settingsStore.loadPlatformDeviceLibraryDetail(library.id) : library
platformLibraryForm.deviceValues = deviceValueListToMap(detail.deviceValueList)
```

Make the function `async`.

- [ ] **Step 6: Save library values**

Update `buildPlatformLibraryPayload`:

```ts
deviceValueList: buildDeviceValueList(platformLibraryForm.deviceValues),
```

- [ ] **Step 7: Create/edit entity with inherited values**

When library changes:

```ts
const detail = library.id ? await settingsStore.loadPlatformDeviceLibraryDetail(library.id) : library
platformEntityForm.libraryValues = deviceValueListToMap(detail.deviceValueList)
platformEntityForm.deviceValues = { ...platformEntityForm.libraryValues }
```

When editing entity:

```ts
const detail = entity.id ? await settingsStore.loadPlatformDeviceEntityDetail(entity.id) : entity
platformEntityForm.deviceValues = deviceValueListToMap(detail.deviceValueList)
```

- [ ] **Step 8: Render dynamic form in dialogs**

Add this to the library dialog:

```vue
<section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
  <DeviceDynamicValueForm
    v-model="platformLibraryForm.deviceValues"
    :configs="settingsStore.platformDeviceConfigs"
  />
</section>
```

Add this to the entity dialog:

```vue
<section class="rounded-md border bg-white p-4 dark:bg-gray-800" style="border-color: var(--app-border-color)">
  <DeviceDynamicValueForm
    v-model="platformEntityForm.deviceValues"
    :configs="settingsStore.platformDeviceConfigs"
    :library-values="platformEntityForm.libraryValues"
  />
</section>
```

- [ ] **Step 9: Build-check settings page**

Run:

```powershell
npm run build
```

Expected: `SettingsView.vue` compiles and no old local add-device dialog state remains in the equipment platform section.

---

### Task 7: Migrate Parameter Consumers

**Files:**
- Modify: `src/services/DeviceParamsService.ts`
- Modify: `src/services/DeviceImportService.ts`
- Modify: `src/services/ProjectFileService.ts`
- Modify: `src/services/simulationService.ts`
- Modify: `src/services/simulationDataBuilder.ts`
- Modify: `src/services/platform/deviceLibraryMapping.ts`
- Modify: `src/stores/sld.ts`
- Modify: `src/views/DesignView.vue`
- Modify: `src/views/MonitoringView.vue`
- Modify: `src/composables/useProjectManager.ts`
- Modify: `src/composables/useDerivedDevice.ts`
- Modify: `src/composables/useAmplifierPlacement.ts`
- Modify: `src/modules/design/panels/SLDTablePanel.vue`
- Modify: `src/modules/design/panels/ConnectorPanel.vue`
- Modify: `src/modules/design/dialogs/ConnectorDialog.vue`
- Modify: `src/modules/design/dialogs/BUConfigDialog.vue`
- Modify: `src/modules/design/dialogs/SimulationModelSelectDialog.vue`
- Modify: `src/modules/design/dialogs/LinkConfigDialog.vue`
- Modify: `src/modules/design/dialogs/SystemPlanningWizard.vue`
- Modify: `src/modules/planning/components/MapArea.vue`
- Modify: `src/modules/planning/dialogs/CableSegmentConfigDialog.vue`
- Modify: `src/components/dialogs/ProjectWizardDialog.vue`

- [ ] **Step 1: Locate direct old-array consumers**

Run:

```powershell
rg -n "fiberTypes|amplifierTypes|branchingUnitTypes|equalizerTypes|jointBoxTypes" src
```

Classify each result:

- UI display for old local page: migrate or remove.
- Simulation/planning parameter read: migrate to resolver.
- Import/export compatibility: convert to Swagger model or isolate as legacy import only.

- [ ] **Step 2: Add parameter resolver**

In `src/services/DeviceParamsService.ts`, add a resolver function that accepts a `PlanDeviceLibrary`:

```ts
import type { PlanDeviceLibrary } from '@/services/platform/types'
import { deviceValueListToMap } from '@/services/platform/deviceAttributes'

export function getDeviceLibraryParam(library: PlanDeviceLibrary | null | undefined, code: string, fallback = 0): number {
  const valueMap = deviceValueListToMap(library?.deviceValueList)
  const numeric = Number(valueMap[code])
  return Number.isFinite(numeric) ? numeric : fallback
}
```

Add domain helpers only for codes used by current business logic:

```ts
export function getFiberAttenuation(library: PlanDeviceLibrary | null | undefined): number {
  return getDeviceLibraryParam(library, 'attenuation', 0)
}

export function getAmplifierNoiseFigure(library: PlanDeviceLibrary | null | undefined): number {
  return getDeviceLibraryParam(library, 'noise_figure', 0)
}
```

If backend config codes differ, update the helper names to the actual `deviceConfig.code` values used by the project data.

- [ ] **Step 3: Replace old consumers one file at a time**

For each old-array consumer, replace direct access like:

```ts
const fiber = settingsStore.fiberTypes[0]
const attenuation = fiber?.attenuationCoeff ?? 0.2
```

with platform data resolution:

```ts
const fiberLibrary = settingsStore.platformDeviceLibraries.find(item => item.deviceTypeCd === selectedDeviceTypeCd)
const attenuation = getFiberAttenuation(fiberLibrary)
```

Do not create fake platform libraries when none exist.

- [ ] **Step 4: Build after each consumer file**

Run:

```powershell
npm run build
```

Expected: each migrated file compiles before moving to the next file.

---

### Task 8: Final Verification

**Files:**
- No new files unless build identifies a missing import or type mismatch.

- [ ] **Step 1: Run full build**

Run:

```powershell
npm run build
```

Expected: command exits with code 0.

- [ ] **Step 2: Run dictionary-only grep**

Run:

```powershell
rg -n "FIB|AMP|BU|EQ|JB|fiberTypes|amplifierTypes|branchingUnitTypes|equalizerTypes|jointBoxTypes" src docs/superpowers/specs/2026-06-26-device-library-swagger-migration-design.md
```

Expected:

- Fixed device codes may appear only in comments, historical docs, deleted legacy code not used at runtime, or explicit backend examples.
- Old arrays must not be used as the platform device-library source of truth.

- [ ] **Step 3: Manual UI checks**

Run dev server:

```powershell
npm run dev
```

Open the printed local URL and verify:

- If `DEVICE_TYPE` dictionary returns an empty list, no fake tabs render.
- If dictionary returns entries, tabs match dictionary entries only.
- Device library create/edit loads configs and saves `deviceValueList`.
- Device entity create/edit inherits library values and saves coordinates plus `deviceValueList`.

- [ ] **Step 4: Commit final implementation**

Stage only files changed by this migration:

```powershell
git add -- src/services/platform/types.ts src/services/platform/api.ts src/services/platform/deviceAttributes.ts src/components/settings/DeviceTypeTabs.vue src/components/settings/DeviceDynamicValueForm.vue src/stores/settings.ts src/views/DeviceLibraryView.vue src/views/SettingsView.vue src/services/DeviceParamsService.ts src/services/simulationDataBuilder.ts src/services/platform/deviceLibraryMapping.ts
git commit -m "feat: migrate device library to swagger model"
```

---

## Self-Review

- Spec coverage:
  - Dictionary-only tabs: Task 3, Task 5, Task 6, Task 8.
  - Swagger APIs and types: Task 1.
  - Dynamic configs and values: Task 2, Task 3, Task 5, Task 6.
  - Library/entity inheritance: Task 2, Task 5, Task 6.
  - Historical UI reference: Task 3, Task 5, Task 6.
  - Parameter consumers: Task 7.
  - Verification: Task 8.
- Completion scan:
  - The plan avoids incomplete markers and open-ended implementation notes.
- Type consistency:
  - Helper functions use `PlanDeviceConfig`, `PlanDeviceValueSave`, `PlanDeviceValueSimple`, `PlanDeviceLibrary`, and `PlanDeviceEntity` defined in Task 1.
