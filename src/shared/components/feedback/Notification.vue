<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle, AlertCircle, XCircle, Info, X } from 'lucide-vue-next'

interface Notification {
  id: string
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
}

interface Props {
  notifications: Notification[]
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'remove', id: string): void
}>()

const getIcon = (type: string) => {
  const icons = {
    success: CheckCircle,
    warning: AlertCircle,
    error: XCircle,
    info: Info,
  }
  return icons[type as keyof typeof icons] || Info
}

const getStyles = (type: string) => {
  const styles = {
    success: 'bg-green-500 text-white',
    warning: 'bg-yellow-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white',
  }
  return styles[type as keyof typeof styles] || styles.info
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] space-y-2">
      <TransitionGroup
        enter-active-class="transition-all duration-300"
        leave-active-class="transition-all duration-300"
        enter-from-class="opacity-0 translate-x-full"
        leave-to-class="opacity-0 translate-x-full"
      >
        <div
          v-for="notification in notifications"
          :key="notification.id"
          :class="[
            'px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm flex items-center gap-2',
            getStyles(notification.type)
          ]"
        >
          <component :is="getIcon(notification.type)" class="w-4 h-4 shrink-0" />
          <span class="flex-1">{{ notification.message }}</span>
          <button
            class="p-0.5 hover:bg-white/20 rounded transition-colors"
            @click="emit('remove', notification.id)"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
