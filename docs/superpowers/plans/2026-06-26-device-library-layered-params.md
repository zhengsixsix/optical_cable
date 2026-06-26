# Device Library Layered Params Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved “方案 B” device-library UI: dynamic device parameters are split into device model parameters and calculation-model drawers while preserving Swagger 2.5-2.8 payloads.

**Architecture:** Keep the existing Swagger-backed store and page structure, and add a focused parameter-layer helper in `src/services/platform/deviceAttributes.ts`. The shared `DeviceDynamicValueForm.vue` will render one base section plus collapsible model parameter sections, and both `DeviceLibraryView.vue` and `SettingsView.vue` will reuse it. Parameter consumers continue to go through `deviceRuntime.ts`, which will be tightened to prefer `jsonField`, then `configCode` / `code`.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vite, Tailwind CSS, existing platform API wrappers, existing base `Input` / `Select` controls.

---

## File Structure

- Modify `src/services/platform/deviceAttributes.ts`
  - Own value-map conversion, parameter source resolution, base-vs-model grouping, reuse-by-name-and-unit, and algorithm field mapping.
- Modify `src/services/platform/deviceRuntime.ts`
  - Read runtime simulation/planning parameters from `jsonField`, `configCode`, and legacy aliases in a deterministic order.
- Modify `src/components/settings/DeviceDynamicValueForm.vue`
  - Render “器件模型参数” as the base section and model groups as collapsible drawers.
  - Show value source labels: 实例覆盖、器件库、默认值、未填写.
  - Render `DATA_TYPE` configs as dictionary-backed selects when `dicCode` is present.
- Modify `src/views/DeviceLibraryView.vue`
  - Keep existing layout, but make the config manager explicitly explain group-code conventions and make preview/source text use the new helper output.
- Modify `src/views/SettingsView.vue`
  - Reuse the same layered dynamic form behavior in the settings device-library section.
- Create `tmp/verify-device-attributes.mjs`
  - Temporary verification script for helper behavior. Do not commit it; remove before final commit.

---

### Task 1: Add Layered Attribute Helper Behavior

**Files:**
- Modify: `src/services/platform/deviceAttributes.ts`
- Temporary Test: `tmp/verify-device-attributes.mjs`

- [ ] **Step 1: Write the failing helper verification script**

Create `tmp/verify-device-attributes.mjs` with this content:

```js
import { readFileSync } from 'node:fs'
import ts from '../node_modules/typescript/lib/typescript.js'

const source = readFileSync('src/services/platform/deviceAttributes.ts', 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(compiled)}`
const attrs = await import(moduleUrl)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const configs = [
  {
    name: '衰减系数',
    code: 'attenuation',
    jsonField: 'fiber.alpha',
    dataTypeCd: 'NUMBER',
    unit: 'dB/km',
    groupCode: 'base',
    groupName: '基础物理参数',
    defaultValue: '0.18',
  },
  {
    name: '等效噪声带宽',
    code: 'gn_noise_bw',
    jsonField: 'gn.noiseBandwidth',
    dataTypeCd: 'NUMBER',
    unit: 'GHz',
    groupCode: 'GN',
    groupName: 'GN 模型参数',
  },
  {
    name: '等效噪声带宽',
    code: 'egn_noise_bw',
    jsonField: 'egn.noiseBandwidth',
    dataTypeCd: 'NUMBER',
    unit: 'GHz',
    groupCode: 'EGN',
    groupName: 'EGN 模型参数',
  },
]

const rows = attrs.resolveDeviceAttributeRows(
  configs,
  [{ configCode: 'attenuation', value: '0.16' }, { configCode: 'gn_noise_bw', value: '12.5' }],
  [{ configCode: 'attenuation', value: '0.15' }],
)

const groups = attrs.groupDeviceAttributeRows(rows)
assert(groups[0].kind === 'base', 'base group should be first')
assert(groups[0].groupName === '器件模型参数', 'base group should use the fixed layered title')
assert(groups[1].kind === 'model', 'GN group should be model kind')
assert(groups[1].drawer === true, 'model group should render as drawer')

