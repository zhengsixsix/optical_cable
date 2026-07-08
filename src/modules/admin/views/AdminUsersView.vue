<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Ban, CheckCircle, KeyRound, RefreshCw, ShieldCheck, Trash2, UserCheck, UserX, Users } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import AdminPagination from '../components/AdminPagination.vue'
import { useAppStore } from '@/stores/app'
import { useUserStore, type User, type UserStatus } from '@/stores/user'

type UserBucket = 'pending' | 'approved' | 'disabled'

const userStore = useUserStore()
const appStore = useAppStore()
const isLoading = ref(false)
const actionUserId = ref<string | null>(null)
const activeBucket = ref<UserBucket>('approved')
const selectedUserId = ref<string | null>(null)
const selectedRoleIds = ref<string[]>([])
const isRoleDialogOpen = ref(false)
const isRoleLoading = ref(false)
const isSavingRoles = ref(false)
const pendingPageNumber = ref(1)
const pendingPageSize = ref(10)
const pendingTotal = ref(0)
const approvedPageNumber = ref(1)
const approvedPageSize = ref(10)
const approvedTotal = ref(0)
const disabledPageNumber = ref(1)
const disabledPageSize = ref(10)
const disabledTotal = ref(0)
const rolePageNumber = ref(1)
const rolePageSize = ref(10)
const roleTotal = ref(0)

const pendingUsers = computed(() => userStore.users.filter(user => user.status === 'pending'))
const approvedUsers = computed(() => userStore.users.filter(user => user.status === 'approved'))
const disabledUsers = computed(() => userStore.users.filter(user => user.status === 'disabled' || user.status === 'rejected'))
const roleOptions = computed(() => userStore.roles)
const selectedUser = computed(() => userStore.users.find(user => user.id === selectedUserId.value) ?? null)

const buckets = computed(() => [
  { key: 'pending' as const, label: '待审批', count: pendingTotal.value, description: '注册后等待处理的账户' },
  { key: 'approved' as const, label: '已启用', count: approvedTotal.value, description: '当前可登录平台的账户' },
  { key: 'disabled' as const, label: '禁用/拒绝', count: disabledTotal.value, description: '已禁用或审核拒绝的账户' },
])
const activeBucketLabel = computed(() => buckets.value.find(item => item.key === activeBucket.value)?.label ?? '-')
const activeUsers = computed(() => {
  if (activeBucket.value === 'pending') return pendingUsers.value
  if (activeBucket.value === 'disabled') return disabledUsers.value
  return approvedUsers.value
})
const activeTotal = computed(() => {
  if (activeBucket.value === 'pending') return pendingTotal.value
  if (activeBucket.value === 'disabled') return disabledTotal.value
  return approvedTotal.value
})
const activePageNumber = computed(() => {
  if (activeBucket.value === 'pending') return pendingPageNumber.value
  if (activeBucket.value === 'disabled') return disabledPageNumber.value
  return approvedPageNumber.value
})
const activePageSize = computed(() => {
  if (activeBucket.value === 'pending') return pendingPageSize.value
  if (activeBucket.value === 'disabled') return disabledPageSize.value
  return approvedPageSize.value
})

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
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
    disabled: 'bg-slate-100 text-slate-600 ring-slate-200',
  }
  return map[status]
}

