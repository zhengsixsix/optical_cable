import { useAppStore } from '@/stores/app'
import { useRouteStore } from '@/stores/route'
import { createRouter, createWebHashHistory, type RouteRecordRaw} from 'vue-router'
import { useUserStore } from '@/stores/user'
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
        meta: {title: '设备健康度管理', requiresAuth: true, requiresUSE: true},
    },
    {
        path: '/monitor-center',
        name: 'monitor-center',
        component: () => import('@/modules/monitoring/dialogs/MonitoringCenterDialog.vue'),
        meta: {title: '监控中心', requiresAuth: true},
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
        path: '/admin',
        component: () => import('@/modules/admin/layout/AdminLayout.vue'),
        redirect: '/admin/users',
        meta: {title: '系统管理', requiresAuth: true, requiresAdmin: true},
        children: [
            {
                path: '/admin/users',
                name: 'admin-users',
                component: () => import('@/modules/admin/views/AdminUsersView.vue'),
                meta: {title: '账户管理', requiresAuth: true, requiresAdmin: true},
            },
            {
                path: '/admin/roles',
                name: 'admin-roles',
                component: () => import('@/modules/admin/views/AdminRolesView.vue'),
                meta: {title: '权限管理', requiresAuth: true, requiresAdmin: true},
            },
            {
                path: '/admin/dictionary',
                name: 'admin-dictionary',
                component: () => import('@/modules/admin/views/AdminDictionaryView.vue'),
                meta: {title: '数据字典', requiresAuth: true, requiresAdmin: true},
            },
            {
                path: '/admin/layers',
                name: 'admin-layers',
                component: () => import('@/modules/admin/views/AdminLayersView.vue'),
                meta: {title: '平台图层库', requiresAuth: true, requiresAdmin: true},
            },
            {
                path: '/admin/logs',
                name: 'admin-logs',
                component: () => import('@/modules/admin/views/AdminLogsView.vue'),
                meta: {title: '操作日志', requiresAuth: true, requiresAdmin: true},
            },
        ],
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
    history: createWebHashHistory(),
    routes,
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
    const title = to.meta.title as string
    if (title) {
        document.title = `${title} - 海底光缆智能规划软件`
    }

    const userStore = useUserStore()
    const appStore = useAppStore()

    const shouldBootstrapSession = Boolean(to.meta.requiresAuth) || to.name === 'login'
    const hasSession = shouldBootstrapSession
        ? await userStore.bootstrapSession()
        : userStore.isLoggedIn

    if (to.meta.requiresAuth && !hasSession) {
        next({name: 'login'})
        return
    }

    if (to.meta.requiresAdmin && !userStore.isAdmin) {
        next({name: 'planning'})
        return
    }

// 系统设计页面需要路由数据
    if (to.meta.requiresUSE) {
        const routeStore = useRouteStore()
        
        // 自动切换项目阶段
        if (to.name === 'design') {
            appStore.setProjectPhase('transmission-planning')
        } else if (to.name === 'monitoring') {
            appStore.setProjectPhase('monitoring')
        }
        
        // 仅检查是否有路由数据，RPL 生成由 DesignView 显式处理
        const selectedRoute = routeStore.selectedRoute || routeStore.paretoRoutes[0]
        if (!selectedRoute || !selectedRoute.points || selectedRoute.points.length < 2) {
            appStore.showNotification({
                type: 'warning',
                message: '请先在路由规划页面创建或选择路由',
            })
            next({name: 'planning'})
            return
        }
    }

    if (to.name === 'login' && hasSession) {
        next({name: 'planning'})
        return
    }

    next()
})

export default router
