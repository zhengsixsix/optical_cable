<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { Card, CardHeader, CardContent, Button } from '@/shared/components/base'
import { X, UserCheck, UserX, Trash2, Ban, CheckCircle, RefreshCw, KeyRound, ShieldCheck } from 'lucide-vue-next'
import type { User, UserStatus } from '@/stores/user'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const userStore = useUserStore()
const appStore = useAppStore()
const isLoading = ref(false)
const actionUserId = ref<string | null>(null)
const roleEditorUser = ref<User | null>(null)
const selectedRoleIds = ref<string[]>([])
const isRoleEditorLoading = ref(false)
const isSavingRoles = ref(false)

// 按状态分组的用户列表
const pendingUsers = computed(() => 
  userStore.users.filter(u => u.status === 'pending')
)

const approvedUsers = computed(() => 
  userStore.users.filter(u => u.status === 'approved')
)

const disabledUsers = computed(() => 
  userStore.users.filter(u => u.status === 'disabled' || u.status === 'rejected')
)

const roleOptions = computed(() => userStore.roles)

const getStatusText = (status: UserStatus) => {
  const map: Record<UserStatus, string> = {
    pending: '待审批',
    approved: '已启用',
    rejected: '已拒绝',
    disabled: '已禁用',
  }
  return map[status]
}

const getStatusClass = (status: UserStatus) => {
  const map: Record<UserStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    disabled: 'bg-gray-100 text-gray-700',
  }
  return map[status]
}

const formatDate = (date?: Date | string) => {
  if (!date) return '-'
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function loadUsers() {
  isLoading.value = true
  try {
    const result = await userStore.loadUsers()
    if (!result.success) {
      appStore.showNotification({ type: 'error', message: result.message })
    }
  } finally {
    isLoading.value = false
  }
}

async function loadRoles() {
  const result = await userStore.loadRoles()
  if (!result.success) {
    appStore.showNotification({ type: 'error', message: result.message })
  }
}

async function runUserAction(userId: string, action: () => Promise<{ success: boolean; message: string }>) {
  actionUserId.value = userId
  try {
    const result = await action()
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.message })
    if (result.success) {
      await loadUsers()
    }
  } finally {
    actionUserId.value = null
  }
}

const handleApprove = (userId: string) => {
  runUserAction(userId, () => userStore.approveUser(userId))
}

const handleReject = (userId: string) => {
  runUserAction(userId, () => userStore.rejectUser(userId))
}

const handleDisable = (userId: string) => {
  runUserAction(userId, () => userStore.disableUser(userId))
}

const handleEnable = (userId: string) => {
  runUserAction(userId, () => userStore.enableUser(userId))
}

const handleDelete = (userId: string) => {
  if (confirm('确定要删除该用户吗？此操作不可恢复。')) {
    runUserAction(userId, () => userStore.deleteUser(userId))
  }
}

const closeRoleEditor = () => {
  roleEditorUser.value = null
  selectedRoleIds.value = []
}

const toggleRole = (roleId: string) => {
  if (selectedRoleIds.value.includes(roleId)) {
    selectedRoleIds.value = selectedRoleIds.value.filter(id => id !== roleId)
  } else {
    selectedRoleIds.value = [...selectedRoleIds.value, roleId]
  }
}

const handleOpenRoleEditor = async (user: User) => {
  roleEditorUser.value = user
  selectedRoleIds.value = []
  actionUserId.value = user.id
  isRoleEditorLoading.value = true
  try {
    if (roleOptions.value.length === 0) {
      await loadRoles()
    }
    const result = await userStore.getUserRoleIds(user.id)
    if (!result.success) {
      appStore.showNotification({ type: 'error', message: result.message })
      closeRoleEditor()
      return
    }
    selectedRoleIds.value = result.roleIds
  } finally {
    isRoleEditorLoading.value = false
    actionUserId.value = null
  }
}

const handleSaveRoles = async () => {
  if (!roleEditorUser.value) return
  isSavingRoles.value = true
  try {
    const result = await userStore.assignUserRoles(roleEditorUser.value.id, selectedRoleIds.value)
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.message })
    if (result.success) {
      closeRoleEditor()
      await loadUsers()
    }
  } finally {
    isSavingRoles.value = false
  }
}

const handleResetPassword = (userId: string) => {
  if (confirm('确定要重置该用户密码吗？')) {
    runUserAction(userId, () => userStore.resetUserPassword(userId))
  }
}

