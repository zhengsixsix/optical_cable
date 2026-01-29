import { ref, readonly } from 'vue'

/**
 * 加载状态控制 hook
 */
export function useLoading(initialState = false) {
  const loading = ref(initialState)
  const text = ref('加载中...')

  function start(loadingText?: string) {
    if (loadingText) {
      text.value = loadingText
    }
    loading.value = true
  }

  function stop() {
    loading.value = false
    text.value = '加载中...'
  }

  async function wrap<T>(fn: () => Promise<T>, loadingText?: string): Promise<T> {
    start(loadingText)
    try {
      return await fn()
    } finally {
      stop()
    }
  }

  return {
    loading: readonly(loading),
    text: readonly(text),
    start,
    stop,
    wrap,
  }
}
