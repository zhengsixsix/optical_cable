<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Pencil, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X } from 'lucide-vue-next'
import { Button, Input } from '@/shared/components/base'
import AdminPagination from '../components/AdminPagination.vue'
import { useAppStore } from '@/stores/app'
import { useUserStore, type MenuPermission, type RoleOption } from '@/stores/user'

interface FlatMenuNode {
  id: string
  name: string
  code?: string
  typeCode?: string
  level: number
  nestedIds: string[]
}

const userStore = useUserStore()
const appStore = useAppStore()
const isLoading = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)
const isRoleDialogOpen = ref(false)
const searchKeyword = ref('')
const currentRoleId = ref<string | null>(null)
const selectedMenuIds = ref<string[]>([])
const rolePageNumber = ref(1)
const rolePageSize = ref(10)
const roleTotal = ref(0)

const roleForm = reactive({
  id: '',
  code: '',
  name: '',
  description: '',
  isValidCd: '1',
  sortNum: 999,
  isSys: 0,
})

const filteredRoles = computed(() => userStore.roles)
const currentRole = computed(() => userStore.roles.find(role => role.id === currentRoleId.value) ?? null)
const flatMenuNodes = computed(() => flattenMenuTree(userStore.menuTree))
const dialogTitle = computed(() => roleForm.id ? '编辑角色' : '新增角色')

function collectMenuIds(menu: MenuPermission): string[] {
  return [
    menu.id,
    ...menu.children.flatMap(collectMenuIds),
    ...menu.funcList.flatMap(collectMenuIds),
  ]
}

function flattenMenuTree(tree: MenuPermission[], level = 0): FlatMenuNode[] {
  return tree.flatMap(menu => {
    const node: FlatMenuNode = {
      id: menu.id,
      name: menu.name,
      code: menu.code,
      typeCode: menu.typeCode,
      level,
      nestedIds: collectMenuIds(menu),
    }
    return [
      node,
      ...flattenMenuTree(menu.funcList, level + 1),
      ...flattenMenuTree(menu.children, level + 1),
    ]
  })
}

function resetForm() {
  Object.assign(roleForm, {
    id: '',
    code: '',
    name: '',
    description: '',
    isValidCd: '1',
    sortNum: 999,
    isSys: 0,
  })
}

function applyRoleToForm(role: RoleOption) {
  currentRoleId.value = role.id
  Object.assign(roleForm, {
    id: role.id,
    code: role.code || '',
    name: role.name || '',
    description: role.description || '',
    isValidCd: role.isValidCd || '1',
    sortNum: role.sortNum ?? 999,
    isSys: role.isSys ?? 0,
  })
}

async function loadAll(resetPage = false) {
  if (resetPage) rolePageNumber.value = 1
  isLoading.value = true
  try {
    const [rolesResult, treeResult] = await Promise.all([
      userStore.loadRoles({
        includeDisabled: true,
        pageNumber: rolePageNumber.value,
        pageSize: rolePageSize.value,
        keyword: searchKeyword.value,
      }),
      userStore.loadMenuTree(),
    ])
    if (!rolesResult.success) appStore.showNotification({ type: 'error', message: rolesResult.message })
    roleTotal.value = Number(rolesResult.page?.dataTotal ?? userStore.roles.length)
    if (rolesResult.page?.pageNumber) rolePageNumber.value = Number(rolesResult.page.pageNumber)
    if (rolesResult.page?.pageSize) rolePageSize.value = Number(rolesResult.page.pageSize)
    if (!treeResult.success) appStore.showNotification({ type: 'error', message: treeResult.message })
    if (currentRoleId.value && !userStore.roles.some(role => role.id === currentRoleId.value)) {
      currentRoleId.value = null
      selectedMenuIds.value = []
      resetForm()
    }
  } finally {
    isLoading.value = false
  }
}

function changeRolePage(page: number) {
  rolePageNumber.value = page
  void loadAll()
}

function changeRolePageSize(size: number) {
  rolePageSize.value = size
  void loadAll(true)
}

function openCreateRoleDialog() {
  resetForm()
  isRoleDialogOpen.value = true
}

