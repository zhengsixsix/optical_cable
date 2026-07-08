# Route Planning Result Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the route-planning result-package flow so backend-style FMM, segment, cost, and risk files drive the map, route comparison, risk bands, armor estimates, and diagnostics.

**Architecture:** Introduce a focused result-package service for file/backend payload ingestion, keep `RouteDataConverter` as the algorithm-result adapter, and expose route-level summaries on standard `Route` objects. The map and panels consume converted routes, cable-segment variants, and diagnostics instead of parsing raw files.

**Tech Stack:** Vue 3, TypeScript, Pinia, OpenLayers, JSZip, Vite, Node verification scripts using `typescript.transpileModule`.

---

## File Structure

- Modify `src/services/RouteDataConverter.ts`: own all route-result conversion, FMM de-duplication, matrix parsing, segment attachment, route summaries, warnings, and fallback segments.
- Create `src/services/RoutePlanningResultService.ts`: read backend-style file maps, browser `File[]`, and zip entries into `AlgorithmRouteBundle`.
- Modify `src/services/AlgorithmRoutePreviewService.ts`: delegate bundled sample loading to `RoutePlanningResultService`.
- Modify `src/types/route.ts`: add optional route algorithm metadata and summary fields used by panels.
- Modify `src/modules/planning/dialogs/LoadRouteDataDialog.vue`: remove raw parsing code, use the result service, and show corrected FMM-first diagnostics.
- Modify `src/modules/planning/components/MapArea.vue`: apply converted result packages consistently for “start planning”, route switching, and uploaded package loading.
- Modify `src/modules/planning/panels/PlanningDecisionPanel.vue`: split algorithm total cost from armor-estimated cost and use route summaries for high/medium/low risk lengths.
- Modify `src/utils/polyline.ts`: improve distance slicing performance and add verification coverage for KP slicing.
- Create `scripts/verify-route-planning-result.mjs`: run assertions against `public/mock/route_planning_results`.

## Task 1: Add Verification Script For The Current Result Package

**Files:**
- Create: `scripts/verify-route-planning-result.mjs`
- Read: `public/mock/route_planning_results/*`
- Read: `src/services/RouteDataConverter.ts`
- Read: `src/utils/polyline.ts`

- [ ] **Step 1: Create the failing verification script**

Create `scripts/verify-route-planning-result.mjs` with this content:

