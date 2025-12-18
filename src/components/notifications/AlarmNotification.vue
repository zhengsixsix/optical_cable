<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useMonitorStore, useAppStore } from '@/stores'
import { useAlarmWebSocket } from '@/services/AlarmWebSocketService'
import { AlertTriangle, XCircle, Info, X, Bell } from 'lucide-vue-next'
import type { AlarmRecord } from '@/stores/monitor'

const monitorStore = useMonitorStore()
const appStore = useAppStore()
const { onAlarm, isConnected } = useAlarmWebSocket()

// 弹窗告警队列
const popupAlarms = ref<AlarmRecord[]>([])
const maxPopups = 5

// 告警级别图标和样式
const getAlarmIcon = (level: string) => {
  switch (level) {
    case 'error': return XCircle
    case 'warning': return AlertTriangle
    default: return Info
  }
}

const getAlarmClass = (level: string) => {
  switch (level) {
    case 'error': return 'bg-red-50 border-red-500 text-red-700'
    case 'warning': return 'bg-yellow-50 border-yellow-500 text-yellow-700'
    default: return 'bg-blue-50 border-blue-500 text-blue-700'
  }
}

const getAlarmBgClass = (level: string) => {
  switch (level) {
    case 'error': return 'bg-red-500'
    case 'warning': return 'bg-yellow-500'
    default: return 'bg-blue-500'
  }
}

// 关闭弹窗
const closePopup = (alarmId: number) => {
  popupAlarms.value = popupAlarms.value.filter(a => a.id !== alarmId)
}

// 自动关闭定时器
const autoClosePopup = (alarmId: number, delay: number = 8000) => {
  setTimeout(() => {
    closePopup(alarmId)
  }, delay)
}

// 处理新告警
const handleNewAlarm = (alarm: AlarmRecord) => {
  // 添加到store
  monitorStore.addAlarm(alarm)
  
  // 添加到弹窗队列
  if (popupAlarms.value.length >= maxPopups) {
    popupAlarms.value.shift()
  }
  popupAlarms.value.push(alarm)
  
  // 添加日志
  appStore.addLog(
    alarm.level === 'error' ? 'ERROR' : alarm.level === 'warning' ? 'WARN' : 'INFO',
    `[告警] ${alarm.device}: ${alarm.message}`
  )
  
  // 自动关闭（error类型延长显示时间）
  autoClosePopup(alarm.id, alarm.level === 'error' ? 15000 : 8000)
  
  // 播放告警音效（可选）
  if (alarm.level === 'error') {
    playAlarmSound()
  }
}

// 播放告警音效
const playAlarmSound = () => {
  try {
    const audio = new Audio('/alarm.mp3')
    audio.volume = 0.3
    audio.play().catch(() => {})
  } catch (e) {
    // 忽略音效播放错误
  }
}

// 订阅告警
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = onAlarm(handleNewAlarm)
})

onUnmounted(() => {
  unsubscribe?.()
})
</script>

<template>
  <!-- 告警弹窗容器 -->
  <Teleport to="body">
    <div class="fixed top-16 right-4 z-[2000] flex flex-col gap-2 w-80">
      <TransitionGroup name="alarm-popup">
        <div
          v-for="alarm in popupAlarms"
          :key="alarm.id"
          :class="[
            'rounded-lg border-l-4 shadow-lg overflow-hidden',
            getAlarmClass(alarm.level)
          ]"
        >
          <!-- 头部 -->
          <div class="flex items-center justify-between px-3 py-2 bg-white/50">
            <div class="flex items-center gap-2">
              <component 
                :is="getAlarmIcon(alarm.level)" 
                :class="['w-4 h-4', alarm.level === 'error' ? 'text-red-500' : alarm.level === 'warning' ? 'text-yellow-500' : 'text-blue-500']"
              />
              <span class="font-medium text-sm">{{ alarm.device }}</span>
            </div>
            <button 
              class="p-1 hover:bg-black/10 rounded transition-colors"
              @click="closePopup(alarm.id)"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
          
          <!-- 内容 -->
          <div class="px-3 py-2">
            <p class="text-sm">{{ alarm.message }}</p>
            <div class="flex items-center justify-between mt-2 text-xs opacity-70">
              <span>{{ alarm.neType }}</span>
              <span>{{ alarm.time }}</span>
            </div>
          </div>
          
          <!-- 进度条 -->
          <div class="h-1 bg-black/10">
            <div 
              :class="['h-full animate-shrink', getAlarmBgClass(alarm.level)]"
              :style="{ animationDuration: alarm.level === 'error' ? '15s' : '8s' }"
            />
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.alarm-popup-enter-active {
  animation: slideIn 0.3s ease-out;
}

.alarm-popup-leave-active {
  animation: slideOut 0.3s ease-in;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@keyframes shrink {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

.animate-shrink {
  animation: shrink linear forwards;
}
</style>