const formatDate = (date?: Date | string) => {
  if (!date) return '-'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const roleSummary = (user: User) => {
  const roles = Object.values(user.roles ?? {}).filter(Boolean)
  if (roles.length > 0) return roles.join('、')
  return user.role === 'admin' ? '管理员' : '普通用户'
}

async function loadUsers() {
  isLoading.value = true
  try {
    const result = await userStore.loadUsers({
      pendingPageNumber: pendingPageNumber.value,
      pendingPageSize: pendingPageSize.value,
      approvedPageNumber: approvedPageNumber.value,
      approvedPageSize: approvedPageSize.value,
      disabledPageNumber: disabledPageNumber.value,
      disabledPageSize: disabledPageSize.value,
    })
    if (!result.success) {
      appStore.showNotification({ type: 'error', message: result.message })
    }
    pendingTotal.value = Number(result.pages.pending?.dataTotal ?? pendingUsers.value.length)
    approvedTotal.value = Number(result.pages.approved?.dataTotal ?? approvedUsers.value.length)
    disabledTotal.value = Number(result.pages.disabled?.dataTotal ?? disabledUsers.value.length)
    if (result.pages.pending?.pageNumber) pendingPageNumber.value = Number(result.pages.pending.pageNumber)
    if (result.pages.pending?.pageSize) pendingPageSize.value = Number(result.pages.pending.pageSize)
    if (result.pages.approved?.pageNumber) approvedPageNumber.value = Number(result.pages.approved.pageNumber)
    if (result.pages.approved?.pageSize) approvedPageSize.value = Number(result.pages.approved.pageSize)
    if (result.pages.disabled?.pageNumber) disabledPageNumber.value = Number(result.pages.disabled.pageNumber)
    if (result.pages.disabled?.pageSize) disabledPageSize.value = Number(result.pages.disabled.pageSize)
    if (selectedUserId.value && !userStore.users.some(user => user.id === selectedUserId.value)) {
      selectedUserId.value = null
      isRoleDialogOpen.value = false
    }
  } finally {
    isLoading.value = false
  }
}

async function loadRoles() {
  const result = await userStore.loadRoles({
    pageNumber: rolePageNumber.value,
    pageSize: rolePageSize.value,
  })
  if (!result.success) {
    appStore.showNotification({ type: 'error', message: result.message })
  }
  roleTotal.value = Number(result.page?.dataTotal ?? roleOptions.value.length)
  if (result.page?.pageNumber) rolePageNumber.value = Number(result.page.pageNumber)
  if (result.page?.pageSize) rolePageSize.value = Number(result.page.pageSize)
}

async function loadInitialData() {
  await Promise.all([loadUsers(), loadRoles()])
}

function changeBucket(bucket: UserBucket) {
  activeBucket.value = bucket
}

function changeActivePage(page: number) {
  if (activeBucket.value === 'pending') pendingPageNumber.value = page
  else if (activeBucket.value === 'disabled') disabledPageNumber.value = page
  else approvedPageNumber.value = page
  void loadUsers()
}

function changeActivePageSize(size: number) {
  if (activeBucket.value === 'pending') {
    pendingPageSize.value = size
    pendingPageNumber.value = 1
  } else if (activeBucket.value === 'disabled') {
    disabledPageSize.value = size
    disabledPageNumber.value = 1
  } else {
    approvedPageSize.value = size
    approvedPageNumber.value = 1
  }
  void loadUsers()
}

function changeRolePage(page: number) {
  rolePageNumber.value = page
  void loadRoles()
}

function changeRolePageSize(size: number) {
  rolePageSize.value = size
  rolePageNumber.value = 1
  void loadRoles()
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

async function openRoleDialog(user: User) {
  selectedUserId.value = user.id
  selectedRoleIds.value = []
  isRoleDialogOpen.value = true
  isRoleLoading.value = true
  try {
    if (roleOptions.value.length === 0) {
      await loadRoles()
    }
    const result = await userStore.getUserRoleIds(user.id)
    if (!result.success) {
      appStore.showNotification({ type: 'error', message: result.message })
      return
    }
    selectedRoleIds.value = result.roleIds
  } finally {
    isRoleLoading.value = false
  }
}

function closeRoleDialog() {
  if (isSavingRoles.value) return
  isRoleDialogOpen.value = false
}

function toggleRole(roleId: string) {
  selectedRoleIds.value = selectedRoleIds.value.includes(roleId)
    ? selectedRoleIds.value.filter(id => id !== roleId)
    : [...selectedRoleIds.value, roleId]
}

async function handleSaveRoles() {
  if (!selectedUser.value) return
  isSavingRoles.value = true
  try {
    const result = await userStore.assignUserRoles(selectedUser.value.id, selectedRoleIds.value)
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.message })
    if (result.success) {
      isRoleDialogOpen.value = false
      await loadUsers()
    }
  } finally {
    isSavingRoles.value = false
  }
}