const attenuation = rows.find(row => row.configCode === 'attenuation')
assert(attenuation.value === '0.15', 'entity value should override library value')
assert(attenuation.source === 'entity', 'entity override should be marked as entity')
assert(attenuation.algorithmField === 'fiber.alpha', 'jsonField should be exposed as algorithmField')

const egn = rows.find(row => row.configCode === 'egn_noise_bw')
assert(egn.value === '12.5', 'same name and unit should initialize from GN value')
assert(egn.source === 'reused', 'reused model value should be marked as reused')

const payload = attrs.buildDeviceAlgorithmParams(rows)
assert(payload['fiber.alpha'] === '0.15', 'algorithm payload should prefer jsonField')
assert(payload['egn.noiseBandwidth'] === '12.5', 'algorithm payload should include reused drawer values')

console.log('device attribute helper verification passed')
```

- [ ] **Step 2: Run the helper script to verify it fails**

Run:

```powershell
node tmp/verify-device-attributes.mjs
```

Expected: FAIL with an error such as `groups[0].kind` missing or `buildDeviceAlgorithmParams is not a function`.

- [ ] **Step 3: Implement layered helper types and behavior**

Update `src/services/platform/deviceAttributes.ts` to include these public types and functions. Replace the existing `DeviceAttributeRow`, `DeviceAttributeGroup`, `resolveDeviceAttributeRows`, and `groupDeviceAttributeRows` implementations with this complete behavior while keeping `deviceValueListToMap`, `buildDeviceValueList`, and `inputTypeForDeviceConfig` exports:

```ts
import type {
  PlanDeviceConfig,
  PlanDeviceValueSave,
  PlanDeviceValueSimple,
} from './types'

export type DeviceAttributeSource = 'entity' | 'library' | 'default' | 'reused' | 'empty'
export type DeviceAttributeGroupKind = 'base' | 'model'

export interface DeviceAttributeRow {
  config: PlanDeviceConfig
  configCode: string
  algorithmField: string
  label: string
  groupCode: string
  groupName: string
  unit: string
  value: string
  inheritedValue: string
  source: DeviceAttributeSource
}

export interface DeviceAttributeGroup {
  groupCode: string
  groupName: string
  kind: DeviceAttributeGroupKind
  drawer: boolean
  rows: DeviceAttributeRow[]
}

export type DeviceAttributeInputType = 'text' | 'number' | 'checkbox' | 'datetime-local' | 'select'

const baseGroupCodes = new Set(['', 'BASE', 'BASIC', 'DEVICE', 'DEVICE_MODEL'])

function normalizeGroupCode(value?: string | null): string {
  return String(value ?? '').trim()
}

function normalizeReuseKey(name?: string | null, unit?: string | null): string {
  return `${String(name ?? '').trim().toLowerCase()}::${String(unit ?? '').trim().toLowerCase()}`
}

function isBaseGroup(groupCode?: string | null): boolean {
  return baseGroupCodes.has(normalizeGroupCode(groupCode).toUpperCase())
}

export function deviceValueListToMap(
  values?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null,
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const item of values ?? []) {
    const configCode = item.configCode?.trim()
    if (!configCode) continue
    result[configCode] = item.value == null ? '' : String(item.value)
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
  const reuseMap = new Map<string, string>()

  return configs
    .filter(config => Boolean(config.code?.trim()))
    .map(config => {
      const configCode = String(config.code)
      const defaultValue = config.defaultValue == null ? '' : String(config.defaultValue)
      const hasEntityValue = Object.prototype.hasOwnProperty.call(entityMap, configCode)
      const hasLibraryValue = Object.prototype.hasOwnProperty.call(libraryMap, configCode)
      const reuseKey = normalizeReuseKey(config.name, config.unit)
      const reusedValue = reuseMap.get(reuseKey)

      let value = ''
      let source: DeviceAttributeSource = 'empty'
      if (hasEntityValue) {
        value = entityMap[configCode]
        source = 'entity'
      } else if (hasLibraryValue) {
        value = libraryMap[configCode]
        source = 'library'
      } else if (defaultValue) {
        value = defaultValue
        source = 'default'
      } else if (reusedValue != null) {
        value = reusedValue
        source = 'reused'
      }

      if (value !== '' && !reuseMap.has(reuseKey)) {
        reuseMap.set(reuseKey, value)
      }

      const rawGroupCode = normalizeGroupCode(config.groupCode)
      const base = isBaseGroup(rawGroupCode)

      return {
        config,
        configCode,
        algorithmField: config.jsonField?.trim() || configCode,
        label: config.name || configCode,
        groupCode: base ? 'device_model' : rawGroupCode,
        groupName: base ? '器件模型参数' : (config.groupName || rawGroupCode || '计算模型参数'),
        unit: config.unit || '',
        value,
        inheritedValue: hasLibraryValue ? libraryMap[configCode] : defaultValue,
        source,
      }
    })
}

