import { ref, readonly } from 'vue'

/**
 * 对话框控制 hook
 */
export function useDialog<T = any>() {
  const visible = ref(false)
  const data = ref<T | null>(null)

  function open(payload?: T) {
    data.value = payload ?? null
    visible.value = true
  }

  function close() {
    visible.value = false
    data.value = null
  }

  return {
    visible: readonly(visible),
    data: readonly(data),
    open,
    close,
  }
}
