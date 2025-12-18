import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { defaultAdminUser, mockUsers } from '@/data/mockData'

// 用户角色类型
export type UserRole = 'admin' | 'user'

// 用户状态
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'disabled'

// 用户信息接口
export interface User {
  id: string
  username: string
  password: string
  phone: string
  role: UserRole
  status: UserStatus
  createdAt: Date
  lastLoginAt?: Date
}

// 默认管理员账户 - 从集中数据文件导入
const defaultAdmin: User = defaultAdminUser as User

export const useUserStore = defineStore('user', () => {
  // 当前登录用户
  const currentUser = ref<User | null>(null)
  
  // 所有用户列表 - 从集中数据文件导入
  const users = ref<User[]>([defaultAdmin, ...mockUsers.map(u => u as User)])

  // 是否已登录
  const isLoggedIn = computed(() => currentUser.value !== null)
  
  // 是否是管理员
  const isAdmin = computed(() => currentUser.value?.role === 'admin')

  // 待审批用户列表
  const pendingUsers = computed(() => 
    users.value.filter(u => u.status === 'pending')
  )

  // 登录
  function login(username: string, password: string): { success: boolean; message: string } {
    const user = users.value.find(u => u.username === username)
    
    if (!user) {
      return { success: false, message: '用户不存在' }
    }
    
    if (user.password !== password) {
      return { success: false, message: '密码错误' }
    }
    
    if (user.status === 'pending') {
      return { success: false, message: '账户待审批，请联系管理员' }
    }
    
    if (user.status === 'rejected') {
      return { success: false, message: '账户申请已被拒绝' }
    }
    
    if (user.status === 'disabled') {
      return { success: false, message: '账户已被禁用' }
    }
    
    // 更新最后登录时间
    user.lastLoginAt = new Date()
    currentUser.value = user
    
    // 保存到localStorage
    localStorage.setItem('currentUser', JSON.stringify(user))
    
    return { success: true, message: '登录成功' }
  }

  // 登出
  function logout() {
    currentUser.value = null
    localStorage.removeItem('currentUser')
  }

  // 注册
  function register(data: { username: string; password: string; phone: string }): { success: boolean; message: string } {
    // 检查用户名是否已存在
    if (users.value.some(u => u.username === data.username)) {
      return { success: false, message: '用户名已存在' }
    }
    
    // 检查手机号是否已注册
    if (users.value.some(u => u.phone === data.phone)) {
      return { success: false, message: '手机号已被注册' }
    }
    
    const newUser: User = {
      id: `user-${Date.now()}`,
      username: data.username,
      password: data.password,
      phone: data.phone,
      role: 'user',
      status: 'pending',
      createdAt: new Date(),
    }
    
    users.value.push(newUser)
    saveUsersToStorage()
    
    return { success: true, message: '注册成功，请等待管理员审批' }
  }

  // 审批用户
  function approveUser(userId: string) {
    const user = users.value.find(u => u.id === userId)
    if (user) {
      user.status = 'approved'
      saveUsersToStorage()
    }
  }

  // 拒绝用户
  function rejectUser(userId: string) {
    const user = users.value.find(u => u.id === userId)
    if (user) {
      user.status = 'rejected'
      saveUsersToStorage()
    }
  }

  // 禁用用户
  function disableUser(userId: string) {
    const user = users.value.find(u => u.id === userId)
    if (user && user.role !== 'admin') {
      user.status = 'disabled'
      saveUsersToStorage()
    }
  }

  // 启用用户
  function enableUser(userId: string) {
    const user = users.value.find(u => u.id === userId)
    if (user) {
      user.status = 'approved'
      saveUsersToStorage()
    }
  }

  // 删除用户
  function deleteUser(userId: string) {
    const index = users.value.findIndex(u => u.id === userId)
    if (index > -1 && users.value[index].role !== 'admin') {
      users.value.splice(index, 1)
      saveUsersToStorage()
    }
  }

  // 保存用户列表到localStorage
  function saveUsersToStorage() {
    localStorage.setItem('users', JSON.stringify(users.value))
  }

  // 从localStorage恢复数据
  function restoreFromStorage() {
    const savedUsers = localStorage.getItem('users')
    if (savedUsers) {
      try {
        const parsed = JSON.parse(savedUsers)
        // 确保管理员账户始终存在
        const hasAdmin = parsed.some((u: User) => u.username === 'admin')
        if (!hasAdmin) {
          parsed.unshift(defaultAdmin)
        }
        users.value = parsed
      } catch (e) {
        console.error('恢复用户数据失败:', e)
      }
    }
    
    const savedCurrentUser = localStorage.getItem('currentUser')
    if (savedCurrentUser) {
      try {
        currentUser.value = JSON.parse(savedCurrentUser)
      } catch (e) {
        console.error('恢复当前用户失败:', e)
      }
    }
  }

  // 初始化时恢复数据
  restoreFromStorage()

  return {
    currentUser,
    users,
    isLoggedIn,
    isAdmin,
    pendingUsers,
    login,
    logout,
    register,
    approveUser,
    rejectUser,
    disableUser,
    enableUser,
    deleteUser,
  }
})
