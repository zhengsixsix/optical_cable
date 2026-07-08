import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { PLATFORM_USER_KEY, setPlatformToken } from '@/services/platform/client'
import { platformAuthApi, platformMenuApi, platformRoleApi, platformUserApi } from '@/services/platform/api'
import type { PageModel } from '@/services/platform/client'
import type { PcAuthInfo, PlatformMenu, PlatformRole, PlatformUser } from '@/services/platform/types'

export type UserRole = 'admin' | 'user'
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled'

export interface User {
  id: string
  username: string
  password?: string
  phone?: string
  realName?: string
  role: UserRole
  status: UserStatus
  createdAt?: Date | string
  lastLoginAt?: Date | string
  remarks?: string
  menus?: Record<string, string>
  roles?: Record<string, string>
  roleIds?: string[]
}

export interface RoleOption {
  id: string
  code?: string
  name: string
  description?: string
  isValidCd?: string
  sortNum?: number
  isSys?: number
  userCount?: number
  permission?: string
  selectedMenuIds?: string[]
}

export interface MenuPermission {
  id: string
  name: string
  code?: string
  parentId?: string
  typeCode?: string
  url?: string
  children: MenuPermission[]
  funcList: MenuPermission[]
}

export interface LoadUsersOptions {
  approvedPageNumber?: number
  approvedPageSize?: number
  pendingPageNumber?: number
  pendingPageSize?: number
  disabledPageNumber?: number
  disabledPageSize?: number
}

export interface LoadUsersResult {
  success: boolean
  message: string
  pages: {
    approved: PageModel | null
    pending: PageModel | null
    disabled: PageModel | null
  }
}

export interface LoadRolesOptions {
  includeDisabled?: boolean
  pageNumber?: number
  pageSize?: number
  keyword?: string
}

export interface LoadRolesResult {
  success: boolean
  message: string
  page: PageModel | null
}

function normalizeTextMap(value: unknown, keyField = 'code', valueField = 'name'): Record<string, string> {
  if (!value) return {}

  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>((map, item) => {
      if (!item || typeof item !== 'object') return map
      const source = item as Record<string, unknown>
      const key = source[keyField]
      const label = source[valueField]
      if (typeof key === 'string' && key) {
        map[key] = typeof label === 'string' ? label : key
      }
      return map
    }, {})
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((map, [key, label]) => {
      map[key] = typeof label === 'string' ? label : String(label ?? key)
      return map
    }, {})
  }

  return {}
}

function hasAdminRole(roles: Record<string, string>): boolean {
  return Object.entries(roles).some(([code, name]) => {
    const normalizedCode = code.toLowerCase()
    return normalizedCode === 'test' ||
      normalizedCode.includes('admin') ||
      name.includes('管理员') ||
      name.includes('系统测试员')
  })
}

function normalizeRoleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const source = item as Record<string, unknown>
      const id = source.roleId ?? source.id
      return id === undefined || id === null ? null : String(id)
    })
    .filter((id): id is string => Boolean(id))
}

function normalizeMenuIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const selectedIds: string[] = []

  const visit = (item: unknown, nestedInUnmarkedTree = false) => {
    if (!item || typeof item !== 'object') return
    const source = item as Record<string, unknown>
    const id = source.menuId ?? source.id
    const hasTreeShape = Array.isArray(source.children) || Array.isArray(source.funcList)
    const marker = source.checked ?? source.selected ?? source.authorized ?? source.assigned ?? source.hasAuth
    const hasMarker = marker !== undefined && marker !== null
    const isMarkedSelected = marker === true || marker === 1 || marker === '1' || marker === 'true'

    if (id !== undefined && id !== null && ((!hasTreeShape && !hasMarker && !nestedInUnmarkedTree) || isMarkedSelected)) {
      selectedIds.push(String(id))
    }

    const nextNestedInUnmarkedTree = nestedInUnmarkedTree || (hasTreeShape && !hasMarker)
    if (Array.isArray(source.funcList)) source.funcList.forEach(child => visit(child, nextNestedInUnmarkedTree))
    if (Array.isArray(source.children)) source.children.forEach(child => visit(child, nextNestedInUnmarkedTree))
  }

  value.forEach(item => visit(item))
  return Array.from(new Set(selectedIds))
}

