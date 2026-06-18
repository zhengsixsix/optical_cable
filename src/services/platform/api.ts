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
  save: (payload: PlanProject) => platformClient.post<number>('/plan/project/save', payload),
  detail: (id: number) => platformClient.post<PlanProject>('/plan/project/detail', { id }),
  remove: (id: number) => platformClient.post<boolean>('/plan/project/remove', { id }),
}

export const platformPointApi = {
  search: (payload: PagedSearch = { pageNumber: 1, pageSize: 10 }) =>
    platformClient.postWithPage<PlanPoint[]>('/plan/point/search', payload),
  save: (payload: PlanPoint) => platformClient.post<number>('/plan/point/save', payload),
  saveList: (projectIdOrPayload: number | PlanPointSaveListPayload | null, pointList?: PlanPoint[]) => {
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
  save: (payload: PlanLayer) => platformClient.post<number>('/plan/planLayer/save', payload),
  detail: (id: number) => platformClient.post<PlanLayer>('/plan/planLayer/detail', { id }),
  remove: (id: number) => platformClient.post<boolean>('/plan/planLayer/remove', { id }),
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
  { key: 'login', group: '1.1 用户管理', name: 'PC端登陆', path: '/login', authRequired: false, encryptPasswordFields: ['password'], defaultPayload: { username: 'admin', password: '' } },
  { key: 'register', group: '1.1 用户管理', name: '新用户注册', path: '/register', authRequired: false, encryptPasswordFields: ['password'], defaultPayload: { username: '', password: '', realName: '', tele: '', remarks: '' } },
  { key: 'searchRegister', group: '1.1 用户管理', name: '注册用户(查询)审核', path: '/sys/user/searchRegister', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, realName: null, tele: null, username: null, remarks: null, approvalCd: null, isValidCd: null, key: '', accountId: null } },
  { key: 'registerApproval', group: '1.1 用户管理', name: '用户注册审核', path: '/sys/registerApproval', defaultPayload: { userId: null, approvalCd: 'approved', approvalDesc: '', roleIds: [], sortNum: 999 } },
  { key: 'userAdd', group: '1.1 用户管理', name: '新建用户', path: '/sys/user/add', encryptPasswordFields: ['password'], defaultPayload: { username: '', password: '', realName: '', tele: '', remarks: '', roleIds: [], sortNum: 999 } },
  { key: 'userDetail', group: '1.1 用户管理', name: '用户详情', path: '/sys/user/detail', defaultPayload: { id: null } },
  { key: 'userSearch', group: '1.1 用户管理', name: '查询用户', path: '/sys/user/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, realName: null, tele: null, username: null, remarks: null, approvalCd: null, isValidCd: null, key: '', accountId: null } },
  { key: 'userSaveRoles', group: '1.1 用户管理', name: '给用户赋予角色', path: '/sys/user/saveRoles', defaultPayload: { userId: null, roleIds: [] } },
  { key: 'userChangePassword', group: '1.1 用户管理', name: '修改密码', path: '/sys/user/changePassword', encryptPasswordFields: ['oldPassword', 'newPassword'], defaultPayload: { oldPassword: '', newPassword: '' } },
  { key: 'userResetPassword', group: '1.1 用户管理', name: '重置密码', path: '/sys/user/resetPassword', defaultPayload: { userId: null } },
  { key: 'userRemove', group: '1.1 用户管理', name: '删除用户', path: '/sys/user/remove', defaultPayload: { id: null } },
  { key: 'userModify', group: '1.1 用户管理', name: '修改用户', path: '/sys/user/modify', defaultPayload: { id: null, realName: '', tele: '', remarks: '', roleIds: [], sortNum: 999 } },
  { key: 'userSetValid', group: '1.1 用户管理', name: '禁用启用', path: '/sys/user/setValid', defaultPayload: { id: null } },
  { key: 'roleSave', group: '1.2 角色管理', name: '保存系统角色', path: '/sys/role/save', defaultPayload: { id: null, code: '', name: '', description: '', isValidCd: '1', sortNum: 999, isSys: 0 } },
  { key: 'roleRemove', group: '1.2 角色管理', name: '删除系统角色', path: '/sys/role/remove', defaultPayload: { id: null } },
  { key: 'roleDetail', group: '1.2 角色管理', name: '查询系统角色详情', path: '/sys/role/detail', defaultPayload: { id: null } },
  { key: 'roleSearch', group: '1.2 角色管理', name: '查询系统角色', path: '/sys/role/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, code: null, name: '', description: null, isValidCd: null, sortNum: null, isSys: null } },
  { key: 'roleSaveMenus', group: '1.2 角色管理', name: '分配功能权限', path: '/sys/role/saveMenus', defaultPayload: { roleId: null, menuIds: [] } },
  { key: 'menuDetail', group: '1.3 功能菜单', name: '查询系统菜单详情', path: '/sys/menu/detail', defaultPayload: { id: null } },
  { key: 'menuSearch', group: '1.3 功能菜单', name: '查询系统菜单', path: '/sys/menu/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', parentId: null, sortNum: null, url: null, typeCode: null, code: null, terminalType: null } },
  { key: 'menuTree', group: '1.3 功能菜单', name: '层级查询菜单', path: '/sys/menu/tree', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, roleId: null } },
  { key: 'dicSave', group: '1.5 字典管理', name: '保存系统字典', path: '/sys/dic/save', defaultPayload: { id: null, type: 'PLAN_TYPE', code: '', name: '', detail: '', sortNum: 999, isValidCd: '1' } },
  { key: 'dicRemove', group: '1.5 字典管理', name: '删除系统字典', path: '/sys/dic/remove', defaultPayload: { id: null, type: 'PLAN_TYPE' } },
  { key: 'dicSearch', group: '1.5 字典管理', name: '按照类型查询字典', path: '/sys/dic/search/list', defaultPayload: { pageNumber: 1, pageSize: 10, type: 'PLAN_TYPE' } },
  { key: 'dicListItem', group: '1.5 字典管理', name: '可选项查询', path: '/sys/dic/search/listItem', defaultPayload: { type: 'PLAN_TYPE' } },
  { key: 'logSearch', group: '1.6 日志管理', name: '查询操作日志列表', path: '/sys/log/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, title: '', businessType: null, method: null, requestMethod: null, operatorType: null, operName: null, orgName: null, operUrl: null, operIp: null, operLocation: null, operParam: null, jsonResult: null, status: null, errorMsg: null, operTime: null, costTime: null } },
  { key: 'projectSave', group: '2.1 项目管理', name: '保存规划项目', path: '/plan/project/save', defaultPayload: { id: null, name: '', remarks: '', isPublic: 0 } },
  { key: 'projectRemove', group: '2.1 项目管理', name: '删除规划项目', path: '/plan/project/remove', defaultPayload: { id: null } },
  { key: 'projectDetail', group: '2.1 项目管理', name: '查询规划项目详情', path: '/plan/project/detail', defaultPayload: { id: null } },
  { key: 'projectSearch', group: '2.1 项目管理', name: '查询规划项目列表', path: '/plan/project/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', remarks: null, isPublic: null } },
  { key: 'pointSave', group: '2.2 站点管理', name: '保存项目站点', path: '/plan/point/save', defaultPayload: { id: null, projectId: null, name: '', longitude: null, latitude: null, sortNum: 999 } },
  { key: 'pointSaveList', group: '2.2 站点管理', name: '保存项目站点列表', path: '/plan/point/saveList', defaultPayload: { projectId: null, pointList: [{ name: '', longitude: null, latitude: null, sortNum: 1 }] } },
  { key: 'pointRemove', group: '2.2 站点管理', name: '删除项目站点', path: '/plan/point/remove', defaultPayload: { id: null } },
  { key: 'pointDetail', group: '2.2 站点管理', name: '查询项目站点详情', path: '/plan/point/detail', defaultPayload: { id: null } },
  { key: 'pointSearch', group: '2.2 站点管理', name: '查询项目站点列表', path: '/plan/point/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, projectId: null, name: '' } },
  { key: 'planConfigSaveScope', group: '2.3 项目配置管理', name: '保存规划范围设定', path: '/plan/planConfig/saveScope', defaultPayload: { projectId: null, topLeftLng: null, topLeftLat: null, bottomRightLng: null, bottomRightLat: null } },
  { key: 'planConfigSaveGridResolution', group: '2.3 项目配置管理', name: '保存栅格化分辨率', path: '/plan/planConfig/saveGridResolution', defaultPayload: { projectId: null, gridResolution: null } },
  { key: 'planConfigSaveEnableRedundancy', group: '2.3 项目配置管理', name: '保存冗余策略', path: '/plan/planConfig/saveEnableRedundancy', defaultPayload: { projectId: null, enableRedundancy: null } },
]

platformEndpointDefinitions.push(
  { key: 'uploadComplete', group: '1.4 附件管理', name: '上传完成', path: '/sys/upload/complete', defaultPayload: { uploadUrl: '', bizId: null, typeDic: 'LAYER' } },
  {
    key: 'uploadTusRequests',
    group: '1.4 附件管理',
    name: 'TUS 分片上传通配入口',
    path: '/sys/upload/**',
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    callable: false,
    description: 'Swagger 暴露的 TUS 上传协议入口，由图层上传流程通过 Uppy 自动调用。',
    defaultPayload: {},
  },
  { key: 'planLayerSave', group: '2.4 图层管理', name: '保存规划图层', path: '/plan/planLayer/save', defaultPayload: { id: null, name: '', remarks: '', isPublic: 0, isDefault: 0, attachmentId: null, typeDic: 'BATHY' } },
  { key: 'planLayerRemove', group: '2.4 图层管理', name: '删除规划图层', path: '/plan/planLayer/remove', defaultPayload: { id: null } },
  { key: 'planLayerDetail', group: '2.4 图层管理', name: '查询规划图层详情', path: '/plan/planLayer/detail', defaultPayload: { id: null } },
  { key: 'planLayerSearch', group: '2.4 图层管理', name: '查询规划图层列表', path: '/plan/planLayer/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', remarks: null, isPublic: null, isDefault: null, attachmentId: null, typeDic: null } },
  { key: 'deviceLibrarySave', group: '2.5 器件库管理', name: '保存器件库', path: '/plan/deviceLibrary/save', defaultPayload: { id: null, name: '', typeCd: 'FIB', iconId: null, iconSize: { width: 48, height: 48 }, dialogWindowId: null, bindFuncList: [] } },
  { key: 'deviceLibraryRemove', group: '2.5 器件库管理', name: '删除器件库', path: '/plan/deviceLibrary/remove', defaultPayload: { id: null } },
  { key: 'deviceLibraryDetail', group: '2.5 器件库管理', name: '查询器件库详情', path: '/plan/deviceLibrary/detail', defaultPayload: { id: null } },
  { key: 'deviceLibrarySearch', group: '2.5 器件库管理', name: '查询器件库列表', path: '/plan/deviceLibrary/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', typeCd: null, dialogWindowId: null } },
  { key: 'deviceEntitySave', group: '2.6 器件实例管理', name: '保存器件实体', path: '/plan/deviceEntity/save', defaultPayload: { id: null, name: '', typeCd: 'AMP', iconId: null, iconSize: { width: 48, height: 48 }, dialogWindowId: null, bindFuncList: [], libraryId: null, longitude: null, latitude: null, projectId: null, sortNum: 999 } },
  { key: 'deviceEntityRemove', group: '2.6 器件实例管理', name: '删除器件实体', path: '/plan/deviceEntity/remove', defaultPayload: { id: null } },
  { key: 'deviceEntityDetail', group: '2.6 器件实例管理', name: '查询器件实体详情', path: '/plan/deviceEntity/detail', defaultPayload: { id: null } },
  { key: 'deviceEntitySearch', group: '2.6 器件实例管理', name: '查询器件实体列表', path: '/plan/deviceEntity/search', defaultPayload: { pageSize: 10, pageNumber: 1, id: null, name: '', typeCd: null, libraryId: null, longitude: null, latitude: null, projectId: null } },
)

export async function callPlatformEndpoint(definition: EndpointDefinition, rawPayload: unknown) {
  if (definition.callable === false) {
    throw new Error(definition.description || '该 Swagger 接口不支持通用 JSON 调用')
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
