import {createRouter, createWebHistory, type RouteRecordRaw} from 'vue-router'
import {useUserStore} from '@/stores'

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
        meta: {title: '系统设计', requiresAuth: true},
    },
    {
        path: '/monitoring',
        name: 'monitoring',
        component: () => import('@/views/MonitoringView.vue'),
        meta: {title: '监控', requiresAuth: true},
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
        meta: {title: '设置', requiresAuth: true, requiresAdmin: true},
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

    if (to.meta.requiresAuth && !userStore.isLoggedIn) {
        next({name: 'login'})
        return
    }

    if (to.meta.requiresAdmin && !userStore.isAdmin) {
        next({name: 'planning'})
        return
    }

    if (to.name === 'login' && userStore.isLoggedIn) {
        next({name: 'planning'})
        return
    }

    next()
})

export default router
