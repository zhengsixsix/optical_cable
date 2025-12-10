import { ref, type Ref } from 'vue'
import { useAppStore } from '@/stores'

/**
 * 浮动面板拖拽和调整大小的组合式函数
 * 提供面板的位置、尺寸管理以及拖拽、调整大小的交互逻辑
 */
export interface PanelPosition {
  x: number
  y: number
}

export interface PanelSize {
  width: number
  height: number
}

export interface UsePanelOptions {
  defaultPosition?: PanelPosition
  defaultSize?: PanelSize
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  storageKey?: string
}

export function usePanel(options: UsePanelOptions = {}) {
  const {
    defaultPosition = { x: 20, y: 20 },
    defaultSize = { width: 300, height: 200 },
    minWidth = 150,
    minHeight = 100,
    maxWidth = 800,
    maxHeight = 600,
    storageKey
  } = options

  const appStore = useAppStore()

  // 从 localStorage 加载位置和尺寸
  const loadFromStorage = () => {
    if (!storageKey) return { position: defaultPosition, size: defaultSize }
    
    try {
      const saved = localStorage.getItem(`panel_${storageKey}`)
      if (saved) {
        const data = JSON.parse(saved)
        return {
          position: data.position || defaultPosition,
          size: data.size || defaultSize
        }
      }
    } catch (e) {
      console.warn('加载面板位置失败:', e)
    }
    return { position: defaultPosition, size: defaultSize }
  }

  const savedState = loadFromStorage()
  
  const position = ref<PanelPosition>(savedState.position)
  const size = ref<PanelSize>(savedState.size)
  const isDragging = ref(false)
  const isResizing = ref(false)
  const isMinimized = ref(false)
  const isVisible = ref(true)

  // 保存到 localStorage
  const saveToStorage = () => {
    if (!storageKey) return
    
    try {
      localStorage.setItem(`panel_${storageKey}`, JSON.stringify({
        position: position.value,
        size: size.value
      }))
    } catch (e) {
      console.warn('保存面板位置失败:', e)
    }
  }

  // 开始拖拽
  let dragStartX = 0
  let dragStartY = 0
  let initialX = 0
  let initialY = 0

  const startDrag = (e: MouseEvent) => {
    if (isMinimized.value) return
    
    isDragging.value = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    initialX = position.value.x
    initialY = position.value.y

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.value) return
      
      const deltaX = e.clientX - dragStartX
      const deltaY = e.clientY - dragStartY
      
      position.value = {
        x: Math.max(0, initialX + deltaX),
        y: Math.max(0, initialY + deltaY)
      }
    }

    const handleMouseUp = () => {
      isDragging.value = false
      saveToStorage()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // 开始调整大小
  let resizeStartX = 0
  let resizeStartY = 0
  let initialWidth = 0
  let initialHeight = 0

  const startResize = (e: MouseEvent) => {
    if (isMinimized.value) return
    
    e.preventDefault()
    e.stopPropagation()
    
    isResizing.value = true
    resizeStartX = e.clientX
    resizeStartY = e.clientY
    initialWidth = size.value.width
    initialHeight = size.value.height

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.value) return
      
      const deltaX = e.clientX - resizeStartX
      const deltaY = e.clientY - resizeStartY
      
      size.value = {
        width: Math.min(maxWidth, Math.max(minWidth, initialWidth + deltaX)),
        height: Math.min(maxHeight, Math.max(minHeight, initialHeight + deltaY))
      }
    }

    const handleMouseUp = () => {
      isResizing.value = false
      saveToStorage()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // 最小化/恢复
  const toggleMinimize = () => {
    isMinimized.value = !isMinimized.value
  }

  // 关闭面板
  const close = () => {
    isVisible.value = false
  }

  // 显示面板
  const show = () => {
    isVisible.value = true
  }

  // 重置位置和尺寸
  const reset = () => {
    position.value = defaultPosition
    size.value = defaultSize
    isMinimized.value = false
    saveToStorage()
  }

  return {
    position,
    size,
    isDragging,
    isResizing,
    isMinimized,
    isVisible,
    startDrag,
    startResize,
    toggleMinimize,
    close,
    show,
    reset,
    saveToStorage,
    loadFromStorage
  }
}
