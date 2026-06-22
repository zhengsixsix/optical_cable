import { platformClient, setPlatformToken, PLATFORM_USER_KEY } from './client'
import { encryptPassword } from './sm2'
import type {
  EndpointDefinition,
  PcAuthInfo,
  PlatformDictionary,
  PlatformMenu,
  PlatformRole,
  PlatformUser,
  PlanConfigGridResolution,
  PlanConfigRedundancy,
  PlanConfigScope,
  PlanDeviceEntity,
  PlanDeviceEntitySearch,
  PlanDeviceLibrary,
  PlanDeviceLibrarySearch,
  PlanLayer,
  PlanLayerUploadCompletePayload,
  PlanPoint,
  PlanPointSaveListPayload,
  PlanProject,
  PagedSearch,
  Id,
} from './types'

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
  detail: (id: Id) => platformClient.post<PlanProject>('/plan/project/detail', { id }),
  remove: (id: Id) => platformClient.post<boolean>('/plan/project/remove', { id }),
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
  saveGridResolution: (payload: PlanConfigGridResolution) =>
    platformClient.post<boolean>('/plan/planConfig/saveGridResolution', payload),
  saveEnableRedundancy: (payload: PlanConfigRedundancy) =>
    platformClient.post<boolean>('/plan/planConfig/saveEnableRedundancy', payload),
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

export const platformUploadApi = {
  complete: (payload: PlanLayerUploadCompletePayload) =>
    platformClient.postJson<unknown>('/sys/upload/complete', payload),
}

