import {createRouter, createWebHashHistory, type RouteRecordRaw} from 'vue-router'
import {useUserStore, useAppStore, useRPLStore, useRouteStore} from '@/stores'

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
    history: createWebHashHistory(),
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

// 系统设计页面需要 RPL 数据
    if (to.meta.requiresUSE) {
        const rplStore = useRPLStore()
        const routeStore = useRouteStore()
        
        // 自动切换项目阶段
        if (to.name === 'design') {
            appStore.setProjectPhase('transmission-planning')
        } else if (to.name === 'monitoring') {
            appStore.setProjectPhase('monitoring')
        }
        
        // 检查是否有 RPL 数据
        const hasRPLData = rplStore.tables.length > 0 && 
            rplStore.tables.some(t => t.records && t.records.length > 0)
        
        if (!hasRPLData) {
            // 检查是否有可用的路由数据
            const selectedRoute = routeStore.selectedRoute || routeStore.paretoRoutes[0]
            
            if (selectedRoute && selectedRoute.points && selectedRoute.points.length >= 2) {
                // 自动从路由生成 RPL
                try {
                    const segments = selectedRoute.segments || []
                    rplStore.generateFromRoute(
                        selectedRoute.id,
                        selectedRoute.name || '默认路由',
                        selectedRoute.points.map((p: any) => ({
                            coordinates: p.coordinates,
                            type: p.type || 'waypoint',
                            name: p.name
                        })),
                        segments.map((s: any) => ({
                            length: s.length || 0,
                            depth: s.depth || 0,
                            cableType: s.cableType || 'LW'
                        }))
                    )
                    appStore.showNotification({
                        type: 'success',
                        message: '已自动从当前路由生成 RPL 数据',
                    })
                    appStore.addLog('INFO', `自动生成 RPL: ${selectedRoute.name}`)
                } catch (error) {
                    appStore.showNotification({
                        type: 'error',
                        message: 'RPL 数据生成失败，请先在路由规划页面创建路由',
                    })
                    next({name: 'planning'})
                    return
                }
            } else {
                // 没有路由数据，提示用户先创建路由
                appStore.showNotification({
                    type: 'warning',
                    message: '请先在路由规划页面创建或选择路由',
                })
                next({name: 'planning'})
                return
            }
        }
    }

    if (to.name === 'login' && userStore.isLoggedIn) {
        next({name: 'planning'})
        return
    }

    next()
})

export default router