function mapAuthInfoToUser(data: PcAuthInfo | null, fallbackUsername?: string): User {
  const roles = normalizeTextMap(data?.roles)
  const menus = normalizeTextMap(data?.menus)
  const isAdmin = hasAdminRole(roles)

  return {
    id: String(data?.userId ?? fallbackUsername ?? 'current'),
    username: data?.username ?? fallbackUsername ?? '',
    realName: data?.realName,
    role: isAdmin ? 'admin' : 'user',
    status: 'approved',
    lastLoginAt: data?.loginTime,
    roles,
    menus,
  }
}

function mapPlatformUserToUser(data: PlatformUser, fallbackStatus: UserStatus = 'approved'): User {
  const approvalStatus = data.approvalCd === 'pending' || data.approvalCd === 'rejected' || data.approvalCd === 'approved'
    ? data.approvalCd
    : fallbackStatus
  const disabled = data.isValidCd === '0' || data.isValidCd === 'disabled'
  const roles = normalizeTextMap(data.roles)
  const menus = normalizeTextMap(data.menus)
  const roleIds = normalizeRoleIds(data.roles)

  return {
    id: String(data.id ?? data.userId ?? data.username ?? Date.now()),
    username: data.username ?? '',
    phone: data.tele,
    realName: data.realName,
    role: hasAdminRole(roles) ? 'admin' : 'user',
    status: disabled ? 'disabled' : approvalStatus,
    createdAt: data.approvalReqTime,
    lastLoginAt: data.approvalTime,
    remarks: data.remarks,
    roles,
    roleIds,
    menus,
  }
}

function toPlatformUserId(userId?: string): string | null {
  if (!userId) return null
  return /^\d+$/.test(userId) ? userId : null
}

function mapPlatformRoleToRoleOption(role: PlatformRole): RoleOption {
  return {
    id: String(role.id),
    code: role.code,
    name: role.name || role.code || String(role.id),
    description: role.description,
    isValidCd: role.isValidCd,
    sortNum: role.sortNum,
    isSys: role.isSys,
    userCount: role.userCount,
    permission: role.permission,
    selectedMenuIds: normalizeMenuIds(role.menus),
  }
}

