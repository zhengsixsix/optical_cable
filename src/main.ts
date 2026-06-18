import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

import { initAppearance } from '@/composables'
import { onPlatformUnauthorized } from '@/services/platform/client'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'

// 静默处理 GeoTIFF 加载错误（大文件瓦片加载失败）
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('offset') || 
      event.reason?.stack?.includes('BlockedSource') ||
      event.reason?.stack?.includes('GeoTIFF')) {
    event.preventDefault()
  }
})

const app = createApp(App)
const pinia = createPinia()

// 初始化外观设置
initAppearance()

// 安装 Pinia
app.use(pinia)

// 安装 Router
app.use(router)

onPlatformUnauthorized((event) => {
  const userStore = useUserStore()
  const appStore = useAppStore()
  const isLoginRoute = router.currentRoute.value.name === 'login'

  userStore.logout()
  if (!isLoginRoute) {
    appStore.showNotification({
      type: 'warning',
      message: event.message || '登录已失效，请重新登录',
    })
    router.replace({ name: 'login' })
  }
})

// 挂载应用
app.mount('#app')