export function groupDeviceAttributeRows(rows: DeviceAttributeRow[]): DeviceAttributeGroup[] {
  const groups: DeviceAttributeGroup[] = []
  const groupIndex = new Map<string, number>()

  for (const row of rows) {
    const kind: DeviceAttributeGroupKind = row.groupCode === 'device_model' ? 'base' : 'model'
    const key = row.groupCode
    const existingIndex = groupIndex.get(key)
    if (existingIndex == null) {
      groupIndex.set(key, groups.length)
      groups.push({
        groupCode: row.groupCode,
        groupName: row.groupName,
        kind,
        drawer: kind === 'model',
        rows: [row],
      })
      continue
    }

    groups[existingIndex].rows.push(row)
  }

  return groups.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'base' ? -1 : 1
    return left.groupName.localeCompare(right.groupName, 'zh-CN')
  })
}

export function inputTypeForDeviceConfig(config: PlanDeviceConfig): DeviceAttributeInputType {
  if (config.dataTypeCd === 'NUMBER') return 'number'
  if (config.dataTypeCd === 'BOOLEAN') return 'checkbox'
  if (config.dataTypeCd === 'DATETIME') return 'datetime-local'
  if (config.dataTypeCd === 'DATA_TYPE' && config.dicCode) return 'select'
  return 'text'
}

