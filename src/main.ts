import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

import { initAppearance } from '@/composables'

const app = createApp(App)

// 初始化外观设置
initAppearance()

// 安装 Pinia
app.use(createPinia())

// 安装 Router
app.use(router)

// 挂载应用
app.mount('#app')
