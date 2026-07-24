import { defineStore } from 'pinia'
import { ref } from 'vue'
import { platformDictionaryApi } from '@/services/platform/api'
import type { RespVO } from '@/services/platform/client'
import type { PagedSearch, PlatformDictionary } from '@/services/platform/types'

export const PLATFORM_DICTIONARY_TYPES = {
  dictionaryType: 'DIC_TYPE',
  armoringType: 'ARMORING_TYPE',
  deviceType: 'DEVICE_TYPE',
  layerType: 'LAYER_TYPE',
  fiberCalculationModel: 'FIBER_CALC_MODEL',
  amplifierCalculationModel: 'AMP_CALC_MODEL',
} as const

export interface PlatformDictionaryOption {
  value: string
  label: string
}

function normalizeDictionaryType(type: string): string {
  return type.trim()
}

function normalizeDictionaryItems(items: PlatformDictionary[], type: string): PlatformDictionary[] {
  const byCode = new Map<string, PlatformDictionary>()

  for (const item of items) {
    const code = item.code?.trim()
    if (!code || byCode.has(code)) continue
    byCode.set(code, {
      ...item,
      code,
      name: item.name?.trim() || code,
      type: item.type?.trim() || type,
    })
  }

  return [...byCode.values()].sort((left, right) => {
    const leftSort = Number(left.sortNum ?? Number.MAX_SAFE_INTEGER)
    const rightSort = Number(right.sortNum ?? Number.MAX_SAFE_INTEGER)
    if (leftSort !== rightSort) return leftSort - rightSort
    return String(left.code).localeCompare(String(right.code))
  })
}

export const useDictionaryStore = defineStore('dictionary', () => {
  const itemsByType = ref<Record<string, PlatformDictionary[]>>({})
  const loadingByType = ref<Record<string, boolean>>({})
  const loadedByType = ref<Record<string, boolean>>({})
  const errorByType = ref<Record<string, string | null>>({})
  const pendingRequests = new Map<string, { version: number; promise: Promise<PlatformDictionary[]> }>()
  const requestVersions = new Map<string, number>()

  function getItems(type: string, includeDisabled = false): PlatformDictionary[] {
    const key = normalizeDictionaryType(type)
    const items = itemsByType.value[key] ?? []
    return includeDisabled ? items : items.filter(item => item.isValidCd !== '0')
  }

  function getOptions(type: string, includeDisabled = false): PlatformDictionaryOption[] {
    return getItems(type, includeDisabled).map(item => ({
      value: String(item.code),
      label: item.name || String(item.code),
    }))
  }

  function getItem(type: string, code?: string | null): PlatformDictionary | null {
    if (!code) return null
    return getItems(type, true).find(item => item.code === code) ?? null
  }

  function isLoading(type: string): boolean {
    return Boolean(loadingByType.value[normalizeDictionaryType(type)])
  }

  function isLoaded(type: string): boolean {
    return Boolean(loadedByType.value[normalizeDictionaryType(type)])
  }

  function getError(type: string): string | null {
    return errorByType.value[normalizeDictionaryType(type)] ?? null
  }

  function invalidateDictionary(type: string): void {
    const key = normalizeDictionaryType(type)
    if (!key) return
    loadedByType.value = { ...loadedByType.value, [key]: false }
    errorByType.value = { ...errorByType.value, [key]: null }
    requestVersions.set(key, (requestVersions.get(key) ?? 0) + 1)
  }

  async function loadDictionary(type: string, force = false): Promise<PlatformDictionary[]> {
    const key = normalizeDictionaryType(type)
    if (!key) return []

    const pending = pendingRequests.get(key)
    if (!force && pending?.version === (requestVersions.get(key) ?? 0)) return pending.promise
    if (!force && isLoaded(key)) return getItems(key, true)

    const version = (requestVersions.get(key) ?? 0) + 1
    requestVersions.set(key, version)

    loadingByType.value = { ...loadingByType.value, [key]: true }
    errorByType.value = { ...errorByType.value, [key]: null }

    const request = platformDictionaryApi.listItemByType(key)
      .then(responseItems => {
        const items = normalizeDictionaryItems(responseItems, key)
        if (requestVersions.get(key) === version) {
          itemsByType.value = { ...itemsByType.value, [key]: items }
          loadedByType.value = { ...loadedByType.value, [key]: true }
        }
        return items
      })
      .catch(error => {
        if (requestVersions.get(key) === version) {
          const message = error instanceof Error ? error.message : `字典 ${key} 加载失败`
          loadedByType.value = { ...loadedByType.value, [key]: false }
          errorByType.value = { ...errorByType.value, [key]: message }
        }
        throw error
      })
      .finally(() => {
        if (pendingRequests.get(key)?.version === version) {
          loadingByType.value = { ...loadingByType.value, [key]: false }
          pendingRequests.delete(key)
        }
      })

    pendingRequests.set(key, { version, promise: request })
    return request
  }

  async function searchDictionary(payload: PagedSearch = { pageNumber: 1, pageSize: 10 }): Promise<RespVO<PlatformDictionary[]>> {
    return platformDictionaryApi.search(payload)
  }

  async function saveDictionary(payload: Record<string, unknown>): Promise<string> {
    const result = await platformDictionaryApi.save(payload)
    const type = typeof payload.type === 'string' ? payload.type : ''
    if (type) invalidateDictionary(type)
    return result
  }

  async function removeDictionary(payload: { id: string; type: string }): Promise<boolean> {
    const result = await platformDictionaryApi.remove(payload)
    invalidateDictionary(payload.type)
    return result
  }

  return {
    itemsByType,
    loadingByType,
    loadedByType,
    errorByType,
    getItems,
    getOptions,
    getItem,
    isLoading,
    isLoaded,
    getError,
    invalidateDictionary,
    loadDictionary,
    searchDictionary,
    saveDictionary,
    removeDictionary,
  }
})