export function buildDeviceAlgorithmParams(rows: DeviceAttributeRow[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.algorithmField] = row.value
  }
  return result
}
```

- [ ] **Step 4: Run the helper script to verify it passes**

Run:

```powershell
node tmp/verify-device-attributes.mjs
```

Expected: `device attribute helper verification passed`.

- [ ] **Step 5: Run the project build**

Run:

```powershell
npm run build
```

Expected: exit code 0.

- [ ] **Step 6: Remove the temporary script**

Run:

```powershell
Remove-Item -LiteralPath 'tmp/verify-device-attributes.mjs'
```

Expected: file is removed.

---

### Task 2: Render Layered Dynamic Form

**Files:**
- Modify: `src/components/settings/DeviceDynamicValueForm.vue`

- [ ] **Step 1: Write the failing verification command**

Run:

```powershell
rg -n "器件模型参数|实例覆盖|DATA_TYPE|sourceLabel|openGroups" src/components/settings/DeviceDynamicValueForm.vue
```

Expected before implementation: no matches for `sourceLabel` or `openGroups`.

- [ ] **Step 2: Replace script setup with dictionary-aware layered state**

In `src/components/settings/DeviceDynamicValueForm.vue`, replace the `<script setup lang="ts">...</script>` block with:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Input, Select } from '@/shared/components/base'
import { platformDictionaryApi } from '@/services/platform/api'
import type { PlanDeviceConfig, PlatformDictionary } from '@/services/platform/types'
import {
  groupDeviceAttributeRows,
  inputTypeForDeviceConfig,
  resolveDeviceAttributeRows,
  type DeviceAttributeRow,
} from '@/services/platform/deviceAttributes'

const props = defineProps<{
  configs: PlanDeviceConfig[]
  modelValue: Record<string, string>
  libraryValues?: Record<string, string>
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, string>): void
}>()

const dictionaryOptions = ref<Record<string, Array<{ value: string; label: string }>>>({})
const openGroups = ref<Record<string, boolean>>({})

const recordToValueList = (record?: Record<string, string>) =>
  Object.entries(record ?? {}).map(([configCode, value]) => ({ configCode, value }))

const rows = computed(() => resolveDeviceAttributeRows(
  props.configs,
  recordToValueList(props.libraryValues),
  recordToValueList(props.modelValue),
))

const groups = computed(() => groupDeviceAttributeRows(rows.value))

watch(groups, nextGroups => {
  const nextOpen = { ...openGroups.value }
  for (const group of nextGroups) {
    if (group.kind === 'base') nextOpen[group.groupCode] = true
    else if (nextOpen[group.groupCode] == null) nextOpen[group.groupCode] = false
  }
  openGroups.value = nextOpen
}, { immediate: true })

watch(() => props.configs, async configs => {
  const dicCodes = Array.from(new Set(
    configs
      .filter(config => inputTypeForDeviceConfig(config) === 'select' && config.dicCode)
      .map(config => String(config.dicCode)),
  ))

  await Promise.all(dicCodes.map(async dicCode => {
    if (dictionaryOptions.value[dicCode]) return
    const items = await platformDictionaryApi.listItem(dicCode)
    dictionaryOptions.value = {
      ...dictionaryOptions.value,
      [dicCode]: (items ?? []).map((item: PlatformDictionary) => ({
        value: String(item.code ?? ''),
        label: item.name || item.code || '',
      })).filter(item => item.value),
    }
  }))
}, { immediate: true, deep: true })

const updateValue = (configCode: string, value: unknown) => {
  emit('update:modelValue', {
    ...(props.modelValue ?? {}),
    [configCode]: value == null ? '' : String(value),
  })
}

const updateBooleanValue = (configCode: string, event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  updateValue(configCode, checked ? 'true' : 'false')
}

const toggleGroup = (groupCode: string) => {
  openGroups.value = {
    ...openGroups.value,
    [groupCode]: !openGroups.value[groupCode],
  }
}

const isChecked = (value: string) => value === 'true' || value === '1'
const isBooleanConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'checkbox'
const isDateTimeConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'datetime-local'
const isSelectConfig = (config: PlanDeviceConfig) => inputTypeForDeviceConfig(config) === 'select'
const textInputTypeForConfig = (config: PlanDeviceConfig): 'text' | 'number' =>
  inputTypeForDeviceConfig(config) === 'number' ? 'number' : 'text'

const optionsForConfig = (config: PlanDeviceConfig) =>
  config.dicCode ? dictionaryOptions.value[String(config.dicCode)] ?? [] : []

const sourceLabel = (row: DeviceAttributeRow) => {
  if (row.source === 'entity') return '实例覆盖'
  if (row.source === 'library') return '器件库'
  if (row.source === 'default') return '默认值'
  if (row.source === 'reused') return '复用值'
  return '未填写'
}

const sourceClass = (row: DeviceAttributeRow) => {
  if (row.source === 'entity') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (row.source === 'library') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (row.source === 'default') return 'border-gray-200 bg-gray-50 text-gray-600'
  if (row.source === 'reused') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-red-200 bg-red-50 text-red-600'
}
</script>
```

- [ ] **Step 3: Replace the template with layered sections and drawers**

In the same file, replace the `<template>...</template>` block with:

```vue
<template>
  <div class="space-y-4">
    <div
      v-if="configs.length === 0"
      class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
      style="border-color: var(--app-border-color)"
    >
      当前设备类型暂无动态属性配置
    </div>

    <section
      v-for="group in groups"
      :key="group.groupCode"
      class="rounded-md border bg-white dark:bg-gray-800"
      style="border-color: var(--app-border-color)"
    >
      <button
        v-if="group.drawer"
        type="button"
        class="flex w-full items-center justify-between px-4 py-3 text-left"
        @click="toggleGroup(group.groupCode)"
      >
        <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ group.groupName }}</span>
        <span class="text-xs text-gray-500">{{ openGroups[group.groupCode] ? '收起' : '展开' }}</span>
      </button>
      <div v-else class="px-4 pt-4">
        <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">{{ group.groupName }}</h4>
      </div>

      <div v-show="!group.drawer || openGroups[group.groupCode]" class="px-4 pb-4">
        <p v-if="group.kind === 'model'" class="mb-3 text-xs text-gray-500 dark:text-gray-400">
          当前分组为计算模型参数，可按需填写；同名同单位参数仅在初始化时复用，不会强绑定。
        </p>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div v-for="row in group.rows" :key="row.configCode" class="min-w-0">
            <div class="mb-1 flex items-center justify-between gap-2">
              <label class="block truncate text-sm text-gray-600 dark:text-gray-400">{{ row.label }}</label>
              <span class="shrink-0 rounded border px-1.5 py-0.5 text-[11px]" :class="sourceClass(row)">
                {{ sourceLabel(row) }}
              </span>
            </div>
            <div class="flex min-h-[38px] items-center gap-2">
              <input
                v-if="isBooleanConfig(row.config)"
                type="checkbox"
                class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                :checked="isChecked(row.value)"
                @change="event => updateBooleanValue(row.configCode, event)"
              />
              <input
                v-else-if="isDateTimeConfig(row.config)"
                type="datetime-local"
                :value="row.value"
                class="h-[38px] min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-200"
                style="border-color: var(--app-border-color)"
                @input="event => updateValue(row.configCode, (event.target as HTMLInputElement).value)"
              />
              <Select
                v-else-if="isSelectConfig(row.config)"
                :model-value="row.value"
                :options="optionsForConfig(row.config)"
                class="min-w-0 flex-1"
                @update:model-value="value => updateValue(row.configCode, value)"
              />
              <Input
                v-else
                :type="textInputTypeForConfig(row.config)"
                :model-value="row.value"
                class="min-w-0 flex-1"
                @update:model-value="value => updateValue(row.configCode, value)"
              />
              <span v-if="row.unit" class="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ row.unit }}</span>
            </div>
            <div v-if="row.algorithmField !== row.configCode" class="mt-1 truncate text-[11px] text-gray-400">
              {{ row.algorithmField }}
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 4: Run the verification command**

Run:

```powershell
rg -n "器件模型参数|实例覆盖|DATA_TYPE|sourceLabel|openGroups" src/components/settings/DeviceDynamicValueForm.vue
```

Expected: matches for `sourceLabel`, `openGroups`, and the layered UI text.

- [ ] **Step 5: Run the project build**

Run:

```powershell
npm run build
```

Expected: exit code 0.

---

### Task 3: Tighten Runtime Parameter Resolution

**Files:**
- Modify: `src/services/platform/deviceRuntime.ts`
- Temporary Test: `tmp/verify-device-runtime.mjs`

- [ ] **Step 1: Write the failing runtime verification script**

Create `tmp/verify-device-runtime.mjs` with:

```js
import { readFileSync } from 'node:fs'
import ts from '../node_modules/typescript/lib/typescript.js'

const source = readFileSync('src/services/platform/deviceRuntime.ts', 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(compiled)}`
const runtime = await import(moduleUrl)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const library = {
  id: 1,
  name: 'G.654.E',
  deviceTypeCd: 'FIB',
  deviceValueList: [
    { configCode: 'ignored_code', jsonField: 'attenuation', value: '0.155' },
    { configCode: 'dispersion', value: '17' },
  ],
}

assert(runtime.getDeviceLibraryParam(library, 'attenuation', 0) === 0.155, 'jsonField should be a readable alias')
assert(runtime.getDeviceLibraryParam(library, 'dispersion', 0) === 17, 'configCode should still be readable')
console.log('device runtime verification passed')
```

- [ ] **Step 2: Run the runtime script to verify it fails if jsonField is not supported**

Run:

```powershell
node tmp/verify-device-runtime.mjs
```

