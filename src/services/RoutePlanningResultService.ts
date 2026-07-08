import JSZip from 'jszip'
import type { AlgorithmRouteBundle, RawPathResult, RawSegmentResult, RawStationPoint } from '@/services/RouteDataConverter'

export interface LoadedRoutePlanningBundle {
  bundle: AlgorithmRouteBundle
  files: string[]
}

export type RoutePlanningResultFileMap = Partial<Record<
  'FMM_path_result.json' |
  'segment_result_base_FixSpacing.json' |
  'segment_result_base_Risk.json' |
  'pointList' |
  'cost.txt' |
  'risk.txt',
  string
>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isJsonNodeMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false
  return 'nodeType' in value
    && 'containerNode' in value
    && ('array' in value || 'object' in value || 'valueNode' in value)
}

function parseResultJson(filename: string, text: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${filename} 解析失败：${detail}`)
  }

  if (isJsonNodeMetadata(parsed)) {
    throw new Error(
      `${filename} 只返回了 Jackson JsonNode 元信息，没有实际结果内容。请后端返回该文件的原始 JSON 内容，而不是直接把 JsonNode 对象交给响应序列化。`,
    )
  }

  return parsed
}

function parseFmmPaths(filename: string, text: string): RawPathResult[] {
  const parsed = parseResultJson(filename, text)
  if (!Array.isArray(parsed)) {
    throw new Error(`${filename} 格式错误：应为 FMM 路径数组`)
  }
  return parsed as RawPathResult[]
}

function parseSegmentResult(filename: string, text: string): RawSegmentResult {
  const parsed = parseResultJson(filename, text)
  if (!isRecord(parsed)) {
    throw new Error(`${filename} 格式错误：应为分段结果对象`)
  }
  if (!Array.isArray(parsed.segment_nodes) || !Array.isArray(parsed.segments)) {
    throw new Error(`${filename} 格式错误：缺少 segment_nodes 或 segments 数组`)
  }
  return parsed as unknown as RawSegmentResult
}

function parseStationPoints(filename: string, text: string): RawStationPoint[] {
  const parsed = parseResultJson(filename, text)
  if (!Array.isArray(parsed)) {
    throw new Error(`${filename} format error: expected station point array`)
  }
  return parsed as RawStationPoint[]
}

export function assignRoutePlanningResultFile(
  bundle: AlgorithmRouteBundle,
  filename: string,
  text: string,
) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('fmm_path_result.json')) {
    bundle.fmmPaths = parseFmmPaths(filename, text)
  } else if (lower === 'pointlist' || lower.endsWith('pointlist.json')) {
    bundle.stationPoints = parseStationPoints(filename, text)
  } else if (lower.endsWith('segment_result_base_fixspacing.json')) {
    bundle.fixSpacing = parseSegmentResult(filename, text)
  } else if (lower.endsWith('segment_result_base_risk.json')) {
    bundle.riskBased = parseSegmentResult(filename, text)
  } else if (lower.endsWith('cost.txt')) {
    bundle.costMatrixText = text
  } else if (lower.endsWith('risk.txt')) {
    bundle.riskMatrixText = text
  }
}

export function loadRoutePlanningBundleFromFileMap(
  fileMap: RoutePlanningResultFileMap,
  source = 'backend-result-package',
): LoadedRoutePlanningBundle {
  const bundle: AlgorithmRouteBundle = { source, files: [] }

  for (const [filename, text] of Object.entries(fileMap)) {
    if (typeof text !== 'string') continue
    assignRoutePlanningResultFile(bundle, filename, text)
    bundle.files?.push(filename)
  }

  return { bundle, files: bundle.files || [] }
}

export async function loadRoutePlanningBundleFromFiles(
  files: File[],
  source = 'uploaded-result-package',
): Promise<LoadedRoutePlanningBundle> {
  const bundle: AlgorithmRouteBundle = { source, files: [] }
  const loadedNames: string[] = []

  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const entries = Object.values(zip.files).filter(entry => !entry.dir)
      for (const entry of entries) {
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
