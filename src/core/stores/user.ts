import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logger } from '@/shared/utils'

/**
 * 用户 Store
 * 管理用户认证和权限
 */

export type UserRole = 'admin' | 'user' | 'guest'

export interface User {
  id: string
  username: string
  role: UserRole
  displayName?: string
}

export const useUserStore = defineStore('user', () => {
  // 当前用户
  const currentUser = ref<User | null>(null)

  // 登录状态
  const isLoggedIn = computed(() => currentUser.value !== null)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const username = computed(() => currentUser.value?.username || '')

  // 登录
  function login(user: User) {
    currentUser.value = user
    logger.info(`用户登录: ${user.username}`)
  }

  // 登出
  function logout() {
    const name = currentUser.value?.username
    currentUser.value = null
    if (name) {
      logger.info(`用户登出: ${name}`)
    }
  }

  // 更新用户信息
  function updateUser(updates: Partial<User>) {
    if (currentUser.value) {
      Object.assign(currentUser.value, updates)
    }
  }

  // 检查权限
  function hasPermission(permission: string): boolean {
    if (!currentUser.value) return false
    if (currentUser.value.role === 'admin') return true

    // 可以扩展具体权限逻辑
    return true
  }

  return {
    // 状态
    currentUser,
    // 计算属性
    isLoggedIn,
    isAdmin,
    username,
    // 方法
    login,
    logout,
    updateUser,
    hasPermission,
  }
})
