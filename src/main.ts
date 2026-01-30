import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

import { initAppearance } from '@/composables'

// 静默处理 GeoTIFF 加载错误（大文件瓦片加载失败）
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('offset') || 
      event.reason?.stack?.includes('BlockedSource') ||
      event.reason?.stack?.includes('GeoTIFF')) {
    event.preventDefault()
  }
})

const app = createApp(App)

// 初始化外观设置
initAppearance()

// 安装 Pinia
app.use(createPinia())

// 安装 Router
app.use(router)

// 挂载应用
app.mount('#app')