function openEditRoleDialog() {
  if (!currentRole.value) return
  applyRoleToForm(currentRole.value)
  isRoleDialogOpen.value = true
}

function closeRoleDialog() {
  if (isSaving.value) return
  isRoleDialogOpen.value = false
}

async function selectRole(role: RoleOption) {
  applyRoleToForm(role)
  isLoading.value = true
  try {
    const [detailResult, treeResult] = await Promise.all([
      userStore.loadRoleDetail(role.id),
      userStore.loadMenuTree(),
    ])
    if (!detailResult.success) {
      appStore.showNotification({ type: 'error', message: detailResult.message })
      return
    }
    if (!treeResult.success) {
      appStore.showNotification({ type: 'error', message: treeResult.message })
    }
    if (detailResult.role) {
      applyRoleToForm(detailResult.role)
      selectedMenuIds.value = detailResult.role.selectedMenuIds || []
    }
  } finally {
    isLoading.value = false
  }
}

function toggleMenu(node: FlatMenuNode) {
  const selected = new Set(selectedMenuIds.value)
  const shouldRemove = node.nestedIds.every(id => selected.has(id))
  for (const id of node.nestedIds) {
    if (shouldRemove) selected.delete(id)
    else selected.add(id)
  }
  selectedMenuIds.value = Array.from(selected)
}

async function saveRoleInfo() {
  if (!roleForm.code.trim() || !roleForm.name.trim()) {
    appStore.showNotification({ type: 'warning', message: '请输入角色编码和名称' })
    return
  }

  isSaving.value = true
  try {
    const roleResult = await userStore.saveRole({
      id: roleForm.id || undefined,
      code: roleForm.code.trim(),
      name: roleForm.name.trim(),
      description: roleForm.description.trim(),
      isValidCd: roleForm.isValidCd,
      sortNum: Number(roleForm.sortNum) || 999,
      isSys: Number(roleForm.isSys) || 0,
    })
    appStore.showNotification({ type: roleResult.success ? 'success' : 'error', message: roleResult.message })
    if (!roleResult.success || !roleResult.roleId) return

    currentRoleId.value = roleResult.roleId
    roleForm.id = roleResult.roleId
    isRoleDialogOpen.value = false
    await loadAll()
  } finally {
    isSaving.value = false
  }
}

async function saveRolePermissions() {
  if (!currentRoleId.value) {
    appStore.showNotification({ type: 'warning', message: '请先选择角色' })
    return
  }

  isSaving.value = true
  try {
    const result = await userStore.saveRoleMenus(currentRoleId.value, selectedMenuIds.value)
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.success ? '角色权限保存成功' : result.message })
  } finally {
    isSaving.value = false
  }
}

async function deleteCurrentRole() {
  if (!currentRole.value || !confirm(`确定要删除角色「${currentRole.value.name}」吗？`)) return

  isDeleting.value = true
  try {
    const result = await userStore.deleteRole(currentRole.value.id)
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.message })
    if (result.success) {
      currentRoleId.value = null
      selectedMenuIds.value = []
      resetForm()
      await loadAll()
    }
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  resetForm()
  void loadAll()
})
</script>