const handleApprove = (userId: string) => runUserAction(userId, () => userStore.approveUser(userId))
const handleReject = (userId: string) => runUserAction(userId, () => userStore.rejectUser(userId))
const handleDisable = (userId: string) => runUserAction(userId, () => userStore.disableUser(userId))
const handleEnable = (userId: string) => runUserAction(userId, () => userStore.enableUser(userId))

function handleDelete(userId: string) {
  if (confirm('确定要删除该用户吗？此操作不可恢复。')) {
    void runUserAction(userId, () => userStore.deleteUser(userId))
  }
}

function handleResetPassword(userId: string) {
  if (confirm('确定要重置该用户密码吗？')) {
    void runUserAction(userId, () => userStore.resetUserPassword(userId))
  }
}

onMounted(() => {
  void loadInitialData()
})
</script>

<template>
  <section class="space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">账户管理</h2>
        <p class="mt-1 text-sm text-slate-500">左侧选择账户状态，右侧处理当前状态下的账户。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadInitialData">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="admin-master-detail-layout admin-wide-master">
      <aside class="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Users class="h-4 w-4 text-cyan-700" />
            账户状态
          </div>
          <p class="mt-1 text-xs text-slate-500">按状态切换右侧账户列表</p>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-2">
          <button
            v-for="bucket in buckets"
            :key="bucket.key"
            type="button"
            class="mb-1 flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
            :class="activeBucket === bucket.key ? 'bg-cyan-50 font-medium text-cyan-800 ring-1 ring-cyan-100' : 'text-slate-600'"
            @click="changeBucket(bucket.key)"
          >
            <span class="min-w-0">
              <span class="block truncate">{{ bucket.label }}</span>
              <span class="mt-0.5 block truncate text-xs text-slate-400">{{ bucket.description }}</span>
            </span>
            <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ bucket.count }}</span>
          </button>
        </div>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">账户列表</h3>
            <p class="mt-1 text-xs text-slate-500">当前状态：{{ activeBucketLabel }}，共 {{ activeTotal }} 条。</p>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full min-w-[1080px] border-separate border-spacing-0 text-left text-sm">
            <thead class="sticky top-0 z-[1] bg-slate-50 text-xs text-slate-500">
              <tr>
                <th class="border-b border-slate-200 px-4 py-2.5 font-medium">账户</th>
                <th class="border-b border-slate-200 px-4 py-2.5 font-medium">手机</th>
                <th class="border-b border-slate-200 px-4 py-2.5 font-medium">角色</th>
                <th class="border-b border-slate-200 px-4 py-2.5 font-medium">时间</th>
                <th class="w-24 border-b border-slate-200 px-4 py-2.5 font-medium">状态</th>
                <th class="w-[340px] border-b border-slate-200 px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in activeUsers" :key="user.id" class="h-14 hover:bg-slate-50">
                <td class="border-b border-slate-100 px-4 py-2 align-middle font-medium text-slate-900">{{ user.username }}</td>
                <td class="border-b border-slate-100 px-4 py-2 align-middle text-slate-600">{{ user.phone || '-' }}</td>
                <td class="border-b border-slate-100 px-4 py-2 align-middle text-slate-600">{{ roleSummary(user) }}</td>
                <td class="border-b border-slate-100 px-4 py-2 align-middle text-xs text-slate-500">
                  {{ activeBucket === 'pending' ? formatDate(user.createdAt) : formatDate(user.lastLoginAt || user.createdAt) }}
                </td>
                <td class="border-b border-slate-100 px-4 py-2 align-middle">
                  <span :class="['rounded-full px-2 py-0.5 text-xs ring-1', getStatusClass(user.status)]">
                    {{ getStatusText(user.status) }}
                  </span>
                </td>
                <td class="border-b border-slate-100 px-4 py-2 align-middle">
                  <div class="admin-table-actions">
                    <template v-if="user.status === 'pending'">
                      <Button size="sm" :disabled="actionUserId === user.id" @click="handleApprove(user.id)">
                        <UserCheck class="mr-1 h-4 w-4" />通过
                      </Button>
                      <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleReject(user.id)">
                        <UserX class="mr-1 h-4 w-4" />拒绝
                      </Button>
                    </template>
                    <template v-else>
                      <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="openRoleDialog(user)">
                        <ShieldCheck class="mr-1 h-4 w-4" />角色
                      </Button>
                      <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleResetPassword(user.id)">
                        <KeyRound class="mr-1 h-4 w-4" />重置
                      </Button>
                      <Button
                        v-if="user.status === 'approved'"
                        size="sm"
                        variant="outline"
                        :disabled="actionUserId === user.id"
                        @click="handleDisable(user.id)"
                      >
                        <Ban class="mr-1 h-4 w-4" />禁用
                      </Button>
                      <Button
                        v-else
                        size="sm"
                        variant="outline"
                        :disabled="actionUserId === user.id"
                        @click="handleEnable(user.id)"
                      >
                        <CheckCircle class="mr-1 h-4 w-4" />启用
                      </Button>
                      <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleDelete(user.id)">
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="isLoading" class="px-4 py-8 text-center text-sm text-slate-400">正在加载账户...</div>
          <div v-else-if="activeUsers.length === 0" class="px-4 py-12 text-center text-sm text-slate-400">暂无账户</div>
        </div>

        <AdminPagination
          :page-number="activePageNumber"
          :page-size="activePageSize"
          :total="activeTotal"
          :loading="isLoading"
          @change-page="changeActivePage"
          @change-page-size="changeActivePageSize"
        />
      </section>
    </div>

    <div
      v-if="isRoleDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      @click.self="closeRoleDialog"
    >
      <div class="admin-form-dialog flex max-h-full flex-col overflow-hidden rounded-md bg-white shadow-xl">
        <div class="border-b border-slate-200 px-5 py-4">
          <h3 class="text-base font-semibold text-slate-950">分配角色</h3>
          <p class="mt-1 text-xs text-slate-500">{{ selectedUser?.username || '-' }} · {{ selectedUser?.phone || '-' }}</p>
        </div>

        <div class="min-h-0 overflow-auto px-5 py-4">
          <div v-if="isRoleLoading" class="py-8 text-center text-sm text-slate-400">正在加载角色...</div>
          <div v-else-if="roleOptions.length === 0" class="py-8 text-center text-sm text-slate-400">暂无可分配角色</div>
          <div v-else class="space-y-2">
            <label
              v-for="role in roleOptions"
              :key="role.id"
              class="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                class="mt-1"
                :checked="selectedRoleIds.includes(role.id)"
                @change="toggleRole(role.id)"
              >
              <span class="min-w-0">
                <span class="block text-sm font-medium text-slate-800">{{ role.name }}</span>
                <span class="block text-xs text-slate-500">
                  {{ role.code || role.id }}<template v-if="role.description"> · {{ role.description }}</template>
                </span>
              </span>
            </label>
          </div>
          <AdminPagination
            class="mt-3"
            :page-number="rolePageNumber"
            :page-size="rolePageSize"
            :total="roleTotal"
            :loading="isRoleLoading"
            @change-page="changeRolePage"
            @change-page-size="changeRolePageSize"
          />
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button variant="outline" :disabled="isSavingRoles" @click="closeRoleDialog">取消</Button>
          <Button :disabled="isSavingRoles || isRoleLoading" @click="handleSaveRoles">
            <ShieldCheck class="mr-2 h-4 w-4" />
            保存角色
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
