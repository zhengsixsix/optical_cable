<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Ban, CheckCircle, KeyRound, RefreshCw, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-vue-next'
import { Button } from '@/shared/components/base'
import { useAppStore } from '@/stores/app'
import { useUserStore, type User, type UserStatus } from '@/stores/user'

const userStore = useUserStore()
const appStore = useAppStore()
const isLoading = ref(false)
const actionUserId = ref<string | null>(null)
const selectedUserId = ref<string | null>(null)
const selectedRoleIds = ref<string[]>([])
const isRoleLoading = ref(false)
const isSavingRoles = ref(false)

const pendingUsers = computed(() => userStore.users.filter(user => user.status === 'pending'))
const approvedUsers = computed(() => userStore.users.filter(user => user.status === 'approved'))
const disabledUsers = computed(() => userStore.users.filter(user => user.status === 'disabled' || user.status === 'rejected'))
const roleOptions = computed(() => userStore.roles)
const selectedUser = computed(() => userStore.users.find(user => user.id === selectedUserId.value) ?? null)

const metrics = computed(() => [
  { label: '全部账户', value: userStore.users.length, tone: 'text-slate-950' },
  { label: '待审批', value: pendingUsers.value.length, tone: 'text-amber-700' },
  { label: '已启用', value: approvedUsers.value.length, tone: 'text-emerald-700' },
  { label: '禁用/拒绝', value: disabledUsers.value.length, tone: 'text-slate-600' },
])

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
    const result = await userStore.loadUsers()
    if (!result.success) {
      appStore.showNotification({ type: 'error', message: result.message })
    }
    if (!selectedUserId.value && userStore.users.length > 0) {
      await selectUser(userStore.users[0])
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

async function loadInitialData() {
  await Promise.all([loadUsers(), loadRoles()])
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

async function selectUser(user: User) {
  selectedUserId.value = user.id
  selectedRoleIds.value = []
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
    runUserAction(userId, () => userStore.deleteUser(userId))
  }
}

function handleResetPassword(userId: string) {
  if (confirm('确定要重置该用户密码吗？')) {
    runUserAction(userId, () => userStore.resetUserPassword(userId))
  }
}

onMounted(() => {
  void loadInitialData()
})
</script>

<template>
  <section class="p-6 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">账户管理</h2>
        <p class="mt-1 text-sm text-slate-500">用户审批、状态维护、密码重置和角色分配全部在页面内完成。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadInitialData">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="grid grid-cols-4 gap-3 max-[960px]:grid-cols-2">
      <div v-for="metric in metrics" :key="metric.label" class="rounded-md border border-slate-200 bg-white px-4 py-3">
        <div class="text-xs text-slate-500">{{ metric.label }}</div>
        <div class="mt-1 text-2xl font-semibold" :class="metric.tone">{{ metric.value }}</div>
      </div>
    </div>

    <div class="grid min-h-[560px] grid-cols-[minmax(0,1fr)_360px] gap-4 max-[1180px]:grid-cols-1">
      <div class="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div v-if="isLoading" class="px-4 py-8 text-center text-sm text-slate-400">正在加载线上用户...</div>
        <template v-else>
          <div class="border-b border-slate-200 bg-amber-50/70 px-4 py-2 text-sm font-medium text-amber-800">
            待审批 ({{ pendingUsers.length }})
          </div>
          <div v-if="pendingUsers.length === 0" class="border-b border-slate-100 px-4 py-5 text-sm text-slate-400">
            暂无待审批用户
          </div>
          <div
            v-for="user in pendingUsers"
            :key="user.id"
            class="grid grid-cols-[minmax(180px,1fr)_170px_220px] items-center gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50"
            :class="{ 'bg-cyan-50/70': selectedUserId === user.id }"
            @click="selectUser(user)"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-900">{{ user.username }}</span>
                <span :class="['rounded-full px-2 py-0.5 text-xs ring-1', getStatusClass(user.status)]">
                  {{ getStatusText(user.status) }}
                </span>
              </div>
              <div class="mt-1 text-xs text-slate-500">手机: {{ user.phone || '-' }} · 注册: {{ formatDate(user.createdAt) }}</div>
            </div>
            <div class="text-sm text-slate-500">{{ roleSummary(user) }}</div>
            <div class="flex justify-end gap-2" @click.stop>
              <Button size="sm" :disabled="actionUserId === user.id" @click="handleApprove(user.id)">
                <UserCheck class="mr-1 h-4 w-4" />通过
              </Button>
              <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleReject(user.id)">
                <UserX class="mr-1 h-4 w-4" />拒绝
              </Button>
            </div>
          </div>

          <div class="border-b border-slate-200 bg-emerald-50/70 px-4 py-2 text-sm font-medium text-emerald-800">
            已启用用户 ({{ approvedUsers.length }})
          </div>
          <div v-if="approvedUsers.length === 0" class="border-b border-slate-100 px-4 py-5 text-sm text-slate-400">
            暂无已启用用户
          </div>
          <div
            v-for="user in approvedUsers"
            :key="user.id"
            class="grid grid-cols-[minmax(180px,1fr)_170px_280px] items-center gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50"
            :class="{ 'bg-cyan-50/70': selectedUserId === user.id }"
            @click="selectUser(user)"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-900">{{ user.username }}</span>
                <span :class="['rounded-full px-2 py-0.5 text-xs ring-1', getStatusClass(user.status)]">
                  {{ getStatusText(user.status) }}
                </span>
              </div>
              <div class="mt-1 text-xs text-slate-500">手机: {{ user.phone || '-' }} · 最后登录: {{ formatDate(user.lastLoginAt) }}</div>
            </div>
            <div class="truncate text-sm text-slate-500">{{ roleSummary(user) }}</div>
            <div class="flex flex-wrap justify-end gap-2" @click.stop>
              <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="selectUser(user)">
                <ShieldCheck class="mr-1 h-4 w-4" />角色
              </Button>
              <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleResetPassword(user.id)">
                <KeyRound class="mr-1 h-4 w-4" />重置
              </Button>
              <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleDisable(user.id)">
                <Ban class="mr-1 h-4 w-4" />禁用
              </Button>
              <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleDelete(user.id)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div class="border-b border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
            已禁用/拒绝 ({{ disabledUsers.length }})
          </div>
          <div v-if="disabledUsers.length === 0" class="px-4 py-5 text-sm text-slate-400">暂无已禁用用户</div>
          <div
            v-for="user in disabledUsers"
            :key="user.id"
            class="grid grid-cols-[minmax(180px,1fr)_170px_280px] items-center gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50"
            :class="{ 'bg-cyan-50/70': selectedUserId === user.id }"
            @click="selectUser(user)"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-600">{{ user.username }}</span>
                <span :class="['rounded-full px-2 py-0.5 text-xs ring-1', getStatusClass(user.status)]">
                  {{ getStatusText(user.status) }}
                </span>
              </div>
              <div class="mt-1 text-xs text-slate-500">手机: {{ user.phone || '-' }}</div>
            </div>
            <div class="truncate text-sm text-slate-500">{{ roleSummary(user) }}</div>
            <div class="flex flex-wrap justify-end gap-2" @click.stop>
              <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="selectUser(user)">
                <ShieldCheck class="mr-1 h-4 w-4" />角色
              </Button>
              <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleResetPassword(user.id)">
                <KeyRound class="mr-1 h-4 w-4" />重置
              </Button>
              <Button size="sm" variant="outline" :disabled="actionUserId === user.id" @click="handleEnable(user.id)">
                <CheckCircle class="mr-1 h-4 w-4" />启用
              </Button>
              <Button size="sm" variant="destructive" :disabled="actionUserId === user.id" @click="handleDelete(user.id)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </template>
      </div>

      <aside class="rounded-md border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-4 py-3">
          <h3 class="font-semibold text-slate-900">页面内角色分配</h3>
          <p class="mt-1 text-xs text-slate-500">选择左侧用户后维护角色，不再打开二级弹层。</p>
        </div>
        <div v-if="!selectedUser" class="px-4 py-10 text-center text-sm text-slate-400">
          请选择一个用户
        </div>
        <div v-else class="p-4">
          <div class="rounded-md bg-slate-50 p-3">
            <div class="text-sm font-medium text-slate-900">{{ selectedUser.username }}</div>
            <div class="mt-1 text-xs text-slate-500">手机: {{ selectedUser.phone || '-' }}</div>
            <div class="mt-2">
              <span :class="['rounded-full px-2 py-0.5 text-xs ring-1', getStatusClass(selectedUser.status)]">
                {{ getStatusText(selectedUser.status) }}
              </span>
            </div>
          </div>

          <div class="mt-4 space-y-2">
            <div v-if="isRoleLoading" class="py-8 text-center text-sm text-slate-400">正在加载用户角色...</div>
            <div v-else-if="roleOptions.length === 0" class="py-8 text-center text-sm text-slate-400">暂无可分配角色</div>
            <label
              v-for="role in roleOptions"
              v-else
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

          <div class="mt-4 flex justify-end">
            <Button :disabled="isSavingRoles || isRoleLoading" @click="handleSaveRoles">
              <ShieldCheck class="mr-2 h-4 w-4" />
              保存角色
            </Button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