function mapPlatformMenuToPermission(menu: PlatformMenu): MenuPermission {
  return {
    id: String(menu.id),
    name: menu.name || menu.code || String(menu.id),
    code: menu.code,
    parentId: menu.parentId === undefined || menu.parentId === null ? undefined : String(menu.parentId),
    typeCode: menu.typeCode,
    url: menu.url,
    children: (menu.children ?? []).map(mapPlatformMenuToPermission),
    funcList: (menu.funcList ?? []).map(mapPlatformMenuToPermission),
  }
}

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)
  const users = ref<User[]>([])
  const roles = ref<RoleOption[]>([])
  const menuTree = ref<MenuPermission[]>([])
  const sessionChecked = ref(false)
  const pendingUsers = computed(() => users.value.filter(user => user.status === 'pending'))
  const isLoggedIn = computed(() => Boolean(currentUser.value))
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  let bootstrapPromise: Promise<boolean> | null = null

  function persistCurrentUser(user: User | null) {
    if (user) {
      localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(PLATFORM_USER_KEY)
    }
  }

  async function login(username: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      const data = await platformAuthApi.login({ username, password })
      currentUser.value = mapAuthInfoToUser(data, username)
      persistCurrentUser(currentUser.value)
      sessionChecked.value = true
      return { success: true, message: '登录成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '登录失败' }
    }
  }

  function logout() {
    currentUser.value = null
    setPlatformToken(null)
    persistCurrentUser(null)
    sessionChecked.value = true
  }

  async function register(data: { username: string; password: string; phone: string; realName?: string }): Promise<{ success: boolean; message: string }> {
    try {
      await platformAuthApi.register({
        username: data.username,
        password: data.password,
        tele: data.phone,
        realName: data.realName || data.username,
      })
      return { success: true, message: '注册成功，请等待管理员审核' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '注册失败' }
    }
  }

  async function loadUsers(options: LoadUsersOptions = {}): Promise<LoadUsersResult> {
    try {
      const [approvedResponse, pendingResponse, disabledResponse] = await Promise.all([
        platformUserApi.search({
          pageNumber: options.approvedPageNumber ?? 1,
          pageSize: options.approvedPageSize ?? 10,
          approvalCd: 'approved',
          isValidCd: '1',
        }),
        platformUserApi.searchRegister({
          pageNumber: options.pendingPageNumber ?? 1,
          pageSize: options.pendingPageSize ?? 10,
          approvalCd: 'pending',
        }),
        platformUserApi.search({
          pageNumber: options.disabledPageNumber ?? 1,
          pageSize: options.disabledPageSize ?? 10,
          isValidCd: '0',
        }),
      ])
      const approved = (approvedResponse.data ?? []).map(user => mapPlatformUserToUser(user, 'approved'))
      const pending = (pendingResponse.data ?? []).map(user => mapPlatformUserToUser(user, 'pending'))
      const disabled = (disabledResponse.data ?? []).map(user => mapPlatformUserToUser(user, 'disabled'))

      const byId = new Map<string, User>()
      for (const user of [...approved, ...pending, ...disabled]) {
        byId.set(user.id, user)
      }
      users.value = Array.from(byId.values())

      return {
        success: true,
        message: '用户列表加载成功',
        pages: {
          approved: approvedResponse.page ?? null,
          pending: pendingResponse.page ?? null,
          disabled: disabledResponse.page ?? null,
        },
      }
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message || '用户列表加载失败',
        pages: { approved: null, pending: null, disabled: null },
      }
    }
  }

  function restoreFromStorage() {
    const saved = localStorage.getItem(PLATFORM_USER_KEY)
    if (!saved) return
    try {
      currentUser.value = JSON.parse(saved)
    } catch {
      currentUser.value = null
    }
  }

  async function bootstrapSession(force = false): Promise<boolean> {
    if (!force && sessionChecked.value) return isLoggedIn.value
    if (!force && bootstrapPromise) return bootstrapPromise

    bootstrapPromise = (async () => {
      const userId = toPlatformUserId(currentUser.value?.id)
      if (userId === null || !currentUser.value) {
        logout()
        sessionChecked.value = true
        return false
      }

      try {
        const detail = await platformUserApi.detail(userId)
        const detailId = detail.id ?? detail.userId ?? userId
        const mapped = mapPlatformUserToUser({ ...detail, id: detailId }, currentUser.value.status)
        currentUser.value = {
          ...currentUser.value,
          ...mapped,
          id: String(detailId),
          username: mapped.username || currentUser.value.username,
          phone: mapped.phone ?? currentUser.value.phone,
          realName: mapped.realName ?? currentUser.value.realName,
          remarks: mapped.remarks ?? currentUser.value.remarks,
          role: mapped.role,
          createdAt: mapped.createdAt ?? currentUser.value.createdAt,
          lastLoginAt: mapped.lastLoginAt ?? currentUser.value.lastLoginAt,
        }
        persistCurrentUser(currentUser.value)
        sessionChecked.value = true
        return true
      } catch {
        logout()
        sessionChecked.value = true
        return false
      }
    })()

    try {
      return await bootstrapPromise
    } finally {
      bootstrapPromise = null
    }
  }

  async function refreshCurrentUser(): Promise<{ success: boolean; message: string }> {
    const ok = await bootstrapSession(true)
    return ok
      ? { success: true, message: '用户详情刷新成功' }
      : { success: false, message: '用户详情刷新失败' }
  }

  async function updateCurrentProfile(data: { realName?: string; phone?: string; remarks?: string }): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(currentUser.value?.id)
    if (platformUserId === null || !currentUser.value) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.modify({
        id: platformUserId,
        realName: data.realName ?? '',
        tele: data.phone ?? '',
        remarks: data.remarks ?? '',
        sortNum: 999,
      })
      currentUser.value = {
        ...currentUser.value,
        realName: data.realName,
        phone: data.phone,
        remarks: data.remarks,
      }
      persistCurrentUser(currentUser.value)
      return { success: true, message: '个人信息修改成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '个人信息修改失败' }
    }
  }

  async function changeCurrentPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      await platformAuthApi.changePassword({ oldPassword, newPassword })
      return { success: true, message: '密码修改成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '密码修改失败' }
    }
  }

  async function loadRoles(options: LoadRolesOptions = {}): Promise<LoadRolesResult> {
    try {
      const keyword = options.keyword?.trim()
      const response = await platformRoleApi.search({
        pageNumber: options.pageNumber ?? 1,
        pageSize: options.pageSize ?? 10,
        ...(options.includeDisabled ? {} : { isValidCd: '1' }),
        ...(keyword ? { name: keyword } : {}),
      })
      roles.value = (response.data ?? []).map(mapPlatformRoleToRoleOption)
      return { success: true, message: '角色列表加载成功', page: response.page ?? null }
    } catch (error) {
      return { success: false, message: (error as Error).message || '角色列表加载失败', page: null }
    }
  }

  async function loadRoleDetail(roleId?: string): Promise<{ success: boolean; message: string; role: RoleOption | null }> {
    const platformRoleId = toPlatformUserId(roleId)
    if (platformRoleId === null) return { success: false, message: '角色ID无效', role: null }

    try {
      const detail = await platformRoleApi.detail(platformRoleId)
      const role = mapPlatformRoleToRoleOption(detail)
      const index = roles.value.findIndex(item => item.id === role.id)
      if (index >= 0) {
        roles.value[index] = { ...roles.value[index], ...role }
      }
      return { success: true, message: '角色详情加载成功', role }
    } catch (error) {
      return { success: false, message: (error as Error).message || '角色详情加载失败', role: null }
    }
  }

  async function loadMenuTree(_roleId?: string): Promise<{ success: boolean; message: string }> {
    try {
      const tree = await platformMenuApi.tree({})
      menuTree.value = (tree ?? []).map(mapPlatformMenuToPermission)
      return { success: true, message: '菜单权限加载成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '菜单权限加载失败' }
    }
  }

  async function saveRole(payload: {
    id?: string
    code?: string
    name?: string
    description?: string
    isValidCd?: string
    sortNum?: number
    isSys?: number
  }): Promise<{ success: boolean; message: string; roleId: string | null }> {
    try {
      const roleId = await platformRoleApi.save({
        id: payload.id ?? null,
        code: payload.code ?? '',
        name: payload.name ?? '',
        description: payload.description ?? '',
        isValidCd: payload.isValidCd ?? '1',
        sortNum: payload.sortNum ?? 999,
        isSys: payload.isSys ?? 0,
      })
      const next: RoleOption = {
        id: String(roleId ?? payload.id),
        code: payload.code,
        name: payload.name || payload.code || String(roleId ?? payload.id),
        description: payload.description,
        isValidCd: payload.isValidCd ?? '1',
        sortNum: payload.sortNum ?? 999,
        isSys: payload.isSys ?? 0,
      }
      const index = roles.value.findIndex(role => role.id === next.id)
      if (index >= 0) {
        roles.value[index] = { ...roles.value[index], ...next }
      } else {
        roles.value = [next, ...roles.value]
      }
      return { success: true, message: '角色保存成功', roleId: next.id }
    } catch (error) {
      return { success: false, message: (error as Error).message || '角色保存失败', roleId: null }
    }
  }

  async function deleteRole(roleId?: string): Promise<{ success: boolean; message: string }> {
    const platformRoleId = toPlatformUserId(roleId)
    if (platformRoleId === null) return { success: false, message: '角色ID无效' }

    try {
      await platformRoleApi.remove(platformRoleId)
      roles.value = roles.value.filter(role => role.id !== platformRoleId)
      return { success: true, message: '角色删除成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '角色删除失败' }
    }
  }

  async function saveRoleMenus(roleId?: string, menuIds: string[] = []): Promise<{ success: boolean; message: string }> {
    const platformRoleId = toPlatformUserId(roleId)
    if (platformRoleId === null) return { success: false, message: '角色ID无效' }

    try {
      await platformRoleApi.saveMenus(platformRoleId, menuIds)
      const role = roles.value.find(item => item.id === platformRoleId)
      if (role) role.selectedMenuIds = [...menuIds]
      return { success: true, message: '功能权限保存成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '功能权限保存失败' }
    }
  }

  async function getUserRoleIds(userId?: string): Promise<{ success: boolean; message: string; roleIds: string[] }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效', roleIds: [] }

    try {
      const detail = await platformUserApi.detail(platformUserId)
      const roleIds = normalizeRoleIds(detail.roles)
      const mapped = mapPlatformUserToUser(detail, 'approved')
      const index = users.value.findIndex(user => user.id === platformUserId)
      if (index >= 0) {
        users.value[index] = {
          ...users.value[index],
          ...mapped,
          id: users.value[index].id,
          roleIds,
        }
      }
      return { success: true, message: '用户角色加载成功', roleIds }
    } catch (error) {
      return { success: false, message: (error as Error).message || '用户角色加载失败', roleIds: [] }
    }
  }

  async function assignUserRoles(userId?: string, roleIds: string[] = []): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.saveRoles(platformUserId, roleIds)
      const user = users.value.find(item => item.id === userId)
      if (user) {
        user.roleIds = [...roleIds]
        user.roles = roles.value
          .filter(role => roleIds.includes(role.id))
          .reduce<Record<string, string>>((map, role) => {
            if (role.code) map[role.code] = role.name
            return map
          }, {})
        user.role = hasAdminRole(user.roles) ? 'admin' : 'user'
      }
      return { success: true, message: '角色分配成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '角色分配失败' }
    }
  }

  async function resetUserPassword(userId?: string): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.resetPassword(platformUserId)
      return { success: true, message: '密码重置成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '密码重置失败' }
    }
  }

  async function approveUser(userId?: string): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.registerApproval({
        userId: platformUserId,
        approvalCd: 'approved',
        approvalDesc: '',
        roleIds: [],
        sortNum: 999,
      })
      const user = users.value.find(item => item.id === userId)
      if (user) user.status = 'approved'
      return { success: true, message: '审核通过成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '审核通过失败' }
    }
  }

  async function rejectUser(userId?: string): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.registerApproval({
        userId: platformUserId,
        approvalCd: 'rejected',
        approvalDesc: '',
        roleIds: [],
        sortNum: 999,
      })
      const user = users.value.find(item => item.id === userId)
      if (user) user.status = 'rejected'
      return { success: true, message: '拒绝审核成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '拒绝审核失败' }
    }
  }

  async function disableUser(userId?: string): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.setValid(platformUserId)
      const user = users.value.find(item => item.id === userId)
      if (user) user.status = 'disabled'
      return { success: true, message: '用户禁用成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '用户禁用失败' }
    }
  }

  async function enableUser(userId?: string): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.setValid(platformUserId)
      const user = users.value.find(item => item.id === userId)
      if (user) user.status = 'approved'
      return { success: true, message: '用户启用成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '用户启用失败' }
    }
  }

  async function deleteUser(userId?: string): Promise<{ success: boolean; message: string }> {
    const platformUserId = toPlatformUserId(userId)
    if (platformUserId === null) return { success: false, message: '用户ID无效' }

    try {
      await platformUserApi.remove(platformUserId)
      users.value = users.value.filter(user => user.id !== userId)
      return { success: true, message: '用户删除成功' }
    } catch (error) {
      return { success: false, message: (error as Error).message || '用户删除失败' }
    }
  }

  restoreFromStorage()

  return {
    currentUser,
    users,
    roles,
    menuTree,
    sessionChecked,
    isLoggedIn,
    isAdmin,
    pendingUsers,
    bootstrapSession,
    refreshCurrentUser,
    login,
    logout,
    register,
    loadUsers,
    updateCurrentProfile,
    changeCurrentPassword,
    loadRoles,
    loadRoleDetail,
    loadMenuTree,
    saveRole,
    deleteRole,
    saveRoleMenus,
    getUserRoleIds,
    assignUserRoles,
    resetUserPassword,
    approveUser,
    rejectUser,
    disableUser,
    enableUser,
    deleteUser,
  }
})
