<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '@/stores'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, UserCheck, UserX, Trash2, Ban, CheckCircle } from 'lucide-vue-next'
import type { User, UserStatus } from '@/stores/user'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const userStore = useUserStore()

// 按状态分组的用户列表
const pendingUsers = computed(() => 
  userStore.users.filter(u => u.status === 'pending')
)

const approvedUsers = computed(() => 
  userStore.users.filter(u => u.status === 'approved' && u.role !== 'admin')
)

const disabledUsers = computed(() => 
  userStore.users.filter(u => u.status === 'disabled' || u.status === 'rejected')
)

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

const formatDate = (date: Date) => {
  if (!date) return '-'
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const handleApprove = (userId: string) => {
  userStore.approveUser(userId)
}

const handleReject = (userId: string) => {
  userStore.rejectUser(userId)
}

const handleDisable = (userId: string) => {
  userStore.disableUser(userId)
}

const handleEnable = (userId: string) => {
  userStore.enableUser(userId)
}

const handleDelete = (userId: string) => {
  if (confirm('确定要删除该用户吗？此操作不可恢复。')) {
    userStore.deleteUser(userId)
  }
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[800px] max-h-[80vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <span class="font-semibold text-lg">账户管理</span>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-0">
          <!-- 待审批用户 -->
          <div v-if="pendingUsers.length > 0" class="border-b">
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
                  <Button size="sm" variant="default" @click="handleApprove(user.id)">
                    <UserCheck class="w-4 h-4 mr-1" /> 通过
                  </Button>
                  <Button size="sm" variant="destructive" @click="handleReject(user.id)">
                    <UserX class="w-4 h-4 mr-1" /> 拒绝
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- 已启用用户 -->
          <div class="border-b">
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
                <div class="flex gap-2">
                  <Button size="sm" variant="outline" @click="handleDisable(user.id)">
                    <Ban class="w-4 h-4 mr-1" /> 禁用
                  </Button>
                  <Button size="sm" variant="destructive" @click="handleDelete(user.id)">
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- 已禁用/拒绝用户 -->
          <div>
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
                <div class="flex gap-2">
                  <Button size="sm" variant="outline" @click="handleEnable(user.id)">
                    <CheckCircle class="w-4 h-4 mr-1" /> 启用
                  </Button>
                  <Button size="sm" variant="destructive" @click="handleDelete(user.id)">
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>
