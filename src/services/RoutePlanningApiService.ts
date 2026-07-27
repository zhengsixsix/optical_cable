import { platformProjectApi } from '@/services/platform/api'
import {
  convertAlgorithmRouteBundle,
  type AlgorithmRouteBundleResult,
} from '@/services/RouteDataConverter'
import {
  loadRoutePlanningBundleFromFileMap,
  type RoutePlanningResultFileMap,
} from '@/services/RoutePlanningResultService'
import type { RoutePlanningRectRange } from '@/utils/routePlanningViewport'
import type { Id } from '@/services/platform/types'

const ROUTE_RESULT_FILES = [
  'FMM_path_result.json',
  'segment_result_base_FixSpacing.json',
  'segment_result_base_Risk.json',
  'cost.txt',
  'risk.txt',
  'pointList',
] as const

type RouteResultFileName = typeof ROUTE_RESULT_FILES[number]

function toResultFileText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return undefined
  return JSON.stringify(value)
}

function hasResultValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function unwrapBackendRoutePlanningData(data: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || data === null || data === undefined) return null

  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null
    try {
      return unwrapBackendRoutePlanningData(JSON.parse(trimmed), depth + 1)
    } catch {
      return null
    }
  }

  if (Array.isArray(data)) {
    return data.length === 1 ? unwrapBackendRoutePlanningData(data[0], depth + 1) : null
  }
  if (typeof data !== 'object') return null

  const record = data as Record<string, unknown>
  if (ROUTE_RESULT_FILES.some(filename => filename in record)) return record
  if ('data' in record) {
    const unwrapped = unwrapBackendRoutePlanningData(record.data, depth + 1)
    if (unwrapped) return unwrapped
  }
  if (typeof record.text === 'string') {
    return unwrapBackendRoutePlanningData(record.text, depth + 1)
  }
  return null
}

function hasBackendRoutePlanningData(data: unknown): boolean {
  const record = unwrapBackendRoutePlanningData(data)
  if (!record) return false
  return ROUTE_RESULT_FILES.some(filename => hasResultValue(record[filename]))
}

export function convertBackendRoutePlanningData(
  data: unknown,
  source = 'backend-route-plan',
): AlgorithmRouteBundleResult {
  const record = unwrapBackendRoutePlanningData(data)
  if (!record) throw new Error('后端路由规划结果格式错误：未找到结果文件映射')
  const fileMap: RoutePlanningResultFileMap = {}
  for (const filename of ROUTE_RESULT_FILES) {
    if (!(filename in record)) continue
    const text = toResultFileText(record[filename])
    if (text !== undefined) fileMap[filename] = text
  }

  if (Object.keys(fileMap).length === 0) {
    throw new Error('后端路由规划结果缺少可识别的结果文件')
  }

  const { bundle } = loadRoutePlanningBundleFromFileMap(fileMap, source)
  const result = convertAlgorithmRouteBundle(bundle)
  const storedFiles = result.rawResultFiles as Record<string, unknown>
  for (const filename of ROUTE_RESULT_FILES) {
    if (filename in record && record[filename] === null) storedFiles[filename] = null
  }
  return result
}

export async function fetchRoutePlanningByProjectId(
  projectId: string,
  rectRange?: RoutePlanningRectRange,
): Promise<AlgorithmRouteBundleResult> {
  const data = await platformProjectApi.routePlan(projectId, rectRange)
  return convertBackendRoutePlanningData(data, `routePlan:${projectId}`)
}

export async function queryRoutePlanningByProjectId(
  projectId: Id,
): Promise<AlgorithmRouteBundleResult | null> {
  const data = await platformProjectApi.queryRoute(projectId)
  if (!hasBackendRoutePlanningData(data)) return null
  return convertBackendRoutePlanningData(data, `backend-queryRoute:${projectId}`)
}
