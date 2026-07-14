import { platformProjectApi } from '@/services/platform/api'
import {
  convertAlgorithmRouteBundle,
  type AlgorithmRouteBundleResult,
  type RawPathResult,
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
  'pointList',
  'cost.txt',
  'risk.txt',
] as const

type RouteResultFileName = typeof ROUTE_RESULT_FILES[number]

function isRouteResultFileName(value: string): value is RouteResultFileName {
  return ROUTE_RESULT_FILES.includes(value as RouteResultFileName)
}

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

export function hasBackendRoutePlanningData(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  return ROUTE_RESULT_FILES.some(filename => hasResultValue((data as Record<string, unknown>)[filename]))
}

function isClose(actual: unknown, expected: number, tolerance = 1e-6): boolean {
  return typeof actual === 'number' && Math.abs(actual - expected) <= tolerance
}

function isKnownRoutePlanningMockPath(path: RawPathResult): boolean {
  const realTrace = path.real_trace || []
  const first = realTrace[0]
  const last = realTrace[realTrace.length - 1]
  if (!first || !last) return false

  return isClose(first[1], -11.543075471698113)
    && isClose(first[2], 47.54214159292036)
    && isClose(last[1], -11.927566037735849)
    && isClose(last[2], 47.81899115044248)
    && isClose(path.length, 56.10387063735551, 1e-3)
    && isClose(path.total_cost, 3032870.7332219994, 1)
}

function assertNoBackendRoutePlanningMock(fileMap: RoutePlanningResultFileMap, source: string) {
  const isBackendResult = source.startsWith('routePlan:') || source.includes('backend')
  if (!isBackendResult) return

  const fmmText = fileMap['FMM_path_result.json']
  if (!fmmText) return

  try {
    const parsed = JSON.parse(fmmText) as RawPathResult[]
    if (Array.isArray(parsed) && parsed.some(isKnownRoutePlanningMockPath)) {
      throw new Error('后端返回的是旧样例/mock 路由规划结果，前端已拒绝显示。请后端返回当前项目真实规划结果。')
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('旧样例')) {
      throw error
    }
  }
}

export function convertBackendRoutePlanningData(
  data: unknown,
  source = 'backend-route-plan',
): AlgorithmRouteBundleResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('后端路由规划结果格式错误：data 不是文件映射对象')
  }

  const fileMap: RoutePlanningResultFileMap = {}
  for (const [filename, value] of Object.entries(data)) {
    if (!isRouteResultFileName(filename)) continue
    const text = toResultFileText(value)
    if (text !== undefined) fileMap[filename] = text
  }

  if (Object.keys(fileMap).length === 0) {
    throw new Error('后端路由规划结果缺少可识别的结果文件')
  }

  assertNoBackendRoutePlanningMock(fileMap, source)

  const { bundle } = loadRoutePlanningBundleFromFileMap(fileMap, source)
  return convertAlgorithmRouteBundle(bundle)
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

  const result = convertBackendRoutePlanningData(data, `backend-queryRoute:${projectId}`)
  return result.routes.length > 0 ? result : null
}
