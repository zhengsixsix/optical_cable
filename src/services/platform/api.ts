import { platformClient, setPlatformToken, PLATFORM_USER_KEY } from './client'
import { encryptPassword } from './sm2'
import type {
  PcAuthInfo,
  PlatformDictionary,
  PlatformMenu,
  PlatformRole,
  PlatformUser,
  PlanConfigGridResolution,
  PlanConfigChannel,
  PlanConfigOptimization,
  PlanConfigRedundancy,
  PlanConfigSnapshot,
  PlanConfigSpanKm,
  PlanConfigScope,
  PlanDeviceConfig,
  PlanDeviceConfigSave,
  PlanDeviceConfigSearch,
  PlanDeviceEntity,
  PlanDeviceEntitySearch,
  PlanDeviceLibrary,
  PlanDeviceLibrarySearch,
  PlanLayer,
  PlanLayerUploadCompletePayload,
  PlanPoint,
  PlanPointSaveListPayload,
  PlanCalculationResult,
  PlanProject,
  PlanProjectDetail,
  PlanRouteResult,
  PlatformPlanningResults,
  PagedSearch,
  Id,
} from './types'
import type { RoutePlanningRectRange } from '@/utils/routePlanningViewport'

function encryptPasswordFields<T extends Record<string, unknown>>(payload: T, fields: string[]): T {
  const next = { ...payload }
  for (const field of fields) {
    const value = next[field]
    if (typeof value === 'string' && value.length > 0) {
      ;(next as Record<string, unknown>)[field] = encryptPassword(value)
    }
  }
  return next
}

function extractToken(data: unknown, headers?: Headers): string | null {
  const authHeader = headers?.get('Authorization') || headers?.get('authorization')
  if (authHeader) return authHeader.replace(/^Bearer\s+/i, '')

  const source = data as Record<string, unknown> | null
  if (!source) return null
  for (const key of ['token', 'accessToken', 'jwt', 'authorization']) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) {
      return value.replace(/^Bearer\s+/i, '')
    }
  }
  return null
}

export const platformAuthApi = {
  async login(payload: { username: string; password: string }) {
    const encrypted = encryptPasswordFields(payload, ['password'])
    const { payload: response, headers } = await platformClient.request<PcAuthInfo>('/login', encrypted)
    const token = extractToken(response.data, headers)
    if (token) setPlatformToken(token)
    localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(response.data ?? { username: payload.username }))
    return response.data
  },

  async register(payload: { username: string; password: string; realName?: string; tele?: string; remarks?: string }) {
    return platformClient.post<number>('/register', encryptPasswordFields(payload, ['password']))
  },

  async changePassword(payload: { oldPassword: string; newPassword: string }) {
    return platformClient.post<boolean>('/sys/user/changePassword', encryptPasswordFields(payload, ['oldPassword', 'newPassword']))
  },
}

export const platformUserApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlatformUser[]>('/sys/user/search', payload),
  searchRegister: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlatformUser[]>('/sys/user/searchRegister', payload),
  detail: (id: number | string) => platformClient.post<PlatformUser>('/sys/user/detail', { id }),
  add: (payload: Record<string, unknown>) =>
    platformClient.post<number>('/sys/user/add', encryptPasswordFields(payload, ['password'])),
  modify: (payload: Record<string, unknown>) => platformClient.post<number>('/sys/user/modify', payload),
  remove: (id: number | string) => platformClient.post<boolean>('/sys/user/remove', { id }),
  resetPassword: (userId: number | string) => platformClient.post<boolean>('/sys/user/resetPassword', { userId }),
  setValid: (id: number | string) => platformClient.post<boolean>('/sys/user/setValid', { id }),
  saveRoles: (userId: number | string, roleIds: Array<number | string>) => platformClient.post<boolean>('/sys/user/saveRoles', { userId, roleIds }),
  registerApproval: (payload: Record<string, unknown>) => platformClient.post<number>('/sys/registerApproval', payload),
}

export const platformRoleApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlatformRole[]>('/sys/role/search', payload),
  detail: (id: number | string) => platformClient.post<PlatformRole>('/sys/role/detail', { id }),
  save: (payload: Record<string, unknown>) => platformClient.post<number | string>('/sys/role/save', payload),
  remove: (id: number | string) => platformClient.post<boolean>('/sys/role/remove', { id }),
  saveMenus: (roleId: number | string, menuIds: Array<number | string>) => platformClient.post<boolean>('/sys/role/saveMenus', { roleId, menuIds }),
}

export const platformMenuApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlatformMenu[]>('/sys/menu/search', payload),
  tree: (payload: Record<string, unknown> = {}) =>
    platformClient.post<PlatformMenu[]>('/sys/menu/tree', payload),
  detail: (id: number | string) => platformClient.post<PlatformMenu>('/sys/menu/detail', { id }),
}