```js
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const root = process.cwd()

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText

  const module = { exports: {} }
  const require = specifier => {
    if (specifier.startsWith('@/')) return {}
    throw new Error(`Unexpected runtime import ${specifier} in ${relativePath}`)
  }
  vm.runInNewContext(output, { module, exports: module.exports, require, console }, { filename })
  return module.exports
}

function readText(file) {
  return fs.readFileSync(path.join(root, 'public/mock/route_planning_results', file), 'utf8')
}

function approx(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

const converter = loadTsModule('src/services/RouteDataConverter.ts')
const polyline = loadTsModule('src/utils/polyline.ts')

const result = converter.convertAlgorithmRouteBundle({
  fmmPaths: JSON.parse(readText('FMM_path_result.json')),
  fixSpacing: JSON.parse(readText('segment_result_base_FixSpacing.json')),
  riskBased: JSON.parse(readText('segment_result_base_Risk.json')),
  costMatrixText: readText('cost.txt'),
  riskMatrixText: readText('risk.txt'),
  source: 'verification',
  files: [
    'FMM_path_result.json',
    'segment_result_base_FixSpacing.json',
    'segment_result_base_Risk.json',
    'cost.txt',
    'risk.txt',
  ],
})

if (result.diagnostics.fmmPathCount !== 3) throw new Error('expected 3 raw FMM paths')
if (result.diagnostics.uniqueFmmPathCount !== 2) throw new Error('expected 2 unique FMM routes')
if (result.diagnostics.duplicateFmmPathCount !== 1) throw new Error('expected 1 duplicate FMM route')
if (result.routes.length !== 2) throw new Error(`expected 2 visible routes, got ${result.routes.length}`)

const first = result.routes[0]
if (!first.rawTrunkCoordinates || first.rawTrunkCoordinates.length !== 94) {
  throw new Error('first FMM route should use 94 real_trace coordinates')
}
approx(first.totalLength, 56.10, 0.01, 'first route length')
if (first.totalCost !== 3032871) throw new Error(`first total cost should come from FMM total_cost, got ${first.totalCost}`)
approx(first.fmmPathMeta.totalRisk, 382653.6783, 0.01, 'first total risk')

const firstSegments = result.segmentsByRouteId[first.id]
if (!firstSegments || firstSegments.length !== 6) throw new Error('risk-based segment result should attach to first route')
const highLength = firstSegments.filter(segment => segment.riskLevel === 'high').reduce((sum, segment) => sum + segment.length, 0)
const mediumLength = firstSegments.filter(segment => segment.riskLevel === 'medium').reduce((sum, segment) => sum + segment.length, 0)
const lowLength = firstSegments.filter(segment => segment.riskLevel === 'low').reduce((sum, segment) => sum + segment.length, 0)
approx(highLength, 9.8589, 0.0001, 'high-risk length')
approx(mediumLength, 0, 0.0001, 'medium-risk length')
approx(lowLength, 46.245, 0.0001, 'low-risk length')

const second = result.routes[1]
if (!result.segmentsByRouteId[second.id]?.length) throw new Error('second route should get fallback FMM segments')
if (!result.diagnostics.costMatrix || result.diagnostics.costMatrix.rows !== 105 || result.diagnostics.costMatrix.columns !== 112) {
  throw new Error('cost matrix stats should be available')
}
if (!result.diagnostics.riskMatrix || result.diagnostics.riskMatrix.rows !== 105 || result.diagnostics.riskMatrix.columns !== 112) {
  throw new Error('risk matrix stats should be available')
}
if (!result.matrices.cost || !result.matrices.risk) throw new Error('parsed matrices should be returned for future layers')

const sliced = polyline.slicePolylineByDistanceKm([[0, 0], [0.1, 0], [0.2, 0]], 2, 12)
if (sliced.length < 2) throw new Error('polyline slice should return clipped coordinates')

console.log('route planning result package verification passed')
```

- [ ] **Step 2: Run the script to verify it fails before the implementation is complete**

Run: `node scripts/verify-route-planning-result.mjs`

Expected before this task is implemented: failure mentioning one of `source`, `files`, `matrices`, `fallback FMM segments`, or route summary fields.

## Task 2: Stabilize Adapter Types, Diagnostics, And Route Summaries

**Files:**
- Modify: `src/types/route.ts`
- Modify: `src/services/RouteDataConverter.ts`
- Run: `node scripts/verify-route-planning-result.mjs`

- [ ] **Step 1: Extend route metadata types**

In `src/types/route.ts`, add these interfaces after `RouteFmmMetadata` and add `algorithmSummary?: RouteAlgorithmSummary` to `Route`:

```ts
export interface RouteAlgorithmSummary {
  originalFmmIndex?: number
  duplicateOriginalIndexes?: number[]
  algorithmTotalCost?: number
  algorithmTotalRisk?: number
  highRiskLength: number
  mediumRiskLength: number
  lowRiskLength: number
  armorEstimatedCost: number
  segmentSource: 'riskBased' | 'fixedSpacing' | 'fmmFallback' | 'none'
}
```

- [ ] **Step 2: Extend converter bundle and result interfaces**

In `src/services/RouteDataConverter.ts`, extend `AlgorithmRouteBundle` and `AlgorithmRouteBundleResult`:

```ts
export interface AlgorithmRouteBundle {
  fmmPaths?: RawPathResult[]
  fixSpacing?: RawSegmentResult
  riskBased?: RawSegmentResult
  costMatrixText?: string
  riskMatrixText?: string
  source?: string
  files?: string[]
}

export interface SegmentAttachmentDiagnostic {
  variant: 'fixedSpacing' | 'riskBased'
  routeIndex: number
  routeId?: string
  segmentCount: number
  sourceFile: string
  status: 'attached' | 'fallbackRoute' | 'missingRoute'
}

export interface AlgorithmRouteBundleResult {
  routes: Route[]
  segmentsByRouteId: Record<string, CableSegment[]>
  segmentVariantsByRouteId: Record<string, SegmentVariantSet>
  matrices: {
    cost?: number[][]
    risk?: number[][]
  }
  diagnostics: {
    source: string
    version: string
    generatedAt: string
    files: string[]
    warnings: string[]
    fmmPathCount: number
    uniqueFmmPathCount: number
    duplicateFmmPathCount: number
    fmmTracePoints: number[]
    duplicateGroups: number[][]
    segmentAttachments: SegmentAttachmentDiagnostic[]
    costMatrix?: MatrixStats
    riskMatrix?: MatrixStats
  }
}
```

