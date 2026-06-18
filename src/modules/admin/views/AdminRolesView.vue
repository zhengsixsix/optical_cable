<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Plus, RefreshCw, Save, Search, ShieldCheck, Trash2 } from 'lucide-vue-next'
import { Button, Input } from '@/shared/components/base'
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
const searchKeyword = ref('')
const currentRoleId = ref<string | null>(null)
const selectedMenuIds = ref<string[]>([])

const roleForm = reactive({
  id: '',
  code: '',
  name: '',
  description: '',
  isValidCd: '1',
  sortNum: 999,
  isSys: 0,
})

const filteredRoles = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return userStore.roles

  return userStore.roles.filter(role =>
    role.name.toLowerCase().includes(keyword) ||
    (role.code || '').toLowerCase().includes(keyword) ||
    (role.description || '').toLowerCase().includes(keyword),
  )
})

const flatMenuNodes = computed(() => flattenMenuTree(userStore.menuTree))

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
  currentRoleId.value = null
  selectedMenuIds.value = []
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

async function loadAll() {
  isLoading.value = true
  try {
    const [rolesResult, treeResult] = await Promise.all([
      userStore.loadRoles({ includeDisabled: true }),
      userStore.loadMenuTree(),
    ])
    if (!rolesResult.success) appStore.showNotification({ type: 'error', message: rolesResult.message })
    if (!treeResult.success) appStore.showNotification({ type: 'error', message: treeResult.message })
  } finally {
    isLoading.value = false
  }
}

async function startCreateRole() {
  resetForm()
  await userStore.loadMenuTree()
}

async function editRole(role: RoleOption) {
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

async function saveRoleAndMenus() {
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
    if (!roleResult.success || !roleResult.roleId) {
      appStore.showNotification({ type: 'error', message: roleResult.message })
      return
    }

    const menusResult = await userStore.saveRoleMenus(roleResult.roleId, selectedMenuIds.value)
    appStore.showNotification({
      type: menusResult.success ? 'success' : 'error',
      message: menusResult.success ? '角色权限保存成功' : menusResult.message,
    })
    currentRoleId.value = roleResult.roleId
    roleForm.id = roleResult.roleId
  } finally {
    isSaving.value = false
  }
}

async function deleteRole(role: RoleOption) {
  if (!confirm(`确定要删除角色「${role.name}」吗？`)) return

  isDeleting.value = true
  try {
    const result = await userStore.deleteRole(role.id)
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.message })
    if (result.success && currentRoleId.value === role.id) resetForm()
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
  <section class="p-6 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-950">权限管理</h2>
        <p class="mt-1 text-sm text-slate-500">角色资料与功能权限树集中维护，所有编辑动作都在页面内完成。</p>
      </div>
      <Button variant="outline" :disabled="isLoading" @click="loadAll">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        刷新
      </Button>
    </div>

    <div class="grid min-h-[650px] grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-md border border-slate-200 bg-white max-[1080px]:grid-cols-1">
      <aside class="min-h-0 border-r border-slate-200 max-[1080px]:border-r-0 max-[1080px]:border-b">
        <div class="space-y-3 border-b border-slate-200 p-3">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input v-model="searchKeyword" class="pl-9" placeholder="搜索角色" />
          </div>
          <Button class="w-full" :disabled="isLoading" @click="startCreateRole">
            <Plus class="mr-2 h-4 w-4" />
            新增角色
          </Button>
        </div>
        <div class="max-h-[590px] overflow-auto divide-y divide-slate-100">
          <button
            v-for="role in filteredRoles"
            :key="role.id"
            class="w-full px-4 py-3 text-left hover:bg-slate-50"
            :class="{ 'bg-cyan-50': currentRoleId === role.id }"
            @click="editRole(role)"
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
      </aside>

      <section class="min-h-0 min-w-0">
        <div class="grid grid-cols-2 gap-4 border-b border-slate-200 p-4 max-[760px]:grid-cols-1">
          <label class="space-y-1.5">
            <span class="text-xs text-slate-500">角色编码</span>
            <Input v-model="roleForm.code" placeholder="例如 admin" />
          </label>
          <label class="space-y-1.5">
            <span class="text-xs text-slate-500">角色名称</span>
            <Input v-model="roleForm.name" placeholder="例如 系统管理员" />
          </label>
          <label class="space-y-1.5">
            <span class="text-xs text-slate-500">状态</span>
            <select v-model="roleForm.isValidCd" class="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
              <option value="1">启用</option>
              <option value="0">停用</option>
            </select>
          </label>
          <label class="space-y-1.5">
            <span class="text-xs text-slate-500">排序</span>
            <Input v-model="roleForm.sortNum" type="number" />
          </label>
          <label class="col-span-2 space-y-1.5 max-[760px]:col-span-1">
            <span class="text-xs text-slate-500">简介</span>
            <Input v-model="roleForm.description" placeholder="角色说明" />
          </label>
        </div>

        <div class="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div class="flex items-center gap-2 text-sm font-medium text-slate-700">
            <ShieldCheck class="h-4 w-4" />
            <span>功能权限</span>
            <span class="text-xs text-slate-400">已选 {{ selectedMenuIds.length }}</span>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="currentRoleId"
              variant="destructive"
              size="sm"
              :disabled="isDeleting || isSaving"
              @click="deleteRole({ id: currentRoleId, code: roleForm.code, name: roleForm.name })"
            >
              <Trash2 class="mr-1 h-4 w-4" />
              删除角色
            </Button>
            <Button :disabled="isSaving || isLoading" @click="saveRoleAndMenus">
              <Save class="mr-1 h-4 w-4" />
              保存
            </Button>
          </div>
        </div>

        <div class="max-h-[390px] overflow-auto p-4">
          <div v-if="isLoading" class="py-10 text-center text-sm text-slate-400">正在加载权限...</div>
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
  </section>
</template>