export const platformDictionaryApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlatformDictionary[]>('/sys/dic/search/list', payload),
  listItemByType: (type: string) => platformClient.post<PlatformDictionary[]>('/sys/dic/search/listItem', { type }),
  listItem: (type: string) => platformClient.post<PlatformDictionary[]>('/sys/dic/search/listItem', { type }),
  save: (payload: Record<string, unknown>) => platformClient.post<string>('/sys/dic/save', payload),
  remove: (payload: { id: string; type: string }) => platformClient.post<boolean>('/sys/dic/remove', payload),
}

export const platformLogApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<unknown[]>('/sys/log/search', payload),
}

export const platformProjectApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlanProject[]>('/plan/project/search', payload),
  save: (payload: PlanProject) => platformClient.post<Id>('/plan/project/save', payload),
  detail: (id: Id) => platformClient.post<PlanProjectDetail>('/plan/project/detail', { id }),
  queryRoute: (id: Id) => platformClient.post<PlanRouteResult | null>('/plan/project/query/route', { id }),
  fixedPlan: (id: Id) =>
    platformClient.post<PlanCalculationResult>('/plan/project/plan/fixed', { id }),
  optimizedPlan: (id: Id, fmmPathResultIndex: number) =>
    platformClient.post<PlanCalculationResult>('/plan/project/plan/optimized', { id, fmmPathResultIndex }),
  simulationPlan: (id: Id, fmmPathResultIndex: number) =>
    platformClient.post<PlanCalculationResult>('/plan/project/plan/simulation', { id, fmmPathResultIndex }),
  queryFixed: (id: Id) =>
    platformClient.post<PlanCalculationResult>('/plan/project/query/fixed', { id }),
  queryOptimized: (id: Id) =>
    platformClient.post<PlanCalculationResult>('/plan/project/query/optimized', { id }),
  querySimulation: (id: Id) =>
    platformClient.post<PlanCalculationResult>('/plan/project/query/simulation', { id }),
  async queryPlanningResults(id: Id): Promise<PlatformPlanningResults> {
    const results = await Promise.allSettled([
      this.queryFixed(id),
      this.queryOptimized(id),
      this.querySimulation(id),
    ])
    const names = ['fixed', 'optimized', 'simulation'] as const
    const valueAt = (index: number): PlanCalculationResult | null => {
      const result = results[index]
      return result?.status === 'fulfilled' ? result.value ?? null : null
    }
    return {
      fixed: valueAt(0),
      optimized: valueAt(1),
      simulation: valueAt(2),
      errors: results.flatMap((result, index) => result.status === 'rejected'
        ? [`${names[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
        : []),
    }
  },
  remove: (id: Id) => platformClient.post<boolean>('/plan/project/remove', { id }),
  routePlan: (id: string | number, rectRange?: RoutePlanningRectRange) => {
    const payload: { id: string; rectRange?: RoutePlanningRectRange } = { id: String(id) }
    if (rectRange) payload.rectRange = rectRange
    return platformClient.post<unknown>('/plan/project/plan/route', payload)
  },
}

export const platformPointApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlanPoint[]>('/plan/point/search', payload),
  save: (payload: PlanPoint) => platformClient.post<Id>('/plan/point/save', payload),
  saveList: (projectIdOrPayload: PlanPointSaveListPayload['projectId'] | PlanPointSaveListPayload | null, pointList?: PlanPoint[]) => {
    const payload: PlanPointSaveListPayload = typeof projectIdOrPayload === 'object'
      ? projectIdOrPayload ?? { projectId: null, pointList: pointList ?? [] }
      : { projectId: projectIdOrPayload, pointList: pointList ?? [] }

    return platformClient.post<boolean>('/plan/point/saveList', payload)
  },
  detail: (id: number) => platformClient.post<PlanPoint>('/plan/point/detail', { id }),
  remove: (id: number) => platformClient.post<boolean>('/plan/point/remove', { id }),
}

export const platformPlanConfigApi = {
  saveScope: (payload: PlanConfigScope) => platformClient.post<boolean>('/plan/planConfig/saveScope', payload),
  searchScope: (id: Id) => platformClient.post<Omit<PlanConfigScope, 'projectId'> | null>('/plan/planConfig/searchScope', { id }),
  saveGridResolution: (payload: PlanConfigGridResolution) =>
    platformClient.post<boolean>('/plan/planConfig/saveGridResolution', payload),
  searchGridResolution: (id: Id) => platformClient.post<number | null>('/plan/planConfig/searchGridResolution', { id }),
  saveEnableRedundancy: (payload: PlanConfigRedundancy) =>
    platformClient.post<boolean>('/plan/planConfig/saveEnableRedundancy', payload),
  searchEnableRedundancy: (id: Id) => platformClient.post<boolean | null>('/plan/planConfig/searchEnableRedundancy', { id }),
  saveChannelConfig: (payload: PlanConfigChannel) =>
    platformClient.post<boolean>('/plan/planConfig/saveChannelConfig', payload),
  searchChannelConfig: (id: Id) =>
    platformClient.post<Omit<PlanConfigChannel, 'projectId'> | null>('/plan/planConfig/searchChannelConfig', { id }),
  saveOptimization: (payload: PlanConfigOptimization) =>
    platformClient.post<boolean>('/plan/planConfig/saveOptimization', payload),
  searchOptimization: (id: Id) =>
    platformClient.post<Omit<PlanConfigOptimization, 'projectId'> | null>('/plan/planConfig/searchOptimization', { id }),
  saveSpanKm: (payload: PlanConfigSpanKm) => platformClient.post<boolean>('/plan/planConfig/saveSpanKm', payload),
  searchSpanKm: (id: Id) => platformClient.post<number | null>('/plan/planConfig/searchSpanKm', { id }),
  async searchAll(id: Id): Promise<PlanConfigSnapshot> {
    const results = await Promise.allSettled([
      this.searchScope(id),
      this.searchGridResolution(id),
      this.searchEnableRedundancy(id),
      this.searchChannelConfig(id),
      this.searchOptimization(id),
      this.searchSpanKm(id),
    ])
    const valueAt = <T>(index: number): T | null => {
      const result = results[index]
      return result?.status === 'fulfilled' ? result.value as T : null
    }
    const errors = results.flatMap((result, index) => result.status === 'rejected'
      ? [`${['searchScope', 'searchGridResolution', 'searchEnableRedundancy', 'searchChannelConfig', 'searchOptimization', 'searchSpanKm'][index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
      : [])
    return {
      scope: valueAt<PlanConfigSnapshot['scope']>(0),
      gridResolution: valueAt<number>(1),
      enableRedundancy: valueAt<boolean>(2),
      channelConfig: valueAt<PlanConfigSnapshot['channelConfig']>(3),
      optimization: valueAt<PlanConfigSnapshot['optimization']>(4),
      spanKm: valueAt<number>(5),
      errors,
    }
  },
}

export const platformPlanLayerApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlanLayer[]>('/plan/planLayer/search', payload),
  save: (payload: PlanLayer) => platformClient.post<Id>('/plan/planLayer/save', payload),
  detail: (id: Id) => platformClient.post<PlanLayer>('/plan/planLayer/detail', { id }),
  remove: (id: Id) => platformClient.post<boolean>('/plan/planLayer/remove', { id }),
}

export const platformDeviceLibraryApi = {
  search: (payload: PlanDeviceLibrarySearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlanDeviceLibrary[]>('/plan/deviceLibrary/search', payload),
  save: (payload: PlanDeviceLibrary) => platformClient.post<number | string>('/plan/deviceLibrary/save', payload),
  detail: (id: number | string) => platformClient.post<PlanDeviceLibrary>('/plan/deviceLibrary/detail', { id }),
  remove: (id: number | string) => platformClient.post<boolean>('/plan/deviceLibrary/remove', { id }),
}

export const platformDeviceEntityApi = {
  search: (payload: PlanDeviceEntitySearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlanDeviceEntity[]>('/plan/deviceEntity/search', payload),
  save: (payload: PlanDeviceEntity) => platformClient.post<number | string>('/plan/deviceEntity/save', payload),
  detail: (id: number | string) => platformClient.post<PlanDeviceEntity>('/plan/deviceEntity/detail', { id }),
  remove: (id: number | string) => platformClient.post<boolean>('/plan/deviceEntity/remove', { id }),
}

export const platformDeviceConfigApi = {
  search: (payload: PlanDeviceConfigSearch) =>
    platformClient.postWithPage<PlanDeviceConfig[]>('/plan/deviceConfig/search', payload),
  save: (payload: PlanDeviceConfigSave) => platformClient.post<number | string>('/plan/deviceConfig/save', payload),
  detail: (id: Id) => platformClient.post<PlanDeviceConfig>('/plan/deviceConfig/detail', { id }),
  remove: (id: Id) => platformClient.post<boolean>('/plan/deviceConfig/remove', { id }),
}

export const platformUploadApi = {
  complete: (payload: PlanLayerUploadCompletePayload) =>
    platformClient.postJson<unknown>('/sys/upload/complete', payload),
}