Expected before implementation: FAIL if `jsonField` is not included in `valueEntries`; PASS only if existing code already supports it.

- [ ] **Step 3: Make valueEntries robust**

In `src/services/platform/deviceRuntime.ts`, ensure `valueEntries` reads `jsonField`, `configCode`, and `configName` from each value item:

```ts
function valueEntries(library: PlanDeviceLibrary | null | undefined): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const item of library?.deviceValueList ?? []) {
    const value = item.value == null ? '' : String(item.value)
    const valueItem = item as PlanDeviceValueSave & PlanDeviceValueSimple
    for (const key of [valueItem.jsonField, valueItem.configCode, valueItem.configName]) {
      if (!key) continue
      entries.push([String(key), value])
    }
  }
  return entries
}
```

- [ ] **Step 4: Run the runtime script to verify it passes**

Run:

```powershell
node tmp/verify-device-runtime.mjs
```

Expected: `device runtime verification passed`.

- [ ] **Step 5: Remove the temporary script**

Run:

```powershell
Remove-Item -LiteralPath 'tmp/verify-device-runtime.mjs'
```

Expected: file is removed.

- [ ] **Step 6: Run the project build**

Run:

```powershell
npm run build
```

Expected: exit code 0.

---

### Task 4: Improve Device Library Page Copy And Preview

**Files:**
- Modify: `src/views/DeviceLibraryView.vue`

- [ ] **Step 1: Locate current labels**

Run:

```powershell
rg -n "动态属性|属性配置|分组编码|JSON 字段|基础参数|模型参数" src/views/DeviceLibraryView.vue
```

Expected: find current dialog labels and config manager fields.

- [ ] **Step 2: Update config manager helper copy**

In the config manager form area near the `groupCode`, `groupName`, and `jsonField` inputs, make the labels explicit:

```vue
<label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">分组编码</label>
<Input v-model="configForm.groupCode" placeholder="base / GN / EGN / SSFM" />
<p class="mt-1 text-xs text-gray-400">base 表示器件模型参数；其他编码会显示为计算模型抽屉。</p>
```

```vue
<label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">分组名称</label>
<Input v-model="configForm.groupName" placeholder="基础物理参数 / GN 模型参数" />
```

```vue
<label class="mb-1 block text-sm text-gray-600 dark:text-gray-400">JSON 字段</label>
<Input v-model="configForm.jsonField" placeholder="如 fiber.alpha / gn.noiseBandwidth" />
<p class="mt-1 text-xs text-gray-400">用于系统规划和仿真入参映射；为空时使用属性编码。</p>
```

- [ ] **Step 3: Update library and entity dialog section titles**

Replace the library form dynamic section title from “动态属性” to:

```vue
<h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">器件模型参数与计算模型参数</h4>
```

Replace the entity form dynamic section title from “实例属性” to:

```vue
<h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">实例继承与覆盖参数</h4>
```

- [ ] **Step 4: Run the label verification**

Run:

```powershell
rg -n "器件模型参数与计算模型参数|实例继承与覆盖参数|base / GN / EGN / SSFM|fiber.alpha" src/views/DeviceLibraryView.vue
```

Expected: matches for all updated text.

- [ ] **Step 5: Run the project build**

Run:

```powershell
npm run build
```

Expected: exit code 0.

---

### Task 5: Update Settings Page Shared Device Section

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: Locate current shared form titles**

Run:

```powershell
rg -n "动态属性|实例属性|DeviceDynamicValueForm" src/views/SettingsView.vue
```

Expected: locate the library and entity dynamic form sections.

- [ ] **Step 2: Rename shared section titles**

In the platform library dialog, rename the dynamic form heading to:

```vue
<h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">器件模型参数与计算模型参数</h4>
```

In the platform entity dialog, rename the dynamic form heading to:

```vue
<h4 class="text-sm font-semibold text-gray-800 dark:text-gray-100">实例继承与覆盖参数</h4>
```

- [ ] **Step 3: Run the label verification**

Run:

```powershell
rg -n "器件模型参数与计算模型参数|实例继承与覆盖参数" src/views/SettingsView.vue
```

