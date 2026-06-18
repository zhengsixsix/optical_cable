<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { Button, Card, CardContent, CardHeader, Input } from '@/shared/components/base'
import { KeyRound, RefreshCw, Save, UserRound, X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const userStore = useUserStore()
const appStore = useAppStore()
const isLoadingProfile = ref(false)
const isSavingProfile = ref(false)
const isChangingPassword = ref(false)

const profileForm = reactive({
  realName: '',
  phone: '',
  remarks: '',
})

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

function syncProfileForm() {
  profileForm.realName = userStore.currentUser?.realName || ''
  profileForm.phone = userStore.currentUser?.phone || ''
  profileForm.remarks = userStore.currentUser?.remarks || ''
}

function resetPasswordForm() {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
}

async function refreshProfile() {
  if (!props.visible) return
  isLoadingProfile.value = true
  try {
    const result = await userStore.refreshCurrentUser()
    if (!result.success) {
      appStore.showNotification({ type: 'error', message: result.message })
      return
    }
    syncProfileForm()
  } finally {
    isLoadingProfile.value = false
  }
}

async function saveProfile() {
  isSavingProfile.value = true
  try {
    const result = await userStore.updateCurrentProfile({
      realName: profileForm.realName.trim(),
      phone: profileForm.phone.trim(),
      remarks: profileForm.remarks.trim(),
    })
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.message })
  } finally {
    isSavingProfile.value = false
  }
}

async function changePassword() {
  if (!passwordForm.oldPassword || !passwordForm.newPassword) {
    appStore.showNotification({ type: 'warning', message: '请输入原密码和新密码' })
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    appStore.showNotification({ type: 'warning', message: '两次输入的新密码不一致' })
    return
  }

  isChangingPassword.value = true
  try {
    const result = await userStore.changeCurrentPassword(passwordForm.oldPassword, passwordForm.newPassword)
    appStore.showNotification({ type: result.success ? 'success' : 'error', message: result.message })
    if (result.success) resetPasswordForm()
  } finally {
    isChangingPassword.value = false
  }
}

watch(() => props.visible, (visible) => {
  if (!visible) return
  syncProfileForm()
  resetPasswordForm()
  refreshProfile()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[640px] max-w-[calc(100vw-32px)] max-h-[84vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <span class="font-semibold text-lg">个人设置</span>
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="sm" :disabled="isLoadingProfile" @click="refreshProfile">
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoadingProfile }" />
            </Button>
            <Button variant="ghost" size="sm" @click="emit('close')">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent class="flex-1 overflow-auto p-5 space-y-6">
          <section class="space-y-4">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
              <UserRound class="w-4 h-4" />
              <span>个人信息</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label class="space-y-1.5">
                <span class="text-xs text-gray-500">登录账号</span>
                <Input :model-value="userStore.currentUser?.username || ''" readonly />
              </label>
              <label class="space-y-1.5">
                <span class="text-xs text-gray-500">姓名</span>
                <Input v-model="profileForm.realName" placeholder="请输入姓名" />
              </label>
              <label class="space-y-1.5">
                <span class="text-xs text-gray-500">联系电话</span>
                <Input v-model="profileForm.phone" placeholder="请输入联系电话" />
              </label>
              <label class="space-y-1.5">
                <span class="text-xs text-gray-500">当前角色</span>
                <Input :model-value="Object.values(userStore.currentUser?.roles || {}).join('、') || '-'" readonly />
              </label>
            </div>
            <label class="block space-y-1.5">
              <span class="text-xs text-gray-500">备注</span>
              <textarea
                v-model="profileForm.remarks"
                class="w-full min-h-[72px] px-3 py-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                style="background-color: var(--app-card-bg); color: var(--app-text-color); border-color: var(--app-border-color);"
                placeholder="请输入备注"
              />
            </label>
            <div class="flex justify-end">
              <Button :disabled="isSavingProfile || isLoadingProfile" @click="saveProfile">
                <Save class="w-4 h-4 mr-1" />
                保存信息
              </Button>
            </div>
          </section>

          <div class="h-px bg-gray-100" />

          <section class="space-y-4">
            <div class="flex items-center gap-2 text-sm font-medium text-gray-700">
              <KeyRound class="w-4 h-4" />
              <span>修改密码</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label class="space-y-1.5">
                <span class="text-xs text-gray-500">原密码</span>
                <Input v-model="passwordForm.oldPassword" type="password" placeholder="原密码" />
              </label>
              <label class="space-y-1.5">
                <span class="text-xs text-gray-500">新密码</span>
                <Input v-model="passwordForm.newPassword" type="password" placeholder="新密码" />
              </label>
              <label class="space-y-1.5">
                <span class="text-xs text-gray-500">确认新密码</span>
                <Input v-model="passwordForm.confirmPassword" type="password" placeholder="再次输入" />
              </label>
            </div>
            <div class="flex justify-end">
              <Button :disabled="isChangingPassword" @click="changePassword">
                <KeyRound class="w-4 h-4 mr-1" />
                修改密码
              </Button>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>