- [ ] **Step 3: Replace FMM de-duplication with original-index mapping**

Implement a helper in `RouteDataConverter.ts`:

```ts
function getFmmPathMapping(paths: RawPathResult[] = []) {
  const seen = new Map<string, number>()
  const unique: Array<{ path: RawPathResult; originalIndex: number; duplicateOriginalIndexes: number[] }> = []
  const originalIndexToUniqueIndex = new Map<number, number>()

  paths.forEach((path, originalIndex) => {
    const identity = getPathIdentity(path)
    if (!identity) return

    const existingUniqueIndex = seen.get(identity)
    if (existingUniqueIndex !== undefined) {
      unique[existingUniqueIndex].duplicateOriginalIndexes.push(originalIndex)
      originalIndexToUniqueIndex.set(originalIndex, existingUniqueIndex)
      return
    }

    const uniqueIndex = unique.length
    seen.set(identity, uniqueIndex)
    unique.push({ path, originalIndex, duplicateOriginalIndexes: [originalIndex] })
    originalIndexToUniqueIndex.set(originalIndex, uniqueIndex)
  })

  return { unique, originalIndexToUniqueIndex }
}
```

- [ ] **Step 4: Build route summaries and fallback segments**

Add helpers in `RouteDataConverter.ts`:

```ts
function summarizeSegments(segments: CableSegment[], source: Route['algorithmSummary']['segmentSource']) {
  const highRiskLength = segments.filter(segment => segment.riskLevel === 'high').reduce((sum, segment) => sum + segment.length, 0)
  const mediumRiskLength = segments.filter(segment => segment.riskLevel === 'medium').reduce((sum, segment) => sum + segment.length, 0)
  const lowRiskLength = segments.filter(segment => segment.riskLevel === 'low').reduce((sum, segment) => sum + segment.length, 0)

  return {
    highRiskLength,
    mediumRiskLength,
    lowRiskLength,
    armorEstimatedCost:
      highRiskLength * getUnitPrice('high') +
      mediumRiskLength * getUnitPrice('medium') +
      lowRiskLength * getUnitPrice('low'),
    segmentSource: source,
  }
}
```

Then set each `Route.algorithmSummary` after `segmentsByRouteId` is created:

```ts
route.algorithmSummary = {
  originalFmmIndex,
  duplicateOriginalIndexes,
  algorithmTotalCost: route.fmmPathMeta?.totalCost,
  algorithmTotalRisk: route.fmmPathMeta?.totalRisk,
  ...summarizeSegments(defaultSegments, source),
}
```

- [ ] **Step 5: Return matrices, warnings, and segment attachment diagnostics**

Update the return object in `convertAlgorithmRouteBundle` so `matrices` contains parsed cost/risk matrices and `diagnostics` includes source files, warnings, duplicate groups, and segment attachment diagnostics.

- [ ] **Step 6: Run verification**

Run: `node scripts/verify-route-planning-result.mjs`

Expected: `route planning result package verification passed`

## Task 3: Create A Result-Package Reading Service

**Files:**
- Create: `src/services/RoutePlanningResultService.ts`
- Modify: `src/services/AlgorithmRoutePreviewService.ts`
- Modify: `src/modules/planning/dialogs/LoadRouteDataDialog.vue`

- [ ] **Step 1: Create `RoutePlanningResultService.ts`**

Create the service with these exported functions:

```ts
import JSZip from 'jszip'
import type { AlgorithmRouteBundle } from '@/services/RouteDataConverter'

export interface LoadedRoutePlanningBundle {
  bundle: AlgorithmRouteBundle
  files: string[]
}

export type RoutePlanningResultFileMap = Partial<Record<
  'FMM_path_result.json' |
  'segment_result_base_FixSpacing.json' |
  'segment_result_base_Risk.json' |
  'cost.txt' |
  'risk.txt',
  string
>>

export function assignRoutePlanningResultFile(bundle: AlgorithmRouteBundle, filename: string, text: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('fmm_path_result.json')) bundle.fmmPaths = JSON.parse(text)
  else if (lower.endsWith('segment_result_base_fixspacing.json')) bundle.fixSpacing = JSON.parse(text)
  else if (lower.endsWith('segment_result_base_risk.json')) bundle.riskBased = JSON.parse(text)
  else if (lower.endsWith('cost.txt')) bundle.costMatrixText = text
  else if (lower.endsWith('risk.txt')) bundle.riskMatrixText = text
}

export function loadRoutePlanningBundleFromFileMap(fileMap: RoutePlanningResultFileMap, source = 'backend-result-package'): LoadedRoutePlanningBundle {
  const bundle: AlgorithmRouteBundle = { source, files: [] }
  for (const [filename, text] of Object.entries(fileMap)) {
    if (typeof text !== 'string') continue
    assignRoutePlanningResultFile(bundle, filename, text)
    bundle.files?.push(filename)
  }
  return { bundle, files: bundle.files || [] }
}

export async function loadRoutePlanningBundleFromFiles(files: File[], source = 'uploaded-result-package'): Promise<LoadedRoutePlanningBundle> {
  const bundle: AlgorithmRouteBundle = { source, files: [] }
  const loadedNames: string[] = []

  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      for (const entry of Object.values(zip.files).filter(item => !item.dir)) {
        const text = await entry.async('text')
        const name = entry.name.split('/').pop() || entry.name
        assignRoutePlanningResultFile(bundle, name, text)
        loadedNames.push(entry.name)
      }
    } else {
      const text = await file.text()
      assignRoutePlanningResultFile(bundle, file.name, text)
      loadedNames.push(file.name)
    }
  }

  bundle.files = loadedNames
  return { bundle, files: loadedNames }
}
```

- [ ] **Step 2: Update preview service**

In `AlgorithmRoutePreviewService.ts`, replace manual bundle construction with `loadRoutePlanningBundleFromFileMap` and pass `source = 'route_planning_results sample'`.

- [ ] **Step 3: Update load dialog**

In `LoadRouteDataDialog.vue`, remove local `JSZip`, `AlgorithmRouteBundle`, `assignBundleFile`, and `readBundleFromFiles` code. Import `loadRoutePlanningBundleFromFiles` from `RoutePlanningResultService` and use it in `loadFromFile`.

- [ ] **Step 4: Correct stale dialog copy**

Replace the stale footer text with:

```text
当前地图使用 FMM real_trace 绘制主路线；segment_result 按 KP 叠加海缆分段；cost/risk 矩阵用于诊断和后续栅格图层。
```

- [ ] **Step 5: Verify**

Run: `npm run build`

Expected: build completes without TypeScript errors related to the new service imports.

## Task 4: Update Map Application Flow

**Files:**
- Modify: `src/modules/planning/components/MapArea.vue`

- [ ] **Step 1: Add a single result-application helper**

Add this helper near the existing route-loading handlers:

```ts
const applyAlgorithmRouteResult = (result: AlgorithmRouteBundleResult, sourceLabel: string) => {
  routeStore.setParetoRoutes(result.routes)
  algorithmSegmentsByRouteId.value = result.segmentsByRouteId
  const firstRoute = result.routes[0] || null

  if (firstRoute) {
    routeStore.selectRoute(firstRoute.id)
    cableSegmentStore.setCurrentRoute(firstRoute.id)
    cableSegmentStore.setSegments(result.segmentsByRouteId[firstRoute.id] || [])
  }

  refreshRouteGeometryValidation(firstRoute)
  refreshCableSegmentValidation(firstRoute ? result.segmentsByRouteId[firstRoute.id] || [] : [])
  updateRiskCostHeatmap(firstRoute)
  drawParetoRoutes()
  appStore.addLog('INFO', `${sourceLabel}: ${result.routes.length} 条可见路线，FMM 原始 ${result.diagnostics.fmmPathCount} 条`)
}
```

- [ ] **Step 2: Reuse the helper**

Update `handleRoutesLoaded` and the sample branch in `handleRunPlanning` to call `applyAlgorithmRouteResult`.