export const platformEndpointDefinitions: EndpointDefinition[] = [
  { key: 'login', group: '1.1 User Management', name: 'PC login', path: '/login', authRequired: false, encryptPasswordFields: ['password'], defaultPayload: { username: 'admin', password: '' } },
  { key: 'register', group: '1.1 User Management', name: 'Register user', path: '/register', authRequired: false, encryptPasswordFields: ['password'], defaultPayload: { username: '', password: '', realName: '', tele: '', remarks: '' } },
  { key: 'searchRegister', group: '1.1 User Management', name: 'Search registered users', path: '/sys/user/searchRegister', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, realName: null, tele: null, username: null, remarks: null, approvalCd: null, isValidCd: null, key: '', accountId: null } },
  { key: 'registerApproval', group: '1.1 User Management', name: 'Approve registration', path: '/sys/registerApproval', defaultPayload: { userId: null, approvalCd: 'approved', approvalDesc: '', roleIds: [], sortNum: 999 } },
  { key: 'userAdd', group: '1.1 User Management', name: 'Create user', path: '/sys/user/add', encryptPasswordFields: ['password'], defaultPayload: { username: '', password: '', realName: '', tele: '', remarks: '', roleIds: [], sortNum: 999 } },
  { key: 'userDetail', group: '1.1 User Management', name: 'User detail', path: '/sys/user/detail', defaultPayload: { id: null } },
  { key: 'userSearch', group: '1.1 User Management', name: 'Search users', path: '/sys/user/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, realName: null, tele: null, username: null, remarks: null, approvalCd: null, isValidCd: null, key: '', accountId: null } },
  { key: 'userSaveRoles', group: '1.1 User Management', name: 'Assign user roles', path: '/sys/user/saveRoles', defaultPayload: { userId: null, roleIds: [] } },
  { key: 'userChangePassword', group: '1.1 User Management', name: 'Change password', path: '/sys/user/changePassword', encryptPasswordFields: ['oldPassword', 'newPassword'], defaultPayload: { oldPassword: '', newPassword: '' } },
  { key: 'userResetPassword', group: '1.1 User Management', name: 'Reset password', path: '/sys/user/resetPassword', defaultPayload: { userId: null } },
  { key: 'userRemove', group: '1.1 User Management', name: 'Delete user', path: '/sys/user/remove', defaultPayload: { id: null } },
  { key: 'userModify', group: '1.1 User Management', name: 'Modify user', path: '/sys/user/modify', defaultPayload: { id: null, realName: '', tele: '', remarks: '', roleIds: [], sortNum: 999 } },
  { key: 'userSetValid', group: '1.1 User Management', name: 'Set user valid state', path: '/sys/user/setValid', defaultPayload: { id: null } },
  { key: 'roleSave', group: '1.2 Role Management', name: 'Save role', path: '/sys/role/save', defaultPayload: { id: null, code: '', name: '', description: '', isValidCd: '1', sortNum: 999, isSys: 0 } },
  { key: 'roleRemove', group: '1.2 Role Management', name: 'Delete role', path: '/sys/role/remove', defaultPayload: { id: null } },
  { key: 'roleDetail', group: '1.2 Role Management', name: 'Role detail', path: '/sys/role/detail', defaultPayload: { id: null } },
  { key: 'roleSearch', group: '1.2 Role Management', name: 'Search roles', path: '/sys/role/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, code: null, name: '', description: null, isValidCd: null, sortNum: null, isSys: null } },
  { key: 'roleSaveMenus', group: '1.2 Role Management', name: 'Assign role menus', path: '/sys/role/saveMenus', defaultPayload: { roleId: null, menuIds: [] } },
  { key: 'menuDetail', group: '1.3 Menu Management', name: 'Menu detail', path: '/sys/menu/detail', defaultPayload: { id: null } },
  { key: 'menuSearch', group: '1.3 Menu Management', name: 'Search menus', path: '/sys/menu/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', parentId: null, sortNum: null, url: null, typeCode: null, code: null, terminalType: null } },
  { key: 'menuTree', group: '1.3 Menu Management', name: 'Menu tree', path: '/sys/menu/tree', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, roleId: null } },
  { key: 'dicSave', group: '1.5 Dictionary Management', name: 'Save dictionary', path: '/sys/dic/save', defaultPayload: { id: null, type: 'PLAN_TYPE', code: '', name: '', detail: '', sortNum: 999, isValidCd: '1' } },
  { key: 'dicRemove', group: '1.5 Dictionary Management', name: 'Delete dictionary', path: '/sys/dic/remove', defaultPayload: { id: null, type: 'PLAN_TYPE' } },
  { key: 'dicSearch', group: '1.5 Dictionary Management', name: 'Search dictionaries by type', path: '/sys/dic/search/list', defaultPayload: { pageNumber: 1, pageSize: 10, type: 'PLAN_TYPE' } },
  { key: 'dicListItem', group: '1.5 Dictionary Management', name: 'Dictionary list items', path: '/sys/dic/search/listItem', defaultPayload: { type: 'PLAN_TYPE' } },
  { key: 'logSearch', group: '1.6 Log Management', name: 'Search operation logs', path: '/sys/log/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, title: '', businessType: null, method: null, requestMethod: null, operatorType: null, operName: null, orgName: null, operUrl: null, operIp: null, operLocation: null, operParam: null, jsonResult: null, status: null, errorMsg: null, operTime: null, costTime: null } },
  { key: 'projectSave', group: '2.1 Project Management', name: 'Save project', path: '/plan/project/save', defaultPayload: { id: null, name: '', remarks: '', isPublic: 0 } },
  { key: 'projectRemove', group: '2.1 Project Management', name: 'Delete project', path: '/plan/project/remove', defaultPayload: { id: null } },
  { key: 'projectDetail', group: '2.1 Project Management', name: 'Project detail', path: '/plan/project/detail', defaultPayload: { id: null } },
  { key: 'projectSearch', group: '2.1 Project Management', name: 'Search projects', path: '/plan/project/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', remarks: null, isPublic: null } },
  { key: 'pointSave', group: '2.2 Point Management', name: 'Save point', path: '/plan/point/save', defaultPayload: { id: null, projectId: null, name: '', longitude: null, latitude: null, sortNum: 999 } },
  { key: 'pointSaveList', group: '2.2 Point Management', name: 'Save point list', path: '/plan/point/saveList', defaultPayload: { projectId: null, pointList: [{ name: '', longitude: null, latitude: null, sortNum: 1 }] } },
  { key: 'pointRemove', group: '2.2 Point Management', name: 'Delete point', path: '/plan/point/remove', defaultPayload: { id: null } },
  { key: 'pointDetail', group: '2.2 Point Management', name: 'Point detail', path: '/plan/point/detail', defaultPayload: { id: null } },
  { key: 'pointSearch', group: '2.2 Point Management', name: 'Search points', path: '/plan/point/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, projectId: null, name: '' } },
  { key: 'planConfigSaveScope', group: '2.3 Plan Config Management', name: 'Save planning scope', path: '/plan/planConfig/saveScope', defaultPayload: { projectId: null, topLeftLng: null, topLeftLat: null, bottomRightLng: null, bottomRightLat: null } },
  { key: 'planConfigSaveGridResolution', group: '2.3 Plan Config Management', name: 'Save grid resolution', path: '/plan/planConfig/saveGridResolution', defaultPayload: { projectId: null, gridResolution: null } },
  { key: 'planConfigSaveEnableRedundancy', group: '2.3 Plan Config Management', name: 'Save redundancy flag', path: '/plan/planConfig/saveEnableRedundancy', defaultPayload: { projectId: null, enableRedundancy: null } },
]

