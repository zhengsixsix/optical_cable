<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUserStore, type MenuPermission, type RoleOption } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { Button, Card, CardContent, CardHeader, Input } from '@/shared/components/base'
import { Edit3, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

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

  return userStore.roles.filter(role => {
    return role.name.toLowerCase().includes(keyword) ||
      (role.code || '').toLowerCase().includes(keyword) ||
      (role.description || '').toLowerCase().includes(keyword)
  })
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
    if (shouldRemove) {
      selected.delete(id)
    } else {
      selected.add(id)
    }
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
    if (result.success && currentRoleId.value === role.id) {
      resetForm()
    }
  } finally {
    isDeleting.value = false
  }
}

watch(() => props.visible, (visible) => {
  if (!visible) {
    resetForm()
    return
  }
  resetForm()
  loadAll()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[1040px] max-w-[calc(100vw-32px)] max-h-[86vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <span class="font-semibold text-lg">权限管理</span>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" :disabled="isLoading" @click="loadAll">
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent class="flex-1 min-h-0 p-0">
          <div class="grid grid-cols-[320px_1fr] h-full min-h-[560px]">
            <aside class="border-r flex flex-col min-h-0">
              <div class="p-3 border-b space-y-3">
                <div class="relative">
                  <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input v-model="searchKeyword" class="pl-9" placeholder="搜索角色" />
                </div>
                <Button class="w-full" :disabled="isLoading" @click="startCreateRole">
                  <Plus class="w-4 h-4 mr-1" />
                  新增角色
                </Button>
              </div>
              <div class="flex-1 overflow-auto divide-y">
                <button
                  v-for="role in filteredRoles"
                  :key="role.id"
                  class="w-full text-left px-4 py-3 hover:bg-gray-50"
                  :class="{ 'bg-blue-50': currentRoleId === role.id }"
                  @click="editRole(role)"
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="font-medium text-sm text-gray-800">{{ role.name }}</span>
                    <span
                      class="text-[11px] px-2 py-0.5 rounded"
                      :class="role.isValidCd === '0' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'"
                    >
                      {{ role.isValidCd === '0' ? '停用' : '启用' }}
                    </span>
                  </span>
                  <span class="block text-xs text-gray-500 mt-1">{{ role.code || role.id }}</span>
                  <span v-if="role.description" class="block text-xs text-gray-400 mt-1 truncate">{{ role.description }}</span>
                </button>
                <div v-if="!isLoading && filteredRoles.length === 0" class="px-4 py-8 text-center text-sm text-gray-400">
                  暂无角色
                </div>
              </div>
            </aside>

            <section class="min-w-0 min-h-0 flex flex-col">
              <div class="grid grid-cols-2 gap-4 p-4 border-b">
                <label class="space-y-1.5">
                  <span class="text-xs text-gray-500">角色编码</span>
                  <Input v-model="roleForm.code" placeholder="例如 admin" />
                </label>
                <label class="space-y-1.5">
                  <span class="text-xs text-gray-500">角色名称</span>
                  <Input v-model="roleForm.name" placeholder="例如 系统管理员" />
                </label>
                <label class="space-y-1.5">
                  <span class="text-xs text-gray-500">状态</span>
                  <select v-model="roleForm.isValidCd" class="w-full h-9 border rounded-md px-3 text-sm">
                    <option value="1">启用</option>
                    <option value="0">停用</option>
                  </select>
                </label>
                <label class="space-y-1.5">
                  <span class="text-xs text-gray-500">排序</span>
                  <Input v-model="roleForm.sortNum" type="number" />
                </label>
                <label class="space-y-1.5 col-span-2">
                  <span class="text-xs text-gray-500">简介</span>
                  <Input v-model="roleForm.description" placeholder="角色说明" />
                </label>
              </div>

              <div class="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <ShieldCheck class="w-4 h-4" />
                  <span>功能权限</span>
                  <span class="text-xs text-gray-400">已选 {{ selectedMenuIds.length }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    v-if="currentRoleId"
                    variant="destructive"
                    size="sm"
                    :disabled="isDeleting || isSaving"
                    @click="deleteRole({ id: currentRoleId, code: roleForm.code, name: roleForm.name })"
                  >
                    <Trash2 class="w-4 h-4 mr-1" />
                    删除角色
                  </Button>
                  <Button :disabled="isSaving || isLoading" @click="saveRoleAndMenus">
                    <Save class="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </div>
              </div>

              <div class="flex-1 overflow-auto p-4">
                <div v-if="isLoading" class="py-10 text-center text-sm text-gray-400">
                  正在加载权限...
                </div>
                <div v-else-if="flatMenuNodes.length === 0" class="py-10 text-center text-sm text-gray-400">
                  暂无功能权限
                </div>
                <div v-else class="space-y-1">
                  <label
                    v-for="node in flatMenuNodes"
                    :key="node.id"
                    class="flex items-center gap-3 rounded px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    :style="{ paddingLeft: `${node.level * 18 + 12}px` }"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedMenuIds.includes(node.id)"
                      @change="toggleMenu(node)"
                    >
                    <span class="min-w-0">
                      <span class="text-sm text-gray-800">{{ node.name }}</span>
                      <span class="text-xs text-gray-400 ml-2">{{ node.code || node.id }}</span>
                      <span v-if="node.typeCode" class="text-[11px] text-gray-400 ml-2">{{ node.typeCode }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>