watch(() => props.visible, (visible) => {
  if (!visible) {
    closeRoleEditor()
    return
  }
  loadUsers()
  loadRoles()
})
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[960px] max-w-[calc(100vw-32px)] max-h-[84vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <span class="font-semibold text-lg">账户管理</span>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" :disabled="isLoading" @click="loadUsers">
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-0">
          <div v-if="isLoading" class="px-4 py-6 text-center text-gray-400 text-sm">
            正在加载线上用户...
          </div>
          <!-- 待审批用户 -->
          <div v-if="!isLoading && pendingUsers.length > 0" class="border-b">
            <div class="px-4 py-2 bg-yellow-50 text-yellow-800 font-medium text-sm flex items-center gap-2">
              <span class="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
              待审批 ({{ pendingUsers.length }})
            </div>
            <div class="divide-y">
              <div 
                v-for="user in pendingUsers" 
                :key="user.id"
                class="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-3">
                    <span class="font-medium">{{ user.username }}</span>
                    <span :class="['text-xs px-2 py-0.5 rounded', getStatusClass(user.status)]">
                      {{ getStatusText(user.status) }}
                    </span>
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    手机: {{ user.phone }} | 注册时间: {{ formatDate(user.createdAt) }}
                  </div>
                </div>
                <div class="flex gap-2">
                  <Button size="sm" variant="default" :disabled="actionUserId === user.id" @click="handleApprove(user.id)">
                    <UserCheck class="w-4 h-4 mr-1" /> 通过
                  </Button>
                  <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleReject(user.id)">
                    <UserX class="w-4 h-4 mr-1" /> 拒绝
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- 已启用用户 -->
          <div v-if="!isLoading" class="border-b">
            <div class="px-4 py-2 bg-green-50 text-green-800 font-medium text-sm">
              已启用用户 ({{ approvedUsers.length }})
            </div>
            <div v-if="approvedUsers.length === 0" class="px-4 py-6 text-center text-gray-400 text-sm">
              暂无已启用用户
            </div>
            <div v-else class="divide-y">
              <div 
                v-for="user in approvedUsers" 
                :key="user.id"
                class="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-3">
                    <span class="font-medium">{{ user.username }}</span>
                    <span :class="['text-xs px-2 py-0.5 rounded', getStatusClass(user.status)]">
                      {{ getStatusText(user.status) }}
                    </span>
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    手机: {{ user.phone }} | 
                    最后登录: {{ user.lastLoginAt ? formatDate(user.lastLoginAt) : '从未登录' }}
                  </div>
                </div>
                <div class="flex gap-2 flex-wrap justify-end">
                  <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleOpenRoleEditor(user)">
                    <ShieldCheck class="w-4 h-4 mr-1" /> 角色
                  </Button>
                  <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleResetPassword(user.id)">
                    <KeyRound class="w-4 h-4 mr-1" /> 重置密码
                  </Button>
                  <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleDisable(user.id)">
                    <Ban class="w-4 h-4 mr-1" /> 禁用
                  </Button>
                  <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleDelete(user.id)">
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- 已禁用/拒绝用户 -->
          <div v-if="!isLoading">
            <div class="px-4 py-2 bg-gray-100 text-gray-700 font-medium text-sm">
              已禁用/拒绝 ({{ disabledUsers.length }})
            </div>
            <div v-if="disabledUsers.length === 0" class="px-4 py-6 text-center text-gray-400 text-sm">
              暂无已禁用用户
            </div>
            <div v-else class="divide-y">
              <div 
                v-for="user in disabledUsers" 
                :key="user.id"
                class="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-3">
                    <span class="font-medium text-gray-500">{{ user.username }}</span>
                    <span :class="['text-xs px-2 py-0.5 rounded', getStatusClass(user.status)]">
                      {{ getStatusText(user.status) }}
                    </span>
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    手机: {{ user.phone }}
                  </div>
                </div>
                <div class="flex gap-2 flex-wrap justify-end">
                  <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleOpenRoleEditor(user)">
                    <ShieldCheck class="w-4 h-4 mr-1" /> 角色
                  </Button>
                  <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleResetPassword(user.id)">
                    <KeyRound class="w-4 h-4 mr-1" /> 重置密码
                  </Button>
                  <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleEnable(user.id)">
                    <CheckCircle class="w-4 h-4 mr-1" /> 启用
                  </Button>
                  <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleDelete(user.id)">
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div
        v-if="roleEditorUser"
        class="absolute inset-0 bg-black/30 flex items-center justify-center z-[1001]"
        @click.self="closeRoleEditor"
      >
        <Card class="w-[520px] max-w-[calc(100vw-32px)] max-h-[70vh] flex flex-col bg-white shadow-2xl">
          <CardHeader class="flex items-center justify-between border-b shrink-0">
            <span class="font-semibold text-base">分配角色 - {{ roleEditorUser.username }}</span>
            <Button variant="ghost" size="sm" @click="closeRoleEditor">
              <X class="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent class="flex-1 overflow-auto p-4">
            <div v-if="isRoleEditorLoading" class="py-8 text-center text-sm text-gray-400">
              正在加载用户角色...
            </div>
            <div v-else-if="roleOptions.length === 0" class="py-8 text-center text-sm text-gray-400">
              暂无可分配角色
            </div>
            <div v-else class="space-y-2">
              <label
                v-for="role in roleOptions"
                :key="role.id"
                class="flex items-start gap-3 rounded border px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  class="mt-1"
                  :checked="selectedRoleIds.includes(role.id)"
                  @change="toggleRole(role.id)"
                >
                <span class="min-w-0">
                  <span class="block text-sm font-medium text-gray-800">{{ role.name }}</span>
                  <span class="block text-xs text-gray-500">
                    {{ role.code || role.id }}<template v-if="role.description"> · {{ role.description }}</template>
                  </span>
                </span>
              </label>
            </div>
          </CardContent>
          <div class="flex items-center justify-end gap-2 border-t px-4 py-3">
            <Button variant="outline" :disabled="isSavingRoles" @click="closeRoleEditor">取消</Button>
            <Button :disabled="isSavingRoles || isRoleEditorLoading" @click="handleSaveRoles">
              <ShieldCheck class="w-4 h-4 mr-1" />
              保存角色
            </Button>
          </div>
        </Card>
      </div>
    </div>
  </Teleport>
</template>
