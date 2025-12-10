import { ref, computed, readonly } from 'vue'
import type { PanelPosition, PanelSize } from './usePanel'

/**
 * 面板管理器组合式函数
 * 管理多个浮动面板的层叠、焦点和预设位置
 */

// 面板信息
export interface PanelInfo {
    id: string
    title: string
    position: PanelPosition
    size: PanelSize
    zIndex: number
    isVisible: boolean
    isMinimized: boolean
}

// 预设位置
export type PresetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'

// 预设位置坐标
const PRESET_POSITIONS: Record<PresetPosition, (viewportWidth: number, viewportHeight: number, panelWidth: number, panelHeight: number) => PanelPosition> = {
    'top-left': () => ({ x: 20, y: 20 }),
    'top-right': (vw, _, pw) => ({ x: vw - pw - 20, y: 20 }),
    'bottom-left': (_, vh, __, ph) => ({ x: 20, y: vh - ph - 20 }),
    'bottom-right': (vw, vh, pw, ph) => ({ x: vw - pw - 20, y: vh - ph - 20 }),
    'center': (vw, vh, pw, ph) => ({ x: (vw - pw) / 2, y: (vh - ph) / 2 }),
}

// 边缘吸附阈值
const SNAP_THRESHOLD = 20

// 全局状态
const panels = ref<Map<string, PanelInfo>>(new Map())
const basePanelZIndex = 100
let maxZIndex = basePanelZIndex

export function usePanelManager() {
    /**
     * 注册一个新面板
     */
    const registerPanel = (id: string, title: string, position: PanelPosition, size: PanelSize): void => {
        if (panels.value.has(id)) {
            console.warn(`面板 ${id} 已存在`)
            return
        }

        panels.value.set(id, {
            id,
            title,
            position,
            size,
            zIndex: ++maxZIndex,
            isVisible: true,
            isMinimized: false,
        })
    }

    /**
     * 注销面板
     */
    const unregisterPanel = (id: string): void => {
        panels.value.delete(id)
    }

    /**
     * 激活面板（置于最前）
     */
    const bringToFront = (id: string): void => {
        const panel = panels.value.get(id)
        if (panel) {
            panel.zIndex = ++maxZIndex
        }
    }

    /**
     * 更新面板位置
     */
    const updatePosition = (id: string, position: PanelPosition): void => {
        const panel = panels.value.get(id)
        if (panel) {
            panel.position = position
        }
    }

    /**
     * 更新面板大小
     */
    const updateSize = (id: string, size: PanelSize): void => {
        const panel = panels.value.get(id)
        if (panel) {
            panel.size = size
        }
    }

    /**
     * 切换面板可见性
     */
    const toggleVisibility = (id: string): void => {
        const panel = panels.value.get(id)
        if (panel) {
            panel.isVisible = !panel.isVisible
        }
    }

    /**
     * 显示面板
     */
    const showPanel = (id: string): void => {
        const panel = panels.value.get(id)
        if (panel) {
            panel.isVisible = true
            bringToFront(id)
        }
    }

    /**
     * 隐藏面板
     */
    const hidePanel = (id: string): void => {
        const panel = panels.value.get(id)
        if (panel) {
            panel.isVisible = false
        }
    }

    /**
     * 切换最小化状态
     */
    const toggleMinimize = (id: string): void => {
        const panel = panels.value.get(id)
        if (panel) {
            panel.isMinimized = !panel.isMinimized
        }
    }

    /**
     * 移动到预设位置
     */
    const moveToPreset = (id: string, preset: PresetPosition): void => {
        const panel = panels.value.get(id)
        if (!panel) return

        const vw = window.innerWidth
        const vh = window.innerHeight
        const pw = panel.size.width
        const ph = panel.size.height

        panel.position = PRESET_POSITIONS[preset](vw, vh, pw, ph)
    }

    /**
     * 边缘吸附
     * 如果面板靠近视口边缘，自动对齐到边缘
     */
    const snapToEdge = (id: string): void => {
        const panel = panels.value.get(id)
        if (!panel) return

        const vw = window.innerWidth
        const vh = window.innerHeight
        let { x, y } = panel.position
        const { width, height } = panel.size

        // 左边缘吸附
        if (x < SNAP_THRESHOLD) {
            x = 0
        }
        // 右边缘吸附
        else if (vw - x - width < SNAP_THRESHOLD) {
            x = vw - width
        }

        // 上边缘吸附
        if (y < SNAP_THRESHOLD) {
            y = 0
        }
        // 下边缘吸附
        else if (vh - y - height < SNAP_THRESHOLD) {
            y = vh - height
        }

        panel.position = { x, y }
    }

    /**
     * 获取所有可见面板
     */
    const visiblePanels = computed(() => {
        return Array.from(panels.value.values())
            .filter(p => p.isVisible)
            .sort((a, b) => a.zIndex - b.zIndex)
    })

    /**
     * 获取面板信息
     */
    const getPanel = (id: string): PanelInfo | undefined => {
        return panels.value.get(id)
    }

    /**
     * 关闭所有面板
     */
    const hideAllPanels = (): void => {
        panels.value.forEach(panel => {
            panel.isVisible = false
        })
    }

    /**
     * 显示所有面板
     */
    const showAllPanels = (): void => {
        panels.value.forEach(panel => {
            panel.isVisible = true
        })
    }

    /**
     * 重置所有面板到默认位置
     */
    const resetAllPositions = (): void => {
        const presets: PresetPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        let idx = 0

        panels.value.forEach((panel, id) => {
            moveToPreset(id, presets[idx % presets.length])
            idx++
        })
    }

    return {
        panels: readonly(panels),
        visiblePanels,
        registerPanel,
        unregisterPanel,
        bringToFront,
        updatePosition,
        updateSize,
        toggleVisibility,
        showPanel,
        hidePanel,
        toggleMinimize,
        moveToPreset,
        snapToEdge,
        getPanel,
        hideAllPanels,
        showAllPanels,
        resetAllPositions,
    }
}