- [ ] **Step 3: Keep backend swap point clear**

Keep the temporary sample call in `handleRunPlanning`, but name the branch `loadBackendResultPackageFallback` or `loadAlgorithmRoutePreviewResult` in a way that makes it obvious this is the backend-result-package adapter path, not the old A* API path.

- [ ] **Step 4: Preserve FMM geometry and route-specific segments**

Keep the existing `rawTrunkCoordinates` drawing path and `slicePolylineByDistanceKm` segment overlay. Ensure `hasFineSegments` filters by `segment.routeId === route.id`.

- [ ] **Step 5: Verify**

Run: `npm run build`

Expected: no TypeScript errors from `MapArea.vue`.

## Task 5: Split Algorithm Cost And Armor Estimated Cost In Panels

**Files:**
- Modify: `src/modules/planning/panels/PlanningDecisionPanel.vue`

- [ ] **Step 1: Extend risk band and overview rows**

Add route overview fields:

```ts
algorithmTotalCost: route.fmmPathMeta?.totalCost ?? route.totalCost,
algorithmTotalRisk: route.fmmPathMeta?.totalRisk,
armorEstimatedCost: riskBands.value.reduce((sum, band) => sum + band.cost, 0),
```

Keep `band.cost = length * unitPrice` as the armor-estimate value in thousand yuan.

- [ ] **Step 2: Use route summaries for comparison high-risk length**

Change `compareRows` high-risk length to:

```ts
highRiskLength: route.algorithmSummary?.highRiskLength ?? route.segments
  .filter(segment => segment.riskLevel === 'high')
  .reduce((sum, segment) => sum + (segment.length || 0), 0),
```

Change comparison cost label to algorithm total cost:

```ts
cost: (route.fmmPathMeta?.totalCost ?? route.cost?.total ?? route.totalCost ?? 0) / 1000,
```

- [ ] **Step 3: Add visible cost source labels**

In the risk tab, add a compact summary block above risk bands showing:

```text
算法总成本（FMM）：...
算法总风险（FMM）：...
铠装估算：...
```

- [ ] **Step 4: Verify**

Run: `npm run build`

Expected: build passes and the panel template renders the new labels.

## Task 6: Improve Polyline Slicing

**Files:**
- Modify: `src/utils/polyline.ts`
- Run: `node scripts/verify-route-planning-result.mjs`

- [ ] **Step 1: Replace repeated prefix-length calculation**

Update `slicePolylineByDistanceKm` to track cumulative distances in one pass. The function should still return clipped start/end coordinates and intermediate route coordinates inside the requested range.

- [ ] **Step 2: Verify slice behavior**

Run: `node scripts/verify-route-planning-result.mjs`

Expected: script passes the `polyline slice should return clipped coordinates` assertion.

## Task 7: Final Verification And Completion Audit

**Files:**
- Read: all modified files
- Run: `node scripts/verify-route-planning-result.mjs`
- Run: `npm run build`
- Optional runtime: local Vite server if build succeeds

- [ ] **Step 1: Run package verification**

Run: `node scripts/verify-route-planning-result.mjs`

Expected: `route planning result package verification passed`

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: `vue-tsc && vite build` finishes successfully.

- [ ] **Step 3: Inspect changed files**

Run: `git diff --stat` and `git diff -- src/services/RouteDataConverter.ts src/services/RoutePlanningResultService.ts src/modules/planning/panels/PlanningDecisionPanel.vue src/modules/planning/components/MapArea.vue src/modules/planning/dialogs/LoadRouteDataDialog.vue src/types/route.ts src/utils/polyline.ts scripts/verify-route-planning-result.mjs`

Expected: changes match the result-package scope and do not touch unrelated modules.

- [ ] **Step 4: Completion evidence**

Confirm these concrete facts from the verification output and source:

- Current result package yields 3 raw FMM paths and 2 visible routes.
- Main route geometry uses FMM `real_trace`.
- Risk-based segment result attaches to the first route.
- High-risk length is approximately `9.8589 km`.
- Algorithm total cost comes from FMM `total_cost`.
- Armor estimated cost is calculated separately from risk-band lengths and unit prices.
- Diagnostics include files, duplicate counts, matrix stats, warnings, and segment attachments.