<template>
  <section class="space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">权限管理</h2>
        <p class="mt-1 text-sm text-slate-500">左侧选择角色，右侧维护该角色的功能权限。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadAll()">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="admin-master-detail-layout admin-wide-master">
      <aside class="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="space-y-3 border-b border-slate-200 p-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck class="h-4 w-4 text-cyan-700" />
            角色列表
          </div>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input v-model="searchKeyword" class="pl-9" placeholder="搜索角色" @keyup.enter="loadAll(true)" />
          </div>
          <Button class="w-full" :disabled="isLoading" @click="openCreateRoleDialog">
            <Plus class="mr-2 h-4 w-4" />
            新增角色
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-auto divide-y divide-slate-100">
          <button
            v-for="role in filteredRoles"
            :key="role.id"
            type="button"
            class="w-full px-4 py-3 text-left hover:bg-slate-50"
            :class="{ 'bg-cyan-50': currentRoleId === role.id }"
            @click="selectRole(role)"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-medium text-slate-800">{{ role.name }}</span>
              <span
                class="rounded-full px-2 py-0.5 text-[11px]"
                :class="role.isValidCd === '0' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'"
              >
                {{ role.isValidCd === '0' ? '停用' : '启用' }}
              </span>
            </span>
            <span class="mt-1 block text-xs text-slate-500">{{ role.code || role.id }}</span>
            <span v-if="role.description" class="mt-1 block truncate text-xs text-slate-400">{{ role.description }}</span>
          </button>
          <div v-if="!isLoading && filteredRoles.length === 0" class="px-4 py-8 text-center text-sm text-slate-400">
            暂无角色
          </div>
        </div>

        <AdminPagination
          :page-number="rolePageNumber"
          :page-size="rolePageSize"
          :total="roleTotal"
          :loading="isLoading"
          @change-page="changeRolePage"
          @change-page-size="changeRolePageSize"
        />
      </aside>

      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 class="text-sm font-semibold text-slate-900">功能权限</h3>
            <p class="mt-1 text-xs text-slate-500">
              <template v-if="currentRole">当前角色：{{ currentRole.name }}，已选 {{ selectedMenuIds.length }} 项。</template>
              <template v-else>请选择左侧角色。</template>
            </p>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <Button v-if="currentRole" variant="outline" :disabled="isLoading || isSaving" @click="openEditRoleDialog">
              <Pencil class="mr-1 h-4 w-4" />
              编辑资料
            </Button>
            <Button v-if="currentRole" variant="destructive" :disabled="isDeleting || isSaving" @click="deleteCurrentRole">
              <Trash2 class="mr-1 h-4 w-4" />
              删除
            </Button>
            <Button :disabled="!currentRole || isSaving || isLoading" @click="saveRolePermissions">
              <Save class="mr-1 h-4 w-4" />
              保存权限
            </Button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div v-if="isLoading" class="py-10 text-center text-sm text-slate-400">正在加载权限...</div>
          <div v-else-if="!currentRole" class="py-12 text-center text-sm text-slate-400">请选择一个角色</div>
          <div v-else-if="flatMenuNodes.length === 0" class="py-10 text-center text-sm text-slate-400">暂无功能权限</div>
          <div v-else class="space-y-1">
            <label
              v-for="node in flatMenuNodes"
              :key="node.id"
              class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-50"
              :style="{ paddingLeft: `${node.level * 18 + 12}px` }"
            >
              <input
                type="checkbox"
                :checked="selectedMenuIds.includes(node.id)"
                @change="toggleMenu(node)"
              >
              <span class="min-w-0">
                <span class="text-sm text-slate-800">{{ node.name }}</span>
                <span class="ml-2 text-xs text-slate-400">{{ node.code || node.id }}</span>
                <span v-if="node.typeCode" class="ml-2 text-[11px] text-slate-400">{{ node.typeCode }}</span>
              </span>
            </label>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="isRoleDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      @click.self="closeRoleDialog"
    >
      <div class="admin-form-dialog flex max-h-full flex-col overflow-hidden rounded-md bg-white shadow-xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 class="text-base font-semibold text-slate-950">{{ dialogTitle }}</h3>
            <p class="mt-1 text-xs text-slate-500">维护角色编码、名称和状态。</p>
          </div>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            :disabled="isSaving"
            title="关闭"
            @click="closeRoleDialog"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="min-h-0 overflow-auto px-5 py-4">
          <div class="grid gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">角色编码</span>
              <Input v-model="roleForm.code" placeholder="例如 admin" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">角色名称</span>
              <Input v-model="roleForm.name" placeholder="例如 系统管理员" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">状态</span>
              <select v-model="roleForm.isValidCd" class="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" :disabled="isSaving">
                <option value="1">启用</option>
                <option value="0">停用</option>
              </select>
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">排序</span>
              <Input v-model="roleForm.sortNum" type="number" :disabled="isSaving" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-500">简介</span>
              <Input v-model="roleForm.description" placeholder="角色说明" :disabled="isSaving" />
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button variant="outline" :disabled="isSaving" @click="closeRoleDialog">取消</Button>
          <Button :disabled="isSaving" @click="saveRoleInfo">
            <Save class="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