Expected: matches for both headings.

- [ ] **Step 4: Run the project build**

Run:

```powershell
npm run build
```

Expected: exit code 0.

---

### Task 6: Manual UI Verification

**Files:**
- No source changes unless verification reveals a defect.

- [ ] **Step 1: Start dev server**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 2: Open the app**

Use the in-app browser or external browser to open the printed URL.

Expected:

- App loads without runtime errors.
- Existing login/project flow is unchanged.

- [ ] **Step 3: Check device library UI**

Navigate to the device library page and verify:

- `DEVICE_TYPE` dictionary drives tabs.
- Empty dictionary shows empty state without fake fixed tabs.
- Attribute config manager shows the group-code convention text.
- Device library edit form shows “器件模型参数与计算模型参数”.
- Base group renders expanded.
- Model groups render as collapsed drawers.
- Source labels appear beside fields.
- `DATA_TYPE` config with `dicCode` renders a select when dictionary data is available.

- [ ] **Step 4: Check instance inheritance**

Create or edit a device instance from a library and verify:

- Library values appear as inherited defaults.
- Editing a value changes the label to instance override after save/reopen.
- Payload submitted by save includes `libraryId`, `longitude`, `latitude`, `projectId`, `sortNum`, and `deviceValueList`.

Use browser dev tools network logs if available, or add a temporary console log only during verification and remove it before commit.

- [ ] **Step 5: Stop dev server**

Stop the dev server with `Ctrl+C`.

Expected: no background server is left running.

---

### Task 7: Final Verification And Commit

**Files:**
- Modified source files from Tasks 1-5.

- [ ] **Step 1: Run final build**

Run:

```powershell
npm run build
```

Expected: exit code 0.

- [ ] **Step 2: Ensure temporary verification files are gone**

Run:

```powershell
Test-Path 'tmp/verify-device-attributes.mjs'; Test-Path 'tmp/verify-device-runtime.mjs'
```

Expected:

```text
False
False
```

- [ ] **Step 3: Inspect the final diff**

Run:

```powershell
git diff -- src/services/platform/deviceAttributes.ts src/services/platform/deviceRuntime.ts src/components/settings/DeviceDynamicValueForm.vue src/views/DeviceLibraryView.vue src/views/SettingsView.vue
```

Expected:

- No unrelated files included.
- No temporary console logs.
- No hard-coded fallback device tabs.

- [ ] **Step 4: Stage implementation files only**

Run:

```powershell
git add -- src/services/platform/deviceAttributes.ts src/services/platform/deviceRuntime.ts src/components/settings/DeviceDynamicValueForm.vue src/views/DeviceLibraryView.vue src/views/SettingsView.vue docs/superpowers/plans/2026-06-26-device-library-layered-params.md
```

- [ ] **Step 5: Commit implementation**

Run:

```powershell
git commit -m "feat: add layered device library params UI"
```

Expected: commit succeeds.

---

## Self-Review

- Spec coverage:
  - Dictionary-only tabs: already present in existing code, preserved by this plan.
  - Swagger 2.5-2.8 payloads: preserved by existing API/store code and `deviceValueList` conversion.
  - Parameter layering: Task 1 and Task 2.
  - Model drawers: Task 1 and Task 2.
  - Source labels and inheritance: Task 1 and Task 2.
  - `DATA_TYPE` dictionary fields: Task 2.
  - Runtime algorithm mapping via `jsonField`: Task 1 and Task 3.
  - Device library/settings UI copy: Task 4 and Task 5.
  - Verification: Task 6 and Task 7.
- Placeholder scan:
  - No unresolved placeholder markers remain.
  - Each code-changing task includes concrete snippets and commands.
- Type consistency:
  - `DeviceAttributeRow`, `DeviceAttributeGroup`, and `DeviceAttributeInputType` are defined in Task 1 and imported in Task 2.
  - Source names match the design: `entity`, `library`, `default`, `reused`, `empty`.
  - Runtime value access uses `jsonField`, `configCode`, and `configName`.