platformEndpointDefinitions.push(
  { key: 'uploadComplete', group: '1.4 Attachment Management', name: 'Upload complete', path: '/sys/upload/complete', defaultPayload: { uploadUrl: '', bizId: null, typeDic: 'LAYER' } },
  {
    key: 'uploadTusRequests',
    group: '1.4 Attachment Management',
    name: 'TUS upload wildcard endpoint',
    path: '/sys/upload/**',
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    callable: false,
    description: 'Swagger exposes the TUS upload protocol endpoint; the layer upload flow calls it through Uppy.',
    defaultPayload: {},
  },
  { key: 'planLayerSave', group: '2.4 Layer Management', name: 'Save plan layer', path: '/plan/planLayer/save', defaultPayload: { id: null, name: '', remarks: '', isPublic: 0, isDefault: 0, attachmentId: null, typeDic: 'BATHY' } },
  { key: 'planLayerRemove', group: '2.4 Layer Management', name: 'Delete plan layer', path: '/plan/planLayer/remove', defaultPayload: { id: null } },
  { key: 'planLayerDetail', group: '2.4 Layer Management', name: 'Plan layer detail', path: '/plan/planLayer/detail', defaultPayload: { id: null } },
  { key: 'planLayerSearch', group: '2.4 Layer Management', name: 'Search plan layers', path: '/plan/planLayer/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', remarks: null, isPublic: null, isDefault: null, attachmentId: null, typeDic: null } },
  { key: 'deviceLibrarySave', group: '2.5 Device Library Management', name: 'Save device library', path: '/plan/deviceLibrary/save', defaultPayload: { id: null, name: '', deviceTypeCd: 'FIB', iconId: null, iconSize: { width: 48, height: 48 }, dialogWindowId: null, bindFuncList: [] } },
  { key: 'deviceLibraryRemove', group: '2.5 Device Library Management', name: 'Delete device library', path: '/plan/deviceLibrary/remove', defaultPayload: { id: null } },
  { key: 'deviceLibraryDetail', group: '2.5 Device Library Management', name: 'Device library detail', path: '/plan/deviceLibrary/detail', defaultPayload: { id: null } },
  { key: 'deviceLibrarySearch', group: '2.5 Device Library Management', name: 'Search device libraries', path: '/plan/deviceLibrary/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', deviceTypeCd: null, dialogWindowId: null } },
  { key: 'deviceEntitySave', group: '2.6 Device Entity Management', name: 'Save device entity', path: '/plan/deviceEntity/save', defaultPayload: { id: null, name: '', deviceTypeCd: 'AMP', iconId: null, iconSize: { width: 48, height: 48 }, dialogWindowId: null, bindFuncList: [], libraryId: null, longitude: null, latitude: null, projectId: null, sortNum: 999 } },
  { key: 'deviceEntityRemove', group: '2.6 Device Entity Management', name: 'Delete device entity', path: '/plan/deviceEntity/remove', defaultPayload: { id: null } },
  { key: 'deviceEntityDetail', group: '2.6 Device Entity Management', name: 'Device entity detail', path: '/plan/deviceEntity/detail', defaultPayload: { id: null } },
  { key: 'deviceEntitySearch', group: '2.6 Device Entity Management', name: 'Search device entities', path: '/plan/deviceEntity/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', deviceTypeCd: null, libraryId: null, longitude: null, latitude: null, projectId: null } },
)
export async function callPlatformEndpoint(definition: EndpointDefinition, rawPayload: unknown) {
  if (definition.callable === false) {
    throw new Error(definition.description || 'Swagger endpoint does not support generic JSON calls')
  }

  const payload = definition.encryptPasswordFields && rawPayload && !Array.isArray(rawPayload)
    ? encryptPasswordFields(rawPayload as Record<string, unknown>, definition.encryptPasswordFields)
    : rawPayload

  const response = await platformClient.postWithPage<unknown>(definition.path, payload)
  if (definition.path === '/login') {
    const token = extractToken(response.data)
    if (token) setPlatformToken(token)
    localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(response.data ?? null))
  }
  return response
}
