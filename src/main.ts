import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

import { initAppearance } from '@/composables/useAppearance'
import { onPlatformUnauthorized } from '@/services/platform/client'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'

const app = createApp(App)
const pinia = createPinia()

initAppearance()

app.use(pinia)
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

app.mount('#app')
