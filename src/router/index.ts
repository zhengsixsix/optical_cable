import {createRouter, createWebHistory, type RouteRecordRaw} from 'vue-router'
import {useUserStore, useAppStore} from '@/stores'

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        redirect: '/planning',
    },
    {
        path: '/planning',
        name: 'planning',
        component: () => import('@/views/PlanningView.vue'),
        meta: {title: '路由规划', requiresAuth: true},
    },
    {
        path: '/design',
        name: 'design',
        component: () => import('@/views/DesignView.vue'),
        meta: {title: '系统设计', requiresAuth: true, requiresUSE: true},
    },
    {
        path: '/monitoring',
        name: 'monitoring',
        component: () => import('@/views/MonitoringView.vue'),
        meta: {title: '监控', requiresAuth: true, requiresUSE: true},
    },
    {
        path: '/performance',
        name: 'performance',
        component: () => import('@/views/PerformanceView.vue'),
        meta: {title: '性能历史', requiresAuth: true},
    },
    {
        path: '/settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: {title: '工程设置', requiresAuth: true},
    },
    {
        path: '/device-library',
        name: 'device-library',
        component: () => import('@/views/DeviceLibraryView.vue'),
        meta: {title: '器件库管理', requiresAuth: true},
    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/LoginView.vue'),
        meta: {title: '登录'},
    },
    {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
        meta: {title: '页面未找到'},
    },
]

const router = createRouter({
    history: createWebHistory(),
    routes,
})

// 路由守卫
router.beforeEach((to, from, next) => {
    const title = to.meta.title as string
    if (title) {
        document.title = `${title} - 海底光缆智能规划软件`
    }

    const userStore = useUserStore()
    const appStore = useAppStore()

    if (to.meta.requiresAuth && !userStore.isLoggedIn) {
        next({name: 'login'})
        return
    }

    if (to.meta.requiresAdmin && !userStore.isAdmin) {
        next({name: 'planning'})
        return
    }

    // USE 项目限制：系统设计和监控页面需要 USE 项目
    if (to.meta.requiresUSE) {
        const projectType = appStore.currentProjectType
        // 如果是 UCP 项目，重定向到路由规划页面
        if (projectType === 'ucp') {
            appStore.showNotification({
                type: 'warning',
                message: '路由规划项目(.ucp)不支持系统设计功能，请创建系统设计项目(.use)',
            })
            next({name: 'planning'})
            return
        }
    }

    if (to.name === 'login' && userStore.isLoggedIn) {
        next({name: 'planning'})
        return
    }

    next()
})

export default router
